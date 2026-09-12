"use strict";

const { mkdirSync, readFileSync, realpathSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { executeAssertion } = require("../tools/python-compat/assertion-runner.cjs");
const { sha256, executionBytes } = require("../tools/python-compat/evidence.cjs");
const { isolatedEnvironment } = require("./run-python-compat.cjs");
const { classifyMeasurement, validatePolicy } = require("../bench/python-compat/classify.cjs");

const phaseMarker = "__SAGEJS_PACKAGE_PHASE__=";
const verified = "__SAGEJS_PACKAGE_VERIFIED__\n";
const inProcessScopes = ["cold-import", "first-call", "warm-throughput"];
const scopes = ["cold-cli", ...inProcessScopes];

function phaseOptions(options) {
  for (const [name, minimum, maximum] of [["samples", 1, 30], ["warmups", 0, 100], ["iterations", 1, 10000]]) {
    if (!Number.isSafeInteger(options[name]) || options[name] < minimum || options[name] > maximum) {
      throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
  }
  return options;
}

function validatePhaseFixture(phase) {
  if (!phase || typeof phase !== "object" || Array.isArray(phase) ||
      Object.keys(phase).sort().join(",") !== "import,setup,verification,workload") {
    throw new Error("phase fixture needs explicit import/setup/workload/verification source");
  }
  for (const [name, source] of Object.entries(phase)) {
    if (typeof source !== "string" || !source.trim() || !source.endsWith("\n")) {
      throw new Error(`invalid phase ${name} source`);
    }
  }
}

function phaseSource(entry, mode, options) {
  validatePhaseFixture(entry.phases);
  phaseOptions(options);
  if (!["cold-cli", "phases"].includes(mode)) throw new Error("invalid phase source mode");
  const indent = (source) => source.trimEnd().split("\n").map((line) => `    ${line}`).join("\n");
  const timing = mode === "phases";
  const lines = [];
  if (timing) lines.push("from time import perf_counter as _sagejs_clock", "_sagejs_started = _sagejs_clock()");
  lines.push(entry.phases.import.trimEnd());
  if (timing) lines.push("_sagejs_import_ms = (_sagejs_clock() - _sagejs_started) * 1000");
  lines.push(entry.phases.setup.trimEnd(), "def _sagejs_workload():", indent(entry.phases.workload),
    "def _sagejs_verify(result):", indent(entry.phases.verification));
  // Nothing invokes the workload before this timed first call. The separate
  // behavior preflight runs in other processes and cannot warm this module.
  if (timing) lines.push("_sagejs_started = _sagejs_clock()");
  lines.push("_sagejs_result = _sagejs_workload()");
  if (timing) lines.push("_sagejs_first_ms = (_sagejs_clock() - _sagejs_started) * 1000");
  lines.push("_sagejs_verify(_sagejs_result)");
  if (timing) {
    lines.push(`for _sagejs_index in range(${options.warmups}):`,
      "    _sagejs_verify(_sagejs_workload())", "_sagejs_started = _sagejs_clock()",
      `_sagejs_results = [_sagejs_workload() for _sagejs_index in range(${options.iterations})]`,
      "_sagejs_warm_ms = (_sagejs_clock() - _sagejs_started) * 1000",
      "for _sagejs_result in _sagejs_results:", "    _sagejs_verify(_sagejs_result)",
      `print(${JSON.stringify(phaseMarker + "cold-import:")} + str(_sagejs_import_ms))`,
      `print(${JSON.stringify(phaseMarker + "first-call:")} + str(_sagejs_first_ms))`,
      `print(${JSON.stringify(phaseMarker + "warm-throughput:")} + str(_sagejs_warm_ms))`);
  }
  lines.push(`print(${JSON.stringify(verified.trimEnd())})`,
    `print("__SAGEJS_PACKAGE_PATH__=" + __import__(${JSON.stringify(entry.module)}).__file__)`);
  return lines.join("\n") + "\n";
}

function parsePhaseExecution(execution, entry, target, mode, { failureKind, checkWorkflow, resolvePath = realpathSync }) {
  const failure = failureKind(execution);
  if (failure) return { kind: failure };
  const bytes = executionBytes(execution, "stdout");
  const output = bytes.toString("utf8");
  if (!bytes.equals(Buffer.from(output))) return { kind: "invalid-timing-output" };
  const lines = output.split("\n");
  const timings = {};
  if (mode === "phases") {
    for (const scope of inProcessScopes) {
      const line = lines.shift();
      const prefix = phaseMarker + scope + ":";
      if (!line?.startsWith(prefix)) return { kind: "invalid-timing-output" };
      const value = line.slice(prefix.length);
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return { kind: "invalid-timing-output" };
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) return { kind: "invalid-timing-output" };
      timings[scope] = number;
    }
  }
  const remainder = lines.join("\n");
  const workflow = checkWorkflow({ ...execution, stdout: remainder,
    raw: { ...execution.raw, stdout: Buffer.from(remainder).toString("base64") } },
  { ...entry, stdout: verified }, target, resolvePath);
  if (workflow.kind !== "pass") return workflow;
  if (mode === "cold-cli") {
    if (!Number.isFinite(execution.durationMs) || execution.durationMs < 0) return { kind: "invalid-timing-output" };
    timings["cold-cli"] = execution.durationMs;
  }
  return { kind: "pass", modulePath: workflow.modulePath, timings };
}

function median(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizePhases(policyValue, samples, expectedSamples, comparable) {
  const policy = validatePolicy(policyValue);
  const results = {};
  for (const scope of scopes) {
    const reference = samples.oracle[scope];
    const subject = samples.subject[scope];
    if (![reference, subject].every((values) => Array.isArray(values) && values.length === expectedSamples &&
        values.every((value) => Number.isFinite(value) && value >= 0))) {
      throw new Error(`${scope}: missing or invalid timing samples`);
    }
    const referenceMs = median(reference), subjectMs = median(subject);
    const classification = classifyMeasurement(policy, { scope, referenceMs, subjectMs,
      behaviorMatch: true, comparable });
    // The classifier legitimately produces Infinity for a zero reference. JSON
    // must not silently turn that meaningful ratio into null.
    results[scope] = { referenceMs, subjectMs,
      classification: { ...classification, ratio: classification.ratio === Infinity ? "infinity" : classification.ratio },
      confirmation: "provisional-single-run",
      sampleQualified: expectedSamples >= policy.minimumConfirmedSamples };
  }
  return results;
}

function invalidatePhaseMeasurements(report, reason) {
  if (!report.scopes) return;
  report.currentSourceQualified = false;
  report.status = "invalidated";
  report.reason = reason;
  report.scopes = null;
}

async function runPhaseProbe(entry, context, dependencies) {
  const { root, python, target, directory, options, behavior, policy, comparable } = context;
  const { execute = executeAssertion, resolvePath = realpathSync, failureKind, checkWorkflow } = dependencies;
  phaseOptions(options);
  if (!entry.phases) return { status: "unmeasured", reason: "no-reviewed-phase-fixture" };
  if (behavior.status !== "pass" || !behavior.sourceUnchanged) {
    return { status: "unmeasured", reason: "behavior-pre-gate-failed" };
  }
  const programs = Object.fromEntries(["cold-cli", "phases"].map((mode) => [mode, phaseSource(entry, mode, options)]));
  const report = { status: "unqualified", reason: null, sourceUnchanged: true,
    confirmation: "provisional-single-run", comparable,
    samplesPerScope: options.samples, warmupsPerProcess: options.warmups,
    warmBatchIterations: options.iterations, warmBatchUnit: "milliseconds per batch, not per call",
    cachePolicy: "Fresh process and writable HOME/XDG cache per launch; installed wheels and built stdlib artifacts shared; OS caches not flushed; no install/download time included.",
    measurementPolicy: "cold-cli runs one checked workload; cold-import times first import statements (not launcher/compiler time); first-call precedes warmups; warm-throughput includes loop/result collection and excludes subsequent verification.",
    sourceSha256: Object.fromEntries(Object.entries(programs).map(([mode, source]) => [mode, sha256(source)])),
    policySha256: sha256(JSON.stringify(policy)),
    executions: [], samples: Object.fromEntries(["oracle", "subject"].map((runtime) =>
      [runtime, Object.fromEntries(scopes.map((scope) => [scope, []]))])), scopes: null };
  mkdirSync(directory);
  async function runOne(runtime, mode, label) {
    const scratch = join(directory, `${label}-${runtime}`);
    mkdirSync(scratch);
    const program = join(scratch, "case.py");
    writeFileSync(program, programs[mode]);
    const expected = report.sourceSha256[mode];
    const sourceDigest = () => { try { return sha256(readFileSync(program)); } catch { return null; } };
    const before = sourceDigest();
    const record = { runtime, mode, label, sourceSha256: expected, before, after: null, execution: null, check: null };
    report.executions.push(record);
    if (before !== expected) {
      report.sourceUnchanged = false;
      record.check = { kind: "source-changed" };
      return record.check;
    }
    const command = runtime === "oracle" ? python : process.execPath;
    const bootstrap = `import sys; sys.path.insert(0, ${JSON.stringify(target)}); exec(compile(open(${JSON.stringify(program)}, encoding='utf-8').read(), ${JSON.stringify(program)}, 'exec'))`;
    const args = runtime === "oracle" ? ["-BS", "-c", bootstrap] :
      ["--max-old-space-size=512", join(root, "bin/sagejs-source.cjs"), "--python", program];
    const execution = await execute(command, args, { cwd: scratch,
      env: { ...isolatedEnvironment(scratch), SAGEJS_SITE_PACKAGES: target, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      timeoutMs: 30000, maxOutputBytes: 1048576 });
    record.execution = execution;
    record.after = sourceDigest();
    if (record.after !== expected) {
      report.sourceUnchanged = false;
      record.check = { kind: "source-changed" };
    } else {
      record.check = parsePhaseExecution(execution, entry, target, mode, { failureKind, checkWorkflow, resolvePath });
      if (record.check.kind === "pass" && record.check.modulePath !== behavior.paths[runtime]) {
        record.check = { kind: "module-path-mismatch" };
      }
    }
    return record.check;
  }
  // A separate paired fixture preflight precedes every accepted sample. A
  // failed oracle is a fixture/oracle problem, never a Sage.js timing cliff.
  for (const runtime of ["oracle", "subject"]) {
    const checked = await runOne(runtime, "cold-cli", "preflight");
    if (checked.kind !== "pass") {
      report.reason = `${runtime}-preflight:${checked.kind}`;
      return report;
    }
  }
  for (let index = 0; index < options.samples; index++) {
    for (const mode of ["cold-cli", "phases"]) {
      for (const runtime of ["oracle", "subject"]) {
        const checked = await runOne(runtime, mode, `${mode}-${index}`);
        if (checked.kind !== "pass") {
          report.reason = `${runtime}-${mode}:${checked.kind}`;
          return report;
        }
        for (const [scope, milliseconds] of Object.entries(checked.timings)) {
          report.samples[runtime][scope].push(milliseconds);
        }
      }
    }
  }
  report.scopes = summarizePhases(policy, report.samples, options.samples, comparable);
  report.status = comparable ? "measured-provisional" : "artifact-observation";
  return report;
}

module.exports = { phaseOptions, validatePhaseFixture, phaseSource, parsePhaseExecution, summarizePhases, invalidatePhaseMeasurements, runPhaseProbe };
