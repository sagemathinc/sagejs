#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { bootstrapBuildPlan } = require("../scripts/bootstrap.cjs");

const root = join(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-fflas-public-"));
  try {
    const script = join(directory, "test.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("public dense small-prime matrices select FFLAS without changing semantics", {
  skip: process.platform === "win32",
}, () => {
  const output = runSage(String.raw`
field = GF(97)
left = matrix(field, 40, 40, [(37*k + 19) % 97 for k in range(1600)])
right = matrix(field, 40, 40, [(53*k + 11) % 97 for k in range(1600)])
product = left * right
assert product.dimensions() == (40, 40)
for row, column in [(0, 0), (17, 23), (39, 39)]:
    assert product[row, column] == sum(
        left[row, k] * right[k, column] for k in range(40)
    )

entries = [(29*k*k + 17*k + 3) % 97 for k in range(1760)]
fflas_rref = matrix(field, 40, 44, entries).rref(algorithm='fflas')
flint_rref = matrix(field, 40, 44, entries).rref(algorithm='flint')
assert fflas_rref == flint_rref
assert fflas_rref.rank() == flint_rref.rank()

assert matrix(field, 40, 44, entries).rank(algorithm='fflas') == matrix(
    field, 40, 44, entries
).rank(algorithm='flint')
kernel_source = matrix(field, 40, 44, entries)
kernel = kernel_source.right_kernel_matrix()
assert kernel.dimensions() == (44 - kernel_source.rank(), 44)
assert kernel == kernel.rref()
assert kernel_source * kernel.transpose() == zero_matrix(
    field, kernel_source.nrows(), kernel.nrows()
)
rank_entries = [(31*k*k + 23*k + 7) % 97 for k in range(64*68)]
assert matrix(field, 64, 68, rank_entries).rank() == matrix(
    field, 64, 68, rank_entries
).rank(algorithm='flint')

# Below the measured crossover, production deliberately retains FLINT.
small = matrix(field, 8, 8, range(64))
small * small
small.rank()
small.right_kernel_matrix()

medium_prime = matrix(GF(257), 24, 28, range(24*28))
medium_prime_kernel = medium_prime.right_kernel_matrix()
assert medium_prime * medium_prime_kernel.transpose() == zero_matrix(
    GF(257), 24, medium_prime_kernel.nrows()
)

# Byte-sized prime fields use packed Modular<float>; general word primes use
# generated nmod_mat resources. Modular<double> remains a tested explicit
# adapter, but exact representation alone does not make conversion competitive.
for prime in [7, 97, 251]:
    packed = matrix(GF(prime), 2, 2, [1,2,3,4])
    assert packed._has_packed_prime_storage()
    assert not packed._has_nmod_matrix_resource()
for prime in [257, 4093, 4099, 65537, 94906249, 94906297]:
    resource = matrix(GF(prime), 2, 2, [1,2,3,4])
    assert resource._has_nmod_matrix_resource()
    assert not resource._has_packed_prime_storage()

wide_entries = []
wide_state = 20260812
for _index in range(160 * 160):
    wide_state = (
        wide_state * 6364136223846793005 + 1442695040888963407
    ) % 18446744073709551616
    wide_entries.append(wide_state % 65537)
wide = matrix(GF(65537), 160, wide_entries)
wide_product = wide * wide
for row, column in [(0, 0), (79, 113), (159, 159)]:
    assert wide_product[row, column] == sum(
        wide[row, k] * wide[k, column] for k in range(160)
    )
assert wide.rank() == wide.rank(algorithm='flint')
assert wide.rref() == wide.rref(algorithm='flint')

for source in [matrix(QQ, 2), matrix(ZZ, 2)]:
    try:
        source.rref(algorithm='fflas')
        raise AssertionError('FFLAS accepted a non-prime-field matrix')
    except ValueError:
        pass
    try:
        source.rank(algorithm='fflas')
        raise AssertionError('FFLAS accepted a non-prime-field matrix rank')
    except ValueError:
        pass
try:
    matrix(GF(257), 2).rref(algorithm='fflas')
    raise AssertionError('FFLAS accepted an unsupported modulus')
except ValueError:
    pass
try:
    matrix(GF(257), 2).rank(algorithm='fflas')
    raise AssertionError('FFLAS rank accepted an unsupported modulus')
except ValueError:
    pass
print('fflas public semantics ok')
`, { SAGEJS_NATIVE_TRACE: "1" });
  assert.match(output, /Matrix\.multiply GF\(97\) 40x40 -> declared-fflas-isolated/);
  assert.match(output, /Matrix\.rref GF\(97\) 40x44 -> declared-fflas-isolated/);
  assert.match(output, /Matrix\.rank GF\(97\) 64x68 -> declared-fflas-isolated/);
  assert.match(output, /Matrix\.right_kernel GF\(97\) 40x44 -> declared-fflas-isolated/);
  assert.match(output, /Matrix\.multiply GF\(97\) 8x8 -> declared-flint-isolated/);
  assert.match(output, /Matrix\.rank GF\(97\) 8x8 -> declared-flint-isolated/);
  assert.match(output, /Matrix\.right_kernel GF\(97\) 8x8 -> declared-flint-isolated/);
  assert.match(output, /Matrix\.right_kernel GF\(257\) 24x28 -> generated-flint-resource/);
  assert.match(output, /Matrix\.multiply GF\(65537\) 160x160 -> generated-flint-resource/);
  assert.match(output, /Matrix\.rank GF\(65537\) 160x160 -> generated-flint-resource/);
  assert.match(output, /Matrix\.rref GF\(65537\) 160x160 -> generated-flint-resource/);
  assert.match(output, /fflas public semantics ok/);
});

test("explicit FFLAS selection reports host capability failures", {
  skip: process.platform !== "win32",
}, () => {
  const output = runSage(String.raw`
try:
    matrix(GF(97), 40).rref(algorithm='fflas')
    raise AssertionError('unavailable FFLAS backend unexpectedly ran')
except ValueError as error:
    assert 'available backend' in str(error)
try:
    matrix(GF(97), 64).rank(algorithm='fflas')
    raise AssertionError('unavailable FFLAS rank backend unexpectedly ran')
except ValueError as error:
    assert 'available backend' in str(error)
source = matrix(GF(97), 40, 44, range(40*44))
kernel = source.right_kernel_matrix()
assert source * kernel.transpose() == zero_matrix(GF(97), 40, kernel.nrows())
print('fflas capability fallback ok')
`, { SAGEJS_NATIVE_TRACE: "1" });
  assert.match(output, /fflas capability fallback ok/);
  assert.match(output, /Matrix\.right_kernel GF\(97\) 40x44 -> declared-flint-isolated/);
});

test("dynamic adapters preserve public FFLAS semantics when native kernels are disabled", {
  skip: process.platform === "win32",
}, () => {
  const output = runSage(String.raw`
field = GF(97)
left = matrix(field, 40, 40, [(37*k + 19) % 97 for k in range(1600)])
right = matrix(field, 40, 40, [(53*k + 11) % 97 for k in range(1600)])
product = left * right
for row, column in [(0, 0), (17, 23), (39, 39)]:
    assert product[row, column] == sum(
        left[row, k] * right[k, column] for k in range(40)
    )

entries = [(29*k*k + 17*k + 3) % 97 for k in range(1760)]
fflas_rref = matrix(field, 40, 44, entries).rref(algorithm='fflas')
flint_rref = matrix(field, 40, 44, entries).rref(algorithm='flint')
assert fflas_rref == flint_rref
assert fflas_rref.rank() == flint_rref.rank()
rank_entries = [(31*k*k + 23*k + 7) % 97 for k in range(64*68)]
assert matrix(field, 64, 68, rank_entries).rank() == matrix(
    field, 64, 68, rank_entries
).rank(algorithm='flint')
kernel_source = matrix(field, 40, 44, entries)
kernel = kernel_source.right_kernel_matrix()
assert kernel == kernel.rref()
assert kernel_source * kernel.transpose() == zero_matrix(
    field, kernel_source.nrows(), kernel.nrows()
)
print('fflas dynamic adapter semantics ok')
`, {
    SAGEJS_NATIVE_DISABLE: "1",
    SAGEJS_NATIVE_TRACE: "1",
  });
  assert.match(output, /Matrix\.multiply GF\(97\) 40x40 -> declared-fflas-adapter/);
  assert.match(output, /Matrix\.rref GF\(97\) 40x44 -> declared-fflas-adapter/);
  assert.match(output, /Matrix\.rank GF\(97\) 64x68 -> declared-fflas-adapter/);
  assert.match(output, /Matrix\.right_kernel GF\(97\) 40x44 -> declared-fflas-adapter/);
  assert.match(output, /fflas dynamic adapter semantics ok/);
});

test("clean native and SEA build paths establish optional FFLAS first", () => {
  const commands = bootstrapBuildPlan().map(({ command, arguments: args }) =>
    `${command} ${args.join(" ")}`
  );
  assert.deepEqual(commands, [
    "node scripts/build.cjs --without-production-native-kernels",
    "pnpm --dir packages/flint build",
    "pnpm --dir packages/fflas build",
    "pnpm --dir packages/graph build",
    "pnpm --dir packages/m4ri build",
    "node scripts/build-production-native-kernels.cjs",
  ]);

  const buildSource = readFileSync(join(root, "scripts", "build.cjs"), "utf8");
  assert.match(
    buildSource,
    /existsSync\(generatedFlintAdapter\)\s*&&\s*existsSync\(generatedFflasAdapter\)/,
  );

  const sea = readFileSync(join(root, "scripts", "build-sea.cjs"), "utf8");
  assert.match(sea, /native\/sagejs_fflas_ffi\.node/);
  assert.match(sea, /native\/sagejs_fflas_ffi_manifest\.json/);
  const resources = readFileSync(join(root, "tools", "resources.ts"), "utf8");
  assert.match(resources, /name === "@sagemath\/sagejs-fflas"/);
  assert.match(resources, /FFLAS_FFI_MANIFEST_ASSET/);

  const kernel = readFileSync(join(
    root,
    "src/lib/sagejs/kernels/matrix/dense_prime_field_fflas.py",
  ), "utf8");
  assert.match(kernel, /if modulus < 256:/);
  assert.match(kernel, /modular_float_mul/);
  assert.match(kernel, /modular_double_mul/);

  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
  assert.doesNotMatch(scripts["build:sea:python"], /packages\/fflas/);
  assert.match(scripts["build:sea:math"], /packages\/flint build.*packages\/fflas build.*packages\/graph build.*pnpm run build/);
});
