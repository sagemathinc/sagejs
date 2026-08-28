"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { DatabaseSync } = require("node:sqlite");

const {
  attachIdentity,
  canonicalJson,
  compareText,
  sha256,
  verifyDocumentIdentity,
} = require("./common.cjs");

const SNAPSHOT_SCHEMA = "sagejs.optimizer-opportunity-canonical-ndjson/v1";
const MANIFEST_SCHEMA = "sagejs.optimizer-opportunity-artifact-manifest/v1";
const DATABASE_SCHEMA = "sagejs.optimizer-opportunity-sqlite/v1";
const RELEASE_REPOSITORY = "sagemathinc/sagejs";
const ARRAY_TABLES = Object.freeze([
  "files",
  "functions",
  "loops",
  "nearMisses",
  "orphanDecisions",
  "passDecisionCounts",
  "reasonCounts",
]);
const TABLE_ORDER = Object.freeze(["metadata", ...ARRAY_TABLES]);

function assert(condition, message) {
  if (!condition) throw new Error(`optimizer opportunity artifacts: ${message}`);
}

function artifactCacheDirectory(root) {
  return process.env.SAGEJS_OPTIMIZER_CACHE || path.join(
    root,
    ".cache",
    "sagejs",
    "optimization-engine",
  );
}

function artifactReleaseDirectory(root, tag) {
  return path.join(root, "build", "optimizer-development", "releases", tag);
}

function recordKey(table, value) {
  if (value && typeof value.id === "string" && value.id.length > 0) return value.id;
  return `sha256:${sha256(canonicalJson({ table, value }))}`;
}

function dashboardRecords(dashboard) {
  const metadata = Object.create(null);
  for (const [key, value] of Object.entries(dashboard)) {
    if (!ARRAY_TABLES.includes(key)) metadata[key] = value;
  }
  const records = [{
    table: "metadata",
    key: "dashboard",
    position: 0,
    value: metadata,
  }];
  for (const table of ARRAY_TABLES) {
    assert(Array.isArray(dashboard[table]), `dashboard ${table} must be an array`);
    const seen = new Set();
    dashboard[table].forEach((value, position) => {
      const key = recordKey(table, value);
      assert(!seen.has(key), `dashboard ${table} contains duplicate key ${key}`);
      seen.add(key);
      records.push({ table, key, position, value });
    });
  }
  return records.sort((left, right) =>
    compareText(left.table, right.table) || compareText(left.key, right.key));
}

function recordLine(record) {
  return `${canonicalJson({
    key: record.key,
    kind: "record",
    position: record.position,
    table: record.table,
    value: record.value,
  })}\n`;
}

function canonicalSnapshot(dashboard) {
  const records = dashboardRecords(dashboard);
  const header = `${canonicalJson({
    kind: "header",
    schema: SNAPSHOT_SCHEMA,
  })}\n`;
  const tableBytes = new Map(TABLE_ORDER.map((table) => [table, []]));
  const chunks = [header];
  for (const record of records) {
    const line = recordLine(record);
    chunks.push(line);
    tableBytes.get(record.table).push(line);
  }
  const bytes = Buffer.from(chunks.join(""), "utf8");
  const tables = TABLE_ORDER.map((table) => {
    const body = Buffer.from(tableBytes.get(table).join(""), "utf8");
    return {
      name: table,
      records: tableBytes.get(table).length,
      digest: sha256(body),
    };
  });
  return {
    schema: SNAPSHOT_SCHEMA,
    logicalId: `sha256:${sha256(bytes)}`,
    bytes,
    records,
    tables,
  };
}

function derivedColumns(record) {
  const value = record.value || {};
  const source = value.source || {};
  return {
    path: value.path || source.path || null,
    line: Number.isSafeInteger(source.line) ? source.line : null,
    endLine: Number.isSafeInteger(source.endLine) ? source.endLine : null,
    functionId: value.functionId || null,
    sourceUnitId: value.sourceUnitId || (record.table === "files" ? value.id : null),
    loopId: value.loopId || (record.table === "loops" ? value.id : null),
    status: value.status || null,
  };
}

