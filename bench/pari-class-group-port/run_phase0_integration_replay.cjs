#!/usr/bin/env node
"use strict";

// Durable orchestration for the Phase-0 integration gates. Mathematical work
// remains in the existing attributed producers/checkers; this file gives those
// programs explicit storage, dependency, hashing, and resume semantics.

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const schema = "sagejs.pari-class-group/phase0-integration-replay-v1";
const archiveSha256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const buch2Sha256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";

function usage(error) {
  const message = `${error ? `${error}\n\n` : ""}Usage:
  node bench/pari-class-group-port/run_phase0_integration_replay.cjs list
  node bench/pari-class-group-port/run_phase0_integration_replay.cjs run \\
    --artifact-root DIRECTORY --pari-root DIRECTORY --pari-archive FILE \\
    [--through STAGE | --stage STAGE] [--force-stage STAGE] [--allow-dirty]
  node bench/pari-class-group-port/run_phase0_integration_replay.cjs verify \\
    --artifact-root DIRECTORY [--stage STAGE]

Every generated path is below --artifact-root. The default run proceeds through
the cubic candidate. Quartic native replay is deliberately a separately named,
resource-limited stage.`;
  (error ? console.error : console.log)(message);
  process.exit(error ? 2 : 0);
}

function parseOptions(arguments_) {
  const options = { force: new Set() };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }
    const names = new Map([
      ["--artifact-root", "artifactRoot"],
      ["--pari-root", "pariRoot"],
      ["--pari-archive", "pariArchive"],
      ["--through", "through"],
      ["--stage", "stage"],
      ["--force-stage", "forceStage"],
    ]);
    const name = names.get(argument);
    if (name === undefined || arguments_[index + 1] === undefined) {
      usage(`unknown or incomplete option: ${argument}`);
    }
    const value = arguments_[++index];
    if (name === "forceStage") options.force.add(value);
    else {
      if (options[name] !== undefined) usage(`duplicate option: ${argument}`);
      options[name] = value;
    }
  }
  if (options.artifactRoot !== undefined) {
    options.artifactRoot = path.resolve(options.artifactRoot);
  }
  if (options.pariRoot !== undefined) options.pariRoot = path.resolve(options.pariRoot);
  if (options.pariArchive !== undefined) {
    options.pariArchive = path.resolve(options.pariArchive);
  }
  return options;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filename, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.new-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
  });
  fs.renameSync(temporary, filename);
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function relativeToArtifacts(context, filename) {
  const relative = path.relative(context.artifactRoot, path.resolve(filename));
  assert(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    `generated path escaped artifact root: ${filename}`);
  return relative;
}

function resolveArtifact(context, relative) {
  const filename = path.resolve(context.artifactRoot, relative);
  relativeToArtifacts(context, filename);
  return filename;
}

function checker(name) {
  return path.join(__dirname, name);
}

function jsonFromStdout(stdout) {
  const text = stdout.trim();
  assert(text.length > 0, "checker emitted empty stdout");
  try {
    return JSON.parse(text);
  } catch (_) {
    for (const line of text.split("\n").reverse()) {
      try {
        return JSON.parse(line);
      } catch (_) {
        // Continue through diagnostic lines.
      }
    }
  }
  throw new Error("checker stdout has no JSON result");
}

function currentReceipt(context, name) {
  const pointer = path.join(context.artifactRoot, "stages", name, "current.json");
  if (!fs.existsSync(pointer)) return null;
  const selected = readJson(pointer);
  assert.equal(selected.schema, schema);
  assert.equal(selected.stage, name);
  const filename = resolveArtifact(context, selected.receipt);
  const bytes = fs.readFileSync(filename);
  assert.equal(sha256(bytes), selected.receiptSha256, `stale receipt pointer: ${name}`);
  return { filename, bytes, receipt: JSON.parse(bytes) };
}

function outputPath(context, name, key = "fixture") {
  const current = currentReceipt(context, name);
  assert(current, `missing dependency stage: ${name}`);
  const output = current.receipt.outputs[key];
  assert(output, `stage ${name} has no ${key} output`);
  const filename = resolveArtifact(context, output.path);
  assert.equal(hashFile(filename), output.sha256, `changed ${name}/${key} output`);
  return filename;
}

function tracePath(context, name) {
  return outputPath(context, name, "trace");
}

function commandNode(script, ...arguments_) {
  return { command: process.execPath, arguments: [checker(script), ...arguments_] };
}

const stages = new Map();
function stage(name, specification) {
  assert(!stages.has(name));
  stages.set(name, Object.freeze({ name, ...specification }));
}

stage("analytic", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode(
    "check_analytic_inverse_hr.cjs", context.pariRoot, context.pariArchive,
  ),
  validate: (summary, fixture) => {
    assert.equal(summary.cases, 4);
    assert(Array.isArray(fixture.cases) && fixture.cases.length === 4);
    assert(Array.isArray(fixture.nativeOutputs) && fixture.nativeOutputs.length > 0);
  },
});

stage("splitting-fixture", {
  dependencies: ["analytic"],
  command: (context) => commandNode(
    "check_int64_prime_degree_catalog.cjs", outputPath(context, "analytic"),
  ),
  validate: (summary, fixture) => {
    assert.equal(summary.cases, 4);
    assert.deepEqual(summary.primeCounts, [1230, 63, 64, 63]);
    assert.equal(fixture.packets.length, 4);
    assert.deepEqual(fixture.expected[0].args[22].slice(0, 4),
      ["0", "1230", "1833", "2270"]);
  },
  additionalOutputs: (summary) => {
    const directory = path.dirname(path.resolve(summary.replayCoreSourcePath));
    return {
      "baseline-core": summary.replayCoreSourcePath,
      "baseline-manifest": path.join(directory, "manifest.json"),
      "baseline-addon": path.join(directory, "build/Release/sagejs_native_kernel.node"),
      "baseline-module": path.join(directory, "index.cjs"),
      "baseline-binding": path.join(directory, "binding.gyp"),
    };
  },
  postprocess: (summary, attempt) => {
    const source = path.dirname(path.resolve(summary.coreSourcePath));
    const destination = path.join(attempt, "generated", "baseline-build");
    fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
    summary.replayCoreSourcePath = path.join(destination, "kernel_core.c");
    summary.originalCacheCoreSourcePath = summary.coreSourcePath;
  },
});

