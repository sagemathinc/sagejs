#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

const root = join(__dirname, "..", "..");
const corpusPath = join(root, "test", "fixtures", "number-field-foundations", "corpus.json");
const workloadPath = join(__dirname, "workloads.json");
const update = process.argv.includes("--update");
const json = process.argv.includes("--json");

const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const workloads = JSON.parse(readFileSync(workloadPath, "utf8"));
const byId = new Map(corpus.fields.map((field) => [field.id, field]));

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256")
    .update("sagejs-number-field-foundations-workload-v1\n")
    .update(canonicalJson(value), "ascii")
    .digest("hex");
}

function selectData(phase, field) {
  const selected = { id: field.id };
  for (const key of phase.data) {
    if (key === "residueAtOne") {
      selected.residueAtOne = field.analytic.map(({ bits, residueAtOne }) => ({ bits, residueAtOne }));
    } else if (key === "primeDecompositions") {
      selected.primeDecompositions = field.primeDecompositions.filter(
        (row) => !phase.primes || phase.primes.includes(Number(row.p)),
      );
    } else {
      selected[key] = field[key];
    }
  }
  return selected;
}

const report = [];
for (const phase of workloads.phases) {
  const start = performance.now();
  const selection = phase.fields.map((identifier) => {
    const field = byId.get(identifier);
    assert.ok(field, `${phase.id}: unknown field ${identifier}`);
    return selectData(phase, field);
  });
  const actual = digest(selection);
  if (update) phase.expectedResultSha256 = actual;
  else assert.equal(actual, phase.expectedResultSha256, `${phase.id}: stale or corrupt oracle workload`);
  report.push({
    id: phase.id,
    fields: selection.length,
    expectedResultSha256: actual,
    harnessMilliseconds: performance.now() - start,
  });
}

if (update) {
  workloads.corpusSha256 = corpus.contentSha256;
  writeFileSync(workloadPath, `${JSON.stringify(workloads, null, 2)}\n`);
} else {
  assert.equal(workloads.corpusSha256, corpus.contentSha256, "benchmark manifest names the exact corpus");
}

if (json) console.log(JSON.stringify({ corpusSha256: corpus.contentSha256, phases: report }, null, 2));
else {
  for (const row of report) {
    console.log(`${row.id.padEnd(38)} ${row.fields} fields ${row.expectedResultSha256}`);
  }
}
