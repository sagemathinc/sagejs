"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BASELIB_STANDALONE_CACHE_MODULES,
  BASELIB_STANDALONE_MODULES,
  MATRIX_STANDALONE_MODULES,
  moduleClosure,
} = require("../tools/standalone-library.cjs");

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
