"use strict";

/** Public modules required by operations implemented in the bootstrap baselib.
 *
 * Full Sage.js sessions provide a lazy module loader. Standalone JavaScript,
 * compiler fixtures, lightweight task workers, and future SEA-only realms do
 * not. Their compiler entry points prepend these normal Python imports so the
 * authoritative module resolver embeds one host-independent dependency set.
 */

const BASELIB_STANDALONE_MODULES = Object.freeze([
  "sagejs.kernels.dense_integer",
  "sagejs.kernels.dense_integer_flint",
  "sagejs.kernels.dense_prime",
  "sagejs.kernels.dense_prime_flint",
]);

// Cache the complete static dependency closure as separate module artifacts.
// The authoritative resolver still verifies these identities and source
// hashes; this list avoids reparsing the same library graph for every explicit
// standalone compilation.
const BASELIB_STANDALONE_CACHE_MODULES = Object.freeze([
  "sagejs",
  "sagejs.ffi",
  "sagejs.ffi.flint",
  "sagejs.kernels",
  "sagejs.kernels.dense_integer",
  "sagejs.kernels.dense_integer_flint",
  "sagejs.kernels.dense_prime",
  "sagejs.kernels.dense_prime_flint",
  "sagejs.native",
]);

function baselibStandaloneImportPrelude() {
  return BASELIB_STANDALONE_MODULES
    .map((name) => `import ${name}\n`)
    .join("");
}

module.exports = {
  BASELIB_STANDALONE_CACHE_MODULES,
  BASELIB_STANDALONE_MODULES,
  baselibStandaloneImportPrelude,
};
