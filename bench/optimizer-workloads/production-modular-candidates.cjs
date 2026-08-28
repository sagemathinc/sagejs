"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  makeRunReceipt,
  parsePrefixedJson,
  profileSettings,
  workloadKey,
} = require("../../tools/optimizer-development/workloads.cjs");
const {
  pythonExecutable,
} = require("../../tools/python-executable.cjs");

const PAYLOAD_PREFIX = "PRODUCTION_MODULAR_WORKLOAD|";

const WORKLOADS = Object.freeze({
  "public-prime-polynomial-integral": Object.freeze({
    sourcePath:
      "bench/optimizer-workloads/public-prime-polynomial-integral.py",
    language: "sage",
    productionCall: "_production_once()",
    expectedOutput: Object.freeze([
      70_000,
      true,
      Object.freeze([0, 65_530, 32_767, 9, 0, 65_530, 52_453]),
    ]),
  }),
  "number-field-local-polygons": Object.freeze({
    sourcePath: "bench/optimizer-workloads/number-field-local-polygons.py",
    language: "sage-and-cpython",
    productionCall: "_production_once(__degree_32_repetitions)",
  }),
  "hyperelliptic-local-reduction": Object.freeze({
    sourcePath:
      "bench/optimizer-workloads/hyperelliptic-local-reduction.py",
    language: "sage",
    productionCall: "_production_once()",
    expectedEulerFactors: Object.freeze([
      Object.freeze([1, -1, 5_003, -5_003]),
      Object.freeze([1, -183, 10_191, -10_009]),
      Object.freeze([1, 111, 19_899, -20_011]),
    ]),
  }),
  "number-field-cubic-factor-base": Object.freeze({
    sourcePath:
      "bench/optimizer-workloads/number-field-cubic-factor-base.py",
    language: "sage",
    productionCall: "_production_once()",
    costGateCall: "_cost_gate_once()",
    expectedOutput: Object.freeze([
      94,
      91,
      "4de40d4659dadeda0b2e2ce8d06362bc15de9367bc173273cd0c74bd0e28fc04",
      true,
    ]),
    expectedCostGate: Object.freeze([1, 1, 1]),
  }),
});

