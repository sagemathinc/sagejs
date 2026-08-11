"use strict";

const assert = require("node:assert/strict");
const {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const published = join(root, "dist", "native-kernels");
const { NATIVE_ABI_VERSION } = require(
  "../tools/native-kernel/c-backend.cjs"
);
const { NATIVE_KERNEL_ABI_VERSION } = require(
  "../dist/tools/runtime-bootstrap.js"
);

function runWithCache(cache, source, required = true) {
  return spawnSync(join(root, "bin", "sagejs"), ["--python"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: required ? "1" : "0",
    },
    input: source,
  });
}

test("all production native kernels are published and autoloadable", () => {
  const manifest = JSON.parse(readFileSync(
    join(root, "architecture", "native-kernels.json"),
    "utf8",
  ));
  const index = JSON.parse(readFileSync(join(published, "index.json"), "utf8"));
  assert.equal(index.schema, "sagejs.native-cache/v3");
  assert.equal(NATIVE_KERNEL_ABI_VERSION, NATIVE_ABI_VERSION);
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
    assert.equal(record?.nativeAbi, NATIVE_ABI_VERSION);
    assert.ok(Array.isArray(record?.foreignDeclarations));
    assert.ok(existsSync(join(published, record.cacheKey, "index.cjs")));
    assert.ok(existsSync(join(
      published,
      record.cacheKey,
      "build",
      "Release",
      "sagejs_native_kernel.node",
    )));
    const wrapper = require(join(published, record.cacheKey, "index.cjs"));
    assert.equal(wrapper.cacheKey, record.cacheKey);
    assert.equal(wrapper.sourceHash, record.sourceHash);
    assert.equal(wrapper.nativeAbi, record.nativeAbi);
    assert.deepEqual(wrapper.foreignDeclarations, record.foreignDeclarations);
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

test("stale FFI declaration metadata fails before a native wrapper loads", () => {
  const index = JSON.parse(readFileSync(join(published, "index.json"), "utf8"));
  const logicalSource = "sagejs/kernels/matrix/dense_integer_flint.py";
  const record = structuredClone(index.logicalSources[logicalSource]);
  assert.equal(record.foreignDeclarations.length, 1);
  const currentIdentity = record.foreignDeclarations[0].declarationIdentity;
  const final = currentIdentity.at(-1);
  const staleIdentity = currentIdentity.slice(0, -1) +
    (final === "0" ? "1" : "0");
  record.foreignDeclarations[0].declarationIdentity = staleIdentity;

  const temporary = mkdtempSync(join(tmpdir(), "sagejs-stale-native-"));
  try {
    const sourceDirectory = join(published, record.cacheKey);
    const targetDirectory = join(temporary, record.cacheKey);
    cpSync(sourceDirectory, targetDirectory, { recursive: true });
    const wrapperPath = join(targetDirectory, "index.cjs");
    const wrapperSource = readFileSync(wrapperPath, "utf8");
    assert.ok(wrapperSource.includes(currentIdentity));
    writeFileSync(
      wrapperPath,
      wrapperSource.replaceAll(currentIdentity, staleIdentity),
    );
    writeFileSync(join(temporary, "index.json"), `${JSON.stringify({
      schema: "sagejs.native-cache/v3",
      sources: {},
      logicalSources: { [logicalSource]: record },
    }, null, 2)}\n`);

    const source = [
      "from sagejs.native import is_compiled",
      "from sagejs.kernels.matrix.dense_integer_flint import flint_dense_integer_resource_random_fill",
      "print(is_compiled(flint_dense_integer_resource_random_fill))",
      "",
    ].join("\n");
    const fallback = runWithCache(temporary, source, false);
    assert.equal(fallback.stdout.trim(), "False");
    const required = runWithCache(temporary, source);
    assert.match(required.stderr, /stale native kernel artifact/);
    assert.match(required.stderr, /FFI declaration/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("stale compiler ABI metadata fails before a native wrapper loads", () => {
  const index = JSON.parse(readFileSync(join(published, "index.json"), "utf8"));
  const logicalSource = "sagejs/kernels/matrix/dense_integer_flint.py";
  const record = structuredClone(index.logicalSources[logicalSource]);
  const staleAbi = record.nativeAbi - 1;

  const temporary = mkdtempSync(join(tmpdir(), "sagejs-stale-native-abi-"));
  try {
    const sourceDirectory = join(published, record.cacheKey);
    const targetDirectory = join(temporary, record.cacheKey);
    cpSync(sourceDirectory, targetDirectory, { recursive: true });
    const wrapperPath = join(targetDirectory, "index.cjs");
    const wrapperSource = readFileSync(wrapperPath, "utf8");
    const currentAbiSource = `nativeAbi: ${record.nativeAbi},`;
    assert.ok(wrapperSource.includes(currentAbiSource));
    writeFileSync(
      wrapperPath,
      wrapperSource.replace(currentAbiSource, `nativeAbi: ${staleAbi},`),
    );
    record.nativeAbi = staleAbi;
    writeFileSync(join(temporary, "index.json"), `${JSON.stringify({
      schema: "sagejs.native-cache/v3",
      sources: {},
      logicalSources: { [logicalSource]: record },
    }, null, 2)}\n`);

    const source = [
      "from sagejs.native import is_compiled",
      "from sagejs.kernels.matrix.dense_integer_flint import flint_dense_integer_resource_random_fill",
      "print(is_compiled(flint_dense_integer_resource_random_fill))",
      "",
    ].join("\n");
    const fallback = runWithCache(temporary, source, false);
    assert.equal(fallback.stdout.trim(), "False");
    const required = runWithCache(temporary, source);
    assert.match(required.stderr, /stale native kernel artifact/);
    assert.match(required.stderr, /native ABI metadata/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
