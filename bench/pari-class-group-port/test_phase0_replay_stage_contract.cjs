#!/usr/bin/env node
"use strict";

// Lightweight contract coverage for the durable stage graph. This deliberately
// does not invoke PARI or any native compilation.

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const directory = __dirname;
const runner = path.join(directory, "run_phase0_integration_replay.cjs");
const result = childProcess.spawnSync(process.execPath, [runner, "list"], {
  encoding: "utf8",
});
assert.equal(result.status, 0, result.stderr || String(result.error));

const graph = new Map(result.stdout.trim().split("\n").map((line) => {
  const [name, dependencies] = line.split("\t");
  return [name, dependencies === "-" ? [] : dependencies.split(",")];
}));

assert.deepEqual(graph.get("quartic-hnfadd-trace"), ["quartic-driver"]);
assert.deepEqual(graph.get("quartic-continuation"), [
  "quartic-collector",
  "quartic-hnfadd-trace",
]);
for (const name of [
  "quartic-retry-cpython",
  "quartic-retry-javascript",
  "quartic-retry-gmp",
  "quartic-retry-tagged",
]) {
  assert(graph.get(name).includes("quartic-hnfadd-trace"), name);
  assert(graph.get(name).includes("quartic-continuation"), name);
}

const source = fs.readFileSync(runner, "utf8");
assert.match(source, /commandNode\("check_actual_hnfadd_inputs\.cjs",\s*\n\s*context\.pariRoot, context\.pariArchive, "--field2"\)/);
assert.match(source, /identityInputs: \(\) => \[checker\("hnfadd\.py"\)\]/);
assert.equal(
  [...source.matchAll(/tracePath\(context, "quartic-driver"\)/g)].length,
  0,
  "continuation and retry stages must not consume the summarized driver trace",
);
assert.equal(
  [...source.matchAll(/tracePath\(context, "quartic-hnfadd-trace"\)/g)].length,
  3,
  "continuation and both retry command factories consume the extended trace",
);

console.log("Phase-0 quartic trace stage contract passed.");
