// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { loadManifest, safePath } = require("../tools/python-compat/manifest.cjs");
const { canonical, sha256, caseEvidence, executionBytes } = require("../tools/python-compat/evidence.cjs");
const root = resolve(__dirname, "../upstream-tests/python-compat");
const read = () => JSON.parse(readFileSync(join(root, "inventory/rustpython.json")));
const helpers = ["import_file", "import_mutual1", "import_mutual2", "import_name", "import_star", "import_target", "testutils"];
const reviewedCandidates = ["builtin_enumerate", "builtin_filter", "builtin_optional_attr", "builtin_str_subclass", "builtin_zip", "operator_inplace", "protocol_iterable", "stdlib_abc", "syntax_attr", "syntax_function"];
const digest = "be5cfbb647c75d1b886f0f8fcf84d87a891b6c50f93ac734ab85515cf4cade8d";
const reviewDigest = "ee751d258127fe5e2f97b7c99b23238f371a1594e722d2877016ea9e26357d4f";
const finalDispositions = ["adopted-required", "support-fixture", "upstream-excluded-negative-example", "implementation-internal", "unsupported-capability", "rejected-low-value"];
const backlogDispositions = ["high-value-backlog", "case-selection-backlog", "smoke-only-backlog", "suite-adapter-needed"];
const inputDigests = {
  "rustpython-group1-17-review-delta.json": "c7165801c9f3a2a19781238d25eabc1ce3eff1f80f7ab666667249b867d08d52",
  "rustpython-group2-18-review-delta.json": "bc0043001bf639efc2c4f4c7fb81db3910e3856c453d567345d14319f4a1777f",
  "rustpython-remaining-group3-18-review-delta.json": "2a4522117d23a2404d3c29784fc702ec2d083240e61b73a6cd7d9c789f9a3a4b",
  "rustpython-language-20-review-delta.json": "9ee3835c49a69c8b469a27a650d8adc730c438b6081799c768cc297ee9754360",
  "rustpython-builtins-20-review-delta.json": "33802b9712d5f2d3923e087eecd13174c4b5fd7c7108e6b3cff036fc86d0d662",
  "rustpython-syntax-20-review-delta.json": "7b64f889e966c26aa2dccf01b85c02b67685eeef8c5b2677fea6fac9b628f8da",
  "rustpython-stdlib-20-review-delta.json": "bb8c2ed0a4e120e1d89670dfadd465fef267a37dbac160b9ed757764555c57a2",
  "rustpython-host-20-review-delta.json": "c10046259e8b7aa2db92975ba5358851450b5df003d665f6fc7eb911be0e2a72",
  "rustpython-syntax-tail-20-review-delta.json": "d38b5d4b213a11ebf68cc3a81d687c3ca013a6a6cfc1d5598de86f6555fac5a3",
  "rustpython-mixed-20-review-delta.json": "b01c7f79b0927398e43d0404ef3bcb231b2de01dabba82e2c877bcd525f79f58",
};