function checkedCount(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be an integer at least ${minimum}`);
  }
  return value;
}

function normalizeSettings(settings = {}) {
  return Object.freeze({
    samples: checkedCount(settings.samples ?? 3, "samples", 1),
    warmups: checkedCount(settings.warmups ?? 1, "warmups"),
    degree32Repetitions: checkedCount(
      settings.degree_32_repetitions ?? settings.size ?? 20,
      "degree-32 repetitions",
      1,
    ),
    timeoutSeconds: checkedCount(
      settings.timeout_seconds ?? 180,
      "timeout seconds",
      1,
    ),
  });
}

function phaseProgram(source, sourcePath, selector, settings, root, runtime) {
  const specification = WORKLOADS[selector];
  const pythonPathSetup = runtime === "cpython"
    ? `import sys\nsys.path.insert(0, ${JSON.stringify(path.join(root, "src/lib"))})\n`
    : "";
  const costGate = specification.costGateCall
    ? `__cost_gate_started = time.perf_counter()
__cost_gate_cold_output = ${specification.costGateCall}
__cost_gate_cold_seconds = time.perf_counter() - __cost_gate_started
__cost_gate_samples = []
__cost_gate_output = __cost_gate_cold_output
for __cost_gate_sample in range(${settings.samples}):
    __cost_gate_started = time.perf_counter()
    __cost_gate_output = ${specification.costGateCall}
    __cost_gate_samples.append(time.perf_counter() - __cost_gate_started)
__cost_gate = {
    "cold_seconds": __cost_gate_cold_seconds,
    "warm_samples_seconds": __cost_gate_samples,
    "output": __cost_gate_output,
}
`
    : "__cost_gate = None\n";
  return `import json
import time
${pythonPathSetup}

__top_level_started = time.perf_counter()
${source}
__top_level_seconds = time.perf_counter() - __top_level_started

__prepare_started = time.perf_counter()
__prepare_output = __profile_prepare__()
__prepare_seconds = time.perf_counter() - __prepare_started
__degree_32_repetitions = ${settings.degree32Repetitions}

__production_started = time.perf_counter()
__cold_payload = ${WORKLOADS[selector].productionCall}
__production_cold_seconds = time.perf_counter() - __production_started
__oracle_started = time.perf_counter()
__cold_output = _exact_output(__cold_payload)
__oracle_cold_seconds = time.perf_counter() - __oracle_started

for __warmup in range(${settings.warmups}):
    __warmup_payload = ${WORKLOADS[selector].productionCall}
    _exact_output(__warmup_payload)

__production_samples = []
__oracle_samples = []
__output = __cold_output
for __sample in range(${settings.samples}):
    __production_started = time.perf_counter()
    __payload = ${WORKLOADS[selector].productionCall}
    __production_samples.append(time.perf_counter() - __production_started)
    __oracle_started = time.perf_counter()
    __output = _exact_output(__payload)
    __oracle_samples.append(time.perf_counter() - __oracle_started)

${costGate}
print(${JSON.stringify(PAYLOAD_PREFIX)} + json.dumps({
    "schema": "sagejs.optimizer-production-modular-workload/v1",
    "selector": ${JSON.stringify(selector)},
    "runtime": ${JSON.stringify(runtime)},
    "setup": {
        "top_level_seconds": __top_level_seconds,
        "prepare_seconds": __prepare_seconds,
        "prepare_output": __prepare_output,
    },
    "production": {
        "cold_seconds": __production_cold_seconds,
        "warm_samples_seconds": __production_samples,
    },
    "exact_oracle": {
        "cold_seconds": __oracle_cold_seconds,
        "warm_samples_seconds": __oracle_samples,
    },
    "cost_gate": __cost_gate,
    "output": __output,
}, sort_keys=True, separators=(",", ":")))
`;
}

function validateSeconds(value, label) {
  assert.ok(Number.isFinite(value) && value >= 0, `${label} is not a duration`);
}

function validatePayload(payload, selector, runtime, settings) {
  assert.equal(
    payload.schema,
    "sagejs.optimizer-production-modular-workload/v1",
  );
  assert.equal(payload.selector, selector);
  assert.equal(payload.runtime, runtime);
  validateSeconds(payload.setup.top_level_seconds, "top-level setup");
  validateSeconds(payload.setup.prepare_seconds, "profile preparation");
  validateSeconds(payload.production.cold_seconds, "cold production");
  validateSeconds(payload.exact_oracle.cold_seconds, "cold exact oracle");
  assert.equal(payload.production.warm_samples_seconds.length, settings.samples);
  assert.equal(payload.exact_oracle.warm_samples_seconds.length, settings.samples);
  for (const [index, value] of payload.production.warm_samples_seconds.entries()) {
    validateSeconds(value, `production sample ${index}`);
  }
  for (const [index, value] of payload.exact_oracle.warm_samples_seconds.entries()) {
    validateSeconds(value, `oracle sample ${index}`);
  }
  if (WORKLOADS[selector].costGateCall) {
    assert.ok(payload.cost_gate);
    validateSeconds(payload.cost_gate.cold_seconds, "cold cost gate");
    assert.equal(payload.cost_gate.warm_samples_seconds.length, settings.samples);
    for (const [index, value] of payload.cost_gate.warm_samples_seconds.entries()) {
      validateSeconds(value, `cost-gate sample ${index}`);
    }
  } else {
    assert.equal(payload.cost_gate, null);
  }
  return payload;
}

function runUninstrumented(root, selector, rawSettings = {}, runtime = "sage") {
  const specification = WORKLOADS[selector];
  if (!specification) throw new Error(`unknown production workload ${selector}`);
  if (runtime !== "sage" && runtime !== "cpython") {
    throw new Error(`unknown production workload runtime ${runtime}`);
  }
  if (runtime === "cpython" && specification.language !== "sage-and-cpython") {
    throw new Error(`${selector} is not an ordinary-CPython executable workload`);
  }
  const settings = normalizeSettings(rawSettings);
  const filename = path.join(root, specification.sourcePath);
  const source = fs.readFileSync(filename, "utf8");
  const executionRoot = runtime === "sage"
    ? path.resolve(process.env.SAGEJS_BENCH_ROOT || root)
    : root;
  const command = runtime === "sage" ? process.execPath : pythonExecutable();
  const program = phaseProgram(
    source,
    specification.sourcePath,
    selector,
    settings,
    root,
    runtime,
  );
  let temporaryDirectory = null;
  let input = program;
  let args = ["-"];
  if (runtime === "sage") {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "sagejs-production-modular-workload-"),
    );
    const programPath = path.join(temporaryDirectory, "runner.py");
    fs.writeFileSync(programPath, program);
    args = [path.join(executionRoot, "bin/sagejs-source.cjs"), "--python", programPath];
    input = undefined;
  }
  const environment = { ...process.env };
  delete environment.SAGEJS_NATIVE_DISABLE;
  delete environment.SAGEJS_NATIVE_MODE;
  delete environment.SAGEJS_NATIVE_REQUIRED;
  environment.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";
  environment.SAGEJS_OPT_LEVEL = "O2";
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: executionRoot,
    encoding: "utf8",
    env: environment,
    input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: settings.timeoutSeconds * 1_000,
  });
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (result.error || result.status !== 0) {
    throw new Error(
      `${selector} ${runtime} run failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  const payload = validatePayload(
    parsePrefixedJson(result.stdout, PAYLOAD_PREFIX, `${selector} ${runtime}`),
    selector,
    runtime,
    settings,
  );
  return Object.freeze({
    ...payload,
    process_seconds: processSeconds,
    raw_stdout: result.stdout,
  });
}

