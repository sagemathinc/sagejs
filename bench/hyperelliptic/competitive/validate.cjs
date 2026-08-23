#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const directory = __dirname;
const corpus = JSON.parse(readFileSync(join(directory, "cases-v1.json"), "utf8"));
assert.equal(corpus.schema, "sagejs.hyperelliptic-competitive-cases.v1");
assert.ok(corpus.cases.length >= 25, "competitive corpus unexpectedly lost coverage");
const ids = corpus.cases.map((value) => value.id);
assert.equal(new Set(ids).size, ids.length, "case ids must be unique");
for (const caseData of corpus.cases) {
  assert.match(caseData.id, /^[a-z0-9][a-z0-9-]+$/);
  assert.ok(caseData.category && caseData.kind && caseData.contract);
  assert.ok(Object.hasOwn(caseData, "expected"), `${caseData.id} lacks an expected result`);
  assert.ok([2, 3].includes(caseData.model.genus));
  assert.ok(Array.isArray(caseData.model.f) && Array.isArray(caseData.model.h));
  if (caseData.kind === "jacobian_scalar") {
    assert.equal(caseData.timing?.batch_size, 1, `${caseData.id} must use bounded scalar timing`);
  }
}
for (const required of [
  "g2-p13-general-h-shared-factor", "g2-p13-conjugate-cancellation",
  "g2-p2147482661-double", "g3-p4503599627360549-double",
  "g3-p5-scalar-64-native", "g3-p5-scalar-64-reference",
  "g2-p5-generalized-group-rank3", "g3-p7-group-rank3", "g2-p5-even-local-factor", "g3-p5-even-local-factor",
  "g2-qq-general-h-shared-factor", "g2-qq-general-h-double-growth", "g2-qq-general-h-scalar3-growth",
  "g2-real-period-64", "g3-real-period-64",
  "g2-central-value-32", "g2-lfunction-init-32-order4", "g3-central-value-16", "unsupported-even-degree-jacobian",
]) assert.ok(ids.includes(required), `missing required coverage case ${required}`);
const source = ["sagejs-resident.cjs", "magma-resident.cjs", "pari-resident.cjs", "sagemath-resident.py", "run.cjs", "render-report.cjs", "local-streams.cjs"];
for (const name of source) assert.ok(readFileSync(join(directory, name)).length > 200, `${name} is unexpectedly empty`);
const pariSource = readFileSync(join(directory, "pari-resident.cjs"), "utf8");
assert.match(pariSource, /default\(realbitprecision,/);
assert.doesNotMatch(pariSource, /default\(realprecision,/);
process.stdout.write(`validated ${corpus.cases.length} competitive hyperelliptic cases\n`);
