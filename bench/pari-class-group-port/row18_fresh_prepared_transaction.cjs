"use strict";

// Genuine prepared-only row-18 class-and-unit transaction.  The generated
// factor base, relations, HNF, class witness, and unit never leave this call;
// only a neutral immutable result and a module-local branded receipt do.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const authentication = require("./prepared_nf_authentication.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const inputApi = require("./row18_fresh_prepared_input.cjs");

const ROOT = path.resolve(__dirname, "../..");
const PIPELINE = path.join(__dirname, "row18_fresh_prepared_pipeline.py");
const SCHEMA = "sagejs.pari-class-group/row18-fresh-prepared-transaction-v1";
const REPLAY_SCHEMA = "sagejs.pari-class-group/row18-fresh-prepared-replay-v1";
const FIELD_ID = "3.1.1005907102200.3";
const PREPARED_AUTHORITY_SHA256 =
  "2306e01429981dc6e956f10dd4c9528b157fbff76c1c137419e678a958de1dd0";
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const RECEIPTS = new WeakSet();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function storage(name, role, entries) {
  const values = entries.map(String);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role };
}

function privateComputation(prepared, preparedAuthoritySha256) {
  const data = inputApi.makeFreshInput(prepared);
  const ancestry = { preparedAuthoritySha256,
    pipelineSourceSha256: sha(fs.readFileSync(PIPELINE)) };
  const program = String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path.extend([sys.argv[1] + "/src/lib"])
d=json.load(sys.stdin)
m=importlib.import_module("bench.pari-class-group-port.row18_fresh_prepared_pipeline")
json.dump(m.run_fresh_row18(d["names"],d["input"],d["ancestry"]),sys.stdout,separators=(",",":"))
print()
`;
  const run = spawnSync("python3", ["-c", program, ROOT], { cwd: ROOT,
    input: JSON.stringify({ ...data, ancestry }), encoding: "utf8",
    timeout: 600_000, maxBuffer: 128 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const value = JSON.parse(run.stdout);
  assert.equal(value.initialAction, 5);
  assert.equal(value.status, 0);
  assert.equal(value.classNumber, "18");
  assert.deepEqual(value.invariants.slice(0, 1), ["18"]);
  assert.deepEqual(value.presentation.dimensions, { degree: 3, places: 2,
    factorBaseSize: 41, relationCount: 49, kernelRank: 8, unitRank: 1,
    subfactorCount: 4 });
  assert.equal(value.presentation.presentation.classNumber, "18");
  assert.deepEqual(value.presentation.presentation.invariants, ["18"]);
  assert.equal(value.classWitness.quotient.generatorOrder, "18");
  assert.equal(value.classWitness.exactIdealReplay.powerEqualsPrincipal, true);
  assert.equal(value.unit.factorback.relationDependencyVerified, true);
  assert.equal(value.unit.factorback.unitNorm, "1");
  assert.equal(value.unit.factorback.inverseVerified, true);
  assert.deepEqual(value.unit.factorback.inverseProduct, ["1", "0", "0"]);
  for (const owner of [value.presentation, value.classWitness, value.unit])
    assert.deepEqual(owner.ancestry, ancestry);
  return value;
}

function payloadOf(computation) {
  const p = computation.presentation;
  const c = computation.classWitness;
  const u = computation.unit;
  const stores = [
    storage("class-generator-ideals", "class-generator-ideal", c.generator.idealHnf),
    storage("class-generator-order-witnesses", "exact-order-principal-witness", [
      ...c.orderRelation.rawRelationCoefficients,
      ...c.orderRelation.principalGenerator,
      ...c.exactIdealReplay.powerHnf,
    ]),
    storage("exact-unit-coordinates", "exact-unit-coordinates", u.factorback.exactUnit),
    storage("exact-unit-norms", "exact-unit-norms", [u.factorback.unitNorm]),
    storage("factor-base-presentation", "class-presentation", p.presentation.matrix),
    storage("raw-unit-provenance", "exact-unit-raw-provenance",
      u.factorback.rawRelationCoefficients),
    storage("regulator-enclosure", "regulator-enclosure", p.presentation.packedRegulator),
    storage("torsion-generator", "torsion-generator", ["-1", "0", "0"]),
    storage("unit-transform", "exact-unit-kernel-transform", u.cleanarch.bezoutTransform),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const payload = {
    classGroup: { classNumber: "18", generatorCount: "1",
      invariantFactors: ["18"], presentationOwner: "factor-base-presentation" },
    field: { definingPolynomialAscending: [...p.field.polynomial], degree: "3",
      id: FIELD_ID },
    honesty: { evidenceOwner: null, outcome: "not-required",
      sourcePolicy: "fresh-prepared-pari-bounds-assumed" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [
      { disposition: "assumed", id: "factor-base-bounds",
        statement: "PARI's factor-base generation and relation bounds are assumed correct" },
      { disposition: "assumed", id: "pari-correspondence",
        statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
    ], correspondence: "upstream-assumed-pari-correspondence",
    pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4",
    replaySchema: REPLAY_SCHEMA },
    storage: stores,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { coordinatesOwner: "exact-unit-coordinates",
      normsOwner: "exact-unit-norms", tag: "exact_units" }, rank: "1",
    regulatorOwner: "regulator-enclosure", torsionGeneratorOwner: "torsion-generator",
    torsionOrder: "2" },
  };
  neutral.validatePayload(payload);
  return payload;
}

function writeImmutable(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try { fs.writeFileSync(filename, bytes, { flag: "wx", mode: 0o400 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(filename), bytes);
  }
  fs.chmodSync(filename, 0o444);
}

function runFreshPrepared(preparedInput, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  assert(preparedInput && typeof preparedInput === "object" &&
    !Array.isArray(preparedInput));
  assert.deepEqual(Object.keys(preparedInput).sort(), PREPARED_KEYS,
    "prepared input contains an unreviewed owner");
  const authority = authentication.authenticatePreparedNf(preparedInput);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-18 corridor");
  const prepared = structuredClone(preparedInput);
  const computation = privateComputation(prepared, authority.sha256);
  const payload = payloadOf(computation);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const envelopeSha256 = neutral.sha256Bytes(raw);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    preparedAuthoritySha256: authority.sha256,
    presentationSha256: neutral.sha256Canonical(computation.presentation),
    classWitnessSha256: neutral.sha256Canonical(computation.classWitness),
    unitSha256: neutral.sha256Canonical(computation.unit),
  });
  const payloadSha256 = neutral.sha256Canonical(payload);
  const trusted = structuredClone(payload);
  const detached = neutral.createDetachedClassUnitAuthority({ envelopeSha256,
    mathematicalAuthoritySha256, replaySchema: REPLAY_SCHEMA,
    replay(candidate) {
      assert.deepEqual(candidate, trusted);
      return { correspondence_complete: true, fieldId: FIELD_ID,
        mathematicalAuthoritySha256, payloadSha256, public_complete: false,
        schema: REPLAY_SCHEMA };
    } });
  const result = new neutral.ClassUnitCorrespondencePublisher().publish(raw, detached);
  const filename = path.join(path.resolve(outputDirectory),
    `row18-class-unit-result-${result.sha256}.json`);
  writeImmutable(filename, result.canonicalJSON());
  const receipt = { schema: SCHEMA, panelIndex: 18, fieldId: FIELD_ID,
    path: filename, sha256: result.sha256, bytes: result.canonicalJSON().length,
    correspondenceComplete: true, preparedAuthoritySha256: authority.sha256,
    publicComplete: false, freshPreparedExecution: true,
    retainedRuntimeInputs: false, retainedOwnersRuntimeInputs: false,
    privateSameRunOwners: true, frozenW0RuntimeInput: false,
    qualifiedTiming: false, reserveAccess: false,
    runtimeInputs: Object.freeze(["authenticated normalized prepared-nf data"]) };
  Object.defineProperty(receipt, "verifiedResult", { configurable: false,
    enumerable: false, value: result, writable: false });
  Object.freeze(receipt);
  RECEIPTS.add(receipt);
  return receipt;
}

module.exports = { FIELD_ID, REPLAY_SCHEMA, SCHEMA,
  isAuthenticFreshReceipt(receipt) { return RECEIPTS.has(receipt); },
  runFreshPrepared };
