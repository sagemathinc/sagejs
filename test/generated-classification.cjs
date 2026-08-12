#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  checkGeneratedClassification,
  expectedGeneratedPaths,
  validateClassification,
} = require("../scripts/check-generated-classification.cjs");

test("repository generated-review classification is exact", () => {
  const result = checkGeneratedClassification();
  assert.ok(result.generated >= 18);
  assert.ok(result.authoritative > result.generated);
});

test("expected set follows the FFI generators and excludes authority", () => {
  const generated = new Set(expectedGeneratedPaths());
  for (const path of [
    "ffi/flint.ffi.json",
    "packages/flint/generated/ffi_host.py",
    "src/lib/sagejs/ffi/flint.py",
    "src/baselib/sagejs/ffi/flint.py",
    "architecture/native-boundaries.json",
    "architecture/native-exports.json",
  ]) {
    assert.ok(generated.has(path), path);
  }
  for (const path of [
    "ffi/flint.ffi.py",
    ".agents/tasks/generated-diff-classification.json",
    "docs/math-dispatch-profiles.md",
    "packages/flint/include/sagejs/fmpq_matrix_ffi.h",
    "test/ffi.cjs",
    "bench/compare-native-ffi.cjs",
    "src/lib/sagejs/kernels/matrix/dense_rational_matrix.py",
  ]) {
    assert.ok(!generated.has(path), path);
  }
});

test("validation rejects missing and extra generated classifications", () => {
  const expected = ["derived.json"];
  const tracked = ["authority.py", "derived.json"];
  assert.deepEqual(
    validateClassification(
      expected,
      tracked,
      new Map([
        ["authority.py", "unspecified"],
        ["derived.json", "true"],
      ]),
    ),
    { generated: 1, authoritative: 1 },
  );
  assert.throws(
    () => validateClassification(
      expected,
      tracked,
      new Map([
        ["authority.py", "unspecified"],
        ["derived.json", "unspecified"],
      ]),
    ),
    /lack linguist-generated=true/,
  );
  assert.throws(
    () => validateClassification(
      expected,
      tracked,
      new Map([
        ["authority.py", "true"],
        ["derived.json", "true"],
      ]),
    ),
    /authoritative files are incorrectly classified/,
  );
});
