// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { sha256 } = require("../tools/python-compat/evidence.cjs");
const { checkWorkflow, failureKind, loadManifest, parseArguments, runCase } = require("../scripts/run-pure-python-packages.cjs");
const { checkSuiteWorkflow, loadSuiteSelection, selectionUnchanged, suiteCaseUnchanged } = require("../scripts/python-package-suites.cjs");

const root = resolve(__dirname, "..");
const originalIds = JSON.parse(readFileSync(join(root,
  "upstream-tests/python-packages/tomli-error-selection.json"))).selection.testIds;
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-upstream-suite-unit-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const entry = JSON.parse(JSON.stringify(loadManifest().manifest.packages.find((item) => item.name === "tomli")));
  for (const path of ["upstream-tests/python-packages/suites/tomli",
    entry.upstreamSuite.path, "tools/python-compat/drivers/tomli-errors.py"]) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    cpSync(join(root, path), join(directory, path), { recursive: true });
  }
  const executionDirectory = join(directory, "execution");
  mkdirSync(executionDirectory);
  return { root: directory, entry, executionDirectory, target: join(directory, "packages") };
}
function rewriteSelection(context, change) {
  const path = join(context.root, context.entry.upstreamSuite.path);
  const selection = JSON.parse(readFileSync(path, "utf8"));
  change(selection);
  writeFileSync(path, JSON.stringify(selection, null, 2) + "\n");
  context.entry.upstreamSuite.sha256 = sha256(readFileSync(path));
}
function success(stdout = "") {
  return { status: 0, signal: null, timedOut: false, outputLimited: false, error: null,
    stdout, stderr: "", output: stdout, raw: { stdout: Buffer.from(stdout).toString("base64"), stderr: "", output: Buffer.from(stdout).toString("base64") } };
}
function suiteOutput(context, count = 7) {
  const suiteDirectory = join(context.executionDirectory, "upstream-suite");
  return `__SAGEJS_SUITE_COUNT__=${count}\n` +
    `__SAGEJS_SUITE_IDS__=${originalIds.join(",")}\n` +
    `__SAGEJS_SUITE_FIXTURE__=tests=${join(suiteDirectory, "tests", "__init__.py")}\n` +
    `__SAGEJS_SUITE_FIXTURE__=tests.test_error=${join(suiteDirectory, "tests", "test_error.py")}\n` +
    `__SAGEJS_PACKAGE_PATH__=${join(context.target, "tomli", "__init__.py")}\n`;
}
function run(context, suite, execute) {
  return runCase(context.entry, "cpython-fixture", context.target, context.executionDirectory,
    { suite, execute, resolvePath: (path) => path });
}

test("upstream suites are explicit and preserve ordinary workflow/timing options", () => {
  assert.equal(parseArguments([]).upstreamSuites, undefined);
  const ordinary = parseArguments(["--only", "tomli", "--timings"]);
  const selected = parseArguments(["--only", "tomli", "--timings", "--upstream-suites"]);
  assert.equal(selected.upstreamSuites, true);
  delete selected.upstreamSuites;
  assert.deepEqual(selected, ordinary);
});

test("reviewed selection binds all seven original methods, license, wheel and support closure", (t) => {
  const context = fixture(t);
  const suite = loadSuiteSelection(context.root, context.entry);
  assert.equal(suite.selection.selection.expectedCount, 7);
  assert.equal(suite.selection.selection.testIds.length, 7);
  assert.ok(suite.selection.selection.testIds.includes("tests.test_error.TestError.test_deprecated_tomldecodeerror"));
  assert.deepEqual(suite.selection.selection.expectedSkips, []);
  assert.deepEqual(suite.selection.package.dependencies, []);
  assert.equal(suite.provenance.upstream.revision, "3fccd16450d0f1d87c042473d95a07f60955206e");
  assert.equal(suite.provenance.upstream.license, "MIT");
  assert.equal(suite.provenance.upstream.files.length, 3);
  assert.equal(suite.fixtures.length, 2);
  assert.equal(selectionUnchanged(suite), true);
});

