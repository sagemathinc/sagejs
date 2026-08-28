"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  cpythonPrimePolynomialOracle,
  makeRunReceipt,
  parsePrefixedJson,
  primePolynomialOracle,
  profileSettings,
} = require("../../tools/optimizer-development/workloads.cjs");

function program(settings, modulus, point) {
  return `import json
import time
from sagejs.kernels.polynomial.packed_prime_field import packed_prime_field_polynomial_evaluate
from sagejs.native import execution_mode, is_compiled
_parent_started = time.perf_counter()
F = GF(${modulus})
R = PolynomialRing(F, "x")
parent_seconds = time.perf_counter() - _parent_started
_materialize_started = time.perf_counter()
f = R([index % ${modulus} for index in range(${settings.size})])
value = F(${point})
materialize_seconds = time.perf_counter() - _materialize_started
resources_before = len(F._nativeResourceChildren) if hasattr(F, '_nativeResourceChildren') else 0
for _repeat in range(${settings.warmups}):
    answer = f(value)
_cold_started = time.perf_counter()
answer = f(value)
cold_seconds = time.perf_counter() - _cold_started
samples = []
for _repeat in range(${settings.samples}):
    started = time.perf_counter()
    answer = f(value)
    samples.append(time.perf_counter() - started)
resources_after = len(F._nativeResourceChildren) if hasattr(F, '_nativeResourceChildren') else 0
print('POLYNOMIAL_WORKLOAD|' + json.dumps({
    'answer': str(int(answer.lift())),
    'parent_seconds': parent_seconds,
    'materialize_seconds': materialize_seconds,
    'cold_seconds': cold_seconds,
    'warm_samples_seconds': samples,
    'resources_before': resources_before,
    'resources_after': resources_after,
    'kernel_compiled': is_compiled(packed_prime_field_polynomial_evaluate),
    'kernel_execution_mode': execution_mode(packed_prime_field_polynomial_evaluate),
}, sort_keys=True, separators=(',', ':')))
`;
}