function createSnapshotDatabase(filename, dashboard, snapshot = canonicalSnapshot(dashboard)) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.existsSync(filename)) fs.unlinkSync(filename);
  const database = new DatabaseSync(filename);
  try {
    database.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;
      PRAGMA user_version = 1;
      CREATE TABLE metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE records (
        table_name TEXT NOT NULL,
        record_key TEXT NOT NULL,
        position INTEGER NOT NULL,
        path TEXT,
        line INTEGER,
        end_line INTEGER,
        function_id TEXT,
        source_unit_id TEXT,
        loop_id TEXT,
        status TEXT,
        value_json TEXT NOT NULL,
        PRIMARY KEY (table_name, record_key)
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE identity_index (
        identity TEXT NOT NULL,
        entity_kind TEXT NOT NULL,
        record_key TEXT NOT NULL,
        PRIMARY KEY (identity, entity_kind, record_key)
      ) STRICT, WITHOUT ROWID;
      CREATE INDEX records_path_range ON records(path, line, end_line);
      CREATE INDEX records_function ON records(function_id);
      CREATE INDEX records_source_unit ON records(source_unit_id);
      CREATE INDEX records_loop ON records(loop_id);
      CREATE INDEX records_status ON records(status);
    `);
    const insertMetadata = database.prepare(
      "INSERT INTO metadata(key, value) VALUES (?, ?)",
    );
    const metadata = {
      schema: DATABASE_SCHEMA,
      snapshot_schema: SNAPSHOT_SCHEMA,
      logical_id: snapshot.logicalId,
      dashboard_id: dashboard.id,
      dashboard_schema: dashboard.schema,
      record_count: String(snapshot.records.length),
    };
    const insertRecord = database.prepare(`
      INSERT INTO records(
        table_name, record_key, position, path, line, end_line,
        function_id, source_unit_id, loop_id, status, value_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertIdentity = database.prepare(
      "INSERT OR IGNORE INTO identity_index(identity, entity_kind, record_key) " +
      "VALUES (?, ?, ?)",
    );
    database.exec("BEGIN");
    try {
      for (const [key, value] of Object.entries(metadata)) insertMetadata.run(key, value);
      for (const record of snapshot.records) {
        const columns = derivedColumns(record);
        insertRecord.run(
          record.table,
          record.key,
          record.position,
          columns.path,
          columns.line,
          columns.endLine,
          columns.functionId,
          columns.sourceUnitId,
          columns.loopId,
          columns.status,
          canonicalJson(record.value),
        );
        if (record.value && typeof record.value.id === "string") {
          insertIdentity.run(record.value.id, record.table, record.key);
        }
        if (record.table === "loops") {
          for (const decision of record.value.decisions || []) {
            if (typeof decision.id === "string") {
              insertIdentity.run(decision.id, "decision", record.key);
            }
          }
        }
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

function databaseMetadata(database) {
  return Object.fromEntries(database.prepare(
    "SELECT key, value FROM metadata ORDER BY key",
  ).all().map((row) => [row.key, row.value]));
}

function readSnapshotDatabase(filename) {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const metadata = databaseMetadata(database);
    assert(metadata.schema === DATABASE_SCHEMA, "unsupported SQLite schema");
    assert(metadata.snapshot_schema === SNAPSHOT_SCHEMA, "unsupported snapshot schema");
    const rows = database.prepare(
      "SELECT table_name, record_key, position, value_json " +
      "FROM records ORDER BY table_name, position",
    ).all();
    assert(rows.length === Number(metadata.record_count), "SQLite record count is stale");
    const byTable = new Map(TABLE_ORDER.map((table) => [table, []]));
    for (const row of rows) {
      assert(byTable.has(row.table_name), `unknown SQLite table ${row.table_name}`);
      byTable.get(row.table_name).push({
        key: row.record_key,
        position: Number(row.position),
        value: JSON.parse(row.value_json),
      });
    }
    const metaRows = byTable.get("metadata");
    assert(metaRows.length === 1 && metaRows[0].key === "dashboard",
      "SQLite dashboard metadata is missing");
    const dashboard = metaRows[0].value;
    for (const table of ARRAY_TABLES) {
      const tableRows = byTable.get(table);
      tableRows.forEach((row, index) => {
        assert(row.position === index, `${table} positions are not contiguous`);
      });
      dashboard[table] = tableRows.map((row) => row.value);
    }
    const snapshot = canonicalSnapshot(dashboard);
    assert(snapshot.logicalId === metadata.logical_id, "SQLite logical identity is stale");
    assert(dashboard.id === metadata.dashboard_id, "SQLite dashboard identity is stale");
    return { dashboard, metadata, snapshot };
  } finally {
    database.close();
  }
}

function gzip(bytes) {
  return zlib.gzipSync(bytes, { level: 9, mtime: 0 });
}

function artifactDescriptor(kind, name, mediaType, uncompressed, compressed) {
  return {
    kind,
    name,
    mediaType,
    compression: "gzip",
    sha256: sha256(compressed),
    bytes: compressed.length,
    uncompressedSha256: sha256(uncompressed),
    uncompressedBytes: uncompressed.length,
  };
}

function writeSnapshotArtifacts({
  root,
  dashboard,
  dashboardJson,
  markdown,
  repository = RELEASE_REPOSITORY,
  cacheDirectory = artifactCacheDirectory(root),
} = {}) {
  const snapshot = canonicalSnapshot(dashboard);
  const logicalHex = snapshot.logicalId.slice("sha256:".length);
  const base = `optimizer-opportunities-${logicalHex}`;
  const ndjsonName = `${base}.canonical.ndjson.gz`;
  const sqliteName = `${base}.sqlite.gz`;
  const legacyName = `${base}.legacy.json.gz`;
  const ndjsonCompressed = gzip(snapshot.bytes);
  const legacyBytes = Buffer.from(dashboardJson, "utf8");
  const legacyCompressed = gzip(legacyBytes);
  const stagingDirectory = path.join(root, "build", "optimizer-development", "staging");
  fs.mkdirSync(stagingDirectory, { recursive: true });
  const sqlitePath = path.join(stagingDirectory, `${base}.sqlite`);
  createSnapshotDatabase(sqlitePath, dashboard, snapshot);
  const sqliteBytes = fs.readFileSync(sqlitePath);
  const sqliteCompressed = gzip(sqliteBytes);

  const artifacts = [
    artifactDescriptor(
      "canonical-ndjson",
      ndjsonName,
      "application/x-ndjson",
      snapshot.bytes,
      ndjsonCompressed,
    ),
    artifactDescriptor(
      "legacy-dashboard-json",
      legacyName,
      "application/json",
      legacyBytes,
      legacyCompressed,
    ),
    artifactDescriptor(
      "sqlite-query-database",
      sqliteName,
      "application/vnd.sqlite3",
      sqliteBytes,
      sqliteCompressed,
    ),
  ].sort((left, right) => compareText(left.kind, right.kind));
  const artifactSetDigest = sha256(canonicalJson(artifacts));
  const tag = `optimizer-evidence-campaign-1-${logicalHex}-` +
    artifactSetDigest.slice(0, 16);
  const releaseDirectory = artifactReleaseDirectory(root, tag);
  fs.mkdirSync(releaseDirectory, { recursive: true });
  const compressedByName = new Map([
    [ndjsonName, ndjsonCompressed],
    [legacyName, legacyCompressed],
    [sqliteName, sqliteCompressed],
  ]);
  for (const artifact of artifacts) {
    fs.writeFileSync(path.join(releaseDirectory, artifact.name), compressedByName.get(artifact.name));
  }

  fs.mkdirSync(cacheDirectory, { recursive: true });
  const cachePath = path.join(cacheDirectory, `${logicalHex}.sqlite`);
  fs.copyFileSync(sqlitePath, cachePath);
  fs.unlinkSync(sqlitePath);

  const manifest = attachIdentity(MANIFEST_SCHEMA, {
    dashboard: {
      id: dashboard.id,
      schema: dashboard.schema,
      digest: sha256(canonicalJson(dashboard)),
      inputs: dashboard.inputs,
      compilerId: dashboard.compilerIdentity.id,
      sourceBundleId: dashboard.sourceBundle.id,
      summary: dashboard.summary,
    },
    snapshot: {
      schema: snapshot.schema,
      logicalId: snapshot.logicalId,
      records: snapshot.records.length,
      bytes: snapshot.bytes.length,
      tables: snapshot.tables,
    },
    markdown: {
      path: "docs/optimizer-opportunities.md",
      sha256: sha256(Buffer.from(markdown, "utf8")),
      bytes: Buffer.byteLength(markdown),
    },
    release: {
      repository,
      tag,
      immutable: true,
      artifactSetDigest,
      manifestAsset: `${base}.manifest.json`,
      artifacts,
    },
  });
  const manifestPath = path.join(releaseDirectory, manifest.release.manifestAsset);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath, snapshot, releaseDirectory, cachePath };
}

function validateArtifactManifest(manifest, { expectedInput, markdown } = {}) {
  assert(manifest && manifest.schema === MANIFEST_SCHEMA, "unsupported manifest schema");
  verifyDocumentIdentity("optimizer opportunity artifact manifest", manifest);
  assert(manifest.snapshot && manifest.snapshot.schema === SNAPSHOT_SCHEMA,
    "manifest has unsupported snapshot schema");
  assert(/^sha256:[0-9a-f]{64}$/.test(manifest.snapshot.logicalId || ""),
    "manifest has invalid logical identity");
  assert(manifest.dashboard && /^sha256:[0-9a-f]{64}$/.test(manifest.dashboard.id || ""),
    "manifest has invalid dashboard identity");
  assert(manifest.release && manifest.release.immutable === true,
    "manifest release must be immutable");
  assert(/^[0-9a-f]{64}$/.test(manifest.release.artifactSetDigest || ""),
    "manifest release artifact-set digest is invalid");
  assert(Array.isArray(manifest.release.artifacts) && manifest.release.artifacts.length === 3,
    "manifest must bind three release artifacts");
  const kinds = manifest.release.artifacts.map((artifact) => artifact.kind).sort(compareText);
  assert(canonicalJson(kinds) === canonicalJson([
    "canonical-ndjson",
    "legacy-dashboard-json",
    "sqlite-query-database",
  ]), "manifest release artifact kinds are incomplete");
  for (const artifact of manifest.release.artifacts) {
    for (const key of ["sha256", "uncompressedSha256"]) {
      assert(/^[0-9a-f]{64}$/.test(artifact[key] || ""),
        `manifest ${artifact.kind} has invalid ${key}`);
    }
    assert(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0,
      `manifest ${artifact.kind} has invalid byte count`);
    assert(Number.isSafeInteger(artifact.uncompressedBytes) && artifact.uncompressedBytes > 0,
      `manifest ${artifact.kind} has invalid uncompressed byte count`);
  }
  assert(
    sha256(canonicalJson(manifest.release.artifacts)) ===
      manifest.release.artifactSetDigest,
    "manifest release artifact-set digest is stale",
  );
  if (expectedInput) {
    assert(canonicalJson(manifest.dashboard.inputs) === canonicalJson(expectedInput),
      `manifest is stale: expected input ${expectedInput.digest}, ` +
      `found ${manifest.dashboard.inputs?.digest}`);
  }
  if (markdown !== undefined) {
    assert(sha256(Buffer.from(markdown, "utf8")) === manifest.markdown.sha256,
      "generated optimizer opportunity Markdown is stale");
    assert(Buffer.byteLength(markdown) === manifest.markdown.bytes,
      "generated optimizer opportunity Markdown byte count is stale");
  }
  return manifest;
}

function readArtifactManifest(filename) {
  return validateArtifactManifest(JSON.parse(fs.readFileSync(filename, "utf8")));
}

function releaseAsset(manifest, kind) {
  const artifact = manifest.release.artifacts.find((item) => item.kind === kind);
  assert(artifact, `manifest has no ${kind} artifact`);
  return artifact;
}

function validateBytes(bytes, expectedBytes, expectedSha256, label) {
  assert(bytes.length === expectedBytes, `${label} byte count is stale`);
  assert(sha256(bytes) === expectedSha256, `${label} digest is stale`);
}

function localDatabasePath(root, manifest, cacheDirectory = artifactCacheDirectory(root)) {
  return path.join(cacheDirectory, `${manifest.snapshot.logicalId.slice(7)}.sqlite`);
}

function validateLocalDatabase(filename, manifest) {
  const artifact = releaseAsset(manifest, "sqlite-query-database");
  const bytes = fs.readFileSync(filename);
  validateBytes(
    bytes,
    artifact.uncompressedBytes,
    artifact.uncompressedSha256,
    "cached optimizer opportunity SQLite database",
  );
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const metadata = databaseMetadata(database);
    assert(metadata.schema === DATABASE_SCHEMA, "cached SQLite schema is stale");
    assert(metadata.logical_id === manifest.snapshot.logicalId,
      "cached SQLite logical identity is stale");
    assert(metadata.dashboard_id === manifest.dashboard.id,
      "cached SQLite dashboard identity is stale");
  } finally {
    database.close();
  }
  return filename;
}

async function ensureLocalDatabase({ root, manifest, cacheDirectory, force = false } = {}) {
  validateArtifactManifest(manifest);
  const filename = localDatabasePath(root, manifest, cacheDirectory);
  if (!force && fs.existsSync(filename)) {
    try {
      return validateLocalDatabase(filename, manifest);
    } catch {
      // A partial or stale cache is recoverable from the immutable release.
    }
  }
  const artifact = releaseAsset(manifest, "sqlite-query-database");
  const url = `https://github.com/${manifest.release.repository}/releases/download/` +
    `${encodeURIComponent(manifest.release.tag)}/${encodeURIComponent(artifact.name)}`;
  const response = await fetch(url, { redirect: "follow" });
  assert(response.ok, `could not download ${url}: HTTP ${response.status}`);
  const compressed = Buffer.from(await response.arrayBuffer());
  validateBytes(compressed, artifact.bytes, artifact.sha256, "downloaded SQLite artifact");
  const bytes = zlib.gunzipSync(compressed);
  validateBytes(
    bytes,
    artifact.uncompressedBytes,
    artifact.uncompressedSha256,
    "downloaded optimizer opportunity SQLite database",
  );
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.partial-${process.pid}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filename);
  return validateLocalDatabase(filename, manifest);
}

function parseRecord(row) {
  return JSON.parse(row.value_json);
}

function querySnapshotDatabase(filename, query) {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const metadata = databaseMetadata(database);
    assert(metadata.schema === DATABASE_SCHEMA, "unsupported SQLite schema");
    let loopRows = [];
    const exactFunctionIds = new Set();
    const exactSourceUnitIds = new Set();
    if (query.kind === "identity") {
      const matches = database.prepare(
        "SELECT entity_kind, record_key FROM identity_index WHERE identity = ? " +
        "ORDER BY entity_kind, record_key",
      ).all(query.id);
      assert(matches.length > 0, `no optimizer opportunity has exact identity ${query.id}`);
      const match = matches[0];
      if (match.entity_kind === "files") {
        exactSourceUnitIds.add(match.record_key);
        loopRows = database.prepare(
          "SELECT value_json FROM records WHERE table_name = 'loops' " +
          "AND source_unit_id = ? ORDER BY position",
        ).all(match.record_key);
      } else if (match.entity_kind === "functions") {
        exactFunctionIds.add(match.record_key);
        loopRows = database.prepare(
          "SELECT value_json FROM records WHERE table_name = 'loops' " +
          "AND function_id = ? ORDER BY position",
        ).all(match.record_key);
      } else {
        const loopKey = match.entity_kind === "nearMisses"
          ? database.prepare(
            "SELECT loop_id FROM records WHERE table_name = 'nearMisses' AND record_key = ?",
          ).get(match.record_key).loop_id
          : match.record_key;
        loopRows = database.prepare(
          "SELECT value_json FROM records WHERE table_name = 'loops' AND record_key = ?",
        ).all(loopKey);
      }
    } else {
      const suffix = `/${query.path}`;
      loopRows = database.prepare(`
        SELECT value_json FROM records
        WHERE table_name = 'loops'
          AND (path = ? OR substr(path, -?) = ?)
          AND (? IS NULL OR (line <= ? AND end_line >= ?))
        ORDER BY position
      `).all(
        query.path,
        suffix.length,
        suffix,
        query.line,
        query.line,
        query.line,
      );
      if (query.line !== null && loopRows.length > 1) {
        const ids = loopRows.map((row) => parseRecord(row).id);
        throw new Error(
          `ambiguous optimizer opportunity location ${query.path}:${query.line}; ` +
          `${ids.length} loops contain that line (${ids.join(", ")}); ` +
          "query an exact loop identity",
        );
      }
    }
    const loops = loopRows.map(parseRecord);
    const functionIds = new Set(loops.map((loop) => loop.functionId).filter(Boolean));
    for (const id of exactFunctionIds) functionIds.add(id);
    if (exactSourceUnitIds.size > 0) {
      const selectFunctions = database.prepare(
        "SELECT record_key, value_json FROM records WHERE table_name = 'functions' " +
        "AND source_unit_id = ? ORDER BY position",
      );
      for (const sourceUnitId of exactSourceUnitIds) {
        for (const row of selectFunctions.all(sourceUnitId)) functionIds.add(row.record_key);
      }
    }
    const sourceUnitIds = new Set(loops.map((loop) => loop.sourceUnitId));
    for (const id of exactSourceUnitIds) sourceUnitIds.add(id);
    const getRecord = database.prepare(
      "SELECT value_json FROM records WHERE table_name = ? AND record_key = ?",
    );
    const functions = [...functionIds].map((id) => getRecord.get("functions", id))
      .filter(Boolean).map(parseRecord);
    const files = [...sourceUnitIds].map((id) => getRecord.get("files", id))
      .filter(Boolean).map(parseRecord);
    const nearMissSelect = database.prepare(
      "SELECT value_json FROM records WHERE table_name = 'nearMisses' AND loop_id = ?",
    );
    const nearMisses = loops.flatMap((loop) => nearMissSelect.all(loop.id).map(parseRecord));
    const dashboardMeta = parseRecord(database.prepare(
      "SELECT value_json FROM records WHERE table_name = 'metadata' " +
      "AND record_key = 'dashboard'",
    ).get());
    return {
      schema: "sagejs.optimizer-opportunity-query/v2",
      inputDigest: dashboardMeta.inputs.digest,
      query,
      files,
      functions,
      loops,
      nearMisses,
    };
  } finally {
    database.close();
  }
}

module.exports = {
  ARRAY_TABLES,
  DATABASE_SCHEMA,
  MANIFEST_SCHEMA,
  RELEASE_REPOSITORY,
  SNAPSHOT_SCHEMA,
  artifactCacheDirectory,
  artifactReleaseDirectory,
  canonicalSnapshot,
  createSnapshotDatabase,
  dashboardRecords,
  ensureLocalDatabase,
  localDatabasePath,
  querySnapshotDatabase,
  readArtifactManifest,
  readSnapshotDatabase,
  releaseAsset,
  validateArtifactManifest,
  validateLocalDatabase,
  writeSnapshotArtifacts,
};
