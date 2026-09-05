// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const {
  sha256, canonical, snapshotSource, caseEvidence, reviewMatches, compareCaseRecord,
} = require("../tools/python-compat/evidence.cjs");

function execution(stdout, overrides = {}) {
  return { status: 0, signal: null, timedOut: false, error: null,
    output: stdout, stdout, stderr: "", ...overrides };
}

function record(oracle = "correct\n", subject = oracle) {
  return { status: oracle === subject ? "pass" : "output-mismatch",
    rawStatus: oracle === subject ? "pass" : "output-mismatch",
    evidence: caseEvidence(sha256("print('correct')\n"), execution(oracle), execution(subject)) };
}

test("evidence preserves only the existing CRLF normalization", () => {
  assert.deepEqual(record("correct\n").evidence, record("correct\r\n").evidence);
  assert.notDeepEqual(record("correct\n").evidence, record("correct \n").evidence);
  assert.notDeepEqual(record("a\nb\n").evidence, record("b\na\n").evidence);
});

test("same-status wrong results, oracle drift, and changed source stay visible", () => {
  const before = record("correct\n", "wrong\n");
  assert.match(compareCaseRecord("case", before, record("correct\n", "other wrong\n")).join("\n"), /subject evidence changed/);
  assert.match(compareCaseRecord("case", before, record("changed oracle\n", "wrong\n")).join("\n"), /oracle evidence changed/);
  const edited = structuredClone(before);
  edited.evidence.sourceSha256 = sha256("different source");
  assert.match(compareCaseRecord("case", before, edited).join("\n"), /sourceSha256 evidence changed/);
  assert.match(compareCaseRecord("case", before, record()).join("\n"), /output-mismatch -> pass/);
  assert.deepEqual(compareCaseRecord("case", before, structuredClone(before)), []);
});

test("execution evidence distinguishes streams, termination, and infrastructure errors", () => {
  const base = record().evidence;
  for (const changed of [
    execution("correct\n", { stdout: "", stderr: "correct\n" }),
    execution("correct\n", { status: 1 }),
    execution("correct\n", { status: null, signal: "SIGKILL", timedOut: true }),
    execution("correct\n", { error: { code: "ENOENT", message: "not found" } }),
  ]) {
    assert.notDeepEqual(base, caseEvidence(base.sourceSha256, execution("correct\n"), changed));
  }
});

test("fingerprints distinguish invalid UTF-8 bytes instead of replacement characters", () => {
  const rawExecution = (bytes) => ({ ...execution(bytes.toString("utf8")),
    raw: { output: bytes.toString("base64"), stdout: bytes.toString("base64"), stderr: "" } });
  const left = rawExecution(Buffer.from([255]));
  const right = rawExecution(Buffer.from([254]));
  assert.equal(left.output, right.output);
  assert.notDeepEqual(caseEvidence(sha256("source"), left, left), caseEvidence(sha256("source"), left, right));
  const crlf = rawExecution(Buffer.from([255, 13, 10]));
  const lf = rawExecution(Buffer.from([255, 10]));
  assert.deepEqual(caseEvidence(sha256("source"), crlf, crlf), caseEvidence(sha256("source"), lf, lf));
});

test("intentional reviews bind both raw outcomes, source, and exact oracle version", () => {
  const result = record("CPython\n", "Sage.js\n");
  const reference = { implementation: "CPython", version: "3.14.4", command: "/python" };
  const review = { expectedStatus: "output-mismatch", evidence: result.evidence,
    reference: { implementation: "CPython", version: "3.14.4" } };
  assert.equal(reviewMatches(review, result, reference), true);
  assert.equal(reviewMatches(review, record("CPython\n", "unreviewed\n"), reference), false);
  assert.equal(reviewMatches(review, record("CPython\n", "CPython\n"), reference), false);
  assert.equal(reviewMatches(review, result, { ...reference, version: "3.14.5" }), false);
  assert.equal(reviewMatches(review, { ...result, status: "runtime-error" }, reference), false);
  assert.equal(reviewMatches({ expectedStatus: "output-mismatch" }, result, reference), false);
});

test("source snapshot is deterministic and binds fixtures and license bytes", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-source-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "fixtures"));
  writeFileSync(join(directory, "case.py"), "print('test')\n");
  writeFileSync(join(directory, "LICENSE"), "MIT\n");
  writeFileSync(join(directory, "fixtures", "data"), Buffer.from([0, 255, 128]));
  const before = snapshotSource(directory);
  assert.deepEqual(before.files.map((file) => file.path), ["LICENSE", "case.py", "fixtures/data"]);
  assert.deepEqual(snapshotSource(directory), before);
  writeFileSync(join(directory, "fixtures", "data"), "changed");
  assert.notEqual(snapshotSource(directory).sha256, before.sha256);
  writeFileSync(join(directory, "new.py"), "pass\n");
  assert.equal(snapshotSource(directory).files.length, 4);
});

test("source snapshot rejects symlink escapes", { skip: process.platform === "win32" && "Windows symlink privilege is optional" }, (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-source-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  symlinkSync(__filename, join(directory, "escaped.py"));
  assert.throws(() => snapshotSource(directory), /rejects symlinks/);
});

test("canonical evidence is order-independent and rejects non-JSON values", () => {
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
  assert.throws(() => canonical({ bad: undefined }), /finite JSON/);
  assert.throws(() => canonical({ bad: NaN }), /finite JSON/);
  for (const bad of [() => {}, Symbol("bad"), 1n, new Array(1)]) {
    assert.throws(() => canonical(bad), /finite JSON/);
  }
  assert.throws(() => canonical(new Date()), /plain JSON/);
});