test("selection, driver, fixture and license missing/changed bytes are rejected before execution", (t) => {
  for (const path of ["upstream-tests/python-packages/tomli-error-selection.json",
    "tools/python-compat/drivers/tomli-errors.py",
    "upstream-tests/python-packages/suites/tomli/SOURCE.json",
    "upstream-tests/python-packages/suites/tomli/tests/__init__.py",
    "upstream-tests/python-packages/suites/tomli/tests/test_error.py",
    "upstream-tests/python-packages/suites/tomli/LICENSE"]) {
    for (const remove of [false, true]) {
      const context = fixture(t);
      const suite = loadSuiteSelection(context.root, context.entry);
      if (remove) rmSync(join(context.root, path));
      else writeFileSync(join(context.root, path), "changed\n");
      assert.throws(() => loadSuiteSelection(context.root, context.entry));
      assert.equal(selectionUnchanged(suite), false);
    }
  }
});

test("declarations reject malformed IDs, counts, skips, bounds, closure and host changes", (t) => {
  for (const change of [
    (s) => { s.selection.expectedCount = 0; },
    (s) => { s.selection.expectedCount = 6; },
    (s) => { s.selection.testIds[1] = s.selection.testIds[0]; },
    (s) => { s.selection.testIds[0] = "other.Test.test_bad"; },
    (s) => { s.selection.expectedSkips = [s.selection.testIds[0]]; },
    (s) => { s.selection.disposition = "optional"; },
    (s) => { s.selection.allMethodsInSelectedClass = false; },
    (s) => { s.package.version = "2.2.0"; },
    (s) => { s.package.dependencies = ["pytest"]; },
    (s) => { s.runtimeCapabilities = ["network"]; },
    (s) => { s.targets = ["browser"]; },
    (s) => { s.timeoutMs = 0; },
    (s) => { s.fixtures.pop(); },
    (s) => { s.fixtures[1].destination = "../escape.py"; },
    (s) => { s.fixtures[1].destination = s.fixtures[0].destination; },
    (s) => { s.fixtures[1].path = "missing.py"; },
    (s) => { s.driver.path = "../escape.py"; },
  ]) {
    const context = fixture(t);
    rewriteSelection(context, change);
    assert.throws(() => loadSuiteSelection(context.root, context.entry));
  }
});

test("extra and linked upstream sources cannot enter the reviewed fixture closure", (t) => {
  const extra = fixture(t);
  writeFileSync(join(extra.root, "upstream-tests/python-packages/suites/tomli/tests/extra.py"), "pass\n");
  assert.throws(() => loadSuiteSelection(extra.root, extra.entry));
  if (process.platform === "win32") return; // Symlink privilege is not assumed; ordinary paths are tested above.
  const linked = fixture(t);
  const source = join(linked.root, "upstream-tests/python-packages/suites/tomli/tests/test_error.py");
  const bytes = readFileSync(source);
  const outside = join(linked.root, "outside.py");
  writeFileSync(outside, bytes);
  rmSync(source);
  symlinkSync(outside, source);
  assert.throws(() => loadSuiteSelection(linked.root, linked.entry), /symlink/);
});

test("provenance cannot omit a pin, license or original file mapping even with updated outer digests", (t) => {
  for (const change of [
    (source) => { source.revision = "main"; },
    (source) => { source.license = ""; },
    (source) => { source.version = "2.2.0"; },
    (source) => { source.repository = "file:///ambient/source"; },
    (source) => { source.files = source.files.filter((file) => file.path !== "LICENSE"); },
    (source) => { source.files[1].upstreamPath = "../outside.py"; },
    (source) => { source.files[1].bytes += 1; },
  ]) {
    const context = fixture(t);
    const filename = join(context.root, "upstream-tests/python-packages/suites/tomli/SOURCE.json");
    const source = JSON.parse(readFileSync(filename, "utf8"));
    change(source);
    writeFileSync(filename, JSON.stringify(source, null, 2) + "\n");
    rewriteSelection(context, (selection) => { selection.source.sha256 = sha256(readFileSync(filename)); });
    assert.throws(() => loadSuiteSelection(context.root, context.entry));
  }
});

