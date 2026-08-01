"use strict";

const assert = require("node:assert/strict");
const mpc = require("../packages/flint");

const addonPath = process.argv[2];
if (!addonPath) throw new Error("native addon path is required");
const addon = require(addonPath);

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
  return value;
}

function realReference(precision, iterations) {
  let value = mpc.realFromString("1.25", precision);
  const step = mpc.realFromString("1.0000000000000002", precision);
  for (let index = 0; index < iterations; index += 1) {
    value = mpc.realMul(value, step);
  }
  return value;
}

for (const precision of [53, 1000, 10000]) {
  const actual = addon.multiply_loop(precision, 25);
  assert.equal(mpc.complexPrecision(actual), precision);
  assert.equal(
    mpc.complexToString(actual),
    mpc.complexToString(reference(precision, 25)),
  );
  const actualReal = addon.real_multiply_loop(precision, 25);
  assert.equal(mpc.realPrecision(actualReal), precision);
  assert.equal(
    mpc.realToString(actualReal),
    mpc.realToString(realReference(precision, 25)),
  );
}
