"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readdirSync } = require("node:fs");

const manifest = require("./node-test-manifest.cjs");

test("every host test belongs to a runner tier", () => {
  const classified = [...manifest.unit, ...manifest.integration];
  assert.equal(
    new Set(classified).size,
    classified.length,
    "a host test occurs in more than one tier",
  );

  const specialized = new Set([
    "compiler.test.cjs",
    "exact-polynomial-resource-ffi.cjs",
    "exact-polynomial-resource-equality.cjs",
    "ffi-resource-accounting-codegen.cjs",
    "ffi-resource-memory.cjs",
    "fmpz-matrix-resource-ffi.cjs",
    "fmpq-resource-ops-lifecycle.cjs",
    "native-kernel-addon-child.cjs",
    "native-kernel.cjs",
    "sea-smoke.cjs",
    "upstream-doctest-tools.cjs",
    "node-test-manifest.cjs",
  ]);
  const expected = readdirSync(__dirname)
    .filter((name) => name.endsWith(".cjs") && !specialized.has(name))
    .map((name) => `test/${name}`)
    .sort();

  assert.deepEqual([...classified].sort(), expected);
});
