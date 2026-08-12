"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const test = require("node:test");

const { fingerprint } = require("../tools/math-dispatch/common.cjs");
const {
  dispatchRuntimeIdentity,
  specializedDispatchInputs,
} = require("../tools/math-dispatch/identity.cjs");
const { loadRegistry } = require("../tools/math-dispatch/registry.cjs");
const { selectImplementation } = require("../tools/math-dispatch/selector.cjs");

const root = resolve(__dirname, "..");

test("dependency, runtime dispatch, and specialization identities remain separate", async () => {
  const registry = await loadRegistry({ root });
  const nativeDependencyFingerprint = fingerprint({ flint: "3.6.0", flags: ["--enable-fat"] });
  const decision = selectImplementation(registry, {
    family: "dense-prime-matrix",
    operation: "multiply",
    features: {
      canonical_output: true,
      inner: 32,
      left_rows: 32,
      modulus: 97,
      right_columns: 32,
    },
    capabilities: ["fflas", "flint-prime-matrix"],
    build: { build_fingerprint: nativeDependencyFingerprint },
  });
  const runtime = dispatchRuntimeIdentity(registry);
  const specialization = specializedDispatchInputs(decision);
  assert.equal(runtime.profile_set_fingerprint, decision.profile_set_fingerprint);
  assert.notEqual(nativeDependencyFingerprint, runtime.profile_set_fingerprint);
  assert.notEqual(specialization.fingerprint, nativeDependencyFingerprint);
  assert.deepEqual(Object.keys(specialization).sort(), [
    "declaration_fingerprint",
    "fingerprint",
    "implementation",
    "profile_set_fingerprint",
    "schema",
    "selected_profile_fingerprint",
  ]);
});

test("profile-only policy changes alter specialization without pretending FLINT changed", async () => {
  const registry = await loadRegistry({ root });
  const original = registry.profiles[0];
  const changedDocument = structuredClone(original.document);
  changedDocument.operations.find((item) => item.operation === "multiply")
    .rules.find((item) => item.id === "large-fflas").reason += " (reviewed update)";
  const changedFingerprint = fingerprint(changedDocument);
  assert.notEqual(changedFingerprint, original.fingerprint);
  const nativeDependencyFingerprint = fingerprint({ flint: "3.6.0" });
  assert.equal(nativeDependencyFingerprint, fingerprint({ flint: "3.6.0" }));
});
