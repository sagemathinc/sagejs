#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const samples = Number(process.env.HIGHER_CHARACTER_QEXP_SAMPLES || 1);
const sage =
  process.env.SAGE_PYTHON ||
  (existsSync("/home/user/sagelite/sage")
    ? "/home/user/sagelite/sage"
    : "sage");
const cases = ["level_101", "level_157", "level_241"];
if (process.argv.includes("--large")) cases.push("level_401");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function parseRecord(text) {
  const line = text
    .trim()
    .split(/\r?\n/)
    .findLast((item) => item.startsWith("{"));
  if (line === undefined) throw new Error(`missing JSON record:\n${text}`);
  return JSON.parse(line);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${result.status}:\n${result.stdout}\n${result.stderr}`,
    );
  }
  return parseRecord(result.stdout);
}

function collect(id) {
  const records = { "Sage.js": [], SageMath: [] };
  for (let sample = 0; sample < samples; sample += 1) {
    records["Sage.js"].push(
      run(process.execPath, [path.join(__dirname, "sagejs.cjs"), id]),
    );
    records.SageMath.push(
      run(sage, [path.join(__dirname, "sage.py"), id]),
    );
  }
  const expected = records["Sage.js"][0];
  for (const values of Object.values(records)) {
    for (const record of values) {
      for (const key of [
        "dimension",
        "order",
        "field_degree",
        "fingerprint",
        "fingerprint_degree",
      ]) {
        if (record[key] !== expected[key]) {
          throw new Error(
            `exact invariant mismatch for ${id}: ${JSON.stringify(records)}`,
          );
        }
      }
    }
  }
  const milliseconds = Object.fromEntries(
    Object.entries(records).map(([system, values]) => [
      system,
      median(values.map((record) => record.milliseconds)),
    ]),
  );
  return {
    id,
    dimension: expected.dimension,
    order: expected.order,
    field_degree: expected.field_degree,
    fingerprint: expected.fingerprint,
    fingerprint_degree: expected.fingerprint_degree,
    milliseconds,
    sagejs_over_sagemath: milliseconds["Sage.js"] / milliseconds.SageMath,
  };
}

const receipt = {
  schema: "sagejs.higher-character-qexp-benchmark/v1",
  contract:
    "fresh CuspForms parent and canonical exact q-expansion basis through dimension + 2; language startup and character enumeration excluded",
  samples,
  rows: cases.map(collect),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(receipt, null, 2));
} else {
  console.table(receipt.rows);
}
