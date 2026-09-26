"use strict";

// Prepared-only row-4 transaction.  The complete mutable relation graph stays
// inside one Python invocation; only a replayed immutable neutral result and a
// module-local branded receipt are published.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const auth = require("./prepared_nf_authentication.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const { makeFreshInput } = require("./row4_fresh_prepared_input.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/row4-fresh-prepared-receipt-v1";
const REPLAY_SCHEMA = "sagejs.pari-class-group/row4-fresh-prepared-replay-v1";
const PREPARED_AUTHORITY_SHA256 =
  "9421ca79dcf494d3834d7fa1869e037a26804be210b61b2ab28a088aef862ab4";
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

class Row4FreshPreparedFailure extends Error {}

function validatePrepared(prepared) {
  assert(prepared && typeof prepared === "object" && !Array.isArray(prepared));
  assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS);
  const authority = auth.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-4 corridor");
  return authority;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function privateComputation(prepared, preparedAuthoritySha256) {
  const data = makeFreshInput(prepared);
  const program = String.raw`
import collections.abc,dataclasses,decimal,fractions,hashlib,importlib,json,pathlib,sys,typing
sys.set_int_max_str_digits(100000)
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
d=json.load(sys.stdin);v={}
for name,kind in d["names"]:
 c=bool if kind=="bool" else float if kind in ("float","Float64Buffer") else int
 value=d["input"][name];v[name]=list(map(c,value)) if isinstance(value,list) else c(value)
entry=importlib.import_module("bench.pari-class-group-port.resident_generated_class_attempt").pari_resident_generated_class_attempt
if entry(**v) != 0: raise AssertionError("row-4 live candidate did not accept")
m=importlib.import_module("bench.pari-class-group-port.row4_fresh_class_unit_adapter")
s=m.compose_row4_fresh_transaction_state(v,{"preparedAuthoritySha256":d["authority"]})
p=s["presentation"];w=s["classWitness"];u=s["units"];t=s["torsion"]
storage={
 "class-generator-ideal":w["generator"]["idealHnf"],
 "class-order-factor-base-exponents":w["orderRelation"]["factorBaseExponents"],
 "class-order-principal-generators":w["compactPrincipalWitness"]["principalGenerators"],
 "class-order-relation-exponents":w["compactPrincipalWitness"]["relationExponents"],
 "class-order-relation-indices":w["compactPrincipalWitness"]["relationIndices"],
 "class-order-power-hnf":w["exactIdealReplay"]["powerHnf"],
 "class-presentation":p["presentation"]["terminalW"],
 "factor-base-descriptors":p["factorBase"]["descriptors"],
 "factor-base-ideals":p["factorBase"]["ideals"],
 "factor-base-norms":p["factorBase"]["norms"],
 "raw-relations":p["relations"]["matrix"],
 "relation-principal-generators":p["relations"]["principalGenerators"],
 "raw-to-class":p["presentation"]["rawToClassPresentation"],
 "raw-to-kernel":p["presentation"]["rawToKernel"],
 "unit-kernel-transform":u["units"]["unitKernelTransform"],
 "unit-raw-provenance":u["units"]["rawUnitProvenance"],
 "unit-norms":u["units"]["unitNorms"],
 "unit-real-signs":list(map(str,u["units"]["unitRealSigns"])),
 "regulator-enclosure":u["regulator"]["packed"],
 "torsion-generator":t["torsion"]["generator_power_basis"]}
print(json.dumps({"fieldId":s["result"]["field"]["id"],"storage":storage,
 "presentationSha256":s["result"]["authorities"]["presentationSha256"],
 "classWitnessSha256":s["result"]["authorities"]["classWitnessSha256"],
 "unitSha256":s["result"]["authorities"]["unitSha256"],
 "unitArithmeticSha256":u["replay"]["arithmeticSha256"],
 "relationCount":str(v["relation_state"][0]),"baseState":list(map(str,v["prep_base_state"][:6])),
 "classFactorCount":str(w["compactPrincipalWitness"]["factorCount"]),
 "unitFactorCounts":[str(sum(x!="0" for x in u["units"]["rawUnitProvenance"][i*567:(i+1)*567])) for i in range(2)],
 "torsionOrder":t["torsion"]["order"]},separators=(",",":")))
`;
  const run = spawnSync("python3", ["-c", program, ROOT], {
    cwd: ROOT,
    input: JSON.stringify({ ...data, authority: preparedAuthoritySha256 }),
    encoding: "utf8",
    timeout: 1_200_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function storageOwner(name, entries) {
  const values = entries.map(String);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role: name };
}

function buildPayload(computed) {
  assert.equal(computed.fieldId,
    "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9");
  assert.equal(computed.relationCount, "567");
  assert.deepEqual(computed.baseState, ["4033", "4033", "560", "360", "360", "560"]);
  assert.equal(computed.classFactorCount, "397");
  assert.deepEqual(computed.unitFactorCounts, ["2", "397"]);
  assert.equal(computed.torsionOrder, "2");
  const storage = Object.entries(computed.storage)
    .map(([name, entries]) => storageOwner(name, entries))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: { classNumber: "2", generatorCount: "1",
      invariantFactors: ["2"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: ["20000000018", "-20000000010", "0", "1"],
      degree: "3", id: computed.fieldId },
    honesty: { evidenceOwner: null, outcome: "equal-bound-source-skip",
      sourcePolicy: "PARI-2.17.4-row4-C1-equals-C2" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [
      { disposition: "assumed", id: "factor-base-generation",
        statement: "PARI factor-base generation and selection are assumed correct" },
      { disposition: "assumed", id: "grh-and-upstream-bounds",
        statement: "GRH and PARI upstream bounds are assumed correct" },
      { disposition: "assumed", id: "prepared-maximal-order",
        statement: "The authenticated prepared maximal order is assumed correct" },
      { disposition: "assumed", id: "unit-index-selection",
        statement: "PARI selected unit lattice is assumed to have index one" },
    ], correspondence: "upstream-assumed-pari-correspondence",
    pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4",
    replaySchema: REPLAY_SCHEMA }, storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { precisionBits: "192", reason: "LARGE",
      tag: "not_given" }, rank: "2",
    regulatorOwner: "regulator-enclosure",
    torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}

function writeImmutable(outputDirectory, raw) {
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const digest = neutral.sha256Bytes(raw);
  const destination = path.join(outputDirectory,
    `row4-fresh-neutral-result-${digest}.json`);
  try {
    fs.writeFileSync(destination, raw, { flag: "wx", mode: 0o400 });
    fs.chmodSync(destination, 0o444);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert(fs.readFileSync(destination).equals(raw));
  }
  return Object.freeze({ path: destination, sha256: digest, bytes: raw.length });
}

async function runFreshPrepared(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  assert(outputDirectory.length > 0);
  const preparedAuthority = validatePrepared(prepared);
  const computed = privateComputation(structuredClone(prepared), preparedAuthority.sha256);
  const payload = buildPayload(computed);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const payloadSha256 = neutral.sha256Canonical(payload);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    classWitnessSha256: computed.classWitnessSha256,
    presentationSha256: computed.presentationSha256,
    preparedAuthoritySha256: preparedAuthority.sha256,
    unitArithmeticSha256: computed.unitArithmeticSha256,
    unitSha256: computed.unitSha256,
  });
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
    replaySchema: REPLAY_SCHEMA,
    replay(candidate) {
      assert.equal(neutral.sha256Canonical(candidate), payloadSha256);
      assert.equal(candidate.classGroup.classNumber, "2");
      assert.deepEqual(candidate.classGroup.invariantFactors, ["2"]);
      assert.equal(candidate.terminal.correspondence_complete, true);
      assert.equal(candidate.terminal.public_complete, false);
      return { schema: REPLAY_SCHEMA, payloadSha256,
        fieldId: computed.fieldId, mathematicalAuthoritySha256,
        correspondence_complete: true, public_complete: false };
    },
  });
  const verifiedResult = neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  const publication = writeImmutable(path.resolve(outputDirectory),
    verifiedResult.canonicalJSON());
  assert.equal(publication.sha256, verifiedResult.sha256);
  const receipt = {
    schema: SCHEMA,
    preparedAuthoritySha256: preparedAuthority.sha256,
    mathematicalAuthoritySha256,
    freshPreparedExecution: true,
    retainedRuntimeInputs: false,
    retainedOwnersRuntimeInputs: false,
    frozenW0RuntimeInput: false,
    preparedNfLiveRoot: true,
    correspondenceComplete: true,
    publicComplete: false,
    runtimeInputs: ["authenticated normalized prepared-nf data"],
    excludedRuntimeInputs: ["factor owner", "relation/HNF owner", "acceptance owner",
      "presentation owner", "unit owner", "W0"],
    qualifiedTiming: false,
    path: publication.path,
    sha256: publication.sha256,
    result: publication,
    classGroup: { classNumber: "2", invariantFactors: ["2"] },
    relationCount: 567,
    compactUnitCount: 2,
    unitNorms: ["-1", "1"],
    torsionOrder: "2",
    unitMaterialization: "not_given(LARGE)-with-compact-factors",
    status: "pari-2.17.4-correspondence-complete-not-certified",
  };
  Object.defineProperty(receipt, "verifiedResult", {
    configurable: false, enumerable: false, value: verifiedResult, writable: false,
  });
  deepFreeze(receipt);
  RECEIPTS.add(receipt);
  return receipt;
}

function isAuthenticFreshReceipt(receipt) { return RECEIPTS.has(receipt); }

module.exports = { PREPARED_AUTHORITY_SHA256, SCHEMA, isAuthenticFreshReceipt,
  runFreshPrepared, validatePrepared };
