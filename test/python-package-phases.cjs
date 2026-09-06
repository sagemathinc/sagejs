// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { phaseOptions, phaseSource, parsePhaseExecution, summarizePhases, invalidatePhaseMeasurements, runPhaseProbe } = require("../scripts/python-package-phases.cjs");
const { parseArguments, loadManifest, failureKind, checkWorkflow } = require("../scripts/run-pure-python-packages.cjs");
const { sha256 } = require("../tools/python-compat/evidence.cjs");
const policy = require("../bench/python-compat/performance-policy.json");
const root = resolve(__dirname, "..");
const options = { samples: 2, warmups: 3, iterations: 5 };
const entry = { name: "six", module: "six", version: "1.17.0", phases: {
  import: "import six\n", setup: "text = b'sagejs'\n",
  workload: "return six.ensure_text(text)\n", verification: "assert result == 'sagejs'\n",
} };
const dependencies = { failureKind, checkWorkflow, resolvePath: (filename) => filename };
const good = (mode, target, durationMs = 12) => ({ status: 0, signal: null, error: null,
  timedOut: false, outputLimited: false, stderr: "", durationMs,
  stdout: (mode === "phases" ? "__SAGEJS_PACKAGE_PHASE__=cold-import:0.5\n__SAGEJS_PACKAGE_PHASE__=first-call:1.5\n__SAGEJS_PACKAGE_PHASE__=warm-throughput:5.5\n" : "") +
    `__SAGEJS_PACKAGE_VERIFIED__\n__SAGEJS_PACKAGE_PATH__=${join(target, "six.py")}\n` });

