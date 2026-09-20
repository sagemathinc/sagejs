#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const directory = __dirname;
const qualification = path.dirname(directory);
const schema = JSON.parse(
  fs.readFileSync(
    path.join(directory, "prepared-cubic-class-unit-candidate.schema.json"),
    "utf8",
  ),
);
const retainedResult = JSON.parse(
  fs.readFileSync(
    path.join(
      qualification,
      "row6-candidate/results/complex-cubic-minus-23-run.json",
    ),
    "utf8",
  ),
);
const retainedReplay = JSON.parse(
  fs.readFileSync(
    path.join(
      qualification,
      "row6-candidate/results/sagejs-open-cubic-public-boundary-replay.json",
    ),
    "utf8",
  ),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectAccepted(label, value) {
  assert.equal(
    validate(value),
    true,
    `${label} should be accepted: ${JSON.stringify(validate.errors)}`,
  );
}

function expectRejected(label, value) {
  assert.equal(validate(value), false, `${label} should be rejected`);
  assert.ok(validate.errors?.length, `${label} should report schema errors`);
}

// This is a retained producer output, not a minimized hand-written example.
expectAccepted("retained prepared-cubic candidate", retainedResult);

const counterfeitCompletion = clone(retainedResult);
counterfeitCompletion.publicComplete = true;
expectRejected("unknown public completion assertion", counterfeitCompletion);

const counterfeitNestedCompletion = clone(retainedResult);
counterfeitNestedCompletion.analyticCompletion.proofStatus = "proved";
expectRejected("unknown nested proof assertion", counterfeitNestedCompletion);

const failedReplay = clone(retainedResult);
failedReplay.kernel.allReplayExactly = false;
expectRejected("failed exact kernel replay", failedReplay);

const noncanonicalInteger = clone(retainedResult);
noncanonicalInteger.analyticCompletion.candidateClassNumber = "01";
expectRejected("noncanonical class number", noncanonicalInteger);

const partialGeneratorEvidence = clone(retainedResult);
partialGeneratorEvidence.classMap.generatorOrderRelations = [];
expectRejected("partial generator-order evidence", partialGeneratorEvidence);

// The retained bundle predates explicit empty generator-order catalogs. Check
// the current all-or-nothing field cluster too, while preserving its candidate
// status and deriving every pre-existing field from the real retained output.
const currentTrivialShape = clone(retainedResult);
Object.assign(currentTrivialShape.classMap, {
  generatorOrderWitnessStatus: "trivial-group",
  maximumEagerGeneratorWitnessRelations: 4096,
  generatorOrderFactorBaseCatalog: [],
  generatorOrderPrimePowerHnfs: [],
  generatorOrderRelations: [],
});
currentTrivialShape.timingsNanoseconds.generatorOrderRelations = 0;
expectAccepted("current explicit trivial generator-order shape", currentTrivialShape);

function checkedInvariantProduct(factors) {
  return factors.reduce((product, factor) => {
    assert.match(factor, /^[1-9][0-9]*$/);
    return product * BigInt(factor);
  }, 1n);
}

function validateNontrivialGeneratorReplayReceipt(entry) {
  assert.notEqual(entry.classNumber, "1");
  assert.ok(entry.invariantFactors.length > 0);
  assert.equal(
    checkedInvariantProduct(entry.invariantFactors),
    BigInt(entry.classNumber),
  );
  assert.match(entry.generatorOrderWitnessStatus, /^complete(?:-|$)/);
  assert.ok(entry.generatorOrderWitnessFactorCount > 0);
  assert.equal(entry.independentGeneratorOrderVerification, "passed");
  assert.equal(
    entry.independentlyVerifiedGeneratorOrders,
    entry.invariantFactors.length,
  );
}

// This C2 case is a retained receipt from an actual independent Sage.js ideal
// replay of the Rust witness. It gives the qualification suite a nontrivial
// positive and corruption-negative check without treating the summary as a
// substitute for the full producer evidence schema above.
const c2Replay = retainedReplay.cases.find(
  (entry) => entry.id === "small-class-number-2",
);
assert.ok(c2Replay, "retained nontrivial C2 replay receipt is missing");
validateNontrivialGeneratorReplayReceipt(c2Replay);

const counterfeitReplay = clone(c2Replay);
counterfeitReplay.independentlyVerifiedGeneratorOrders = 0;
assert.throws(
  () => validateNontrivialGeneratorReplayReceipt(counterfeitReplay),
  assert.AssertionError,
);

const wrongGeneratorOrder = clone(c2Replay);
wrongGeneratorOrder.invariantFactors = ["4"];
assert.throws(
  () => validateNontrivialGeneratorReplayReceipt(wrongGeneratorOrder),
  assert.AssertionError,
);

console.log("prepared-cubic candidate evidence schema: pass");
