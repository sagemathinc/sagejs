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
      "(2) * (x + 1)",
      "(1/4) * (x + 1)^-2",
      "1/4",
      "[('x + 1', -2)]",
      "[('x + 2', -2), ('x + 1', -4), ('x + 2', -6)]",
      "1/4",
    ].join("\n"),
  );
});

test("negative powers enter polynomial fraction fields and reject zero", () => {
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
polynomial_unit = Factorization([(x + 1, 1)], unit=x)**-1
print(repr(polynomial_unit))
print(repr(polynomial_unit.unit()))
print(repr(polynomial_unit.value()))

capture(lambda: Factorization([(x + 1, 1)], unit=R(0))**-1)

rational_factor = Factorization([(QQ(3, 2), 1)], unit=QQ(2))
polynomial_factor = Factorization([(x + 1, 1)], unit=QQ(2))
print(repr(rational_factor))
print(repr(polynomial_factor))
`);

  assert.equal(
    output,
    [
      "ZeroDivisionError: rational division by zero",
      "(1/x) * (x + 1)^-1",
      "1/x",
      "1/(x^2 + x)",
      "ZeroDivisionError: rational function denominator is zero",
      "2 * 3/2",
      "(2) * (x + 1)",
    ].join("\n"),
  );
});

test("polynomial-unit inverses remain closed under later powers", () => {
  const output = run(`
R = PolynomialRing(ZZ, 'x')
x = R.gen()
g = Factorization([(x + 1, 1)], unit=x)
inverse = g**-1
squared = inverse**2
reciprocal = inverse**-1
print(repr(inverse))
print(repr(squared))
print(repr(squared.unit()))
print(squared.value() == R.fraction_field()(1, x**4 + 2*x**3 + x**2))
print(reciprocal.value() == x**2 + x)

zero = R.fraction_field()(0)
try:
    zero**-1
except ZeroDivisionError as error:
    print(str(error))
`);

  assert.equal(
    output,
    [
      "(1/x) * (x + 1)^-1",
      "(1/x^2) * (x + 1)^-2",
      "1/x^2",
      "True",
      "True",
      "rational function division by zero",
    ].join("\n"),
  );
});

test("fraction fields reject polynomial rings over non-domains", () => {
  const output = run(`
for modulus in [6, 8]:
    R = PolynomialRing(Zmod(modulus), 'x')
    x = R.gen()
    for operation in [
        lambda: R.fraction_field(),
        lambda: Factorization([(x + 1, 1)], unit=x)**-1,
    ]:
        try:
            operation()
        except TypeError as error:
            print(modulus, str(error))
        else:
            raise AssertionError('fraction-field construction unexpectedly succeeded')

field_ring = PolynomialRing(Zmod(7), 'x')
print(field_ring.fraction_field())
`);

  assert.equal(
    output,
    [
      "6 a fraction field requires an integral domain",
      "6 a fraction field requires an integral domain",
      "8 a fraction field requires an integral domain",
      "8 a fraction field requires an integral domain",
      "Fraction Field of Univariate Polynomial Ring in x over Ring of integers modulo 7",
    ].join("\n"),
  );
});

test("factorization formatting follows factor-parent atomicity", () => {
  const output = run(`
RR80 = RealField(80)
R = PolynomialRing(ZZ, 'x')
x = R.gen()

real = Factorization([(RR80('1.25'), 1)], unit=RR80('2.5'))
mixed_atomic = Factorization(
    [(RR80('1.25'), 1), (QQ(3, 2), 2)],
    unit=RR80('2.5'),
    sort=False,
)
mixed_nonatomic = Factorization(
    [(QQ(3, 2), 1), (x + 1, 1)],
    unit=QQ(2),
    sort=False,
)

print(repr(real))
print(repr(mixed_atomic))
print(repr(mixed_nonatomic))
print(
    ZZ._repr_option('element_is_atomic'),
    QQ._repr_option('element_is_atomic'),
    RR80._repr_option('element_is_atomic'),
    R._repr_option('element_is_atomic'),
)
`);

  assert.equal(
    output,
    [
      "2.5000000000000000000000 * 1.2500000000000000000000",
      "2.5000000000000000000000 * 1.2500000000000000000000 * 3/2^2",
      "(2) * 3/2 * (x + 1)",
      "True True True False",
    ].join("\n"),
  );
});
