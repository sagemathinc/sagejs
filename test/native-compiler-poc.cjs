"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const {
  analyze,
  compile,
  generateC,
} = require("../tools/native-compiler-poc.cjs");
const mpc = require("../packages/flint");

const root = join(__dirname, "..");
const sourcePath = join(root, "bench", "native-compiler-input.sage");
const outputPath = join(root, "bench", ".native-poc");
const source = readFileSync(sourcePath, "utf8");
const program = analyze(source, sourcePath);

assert.equal(program.functionName, "multiply_loop");
assert.deepEqual(program.initial, ["1.25", "-0.75"]);
assert.deepEqual(program.step, [
  "1.0000000000000002",
  "0.0000000000000001",
]);
assert.match(generateC(program), /mpc_mul\(value, value, step, MPC_RNDNN\)/);
assert.throws(
  () => analyze("def f(x):\n    return x\n", "invalid.sage"),
  /expected field and iteration arguments/,
);

const generated = compile(sourcePath, outputPath);
const addon = require(generated.modulePath);
const multiplyLoop = addon[generated.functionName];

function complex(realText, imagText, precision) {
  return mpc.complexFromReals(
    mpc.realFromString(realText, precision),
    mpc.realFromString(imagText, precision),
  );
}

function reference(precision, iterations) {
  let value = complex("1.25", "-0.75", precision);
  const step = complex(
    "1.0000000000000002",
    "0.0000000000000001",
    precision,
  );
  for (let index = 0; index < iterations; index += 1) {
    value = mpc.complexMul(value, step);
  }
  return mpc.complexToString(value);
}

for (const precision of [53, 1000, 10000]) {
  const result = multiplyLoop(precision, 25);
  const value = complex(result.real, result.imag, precision);
  assert.equal(mpc.complexToString(value), reference(precision, 25));
}

console.log("Sage.js AST-to-C/MPC proof of concept passed.");
