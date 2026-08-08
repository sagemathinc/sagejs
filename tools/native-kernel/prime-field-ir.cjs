"use strict";

const OPERATIONS = new Map([
  ["_prime_field_rank_fallback", "rank"],
  ["_prime_field_determinant_fallback", "determinant"],
  ["_prime_field_echelon_fallback", "echelon"],
  ["_prime_field_solve_fallback", "solve"],
  ["_prime_field_factor_fallback", "factor"],
  ["_prime_field_factor_rank_fallback", "factor-rank"],
  ["_prime_field_factor_determinant_fallback", "factor-determinant"],
  ["_prime_field_factor_echelon_fallback", "factor-echelon"],
  ["_prime_field_factor_solve_fallback", "factor-solve"],
]);

const CONTRACTS = new Map([
  ["rank", {
    parameters: ["PrimeFieldMatrix"],
    result: "uint64",
  }],
  ["determinant", {
    parameters: ["PrimeFieldMatrix"],
    result: "PrimeFieldElement",
  }],
  ["echelon", {
    parameters: ["PrimeFieldMatrix"],
    result: "PrimeFieldMatrix",
  }],
  ["solve", {
    parameters: ["PrimeFieldMatrix", "PrimeFieldMatrix"],
    result: "PrimeFieldMatrix",
  }],
  ["factor", {
    parameters: ["PrimeFieldMatrix"],
    result: "PrimeFieldDecomposition",
  }],
  ["factor-rank", {
    parameters: ["PrimeFieldDecomposition"],
    result: "uint64",
  }],
  ["factor-determinant", {
    parameters: ["PrimeFieldDecomposition"],
    result: "PrimeFieldElement",
  }],
  ["factor-echelon", {
    parameters: ["PrimeFieldDecomposition"],
    result: "PrimeFieldMatrix",
  }],
  ["factor-solve", {
    parameters: ["PrimeFieldDecomposition", "PrimeFieldMatrix"],
    result: "PrimeFieldMatrix",
  }],
]);

function array(value) {
  return Array.from(value || []);
}

function nodeType(node) {
  return node?.constructor?.name;
}

function location(node, filename) {
  const line = node?.start?.line;
  const column = node?.start?.col;
  return Number.isInteger(line)
    ? `${filename}:${line}:${(column ?? 0) + 1}`
    : filename;
}

function fail(fn, filename, node, message) {
  throw new Error(
    `native kernel: ${location(node, filename)}: ${fn.name?.name}: ${message}`,
  );
}

function expect(fn, filename, node, condition, message) {
  if (!condition) fail(fn, filename, node, message);
}

function isPrimeFieldSignature(signature) {
  return (
    signature.params.some((param) => param.type === "PrimeFieldMatrix") ||
    signature.params.some(
      (param) => param.type === "PrimeFieldDecomposition",
    ) ||
    signature.returnType === "PrimeFieldMatrix" ||
    signature.returnType === "PrimeFieldDecomposition" ||
    signature.returnType === "PrimeFieldElement"
  );
}

function isPrimeFieldIntrinsicFunction(fn) {
  const statements = array(fn.body).filter(
    (statement) => nodeType(statement) !== "AST_EmptyStatement",
  );
  if (statements.length !== 1 || nodeType(statements[0]) !== "AST_Return") {
    return false;
  }
  const call = statements[0].value;
  return nodeType(call) === "AST_Call" &&
    nodeType(call.expression) === "AST_SymbolRef" &&
    OPERATIONS.has(call.expression.name);
}

function lowerPrimeFieldFunction(fn, signature, filename, decorated) {
  const statements = array(fn.body).filter(
    (statement) => nodeType(statement) !== "AST_EmptyStatement",
  );
  expect(
    fn,
    filename,
    fn,
    statements.length === 1 && nodeType(statements[0]) === "AST_Return",
    "a prime-field matrix kernel must return one supported fallback call",
  );
  const call = statements[0].value;
  expect(
    fn,
    filename,
    call,
    nodeType(call) === "AST_Call" &&
      nodeType(call.expression) === "AST_SymbolRef",
    "a prime-field matrix kernel must call its named fallback",
  );
  const operation = OPERATIONS.get(call.expression.name);
  expect(
    fn,
    filename,
    call,
    operation !== undefined,
    `unsupported prime-field matrix fallback ${call.expression.name}`,
  );
  const contract = CONTRACTS.get(operation);
  expect(
    fn,
    filename,
    fn,
    signature.params.length === contract.parameters.length &&
      signature.params.every(
        (param, index) => param.type === contract.parameters[index],
      ) && signature.returnType === contract.result,
    `${operation} expects (${contract.parameters.join(", ")}) -> ${contract.result}`,
  );
  const args = array(call.args);
  expect(
    fn,
    filename,
    call,
    args.length === signature.params.length &&
      args.every(
        (arg, index) => nodeType(arg) === "AST_SymbolRef" &&
          arg.name === signature.params[index].name,
      ),
    "the fallback call must forward every matrix argument unchanged",
  );
  return {
    name: signature.name,
    decorated,
    kernelKind: "prime-field-matrix",
    operation,
    params: signature.params,
    returnType: signature.returnType,
    locals: [],
    body: [],
    dependencies: [],
    arithmetic: {
      representations: ["u32", "u64"],
      u32: "uint64 scalar products and Shoup-specialized row updates",
      u64: "FLINT preinverse products and Shoup-specialized row updates",
      portability: "nmod multiplication on platforms without a wider word",
    },
    decomposition: {
      representation: "packed row-pivoted LU with permutation and pivots",
      squareDense: "cache-blocked panel factorization",
      general: "classical row-pivoted elimination",
      reusable: operation.startsWith("factor"),
    },
  };
}

module.exports = {
  isPrimeFieldIntrinsicFunction,
  isPrimeFieldSignature,
  lowerPrimeFieldFunction,
};