test("suite transport preserves raw bytes and only accepts CRLF plus real path identity", (t) => {
  const context = fixture(t);
  const suite = loadSuiteSelection(context.root, context.entry);
  const directory = join(context.executionDirectory, "upstream-suite");
  const dependencies = { checkWorkflow, failureKind, resolvePath: (path) => path };
  for (const output of [suiteOutput(context), suiteOutput(context).replaceAll("\n", "\r\n")]) {
    const execution = success(output);
    const before = JSON.stringify(execution);
    assert.equal(checkSuiteWorkflow(execution, suite, context.entry, context.target, directory, dependencies).kind, "pass");
    assert.equal(JSON.stringify(execution), before);
  }
  for (const output of [suiteOutput(context).replace("COUNT__=7", "COUNT__=\r7"),
    suiteOutput(context).replaceAll("\n", "\r\r\n"),
    suiteOutput(context).replace("test_error.py\n", "test_error.py\r\r\n"),
    suiteOutput(context).replace(/\n$/, "\r\r\n"),
    suiteOutput(context).replace("test_error.py", "test_er\rror.py")]) {
    assert.notEqual(checkSuiteWorkflow(success(output), suite, context.entry, context.target, directory, dependencies).kind, "pass");
  }
  const invalid = success(suiteOutput(context));
  invalid.raw.stdout = Buffer.concat([Buffer.from([255]), Buffer.from(suiteOutput(context))]).toString("base64");
  assert.equal(checkSuiteWorkflow(invalid, suite, context.entry, context.target, directory, dependencies).kind, "output-mismatch");
  const aliased = success(suiteOutput(context).replaceAll("upstream-suite", "path-alias"));
  assert.equal(checkSuiteWorkflow(aliased, suite, context.entry, context.target, directory,
    { ...dependencies, resolvePath: (path) => path.replaceAll("path-alias", "upstream-suite") }).kind, "pass");
  assert.equal(checkSuiteWorkflow(success(suiteOutput(context)), suite, context.entry, context.target, directory,
    { ...dependencies, resolvePath: () => { throw new Error("missing origin"); } }).kind, "fixture-origin-mismatch");
});

test("same-count selection changes cannot qualify a different executed test set", async (t) => {
  const context = fixture(t);
  rewriteSelection(context, (s) => { s.selection.testIds[0] = "tests.test_error.TestError.test_nonexistent"; });
  const suite = loadSuiteSelection(context.root, context.entry);
  const result = await run(context, suite, async () => success(suiteOutput(context)));
  assert.equal(result.status, "oracle-error");
  assert.equal(result.executions.subject, null);
});

