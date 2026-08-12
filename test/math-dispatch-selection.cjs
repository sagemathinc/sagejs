"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const test = require("node:test");

const { loadRegistry } = require("../tools/math-dispatch/registry.cjs");
const { validateProfileDocument } = require("../tools/math-dispatch/schema.cjs");
const {
  DispatchSelectionError,
  selectImplementation,
  traceLine,
} = require("../tools/math-dispatch/selector.cjs");

const root = resolve(__dirname, "..");
let registry;

test.before(async () => {
  registry = await loadRegistry({ root });
});

function multiply(size, overrides = {}) {
  return selectImplementation(registry, {
    family: "dense-prime-matrix",
    operation: "multiply",
    features: {
      canonical_output: true,
      inner: size,
      left_rows: size,
      modulus: 97,
      right_columns: size,
    },
    capabilities: ["fflas", "flint-prime-matrix"],
    build: {},
    ...overrides,
  });
}

test("portable rules select adjacent sides of the declared crossover", () => {
  assert.equal(multiply(31).implementation, "flint");
  assert.equal(multiply(32).implementation, "fflas-float");
});

test("capabilities only remove algorithms and expose the fallback walk", () => {
  const decision = multiply(100, { capabilities: ["flint-prime-matrix"] });
  assert.equal(decision.preferred, "fflas-float");
  assert.equal(decision.implementation, "flint");
  assert.deepEqual(decision.fallback_chain, ["fflas-float", "flint"]);
  assert.match(decision.candidates.find((item) => item.id === "fflas-float").rejection_reasons[0], /FFLAS/);
});

test("explicit overrides never silently substitute another implementation", () => {
  const explicit = multiply(100, { algorithm: "flint" });
  assert.equal(explicit.implementation, "flint");
  assert.equal(explicit.profile.origin, "explicit");
  assert.equal(explicit.profile.fingerprint, null);
  assert.throws(
    () => multiply(100, { algorithm: "fflas-float", capabilities: ["flint-prime-matrix"] }),
    (error) => error instanceof DispatchSelectionError && /explicit algorithm/.test(error.message),
  );
});

test("GF(2) representation and implementation follow M4RI capability atomically", () => {
  const features = {
    canonical_output: true,
    inner: 80,
    left_rows: 80,
    modulus: 2,
    right_columns: 80,
  };
  const m4ri = selectImplementation(registry, {
    family: "dense-prime-matrix", operation: "multiply", features,
    capabilities: ["m4ri", "flint-prime-matrix"], build: {},
  });
  assert.equal(m4ri.representation.id, "m4ri-gf2");
  assert.equal(m4ri.implementation, "m4ri");
  const portable = selectImplementation(registry, {
    family: "dense-prime-matrix", operation: "multiply", features,
    capabilities: ["flint-prime-matrix"], build: {},
  });
  assert.equal(portable.representation.id, "packed-u64");
  assert.equal(portable.implementation, "flint");
});

test("full-width uint64 features remain exact beyond JavaScript's safe integer range", () => {
  const modulus = "18446744073709551557";
  const decision = selectImplementation(registry, {
    family: "dense-prime-matrix",
    operation: "multiply",
    features: {
      canonical_output: true,
      inner: 8,
      left_rows: 8,
      modulus,
      right_columns: 8,
    },
    capabilities: ["flint-prime-matrix"],
    build: {},
  });
  assert.equal(decision.features.modulus, modulus);
  assert.equal(decision.representation.id, "flint-nmod-resource");
  assert.equal(decision.implementation, "flint");
  assert.throws(() => selectImplementation(registry, {
    family: "dense-prime-matrix",
    operation: "multiply",
    features: { ...decision.features, modulus: "18446744073709551616" },
    capabilities: ["flint-prime-matrix"],
    build: {},
  }), /unsigned 64-bit integer/);
});

test("exact arithmetic over normalized uint64 strings remains total", () => {
  const { evaluate } = require("../tools/math-dispatch/selector.cjs");
  const source = { path: "synthetic.dispatch.py", line: 1, column: 1 };
  const expression = {
    op: "add",
    left: { op: "feature", name: "n", source },
    right: { op: "integer", value: "1", source },
    source,
  };
  assert.equal(evaluate(expression, { n: "18446744073709551614" }, new Set()),
    18446744073709551615n);
});

