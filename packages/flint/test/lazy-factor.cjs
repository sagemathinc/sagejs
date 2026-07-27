"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../../..");
const sagejs = path.join(root, "bin", "sagejs");
const observer = path.join(__dirname, "observe-load.cjs");
const marker = "SAGEJS_FLINT_LOADED";

function run(source) {
  const result = spawnSync(
    process.execPath,
    ["--require", observer, sagejs],
    {
      cwd: root,
      input: source,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result;
}

const arithmetic = run("print(2^100)\n");
assert.equal(arithmetic.stdout.trim(), "1.2676506002282294e+30");
assert.doesNotMatch(arithmetic.stderr, new RegExp(marker));

const factoring = run(
  "print(factor(2026))\nprint(factor(-360))\nprint(factor(1))\n",
);
assert.deepEqual(factoring.stdout.trim().split("\n"), [
  "[[2, 1], [1013, 1]]",
  "[[-1, 1], [2, 3], [3, 2], [5, 1]]",
  "[]",
]);
assert.equal(factoring.stderr.match(new RegExp(marker, "g"))?.length, 1);

console.log("Sage.js factor() loads FLINT once, on first use.");
