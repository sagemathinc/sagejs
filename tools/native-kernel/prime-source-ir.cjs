"use strict";

const {
  optimizePrimeSourceBody,
} = require("./prime-source-optimize.cjs");
const {
  annotateOperations,
  assignOperationIds,
  sourceSpan,
} = require("./provenance.cjs");
const {
  UINT64_SEMANTICS,
  hasUint64Bitwise,
  uint64BitwiseOperation,
} = require("./uint64-operations.cjs");
const { canonicalType } = require("./integer-ir.cjs");

/*
 * Source-transparent lowering for the prime-field compiler experiment.
 *
 * Unlike prime-field-ir.cjs, this module never recognizes an algorithm by
 * name.  Every loop, branch, scalar operation, and buffer access in the
 * Python body is represented explicitly in the IR.  The only intrinsics are
 * representation-boundary primitives: borrowing matrix dimensions, copying
 * packed residues, allocating scratch storage, constructing a result matrix,
 * and arithmetic modulo the matrix's prime.
 */

const COMPARISONS = new Map([
  ["==", "eq"],
  ["!=", "ne"],
  ["<", "lt"],
  ["<=", "le"],
  [">", "gt"],
  [">=", "ge"],
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

function fail(context, node, message) {
  throw new Error(
    `native kernel: ${location(node, context.filename)}: ` +
      `${context.functionName}: ${message}`,
  );
}

function expect(context, node, condition, message) {
  if (!condition) fail(context, node, message);
}

function integerLiteral(node) {
  if (nodeType(node) === "AST_Number" && /^[0-9]+$/.test(String(node.value))) {
    const value = BigInt(node.value);
    return value <= 18446744073709551615n ? value : undefined;
  }
  if (
    nodeType(node) === "AST_Call" &&
    nodeType(node.expression) === "AST_SymbolRef" &&
    node.expression.name === "Integer"
  ) {
    const args = array(node.args);
    if (args.length === 1 && nodeType(args[0]) === "AST_String" &&
        /^[0-9]+$/.test(args[0].value)) {
      const value = BigInt(args[0].value);
      return value <= 18446744073709551615n ? value : undefined;
    }
  }
  return undefined;
}

function booleanLiteral(node) {
  if (nodeType(node) === "AST_True") return true;
  if (nodeType(node) === "AST_False") return false;
  return undefined;
}

function createContext(fn, signature, signatures, records, filename, decorated) {
  return {
    body: [],
    borrowed: new Set(),
    decorated,
    filename,
    functionName: signature.name,
    initialized: new Set(signature.params.map((param) => param.name)),
    locals: new Map(),
    nextTemporary: 0,
    params: signature.params,
    returnType: signature.returnType,
    dependencies: new Set(),
    records,
    signatures,
    variables: new Map(
      signature.params.map((param) => [param.name, param.type]),
    ),
  };
}

function temporary(context, node, type) {
  const name = `sagejs_native_source_tmp_${context.nextTemporary++}`;
  context.locals.set(name, type);
  context.variables.set(name, type);
  context.initialized.add(name);
  return name;
}

function ensureVariable(context, node, name, type) {
  const current = context.variables.get(name);
  expect(
    context,
    node,
    current === undefined || current === type,
    current === undefined
      ? `cannot declare ${name}`
      : `cannot assign ${type} to ${name}, which is ${current}`,
  );
  if (current === undefined) {
    context.variables.set(name, type);
    context.locals.set(name, type);
  }
}

function constant(context, node, operations, value) {
  const target = temporary(context, node, "uint64");
  operations.push({
    kind: "source.uint64.constant",
    target,
    value: value.toString(),
  });
  return { name: target, type: "uint64" };
}

function boolConstant(context, node, operations, value) {
  const target = temporary(context, node, "bool");
  operations.push({ kind: "source.bool.constant", target, value });
  return { name: target, type: "bool" };
}

function expectType(context, node, value, type, description) {
  expect(
    context,
    node,
    value.type === type,
    `${description} expects ${type}, got ${value.type}`,
  );
  return value;
}

function simpleCall(node, context) {
  expect(
    context,
    node,
    nodeType(node.expression) === "AST_SymbolRef",
    "source-transparent native calls require a simple intrinsic name",
  );
  return node.expression.name;
}

function lowerCall(node, context, operations) {
  const name = simpleCall(node, context);
  const argumentNodes = array(node.args);
  const record = context.records.get(name);
  if (record !== undefined) {
    expect(
      context,
      node,
      argumentNodes.length === record.fields.length,
      `${name} expects ${record.fields.length} fields, got ${argumentNodes.length}`,
    );
    const fields = argumentNodes.map((argument, index) => {
      const value = lowerExpression(argument, context, operations);
      expectType(
        context,
        argument,
        value,
        record.fields[index].type,
        `${name}.${record.fields[index].name}`,
      );
      return { ...record.fields[index], value: value.name };
    });
    const target = temporary(context, node, record.type);
    operations.push({
      kind: "source.record.construct",
      target,
      record: name,
      fields,
    });
    return { name: target, type: record.type };
  }
  const signature = context.signatures.get(name);
  if (signature !== undefined) {
    expect(
      context,
      node,
      argumentNodes.length === signature.params.length,
      `${name} expects ${signature.params.length} arguments, got ${argumentNodes.length}`,
    );
    const args = argumentNodes.map((arg, index) => {
      const value = lowerExpression(arg, context, operations);
      expectType(
        context,
        arg,
        value,
        signature.params[index].type,
        `${name} argument ${index + 1}`,
      );
      return value;
    });
    expect(
      context,
      node,
      ["uint64", "bool", "PrimeFieldMatrix"].includes(
        signature.returnType,
      ),
      `${name} has unsupported source-transparent result ${signature.returnType}`,
    );
    const target = temporary(context, node, signature.returnType);
    operations.push({
      kind: "source.call",
      target,
      function: name,
      arguments: args,
      returnType: signature.returnType,
    });
    context.dependencies.add(name);
    return { name: target, type: signature.returnType };
  }
  const args = argumentNodes.map((arg) =>
    lowerExpression(arg, context, operations)
  );
  if (name === "len") {
    expect(context, node, args.length === 1, "len expects one argument");
    expectType(context, node, args[0], "UInt64Buffer", name);
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: "source.buffer.length",
      target,
      buffer: args[0].name,
    });
    return { name: target, type: "uint64" };
  }
  const unaryMatrix = new Map([
    ["prime_rows", "rows"],
    ["prime_columns", "columns"],
  ]);
  if (unaryMatrix.has(name)) {
    expect(context, node, args.length === 1, `${name} expects one argument`);
    expectType(context, node, args[0], "PrimeFieldMatrix", name);
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: `source.matrix.${unaryMatrix.get(name)}`,
      target,
      source: args[0].name,
    });
    return { name: target, type: "uint64" };
  }
  if (name === "prime_modulus") {
    expect(context, node, args.length === 1, "prime_modulus expects one argument");
    expectType(context, node, args[0], "PrimeFieldMatrix", name);
    const target = temporary(context, node, "PrimeModulus");
    operations.push({
      kind: "source.matrix.modulus",
      target,
      source: args[0].name,
    });
    return { name: target, type: "PrimeModulus" };
  }
  if (name === "prime_buffer") {
    expect(context, node, args.length === 1, "prime_buffer expects one argument");
    expectType(context, node, args[0], "PrimeFieldMatrix", name);
    const target = temporary(context, node, "UInt64Buffer");
    operations.push({ kind: "source.buffer.copy_matrix", target, source: args[0].name });
    return { name: target, type: "UInt64Buffer" };
  }
  if (name === "prime_zeros") {
    expect(context, node, args.length === 1, "prime_zeros expects one argument");
    expectType(context, node, args[0], "uint64", name);
    const target = temporary(context, node, "UInt64Buffer");
    operations.push({ kind: "source.buffer.zeros", target, length: args[0].name });
    return { name: target, type: "UInt64Buffer" };
  }
  if (name === "prime_matrix") {
    expect(context, node, args.length === 4, "prime_matrix expects four arguments");
    expectType(context, node, args[0], "PrimeFieldMatrix", name);
    expectType(context, node, args[1], "uint64", name);
    expectType(context, node, args[2], "uint64", name);
    expectType(context, node, args[3], "UInt64Buffer", name);
    const target = temporary(context, node, "PrimeFieldMatrix");
    operations.push({
      kind: "source.matrix.from_buffer",
      target,
      model: args[0].name,
      rows: args[1].name,
      columns: args[2].name,
      buffer: args[3].name,
    });
    return { name: target, type: "PrimeFieldMatrix" };
  }
  if (["prime_add", "prime_sub", "prime_mul"].includes(name)) {
    expect(context, node, args.length === 3, `${name} expects three arguments`);
    expectType(context, node, args[0], "uint64", name);
    expectType(context, node, args[1], "uint64", name);
    expect(
      context,
      node,
      ["PrimeModulus", "PrimeModulusValue"].includes(args[2].type),
      `${name} modulus expects PrimeModulus, got ${args[2].type}`,
    );
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: `source.prime.${name.slice(6)}`,
      target,
      left: args[0].name,
      right: args[1].name,
      modulus: args[2].name,
      modulusType: args[2].type,
    });
    return { name: target, type: "uint64" };
  }
  if (name === "prime_inverse") {
    expect(context, node, args.length === 2, "prime_inverse expects two arguments");
    expectType(context, node, args[0], "uint64", name);
    expect(
      context,
      node,
      ["PrimeModulus", "PrimeModulusValue"].includes(args[1].type),
      `${name} modulus expects PrimeModulus, got ${args[1].type}`,
    );
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: "source.prime.inverse",
      target,
      value: args[0].name,
      modulus: args[1].name,
      modulusType: args[1].type,
    });
    return { name: target, type: "uint64" };
  }
  fail(context, node, `unsupported source-transparent intrinsic ${name}`);
}