function runSage(root, cache, settings, modulus, point, target) {
  const environment = { ...process.env };
  delete environment.SAGEJS_NATIVE_DISABLE;
  delete environment.SAGEJS_NATIVE_MODE;
  delete environment.SAGEJS_NATIVE_REQUIRED;
  delete environment.SAGEJS_OPT_LEVEL;
  environment.SAGEJS_NATIVE_CACHE_DIR = cache;
  environment.SAGEJS_OPT_LEVEL = "O2";
  if (target === "native") {
    environment.SAGEJS_NATIVE_REQUIRED = "1";
    environment.SAGEJS_NATIVE_MODE = "native";
  } else {
    environment.SAGEJS_NATIVE_DISABLE = "1";
    environment.SAGEJS_NATIVE_MODE = "dynamic";
  }
  const started = process.hrtime.bigint();
  const result = spawnSync(
    process.execPath,
    [path.join(root, "bin/sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      input: program(settings, modulus, point),
      timeout: settings.timeout_seconds * 1000,
      maxBuffer: 16 * 1024 * 1024,
      env: environment,
    },
  );
  const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (result.error || result.status !== 0) {
    throw new Error(`prime polynomial ${target} run failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return {
    target,
    process_seconds: processSeconds,
    ...parsePrefixedJson(result.stdout, "POLYNOMIAL_WORKLOAD|", `prime polynomial ${target}`),
  };
}

function measureHandwrittenV8(settings, modulus, point) {
  const coefficients = Uint32Array.from(
    { length: settings.size },
    (_unused, index) => index % modulus,
  );
  function evaluate() {
    let answer = 0;
    for (let index = coefficients.length - 1; index >= 0; index -= 1) {
      answer = (answer * point + coefficients[index]) % modulus;
    }
    return answer;
  }
  for (let warmup = 0; warmup < settings.warmups; warmup += 1) evaluate();
  let started = process.hrtime.bigint();
  const coldAnswer = evaluate();
  const coldSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  const warmSamplesSeconds = [];
  let answer = coldAnswer;
  for (let sample = 0; sample < settings.samples; sample += 1) {
    started = process.hrtime.bigint();
    answer = evaluate();
    warmSamplesSeconds.push(Number(process.hrtime.bigint() - started) / 1e9);
  }
  return { answer: String(answer), coldSeconds, warmSamplesSeconds };
}

function compileNative(root, cache, timeoutSeconds) {
  const source = path.join(root, "src/lib/sagejs/kernels/polynomial/packed_prime_field.py");
  const started = process.hrtime.bigint();
  const result = spawnSync(
    process.execPath,
    [path.join(root, "bin/sagejs"), "native", "compile", source, "--cache-root", cache],
    { cwd: root, encoding: "utf8", timeout: timeoutSeconds * 1000 },
  );
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (result.error || result.status !== 0) {
    throw new Error(`prime polynomial native compilation failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return { seconds, source: path.relative(root, source).replaceAll("\\", "/") };
}

async function run(context) {
  const { root, catalog, workload, profile, preflight } = context;
  const settings = profileSettings(workload, profile);
  const specification = workload.input.value;
  const modulus = specification.input.modulus;
  const point = specification.input.evaluation_point;
  const javascript = primePolynomialOracle(settings.size, BigInt(modulus), BigInt(point));
  const cpython = cpythonPrimePolynomialOracle(settings.size, modulus, point);
  assert.equal(cpython, javascript);
  if (profile === "standard") {
    assert.equal(javascript, specification.expected);
  }
  const cache = mkdtempSync(path.join(tmpdir(), "sagejs-optimizer-workload-poly-"));
  try {
    const compilation = compileNative(root, cache, settings.timeout_seconds);
    const native = runSage(root, cache, settings, modulus, point, "native");
    const dynamic = runSage(root, cache, settings, modulus, point, "dynamic");
    const v8LowerBound = measureHandwrittenV8(settings, modulus, point);
    assert.equal(native.answer, javascript);
    assert.equal(dynamic.answer, javascript);
    assert.equal(v8LowerBound.answer, javascript);
    assert.equal(native.kernel_compiled, true);
    assert.equal(native.kernel_execution_mode, "native");
    assert.equal(dynamic.kernel_compiled, false);
    assert.equal(dynamic.kernel_execution_mode, "dynamic");
    return makeRunReceipt({
      root,
      catalog,
      workload,
      preflight,
      configuration: { size: settings.size, samples: settings.samples, warmups: settings.warmups, modulus, point },
      compilerOptions: {
        frontendMode: "python",
        optimizationLevel: "O2",
        compilationKind: "runtime-evaluator-and-source-transparent-native",
      },
      target: "native",
      output: {
        canonicalResidue: javascript,
        candidateDispositions: {
          generic: "measured-complete-public-call-dynamic-route",
          generatedJavascript: "unavailable-source-transparent-target",
          library: "unavailable-no-library-route",
          native: "measured-complete-public-call",
          v8: "unavailable-complete-public-call-handwritten-kernel-is-lower-bound-only",
          wasm: "unavailable-complete-public-call",
        },
      },
      oracleEvidence: Object.fromEntries(
        workload.oracles.map((oracle) => [oracle.id, specification.oracleContract]),
      ),
      compilation: [compilation.seconds],
      compilationUnit: "seconds",
      cold: [native.cold_seconds],
      warm: native.warm_samples_seconds,
      executionUnit: "seconds",
      phaseSamples: {
        compile: { cold: compilation.seconds, warm: [compilation.seconds], unit: "seconds" },
        execute: { cold: native.cold_seconds, warm: native.warm_samples_seconds, unit: "seconds" },
        "execute-dynamic": { cold: dynamic.cold_seconds, warm: dynamic.warm_samples_seconds, unit: "seconds" },
        "execute-v8-lower-bound": { cold: v8LowerBound.coldSeconds, warm: v8LowerBound.warmSamplesSeconds, unit: "seconds" },
        materialize: { cold: native.materialize_seconds, warm: [dynamic.materialize_seconds], unit: "seconds" },
        "parent-setup": { cold: native.parent_seconds, warm: [dynamic.parent_seconds], unit: "seconds" },
        session: { cold: native.process_seconds, warm: [dynamic.process_seconds], unit: "seconds" },
      },
      counters: { boundaryCrossings: settings.samples + settings.warmups + 1, copiedBytes: 0, materializations: 2, allocations: 0 },
      resources: { liveBefore: native.resources_before, liveAfter: native.resources_after, highWater: Math.max(native.resources_before, native.resources_after) },
      sourcePaths: ["src/lib/sagejs/kernels/polynomial/packed_prime_field.py"],
    });
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
}

module.exports = { compileNative, measureHandwrittenV8, program, run, runSage };
