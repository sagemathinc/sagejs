"use strict";

const MAX_SMALL_POWER = 64n;
const TYPE_ALIASES = new Map([
  ["Integer", "Integer"],
  ["int", "Integer"],
  ["uint64", "uint64"],
  ["bool", "bool"],
]);
const INTEGER_BINARY = new Map([
  ["+", "add"],
  ["-", "sub"],
  ["*", "mul"],
  ["//", "floordiv"],
  ["%", "mod"],
]);
const COMPARISONS = new Map([
  ["==", "eq"],
  ["!=", "ne"],
  ["<", "lt"],
  ["<=", "le"],
  [">", "gt"],
  [">=", "ge"],
]);

function nodeType(node) {
  return node?.constructor?.name;
}

function array(value) {
  return Array.from(value || []);
}

function location(node, filename) {
  const token = node?.start;
  const line = Number.isInteger(token?.line) ? token.line : undefined;
  const column = Number.isInteger(token?.col) ? token.col : undefined;
  return line === undefined
    ? filename
    : `${filename}:${line}:${(column ?? 0) + 1}`;
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

function isCIdentifier(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function rawAnnotationName(annotation) {
  if (
    nodeType(annotation) === "AST_SymbolRef" ||
    nodeType(annotation) === "AST_String"
  ) {
    return annotation.name ?? annotation.value;
  }
  return undefined;
}

function canonicalType(annotation) {
  return TYPE_ALIASES.get(rawAnnotationName(annotation));
}

function integerLiteral(node) {
  if (nodeType(node) === "AST_UnaryPrefix" && node.operator === "-") {
    const magnitude = integerLiteral(node.expression);
    return magnitude === undefined ? undefined : -magnitude;
  }
  if (nodeType(node) === "AST_Number") {
    const value = String(node.value);
    return /^[0-9]+$/.test(value) ? BigInt(value) : undefined;
  }
  if (
    nodeType(node) !== "AST_Call" ||
    nodeType(node.expression) !== "AST_SymbolRef" ||
    node.expression.name !== "Integer"
  ) {
    return undefined;
  }
  const args = array(node.args);
  if (
    args.length !== 1 ||
    nodeType(args[0]) !== "AST_String" ||
    !/^[+-]?[0-9]+$/.test(args[0].value)
  ) {
    return undefined;
  }
  return BigInt(args[0].value);
}

function booleanLiteral(node) {
  if (nodeType(node) === "AST_True") return true;
  if (nodeType(node) === "AST_False") return false;
  return undefined;
}

function signatureFromFunction(fn, filename) {
  const context = { filename, functionName: fn.name?.name || "<function>" };
  expect(
    context,
    fn,
    isCIdentifier(fn.name?.name),
    "function name must also be a C identifier",
  );
  const params = array(fn.argnames).map((arg) => {
    const type = canonicalType(arg.annotation);
    expect(
      context,
      arg,
      type !== undefined,
      `unsupported argument annotation ${rawAnnotationName(arg.annotation) ?? nodeType(arg.annotation)}`,
    );
    expect(
      context,
      arg,
      isCIdentifier(arg.name),
      `argument ${arg.name} must also be a C identifier`,
    );
    return { name: arg.name, type };
  });
  const returnType = canonicalType(fn.return_annotation);
  expect(
    context,
    fn.return_annotation ?? fn,
    returnType !== undefined,
    `unsupported return annotation ${rawAnnotationName(fn.return_annotation) ?? nodeType(fn.return_annotation)}`,
  );
  return { name: fn.name.name, params, returnType };
}

function isIntegerSignature(signature) {
  return (
    signature.returnType === "Integer" ||
    signature.returnType === "bool" ||
    signature.params.some(
      (param) => param.type === "Integer" || param.type === "bool",
    )
  );
}

function createContext(fn, signature, signatures, filename, decorated) {
  const variables = new Map(
    signature.params.map((param) => [param.name, param.type]),
  );
  return {
    decorated,
    dependencies: new Set(),
    filename,
    functionName: signature.name,
    initialized: new Set(signature.params.map((param) => param.name)),
    locals: new Map(),
    nextTemporary: 0,
    params: signature.params,
    returnType: signature.returnType,
    scalarCoercions: new Map(),
    signatures,
    variables,
    fn,
  };
}

function ensureVariable(context, node, name, type) {
  expect(
    context,
    node,
    isCIdentifier(name),
    `local ${name} must also be a C identifier`,
  );
  const existing = context.variables.get(name);
  if (existing !== undefined) {
    expect(
      context,
      node,
      existing === type,
      `local ${name} changes type from ${existing} to ${type}`,
    );
    return name;
  }
  context.variables.set(name, type);
  context.locals.set(name, type);
  return name;
}

function temporary(context, node, type) {
  let name;
  do {
    name = `sagejs_native_tmp_${context.nextTemporary}`;
    context.nextTemporary += 1;
  } while (context.variables.has(name));
  ensureVariable(context, node, name, type);
  return name;
}

function emitConstant(context, node, operations, value) {
  const target = temporary(context, node, "Integer");
  operations.push({
    kind: "integer.constant",
    target,
    value: value.toString(),
  });
  return { name: target, type: "Integer" };
}

function emitBoolean(context, node, operations, value) {
  const target = temporary(context, node, "bool");
  operations.push({ kind: "bool.constant", target, value });
  return { name: target, type: "bool" };
}

function coerceInteger(value, context, node, operations) {
  if (value.type === "Integer") return value;
  expect(
    context,
    node,
    value.type === "uint64",
    `expected an integer value, got ${value.type}`,
  );
  const cached = context.scalarCoercions.get(value.name);
  if (cached !== undefined) return { name: cached, type: "Integer" };
  const target = temporary(context, node, "Integer");
  context.scalarCoercions.set(value.name, target);
  operations.push({
    kind: "integer.from_uint64",
    target,
    source: value.name,
  });
  return { name: target, type: "Integer" };
}

function lowerCall(node, context, operations) {
  expect(
    context,
    node,
    nodeType(node.expression) === "AST_SymbolRef",
    "native calls require a simple function name",
  );
  const name = node.expression.name;
  const args = array(node.args);

  if (name === "abs") {
    expect(context, node, args.length === 1, "abs() requires one argument");
    const source = coerceInteger(
      lowerExpression(args[0], context, operations),
      context,
      args[0],
      operations,
    );
    const target = temporary(context, node, "Integer");
    operations.push({ kind: "integer.abs", target, source: source.name });
    return { name: target, type: "Integer" };
  }

  const signature = context.signatures.get(name);
  expect(context, node, signature !== undefined, `unsupported call to ${name}`);
  expect(
    context,
    node,
    args.length === signature.params.length,
    `${name} expects ${signature.params.length} arguments, got ${args.length}`,
  );
  const lowered = args.map((arg, index) => {
    let value = lowerExpression(arg, context, operations);
    const expectedType = signature.params[index].type;
    if (expectedType === "Integer") {
      value = coerceInteger(value, context, arg, operations);
    }
    expect(
      context,
      arg,
      value.type === expectedType,
      `${name} argument ${index + 1} expects ${expectedType}, got ${value.type}`,
    );
    return value;
  });
  const target = temporary(context, node, signature.returnType);
  operations.push({
    kind: "native.call",
    target,
    function: name,
    arguments: lowered,
    returnType: signature.returnType,
  });
  context.dependencies.add(name);
  return { name: target, type: signature.returnType };
}

function lowerExpression(node, context, operations) {
  const integer = integerLiteral(node);
  if (integer !== undefined) {
    return emitConstant(context, node, operations, integer);
  }
  const boolean = booleanLiteral(node);
  if (boolean !== undefined) {
    return emitBoolean(context, node, operations, boolean);
  }
  if (nodeType(node) === "AST_SymbolRef") {
    const type = context.variables.get(node.name);
    expect(context, node, type !== undefined, `unknown native value ${node.name}`);
    expect(
      context,
      node,
      context.initialized.has(node.name),
      `native value ${node.name} may be uninitialized`,
    );
    return { name: node.name, type };
  }
  if (nodeType(node) === "AST_Call") {
    return lowerCall(node, context, operations);
  }
  if (nodeType(node) === "AST_UnaryPrefix") {
    if (node.operator === "-") {
      const source = coerceInteger(
        lowerExpression(node.expression, context, operations),
        context,
        node.expression,
        operations,
      );
      const target = temporary(context, node, "Integer");
      operations.push({ kind: "integer.neg", target, source: source.name });
      return { name: target, type: "Integer" };
    }
    if (node.operator === "!") {
      const source = lowerCondition(node.expression, context, operations);
      const target = temporary(context, node, "bool");
      operations.push({ kind: "bool.not", target, source: source.name });
      return { name: target, type: "bool" };
    }
    fail(context, node, `unsupported unary operator ${node.operator}`);
  }
  expect(
    context,
    node,
    nodeType(node) === "AST_Binary",
    `unsupported ${nodeType(node)} expression`,
  );

  if (node.operator === "**") {
    const exponent = integerLiteral(node.right);
    expect(
      context,
      node.right,
      exponent !== undefined && exponent >= 0n && exponent <= MAX_SMALL_POWER,
      `powers require a constant exponent from 0 through ${MAX_SMALL_POWER}`,
    );
    const base = coerceInteger(
      lowerExpression(node.left, context, operations),
      context,
      node.left,
      operations,
    );
    const target = temporary(context, node, "Integer");
    operations.push({
      kind: "integer.pow_uint",
      target,
      base: base.name,
      exponent: Number(exponent),
    });
    return { name: target, type: "Integer" };
  }

  const arithmetic = INTEGER_BINARY.get(node.operator);
  if (arithmetic !== undefined) {
    const left = coerceInteger(
      lowerExpression(node.left, context, operations),
      context,
      node.left,
      operations,
    );
    const right = coerceInteger(
      lowerExpression(node.right, context, operations),
      context,
      node.right,
      operations,
    );
    const target = temporary(context, node, "Integer");
    operations.push({
      kind: "integer.binary",
      operation: arithmetic,
      target,
      left: left.name,
      right: right.name,
    });
    return { name: target, type: "Integer" };
  }

  const comparison = COMPARISONS.get(node.operator);
  if (comparison !== undefined) {
    let left = lowerExpression(node.left, context, operations);
    let right = lowerExpression(node.right, context, operations);
    if (left.type === "Integer" || left.type === "uint64") {
      left = coerceInteger(left, context, node.left, operations);
      right = coerceInteger(right, context, node.right, operations);
    }
    expect(
      context,
      node,
      left.type === right.type && (left.type === "Integer" || left.type === "bool"),
      `cannot compare ${left.type} and ${right.type}`,
    );
    const target = temporary(context, node, "bool");
    operations.push({
      kind: `${left.type === "Integer" ? "integer" : "bool"}.compare`,
      operation: comparison,
      target,
      left: left.name,
      right: right.name,
    });
    return { name: target, type: "bool" };
  }

  if (node.operator === "&&" || node.operator === "||") {
    const left = lowerExpression(node.left, context, operations);
    expect(
      context,
      node.left,
      left.type === "bool",
      `short-circuit operands must be bool, got ${left.type}`,
    );
    const rightOperations = [];
    context.scalarCoercions = new Map();
    const right = lowerExpression(node.right, context, rightOperations);
    expect(
      context,
      node.right,
      right.type === "bool",
      `short-circuit operands must be bool, got ${right.type}`,
    );
    const target = temporary(context, node, "bool");
    operations.push({
      kind: "bool.short_circuit",
      operation: node.operator === "&&" ? "and" : "or",
      target,
      left: left.name,
      right: { operations: rightOperations, value: right.name },
    });
    return { name: target, type: "bool" };
  }
  fail(context, node, `unsupported binary operator ${node.operator}`);
}

function lowerCondition(node, context, operations) {
  const value = lowerExpression(node, context, operations);
  if (value.type === "bool") return value;
  if (value.type === "Integer") {
    const target = temporary(context, node, "bool");
    operations.push({ kind: "integer.truth", target, source: value.name });
    return { name: target, type: "bool" };
  }
  if (value.type === "uint64") {
    const target = temporary(context, node, "bool");
    operations.push({ kind: "uint64.truth", target, source: value.name });
    return { name: target, type: "bool" };
  }
  fail(context, node, `cannot use ${value.type} as a condition`);
}

function lowerAssignment(statement, context) {
  context.scalarCoercions = new Map();
  const assign = statement.body;
  expect(
    context,
    statement,
    nodeType(statement) === "AST_SimpleStatement" &&
      nodeType(assign) === "AST_Assign" &&
      nodeType(assign.left) === "AST_SymbolRef",
    "native assignments require a single local-name target",
  );
  const operations = [];
  const target = assign.left.name;
  if (assign.operator === "=") {
    const value = lowerExpression(assign.right, context, operations);
    ensureVariable(context, assign.left, target, value.type);
    operations.push({
      kind: `${value.type.toLowerCase()}.copy`,
      target,
      source: value.name,
    });
    context.initialized.add(target);
    return operations;
  }
  const symbol = assign.operator.endsWith("=")
    ? assign.operator.slice(0, -1)
    : "";
  const operation = INTEGER_BINARY.get(symbol);
  expect(
    context,
    assign,
    operation !== undefined,
    `unsupported augmented operator ${assign.operator}`,
  );
  const type = context.variables.get(target);
  expect(
    context,
    assign.left,
    type === "Integer" && context.initialized.has(target),
    `augmented target ${target} must be an initialized Integer`,
  );
  const right = coerceInteger(
    lowerExpression(assign.right, context, operations),
    context,
    assign.right,
    operations,
  );
  operations.push({
    kind: "integer.binary",
    operation,
    target,
    left: target,
    right: right.name,
  });
  context.initialized.add(target);
  return operations;
}

function lowerBlock(block, context) {
  if (block === null || block === undefined) return [];
  if (nodeType(block) === "AST_BlockStatement") {
    return lowerStatements(array(block.body), context);
  }
  return lowerStatements([block], context);
}

function lowerRange(node, context) {
  expect(
    context,
    node,
    nodeType(node) === "AST_Call" &&
      nodeType(node.expression) === "AST_SymbolRef" &&
      node.expression.name === "range",
    "native for loops require range(...) ",
  );
  const args = array(node.args);
  expect(
    context,
    node,
    args.length === 1 || args.length === 2,
    "native range currently accepts one or two arguments",
  );
  const start = args.length === 1 ? 0n : integerLiteral(args[0]);
  const countNode = args.length === 1 ? args[0] : args[1];
  expect(
    context,
    node,
    start !== undefined && start >= 0n && start <= BigInt(Number.MAX_SAFE_INTEGER),
    "native range start must be a nonnegative safe integer literal",
  );
  let countName;
  if (nodeType(countNode) === "AST_SymbolRef") {
    expect(
      context,
      countNode,
      context.variables.get(countNode.name) === "uint64",
      "native range bound must be a uint64 argument",
    );
    countName = countNode.name;
  } else if (
    nodeType(countNode) === "AST_Binary" &&
    countNode.operator === "+" &&
    nodeType(countNode.left) === "AST_SymbolRef" &&
    context.variables.get(countNode.left.name) === "uint64" &&
    integerLiteral(countNode.right) === start
  ) {
    countName = countNode.left.name;
  } else {
    fail(
      context,
      countNode,
      "native range bound must be uint64 or uint64 + start",
    );
  }
  return { start: Number(start), count: countName };
}

function lowerStatements(statements, context) {
  const result = [];
  for (const statement of statements) {
    if (nodeType(statement) === "AST_SimpleStatement") {
      result.push(...lowerAssignment(statement, context));
      continue;
    }
    if (nodeType(statement) === "AST_Return") {
      context.scalarCoercions = new Map();
      const operations = [];
      let value = lowerExpression(statement.value, context, operations);
      if (context.returnType === "Integer") {
        value = coerceInteger(value, context, statement.value, operations);
      }
      expect(
        context,
        statement,
        value.type === context.returnType,
        `return expects ${context.returnType}, got ${value.type}`,
      );
      result.push(...operations, {
        kind: "return",
        value: value.name,
        type: value.type,
      });
      continue;
    }
    if (nodeType(statement) === "AST_If") {
      context.scalarCoercions = new Map();
      const conditionOperations = [];
      const condition = lowerCondition(
        statement.condition,
        context,
        conditionOperations,
      );
      const before = new Set(context.initialized);
      context.initialized = new Set(before);
      const body = lowerBlock(statement.body, context);
      const bodyInitialized = new Set(context.initialized);
      context.initialized = new Set(before);
      const alternative = lowerBlock(statement.alternative, context);
      const alternativeInitialized = statement.alternative == null
        ? before
        : new Set(context.initialized);
      context.initialized = new Set(
        Array.from(bodyInitialized).filter((name) =>
          alternativeInitialized.has(name)
        ),
      );
      result.push({
        kind: "if",
        condition: { operations: conditionOperations, value: condition.name },
        body,
        alternative,
      });
      continue;
    }
    if (nodeType(statement) === "AST_While") {
      context.scalarCoercions = new Map();
      expect(
        context,
        statement,
        statement.alternative === null || statement.alternative === undefined,
        "while/else is not yet supported",
      );
      const conditionOperations = [];
      const condition = lowerCondition(
        statement.condition,
        context,
        conditionOperations,
      );
      const before = new Set(context.initialized);
      context.initialized = new Set(before);
      const body = lowerBlock(statement.body, context);
      context.initialized = before;
      result.push({
        kind: "while",
        condition: { operations: conditionOperations, value: condition.name },
        body,
      });
      continue;
    }
    if (nodeType(statement) === "AST_ForIn") {
      expect(
        context,
        statement,
        nodeType(statement.init) === "AST_SymbolRef",
        "native range loop requires a local-name index",
      );
      const index = statement.init.name;
      ensureVariable(context, statement.init, index, "uint64");
      const before = new Set(context.initialized);
      context.initialized.add(index);
      const body = lowerBlock(statement.body, context);
      context.initialized = before;
      const hoisted = [];
      const loopBody = [];
      for (const operation of body) {
        if (
          operation.kind === "integer.constant" &&
          operation.target.startsWith("sagejs_native_tmp_")
        ) {
          hoisted.push(operation);
        } else {
          loopBody.push(operation);
        }
      }
      result.push(...hoisted, {
        kind: "loop.range",
        index,
        ...lowerRange(statement.object, context),
        body: loopBody,
      });
      continue;
    }
    fail(context, statement, `unsupported ${nodeType(statement)} statement`);
  }
  return result;
}

function containsReturn(statements) {
  for (const statement of statements) {
    if (statement.kind === "return") return true;
    if (
      (statement.kind === "if" &&
        (containsReturn(statement.body) ||
          containsReturn(statement.alternative))) ||
      ((statement.kind === "while" || statement.kind === "loop.range") &&
        containsReturn(statement.body))
    ) {
      return true;
    }
  }
  return false;
}

function lowerIntegerFunction(fn, signature, signatures, filename, decorated) {
  const context = createContext(
    fn,
    signature,
    signatures,
    filename,
    decorated,
  );
  const body = lowerStatements(array(fn.body), context);
  expect(context, fn, containsReturn(body), "function has no return");
  return {
    name: signature.name,
    decorated,
    kernelKind: "integer",
    params: signature.params,
    returnType: signature.returnType,
    locals: Array.from(context.locals, ([name, type]) => ({ name, type })),
    body,
    dependencies: Array.from(context.dependencies).sort(),
  };
}

module.exports = {
  canonicalType,
  isIntegerSignature,
  lowerIntegerFunction,
  signatureFromFunction,
};