test("suite reuses raw workflow comparison, package origin and clean bounded execution", async (t) => {
  const context = fixture(t);
  const suite = loadSuiteSelection(context.root, context.entry);
  let calls = 0;
  const execution = success(suiteOutput(context));
  const result = await run(context, suite, async (command, args, bounds) => {
    calls++;
    assert.equal(bounds.env.SAGEJS_SITE_PACKAGES, context.target);
    assert.equal(bounds.env.PYTHONPATH, undefined);
    assert.equal(bounds.timeoutMs, 30000);
    assert.equal(bounds.maxOutputBytes, 1048576);
    if (calls === 1) {
      assert.equal(args[0], "-BS");
      assert.ok(args[2].includes(JSON.stringify(join(context.executionDirectory, "upstream-suite"))));
    } else assert.ok(args.includes("--python"));
    const program = readFileSync(join(context.executionDirectory, "upstream-suite/case.py"), "utf8");
    assert.ok(program.startsWith(`EXPECTED_TEST_IDS = ${JSON.stringify(originalIds)}\n` + suite.driverSource));
    assert.ok(program.includes('str(result.testsRun)'));
    return execution;
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "pass");
  assert.equal(result.sourceUnchanged, true);
  assert.equal(result.suite.expectedCount, 7);
  assert.equal(result.suite.sourceChecks.beforeOracle.files.length, 3);
  assert.equal(result.suite.sourceChecks.afterSubject.sha256, result.suite.sourceChecks.beforeOracle.sha256);
  assert.equal(result.executions.oracle, execution);
  assert.equal(result.executions.subject, execution);
  assert.equal(result.performance.status, "unmeasured");
  assert.equal(suiteCaseUnchanged(suite, result), true);
  writeFileSync(join(context.executionDirectory, "upstream-suite/tests/test_error.py"), "pass\n");
  assert.equal(suiteCaseUnchanged(suite, result), false);
});

test("zero, partial, excess counts and wrong fixture/module origins cannot pass", async (t) => {
  for (const change of [
    (value) => value.replace("COUNT__=7", "COUNT__=0"),
    (value) => value.replace("COUNT__=7", "COUNT__=6"),
    (value) => value.replace("COUNT__=7", "COUNT__=8"),
    (value) => value.replace(originalIds[0], originalIds[1]),
    (value) => value.replace("test_error.py", "wrong.py"),
    (value) => value.replace(/PACKAGE_PATH__=.*\n/, `PACKAGE_PATH__=${resolve("outside.py")}\n`),
    (value) => "unexpected\n" + value,
  ]) {
    const context = fixture(t);
    const suite = loadSuiteSelection(context.root, context.entry);
    let calls = 0;
    const result = await run(context, suite, async () => {
      calls++;
      const value = success(change(suiteOutput(context)));
      value.stdout = suiteOutput(context); // Raw bytes must win over decoded text.
      return value;
    });
    assert.equal(result.status, "oracle-error");
    assert.equal(calls, 1);
    assert.equal(result.executions.subject, null);
  }
});

test("both runtimes retain timeout, exception, output-limit and raw stderr failures", async (t) => {
  for (const failingCall of [1, 2]) for (const change of [
    { status: 1 }, { signal: "SIGKILL" }, { timedOut: true }, { outputLimited: true },
    { error: { message: "launch failure" } },
    { rawStderr: "warning was not captured\n" },
  ]) {
    const context = fixture(t);
    const suite = loadSuiteSelection(context.root, context.entry);
    let calls = 0;
    const result = await run(context, suite, async () => {
      const execution = success(suiteOutput(context));
      if (++calls === failingCall) {
        Object.assign(execution, change);
        if (change.rawStderr) execution.raw.stderr = Buffer.from(change.rawStderr).toString("base64");
      }
      return execution;
    });
    assert.notEqual(result.status, "pass");
    assert.equal(calls, failingCall);
    if (failingCall === 1) assert.equal(result.executions.subject, null);
    else assert.notEqual(result.executions.subject, null);
  }
});

test("fixture/adapter addition, removal and mutation invalidate either runtime's passing output", async (t) => {
  for (const failingCall of [1, 2]) for (const change of [
    (directory) => writeFileSync(join(directory, "tests/test_error.py"), "pass\n"),
    (directory) => rmSync(join(directory, "tests/__init__.py")),
    (directory) => writeFileSync(join(directory, "tests/injected.py"), "pass\n"),
    (directory) => writeFileSync(join(directory, "case.py"), "pass\n"),
  ]) {
    const context = fixture(t);
    const suite = loadSuiteSelection(context.root, context.entry);
    let calls = 0;
    const result = await run(context, suite, async () => {
      if (++calls === failingCall) change(join(context.executionDirectory, "upstream-suite"));
      return success(suiteOutput(context));
    });
    assert.equal(calls, failingCall);
    assert.equal(result.status, "source-changed");
    assert.equal(result.sourceUnchanged, false);
    assert.equal(result.suite.sourceChecks[failingCall === 1 ? "afterOracle" : "afterSubject"], null);
  }
});

test("original selection mutation is rejected even when staged bytes remain intact", async (t) => {
  const context = fixture(t);
  const suite = loadSuiteSelection(context.root, context.entry);
  let calls = 0;
  const result = await run(context, suite, async () => {
    calls++;
    writeFileSync(join(context.root, "tools/python-compat/drivers/tomli-errors.py"), "pass\n");
    return success(suiteOutput(context));
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "source-changed");
  assert.equal(result.executions.subject, null);
});
