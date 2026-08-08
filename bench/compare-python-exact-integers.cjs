#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const program = join(root, "bench", "python-exact-integer-dispatch.py");
const samples = Number(process.env.SAGEJS_INTEGER_SAMPLES || 5);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${command} exited with status ${result.status}`);
  }
  const rows = new Map();
  for (const line of result.stdout.trim().split("\n")) {
    const [name, answer, seconds] = line.split(" ");
    if (!name || answer === undefined || !seconds) {
      throw new Error(`unexpected benchmark output: ${line}`);
    }
    rows.set(name, { answer, seconds: Number(seconds) });
  }
  return rows;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

const implementations = [
  {
    name: "CPython",
    command: process.env.PYTHON || "python3",
    args: [program],
  },
  {
    name: "Sage.js",
    command: process.execPath,
    args: [join(root, "bin", "sagejs-source.cjs"), "--python", program],
  },
];

for (const implementation of implementations) {
  const timings = new Map();
  for (let sample = 0; sample < samples; sample += 1) {
    const rows = run(implementation.command, implementation.args);
    for (const [name, row] of rows) {
      const existing = timings.get(name) || { answer: row.answer, values: [] };
      if (existing.answer !== row.answer) {
        throw new Error(`${implementation.name} changed ${name}'s answer`);
      }
      existing.values.push(row.seconds);
      timings.set(name, existing);
    }
  }
  implementation.rows = new Map(
    [...timings].map(([name, row]) => [
      name,
      { answer: row.answer, seconds: median(row.values) },
    ]),
  );
}

const names = [...implementations[0].rows.keys()];
console.log(
  "integer shape".padEnd(20),
  "CPython".padStart(11),
  "Sage.js".padStart(11),
  "ratio".padStart(9),
);
console.log("-".repeat(54));
for (const name of names) {
  const cpython = implementations[0].rows.get(name);
  const sagejs = implementations[1].rows.get(name);
  if (!sagejs || sagejs.answer !== cpython.answer) {
    throw new Error(`${name} produced different answers`);
  }
  console.log(
    name.padEnd(20),
    `${(cpython.seconds * 1000).toFixed(1)} ms`.padStart(11),
    `${(sagejs.seconds * 1000).toFixed(1)} ms`.padStart(11),
    `${(sagejs.seconds / cpython.seconds).toFixed(2)}x`.padStart(9),
  );
}
