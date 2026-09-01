// sagejs-test-tier: integration
"use strict";

// Results that differed from SageMath's, found by running the expressions in
// SageMath's own doctests through both systems.  Each expectation below is
// quoted from a SageMath 10.9 run of the same statements.

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("Integer reads its digits in the base it is given", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "print(Integer('012', 8), Integer('ff', 16), Integer('-0012345', 16))",
      "print(Integer('101', 2), Integer('zz', 36), Integer('  -7  ', 10))",
      // A base is no help if it is dropped once the digits get long.
      "print(Integer('7' * 40, 8) == sum(7 * 8**k for k in range(40)))",
      // Without a base the reading is decimal, leading zero or not.
      "print(Integer('012'), Integer(17), Integer('1_000'))",
      // A written prefix is not a digit, and Sage refuses it.
      "for text in ('19', '0x1f', '', 'zz'):",
      "    try:",
      "        Integer(text, 8)",
      "    except TypeError as error:",
      "        print(error)",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    [
      "10 255 -74565",
      "5 1295 -7",
      "True",
      "12 17 1000",
      "unable to convert '19' to an integer",
      "unable to convert '0x1f' to an integer",
      "unable to convert '' to an integer",
      "unable to convert 'zz' to an integer",
    ].join("\n"),
  );
});

test("euler_phi counts nothing at or below zero", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(
    "print(euler_phi(-1), euler_phi(0), euler_phi(1), euler_phi(-5), euler_phi(10))",
  );
  assert.equal(result.stdout.trim(), "0 0 1 0 4");
});

test("a cyclotomic field of odd order holds twice as many roots of unity", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(
    "print([CyclotomicField(n).zeta_order() for n in [1, 2, 3, 4, 5, 6, 8, 9]])",
  );
  assert.equal(result.stdout.trim(), "[2, 2, 6, 4, 10, 6, 8, 18]");
});

test("a polynomial ring names its variables after the name it is given", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "print(PolynomialRing(QQ, 'y', 3))",
      "print(PolynomialRing(QQ, 3, 'y'))",
      // A count asks for a multivariate ring even when the count is one.
      "print(PolynomialRing(QQ, 'x', 1))",
      "print(PolynomialRing(QQ, 'x'))",
      "print(PolynomialRing(QQ, 'x,y'))",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    [
      "Multivariate Polynomial Ring in y0, y1, y2 over Rational Field",
      "Multivariate Polynomial Ring in y0, y1, y2 over Rational Field",
      "Multivariate Polynomial Ring in x over Rational Field",
      "Univariate Polynomial Ring in x over Rational Field",
      "Multivariate Polynomial Ring in x, y over Rational Field",
    ].join("\n"),
  );
});

test("a partition may be written with trailing zeros", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "print([2,1,0] in Partitions(), [0] in Partitions(0, length=0))",
      "print([3,1,0] in Partitions(4), [2,2,0] in Partitions(4, length=2))",
      // A zero before a part is still not a partition.
      "print([0,2] in Partitions(), [2,1] in Partitions())",
      "print(Partition([2,1,0]), Partition([2,1,0]).size(), len(Partition([3,0,0])))",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    ["True True", "True True", "False True", "[2, 1] 3 1"].join("\n"),
  );
});