function lowerExpression(node, context, operations) {
  const integer = integerLiteral(node);
  if (integer !== undefined) return constant(context, node, operations, integer);
  const boolean = booleanLiteral(node);
  if (boolean !== undefined) return boolConstant(context, node, operations, boolean);
  if (nodeType(node) === "AST_SymbolRef") {
    const type = context.variables.get(node.name);
    expect(context, node, type !== undefined, `unknown native value ${node.name}`);
    expect(context, node, context.initialized.has(node.name), `${node.name} may be uninitialized`);
    return { name: node.name, type };
  }
  if (["AST_Call", "AST_New"].includes(nodeType(node))) {
    return lowerCall(node, context, operations);
  }
  if (nodeType(node) === "AST_Dot") {
    const source = lowerExpression(node.expression, context, operations);
    expect(
      context,
      node,
      source.type.startsWith("Record:"),
      "native attribute access is only supported on compiler-owned records",
    );
    const recordName = source.type.slice(7);
    const record = context.records.get(recordName);
    const field = record?.fields.find((candidate) =>
      candidate.name === node.property
    );
    expect(
      context,
      node,
      field !== undefined,
      `${recordName} has no field ${node.property}`,
    );
    const target = temporary(context, node, field.type);
    if (field.type === "UInt64Buffer") context.borrowed.add(target);
    operations.push({
      kind: "source.record.get",
      target,
      source: source.name,
      record: recordName,
      field: field.name,
      type: field.type,
    });
    return { name: target, type: field.type };
  }
  if (nodeType(node) === "AST_ItemAccess") {
    const buffer = lowerExpression(node.expression, context, operations);
    const index = lowerExpression(node.property, context, operations);
    expectType(context, node, buffer, "UInt64Buffer", "buffer indexing");
    expectType(context, node, index, "uint64", "buffer indexing");
    const target = temporary(context, node, "uint64");
    operations.push({ kind: "source.buffer.get", target, buffer: buffer.name, index: index.name });
    return { name: target, type: "uint64" };
  }
  if (nodeType(node) === "AST_UnaryPrefix" && node.operator === "!") {
    const source = lowerExpression(node.expression, context, operations);
    expectType(context, node, source, "bool", "not");
    const target = temporary(context, node, "bool");
    operations.push({ kind: "source.bool.not", target, source: source.name });
    return { name: target, type: "bool" };
  }
  expect(context, node, nodeType(node) === "AST_Binary", `unsupported ${nodeType(node)} expression`);
  if (node.operator === "&&" || node.operator === "||") {
    const left = lowerExpression(node.left, context, operations);
    expectType(context, node.left, left, "bool", "boolean expression");
    const rightOperations = [];
    const right = lowerExpression(node.right, context, rightOperations);
    expectType(context, node.right, right, "bool", "boolean expression");
    const target = temporary(context, node, "bool");
    operations.push({
      kind: "source.bool.short_circuit",
      operation: node.operator === "&&" ? "and" : "or",
      target,
      left: left.name,
      right: { operations: rightOperations, value: right.name },
    });
    return { name: target, type: "bool" };
  }
  const left = lowerExpression(node.left, context, operations);
  const right = lowerExpression(node.right, context, operations);
  const comparison = COMPARISONS.get(node.operator);
  if (comparison !== undefined) {
    expect(context, node, left.type === right.type &&
      [
        "uint64",
        "bool",
        "PrimeModulus",
        "PrimeModulusValue",
      ].includes(left.type),
      `cannot compare ${left.type} and ${right.type}`);
    const target = temporary(context, node, "bool");
    operations.push({ kind: "source.compare", operation: comparison, target,
      left: left.name, right: right.name, type: left.type });
    return { name: target, type: "bool" };
  }
  const bitwise = uint64BitwiseOperation(node.operator);
  expect(context, node,
    ["+", "-", "*", "%", "//"].includes(node.operator) ||
      bitwise !== undefined,
    `unsupported source-transparent operator ${node.operator}`);
  expect(
    context,
    node.left,
    ["uint64", "PrimeModulusValue"].includes(left.type),
    `machine arithmetic expects uint64 or PrimeFieldModulus, got ${left.type}`,
  );
  expect(
    context,
    node.right,
    ["uint64", "PrimeModulusValue"].includes(right.type),
    `machine arithmetic expects uint64 or PrimeFieldModulus, got ${right.type}`,
  );
  if (bitwise !== undefined) {
    expect(
      context,
      node,
      left.type === "uint64" && right.type === "uint64",
      `uint64 operator ${node.operator} requires uint64 operands`,
    );
  }
  const target = temporary(context, node, "uint64");
  operations.push({ kind: "source.uint64.binary",
    operation: bitwise ?? node.operator,
    target, left: left.name, right: right.name });
  return { name: target, type: "uint64" };
}

