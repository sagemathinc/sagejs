"use strict";

// One row-21 transaction from authenticated prepared NF data to the verified
// field-neutral result.  Every stage owner is created in this invocation and
// lives only in a private temporary directory which is removed before return.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const factorBase = require("./row21_factor_base_coordinator.cjs");
const relationFrontier = require("./row21_relation_hnf_frontier_coordinator.cjs");
const firstHnf = require("./row21_first_hnf_coordinator.cjs");
const acceptance = require("./row21_acceptance_coordinator.cjs");
const liveUnits = require("./row21_live_unit_coordinator.cjs");
const adapter = require("./row21_terminal_neutral_adapter.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROOT = path.resolve(__dirname, "../..");
const FINAL_SOURCE = path.join(__dirname, "row21_final_result.py");
const PREPARED_AUTHORITY_SHA256 = factorBase.PREPARED_SHA256;
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const REPLAY_SCHEMA =
  "sagejs.pari-class-group/row21-fresh-neutral-publication-replay-v1";
const RECEIPT_SCHEMA =
  "sagejs.pari-class-group/row21-fresh-prepared-receipt-v1";
const FRESH_RECEIPTS = new WeakSet();

function validatePreparedData(prepared) {
  assert(prepared && typeof prepared === "object" && !Array.isArray(prepared));
  assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS,
    "fresh row-21 transaction received an unreviewed prepared-NF field");
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-21 corridor");
  return { authoritySha256: authority.sha256, data: structuredClone(prepared) };
}

function writeImmutable(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try {
    fs.writeFileSync(filename, bytes, { flag: "wx", mode: 0o400 });
    fs.chmodSync(filename, 0o444);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(filename), bytes,
      "content-addressed row-21 result path contains different bytes");
  }
}

function runPython(arguments_, input = undefined) {
  const child = spawnSync("python3", arguments_, {
    cwd: ROOT,
    input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  assert.equal(child.status, 0,
    child.stderr?.toString("utf8") || String(child.error));
  return child.stdout;
}

function buildFinalSource(paths) {
  const program = String.raw`
import importlib.util,sys
spec=importlib.util.spec_from_file_location("row21_final_result",sys.argv[1])
m=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=m
spec.loader.exec_module(m)
payload=m.build_row21_payload(*sys.argv[2:7])
result=m.AtomicRow21Publisher().publish(payload)
sys.stdout.buffer.write(result.canonical_json)
`;
  return runPython(["-c", program, FINAL_SOURCE, paths.prepared, paths.factor,
    paths.firstHnf, paths.acceptance, paths.units]);
}

function replayFinalSource(candidate, sourceSha256, mathematicalAuthoritySha256) {
  const program = String.raw`
import importlib.util,json,sys
spec=importlib.util.spec_from_file_location("row21_final_result",sys.argv[1])
m=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=m
spec.loader.exec_module(m)
raw=sys.stdin.buffer.read()
result=m.cold_replay_row21(raw,m.Row21ReplayAuthority(sys.argv[2]))
p=result.detached_payload()
sys.stdout.write(json.dumps({
 "schema":sys.argv[3],"sourceSha256":result.sha256,
 "sourcePayloadSha256":json.loads(raw)["payloadSha256"],
 "mathematicalAuthoritySha256":sys.argv[4],"fieldId":"5.3.1009349859375.3",
 "classNumber":p["classGroup"]["classNumber"],
 "unitCount":p["units"]["fundamental"]["freeRank"],
 "correspondenceComplete":p["terminal"]["correspondenceComplete"],
 "publicComplete":p["terminal"]["publicComplete"],
},sort_keys=True,separators=(",",":")))
`;
  return JSON.parse(runPython(["-c", program, FINAL_SOURCE, sourceSha256,
    adapter.SOURCE_REPLAY_SCHEMA, mathematicalAuthoritySha256], candidate)
  .toString("utf8"));
}

function publishNeutral(sourceRaw) {
  const sourceSha256 = neutral.sha256Bytes(sourceRaw);
  const sourceEnvelope = JSON.parse(sourceRaw.toString("ascii"));
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    finalReplayImplementation: "row21_final_result.cold_replay_row21",
    neutralAdapter: "row21_terminal_neutral_adapter",
    sourcePayloadSha256: sourceEnvelope.payloadSha256,
    sourceSha256,
  });
  const sourceAuthority = adapter.createDetachedRow21SourceAuthority({
    sourceSha256,
    mathematicalAuthoritySha256,
    replay: candidate => replayFinalSource(candidate, sourceSha256,
      mathematicalAuthoritySha256),
  });
  const prepared = adapter.prepareRow21NeutralResult(sourceRaw, sourceAuthority, {
    publicationReplaySchema: REPLAY_SCHEMA,
  });
  const sealed = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const trustedPayload = JSON.parse(sealed.toString("ascii")).payload;
  const publicationAuthority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: prepared.envelopeSha256,
    mathematicalAuthoritySha256,
    replaySchema: REPLAY_SCHEMA,
    replay(candidate) {
      assert.deepEqual(candidate, trustedPayload,
        "neutral publication payload changed after final-source replay");
      return {
        correspondence_complete: true,
        fieldId: adapter.FIELD_ID,
        mathematicalAuthoritySha256,
        payloadSha256: neutral.sha256Canonical(candidate),
        public_complete: false,
        schema: REPLAY_SCHEMA,
      };
    },
  });
  const verifiedResult = adapter.publishPreparedRow21NeutralResult(
    prepared, publicationAuthority);
  assert(verifiedResult instanceof neutral.ImmutableClassUnitCorrespondenceResult);
  return { mathematicalAuthoritySha256, sourceSha256, verifiedResult };
}