stage("splitting-replay", {
  dependencies: ["splitting-fixture"],
  command: (context) => {
    const fixture = outputPath(context, "splitting-fixture");
    const producer = currentReceipt(context, "splitting-fixture").receipt.summary;
    const baseline = path.dirname(path.resolve(producer.replayCoreSourcePath));
    assert(fs.existsSync(path.join(baseline, "manifest.json")),
      "splitting producer did not retain its baseline build manifest");
    return commandNode("check_stage_a_catalog_region.cjs", fixture, baseline, root,
      "stage-a");
  },
  validate: (summary) => {
    assert.equal(summary.mode, "stage-a");
    assert.equal(summary.frozenPackets, 4);
    assert.equal(summary.activeOutputs, 7081);
    assert.equal(summary.malformedPackets.length, 9);
    assert(summary.malformedPackets.every((entry) => entry.outcome));
  },
  noFixture: true,
});

stage("cubic-collector", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_actual_initial_collector.cjs",
    context.pariRoot, context.pariArchive, "--native", "--field", "1"),
  validate: (summary, fixture) => {
    assert.equal(summary.result[0].field, 1);
    assert(Array.isArray(fixture.nativeOutputs) && fixture.nativeOutputs.length > 0);
  },
});

stage("cubic-driver", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_default_driver_trace.cjs",
    context.pariRoot, context.pariArchive, "--field1"),
  validate: (summary, fixture) => {
    assert.equal(summary.field, 1);
    assert(Array.isArray(fixture) && fixture.length > 0);
  },
  fixtureName: "trace.json",
  fixtureKey: "trace",
});

stage("cubic-acceptance", {
  dependencies: ["analytic", "cubic-collector", "cubic-driver"],
  requiresPari: true,
  command: (context) => commandNode("check_post_hnf_acceptance.cjs",
    context.pariRoot, context.pariArchive,
    "--collector-fixtures", outputPath(context, "cubic-collector"),
    "--analytic-fixtures", outputPath(context, "analytic"),
    "--driver-trace", tracePath(context, "cubic-driver")),
  validate: (summary, fixture) => {
    assert(summary.genuineAcceptedCases >= 1);
    assert(Array.isArray(fixture) && fixture.length === 2);
  },
});

stage("cubic-candidate", {
  dependencies: ["analytic", "cubic-collector", "cubic-acceptance"],
  command: (context) => commandNode("check_prepared_class_group_attempt.cjs",
    outputPath(context, "cubic-collector"),
    outputPath(context, "cubic-acceptance"),
    "--analytic-fixtures", outputPath(context, "analytic"), "--export-inputs"),
  validate: (summary, fixture) => {
    const accepted = summary.cp.find((entry) => entry.action === 0);
    assert(accepted, "cubic candidate did not accept");
    assert.equal(accepted.classNumber, "3");
    assert.deepEqual(accepted.invariants, ["3"]);
    assert.equal(summary.oneNativeCall, true);
    assert.equal(fixture.summary.outputHash, summary.outputHash);
  },
  additionalOutputs: (summary) => ({ "prepared-inputs": summary.inputArtifact }),
});

stage("resident-cubic-collector", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_actual_initial_collector.cjs",
    context.pariRoot, context.pariArchive, "--native", "--field", "0"),
  validate: (summary, fixture) => {
    assert.equal(summary.result[0].field, 0);
    assert(Array.isArray(fixture.nativeOutputs) && fixture.nativeOutputs.length > 0);
  },
});

stage("resident-cubic-driver", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_default_driver_trace.cjs",
    context.pariRoot, context.pariArchive, "--field0"),
  validate: (summary, fixture) => {
    assert.equal(summary.field, 0);
    assert(Array.isArray(fixture) && fixture.length > 0);
  },
  fixtureName: "trace.json",
  fixtureKey: "trace",
});

stage("resident-cubic-acceptance", {
  dependencies: ["analytic", "resident-cubic-collector", "resident-cubic-driver"],
  requiresPari: true,
  command: (context) => commandNode("check_post_hnf_acceptance.cjs",
    context.pariRoot, context.pariArchive,
    "--collector-fixtures", outputPath(context, "resident-cubic-collector"),
    "--analytic-fixtures", outputPath(context, "analytic"),
    "--driver-trace", tracePath(context, "resident-cubic-driver"),
    "--driver-field", "0"),
  validate: (summary, fixture) => {
    assert(summary.genuineAcceptedCases >= 1);
    assert(Array.isArray(fixture) && fixture.length === 2);
  },
});

stage("resident-cubic-input", {
  dependencies: ["analytic", "resident-cubic-collector", "resident-cubic-acceptance"],
  command: (context) => commandNode("check_prepared_class_group_attempt.cjs",
    outputPath(context, "resident-cubic-collector"),
    outputPath(context, "resident-cubic-acceptance"),
    "--analytic-fixtures", outputPath(context, "analytic"), "--export-inputs"),
  validate: (summary, fixture) => {
    const accepted = summary.cp.find((entry) => entry.action === 0);
    assert(accepted, "resident cubic input did not accept");
    assert.equal(accepted.classNumber, "1");
    assert.deepEqual(accepted.invariants, []);
    assert.equal(summary.oneNativeCall, true);
    assert.equal(fixture.summary.outputHash, summary.outputHash);
  },
  additionalOutputs: (summary) => ({ "prepared-inputs": summary.inputArtifact }),
});

stage("kummer-prepared-nf", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_kummer_prime_descriptor.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary, fixture) => {
    assert(summary.cases > 0);
    assert.deepEqual(summary.backends, ["cpython", "javascript", "gmp", "tagged"]);
    assert(fixture.rows.some((entry) => entry.field === 0 && entry.index === "1"));
  },
});

