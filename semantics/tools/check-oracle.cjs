#!/usr/bin/env node
"use strict";

// Run the cases the Lean model chose through a real Sage.js and compare.
//
// The model says, for each pair of operands, whether the sum is an integer and
// which one.  The runtime is asked the same question in Python.  A
// disagreement is either a bug in the runtime or a place where the model has
// drifted from it -- both worth knowing, and neither visible from a proof
// alone.
//
//   node tools/check-oracle.cjs                      # the tree's own build
//   node tools/check-oracle.cjs --runtime "npx -y @sagemath/sagejs@0.3.0"

const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const repository = resolve(root, "..");

function runtimeCommand() {
  const flag = process.argv.indexOf("--runtime");
  if (flag >= 0 && process.argv[flag + 1]) return process.argv[flag + 1].split(" ");
  return ["node", join(repository, "bin", "sagejs")];
}

function oracleCases() {
  const output = execFileSync(join(root, ".lake", "build", "bin", "oracle"), {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [left, right, kind, value] = line.split("\t");
      return { left, right, kind, value };
    });
}

function askRuntime(cases) {
  const program = cases
    .map(({ left, right }) =>
      [
        `v = ${left} + ${right}`,
        `print('int' if type(v) is int else 'float', repr(v) if type(v) is int else '-')`,
      ].join("\n"),
    )
    .join("\n");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-oracle-"));
  const file = join(directory, "cases.py");
  writeFileSync(file, program + "\n");
  const [command, ...args] = runtimeCommand();
  const result = spawnSync(command, [...args, "--python", file], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "runtime failed\n");
    process.exit(1);
  }
  return result.stdout.split("\n").filter(Boolean);
}

function main() {
  const cases = oracleCases();
  const answers = askRuntime(cases);
  let disagreements = 0;
  cases.forEach((expected, index) => {
    const [kind, value] = (answers[index] || "").split(" ");
    const agrees =
      kind === expected.kind && (kind !== "int" || value === expected.value);
    if (!agrees) {
      disagreements += 1;
      if (disagreements <= 10) {
        console.log(`  ${expected.left} + ${expected.right}`);
        console.log(`      model   ${expected.kind} ${expected.value}`);
        console.log(`      runtime ${kind} ${value}`);
      }
    }
  });
  console.log(
    `compared ${cases.length} sums against the model; ${disagreements} disagree`,
  );
  process.exitCode = disagreements === 0 ? 0 : 1;
}

main();
