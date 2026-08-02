"use strict";

const { performance } = require("node:perf_hooks");
const flint = require("..");

function measure(label, iterations, operation) {
  operation();
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    operation();
  }
  const elapsed = performance.now() - start;
  console.log(
    `${label.padEnd(28)} ${elapsed.toFixed(2).padStart(10)} ms ` +
      `${(elapsed * 1e6 / iterations).toFixed(0).padStart(10)} ns/call`
  );
}

function javascriptGcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return left;
}

const mersenne521 = 2n ** 521n - 1n;
const shared = 2n ** 127n - 1n;
const left = mersenne521 * shared;
const right = (2n ** 607n - 1n) * shared;
const boundaryValue = 2n ** 4096n - 123456789n;

measure("4096-bit FLINT round trip", 10000, () => {
  flint.identity(boundaryValue);
});
measure("FLINT gcd incl. conversion", 10000, () => {
  flint.gcd(left, right);
});
measure("JavaScript BigInt gcd", 10000, () => {
  javascriptGcd(left, right);
});

const factorialStart = performance.now();
const factorial = flint.factorial(100000);
const factorialElapsed = performance.now() - factorialStart;
console.log(
  `FLINT factorial(100000)`.padEnd(28),
  `${factorialElapsed.toFixed(2).padStart(10)} ms`,
  `(${factorial.toString().length} digits)`
);

console.log(`CBLAS acceleration`.padEnd(28), String(flint.blasEnabled()));
for (const [dimension, iterations] of [[300, 5], [1000, 3]]) {
  const matrix = flint.nmodMatrixRandom(
    dimension, dimension, 7n, BigInt(dimension), 20260802n,
  );
  measure(`GF(7) ${dimension}x${dimension} square`, iterations, () => {
    flint.matrixMul(matrix, matrix);
  });
}