function cpythonNormalizationEulerFactors(primes = [5_003, 10_009, 20_011]) {
  for (const prime of primes) checkedCount(prime, "normalization prime", 3);
  const source = `import json
primes = ${JSON.stringify(primes)}
factors = []
for prime in primes:
    points = 1
    for x in range(prime):
        value = (x*x*x + 1) % prime
        if value == 0:
            points += 1
        elif pow(value, (prime - 1) // 2, prime) == 1:
            points += 2
    trace = prime + 1 - points
    factors.append([1, -(trace + 1), prime + trace, -prime])
print(json.dumps(factors, separators=(",", ":")))
`;
  const result = spawnSync(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: source,
    timeout: 30_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `CPython normalization point count failed: ${result.error?.message || result.stderr}`,
    );
  }
  return JSON.parse(result.stdout);
}

function validateExactEvidence(selector, sage, cpython = null) {
  const specification = WORKLOADS[selector];
  if (selector === "public-prime-polynomial-integral") {
    assert.deepEqual(sage.output, specification.expectedOutput);
    return { output: sage.output, oracle: "exact-derivative-replay" };
  }
  if (selector === "number-field-local-polygons") {
    assert.ok(cpython);
    assert.deepEqual(sage.output, cpython.output);
    return { output: sage.output, oracle: "same-source-cpython-differential" };
  }
  if (selector === "number-field-cubic-factor-base") {
    assert.deepEqual(sage.output, specification.expectedOutput);
    assert.deepEqual(sage.cost_gate.output, specification.expectedCostGate);
    return {
      output: sage.output,
      costGate: sage.cost_gate.output,
      oracle: "exact-generic-factor-replay-and-payload-digest",
    };
  }
  const pointCountFactors = cpythonNormalizationEulerFactors();
  assert.deepEqual(pointCountFactors, specification.expectedEulerFactors);
  const sageFactors = sage.output.map((row) => row[1]);
  assert.deepEqual(sageFactors, pointCountFactors);
  return {
    output: sage.output,
    normalizationEulerFactors: pointCountFactors,
    oracle: "independent-cpython-point-count",
  };
}

