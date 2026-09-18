"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");
const transaction = require("./row11_fresh_prepared_transaction.cjs");

const PANEL_INDEX = 11;
const FIELD_ID =
  "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab";
const PREPARED_AUTHORITY_SHA256 =
  "8402de0c28b648eb190a26fd87283b43239c2eef6d684699dfcc2d50ace3798b";
const RESULT_SHA256 =
  "7a094dd9752d9bf66756eb3b6dd5f434d659f82e490e5de8ea21b1a896a7e412";
const TRANSACTION = path.join(__dirname, "row11_fresh_prepared_transaction.cjs");
const ROOT_HOST = path.join(__dirname, "row11_prepared_initial_host.cjs");
const GATE_HOST = path.join(__dirname, "row11_prepared_gate_c_host.cjs");
const sha256File = filename => crypto.createHash("sha256")
  .update(fs.readFileSync(filename)).digest("hex");

function commonProjection(payload) {
  assert.equal(payload.field.id, FIELD_ID);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row11-phase6-common-projection-v1",
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
  assert.match(source, /python\("terminal"/);
  assert.match(source, /python\("suffix"/);
  assert.match(source, /warmPreparedGateC/);
  assert.match(gate, /residentHandleCount/);
  assert.match(root, /computePreparedInitialRoot/);
  assert.doesNotMatch(source, /(?:async )?function prepareResident\(/);
  assert.doesNotMatch(source, /(?:async )?function runResident\(/);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row11-phase6-timing-readiness-v1",
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
      "analytic acceptance executes row11_fresh_post_hnf in a synchronous Python subprocess",
      "class closure and exact unit reconstruction execute a second synchronous Python subprocess",
      "the correctness transaction allocates, serializes, replays, and publishes owners",
      "only the Gate-C relation/HNF subgraph has authenticated resident native handles",
    ]),
    forbiddenSurrogate:
      "do not compare runFreshPrepared wall time with prepared PARI bnfinit0(nf,0)",
    nextImplementation:
      "port both Python suffixes and compose a serialization-free resident graph through the common projection",
  });
}

function createTimingArm() {
  const error = new Error(
    "row 11 has no complete resident prepared kernel; transaction timing is forbidden");
  error.code = "SAGEJS_PHASE6_NO_RESIDENT_KERNEL";
  error.readiness = inspectResidentBoundary();
  throw error;
}

async function runUntimedFreshCorrectness(prepared) {
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    PREPARED_AUTHORITY_SHA256);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row11-phase6-"));
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
      torsionOrder: "2", flagZeroStatus: "not_given(LARGE)" });
    return Object.freeze({ resultSha256: receipt.verifiedResult.sha256, projection });
  } finally { fs.rmSync(outputDirectory, { recursive: true, force: true }); }
}

module.exports = { FIELD_ID, PANEL_INDEX, PREPARED_AUTHORITY_SHA256, RESULT_SHA256,
  commonProjection, createTimingArm, inspectResidentBoundary,
  runUntimedFreshCorrectness };
