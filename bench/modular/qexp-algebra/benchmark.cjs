#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const { createSage } = require("../../../dist/tools/kernel.js");

const root = path.resolve(__dirname, "../../..");
const precision = Number(process.env.QEXP_PRECISION || 256);
const repeats = Number(process.env.QEXP_REPEATS || 10);
const samples = Number(process.env.QEXP_SAMPLES || 5);
const sage =
  process.env.SAGE ||
  (existsSync("/opt/cocalc-webdev-python/bin/sage")
    ? "/opt/cocalc-webdev-python/bin/sage"
    : "sage");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function parseJsonLine(text) {
  const line = text
    .trim()
    .split(/\r?\n/)
    .findLast((item) => item.startsWith("{"));
  if (line === undefined) throw new Error(`missing JSON record:\n${text}`);
  return JSON.parse(line);
}

async function sagejsRecord() {
  const session = await createSage();
  try {
    const source = [
      "import json, time",
      `precision=${precision}`,
      `repeats=${repeats}`,
      `samples=${samples}`,
      "modulus=1000000007",
      "D=certified_modular_form(CuspForms(1,12).gen(),precision)",
      "E4=certified_modular_form(EisensteinForms(1,4).gen(),precision)",
      "psi=DirichletGroup(5).gen()^2",
      "def timed(operation):",
      "    timings=[]",
      "    checksums=[]",
      "    for sample in range(samples):",
      "        checksum=0",
      "        started=time.perf_counter()",
      "        for repeat in range(repeats):",
      "            if operation == 'product':",
      "                result=D*E4",
      "                factor=1",
      "            elif operation == 'V2':",
      "                result=D.V(2)",
      "                factor=2",
      "            elif operation == 'twist':",
      "                result=D.twist(psi)",
      "                factor=1",
      "            elif operation == 'eta':",
      "                result=eta_product(11,{1:2,11:2},prec=precision)",
      "                factor=1",
      "            for offset in range(1,9):",
      "                coefficient=result[factor*(precision-offset)]",
      "                checksum=(checksum+(offset+1)*ZZ(coefficient))%modulus",
      "        timings.append((time.perf_counter()-started)/repeats)",
      "        checksums.append(int(checksum))",
      "    return {'seconds':timings,'checksums':checksums}",
      "D*E4",
      "D.V(2)",
      "D.twist(psi)",
      "eta_product(11,{1:2,11:2},prec=16)",
      "json.dumps({'system':'Sage.js','precision':precision,",
      " 'repeats':repeats,'samples':samples,",
      " 'operations':{name:timed(name) for name in ['product','V2','twist','eta']}},",
      " sort_keys=True)",
    ].join("\n");
    const result = await session.evaluate(source);
    return JSON.parse(result.repr.slice(1, -1));
  } finally {
    await session.close();
  }
}

function sageRecord() {
  const script = path.join(__dirname, "sage.py");
  const result = spawnSync(
    sage,
    [script, String(precision), String(repeats), String(samples)],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`SageMath exited ${result.status}:\n${result.stderr}`);
  }
  return parseJsonLine(result.stdout);
}

async function main() {
  const sagejs = await sagejsRecord();
  const sagemath = sageRecord();
  const rows = [];
  for (const operation of ["product", "V2", "twist", "eta"]) {
    const left = sagejs.operations[operation];
    const right = sagemath.operations[operation];
    if (JSON.stringify(left.checksums) !== JSON.stringify(right.checksums)) {
      throw new Error(`${operation} checksum mismatch`);
    }
    const sagejsSeconds = median(left.seconds);
    const sageSeconds = median(right.seconds);
    rows.push({
      operation,
      sagejs_seconds: sagejsSeconds,
      sagemath_seconds: sageSeconds,
      sagejs_over_sagemath: sagejsSeconds / sageSeconds,
      checksum: left.checksums[0],
    });
  }
  const receipt = {
    schema: "sagejs.qexp-algebra-benchmark/v1",
    contract:
      "resident exact modular-form operation followed by an eight-coefficient tail checksum",
    precision,
    repeats,
    samples,
    systems: [sagejs.system, sagemath.system],
    rows,
  };
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  console.table(rows);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