function checkedProfile(id, match, choose = "flint", kind = "checked") {
  const family = registry.families.get("dense-prime-matrix");
  return validateProfileDocument({
    schema: "sagejs.math-dispatch/profile-v1",
    schema_version: 1,
    id,
    generation: 1,
    kind,
    match,
    declarations: { "dense-prime-matrix": family.fingerprint },
    evidence: ["synthetic"],
    operations: [{
      family: "dense-prime-matrix",
      operation: "multiply",
      source: { path: "test.dispatch.py", line: 1, column: 1 },
      rules: [{
        id: "host-rule", choose, when: true, evidence: "synthetic",
        reason: "synthetic checked host rule",
        source: { path: "test.dispatch.py", line: 2, column: 1 },
      }],
    }],
    source: { path: "test.dispatch.py", line: 1, column: 1 },
  }, registry.families, { filename: "test.dispatch.py" });
}

test("an activated local profile applies only on a complete exact identity match", () => {
  const match = {
    os: "linux",
    arch: "x64",
    cpu_family: "x86-avx2",
    build_fingerprint: "a".repeat(64),
    blas_provider: "openblas",
    threading: "single",
    library_versions: { flint: "3.6.0" },
    declaration_generation: 1,
    benchmark_schema: 1,
  };
  const local = checkedProfile("my-local", match, "flint", "local");
  const request = {
    family: "dense-prime-matrix",
    operation: "multiply",
    features: {
      canonical_output: true,
      inner: 100,
      left_rows: 100,
      modulus: 97,
      right_columns: 100,
    },
    capabilities: ["fflas", "flint-prime-matrix"],
    localProfile: local,
  };
  const accepted = selectImplementation(registry, { ...request, build: match });
  assert.equal(accepted.profile.origin, "local");
  assert.equal(accepted.implementation, "flint");
  const rejected = selectImplementation(registry, {
    ...request,
    build: { ...match, build_fingerprint: "b".repeat(64) },
  });
  assert.equal(rejected.profile.origin, "portable");
  assert.equal(rejected.implementation, "fflas-float");
  assert.match(rejected.profile.diagnostics[0].reasons[0], /build_fingerprint/);
  const extraLibrary = selectImplementation(registry, {
    ...request,
    build: {
      ...match,
      library_versions: { flint: "3.6.0", fflas: "2.5.0" },
    },
  });
  assert.equal(extraLibrary.profile.origin, "portable");
  assert.match(extraLibrary.profile.diagnostics[0].reasons[0], /library_versions keys/);
});

test("most-specific checked profile wins independently of source order", () => {
  const generic = checkedProfile("linux-x64", { os: "linux", arch: "x64" });
  const cpu = checkedProfile("linux-x64-avx2", { os: "linux", arch: "x64", cpu_family: "x86-avx2" });
  const custom = { ...registry, profiles: [cpu, ...registry.profiles, generic] };
  const decision = selectImplementation(custom, {
    family: "dense-prime-matrix", operation: "multiply",
    features: { canonical_output: true, inner: 100, left_rows: 100, modulus: 97, right_columns: 100 },
    capabilities: ["fflas", "flint-prime-matrix"],
    build: { os: "linux", arch: "x64", cpu_family: "x86-avx2" },
  });
  assert.equal(decision.profile.id, "linux-x64-avx2");
  assert.equal(decision.implementation, "flint");
});

test("equal-specificity checked profiles are rejected", () => {
  const first = checkedProfile("first-linux", { os: "linux", arch: "x64" });
  const second = checkedProfile("second-linux", { os: "linux", arch: "x64" });
  const custom = { ...registry, profiles: [...registry.profiles, first, second] };
  assert.throws(() => selectImplementation(custom, {
    family: "dense-prime-matrix", operation: "multiply",
    features: { canonical_output: true, inner: 10, left_rows: 10, modulus: 97, right_columns: 10 },
    capabilities: ["flint-prime-matrix"], build: { os: "linux", arch: "x64" },
  }), /ambiguous equal-specificity/);
  assert.equal(selectImplementation(custom, {
    family: "dense-prime-matrix", operation: "multiply", algorithm: "flint",
    features: { canonical_output: true, inner: 10, left_rows: 10, modulus: 97, right_columns: 10 },
    capabilities: ["flint-prime-matrix"], build: { os: "linux", arch: "x64" },
  }).implementation, "flint");
});

test("trace is a projection of the immutable execution decision", () => {
  const decision = multiply(32);
  assert.ok(Object.isFrozen(decision));
  assert.match(traceLine(decision), /dense-prime-matrix\.multiply.*fflas-float.*portable\/large-fflas/);
});
