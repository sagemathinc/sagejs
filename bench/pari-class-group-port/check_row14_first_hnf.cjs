"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { runFirstHnf } = require("./row14_first_hnf_host.cjs");

const W0_SHA256 = "13f7e37fe4ba3c610e2c4340c243fa9da398b8d32a272b3c450525c287afe18a";
const ROWS = 799;
const COLUMNS = 802;
const PLACES = 3;

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function view(owner, length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner)).slice(0, length).map(String);
}

function integer(value) {
  assert.equal(value.kind, "integer");
  return value.value;
}

function integerMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => {
    assert.equal(column.kind, "column");
    return column.values.map(integer);
  });
}

function realTriple(value) {
  if (value.kind === "integer") return [value.value, "-1", "0"];
  assert.equal(value.kind, "real");
  return [value.mantissa, String(value.precision), String(value.exponent)];
}

function logMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => {
    assert.equal(column.kind, "column");
    return column.values.flatMap(value => {
      if (value.kind === "complex") {
        return ["2", ...realTriple(value.real), ...realTriple(value.imag)];
      }
      return ["1", ...realTriple(value), "0", "-1", "0"];
    });
  });
}

function maximumBits(values) {
  let result = 0;
  for (const text of values) {
    const value = BigInt(text);
    const absolute = value < 0n ? -value : value;
    result = Math.max(result, absolute.toString(2).length);
  }
  return result;
}

(async () => {
  const metadataReceipt = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
  const started = Date.now();
  // The live computation must finish before the frozen trace is admitted as a
  // differential oracle.  It is never an input to collection or HNF.
  const live = await runFirstHnf(metadataReceipt.metadata, { hnfWords: 16 });
  assert.equal(live.status, 0);
  assert.deepEqual(live.relationState, ["802", "8110", "4", "0", "0", "802"]);
  assert.deepEqual(live.chainState, [3, 0, 42, 802]);
  assert.deepEqual(live.hnfState, [3, 10, 792, 4, 7, 105, 0, 802, 0]);

  const w0Raw = fs.readFileSync(path.resolve(process.argv[3]));
  assert.equal(crypto.createHash("sha256").update(w0Raw).digest("hex"), W0_SHA256);
  const oracle = JSON.parse(w0Raw).events.find(event => event.event === "hnf");
  assert(oracle);
  assert.equal(oracle.relations, COLUMNS);

  const expected = {
    relations: oracle.relationRecords.flatMap(record => record.R.values.map(String)),
    logs: logMatrix(oracle.exactEmbeddings),
    h: integerMatrix(oracle.exactW),
    dep: integerMatrix(oracle.exactDep),
    b: integerMatrix(oracle.exactB),
    c: logMatrix(oracle.exactC),
    perm: oracle.perm.values.map(String),
  };
  assert.deepEqual(expected.h, ["24", "0", "0", "0", "4", "0", "16", "3", "2"]);
  assert.equal(expected.relations.length, ROWS * COLUMNS);
  assert.equal(expected.logs.length, 7 * PLACES * COLUMNS);
  assert.equal(expected.dep.length, 4 * 3);
  assert.equal(expected.b.length, 7 * 792);
  assert.equal(expected.c.length, 7 * PLACES * COLUMNS);
  assert.equal(expected.perm.length, ROWS);

  const actual = {
    relations: view(live.values.relation_records, ROWS * COLUMNS),
    logs: view(live.values.log_embeddings, 7 * PLACES * COLUMNS),
    h: view(live.values.hnf_result_h, 9),
    dep: view(live.values.hnf_result_dep, 12),
    b: view(live.values.hnf_result_b, 7 * 792),
    c: view(live.values.hnf_result_c, 7 * PLACES * COLUMNS),
    perm: view(live.values.hnf_perm, ROWS),
  };
  for (const name of Object.keys(expected)) assert.deepEqual(actual[name], expected[name], name);

  const hashes = Object.fromEntries(Object.entries(actual).map(([name, values]) => [name, hash(values)]));
  assert.equal(hashes.h, "aaa86086cbd7d057be3d68175de70b336e0e078b622e714cd908c89e42c96ceb");
  assert.equal(hashes.dep, "1fece6775238a25cae8bb54485745fae6f09075a2e23b28c364ebb9d9664ae83");
  assert.equal(hashes.b, "e3be4826d233cb9e3b83df22c40ed9e8dc25102f9a7ff1e9aff1c9b5cc5dc599");
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/row14-first-hnf-check-v1",
    elapsedMs: Date.now() - started,
    ownerBytes: live.ownerBytes,
    relationState: live.relationState,
    chainState: live.chainState,
    hnfState: live.hnfState,
    hashes,
    maximumBits: Object.fromEntries(Object.entries(actual).map(([name, values]) => [name, maximumBits(values)])),
    oracle: { path: path.resolve(process.argv[3]), sha256: W0_SHA256, event: "first hnf", relations: COLUMNS },
    exclusions: ["capacity tails", "later HNF events", "terminal class/unit data"],
  }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
