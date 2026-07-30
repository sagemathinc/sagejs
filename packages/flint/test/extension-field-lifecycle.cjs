"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const flint = require("..");

test("opaque extension-field values retain their native context", () => {
function elementsWithoutVisibleContext() {
  const context = flint.fqContext(3n, 2, "a");
  return [flint.fqGen(context), flint.fqFromBigInt(context, 1n)];
}

function polynomialWithoutVisibleContext() {
  const context = flint.fqContext(3n, 2, "a");
  return flint.fqPolyAdd(
    flint.fqPolyGen(context),
    flint.fqPolyConstant(context, flint.fqGen(context)),
  );
}

function matrixWithoutVisibleContext() {
  const context = flint.fqContext(3n, 2, "a");
  return flint.fqMatrix(context, 1, 2, [
    flint.fqGen(context),
    flint.fqFromBigInt(context, 1n),
  ]);
}

function multivariateWithoutVisibleContexts() {
  const field = flint.fqContext(3n, 2, "a");
  const context = flint.mpolyContext(
    "fq_nmod",
    2,
    "degrevlex",
    field,
  );
  return flint.mpolyAdd(
    flint.mpolyGen(context, 0),
    flint.mpolyConstant(context, flint.fqGen(field), 1n),
  );
}

const [generator, one] = elementsWithoutVisibleContext();
const polynomial = polynomialWithoutVisibleContext();
const matrix = matrixWithoutVisibleContext();
const multivariate = multivariateWithoutVisibleContexts();
for (let index = 0; index < 5; index += 1) global.gc();

assert.equal(
  flint.fqToString(flint.fqAdd(flint.fqMul(generator, generator), one)),
  "a+2",
);
assert.equal(flint.fqPolyToString(polynomial, "x"), "x+(a)");
assert.equal(
  flint.fqToString(flint.fqMatrixEntry(matrix, 0, 0)),
  "a",
);
assert.equal(
  flint.mpolyToString(multivariate, ["x", "y"]),
  "x + (a)",
);

});
