// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compile } = require("@sagemath/sagejs/native");
const flint = require("../packages/flint");
const { removeLoadedNativeCache } = require("./helpers/native-cache-cleanup.cjs");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "matrix",
  "word_prime_krylov.py",
);

function workspaceLength(dimension) {
  return 2 * dimension * dimension + 4 * dimension + 1;
}

function multiplicationMatrix(defining, beta, modulus) {
  const degree = defining.length - 1;
  const entries = Array(degree * degree).fill(0n);
  for (let column = 0; column < degree; column += 1) {
    const product = Array(2 * degree).fill(0n);
    for (let index = 0; index < degree; index += 1) {
      product[index + column] = beta[index] % modulus;
    }
    for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
      const leading = product[exponent] % modulus;
      for (let index = 0; index < degree; index += 1) {
        product[exponent - degree + index] =
          (product[exponent - degree + index] - leading * defining[index]) %
          modulus;
        if (product[exponent - degree + index] < 0n) {
          product[exponent - degree + index] += modulus;
        }
      }
    }
    for (let row = 0; row < degree; row += 1) {
      entries[row * degree + column] = product[row] % modulus;
    }
  }
  return entries;
}

function runSage(source, environment) {
  const result = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim().split("\n");
}

test("packed Krylov kernel matches FLINT word-prime minimal polynomials", async () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-word-prime-krylov-"));
  try {
    const compiled = await compile({ sourcePath, cacheRoot: cache });
    const kernel = require(compiled.modulePath);
    const declaration = compiled.ir.functions.find(
      (candidate) => candidate.name === "word_prime_krylov_minimal_polynomial",
    );
    assert.equal(declaration.kernelKind, "prime-field-source");
    assert.deepEqual(declaration.dependencies, []);
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
    assert.match(core, /word_prime_krylov_minimal_polynomial/);

    let state = 1729n;
    for (const modulus of [2n, 3n, 97n, 65537n, 4294967291n]) {
      for (let degree = 1; degree <= 12; degree += 1) {
        for (let trial = 0; trial < 4; trial += 1) {
          const defining = [];
          const beta = [];
          for (let index = 0; index < degree; index += 1) {
            state = (1664525n * state + 1013904223n) & 0xffffffffn;
            defining.push(state % modulus);
            state = (1664525n * state + 1013904223n) & 0xffffffffn;
            beta.push(state % modulus);
          }
          defining.push(1n);
          const entries = multiplicationMatrix(defining, beta, modulus);
          const expected = flint.matrixMinpoly(
            flint.nmodMatrix(degree, degree, entries, modulus),
          );
          const matrix = kernel.createUInt64Buffer(entries);
          const output = kernel.createUInt64Buffer(degree + 1);
          const workspace = kernel.createUInt64Buffer(workspaceLength(degree));
          const answerDegree = Number(
            kernel.word_prime_krylov_minimal_polynomial(
              output,
              matrix,
              workspace,
              BigInt(degree),
              modulus,
            ),
          );
          assert.deepEqual(
            Array.from(output).slice(0, answerDegree + 1),
            expected,
          );
        }
      }
    }

    const matrix = kernel.createUInt64Buffer([0n, 95n, 1n, 0n]);
    const output = kernel.createUInt64Buffer([91n, 91n, 91n]);
    assert.throws(
      () => kernel.word_prime_krylov_minimal_polynomial(
        output,
        matrix,
        kernel.createUInt64Buffer(16),
        2n,
        97n,
      ),
      /workspace has the wrong shape/,
    );
    assert.deepEqual(Array.from(output), [91n, 91n, 91n]);
  } finally {
    removeLoadedNativeCache(cache);
  }
});