function copyOperation(type, target, source, borrowed = false) {
  return { kind: "source.copy", type, target, source, borrowed };
}

function lowerBufferAssignment(item, rightNode, operator, context) {
  const operations = [];
  const buffer = lowerExpression(item.expression, context, operations);
  const index = lowerExpression(item.property, context, operations);
  expectType(context, item, buffer, "UInt64Buffer", "buffer assignment");
  expectType(context, item.property, index, "uint64", "buffer assignment");
  let current;
  let augmented;
  if (operator !== "=") {
    const symbol = operator.endsWith("=") ? operator.slice(0, -1) : "";
    augmented = uint64BitwiseOperation(symbol);
    expect(context, item, augmented !== undefined,
      `unsupported indexed augmented operator ${operator}`);
    current = temporary(context, item, "uint64");
    operations.push({ kind: "source.buffer.get", target: current,
      buffer: buffer.name, index: index.name });
  }
  let value = lowerExpression(rightNode, context, operations);
  expectType(context, rightNode, value, "uint64", "buffer assignment");
  if (augmented !== undefined) {
    const target = temporary(context, item, "uint64");
    operations.push({ kind: "source.uint64.binary", operation: augmented,
      target, left: current, right: value.name });
    value = { name: target, type: "uint64" };
  }
  operations.push({ kind: "source.buffer.set", buffer: buffer.name,
    index: index.name, value: value.name });
  return operations;
}