function validateSourceInventory(inventory) {
  assert.equal(inventory.schema, "sagejs.python-compat-candidate-inventory/v1");
  assert.equal(inventory.cases.length, 221);
  const ids = inventory.cases.map((entry) => entry.id);
  const paths = inventory.cases.map((entry) => entry.upstreamPath);
  assert.equal(new Set(ids).size, 221);
  assert.equal(new Set(paths).size, 221);
  assert.deepEqual(paths, [...paths].sort());
  for (const entry of inventory.cases) {
    safePath(entry.upstreamPath);
    assert.match(entry.upstreamPath, /^extra_tests\/snippets\/[^/]+\.py$/);
    assert.equal(entry.id, `rustpython/${entry.upstreamPath.split("/").at(-1).slice(0, -3)}`);
    assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0);
    assert.ok(!Object.hasOwn(entry, "runner"), "candidate metadata cannot schedule execution");
    assert.ok(["static-triage", "manifest-reviewed", "source-role-reviewed", "whole-source-reviewed"].includes(entry.review.level));
    assert.ok([null, ...finalDispositions].includes(entry.review.disposition));
    assert.ok([null, undefined, ...backlogDispositions].includes(entry.review.backlogDisposition));
    if (entry.review.backlogDisposition) {
      assert.equal(entry.review.level, "whole-source-reviewed");
      assert.equal(entry.review.disposition, null, "backlog cannot silently settle a final decision");
    }
  }
  const rows = inventory.cases.map(({ upstreamPath, sourceSha256, bytes }) => ({ upstreamPath, sourceSha256, bytes }));
  assert.equal(inventory.source.sourceInventorySha256, digest);
  assert.equal(sha256(canonical(rows)), digest);
  assert.deepEqual(inventory.source.discovery.harness, {
    upstreamPath: "extra_tests/test_snippets.py", bytes: 3784,
    sha256: "404407699c97e920871df8ce286439225dd4cfc2a091e52e9e1b8e02d714a4b8",
    gitBlob: "d58b86f66b29a3ac4c645e38e058bc1d8f46ad1a",
  });
}

function validateSourceReviews(inventory) {
  validateSourceInventory(inventory);
  const reviewed = inventory.cases.filter((c) => c.wholeSourceReview);
  assert.equal(reviewed.length, 191);
  assert.equal(sha256(canonical(reviewed.map((c) => c.wholeSourceReview))), reviewDigest);
  assert.equal(inventory.sourceReviews.sourceOnlyRecordDigest, reviewDigest);
  assert.equal(inventory.sourceReviews.sourceInventorySha256, digest);
  const covered = new Set();
  assert.equal(inventory.sourceReviews.inputs.length, 10);
  assert.deepEqual(inventory.sourceReviews.inputs.map((i) => i.name).sort(), Object.keys(inputDigests).sort());
  for (const input of inventory.sourceReviews.inputs) {
    assert.equal(input.sha256, inputDigests[input.name]);
    const records = input.reviewedIds.map((id) => {
      assert.ok(!covered.has(id), `duplicate review delta ID: ${id}`);
      covered.add(id);
      const candidate = inventory.cases.find((c) => c.id === id);
      assert.ok(candidate?.wholeSourceReview, id);
      return candidate.wholeSourceReview;
    });
    assert.equal(input.entriesSha256, sha256(canonical(records)));
    assert.equal(input.sourceBytes, records.reduce((n, e) => n + e.source.bytes, 0));
    for (const skipped of input.skipped) {
      const candidate = inventory.cases.find((c) => c.id === skipped.id);
      assert.ok(candidate);
      assert.equal(candidate.sourceSha256, skipped.sourceSha256);
      assert.equal(skipped.change, "none");
      assert.ok(!input.reviewedIds.includes(skipped.id));
    }
  }
  assert.equal(covered.size, 191);
  for (const c of reviewed) {
    const e = c.wholeSourceReview;
    assert.equal(e.id, c.id);
    assert.equal(e.source.revision, inventory.source.revision);
    assert.equal(e.source.upstreamPath, c.upstreamPath);
    assert.equal(e.source.sourceSha256, c.sourceSha256);
    assert.equal(e.source.bytes, c.bytes);
    assert.equal(e.source.license, "MIT");
    assert.deepEqual(e.before, { level: "static-triage", disposition: null });
    assert.equal(c.review.level, "whole-source-reviewed");
    assert.equal(e.after.level, c.review.level);
    assert.equal(c.role, "candidate-program");
    assert.equal(e.review.coverage.startLine, 1);
    assert.ok(Number.isSafeInteger(e.review.coverage.endLine) && e.review.coverage.endLine > 0);
    assert.ok(e.review.rationale.length > 20);
    assert.deepEqual(e.execution, {
      oracle: "not-run-in-this-review", subject: "not-run", evidence: null, qualified: false,
    });
    assert.deepEqual(e.adoption, { change: "none", required: false });
    if (backlogDispositions.includes(e.after.disposition)) {
      assert.equal(c.review.disposition, null);
      assert.equal(c.review.backlogDisposition, e.after.disposition);
    } else {
      assert.ok(["implementation-internal", "unsupported-capability", "rejected-low-value"].includes(e.after.disposition));
      assert.equal(c.review.disposition, e.after.disposition);
      assert.equal(c.review.backlogDisposition, null);
    }
    if (c.review.disposition === "unsupported-capability") {
      const scope = e.review.capabilities.unsupportedScope;
      assert.ok(scope.hosts.length > 0);
      assert.ok(scope.facility.length > 0);
      assert.ok(scope.notWaived.length > 0);
    }
    const fixtures = [
      ...(e.review.fixtureClosure || []),
      ...(e.review.dependencyClosure?.upstreamFixtures || []),
      ...(e.review.dependencyClosure?.otherResources || []),
    ];
    for (const fixture of fixtures.filter((f) => f.upstreamPath)) {
      const harness = inventory.source.discovery.harness;
      const recorded = [...inventory.cases, ...inventory.resources,
        { ...harness, sourceSha256: harness.sha256 },
      ].find((r) => r.upstreamPath === fixture.upstreamPath);
      assert.ok(recorded, fixture.upstreamPath);
      assert.equal(fixture.sourceSha256, recorded.sourceSha256);
      assert.equal(fixture.bytes, recorded.bytes);
    }
  }
}

