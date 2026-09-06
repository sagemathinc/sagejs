// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { loadManifest, safePath } = require("../tools/python-compat/manifest.cjs");
const { parseArguments, isolatedEnvironment, runCase } = require("../scripts/run-python-compat.cjs");
const sourceRoot = resolve(__dirname, "../upstream-tests/python-compat");

function copyFixture(context) {
  const root = mkdtempSync(join(tmpdir(), "sagejs-manifest-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(sourceRoot, root, { recursive: true });
  return root;
}

test("pinned RustPython selection binds unchanged programs, fixture closure, and license", () => {
  const loaded = loadManifest(join(sourceRoot, "manifest.json"));
  assert.equal(loaded.cases.length, 12);
  assert.equal(loaded.manifest.oracle.version, "3.14.4");
  assert.equal(loaded.provenance.suites.rustpython.revision, "59453b9b2505600dcfc5de06aafedeba260b600d");
  assert.equal(loaded.cases.filter((entry) => entry.fixtures.length === 1).length, 4);
});

test("source, helper, and license edits are rejected before execution", (context) => {
  const root = copyFixture(context);
  for (const file of ["selected/builtin_callable.py", "support/testutils.py", "LICENSE", "SOURCE.json"]) {
    const path = join(root, "suites/rustpython", file);
    const original = readFileSync(path);
    writeFileSync(path, Buffer.concat([original, Buffer.from("\n")]));
    assert.throws(() => loadManifest(join(root, "manifest.json")), /digest differs|source bytes differ/);
    writeFileSync(path, original);
  }
  writeFileSync(join(root, "suites/rustpython/extra.py"), "assert True\n");
  assert.throws(() => loadManifest(join(root, "manifest.json")), /inventory differs/);
});

test("manifest rejects duplicate IDs, missing fixture provenance, and unsupported execution contracts", (context) => {
  const root = copyFixture(context);
  const filename = join(root, "manifest.json");
  const original = JSON.parse(readFileSync(filename));
  for (const mutate of [
    (data) => data.cases.push(data.cases[0]),
    (data) => { data.cases[0].path = "../elsewhere.py"; },
    (data) => { data.cases[0].fixtures = [{ path: "unknown.py", destination: "testutils.py" }]; },
    (data) => { data.cases[0].fixtures = [{ path: "support/testutils.py", destination: "CASE.PY" }]; },
    (data) => { data.cases[0].timeoutMs = 0; },
    (data) => { data.cases[0].timeoutMs = 999999999; },
    (data) => { data.cases[0].maxOutputBytes = -1; },
    (data) => { data.cases[0].runner = "shell"; },
    (data) => { data.cases[0].capabilities.push("network"); },
    (data) => { data.cases[0].disposition = "expected-failure"; },
    (data) => { data.cases[0].sourceSha256 = "0".repeat(64); },
  ]) {
    const data = structuredClone(original);
    mutate(data);
    writeFileSync(filename, JSON.stringify(data));
    assert.throws(() => loadManifest(filename));
  }
});

test("manifest paths are host-neutral and cannot escape the selected suite", () => {
  for (const path of ["../x", "/x", "C:/x", "a\\x", "a//b", "./x", "a/../b", "a/.", "CON.py", "nul", "x."]) {
    assert.throws(() => safePath(path));
  }
  assert.equal(safePath("selected/builtin_dict_union.py"), "selected/builtin_dict_union.py");
});

test("isolated environments omit credentials, user import paths, and preload hooks", () => {
  const environment = isolatedEnvironment("scratch", {
    PATH: "executable-path", SystemRoot: "windows-root", HOME: "real-home",
    NPM_TOKEN: "fake-secret", PYTHONPATH: "poison", NODE_OPTIONS: "--require poison",
    LD_PRELOAD: "poison", SAGEJS_EXECUTABLE_NAME: "sagejs",
  });
  assert.equal(environment.PATH, "executable-path");
  assert.equal(environment.HOME, "scratch");
  for (const name of ["NPM_TOKEN", "PYTHONPATH", "NODE_OPTIONS", "LD_PRELOAD", "SAGEJS_EXECUTABLE_NAME"]) {
    assert.equal(environment[name], undefined);
  }
});

test("CLI rejects unknown arguments and preserves explicit diagnostic scope", () => {
  assert.equal(parseArguments(["--artifact-report"]).artifactReport, true);
  assert.deepEqual(parseArguments(["--only", "rustpython/builtin_callable"]).only,
    ["rustpython/builtin_callable"]);
  assert.throws(() => parseArguments(["--only"]), /missing value/);
  assert.throws(() => parseArguments(["--update-baseline"]), /unknown argument/);
});

function execution(status = 0, output = "") {
  return { status, signal: null, timedOut: false, outputLimited: false, error: null,
    stdout: output, stderr: "", output, durationMs: 1,
    raw: { stdout: Buffer.from(output).toString("base64"), stderr: "", output: Buffer.from(output).toString("base64") } };
}

test("case runner launches the subject only after a clean oracle and keeps the required failure visible", async (context) => {
  const root = copyFixture(context);
  const [entry] = loadManifest(join(root, "manifest.json")).cases;
  let calls = 0;
  const scratch = join(root, "run");
  mkdirSync(scratch);
  const failed = await runCase(entry, "oracle", scratch, { execute: async () => { calls++; return execution(1); } });
  assert.equal(failed.status, "oracle-error");
  assert.equal(calls, 1);
  assert.equal(failed.executions.subject, undefined);
  assert.equal(failed.evidence.subject, null);

  const secondScratch = join(root, "second-run");
  mkdirSync(secondScratch);
  const result = await runCase(entry, "oracle", secondScratch, {
    execute: async (_command, _args, options) => {
      assert.equal(options.env.HOME, options.cwd);
      assert.equal(readFileSync(join(options.cwd, "case.py"), "utf8"), readFileSync(join(entry.directory, entry.path), "utf8"));
      return execution(++calls === 2 ? 0 : 1);
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.status, "assertion-failure");
  assert.equal(result.disposition, "required");
  assert.equal(result.performance.status, "unmeasured");
  assert.equal(result.evidence.subject.exitCode, 1);
});