function lowerAssignment(statement, context) {
  const assign = statement.body;
  if (nodeType(assign) === "AST_AnnotatedAssignment") {
    expect(
      context,
      assign.target,
      nodeType(assign.target) === "AST_SymbolRef",
      "native local annotations require a local-name target",
    );
    expect(
      context,
      assign,
      assign.value !== null && assign.value !== undefined,
      "native local annotations require an initializer",
    );
    const declaredType = canonicalType(assign.annotation);
    expect(
      context,
      assign.annotation,
      ["bool", "uint64", "PrimeModulusValue"].includes(declaredType),
      "native prime-source local annotation must be uint64, bool, or PrimeFieldModulus",
    );
    const operations = [];
    const value = lowerExpression(assign.value, context, operations);
    expect(
      context,
      assign.value,
      value.type === declaredType ||
        (declaredType === "PrimeModulusValue" && value.type === "uint64"),
      `local ${assign.target.name} expects ${declaredType}, got ${value.type}`,
    );
    ensureVariable(context, assign.target, assign.target.name, declaredType);
    operations.push(
      declaredType === "PrimeModulusValue" && value.type === "uint64"
        ? {
            kind: "source.modulus.from_uint64",
            target: assign.target.name,
            source: value.name,
          }
        : copyOperation(
            declaredType,
            assign.target.name,
            value.name,
            false,
          ),
    );
    context.initialized.add(assign.target.name);
    return operations;
  }
  if (nodeType(assign) === "AST_ItemAccess" && assign.assignment !== undefined) {
    return lowerBufferAssignment(
      assign,
      assign.assignment,
      assign.operator || "=",
      context,
    );
  }
  expect(context, statement, nodeType(statement) === "AST_SimpleStatement" &&
    nodeType(assign) === "AST_Assign", "native assignment expected");
  const operations = [];
  if (nodeType(assign.left) === "AST_ItemAccess") {
    return lowerBufferAssignment(
      assign.left,
      assign.right,
      assign.operator,
      context,
    );
  }
  expect(context, assign.left, nodeType(assign.left) === "AST_SymbolRef",
    "native assignment targets must be local names or buffer items");
  const target = assign.left.name;
  if (assign.operator === "=") {
    const value = lowerExpression(assign.right, context, operations);
    ensureVariable(context, assign.left, target, value.type);
    const borrowed = context.borrowed.has(value.name);
    if (borrowed) context.borrowed.add(target);
    operations.push(copyOperation(value.type, target, value.name, borrowed));
    context.initialized.add(target);
    return operations;
  }
  const symbol = assign.operator.endsWith("=") ? assign.operator.slice(0, -1) : "";
  const bitwise = uint64BitwiseOperation(symbol);
  expect(context, assign,
    ["+", "-", "*", "//", "%"].includes(symbol) || bitwise !== undefined,
    `unsupported augmented operator ${assign.operator}`);
  expect(context, assign.left, context.variables.get(target) === "uint64" &&
    context.initialized.has(target), `augmented target ${target} must be uint64`);
  const right = lowerExpression(assign.right, context, operations);
  expectType(context, assign.right, right, "uint64", "augmented assignment");
  operations.push({ kind: "source.uint64.binary",
    operation: bitwise ?? symbol,
    target, left: target, right: right.name });
  return operations;
}

