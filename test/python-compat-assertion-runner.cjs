// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { setTimeout: delay } = require("node:timers/promises");
const test = require("node:test");
const { executeAssertion, classifyAssertion } = require("../tools/python-compat/assertion-runner.cjs");
const { caseEvidence, sha256 } = require("../tools/python-compat/evidence.cjs");

const options = { cwd: tmpdir(), env: {}, timeoutMs: 5000, maxOutputBytes: 65536 };
const run = (source, overrides = {}) => executeAssertion(process.execPath, ["-e", source], { ...options, ...overrides });
const silent = () => ({ status: 0, signal: null, timedOut: false, outputLimited: false,
  error: null, stdout: "", stderr: "", output: "" });

test("assertion success requires silent zero exit from both interpreters", async () => {
  const result = await run("void 0");
  assert.equal(classifyAssertion(result, result), "pass");
  assert.equal(classifyAssertion(result), "subject-required");
  assert.equal(result.status, 0);
  assert.ok(result.durationMs >= 0);
  assert.equal(caseEvidence(sha256("pass"), result, result).subject.exitCode, 0);
});

test("both pipes drain and raw invalid UTF-8 survives unchanged", async () => {
  const result = await run("process.stdout.write(Buffer.from([255,13,10])); process.stderr.write('error\\r\\n')");
  assert.deepEqual(Buffer.from(result.raw.stdout, "base64"), Buffer.from([255, 13, 10]));
  assert.equal(result.stdout, "\ufffd\n");
  assert.equal(result.stderr, "error\n");
  assert.equal(Buffer.from(result.raw.output, "base64").length, 10);
  assert.equal(classifyAssertion(silent(), result), "unexpected-output");
});

test("environment is explicit, without inherited credentials or NODE_OPTIONS", async (t) => {
  const key = "SAGEJS_ASSERTION_PARENT_ONLY";
  const previous = process.env[key];
  process.env[key] = "must-not-leak";
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  const result = await run("if (process.env.SAGEJS_ASSERTION_PARENT_ONLY || process.env.NODE_OPTIONS) process.exit(1); if(process.env.SAGEJS_TEST_VALUE !== 'yes') process.exit(2)",
    { env: { SAGEJS_TEST_VALUE: "yes" } });
  assert.equal(result.status, 0);
  await assert.rejects(run("", { env: undefined }), /explicit clean environment/);
});

test("launch errors retain serializable evidence", async () => {
  const result = await executeAssertion(join(tmpdir(), "sagejs-nonexistent-assertion-command"), [], options);
  assert.equal(result.error.code, "ENOENT");
  assert.equal(classifyAssertion(silent(), result), "launch-error");
  assert.doesNotThrow(() => JSON.stringify(caseEvidence(sha256("source"), silent(), result)));
});

test("combined stdout/stderr budget is bounded and exact-boundary output is retained", async () => {
  const exact = await run("process.stdout.write('1234'); process.stderr.write('5678')", { maxOutputBytes: 8 });
  assert.equal(exact.outputLimited, false);
  assert.equal(Buffer.from(exact.raw.output, "base64").length, 8);
  const flooded = await run("for (;;) { process.stdout.write('12345678'); process.stderr.write('abcdefgh'); }", { maxOutputBytes: 100 });
  assert.equal(flooded.outputLimited, true);
  assert.equal(Buffer.from(flooded.raw.output, "base64").length, 100);
  assert.equal(Buffer.from(flooded.raw.stdout, "base64").length + Buffer.from(flooded.raw.stderr, "base64").length, 100);
  assert.equal(classifyAssertion(silent(), flooded), "output-limit");
});

test("timeout terminates a live case and does not classify it as assertion failure", async () => {
  const result = await run("setInterval(() => {}, 1000)", { timeoutMs: 200 });
  assert.equal(result.timedOut, true);
  assert.equal(classifyAssertion(silent(), result), "timeout");
  assert.ok(result.durationMs < 4000);
});

test("POSIX group cleanup includes descendants after timeout and normal parent exit", {
  skip: process.platform === "win32" && "normal-exit Windows orphan cleanup requires a Job Object",
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-assertion-tree-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const timeout of [false, true]) {
    const marker = join(directory, timeout ? "timeout" : "exit");
    const descendant = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'leaked'), 700)`;
    const source = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio:'ignore', env:{}}); ${timeout ? "setInterval(() => {}, 1000)" : "setTimeout(() => process.exit(0), 100)"}`;
    const result = await run(source, { timeoutMs: 400 });
    assert.equal(result.timedOut, timeout);
    await delay(800);
    assert.equal(existsSync(marker), false, "a descendant survived its assertion case");
  }
});

test("failed or skipped oracle prevents scheduling a subject", async () => {
  for (const source of ["process.exit(1)", "console.log('Skipping test: unsupported')"]) {
    const oracle = await run(source);
    let subjectCalls = 0;
    if (classifyAssertion(oracle) === "subject-required") subjectCalls += 1;
    assert.equal(subjectCalls, 0);
    assert.equal(classifyAssertion(oracle), "oracle-error");
  }
  assert.equal(classifyAssertion(silent(), { ...silent(), status: 1 }), "assertion-failure");
  assert.equal(classifyAssertion(silent(), { ...silent(), stderr: "Skipping test" }), "unexpected-output");
});

test("invalid resource bounds are rejected instead of silently becoming unlimited", async () => {
  for (const overrides of [{ timeoutMs: 0 }, { timeoutMs: 2 ** 32 }, { maxOutputBytes: -1 }, { maxOutputBytes: Infinity }]) {
    await assert.rejects(run("", overrides), /positive bounded integer/);
  }
});
