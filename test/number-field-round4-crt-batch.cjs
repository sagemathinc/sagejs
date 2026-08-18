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
const packedRationalSourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "polynomial",
  "packed_rational.py",
);

function multiplicationMatrix(defining, beta) {
  const degree = defining.length - 1;
  const entries = Array(degree * degree).fill(0n);
  for (let column = 0; column < degree; column += 1) {
    const product = Array(2 * degree).fill(0n);
    for (let index = 0; index < degree; index += 1) {
      product[index + column] = beta[index];
    }
    for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
      const leading = product[exponent];
      for (let index = 0; index < degree; index += 1) {
        product[exponent - degree + index] -= leading * defining[index];
      }
    }
    for (let row = 0; row < degree; row += 1) {
      entries[row * degree + column] = product[row];
    }
  }
  return entries;
}

function inverseMod(value, modulus) {
  let oldRemainder = modulus;
  let remainder = value % modulus;
  let oldCoefficient = 0n;
  let coefficient = 1n;
  while (remainder !== 0n) {
    const quotient = oldRemainder / remainder;
    [oldRemainder, remainder] = [remainder, oldRemainder % remainder];
    [oldCoefficient, coefficient] = [
      coefficient,
      (oldCoefficient - quotient * coefficient) % modulus,
    ];
  }
  return oldCoefficient < 0n ? oldCoefficient + modulus : oldCoefficient;
}

function extendCrt(residues, currentModulus, targets, prime) {
  const inverse = inverseMod(currentModulus, prime);
  return residues.map((residue, index) => {
    const correction =
      (((targets[index] - (residue % prime)) % prime) + prime) % prime;
    return residue + currentModulus * ((correction * inverse) % prime);
  });
}

