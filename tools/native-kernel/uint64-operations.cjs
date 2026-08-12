"use strict";

/*
 * Canonical semantics for compiler-owned uint64 scalar operations.
 *
 * uint64 is a bounded machine-integer type, not Python's arbitrary-precision
 * Integer.  Arithmetic and left shifts therefore produce the result modulo
 * 2^64.  Right shift is logical because every operand is unsigned.  C leaves
 * shifts by the word width or more undefined, so the compiler rejects every
 * shift count outside 0..63 before executing the operator.
 */

const UINT64_BITWISE_OPERATIONS = new Map([
  ["&", "bitand"],
  ["|", "bitor"],
  ["^", "bitxor"],
  ["<<", "lshift"],
  [">>", "rshift"],
]);

const UINT64_C_OPERATORS = Object.freeze({
  add: "+",
  sub: "-",
  mul: "*",
  bitand: "&",
  bitor: "|",
  bitxor: "^",
  lshift: "<<",
  rshift: ">>",
  "+": "+",
  "-": "-",
  "*": "*",
});

const UINT64_SHIFT_OPERATIONS = new Set(["lshift", "rshift"]);
const UINT64_BITWISE_OPERATION_NAMES = new Set(
  UINT64_BITWISE_OPERATIONS.values(),
);

const UINT64_SEMANTICS = Object.freeze({
  representation: "unsigned-64-bit",
  arithmetic: "modulo-2^64",
  bitwise: "unsigned-64-bit",
  rightShift: "logical",
  shiftCounts: "0-through-63",
  invalidShift: "raises-OverflowError",
});

function uint64BitwiseOperation(token) {
  return UINT64_BITWISE_OPERATIONS.get(token);
}

function uint64COperator(operation) {
  return UINT64_C_OPERATORS[operation];
}

function isUint64Shift(operation) {
  return UINT64_SHIFT_OPERATIONS.has(operation);
}

function isUint64Bitwise(operation) {
  return UINT64_BITWISE_OPERATION_NAMES.has(operation);
}

function hasUint64Bitwise(statements) {
  for (const statement of statements || []) {
    if (
      (statement.kind === "uint64.binary" ||
        statement.kind === "source.uint64.binary") &&
      isUint64Bitwise(statement.operation)
    ) return true;
    if (
      hasUint64Bitwise(statement.body) ||
      hasUint64Bitwise(statement.alternative) ||
      hasUint64Bitwise(statement.condition?.operations) ||
      hasUint64Bitwise(statement.right?.operations)
    ) return true;
  }
  return false;
}

module.exports = {
  UINT64_SEMANTICS,
  hasUint64Bitwise,
  isUint64Bitwise,
  isUint64Shift,
  uint64BitwiseOperation,
  uint64COperator,
};
