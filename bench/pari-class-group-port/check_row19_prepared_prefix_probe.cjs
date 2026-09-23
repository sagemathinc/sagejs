#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row19_prepared_prefix_probe.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-19-0aab4dadcd4bc7c7.json";
const W0_SHA256 = "0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9";
const DEGREE = 3;
const ROWS = 424;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function exactInteger(value, label) {
  if (typeof value === "string" || typeof value === "number") {
    assert.match(String(value), /^-?(0|[1-9][0-9]*)$/, `${label} is not canonical`);
    return String(value);
  }
  assert(value && value.kind === "integer", `${label} is not an integer`);
  return exactInteger(value.value, label);
}

function typedValues(value, kind, length, label) {
  assert(value && value.kind === kind && Array.isArray(value.values), `${label} kind changed`);
  if (length !== undefined) assert.equal(value.values.length, length, `${label} length changed`);
  return value.values;
}

function descriptorOracle(event) {
  return typedValues(event.LP, "vector", ROWS, "factor descriptors")
    .map((descriptor, index) => {
      const fields = typedValues(descriptor, "vector", 5, `descriptor ${index}`);
      const generator = typedValues(fields[1], "column", DEGREE,
        `descriptor ${index} generator`).map((entry, i) =>
        exactInteger(entry, `descriptor ${index} generator ${i}`));
      const columns = typedValues(fields[4], "matrix", DEGREE,
        `descriptor ${index} tau`);
      const columnMajor = columns.flatMap((column, j) =>
        typedValues(column, "column", DEGREE, `descriptor ${index} tau column ${j}`)
          .map((entry, i) => exactInteger(entry,
            `descriptor ${index} tau ${i},${j}`)));
      const tau = Array(DEGREE * DEGREE);
      for (let row = 0; row < DEGREE; row += 1)
        for (let column = 0; column < DEGREE; column += 1)
          tau[row * DEGREE + column] = columnMajor[column * DEGREE + row];
      return { p: exactInteger(fields[0], `descriptor ${index} p`), generator,
        e: exactInteger(fields[2], `descriptor ${index} e`),
        f: exactInteger(fields[3], `descriptor ${index} f`), tau };
    });
}

function flattenExactMatrix(value, rows, columns, label) {
  const cols = typedValues(value, "matrix", columns, label);
  return cols.flatMap((column, j) => {
    const entries = typedValues(column, column.kind, rows, `${label} column ${j}`);
    return entries.map((entry, i) => exactInteger(entry, `${label}[${i},${j}]`));
  });
}

