#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const samples = Number(process.env.CLASSICAL_OBJECT_SAMPLES || 3);
const sage =
  process.env.SAGE_PYTHON ||
  (existsSync("/opt/cocalc-webdev-python/bin/python")
    ? "/opt/cocalc-webdev-python/bin/python"
    : "sage");
const magma = process.env.MAGMA || "/home/user/magma-2.18/bin/magma";
const cases = [
  { level: 37, weight: 2, index: 2 },
  { level: 101, weight: 2, index: 2 },
  { level: 100, weight: 4, index: 3 },
];

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

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${result.status}:\n${result.stdout}\n${result.stderr}`,
    );
  }
  return parseRecord(result.stdout);
}

function collect(specification) {
  const records = { "Sage.js": [], SageMath: [], Magma: [] };
  const args = [
    String(specification.level),
    String(specification.weight),
    String(specification.index),
  ];
  for (let sample = 0; sample < samples; sample += 1) {
    records["Sage.js"].push(
      run(process.execPath, [path.join(__dirname, "sagejs.cjs"), ...args]),
    );
    records.SageMath.push(
      run(sage, [path.join(__dirname, "sage.py"), ...args]),
    );
    records.Magma.push(
      run(magma, ["-b", path.join(__dirname, "magma.m")], {
        CLASSICAL_OBJECT_LEVEL: args[0],
        CLASSICAL_OBJECT_WEIGHT: args[1],
        CLASSICAL_OBJECT_INDEX: args[2],
      }),
    );
  }
  const expected = records["Sage.js"][0];
  for (const systemRecords of Object.values(records)) {
    for (const record of systemRecords) {
      if (
        record.dimension !== expected.dimension ||
        record.trace !== expected.trace
      ) {
        throw new Error(`exact invariant mismatch: ${JSON.stringify(records)}`);
      }
    }
  }
  const sagejsMilliseconds = median(
    records["Sage.js"].map((record) => record.milliseconds),
  );
  const sageMilliseconds = median(
    records.SageMath.map((record) => record.milliseconds),
  );
  const magmaMilliseconds = median(
    records.Magma.map((record) => record.milliseconds),
  );
  return {
    ...specification,
    dimension: expected.dimension,
    trace: expected.trace,
    sagejs_milliseconds: sagejsMilliseconds,
    sagemath_milliseconds: sageMilliseconds,
    magma_milliseconds: magmaMilliseconds,
    sagejs_over_sagemath: sagejsMilliseconds / sageMilliseconds,
    sagejs_over_magma: sagejsMilliseconds / magmaMilliseconds,
  };
}

const receipt = {
  schema: "sagejs.classical-object-first-hecke-benchmark/v1",
  contract:
    "fresh cusp-form parent and first exact Hecke matrix; language startup excluded",
  samples,
  rows: cases.map(collect),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(receipt, null, 2));
} else {
  console.table(receipt.rows);
}
