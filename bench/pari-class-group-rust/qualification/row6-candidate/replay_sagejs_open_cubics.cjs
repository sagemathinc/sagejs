#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");
const panelPath = path.join(
  root,
  "bench/pari-class-group-rust/qualification/corpus/initial-open-development-v1.json",
);
const correctionsPath = path.join(
  root,
  "bench/pari-class-group-rust/qualification/corpus/initial-open-development-v1-corrections.json",
);
const sagejs = path.join(root, "bin/sagejs");
const rust = path.join(
  __dirname,
  "target/release/sagejs-row6-rust-candidate-diagnostic",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}\n` +
        `${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function prepareSource(coefficients) {
  return [
    "import json",
    "R.<x> = QQ[]",
    `K.<a> = NumberField(R([${coefficients.join(", ")}]))`,
    "from sagejs.number_fields.rust_class_group_preparation import prepare_cubic_for_rust",
    "print(json.dumps(prepare_cubic_for_rust(K), sort_keys=True))",
    "",
  ].join("\n");
}

const panel = JSON.parse(readFileSync(panelPath, "utf8"));
const corrections = JSON.parse(readFileSync(correctionsPath, "utf8"));
const signatureCorrections = new Map(
  corrections.signatureCorrections.map((entry) => [entry.id, entry]),
);
const cases = panel.cases.filter(({ degree }) => degree === 3);
assert.equal(cases.length, 9);

const scratch = mkdtempSync(path.join(tmpdir(), "sagejs-rust-open-cubics-"));
const receipt = {
  schema: "sagejs.rust-class-group/open-cubic-public-boundary-replay-v1",
  sourcePanel: "qualification/corpus/initial-open-development-v1.json",
  correctionOverlay:
    "qualification/corpus/initial-open-development-v1-corrections.json",
  proofMode: "conditional-grh",
  usesClassGroupAnswersAsRuntimeInput: false,
  timingPolicy: "single-observational-run-not-a-headline-benchmark",
  cases: [],
};

try {
  for (const entry of cases) {
    const inputPath = path.join(scratch, `${entry.id}-input.json`);
    const inputText = run(sagejs, [], {
      input: prepareSource(entry.polynomialAscending),
    });
    const input = JSON.parse(inputText);
    assert.deepEqual(
      input.field.coefficientsAscending,
      entry.polynomialAscending,
    );
    assert.equal(input.containsOracleAnswers, false);
    assert.equal(Object.hasOwn(input, "expected"), false);
    writeFileSync(inputPath, inputText);

    const result = JSON.parse(
      run(rust, [
        "small-norm-unit-kernel-prepared",
        inputPath,
        "2000",
        "5000000",
      ]),
    );
    assert.equal(result.inputId, input.inputId);
    assert.equal(result.usesClassGroupAnswersAsInput, false);
    assert.equal(result.usesOracleAsInput, false);
    assert.equal(
      result.analyticCompletion.candidateClassNumber,
      entry.expected.classNumber,
    );
    assert.deepEqual(
      result.analyticCompletion.candidateInvariantFactors.map(String),
      entry.expected.invariantFactors,
    );
    assert.equal(
      result.analyticCompletion.classUnitIndexEnclosure.uniquePositiveInteger,
      1,
    );

    const computedSignature = [
      input.preparation.signature.realPlaces,
      input.preparation.signature.complexPairs,
    ];
    const signatureCorrection = signatureCorrections.get(entry.id);
    if (signatureCorrection === undefined) {
      assert.deepEqual(computedSignature, entry.signature);
    } else {
      assert.deepEqual(signatureCorrection.originalSignature, entry.signature);
      assert.deepEqual(signatureCorrection.correctedSignature, computedSignature);
    }

    receipt.cases.push({
      id: entry.id,
      inputId: input.inputId,
      declaredSignature: entry.signature,
      computedSignature,
      signatureCorrectionApplied: signatureCorrection !== undefined,
      basisDenominator: input.preparation.basisDenominator,
      indexPrimes: input.preparation.indexPrimes,
      relationShape: [result.relations.rows, result.relations.columns],
      classNumber: result.analyticCompletion.candidateClassNumber,
      invariantFactors:
        result.analyticCompletion.candidateInvariantFactors.map(String),
      classGroup: result.classMap.group,
      classUnitIndex: 1,
      totalExternalNanoseconds: result.timingsNanoseconds.totalExternal,
    });
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
