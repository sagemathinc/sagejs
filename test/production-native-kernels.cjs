"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
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
const {
  NATIVE_PACK_ABI_VERSION,
  PACK_FILENAME,
} = require("../tools/native-kernel/production-pack.cjs");

function copyPublishedPack(directory) {
  cpSync(join(published, "pack"), join(directory, "pack"), {
    recursive: true,
  });
}

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
  const index = JSON.parse(readFileSync(join(published, "index.json"), "utf8"));
  assert.equal(index.schema, "sagejs.native-cache/v4");
  assert.equal(index.complete, true);
  assert.equal(index.packs.length, 1);
  assert.equal(index.packs[0].packAbi, NATIVE_PACK_ABI_VERSION);
  assert.equal(NATIVE_KERNEL_ABI_VERSION, NATIVE_ABI_VERSION);
  const packPath = join(published, "pack", PACK_FILENAME);
  const packManifest = JSON.parse(readFileSync(
    join(published, "pack", "index.json"),
    "utf8",
  ));
  const pack = require(packPath);
  assert.equal(pack.__sagejsPackAbi, NATIVE_PACK_ABI_VERSION);
  assert.equal(pack.__sagejsPackIdentity, index.packs[0].packKey);
  assert.equal(packManifest.packKey, index.packs[0].packKey);
  assert.equal(packManifest.bytes, statSync(packPath).size);
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
    assert.match(record?.moduleIdentity ?? "", /^[a-f0-9]{16}$/);
    assert.equal(record?.packKey, index.packs[0].packKey);
    assert.ok(Array.isArray(record?.foreignDeclarations));
    assert.ok(existsSync(join(published, record.cacheKey, "index.cjs")));
    assert.equal(existsSync(join(
      published,
      record.cacheKey,
      "build",
      "Release",
      "sagejs_native_kernel.node",
    )), false, "production publishing must not copy standalone addons");
    const wrapper = require(join(published, record.cacheKey, "index.cjs"));
    const standalone = require(join(
      root,
      "packages",
      "flint",
      ".native",
      "production-kernels",
      record.cacheKey,
      "build",
      "Release",
      "sagejs_native_kernel.node",
    ));
    assert.deepEqual(
      Object.keys(pack[record.cacheKey]).sort(),
      Object.keys(standalone).sort(),
      `${kernel.id} packed and standalone exports differ`,
    );
    assert.equal(wrapper.cacheKey, record.cacheKey);
    assert.equal(wrapper.sourceHash, record.sourceHash);
    assert.equal(wrapper.nativeAbi, record.nativeAbi);
    assert.deepEqual(wrapper.foreignDeclarations, record.foreignDeclarations);
    for (const name of kernel.functions) {
      assert.equal(
        typeof wrapper[name],
        "function",
        `${kernel.id} did not publish ${name}`,
      );
    }
  }

  const imports = production.map((kernel, index) => {
    const moduleName = kernel.source
      .slice("src/lib/".length, -".py".length)
      .replaceAll("/", ".");
    return `from ${moduleName} import ${kernel.functions[0]} as kernel_${index}`;
  });
  const program = [
    ...imports,
    ...production.map((_kernel, index) =>
      `print(kernel_${index}.nativeAvailable)`,
    ),
    "",
  ].join("\n");
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
  assert.equal(
    result.stdout.trim(),
    production.map(() => "True").join("\n"),
  );
});

test("the production pack eliminates repeated static dependency payloads", () => {
  const report = JSON.parse(readFileSync(
    join(published, "size-report.json"),
    "utf8",
  ));
  assert.equal(report.schema, "sagejs.native-pack-size/v1");
  assert.ok(report.kernels > 0);
  assert.ok(report.standaloneBytes > report.packBytes);
  assert.equal(report.savedBytes, report.standaloneBytes - report.packBytes);
  assert.ok(
    report.packToStandaloneRatio < 0.25,
    `production native pack is unexpectedly large: ${JSON.stringify(report)}`,
  );
});

test("release packs exclude accelerators with native Windows capability gaps", () => {
  const manifest = JSON.parse(readFileSync(
    join(root, "architecture", "native-kernels.json"),
    "utf8",
  ));
  const index = JSON.parse(readFileSync(join(published, "index.json"), "utf8"));
  for (const id of [
    "dense-binary-m4ri-optional",
    "dense-prime-fflas-optional",
  ]) {
    const kernel = manifest.kernels.find((entry) => entry.id === id);
    assert.ok(kernel, `${id} is not classified`);
    assert.equal(
      index.logicalSources[kernel.source.slice("src/lib/".length)],
      undefined,
      `${id} must not enter an official release pack`,
    );
  }
  const sparse = manifest.kernels.find((entry) =>
    entry.id === "sparse-random-matrix-production"
  );
  assert.ok(sparse);
  assert.equal(sparse.functions.includes("sparse_random_m4ri"), false);
});

test("the field-analysis checker is current and required-autoloadable", () => {
  const source = "src/lib/sagejs/number_fields/field_analysis_resource.py";
  const functionNames = [
    "packed_field_analysis_fixed_points_are_valid",
    "packed_field_analysis_decode_integers",
    "packed_field_analysis_authenticate_projection",
  ];
  const manifest = JSON.parse(readFileSync(
    join(root, "architecture", "native-kernels.json"),
    "utf8",
  ));
  const kernel = manifest.kernels.find((entry) =>
    entry.id === "field-analysis-fixed-point-checker-production"
  );
  assert.equal(kernel?.source, source);
  assert.deepEqual(kernel?.functions, functionNames);

  const index = JSON.parse(readFileSync(join(published, "index.json"), "utf8"));
  const sourceKey = source.slice("src/lib/".length);
  const record = index.logicalSources[sourceKey];
  const expectedHash = createHash("sha256")
    .update(readFileSync(join(root, source)))
    .digest("hex");
  assert.equal(record?.sourceHash, expectedHash);

  const loaded = runWithCache(published, [
    "from sagejs.native import is_compiled",
    `from sagejs.number_fields.field_analysis_resource import ${functionNames.join(", ")}`,
    ...functionNames.flatMap((functionName) => [
      `print(is_compiled(${functionName}))`,
      `print(${functionName}.nativeAvailable)`,
    ]),
    "",
  ].join("\n"));
  assert.equal(loaded.status, 0, loaded.stdout + loaded.stderr);
  assert.equal(
    loaded.stdout.trim(),
    functionNames.flatMap(() => ["True", "True"]).join("\n"),
  );
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
    copyPublishedPack(temporary);
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
    copyPublishedPack(temporary);
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