async function runFreshPrepared(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  const preparedEnvelope = validatePreparedData(prepared);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row21-fresh-prepared-"));
  fs.chmodSync(temporary, 0o700);
  try {
    const factor = await factorBase.run({
      outputDirectory: path.join(temporary, "factor"),
      prepared: preparedEnvelope.data,
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
    });
    const relation = await relationFrontier.run({
      factorOwner: factor.owner,
      factorOwnerSha256: factor.ownerSha256,
      outputDirectory: path.join(temporary, "relation"),
    });
    const hnf = await firstHnf.run({
      factorOwner: factor.owner,
      outputDirectory: path.join(temporary, "first-hnf"),
      prepared: preparedEnvelope.data,
      relationOwner: relation.owner,
    });
    const accepted = await acceptance.run({
      firstHnfOwner: hnf.owner,
      outputDirectory: path.join(temporary, "acceptance"),
      prepared: preparedEnvelope.data,
    });
    const units = await liveUnits.run({
      acceptanceOwner: accepted.owner,
      outputDirectory: path.join(temporary, "units"),
      prepared: preparedEnvelope.data,
    });
    const preparedPath = path.join(temporary, "prepared.json");
    fs.writeFileSync(preparedPath,
      Buffer.from(`${JSON.stringify(preparedEnvelope.data)}\n`),
      { flag: "wx", mode: 0o400 });
    const sourceRaw = buildFinalSource({
      prepared: preparedPath,
      factor: factor.path,
      firstHnf: hnf.path,
      acceptance: accepted.path,
      units: units.path,
    });
    const published = publishNeutral(sourceRaw);
    const resultRaw = published.verifiedResult.canonicalJSON();
    const resultSha256 = published.verifiedResult.sha256;
    const resultPath = path.join(outputDirectory,
      `row21-fresh-neutral-result-${resultSha256}.json`);
    writeImmutable(resultPath, resultRaw);
    const receipt = {
      schema: RECEIPT_SCHEMA,
      result: { path: resultPath, sha256: resultSha256, bytes: resultRaw.length,
        mathematicalAuthoritySha256: published.mathematicalAuthoritySha256 },
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
      finalSourceSha256: published.sourceSha256,
      freshPreparedExecution: true,
      retainedRuntimeInputs: false,
      retainedOwnersRuntimeInputs: false,
      frozenW0RuntimeInput: false,
      runtimeInputs: ["authenticated normalized prepared-NF data"],
      excludedRuntimeInputs: ["factor-base owner", "relation-frontier owner",
        "first-HNF owner", "acceptance owner", "unit owner",
        "final buchall_end envelope", "W0"],
      classGroup: { invariantFactors: [], classNumber: "1" },
      unitMaterialization: "exact_units",
      exactUnitCount: 3,
      torsionOrder: "2",
      correspondenceComplete: true,
      publicComplete: false,
    };
    Object.defineProperty(receipt, "verifiedResult", {
      configurable: false,
      enumerable: false,
      value: published.verifiedResult,
      writable: false,
    });
    FRESH_RECEIPTS.add(receipt);
    return receipt;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

async function runFreshPreparedRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["outputDirectory", "prepared"]);
  return runFreshPrepared(request.prepared, request.outputDirectory);
}

function isAuthenticFreshReceipt(receipt) {
  return FRESH_RECEIPTS.has(receipt);
}

module.exports = {
  PREPARED_AUTHORITY_SHA256,
  RECEIPT_SCHEMA,
  isAuthenticFreshReceipt,
  runFreshPrepared,
  runFreshPreparedRequest,
  validatePreparedData,
};