function scratchContext(t) {
  const scratch = mkdtempSync(join(tmpdir(), "sagejs-phase-unit-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const target = join(scratch, "packages");
  return { root, python: "test-python", target, directory: join(scratch, "performance"), options, policy, comparable: true,
    behavior: { status: "pass", sourceUnchanged: true, paths: { oracle: join(target, "six.py"), subject: join(target, "six.py") } } };
}

test("timing CLI validates bounded controls and uses native-platform Python selection", () => {
  assert.equal(parseArguments([], { platform: "win32", environment: {} }).python, "python");
  assert.equal(parseArguments([], { platform: "linux", environment: {} }).python, "python3");
  assert.equal(parseArguments([], { platform: "win32", environment: { PYTHON: "configured" } }).python, "configured");
  assert.equal(parseArguments([], { environment: { PYTHON: "lower", SAGEJS_REFERENCE_PYTHON: "reference" } }).python, "reference");
  assert.equal(parseArguments(["--python", "explicit"], { environment: { PYTHON: "ignored" } }).python, "explicit");
  assert.equal(parseArguments(["--timings", "--samples", "1", "--warmups", "0", "--iterations", "1"]).samples, 1);
  for (const args of [["--samples", "2"], ["--timings", "--samples", "0"], ["--timings", "--samples", "31"],
    ["--timings", "--warmups", "-1"], ["--timings", "--iterations", "10001"], ["--timings", "--samples", "1.5"]]) {
    assert.throws(() => parseArguments(args));
  }
  assert.throws(() => phaseOptions({ ...options, samples: Infinity }));
});

test("manifest retains all eleven smoke fixtures and exactly three phase fixtures", () => {
  const { manifest } = loadManifest();
  assert.equal(manifest.packages.length, 11);
  assert.deepEqual(manifest.packages.filter((item) => item.phases).map((item) => item.name), ["packaging", "six", "tomli"]);
  for (const item of manifest.packages) {
    assert.ok(item.source.length && item.stdout.length && item.sha256.length === 64);
    if (item.phases) assert.ok(phaseSource(item, "phases", options).endsWith("\n"));
  }
});

test("source clocks the true first call and verifies every timed result afterward", () => {
  const source = phaseSource(entry, "phases", options);
  const call = source.indexOf("_sagejs_result = _sagejs_workload()");
  const captured = source.indexOf("_sagejs_first_ms =");
  const checked = source.indexOf("_sagejs_verify(_sagejs_result)");
  const warmups = source.indexOf("for _sagejs_index in range(3):");
  const batch = source.indexOf("_sagejs_results = [_sagejs_workload()");
  assert.ok(call < captured && captured < checked && checked < warmups && warmups < batch);
  assert.equal(source.slice(0, call).match(/_sagejs_workload\(/g).length, 1, "definition only before first call");
  assert.ok(source.indexOf("_sagejs_warm_ms =") < source.indexOf("for _sagejs_result in _sagejs_results:"));
  const cold = phaseSource(entry, "cold-cli", options);
  assert.equal(cold.includes("_sagejs_clock"), false);
  assert.equal(cold.includes("_sagejs_results"), false);
  assert.throws(() => phaseSource({ ...entry, phases: { ...entry.phases, workload: "" } }, "phases", options));
});

test("timing records must be finite, complete, unique and in exact scope order", () => {
  const target = resolve("packages");
  const valid = good("phases", target);
  assert.deepEqual(parsePhaseExecution(valid, entry, target, "phases", dependencies).timings,
    { "cold-import": 0.5, "first-call": 1.5, "warm-throughput": 5.5 });
  for (const value of ["NaN", "Infinity", "-1", "1e999", "", " 1"]) {
    const invalid = { ...valid, stdout: valid.stdout.replace("cold-import:0.5", `cold-import:${value}`) };
    assert.equal(parsePhaseExecution(invalid, entry, target, "phases", dependencies).kind, "invalid-timing-output");
  }
  for (const stdout of [valid.stdout.replace("__SAGEJS_PACKAGE_PHASE__=first-call:1.5\n", ""),
    "__SAGEJS_PACKAGE_PHASE__=cold-import:0.5\n" + valid.stdout,
    valid.stdout.replace("warm-throughput", "cold-import"), valid.stdout + "extra\n"]) {
    assert.notEqual(parsePhaseExecution({ ...valid, stdout }, entry, target, "phases", dependencies).kind, "pass");
  }
  assert.equal(parsePhaseExecution({ ...valid, timedOut: true }, entry, target, "phases", dependencies).kind, "timeout");
  assert.equal(parsePhaseExecution(good("cold-cli", target, Infinity), entry, target, "cold-cli", dependencies).kind, "invalid-timing-output");
  assert.equal(parsePhaseExecution({ ...valid, raw: { stdout: Buffer.from([255]).toString("base64") } }, entry, target, "phases", dependencies).kind, "invalid-timing-output");
});

test("scope summaries require exact sample counts and stay provisional at seven", () => {
  const samples = Object.fromEntries(["oracle", "subject"].map((runtime) => [runtime,
    Object.fromEntries(["cold-cli", "cold-import", "first-call", "warm-throughput"].map((scope) => [scope, Array(7).fill(runtime === "oracle" ? 0 : 1000)]))]));
  const result = summarizePhases(policy, samples, 7, true);
  assert.equal(result["cold-cli"].confirmation, "provisional-single-run");
  assert.equal(result["cold-cli"].sampleQualified, true);
  assert.equal(result["cold-cli"].classification.ratio, "infinity");
  assert.equal(summarizePhases(policy, samples, 7, false)["cold-cli"].classification.status, "not-comparable");
  samples.oracle["first-call"].pop();
  assert.throws(() => summarizePhases(policy, samples, 7, true));
});

test("unreviewed and behavior-failing packages never launch a timed process", async (t) => {
  const context = scratchContext(t);
  const execute = async () => { throw new Error("must not execute"); };
  assert.equal((await runPhaseProbe({ ...entry, phases: undefined }, context, { ...dependencies, execute })).reason, "no-reviewed-phase-fixture");
  assert.equal((await runPhaseProbe(entry, { ...context, behavior: { status: "timeout" } }, { ...dependencies, execute })).reason, "behavior-pre-gate-failed");
});

test("later build or infrastructure failure clears classifications but preserves raw samples", () => {
  const report = { status: "measured-provisional", scopes: { "cold-cli": {} }, samples: { oracle: [1] } };
  invalidatePhaseMeasurements(report, "incomplete-or-invalid-run");
  assert.equal(report.status, "invalidated");
  assert.equal(report.currentSourceQualified, false);
  assert.equal(report.scopes, null);
  assert.deepEqual(report.samples, { oracle: [1] });
});

test("phase preflight failures reject timing and distinguish the failing runtime", async (t) => {
  for (const failureAt of [1, 2]) {
    const context = scratchContext(t);
    let calls = 0;
    const report = await runPhaseProbe(entry, context, { ...dependencies, execute: async () => {
      const value = good("cold-cli", context.target);
      return ++calls === failureAt ? { ...value, status: 1 } : value;
    } });
    assert.equal(calls, failureAt);
    assert.equal(report.status, "unqualified");
    assert.equal(report.reason, `${failureAt === 1 ? "oracle" : "subject"}-preflight:execution-failure`);
    assert.equal(report.scopes, null);
    assert.deepEqual(report.samples.oracle["cold-cli"], []);
  }
});

test("paired phases use fresh caches, keep raw evidence and exclude preflight durations", async (t) => {
  const context = scratchContext(t);
  const directories = new Set();
  let calls = 0;
  const report = await runPhaseProbe(entry, context, { ...dependencies, execute: async (command, args, bounds) => {
    calls++;
    assert.equal(directories.has(bounds.cwd), false);
    directories.add(bounds.cwd);
    assert.equal(bounds.env.HOME, bounds.cwd);
    assert.equal(bounds.env.XDG_CACHE_HOME, bounds.cwd);
    assert.equal(bounds.env.SAGEJS_SITE_PACKAGES, context.target);
    assert.equal(bounds.env.PYTHONIOENCODING, "utf-8");
    assert.ok(bounds.timeoutMs > 0 && bounds.maxOutputBytes > 0);
    const source = readFileSync(join(bounds.cwd, "case.py"), "utf8");
    const mode = source.includes("_sagejs_clock") ? "phases" : "cold-cli";
    return good(mode, context.target, calls <= 2 ? 999999 : 12);
  } });
  assert.equal(calls, 2 + 4 * options.samples);
  assert.equal(report.status, "measured-provisional");
  assert.deepEqual(report.samples.oracle["cold-cli"], [12, 12]);
  assert.deepEqual(report.samples.subject["first-call"], [1.5, 1.5]);
  assert.equal(report.scopes["warm-throughput"].sampleQualified, false);
  assert.equal(report.scopes["cold-cli"].confirmation, "provisional-single-run");
  for (const execution of report.executions) {
    assert.equal(execution.before, execution.sourceSha256);
    assert.equal(execution.after, execution.sourceSha256);
    assert.ok(execution.execution.stdout.length);
  }
  assert.equal(report.sourceSha256.phases, sha256(phaseSource(entry, "phases", options)));
});

test("a timed timeout preserves partial evidence but cannot become completed timing", async (t) => {
  const context = scratchContext(t);
  let calls = 0;
  const report = await runPhaseProbe(entry, context, { ...dependencies, execute: async () => {
    const value = good("cold-cli", context.target, 30000);
    return ++calls === 3 ? { ...value, timedOut: true } : value;
  } });
  assert.equal(calls, 3);
  assert.equal(report.status, "unqualified");
  assert.equal(report.reason, "oracle-cold-cli:timeout");
  assert.equal(report.scopes, null);
  assert.deepEqual(report.samples.oracle["cold-cli"], []);
  assert.equal(report.executions[2].execution.timedOut, true);
});

test("source mutation or post-timing verification failure rejects phase qualification", async (t) => {
  const context = scratchContext(t);
  const report = await runPhaseProbe(entry, context, { ...dependencies, execute: async (command, args, bounds) => {
    writeFileSync(join(bounds.cwd, "case.py"), "pass\n");
    return good("cold-cli", context.target);
  } });
  assert.equal(report.sourceUnchanged, false);
  assert.equal(report.reason, "oracle-preflight:source-changed");
  assert.equal(report.scopes, null);
  const second = scratchContext(t);
  let calls = 0;
  const checked = await runPhaseProbe(entry, second, { ...dependencies, execute: async () => {
    calls++;
    const value = good(calls >= 5 ? "phases" : "cold-cli", second.target);
    return calls === 5 ? { ...value, status: 1 } : value;
  } });
  assert.equal(calls, 5);
  assert.equal(checked.reason, "oracle-phases:execution-failure");
  assert.equal(checked.scopes, null);
  assert.deepEqual(checked.samples.oracle["first-call"], []);
});
