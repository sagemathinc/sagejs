// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(
  root,
  "src/lib/sagejs/kernels/matrix/rank_four_lattice.py",
);
const fixturePath = resolve(
  root,
  "test/fixtures/brandt-rank-four-magma-2.18-5.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function packet() {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const bases = [];
  const expectedHnfs = [];
  for (const ideal of fixture.ideals) {
    const original = ideal.basis.map((row) => [...row]);
    const equivalent = original.map((row) => [...row]);
    for (let column = 0; column < 4; column += 1) {
      equivalent[1][column] += equivalent[0][column];
    }
    for (const basis of [original, equivalent]) {
      bases.push(...basis.flat().map(BigInt));
      expectedHnfs.push(...ideal.row_hnf.flat().map(BigInt));
    }
  }
  return {
    fixture,
    bases,
    expectedHnfs,
    expectedClasses: [0n, 0n, 1n, 1n, 2n, 2n],
    expectedIncidence: [
      1n, 0n, 0n,
      1n, 0n, 0n,
      0n, 1n, 0n,
      0n, 1n, 0n,
      0n, 0n, 1n,
      0n, 0n, 1n,
    ],
  };
}

function invoke(module, implementation, {
  expectedHnfs = packet().expectedHnfs,
  classCapacity = 3n,
  maximumBits = 16n,
  memoryLimit = 1_048_576n,
  sentinels = false,
} = {}) {
  const values = packet();
  const publishedHnfs = module.createUInt64Buffer(
    sentinels ? Array(values.expectedHnfs.length).fill(91n) : values.expectedHnfs.length,
  );
  const publishedClasses = module.createUInt64Buffer(
    sentinels ? Array(6).fill(92n) : 6,
  );
  const publishedIncidence = module.createUInt64Buffer(
    sentinels ? Array(Number(6n * classCapacity)).fill(93n) : Number(6n * classCapacity),
  );
  const result = implementation(
    module.createIntegerBuffer(values.bases.length, 8, values.bases),
    module.createUInt64Buffer(expectedHnfs),
    publishedHnfs,
    publishedClasses,
    publishedIncidence,
    6n,
    classCapacity,
    maximumBits,
    memoryLimit,
    1_048_576n,
  );
  return {
    result,
    hnfs: Array.from(publishedHnfs),
    classes: Array.from(publishedClasses),
    incidence: Array.from(publishedIncidence),
  };
}

function cArray(values) {
  return values.map((value) => String(value)).join(", ");
}

function driverSource(values) {
  const sizes = values.bases.map((value) => value === 0n ? 0 : 1);
  return String.raw`
#include <assert.h>
#include <stdint.h>
#include <string.h>
#include <gmp.h>
#include "kernel_core.h"

int main(void)
{
    int32_t basis_sizes[96] = { ${cArray(sizes)} };
    uint64_t basis_limbs[96] = { ${cArray(values.bases)} };
    uint64_t expected_values[96] = { ${cArray(values.expectedHnfs)} };
    uint64_t output_hnfs[96] = {0};
    uint64_t output_classes[6] = {0};
    uint64_t output_incidence[18] = {0};
    sagejs_integer_buffer bases = { basis_sizes, basis_limbs, 96, 1 };
    sagejs_uint64_buffer expected = { expected_values, 96 };
    sagejs_uint64_buffer hnfs = { output_hnfs, 96 };
    sagejs_uint64_buffer classes = { output_classes, 6 };
    sagejs_uint64_buffer incidence = { output_incidence, 18 };
    const uint64_t wanted_classes[6] = { 0, 0, 1, 1, 2, 2 };
    const uint64_t wanted_incidence[18] = {
        1,0,0, 1,0,0, 0,1,0, 0,1,0, 0,0,1, 0,0,1
    };
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    mpz_t result;
    mpz_init(result);
    for (unsigned round = 0; round < 100; round += 1)
    {
        memset(output_hnfs, 0, sizeof(output_hnfs));
        memset(output_classes, 0, sizeof(output_classes));
        memset(output_incidence, 0, sizeof(output_incidence));
        status.code = SAGEJS_NATIVE_OK;
        status.message = 0;
        assert(sagejs_kernel_rank_four_lattice_workspace(
            &status, result, bases, expected, hnfs, classes, incidence,
            6, 3, 16, 1048576, 1048576));
        assert(mpz_cmp_ui(result, 3) == 0);
        assert(memcmp(output_hnfs, expected_values, sizeof(output_hnfs)) == 0);
        assert(memcmp(output_classes, wanted_classes, sizeof(output_classes)) == 0);
        assert(memcmp(output_incidence, wanted_incidence, sizeof(output_incidence)) == 0);
    }
    for (unsigned index = 0; index < 96; index += 1) output_hnfs[index] = 91;
    for (unsigned index = 0; index < 6; index += 1) output_classes[index] = 92;
    for (unsigned index = 0; index < 18; index += 1) output_incidence[index] = 93;
    expected_values[0] = 99;
    assert(sagejs_kernel_rank_four_lattice_workspace(
        &status, result, bases, expected, hnfs, classes, incidence,
        6, 3, 16, 1048576, 1048576));
    assert(mpz_cmp_ui(result, 0) == 0);
    for (unsigned index = 0; index < 96; index += 1) assert(output_hnfs[index] == 91);
    for (unsigned index = 0; index < 6; index += 1) assert(output_classes[index] == 92);
    for (unsigned index = 0; index < 18; index += 1) assert(output_incidence[index] == 93);
    mpz_clear(result);
    return 0;
}
`;
}

