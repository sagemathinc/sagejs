#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function run(source) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      input: source,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

test("negative integer-factorization powers match Sage", () => {
  const output = run(`
f = factor(-60)
inverse_cube = f**-3
print(repr(inverse_cube))
print(repr(inverse_cube.unit()))
print(repr(inverse_cube.value()))
print(type(inverse_cube) is Factorization)
print(f**1 is f)
print(repr(f**0), len(f**0), repr((f**0).unit()))

with_nonunit = Factorization([(2, 1)], unit=2)**-1
print(repr(with_nonunit))
print(repr(with_nonunit.unit()))
print(repr(with_nonunit.value()))

rational_unit = Factorization([(3, 1)], unit=QQ(2, 3))**-2
print(repr(rational_unit))
print(repr(rational_unit.unit()))
print(repr(rational_unit.value()))

zero_power = Factorization([(2, 7)], unit=0)**0
print(repr(zero_power), len(zero_power), repr(zero_power.unit()))
`);

  assert.equal(
    output,
    [
      "-1 * 2^-6 * 3^-3 * 5^-3",
      "-1",
      "-1/216000",
      "True",
      "True",
      "1 0 1",
      "1/2 * 2^-1",
      "1/2",
      "1/4",
      "9/4 * 3^-2",
      "9/4",
      "1/4",
      "1 0 1",
    ].join("\n"),
  );
});

test("negative polynomial-factorization powers remain formal", () => {
  const output = run(`
R = PolynomialRing(ZZ, 'x')
x = R.gen()
f = (2*x + 2).factor()
inverse_square = f**-2
print(repr(f))
print(repr(inverse_square))
print(repr(inverse_square.unit()))
print([(repr(pair[0]), pair[1]) for pair in inverse_square])

ordered = Factorization(
    [(x + 2, 1), (x + 1, 2), (x + 2, 3)],
    unit=QQ(2),
    sort=False,
    simplify=False,
)
powered = ordered**-2
print([(repr(pair[0]), pair[1]) for pair in powered])
print(repr(powered.unit()))
`);

  assert.equal(
    output,
    [
      "2 * (x + 1)",
      "1/4 * (x + 1)^-2",
      "1/4",
      "[('x + 1', -2)]",
      "[('x + 2', -2), ('x + 1', -4), ('x + 2', -6)]",
      "1/4",
    ].join("\n"),
  );
});

test("negative powers fail when the unit cannot be inverted", () => {
  const output = run(`
def capture(operation):
    try:
        operation()
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error))
        return
    raise AssertionError('expected inversion to fail')

capture(lambda: Factorization([(2, 1)], unit=0)**-1)

R = PolynomialRing(ZZ, 'x')
x = R.gen()
capture(lambda: Factorization([(x + 1, 1)], unit=x)**-1)
`);

  assert.equal(
    output,
    [
      "ZeroDivisionError: rational division by zero",
      "ValueError: negative polynomial exponent",
    ].join("\n"),
  );
});
