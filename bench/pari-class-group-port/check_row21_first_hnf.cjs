#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function readGzip(file) { return JSON.parse(zlib.gunzipSync(fs.readFileSync(file))); }
function scalar(value) {
  if (value.kind === "integer") return [value.value, "-1", "0"];
  assert.equal(value.kind, "real");
  return [value.mantissa, String(value.precision), String(value.exponent)];
}
function packedLogs(matrix) {
  return matrix.values.flatMap(column => column.values.flatMap(value => {
    if (value.kind === "complex") return ["2", ...scalar(value.real), ...scalar(value.imag)];
    return ["1", ...scalar(value), "0", "-1", "0"];
  }));
}
function oracleRelations(records) {
  return {
    rows: records.flatMap(record => record.R.values),
    generators: records.flatMap(record => record.m.kind === "integer"
      ? [record.m.value, "0", "0", "0", "0"]
      : record.m.values.map(value => value.value)),
    metadata: records.flatMap((record, index) =>
      [String(index + 1), String(record.origin), String(record.automorphism)]),
  };
}
function mod(value, modulus) {
  const residue = value % modulus;
  return residue < 0n ? residue + modulus : residue;
}
function inverse(value, modulus) {
  let oldR = mod(value, modulus), r = modulus, oldS = 1n, s = 0n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  assert.equal(oldR, 1n, "noninvertible linear Kummer coefficient");
  return mod(oldS, modulus);
}
function factorIdentityOrder(factorOwner, factorEvent) {
  const computed = factorOwner.factorBase.descriptors;
  const ideals = factorOwner.factorBase.ideals;
  const oracle = factorEvent.LP.values;
  const metadata = record => record.slice(0, 3).join(":");
  const multiplicity = new Map();
  for (const record of computed) {
    const key = metadata(record);
    multiplicity.set(key, (multiplicity.get(key) || 0) + 1);
  }
  const computedSeen = new Map(), oracleSeen = new Map();
  const computedKeys = computed.map((record, index) => {
    const key = metadata(record);
    if (multiplicity.get(key) === 1) return key;
    if (record[2] !== "1") {
      const occurrence = computedSeen.get(key) || 0;
      computedSeen.set(key, occurrence + 1);
      return `${key}:occurrence=${occurrence}`;
    }
    const prime = BigInt(record[0]);
    // For a degree-one ideal HNF, column one says alpha = -h[0,1].
    return `${key}:root=${mod(-BigInt(ideals[index][1]), prime)}`;
  });
  const oracleKeys = oracle.map(record => {
    const fields = record.values;
    const key = [fields[0].value, fields[2].value, fields[3].value].join(":");
    if (multiplicity.get(key) === 1) return key;
    if (fields[3].value !== "1") {
      const occurrence = oracleSeen.get(key) || 0;
      oracleSeen.set(key, occurrence + 1);
      return `${key}:occurrence=${occurrence}`;
    }
    const generator = fields[1].values.map(value => BigInt(value.value));
    assert(generator.slice(2).every(value => value === 0n));
    const prime = BigInt(fields[0].value);
    const root = mod(-generator[0] * inverse(generator[1], prime), prime);
    return `${key}:root=${root}`;
  });
  assert.equal(new Set(computedKeys).size, computedKeys.length);
  assert.equal(new Set(oracleKeys).size, oracleKeys.length);
  return computedKeys.map(key => {
    const index = oracleKeys.indexOf(key);
    assert.notEqual(index, -1, `missing oracle ideal identity ${key}`);
    return index;
  });
}
function columns(values, width) {
  assert.equal(values.length % width, 0);
  return Array.from({ length: values.length / width }, (_, index) =>
    values.slice(index * width, (index + 1) * width));
}

