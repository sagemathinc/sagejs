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

const {
  requireCurrentBuild,
} = require("../../tools/optimizer-development/workloads.cjs");

const SCHEMA = "sagejs.campaign1-indexed-division-target-feasibility/v1";
const ADAPTER_SCHEMA =
  "sagejs.campaign1-reviewed-phase-opportunity-adapter/v1";
const MODULUS = 65_537;
const DEGREE = 69_999;
const SOURCE_LENGTH = DEGREE + 1;
const ZERO_SOURCE_INDEX = MODULUS - 1;
const STANDARD_SAMPLES = 11;
const STANDARD_WARMUPS = 3;
const ABBA = Object.freeze(["AB", "BA", "BA", "AB"]);
const MAX_FEASIBILITY_LENGTH = 1_000_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentId(value) {
  return `sha256:${sha256(canonicalJson(value))}`;
}

function median(values) {
  assert.ok(values.length > 0, "median requires observations");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function distribution(samples) {
  return {
    unit: "nanoseconds",
    samples,
    minimum: Math.min(...samples),
    median: median(samples),
    maximum: Math.max(...samples),
  };
}

function expectedOrder(index) {
  return ABBA[index % ABBA.length];
}

function exactInteger(value) {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function actualCoefficients() {
  const coefficients = Array.from(
    { length: SOURCE_LENGTH },
    (_value, index) => {
      const value = (index * index + 3 * index - 7) % MODULUS;
      return value < 0 ? value + MODULUS : value;
    },
  );
  coefficients[ZERO_SOURCE_INDEX] = 0;
  return coefficients;
}

const SOURCE_COEFFICIENTS = Object.freeze(actualCoefficients());

function validateIndexedDivisionInput(
  coefficients,
  prime,
  { primeAuthenticated = false } = {},
) {
  if (!primeAuthenticated) {
    return { ok: false, reason: "prime-contract-not-authenticated" };
  }
  if (prime !== MODULUS) {
    return { ok: false, reason: "reviewed-prime-mismatch" };
  }
  if (!Array.isArray(coefficients) ||
      Object.getPrototypeOf(coefficients) !== Array.prototype) {
    return { ok: false, reason: "coefficient-storage-not-ordinary-array" };
  }
  if (coefficients.length > MAX_FEASIBILITY_LENGTH) {
    return { ok: false, reason: "coefficient-resource-bound-exceeded" };
  }
  const canonical = [];
  for (let index = 0; index < coefficients.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(coefficients, index);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      return { ok: false, reason: "coefficient-not-dense-own-data" };
    }
    const coefficient = descriptor.value;
    if (!exactInteger(coefficient)) {
      return { ok: false, reason: "coefficient-not-exact-safe-integer" };
    }
    if (coefficient < 0 || coefficient >= prime) {
      return { ok: false, reason: "coefficient-not-canonical-residue" };
    }
    canonical.push(coefficient);
  }
  while (canonical.length && canonical.at(-1) === 0) canonical.pop();
  return { ok: true, canonical };
}

function powModNumber(base, exponent, modulus) {
  let result = 1;
  let power = base % modulus;
  while (exponent !== 0) {
    if (exponent % 2 === 1) result = result * power % modulus;
    exponent = Math.floor(exponent / 2);
    if (exponent !== 0) power = power * power % modulus;
  }
  return result;
}

function divideResidue(coefficient, denominator, prime) {
  const reduced = denominator % prime;
  if (reduced === 0) {
    const error = new Error("prime-field division by zero");
    error.name = "ZeroDivisionError";
    throw error;
  }
  return coefficient * powModNumber(reduced, prime - 2, prime) % prime;
}

function checkedV8IndexedDivision(
  coefficients,
  prime,
  {
    primeAuthenticated = false,
    checkInterrupt = () => {},
    fallback = (_coefficients, _prime, reason) => {
      throw new Error(`indexed-division V8 guard rejected: ${reason}`);
    },
  } = {},
) {
  const guard = validateIndexedDivisionInput(coefficients, prime, {
    primeAuthenticated,
  });
  if (!guard.ok) return fallback(coefficients, prime, guard.reason);
  if (guard.canonical.length === 0) return [];
  const output = new Array(guard.canonical.length + 1);
  output[0] = 0;
  for (let index = 0; index < guard.canonical.length; index += 1) {
    if ((index + 1) % 256 === 0) checkInterrupt();
    const coefficient = guard.canonical[index];
    output[index + 1] = coefficient === 0
      ? 0
      : divideResidue(coefficient, index + 1, prime);
  }
  while (output.length && output.at(-1) === 0) output.pop();
  return output;
}

function ensureWasmCapacity(target, requiredBytes) {
  const memory = target.instance.exports.memory;
  if (requiredBytes <= memory.buffer.byteLength) return 0;
  const pages = Math.ceil((requiredBytes - memory.buffer.byteLength) / 65_536);
  memory.grow(pages);
  return pages;
}

function checkedWasmIndexedDivision(
  target,
  coefficients,
  prime,
  {
    primeAuthenticated = false,
    fallback = (_coefficients, _prime, reason) => {
      throw new Error(`indexed-division Wasm guard rejected: ${reason}`);
    },
    accounting = null,
  } = {},
) {
  const guard = validateIndexedDivisionInput(coefficients, prime, {
    primeAuthenticated,
  });
  if (!guard.ok) return fallback(coefficients, prime, guard.reason);
  if (guard.canonical.length === 0) return [];
  const inputOffset = target.heapBase;
  const inputBytes = guard.canonical.length * Uint32Array.BYTES_PER_ELEMENT;
  const outputOffset = (inputOffset + inputBytes + 7) & ~7;
  const outputCapacity = guard.canonical.length + 1;
  const outputBytes = outputCapacity * Uint32Array.BYTES_PER_ELEMENT;
  const grownPages = ensureWasmCapacity(target, outputOffset + outputBytes);
  const input = new Uint32Array(
    target.instance.exports.memory.buffer,
    inputOffset,
    guard.canonical.length,
  );
  input.set(guard.canonical);
  const resultLength = target.instance.exports.checked_prime_integral_u32(
    inputOffset,
    guard.canonical.length,
    outputOffset,
    outputCapacity,
    prime,
  );
  if (resultLength === -4) {
    const error = new Error("prime-field division by zero");
    error.name = "ZeroDivisionError";
    throw error;
  }
  if (!Number.isInteger(resultLength) || resultLength < 0 ||
      resultLength > outputCapacity) {
    throw new Error(`Wasm indexed-division status ${resultLength}`);
  }
  const resident = new Uint32Array(
    target.instance.exports.memory.buffer,
    outputOffset,
    resultLength,
  );
  const output = Array.from(resident);
  if (accounting) {
    accounting.inputCopiedBytes += inputBytes;
    accounting.outputCopiedBytes += output.length * Uint32Array.BYTES_PER_ELEMENT;
    accounting.memoryGrowthPages += grownPages;
  }
  return output;
}

function timeOperation(operation) {
  const started = process.hrtime.bigint();
  const output = operation();
  return {
    nanoseconds: Math.max(1, Number(process.hrtime.bigint() - started)),
    output,
  };
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
    "-Wl,--initial-memory=1048576",
    "-Wl,--max-memory=16777216",
    "-Wl,--allow-undefined",
    source,
    "-o",
    output,
  ];
}

