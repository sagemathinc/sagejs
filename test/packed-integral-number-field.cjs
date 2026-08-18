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
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "polynomial",
  "packed_rational.py",
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

test("packed integral number-field multiplication matches exact oracles", async () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-packed-integral-nf-"));
  try {
    const compiled = await compile({ sourcePath, cacheRoot: cache });
    const module = require(compiled.modulePath);
    const multiply = module.packed_integral_number_field_multiply_reduce;
    const declaration = compiled.ir.functions.find(
      (candidate) =>
        candidate.name === "packed_integral_number_field_multiply_reduce",
    );
    assert.equal(declaration.kernelKind, "integer");
    assert.doesNotMatch(
      readFileSync(compiled.coreSourcePath, "utf8"),
      /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/,
    );

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

    const pythonProgram = String.raw`
import sys
from fractions import Fraction
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.kernels.polynomial.packed_rational import packed_integral_number_field_multiply_reduce

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