test("Magma authenticates the independent Brandt rank-four fixture", () => {
  const values = packet();
  assert.equal(values.fixture.schema, "sagejs.brandt/rank-four-lattice-magma-v1");
  assert.equal(values.fixture.generated_with, "Magma V2.18-5");
  assert.deepEqual(values.fixture.parameters, {
    quaternion_discriminant: 37,
    eichler_level: 2,
    ideal_orientation: "left",
    ideal_class_count: 9,
    selected_class_indices: [1, 2, 3],
    basis_coordinates: "Eltseq in the ambient quaternion algebra basis",
    denominator_policy:
      "multiply each ideal basis by the LCM of all coordinate denominators",
    canonical_form: "Magma row HermiteForm over Integers()",
  });
  const generator = readFileSync(resolve(root, values.fixture.generator));
  const generatorOutput = readFileSync(
    resolve(root, values.fixture.generator_output),
  );
  assert.equal(sha256(generator), values.fixture.generator_sha256);
  assert.equal(sha256(generatorOutput), values.fixture.generator_output_sha256);
  assert.equal(values.bases.length, 96);
  assert.equal(values.expectedHnfs.length, 96);
});

test("rank-four state uses the generic resident exact ownership graph", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  assert.equal(ir.version, 38);
  const fn = ir.functions.find(
    (candidate) => candidate.name === "rank_four_lattice_workspace",
  );
  assert.ok(fn);
  assert.equal(fn.analysis.backend.kind, "gmp");
  assert.deepEqual(
    fn.analysis.liveExactWorkspace.scopes[0].children.map((child) => [
      child.owner,
      child.storage,
    ]),
    [
      ["source", "declared-owned-ffi-resource"],
      ["hnf", "declared-owned-ffi-resource"],
      ["transform", "declared-owned-ffi-resource"],
      ["canonical", "row-major-mpz-matrix"],
      ["classifications", "fixed-schema-record-vector"],
      ["classes", "bounded-open-addressed-map"],
      ["incidence", "append-only-row-major-sparse-mpz-rows"],
    ],
  );
  const core = generateHostCore(ir).source;
  const checkpoint = core.indexOf("sagejs_native_gmp_checkpoint_begin(");
  assert.ok(checkpoint > core.lastIndexOf("sagejs_fmpz_matrix_init(", checkpoint));
  assert.match(core, /sagejs_native_bounded_table/);
  assert.match(core, /sagejs_native_sparse_integer_rows/);
  assert.doesNotMatch(core, /PyObject|napi_/i);
});

