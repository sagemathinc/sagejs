"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const {
  nativeFiles,
  validateKernelRegistry,
  validateNativeCode,
} = require("../scripts/check-native-architecture.cjs");

const root = resolve(__dirname, "..");
const codeManifest = JSON.parse(readFileSync(
  join(root, "architecture", "native-code.json"),
  "utf8",
));
const kernelManifest = JSON.parse(readFileSync(
  join(root, "architecture", "native-kernels.json"),
  "utf8",
));

test("every tracked native file has an architectural classification", () => {
  const result = validateNativeCode(codeManifest);
  assert.equal(result.entries.length, nativeFiles().length);
  assert.ok(result.auditRequired.some((entry) =>
    entry.path === "packages/flint/src/p1.c"
  ));
});

test("unclassified and stale native files fail closed", () => {
  const tracked = nativeFiles();
  const missing = structuredClone(codeManifest);
  missing.files = missing.files.filter((entry) => entry.path !== tracked[0]);
  assert.throws(
    () => validateNativeCode(missing, { trackedFiles: tracked }),
    /unclassified native files/,
  );
  const stale = structuredClone(codeManifest);
  stale.files.push({
    path: "missing.c",
    category: "host-adapter",
    review_status: "accepted",
    lane: "integration",
    rationale: "A deliberately missing source used by this validation test.",
  });
  assert.throws(() => validateNativeCode(stale), /native-code file is missing/);
});

test("compiler witnesses retain same-source fallbacks and avoid name substitution", () => {
  const result = validateKernelRegistry(kernelManifest);
  assert.ok(result.kernels.length >= 3);
  const changed = structuredClone(kernelManifest);
  changed.kernels[0].fallback = "replacement";
  assert.throws(
    () => validateKernelRegistry(changed),
    /same-source fallback/,
  );
});
