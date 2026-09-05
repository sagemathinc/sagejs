// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const flint = require("../packages/flint");

for (const [kind, modulus] of [["qq", 0n], ["nmod", 5n]]) {
  test(`multivariate ${kind} reduction validates the complete divisor array`, () => {
    const context = flint.mpolyContext(kind, 2, "degrevlex", modulus);
    const x = flint.mpolyGen(context, 0);
    const zero = flint.mpolyConstant(context, 0n, 1n);
    const other = flint.mpolyContext(kind, 2, "lex", modulus);
    assert.throws(() => flint.mpolyReduce(x, {}), /basis must be an array/);
    assert.throws(() => flint.mpolyReduce(x, null), /basis must be an array/);
    assert.throws(() => flint.mpolyReduce(x, [x, zero]), /basis contains zero/);
    assert.throws(
      () => flint.mpolyReduce(x, [x, flint.mpolyGen(other, 0)]),
      /different parents/,
    );
    assert.throws(() => flint.mpolyReduce(x, [x, undefined]));
    assert.equal(flint.mpolyToString(flint.mpolyReduce(x, []), ["x", "y"]), "x");
    assert.equal(flint.mpolyToString(x, ["x", "y"]), "x");
  });
}