test("exact-matrix Krylov batches agree with independent single-prime calls", async () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-round4-crt-batch-"));
  try {
    const compiled = await compile({ sourcePath, cacheRoot: cache });
    const kernel = require(compiled.modulePath);
    const batch = kernel.integer_matrix_word_prime_minimal_polynomial_batch;
    const annihilates =
      kernel.integer_matrix_polynomial_annihilates_first_coordinate;
    const single = kernel.word_prime_krylov_minimal_polynomial;
    const declaration = compiled.ir.functions.find(
      (candidate) =>
        candidate.name === "integer_matrix_word_prime_minimal_polynomial_batch",
    );
    assert.equal(declaration.kernelKind, "integer");
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
    assert.equal(
      annihilates(
        annihilates.packIntegerBuffer([0n, -2n, 1n, 0n]),
        annihilates.packIntegerBuffer([2n, 0n, 1n]),
        annihilates.createIntegerBuffer(4, 8),
        2n,
        3n,
      ),
      1n,
    );
    assert.equal(
      annihilates(
        annihilates.packIntegerBuffer([0n, -2n, 1n, 0n]),
        annihilates.packIntegerBuffer([3n, 0n, 1n]),
        annihilates.createIntegerBuffer(4, 8),
        2n,
        3n,
      ),
      0n,
    );

    const primes = [3n, 5n, 97n, 65537n, 1073741789n];
    let state = 1729n;
    for (let degree = 1; degree <= 9; degree += 1) {
      for (let trial = 0; trial < 3; trial += 1) {
        const defining = [];
        const beta = [];
        for (let index = 0; index < degree; index += 1) {
          state = (6364136223846793005n * state + 1442695040888963407n) &
            ((1n << 256n) - 1n);
          defining.push((state >> 17n) * (index % 2 ? -1n : 1n));
          state = (6364136223846793005n * state + 1442695040888963407n) &
            ((1n << 256n) - 1n);
          beta.push((state >> 29n) * (index % 3 ? 1n : -1n));
        }
        defining.push(1n);
        const entries = multiplicationMatrix(defining, beta);
        const degrees = batch.createUInt64Buffer(primes.length);
        const coefficients = batch.createUInt64Buffer(
          primes.length * (degree + 1),
        );
        const workspace = batch.createUInt64Buffer(
          3 * degree * degree + 4 * degree + 1,
        );
        const crtDegree = batch.createUInt64Buffer(1);
        const crtState = batch.createIntegerBuffer(degree + 2, 8);
        const batchState = batch.createIntegerBuffer(degree + 2, 8);
        const batchMatrix = batch.createIntegerBuffer(degree * degree, 8);
        const completed = batch(
          degrees,
          coefficients,
          crtDegree,
          crtState,
          batchState,
          batchMatrix,
          batch.packIntegerBuffer(entries),
          batch.createUInt64Buffer(primes),
          workspace,
          BigInt(degree),
          BigInt(primes.length),
        );
        assert.equal(completed, BigInt(primes.length));

        let oracleDegree = 0;
        let oracleModulus = 1n;
        let oracleResidues = [];
        for (let primeIndex = 0; primeIndex < primes.length; primeIndex += 1) {
          const prime = primes[primeIndex];
          const reduced = entries.map((value) => {
            const residue = value % prime;
            return residue < 0n ? residue + prime : residue;
          });
          const expected = single.createUInt64Buffer(degree + 1);
          const expectedWorkspace = single.createUInt64Buffer(
            2 * degree * degree + 4 * degree + 1,
          );
          const expectedDegree = single(
            expected,
            single.createUInt64Buffer(reduced),
            expectedWorkspace,
            BigInt(degree),
            prime,
          );
          const actualDegree = degrees[primeIndex];
          assert.equal(actualDegree, expectedDegree);
          const offset = primeIndex * (degree + 1);
          assert.deepEqual(
            Array.from(coefficients).slice(offset, offset + Number(actualDegree) + 1),
            Array.from(expected).slice(0, Number(expectedDegree) + 1),
          );
          assert.deepEqual(
            Array.from(coefficients).slice(offset, offset + Number(actualDegree) + 1),
            flint.matrixMinpoly(
              flint.nmodMatrix(degree, degree, reduced, prime),
            ),
          );
          const targets = Array.from(coefficients).slice(
            offset,
            offset + Number(actualDegree) + 1,
          );
          if (Number(actualDegree) > oracleDegree) {
            oracleDegree = Number(actualDegree);
            oracleModulus = prime;
            oracleResidues = targets;
          } else if (Number(actualDegree) === oracleDegree) {
            oracleResidues = extendCrt(
              oracleResidues,
              oracleModulus,
              targets,
              prime,
            );
            oracleModulus *= prime;
          }
        }
        assert.equal(crtDegree[0], BigInt(oracleDegree));
        assert.deepEqual(
          crtState.toArray().slice(0, oracleDegree + 2),
          [oracleModulus, ...oracleResidues],
        );
      }
    }

    const rejected = batch(
      batch.createUInt64Buffer(1),
      batch.createUInt64Buffer(3),
      batch.createUInt64Buffer(1),
      batch.createIntegerBuffer(4, 8),
      batch.createIntegerBuffer(4, 8),
      batch.createIntegerBuffer(4, 8),
      batch.packIntegerBuffer([1n, 0n, 0n, 1n]),
      batch.createUInt64Buffer([1n << 30n]),
      batch.createUInt64Buffer(21),
      2n,
      1n,
    );
    assert.equal(rejected, 0n);
  } finally {
    removeLoadedNativeCache(cache);
  }
});