function receiptPhases(sage, cpython = null) {
  const phases = {
    "exact-oracle": {
      cold: sage.exact_oracle.cold_seconds,
      warm: sage.exact_oracle.warm_samples_seconds,
      unit: "seconds",
    },
    prepare: {
      cold: sage.setup.prepare_seconds,
      warm: [sage.setup.prepare_seconds],
      unit: "seconds",
    },
    production: {
      cold: sage.production.cold_seconds,
      warm: sage.production.warm_samples_seconds,
      unit: "seconds",
    },
    "top-level-setup": {
      cold: sage.setup.top_level_seconds,
      warm: [sage.setup.top_level_seconds],
      unit: "seconds",
    },
  };
  if (cpython) {
    phases["cpython-exact-oracle"] = {
      cold: cpython.exact_oracle.cold_seconds,
      warm: cpython.exact_oracle.warm_samples_seconds,
      unit: "seconds",
    };
    phases["cpython-prepare"] = {
      cold: cpython.setup.prepare_seconds,
      warm: [cpython.setup.prepare_seconds],
      unit: "seconds",
    };
    phases["cpython-production"] = {
      cold: cpython.production.cold_seconds,
      warm: cpython.production.warm_samples_seconds,
      unit: "seconds",
    };
    phases["cpython-top-level-setup"] = {
      cold: cpython.setup.top_level_seconds,
      warm: [cpython.setup.top_level_seconds],
      unit: "seconds",
    };
  }
  if (sage.cost_gate) {
    phases["cost-gate"] = {
      cold: sage.cost_gate.cold_seconds,
      warm: sage.cost_gate.warm_samples_seconds,
      unit: "seconds",
    };
  }
  return phases;
}

async function run(context) {
  const { root, catalog, workload, profile, preflight } = context;
  const selector = workloadKey(workload);
  const settings = profileSettings(workload, profile);
  const sage = runUninstrumented(root, selector, settings, "sage");
  const cpython = selector === "number-field-local-polygons"
    ? runUninstrumented(root, selector, settings, "cpython")
    : null;
  const exact = validateExactEvidence(selector, sage, cpython);
  const specification = workload.input.value;
  return makeRunReceipt({
    root,
    catalog,
    workload,
    preflight,
    configuration: {
      profile,
      samples: settings.samples,
      warmups: settings.warmups,
      degree32Repetitions: settings.degree_32_repetitions ?? settings.size ?? 20,
      evidenceBoundary: "uninstrumented-public-production-and-exact-oracle-phases",
    },
    compilerOptions: {
      frontendMode: "python",
      optimizationLevel: "O2",
      compilationKind: "runtime-evaluator-production-workload",
    },
    target: "generic",
    output: {
      ...exact,
      optimizerSelectionClaim: "none-workload-evidence-only",
    },
    oracleEvidence: Object.fromEntries(
      workload.oracles.map((oracle) => [oracle.id, specification.oracleContract]),
    ),
    compilation: [0],
    compilationUnit: "microseconds",
    cold: [sage.production.cold_seconds + sage.exact_oracle.cold_seconds],
    warm: sage.production.warm_samples_seconds.map(
      (value, index) => value + sage.exact_oracle.warm_samples_seconds[index],
    ),
    executionUnit: "seconds",
    phaseSamples: receiptPhases(sage, cpython),
    counters: {
      boundaryCrossings: 0,
      copiedBytes: 0,
      materializations: 0,
      allocations: 0,
    },
    resources: { liveBefore: 0, liveAfter: 0, highWater: 0 },
    sourcePaths: [WORKLOADS[selector].sourcePath],
  });
}

module.exports = {
  PAYLOAD_PREFIX,
  WORKLOADS,
  cpythonNormalizationEulerFactors,
  normalizeSettings,
  phaseProgram,
  receiptPhases,
  run,
  runUninstrumented,
  validateExactEvidence,
  validatePayload,
};