function main() {
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256, "pristine W0 digest changed");
  const auth = require("./prepared_nf_authentication.cjs");
  const raw = JSON.parse(fs.readFileSync(W0));
  const prepared = auth.normalizePreparedBundle(raw);
  const authority = auth.authenticatePreparedBundle(raw);
  const allowedPrepared = ["admission_factorlimit", "admission_matrix_e",
    "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
    "admission_primes", "admission_products", "admission_real_count",
    "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
    "basis_table", "n", "precision", "prep_index", "prep_invzk",
    "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
    "preparation_embedding", "preparation_rounded_embedding"];
  assert.deepEqual(Object.keys(prepared).sort(), allowedPrepared,
    "probe received an unreviewed prepared field");

  const started = process.hrtime.bigint();
  const run = spawnSync("python3", ["-c", String.raw`
import runpy,sys
sys.path.extend(['src/lib','src/baselib','.'])
runpy.run_module('bench.pari-class-group-port.row19_prepared_prefix_probe',run_name='__main__')`], {
    cwd: ROOT, input: JSON.stringify(prepared), encoding: "utf8",
    timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  const elapsedNs = process.hrtime.bigint() - started;
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);

  // Only after the prepared-only process exits do answer-bearing events become
  // comparison oracles.
  const factor = raw.events.find(event => event.event === "factor_base");
  const initialized = raw.events.find(event => event.event === "initialized");
  assert(factor && initialized, "cold row-19 oracle events disappeared");
  assert.deepEqual([result.factor.C1, result.factor.C2, result.factor.KC,
    result.factor.KCZ, result.factor.KCZ2],
  [factor.C1, factor.C2, factor.KC, factor.KCZ, factor.KCZ2]);
  assert.deepEqual(result.factor.rationalPrimes.map(String), factor.FB.values);
  assert.deepEqual(result.factor.permutation.map(String), factor.perm.values);
  assert.deepEqual(result.factor.subfactor.map(String), factor.subfactor.values);

  const expectedDescriptors = descriptorOracle(factor);
  assert.deepEqual(result.factor.primes.map(String), expectedDescriptors.map(row => row.p));
  assert.deepEqual(result.factor.ramification.map(String), expectedDescriptors.map(row => row.e));
  assert.deepEqual(result.factor.residueDegrees.map(String), expectedDescriptors.map(row => row.f));
  assert.deepEqual(result.factor.generators.map(row => row.map(String)),
    expectedDescriptors.map(row => row.generator));
  assert.deepEqual(result.factor.tau.map(String), expectedDescriptors.flatMap(row => row.tau));

  assert.equal(result.relations.initialCount, initialized.relations);
  assert.equal(result.relations.target, initialized.target);
  assert.equal(result.relations.need, initialized.need);
  assert.equal(result.relations.Nrelid, initialized.Nrelid);
  assert.equal(result.relations.missing, initialized.missing);
  assert.deepEqual(result.relations.state.map(String),
    ["71", "4350", "353", "6", "0", "430"]);
  assert.deepEqual(result.relations.basis.map(String),
    flattenExactMatrix(initialized.basis, ROWS, ROWS, "initial relation basis"));
  const oracleRecords = initialized.relationRecords;
  const expectedDense = oracleRecords.flatMap((record, index) => {
    assert.equal(record.R.values.length, ROWS, `relation ${index} width changed`);
    return record.R.values;
  });
  assert.deepEqual(result.relations.records.map(String), expectedDense);
  assert.deepEqual(result.relations.hashes.map(String),
    oracleRecords.map(record => String(record.nz)));
  assert.deepEqual(result.relations.metadata.map(String),
    oracleRecords.flatMap((record, index) => [String(index + 1),
      String(record.origin), String(record.automorphism)]));
  assert.deepEqual(result.relations.generators.map(String),
    oracleRecords.flatMap(record => [exactInteger(record.m, "relation generator"), "0", "0"]));

  // Answer-bearing changes provably do not cross the invocation boundary.
  const preparedHash = sha(Buffer.from(JSON.stringify(prepared)));
  const forbidden = structuredClone(raw);
  forbidden.events.find(event => event.event === "factor_base").C1 = 1;
  forbidden.events.find(event => event.event === "factor_base").LP.values[0]
    .values[0].value = "99991";
  forbidden.events.find(event => event.event === "initialized")
    .relationRecords[0].R.values[0] = "99";
  assert.equal(sha(Buffer.from(JSON.stringify(auth.normalizePreparedBundle(forbidden)))),
    preparedHash);
  let preparedMutationsRejected = 0;
  for (const mutate of [
    value => { value.prepared.polynomial[0] = "-51050867718180331"; },
    value => { value.prepared.index = "254540"; },
    value => { [value.prepared.runtimePrimes[0], value.prepared.runtimePrimes[1]] =
      [value.prepared.runtimePrimes[1], value.prepared.runtimePrimes[0]]; },
  ]) {
    const changed = structuredClone(raw);
    mutate(changed);
    assert.throws(() => auth.authenticatePreparedBundle(changed));
    preparedMutationsRejected += 1;
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-prepared-prefix-check-v1",
    preparedAuthoritySha256: authority.sha256,
    sourceSha256: sha(fs.readFileSync(SOURCE)), elapsedNs: String(elapsedNs),
    C1: result.factor.C1, C2: result.factor.C2, KC: result.factor.KC,
    KCZ: result.factor.KCZ, indexPrimes: [3, 7, 17, 23, 31],
    exactDescriptors: ROWS, initialRelations: result.relations.initialCount,
    target: result.relations.target, need: result.relations.need,
    descriptorSha256: sha(Buffer.from(JSON.stringify({ p: result.factor.primes,
      e: result.factor.ramification, f: result.factor.residueDegrees,
      u: result.factor.generators, tau: result.factor.tau }))),
    packetSha256: sha(Buffer.from(JSON.stringify({ ideals: result.factor.packetIdeals,
      norms: result.factor.packetNorms }))),
    relationSha256: sha(Buffer.from(JSON.stringify(result.relations))),
    coldOracleAfterProbeExit: true, oracleMutationPayloadUnchanged: true,
    preparedMutationsRejected, randomRelationSearchExecuted: false,
    oracleDataConsumed: result.diagnostic.oracleDataConsumed,
  })}\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
