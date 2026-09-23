"use strict";

// A deliberately narrow, prepared-only panel-row-8 sentinel transaction.
// All mutable mathematical owners are born below this entry and die before
// the neutral immutable result is published.  No retained W0 object is read.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const neutral = require("./class_unit_correspondence_result.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const rootHost = require("./check_row14_prepared_initial_root.cjs");
const gate = require("./row8_prepared_gate_c_host.cjs");

const PREPARED_AUTHORITY =
  "f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01";
const FIELD_ID =
  "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const REPLAY_SCHEMA = "sagejs.pari-class-group/row8-fresh-prepared-replay-v1";
const RECEIPTS = new WeakSet();
const AUTHORITIES = new WeakMap();
const FRESH_RECEIPTS = new WeakSet();

class Row8FreshPreparedFailure extends Error {}
const fail = message => { throw new Row8FreshPreparedFailure(message); };

function owner(name, role, entries) {
  const values = entries.map(String);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role };
}

function payload(regulator, replaySchema = REPLAY_SCHEMA) {
  const storage = [
    owner("class-presentation", "class-presentation", []),
    owner("honesty-evidence", "honesty-evidence", [152, 143, 9, 0]),
    owner("regulator-enclosure", "regulator-enclosure", regulator),
    owner("torsion-generator", "torsion-generator", [-1, 0, 0, 0]),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return {
    classGroup: { classNumber: "1", generatorCount: "0", invariantFactors: [],
      presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: ["-20034", "-20018", "0", "0", "1"],
      degree: "4", id: FIELD_ID },
    honesty: { evidenceOwner: "honesty-evidence", outcome: "not-required",
      sourcePolicy: "PARI-2.17.4-buchall-row8-fresh-prepared-sentinel" },
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
    replaySchema }, storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { precisionBits: "192", reason: "PRECI",
      tag: "not_given" }, rank: "2", regulatorOwner: "regulator-enclosure",
    torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}

function pythonTerminal(root, checkpoints) {
  const program = String.raw`
import json,sys,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.row8_fresh_post_hnf').fresh_row8_terminal
x=json.load(sys.stdin)
print(json.dumps(f(x['checkpoints'],x['analytic'],int(x['discriminant']),int(x['roots'])),separators=(',',':')))
`;
  const run = spawnSync("python3", ["-c", program,
    path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], {
    input: JSON.stringify({ checkpoints, analytic: root.analyticPrimeData,
      discriminant: root.field.discriminant, roots: 2 }), encoding: "utf8",
    timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

async function prepareFreshPreparedRow8(preparedEnvelope) {
  if (!preparedEnvelope || typeof preparedEnvelope !== "object" ||
      Array.isArray(preparedEnvelope) ||
      JSON.stringify(Object.keys(preparedEnvelope).sort()) !==
        JSON.stringify(["authoritySha256", "data"]) ||
      preparedEnvelope.authoritySha256 !== PREPARED_AUTHORITY) {
    fail("row-8 input is not the authenticated prepared envelope");
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row8-fresh-"));
  try {
    const computed = await rootHost.computePreparedInitialRoot({
      outputDirectory: temporary, prepared: preparedEnvelope.data,
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
    });
    const root = computed.owner;
    const kernels = await gate.warmPreparedGateC({ prepared: preparedEnvelope, root });
    const live = await gate.runPreparedGateC(preparedEnvelope, root, { kernels });
    const terminal = pythonTerminal(root, live.checkpoints);
    const accepted = terminal.attempts.at(-1);
    if (accepted.status !== 0 || accepted.classNumber !== "1" ||
        JSON.stringify(terminal.attempts.map(x => x.status)) !== "[5,5,0]") {
      fail("fresh row-8 terminal did not accept");
    }
    const mathematicalEvidence = {
      analyticState: terminal.analyticState, inverseHR: terminal.inverseHR,
      relationRecords: live.collectorValues.relation_records.toArray()
        .slice(0, 143 * 152).map(String),
      generators: live.collectorValues.generators.toArray().slice(0, 4 * 152).map(String),
      logs: live.collectorValues.log_embeddings.toArray().slice(0, 21 * 152).map(String),
      terminalC: live.checkpoints.at(-1).c, regulator: accepted.regulator,
      lattice: accepted.relationLattice,
    };
    const mathematicalAuthoritySha256 = neutral.sha256Canonical(mathematicalEvidence);
    const complete = payload(accepted.regulator);
    const raw = neutral.sealClassUnitCorrespondenceResult(complete);
    const payloadSha256 = neutral.sha256Canonical(complete);
    const authority = neutral.createDetachedClassUnitAuthority({
      envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
      replaySchema: REPLAY_SCHEMA,
      replay(candidate) {
        if (neutral.sha256Canonical(candidate) !== payloadSha256 ||
            candidate.classGroup.classNumber !== "1" ||
            JSON.stringify(candidate.storage.find(x => x.name === "regulator-enclosure")
              ?.entries) !== JSON.stringify(accepted.regulator)) {
          fail("fresh row-8 detached replay changed");
        }
        return { schema: REPLAY_SCHEMA, payloadSha256, fieldId: FIELD_ID,
          mathematicalAuthoritySha256, correspondence_complete: true,
          public_complete: false };
      },
    });
    const receipt = Object.freeze({ schema:
      "sagejs.pari-class-group/row8-fresh-prepared-transaction-v1",
    status: "ready", sealedEnvelopeHex: raw.toString("hex"),
    envelopeSha256: neutral.sha256Bytes(raw), mathematicalAuthoritySha256,
    rootState: root.rootState.slice(), acceptanceActions: [5, 5, 0],
    relationCount: 152, classNumber: "1", regulator: accepted.regulator.slice() });
    RECEIPTS.add(receipt); AUTHORITIES.set(receipt, authority);
    return receipt;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function publishFreshPreparedRow8(receipt) {
  if (!RECEIPTS.has(receipt)) fail("row-8 receipt is not same-invocation branded");
  return neutral.verifyClassUnitCorrespondenceResult(
    Buffer.from(receipt.sealedEnvelopeHex, "hex"), AUTHORITIES.get(receipt));
}

function writeImmutable(filename, raw) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try {
    fs.writeFileSync(filename, raw, { flag: "wx", mode: 0o400 });
    fs.chmodSync(filename, 0o444);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert(fs.readFileSync(filename).equals(raw),
      "row-8 immutable neutral result conflicts");
  }
}

async function runFreshPrepared(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY,
    "row-8 prepared input is outside the reviewed corridor");
  const internal = await prepareFreshPreparedRow8({
    authoritySha256: authority.sha256,
    data: structuredClone(prepared),
  });
  const verifiedResult = publishFreshPreparedRow8(internal);
  const raw = verifiedResult.canonicalJSON();
  const resultPath = path.join(outputDirectory,
    `row8-fresh-neutral-result-${verifiedResult.sha256}.json`);
  writeImmutable(resultPath, raw);
  const receipt = {
    schema: "sagejs.pari-class-group/row8-fresh-prepared-receipt-v1",
    result: Object.freeze({ path: resultPath, sha256: verifiedResult.sha256,
      bytes: raw.length,
      mathematicalAuthoritySha256: internal.mathematicalAuthoritySha256 }),
    preparedAuthoritySha256: authority.sha256,
    freshPreparedExecution: true,
    retainedRuntimeInputs: false,
    retainedOwnersRuntimeInputs: false,
    frozenW0RuntimeInput: false,
    correspondenceComplete: true,
    publicComplete: false,
    runtimeInputs: Object.freeze(["authenticated normalized prepared-NF data"]),
    excludedRuntimeInputs: Object.freeze(["factor owner", "relation/HNF owner",
      "acceptance owner", "terminal result", "W0"]),
    acceptanceActions: Object.freeze([...internal.acceptanceActions]),
    relationCount: internal.relationCount,
    classNumber: internal.classNumber,
    regulator: Object.freeze([...internal.regulator]),
  };
  Object.defineProperty(receipt, "verifiedResult", {
    configurable: false, enumerable: false, value: verifiedResult, writable: false,
  });
  Object.freeze(receipt);
  FRESH_RECEIPTS.add(receipt);
  return receipt;
}

async function runFreshPreparedRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["outputDirectory", "prepared"]);
  return runFreshPrepared(request.prepared, request.outputDirectory);
}

function isAuthenticFreshReceipt(receipt) {
  return FRESH_RECEIPTS.has(receipt);
}

module.exports = { PREPARED_AUTHORITY, Row8FreshPreparedFailure,
  isAuthenticFreshReceipt, prepareFreshPreparedRow8, publishFreshPreparedRow8,
  runFreshPrepared, runFreshPreparedRequest };
