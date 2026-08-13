"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { buildSync } = require("esbuild");

const {
  BASELIB_STANDALONE_CACHE_MODULES,
  BASELIB_STANDALONE_MODULES,
  MATRIX_STANDALONE_MODULES,
  moduleClosure,
  standaloneModuleInventory,
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

test("embedded standalone inventory does not read the source checkout", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-standalone-inventory-"));
  try {
    const entry = join(temporary, "entry.cjs");
    const bundle = join(temporary, "bundle.cjs");
    writeFileSync(
      entry,
      `console.log(JSON.stringify(require(${JSON.stringify(
        require.resolve("../tools/standalone-library.cjs"),
      )}).standaloneModuleInventory()));\n`,
    );
    const expected = standaloneModuleInventory();
    buildSync({
      entryPoints: [entry],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "cjs",
      define: {
        __SAGEJS_STANDALONE_MODULES__: JSON.stringify(expected),
      },
    });
    const result = spawnSync(process.execPath, [bundle], {
      cwd: temporary,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
