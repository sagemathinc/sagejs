"use strict";

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

function int64Constant(value) {
  const integer = BigInt(value);
  if (integer < INT64_MIN || integer > INT64_MAX) {
    throw new Error(`int64 constant ${value} is outside signed 64-bit`);
  }
  if (integer === INT64_MIN) return "INT64_MIN";
  if (integer < 0n) return `(-INT64_C(${(-integer).toString()}))`;
  return `INT64_C(${integer.toString()})`;
}

function int64CComparison(operation) {
  const operator = {
    eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=",
  }[operation];
  if (operator === undefined) {
    throw new Error(`unsupported int64 comparison ${operation}`);
  }
  return operator;
}

module.exports = {
  INT64_MAX,
  INT64_MIN,
  int64CComparison,
  int64Constant,
};
