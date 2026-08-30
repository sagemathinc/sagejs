// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const {
  PROFILE_SOURCE,
  PUBLIC_SOURCE,
  SOURCE_PATHS,
  candidateDispositions,
  cpythonOracle,
  generatedCoefficients,
  handwrittenNumberComplete,
  eligibilityDisposition,
  javascriptOracle,
  measureHandwrittenNumber,
  runSageLevel,
  sageProgram,
} = require("../bench/optimizer-workloads/public-modular-fold.cjs");

test("independent CPython and BigInt oracles pin the authentic corpus", () => {
  for (const [size, expected] of [[2_000, "59460"], [20_000, "37713"]]) {
    assert.equal(javascriptOracle(size, 65_537, 12_345), expected);
    assert.equal(cpythonOracle(size, 65_537, 12_345), expected);
    assert.equal(
      String(handwrittenNumberComplete(
        generatedCoefficients(size, 65_537),
        12_345,
        65_537,
      )),
      expected,
    );
  }
});

test("the handwritten comparison is a complete valid-input Number call", () => {
  // Normalization, negative residues, trailing-zero removal, and point
  // reduction all occur inside this call rather than benchmark setup.
  assert.equal(handwrittenNumberComplete([-7, 4, 0, 0], -3, 17), 15);
  assert.equal(handwrittenNumberComplete([], 9, 17), 0);
  assert.throws(
    () => handwrittenNumberComplete([1], 1, 100_000_000),
    /product is not exact/,
  );
  assert.throws(
    () => handwrittenNumberComplete([Number.MAX_SAFE_INTEGER + 1], 1, 17),
    /coefficient must be an exact safe integer/,
  );
  const measured = measureHandwrittenNumber(
    { size: 100, samples: 3, warmups: 1 },
    65_537,
    12_345,
  );
  assert.equal(measured.answer, javascriptOracle(100, 65_537, 12_345));
  assert.equal(measured.warmSamplesSeconds.length, 3);
  assert.ok(measured.warmSamplesSeconds.every((value) => value >= 0));
});

test("candidate dispositions preserve losing and unavailable targets", () => {
  assert.deepEqual(candidateDispositions(), {
    genericO0: "measured-complete-public-call-semantic-baseline",
    genericO2: "measured-complete-public-call-compiler-control-not-production-eligibility",
    library: "required-production-disposition-for-large-inputs-but-unavailable-as-a-complete-call-here",
    native: "unavailable-no-complete-public-call",
    v8: "measured-complete-handwritten-number-lower-bound-non-production",
    wasm: "unavailable-no-complete-public-call",
  });
  assert.deepEqual(eligibilityDisposition(), {
    campaignRole: "compiler-control-and-target-mismatch-negative-evidence",
    productionEligibility: "ineligible-for-dense-list-production-promotion",
    productionRequirement:
      "large-input-production-operations-must-use-mature-fmpz-mod-poly-algorithms",
    sourceContract: PUBLIC_SOURCE,
  });
  const publicSource = fs.readFileSync(path.join(root, PUBLIC_SOURCE), "utf8");
  assert.match(publicSource, /Production operations should call/);
  assert.match(publicSource, /mature `fmpz_mod_poly` algorithms/);
});

test("the phase program partitions normalization and fold without overlap", () => {
  const source = sageProgram(
    { size: 20, samples: 3, warmups: 1 },
    65_537,
    12_345,
  );
  const syntax = spawnSync("python3", ["-c", "compile(__import__('sys').stdin.read(), '<workload>', 'exec')"], {
    cwd: root,
    encoding: "utf8",
    input: source,
  });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.match(source, /_normalization_started = time\.perf_counter\(\)/);
  assert.match(source, /normalization_seconds = time\.perf_counter\(\) - _normalization_started\n    _fold_started/);
  assert.match(source, /fold_seconds = time\.perf_counter\(\) - _fold_started/);
  assert.match(source, /polynomial_evaluate_mod\(_coefficients, _point, _modulus\)/);
  assert.doesNotMatch(source, /complete_seconds\s*-/);
});

test("the profiler envelope source set names exact public and entry sources", () => {
  assert.deepEqual(SOURCE_PATHS, [PROFILE_SOURCE, PUBLIC_SOURCE]);
  for (const filename of SOURCE_PATHS) {
    assert.equal(path.isAbsolute(filename), false);
    assert.equal(fs.statSync(path.join(root, filename)).isFile(), true);
  }
  const entry = fs.readFileSync(path.join(root, PROFILE_SOURCE), "utf8");
  assert.match(entry, /polynomial_evaluate_mod/);
  assert.match(entry, /EXPECTED = 37_713/);
});

test("O0 and O2 execute the complete public function and exact partition", {
  skip: !fs.existsSync(path.join(root, "dist/tools/cli.js")),
}, () => {
  const settings = { size: 50, samples: 2, warmups: 1, timeout_seconds: 120 };
  const expected = javascriptOracle(settings.size, 65_537, 12_345);
  for (const level of ["O0", "O2"]) {
    const result = runSageLevel(root, settings, 65_537, 12_345, level);
    assert.equal(result.answer, expected);
    assert.equal(result.partitioned_answer, expected);
    assert.equal(result.complete_samples_seconds.length, settings.samples);
    assert.equal(result.normalization_samples_seconds.length, settings.samples);
    assert.equal(result.fold_samples_seconds.length, settings.samples);
  }
});

test("the evaluator process disables only the unrelated hyperelliptic selector", () => {
  let observed;
  assert.throws(
    () => runSageLevel(
      root,
      { size: 2, samples: 1, warmups: 0, timeout_seconds: 1 },
      65_537,
      12_345,
      "O2",
      {
        spawn(_command, _arguments, options) {
          observed = options.env;
          return { status: 1, stdout: "", stderr: "deliberate" };
        },
      },
    ),
    /deliberate/,
  );
  assert.equal(observed.SAGEJS_OPT_LEVEL, "O2");
  assert.equal(observed.SAGEJS_NATIVE_DISABLE, "1");
  assert.equal(observed.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY, "off");
});
