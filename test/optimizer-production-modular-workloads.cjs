// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  PAYLOAD_PREFIX,
  WORKLOADS,
  cpythonNormalizationEulerFactors,
  normalizeSettings,
  phaseProgram,
  runUninstrumented,
  validateExactEvidence,
} = require("../bench/optimizer-workloads/production-modular-candidates.cjs");
const {
  pythonExecutable,
} = require("../tools/python-executable.cjs");
const {
  inspectBuildReceipt,
} = require("../scripts/build-receipt.cjs");

const root = path.resolve(__dirname, "..");
const executionRoot = path.resolve(process.env.SAGEJS_BENCH_ROOT || root);
const currentBuild = (() => {
  try {
    return inspectBuildReceipt(executionRoot).current;
  } catch {
    return false;
  }
})();

test("production warm-profile entries are ordinary CPython-parseable sources", () => {
  for (const specification of Object.values(WORKLOADS)) {
    const filename = path.join(root, specification.sourcePath);
    const result = spawnSync(pythonExecutable(), ["-m", "py_compile", filename], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const source = fs.readFileSync(filename, "utf8");
    assert.match(source, /def __profile_prepare__\(\):/);
    assert.match(source, /def __profile_run__\(\):/);
    assert.match(source, /def _production_once\(/);
    assert.match(source, /def _exact_output\(/);
  }
});

test("the phase runner leaves production and exact-oracle timings distinct", () => {
  const settings = normalizeSettings({
    samples: 2,
    warmups: 1,
    degree_32_repetitions: 3,
    timeout_seconds: 30,
  });
  const specification = WORKLOADS["number-field-local-polygons"];
  const source = fs.readFileSync(path.join(root, specification.sourcePath), "utf8");
  const program = phaseProgram(
    source,
    specification.sourcePath,
    "number-field-local-polygons",
    settings,
    root,
    "cpython",
  );
  assert.match(program, /__production_samples\.append/);
  assert.match(program, /__oracle_samples\.append/);
  assert.match(program, /_production_once\(__degree_32_repetitions\)/);
  assert.match(program, /_exact_output\(__payload\)/);
  assert.ok(
    program.indexOf("__production_started") < program.indexOf("__oracle_started"),
  );
  const factorBase = WORKLOADS["number-field-cubic-factor-base"];
  const factorBaseProgram = phaseProgram(
    fs.readFileSync(path.join(root, factorBase.sourcePath), "utf8"),
    factorBase.sourcePath,
    "number-field-cubic-factor-base",
    settings,
    root,
    "sage",
  );
  assert.match(factorBaseProgram, /__cost_gate_samples\.append/);
  assert.match(factorBaseProgram, /_cost_gate_once\(\)/);
});

test("the local-polygon source agrees exactly with its frozen CPython fixtures", () => {
  const settings = {
    samples: 2,
    warmups: 0,
    degree_32_repetitions: 2,
    timeout_seconds: 30,
  };
  const first = runUninstrumented(
    root,
    "number-field-local-polygons",
    settings,
    "cpython",
  );
  const second = runUninstrumented(
    root,
    "number-field-local-polygons",
    { ...settings, samples: 1 },
    "cpython",
  );
  assert.deepEqual(first.output, second.output);
  assert.equal(first.output[0].length, 6);
  assert.deepEqual(first.output[1], ["regular-enlargement", 1, 2, true, 32, 63]);
  assert.equal(first.output[2], 2);
  assert.equal(first.production.warm_samples_seconds.length, 2);
  assert.equal(first.exact_oracle.warm_samples_seconds.length, 2);
  const raw = JSON.parse(
    first.raw_stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith(PAYLOAD_PREFIX))
      .slice(PAYLOAD_PREFIX.length),
  );
  assert.deepEqual(
    first.production.warm_samples_seconds,
    raw.production.warm_samples_seconds,
  );
});

test("independent CPython point counts reproduce the normalization Euler factors", () => {
  assert.deepEqual(
    cpythonNormalizationEulerFactors(),
    WORKLOADS["hyperelliptic-local-reduction"].expectedEulerFactors,
  );
});

test("exact evidence validation makes no optimizer-selection claim", () => {
  const polynomial = validateExactEvidence(
    "public-prime-polynomial-integral",
    { output: WORKLOADS["public-prime-polynomial-integral"].expectedOutput },
  );
  assert.equal(polynomial.oracle, "exact-derivative-replay");
  assert.equal(Object.hasOwn(polynomial, "selectedRoute"), false);
  const expectedFactors = WORKLOADS["hyperelliptic-local-reduction"]
    .expectedEulerFactors;
  const hyperelliptic = validateExactEvidence(
    "hyperelliptic-local-reduction",
    {
      output: expectedFactors.map((factor, index) => [index, factor]),
    },
  );
  assert.equal(hyperelliptic.oracle, "independent-cpython-point-count");
  assert.equal(Object.hasOwn(hyperelliptic, "selectedRoute"), false);

  const factorBaseSpecification = WORKLOADS["number-field-cubic-factor-base"];
  const factorBase = validateExactEvidence(
    "number-field-cubic-factor-base",
    {
      output: factorBaseSpecification.expectedOutput,
      cost_gate: { output: factorBaseSpecification.expectedCostGate },
    },
  );
  assert.equal(
    factorBase.oracle,
    "exact-generic-factor-replay-and-payload-digest",
  );
  assert.deepEqual(factorBase.costGate, [1, 1, 1]);
  assert.equal(Object.hasOwn(factorBase, "selectedRoute"), false);
});

test(
  "Sage.js executes all four authentic production entries with exact output",
  { skip: !currentBuild, timeout: 300_000 },
  () => {
    const settings = {
      samples: 1,
      warmups: 0,
      degree_32_repetitions: 2,
      timeout_seconds: 240,
    };
    const polynomial = runUninstrumented(
      root,
      "public-prime-polynomial-integral",
      settings,
    );
    validateExactEvidence("public-prime-polynomial-integral", polynomial);

    const local = runUninstrumented(
      root,
      "number-field-local-polygons",
      settings,
    );
    const localCPython = runUninstrumented(
      root,
      "number-field-local-polygons",
      settings,
      "cpython",
    );
    validateExactEvidence("number-field-local-polygons", local, localCPython);

    const hyperelliptic = runUninstrumented(
      root,
      "hyperelliptic-local-reduction",
      settings,
    );
    validateExactEvidence("hyperelliptic-local-reduction", hyperelliptic);

    const factorBase = runUninstrumented(
      root,
      "number-field-cubic-factor-base",
      settings,
    );
    validateExactEvidence("number-field-cubic-factor-base", factorBase);
    assert.equal(factorBase.cost_gate.warm_samples_seconds.length, 1);

    for (const payload of [polynomial, local, hyperelliptic, factorBase]) {
      assert.equal(payload.production.warm_samples_seconds.length, 1);
      assert.equal(payload.exact_oracle.warm_samples_seconds.length, 1);
      assert.ok(payload.process_seconds >= payload.production.cold_seconds);
    }
  },
);
