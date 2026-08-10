#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
const sourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "dense_integer.py",
);
const flintSourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "dense_integer_flint.py",
);
const matrixSourcePath = join(root, "src", "baselib", "matrix.py");

function runSage(source, environment) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-dense-integer-script-"));
  try {
    const scriptPath = join(directory, "production.py");
    writeFileSync(scriptPath, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), scriptPath],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function randomExactEntries(length, seed) {
  const mask = (1n << 64n) - 1n;
  let state = BigInt(seed) & mask;
  const values = [];
  for (let index = 0; index < length; index += 1) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & mask;
    const magnitude = state << BigInt((index % 5) * 61);
    values.push(index % 3 === 0 ? -magnitude : magnitude);
  }
  return values;
}

const productionScript = String.raw`
large = 2**190
A = matrix(ZZ, 3, 3, [
    large + 1, -7, 3,
    5, large - 2, 11,
    -13, 17, 19,
])
B = matrix(ZZ, 3, 3, range(9))

assert A.list()[0] == large + 1
assert (A + B) - B == A
assert -(-A) == A
assert 3*A == A + A + A
assert A.transpose().transpose() == A
assert A.trace() == 2*large + 18
assert A.matrix_from_rows([2, 0]).dimensions() == (2, 3)
assert A.matrix_from_columns([2, 0]).dimensions() == (3, 2)
assert A.stack(B).dimensions() == (6, 3)
assert A.augment(B).dimensions() == (3, 6)

C = matrix(ZZ, 3, 3, [2, 4, 4, 6, 6, 12, 10, 4, 16])
assert C.det() == 48
assert C.rank() == 3
assert (C*C).list() == [68, 48, 120, 168, 108, 288, 204, 128, 344]
f = C.charpoly()
assert f(C).is_zero()
H, U = C.hermite_form(transformation=True)
assert U*C == H
D, L, R = C.smith_form()
assert L*C*R == D

wide = matrix(ZZ, 2, 4, [1, 2, 3, 4, 2, 4, 6, 8])
K = wide.right_kernel_matrix()
assert K.nrows() == 3
assert wide*K.transpose() == zero_matrix(ZZ, 2, 3)

mutable = matrix(ZZ, 2, 2, [1, 2, 3, 4])
mutable[0, 1] = -(2**320 + 9)
assert mutable[0, 1] == -(2**320 + 9)
immutable = mutable.__copy__()
immutable.set_immutable()
try:
    immutable[0, 0] = 7
    raise AssertionError('immutable mutation unexpectedly succeeded')
except ValueError:
    pass

identity = identity_matrix(ZZ, 3)
assert identity ** (2**256) == identity
assert identity._integer_capacity() == 1
random_value = random_matrix(ZZ, 40)
assert random_value.dimensions() == (40, 40)

try:
    A._native
    raise AssertionError('packed integer matrix exposed an N-API handle')
except RuntimeError:
    pass
print('dense-integer-independent-ok')
`;

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-dense-integer-"));
  try {
    const matrixSource = readFileSync(matrixSourcePath, "utf8");
    assert.match(
      matrixSource,
      /__import__\(\s*['"]sagejs\.kernels\.dense_integer['"]/,
    );
    assert.doesNotMatch(matrixSource, /\.zzMatrix\s*\(/);

    const compiled = await compile({ sourcePath, cacheRoot: temporary });
    const compiledFlint = await compile({
      sourcePath: flintSourcePath,
      cacheRoot: temporary,
    });
    const kernel = require(compiled.modulePath);
    const flintKernel = require(compiledFlint.modulePath);

    const exactFunctions = new Map(
      compiled.ir.functions.map((fn) => [fn.name, fn]),
    );
    assert.equal(
      exactFunctions.get("dense_integer_add").analysis.backend.kind,
      "tagged",
    );
    assert.equal(
      exactFunctions.get("dense_integer_add").analysis
        .taggedInteger.representation,
      "tagged-int64-gmp",
    );
    const randomFunction = exactFunctions.get("dense_integer_random_fill");
    assert.ok(
      randomFunction.body.some((operation) =>
        operation.kind === "uint64.binary" || operation.kind === "loop.range"
      ),
    );

    for (const name of [
      "flint_dense_integer_mul",
      "flint_dense_integer_determinant",
      "flint_dense_integer_charpoly",
      "flint_dense_integer_rank",
      "flint_dense_integer_hnf",
      "flint_dense_integer_hnf_transform",
      "flint_dense_integer_snf_transform",
      "flint_dense_integer_right_kernel",
    ]) {
      const fn = compiledFlint.ir.functions.find((candidate) =>
        candidate.name === name
      );
      assert.ok(fn, `missing ${name}`);
      assert.match(fn.foreignDependencies[0], /^flint@[a-f0-9]{64}:fmpz_mat_/);
      assert.equal(flintKernel[name].nativeAvailable, true);
    }

    const core = readFileSync(compiled.coreSourcePath, "utf8");
    const flintCore = readFileSync(compiledFlint.coreSourcePath, "utf8");
    for (const generated of [core, flintCore]) {
      assert.doesNotMatch(
        generated,
        /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/,
      );
    }
    assert.match(core, /sagejs_tagged_int/);
    assert.match(flintCore, /fmpz_mat_init/);
    assert.match(flintCore, /IntegerBuffer word capacity exceeded/);

    const values = randomExactEntries(12, 1729n);
    const left = kernel.dense_integer_add.packIntegerBuffer(values);
    const right = kernel.dense_integer_add.packIntegerBuffer(
      values.map((value) => -value),
    );
    const output = kernel.createIntegerBuffer(values.length, 8);
    assert.equal(kernel.dense_integer_add(output, left, right), true);
    assert.deepEqual(output.toArray(), values.map(() => 0n));
    assert.equal(kernel.dense_integer_equal(left, left), true);
    assert.equal(kernel.dense_integer_equal(left, right), false);

    const tooSmall = kernel.createIntegerBuffer(1, 1);
    assert.throws(
      () => kernel.dense_integer_scalar_multiply(
        tooSmall,
        kernel.dense_integer_add.packIntegerBuffer([1n << 127n]),
        1n << 127n,
      ),
      /IntegerBuffer word capacity exceeded/,
    );
    assert.deepEqual(tooSmall.toArray(), [0n]);

    const requiredEnvironment = {
      SAGEJS_NATIVE_CACHE_DIR: temporary,
      SAGEJS_NATIVE_REQUIRED: "1",
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
    };
    assert.equal(
      runSage(productionScript, requiredEnvironment),
      "dense-integer-independent-ok",
    );
    assert.equal(
      runSage(productionScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
      }),
      "dense-integer-independent-ok",
    );

    const trace = runSage(String.raw`
A = random_matrix(ZZ, 4)
A + A
A * A
A.det()
print('trace-ok')
`, {
      SAGEJS_NATIVE_CACHE_DIR: temporary,
      SAGEJS_NATIVE_REQUIRED: "1",
      SAGEJS_NATIVE_TRACE: "1",
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
    });
    assert.match(trace, /Matrix\.random_matrix ZZ 4x4 -> typed-python-isolated/);
    assert.match(trace, /Matrix\.add ZZ 4x4 -> typed-python-isolated/);
    assert.match(trace, /Matrix\.multiply ZZ 4x4 -> declared-flint-isolated/);
    assert.match(trace, /Matrix\.determinant ZZ 4x4 -> declared-flint-isolated/);
    assert.match(trace, /trace-ok/);

    console.log("dense integer matrix migration tests passed");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
