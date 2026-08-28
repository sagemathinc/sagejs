#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { pythonExecutable } = require("../../tools/python-executable.cjs");
const {
  requireCurrentBuild,
} = require("../../tools/optimizer-development/workloads.cjs");

const SCHEMA = "sagejs.campaign1-modular-scan-target-feasibility/v1";
const ADAPTER_SCHEMA =
  "sagejs.campaign1-reviewed-phase-opportunity-adapter/v1";
const PRIMARY_PRIMES = Object.freeze([5_003, 10_009, 20_011]);
const CROSSOVER_PRIMES = Object.freeze([46_301, 46_349]);
const SOURCE_VALUES = Object.freeze([1, 0, 0, 1]);
const STANDARD_SAMPLES = 11;
const STANDARD_WARMUPS = 3;
const FAST_INTEGER_MAX_PRIME = 46_340;
const EXACT_NUMBER_MAX_PRIME = 94_906_266;
const EXACT_NUMBER_MAX_ELIGIBLE_PRIME = 94_906_249;
const ABBA = Object.freeze(["AB", "BA", "BA", "AB"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentId(value) {
  return `sha256:${sha256(canonicalJson(value))}`;
}

function median(values) {
  assert.ok(values.length > 0, "median requires at least one value");
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function distribution(values) {
  return {
    unit: "nanoseconds",
    samples: values,
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values),
  };
}

function expectedOrder(index) {
  return ABBA[index % ABBA.length];
}

function exactInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    !Object.is(value, -0);
}

function exactNumberProductGuard(prime) {
  return exactInteger(prime) && prime >= 3 &&
    prime * (prime - 1) <= Number.MAX_SAFE_INTEGER;
}

function fastIntegerPerformanceGuard(prime) {
  return exactInteger(prime) && prime >= 3 &&
    prime * (prime - 1) <= 0x7fff_ffff;
}

function validateDenseCubicInput(
  values,
  prime,
  { primeAuthenticated = false, wasm = false } = {},
) {
  if (!primeAuthenticated) {
    return { ok: false, reason: "prime-contract-not-authenticated" };
  }
  if (!exactInteger(prime) || prime < 3 || prime % 2 === 0) {
    return { ok: false, reason: "prime-not-positive-odd-exact-integer" };
  }
  if (!exactNumberProductGuard(prime)) {
    return { ok: false, reason: "number-product-exactness-bound-exceeded" };
  }
  if (wasm && prime > 0x7fff_ffff) {
    return { ok: false, reason: "wasm-signed-character-sum-bound-exceeded" };
  }
  if (!Array.isArray(values) ||
      Object.getPrototypeOf(values) !== Array.prototype) {
    return { ok: false, reason: "coefficient-storage-not-ordinary-array" };
  }
  if (values.length !== 4) {
    return { ok: false, reason: "coefficient-length-not-four" };
  }
  const canonical = [];
  for (let index = 0; index < 4; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(values, index);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      return { ok: false, reason: "coefficient-not-dense-own-data" };
    }
    if (!exactInteger(descriptor.value)) {
      return { ok: false, reason: "coefficient-not-exact-safe-integer" };
    }
    let coefficient = descriptor.value % prime;
    if (coefficient < 0) coefficient += prime;
    canonical.push(coefficient);
  }
  if (canonical[3] === 0) {
    return { ok: false, reason: "degree-three-leading-residue-zero" };
  }
  return { ok: true, canonical };
}

function powModNumber(value, exponent, modulus) {
  let answer = 1;
  let power = value % modulus;
  while (exponent !== 0) {
    if (exponent % 2 === 1) answer = answer * power % modulus;
    exponent = Math.floor(exponent / 2);
    if (exponent !== 0) power = power * power % modulus;
  }
  return answer;
}

function checkedV8NormalizationFactor(
  values,
  prime,
  {
    primeAuthenticated = false,
    checkInterrupt = () => {},
    fallback = (_input, _modulus, reason) => {
      throw new Error(`bounded modular V8 guard rejected: ${reason}`);
    },
  } = {},
) {
  const guard = validateDenseCubicInput(values, prime, {
    primeAuthenticated,
    wasm: false,
  });
  if (!guard.ok) return fallback(values, prime, guard.reason);
  const [c0, c1, c2, c3] = guard.canonical;
  const exponent = (prime - 1) / 2;
  let characterSum = 0;
  for (let xValue = 0; xValue < prime; xValue += 1) {
    if ((xValue + 1) % 256 === 0) checkInterrupt();
    let evaluation = c3;
    evaluation = (evaluation * xValue + c2) % prime;
    evaluation = (evaluation * xValue + c1) % prime;
    evaluation = (evaluation * xValue + c0) % prime;
    if (evaluation === 0) continue;
    characterSum +=
      powModNumber(evaluation, exponent, prime) === 1 ? 1 : -1;
  }
  return [1, characterSum, prime];
}

function checkedWasmNormalizationFactor(
  target,
  values,
  prime,
  {
    primeAuthenticated = false,
    fallback = (_input, _modulus, reason) => {
      throw new Error(`bounded modular Wasm guard rejected: ${reason}`);
    },
  } = {},
) {
  const guard = validateDenseCubicInput(values, prime, {
    primeAuthenticated,
    wasm: true,
  });
  if (!guard.ok) return fallback(values, prime, guard.reason);
  const resident = new Uint32Array(
    target.instance.exports.memory.buffer,
    target.heapBase,
    guard.canonical.length,
  );
  resident.set(guard.canonical);
  const middle = target.instance.exports.bounded_modular_character_sum_u32(
    target.heapBase,
    guard.canonical.length,
    prime,
  );
  return [1, middle, prime];
}

function timeOperation(operation) {
  const started = process.hrtime.bigint();
  const output = operation();
  const nanoseconds = Number(process.hrtime.bigint() - started);
  return { nanoseconds, output };
}

