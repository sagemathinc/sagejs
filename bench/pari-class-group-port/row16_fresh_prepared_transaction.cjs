"use strict";

// Genuine prepared-input-only row-16 transaction.  The factor base,
// relations, HNF/Smith presentation, class witnesses and unit all live in one
// private Python invocation.  Only the verified neutral result survives it.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const ownerManifest = require("./resident_candidate_owner_manifest.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "resident_generated_class_attempt.py");
const RECEIPT_SCHEMA =
  "sagejs.pari-class-group/row16-fresh-prepared-transaction-v1";
const REPLAY_SCHEMA = "sagejs.pari-class-group/row16-fresh-prepared-replay-v1";
const PREPARED_AUTHORITY_SHA256 =
  "8a2ed127c9e40b458ca074f8472911205b6cc7689a1539c97ed9e56139909d81";
const FIELD_ID = "3.1.1002718428660.2";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const FRESH_RECEIPTS = new WeakSet();

class Row16FreshPreparedFailure extends Error {}
function fail(message) { throw new Row16FreshPreparedFailure(message); }

function deepFreeze(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}

function validatePrepared(prepared) {
  if (!prepared || typeof prepared !== "object" || Array.isArray(prepared))
    fail("row-16 prepared input is not an object");
  assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS,
    "row-16 transaction received an injected prepared field");
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-16 corridor");
  return authority;
}

function makeFreshInput(prepared) {
  const source = fs.readFileSync(SOURCE, "utf8");
  const match = source.match(
    /def pari_resident_generated_class_attempt\(([\s\S]*?)\n\)/);
  assert(match, "missing resident cubic entry signature");
  const names = match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
  const capacities = {};
  for (const group of ownerManifest.owner_groups) {
    const length = ownerManifest.length_rules[group.length_rule].length;
    for (const name of group.owners)
      if (group.kind.endsWith("Buffer")) capacities[name] = length;
  }
  const explicit = Object.fromEntries(Object.entries(prepared).map(([key, value]) =>
    [key, structuredClone(value)]));
  const input = Object.fromEntries(names.map(([name, kind]) => {
    if (Object.hasOwn(explicit, name)) return [name, explicit[name]];
    assert(kind.endsWith("Buffer"), `unclassified scalar input: ${name}`);
    assert(Object.hasOwn(capacities, name), `unclassified owner capacity: ${name}`);
    return [name, Array(capacities[name]).fill(0)];
  }));
  input.accept_inverse_hr = [-991, -992, -993];
  input.analytic_log_discriminant = [-999];
  return { names, input };
}

