// sagejs-test-tier: integration
"use strict";

// Sage decides an element's truth by whether it is zero, and a symbolic
// expression's by what it is: a relation is a claim to be proved, anything
// else is a value.  Both are compared here against SageMath's own answers,
// which are quoted beside each group.

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("a zero element of any ring is false, and a nonzero one true", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "zeros = [ZZ(0), QQ(0), 0/5, RR(0), RDF(0), SR(0), GF(7)(0), Zmod(12)(0)]",
      "zeros += [CC(0), CDF(0), QQbar(0), PolynomialRing(QQ, 'x')(0)]",
      "zeros += [matrix(QQ, 2, 2, 0), vector(QQ, [0, 0]), ZZ(2) - ZZ(2)]",
      "ones = [ZZ(3), QQ(1/2), RR(1.5), RDF(2.5), SR(2), GF(7)(3), Zmod(12)(5)]",
      "ones += [CC(1, 1), CDF(0, 1), QQbar(2), PolynomialRing(QQ, 'x')(3)]",
      "ones += [matrix(QQ, 2, 2, [1, 0, 0, 1]), vector(QQ, [1, 0]), pi]",
      "print(any(bool(value) for value in zeros))",
      "print(all(bool(value) for value in ones))",
      // The branch a program actually takes is the point of the whole thing.
      "print('nonzero' if RR(0) else 'zero', 'nonzero' if QQ(0) else 'zero')",
    ].join("\n"),
  );
  assert.equal(result.stdout.trim(), ["False", "True", "zero zero"].join("\n"));
});

test("a symbolic relation is true when it can be proved", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "print(bool(SR(1) == SR(1)), bool(SR(1) == SR(2)), bool(SR(1) != SR(2)))",
      "print(bool(SR(2) > SR(1)), bool(SR(1) > SR(2)), bool(SR(1) <= SR(1)))",
      "print(bool(pi > 3), bool(pi < 3))",
      // A claim that cannot be settled is not a true one, and a variable
      // leaves nothing to settle it with.
      "t = var('t')",
      "print(bool(t > 0), bool(t == 0))",
      // A value is false only when it is zero, whatever shape it has.
      "print(bool(SR(2)), bool(SR(0)), bool(sin(SR(0))), bool(sin(SR(1))))",
      // Truth must not be decided through binary64: these values underflow
      // numerically, but their symbolic signs are exact.
      "print(bool(exp(-1000) > 0), bool(-exp(-1000) >= 0))",
      "print(bool(sin(t)^2 + cos(t)^2 - 1), bool(t/t - 1))",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    [
      "True False True",
      "True False True",
      "True False",
      "False False",
      "True False False True",
      "True False",
      "False False",
    ].join("\n"),
  );
});

test("element equality failures are not silently treated as truth", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "ElementSubclass = type(RR(1))",
      "class BrokenEquality(ElementSubclass):",
      "    def __init__(self): pass",
      "    def __eq__(self, other): raise RuntimeError('broken equality')",
      "try:",
      "    bool(BrokenEquality())",
      "except RuntimeError as error:",
      "    print(str(error))",
    ].join("\n"),
  );
  assert.equal(result.stdout.trim(), "broken equality");
});
