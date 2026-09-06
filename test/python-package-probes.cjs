// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { sha256 } = require("../tools/python-compat/evidence.cjs");
const { parseArguments, checkReceipt, checkWorkflow, failureKind, runCase } = require("../scripts/run-pure-python-packages.cjs");

const entry = { name: "six", module: "six", version: "1.17.0", wheel: "six.whl",
  sha256: "a".repeat(64), source: "import six\nprint('ok')\n", stdout: "ok\n" };
const success = (stdout = "") => ({ status: 0, signal: null, timedOut: false,
  outputLimited: false, error: null, stdout, stderr: "", output: stdout });

test("CLI rejects ambiguity and unknown options", () => {
  assert.deepEqual(parseArguments(["--only", "six", "--artifact-report"]).only, ["six"]);
  assert.throws(() => parseArguments(["--python"]));
  assert.throws(() => parseArguments(["--update-baseline"]));
});

test("receipt must bind all package identity fields", () => {
  checkReceipt(entry, entry);
  for (const field of ["name", "version", "wheel", "sha256"]) {
    assert.throws(() => checkReceipt(entry, { ...entry, [field]: "wrong" }));
  }
});

test("resource and process failures cannot pass", () => {
  for (const [change, kind] of [
    [{ error: { message: "missing" } }, "launch-error"],
    [{ outputLimited: true }, "output-limit"], [{ timedOut: true }, "timeout"],
    [{ signal: "SIGKILL" }, "execution-failure"], [{ status: 1 }, "execution-failure"],
    [{ stderr: "warning" }, "unexpected-stderr"],
  ]) assert.equal(failureKind({ ...success(), ...change }), kind);
});

test("stdout and module origin must match, including raw output", () => {
  const target = resolve("packages");
  const modulePath = join(target, "six.py");
  const good = success(`ok\n__SAGEJS_PACKAGE_PATH__=${modulePath}\n`);
  assert.equal(checkWorkflow(good, entry, target, (path) => path).kind, "pass");
  assert.equal(checkWorkflow(success("wrong\n"), entry, target).kind, "output-mismatch");
  const outside = success(`ok\n__SAGEJS_PACKAGE_PATH__=${resolve("outside.py")}\n`);
  assert.equal(checkWorkflow(outside, entry, target, (path) => path).kind, "module-path-mismatch");
  assert.equal(checkWorkflow(good, entry, target, () => { throw new Error("missing"); }).kind, "module-path-mismatch");
  assert.equal(checkWorkflow({ ...good, raw: { stdout: Buffer.from("wrong").toString("base64") } }, entry, target).kind, "output-mismatch");
});

test("oracle failure prevents subject launch; subject failure remains distinct", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-package-probe-unit-"));
  const target = join(directory, "packages");
  const good = success(`ok\n__SAGEJS_PACKAGE_PATH__=${join(target, "six.py")}\n`);
  try {
    let calls = 0;
    const oracleFailed = await runCase(entry, "python", target, directory, {
      execute: async () => { calls++; return { ...success(), status: 1 }; }, resolvePath: (path) => path,
    });
    assert.equal(calls, 1);
    assert.equal(oracleFailed.status, "oracle-error");
    assert.equal(oracleFailed.executions.subject, null);
    calls = 0;
    const subjectFailed = await runCase(entry, "python", target, directory, {
      execute: async (command, args, bounds) => {
        calls++;
        assert.equal(bounds.env.SAGEJS_SITE_PACKAGES, target);
        assert.equal(bounds.env.PYTHONPATH, undefined);
        assert.ok(bounds.timeoutMs > 0 && bounds.maxOutputBytes > 0);
        if (calls === 1) { assert.equal(args[0], "-BS"); return good; }
        assert.ok(args.includes("--python"));
        return { ...success(), timedOut: true };
      }, resolvePath: (path) => path,
    });
    assert.equal(calls, 2);
    assert.equal(subjectFailed.status, "timeout");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("passing oracle cannot replace or remove the program offered to the subject", async () => {
  for (const mutate of [
    (filename) => writeFileSync(filename, "print('substituted')\n"),
    (filename) => rmSync(filename),
  ]) {
    const directory = mkdtempSync(join(tmpdir(), "sagejs-package-probe-unit-"));
    const target = join(directory, "packages");
    const program = join(directory, "case.py");
    let calls = 0;
    let originalDigest;
    try {
      const result = await runCase(entry, "python", target, directory, {
        execute: async () => {
          calls++;
          originalDigest = sha256(readFileSync(program));
          mutate(program);
          return success(`ok\n__SAGEJS_PACKAGE_PATH__=${join(target, "six.py")}\n`);
        }, resolvePath: (path) => path,
      });
      assert.equal(calls, 1);
      assert.equal(result.status, "source-changed");
      assert.equal(result.detail, "afterOracle");
      assert.equal(result.sourceUnchanged, false);
      assert.equal(result.sourceSha256, originalDigest);
      assert.equal(result.sourceChecks.beforeOracle, originalDigest);
      assert.notEqual(result.sourceChecks.afterOracle, originalDigest);
      assert.equal(result.executions.subject, null);
      assert.equal(result.performance.status, "unmeasured");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});

test("subject source mutation invalidates passing output and keeps raw evidence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-package-probe-unit-"));
  const target = join(directory, "packages");
  let calls = 0;
  const good = success(`ok\n__SAGEJS_PACKAGE_PATH__=${join(target, "six.py")}\n`);
  try {
    const result = await runCase(entry, "python", target, directory, {
      execute: async () => {
        if (++calls === 2) writeFileSync(join(directory, "case.py"), "pass\n");
        return good;
      }, resolvePath: (path) => path,
    });
    assert.equal(calls, 2);
    assert.equal(result.status, "source-changed");
    assert.equal(result.detail, "afterSubject");
    assert.equal(result.sourceUnchanged, false);
    assert.equal(result.sourceChecks.beforeSubject, result.sourceSha256);
    assert.notEqual(result.sourceChecks.afterSubject, result.sourceSha256);
    assert.equal(result.executions.subject, good);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("oracle failures retain source identity and force UTF-8 for non-ASCII fixtures", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-package-probe-unit-"));
  const target = join(directory, "packages");
  try {
    const result = await runCase(entry, "python", target, directory, {
      execute: async (command, args, bounds) => {
        assert.equal(bounds.env.PYTHONIOENCODING, "utf-8");
        assert.equal(bounds.env.PYTHONUTF8, "1");
        return { ...success(), status: 1 };
      }, resolvePath: (path) => path,
    });
    assert.equal(result.status, "oracle-error");
    assert.equal(result.sourceUnchanged, true);
    assert.equal(result.sourceSha256, sha256(readFileSync(join(directory, "case.py"))));
    assert.equal(result.sourceChecks.afterOracle, result.sourceSha256);
    assert.equal(result.performance.status, "unmeasured");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
