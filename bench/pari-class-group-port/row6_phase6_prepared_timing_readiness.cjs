"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");
const transaction = require("./row6_fresh_prepared_transaction_host.cjs");

const PANEL_INDEX = 6;
const FIELD_ID =
  "generated-sha256-55ba15494f03f38bf8f687ff4d2813e81184d71c84dbed9e1adc6af7ba62f0eb";
const PREPARED_AUTHORITY_SHA256 =
  "1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0";
const RESULT_SHA256 =
  "b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73";
const TRANSACTION = path.join(__dirname, "row6_fresh_prepared_transaction_host.cjs");
const GATE_HOST = path.join(__dirname, "row6_prepared_gate_c_host.cjs");
const TERMINAL_HOST = path.join(__dirname, "row6_terminal_transaction_host.cjs");
const sha256File = filename => crypto.createHash("sha256")
  .update(fs.readFileSync(filename)).digest("hex");

function commonProjection(payload) {
  assert.equal(payload.field.id, FIELD_ID);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row6-phase6-common-projection-v1",
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
  const gate = fs.readFileSync(GATE_HOST, "utf8");
  const terminal = fs.readFileSync(TERMINAL_HOST, "utf8");
  assert.match(source, /function runRoot\(/);
  assert.match(source, /spawnSync\("prlimit"/);
  assert.match(source, /runPreparedGateC/);
  assert.match(terminal, /runIsolatedStage\("post1137"/);
  assert.match(terminal, /runIsolatedStage\("units"/);
  assert.match(terminal, /runIsolatedStage\("c7"/);
  assert.match(gate, /compileKernel/);
  assert.doesNotMatch(source, /(?:async )?function prepareResident\(/);
  assert.doesNotMatch(source, /(?:async )?function runResident\(/);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row6-phase6-timing-readiness-v1",
    panelIndex: PANEL_INDEX, fieldId: FIELD_ID,
    preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
    source: Object.freeze({ transactionSha256: sha256File(TRANSACTION),
      gateHostSha256: sha256File(GATE_HOST), terminalHostSha256: sha256File(TERMINAL_HOST) }),
    partialResidentKernel: Object.freeze({ stage: "none with a reusable whole-stage owner",
      available: false, handleCount: 0 }),
    completeResidentPreparedKernel: false,
    sagePreparedKernelTimingAdapter: false,
    pariPreparedKernelTimingAdapter: false,
    commonProjectionImplemented: true,
    exactBlockers: Object.freeze([
      "factor-base and initial-relation roots each execute in bounded child processes",
      "Gate C compiles native stages but does not expose reusable resident handles",
      "post-1137, ancestry, class, units, and C7 are five isolated child-process stages",
      "the correctness transaction writes and reads immutable stage owners and performs detached replay",
    ]),
    forbiddenSurrogate:
      "do not compare runFreshPrepared wall time with prepared PARI bnfinit0(nf,0)",
    nextImplementation:
      "expose resident root/Gate-C handles and port the five terminal stages into one serialization-free graph",
  });
}

function createTimingArm() {
  const error = new Error(
    "row 6 has no complete resident prepared kernel; transaction timing is forbidden");
  error.code = "SAGEJS_PHASE6_NO_RESIDENT_KERNEL";
  error.readiness = inspectResidentBoundary();
  throw error;
}

async function runUntimedFreshCorrectness(prepared) {
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    PREPARED_AUTHORITY_SHA256);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row6-phase6-"));
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
