"use strict";

const assert = require("node:assert/strict");
const flint = require("..");

function elementsWithoutVisibleContext() {
  const context = flint.fqContext(3n, 2, "a");
  return [flint.fqGen(context), flint.fqFromBigInt(context, 1n)];
}

const [generator, one] = elementsWithoutVisibleContext();
for (let index = 0; index < 5; index += 1) global.gc();

assert.equal(
  flint.fqToString(flint.fqAdd(flint.fqMul(generator, generator), one)),
  "a+2",
);

console.log("Opaque finite-field elements retain their native context.");
