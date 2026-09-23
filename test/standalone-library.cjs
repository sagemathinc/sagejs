// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BASELIB_STANDALONE_CACHE_MODULES,
  BASELIB_STANDALONE_MODULES,
  MATRIX_STANDALONE_MODULES,
  EXTENSION_STANDALONE_MODULES,
  GROEBNER_STANDALONE_MODULES,
  CORE_STANDALONE_MODULES,
  moduleClosure,
} = require("../tools/standalone-library.cjs");

test("Node compiler resources retain the authoritative standalone core", () => {
  const { coreStandaloneModules } = require("../dist/tools/standalone-resources.js");
  assert.deepEqual(coreStandaloneModules(), CORE_STANDALONE_MODULES);
});

test("implicit standalone core includes literal default-import dependencies", () => {
  for (const name of ["sagejs._introspection", "sagejs._documentation_search", "sagejs.class_namespace", "inspect"]) {
    assert(CORE_STANDALONE_MODULES.includes(name), name);
    assert(BASELIB_STANDALONE_MODULES.includes(name) || name === "inspect", name);
  }
  assert(!CORE_STANDALONE_MODULES.includes("sagejs.special_functions"));
});

test("matrix standalone modules follow literal lazy imports", () => {
  assert(BASELIB_STANDALONE_MODULES.includes("random"));
  for (const name of [
    "sagejs.linear_algebra.exact_vector_public",
    "sagejs.linear_algebra.matrix_subspaces_public",
    "sagejs.kernels.matrix.dense_binary_m4ri",
    "sagejs.kernels.matrix.dense_word_prime_flint",
  ]) {
    assert(MATRIX_STANDALONE_MODULES.includes(name), name);
  }
});

test("implicit byte codecs are included without a user import", () => {
  assert(CORE_STANDALONE_MODULES.includes("sagejs._punycode"));
  assert(BASELIB_STANDALONE_MODULES.includes("sagejs._punycode"));
  assert(BASELIB_STANDALONE_CACHE_MODULES.includes("sagejs._punycode"));
  // Parent packages belong in the resolved cache closure, not explicit imports:
  // task-runtime code may bind the sagejs intrinsic under a deliberate alias.
  assert(!BASELIB_STANDALONE_MODULES.includes("sagejs"));
});

test("standalone ideal operations include the new lazy geometry helpers", () => {
  for (const name of ["ideal_operations", "hilbert", "zero_dimensional"]) {
    assert(GROEBNER_STANDALONE_MODULES.includes(
      `sagejs.polynomial_algorithms.${name}`,
    ));
  }
});

test("finite-extension standalone roots include lazy polynomial storage", () => {
  for (const name of [
    "sagejs.kernels.polynomial.packed_prime_field",
    "sagejs.linear_algebra.exact_vector_public",
    "sagejs.polynomial_algorithms.field_capabilities",
    "sagejs.polynomial_algorithms.extension_mpoly_backend",
    "sagejs.polynomial_algorithms.structural_calculus",
    "sagejs.schemes.enumeration",
  ]) {
    assert(EXTENSION_STANDALONE_MODULES.includes(name), name);
  }
});

test("standalone cache includes static dependencies and packages", () => {
  const closure = moduleClosure([
    "sagejs.linear_algebra.matrix_subspaces_public",
    "sagejs.linear_algebra.matrix_vector_public",
  ]);
  for (const name of [
    "sagejs",
    "sagejs.linear_algebra",
    "sagejs.linear_algebra.matrix_subspaces",
    "sagejs.linear_algebra.matrix_subspaces_public",
    "sagejs.linear_algebra.matrix_vector",
    "sagejs.linear_algebra.matrix_vector_public",
  ]) {
    assert(closure.includes(name), name);
    assert(BASELIB_STANDALONE_CACHE_MODULES.includes(name), name);
  }
});

test("standalone cache includes the lazy semantic plotting package", () => {
  assert(BASELIB_STANDALONE_MODULES.includes("sagejs.plotting"));
  for (const name of [
    "sagejs.plotting",
    "sagejs.plotting._json",
    "sagejs.plotting.diagnostics",
    "sagejs.plotting.model",
  ]) {
    assert(BASELIB_STANDALONE_CACHE_MODULES.includes(name), name);
  }
});
