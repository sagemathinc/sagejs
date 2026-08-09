"use strict";

const {
  annotateOperations,
  sourceSpan,
} = require("./provenance.cjs");

const MAX_SMALL_POWER = 64n;
const TYPE_ALIASES = new Map([
  ["Integer", "Integer"],
  ["int", "Integer"],
  ["uint64", "uint64"],
  ["bool", "bool"],
  ["float", "Float64"],
  ["Float64", "Float64"],
  ["Float64Buffer", "Float64Buffer"],
  ["Float64Record", "Float64Record"],
  ["PrimeFieldElement", "PrimeFieldElement"],
  ["PrimeFieldMatrix", "PrimeFieldMatrix"],
  ["PrimeFieldDecomposition", "PrimeFieldDecomposition"],
  ["UInt64Buffer", "UInt64Buffer"],
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

function sequenceElements(node) {
  if (nodeType(node) === "AST_Array") return array(node.elements);
  if (nodeType(node) !== "AST_Seq") return undefined;
  const result = [node.car];
  let rest = node.cdr;
  while (nodeType(rest) === "AST_Seq") {
    result.push(rest.car);
    rest = rest.cdr;
  }
  result.push(rest);
  return result;
}

function tupleType(elements) {
  return `Tuple[${elements.join(",")}]`;
}

function tupleElementTypes(type) {
  if (typeof type !== "string" || !type.startsWith("Tuple[") ||
      !type.endsWith("]")) return undefined;
  const body = type.slice(6, -1);
  return body === "" ? [] : body.split(",");
}

function isTupleType(type) {
  return tupleElementTypes(type) !== undefined;
}

function canonicalType(annotation) {
  const raw = rawAnnotationName(annotation);
  const scalar = TYPE_ALIASES.get(raw);
  if (scalar !== undefined) return scalar;
  // ``from __future__ import annotations`` deliberately stores annotations as
  // strings.  Accept the same flat tuple grammar as the ordinary AST form so
  // native compilation does not depend on that module-level Python choice.
  if (nodeType(annotation) === "AST_String") {
    const match = /^(?:Tuple|tuple)\[([^\[\]]*)\]$/.exec(raw);
    if (match !== null) {
      const names = match[1].split(",").map((name) => name.trim());
      const types = names.map((name) => TYPE_ALIASES.get(name));
      if (types.length > 0 && types.every((type) => type !== undefined)) {
        return tupleType(types);
      }
    }
  }
  if (
    nodeType(annotation) !== "AST_ItemAccess" ||
    !["Tuple", "tuple"].includes(rawAnnotationName(annotation.expression))
  ) return undefined;
  const elements = sequenceElements(annotation.property) ||
    [annotation.property];
  const types = elements.map(canonicalType);
  if (types.some((type) => type === undefined || isTupleType(type))) {
    return undefined;
  }
  return tupleType(types);
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
  const defaults = fn.argnames?.defaults || {};
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
      !isTupleType(type),
      "tuple arguments are not yet supported by the native ABI",
    );
    expect(
      context,
      arg,
      isCIdentifier(arg.name),
      `argument ${arg.name} must also be a C identifier`,
    );
    const defaultNode = defaults[arg.name];
    let defaultValue;
    if (defaultNode !== undefined) {
      if (type === "Integer" || type === "uint64") {
        const value = integerLiteral(defaultNode);
        expect(
          context,
          defaultNode,
          value !== undefined,
          `default for ${arg.name} must be an integer literal`,
        );
        if (type === "uint64") {
          expect(
            context,
            defaultNode,
            value >= 0n && value <= 18446744073709551615n,
            `default for ${arg.name} is outside uint64`,
          );
        }
        defaultValue = value.toString();
      } else if (type === "bool") {
        defaultValue = booleanLiteral(defaultNode);
        expect(
          context,
          defaultNode,
          defaultValue !== undefined,
          `default for ${arg.name} must be a bool literal`,
        );
      } else {
        fail(context, defaultNode, "tuple arguments cannot have defaults");
      }
    }
    return { name: arg.name, type, default: defaultValue };
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
    isTupleType(signature.returnType) ||
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
    sequenceConstants: new Map(),
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

  if (name === "divmod") {
    expect(context, node, args.length === 2, "divmod() requires two arguments");
    const left = coerceInteger(
      lowerExpression(args[0], context, operations),
      context,
      args[0],
      operations,
    );
    const right = coerceInteger(
      lowerExpression(args[1], context, operations),
      context,
      args[1],
      operations,
    );
    const quotient = temporary(context, node, "Integer");
    const remainder = temporary(context, node, "Integer");
    operations.push({
      kind: "integer.divmod",
      quotient,
      remainder,
      left: left.name,
      right: right.name,
    });
    return {
      type: tupleType(["Integer", "Integer"]),
      elements: [
        { name: quotient, type: "Integer" },
        { name: remainder, type: "Integer" },
      ],
    };
  }

  if (name === "round") {
    expect(context, node, args.length === 1, "round() requires one argument");
    const sqrtCall = args[0];
    expect(
      context,
      sqrtCall,
      nodeType(sqrtCall) === "AST_Call" &&
        nodeType(sqrtCall.expression) === "AST_SymbolRef" &&
        sqrtCall.expression.name === "sqrt" &&
        array(sqrtCall.args).length === 1,
      "native round() currently supports round(sqrt(Integer))",
    );
    const sourceNode = array(sqrtCall.args)[0];
    const source = coerceInteger(
      lowerExpression(sourceNode, context, operations),
      context,
      sourceNode,
      operations,
    );
    const target = temporary(context, node, "Integer");
    operations.push({
      kind: "integer.round_sqrt",
      target,
      source: source.name,
    });
    return { name: target, type: "Integer" };
  }

  const signature = context.signatures.get(name);
  expect(context, node, signature !== undefined, `unsupported call to ${name}`);
  expect(
    context,
    node,
    args.length <= signature.params.length &&
      signature.params.slice(args.length).every(
        (param) => param.default !== undefined,
      ),
    `${name} expects ${signature.params.filter((param) => param.default === undefined).length}` +
      ` through ${signature.params.length} arguments, got ${args.length}`,
  );
  const lowered = signature.params.map((param, index) => {
    const arg = args[index];
    let value;
    if (arg === undefined) {
      if (param.type === "bool") {
        value = emitBoolean(context, node, operations, param.default);
      } else {
        value = emitConstant(
          context,
          node,
          operations,
          BigInt(param.default),
        );
      }
    } else {
      value = lowerExpression(arg, context, operations);
    }
    const expectedType = signature.params[index].type;
    if (expectedType === "Integer") {
      value = coerceInteger(value, context, arg || node, operations);
    }
    expect(
      context,
      arg || node,
      value.type === expectedType,
      `${name} argument ${index + 1} expects ${expectedType}, got ${value.type}`,
    );
    return value;
  });
  const returnElements = tupleElementTypes(signature.returnType);
  let result;
  if (returnElements !== undefined) {
    const elements = returnElements.map((type) => ({
      name: temporary(context, node, type),
      type,
    }));
    operations.push({
      kind: "native.call",
      results: elements,
      function: name,
      arguments: lowered,
      returnType: signature.returnType,
    });
    result = { type: signature.returnType, elements };
  } else {
    const target = temporary(context, node, signature.returnType);
    operations.push({
      kind: "native.call",
      target,
      function: name,
      arguments: lowered,
      returnType: signature.returnType,
    });
    result = { name: target, type: signature.returnType };
  }
  context.dependencies.add(name);
  return result;
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
  const elements = sequenceElements(node);
  if (elements !== undefined) {
    const lowered = elements.map((element) =>
      lowerExpression(element, context, operations)
    );
    expect(
      context,
      node,
      lowered.every((value) => !isTupleType(value.type)),
      "nested native tuples are not yet supported",
    );
    return {
      type: tupleType(lowered.map((value) => value.type)),
      elements: lowered,
    };
  }
  if (nodeType(node) === "AST_ItemAccess") {
    expect(
      context,
      node.expression,
      nodeType(node.expression) === "AST_SymbolRef" &&
        context.sequenceConstants.has(node.expression.name) &&
        context.initialized.has(node.expression.name),
      "native indexing currently requires a local constant sequence",
    );
    const index = coerceInteger(
      lowerExpression(node.property, context, operations),
      context,
      node.property,
      operations,
    );
    const target = temporary(context, node, "Integer");
    operations.push({
      kind: "integer.sequence.get",
      target,
      index: index.name,
      values: context.sequenceConstants.get(node.expression.name),
    });
    return { name: target, type: "Integer" };
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

function materializeValue(value, context, node, operations) {
  expect(
    context,
    node,
    !isTupleType(value.type),
    "cannot materialize a composite native value as a scalar",
  );
  const target = temporary(context, node, value.type);
  operations.push({
    kind: `${value.type.toLowerCase()}.copy`,
    target,
    source: value.name,
  });
  return { name: target, type: value.type };
}

function assignScalar(targetNode, value, context, operations) {
  expect(
    context,
    targetNode,
    nodeType(targetNode) === "AST_SymbolRef",
    "native assignment targets must be local names",
  );
  ensureVariable(context, targetNode, targetNode.name, value.type);
  operations.push({
    kind: `${value.type.toLowerCase()}.copy`,
    target: targetNode.name,
    source: value.name,
  });
  context.initialized.add(targetNode.name);
}

function lowerAssignment(statement, context) {
  context.scalarCoercions = new Map();
  const assign = statement.body;
  expect(
    context,
    statement,
    nodeType(statement) === "AST_SimpleStatement" &&
      nodeType(assign) === "AST_Assign",
    "native assignments require an assignment statement",
  );
  const operations = [];
  if (assign.operator === "=") {
    if (
      nodeType(assign.left) === "AST_SymbolRef" &&
      nodeType(assign.right) === "AST_Array" &&
      !assign.right.is_tuple
    ) {
      const constants = array(assign.right.elements).map((element) => {
        const value = integerLiteral(element);
        expect(
          context,
          element,
          value !== undefined,
          "native sequence constants require integer literal elements",
        );
        return value.toString();
      });
      const target = assign.left.name;
      const type = `IntegerSequence[${constants.length}]`;
      ensureVariable(context, assign.left, target, type);
      context.sequenceConstants.set(target, constants);
      context.initialized.add(target);
      return operations;
    }
    const value = lowerExpression(assign.right, context, operations);
    const targets = sequenceElements(assign.left);
    if (targets !== undefined) {
      expect(
        context,
        assign.left,
        isTupleType(value.type) && value.elements.length === targets.length,
        `cannot unpack ${value.type} into ${targets.length} targets`,
      );
      const snapshots = value.elements.map((element) =>
        materializeValue(element, context, assign.right, operations)
      );
      targets.forEach((target, index) =>
        assignScalar(target, snapshots[index], context, operations)
      );
      return operations;
    }
    expect(
      context,
      assign.left,
      !isTupleType(value.type),
      "a native tuple value must be unpacked",
    );
    assignScalar(assign.left, value, context, operations);
    return operations;
  }
  expect(
    context,
    assign.left,
    nodeType(assign.left) === "AST_SymbolRef",
    "augmented native assignments require a local-name target",
  );
  const target = assign.left.name;
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
    args.length >= 1 && args.length <= 3,
    "native range currently accepts one through three arguments",
  );
  const start = args.length === 1 ? 0n : integerLiteral(args[0]);
  const countNode = args.length === 1 ? args[0] : args[1];
  const step = args.length === 3 ? integerLiteral(args[2]) : 1n;
  expect(
    context,
    args[2] || node,
    step !== undefined && step > 0n &&
      step <= BigInt(Number.MAX_SAFE_INTEGER),
    "native range step must be a positive integer literal",
  );
  let countName;
  let boundIsStop = false;
  if (
    start !== undefined && start >= 0n &&
    start <= BigInt(Number.MAX_SAFE_INTEGER) &&
    nodeType(countNode) === "AST_SymbolRef" &&
    context.variables.get(countNode.name) === "uint64"
  ) {
    countName = countNode.name;
    boundIsStop = true;
  } else if (
    start !== undefined && start >= 0n &&
    start <= BigInt(Number.MAX_SAFE_INTEGER) &&
    nodeType(countNode) === "AST_Binary" &&
    countNode.operator === "+" &&
    nodeType(countNode.left) === "AST_SymbolRef" &&
    context.variables.get(countNode.left.name) === "uint64" &&
    integerLiteral(countNode.right) === start
  ) {
    countName = countNode.left.name;
  }
  if (countName !== undefined) {
    return {
      kind: "loop.range",
      start: Number(start),
      count: countName,
      boundIsStop,
      step: Number(step),
      indexType: "uint64",
      operations: [],
    };
  }

  expect(
    context,
    args[2] || node,
    step === 1n,
    "native range step currently requires a uint64 stop",
  );

  const operations = [];
  const startNode = args.length === 1 ? null : args[0];
  let startValue = startNode === null
    ? emitConstant(context, node, operations, 0n)
    : lowerExpression(startNode, context, operations);
  let stopValue = lowerExpression(countNode, context, operations);
  startValue = coerceInteger(startValue, context, startNode || node, operations);
  stopValue = coerceInteger(stopValue, context, countNode, operations);
  return {
    kind: "loop.range_exact",
    start: startValue.name,
    stop: stopValue.name,
    indexType: "Integer",
    operations,
  };
}

function lowerStatements(statements, context) {
  const result = [];
  for (const statement of statements) {
    if (nodeType(statement) === "AST_SimpleStatement") {
      const operations = lowerAssignment(statement, context);
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
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
      operations.push(isTupleType(value.type) ? {
        kind: "return",
        values: value.elements.map((element) => element.name),
        type: value.type,
      } : {
        kind: "return",
        value: value.name,
        type: value.type,
      });
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
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
      const operation = {
        kind: "if",
        condition: { operations: conditionOperations, value: condition.name },
        body,
        alternative,
      };
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(operation);
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
      const operation = {
        kind: "while",
        condition: { operations: conditionOperations, value: condition.name },
        body,
      };
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(operation);
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
      const range = lowerRange(statement.object, context);
      ensureVariable(context, statement.init, index, range.indexType);
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
      const operations = [...range.operations, ...hoisted, {
        kind: range.kind,
        index,
        ...(range.kind === "loop.range"
          ? {
              start: range.start,
              count: range.count,
              step: range.step,
              boundIsStop: range.boundIsStop,
            }
          : { start: range.start, stop: range.stop }),
        body: loopBody,
      }];
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
      continue;
    }
    if (nodeType(statement) === "AST_Throw") {
      expect(
        context,
        statement,
        nodeType(statement.value) === "AST_SymbolRef" &&
          statement.value.name === "ZeroDivisionError",
        "native raise currently supports ZeroDivisionError",
      );
      const operation = {
        kind: "raise",
        exception: "ZeroDivisionError",
        message: "division by zero",
      };
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(operation);
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
      ((statement.kind === "while" || statement.kind === "loop.range" ||
        statement.kind === "loop.range_exact") &&
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
  isTupleType,
  lowerIntegerFunction,
  signatureFromFunction,
  tupleElementTypes,
};
