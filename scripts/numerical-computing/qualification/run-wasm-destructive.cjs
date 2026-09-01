#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentId,
  digestPath,
  parseJsonText,
  platformIdentity,
  repositoryIdentity,
  sha256,
} = require("../common.cjs");
const { writeImmutableJson } = require("../receipt.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const SCHEMA = "sagejs.numerical-wasm-destructive-evidence/v1";
const COLLECTOR = "scripts/numerical-computing/qualification/run-wasm-destructive.cjs";
const HARNESS = "bench/numerical-computing/qualification/wasm-destructive/destructive-faults.mjs";
const CMINPACK_REPORT = "packages/flint-wasm/numerical/build/build-report.json";
const CMINPACK_ARTIFACT = "packages/flint-wasm/numerical/build/cminpack.wasm";
const CMINPACK_MODULE = "packages/flint-wasm/numerical/index.mjs";
const NLOPT_REPORT = "src/lib/sagejs/numerics/optimization/backends/nlopt/build/build-report.json";
const NLOPT_ARTIFACT =
  "src/lib/sagejs/numerics/optimization/backends/nlopt/build/nlopt-methods.wasm";
const NLOPT_MODULE = "src/lib/sagejs/numerics/optimization/backends/nlopt/index.mjs";
const EVALUATOR_MODULE = "packages/flint-wasm/evaluator.mjs";
const RUNTIME_ARTIFACTS = Object.freeze([
  ["node-cminpack-wasm", CMINPACK_ARTIFACT, "cminpack"],
  ["node-nlopt-wasm", "dist/numerical/nlopt-methods.wasm", "nlopt"],
  ["browser-cminpack-wasm", "packages/flint-wasm/dist/cminpack.wasm", "cminpack"],
  ["browser-nlopt-wasm", "packages/flint-wasm/dist/nlopt-methods.wasm", "nlopt"],
]);
const LOG_LIMIT = 4 * 1024 * 1024;

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/run-wasm-destructive.cjs \\
  --output PATH [--allow-dirty]

Executes destructive ABI, allocation, callback, cancellation, authentication,
and post-failure recovery checks against the exact cminpack and selected NLopt
Wasm build artifacts. The immutable evidence binds source, artifacts, harness,
Node executable, and captured process output. Release evidence requires a clean
linux-x64 checkout.
`;
}

function parseArguments(argv) {
  const options = { output: null, requireClean: true, help: false };
  for (let index = 0; index < argv.length; ++index) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) options.help = true;
    else if (argument === "--allow-dirty") options.requireClean = false;
    else if (argument === "--output") {
      if (options.output !== null) throw new Error("--output may appear only once");
      options.output = argv[++index];
      if (!options.output || options.output.startsWith("--")) {
        throw new Error("--output requires a value");
      }
    } else throw new Error(`unknown argument ${argument}`);
  }
  if (!options.help && options.output === null) throw new Error("--output is required");
  return options;
}

function readBuildReport(relative, artifactRelative, label) {
  const reportBinding = digestPath(root, relative, `${label} build report`);
  const report = parseJsonText(fs.readFileSync(path.join(root, reportBinding.path), "utf8"), relative);
  const artifactBinding = digestPath(root, artifactRelative, `${label} artifact`);
  const artifactBytes = fs.readFileSync(path.join(root, artifactBinding.path));
  const contentSha256 = verifyBuildArtifact(report, artifactBytes, label);
  if (report.artifact?.bytes !== artifactBinding.bytes) {
    throw new Error(`${label} artifact does not match its build report`);
  }
  if (typeof report.source_closure?.sha256 !== "string") {
    throw new Error(`${label} build report lacks a source closure`);
  }
  return {
    build_report: reportBinding,
    source_closure_sha256: report.source_closure.sha256,
    artifact: { name: `${label}-wasm`, ...artifactBinding, content_sha256: contentSha256 },
    report,
    retained_methods: label === "nlopt"
      ? [1, ...(report.source_closure.compiled_sources.includes(
        "src/algs/cobyla/cobyla.c") ? [2] : [])]
      : null,
  };
}

function verifyBuildArtifact(report, artifactBytes, label) {
  const contentSha256 = sha256(artifactBytes);
  if (report.artifact?.sha256 !== contentSha256 ||
      report.artifact?.bytes !== artifactBytes.length) {
    throw new Error(`${label} artifact does not match its build report`);
  }
  return contentSha256;
}

function changedBytes(bytes) {
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 0x01;
  return changed;
}

function assertLifecycle(label, record) {
  if (record?.lifecycle_after?.activeContexts !== 0 ||
      record?.lifecycle_after?.activeHandle !== 0 ||
      record?.lifecycle_after?.liveAllocations !== 0 ||
      record?.lifecycle_after?.liveBytes !== 0) {
    throw new Error(`${label} lifecycle did not return to zero`);
  }
  for (const field of [
    "callback_failure_cleanup", "cancellation_cleanup", "post_failure_recovery",
  ]) {
    if (record?.[field] !== true) throw new Error(`${label} lacks ${field}`);
  }
  if (!Number.isSafeInteger(record.corrupt_region_cases) || record.corrupt_region_cases < 100) {
    throw new Error(`${label} corrupt-region campaign is too small`);
  }
  if (record.allocation_failure_positions === null ||
      typeof record.allocation_failure_positions !== "object") {
    throw new Error(`${label} allocation-failure campaign is too small`);
  }
  for (const [method, envelope] of Object.entries(record.allocation_failure_positions)) {
    const triggered = Number.isSafeInteger(envelope) ? envelope : envelope?.triggered;
    if (!Number.isSafeInteger(triggered) || triggered < 9) {
      throw new Error(`${label}/${method} allocation-failure campaign is too small`);
    }
    if (!Number.isSafeInteger(envelope) && envelope.first_normal_success !== triggered) {
      throw new Error(`${label}/${method} lacks a first normal-success boundary`);
    }
  }
}

function validateHarnessOutput(output) {
  if (output?.schema !== "sagejs.numerical-wasm-destructive-output/v1") {
    throw new Error("destructive harness emitted the wrong schema");
  }
  if (output.harness_input_artifact_mismatch?.cminpack !== "rejected" ||
      output.harness_input_artifact_mismatch?.nlopt !== "rejected") {
    throw new Error("destructive harness did not reject input artifact binding mismatches");
  }
  if (output.product_malformed_artifact?.cminpack !== "fail-closed" ||
      output.product_malformed_artifact?.nlopt !== "fail-closed") {
    throw new Error("destructive harness did not exercise product malformed-artifact fallback");
  }
  assertLifecycle("cminpack", output.cminpack);
  assertLifecycle("NLopt", output.nlopt);
  return {
    "allocation-failure": {
      status: "passed",
      cminpack_positions: output.cminpack.allocation_failure_positions,
      nlopt_positions: output.nlopt.allocation_failure_positions,
    },
    "corrupt-region": {
      status: "passed",
      cminpack_cases: output.cminpack.corrupt_region_cases,
      nlopt_cases: output.nlopt.corrupt_region_cases,
    },
    "harness-input-artifact-mismatch": {
      status: "passed", components: ["cminpack", "nlopt"],
    },
    "product-malformed-artifact-fail-closed": {
      status: "passed", components: ["cminpack", "nlopt"],
    },
    "post-failure-recovery": {
      status: "passed",
      callback_failure_cleanup: true,
      cancellation_cleanup: true,
      zero_live_allocation_components: ["cminpack", "nlopt"],
    },
  };
}

function nodeIdentity() {
  const filename = fs.realpathSync(process.execPath);
  return {
    path: filename,
    version: process.version,
    sha256: sha256(fs.readFileSync(filename)),
    bytes: fs.statSync(filename).size,
  };
}

function runtimeArtifactBindings(expectedContent) {
  return RUNTIME_ARTIFACTS.map(([name, relative, component]) => {
    const binding = digestPath(root, relative, `${name} runtime artifact`);
    const contentSha256 = sha256(fs.readFileSync(path.join(root, binding.path)));
    if (contentSha256 !== expectedContent.get(component)) {
      throw new Error(`${name} is not byte-identical to the source-current ${component} build`);
    }
    return { name, component, ...binding, content_sha256: contentSha256 };
  });
}

function moduleBindings() {
  return [
    { name: "cminpack-host", ...digestPath(root, CMINPACK_MODULE, "cminpack host module") },
    { name: "nlopt-host", ...digestPath(root, NLOPT_MODULE, "NLopt host module") },
    { name: "browser-runtime-loader", ...digestPath(root, EVALUATOR_MODULE, "browser runtime loader") },
  ];
}

function inputBinding(repository, cminpack, nlopt, runtimeArtifacts, harness, modules, node) {
  const component = (value) => ({
    build_report: value.build_report,
    source_closure_sha256: value.source_closure_sha256,
    artifact: value.artifact,
    retained_methods: value.retained_methods,
  });
  return {
    repository,
    cminpack: component(cminpack),
    nlopt: component(nlopt),
    runtime_artifacts: runtimeArtifacts,
    harness,
    modules,
    tool: node,
  };
}

function buildEvidence(options) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`destructive Wasm evidence requires linux-x64, got ${process.platform}-${process.arch}`);
  }
  const repository = repositoryIdentity(root);
  if (options.requireClean && !repository.clean) {
    throw new Error("repository must be clean; --allow-dirty is development-only");
  }
  const cminpack = readBuildReport(CMINPACK_REPORT, CMINPACK_ARTIFACT, "cminpack");
  const nlopt = readBuildReport(NLOPT_REPORT, NLOPT_ARTIFACT, "nlopt");
  for (const component of [cminpack, nlopt]) {
    const bytes = fs.readFileSync(path.join(root, component.artifact.path));
    let rejected = false;
    try {
      verifyBuildArtifact(component.report, changedBytes(bytes), component.artifact.name);
    } catch (error) {
      if (/does not match its build report/.test(error.message)) rejected = true;
      else throw error;
    }
    if (!rejected) throw new Error(`${component.artifact.name} build-report mismatch was accepted`);
  }
  const expectedContent = new Map([
    ["cminpack", cminpack.artifact.content_sha256],
    ["nlopt", nlopt.artifact.content_sha256],
  ]);
  const runtimeArtifacts = runtimeArtifactBindings(expectedContent);
  const harness = digestPath(root, HARNESS, "destructive Wasm harness");
  const modules = moduleBindings();
  const node = nodeIdentity();
  const beforeInputs = inputBinding(
    repository, cminpack, nlopt, runtimeArtifacts, harness, modules, node,
  );
  const args = [
    path.join(root, harness.path),
    "--cminpack", path.join(root, cminpack.artifact.path),
    "--cminpack-sha256", cminpack.artifact.content_sha256,
    "--cminpack-module", path.join(root, modules[0].path),
    "--nlopt", path.join(root, nlopt.artifact.path),
    "--nlopt-sha256", nlopt.artifact.content_sha256,
    "--nlopt-module", path.join(root, modules[1].path),
    "--nlopt-methods", nlopt.retained_methods.join(","),
    "--evaluator-module", path.join(root, modules[2].path),
  ];
  const started = process.hrtime.bigint();
  const result = spawnSync(node.path, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: LOG_LIMIT,
    env: { ...process.env, SAGEJS_NUMERICAL_DESTRUCTIVE_QUALIFICATION: "1" },
  });
  const elapsed_ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(`destructive Wasm harness failed (${result.status ?? result.signal}): ${result.stderr}`);
  }
  const lines = result.stdout.trim().split(/\r?\n/);
  if (lines.length !== 1) throw new Error("destructive harness must emit exactly one JSON line");
  const output = parseJsonText(lines[0], "destructive harness stdout");
  const checks = validateHarnessOutput(output);
  checks["runner-build-report-artifact-mismatch"] = {
    status: "passed", components: ["cminpack", "nlopt"],
  };
  const afterRepository = repositoryIdentity(root);
  const afterCminpack = readBuildReport(CMINPACK_REPORT, CMINPACK_ARTIFACT, "cminpack");
  const afterNlopt = readBuildReport(NLOPT_REPORT, NLOPT_ARTIFACT, "nlopt");
  const afterExpectedContent = new Map([
    ["cminpack", afterCminpack.artifact.content_sha256],
    ["nlopt", afterNlopt.artifact.content_sha256],
  ]);
  const afterInputs = inputBinding(
    afterRepository,
    afterCminpack,
    afterNlopt,
    runtimeArtifactBindings(afterExpectedContent),
    digestPath(root, HARNESS, "destructive Wasm harness"),
    moduleBindings(),
    nodeIdentity(),
  );
  if (canonicalJson(afterInputs) !== canonicalJson(beforeInputs)) {
    throw new Error("destructive Wasm inputs changed while evidence executed");
  }
  const core = {
    schema: SCHEMA,
    generated_at: new Date().toISOString(),
    status: "passed",
    repository: afterRepository,
    platform: platformIdentity(),
    collector: digestPath(root, COLLECTOR, "destructive Wasm collector"),
    tool: node,
    harness,
    build_reports: {
      cminpack: cminpack.build_report,
      nlopt: nlopt.build_report,
    },
    source_closures: {
      cminpack: cminpack.source_closure_sha256,
      nlopt: nlopt.source_closure_sha256,
    },
    modules,
    artifacts: [cminpack.artifact, nlopt.artifact],
    runtime_artifacts: runtimeArtifacts,
    execution: {
      command: "<node>",
      arguments: args.map((item) => item.startsWith(root) ? `<repository>${item.slice(root.length)}` : item),
      status: result.status,
      signal: result.signal,
      elapsed_ms,
      stdout_sha256: sha256(result.stdout),
      stderr_sha256: sha256(result.stderr),
      stdout_bytes: Buffer.byteLength(result.stdout),
      stderr_bytes: Buffer.byteLength(result.stderr),
    },
    checks,
    scope: {
      claim: "exact-candidate-destructive-wasm-boundary-evidence",
      source_and_artifact_bound: true,
      host_output_independently_validated: true,
    },
  };
  return { ...core, id: contentId(core) };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const evidence = buildEvidence(options);
  writeImmutableJson(options.output, evidence);
  process.stdout.write(`passed: ${evidence.id} -> ${path.resolve(options.output)}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SCHEMA,
  buildEvidence,
  main,
  parseArguments,
  usage,
  validateHarnessOutput,
  verifyBuildArtifact,
};
