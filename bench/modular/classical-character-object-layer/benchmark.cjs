#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const samples = Number(process.env.CLASSICAL_CHARACTER_OBJECT_SAMPLES || 1);
const sage =
  process.env.SAGE_PYTHON ||
  (existsSync("/home/user/bin/sage") ? "/home/user/bin/sage" : "sage");
const magma = process.env.MAGMA || "/home/user/bin/magma";
const cases = [
  { id: "quadratic_bad_12", systems: ["Sage.js", "SageMath", "Magma"] },
  { id: "quadratic_new_20", systems: ["Sage.js", "SageMath", "Magma"] },
  { id: "cyclotomic_13", systems: ["Sage.js", "SageMath"] },
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

function commandFor(system, id) {
  if (system === "Sage.js") {
    return [process.execPath, [path.join(__dirname, "sagejs.cjs"), id], {}];
  }
  if (system === "SageMath") {
    return [sage, [path.join(__dirname, "sage.py"), id], {}];
  }
  return [magma, ["-b", path.join(__dirname, "magma.m")], {
    CLASSICAL_CHARACTER_OBJECT_CASE: id,
  }];
}

function collect(specification) {
  const records = {};
  for (const system of specification.systems) {
    const command = commandFor(system, specification.id);
    records[system] = [];
    for (let sample = 0; sample < samples; sample += 1) {
      records[system].push(run(...command));
    }
  }
  const expected = records["Sage.js"][0];
  for (const systemRecords of Object.values(records)) {
    for (const record of systemRecords) {
      for (const key of ["dimension", "fingerprint", "degree"]) {
        if (record[key] !== expected[key]) {
          throw new Error(
            `exact invariant mismatch for ${specification.id}: ${JSON.stringify(records)}`,
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
    ...specification,
    dimension: expected.dimension,
    fingerprint: expected.fingerprint,
    degree: expected.degree,
    milliseconds,
    sagejs_over_sagemath: milliseconds["Sage.js"] / milliseconds.SageMath,
    sagejs_over_magma:
      milliseconds.Magma === undefined
        ? null
        : milliseconds["Sage.js"] / milliseconds.Magma,
  };
}

const receipt = {
  schema: "sagejs.classical-character-object-layer-benchmark/v1",
  contract:
    "fresh parent/subspace and first exact Hecke matrix; language startup excluded",
  samples,
  rows: cases.map(collect),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(receipt, null, 2));
} else {
  console.table(receipt.rows);
}