test("RustPython candidate metadata binds the exact pinned 221-file inventory without a checkout", () => {
  const inventory = read();
  validateSourceInventory(inventory);
  const loaded = loadManifest(join(root, "manifest.json"));
  assert.equal(inventory.source.revision, loaded.provenance.suites.rustpython.revision);
  assert.equal(inventory.source.revision, "59453b9b2505600dcfc5de06aafedeba260b600d");
  assert.equal(inventory.source.gitTree, "e63195af5eb65dde1d7714f10416c65128e40016");
  assert.equal(inventory.source.license.spdx, "MIT");
  assert.equal(inventory.source.license.sourceSha256,
    sha256(readFileSync(join(root, "suites/rustpython/LICENSE"))));
  for (const entry of loaded.cases.filter((entry) => entry.suite === "rustpython")) {
    const candidate = inventory.cases.find((candidate) => candidate.id === entry.id);
    assert.equal(candidate.upstreamPath, entry.upstreamPath);
    assert.equal(candidate.sourceSha256, entry.sourceSha256);
    assert.equal(candidate.review.level, "manifest-reviewed");
    assert.equal(candidate.review.disposition, "adopted-required");
  }
});

test("missing, duplicate, reordered, or rehashed candidate sources cannot silently change the pin", () => {
  for (const mutate of [
    (data) => data.cases.pop(),
    (data) => { data.cases[1] = structuredClone(data.cases[0]); },
    (data) => data.cases.reverse(),
    (data) => { data.cases[0].sourceSha256 = "0".repeat(64); },
    (data) => { data.cases[0].bytes += 1; },
    (data) => { data.cases[0].upstreamPath = "../not-a-snippet.py"; },
  ]) {
    const data = read();
    mutate(data);
    assert.throws(() => validateSourceInventory(data));
  }
});