function compilerInvocation(source, output, clang) {
  return [
    clang,
    "--target=wasm32",
    "-O3",
    "-DNDEBUG",
    "-nostdlib",
    "-Wl,--no-entry",
    "-Wl,--export-memory",
    "-Wl,--export=__heap_base",
    "-Wl,--initial-memory=131072",
    "-Wl,--max-memory=16777216",
    "-Wl,--allow-undefined",
    source,
    "-o",
    output,
  ];
}

function unavailableTarget(reason, detail, provenance) {
  return {
    availability: "unavailable",
    reason,
    detail,
    provenance,
  };
}

function compileWasmTarget({
  sourcePath,
  sourceRepositoryPath = null,
  clang = process.env.CLANG || "clang",
  producerSamples = STANDARD_SAMPLES,
  compileSamples = STANDARD_SAMPLES,
  instantiateSamples = STANDARD_SAMPLES,
  interrupt = () => {},
} = {}) {
  const provenance = {
    kind: "checked-in-c-to-wasm-feasibility-source",
    sourcePath: sourceRepositoryPath ?? sourcePath,
    sourceBytes: statSync(sourcePath).size,
    sourceSha256: sha256(readFileSync(sourcePath)),
    producer: "clang-and-wasm-ld",
    commandTemplate: compilerInvocation("$SOURCE", "$OUTPUT", clang),
    productionRouteClaim: "none-feasibility-only",
  };
  if (typeof WebAssembly !== "object") {
    return unavailableTarget(
      "webassembly-runtime-unavailable",
      "global WebAssembly is not available",
      provenance,
    );
  }
  const temporary = mkdtempSync(path.join(os.tmpdir(), "sagejs-modular-scan-wasm-"));
  const wasmPath = path.join(temporary, "modular-scan-target.wasm");
  const producerNanoseconds = [];
  try {
    for (let sample = 0; sample < producerSamples; sample += 1) {
      const command = compilerInvocation(sourcePath, wasmPath, clang);
      const started = process.hrtime.bigint();
      const result = spawnSync(command[0], command.slice(1), {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      producerNanoseconds.push(Number(process.hrtime.bigint() - started));
      if (result.error?.code === "ENOENT") {
        return unavailableTarget(
          "clang-not-found",
          result.error.message,
          { ...provenance, producerNanoseconds },
        );
      }
      if (result.error || result.status !== 0) {
        return unavailableTarget(
          "c-to-wasm-compilation-failed",
          String(result.error?.message || result.stderr || result.stdout)
            .trim().slice(0, 4_096),
          { ...provenance, producerNanoseconds },
        );
      }
    }
    const version = spawnSync(clang, ["--version"], { encoding: "utf8" });
    const bytes = readFileSync(wasmPath);
    const moduleCompileNanoseconds = [];
    let moduleObject;
    try {
      for (let sample = 0; sample < compileSamples; sample += 1) {
        const started = process.hrtime.bigint();
        moduleObject = new WebAssembly.Module(bytes);
        moduleCompileNanoseconds.push(Number(process.hrtime.bigint() - started));
      }
    } catch (error) {
      return unavailableTarget(
        "wasm-module-compilation-failed",
        String(error?.message || error).slice(0, 4_096),
        {
          ...provenance,
          producerNanoseconds,
          moduleCompileNanoseconds,
          artifactSha256: sha256(bytes),
        },
      );
    }
    const moduleInstantiateNanoseconds = [];
    let instance;
    try {
      for (let sample = 0; sample < instantiateSamples; sample += 1) {
        const started = process.hrtime.bigint();
        instance = new WebAssembly.Instance(moduleObject, {
          sagejs: { check_interrupt: interrupt },
        });
        moduleInstantiateNanoseconds.push(
          Number(process.hrtime.bigint() - started),
        );
      }
    } catch (error) {
      return unavailableTarget(
        "wasm-module-instantiation-failed",
        String(error?.message || error).slice(0, 4_096),
        {
          ...provenance,
          producerNanoseconds,
          moduleCompileNanoseconds,
          moduleInstantiateNanoseconds,
          artifactSha256: sha256(bytes),
        },
      );
    }
    if (typeof instance.exports.bounded_modular_character_sum_u32 !== "function" ||
        !(instance.exports.memory instanceof WebAssembly.Memory) ||
        !instance.exports.__heap_base ||
        !Number.isSafeInteger(Number(instance.exports.__heap_base.value))) {
      return unavailableTarget(
        "wasm-artifact-contract-mismatch",
        "expected function, memory, and integer __heap_base exports are absent",
        {
          ...provenance,
          producerNanoseconds,
          moduleCompileNanoseconds,
          moduleInstantiateNanoseconds,
          artifactSha256: sha256(bytes),
        },
      );
    }
    const heapBase = Number(instance.exports.__heap_base.value);
    if (heapBase < 0 || heapBase % Uint32Array.BYTES_PER_ELEMENT !== 0 ||
        heapBase + SOURCE_VALUES.length * Uint32Array.BYTES_PER_ELEMENT >
          instance.exports.memory.buffer.byteLength) {
      return unavailableTarget(
        "wasm-linear-memory-contract-mismatch",
        `invalid heap base ${heapBase}`,
        {
          ...provenance,
          producerNanoseconds,
          moduleCompileNanoseconds,
          moduleInstantiateNanoseconds,
          artifactSha256: sha256(bytes),
        },
      );
    }
    return {
      availability: "available",
      reason: null,
      provenance: {
        ...provenance,
        clangVersion: version.status === 0
          ? version.stdout.split(/\r?\n/, 1)[0]
          : null,
      },
      artifact: {
        bytes: bytes.length,
        sha256: sha256(bytes),
        declaredInitialLinearMemoryBytes:
          instance.exports.memory.buffer.byteLength,
      },
      accounting: {
        sourceToWasm: distribution(producerNanoseconds),
        moduleCompile: distribution(moduleCompileNanoseconds),
        moduleInstantiate: distribution(moduleInstantiateNanoseconds),
      },
      moduleObject,
      instance,
      heapBase,
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function independentCpythonOracle(primes) {
  const program = String.raw`
import json

primes = ${JSON.stringify(primes)}
normalization = []
public_factors = []
for prime in primes:
    points = 1
    for x_value in range(prime):
        value = (x_value * x_value * x_value + 1) % prime
        if value == 0:
            points += 1
        elif pow(value, (prime - 1) // 2, prime) == 1:
            points += 2
    trace = prime + 1 - points
    normalization.append([1, -trace, prime])
    public_factors.append([1, -(trace + 1), prime + trace, -prime])
print(json.dumps({"normalization": normalization, "public_factors": public_factors}, sort_keys=True, separators=(",", ":")))
`;
  const executable = pythonExecutable();
  const result = spawnSync(executable, ["-"], {
    encoding: "utf8",
    input: program,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `independent CPython point-count oracle failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  return {
    executable,
    method: "direct finite-field point count of y^2=x^3+1",
    ...JSON.parse(result.stdout),
  };
}

async function createCurrentGenericRunner(root, warmups) {
  const distPath = path.join(root, "dist/tools/kernel-evaluator.js");
  if (!statOrNull(distPath)) {
    throw new Error(
      "current generic target is unavailable: run `pnpm build` before the feasibility harness",
    );
  }
  const previousLevel = process.env.SAGEJS_OPT_LEVEL;
  const previousHyperellipticPolicy =
    process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY;
  process.env.SAGEJS_OPT_LEVEL = "O2";
  // This feasibility harness times the exact source phase directly. The
  // public automatic-receipt selector is a different, complete-public-call
  // policy and is intentionally outside this reviewed phase boundary.
  process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";
  const { createKernelEvaluatorAsync } = require(distPath);
  const evaluator = await createKernelEvaluatorAsync({
    mode: "python",
    onOutput() {},
  });
  const source = String.raw`
from sagejs.hyperelliptic_curves.bad_reduction import _normalization_factor

_campaign1_values = [1, 0, 0, 1]
_campaign1_primes = [5003, 10009, 20011]

def __campaign1_normalization_phase():
    return [
        _normalization_factor(_campaign1_values, prime)
        for prime in _campaign1_primes
    ]

def __campaign1_normalization_one(prime):
    return _normalization_factor(_campaign1_values, prime)
`;
  try {
    evaluator.evaluate(source, {
      filename: "bench/optimizer-workloads/modular-scan-current-generic.py",
      language: "python",
      suppressResult: true,
    });
    for (let index = 0; index < warmups; index += 1) {
      evaluator.evaluate("__campaign1_normalization_phase()", {
        language: "python",
        suppressResult: true,
      });
    }
  } catch (error) {
    evaluator.close();
    if (previousLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previousLevel;
    if (previousHyperellipticPolicy === undefined) {
      delete process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY;
    } else {
      process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY =
        previousHyperellipticPolicy;
    }
    throw error;
  }

  function evaluate(expression) {
    const result = evaluator.evaluate(expression, { language: "python" });
    return {
      nanoseconds: Math.max(1, Math.round(result.durationMs * 1_000_000)),
      output: JSON.parse(result.repr),
    };
  }

  return {
    phase() {
      return evaluate("__campaign1_normalization_phase()");
    },
    one(prime) {
      assert.ok(PRIMARY_PRIMES.includes(prime) || CROSSOVER_PRIMES.includes(prime));
      return evaluate(`__campaign1_normalization_one(${prime})`);
    },
    close() {
      evaluator.close();
      if (previousLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
      else process.env.SAGEJS_OPT_LEVEL = previousLevel;
      if (previousHyperellipticPolicy === undefined) {
        delete process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY;
      } else {
        process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY =
          previousHyperellipticPolicy;
      }
    },
    accounting: {
      implementation: "actual-current-compiled-source-function",
      optimizationLevel: "O2",
      measuredBoundary:
        "direct prepared function call plus transient generated call-shell JS parse/execute; Python lowering, import, warmup, and result repr are excluded",
      inputState: "one prepared ordinary list [1,0,0,1] and fixed prime vector",
      outputPublication: "fresh Python list returned by _normalization_factor",
      compilerRouteClaim: "none",
      publicAutoReceiptPolicy: "off-reviewed-phase-does-not-select-public-route",
    },
  };
}

function statOrNull(filename) {
  try {
    return statSync(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function phaseTarget(operation) {
  return timeOperation(() => PRIMARY_PRIMES.map((prime) => operation(prime)));
}

function assertExactOutput(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} exact output mismatch`);
}

function buildPairedComparison({
  target,
  samples,
  generic,
  feasible,
  expected,
  publicOutputDigest,
  phaseOutputDigest,
}) {
  const rawPairs = [];
  const adapterPairs = [];
  for (let index = 0; index < samples; index += 1) {
    const order = expectedOrder(index);
    let baseline;
    let candidate;
    if (order === "AB") {
      baseline = generic();
      candidate = feasible();
    } else {
      candidate = feasible();
      baseline = generic();
    }
    assertExactOutput(baseline.output, expected, `${target} generic pair ${index}`);
    assertExactOutput(candidate.output, expected, `${target} candidate pair ${index}`);
    const pair = {
      index,
      order,
      baselineNanoseconds: baseline.nanoseconds,
      feasibleNanoseconds: candidate.nanoseconds,
      baselinePhaseOutputDigest: phaseOutputDigest,
      feasiblePhaseOutputDigest: phaseOutputDigest,
      baselinePublicOutputDigest: publicOutputDigest,
      feasiblePublicOutputDigest: publicOutputDigest,
    };
    rawPairs.push(pair);
    adapterPairs.push({
      order,
      baselineMicroseconds: Math.max(1, Math.round(baseline.nanoseconds / 1_000)),
      feasibleLowerBoundMicroseconds:
        Math.max(1, Math.round(candidate.nanoseconds / 1_000)),
      baselineOutputDigest: publicOutputDigest,
      feasibleOutputDigest: publicOutputDigest,
    });
  }
  const baseline = rawPairs.map((pair) => pair.baselineNanoseconds);
  const feasibleSamples = rawPairs.map((pair) => pair.feasibleNanoseconds);
  return {
    status: "measured",
    measurementScope: "reviewed-phase",
    target,
    rawPairs,
    baseline: distribution(baseline),
    feasible: distribution(feasibleSamples),
    medianRatioBaselineOverFeasible:
      median(baseline) / median(feasibleSamples),
    opportunityEvidencePairs: adapterPairs,
  };
}

function runGuardAudit(wasmTarget) {
  const cases = [
    ["prime-contract", SOURCE_VALUES, 5_003, false],
    ["even-prime", SOURCE_VALUES, 5_004, true],
    ["short-vector", [1, 0, 1], 5_003, true],
    ["late-bigint", [1, 0, 0, 1n], 5_003, true],
    ["negative-zero", [1, 0, 0, -0], 5_003, true],
    ["zero-leading-residue", [1, 0, 0, 5_003], 5_003, true],
  ];
  const sparse = [1, 0, 0, 1];
  delete sparse[2];
  cases.push(["sparse-vector", sparse, 5_003, true]);
  const v8 = cases.map(([id, values, prime, primeAuthenticated]) => {
    let calls = 0;
    let reason = null;
    const sentinel = Object.freeze({ id });
    const result = checkedV8NormalizationFactor(values, prime, {
      primeAuthenticated,
      fallback(_values, _prime, rejected) {
        calls += 1;
        reason = rejected;
        return sentinel;
      },
    });
    assert.equal(result, sentinel);
    assert.equal(calls, 1);
    return { id, fallbackCalls: calls, rejectionReason: reason, publications: 0 };
  });
  const wasm = cases.map(([id, values, prime, primeAuthenticated]) => {
    let calls = 0;
    let reason = null;
    const sentinel = Object.freeze({ id });
    const result = checkedWasmNormalizationFactor(
      wasmTarget,
      values,
      prime,
      {
        primeAuthenticated,
        fallback(_values, _prime, rejected) {
          calls += 1;
          reason = rejected;
          return sentinel;
        },
      },
    );
    assert.equal(result, sentinel);
    assert.equal(calls, 1);
    return { id, fallbackCalls: calls, rejectionReason: reason, publications: 0 };
  });

  let v8InterruptCalls = 0;
  assert.throws(() => checkedV8NormalizationFactor(SOURCE_VALUES, 5_003, {
    primeAuthenticated: true,
    checkInterrupt() {
      v8InterruptCalls += 1;
      throw new Error("campaign1 interrupt sentinel");
    },
  }), /interrupt sentinel/);

  let wasmInterrupt = null;
  if (wasmTarget.availability === "available") {
    let calls = 0;
    const moduleObject = wasmTarget.moduleObject;
    const instance = new WebAssembly.Instance(moduleObject, {
      sagejs: {
        check_interrupt() {
          calls += 1;
          throw new Error("campaign1 wasm interrupt sentinel");
        },
      },
    });
    const target = {
      instance,
      heapBase: Number(instance.exports.__heap_base.value),
    };
    assert.throws(() => checkedWasmNormalizationFactor(
      target,
      SOURCE_VALUES,
      5_003,
      { primeAuthenticated: true },
    ), /wasm interrupt sentinel/);
    wasmInterrupt = {
      status: "pass",
      interruptCalls: calls,
      inputCopiedBytesBeforeInterrupt: 16,
      publications: 0,
    };
  } else {
    wasmInterrupt = {
      status: "unavailable",
      reason: wasmTarget.reason,
      interruptCalls: 0,
      inputCopiedBytesBeforeInterrupt: 0,
      publications: 0,
    };
  }
  return {
    invalidV8Cases: v8,
    invalidWasmCases: wasm,
    v8Interrupt: {
      status: "pass",
      interruptCalls: v8InterruptCalls,
      publications: 0,
    },
    wasmInterrupt,
  };
}

function sourceProvenance(root) {
  const mathematicalPath =
    "src/lib/sagejs/hyperelliptic_curves/bad_reduction.py";
  const filename = path.join(root, mathematicalPath);
  const bytes = readFileSync(filename);
  const text = bytes.toString("utf8");
  const start = text.indexOf("def _normalization_factor(");
  const end = text.indexOf("\ndef _semistable_data(", start);
  if (start < 0 || end < 0) {
    throw new Error("cannot locate the exact _normalization_factor source slice");
  }
  const excerpt = text.slice(start, end + 1);
  const startLine = text.slice(0, start).split("\n").length;
  const endLine = startLine + excerpt.split("\n").length - 2;
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const commit = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (commit.status !== 0 || status.status !== 0) {
    throw new Error("cannot authenticate repository source identity");
  }
  return {
    path: mathematicalPath,
    fileBytes: bytes.length,
    fileSha256: sha256(bytes),
    function: "_normalization_factor",
    functionRange: { startLine, endLine },
    functionExcerptSha256: sha256(excerpt),
    repositoryCommit: commit.stdout.trim(),
    worktreeDirty: status.stdout.trim() !== "",
  };
}

function workloadProvenance(root) {
  const catalogPath = "architecture/optimizer-workloads.json";
  const bytes = readFileSync(path.join(root, catalogPath));
  const catalog = JSON.parse(bytes);
  const matches = catalog.workloads.filter(
    (workload) => workload.runner?.argv?.[0] === "hyperelliptic-local-reduction",
  );
  if (matches.length !== 1) {
    throw new Error("expected one hyperelliptic local-reduction workload");
  }
  const workload = matches[0];
  const expectedDigest = workload.oracles.find(
    (oracle) => oracle.id === "independent-cpython-point-count",
  )?.expectedDigest;
  if (!/^[0-9a-f]{64}$/.test(expectedDigest || "")) {
    throw new Error("public workload oracle digest is missing");
  }
  return {
    catalogPath,
    catalogId: catalog.id,
    catalogSha256: sha256(bytes),
    workloadId: workload.id,
    corpusId: workload.corpus.id,
    inputDigest: workload.input.digest,
    publicOutputDigest: expectedDigest,
    publicExpectedFactors: workload.input.value.expected,
  };
}

function hostIdentity() {
  return {
    platform: process.platform,
    architecture: process.arch,
    release: os.release(),
    node: process.version,
    v8: process.versions.v8,
    cpu: os.cpus()[0]?.model ?? null,
    logicalCpuCount: os.cpus().length,
  };
}

function targetAccounting() {
  return {
    generic: {
      entryBoundaryCrossings: 0,
      coefficientCopy: "ordinary prepared Python list consumed by current source",
      copiedBytes: null,
      publication: "fresh three-element Python list per prime",
      cleanup: "garbage-collected ordinary exact-integer lists",
    },
    v8: {
      entryBoundaryCrossings: 0,
      guardsPerPhase: {
        authenticatedPrimeContracts: 3,
        ordinaryArrayPrototypeChecks: 3,
        denseOwnDataElementChecks: 12,
        exactCoefficientChecks: 12,
        exactProductBounds: 3,
      },
      coefficientCopy:
        "twelve residues scalar-replaced into target-local Number state",
      copiedBytes: null,
      allocationsPerPhase: {
        guardCanonicalArrays: 3,
        publishedFactorArrays: 3,
        publishedPhaseArray: 1,
      },
      publication:
        "three fresh factor arrays and one phase array only after each scan succeeds",
      interrupt: "synchronous callback every 256 field points",
      cleanup: "no external resource",
    },
    wasm: {
      hostToWasmCallsPerPhase: PRIMARY_PRIMES.length,
      wasmToHostInterruptCallbacksPerPhase: PRIMARY_PRIMES.reduce(
        (total, prime) => total + Math.floor(prime / 256),
        0,
      ),
      totalBoundaryRoundTripsPerPhase:
        PRIMARY_PRIMES.length + PRIMARY_PRIMES.reduce(
          (total, prime) => total + Math.floor(prime / 256),
          0,
        ),
      directionalBoundaryCrossingsPerPhase: 2 * (
        PRIMARY_PRIMES.length + PRIMARY_PRIMES.reduce(
          (total, prime) => total + Math.floor(prime / 256),
          0,
        )
      ),
      guardsPerPhase: {
        authenticatedPrimeContracts: 3,
        ordinaryArrayPrototypeChecks: 3,
        denseOwnDataElementChecks: 12,
        exactCoefficientChecks: 12,
        exactProductBounds: 3,
        signedCharacterSumBounds: 3,
      },
      coefficientCopy: "four canonical u32 values copied per prime",
      inputCopiedBytesPerPrime: 16,
      inputCopiedBytesPerPhase: 48,
      outputCopiedBytesPerPhase: 0,
      allocationsPerPhase: {
        guardCanonicalArrays: 3,
        linearMemoryViews: 3,
        publishedFactorArrays: 3,
        publishedPhaseArray: 1,
      },
      publication:
        "signed scalar returned from Wasm; fresh host factor arrays published only after success",
      interrupt: "synchronous imported callback every 256 field points",
      memoryGrowth: "none; checked view recreated for every call",
      cleanup: "shared instance retained for the harness lifetime",
    },
  };
}

function crossoverEvidence({ generic, wasmTarget, expected, samples }) {
  const rows = [];
  for (let index = 0; index < CROSSOVER_PRIMES.length; index += 1) {
    const prime = CROSSOVER_PRIMES[index];
    const expectedOutput = expected[index];
    const genericResult = generic.one(prime);
    assertExactOutput(genericResult.output, expectedOutput, `generic crossover ${prime}`);
    const v8Samples = [];
    const wasmSamples = [];
    for (let warmup = 0; warmup < 3; warmup += 1) {
      checkedV8NormalizationFactor(SOURCE_VALUES, prime, {
        primeAuthenticated: true,
      });
      if (wasmTarget.availability === "available") {
        checkedWasmNormalizationFactor(wasmTarget, SOURCE_VALUES, prime, {
          primeAuthenticated: true,
        });
      }
    }
    for (let sample = 0; sample < samples; sample += 1) {
      const v8 = timeOperation(() => checkedV8NormalizationFactor(
        SOURCE_VALUES,
        prime,
        { primeAuthenticated: true },
      ));
      assertExactOutput(v8.output, expectedOutput, `V8 crossover ${prime}`);
      v8Samples.push(v8.nanoseconds);
      if (wasmTarget.availability === "available") {
        const wasm = timeOperation(() => checkedWasmNormalizationFactor(
          wasmTarget,
          SOURCE_VALUES,
          prime,
          { primeAuthenticated: true },
        ));
        assertExactOutput(wasm.output, expectedOutput, `Wasm crossover ${prime}`);
        wasmSamples.push(wasm.nanoseconds);
      }
    }
    rows.push({
      prime,
      exactNumberProductGuard: exactNumberProductGuard(prime),
      fastIntegerRouteSelectionGate: fastIntegerPerformanceGuard(prime),
      routeSelectionGateAppliedDuringProbe: false,
      v8RouteDisposition: fastIntegerPerformanceGuard(prime)
        ? "eligible-for-engine-specific-measurement"
        : "rejected-by-conservative-31-bit-performance-gate",
      exactOutput: expectedOutput,
      currentGenericSingleObservationNanoseconds: genericResult.nanoseconds,
      checkedV8: distribution(v8Samples),
      checkedWasm: wasmSamples.length
        ? { status: "measured", ...distribution(wasmSamples) }
        : { status: "unavailable", reason: wasmTarget.reason },
    });
  }
  return {
    empiricalBracket: {
      lastPrimeBelow: 46_301,
      firstPrimeAbove: 46_349,
      conservativeMaximumPrimeInclusive: FAST_INTEGER_MAX_PRIME,
      predicate: "p * (p - 1) <= 2^31 - 1",
    },
    numericalExactness: {
      maximumIntegerModulusInclusive: EXACT_NUMBER_MAX_PRIME,
      maximumEligiblePrimeInclusive: EXACT_NUMBER_MAX_ELIGIBLE_PRIME,
      atBoundary: exactNumberProductGuard(EXACT_NUMBER_MAX_PRIME),
      afterBoundary: exactNumberProductGuard(EXACT_NUMBER_MAX_PRIME + 1),
      predicate: "p * (p - 1) <= Number.MAX_SAFE_INTEGER",
    },
    rows,
  };
}

async function runFeasibility({
  root = path.resolve(__dirname, "../.."),
  samples = STANDARD_SAMPLES,
  warmups = STANDARD_WARMUPS,
  crossoverSamples = 5,
  clang = process.env.CLANG || "clang",
  producerSamples = STANDARD_SAMPLES,
  compileSamples = STANDARD_SAMPLES,
  instantiateSamples = STANDARD_SAMPLES,
  allowUnverifiedBuild = false,
} = {}) {
  for (const [label, value, minimum] of [
    ["samples", samples, 1],
    ["warmups", warmups, 0],
    ["crossover samples", crossoverSamples, 1],
    ["producer samples", producerSamples, 1],
    ["compile samples", compileSamples, 1],
    ["instantiate samples", instantiateSamples, 1],
  ]) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new TypeError(`${label} must be an integer at least ${minimum}`);
    }
  }
  const standardEvidence = samples === STANDARD_SAMPLES &&
    warmups >= STANDARD_WARMUPS;
  if (allowUnverifiedBuild && standardEvidence) {
    throw new Error(
      "standard target-feasibility evidence cannot use an unverified build",
    );
  }
  const buildAuthentication = allowUnverifiedBuild
    ? {
        status: "not-authenticated",
        promotable: false,
        reason:
          "explicit smoke-only development run; source-to-dist identity was not authenticated",
      }
    : {
        status: "authenticated-current-clean-build",
        ...requireCurrentBuild(root),
      };
  const source = sourceProvenance(root);
  if (buildAuthentication.promotable) {
    assert.equal(source.worktreeDirty, false);
    assert.equal(source.repositoryCommit, buildAuthentication.source.commit);
  }
  const workload = workloadProvenance(root);
  const allPrimes = [...PRIMARY_PRIMES, ...CROSSOVER_PRIMES];
  const oracle = independentCpythonOracle(allPrimes);
  assert.deepEqual(
    oracle.public_factors.slice(0, PRIMARY_PRIMES.length),
    workload.publicExpectedFactors,
    "catalog public factors disagree with the independent point count",
  );
  const expectedPhase = oracle.normalization.slice(0, PRIMARY_PRIMES.length);
  const expectedCrossovers = oracle.normalization.slice(PRIMARY_PRIMES.length);
  const phaseOutputDigest = sha256(canonicalJson(expectedPhase));

  let interruptCalls = 0;
  const wasmTarget = compileWasmTarget({
    sourcePath: path.join(
      root,
      "bench/optimizer-workloads/modular-scan-target.c",
    ),
    sourceRepositoryPath:
      "bench/optimizer-workloads/modular-scan-target.c",
    clang,
    producerSamples,
    compileSamples,
    instantiateSamples,
    interrupt() {
      interruptCalls += 1;
    },
  });

  const generic = await createCurrentGenericRunner(root, warmups);
  try {
    const genericExact = generic.phase();
    assertExactOutput(genericExact.output, expectedPhase, "current generic phase");
    const v8Phase = () => phaseTarget((prime) =>
      checkedV8NormalizationFactor(SOURCE_VALUES, prime, {
        primeAuthenticated: true,
      })
    );
    for (let index = 0; index < warmups; index += 1) v8Phase();
    const v8Comparison = buildPairedComparison({
      target: "checked-v8-feasibility",
      samples,
      generic: () => generic.phase(),
      feasible: v8Phase,
      expected: expectedPhase,
      publicOutputDigest: workload.publicOutputDigest,
      phaseOutputDigest,
    });

    let wasmComparison;
    if (wasmTarget.availability === "available") {
      const wasmPhase = () => phaseTarget((prime) =>
        checkedWasmNormalizationFactor(wasmTarget, SOURCE_VALUES, prime, {
          primeAuthenticated: true,
        })
      );
      for (let index = 0; index < warmups; index += 1) wasmPhase();
      wasmComparison = buildPairedComparison({
        target: "validated-copy-wasm-feasibility",
        samples,
        generic: () => generic.phase(),
        feasible: wasmPhase,
        expected: expectedPhase,
        publicOutputDigest: workload.publicOutputDigest,
        phaseOutputDigest,
      });
    } else {
      wasmComparison = {
        status: "unavailable",
        measurementScope: "reviewed-phase",
        target: "validated-copy-wasm-feasibility",
        reason: wasmTarget.reason,
        detail: wasmTarget.detail,
        rawPairs: [],
        opportunityEvidencePairs: [],
      };
    }

    const crossovers = crossoverEvidence({
      generic,
      wasmTarget,
      expected: expectedCrossovers,
      samples: crossoverSamples,
    });
    const guardAudit = runGuardAudit(wasmTarget);
    const accounting = targetAccounting();
    const serializableWasm = { ...wasmTarget };
    delete serializableWasm.instance;
    delete serializableWasm.heapBase;
    delete serializableWasm.moduleObject;
    if (serializableWasm.accounting) {
      serializableWasm.execution = accounting.wasm;
      serializableWasm.interruptCallsDuringMeasurements = interruptCalls;
    }
    const adapter = {
      schema: ADAPTER_SCHEMA,
      consumable: buildAuthentication.promotable,
      measurementScope: "reviewed-phase",
      phaseId: "normalization-factor",
      compilerDecision: {
        id: "sha256:d8f23a140bed2fbe8b8d99280e21ab374d0fea8f66dff2c624188a1efbec386d",
        passId: "math.modular-sequence-reconnaissance.v1",
        regionId:
          "sha256:04feb0f6a5db4cead5d73ecfd729abcda7d7405ef2acf8b5519bf5b2325deb22",
        authority: "exact-reviewed-static-decision",
      },
      workload: {
        id: workload.workloadId,
        inputDigest: workload.inputDigest,
        corpusId: workload.corpusId,
        publicOutputDigest: workload.publicOutputDigest,
      },
      source: {
        path: source.path,
        function: source.function,
        functionExcerptSha256: source.functionExcerptSha256,
      },
      exactPhaseOutputDigest: phaseOutputDigest,
      comparisons: {
        v8: {
          status: "measured-feasibility-not-production-route",
          pairs: v8Comparison.opportunityEvidencePairs,
        },
        wasm: wasmComparison.status === "measured"
          ? {
              status:
                "measured-resident-feasibility-production-target-inconclusive",
              pairs: wasmComparison.opportunityEvidencePairs,
            }
          : {
              status: "unavailable",
              reason: wasmComparison.reason,
              pairs: [],
            },
      },
      phaseReceiptData: {
        baseline: {
          target: "generic",
          disposition: "actual-current-generic-baseline",
          samplesNanoseconds: v8Comparison.rawPairs.map(
            (pair) => pair.baselineNanoseconds,
          ),
          outputDigest: workload.publicOutputDigest,
        },
        feasibleLowerBound: {
          target: "v8",
          disposition: "feasible-handwritten-checked-target",
          samplesNanoseconds: v8Comparison.rawPairs.map(
            (pair) => pair.feasibleNanoseconds,
          ),
          outputDigest: workload.publicOutputDigest,
          productionRouteClaim: "none",
        },
        negativeTargets: [{
          target: "wasm",
          disposition: wasmComparison.status === "measured"
            ? "production-inconclusive-runtime-clang-loses-resident-phase-wins"
            : "unavailable",
          availability: wasmTarget.availability,
          phaseSamplesNanoseconds: wasmComparison.status === "measured"
            ? wasmComparison.rawPairs.map((pair) => pair.feasibleNanoseconds)
            : [],
          sourceToWasmSamplesNanoseconds:
            serializableWasm.accounting?.sourceToWasm.samples ?? [],
          moduleCompileSamplesNanoseconds:
            serializableWasm.accounting?.moduleCompile.samples ?? [],
          moduleInstantiateSamplesNanoseconds:
            serializableWasm.accounting?.moduleInstantiate.samples ?? [],
          derivedCompileInstantiateAndResidentComponentSumsNanoseconds:
            wasmComparison.status === "measured"
            ? wasmComparison.rawPairs.map((pair, index) =>
                pair.feasibleNanoseconds +
                serializableWasm.accounting.sourceToWasm.samples[
                  index % serializableWasm.accounting.sourceToWasm.samples.length
                ] +
                serializableWasm.accounting.moduleCompile.samples[
                  index % serializableWasm.accounting.moduleCompile.samples.length
                ] +
                serializableWasm.accounting.moduleInstantiate.samples[
                  index % serializableWasm.accounting.moduleInstantiate.samples.length
                ]
              )
            : [],
          reason: wasmComparison.status === "measured"
            ? "runtime clang production is rejected, while the faster resident phase leaves a shared or prebuilt Wasm module plausible"
            : wasmComparison.reason,
          outputDigest: workload.publicOutputDigest,
          productionRouteClaim: "none",
        }],
      },
      assemblyInstruction:
        buildAuthentication.promotable
          ? "Integration may attach these pairs only to phase-only profiles with the exact workload, source, compiler, and public output identities above; this adapter authenticates no compiler or runtime route."
          : "Do not assemble opportunity evidence from this smoke report: its source-to-dist build identity is intentionally unauthenticated.",
    };
    const reportWithoutId = {
      schema: SCHEMA,
      generatedAt: new Date().toISOString(),
      status: buildAuthentication.promotable
        ? "feasibility-evidence-only"
        : "development-smoke-non-promotable",
      productionCompilerRouteClaim: "none",
      buildAuthentication,
      measurementScope: {
        authority: "reviewed-phase",
        phaseId: "normalization-factor",
        sourceFunction: "_normalization_factor",
        included:
          "the complete genus-one range(p), reverse Horner, zero branch, modular power, character reduction, and fresh factor result",
        excluded: [
          "public HyperellipticCurve.local_reduction work outside _normalization_factor",
          "source compilation and module import",
          "independent oracle execution",
          "target source-to-Wasm, module compilation, and instantiation (reported separately)",
        ],
      },
      protocol: {
        samples,
        warmups,
        order: "deterministic repeating AB,BA,BA,AB",
        standardEvidence,
        primes: PRIMARY_PRIMES,
        sourceValues: SOURCE_VALUES,
      },
      host: hostIdentity(),
      source,
      workload,
      oracle: {
        kind: "independent-cpython-point-count",
        executable: oracle.executable,
        method: oracle.method,
        normalizationFactors: expectedPhase,
        publicFactors: oracle.public_factors.slice(0, PRIMARY_PRIMES.length),
        phaseOutputDigest,
        publicOutputDigest: workload.publicOutputDigest,
      },
      exactDifferential: {
        currentGeneric: genericExact.output,
        checkedV8: v8Phase().output,
        checkedWasm: wasmTarget.availability === "available"
          ? phaseTarget((prime) => checkedWasmNormalizationFactor(
              wasmTarget,
              SOURCE_VALUES,
              prime,
              { primeAuthenticated: true },
            )).output
          : { status: "unavailable", reason: wasmTarget.reason },
      },
      targets: {
        generic: {
          availability: "available",
          ...generic.accounting,
          execution: accounting.generic,
        },
        v8: {
          availability: "available",
          implementation:
            "handwritten checked feasibility target mirroring the reviewed source phase",
          productionRouteClaim: "none",
          emittedFunctionSourceBytes: Buffer.byteLength(
            powModNumber.toString() + checkedV8NormalizationFactor.toString(),
          ),
          exactnessMaximumPrimeInclusive: EXACT_NUMBER_MAX_PRIME,
          conservativeFastIntegerMaximumPrimeInclusive:
            FAST_INTEGER_MAX_PRIME,
          execution: accounting.v8,
        },
        wasm: serializableWasm,
      },
      comparisons: {
        v8: v8Comparison,
        wasm: wasmComparison,
      },
      thresholdAndCrossoverNegatives: crossovers,
      guardFallbackAndPublicationAudit: guardAudit,
      opportunityEvidenceAdapter: adapter,
    };
    const report = {
      id: contentId(reportWithoutId),
      ...reportWithoutId,
    };
    validateReport(report);
    return report;
  } finally {
    generic.close();
  }
}

function validateReport(report) {
  assert.equal(report.schema, SCHEMA);
  assert.match(report.id, /^sha256:[0-9a-f]{64}$/);
  const { id, ...payload } = report;
  assert.equal(id, contentId(payload), "feasibility receipt identity is stale");
  assert.equal(report.productionCompilerRouteClaim, "none");
  if (report.buildAuthentication.promotable) {
    assert.equal(
      report.buildAuthentication.status,
      "authenticated-current-clean-build",
    );
    assert.equal(report.source.worktreeDirty, false);
    assert.equal(report.opportunityEvidenceAdapter.consumable, true);
  } else {
    assert.equal(report.status, "development-smoke-non-promotable");
    assert.equal(report.protocol.standardEvidence, false);
    assert.equal(report.opportunityEvidenceAdapter.consumable, false);
  }
  assert.equal(report.measurementScope.authority, "reviewed-phase");
  assert.deepEqual(report.protocol.primes, PRIMARY_PRIMES);
  assert.deepEqual(
    report.oracle.normalizationFactors,
    report.exactDifferential.currentGeneric,
  );
  assert.deepEqual(
    report.oracle.normalizationFactors,
    report.exactDifferential.checkedV8,
  );
  assert.equal(
    report.oracle.publicOutputDigest,
    report.workload.publicOutputDigest,
  );
  for (const comparison of [report.comparisons.v8, report.comparisons.wasm]) {
    if (comparison.status === "unavailable") {
      assert.equal(comparison.rawPairs.length, 0);
      assert.equal(comparison.opportunityEvidencePairs.length, 0);
      assert.ok(comparison.reason);
      continue;
    }
    assert.equal(comparison.rawPairs.length, report.protocol.samples);
    assert.equal(
      comparison.opportunityEvidencePairs.length,
      report.protocol.samples,
    );
    comparison.rawPairs.forEach((pair, index) => {
      assert.equal(pair.index, index);
      assert.equal(pair.order, expectedOrder(index));
      assert.equal(pair.baselinePublicOutputDigest, report.workload.publicOutputDigest);
      assert.equal(pair.feasiblePublicOutputDigest, report.workload.publicOutputDigest);
      assert.ok(pair.baselineNanoseconds > 0);
      assert.ok(pair.feasibleNanoseconds > 0);
    });
  }
  assert.equal(
    report.thresholdAndCrossoverNegatives.rows[0].fastIntegerRouteSelectionGate,
    true,
  );
  assert.equal(
    report.thresholdAndCrossoverNegatives.rows[1].fastIntegerRouteSelectionGate,
    false,
  );
  assert.equal(
    report.thresholdAndCrossoverNegatives.numericalExactness.atBoundary,
    true,
  );
  assert.equal(
    report.thresholdAndCrossoverNegatives.numericalExactness.afterBoundary,
    false,
  );
  assert.equal(
    report.opportunityEvidenceAdapter.workload.publicOutputDigest,
    report.workload.publicOutputDigest,
  );
  return report;
}

function parseArguments(argv) {
  const options = {};
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") output = argv[++index];
    else if (argument === "--clang") options.clang = argv[++index];
    else if (argument === "--smoke") {
      Object.assign(options, {
        samples: 1,
        warmups: 1,
        crossoverSamples: 1,
        producerSamples: 1,
        compileSamples: 1,
        instantiateSamples: 1,
        allowUnverifiedBuild: true,
      });
    } else if (argument === "--help") {
      return { help: true, output, options };
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  return { help: false, output, options };
}

async function main(argv) {
  const parsed = parseArguments(argv);
  if (parsed.help) {
    process.stdout.write(
      "Usage: node bench/optimizer-workloads/modular-scan-target-feasibility.cjs " +
      "[--output FILE] [--clang PATH] [--smoke]\n",
    );
    return;
  }
  const report = await runFeasibility(parsed.options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (parsed.output) {
    writeFileSync(parsed.output, serialized);
    process.stdout.write(JSON.stringify({
      output: path.resolve(parsed.output),
      id: report.id,
      samples: report.protocol.samples,
      wasm: report.targets.wasm.availability,
    }) + "\n");
  } else {
    process.stdout.write(serialized);
  }
}

module.exports = {
  ADAPTER_SCHEMA,
  CROSSOVER_PRIMES,
  PRIMARY_PRIMES,
  SCHEMA,
  SOURCE_VALUES,
  buildPairedComparison,
  checkedV8NormalizationFactor,
  checkedWasmNormalizationFactor,
  compileWasmTarget,
  exactNumberProductGuard,
  expectedOrder,
  fastIntegerPerformanceGuard,
  independentCpythonOracle,
  parseArguments,
  runFeasibility,
  validateDenseCubicInput,
  validateReport,
};

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
