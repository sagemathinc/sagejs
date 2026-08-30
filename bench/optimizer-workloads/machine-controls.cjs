"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const createCompiler = require("../../dist/tools/compiler.js").default;
const {
  createPythonCompilerFrontend,
} = require("../../dist/tools/python/compiler-frontend.js");

const {
  detachedRegionEvidence,
  runHarness,
} = require("../optimizer-machine-corpus/harness.cjs");
const {
  machineControlOracle,
  makeRunReceipt,
  profileSettings,
  STATIC_CONTROL_INVENTORY,
  workloadKey,
} = require("../../tools/optimizer-development/workloads.cjs");

const BASE_SIZES = Object.freeze({
  "bounded-integer": 200_000,
  "strict-binary64-array": 50_000,
  "prime-residue-batch": 10_000,
  "fixed-extension": 1_000,
  "packed-container": 100_000,
});

function parserOptions(root, mode) {
  return {
    filename: `bench/optimizer-workloads/${mode}.py`,
    for_linting: true,
    libdir: path.join(root, "src/lib"),
    import_dirs: [],
    exact_integer_literals: true,
    strict_python_scopes: true,
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
    optimization_level: "O2",
  };
}

async function measureStaticControl(root, sourcePath, mode, samples) {
  const source = fs.readFileSync(path.join(root, sourcePath), "utf8");
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  const observations = [];
  let optimizerIr = [];
  try {
    for (let sample = 0; sample < samples; sample += 1) {
      const started = performance.now();
      const ast = frontend.parse(source, parserOptions(root, mode));
      observations.push(performance.now() - started);
      optimizerIr = detachedRegionEvidence(ast.optimization_ir);
    }
  } finally {
    frontend.close();
  }
  return { source, observations, optimizerIr };
}

async function run(context) {
  const { catalog, workload, profile, preflight } = context;
  const mode = workloadKey(workload);
  const settings = profileSettings(workload, profile);
  const specification = workload.input.value;
  const baseSize = BASE_SIZES[mode];
  if (!baseSize) throw new Error(`unsupported machine-control mode ${mode}`);
  const evidence = await runHarness({
    samples: settings.samples,
    compileSamples: settings.samples,
    scale: settings.size / baseSize,
    domains: [mode],
  });
  const domain = evidence.domains[0];
  assert.equal(domain.domain, mode);
  assert.equal(domain.size, settings.size);
  const independent = machineControlOracle(mode, settings.size);
  assert.equal(domain.exact_output_or_bits, independent);
  const staticControl = await measureStaticControl(
    context.root,
    specification.sourcePath,
    mode,
    settings.samples,
  );
  if (profile === "standard" && specification.expected !== undefined) {
    assert.deepEqual(domain.exact_output_or_bits, specification.expected);
  }
  const optimizer = staticControl.optimizerIr;
  const selected = optimizer.filter((region) => region.selected);
  if (specification.route.selection === "required") {
    assert.ok(selected.some((region) => region.pass_id === specification.route.expected_pass));
  } else if (specification.route.selection === "forbidden") {
    assert.equal(selected.length, 0);
  }
  const selectedCandidates = optimizer.flatMap((region) =>
    region.selected
      ? (region.candidates || []).filter((candidate) => candidate.availability === "selected")
      : [],
  );
  const numericCost = (candidate, key) =>
    Number.isSafeInteger(candidate.cost?.[key]) ? candidate.cost[key] : 0;
  const counters = selectedCandidates.reduce((answer, candidate) => ({
    boundaryCrossings: answer.boundaryCrossings + numericCost(candidate, "boundary_crossings"),
    copiedBytes: answer.copiedBytes + numericCost(candidate, "copied_bytes"),
    materializations: answer.materializations + numericCost(candidate, "materializations"),
    allocations: answer.allocations + numericCost(candidate, "allocations"),
  }), { boundaryCrossings: 0, copiedBytes: 0, materializations: 0, allocations: 0 });
  const resources = domain.execution.sagejs_o2.resources;
  return makeRunReceipt({
    root: context.root,
    catalog,
    workload,
    preflight,
    configuration: {
      profile,
      size: settings.size,
      samples: settings.samples,
      warmups: settings.warmups,
      domain: mode,
    },
    compilerOptions: {
      frontendMode: "sage",
      optimizationLevel: "O2",
      exactIntegerLiterals: true,
      strictPythonScopes: true,
      scopedFlags: {
        dictLiterals: true,
        overloadGetitem: true,
        boundMethods: true,
        sequentialDefinitions: true,
      },
    },
    target: specification.route.expected_pass === null ? "generic" : "v8",
    output: { encoding: specification.encoding, value: independent },
    oracleEvidence: Object.fromEntries(
      workload.oracles.map((oracle) => [oracle.id, specification.oracleContract]),
    ),
    compilation: staticControl.observations,
    compilationUnit: "milliseconds",
    cold: [domain.execution.sagejs_o2.cold_execution_ms],
    warm: domain.execution.sagejs_o2.warm_samples_ms,
    executionUnit: "milliseconds",
    phaseSamples: {
      compile: { cold: staticControl.observations[0], warm: staticControl.observations.slice(1).length ? staticControl.observations.slice(1) : staticControl.observations, unit: "milliseconds" },
      execute: { cold: domain.execution.sagejs_o2.cold_execution_ms, warm: domain.execution.sagejs_o2.warm_samples_ms, unit: "milliseconds" },
    },
    optimizerIr: optimizer,
    counters,
    resources: { liveBefore: resources.before, liveAfter: resources.after_warm, highWater: Math.max(resources.before, resources.after_cold, resources.after_warm) },
    sourcePaths: [
      specification.sourcePath,
      STATIC_CONTROL_INVENTORY,
      "bench/optimizer-machine-corpus/harness.cjs",
    ],
  });
}

module.exports = { BASE_SIZES, measureStaticControl, parserOptions, run };
