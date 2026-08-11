"use strict";

/** Public modules required by operations implemented in the bootstrap baselib.
 *
 * Full Sage.js sessions provide a lazy module loader. Standalone JavaScript,
 * compiler fixtures, lightweight task workers, and future SEA-only realms do
 * not. Their compiler entry points prepend these normal Python imports so the
 * authoritative module resolver embeds one host-independent dependency set.
 */

const MATRIX_STANDALONE_MODULES = Object.freeze([
  "sagejs.kernels.matrix.dense_integer",
  "sagejs.kernels.matrix.dense_integer_flint",
  "sagejs.kernels.matrix.dense_prime_field",
  "sagejs.kernels.matrix.dense_prime_field_flint",
  "sagejs.kernels.matrix.dense_prime_field_fflas",
  "sagejs.kernels.matrix.dense_rational",
  "sagejs.kernels.matrix.dense_rational_flint",
]);

const POLYNOMIAL_STANDALONE_MODULES = Object.freeze([
  "sagejs.kernels.polynomial.packed_integer",
  "sagejs.kernels.polynomial.packed_flint",
  "sagejs.kernels.polynomial.packed_prime_field",
  "sagejs.kernels.polynomial.packed_rational",
]);

const BASELIB_STANDALONE_MODULES = Object.freeze([
  ...MATRIX_STANDALONE_MODULES,
  ...POLYNOMIAL_STANDALONE_MODULES,
]);

// Cache the complete static dependency closure as separate module artifacts.
// The authoritative resolver still verifies these identities and source
// hashes; this list avoids reparsing the same library graph for every explicit
// standalone compilation.
const BASELIB_STANDALONE_CACHE_MODULES = Object.freeze([
  "sagejs",
  "sagejs.ffi",
  "sagejs.ffi.flint",
  "sagejs.ffi.fflas",
  "sagejs.kernels",
  "sagejs.kernels.matrix",
  "sagejs.kernels.matrix.dense_integer",
  "sagejs.kernels.matrix.dense_integer_flint",
  "sagejs.kernels.matrix.dense_prime_field",
  "sagejs.kernels.matrix.dense_prime_field_flint",
  "sagejs.kernels.matrix.dense_prime_field_fflas",
  "sagejs.kernels.matrix.dense_rational",
  "sagejs.kernels.matrix.dense_rational_flint",
  "sagejs.kernels.polynomial",
  "sagejs.kernels.polynomial.packed_integer",
  "sagejs.kernels.polynomial.packed_flint",
  "sagejs.kernels.polynomial.packed_prime_field",
  "sagejs.kernels.polynomial.packed_rational",
  "sagejs.native",
]);

function baselibStandaloneImportPrelude(modules = BASELIB_STANDALONE_MODULES) {
  return modules
    .map((name) => `import ${name}\n`)
    .join("");
}

module.exports = {
  BASELIB_STANDALONE_CACHE_MODULES,
  BASELIB_STANDALONE_MODULES,
  MATRIX_STANDALONE_MODULES,
  POLYNOMIAL_STANDALONE_MODULES,
  baselibStandaloneImportPrelude,
};
