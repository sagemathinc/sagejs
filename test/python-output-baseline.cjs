// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const {
  classifySagejs, validateIntentionalIncompatibilities,
  applyIntentionalIncompatibilities, makeBaselineRecord, compareBaselineRecord,
} = require("../tools/python-compat/output-baseline.cjs");
const { caseEvidence, sha256 } = require("../tools/python-compat/evidence.cjs");

const suite = join(__dirname, "../upstream-tests/micropython");
const read = (name) => JSON.parse(readFileSync(join(suite, name), "utf8"));
const baseline = read("baselines/3.14.json");
const source = read("SOURCE.json");
const reviewDocument = read("INTENTIONAL-INCOMPATIBILITIES.json");
const excluded = {
  expected: baseline.selection.excludedExpected,
  unittest: baseline.selection.excludedUnittest,
};
const rawResults = () => Object.entries(baseline.outcomes).map(([name]) => ({
  name, status: baseline.rawStatuses[name], evidence: structuredClone(baseline.evidence[name]),
}));
const reviewed = (results) => applyIntentionalIncompatibilities(
  results, reviewDocument.tests, baseline.reference,
);
const compare = (results, record = baseline) => compareBaselineRecord(
  results, baseline.reference, excluded, record, baseline.provenance, source,
);

test("pure helpers replay every recorded baseline fingerprint without regeneration", () => {
  assert.equal(validateIntentionalIncompatibilities(reviewDocument, rawResults()), reviewDocument.tests);
  const results = reviewed(rawResults());
  assert.deepEqual(compare(results), []);
  assert.deepEqual(makeBaselineRecord(results, baseline.reference, excluded,
    baseline.provenance, source), baseline);
  assert.equal(results.length, baseline.selection.candidates);
  assert.deepEqual(results.filter((result) => result.status === "intentional-incompatibility")
    .map((result) => result.name).sort(), Object.keys(reviewDocument.tests).sort());
});

test("all reviewed alternatives remain exact; a new variation is not accepted", () => {
  for (const [name, review] of Object.entries(reviewDocument.tests)) {
    for (const evidence of [review.evidence, ...(review.alternateEvidence ?? [])]) {
      const raw = rawResults();
      raw.find((result) => result.name === name).evidence = structuredClone(evidence);
      const results = reviewed(raw);
      assert.deepEqual(compare(results), []);
      assert.deepEqual(makeBaselineRecord(results, baseline.reference, excluded,
        baseline.provenance, source), baseline);
    }
    const raw = rawResults();
    const changed = raw.find((result) => result.name === name);
    changed.evidence.subject.stdoutSha256 = sha256("unreviewed variation");
    const results = reviewed(raw);
    assert.equal(results.find((result) => result.name === name).status, review.expectedStatus);
    assert.notDeepEqual(compare(results), []);
  }
});

test("a former reviewed difference passing still requires baseline review", () => {
  const raw = rawResults();
  const name = Object.keys(reviewDocument.tests)[0];
  raw.find((result) => result.name === name).status = "pass";
  const results = reviewed(raw);
  assert.equal(results.find((result) => result.name === name).status, "pass");
  assert.match(compare(results).join("\n"), /intentional-incompatibility -> pass/);
});

function execution(bytes, fields = {}) {
  const text = bytes.toString("utf8");
  return { status: 0, signal: null, timedOut: false, error: null,
    output: text, stdout: text, stderr: "",
    raw: { output: bytes.toString("base64"), stdout: bytes.toString("base64"), stderr: "" },
    ...fields };
}

test("raw bytes and diagnostic precedence survive extraction", () => {
  const expected = execution(Buffer.from([255]));
  const actual = execution(Buffer.from([254]));
  assert.equal(expected.output, actual.output);
  assert.deepEqual(classifySagejs(actual, expected), {
    status: "output-mismatch", detail: "output differs",
  });
  assert.equal(classifySagejs(execution(Buffer.from("a\r\n")), execution(Buffer.from("a\n"))).status, "pass");
  assert.equal(classifySagejs(execution(Buffer.alloc(0), { timedOut: true,
    error: { message: "launch failed" } }), expected).status, "launch-error");
  assert.equal(classifySagejs(execution(Buffer.alloc(0), { timedOut: true }), expected).status, "timeout");
  for (const [text, status] of [
    ["Failed Import: abc module doesn't exist", "missing-module"],
    ["invalid syntax", "compile-error"], ["ReferenceError: x", "missing-name"],
    ["TypeError: bad argument", "runtime-error"],
  ]) assert.equal(classifySagejs(execution(Buffer.from(text), { status: 1 }), expected).status, status);
});

test("same combined output with moved streams changes the evidence gate", () => {
  const first = execution(Buffer.from("same\n"));
  const moved = { ...first, stdout: "", stderr: first.output,
    raw: { output: first.raw.output, stdout: "", stderr: first.raw.output } };
  assert.equal(classifySagejs(moved, first).status, "pass");
  assert.notDeepEqual(caseEvidence(sha256("source"), first, first),
    caseEvidence(sha256("source"), first, moved));
});

test("version, source, selection, provenance, and review validation remain strict", () => {
  const results = reviewed(rawResults());
  assert.throws(() => compareBaselineRecord(results,
    { ...baseline.reference, version: "3.14.5" }, excluded, baseline,
    baseline.provenance, source), /baseline uses CPython/);
  assert.throws(() => compare(results, { ...baseline, format: 1 }), /lacks source\/outcome fingerprints/);
  assert.throws(() => compareBaselineRecord(results, baseline.reference, excluded,
    baseline, baseline.provenance, { ...source, revision: "changed" }), /source metadata/);
  assert.match(compare(results.slice(1)).join("\n"), /candidate count changed|missing/);
  assert.match(compareBaselineRecord(results, baseline.reference,
    { ...excluded, expected: [] }, baseline, {}, source).join("\n"), /provenance changed/);
  assert.throws(() => validateIntentionalIncompatibilities({ ...reviewDocument, format: 1 }, results), /format 2/);
  assert.throws(() => validateIntentionalIncompatibilities(reviewDocument, []), /not a differential candidate/);
  for (const forbidden of ["pass", "timeout", "launch-error", "oracle-error"]) {
    const invalid = structuredClone(reviewDocument);
    Object.values(invalid.tests)[0].expectedStatus = forbidden;
    assert.throws(() => validateIntentionalIncompatibilities(invalid, results), /invalid review record/);
  }
});
