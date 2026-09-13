#!/usr/bin/env node
"use strict";

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const sagelite = process.env.SAGELITE ||
  (existsSync("/home/user/bin/sage") ? "/home/user/bin/sage" : "sage");
const magma = process.env.MAGMA || "/home/user/bin/magma";
const cases = (process.env.GAMMA1_CASES || "37:2,53:2,73:2,101:2")
  .split(",")
  .map((item) => {
    const [level, weight] = item.split(":").map(Number);
    return { level, weight };
  });

function parseRecord(output) {
  const line = output.trim().split(/\r?\n/).findLast((entry) => entry.startsWith("{"));
  if (line === undefined) throw new Error(`missing JSON record:\n${output}`);
  return JSON.parse(line);
}

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    timeout: Number(process.env.GAMMA1_TIMEOUT_MS || 1800000),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return parseRecord(result.stdout);
}

const rows = [];
for (const specification of cases) {
  const { level, weight } = specification;
  const records = [
    run(process.execPath, [path.join(__dirname, "sagejs.cjs"), level, weight]),
    run(sagelite, [path.join(__dirname, "sagelite.py"), level, weight]),
    run(magma, ["-b", path.join(__dirname, "magma.m")], {
      GAMMA1_LEVEL: String(level),
      GAMMA1_WEIGHT: String(weight),
    }),
  ];
  const expected = records[0];
  for (const record of records) {
    for (const key of ["dimension", "cusp_dimension", "hecke_trace"]) {
      if (record[key] !== expected[key]) {
        throw new Error(`invariant mismatch for level ${level}: ${JSON.stringify(records)}`);
      }
    }
  }
  rows.push(...records);
  console.error(`completed Gamma1(${level}) weight ${weight}: ${JSON.stringify(records)}`);
}

const receipt = {
  schema: "sagejs.gamma1-spaces-benchmark/v1",
  contract: "fresh full Gamma1 basis through the Sturm bound, then first cuspidal T_2 and diamond action; language startup excluded",
  cases,
  rows,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(receipt, null, 2));
} else {
  console.table(rows);
}
