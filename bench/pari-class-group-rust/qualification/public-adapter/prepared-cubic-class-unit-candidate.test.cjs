#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const directory = __dirname;
const qualification = path.dirname(directory);
const schemaV1 = JSON.parse(
  fs.readFileSync(
    path.join(directory, "prepared-cubic-class-unit-candidate.schema.json"),
    "utf8",
  ),
);
const schemaV2 = JSON.parse(
  fs.readFileSync(
    path.join(directory, "prepared-cubic-class-unit-candidate-v2.schema.json"),
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
ajv.addSchema(schemaV1);
const validate = ajv.getSchema(schemaV1.$id);
const validateV2 = ajv.compile(schemaV2);
assert.ok(validate, "version-1 candidate schema was not registered");

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

function expectV2Accepted(label, value) {
  assert.equal(
    validateV2(value),
    true,
    `${label} should be accepted: ${JSON.stringify(validateV2.errors)}`,
  );
}

function expectV2Rejected(label, value) {
  assert.equal(validateV2(value), false, `${label} should be rejected`);
  assert.ok(validateV2.errors?.length, `${label} should report schema errors`);
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

function syntheticPrime(index) {
  const prime = index + 2;
  return {
    factorBaseIndexZeroBased: index,
    prime,
    ramification: 1,
    residueDegree: 1,
    norm: prime,
    generator: [index, 1, 0],
    hnf: [1, 0, index, 0, 1, index, 0, 0, prime],
  };
}

// The retained v1 result cannot be silently reinterpreted as v2: it lacks the
// complete relation rows. This derived fixture tests only the v2 closed shape
// and cross-container indexing rules; real producer output is checked by the
// focused Rust/schema command documented in README.md.
const candidateV2 = clone(currentTrivialShape);
candidateV2.schema = "sagejs.rust-class-group/prepared-cubic-class-unit-v2";
candidateV2.relationLatticeEvidence = {
  schema: "sagejs.rust-class-group/prepared-cubic-relation-lattice-v1",
  factorBaseCatalog: Array.from(
    { length: candidateV2.relations.columns },
    (_unused, index) => syntheticPrime(index),
  ),
  relationRecords: Array.from(
    { length: candidateV2.relations.rows },
    (_unused, index) => ({
      relationIndexZeroBased: index,
      integralBasisCoordinates: [String(index + 1), "0", "0"],
      primeIdealFactors: [
        {
          factorBaseIndexZeroBased: index % candidateV2.relations.columns,
          exponent: 1,
        },
      ],
    }),
  ),
};
candidateV2.classMap.generatorOrderFactorBaseCatalog = clone(
  candidateV2.relationLatticeEvidence.factorBaseCatalog,
);
expectV2Accepted("closed version-2 candidate shape", candidateV2);

const v1WithUnversionedEvidence = clone(retainedResult);
v1WithUnversionedEvidence.relationLatticeEvidence =
  candidateV2.relationLatticeEvidence;
expectRejected("v1 cannot acquire unversioned relation evidence", v1WithUnversionedEvidence);

const partialRelationEvidence = clone(candidateV2);
delete partialRelationEvidence.relationLatticeEvidence.factorBaseCatalog;
expectV2Rejected("partial relation-lattice evidence", partialRelationEvidence);

const counterfeitRelationField = clone(candidateV2);
counterfeitRelationField.relationLatticeEvidence.relationRecords[0].publicComplete =
  true;
expectV2Rejected("relation-level completion assertion", counterfeitRelationField);

function verifyContiguousEvidence(candidate) {
  const evidence = candidate.relationLatticeEvidence;
  assert.equal(evidence.factorBaseCatalog.length, candidate.relations.columns);
  assert.equal(evidence.relationRecords.length, candidate.relations.rows);
  assert.deepEqual(
    evidence.factorBaseCatalog.map((entry) => entry.factorBaseIndexZeroBased),
    Array.from({ length: candidate.relations.columns }, (_unused, index) => index),
  );
  assert.deepEqual(
    evidence.relationRecords.map((entry) => entry.relationIndexZeroBased),
    Array.from({ length: candidate.relations.rows }, (_unused, index) => index),
  );
  assert.deepEqual(
    evidence.factorBaseCatalog,
    candidate.classMap.generatorOrderFactorBaseCatalog,
  );
  for (const relation of evidence.relationRecords) {
    const indices = relation.primeIdealFactors.map(
      (factor) => factor.factorBaseIndexZeroBased,
    );
    assert.deepEqual(indices, [...new Set(indices)].sort((left, right) => left - right));
    assert.ok(indices.every((index) => index < candidate.relations.columns));
  }
}

verifyContiguousEvidence(candidateV2);
const noncontiguousRelations = clone(candidateV2);
noncontiguousRelations.relationLatticeEvidence.relationRecords[1].relationIndexZeroBased =
  3;
assert.throws(() => verifyContiguousEvidence(noncontiguousRelations), assert.AssertionError);

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