stage("initial-kummer", {
  dependencies: ["kummer-prepared-nf"],
  requiresPari: true,
  command: (context) => commandNode("check_initial_kummer_catalog.cjs",
    context.pariRoot, context.pariArchive, outputPath(context, "kummer-prepared-nf")),
  validate: (summary, fixture) => {
    assert.equal(summary.cases, 7);
    assert.equal(summary.invalidControls, 8);
    assert.deepEqual(summary.backends, ["cpython", "javascript", "gmp", "tagged"]);
    assert.equal(fixture.prepared.field, 0);
  },
});

function residentCubicReplay(backend) {
  return {
    dependencies: ["resident-cubic-input", "analytic", "initial-kummer"],
    command: (context) => commandNode("check_resident_generated_class_attempt.cjs",
      outputPath(context, "resident-cubic-input", "prepared-inputs"),
      outputPath(context, "analytic"), outputPath(context, "initial-kummer"),
      "--backend", backend),
    validate: (summary) => {
      assert.equal(summary.backend, backend);
      assert.equal(summary.action, "0");
      assert.equal(summary.classNumber, "1");
      assert.equal(summary.relations, "73");
      assert.deepEqual(summary.regulator,
        ["4510874135066530692003455889568986616389323011914280231659", "192", "20"]);
      assert.equal(summary.lateFailureAndPartialReentry, true);
    },
    fixtureName: "result.json",
    additionalOutputs: (summary) => ({ output: path.join(summary.directory, "output.json") }),
  };
}
for (const backend of ["cpython", "javascript", "gmp", "tagged"]) {
  stage(`resident-cubic-${backend}`, residentCubicReplay(backend));
}

stage("quartic-collector", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_actual_initial_collector.cjs",
    context.pariRoot, context.pariArchive, "--native", "--field", "2"),
  validate: (summary, fixture) => {
    assert.equal(summary.result[0].field, 2);
    assert(Array.isArray(fixture.nativeOutputs) && fixture.nativeOutputs.length > 0);
  },
});

stage("quartic-driver", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_default_driver_trace.cjs",
    context.pariRoot, context.pariArchive, "--field2"),
  validate: (summary, fixture) => {
    assert.equal(summary.field, 2);
    // This checker records the driver's summarized HNF boundary as `hnf`.
    // The lower-level `hnfadd_input` event belongs to the separate append and
    // continuation checkers below.  Requiring it here made a successful fresh
    // driver trace fail replay validation after the historical diagnostics
    // were split into their current source-transparent checkers.
    assert(Array.isArray(fixture) && fixture.some((entry) => entry.event === "hnf"));
  },
  fixtureName: "trace.json",
  fixtureKey: "trace",
});

stage("quartic-continuation", {
  dependencies: ["quartic-collector", "quartic-driver"],
  requiresPari: true,
  command: (context, attempt) => {
    // The historical diagnostic accidentally embedded its author's scratch
    // checkout. Preserve and hash its body, but make that one path an explicit
    // generated input to this replay. A source-shape assertion fails closed if
    // the upstream checker is later repaired or otherwise changes.
    const original = fs.readFileSync(checker("check_actual_collector_continuation.cjs"), "utf8");
    const needle = "'/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4'";
    assert.equal(original.split(needle).length, 2,
      "continuation checker no longer has the expected single historical path");
    const generated = original.replace(needle, JSON.stringify(context.pariRoot));
    const generatedPath = path.join(attempt, "generated", "continuation-launcher.cjs");
    // Compile the adjusted text with the original filename so Node's relative
    // require and __dirname semantics remain exactly those of the checker.
    fs.writeFileSync(generatedPath, `"use strict";\n` +
      `const Module = require("node:module");\n` +
      `const path = require("node:path");\n` +
      `const filename = ${JSON.stringify(checker("check_actual_collector_continuation.cjs"))};\n` +
      `const child = new Module(filename, module);\n` +
      `child.filename = filename;\n` +
      `child.paths = Module._nodeModulePaths(path.dirname(filename));\n` +
      `child._compile(${JSON.stringify(generated)}, filename);\n`);
    return {
      command: process.execPath,
      arguments: [generatedPath, outputPath(context, "quartic-collector"),
        tracePath(context, "quartic-driver"), "--source-only"],
      generatedChecker: {
        originalSha256: sha256(original),
        generatedSha256: sha256(generated),
      },
    };
  },
  validate: (summary, fixture) => {
    assert.equal(summary.field, 2);
    assert.deepEqual(summary.passes.map((entry) => entry.last), [151, 152]);
    assert(fixture.preparedInput && fixture.appends.length === 2);
  },
});

function quarticReplay(backend) {
  return {
    dependencies: ["analytic", "quartic-collector", "quartic-driver",
      "quartic-continuation"],
    command: (context) => ({
      command: "prlimit",
      arguments: ["--as=4294967296", "--", process.execPath,
        checker("check_prepared_class_group_resumable.cjs"),
        outputPath(context, "quartic-continuation"), outputPath(context, "analytic"),
        tracePath(context, "quartic-driver"), outputPath(context, "quartic-collector"),
        "--backend", backend],
      extraEnvironment: { NODE_OPTIONS: "--max-old-space-size=1536" },
    }),
    validate: (summary, fixture) => {
      assert.equal(summary.backend, backend);
      assert.equal(summary.passes, 3);
      assert.equal(summary.actual.status, 0);
      assert.equal(summary.actual.classNumber, "1");
      assert.deepEqual(summary.actual.driverState.slice(0, 6), [4, 0, 3, 152, 1, 0]);
      assert(fixture.expected.length === 3);
    },
  };
}
stage("quartic-retry-cpython", {
  dependencies: ["analytic", "quartic-collector", "quartic-driver",
    "quartic-continuation"],
  command: (context) => ({
    command: process.execPath,
    arguments: [checker("check_prepared_class_group_resumable.cjs"),
      outputPath(context, "quartic-continuation"), outputPath(context, "analytic"),
      tracePath(context, "quartic-driver"), outputPath(context, "quartic-collector"),
      "--source-only"],
  }),
  validate: (summary, fixture) => {
    assert.equal(summary.expected.length, 3);
    assert.equal(summary.expected[2].status, 0);
    assert.equal(summary.expected[2].classNumber, "1");
    assert.equal(fixture.expected.length, 3);
  },
  fixtureName: "inputs.json",
});
stage("quartic-retry-javascript", quarticReplay("javascript"));
stage("quartic-retry-gmp", quarticReplay("gmp"));
stage("quartic-retry-tagged", quarticReplay("tagged"));

