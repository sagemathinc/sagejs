"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");
const transaction = require("./row10_fresh_prepared_transaction.cjs");

const PANEL_INDEX = 10;
const FIELD_ID = "pari-2.17.4:x^4-2000022*x-2000042";
const PREPARED_AUTHORITY_SHA256 =
  "935f8bccaa83cb2a8d127519c5308718199902c41e27aec875ef1fbb959cc403";
const RESULT_SHA256 =
  "6ad503376c2cd6a033b129bbb0b41f734459c526b6a4232c19a14bd35f12d400";
const TRANSACTION = path.join(__dirname, "row10_fresh_prepared_transaction.cjs");
const ROOT_HOST = path.join(__dirname, "row10_prepared_initial_root_host.cjs");
const GATE_HOST = path.join(__dirname, "row10_prepared_gate_c_host.cjs");
const sha256File = filename => crypto.createHash("sha256")
  .update(fs.readFileSync(filename)).digest("hex");

function commonProjection(payload) {
  assert.equal(payload.field.id, FIELD_ID);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row10-phase6-common-projection-v1",
    field: Object.freeze({ id: FIELD_ID,
      polynomialAscending: Object.freeze([...payload.field.definingPolynomialAscending]) }),
    classGroup: Object.freeze({ classNumber: payload.classGroup.classNumber,
      invariantFactors: Object.freeze([...payload.classGroup.invariantFactors]),
      generatorCount: payload.classGroup.generatorCount }),
    unitGroup: Object.freeze({ rank: payload.unitGroup.rank,
      regulatorPresent: Boolean(payload.unitGroup.regulatorOwner),
      torsionOrder: payload.unitGroup.torsionOrder,
      flagZeroStatus: `${payload.unitGroup.materialization.tag}(${payload.unitGroup.materialization.reason})` }),
    completionMode: "flag-zero-class-and-unit-result",
  });
}

function inspectResidentBoundary() {
  const source = fs.readFileSync(TRANSACTION, "utf8");
  const root = fs.readFileSync(ROOT_HOST, "utf8");
  const gate = fs.readFileSync(GATE_HOST, "utf8");
  assert.match(source, /spawnSync\("python3"/);
  assert.match(source, /pythonTerminal\(root, live\.checkpoints\.slice\(1\)\)/);
  assert.match(source, /warmPreparedGateC/);
  assert.match(gate, /residentHandleCount/);
  assert.match(root, /computePreparedInitialRoot/);
  assert.doesNotMatch(source, /(?:async )?function prepareResident\(/);
  assert.doesNotMatch(source, /(?:async )?function runResident\(/);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row10-phase6-timing-readiness-v1",
    panelIndex: PANEL_INDEX, fieldId: FIELD_ID,
    preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
    source: Object.freeze({ transactionSha256: sha256File(TRANSACTION),
      initialRootHostSha256: sha256File(ROOT_HOST), gateHostSha256: sha256File(GATE_HOST) }),
    partialResidentKernel: Object.freeze({ stage: "relation-collection-and-HNF",
      available: true, handleCount: 4 }),
    completeResidentPreparedKernel: false,
    sagePreparedKernelTimingAdapter: false,
    pariPreparedKernelTimingAdapter: false,
    commonProjectionImplemented: true,
    exactBlockers: Object.freeze([
      "the prepared initial-root stage is not joined to a reusable whole-graph resident runner",
      "analytic acceptance executes row10_fresh_post_hnf in a synchronous Python subprocess",
      "the correctness transaction allocates, serializes, replays, and publishes owners",
      "only the Gate-C relation/HNF subgraph has authenticated resident native handles",
    ]),
    forbiddenSurrogate:
      "do not compare runFreshPrepared wall time with prepared PARI bnfinit0(nf,0)",
    nextImplementation:
      "port the row-10 post-HNF suffix and compose a serialization-free resident graph through the common projection",
  });
}

function createTimingArm() {
  const error = new Error(
    "row 10 has no complete resident prepared kernel; transaction timing is forbidden");
  error.code = "SAGEJS_PHASE6_NO_RESIDENT_KERNEL";
  error.readiness = inspectResidentBoundary();
  throw error;
}

async function runUntimedFreshCorrectness(prepared) {
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    PREPARED_AUTHORITY_SHA256);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row10-phase6-"));
  try {
    const receipt = await transaction.runFreshPrepared(prepared, outputDirectory);
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.equal(receipt.correspondenceComplete, true);
    assert.equal(receipt.publicComplete, false);
    assert.equal(receipt.verifiedResult.sha256, RESULT_SHA256);
    const projection = commonProjection(receipt.verifiedResult.detachedPayload());
    assert.deepEqual(projection.classGroup, {
      classNumber: "4", invariantFactors: ["2", "2"], generatorCount: "2" });
    assert.deepEqual(projection.unitGroup, { rank: "2", regulatorPresent: true,
      torsionOrder: "2", flagZeroStatus: "not_given(PRECI)" });
    return Object.freeze({ resultSha256: receipt.verifiedResult.sha256, projection });
  } finally { fs.rmSync(outputDirectory, { recursive: true, force: true }); }
}

module.exports = { FIELD_ID, PANEL_INDEX, PREPARED_AUTHORITY_SHA256, RESULT_SHA256,
  commonProjection, createTimingArm, inspectResidentBoundary,
  runUntimedFreshCorrectness };
