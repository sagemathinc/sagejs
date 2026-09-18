"use strict";

// Genuine prepared-only row-11 class-and-unit transaction.  The public input
// is authenticated normalized prepared-NF data.  Factor-base, relation, HNF,
// acceptance, class-witness, and exact factored-unit owners are all private to
// this invocation and are discarded before neutral publication.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const neutral = require("./class_unit_correspondence_result.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const rootHost = require("./row11_prepared_initial_host.cjs");
const gate = require("./row11_prepared_gate_c_host.cjs");
const transformHost = require("./row11_fresh_transform_host.cjs");
const { buildFreshLiveTrace } = require("./row11_fresh_live_trace.cjs");

const PREPARED_AUTHORITY =
  "8402de0c28b648eb190a26fd87283b43239c2eef6d684699dfcc2d50ace3798b";
const FIELD_ID =
  "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const REPLAY_SCHEMA = "sagejs.pari-class-group/row11-fresh-prepared-replay-v1";
const INTERNAL_RECEIPTS = new WeakSet(), AUTHORITIES = new WeakMap();
const FRESH_RECEIPTS = new WeakSet();

class Row11FreshPreparedFailure extends Error {}
const fail = message => { throw new Row11FreshPreparedFailure(message); };
function owner(name, role, entries) {
  const values = entries.map(String);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role };
}
function python(functionName, input, timeout = 180_000) {
  const program = String.raw`
import hashlib,importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path.extend(sys.argv[1:3])
x=json.load(sys.stdin)
if sys.argv[3]=='terminal':
 m=importlib.import_module('bench.pari-class-group-port.row11_fresh_post_hnf')
 y=m.fresh_row11_terminal(x['checkpoints'],x['analytic'],int(x['discriminant']),2)
else:
 c=importlib.import_module('bench.pari-class-group-port.row11_terminal_class_closure')
 u=importlib.import_module('bench.pari-class-group-port.row11_fresh_rank2_c5_c6')
 a=c.compose_row11_terminal_class_closure(x['trace'],x['transform'],x['ancestry'])
 a_sha=hashlib.sha256(json.dumps(a,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 t_sha=hashlib.sha256(json.dumps(x['trace'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
 y={'classOwner':a,'unitOwner':u.compose_row11_rank2_c5_c6(a,a_sha,x['trace'],t_sha)}
print(json.dumps(y,separators=(',',':')))
`;
  const run = spawnSync("python3", ["-c", program, path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../src/lib"), functionName], {
    input: JSON.stringify(input), encoding: "utf8", timeout,
    maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}
function completePayload(classOwner, unitOwner) {
  const storage = [
    owner("class-presentation", "class-presentation", classOwner.classGroup.presentation),
    owner("class-relation-transform", "class-witness-transform",
      classOwner.relationClosure.transform),
    owner("class-witness-ideals", "class-witness-ideals",
      classOwner.witnesses.flatMap(value => value.idealHnf)),
    owner("compact-unit-provenance", "exact-unit-raw-provenance",
      unitOwner.units.rawUnitProvenance),
    owner("honesty-evidence", "honesty-evidence", [430, 421, 9, 2]),
    owner("regulator-enclosure", "regulator-enclosure",
      unitOwner.regulator.acceptedPacked),
    owner("torsion-generator", "torsion-generator", [-1, 0, 0, 0]),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return {
    classGroup: { classNumber: "4", generatorCount: "2",
      invariantFactors: ["2", "2"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: ["-2000018", "-2000010", "0", "0", "1"],
      degree: "4", id: FIELD_ID },
    honesty: { evidenceOwner: "honesty-evidence", outcome: "not-required",
      sourcePolicy: "PARI-2.17.4-buchall-row11-fresh-prepared" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [
      { disposition: "assumed", id: "factor-base-generation",
        statement: "PARI's factor-base generation and selection are assumed correct" },
      { disposition: "assumed", id: "grh-bounds",
        statement: "GRH and PARI's class-group relation bounds are assumed correct" },
      { disposition: "assumed", id: "pari-correspondence",
        statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
    ], correspondence: "upstream-assumed-pari-correspondence",
    pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4",
    replaySchema: REPLAY_SCHEMA }, storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { precisionBits: "192", reason: "LARGE",
      tag: "not_given" }, rank: "2", regulatorOwner: "regulator-enclosure",
    torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}
async function prepareFreshPreparedRow11(preparedEnvelope) {
  if (!preparedEnvelope || typeof preparedEnvelope !== "object" ||
      Array.isArray(preparedEnvelope) ||
      JSON.stringify(Object.keys(preparedEnvelope).sort()) !==
        JSON.stringify(["authoritySha256", "data"]) ||
      preparedEnvelope.authoritySha256 !== PREPARED_AUTHORITY) {
    fail("row-11 input is not the authenticated prepared envelope");
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row11-fresh-"));
  try {
    const computed = await rootHost.computePreparedInitialRoot({ outputDirectory: temporary,
      prepared: preparedEnvelope.data,
      preparedAuthoritySha256: preparedEnvelope.authoritySha256 });
    const root = computed.owner;
    const kernels = await gate.warmPreparedGateC({ prepared: preparedEnvelope, root });
    const live = await gate.runPreparedGateC(preparedEnvelope, root, { kernels });
    const terminal = python("terminal", { checkpoints: live.checkpoints.slice(1),
      analytic: root.analyticPrimeData, discriminant: root.field.discriminant });
    if (JSON.stringify(terminal.attempts.map(value => value.status)) !== "[5,0]" ||
        terminal.attempts.at(-1).classNumber !== "4") fail("row-11 acceptance changed");
    const trace = buildFreshLiveTrace(preparedEnvelope.data, root, live, terminal);
    const transform = await transformHost.sourceTransform(trace);
    const ancestry = { preparedAuthoritySha256: preparedEnvelope.authoritySha256,
      sameInvocationTraceSha256: neutral.sha256Canonical(trace),
      compactTransformSha256: neutral.sha256Canonical(transform) };
    const suffix = python("suffix", { trace, transform, ancestry }, 600_000);
    const klass = suffix.classOwner, units = suffix.unitOwner;
    if (klass.classGroup.classNumber !== "4" ||
        JSON.stringify(klass.classGroup.invariantFactors) !== '["2","2"]' ||
        klass.replay.all430PrincipalRelationsReplayed !== true ||
        units.completion.exactSuffixComplete !== true ||
        units.sourceLogs.frozenW0UsedAsInput !== false ||
        units.sourceLogs.preparedNfLiveRoot !== true) fail("row-11 exact suffix changed");
    const evidence = { ancestry, rootState: root.rootState,
      acceptanceActions: terminal.attempts.map(value => value.status),
      classOwner: klass, unitOwner: units };
    const mathematicalAuthoritySha256 = neutral.sha256Canonical(evidence);
    const complete = completePayload(klass, units);
    const raw = neutral.sealClassUnitCorrespondenceResult(complete);
    const payloadSha256 = neutral.sha256Canonical(complete);
    const authority = neutral.createDetachedClassUnitAuthority({
      envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
      replaySchema: REPLAY_SCHEMA,
      replay(candidate) {
        if (neutral.sha256Canonical(candidate) !== payloadSha256 ||
            candidate.classGroup.classNumber !== "4" ||
            candidate.storage.find(value => value.name === "compact-unit-provenance")
              ?.entries.length !== 860) fail("row-11 detached replay changed");
        return { schema: REPLAY_SCHEMA, payloadSha256, fieldId: FIELD_ID,
          mathematicalAuthoritySha256, correspondence_complete: true,
          public_complete: false };
      },
    });
    const receipt = Object.freeze({ schema:
      "sagejs.pari-class-group/row11-fresh-prepared-transaction-v1",
    status: "ready", sealedEnvelopeHex: raw.toString("hex"),
    envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
    rootState: root.rootState.slice(), hnfStates: live.checkpoints.map(value =>
      value.state.slice()), acceptanceActions: [5, 0], relationCount: 430,
    classNumber: "4", invariantFactors: ["2", "2"],
    regulator: units.regulator.acceptedPacked.slice(),
    classWitnessFactorCounts: klass.witnesses.map(value =>
      value.compactPrincipalProduct.factorCount),
    unitFactorCounts: units.units.nonzeroRelationFactors.slice(),
    exactRelationsReplayed: klass.replay.principalRelationsReplayed,
    c6Status: units.c6.status, c6Reason: units.c6.reason });
    INTERNAL_RECEIPTS.add(receipt); AUTHORITIES.set(receipt, authority);
    return receipt;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
function publishFreshPreparedRow11(receipt) {
  if (!INTERNAL_RECEIPTS.has(receipt)) fail("row-11 receipt is not same-invocation branded");
  return neutral.verifyClassUnitCorrespondenceResult(
    Buffer.from(receipt.sealedEnvelopeHex, "hex"), AUTHORITIES.get(receipt));
}
function writeImmutable(filename, raw) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try { fs.writeFileSync(filename, raw, { flag: "wx", mode: 0o400 });
    fs.chmodSync(filename, 0o444);
  } catch (error) { if (error.code !== "EEXIST") throw error;
    assert(fs.readFileSync(filename).equals(raw), "row-11 immutable result conflicts"); }
}
async function runFreshPrepared(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY,
    "row-11 prepared input is outside the reviewed corridor");
  const internal = await prepareFreshPreparedRow11({ authoritySha256: authority.sha256,
    data: structuredClone(prepared) });
  const verifiedResult = publishFreshPreparedRow11(internal), raw = verifiedResult.canonicalJSON();
  const resultPath = path.join(outputDirectory,
    `row11-fresh-neutral-result-${verifiedResult.sha256}.json`);
  writeImmutable(resultPath, raw);
  const receipt = { schema: "sagejs.pari-class-group/row11-fresh-prepared-receipt-v1",
    result: Object.freeze({ path: resultPath, sha256: verifiedResult.sha256,
      bytes: raw.length, mathematicalAuthoritySha256:
        internal.mathematicalAuthoritySha256 }),
    preparedAuthoritySha256: authority.sha256, freshPreparedExecution: true,
    retainedRuntimeInputs: false, retainedOwnersRuntimeInputs: false,
    frozenW0RuntimeInput: false, correspondenceComplete: true, publicComplete: false,
    runtimeInputs: Object.freeze(["authenticated normalized prepared-NF data"]),
    excludedRuntimeInputs: Object.freeze(["W0", "factor owner", "relation/HNF owner",
      "acceptance owner", "class/unit answer"]),
    acceptanceActions: Object.freeze([...internal.acceptanceActions]),
    hnfStates: Object.freeze(internal.hnfStates.map(value => Object.freeze([...value]))),
    relationCount: internal.relationCount, classNumber: internal.classNumber,
    invariantFactors: Object.freeze([...internal.invariantFactors]),
    regulator: Object.freeze([...internal.regulator]),
    classWitnessFactorCounts: Object.freeze([...internal.classWitnessFactorCounts]),
    unitFactorCounts: Object.freeze([...internal.unitFactorCounts]),
    exactRelationsReplayed: internal.exactRelationsReplayed,
    c6Status: internal.c6Status, c6Reason: internal.c6Reason };
  Object.defineProperty(receipt, "verifiedResult", { configurable: false,
    enumerable: false, value: verifiedResult, writable: false });
  Object.freeze(receipt); FRESH_RECEIPTS.add(receipt); return receipt;
}
async function runFreshPreparedRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["outputDirectory", "prepared"]);
  return runFreshPrepared(request.prepared, request.outputDirectory);
}
const isAuthenticFreshReceipt = receipt => FRESH_RECEIPTS.has(receipt);
module.exports = { PREPARED_AUTHORITY, Row11FreshPreparedFailure,
  isAuthenticFreshReceipt, prepareFreshPreparedRow11, publishFreshPreparedRow11,
  runFreshPrepared, runFreshPreparedRequest };
