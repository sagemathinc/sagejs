"use strict";

// Standard prepared-only transaction for panel row 1.  All mutable resident
// and replay owners remain inside one Python invocation.  Only a verified,
// immutable neutral correspondence result and a module-branded receipt cross
// the boundary.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const { makeFreshInput } = require("./check_row1_resident_generated_class_attempt.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/row1-fresh-prepared-receipt-v1";
const REPLAY_SCHEMA = "sagejs.pari-class-group/row1-fresh-prepared-replay-v1";
const PREPARED_AUTHORITY_SHA256 =
  "fbfe6fd1c4f0e045410e0efb6834c66b5cfdf30f43a81e8b33271fd57c6c8d54";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const RECEIPTS = new WeakSet();

class Row1FreshPreparedFailure extends Error {}

function fail(message) {
  throw new Row1FreshPreparedFailure(message);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function validatePrepared(prepared) {
  if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) {
    fail("row-1 prepared input is not an object");
  }
  assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS,
    "row-1 transaction received an injected prepared field");
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-1 corridor");
  return authority;
}

function owner(name, role, entries) {
  const values = entries.map(String);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role };
}

function privateComputation(prepared, preparedAuthoritySha256) {
  const { names, input } = makeFreshInput(prepared);
  const program = String.raw`
import collections.abc,dataclasses,decimal,fractions,hashlib,importlib,json,sys,typing
sys.set_int_max_str_digits(100000)
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
d=json.load(sys.stdin);v={}
for name,kind in d["names"]:
 c=bool if kind=="bool" else float if kind in ("float","Float64Buffer") else int
 value=d["input"][name];v[name]=list(map(c,value)) if isinstance(value,list) else c(value)
entry=importlib.import_module("bench.pari-class-group-port.resident_generated_class_attempt").pari_resident_generated_class_attempt
if entry(**v) != 0: raise AssertionError("row-1 resident candidate did not accept")
adapter=importlib.import_module("bench.pari-class-group-port.row1_fresh_class_unit_adapter")
state=adapter.compose_row1_fresh_transaction_state(v,{"preparedAuthoritySha256":d["authority"]})
p=state["presentation"];w=state["classWitness"];u=state["units"]
print(json.dumps({
 "result":state["result"],
 "presentationMatrix":p["presentation"]["matrix"],
 "presentationSha256":state["result"]["authorities"]["presentationSha256"],
 "classWitnessSha256":state["result"]["authorities"]["classWitnessSha256"],
 "classWitness":[*w["descriptor"]["idealHnf"],*w["orderRelation"]["principalGenerator"],*w["exactIdealReplay"]["powerHnf"]],
 "exactUnits":[x for unit in u["exactUnitsIntegralBasis"] for x in unit],
 "unitNorms":u["unitNorms"],"unitArithmeticSha256":u["arithmeticSha256"],
 "regulator":u["packedRegulator"],
 "torsionGenerator":state["torsion"]["torsion"]["generator_power_basis"],
 "torsionOrder":state["torsion"]["torsion"]["order"],
 "attemptState":list(map(str,v["attempt_state"])),
 "relationCount":str(v["relation_state"][0])},separators=(",",":")))
`;
  const run = spawnSync("python3", ["-c", program, ROOT], {
    cwd: ROOT,
    input: JSON.stringify({ names, input, authority: preparedAuthoritySha256 }),
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function buildPayload(computed) {
  assert.equal(computed.result.schema,
    "sagejs.pari-class-group/row1-fresh-upstream-assumed-result-v1");
  assert.equal(computed.result.complete, false);
  assert.equal(computed.result.classGroup.classNumber, "3");
  assert.deepEqual(computed.result.classGroup.invariantFactors, ["3"]);
  assert.deepEqual(computed.unitNorms, ["1", "1"]);
  assert.equal(computed.torsionOrder, "2");
  assert.deepEqual(computed.attemptState, ["4", "0", "1", "1"]);
  assert.equal(computed.relationCount, "58");
  const storage = [
    owner("class-generator-witness", "class-generator-witness",
      computed.classWitness),
    owner("class-presentation", "class-presentation",
      computed.presentationMatrix),
    owner("exact-unit-coordinates", "exact-unit-coordinates",
      computed.exactUnits),
    owner("exact-unit-norms", "exact-unit-norms", computed.unitNorms),
    owner("regulator-enclosure", "regulator-enclosure", computed.regulator),
    owner("torsion-generator", "torsion-generator", computed.torsionGenerator),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: { classNumber: "3", generatorCount: "1",
      invariantFactors: ["3"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: ["20018", "-20010", "0", "1"],
      degree: "3", id: computed.result.field.id },
    honesty: { evidenceOwner: null, outcome: "equal-bound-source-skip",
      sourcePolicy: "PARI-2.17.4-buchall-row1-C1-equals-C2" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [
      { disposition: "assumed", id: "factor-base-generation",
        statement: "PARI's factor-base generation and selection are assumed correct" },
      { disposition: "assumed", id: "grh-and-upstream-bounds",
        statement: "GRH and PARI's undocumented upstream bounds are assumed correct" },
      { disposition: "assumed", id: "pari-correspondence",
        statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
      { disposition: "assumed", id: "prepared-maximal-order",
        statement: "The authenticated prepared maximal order is assumed correct" },
      { disposition: "assumed", id: "unit-index-selection",
        statement: "PARI's selected unit lattice is assumed to have index one" },
    ], correspondence: "upstream-assumed-pari-correspondence",
    pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4",
    replaySchema: REPLAY_SCHEMA }, storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { coordinatesOwner: "exact-unit-coordinates",
      normsOwner: "exact-unit-norms", tag: "exact_units" }, rank: "2",
    regulatorOwner: "regulator-enclosure",
    torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}

function writeImmutable(outputDirectory, raw) {
  const digest = neutral.sha256Bytes(raw);
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const destination = path.join(outputDirectory,
    `row1-fresh-neutral-result-${digest}.json`);
  try {
    fs.writeFileSync(destination, raw, { flag: "wx", mode: 0o400 });
    fs.chmodSync(destination, 0o444);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert(fs.readFileSync(destination).equals(raw),
      "immutable row-1 result publication conflicts");
  }
  return Object.freeze({ path: destination, sha256: digest, bytes: raw.length });
}

async function runFreshPrepared(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  assert(outputDirectory.length > 0);
  const preparedAuthority = validatePrepared(prepared);
  const computed = privateComputation(
    structuredClone(prepared), preparedAuthority.sha256);
  const payload = buildPayload(computed);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const payloadSha256 = neutral.sha256Canonical(payload);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    classWitnessSha256: computed.classWitnessSha256,
    presentationSha256: computed.presentationSha256,
    preparedAuthoritySha256: preparedAuthority.sha256,
    regulator: computed.regulator,
    unitArithmeticSha256: computed.unitArithmeticSha256,
  });
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
    replaySchema: REPLAY_SCHEMA,
    replay(candidate) {
      assert.equal(neutral.sha256Canonical(candidate), payloadSha256);
      assert.equal(candidate.field.id, computed.result.field.id);
      assert.equal(candidate.classGroup.classNumber, "3");
      assert.deepEqual(candidate.classGroup.invariantFactors, ["3"]);
      const owners = Object.fromEntries(candidate.storage.map(value =>
        [value.name, value.entries]));
      assert.deepEqual(owners["class-presentation"], computed.presentationMatrix);
      assert.deepEqual(owners["class-generator-witness"], computed.classWitness);
      assert.deepEqual(owners["exact-unit-coordinates"], computed.exactUnits);
      assert.deepEqual(owners["exact-unit-norms"], computed.unitNorms);
      assert.deepEqual(owners["regulator-enclosure"], computed.regulator);
      assert.deepEqual(owners["torsion-generator"], computed.torsionGenerator);
      return { schema: REPLAY_SCHEMA, payloadSha256,
        fieldId: computed.result.field.id, mathematicalAuthoritySha256,
        correspondence_complete: true, public_complete: false };
    },
  });
  const verifiedResult = neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  assert(verifiedResult instanceof neutral.ImmutableClassUnitCorrespondenceResult);
  const publication = writeImmutable(
    path.resolve(outputDirectory), verifiedResult.canonicalJSON());
  assert.equal(publication.sha256, verifiedResult.sha256);
  const receipt = {
    schema: SCHEMA,
    preparedAuthoritySha256: preparedAuthority.sha256,
    freshPreparedExecution: true,
    retainedRuntimeInputs: false,
    retainedOwnersRuntimeInputs: false,
    frozenW0RuntimeInput: false,
    preparedNfLiveRoot: true,
    correspondenceComplete: true,
    publicComplete: false,
    runtimeInputs: ["authenticated normalized prepared-nf data"],
    excludedRuntimeInputs: ["factor owner", "relation/HNF owner",
      "acceptance owner", "presentation owner", "unit owner", "W0"],
    qualifiedTiming: false,
    mathematicalAuthoritySha256,
    result: publication,
    classGroup: { classNumber: "3", invariantFactors: ["3"] },
    exactUnitCount: 2,
    torsionOrder: "2",
    relationCount: 58,
    status: "pari-2.17.4-correspondence-complete-not-certified",
  };
  Object.defineProperty(receipt, "verifiedResult", {
    configurable: false,
    enumerable: false,
    value: verifiedResult,
    writable: false,
  });
  deepFreeze(receipt);
  RECEIPTS.add(receipt);
  return receipt;
}

async function runFreshPreparedRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["outputDirectory", "prepared"]);
  return runFreshPrepared(request.prepared, request.outputDirectory);
}

function isAuthenticFreshReceipt(receipt) {
  return RECEIPTS.has(receipt);
}

module.exports = { PREPARED_AUTHORITY_SHA256, Row1FreshPreparedFailure, SCHEMA,
  isAuthenticFreshReceipt, runFreshPrepared, runFreshPreparedRequest,
  validatePrepared };