test("helper and xfail roles do not inflate functional adoption or final review coverage", () => {
  const inventory = read();
  const selected = (predicate) => inventory.cases.filter(predicate);
  assert.deepEqual(selected((c) => c.role === "support-fixture").map((c) => c.id),
    helpers.map((name) => `rustpython/${name}`));
  const excluded = selected((c) => c.role === "upstream-excluded-negative-example");
  assert.deepEqual(excluded.map((c) => c.id), ["rustpython/xfail_assert"]);
  assert.equal(inventory.source.discovery.upstreamExcludesPrefix, "xfail_");
  assert.equal(selected((c) => !c.id.split("/")[1].startsWith("xfail_")).length, 220);
  assert.equal(selected((c) => c.role === "candidate-program").length, 213);
  assert.equal(selected((c) => c.review.level === "static-triage").length, 0);
  assert.equal(selected((c) => c.review.disposition !== null).length, 32);
  assert.equal(inventory.counts.finalDispositionReviews, 32);
  assert.equal(inventory.counts.candidateFinalDispositionReviews, 24);
  assert.equal(inventory.counts.reviewedBacklog, 179);
  assert.equal(inventory.counts.sourceOnlyWholeReviews, 191);
  assert.equal(inventory.counts.wholeSourceReviewedNotAdopted, 201);
  assert.equal(inventory.counts.oracleReviewedNotAdopted, 10);
  assert.equal(inventory.counts.staticTriageOnly, 0);
  assert.equal(inventory.reviewPolicy.allCandidatesHaveFinalReviewedDisposition, false);
  assert.equal(inventory.reviewPolicy.phase2Acceptance, "not-complete");
  assert.deepEqual(inventory.reviewPolicy.intentionalDifferencesApproved, []);
  for (const entry of selected((c) => c.review.level === "source-role-reviewed")) {
    assert.ok(["support-fixture", "upstream-excluded-negative-example"].includes(entry.role));
    assert.equal(entry.review.disposition, entry.role);
  }
  for (const entry of selected((c) => c.review.level === "static-triage")) {
    assert.equal(entry.review.disposition, null);
  }
  assert.equal(inventory.reviewPolicy.backlogIsNotFinalDisposition, true);
  assert.equal(inventory.reviewPolicy.sourceReviewIsNotExecution, true);
  assert.equal(inventory.reviewPolicy.scopedDecisionsDoNotWaivePublicModules, true);
  assert.deepEqual(Object.keys(inventory.reviewPolicy.finalDispositions).sort(), [...finalDispositions].sort());
  assert.deepEqual(Object.keys(inventory.reviewPolicy.backlogDispositions).sort(), [...backlogDispositions].sort());
  for (const [field, values] of [["disposition", inventory.counts.finalDispositions], ["backlogDisposition", inventory.counts.backlogDispositions]]) {
    const actual = {};
    for (const entry of inventory.cases) if (entry.review[field]) {
      actual[entry.review[field]] = (actual[entry.review[field]] || 0) + 1;
    }
    assert.deepEqual(values, actual);
  }
});

test("whole-source and oracle reviews do not adopt cases or claim subject qualification", () => {
  const inventory = read();
  const loaded = loadManifest(join(root, "manifest.json"));
  const expected = reviewedCandidates.map((name) => `rustpython/${name}`);
  assert.equal(sha256(canonical(inventory.oracleEvidence)), "7b66d7438ce5dae09b958d8bbd2940bbd07f9674c3137b5181fc656921c074f0",
    "static review merge must preserve the original ten historical oracle records");
  assert.deepEqual(inventory.cases.filter((c) => c.review.level === "whole-source-reviewed" && !c.wholeSourceReview).map((c) => c.id), expected);
  assert.deepEqual(inventory.oracleEvidence.results.map((r) => r.id).sort(), expected);
  assert.equal(inventory.oracleEvidence.reference.implementation, "CPython");
  assert.equal(inventory.oracleEvidence.reference.version, "3.14.4");
  assert.match(inventory.oracleEvidence.reference.executableSha256, /^[a-f0-9]{64}$/);
  for (const result of inventory.oracleEvidence.results) {
    const candidate = inventory.cases.find((c) => c.id === result.id);
    assert.equal(loaded.cases.some((entry) => entry.id === result.id), false);
    assert.equal(candidate.review.disposition, null);
    assert.equal(result.sourceSha256, candidate.sourceSha256);
    assert.equal(result.sourceUnchanged, true);
    assert.equal(result.subject, null);
    assert.equal(result.execution.status, 0);
    assert.equal(result.execution.signal, null);
    assert.equal(result.execution.error, null);
    assert.equal(result.execution.timedOut, false);
    assert.equal(result.execution.outputLimited, false);
    for (const stream of ["stdout", "stderr", "output"]) {
      assert.equal(Buffer.from(result.execution.raw[stream], "base64").length, 0);
      assert.equal(executionBytes(result.execution, stream).length, 0);
    }
    assert.deepEqual(result.evidence, caseEvidence(candidate.sourceSha256, result.execution, null));
    for (const fixture of result.fixtures) {
      const helper = inventory.cases.find((c) => c.upstreamPath === fixture.upstreamPath);
      assert.equal(fixture.sha256, helper.sourceSha256);
      assert.equal(fixture.bytes, helper.bytes);
    }
  }
});