test("packed Krylov source has native, JavaScript, and CPython paths", () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-word-prime-krylov-paths-"));
  try {
    const explanation = spawnSync(
      process.execPath,
      [
        sagejs,
        "native",
        "explain",
        sourcePath,
        "--function",
        "word_prime_krylov_minimal_polynomial",
      ],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    if (explanation.error) throw explanation.error;
    assert.equal(explanation.status, 0, explanation.stderr || explanation.stdout);
    assert.match(explanation.stdout, /kernel: prime-field-source/);
    assert.match(explanation.stdout, /host-isolated core: yes/);
    assert.match(explanation.stdout, /0 callbacks inside core/);

    const compilation = spawnSync(
      process.execPath,
      [sagejs, "native", "compile", sourcePath, "--cache-root", cache],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    if (compilation.error) throw compilation.error;
    assert.equal(compilation.status, 0, compilation.stderr || compilation.stdout);

    const witness = String.raw`
import sagejs.runtime as runtime
from sagejs.kernels.matrix.word_prime_krylov import (
    word_prime_krylov_minimal_polynomial,
    word_prime_krylov_workspace_length,
)
from sagejs.native import is_compiled

compiled = is_compiled(word_prime_krylov_minimal_polynomial)
if compiled:
    matrix = runtime.uint64_buffer([0, 95, 1, 0])
    output = runtime.uint64_buffer(3)
    workspace = runtime.uint64_buffer(word_prime_krylov_workspace_length(2))
    modulus = runtime.integer_bigint(97)
else:
    matrix = [0, 95, 1, 0]
    output = [0, 0, 0]
    workspace = [0] * word_prime_krylov_workspace_length(2)
    modulus = 97
degree = word_prime_krylov_minimal_polynomial(output, matrix, workspace, 2, modulus)
print(compiled)
print((degree, list(output)))
`;
    const native = runSage(witness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: "1",
    });
    const dynamic = runSage(witness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_DISABLE: "1",
    });
    assert.equal(native[0], "True");
    assert.equal(dynamic[0], "False");
    assert.equal(native[1], "(2, [2, 0, 1])");
    assert.equal(native[1], dynamic[1]);

    const pythonProgram = String.raw`
import sys
from fractions import Fraction
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.kernels.matrix.word_prime_krylov import (
    word_prime_krylov_minimal_polynomial,
    word_prime_krylov_workspace_length,
)

def rational_relation(rows):
    n = len(rows)
    vector = [Fraction(1)] + [Fraction(0)] * (n - 1)
    basis = []
    for exponent in range(n + 1):
        reduced = list(vector)
        relation = [Fraction(0)] * exponent + [Fraction(1)]
        for pivot, basis_vector, basis_relation in basis:
            multiplier = reduced[pivot]
            reduced = [a - multiplier*b for a, b in zip(reduced, basis_vector)]
            relation = [
                relation[i] - multiplier*(basis_relation[i] if i < len(basis_relation) else 0)
                for i in range(exponent + 1)
            ]
        try:
            pivot = next(i for i, value in enumerate(reduced) if value)
        except StopIteration:
            return relation
        inverse = 1 / reduced[pivot]
        basis.append((pivot, [value*inverse for value in reduced], [value*inverse for value in relation]))
        vector = [sum(rows[i][j]*vector[j] for j in range(n)) for i in range(n)]

cases = [
    [[2, 0], [0, 3]],
    [[0, -2], [1, 0]],
    [[1, 2, 0], [0, 1, 0], [0, 0, 7]],
    [[0, 0, -3, 1], [1, 0, 2, 0], [0, 1, 0, 1], [0, 0, 1, 0]],
]
for rows in cases:
    relation = rational_relation(rows)
    assert all(value.denominator == 1 for value in relation)
    for prime in [97, 65537]:
        n = len(rows)
        packed = [value % prime for row in rows for value in row]
        output = [0] * (n + 1)
        workspace = [0] * word_prime_krylov_workspace_length(n)
        degree = word_prime_krylov_minimal_polynomial(output, packed, workspace, n, prime)
        assert output[:degree + 1] == [int(value) % prime for value in relation]
print("cpython-rational-differential-ok")
`;
    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpython = spawnSync(python, ["-I", "-c", pythonProgram], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
    });
    if (cpython.error) throw cpython.error;
    assert.equal(cpython.status, 0, cpython.stderr || cpython.stdout);
    assert.equal(cpython.stdout.trim(), "cpython-rational-differential-ok");
  } finally {
    removeLoadedNativeCache(cache);
  }
});
