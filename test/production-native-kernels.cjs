"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const published = join(root, "dist", "native-kernels");

test("all production native kernels are published and autoloadable", () => {
  const manifest = JSON.parse(readFileSync(
    join(root, "architecture", "native-kernels.json"),
    "utf8",
  ));
  const index = JSON.parse(readFileSync(join(published, "index.json"), "utf8"));
  assert.equal(index.schema, "sagejs.native-cache/v2");
  const production = manifest.kernels.filter((kernel) =>
    kernel.id.endsWith("-production"),
  );
  assert.ok(production.length > 0);
  for (const kernel of production) {
    assert.match(kernel.source, /^src\/lib\//);
    const sourceKey = kernel.source.slice("src/lib/".length);
    const record = index.logicalSources[sourceKey];
    assert.match(record?.sourceHash ?? "", /^[a-f0-9]{64}$/);
    assert.match(record?.cacheKey ?? "", /^[a-f0-9]{64}$/);
    assert.ok(existsSync(join(published, record.cacheKey, "index.cjs")));
    assert.ok(existsSync(join(
      published,
      record.cacheKey,
      "build",
      "Release",
      "sagejs_native_kernel.node",
    )));
  }

  const program = [
    "from sagejs.kernels.matrix.dense_prime_field import dense_prime_field_matrix_add",
    "from sagejs.kernels.matrix.dense_integer_flint import flint_dense_integer_resource_random_fill",
    "from sagejs.kernels.matrix.dense_rational_flint import flint_dense_rational_matrix_import",
    "from sagejs.kernels.polynomial.packed_flint import flint_byte_region_copy",
    "print(dense_prime_field_matrix_add.nativeAvailable)",
    "print(flint_dense_integer_resource_random_fill.nativeAvailable)",
    "print(flint_dense_rational_matrix_import.nativeAvailable)",
    "print(flint_byte_region_copy.nativeAvailable)",
    "",
  ].join("\n");
  const result = spawnSync(join(root, "bin", "sagejs"), ["--python"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: published,
      SAGEJS_NATIVE_REQUIRED: "1",
    },
    input: program,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "True\nTrue\nTrue\nTrue");
});