test("ten disjoint static review batches preserve hashes, records, and unadopted status", () => {
  const inventory = read();
  validateSourceReviews(inventory);
  const adopted = new Set(loadManifest(join(root, "manifest.json")).cases.map((c) => c.id));
  const oracleIds = new Set(inventory.oracleEvidence.results.map((r) => r.id));
  for (const c of inventory.cases.filter((c) => c.wholeSourceReview)) {
    assert.equal(adopted.has(c.id), false);
    assert.equal(oracleIds.has(c.id), false);
  }
});

test("review drift, duplicate promotion, false evidence and backlog-as-final decisions fail closed", () => {
  for (const mutate of [
    (data) => { data.cases.find((c) => c.wholeSourceReview).wholeSourceReview.source.sourceSha256 = "0".repeat(64); },
    (data) => { data.cases.find((c) => c.wholeSourceReview).wholeSourceReview.execution.qualified = true; },
    (data) => { data.cases.find((c) => c.wholeSourceReview).wholeSourceReview.adoption.required = true; },
    (data) => { data.cases.find((c) => c.wholeSourceReview).wholeSourceReview.review.rationale = "unreviewed replacement"; },
    (data) => { data.cases.find((c) => c.review.backlogDisposition).review.disposition = "adopted-required"; },
    (data) => { data.cases.find((c) => c.review.backlogDisposition).review.backlogDisposition = "unknown"; },
    (data) => { data.sourceReviews.inputs[1].reviewedIds[0] = data.sourceReviews.inputs[0].reviewedIds[0]; },
    (data) => { data.sourceReviews.inputs[0].entriesSha256 = "0".repeat(64); },
    (data) => { data.cases.find((c) => c.review.disposition === "unsupported-capability").wholeSourceReview.review.capabilities.unsupportedScope.hosts = []; },
  ]) {
    const inventory = read();
    mutate(inventory);
    assert.throws(() => validateSourceReviews(inventory));
  }
});

test("static resource and capability candidates remain explicit review work", () => {
  const inventory = read();
  const knownPaths = new Set([...inventory.cases, ...inventory.resources].map((entry) => entry.upstreamPath));
  for (const entry of inventory.cases) {
    for (const fixture of entry.fixtureCandidates ?? []) assert.ok(knownPaths.has(fixture), fixture);
    assert.ok(entry.valueTags.length > 0);
    assert.ok(entry.dependencyCandidates.every((name) => typeof name === "string"));
    assert.ok(entry.capabilityCandidates.every((name) => typeof name === "string"));
  }
  const slices = inventory.cases.find((entry) => entry.id === "rustpython/builtin_slice");
  assert.equal(slices.generatedFixtureCandidates[0].state, "not-generated");
  assert.equal(inventory.cases.find((entry) => entry.id === "rustpython/stdlib_weakref").review.disposition, null);
  assert.equal(inventory.analysis.kind, "AST-only baseline");
  assert.equal(inventory.analysis.parseAccepted, 221);
});
