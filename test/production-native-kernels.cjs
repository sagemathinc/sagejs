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
const { nativeLogicalSourceKey } = require(
  "../dist/tools/runtime-bootstrap.js"
);

test("logical native source keys cover the full authoritative library", () => {
  for (const [filename, expected] of [
    [
      "/checkout/src/lib/sagejs/linear_algebra/sparse_random_public.py",
      "sagejs/linear_algebra/sparse_random_public.py",
    ],
    [
      "C:\\checkout\\src\\lib\\sagejs\\kernels\\p1.py",
      "sagejs/kernels/p1.py",
    ],
    [
      "/__sagejs_sea__/lib/sagejs/kernels/matrix/dense_integer.py",
      "sagejs/kernels/matrix/dense_integer.py",
    ],
    [
      "/virtual/sagejs/linear_algebra/sparse_random_public.py",
      "sagejs/linear_algebra/sparse_random_public.py",
    ],
  ]) {
    assert.equal(nativeLogicalSourceKey(filename), expected);
  }
  for (const filename of [
    "/outside/project.py",
    "/checkout/src/lib/not_sagejs/module.py",
    "/checkout/src/lib/sagejs/../private.py",
    "/checkout/src/lib/sagejs/module.js",
  ]) {
    assert.equal(nativeLogicalSourceKey(filename), undefined);
  }
});

function runWithCache(cache, source, required = true) {
  return spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_REQUIRED: required ? "1" : "0",
      },
      input: source,
    },
  );
}

function compileIntoCache(cache, source) {
  return spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "native",
      "compile",
      source,
      "--cache-root",
      cache,
    ],
    { cwd: root, encoding: "utf8" },
  );
}

test("fresh native artifacts reload immediately under strict ABI checks", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fresh-native-abi-"));
  try {
    const sources = [
      "src/lib/sagejs/kernels/polynomial/packed_prime_field.py",
      "src/lib/sagejs/kernels/matrix/dense_prime_field.py",
    ];
    for (const source of sources) {
      const compiled = compileIntoCache(temporary, source);
      assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    }
    const index = JSON.parse(readFileSync(join(temporary, "index.json")));
    const records = Object.values(index.sources);
    assert.equal(records.length, sources.length);
    for (const record of records)
      assert.equal(record.nativeAbi, NATIVE_ABI_VERSION);

    const program = [
      "from sagejs.native import is_compiled",
      "from sagejs.kernels.polynomial.packed_prime_field import packed_prime_field_polynomial_evaluate",
      "from sagejs.kernels.matrix.dense_prime_field import dense_prime_field_matrix_add",
      "print(is_compiled(packed_prime_field_polynomial_evaluate))",
      "print(is_compiled(dense_prime_field_matrix_add))",
      "",
    ].join("\n");
    const loaded = runWithCache(temporary, program);
    assert.equal(loaded.status, 0, loaded.stdout + loaded.stderr);
    assert.equal(loaded.stdout.trim(), "True\nTrue");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("all production native kernels are published and autoloadable", () => {
  const manifest = JSON.parse(readFileSync(
    join(root, "architecture", "native-kernels.json"),
    "utf8",
  ));
  const indexText = readFileSync(join(published, "index.json"), "utf8");
  const index = JSON.parse(indexText);
  assert.equal(index.schema, "sagejs.native-cache/v3");
  assert.deepEqual(
    Object.keys(index).sort(),
    ["logicalSources", "schema"],
    "the published index must contain logical source identities only",
  );
  assert.ok(
    !indexText.includes(root),
    "the published index must not disclose its build checkout",
  );
  assert.equal(NATIVE_KERNEL_ABI_VERSION, NATIVE_ABI_VERSION);
  const production = manifest.kernels.filter((kernel) =>
    kernel.id.endsWith("-production"),
  );
  assert.ok(production.length > 0);
  for (const kernel of production) {
    assert.match(kernel.source, /^src\/lib\//);
    const sourceKey = kernel.source.slice("src/lib/".length);
    assert.match(
      sourceKey,
      /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/,
      "production source identities must be portable relative paths",
    );
    const record = index.logicalSources[sourceKey];
    assert.deepEqual(
      Object.keys(record ?? {}).sort(),
      ["cacheKey", "foreignDeclarations", "nativeAbi", "sourceHash"],
      "published kernel records must contain compatibility identities only",
    );
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

  // Exercise every declared production source, rather than a representative
  // subset under `sagejs.kernels`.  This catches drift between the compiler's
  // `src/lib`-relative source keys and runtime package paths.
  const imports = [];
  const checks = [];
  for (const [kernelIndex, kernel] of production.entries()) {
    const module = kernel.source
      .slice("src/lib/".length, -".py".length)
      .replaceAll("/", ".");
    for (const [functionIndex, name] of kernel.functions.entries()) {
      const alias = `_native_${kernelIndex}_${functionIndex}`;
      imports.push(`from ${module} import ${name} as ${alias}`);
      checks.push(`assert ${alias}.nativeAvailable`);
    }
  }
  const program = [...imports, ...checks, 'print("all-production-native")', ""]
    .join("\n");
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_NATIVE_CACHE_DIR: published,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
      input: program,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "all-production-native");
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