test("batched CRT reconstruction has native, JavaScript, and CPython oracles", async () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-round4-crt-paths-"));
  try {
    await compile({ sourcePath, cacheRoot: cache });
    await compile({ sourcePath: packedRationalSourcePath, cacheRoot: cache });
    const sageProgram = String.raw`
from sagejs.native import is_compiled
import sagejs.number_fields.round4 as round4
from sagejs.kernels.matrix.word_prime_krylov import integer_matrix_word_prime_minimal_polynomial_batch
R = PolynomialRing(ZZ, 'x')
x = R.gen()
records = []
for polynomial in [x**2+x+1, x**3-x+1, x**4+x+1, x**5-x+1]:
    K = NumberField(polynomial, 'a')
    for beta in [K(2), K.gen() + 2, K.gen()**(K.degree()-1) - K.gen() + 3]:
        rows, denominator, row_bounds = round4._integer_multiplication_matrix_data(K, beta)
        assert denominator == 1
        certificate = {}
        characteristic, prime_count, modulus_bits, batch_calls, attempts, computed_primes = round4._batched_integer_field_element_characteristic_polynomial(rows, certificate)
        direct = [coefficient._numerator for coefficient in round4._element_characteristic_polynomial(K, beta)]
        assert characteristic == direct
        certificate['element'] = round4._packed_field_element_coordinates(K, beta)
        certificate['matrix_denominator'] = denominator
        round4._verify_round4_characteristic_certificate(K, certificate)
        certificate['minimal_polynomial'][0] += 1
        rejected = False
        try:
            round4._verify_round4_characteristic_certificate(K, certificate)
        except round4.Round4InvariantError:
            rejected = True
        certificate['minimal_polynomial'][0] -= 1
        assert rejected
        columns = []
        product = beta
        for column_index in range(K.degree()):
            column = list(product.list())
            column += [QQ(0) for _index in range(K.degree() - len(column))]
            columns.append(column)
            product *= K.gen()
        generic_rows = [
            [columns[column][row] for column in range(K.degree())]
            for row in range(K.degree())
        ]
        generic = list(matrix(QQ, generic_rows).charpoly().list())
        assert round4._element_characteristic_polynomial(K, beta) == generic
        assert round4._annihilates_first_coordinate(rows, characteristic)
        corrupted = list(characteristic)
        corrupted[0] += 1
        assert not round4._annihilates_first_coordinate(rows, corrupted)
        assert prime_count > 0 and modulus_bits > 0 and batch_calls > 0 and attempts > 0
        assert computed_primes >= prime_count
        records.append((K.degree(), len(characteristic)-1, batch_calls))
print(is_compiled(integer_matrix_word_prime_minimal_polynomial_batch))
print(len(records))
`;
    const native = spawnSync(process.execPath, [sagejs, "--python"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
      input: sageProgram,
      timeout: 120_000,
    });
    if (native.error) throw native.error;
    assert.equal(native.status, 0, native.stderr || native.stdout);
    assert.deepEqual(native.stdout.trim().split("\n"), ["True", "12"]);

    const pythonProgram = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.kernels.matrix.word_prime_krylov import (
    integer_matrix_polynomial_annihilates_first_coordinate,
    integer_matrix_word_prime_minimal_polynomial_batch,
    word_prime_krylov_batch_workspace_length,
    word_prime_krylov_minimal_polynomial,
    word_prime_krylov_workspace_length,
)
rows = [[0, -2], [1, 0]]
assert integer_matrix_polynomial_annihilates_first_coordinate(
    [value for row in rows for value in row], [2, 0, 1], [0] * 4, 2, 3,
) == 1
assert integer_matrix_polynomial_annihilates_first_coordinate(
    [value for row in rows for value in row], [3, 0, 1], [0] * 4, 2, 3,
) == 0
primes = [3, 5, 97, 65537]
degrees = [0] * len(primes)
coefficients = [0] * (len(primes) * 3)
workspace = [0] * word_prime_krylov_batch_workspace_length(2)
assert integer_matrix_word_prime_minimal_polynomial_batch(
    degrees, coefficients, [0], [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [value for row in rows for value in row],
    primes, workspace, 2, len(primes),
) == len(primes)
for prime_index, prime in enumerate(primes):
    output = [0, 0, 0]
    scratch = [0] * word_prime_krylov_workspace_length(2)
    reduced = [value % prime for row in rows for value in row]
    degree = word_prime_krylov_minimal_polynomial(output, reduced, scratch, 2, prime)
    offset = 3 * prime_index
    assert degrees[prime_index] == degree
    assert coefficients[offset:offset+degree+1] == output[:degree+1]
print('cpython-ok')
`;
    const python = spawnSync("python3", ["-c", pythonProgram], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
    });
    if (python.error) throw python.error;
    assert.equal(python.status, 0, python.stderr || python.stdout);
    assert.equal(python.stdout.trim(), "cpython-ok");
  } finally {
    removeLoadedNativeCache(cache);
  }
});