test("Magma HNFs classify identically across JavaScript and native tiers", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-rank-four-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    const module = require(compiled.modulePath);
    const implementations = [
      module.rank_four_lattice_workspace,
      module.rank_four_lattice_workspace.javascript,
      module.rank_four_lattice_workspace.gmp,
      module.rank_four_lattice_workspace.tagged,
    ];
    for (const implementation of implementations) {
      const result = invoke(module, implementation);
      assert.equal(result.result, 3n);
      assert.deepEqual(result.hnfs, packet().expectedHnfs);
      assert.deepEqual(result.classes, packet().expectedClasses);
      assert.deepEqual(result.incidence, packet().expectedIncidence);

      const corrupt = [...packet().expectedHnfs];
      corrupt[0] += 1n;
      const rejected = invoke(module, implementation, {
        expectedHnfs: corrupt,
        sentinels: true,
      });
      assert.equal(rejected.result, 0n);
      assert.ok(rejected.hnfs.every((value) => value === 91n));
      assert.ok(rejected.classes.every((value) => value === 92n));
      assert.ok(rejected.incidence.every((value) => value === 93n));

      assert.throws(
        () => invoke(module, implementation, {
          classCapacity: 2n,
          sentinels: true,
        }),
        /capacity exceeded/,
      );
      assert.throws(
        () => invoke(module, implementation, { memoryLimit: 1n }),
        /memory limit exceeded/,
      );
      const unrepresentable = invoke(module, implementation, {
        maximumBits: 65n,
        sentinels: true,
      });
      assert.equal(unrepresentable.result, -1n);
      assert.ok(unrepresentable.hnfs.every((value) => value === 91n));
      assert.ok(unrepresentable.classes.every((value) => value === 92n));
      assert.ok(unrepresentable.incidence.every((value) => value === 93n));
    }
  } finally {
    // Windows keeps a loaded native DLL locked until this test process exits.
    // The CI runner owns and removes its temporary root after process teardown;
    // attempting to unlink the loaded module here can only fail with EPERM.
    if (process.platform !== "win32") {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  }
});

test("rank-four success and rejection cleanup is sanitizer-clean", {
  skip:
    process.platform !== "linux"
      ? "the direct static sanitizer harness uses the GNU/Linux archive toolchain"
      : false,
}, async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rank-four-asan-"));
  const prefix = resolve(
    process.env.SAGEJS_FLINT_PREFIX ||
      join(root, "packages", "flint", ".native", "prefix"),
  );
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "driver.c"), driverSource(packet()));
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const executable = join(temporary, "rank-four-sanitizer");
    const build = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
      ...sanitizerFlags,
      `-I${temporary}`,
      `-I${join(root, "packages", "flint", "include")}`,
      `-I${join(prefix, "include")}`,
      join(temporary, "kernel_core.c"), join(temporary, "driver.c"),
      "-Wl,--start-group",
      join(prefix, "lib", "libflint.a"),
      join(prefix, "lib", "libmpfr.a"),
      join(prefix, "lib", "libgmp.a"),
      join(prefix, "lib", "libopenblas.a"),
      "-Wl,--end-group", "-lm", "-lpthread", "-ldl", "-o", executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment({ strictStringChecks: true }),
      timeout: 120_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, {
      recursive: true,
      force: true,
      maxRetries: process.platform === "win32" ? 10 : 0,
      retryDelay: 100,
    });
  }
});

test("rank-four state executes in the isolated FLINT WASI core", async (context) => {
  let toolchain;
  try {
    toolchain = require(
      "../packages/wasm-toolchain/scripts/toolchain.cjs"
    ).resolveToolchain({ root });
  } catch {
    context.skip("a prepared FLINT WASI toolchain is not available");
    return;
  }
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rank-four-wasi-"));
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "driver.c"), driverSource(packet()));
    const libraries = toolchain.paths.libraries;
    const wasm = join(temporary, "rank-four.wasm");
    const build = spawnSync(toolchain.paths.clang, [
      "--target=wasm32-wasip1",
      `--sysroot=${toolchain.paths.sysroot}`,
      "-O2",
      `-I${temporary}`,
      `-I${join(root, "packages", "flint", "include")}`,
      `-I${join(libraries.flint.prefix, "include")}`,
      `-I${join(libraries.gmp.prefix, "include")}`,
      `-I${join(libraries.mpfr.prefix, "include")}`,
      join(temporary, "kernel_core.c"),
      join(temporary, "driver.c"),
      join(root, "packages", "flint-wasm", "src", "wasi-stubs.c"),
      `-L${join(libraries.flint.prefix, "lib")}`, "-lflint",
      `-L${join(libraries.mpfr.prefix, "lib")}`, "-lmpfr",
      `-L${join(libraries.gmp.prefix, "lib")}`, "-lgmp",
      "-lm", "-lwasi-emulated-signal", "-o", wasm,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const run = spawnSync(process.execPath, ["-e", String.raw`
const { readFileSync } = require("node:fs");
const { WASI } = require("node:wasi");
(async () => {
  const wasi = new WASI({ version: "preview1", args: [], env: {}, returnOnExit: true });
  const module = await WebAssembly.compile(readFileSync(process.argv[1]));
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  const status = wasi.start(instance);
  if (status !== 0) process.exitCode = status;
})().catch((error) => { console.error(error); process.exitCode = 1; });
`, wasm], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, {
      recursive: true,
      force: true,
      maxRetries: process.platform === "win32" ? 10 : 0,
      retryDelay: 100,
    });
  }
});