function privateComputation(prepared, preparedAuthoritySha256) {
  const request = makeFreshInput(prepared);
  request.authority = preparedAuthoritySha256;
  const program = String.raw`
import collections.abc,dataclasses,decimal,fractions,hashlib,importlib,json,sys,typing
sys.set_int_max_str_digits(100000)
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
d=json.load(sys.stdin);v={}
for name,kind in d["names"]:
 c=bool if kind=="bool" else float if kind in ("float","Float64Buffer") else int
 value=d["input"][name];v[name]=list(map(c,value)) if isinstance(value,list) else c(value)
entry=importlib.import_module("bench.pari-class-group-port.resident_generated_class_attempt").pari_resident_generated_class_attempt
if entry(**v) != 0: raise AssertionError("row-16 resident candidate did not accept")
adapter=importlib.import_module("bench.pari-class-group-port.row16_fresh_class_unit_adapter")
state=adapter.compose_row16_fresh_state(v,{"preparedAuthoritySha256":d["authority"]})
p=state["presentation"];w=state["classWitness"];u=state["unit"]
print(json.dumps({
 "authorities":state["authorities"],
 "factorDescriptors":p["factorBase"]["descriptors"],
 "factorIdeals":p["factorBase"]["ideals"],"factorNorms":p["factorBase"]["norms"],
 "relations":p["relations"]["matrix"],
 "principalGenerators":p["relations"]["principalGenerators"],
 "relationLogs":p["relations"]["packedLogs"],
 "presentation":p["presentation"]["matrix"],
 "rawToKernel":p["presentation"]["rawToKernel"],
 "relationToPresentation":p["presentation"]["relationToPresentation"],
 "regulator":p["presentation"]["packedRegulator"],
 "classWitness":[x for z in w["witnesses"] for x in [*z["descriptor"]["idealHnf"],*z["orderRelation"]["rawRelationCoefficients"],*z["orderRelation"]["principalGenerator"],*z["exactIdealReplay"]["powerHnf"]]],
 "exactUnit":u["factorback"]["exactUnit"],"exactInverse":u["factorback"]["exactInverse"],
 "unitNorm":[u["factorback"]["unitNorm"]],
 "unitProvenance":u["factorback"]["rawRelationCoefficients"],
 "unitTransform":u["cleanarch"]["bezoutTransform"],
 "attemptState":list(map(str,v["attempt_state"])),
 "baseState":list(map(str,v["prep_base_state"][:6])),
 "relationCount":str(v["relation_state"][0]),"hnfState":list(map(str,p["replay"]["hnfState"]))
},separators=(",",":")))
`;
  const run = spawnSync("python3", ["-c", program, ROOT], {
    cwd: ROOT, input: JSON.stringify(request), encoding: "utf8", timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function storage(name, role, entries) {
  const values = entries.map(String);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role };
}

function buildPayload(computed) {
  assert.deepEqual(computed.attemptState, ["4", "0", "3", "1"]);
  assert.deepEqual(computed.baseState, ["215", "215", "48", "31", "31", "48"]);
  assert.equal(computed.relationCount, "54");
  assert.deepEqual(computed.hnfState, ["3", "9", "45", "0", "6", "3", "0", "54", "0"]);
  assert.deepEqual(computed.unitNorm, ["1"]);
  const stores = [
    storage("class-generator-order-witnesses", "exact-order-principal-witness",
      computed.classWitness),
    storage("class-presentation", "class-presentation", computed.presentation),
    storage("exact-unit-coordinates", "exact-unit-coordinates", computed.exactUnit),
    storage("exact-unit-inverse", "exact-unit-inverse", computed.exactInverse),
    storage("exact-unit-norms", "exact-unit-norms", computed.unitNorm),
    storage("factor-base-descriptors", "factor-base-descriptors", computed.factorDescriptors),
    storage("factor-base-ideals", "factor-base-ideals", computed.factorIdeals),
    storage("factor-base-norms", "factor-base-norms", computed.factorNorms),
    storage("raw-to-kernel-transform", "raw-to-unit-kernel", computed.rawToKernel),
    storage("regulator-enclosure", "regulator-enclosure", computed.regulator),
    storage("relation-logs", "archimedean-relation-logs", computed.relationLogs),
    storage("relation-matrix", "factor-base-relations", computed.relations),
    storage("relation-principal-generators", "principal-relation-generators",
      computed.principalGenerators),
    storage("relation-to-presentation-transform", "raw-to-class-presentation",
      computed.relationToPresentation),
    storage("torsion-generator", "torsion-generator", ["-1", "0", "0"]),
    storage("unit-raw-provenance", "exact-unit-raw-provenance", computed.unitProvenance),
    storage("unit-transform", "exact-unit-kernel-transform", computed.unitTransform),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: { classNumber: "27", generatorCount: "3",
      invariantFactors: ["3", "3", "3"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: ["-73393658", "-146523", "0", "1"],
      degree: "3", id: FIELD_ID },
    honesty: { evidenceOwner: null, outcome: "not-required",
      sourcePolicy: "retained-W0-honesty-complete-extra-not-required" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [
      { disposition: "assumed", id: "factor-base-bounds",
        statement: "PARI's factor-base generation and relation bounds are assumed correct" },
      { disposition: "assumed", id: "pari-correspondence",
        statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
      { disposition: "assumed", id: "unit-index-selection",
        statement: "PARI's selected unit lattice is assumed to have index one" },
    ], correspondence: "upstream-assumed-pari-correspondence",
    pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4",
    replaySchema: REPLAY_SCHEMA }, storage: stores,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { coordinatesOwner: "exact-unit-coordinates",
      normsOwner: "exact-unit-norms", tag: "exact_units" }, rank: "1",
    regulatorOwner: "regulator-enclosure", torsionGeneratorOwner: "torsion-generator",
    torsionOrder: "2" },
  };
}

function writeImmutable(outputDirectory, raw) {
  const digest = neutral.sha256Bytes(raw);
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const destination = path.join(outputDirectory,
    `row16-fresh-neutral-result-${digest}.json`);
  try { fs.writeFileSync(destination, raw, { flag: "wx", mode: 0o400 });
    fs.chmodSync(destination, 0o444); }
  catch (error) { if (error.code !== "EEXIST") throw error;
    assert(fs.readFileSync(destination).equals(raw),
      "immutable row-16 result publication conflicts"); }
  return Object.freeze({ path: destination, sha256: digest, bytes: raw.length });
}

async function runFreshPrepared(preparedInput, outputDirectory) {
  assert.equal(typeof outputDirectory, "string"); assert(outputDirectory.length > 0);
  const authority = validatePrepared(preparedInput);
  const computed = privateComputation(structuredClone(preparedInput), authority.sha256);
  const payload = buildPayload(computed);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const payloadSha256 = neutral.sha256Canonical(payload);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    ...computed.authorities, preparedAuthoritySha256: authority.sha256,
    hnfState: computed.hnfState,
  });
  const detached = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
    replaySchema: REPLAY_SCHEMA,
    replay(candidate) {
      assert.equal(neutral.sha256Canonical(candidate), payloadSha256);
      assert.equal(candidate.field.id, FIELD_ID);
      assert.equal(candidate.classGroup.classNumber, "27");
      assert.deepEqual(candidate.classGroup.invariantFactors, ["3", "3", "3"]);
      const owners = Object.fromEntries(candidate.storage.map(owner =>
        [owner.name, owner.entries]));
      assert.deepEqual(owners["relation-matrix"], computed.relations);
      assert.deepEqual(owners["class-presentation"], computed.presentation);
      assert.deepEqual(owners["class-generator-order-witnesses"], computed.classWitness);
      assert.deepEqual(owners["exact-unit-coordinates"], computed.exactUnit);
      assert.deepEqual(owners["exact-unit-inverse"], computed.exactInverse);
      assert.deepEqual(owners["unit-raw-provenance"], computed.unitProvenance);
      return { schema: REPLAY_SCHEMA, payloadSha256, fieldId: FIELD_ID,
        mathematicalAuthoritySha256, correspondence_complete: true,
        public_complete: false };
    },
  });
  const verifiedResult = neutral.verifyClassUnitCorrespondenceResult(raw, detached);
  const publication = writeImmutable(path.resolve(outputDirectory),
    verifiedResult.canonicalJSON());
  assert.equal(publication.sha256, verifiedResult.sha256);
  const receipt = { schema: RECEIPT_SCHEMA, panelIndex: 16, fieldId: FIELD_ID,
    preparedAuthoritySha256: authority.sha256, freshPreparedExecution: true,
    preparedNfLiveRoot: true, correspondenceComplete: true, publicComplete: false,
    retainedRuntimeInputs: false, retainedOwnersRuntimeInputs: false,
    privateSameRunOwners: true, frozenW0RuntimeInput: false,
    runtimeInputs: ["authenticated normalized prepared-nf data"],
    excludedRuntimeInputs: ["factor owner", "relation/HNF owner", "class witness owner",
      "unit owner", "W0"], qualifiedTiming: false, reserveAccess: false,
    mathematicalAuthoritySha256, result: publication,
    classGroup: { classNumber: "27", invariantFactors: ["3", "3", "3"] },
    exactUnitCount: 1, torsionOrder: "2", relationCount: 54,
    status: "pari-2.17.4-correspondence-complete-not-certified" };
  Object.defineProperty(receipt, "verifiedResult", { configurable: false,
    enumerable: false, value: verifiedResult, writable: false });
  deepFreeze(receipt); FRESH_RECEIPTS.add(receipt); return receipt;
}

async function runFreshPreparedRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["outputDirectory", "prepared"]);
  return runFreshPrepared(request.prepared, request.outputDirectory);
}

module.exports = { PREPARED_AUTHORITY_SHA256, RECEIPT_SCHEMA,
  Row16FreshPreparedFailure,
  isAuthenticFreshReceipt(receipt) { return FRESH_RECEIPTS.has(receipt); },
  runFreshPrepared, runFreshPreparedRequest, validatePrepared };
