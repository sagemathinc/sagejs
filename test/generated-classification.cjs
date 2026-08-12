#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  checkGeneratedClassification,
  expectedGeneratedPaths,
  generatedAttributes,
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
  assert.throws(
    () => validateClassification(
      expected,
      tracked,
      new Map([
        ["authority.py", "custom-value"],
        ["derived.json", "set"],
      ]),
    ),
    /ambiguous linguist-generated value/,
  );
});

test("Git attribute set, unset, and unspecified states are interpreted exactly", () => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-generated-attributes-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  writeFileSync(
    join(root, ".gitattributes"),
    [
      "derived.json linguist-generated",
      "authority.py -linguist-generated",
      "custom.txt linguist-generated=opaque",
      "",
    ].join("\n"),
  );
  const attributes = generatedAttributes(
    ["derived.json", "authority.py", "ordinary.md", "custom.txt"],
    root,
  );
  assert.equal(attributes.get("derived.json"), "set");
  assert.equal(attributes.get("authority.py"), "unset");
  assert.equal(attributes.get("ordinary.md"), "unspecified");
  assert.equal(attributes.get("custom.txt"), "opaque");
  assert.deepEqual(
    validateClassification(
      ["derived.json"],
      ["authority.py", "derived.json", "ordinary.md"],
      attributes,
    ),
    { generated: 1, authoritative: 2 },
  );
  assert.throws(
    () => validateClassification(
      ["derived.json"],
      ["custom.txt", "derived.json"],
      attributes,
    ),
    /ambiguous linguist-generated value "opaque"/,
  );
});
