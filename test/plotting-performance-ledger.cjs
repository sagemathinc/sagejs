#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const generator = require("../scripts/plotting/generate-performance.cjs");
const path = join(
  root,
  "docs",
  "sage-compatibility",
  "plotting",
  "performance.json",
);

test("plotting performance ledger is generated and evidence-backed", () => {
  generator.main(["--check"]);
  const document = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(document.schema_version, 1);
  assert.equal(document.workloads.length, 9);
  assert.equal(
    new Set(document.workloads.map(({ id }) => id)).size,
    document.workloads.length,
  );
  for (const workload of document.workloads) {
    assert.match(workload.id, /^[a-z0-9-]+$/);
    assert.ok(Object.keys(workload.scale).length > 0);
    assert.ok(Object.keys(workload.budgets).length > 0);
    assert.ok(workload.command.length > 0);
    assert.ok(workload.platforms.length > 0);
    for (const evidence of workload.evidence) {
      assert.equal(existsSync(join(root, evidence)), true, evidence);
    }
  }
});
