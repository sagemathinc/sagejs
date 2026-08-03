#!/usr/bin/env node
"use strict";

const { existsSync, rmSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const defaultSage = existsSync("/home/user/bin/sagelite")
  ? "/home/user/bin/sagelite"
  : "/opt/cocalc-webdev-python/bin/sage";
const sage = process.env.SAGELITE_SAGE || defaultSage;
const prefix = `/tmp/sagejs-serialization-benchmark-${process.pid}`;
const samples = Number(process.env.SAGEJS_SERIALIZATION_SAMPLES || 5);
const cases = [
  ["ZZ-100", "random_matrix(ZZ, 100)"],
  ["QQ-1000", "random_matrix(QQ, 1000)"],
  ["GF7-1000", "random_matrix(GF(7), 1000)"],
];

function program(runtime) {
  const lines = ["from time import time"];
  if (runtime === "sagejs") lines.push("from sagejs_serialization import dump, load");
  for (const [name, expression] of cases) {
    const filename = `${prefix}-${runtime}-${name}`;
    lines.push(`A = ${expression}`);
    lines.push(`for sample in range(${samples}):`);
    lines.push("    t = time()");
    if (runtime === "sagejs") {
      lines.push(`    with open('${filename}', 'wb') as output:`);
      lines.push("        dump(A, output)");
    } else {
      lines.push(`    save(A, '${filename}')`);
    }
    lines.push(`    print('RESULT ${name} save', time() - t)`);
    lines.push("    t = time()");
    if (runtime === "sagejs") {
      lines.push(`    with open('${filename}', 'rb') as input_file:`);
      lines.push("        B = load(input_file)");
    } else {
      lines.push(`    B = load('${filename}.sobj')`);
    }
    lines.push(`    print('RESULT ${name} load', time() - t)`);
    lines.push("    assert B == A");
  }
  return `${lines.join("\n")}\n`;
}

function execute(label, command, source) {
  const programFile = `${prefix}-${label.replaceAll(/[^A-Za-z]/g, "").toLowerCase()}.sage`;
  writeFileSync(programFile, source);
  const result = spawnSync(command, [programFile], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  rmSync(programFile, { force: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${label} exited with status ${result.status}`);
  }
  const values = new Map();
  for (const match of result.stdout.matchAll(/RESULT\s+(\S+)\s+(save|load)\s+([0-9.eE+-]+)/g)) {
    const key = `${match[1]} ${match[2]}`;
    if (!values.has(key)) values.set(key, []);
    values.get(key).push(Number(match[3]) * 1000);
  }
  if (values.size !== cases.length * 2) {
    throw new Error(
      `${label} produced only ${values.size} benchmark cases:\n${result.stdout}`,
    );
  }
  return values;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

try {
  const results = [
    ["Sage.js", execute("Sage.js", sagejs, program("sagejs"))],
    ["SageMath", execute("SageMath", sage, program("sage"))],
  ];
  console.log("case operation runtime".padEnd(34), "median", "vs SageMath");
  console.log("-".repeat(62));
  for (const [name] of cases) {
    for (const operation of ["save", "load"]) {
      const key = `${name} ${operation}`;
      const sageMedian = median(results[1][1].get(key));
      for (const [label, values] of results) {
        const milliseconds = median(values.get(key));
        console.log(
          `${name.padEnd(10)} ${operation.padEnd(5)} ${label.padEnd(9)}`.padEnd(34),
          `${milliseconds.toFixed(2)} ms`.padStart(10),
          `${(milliseconds / sageMedian).toFixed(2)}x`.padStart(12),
        );
      }
    }
  }
} finally {
  for (const [name] of cases) {
    for (const runtime of ["sagejs", "sage"]) {
      for (const suffix of ["", ".sobj"]) {
        const filename = `${prefix}-${runtime}-${name}${suffix}`;
        if (existsSync(filename)) rmSync(filename);
      }
    }
  }
}
