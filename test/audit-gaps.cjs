"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts/list-audit-gaps.cjs");
const audit = require("../website/competitive-audit.json");
const benchmarks = require("../website/benchmarks.json");

function gaps(...args) {
  return JSON.parse(execFileSync(process.execPath, [script, "--json", ...args], { cwd: root, encoding: "utf8" }));
}

test("audit gap queue exposes every stable capability lane", () => {
  const rows = gaps();
  assert.equal(
    rows.length,
    audit.capabilities.length +
      benchmarks.suites.filter((suite) => suite.status === "planned").length,
  );
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.ok(rows.every((row) => row.benchmarkSuites.length > 0));
});

test("audit gap queue supports priority, dimension, area, and text filters", () => {
  assert.ok(gaps("--priority=P0").every((row) => row.priority === "P0"));
  assert.ok(gaps("--dimension=performance").every((row) => row.dimension === "performance"));
  assert.ok(gaps("--dimension=performance").length >= 19);
  assert.ok(gaps("--area=elliptic").every((row) => row.area === "Elliptic curves"));
  assert.deepEqual(gaps("--query=44 importable").map((row) => row.capability), ["stdlib"]);
});
