// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { caseEvidence, sha256 } = require("../tools/python-compat/evidence.cjs");

const {
  requireCurrentBuild,
  requireUnchangedWorkspace,
  makeBaseline, compareBaseline, makeReport, parseArguments,
  applyIntentionalIncompatibilities,
  execute, classifySagejs,
} = require("../scripts/run-python-conformance.cjs");

const reference = { implementation: "CPython", version: "3.14.4", majorMinor: "3.14" };
const excluded = { expected: [], unittest: [] };
const provenance = { corpus: { sha256: sha256("fixture") } };

test("validation identity may not change just because artifacts remain reusable", () => {
  assert.doesNotThrow(() => requireUnchangedWorkspace("before", "before"));
  assert.throws(() => requireUnchangedWorkspace("before", "after"), /validation workspace changed/);
});

function result(stdout = "correct\n") {
  const execution = (output) => ({
    status: 0, signal: null, timedOut: false, error: null,
    output, stdout: output, stderr: "",
  });
  return {
    name: "example.py", status: stdout === "correct\n" ? "pass" : "output-mismatch",
    evidence: caseEvidence(sha256("example"), execution("correct\n"), execution(stdout)),
  };
}

function fixture(t, results = [result()]) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-conformance-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "baseline.json");
  const baseline = makeBaseline(results, reference, excluded, provenance);
  writeFileSync(filename, JSON.stringify(baseline));
  return { filename, baseline };
}

test("Python conformance accepts a current exact build receipt", () => {
  const current = {
    current: true,
    reason: "exact build inputs and required outputs match",
  };
  assert.equal(requireCurrentBuild(() => current), current);
});

test("Python conformance fails before execution when the build is stale", () => {
  assert.throws(
    () =>
      requireCurrentBuild(() => ({
        current: false,
        reason: "build inputs changed",
      })),
    /build is stale \(build inputs changed\); run pnpm build:check/,
  );
});

test("artifact diagnosis cannot check, update, or partially replace a baseline", () => {
  assert.equal(parseArguments(["--artifact-report", "--only", "dict", "--json", "report.json"]).artifactReport, true);
  for (const args of [
    ["--artifact-report", "--check"], ["--artifact-report", "--update-baseline"],
    ["--check", "--only", "dict"], ["--update-baseline", "--only", "dict"],
    ["--check", "--update-baseline"],
  ]) assert.throws(() => parseArguments(args), /cannot|mutually exclusive/);
});

test("format-2 baseline detects same-status changed outputs and provenance", (t) => {
  const before = result("wrong\n");
  const { filename } = fixture(t, [before]);
  assert.deepEqual(compareBaseline([before], reference, excluded, filename, provenance), []);
  assert.match(compareBaseline([result("another wrong\n")], reference, excluded, filename, provenance).join("\n"), /subject evidence changed/);
  assert.match(compareBaseline([before], reference, excluded, filename, { changed: true }).join("\n"), /provenance changed/);
  assert.match(compareBaseline([result()], reference, excluded, filename, provenance).join("\n"), /output-mismatch -> pass/);
  assert.match(compareBaseline([], reference, excluded, filename, provenance).join("\n"), /missing/);
  assert.match(compareBaseline([before, { ...before, name: "new.py" }], reference, excluded, filename, provenance).join("\n"), /new test/);
  assert.match(compareBaseline([before], reference, { ...excluded, expected: ["new.py"] }, filename, provenance).join("\n"), /excluded tests changed/);
});

test("legacy baselines and changed patch-level oracles require explicit review", (t) => {
  const { filename, baseline } = fixture(t);
  assert.throws(() => compareBaseline([result()], { ...reference, version: "3.14.5" }, excluded, filename, provenance), /baseline uses CPython 3.14.4/);
  writeFileSync(filename, JSON.stringify({ ...baseline, format: 1 }));
  assert.throws(() => compareBaseline([result()], reference, excluded, filename, provenance), /lacks source\/outcome fingerprints/);
});

test("reviewed GC output alternatives are exact and do not hide new variations", (t) => {
  const first = result("finalizer deferred\n");
  const second = result("finalizer ran at exit\n");
  const reviews = { [first.name]: {
    reference: { implementation: reference.implementation, version: reference.version },
    evidence: first.evidence, alternateEvidence: [second.evidence],
    expectedStatus: "output-mismatch", reason: "explicitly reviewed nondeterminism",
  } };
  const classify = (r) => applyIntentionalIncompatibilities([r], reviews, reference);
  const { filename } = fixture(t, classify(first));
  assert.deepEqual(compareBaseline(classify(second), reference, excluded, filename, provenance), []);
  assert.deepEqual(makeBaseline(classify(first), reference, excluded, provenance), makeBaseline(classify(second), reference, excluded, provenance));
  const unexpected = classify(result("unreviewed callback output\n"));
  assert.equal(unexpected[0].status, "output-mismatch");
  assert.notDeepEqual(compareBaseline(unexpected, reference, excluded, filename, provenance), []);
  const forged = { ...classify(second)[0], status: "pass" };
  assert.notDeepEqual(compareBaseline([forged], reference, excluded, filename, provenance), []);
});

test("intentional difference classification cannot mask new wrong output", () => {
  const before = result("reviewed difference\n");
  const reviews = { [before.name]: {
    reference: { implementation: reference.implementation, version: reference.version },
    evidence: before.evidence, expectedStatus: before.status, reason: "documented difference",
  } };
  assert.equal(applyIntentionalIncompatibilities([before], reviews, reference)[0].status, "intentional-incompatibility");
  assert.equal(applyIntentionalIncompatibilities([result("new wrong answer\n")], reviews, reference)[0].status, "output-mismatch");
  assert.equal(applyIntentionalIncompatibilities([result()], reviews, reference)[0].status, "pass");
  for (const status of ["launch-error", "oracle-error", "timeout"]) {
    const raw = { ...before, status };
    const forbidden = { [raw.name]: { ...reviews[raw.name], expectedStatus: status } };
    assert.equal(applyIntentionalIncompatibilities([raw], forbidden, reference)[0].status, status);
  }
});

test("JSON report never calls a failed, uncompleted, or artifact-only run qualified", () => {
  for (const current of [false, true]) {
    for (const status of ["not-requested", "not-completed", "failed", "passed"]) {
      const report = makeReport({ reference, provenance, excluded,
        artifacts: {}, build: { current }, results: [], gate: { status } });
      assert.equal(report.artifact.qualifiedGate, current && status === "passed");
      assert.equal(JSON.parse(JSON.stringify(report)).gate.status, status);
      assert.equal(report.subject.route, "source");
      assert.match(report.subject.args[0], /sagejs-source\.cjs$/);
    }
  }
});

test("execution and comparison preserve raw bytes and serializable launch errors", async () => {
  const options = { cwd: process.cwd(), env: process.env, timeout: 5000 };
  const left = await execute(process.execPath, ["-e", "process.stdout.write(Buffer.from([255]))"], options);
  const right = await execute(process.execPath, ["-e", "process.stdout.write(Buffer.from([254]))"], options);
  assert.equal(left.output, right.output);
  assert.equal(classifySagejs(right, left).status, "output-mismatch");
  assert.equal(classifySagejs(left, left).status, "pass");
  assert.equal(left.raw.stdout, "/w==");
  const failed = await execute(join(__dirname, "nonexistent-conformance-executable"), [], options);
  const decoded = JSON.parse(JSON.stringify(failed));
  assert.equal(decoded.error.code, "ENOENT");
  assert.equal(classifySagejs(failed, left).status, "launch-error");
});