function lowerBlock(block, context) {
  if (block == null) return [];
  return lowerStatements(
    nodeType(block) === "AST_BlockStatement" ? array(block.body) : [block],
    context,
  );
}

function lowerRange(node, context) {
  expect(context, node, nodeType(node) === "AST_Call" &&
    nodeType(node.expression) === "AST_SymbolRef" &&
    node.expression.name === "range", "native for loops require range(...)");
  const args = array(node.args);
  expect(context, node, args.length === 1 || args.length === 2,
    "native range accepts one or two arguments");
  const operations = [];
  const start = args.length === 1
    ? constant(context, node, operations, 0n)
    : lowerExpression(args[0], context, operations);
  const stop = lowerExpression(args[args.length - 1], context, operations);
  expectType(context, node, start, "uint64", "range");
  expectType(context, node, stop, "uint64", "range");
  return { operations, start: start.name, stop: stop.name };
}

function lowerRaise(statement, context) {
  const value = statement.value;
  expect(context, statement, ["AST_Call", "AST_New"].includes(nodeType(value)) &&
    nodeType(value.expression) === "AST_SymbolRef" &&
    ["ValueError", "ZeroDivisionError"].includes(value.expression.name),
  "source-transparent raise supports ValueError and ZeroDivisionError");
  const args = array(value.args);
  expect(context, value, args.length === 1 && nodeType(args[0]) === "AST_String",
    "native exceptions require one literal message");
  return { kind: "source.raise", exception: value.expression.name,
    message: args[0].value };
}

