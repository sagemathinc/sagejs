// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { checkWorkflow, failureKind, oracleIdentitySource, validateOracleIdentity } = require("../scripts/run-pure-python-packages.cjs");
const { parsePhaseExecution } = require("../scripts/python-package-phases.cjs");
const { sha256 } = require("../tools/python-compat/evidence.cjs");

const target = resolve("packages");
const entry = { module: "idna", stdout: "bücher.de\n" };
const rawResult = (bytes) => ({ status: 0, signal: null, timedOut: false, outputLimited: false,
  error: null, stderr: "", stdout: "decoded text must not override raw evidence", durationMs: 12,
  raw: { stdout: Buffer.from(bytes).toString("base64"), stderr: "" } });
const modulePath = join(target, "idna", "__init__.py");
const smokeOutput = `bücher.de\n__SAGEJS_PACKAGE_PATH__=${modulePath}\n`;
const dependencies = { failureKind, checkWorkflow, resolvePath: (filename) => filename };

test("smoke comparison accepts only CRLF transport normalization and preserves raw bytes", () => {
  for (const output of [smokeOutput, smokeOutput.replaceAll("\n", "\r\n")]) {
    const execution = rawResult(output);
    const original = JSON.stringify(execution);
    assert.equal(checkWorkflow(execution, entry, target, dependencies.resolvePath).kind, "pass");
    assert.equal(JSON.stringify(execution), original);
  }
  for (const output of [smokeOutput.replace("bücher", "bü\rcher"), smokeOutput.replace("\n", "\r"),
    smokeOutput.replace("bücher", "bucher"), Buffer.concat([Buffer.from([255]), Buffer.from(smokeOutput)])]) {
    assert.notEqual(checkWorkflow(rawResult(output), entry, target, dependencies.resolvePath).kind, "pass");
  }
});

test("phase parser accepts raw Windows CRLF without changing timing or semantic evidence", () => {
  const output = `__SAGEJS_PACKAGE_PHASE__=cold-import:1\n__SAGEJS_PACKAGE_PHASE__=first-call:2\n__SAGEJS_PACKAGE_PHASE__=warm-throughput:3\n__SAGEJS_PACKAGE_VERIFIED__\n__SAGEJS_PACKAGE_PATH__=${modulePath}\n`;
  for (const value of [output, output.replaceAll("\n", "\r\n")]) {
    const execution = rawResult(value);
    const original = JSON.stringify(execution);
    const result = parsePhaseExecution(execution, entry, target, "phases", dependencies);
    assert.equal(result.kind, "pass");
    assert.deepEqual(result.timings, { "cold-import": 1, "first-call": 2, "warm-throughput": 3 });
    assert.equal(JSON.stringify(execution), original);
  }
  for (const value of [output.replace("first-call:2", "first-call:\r2"),
    Buffer.concat([Buffer.from([255]), Buffer.from(output)])]) {
    assert.equal(parsePhaseExecution(rawResult(value), entry, target, "phases", dependencies).kind, "invalid-timing-output");
  }
});

const oracle = { implementation: "CPython", version: "3.14.4" };
const reference = { ...oracle, implementationName: "cpython", fullVersion: "3.14.4 (unit fixture build)",
  executable: resolve("python.exe"), cacheTag: "cpython-314", freeThreaded: false, gilEnabled: true };
const identityIO = { resolvePath: (filename) => filename, inspectPath: () => ({ isFile: () => true }),
  readBytes: () => Buffer.from("executable fixture bytes") };

test("oracle identity accepts CRLF, records build flavor, and hashes local executable bytes", () => {
  const execution = rawResult(JSON.stringify(reference) + "\r\n");
  const original = JSON.stringify(execution);
  const result = validateOracleIdentity(execution, oracle, identityIO);
  assert.deepEqual(result, { ...reference, realExecutable: reference.executable,
    executableSha256: sha256(Buffer.from("executable fixture bytes")) });
  assert.equal(JSON.stringify(execution), original);
  const threaded = { ...reference, freeThreaded: true, gilEnabled: false };
  assert.equal(validateOracleIdentity(rawResult(JSON.stringify(threaded)), oracle, identityIO).freeThreaded, true);
  for (const token of ["implementationName", "fullVersion", "cacheTag", "Py_GIL_DISABLED", "_is_gil_enabled"]) {
    assert.ok(oracleIdentitySource.includes(token));
  }
});

test("oracle identity rejects malformed transport, mismatched pins and incomplete build flavor", () => {
  for (const changes of [{ implementationName: "pypy" }, { version: "3.14.5" }, { fullVersion: "3.14.3 older" },
    { cacheTag: null }, { freeThreaded: "false" }, { gilEnabled: undefined }, { gilEnabled: false }, { executable: "python" }]) {
    assert.throws(() => validateOracleIdentity(rawResult(JSON.stringify({ ...reference, ...changes })), oracle, identityIO));
  }
  for (const bytes of [JSON.stringify(reference) + "\r", Buffer.concat([Buffer.from(JSON.stringify(reference)), Buffer.from([255])])]) {
    assert.throws(() => validateOracleIdentity(rawResult(bytes), oracle, identityIO), /transport/);
  }
  assert.throws(() => validateOracleIdentity({ ...rawResult(JSON.stringify(reference)), timedOut: true }, oracle, identityIO));
});

test("oracle executable must be an absolute existing regular file", (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "sagejs-oracle-identity-unit-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const executable = join(scratch, "python-fixture.exe");
  writeFileSync(executable, "fixture executable bytes");
  const record = validateOracleIdentity(rawResult(JSON.stringify({ ...reference, executable })), oracle);
  assert.equal(record.executableSha256, sha256(Buffer.from("fixture executable bytes")));
  for (const invalid of [scratch, join(scratch, "missing.exe"), "relative.exe"]) {
    assert.throws(() => validateOracleIdentity(rawResult(JSON.stringify({ ...reference, executable: invalid })), oracle));
  }
});
