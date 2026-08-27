// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compile } = require("@sagemath/sagejs/native");
const { removeLoadedNativeCache } = require("./helpers/native-cache-cleanup.cjs");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "polynomial",
  "packed_rational.py",
);
const fieldAnalysisSourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "number_fields",
  "field_analysis_resource.py",
);

function gcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function oracle(left, right, defining) {
  const degree = defining.length;
  const values = Array(2 * degree - 1).fill(0n);
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      values[i + j] += left[i + 1] * right[j + 1];
    }
  }
  for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
    const leading = values[exponent];
    for (let index = 0; index < degree; index += 1) {
      values[exponent - degree + index] -= leading * defining[index];
    }
  }
  const denominator = left[0] * right[0];
  let content = denominator;
  for (let index = 0; index < degree; index += 1) {
    content = gcd(content, values[index]);
  }
  return [
    denominator / content,
    ...values.slice(0, degree).map((value) => value / content),
  ];
}

function orbitOracle(matrix, denominator, degree) {
  const numerators = [];
  const denominators = [];
  let vector = Array(degree).fill(0n);
  vector[0] = 1n;
  let powerDenominator = 1n;
  for (let exponent = 0; exponent < degree; exponent += 1) {
    let content = powerDenominator;
    for (const value of vector) content = gcd(content, value);
    powerDenominator /= content;
    vector = vector.map((value) => value / content);
    denominators.push(powerDenominator);
    numerators.push(...vector);
    if (exponent + 1 < degree) {
      vector = Array.from({ length: degree }, (_unused, row) => {
        let value = 0n;
        for (let column = 0; column < degree; column += 1) {
          value += matrix[row * degree + column] * vector[column];
        }
        return value;
      });
      powerDenominator *= denominator;
    }
  }
  return { numerators, denominators };
}

function canonicalElement(denominator, numerators) {
  let content = denominator;
  for (const value of numerators) content = gcd(content, value);
  return [
    denominator / content,
    ...numerators.map((value) => value / content),
  ];
}

function multiplyMatrixElement(matrix, matrixDenominator, element) {
  const degree = element.length - 1;
  const numerators = Array.from({ length: degree }, (_unused, row) => {
    let value = 0n;
    for (let column = 0; column < degree; column += 1) {
      value += matrix[row * degree + column] * element[column + 1];
    }
    return value;
  });
  return canonicalElement(matrixDenominator * element[0], numerators);
}