function lowerStatements(statements, context) {
  const result = [];
  for (const statement of statements) {
    if (nodeType(statement) === "AST_EmptyStatement") continue;
    if (nodeType(statement) === "AST_SimpleStatement") {
      const operations = lowerAssignment(statement, context);
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
      continue;
    }
    if (nodeType(statement) === "AST_Return") {
      const operations = [];
      const value = lowerExpression(statement.value, context, operations);
      expect(context, statement, value.type === context.returnType,
        `return expects ${context.returnType}, got ${value.type}`);
      operations.push({ kind: "source.return", value: value.name,
        type: value.type });
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
      continue;
    }
    if (nodeType(statement) === "AST_If") {
      const conditionOperations = [];
      const condition = lowerExpression(statement.condition, context, conditionOperations);
      expectType(context, statement.condition, condition, "bool", "if condition");
      const operation = { kind: "source.if",
        condition: { operations: conditionOperations, value: condition.name },
        body: lowerBlock(statement.body, context),
        alternative: lowerBlock(statement.alternative, context) };
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(operation);
      continue;
    }
    if (nodeType(statement) === "AST_While") {
      const conditionOperations = [];
      const condition = lowerExpression(statement.condition, context, conditionOperations);
      expectType(context, statement.condition, condition, "bool", "while condition");
      const operation = { kind: "source.while",
        condition: { operations: conditionOperations, value: condition.name },
        body: lowerBlock(statement.body, context) };
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(operation);
      continue;
    }
    if (nodeType(statement) === "AST_ForIn") {
      expect(context, statement, nodeType(statement.init) === "AST_SymbolRef",
        "native range loop index must be a local name");
      const range = lowerRange(statement.object, context);
      const index = statement.init.name;
      ensureVariable(context, statement.init, index, "uint64");
      context.initialized.add(index);
      const operations = [...range.operations, { kind: "source.loop.range", index,
        start: range.start, stop: range.stop,
        body: lowerBlock(statement.body, context) }];
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
      continue;
    }
    if (nodeType(statement) === "AST_Throw") {
      const operation = lowerRaise(statement, context);
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(operation);
      continue;
    }
    fail(context, statement, `unsupported ${nodeType(statement)} statement`);
  }
  return result;
}

function containsReturn(statements) {
  return statements.some((statement) =>
    statement.kind === "source.return" ||
    (["source.if", "source.while", "source.loop.range"].includes(statement.kind) &&
      (containsReturn(statement.body || []) || containsReturn(statement.alternative || [])))
  );
}

function lowerPrimeSourceFunction(
  fn,
  signature,
  signatures,
  records,
  filename,
  decorated,
) {
  const context = createContext(
    fn,
    signature,
    signatures,
    records,
    filename,
    decorated,
  );
  const loweredBody = lowerStatements(array(fn.body), context);
  expect(context, fn, containsReturn(loweredBody), "function has no return");
  const lowered = {
    name: signature.name,
    body: loweredBody,
  };
  assignOperationIds(lowered);
  const optimized = optimizePrimeSourceBody(loweredBody);
  const result = {
    name: signature.name,
    decorated,
    kernelKind: "prime-field-source",
    sourceTransparent: true,
    params: signature.params,
    returnType: signature.returnType,
    locals: Array.from(context.locals, ([name, type]) => ({
      name,
      type,
      ownership: context.borrowed.has(name) ? "borrowed" : "owned",
    })),
    body: optimized.body,
    optimizations: optimized.optimizations,
    dependencies: Array.from(context.dependencies).sort(),
    records: Array.from(records.values()),
    analysis: hasUint64Bitwise(optimized.body)
      ? { uint64: UINT64_SEMANTICS }
      : {},
  };
  // Optimized operations retain the IDs of the operations they replace and
  // receive a fresh stable ID of their own.
  assignOperationIds(result);
  return result;
}

module.exports = {
  lowerPrimeSourceFunction,
};
