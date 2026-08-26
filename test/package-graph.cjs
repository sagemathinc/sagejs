// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const {
  assertDag,
  normalizedSourceBytes,
  pythonImports,
  validateManifest,
} = require("../scripts/check-package-graph.cjs");

const root = resolve(__dirname, "..");

test("the checked-in package graph owns every Python source and respects budgets", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "architecture/package-graph.json"), "utf8"),
  );
  const result = validateManifest(manifest, root);
  assert.equal(
    result.ownership.get("src/lib/sagejs_serialization.py"),
    "python-stdlib",
  );
  assert.equal(result.ownership.get("src/baselib/modular.py"), "modular-forms");
  assert.equal(
    result.ownership.get("src/lib/sagejs/kernels/p1.py"),
    "modular-forms",
  );
  assert.equal(
    result.typescriptOwnership.get("tools/serialization-codecs/arithmetic.ts"),
    "arithmetic",
  );
  assert.equal(
    result.typescriptOwnership.get("tools/serialization-codecs/linear-algebra.ts"),
    "linear-algebra",
  );
  assert.equal(
    result.ownership.get("src/lib/sagejs/linear_algebra/__init__.py"),
    "linear-algebra-algorithms",
  );
  assert.equal(
    result.ownership.get("src/lib/sagejs/polynomial_algorithms/__init__.py"),
    "polynomial-algorithms",
  );
  assert.equal(
    result.ownership.get("src/lib/sagejs/kernels/matrix/dense_integer.py"),
    "matrix-native-kernels",
  );
  assert.equal(
    result.ownership.get("src/lib/sagejs/kernels/polynomial/packed_flint.py"),
    "polynomial-native-kernels",
  );
  assert.equal(
    result.typescriptOwnership.get("tools/serialization-codecs/number-fields.ts"),
    "arithmetic",
  );
  assert.equal(
    result.typescriptOwnership.get("tools/serialization-codecs/polynomial.ts"),
    "arithmetic",
  );
  assert.equal(
    result.typescriptOwnership.get("tools/serialization-codecs/series.ts"),
    "arithmetic",
  );
  assert.equal(
    result.typescriptOwnership.get("tools/serialization-codecs/elliptic-curves.ts"),
    "elliptic-curves",
  );
  assert.equal(
    result.typescriptOwnership.get("tools/serialization-codecs/modular-forms.ts"),
    "modular-forms",
  );
});

test("dependency cycles are rejected with their path", () => {
  assert.throws(
    () => assertDag([
      { id: "a", depends_on: ["b"] },
      { id: "b", depends_on: ["c"] },
      { id: "c", depends_on: ["a"] },
    ], "test graph"),
    /a -> b -> c -> a/,
  );
});

test("source budgets are independent of checkout line endings", () => {
  assert.equal(
    normalizedSourceBytes("alpha\nbeta\n"),
    normalizedSourceBytes("alpha\r\nbeta\r\n"),
  );
});

test("Python import extraction ignores prose and understands aliases", () => {
  assert.deepEqual(
    pythonImports([
      "from urllib.parse import quote",
      "import os, json as json_module",
      "from the complete runtime argument signature.",
    ].join("\n")),
    ["urllib.parse", "os", "json"],
  );
});
