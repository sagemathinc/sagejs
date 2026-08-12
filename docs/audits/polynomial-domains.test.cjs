"use strict";

const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..", "..");
const auditPath = resolve(__dirname, "polynomial-domains.json");
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const polynomialSource = readFileSync(
  resolve(root, "src", "baselib", "polynomial.py"),
  "utf8",
);

function assertReferenceList(values, available, context) {
  assert.ok(Array.isArray(values), `${context} must be an array`);
  for (const value of values) {
    assert.equal(typeof value, "string", `${context} contains a non-string`);
    assert.ok(available.has(value), `${context} references unknown ${value}`);
  }
}

test("polynomial domain audit is a complete public-workflow matrix", () => {
  assert.equal(audit.schema, "sagejs.audit/polynomial-domains-v1");
  assert.match(audit.audited_commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(audit.workflow_order, [
    "construction",
    "mutation",
    "arithmetic",
    "divrem",
    "gcd",
    "xgcd",
    "factor",
    "roots",
    "evaluate",
    "format",
    "serialize",
  ]);

  const expectedDomains = [
    "zz",
    "qq",
    "gf-prime-packed",
    "gf-prime-large",
    "gf-extension",
    "cyclotomic-field",
  ];
  assert.deepEqual(audit.domains.map(({ id }) => id), expectedDomains);

  const statuses = new Set(Object.keys(audit.status_vocabulary));
  const coverage = new Set(audit.coverage_vocabulary);
  const boundaries = new Set(Object.keys(audit.boundaries));
  const evidence = new Set(Object.keys(audit.evidence));
  const findings = new Set(audit.findings.map(({ id }) => id));
  const implementations = new Set(audit.implementation_types);

  for (const [boundaryId, boundary] of Object.entries(audit.boundaries)) {
    assertReferenceList(
      boundary.types,
      implementations,
      `boundary ${boundaryId} implementation types`,
    );
    assert.ok(boundary.anchors.length > 0, `boundary ${boundaryId} has no anchors`);
    for (const anchor of boundary.anchors) {
      const path = resolve(root, anchor.path);
      assert.ok(statSync(path).isFile(), `boundary ${boundaryId} path is not a file`);
      assert.ok(
        readFileSync(path, "utf8").includes(anchor.contains),
        `boundary ${boundaryId} lost anchor ${anchor.contains}`,
      );
    }
  }

  for (const [evidenceId, record] of Object.entries(audit.evidence)) {
    assert.ok(record.paths.length > 0, `evidence ${evidenceId} has no paths`);
    assert.ok(record.oracles.length > 0, `evidence ${evidenceId} has no oracle`);
    for (const path of record.paths) {
      assert.ok(
        statSync(resolve(root, path)).isFile(),
        `evidence ${evidenceId} path is not a file: ${path}`,
      );
    }
  }

  for (const domain of audit.domains) {
    assert.deepEqual(
      Object.keys(domain.workflows),
      audit.workflow_order,
      `${domain.id} workflow order drifted`,
    );
    for (const workflow of audit.workflow_order) {
      const cell = domain.workflows[workflow];
      const context = `${domain.id}.${workflow}`;
      assert.ok(statuses.has(cell.status), `${context} has invalid status`);
      assertReferenceList(cell.boundaries, boundaries, `${context} boundaries`);
      assert.ok(cell.boundaries.length > 0, `${context} has no boundary`);
      assertReferenceList(cell.evidence, evidence, `${context} evidence`);
      assert.ok(
        coverage.has(cell.coverage.correctness),
        `${context} has invalid correctness coverage`,
      );
      assert.ok(
        coverage.has(cell.coverage.performance),
        `${context} has invalid performance coverage`,
      );
      if (cell.status !== "complete" || cell.coverage.correctness === "none") {
        assert.ok(cell.finding, `${context} must identify its audit finding`);
      }
      if (cell.finding !== undefined) {
        assert.ok(findings.has(cell.finding), `${context} finding is unknown`);
      }
    }
  }

  for (const workflow of audit.special_workflows) {
    assert.ok(statuses.has(workflow.status));
    assertReferenceList(workflow.boundaries, boundaries, `${workflow.id} boundaries`);
    assertReferenceList(workflow.evidence, evidence, `${workflow.id} evidence`);
  }
});

test("audit findings map to reproducible Sage oracles and bounded lanes", () => {
  const oracleIds = new Set(audit.sage_oracle_samples.cases.map(({ id }) => id));
  const lanes = new Map(audit.contribution_lanes.map((lane) => [lane.id, lane]));
  assert.equal(oracleIds.size, audit.sage_oracle_samples.cases.length);
  assert.equal(lanes.size, audit.contribution_lanes.length);

  for (const finding of audit.findings) {
    assert.ok(oracleIds.has(finding.sage_oracle), `${finding.id} has no Sage oracle`);
    assert.ok(lanes.has(finding.lane), `${finding.id} has no contribution lane`);
    assert.ok(
      Number(lanes.get(finding.lane).priority.slice(1)) <=
        Number(finding.priority.slice(1)),
      `${finding.id} maps to a lower-priority lane ${finding.lane}`,
    );
  }

  const domainIds = new Set(audit.domains.map(({ id }) => id));
  const workflows = new Set(audit.workflow_order);
  const exclusiveClaims = new Map();
  const forbiddenSharedClaims = new Set([
    "package.json",
    "pnpm-lock.yaml",
    "test/node-test-manifest.cjs",
    "architecture/native-boundaries.json",
    "architecture/package-graph.json",
  ]);

  for (const lane of audit.contribution_lanes) {
    assert.match(lane.priority, /^P[1-9]$/);
    assert.ok(lane.acceptance.length >= 3, `${lane.id} lacks acceptance criteria`);
    assertReferenceList(lane.domains, domainIds, `${lane.id} domains`);
    assertReferenceList(lane.workflows, workflows, `${lane.id} workflows`);
    for (const claim of lane.exclusive_claims) {
      assert.ok(!forbiddenSharedClaims.has(claim), `${lane.id} claims shared ${claim}`);
      assert.ok(
        !exclusiveClaims.has(claim),
        `${lane.id} overlaps ${exclusiveClaims.get(claim)} at ${claim}`,
      );
      exclusiveClaims.set(claim, lane.id);
      assert.ok(
        !lane.integration_touchpoints.includes(claim),
        `${lane.id} treats ${claim} as both exclusive and shared`,
      );
    }
  }

  const p1Lanes = audit.contribution_lanes
    .filter(({ priority }) => priority === "P1")
    .map(({ id }) => id);
  assert.deepEqual(p1Lanes, [
    "large-prime-polynomial-correctness",
    "extension-polynomial-euclidean",
    "cyclotomic-polynomial-core",
  ]);
});

test("P1 source findings cannot silently go stale", () => {
  const exactStart = polynomialSource.indexOf("class PolynomialElement(sage.Element):");
  const exactStop = polynomialSource.indexOf("class PolynomialRingParent(sage.Parent):");
  const genericStart = polynomialSource.indexOf(
    "class ApproximatePolynomialElement(sage.Element):",
  );
  const genericStop = polynomialSource.indexOf(
    "class ApproximatePolynomialRingParent(sage.Parent):",
  );
  const genericParentStop = polynomialSource.indexOf("class PolynomialSequence:");
  for (const position of [exactStart, exactStop, genericStart, genericStop, genericParentStop]) {
    assert.ok(position >= 0, "polynomial class boundary disappeared");
  }

  const exactElement = polynomialSource.slice(exactStart, exactStop);
  const genericElement = polynomialSource.slice(genericStart, genericStop);
  const genericParent = polynomialSource.slice(genericStop, genericParentStop);

  assert.match(
    exactElement,
    /quotient and remainder are implemented for ZZ, QQ, and GF\(p\)/,
  );
  assert.match(
    exactElement,
    /polynomial xgcd is implemented over ZZ and QQ/,
  );
  assert.match(
    exactElement,
    /if base\._kind == "GF":[\s\S]*?flint_packed_prime_field_polynomial_factor\(/,
    "large-prime factor still routes into the packed-only wrapper",
  );
  assert.match(
    exactElement,
    /flint_packed_prime_field_polynomial_roots\([\s\S]*?self\._storage/,
    "large-prime roots still route into the packed-only wrapper",
  );

  for (const missing of [
    "__getitem__",
    "__setitem__",
    "derivative",
    "quo_rem",
    "gcd",
    "xgcd",
    "roots",
  ]) {
    assert.doesNotMatch(
      genericElement,
      new RegExp(`^    def ${missing}\\(`, "m"),
      `generic exact polynomial unexpectedly gained ${missing}`,
    );
  }
  assert.doesNotMatch(
    genericParent,
    /isinstance\(value, \(list, tuple\)\)/,
    "cyclotomic dense construction is now implemented; refresh the audit",
  );
});
