"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { runRow14Schedule } = require("./row14_live_continuation_host.cjs");

const W0_SHA256 = "13f7e37fe4ba3c610e2c4340c243fa9da398b8d32a272b3c450525c287afe18a";
const EXPECTED_STATES = [
  [3, 10, 792, 4, 7, 105, 0, 802, 0],
  [4, 11, 793, 2, 7, 1, 0, 804, 0],
  [2, 9, 796, 1, 7, 3, 0, 805, 0],
  [3, 10, 796, 0, 7, 0, 0, 806, 0],
];

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const hash = value => sha256(JSON.stringify(value));
const array = owner => owner.toArray ? owner.toArray() : Array.from(owner);
const integer = value => (assert.equal(value.kind, "integer"), value.value);
const integerMatrix = matrix => matrix.values.flatMap(column => column.values.map(integer));
function triple(value) {
  if (value.kind === "integer") return [value.value, "-1", "0"];
  assert.equal(value.kind, "real");
  return [value.mantissa, String(value.precision), String(value.exponent)];
}
function logMatrix(matrix) {
  return matrix.values.flatMap(column => column.values.flatMap(value => value.kind === "complex"
    ? ["2", ...triple(value.real), ...triple(value.imag)]
    : ["1", ...triple(value), "0", "-1", "0"]));
}
function publish(directory, owner) {
  const plain = Buffer.from(JSON.stringify(owner));
  const ownerSha256 = sha256(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const target = path.join(directory, `row14-accepted-${ownerSha256}.json.gz`);
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(target)) {
    assert(fs.readFileSync(target).equals(compressed), "immutable owner collision");
  } else {
    const temporary = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, compressed, { flag: "wx", mode: 0o444 });
    try {
      fs.linkSync(temporary, target);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      assert(fs.readFileSync(target).equals(compressed), "immutable owner publication race");
    } finally {
      fs.unlinkSync(temporary);
    }
  }
  fs.chmodSync(target, 0o444);
  return { path: target, ownerSha256, compressedSha256: sha256(compressed),
    compressedBytes: compressed.length, uncompressedBytes: plain.length };
}

(async () => {
  const metadataReceipt = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
  const started = Date.now();
  const live = await runRow14Schedule(metadataReceipt.metadata);
  assert.deepEqual(live.checkpoints.map(checkpoint => checkpoint.state), EXPECTED_STATES);
  assert.deepEqual(live.passTrace.map(pass => pass.after), [804, 805, 805, 805, 805, 805, 806]);
  assert.deepEqual(live.passTrace.map(pass => pass.need), [4, 2, 1, 1, 1, 1, 1]);
  assert.deepEqual(live.passTrace.map(pass => pass.searchCount), [4, 2, 1, 1, 1, 1, 1]);
  assert.equal(live.collectionPasses + 1, 8);
  assert(live.ownerBytesUpperBound < 4 * 1024 ** 3);

  // Frozen authority enters only after the complete live eight-pass schedule.
  const w0Raw = fs.readFileSync(path.resolve(process.argv[3]));
  assert.equal(sha256(w0Raw), W0_SHA256);
  const events = JSON.parse(w0Raw).events.filter(event => event.event === "hnf");
  assert.equal(events.length, 4);
  const records = array(live.collectorValues.relation_records).map(String);
  const logs = array(live.collectorValues.log_embeddings).map(String);
  const checkpointHashes = [];
  for (let index = 0; index < 4; index += 1) {
    const checkpoint = live.checkpoints[index], oracle = events[index], columns = checkpoint.columns;
    assert.equal(oracle.relations, columns);
    const expected = {
      relations: oracle.relationRecords.flatMap(record => record.R.values.map(String)),
      logs: logMatrix(oracle.exactEmbeddings), h: integerMatrix(oracle.exactW),
      dep: integerMatrix(oracle.exactDep), b: integerMatrix(oracle.exactB),
      c: logMatrix(oracle.exactC), perm: oracle.perm.values.map(String),
    };
    const actual = { relations: records.slice(0, 799 * columns),
      logs: logs.slice(0, 21 * columns), h: checkpoint.h, dep: checkpoint.dep,
      b: checkpoint.b, c: checkpoint.c, perm: checkpoint.perm };
    for (const name of Object.keys(expected)) assert.deepEqual(actual[name], expected[name], `${columns} ${name}`);
    checkpointHashes.push({ columns, state: checkpoint.state,
      hashes: Object.fromEntries(Object.entries(actual).map(([name, values]) => [name, hash(values)])) });
  }

  const columns = 806, values = live.collectorValues;
  const final = {
    relationState: values.relation_state.toArray().map(String),
    records: records.slice(0, 799 * columns),
    generators: values.generators.toArray().slice(0, 4 * columns).map(String),
    hashes: values.relation_hashes.toArray().slice(0, columns).map(String),
    metadata: values.relation_metadata.toArray().slice(0, 3 * columns).map(String),
    logs: logs.slice(0, 21 * columns), hnfState: live.resident.state.map(String),
    h: live.resident.h.map(String), dep: live.resident.dep.map(String),
    b: live.resident.b.map(String), c: live.resident.c.map(String),
    perm: live.resident.perm.map(String),
  };
  const owner = {
    schema: "sagejs.pari-class-group/row14-accepted-relation-owner-v1",
    field: { polynomial: metadataReceipt.metadata.prepared.prep_polynomial.map(String),
      degree: metadataReceipt.metadata.policy.degree },
    ancestry: { capsuleSha256: metadataReceipt.metadata.authority.capsuleSha256,
      factorMetadataSha256: metadataReceipt.metadataSha256 },
    schedule: { relationCounts: [42, 802, 804, 805, 806], collectionPasses: 8,
      passTrace: live.passTrace, checkpoints: checkpointHashes },
    capacity: { ownerBytesUpperBound: live.ownerBytesUpperBound,
      rssLimitBytes: 4 * 1024 ** 3, processLimitSeconds: 600 },
    acceptanceBoundary: { rows: 799, hRows: 3, bColumns: 796,
      totalColumns: 806, places: 3, degree: 4,
      previousAcceptanceColumns: 0, cacheChanged: true },
    final,
    exclusions: ["terminal class group", "Smith invariants", "regulator", "units",
      "capacity tails", "frozen W0 as a runtime input"],
  };
  const receipt = publish(path.resolve(process.argv[4]), owner);
  console.log(JSON.stringify({ schema: "sagejs.pari-class-group/row14-accepted-owner-receipt-v1",
    elapsedMs: Date.now() - started, ...receipt, relationState: final.relationState,
    checkpoints: checkpointHashes, ownerBytesUpperBound: live.ownerBytesUpperBound,
    passTrace: live.passTrace }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