stage("field3-collector", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_actual_initial_collector.cjs",
    context.pariRoot, context.pariArchive, "--native", "--field", "3"),
  validate: (summary, fixture) => {
    assert.equal(summary.result[0].field, 3);
    assert(fixture.nativeOutputs.some((entry) => entry.backend === "gmp" && entry.field === 3));
  },
});

stage("field3-driver", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_default_driver_trace.cjs",
    context.pariRoot, context.pariArchive, "--field3"),
  validate: (summary, fixture) => {
    assert.equal(summary.field, 3);
    assert(Array.isArray(fixture) && fixture.some((entry) => entry.event === "result"));
  },
  fixtureName: "trace.json",
  fixtureKey: "trace",
});

stage("field3-retry", {
  dependencies: ["analytic", "field3-collector", "field3-driver"],
  command: (context) => ({
    command: "prlimit",
    arguments: ["--as=6442450944", "--", process.execPath,
      checker("check_prepared_class_group_resumable_field3.cjs"),
      outputPath(context, "field3-collector"), outputPath(context, "analytic"),
      tracePath(context, "field3-driver")],
    extraEnvironment: { NODE_OPTIONS: "--max-old-space-size=2048" },
  }),
  validate: (summary, fixture) => {
    assert.equal(summary.field, 3);
    assert.equal(summary.exactSourceReplay, true);
    assert.equal(summary.passes, 6);
    assert.equal(summary.native.status, 0);
    assert.equal(summary.native.classNumber, "4");
    assert.deepEqual(summary.native.invariants, ["2", "2"]);
    assert.equal(fixture.native.classNumber, "4");
  },
});

stage("smith-transform", {
  dependencies: ["field3-collector"],
  requiresPari: true,
  command: (context) => commandNode("check_class_group_smith_transform.cjs",
    context.pariRoot, context.pariArchive,
    "--collector-fixtures", outputPath(context, "field3-collector")),
  validate: (summary) => {
    assert(summary.cases > 0);
    assert.deepEqual(summary.backends, ["cpython", "javascript", "gmp", "tagged"]);
    assert.equal(summary.ubsan, true);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.artifactDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.artifactDirectory, "oracle"),
  }),
});

stage("nf-cxlog", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_nf_cxlog.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert(summary.cases > 0);
    assert.equal(summary.malformedRejected, 4);
    assert.deepEqual(summary.backends,
      ["PARI", "CPython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("signed-reduction", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_signed_prime_ideal_reduction.cjs",
    context.pariExecutable),
  validate: (summary) => {
    assert.equal(summary.pari.replayed, true);
    assert(typeof summary.modulePath === "string");
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("unit-lattice-reduction", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_unit_lattice_reduction.cjs",
    context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.cases, 2);
    assert.deepEqual(summary.backends, ["javascript", "gmp", "tagged"]);
    assert.equal(summary.exactTransforms, true);
    assert.equal(summary.regulatorConsistency, true);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("unit-lattice-selection", {
  dependencies: [],
  requiresPari: true,
  command: (context) => commandNode("check_unit_lattice_selection.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert(summary.cases > 0);
    assert.equal(summary.atomicGuardsPerBackend, 14);
    assert.equal(summary.ubsan, true);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.artifactDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.artifactDirectory, "oracle"),
  }),
});

stage("unit-getfu", {
  dependencies: ["unit-lattice-reduction", "unit-lattice-selection"],
  requiresPari: true,
  command: (context) => commandNode("check_unit_reconstruction_cubic.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert(summary.fixtures > 0);
    assert(summary.successes > 0);
    assert.equal(summary.ubsan, true);
    assert.equal(summary.sourceSha256, buch2Sha256);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.artifactDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.artifactDirectory, "oracle"),
  }),
});

