"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { pythonExecutable } = require("../../tools/python-executable.cjs");
const {
  makeRunReceipt,
  parsePrefixedJson,
  profileSettings,
} = require("../../tools/optimizer-development/workloads.cjs");

const PROFILE_SOURCE = "bench/optimizer-workloads/public-modular-fold.py";
const PUBLIC_SOURCE =
  "src/lib/sagejs/polynomial_algorithms/arbitrary_prime_contract.py";
const SOURCE_PATHS = Object.freeze([PROFILE_SOURCE, PUBLIC_SOURCE]);
const PAYLOAD_PREFIX = "PUBLIC_MODULAR_FOLD|";

function canonicalNumberResidue(value, modulus) {
  const answer = value % modulus;
  return answer < 0 ? answer + modulus : answer;
}

function exactNumberIndex(value, label) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an exact safe integer`);
  }
  return value;
}

function checkedNumberModulus(value) {
  const modulus = exactNumberIndex(value, "modulus");
  if (modulus < 2) throw new RangeError("modulus must be at least 2");
  if (modulus * modulus > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Number Horner product is not exact for this modulus");
  }
  return modulus;
}

/**
 * A complete valid-input Number implementation of polynomial_evaluate_mod.
 *
 * This deliberately includes index validation, residue normalization, trailing
 * zero removal, allocation, Horner folding, and result publication. It is a
 * non-production lower bound: it accepts only exact safe JavaScript Numbers
 * and is never selected by the Sage.js compiler or public API.
 */
function handwrittenNumberComplete(coefficients, value, modulus) {
  const prime = checkedNumberModulus(modulus);
  const point = canonicalNumberResidue(exactNumberIndex(value, "value"), prime);
  const residues = [];
  for (const coefficient of coefficients) {
    residues.push(canonicalNumberResidue(
      exactNumberIndex(coefficient, "coefficient"),
      prime,
    ));
  }
  while (residues.length && residues[residues.length - 1] === 0) {
    residues.pop();
  }
  let answer = 0;
  for (let index = residues.length - 1; index >= 0; index -= 1) {
    answer = (answer * point + residues[index]) % prime;
  }
  return answer;
}

function generatedCoefficients(size, modulus) {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new RangeError("coefficient count must be a positive safe integer");
  }
  const prime = checkedNumberModulus(modulus);
  return Array.from({ length: size }, (_unused, index) =>
    canonicalNumberResidue(index * index + 3 * index - 7, prime));
}

function javascriptOracle(size, modulus, point) {
  const prime = BigInt(modulus);
  const value = ((BigInt(point) % prime) + prime) % prime;
  let answer = 0n;
  for (let index = BigInt(size) - 1n; index >= 0n; index -= 1n) {
    const raw = index * index + 3n * index - 7n;
    const coefficient = ((raw % prime) + prime) % prime;
    answer = (answer * value + coefficient) % prime;
  }
  return String(answer);
}

function candidateDispositions() {
  return Object.freeze({
    genericO0: "measured-complete-public-call-semantic-baseline",
    genericO2: "measured-complete-public-call-compiler-control-not-production-eligibility",
    library: "required-production-disposition-for-large-inputs-but-unavailable-as-a-complete-call-here",
    native: "unavailable-no-complete-public-call",
    v8: "measured-complete-handwritten-number-lower-bound-non-production",
    wasm: "unavailable-no-complete-public-call",
  });
}

function eligibilityDisposition() {
  return Object.freeze({
    campaignRole: "compiler-control-and-target-mismatch-negative-evidence",
    productionEligibility: "ineligible-for-dense-list-production-promotion",
    productionRequirement:
      "large-input-production-operations-must-use-mature-fmpz-mod-poly-algorithms",
    sourceContract: PUBLIC_SOURCE,
  });
}

function cpythonOracle(size, modulus, point, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const source = [
    `modulus = ${modulus}`,
    `point = ${point} % modulus`,
    "answer = 0",
    `for index in range(${size} - 1, -1, -1):`,
    "    coefficient = (index * index + 3 * index - 7) % modulus",
    "    answer = (answer * point + coefficient) % modulus",
    "print(answer)",
    "",
  ].join("\n");
  const result = spawn(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: source,
    timeout: options.timeoutMilliseconds ?? 30_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `CPython modular-fold oracle failed: ${result.error?.message || result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function sageProgram(settings, modulus, point) {
  return `import json
import time
_module_started = time.perf_counter()
from sagejs.polynomial_algorithms.arbitrary_prime_contract import (
    _index,
    checked_prime_modulus,
    normalized_residues,
    polynomial_evaluate_mod,
)
_module_seconds = time.perf_counter() - _module_started
_modulus = ${modulus}
_point = ${point}
_coefficients = tuple(
    (index * index + 3 * index - 7) % _modulus
    for index in range(${settings.size})
)

def _partitioned_evaluate(coefficients, value, modulus):
    _normalization_started = time.perf_counter()
    prime = checked_prime_modulus(modulus)
    point = _index(value) % prime
    residues = normalized_residues(coefficients, prime)
    normalization_seconds = time.perf_counter() - _normalization_started
    _fold_started = time.perf_counter()
    answer = 0
    for coefficient in reversed(residues):
        answer = (answer * point + coefficient) % prime
    fold_seconds = time.perf_counter() - _fold_started
    return answer, normalization_seconds, fold_seconds

_cold_started = time.perf_counter()
_answer = polynomial_evaluate_mod(_coefficients, _point, _modulus)
_cold_seconds = time.perf_counter() - _cold_started
for _warmup in range(${settings.warmups}):
    _answer = polynomial_evaluate_mod(_coefficients, _point, _modulus)
_complete_samples = []
for _sample in range(${settings.samples}):
    _started = time.perf_counter()
    _answer = polynomial_evaluate_mod(_coefficients, _point, _modulus)
    _complete_samples.append(time.perf_counter() - _started)

_partitioned_answer, _normalization_cold, _fold_cold = _partitioned_evaluate(
    _coefficients, _point, _modulus
)
_normalization_samples = []
_fold_samples = []
for _sample in range(${settings.samples}):
    _partitioned_answer, _normalization_seconds, _fold_seconds = _partitioned_evaluate(
        _coefficients, _point, _modulus
    )
    _normalization_samples.append(_normalization_seconds)
    _fold_samples.append(_fold_seconds)

assert _answer == _partitioned_answer
print('${PAYLOAD_PREFIX}' + json.dumps({
    'answer': str(_answer),
    'cold_seconds': _cold_seconds,
    'complete_samples_seconds': _complete_samples,
    'fold_cold_seconds': _fold_cold,
    'fold_samples_seconds': _fold_samples,
    'module_seconds': _module_seconds,
    'normalization_cold_seconds': _normalization_cold,
    'normalization_samples_seconds': _normalization_samples,
    'partitioned_answer': str(_partitioned_answer),
}, sort_keys=True, separators=(',', ':')))
`;
}

function runSageLevel(root, settings, modulus, point, level, options = {}) {
  if (!new Set(["O0", "O2"]).has(level)) {
    throw new Error(`unsupported modular-fold optimization level ${level}`);
  }
  const environment = { ...process.env, SAGEJS_OPT_LEVEL: level };
  delete environment.SAGEJS_NATIVE_MODE;
  delete environment.SAGEJS_NATIVE_REQUIRED;
  environment.SAGEJS_NATIVE_DISABLE = "1";
  // This workload does not import or exercise hyperelliptic code. Campaign
  // discovery explicitly disables that unrelated, receipt-gated auto selector;
  // cross-platform promotion must validate its own current receipt separately.
  environment.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";
  const spawn = options.spawn ?? spawnSync;
  const started = process.hrtime.bigint();
  const result = spawn(
    process.execPath,
    [path.join(root, "bin/sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: environment,
      input: sageProgram(settings, modulus, point),
      maxBuffer: 16 * 1024 * 1024,
      timeout: settings.timeout_seconds * 1000,
    },
  );
  const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (result.error || result.status !== 0) {
    throw new Error(
      `public modular fold ${level} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  return {
    level,
    process_seconds: processSeconds,
    ...parsePrefixedJson(result.stdout, PAYLOAD_PREFIX, `public modular fold ${level}`),
  };
}

function measureHandwrittenNumber(settings, modulus, point) {
  const coefficients = generatedCoefficients(settings.size, modulus);
  let started = process.hrtime.bigint();
  let answer = handwrittenNumberComplete(coefficients, point, modulus);
  const coldSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  for (let warmup = 0; warmup < settings.warmups; warmup += 1) {
    answer = handwrittenNumberComplete(coefficients, point, modulus);
  }
  const warmSamplesSeconds = [];
  for (let sample = 0; sample < settings.samples; sample += 1) {
    started = process.hrtime.bigint();
    answer = handwrittenNumberComplete(coefficients, point, modulus);
    warmSamplesSeconds.push(Number(process.hrtime.bigint() - started) / 1e9);
  }
  return { answer: String(answer), coldSeconds, warmSamplesSeconds };
}

function oracleEvidence(workload, contract) {
  return Object.fromEntries(workload.oracles.map((oracle) => [oracle.id, contract]));
}

async function run(context) {
  const { root, catalog, workload, profile, preflight } = context;
  const settings = profileSettings(workload, profile);
  const specification = workload.input.value;
  const modulus = specification.input.modulus;
  const point = specification.input.evaluation_point;
  const javascript = javascriptOracle(settings.size, modulus, point);
  const cpython = cpythonOracle(settings.size, modulus, point, {
    timeoutMilliseconds: settings.timeout_seconds * 1000,
  });
  assert.equal(cpython, javascript);
  if (profile === "standard") assert.equal(javascript, specification.expected);

  // Alternate the semantic baseline and candidate configuration at process
  // granularity. Each process separately reports a complete public call and a
  // disjoint normalization/fold partition of an equivalent execution.
  const o0 = runSageLevel(root, settings, modulus, point, "O0");
  const o2 = runSageLevel(root, settings, modulus, point, "O2");
  const v8LowerBound = measureHandwrittenNumber(settings, modulus, point);
  for (const result of [o0, o2]) {
    assert.equal(result.answer, javascript);
    assert.equal(result.partitioned_answer, javascript);
    assert.equal(result.complete_samples_seconds.length, settings.samples);
    assert.equal(result.normalization_samples_seconds.length, settings.samples);
    assert.equal(result.fold_samples_seconds.length, settings.samples);
  }
  assert.equal(v8LowerBound.answer, javascript);

  return makeRunReceipt({
    root,
    catalog,
    workload,
    preflight,
    configuration: {
      profile,
      size: settings.size,
      samples: settings.samples,
      warmups: settings.warmups,
      modulus,
      point,
      processOrder: ["O0", "O2"],
      phaseAccounting: "normalization-and-fold-are-disjoint-equivalent-execution",
      unrelatedHyperellipticAutoReceiptPolicy: "off-for-non-hyperelliptic-workload",
    },
    compilerOptions: {
      frontendMode: "python",
      optimizationLevels: ["O0", "O2"],
      compilationKind: "runtime-evaluator-differential",
      nativeDisabled: true,
    },
    target: "generic",
    mode: "python",
    output: {
      canonicalResidue: javascript,
      candidateDispositions: candidateDispositions(),
      eligibilityDisposition: eligibilityDisposition(),
      phaseAccounting: {
        completePublicCalls: ["execute-o0", "execute-o2"],
        independentPartition: ["normalize-o0", "fold-o0", "normalize-o2", "fold-o2"],
        overlap: "none-within-each-normalization-fold-pair",
      },
    },
    oracleEvidence: oracleEvidence(workload, specification.oracleContract),
    compilation: [o0.module_seconds, o2.module_seconds],
    compilationUnit: "seconds",
    cold: [o2.cold_seconds],
    warm: o2.complete_samples_seconds,
    executionUnit: "seconds",
    phaseSamples: {
      "execute-o0": {
        cold: o0.cold_seconds,
        warm: o0.complete_samples_seconds,
        unit: "seconds",
      },
      "execute-o2": {
        cold: o2.cold_seconds,
        warm: o2.complete_samples_seconds,
        unit: "seconds",
      },
      "execute-v8-lower-bound": {
        cold: v8LowerBound.coldSeconds,
        warm: v8LowerBound.warmSamplesSeconds,
        unit: "seconds",
      },
      "fold-o0": {
        cold: o0.fold_cold_seconds,
        warm: o0.fold_samples_seconds,
        unit: "seconds",
      },
      "fold-o2": {
        cold: o2.fold_cold_seconds,
        warm: o2.fold_samples_seconds,
        unit: "seconds",
      },
      "module-load-o0": {
        cold: o0.module_seconds,
        warm: [o0.module_seconds],
        unit: "seconds",
      },
      "module-load-o2": {
        cold: o2.module_seconds,
        warm: [o2.module_seconds],
        unit: "seconds",
      },
      "normalize-o0": {
        cold: o0.normalization_cold_seconds,
        warm: o0.normalization_samples_seconds,
        unit: "seconds",
      },
      "normalize-o2": {
        cold: o2.normalization_cold_seconds,
        warm: o2.normalization_samples_seconds,
        unit: "seconds",
      },
      "session-o0": {
        cold: o0.process_seconds,
        warm: [o0.process_seconds],
        unit: "seconds",
      },
      "session-o2": {
        cold: o2.process_seconds,
        warm: [o2.process_seconds],
        unit: "seconds",
      },
    },
    counters: {
      boundaryCrossings: 0,
      copiedBytes: 0,
      materializations: 0,
      allocations: 0,
    },
    resources: { liveBefore: 0, liveAfter: 0, highWater: 0 },
    sourcePaths: SOURCE_PATHS,
  });
}

module.exports = {
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
  oracleEvidence,
  run,
  runSageLevel,
  sageProgram,
};