function unavailableTarget(reason, detail, provenance) {
  return { availability: "unavailable", reason, detail, provenance };
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
  const temporary = mkdtempSync(
    path.join(os.tmpdir(), "sagejs-indexed-division-wasm-"),
  );
  const wasmPath = path.join(temporary, "indexed-division-target.wasm");
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
    const bytes = readFileSync(wasmPath);
    const version = spawnSync(clang, ["--version"], { encoding: "utf8" });
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
        { ...provenance, producerNanoseconds, moduleCompileNanoseconds },
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
        },
      );
    }
    if (typeof instance.exports.checked_prime_integral_u32 !== "function" ||
        !(instance.exports.memory instanceof WebAssembly.Memory) ||
        !instance.exports.__heap_base) {
      return unavailableTarget(
        "wasm-artifact-contract-mismatch",
        "required function, memory, or heap-base export is absent",
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
    if (!Number.isSafeInteger(heapBase) || heapBase < 0 || heapBase % 8 !== 0) {
      return unavailableTarget(
        "wasm-linear-memory-contract-mismatch",
        `invalid heap base ${heapBase}`,
        { ...provenance, artifactSha256: sha256(bytes) },
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

function powModBigInt(base, exponent, modulus) {
  let result = 1n;
  let power = base % modulus;
  while (exponent !== 0n) {
    if (exponent % 2n === 1n) result = result * power % modulus;
    exponent /= 2n;
    if (exponent !== 0n) power = power * power % modulus;
  }
  return result;
}

function independentBigIntOracle(coefficients = SOURCE_COEFFICIENTS) {
  const modulus = BigInt(MODULUS);
  const normalized = [...coefficients];
  while (normalized.length && normalized.at(-1) === 0) normalized.pop();
  if (!normalized.length) return [];
  const output = [0];
  for (let index = 0; index < normalized.length; index += 1) {
    const coefficient = BigInt(normalized[index]);
    if (coefficient === 0n) {
      output.push(0);
      continue;
    }
    const denominator = BigInt(index + 1) % modulus;
    if (denominator === 0n) throw new Error("BigInt oracle division by zero");
    const inverse = powModBigInt(denominator, modulus - 2n, modulus);
    output.push(Number(coefficient * inverse % modulus));
  }
  while (output.length && output.at(-1) === 0) output.pop();
  return output;
}

function derivativeReplay(integral, coefficients, prime = MODULUS) {
  const normalized = [...coefficients];
  while (normalized.length && normalized.at(-1) === 0) normalized.pop();
  if (!normalized.length) return integral.length === 0;
  if (integral.length !== normalized.length + 1 || integral[0] !== 0) {
    return false;
  }
  for (let index = 0; index < normalized.length; index += 1) {
    if (integral[index + 1] * ((index + 1) % prime) % prime !==
        normalized[index]) return false;
  }
  return true;
}

function statOrNull(filename) {
  try {
    return statSync(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function createCurrentGenericRunner(root) {
  const distPath = path.join(root, "dist/tools/kernel-evaluator.js");
  if (!statOrNull(distPath)) {
    throw new Error("current generic target requires a completed `pnpm build`");
  }
  const previousLevel = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = "O2";
  const { createKernelEvaluatorAsync } = require(distPath);
  const evaluator = await createKernelEvaluatorAsync({
    mode: "python",
    onOutput() {},
  });
  const source = String.raw`
from sagejs.polynomial_algorithms.structural_calculus import dense_integral

_campaign1_prime = 65537
_campaign1_field = GF(_campaign1_prime)
_campaign1_coefficients = [
    _campaign1_field((index * index + 3 * index - 7) % _campaign1_prime)
    for index in range(70000)
]
_campaign1_coefficients[65536] = _campaign1_field(0)
_campaign1_zero = _campaign1_field(0)

def _campaign1_divide(coefficient, denominator):
    return coefficient / _campaign1_field(denominator)

def __campaign1_dense_integral_phase():
    answer = dense_integral(
        _campaign1_coefficients,
        _campaign1_zero,
        _campaign1_divide,
    )
    return [int(value.lift()) for value in answer]
`;
  try {
    evaluator.evaluate(source, {
      filename:
        "bench/optimizer-workloads/indexed-division-current-generic.py",
      language: "python",
      suppressResult: true,
    });
  } catch (error) {
    evaluator.close();
    if (previousLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previousLevel;
    throw error;
  }
  return {
    phase() {
      const result = evaluator.evaluate("__campaign1_dense_integral_phase()", {
        language: "python",
      });
      return {
        nanoseconds: Math.max(1, Math.round(result.durationMs * 1_000_000)),
        output: JSON.parse(result.repr),
      };
    },
    close() {
      evaluator.close();
      if (previousLevel === undefined) delete process.env.SAGEJS_OPT_LEVEL;
      else process.env.SAGEJS_OPT_LEVEL = previousLevel;
    },
    accounting: {
      implementation: "actual-current-prepared-O2-dense-integral-source",
      optimizationLevel: "O2",
      input:
        "70,000 actual GF(65537) coefficient elements prepared outside timing",
      measuredBoundary:
        "dense_integral validation/normalization, callback divisions, fresh field-element output, and complete residue-list materialization",
      excluded:
        "field/ring/input preparation, compiler/module initialization, result repr serialization, and derivative oracle replay",
      productionRouteClaim: "none",
    },
  };
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
    assertExactOutput(baseline.output, expected, `${target} baseline ${index}`);
    assertExactOutput(candidate.output, expected, `${target} candidate ${index}`);
    rawPairs.push({
      index,
      order,
      baselineNanoseconds: baseline.nanoseconds,
      feasibleNanoseconds: candidate.nanoseconds,
      baselinePhaseOutputDigest: phaseOutputDigest,
      feasiblePhaseOutputDigest: phaseOutputDigest,
      baselinePublicOutputDigest: publicOutputDigest,
      feasiblePublicOutputDigest: publicOutputDigest,
    });
    adapterPairs.push({
      order,
      baselineMicroseconds:
        Math.max(1, Math.round(baseline.nanoseconds / 1_000)),
      feasibleLowerBoundMicroseconds:
        Math.max(1, Math.round(candidate.nanoseconds / 1_000)),
      baselineOutputDigest: publicOutputDigest,
      feasibleOutputDigest: publicOutputDigest,
    });
  }
  const baselineSamples = rawPairs.map((pair) => pair.baselineNanoseconds);
  const feasibleSamples = rawPairs.map((pair) => pair.feasibleNanoseconds);
  return {
    status: "measured",
    measurementScope: "reviewed-phase",
    target,
    rawPairs,
    baseline: distribution(baselineSamples),
    feasible: distribution(feasibleSamples),
    medianRatioBaselineOverFeasible:
      median(baselineSamples) / median(feasibleSamples),
    opportunityEvidencePairs: adapterPairs,
  };
}

function gitIdentity(root) {
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const commit = run(["rev-parse", "HEAD"]);
  const status = run(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (commit.status !== 0 || status.status !== 0) {
    throw new Error("cannot authenticate repository source identity");
  }
  return {
    commit: commit.stdout.trim(),
    dirty: status.stdout.trim() !== "",
  };
}

function sourceProvenance(root) {
  const sourcePath =
    "src/lib/sagejs/polynomial_algorithms/structural_calculus.py";
  const bytes = readFileSync(path.join(root, sourcePath));
  const dashboard = JSON.parse(readFileSync(
    path.join(root, "architecture/optimizer-opportunities.json"),
  ));
  const functions = dashboard.functions.filter(
    (candidate) => candidate.path === sourcePath &&
      candidate.qualifiedName === "dense_integral",
  );
  assert.equal(functions.length, 1, "expected exact dense_integral identity");
  const functionEntry = functions[0];
  const loops = dashboard.loops.filter(
    (candidate) => candidate.functionId === functionEntry.id &&
      candidate.source.line === 155 && candidate.source.endLine === 159,
  );
  assert.equal(loops.length, 1, "expected exact dense_integral loop identity");
  const decision = loops[0].decisions.find(
    (candidate) =>
      candidate.passId === "math.modular-sequence-reconnaissance.v1",
  );
  assert.ok(decision, "reviewed reconnaissance decision is absent");
  const git = gitIdentity(root);
  return {
    path: sourcePath,
    fileBytes: bytes.length,
    fileSha256: sha256(bytes),
    function: "dense_integral",
    functionId: functionEntry.id,
    functionExcerptSha256: functionEntry.excerptDigest,
    regionId: loops[0].id,
    regionExcerptSha256: loops[0].excerptDigest,
    region: loops[0].source,
    compilerDecision: {
      id: decision.id,
      passId: decision.passId,
      rejectionReasons: decision.rejectionReasons,
    },
    repositoryCommit: git.commit,
    worktreeDirty: git.dirty,
  };
}

function workloadProvenance(root) {
  const catalogPath = "architecture/optimizer-workloads.json";
  const bytes = readFileSync(path.join(root, catalogPath));
  const catalog = JSON.parse(bytes);
  const matches = catalog.workloads.filter(
    (workload) =>
      workload.runner?.argv?.[0] === "public-prime-polynomial-integral",
  );
  assert.equal(matches.length, 1, "expected exact public integral workload");
  const workload = matches[0];
  const expectedDigest = workload.oracles.find(
    (oracle) => oracle.id === "exact-derivative-replay",
  )?.expectedDigest;
  assert.match(expectedDigest ?? "", /^[0-9a-f]{64}$/);
  return {
    catalogPath,
    catalogId: catalog.id,
    catalogSha256: sha256(bytes),
    workloadId: workload.id,
    corpusId: workload.corpus.id,
    inputDigest: workload.input.digest,
    publicOutputDigest: expectedDigest,
    publicExpectedOutput: workload.input.value.expected,
  };
}

function alternativeProductionTargets() {
  return {
    matureLibrary: {
      availability: "available",
      disposition: "mature-algorithm-available-compiler-candidate-duplicate",
      candidate: "two-block declared FLINT prime-polynomial integral",
      route:
        "integrate coefficients[0:p-1], authenticate coefficients[p-1]==0, integrate coefficients[p:], and transactionally splice the second integral at output[p]",
      evidenceAuthority:
        "separate campaign1 indexed-division mature-library audit; this harness does not authenticate or time that route",
      consequence:
        "opportunity matureAlgorithm must be mature-algorithm-available and the compiler campaign must fail closed",
      productionRouteClaim: "none",
    },
    sourceTransparentNative: {
      availability: "unavailable",
      disposition: "retained-unavailable",
      candidate: "source-transparent isolated native lowering",
      reason:
        "the reviewed compiler decision has no verified callback/effect/representation lowering for this source body",
      productionRouteClaim: "none",
    },
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

function runGuardAudit(wasmTarget) {
  const invalidCases = [
    ["prime-contract", SOURCE_COEFFICIENTS, MODULUS, false],
    ["wrong-prime", SOURCE_COEFFICIENTS, 65_521, true],
    ["not-array", new Uint32Array([1, 2]), MODULUS, true],
    ["bigint-element", [1, 2n], MODULUS, true],
    ["negative-element", [1, -1], MODULUS, true],
    ["out-of-range-element", [1, MODULUS], MODULUS, true],
  ];
  const sparse = [1, 2, 3];
  delete sparse[1];
  invalidCases.push(["sparse-array", sparse, MODULUS, true]);
  const auditTarget = (operation) => invalidCases.map(
    ([id, input, prime, primeAuthenticated]) => {
      let fallbackCalls = 0;
      let rejectionReason = null;
      const sentinel = Object.freeze({ id });
      const output = operation(input, prime, {
        primeAuthenticated,
        fallback(_input, _prime, reason) {
          fallbackCalls += 1;
          rejectionReason = reason;
          return sentinel;
        },
      });
      assert.equal(output, sentinel);
      assert.equal(fallbackCalls, 1);
      return { id, fallbackCalls, rejectionReason, publications: 0 };
    },
  );
  const v8Invalid = auditTarget(checkedV8IndexedDivision);
  const wasmInvalid = wasmTarget.availability === "available"
    ? auditTarget((input, prime, options) =>
        checkedWasmIndexedDivision(wasmTarget, input, prime, options))
    : [];

  const divisionByZeroInput = [...SOURCE_COEFFICIENTS];
  divisionByZeroInput[ZERO_SOURCE_INDEX] = 1;
  assert.throws(
    () => checkedV8IndexedDivision(divisionByZeroInput, MODULUS, {
      primeAuthenticated: true,
    }),
    (error) => error.name === "ZeroDivisionError",
  );

  let v8InterruptCalls = 0;
  assert.throws(() => checkedV8IndexedDivision(
    SOURCE_COEFFICIENTS,
    MODULUS,
    {
      primeAuthenticated: true,
      checkInterrupt() {
        v8InterruptCalls += 1;
        throw new Error("campaign1 indexed-division interrupt");
      },
    },
  ), /indexed-division interrupt/);

  let wasmInterrupt = {
    status: "unavailable",
    reason: wasmTarget.reason,
    interruptCalls: 0,
    publications: 0,
  };
  let wasmDivisionByZero = {
    status: "unavailable",
    reason: wasmTarget.reason,
    publications: 0,
  };
  if (wasmTarget.availability === "available") {
    assert.throws(
      () => checkedWasmIndexedDivision(
        wasmTarget,
        divisionByZeroInput,
        MODULUS,
        { primeAuthenticated: true },
      ),
      (error) => error.name === "ZeroDivisionError",
    );
    wasmDivisionByZero = { status: "pass", publications: 0 };
    let calls = 0;
    const instance = new WebAssembly.Instance(wasmTarget.moduleObject, {
      sagejs: {
        check_interrupt() {
          calls += 1;
          throw new Error("campaign1 indexed-division wasm interrupt");
        },
      },
    });
    const interruptTarget = {
      instance,
      heapBase: Number(instance.exports.__heap_base.value),
    };
    assert.throws(() => checkedWasmIndexedDivision(
      interruptTarget,
      SOURCE_COEFFICIENTS,
      MODULUS,
      { primeAuthenticated: true },
    ), /wasm interrupt/);
    wasmInterrupt = {
      status: "pass",
      interruptCalls: calls,
      inputCopiedBytesBeforeInterrupt:
        SOURCE_LENGTH * Uint32Array.BYTES_PER_ELEMENT,
      publications: 0,
    };
  }
  const trailing = [1, 2, 0, 0];
  const normalizedV8 = checkedV8IndexedDivision(trailing, MODULUS, {
    primeAuthenticated: true,
  });
  return {
    invalidV8Cases: v8Invalid,
    invalidWasmCases: wasmInvalid,
    v8DivisionByZero: { status: "pass", publications: 0 },
    wasmDivisionByZero,
    v8Interrupt: {
      status: "pass",
      interruptCalls: v8InterruptCalls,
      publications: 0,
    },
    wasmInterrupt,
    normalization: {
      inputLength: trailing.length,
      normalizedInputLength: 2,
      outputLength: normalizedV8.length,
      exactOutput: normalizedV8,
    },
  };
}

async function runFeasibility({
  root = path.resolve(__dirname, "../.."),
  samples = STANDARD_SAMPLES,
  warmups = STANDARD_WARMUPS,
  clang = process.env.CLANG || "clang",
  producerSamples = STANDARD_SAMPLES,
  compileSamples = STANDARD_SAMPLES,
  instantiateSamples = STANDARD_SAMPLES,
  allowUnverifiedBuild = false,
} = {}) {
  for (const [label, value, minimum] of [
    ["samples", samples, 1],
    ["warmups", warmups, 0],
    ["producer samples", producerSamples, 1],
    ["compile samples", compileSamples, 1],
    ["instantiate samples", instantiateSamples, 1],
  ]) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new TypeError(`${label} must be an integer at least ${minimum}`);
    }
  }
  const standardEvidence = samples === STANDARD_SAMPLES &&
    warmups >= STANDARD_WARMUPS && producerSamples === STANDARD_SAMPLES &&
    compileSamples === STANDARD_SAMPLES &&
    instantiateSamples === STANDARD_SAMPLES;
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
  const oracleStarted = process.hrtime.bigint();
  const expected = independentBigIntOracle();
  const oracleNanoseconds = Number(process.hrtime.bigint() - oracleStarted);
  assert.equal(derivativeReplay(expected, SOURCE_COEFFICIENTS), true);
  assert.deepEqual(
    [
      expected.length - 1,
      true,
      [0, 1, 2, 65_536, 65_537, 65_538, 70_000].map(
        (index) => expected[index],
      ),
    ],
    workload.publicExpectedOutput,
  );
  const phaseOutputDigest = sha256(canonicalJson(expected));

  let wasmInterruptCalls = 0;
  const wasmTarget = compileWasmTarget({
    sourcePath: path.join(
      root,
      "bench/optimizer-workloads/indexed-division-target.c",
    ),
    sourceRepositoryPath:
      "bench/optimizer-workloads/indexed-division-target.c",
    clang,
    producerSamples,
    compileSamples,
    instantiateSamples,
    interrupt() {
      wasmInterruptCalls += 1;
    },
  });
  const generic = await createCurrentGenericRunner(root);
  const wasmCopyAccounting = {
    inputCopiedBytes: 0,
    outputCopiedBytes: 0,
    memoryGrowthPages: 0,
  };
  try {
    const genericCold = generic.phase();
    assertExactOutput(genericCold.output, expected, "generic cold");
    const v8Phase = () => timeOperation(() => checkedV8IndexedDivision(
      SOURCE_COEFFICIENTS,
      MODULUS,
      { primeAuthenticated: true },
    ));
    const v8Cold = v8Phase();
    assertExactOutput(v8Cold.output, expected, "V8 cold");
    for (let index = 0; index < warmups; index += 1) {
      assertExactOutput(generic.phase().output, expected, "generic warmup");
      assertExactOutput(v8Phase().output, expected, "V8 warmup");
    }
    const v8Comparison = buildPairedComparison({
      target: "checked-v8-indexed-division-feasibility",
      samples,
      generic: () => generic.phase(),
      feasible: v8Phase,
      expected,
      publicOutputDigest: workload.publicOutputDigest,
      phaseOutputDigest,
    });

    let wasmCold = null;
    let wasmComparison;
    if (wasmTarget.availability === "available") {
      const wasmPhase = () => timeOperation(() => checkedWasmIndexedDivision(
        wasmTarget,
        SOURCE_COEFFICIENTS,
        MODULUS,
        {
          primeAuthenticated: true,
          accounting: wasmCopyAccounting,
        },
      ));
      wasmCold = wasmPhase();
      assertExactOutput(wasmCold.output, expected, "Wasm cold");
      for (let index = 0; index < warmups; index += 1) {
        assertExactOutput(wasmPhase().output, expected, "Wasm warmup");
      }
      wasmComparison = buildPairedComparison({
        target: "validated-copy-complete-wasm-feasibility",
        samples,
        generic: () => generic.phase(),
        feasible: wasmPhase,
        expected,
        publicOutputDigest: workload.publicOutputDigest,
        phaseOutputDigest,
      });
    } else {
      wasmComparison = {
        status: "unavailable",
        measurementScope: "reviewed-phase",
        target: "validated-copy-complete-wasm-feasibility",
        reason: wasmTarget.reason,
        detail: wasmTarget.detail,
        rawPairs: [],
        opportunityEvidencePairs: [],
      };
    }

    const guardAudit = runGuardAudit(wasmTarget);
    const alternatives = alternativeProductionTargets();
    const serializableWasm = { ...wasmTarget };
    delete serializableWasm.instance;
    delete serializableWasm.moduleObject;
    delete serializableWasm.heapBase;
    const interruptCallsPerExecution = Math.floor(SOURCE_LENGTH / 256);
    if (serializableWasm.accounting) {
      serializableWasm.execution = {
        hostToWasmCallsPerPhase: 1,
        wasmToHostInterruptCallbacksPerPhase: interruptCallsPerExecution,
        totalBoundaryRoundTripsPerPhase: 1 + interruptCallsPerExecution,
        directionalBoundaryCrossingsPerPhase:
          2 * (1 + interruptCallsPerExecution),
        inputCopiedBytesPerPhase:
          SOURCE_LENGTH * Uint32Array.BYTES_PER_ELEMENT,
        outputCopiedBytesPerPhase:
          (SOURCE_LENGTH + 1) * Uint32Array.BYTES_PER_ELEMENT,
        validationCanonicalBytesPerPhase:
          SOURCE_LENGTH * Float64Array.BYTES_PER_ELEMENT,
        measuredAggregateCopyAccounting: wasmCopyAccounting,
        interruptCallsDuringMeasurements: wasmInterruptCalls,
        publication:
          "fresh host Number array copied only after isolated completion",
        cleanup: "ephemeral typed views; reusable module/instance",
      };
    }
    const derivedWasmInclusive = wasmComparison.status === "measured"
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
          ])
      : [];
    const adapter = {
      schema: ADAPTER_SCHEMA,
      consumable: buildAuthentication.promotable,
      measurementScope: "reviewed-phase",
      phaseId: "dense-integral",
      compilerDecision: {
        ...source.compilerDecision,
        regionId: source.regionId,
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
              status: "measured-copy-complete-feasibility-not-production-route",
              pairs: wasmComparison.opportunityEvidencePairs,
            }
          : { status: "unavailable", reason: wasmComparison.reason, pairs: [] },
        matureLibrary: alternatives.matureLibrary,
        sourceTransparentNative: alternatives.sourceTransparentNative,
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
        negativeTargets: [
          {
            target: "wasm",
            disposition: wasmComparison.status === "measured"
              ? "measured-feasibility-production-route-inconclusive"
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
            derivedColdInclusiveSamplesNanoseconds: derivedWasmInclusive,
            outputDigest: workload.publicOutputDigest,
            productionRouteClaim: "none",
          },
          alternatives.sourceTransparentNative,
        ],
        matureAlgorithm: alternatives.matureLibrary,
      },
      assemblyInstruction: buildAuthentication.promotable
        ? "Attach only to phase-only profiles with these exact workload, source, compiler-decision, and public-output identities; no production route is authenticated."
        : "Do not assemble opportunity evidence from this unauthenticated smoke report.",
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
        phaseId: "dense-integral",
        sourceFunction: "dense_integral",
        included:
          "complete input validation, normalization, zero bypass, all modular divisions, fresh output materialization, and transactional publication",
        excluded: [
          "public polynomial work outside dense_integral",
          "field/ring/coefficient preparation",
          "compiler and module initialization",
          "derivative replay and independent oracle execution",
          "source-to-Wasm, module compilation, and instantiation (reported separately)",
        ],
      },
      protocol: {
        samples,
        warmups,
        order: "deterministic repeating AB,BA,BA,AB",
        standardEvidence,
        modulus: MODULUS,
        sourceLength: SOURCE_LENGTH,
        zeroSourceIndex: ZERO_SOURCE_INDEX,
      },
      host: hostIdentity(),
      source,
      workload,
      oracle: {
        kind: "independent-javascript-bigint-prime-field-division",
        method:
          "full vector BigInt modular exponentiation plus exact derivative replay",
        executionNanoseconds: oracleNanoseconds,
        phaseOutputDigest,
        phaseOutputLength: expected.length,
        publicOutputDigest: workload.publicOutputDigest,
        publicProjection: workload.publicExpectedOutput,
        derivativeReplay: true,
      },
      exactDifferential: {
        currentGenericDigest: sha256(canonicalJson(genericCold.output)),
        checkedV8Digest: sha256(canonicalJson(v8Cold.output)),
        checkedWasmDigest: wasmCold
          ? sha256(canonicalJson(wasmCold.output))
          : null,
        expectedDigest: phaseOutputDigest,
        outputLength: expected.length,
      },
      coldExecution: {
        genericNanoseconds: genericCold.nanoseconds,
        v8Nanoseconds: v8Cold.nanoseconds,
        wasmNanoseconds: wasmCold?.nanoseconds ?? null,
      },
      targets: {
        generic: {
          availability: "available",
          ...generic.accounting,
          execution: {
            inputElements: SOURCE_LENGTH,
            publishedElements: expected.length,
            publication: "fresh generic field-element list and residue projection",
          },
        },
        v8: {
          availability: "available",
          implementation:
            "handwritten checked feasibility target for the reviewed transform",
          productionRouteClaim: "none",
          emittedFunctionSourceBytes: Buffer.byteLength(
            validateIndexedDivisionInput.toString() +
            checkedV8IndexedDivision.toString() +
            divideResidue.toString() + powModNumber.toString(),
          ),
          execution: {
            entryBoundaryCrossings: 0,
            guardedInputElements: SOURCE_LENGTH,
            validationCanonicalBytesPerPhase:
              SOURCE_LENGTH * Float64Array.BYTES_PER_ELEMENT,
            publishedElements: expected.length,
            outputMaterializedBytesPerPhase:
              expected.length * Float64Array.BYTES_PER_ELEMENT,
            interruptChecksPerPhase: interruptCallsPerExecution,
            publication: "private Number array returned only after completion",
            cleanup: "garbage-collected private arrays",
          },
        },
        wasm: serializableWasm,
        ...alternatives,
      },
      comparisons: { v8: v8Comparison, wasm: wasmComparison },
      guardFallbackExceptionInterruptPublicationAudit: guardAudit,
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
  assert.equal(id, contentId(payload), "feasibility report identity is stale");
  assert.equal(report.productionCompilerRouteClaim, "none");
  assert.equal(report.measurementScope.phaseId, "dense-integral");
  if (report.buildAuthentication.promotable) {
    assert.equal(
      report.buildAuthentication.status,
      "authenticated-current-clean-build",
    );
    assert.equal(report.source.worktreeDirty, false);
    assert.equal(report.opportunityEvidenceAdapter.consumable, true);
    assert.equal(report.protocol.standardEvidence, true);
  } else {
    assert.equal(report.status, "development-smoke-non-promotable");
    assert.equal(report.protocol.standardEvidence, false);
    assert.equal(report.opportunityEvidenceAdapter.consumable, false);
  }
  assert.equal(
    report.exactDifferential.currentGenericDigest,
    report.exactDifferential.expectedDigest,
  );
  assert.equal(
    report.exactDifferential.checkedV8Digest,
    report.exactDifferential.expectedDigest,
  );
  for (const comparison of [report.comparisons.v8, report.comparisons.wasm]) {
    if (comparison.status === "unavailable") {
      assert.equal(comparison.rawPairs.length, 0);
      assert.ok(comparison.reason);
      continue;
    }
    assert.equal(comparison.rawPairs.length, report.protocol.samples);
    comparison.rawPairs.forEach((pair, index) => {
      assert.equal(pair.index, index);
      assert.equal(pair.order, expectedOrder(index));
      assert.ok(pair.baselineNanoseconds > 0);
      assert.ok(pair.feasibleNanoseconds > 0);
      assert.equal(
        pair.baselinePublicOutputDigest,
        report.workload.publicOutputDigest,
      );
      assert.equal(
        pair.feasiblePublicOutputDigest,
        report.workload.publicOutputDigest,
      );
    });
  }
  assert.equal(report.targets.matureLibrary.availability, "available");
  assert.equal(
    report.targets.matureLibrary.disposition,
    "mature-algorithm-available-compiler-candidate-duplicate",
  );
  assert.equal(
    report.targets.sourceTransparentNative.availability,
    "unavailable",
  );
  assert.equal(
    report.guardFallbackExceptionInterruptPublicationAudit.v8Interrupt
      .publications,
    0,
  );
  if (report.targets.wasm.availability === "available") {
    assert.equal(
      report.exactDifferential.checkedWasmDigest,
      report.exactDifferential.expectedDigest,
    );
    assert.equal(
      report.targets.wasm.execution.inputCopiedBytesPerPhase,
      SOURCE_LENGTH * Uint32Array.BYTES_PER_ELEMENT,
    );
  }
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
      "Usage: node bench/optimizer-workloads/indexed-division-target-feasibility.cjs " +
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
  DEGREE,
  MODULUS,
  SCHEMA,
  SOURCE_COEFFICIENTS,
  SOURCE_LENGTH,
  ZERO_SOURCE_INDEX,
  buildPairedComparison,
  checkedV8IndexedDivision,
  checkedWasmIndexedDivision,
  compileWasmTarget,
  derivativeReplay,
  expectedOrder,
  independentBigIntOracle,
  parseArguments,
  runFeasibility,
  validateIndexedDivisionInput,
  validateReport,
};

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