test("packed integral number-field multiplication matches exact oracles", async () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-packed-integral-nf-"));
  try {
    const compiled = await compile({ sourcePath, cacheRoot: cache });
    await compile({ sourcePath: fieldAnalysisSourcePath, cacheRoot: cache });
    const module = require(compiled.modulePath);
    const multiply = module.packed_integral_number_field_multiply_reduce;
    const powerBasis = module.packed_integral_number_field_power_basis;
    const exactQuotient =
      module.packed_integral_number_field_exact_quotient;
    const declaration = compiled.ir.functions.find(
      (candidate) =>
        candidate.name === "packed_integral_number_field_multiply_reduce",
    );
    assert.equal(declaration.kernelKind, "integer");
    assert.doesNotMatch(
      readFileSync(compiled.coreSourcePath, "utf8"),
      /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/,
    );

    const powerDeclaration = compiled.ir.functions.find(
      (candidate) =>
        candidate.name === "packed_integral_number_field_power_basis",
    );
    assert.equal(powerDeclaration.kernelKind, "integer");
    const quotientDeclaration = compiled.ir.functions.find(
      (candidate) =>
        candidate.name === "packed_integral_number_field_exact_quotient",
    );
    assert.equal(quotientDeclaration.kernelKind, "integer");

    let state = 0x243f6a8885a308d3n;
    for (let degree = 1; degree <= 9; degree += 1) {
      for (let trial = 0; trial < 12; trial += 1) {
        const next = () => {
          state =
            (state * 6364136223846793005n + 1442695040888963407n) &
            ((1n << 192n) - 1n);
          return (state >> 11n) * (state & 1n ? -1n : 1n);
        };
        const defining = Array.from({ length: degree }, next);
        const left = [BigInt(1 + (trial % 7))];
        const right = [BigInt(1 + ((3 * trial + 1) % 11))];
        for (let index = 0; index < degree; index += 1) {
          left.push(next());
          right.push(next());
        }
        const expected = oracle(left, right, defining);
        const output = multiply.createIntegerBuffer(degree + 1, 256);
        const workspace = multiply.createIntegerBuffer(2 * degree - 1, 256);
        assert.equal(
          multiply(
            output,
            multiply.packIntegerBuffer(left),
            multiply.packIntegerBuffer(right),
            multiply.packIntegerBuffer(defining),
            workspace,
            BigInt(degree),
          ),
          true,
        );
        assert.deepEqual(output.toArray(), expected);

        const dynamicOutput = Array(degree + 1).fill(0n);
        assert.equal(
          multiply.javascript(
            dynamicOutput,
            left,
            right,
            defining,
            Array(2 * degree - 1).fill(0n),
            BigInt(degree),
          ),
          true,
        );
        assert.deepEqual(dynamicOutput, expected);

        const matrix = Array.from({ length: degree * degree }, next);
        const matrixDenominator = BigInt(3 ** (trial % 5));
        const expectedOrbit = orbitOracle(
          matrix,
          matrixDenominator,
          degree,
        );
        const orbitNumerators = powerBasis.createIntegerBuffer(
          degree * degree,
          512,
        );
        const orbitDenominators = powerBasis.createIntegerBuffer(degree, 512);
        assert.equal(
          powerBasis(
            orbitNumerators,
            orbitDenominators,
            powerBasis.packIntegerBuffer(matrix),
            powerBasis.packIntegerBuffer([matrixDenominator]),
            powerBasis.createIntegerBuffer(2 * degree, 512),
            BigInt(degree),
          ),
          true,
        );
        assert.deepEqual(orbitNumerators.toArray(), expectedOrbit.numerators);
        assert.deepEqual(orbitDenominators.toArray(), expectedOrbit.denominators);
        const dynamicNumerators = Array(degree * degree).fill(0n);
        const dynamicDenominators = Array(degree).fill(0n);
        assert.equal(
          powerBasis.javascript(
            dynamicNumerators,
            dynamicDenominators,
            matrix,
            [matrixDenominator],
            Array(2 * degree).fill(0n),
            BigInt(degree),
          ),
          true,
        );
        assert.deepEqual(dynamicNumerators, expectedOrbit.numerators);
        assert.deepEqual(dynamicDenominators, expectedOrbit.denominators);

        const quotientMatrix = Array(degree * degree).fill(0n);
        for (let row = 0; row < degree; row += 1) {
          for (let column = 0; column <= row; column += 1) {
            let value = next();
            if (row === column && value === 0n) value = 1n;
            quotientMatrix[row * degree + column] = value;
          }
        }
        if (trial === 0 && degree > 1) {
          for (let column = 0; column < degree; column += 1) {
            const first = column;
            const second = degree + column;
            [quotientMatrix[first], quotientMatrix[second]] = [
              quotientMatrix[second],
              quotientMatrix[first],
            ];
          }
        }
        const expectedQuotient = canonicalElement(
          BigInt(2 + (trial % 13)),
          Array.from({ length: degree }, next),
        );
        const quotientMatrixDenominator = BigInt(5 ** (trial % 4));
        const quotientDividend = multiplyMatrixElement(
          quotientMatrix,
          quotientMatrixDenominator,
          expectedQuotient,
        );
        const quotientOutput = exactQuotient.createIntegerBuffer(
          degree + 1,
          512,
        );
        assert.equal(
          exactQuotient(
            quotientOutput,
            exactQuotient.packIntegerBuffer(quotientMatrix),
            exactQuotient.packIntegerBuffer([quotientMatrixDenominator]),
            exactQuotient.packIntegerBuffer(quotientDividend),
            exactQuotient.createIntegerBuffer(
              degree * (degree + 1) + degree,
              512,
            ),
            BigInt(degree),
          ),
          true,
        );
        assert.deepEqual(quotientOutput.toArray(), expectedQuotient);
        const dynamicQuotient = Array(degree + 1).fill(0n);
        assert.equal(
          exactQuotient.javascript(
            dynamicQuotient,
            quotientMatrix,
            [quotientMatrixDenominator],
            quotientDividend,
            Array(degree * (degree + 1) + degree).fill(0n),
            BigInt(degree),
          ),
          true,
        );
        assert.deepEqual(dynamicQuotient, expectedQuotient);
      }
    }

    assert.equal(
      multiply(
        multiply.createIntegerBuffer(3, 8),
        multiply.packIntegerBuffer([0n, 1n, 0n]),
        multiply.packIntegerBuffer([1n, 0n, 1n]),
        multiply.packIntegerBuffer([1n, 0n]),
        multiply.createIntegerBuffer(3, 8),
        2n,
      ),
      false,
    );
    assert.equal(
      exactQuotient(
        exactQuotient.createIntegerBuffer(3, 8),
        exactQuotient.packIntegerBuffer([1n, 2n, 2n, 4n]),
        exactQuotient.packIntegerBuffer([1n]),
        exactQuotient.packIntegerBuffer([1n, 3n, 6n]),
        exactQuotient.createIntegerBuffer(8, 8),
        2n,
      ),
      false,
    );
    assert.equal(
      powerBasis(
        powerBasis.createIntegerBuffer(4, 8),
        powerBasis.createIntegerBuffer(2, 8),
        powerBasis.packIntegerBuffer([1n, 0n, 0n, 1n]),
        powerBasis.packIntegerBuffer([0n]),
        powerBasis.createIntegerBuffer(4, 8),
        2n,
      ),
      false,
    );

    const sageProgram = String.raw`
from sagejs.native import is_compiled
import sagejs.number_fields.round4 as round4
from sagejs.kernels.polynomial.packed_rational import packed_integral_number_field_power_basis
R = PolynomialRing(ZZ, 'x')
x = R.gen()
records = 0
for polynomial in [x**2+x+1, x**3-x+1, x**4+x+1, x**5-x+1, x**6+x+1]:
    K = NumberField(polynomial, 'a')
    identity = [[ZZ(1) if row == column else ZZ(0) for column in range(K.degree())] for row in range(K.degree())]
    assert round4._verify_packed_round4_closure(K, identity, ZZ(1))
    corrupted_lattice = [list(row) for row in identity]
    corrupted_lattice[0][0] = ZZ(2)
    assert round4._verify_packed_round4_closure(K, corrupted_lattice, ZZ(1)) is False
    for phi in [K.gen() + QQ(1)/3, K.gen()**2 + K.gen()/5 - QQ(2)/7]:
        actual = round4._power_basis_rows(K, phi)
        expected = []
        power = K.one()
        for exponent in range(K.degree()):
            coefficients = list(power.list())
            coefficients += [QQ(0) for _ in range(K.degree() - len(coefficients))]
            expected.append(coefficients)
            power *= phi
        assert actual == expected
        for scalar in [1, 2, 3**7, -11]:
            assert round4._divide_field_element_by_integer(K, phi, scalar) == phi / scalar
        divisor = K.gen() + QQ(2)/5
        dividend = phi**2 - K.gen()/11 + QQ(7)/13
        quotient_metrics = {}
        assert round4._exact_field_element_quotient(K, dividend, divisor, quotient_metrics) == dividend / divisor
        quotient_certificate = quotient_metrics['exact_field_quotient_certificates'][0]
        round4._verify_round4_quotient_certificate(K, quotient_certificate)
        quotient_certificate['quotient'][1] += 1
        rejected = False
        try:
            round4._verify_round4_quotient_certificate(K, quotient_certificate)
        except round4.Round4InvariantError:
            rejected = True
        quotient_certificate['quotient'][1] -= 1
        assert rejected
        records += 1
assert is_compiled(packed_integral_number_field_power_basis)
print(records)
`;
    const sage = spawnSync(process.execPath, [sagejs, "--python"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_NATIVE_CACHE_DIR: cache,
      },
      input: sageProgram,
      timeout: 120_000,
    });
    if (sage.error) throw sage.error;
    assert.equal(sage.status, 0, sage.stderr || sage.stdout);
    assert.equal(sage.stdout.trim(), "10");

    const pythonProgram = String.raw`
import sys
from fractions import Fraction
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.kernels.polynomial.packed_rational import (
    packed_integral_number_field_multiply_reduce,
    packed_integral_number_field_exact_quotient,
    packed_integral_number_field_power_basis,
)

def generic(left, right, defining):
    degree = len(defining)
    values = [Fraction(0) for _ in range(2 * degree - 1)]
    for i in range(degree):
        for j in range(degree):
            values[i + j] += Fraction(left[i + 1], left[0]) * Fraction(right[j + 1], right[0])
    for exponent in range(2 * degree - 2, degree - 1, -1):
        leading = values[exponent]
        for index in range(degree):
            values[exponent - degree + index] -= leading * defining[index]
    return values[:degree]

left = [6, 5, -7, 11, 13]
right = [10, -3, 17, 19, -23]
defining = [29, -31, 37, -41]
output = [0] * 5
assert packed_integral_number_field_multiply_reduce(output, left, right, defining, [0] * 7, 4)
actual = [Fraction(value, output[0]) for value in output[1:]]
assert actual == generic(left, right, defining)
matrix = [2, 3, 5, 7]
orbit_numerators = [0] * 4
orbit_denominators = [0] * 2
assert packed_integral_number_field_power_basis(
    orbit_numerators, orbit_denominators, matrix, [11], [0] * 4, 2,
)
assert orbit_numerators == [1, 0, 2, 5]
assert orbit_denominators == [1, 11]
quotient = [0, 0, 0]
assert packed_integral_number_field_exact_quotient(
    quotient, [2, 1, 1, 1], [3], [15, 17, 13], [0] * 8, 2,
)
from fractions import Fraction
assert [Fraction(value, quotient[0]) for value in quotient[1:]] == [Fraction(4, 5), Fraction(9, 5)]
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