stage("honesty", {
  dependencies: ["honesty-scheduler"],
  requiresPari: true,
  command: (context) => commandNode("check_honesty_branch.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.unequalBounds, true);
    assert.equal(summary.probes, 51);
    assert.equal(summary.randomProducts, 50);
    assert.deepEqual(summary.backends, ["cpython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.oracleDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.oracleDirectory, "oracle"),
  }),
});

stage("immutable-result", {
  dependencies: ["field3-retry", "smith-transform", "nf-cxlog", "signed-reduction",
    "unit-getfu", "honesty"],
  command: () => commandNode("check_class_group_internal_result.cjs"),
  validate: (summary) => {
    assert.equal(summary.schema, "sagejs.pari-class-group/internal-result-v1");
    assert.equal(summary.authenticatedMutationCases, 55);
    assert.equal(summary.semanticMutationCases, 13);
    assert.equal(summary.pinnedRetainedEvidenceCases, 1);
    assert.equal(summary.publicComplete, false);
    assert.equal(summary.phase5Complete, false);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("rnd-scheduler", {
  dependencies: ["field3-collector"],
  requiresPari: true,
  command: (context) => commandNode("check_rnd_relation_scheduler.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.pari, "2.17.4");
    assert.equal(summary.cpython, true);
    assert.deepEqual(summary.native, ["javascript", "gmp"]);
    assert.equal(summary.collectorBoundary, "explicit");
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.oracleDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.oracleDirectory, "oracle"),
  }),
});

stage("rnd-collector", {
  dependencies: ["field3-collector", "field3-driver", "rnd-scheduler"],
  requiresPari: true,
  command: (context) => commandNode("check_rnd_relation_collector.cjs",
    context.pariRoot, context.pariArchive,
    `--initial=${outputPath(context, "field3-collector")}`),
  validate: (summary) => {
    assert.equal(summary.pari, "2.17.4");
    assert.equal(summary.cpython, true);
    assert.deepEqual(summary.native.map((entry) => entry.backend), ["javascript", "gmp"]);
    assert.match(summary.tagged, /^unsupported:/);
  },
  noFixture: true,
});

stage("post-rnd-lie-terminal", {
  dependencies: ["rnd-collector", "field3-collector", "analytic"],
  requiresPari: true,
  command: (context) => commandNode("check_post_rnd_lie_iteration.cjs",
    context.pariRoot, context.pariArchive,
    outputPath(context, "field3-collector"), outputPath(context, "analytic")),
  validate: (summary) => {
    assert.equal(summary.field, 3);
    assert.equal(summary.cpython.counts.randomLast, 295);
    assert.equal(summary.cpython.counts.postRandomLast, 296);
    assert.equal(summary.cpython.counts.lieLast, 301);
    assert.equal(summary.cpython.counts.action296, 5);
    assert.equal(summary.cpython.counts.terminalAction, 0);
    assert.deepEqual(summary.native, ["javascript", "gmp"]);
    assert.deepEqual(summary.source.acceptanceCodes, [5, 0]);
    assert.equal(summary.source.postFact === summary.source.lieFact, false);
    assert.equal(summary.source.residentBasis,
      "b20c7ee3b216cf041e556283a6380d0a0442a4a5db23378a0364fedc7d3e9ec1");
  },
  noFixture: true,
});

stage("honesty-scheduler", {
  dependencies: ["post-rnd-lie-terminal"],
  requiresPari: true,
  command: (context) => commandNode("check_honesty_scheduler.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.frozenCaseComplete, true);
    assert.equal(summary.unequalBounds, true);
    assert(summary.noCacheCollectorProbes > 0);
    assert.deepEqual(summary.schedulerBackends, ["cpython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.oracleDirectory, "factor-base.c"),
    "oracle-binary": path.join(summary.oracleDirectory, "factor-base"),
  }),
});

stage("honesty-success", {
  dependencies: ["honesty-scheduler"],
  requiresPari: true,
  command: (context) => commandNode("check_honesty_success.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.successfulFrozenCaseComplete, true);
    assert.equal(summary.unequalBounds, true);
    assert.equal(summary.probes, 6);
    assert.equal(summary.rngUnchanged, true);
    assert.deepEqual(summary.backends, ["cpython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.oracleDirectory, "select.c"),
    "oracle-binary": path.join(summary.oracleDirectory, "select"),
  }),
});

stage("honesty-quintic-collector-boundary", {
  dependencies: ["honesty-success"],
  requiresPari: true,
  command: (context) => commandNode("check_quintic_collector_fixture.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.quinticExporterComplete, true);
    assert.deepEqual(summary.pariOracleStatuses, [1, 1, 1, 1, 1, 1]);
    assert.equal(summary.sageCollectorProbesExecuted, 0);
    assert.equal(summary.blockedInputs, 6);
    assert.equal(summary.transactional, true);
    assert.deepEqual(summary.backendsAttempted, ["cpython"]);
    assert.equal(summary.nativeAttempted, false);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.oracleDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.oracleDirectory, "oracle"),
  }),
});

stage("relation-hnf-witness", {
  dependencies: ["resident-cubic-gmp"],
  command: (context) => commandNode("check_relation_hnf_witness.cjs",
    "--resident-output", outputPath(context, "resident-cubic-gmp", "output")),
  validate: (summary) => {
    assert.equal(summary.acceptedRelations, 73);
    assert.deepEqual(summary.backends, ["cpython", "javascript", "gmp", "tagged"]);
    assert.deepEqual(summary.independentIdentities,
      ["A*R2P=H", "H*P2R=A", "V*Vi=I", "Vi*V=I"]);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("unit-bridge-preci", {
  dependencies: ["relation-hnf-witness", "unit-getfu"],
  requiresPari: true,
  command: (context) => commandNode("check_unit_bridge_cubic.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.cases, 1);
    assert.equal(summary.residentGetfuStatus,
      "PRECI then successful p2240-capacity retry");
    assert.equal(summary.exactNorms, true);
    assert.equal(summary.composedProvenance, true);
    assert.deepEqual(summary.backends, ["cpython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.artifactDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.artifactDirectory, "oracle"),
  }),
});

stage("unit-component-cubic", {
  dependencies: ["unit-bridge-preci"],
  command: () => commandNode("check_unit_component_cubic.cjs"),
  validate: (summary) => {
    assert.equal(summary.cases, 1);
    assert.equal(summary.terminal, "getfu-and-cleanarch-complete");
    assert.equal(summary.rank, "2");
    assert.deepEqual(summary.norms.map(String), ["-1", "-1"]);
    assert.equal(summary.provenanceEntries, 14);
    assert.deepEqual(summary.retryLinkState, [6, 12, 1]);
    assert.equal(summary.atomicFailures, 3);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("mixed-getfu-prerequisite", {
  dependencies: ["nf-cxlog", "unit-lattice-reduction"],
  requiresPari: true,
  command: (context) => commandNode("check_getfu_mixed_complex.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.fields, 2);
    assert.equal(summary.ubsan, true);
    assert.equal(summary.sourceSha256, buch2Sha256);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.artifactDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.artifactDirectory, "oracle"),
  }),
});

stage("mixed-getfu-quartic", {
  dependencies: ["mixed-getfu-prerequisite", "field3-retry"],
  requiresPari: true,
  command: (context) => commandNode("check_getfu_mixed_quartic.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.fields, 1);
    assert.equal(summary.exact, 3);
    assert.equal(summary.branchChecks, 6);
    assert.equal(summary.ubsan, true);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.artifactDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.artifactDirectory, "oracle"),
  }),
});

stage("quartic-signed-genback", {
  dependencies: ["smith-transform"],
  requiresPari: true,
  command: (context) => commandNode("check_quartic_signed_genback.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.polynomial, "x^4-200000002*x-200000002");
    assert.deepEqual(summary.smithColumn, ["-2", "-1", "-1"]);
    assert.equal(summary.reductions, 7);
    assert.equal(summary.finalFactors, 7);
    assert.deepEqual(summary.backends,
      ["pristine PARI 2.17.4", "CPython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.directory, "oracle.c"),
    "oracle-binary": path.join(summary.directory, "oracle"),
  }),
});

stage("quartic-nf-cxlog", {
  dependencies: ["quartic-signed-genback", "nf-cxlog"],
  requiresPari: true,
  command: (context) => commandNode("check_quartic_nf_cxlog.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.polynomial, "x^4-200000002*x-200000002");
    assert.equal(summary.factors, 7);
    assert.deepEqual(summary.embeddingPrecisionBits, [448, 384, 448, 384]);
    assert.deepEqual(summary.backends,
      ["pristine PARI 2.17.4", "CPython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.directory, "oracle.c"),
    "oracle-binary": path.join(summary.directory, "oracle"),
  }),
});

stage("signed-genback-assembly", {
  dependencies: ["signed-reduction", "smith-transform", "nf-cxlog"],
  requiresPari: true,
  command: (context) => commandNode("check_signed_genback_assembly.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.classNumber, 24);
    assert.deepEqual(summary.relation, [-3, -1]);
    assert.equal(summary.factorCount, 4);
    assert.deepEqual(summary.backends,
      ["PARI", "CPython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("signed-genback-computed-t2", {
  dependencies: ["signed-genback-assembly"],
  requiresPari: true,
  command: (context) => commandNode("check_signed_genback_computed_t2.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.equal(summary.candidates, 5);
    assert.equal(summary.witnessMatrices, 15);
    assert.equal(summary.classNumber, 24);
    assert.deepEqual(summary.backends,
      ["PARI", "CPython", "javascript", "gmp", "tagged"]);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("get-clg2", {
  dependencies: ["signed-genback-computed-t2", "mixed-getfu-quartic"],
  requiresPari: true,
  command: (context) => commandNode("check_get_clg2_arch.cjs",
    context.pariRoot, context.pariArchive),
  validate: (summary) => {
    assert.deepEqual(summary.backends,
      ["PARI", "CPython", "javascript", "gmp", "tagged"]);
    assert.equal(summary.malformedCasesPerBackend, 5);
    assert.equal(summary.aliasModesPerBackend, 2);
    assert.equal(summary.pariArchiveSha256, archiveSha256);
  },
  noFixture: true,
  additionalOutputs: (summary) => ({
    "oracle-source": path.join(summary.artifactDirectory, "oracle.c"),
    "oracle-binary": path.join(summary.artifactDirectory, "oracle"),
  }),
});

stage("precision-bridge", {
  dependencies: ["unit-bridge-preci", "mixed-getfu-quartic"],
  command: () => commandNode("check_precision_resource_graph_bridge.cjs"),
  parseSummary: () => ({ exactOwnerRetained: true, atomicRetryPublication: true }),
  validate: (summary) => {
    assert.equal(summary.exactOwnerRetained, true);
    assert.equal(summary.atomicRetryPublication, true);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

const scratchFalsificationLedger = checker(
  "resident-mpz-scratch-frame-falsification-20260917.json",
);
stage("scratch-falsification-ledger", {
  dependencies: ["relation-hnf-witness"],
  command: () => ({
    command: process.execPath,
    arguments: ["-e", `const fs=require("node:fs");const x=JSON.parse(fs.readFileSync(${JSON.stringify(scratchFalsificationLedger)}));console.log(JSON.stringify({schemaVersion:x.schemaVersion,disposition:x.experiment.disposition,passed:x.gate.passed,cpuSpeedup:x.gate.kernelCpuSpeedup,correct:x.correctness.allClassOutputsMatched&&x.correctness.allResidentBufferHashesMatched}));`],
  }),
  identityInputs: () => [scratchFalsificationLedger],
  validate: (summary) => {
    assert.equal(summary.schemaVersion, 1);
    assert.equal(summary.disposition, "rejected-and-reverted");
    assert.equal(summary.passed, false);
    assert.equal(summary.correct, true);
    assert(summary.cpuSpeedup < 3);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("final-state", {
  dependencies: ["immutable-result", "rnd-collector", "honesty", "honesty-success",
    "relation-hnf-witness", "unit-bridge-preci", "mixed-getfu-quartic",
    "signed-genback-computed-t2", "get-clg2", "precision-bridge",
    "scratch-falsification-ledger"],
  command: () => commandNode("check_class_group_final_state.cjs"),
  validate: (summary) => {
    assert.equal(summary.schema, "sagejs.pari-class-group/connected-final-state-v2");
    assert.equal(summary.sourceRequiredRejections, 13);
    assert.equal(summary.authenticatedMutations, 23);
    assert.equal(summary.semanticMutations, 6);
    assert.equal(summary.linkedWitnessMutations, 3);
    assert.equal(summary.publicComplete, false);
    assert.equal(summary.phase5Complete, false);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

stage("final-state-mutations", {
  dependencies: ["final-state"],
  command: () => commandNode("check_class_group_final_mutations.cjs"),
  validate: (summary) => {
    assert.equal(summary.schema,
      "sagejs.pari-class-group/final-mutation-replay-v1");
    assert.equal(summary.connectedSchema,
      "sagejs.pari-class-group/connected-final-state-v3");
    assert.equal(summary.mutationCount, 11);
    assert.equal(summary.independentlyReplayed, 10);
    assert.equal(summary.publisherPinnedRetained, 1);
    assert.equal(summary.phase5Complete, false);
    assert.equal(summary.publicComplete, false);
  },
  noFixture: true,
  allowNoArtifactDirectory: true,
});

const defaultThrough = "cubic-candidate";

function orderedClosure(targets) {
  const result = [];
  const active = new Set();
  const finished = new Set();
  function visit(name) {
    const specification = stages.get(name);
    assert(specification, `unknown stage: ${name}`);
    assert(!active.has(name), `stage dependency cycle at ${name}`);
    if (finished.has(name)) return;
    active.add(name);
    for (const dependency of specification.dependencies) visit(dependency);
    active.delete(name);
    finished.add(name);
    result.push(name);
  }
  for (const target of targets) visit(target);
  return result;
}

function git(command) {
  const result = childProcess.spawnSync("git", command, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `git ${command.join(" ")} failed`);
  return result.stdout.trim();
}

function validatePari(context) {
  assert(fs.statSync(context.pariRoot).isDirectory(), "--pari-root is not a directory");
  assert(fs.statSync(context.pariArchive).isFile(), "--pari-archive is not a file");
  assert.equal(hashFile(context.pariArchive), archiveSha256, "wrong PARI archive");
  const extracted = childProcess.spawnSync("tar", ["-xOf", context.pariArchive,
    "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(extracted.status, 0, extracted.stderr?.toString() || "cannot extract buch2.c");
  assert.equal(sha256(extracted.stdout), buch2Sha256, "wrong PARI buch2.c");
  context.pariLibrary = path.join(context.pariRoot, "Olinux-x86_64", "libpari.so");
  assert(fs.existsSync(context.pariLibrary),
    "PARI root lacks Olinux-x86_64/libpari.so");
  context.pariLibrarySha256 = hashFile(fs.realpathSync(context.pariLibrary));
  context.pariExecutable = path.join(context.pariRoot, "gp");
  assert(fs.existsSync(context.pariExecutable), "PARI root lacks gp executable");
  context.pariExecutableSha256 = hashFile(fs.realpathSync(context.pariExecutable));
}

function definitionIdentity(context, specification, command, dependencies) {
  const checkerPath = command.command === process.execPath
    ? command.arguments[0]
    : command.arguments.find((argument) => argument.endsWith(".cjs"));
  const sources = [fs.realpathSync(__filename)];
  if (checkerPath && fs.existsSync(checkerPath)) sources.push(fs.realpathSync(checkerPath));
  for (const filename of specification.identityInputs?.(context) || []) {
    sources.push(fs.realpathSync(filename));
  }
  const sourceHashes = Object.fromEntries(sources.map((filename) => [
    path.relative(root, filename), hashFile(filename),
  ]));
  return {
    schema,
    stage: specification.name,
    gitCommit: context.gitCommit,
    gitTree: context.gitTree,
    command: [command.command, ...command.arguments],
    sourceHashes,
    dependencies: Object.fromEntries(dependencies.map(({ name, current }) =>
      [name, sha256(current.bytes)])),
    pariArchiveSha256: specification.requiresPari ? archiveSha256 : null,
    pariLibrarySha256: specification.requiresPari ? context.pariLibrarySha256 : null,
    pariExecutableSha256: specification.requiresPari
      ? context.pariExecutableSha256 : null,
    generatedChecker: command.generatedChecker || null,
  };
}

function verifyReceipt(context, current) {
  const receipt = current.receipt;
  assert.equal(receipt.schema, schema);
  assert.equal(receipt.complete, true);
  assert.equal(sha256(Buffer.from(JSON.stringify(receipt.identity))), receipt.identitySha256);
  for (const [dependency, expectedHash] of Object.entries(
    receipt.identity.dependencies || {},
  )) {
    const selected = currentReceipt(context, dependency);
    assert(selected, `${receipt.stage} dependency is no longer selected: ${dependency}`);
    assert.equal(sha256(selected.bytes), expectedHash,
      `${receipt.stage} dependency changed: ${dependency}`);
  }
  for (const [key, output] of Object.entries(receipt.outputs)) {
    const filename = resolveArtifact(context, output.path);
    assert.equal(fs.statSync(filename).size, output.bytes, `${receipt.stage}/${key} size`);
    assert.equal(hashFile(filename), output.sha256, `${receipt.stage}/${key} hash`);
  }
  return receipt;
}

function runStage(context, name) {
  const specification = stages.get(name);
  const dependencyReceipts = specification.dependencies.map((dependency) => {
    const current = currentReceipt(context, dependency);
    assert(current, `stage ${name} requires ${dependency}`);
    verifyReceipt(context, current);
    return { name: dependency, current };
  });
  const stageRoot = path.join(context.artifactRoot, "stages", name);
  const attemptsRoot = path.join(stageRoot, "attempts");
  fs.mkdirSync(attemptsRoot, { recursive: true });
  const attempt = fs.mkdtempSync(path.join(attemptsRoot, "attempt-"));
  const generated = path.join(attempt, "generated");
  fs.mkdirSync(generated);
  const command = specification.command(context, attempt);
  const identity = definitionIdentity(context, specification, command, dependencyReceipts);
  const identitySha256 = sha256(Buffer.from(JSON.stringify(identity)));
  const existing = currentReceipt(context, name);
  if (existing && !context.force.has(name)) {
    verifyReceipt(context, existing);
    if (existing.receipt.identitySha256 !== identitySha256) {
      throw new Error(`stage ${name} is stale; pass --force-stage ${name} to append a new attempt`);
    }
    fs.writeFileSync(path.join(attempt, "reused.json"), `${JSON.stringify({
      schema, stage: name, receipt: relativeToArtifacts(context, existing.filename),
    }, null, 2)}\n`);
    console.log(`${name}: reused ${existing.receipt.identitySha256}`);
    return;
  }
  const startedAt = new Date().toISOString();
  const started = process.hrtime.bigint();
  const result = childProcess.spawnSync(command.command, command.arguments, {
    cwd: root,
    env: {
      ...process.env,
      ...command.extraEnvironment,
      TMPDIR: generated,
      TMP: generated,
      TEMP: generated,
    },
    encoding: "utf8",
    timeout: 30 * 60 * 1000,
    maxBuffer: 256 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(attempt, "stdout.log"), result.stdout || "");
  fs.writeFileSync(path.join(attempt, "stderr.log"), result.stderr || "");
  writeJsonAtomic(path.join(attempt, "command.json"), {
    identity, startedAt, endedAt: new Date().toISOString(),
    elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6,
    status: result.status, signal: result.signal, error: result.error?.message || null,
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed (attempt retained at ${attempt}):\n${result.stderr || result.error}`);
  }
  const summary = specification.parseSummary
    ? specification.parseSummary(result.stdout) : jsonFromStdout(result.stdout);
  assert(summary && typeof summary === "object" && !Array.isArray(summary));
  const producedDirectory = summary.artifactDirectory || summary.directory ||
    summary.outputDirectory || summary.oracleDirectory ||
    (specification.allowNoArtifactDirectory ? generated : null);
  assert(typeof producedDirectory === "string", `${name} did not report an artifact directory`);
  relativeToArtifacts(context, producedDirectory);
  specification.postprocess?.(summary, attempt);
  const fixtureName = specification.fixtureName || "fixtures.json";
  const fixturePath = path.join(producedDirectory, fixtureName);
  let fixture = null;
  if (!specification.noFixture) {
    assert(fs.existsSync(fixturePath), `${name} did not produce ${fixtureName}`);
    fixture = readJson(fixturePath);
  }
  specification.validate(summary, fixture);
  const outputs = {};
  const addOutput = (key, filename) => {
    outputs[key] = {
      path: relativeToArtifacts(context, filename),
      bytes: fs.statSync(filename).size,
      sha256: hashFile(filename),
    };
  };
  if (!specification.noFixture) {
    addOutput(specification.fixtureKey || "fixture", fixturePath);
  }
  for (const [key, filename] of Object.entries(
    specification.additionalOutputs?.(summary, fixture) || {},
  )) {
    assert(fs.existsSync(filename), `${name} did not retain ${key}`);
    addOutput(key, filename);
  }
  addOutput("stdout", path.join(attempt, "stdout.log"));
  addOutput("stderr", path.join(attempt, "stderr.log"));
  if (specification.noFixture) {
    for (const filename of ["manifest.json", "kernel_core.c",
      "build/Release/sagejs_native_kernel.node"]) {
      const candidate = path.join(producedDirectory, filename);
      if (fs.existsSync(candidate)) addOutput(filename.replaceAll("/", "-"), candidate);
    }
  }
  const receipt = {
    schema,
    complete: true,
    stage: name,
    identity,
    identitySha256,
    summary,
    outputs,
  };
  const receiptPath = path.join(attempt, "receipt.json");
  writeJsonAtomic(receiptPath, receipt);
  const receiptBytes = fs.readFileSync(receiptPath);
  writeJsonAtomic(path.join(stageRoot, "current.json"), {
    schema,
    stage: name,
    receipt: relativeToArtifacts(context, receiptPath),
    receiptSha256: sha256(receiptBytes),
  });
  console.log(`${name}: completed ${identitySha256}`);
}

function contextFromOptions(options, needsPari, writePipeline = true) {
  if (!options.artifactRoot) usage("--artifact-root is required");
  fs.mkdirSync(options.artifactRoot, { recursive: true });
  const context = {
    ...options,
    gitCommit: git(["rev-parse", "HEAD"]),
    gitTree: git(["rev-parse", "HEAD^{tree}"]),
  };
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty && !options.allowDirty) {
    throw new Error("worktree has tracked changes; commit them or pass --allow-dirty for diagnostics");
  }
  if (needsPari) {
    if (!context.pariRoot || !context.pariArchive) {
      usage("selected stages require --pari-root and --pari-archive");
    }
    validatePari(context);
  }
  const pipeline = {
    schema,
    repositoryRoot: root,
    gitCommit: context.gitCommit,
    gitTree: context.gitTree,
    host: { platform: process.platform, arch: process.arch, release: os.release(),
      node: process.version },
    pari: needsPari ? { root: context.pariRoot, archive: context.pariArchive,
      archiveSha256, buch2Sha256, library: fs.realpathSync(context.pariLibrary),
      librarySha256: context.pariLibrarySha256,
      executable: fs.realpathSync(context.pariExecutable),
      executableSha256: context.pariExecutableSha256 } : null,
  };
  if (writePipeline) writeJsonAtomic(path.join(context.artifactRoot, "pipeline.json"), pipeline);
  return context;
}

function main() {
  const [action, ...arguments_] = process.argv.slice(2);
  if (!action || ["-h", "--help", "help"].includes(action)) usage();
  if (action === "list") {
    for (const [name, specification] of stages) {
      console.log(`${name}\t${specification.dependencies.join(",") || "-"}`);
    }
    return;
  }
  const options = parseOptions(arguments_);
  if (action === "verify") {
    if (!options.artifactRoot) usage("--artifact-root is required");
    const context = { ...options, artifactRoot: path.resolve(options.artifactRoot) };
    const selected = options.stage ? [options.stage] : [...stages.keys()]
      .filter((name) => currentReceipt(context, name));
    assert(selected.length > 0, "no completed stages to verify");
    for (const name of selected) {
      const current = currentReceipt(context, name);
      assert(current, `stage is not complete: ${name}`);
      verifyReceipt(context, current);
      console.log(`${name}: verified ${current.receipt.identitySha256}`);
    }
    return;
  }
  if (action !== "run") usage(`unknown action: ${action}`);
  if (options.stage && options.through) usage("choose --stage or --through, not both");
  const target = options.stage || options.through || defaultThrough;
  const names = options.stage ? orderedClosure([target]) : (() => {
    const keys = [...stages.keys()];
    const index = keys.indexOf(target);
    assert(index >= 0, `unknown stage: ${target}`);
    return orderedClosure(keys.slice(0, index + 1));
  })();
  for (const forced of options.force) assert(stages.has(forced), `unknown forced stage: ${forced}`);
  const needsPari = names.some((name) => stages.get(name).requiresPari);
  const context = contextFromOptions(options, needsPari);
  for (const name of names) runStage(context, name);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
