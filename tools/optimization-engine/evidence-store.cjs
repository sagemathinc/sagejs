"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { DatabaseSync } = require("node:sqlite");

const {
  canonicalJson,
  compareText,
  deepFreeze,
  sha256,
} = require("../optimizer-development/common.cjs");
const { validateBySchema } = require("./contracts.cjs");

const STREAM_SCHEMA = "sagejs.optimization-evidence-ndjson/v2";
const DATABASE_SCHEMA = "sagejs.optimization-evidence-sqlite/v2";

function fail(message) {
  throw new Error(`optimization evidence store: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function namespaceFor(document) {
  return document.schema.replace(/^sagejs\.optimization-/, "").replace(/\/v2$/, "");
}

function normalizeDocuments(documents, { validate = true } = {}) {
  assert(Array.isArray(documents), "documents must be an array");
  const seen = new Set();
  return documents.map((document) => validate ? validateBySchema(document) : document)
    .map((document) => {
      assert(typeof document.id === "string", "every document must have an identity");
      assert(!seen.has(document.id), `duplicate document ${document.id}`);
      seen.add(document.id);
      return {
        namespace: namespaceFor(document),
        id: document.id,
        document,
      };
    })
    .sort((left, right) =>
      compareText(left.namespace, right.namespace) || compareText(left.id, right.id));
}

function canonicalRecordStream(documents, options = {}) {
  const records = normalizeDocuments(documents, options);
  const lines = [canonicalJson({ kind: "header", schema: STREAM_SCHEMA })];
  for (const record of records) {
    lines.push(canonicalJson({
      document: record.document,
      id: record.id,
      kind: "record",
      namespace: record.namespace,
    }));
  }
  const bytes = Buffer.from(`${lines.join("\n")}\n`, "utf8");
  return Object.freeze({
    schema: STREAM_SCHEMA,
    logicalId: `sha256:${sha256(bytes)}`,
    bytes,
    records: deepFreeze(records),
  });
}

function parseCanonicalRecordStream(input, options = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const text = bytes.toString("utf8");
  assert(Buffer.from(text, "utf8").equals(bytes), "stream is not valid UTF-8");
  assert(text.endsWith("\n"), "stream must end with exactly one record newline");
  const lines = text.slice(0, -1).split("\n");
  assert(lines.length >= 1, "stream has no header");
  let header;
  try {
    header = JSON.parse(lines[0]);
  } catch {
    fail("header is not JSON");
  }
  assert(canonicalJson(header) === lines[0], "header is not canonical JSON");
  assert(header.kind === "header" && header.schema === STREAM_SCHEMA &&
    Object.keys(header).length === 2, "unsupported or malformed header");
  const documents = [];
  let previous = null;
  const seen = new Set();
  for (let index = 1; index < lines.length; index += 1) {
    let record;
    try {
      record = JSON.parse(lines[index]);
    } catch {
      fail(`record ${index} is not JSON`);
    }
    assert(canonicalJson(record) === lines[index], `record ${index} is not canonical JSON`);
    assert(record && record.kind === "record" && typeof record.namespace === "string" &&
      typeof record.id === "string" && record.document &&
      Object.keys(record).sort().join(",") === "document,id,kind,namespace",
    `record ${index} has an unknown or missing field`);
    assert(record.id === record.document.id, `record ${index} identity wrapper differs`);
    assert(record.namespace === namespaceFor(record.document),
      `record ${index} namespace differs from schema`);
    const key = `${record.namespace}:${record.id}`;
    assert(previous === null || compareText(previous, key) < 0,
      "records are not strictly sorted");
    assert(!seen.has(record.id), `duplicate document ${record.id}`);
    seen.add(record.id);
    previous = key;
    documents.push(options.validate === false
      ? record.document : validateBySchema(record.document, options.context));
  }
  const rebuilt = canonicalRecordStream(documents, options);
  assert(rebuilt.bytes.equals(bytes), "stream does not round-trip canonically");
  return rebuilt;
}

function derivedColumns(document) {
  return {
    epochId: document.binding?.epochId || (document.schema.endsWith("epoch/v2") ? document.id : null),
    subjectId: document.subjectId || null,
    workloadId: document.workloadId || document.locator?.workloadId || null,
    category: document.category || null,
    disposition: document.disposition || document.decision?.status || null,
    mechanism: document.mechanism || null,
  };
}

function createDatabase(filename, stream) {
  assert(stream?.schema === STREAM_SCHEMA, "database input must be a canonical stream");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.existsSync(filename)) fs.unlinkSync(filename);
  const database = new DatabaseSync(filename);
  try {
    database.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;
      PRAGMA user_version = 2;
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE records (
        namespace TEXT NOT NULL,
        document_id TEXT NOT NULL,
        epoch_id TEXT,
        subject_id TEXT,
        workload_id TEXT,
        category TEXT,
        disposition TEXT,
        mechanism TEXT,
        document_json TEXT NOT NULL,
        PRIMARY KEY(namespace, document_id)
      ) STRICT, WITHOUT ROWID;
      CREATE INDEX records_epoch ON records(epoch_id);
      CREATE INDEX records_subject ON records(subject_id);
      CREATE INDEX records_workload ON records(workload_id);
      CREATE INDEX records_category_mechanism ON records(category, mechanism);
      CREATE INDEX records_disposition ON records(disposition);
    `);
    const metadata = database.prepare("INSERT INTO metadata(key, value) VALUES (?, ?)");
    const insert = database.prepare(`
      INSERT INTO records(
        namespace, document_id, epoch_id, subject_id, workload_id,
        category, disposition, mechanism, document_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    database.exec("BEGIN");
    try {
      metadata.run("schema", DATABASE_SCHEMA);
      metadata.run("stream_schema", STREAM_SCHEMA);
      metadata.run("logical_id", stream.logicalId);
      metadata.run("record_count", String(stream.records.length));
      for (const record of stream.records) {
        const columns = derivedColumns(record.document);
        insert.run(
          record.namespace,
          record.id,
          columns.epochId,
          columns.subjectId,
          columns.workloadId,
          columns.category,
          columns.disposition,
          columns.mechanism,
          canonicalJson(record.document),
        );
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    database.exec("VACUUM");
  } finally {
    database.close();
  }
  return filename;
}

function readDatabase(filename, options = {}) {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    database.exec("PRAGMA query_only = ON");
    const metadata = Object.fromEntries(database.prepare(
      "SELECT key, value FROM metadata ORDER BY key",
    ).all().map((row) => [row.key, row.value]));
    assert(metadata.schema === DATABASE_SCHEMA, "unsupported SQLite schema");
    assert(metadata.stream_schema === STREAM_SCHEMA, "unsupported stream schema");
    const rows = database.prepare(
      "SELECT namespace, document_id, document_json FROM records " +
      "ORDER BY namespace, document_id",
    ).all();
    assert(rows.length === Number(metadata.record_count), "SQLite record count is stale");
    const documents = rows.map((row, index) => {
      let document;
      try {
        document = JSON.parse(row.document_json);
      } catch {
        fail(`SQLite record ${index} is not JSON`);
      }
      assert(row.document_id === document.id, `SQLite record ${index} identity differs`);
      assert(row.namespace === namespaceFor(document), `SQLite record ${index} namespace differs`);
      assert(canonicalJson(document) === row.document_json,
        `SQLite record ${index} is not canonical JSON`);
      return document;
    });
    const stream = canonicalRecordStream(documents, options);
    assert(stream.logicalId === metadata.logical_id, "SQLite logical identity is stale");
    return stream;
  } finally {
    database.close();
  }
}

function deterministicGzip(bytes) {
  return zlib.gzipSync(bytes, { level: 9, mtime: 0 });
}

function physicalDescriptor(kind, name, bytes, uncompressed = null) {
  return {
    kind,
    name,
    bytes: bytes.length,
    sha256: sha256(bytes),
    ...(uncompressed ? {
      uncompressedBytes: uncompressed.length,
      uncompressedSha256: sha256(uncompressed),
    } : {}),
  };
}

function writeStore(directory, documents, options = {}) {
  const stream = canonicalRecordStream(documents, options);
  fs.mkdirSync(directory, { recursive: true });
  const stem = stream.logicalId.slice("sha256:".length);
  const ndjson = path.join(directory, `${stem}.canonical.ndjson`);
  const sqlite = path.join(directory, `${stem}.sqlite`);
  const ndjsonGzip = `${ndjson}.gz`;
  const sqliteGzip = `${sqlite}.gz`;
  fs.writeFileSync(ndjson, stream.bytes, { flag: "wx" });
  createDatabase(sqlite, stream);
  const roundTrip = readDatabase(sqlite, options);
  assert(roundTrip.logicalId === stream.logicalId, "SQLite round trip changed logical identity");
  const sqliteBytes = fs.readFileSync(sqlite);
  const ndjsonCompressed = deterministicGzip(stream.bytes);
  const sqliteCompressed = deterministicGzip(sqliteBytes);
  fs.writeFileSync(ndjsonGzip, ndjsonCompressed, { flag: "wx" });
  fs.writeFileSync(sqliteGzip, sqliteCompressed, { flag: "wx" });
  return deepFreeze({
    schema: "sagejs.optimization-evidence-store-manifest/v2",
    logicalId: stream.logicalId,
    recordCount: stream.records.length,
    assets: [
      physicalDescriptor("canonical-ndjson", path.basename(ndjsonGzip), ndjsonCompressed, stream.bytes),
      physicalDescriptor("sqlite-query-database", path.basename(sqliteGzip), sqliteCompressed, sqliteBytes),
    ],
  });
}

module.exports = Object.freeze({
  DATABASE_SCHEMA,
  STREAM_SCHEMA,
  canonicalRecordStream,
  createDatabase,
  deterministicGzip,
  parseCanonicalRecordStream,
  readDatabase,
  writeStore,
});