async function main() {
  const [preparedPath, factorPath, relationPath, w0Path] = process.argv.slice(2);
  assert(preparedPath && factorPath && relationPath && w0Path,
    "usage: check_row21_first_hnf.cjs PREPARED.json FACTOR.json.gz RELATION.json.gz W0.json");
  const payload = { prepared: JSON.parse(fs.readFileSync(preparedPath)),
    factorOwner: readGzip(factorPath), relationOwner: readGzip(relationPath),
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "row21-hnf-a-")) };
  const coordinator = require("./row21_first_hnf_coordinator.cjs");
  const first = await coordinator.run(payload);
  const second = await coordinator.run({ ...payload,
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "row21-hnf-b-")) });
  assert.equal(first.ownerSha256, second.ownerSha256);
  assert.deepEqual(first.owner, second.owner);
  assert.equal(first.owner.provenance.frozenAnswerInputs, false);

  // The pristine trace is opened only after both independent publications.
  const w0Bytes = fs.readFileSync(w0Path);
  assert.equal(sha(w0Bytes), W0_SHA256);
  const raw = JSON.parse(w0Bytes);
  const after = raw.events.find(event => event.event === "small_norm_after");
  const hnf = raw.events.find(event => event.event === "hnf");
  const factorEvent = raw.events.find(event => event.event === "factor_base");
  assert(after && hnf && factorEvent);
  const oracle = oracleRelations(after.relationRecords);
  const identityOrder = factorIdentityOrder(payload.factorOwner, factorEvent);
  const normalizedRows = columns(oracle.rows, 24)
    .flatMap(row => identityOrder.map(index => row[index]));
  assert.deepEqual(first.owner.relations.records, normalizedRows);
  assert.deepEqual(first.owner.relations.generators, oracle.generators);
  assert.deepEqual(first.owner.relations.metadata, oracle.metadata);
  assert.deepEqual(first.owner.hnf.H, hnf.W);
  assert.deepEqual(first.owner.hnf.dep, hnf.dep);
  assert.deepEqual(first.owner.hnf.B, hnf.B);
  assert.deepEqual(first.owner.hnf.C, hnf.C);
  // The equivalent p=29 ideal order swaps the final two independent log
  // columns. Compare their exact packed values as a column set, while the
  // deterministic double publication above fixes this owner's local order.
  const canonicalColumns = value => columns(value, 7 * 4)
    .map(column => JSON.stringify(column)).sort();
  assert.deepEqual(canonicalColumns(first.owner.hnf.exactC),
    canonicalColumns(packedLogs(hnf.exactC)));
  assert.deepEqual([...first.owner.hnf.permutation].map(Number).sort((a, b) => a - b),
    Array.from({ length: 24 }, (_, index) => index + 1));

  const mutations = [];
  for (const [label, mutate] of [
    ["prepared", value => { value.prepared.prep_polynomial[0] = "37"; }],
    ["factor", value => { value.factorOwner.factorBase.descriptors[0][1] = "2"; }],
    ["relation", value => { value.relationOwner.relations.frontierState[1] = "6"; }],
  ]) {
    const bad = { prepared: structuredClone(payload.prepared),
      factorOwner: structuredClone(payload.factorOwner),
      relationOwner: structuredClone(payload.relationOwner),
      outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), `row21-hnf-bad-${label}-`)) };
    mutate(bad);
    await assert.rejects(coordinator.run(bad));
    assert.deepEqual(fs.readdirSync(bad.outputDirectory), []);
    mutations.push(label);
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-first-hnf-check-v1",
    ownerSha256: first.ownerSha256, compressedSha256: first.compressedSha256,
    relationState: first.owner.state.relation, hnfState: first.owner.state.hnf,
    exactRelations: after.relationRecords.length, exactLogScalars: hnf.C[0] * hnf.C[1],
    mutationsRejected: mutations, sourceSha256: first.owner.authority.connectedSourceSha256,
    collectorSha256: first.owner.authority.collectorSourceSha256,
    coreSha256: first.owner.authority.coreSha256,
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
