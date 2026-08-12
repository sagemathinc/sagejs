"use strict";

const {
  annotateOperations,
  sourceSpan,
} = require("./provenance.cjs");
const {
  uint64BitwiseOperation,
} = require("./uint64-operations.cjs");

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
  ["IntegerBuffer", "IntegerBuffer"],
  ["Int64Buffer", "Int64Buffer"],
  ["Int64Record", "Int64Record"],
  ["PrimeFieldElement", "PrimeFieldElement"],
  ["PrimeFieldMatrix", "PrimeFieldMatrix"],
  ["PrimeFieldDecomposition", "PrimeFieldDecomposition"],
  ["PrimeFieldModulus", "PrimeModulusValue"],
  ["UInt64Buffer", "UInt64Buffer"],
]);
const INT64_BUFFER_TYPES = new Set(["Int64Buffer", "Int64Record"]);
const EXACT_BUFFER_TYPES = new Set([...INT64_BUFFER_TYPES, "IntegerBuffer"]);
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

function canonicalType(
  annotation,
  recordTypes = new Map(),
  foreignResourceTypes = new Map(),
) {
  const raw = rawAnnotationName(annotation);
  if (recordTypes.has(raw)) return `Record:${raw}`;
  if (foreignResourceTypes.has(raw)) return raw;
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
  const types = elements.map((element) =>
    canonicalType(element, recordTypes)
  );
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

function signatureFromFunction(
  fn,
  filename,
  recordTypes = new Map(),
  foreignResourceTypes = new Map(),
) {
  const context = { filename, functionName: fn.name?.name || "<function>" };
  expect(
    context,
    fn,
    isCIdentifier(fn.name?.name),
    "function name must also be a C identifier",
  );
  const defaults = fn.argnames?.defaults || {};
  const params = array(fn.argnames).map((arg) => {
    expect(
      context,
      arg,
      arg.annotation !== undefined && arg.annotation !== null,
      `parameter ${arg.name} requires a native type annotation`,
    );
    const type = canonicalType(
      arg.annotation,
      recordTypes,
      foreignResourceTypes,
    );
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
  const returnType = canonicalType(
    fn.return_annotation,
    recordTypes,
    foreignResourceTypes,
  );
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
    signature.returnType === "uint64" ||
    signature.returnType === "bool" ||
    isTupleType(signature.returnType) ||
    signature.params.some(
      (param) => param.type === "Integer" || param.type === "bool" ||
        param.type === "uint64" ||
        param.type === "UInt64Buffer" || EXACT_BUFFER_TYPES.has(param.type),
    )
  );
}

function copyKind(type) {
  if (type === "IntegerBuffer") return "integer.buffer.copy";
  return INT64_BUFFER_TYPES.has(type)
    ? "int64.buffer.copy"
    : `${type.toLowerCase()}.copy`;
}

function createContext(
  fn,
  signature,
  signatures,
  foreignFunctions,
  importedForeignResources,
  filename,
  decorated,
) {
  const variables = new Map(
    signature.params.map((param) => [param.name, param.type]),
  );
  const foreignResources = new Map();
  for (const foreign of foreignFunctions.values()) {
    for (const resource of foreign.resources || []) {
      foreignResources.set(resource.python_name, resource);
    }
  }
  for (const [name, resource] of importedForeignResources) {
    foreignResources.set(name, resource);
  }
  const usedForeignResources = new Map();
  for (const type of [
    signature.returnType,
    ...signature.params.map((parameter) => parameter.type),
  ]) {
    const resource = foreignResources.get(type);
    if (resource !== undefined) usedForeignResources.set(type, resource);
  }
  return {
    decorated,
    dependencies: new Set(),
    foreignDependencies: new Set(),
    foreignFunctions,
    foreignResources,
    filename,
    functionName: signature.name,
    initialized: new Set(signature.params.map((param) => param.name)),
    controlDepth: 0,
    locals: new Map(),
    nextTemporary: 0,
    params: signature.params,
    resourceAliases: new Map(),
    returnType: signature.returnType,
    scalarCoercions: new Map(),
    sequenceConstants: new Map(),
    signatures,
    symbolAliases: new Map(),
    usedForeignResources,
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

function emitUint64Constant(context, node, operations, value) {
  expect(
    context,
    node,
    value >= 0n && value <= 18446744073709551615n,
    "uint64 literal is outside unsigned 64-bit",
  );
  const target = temporary(context, node, "uint64");
  operations.push({
    kind: "uint64.constant",
    target,
    value: value.toString(),
  });
  return { name: target, type: "uint64" };
}

function lowerUint64Operand(node, context, operations) {
  const literal = integerLiteral(node);
  if (literal !== undefined) {
    return emitUint64Constant(context, node, operations, literal);
  }
  return lowerExpression(node, context, operations);
}

function emitBoolean(context, node, operations, value) {
  const target = temporary(context, node, "bool");
  operations.push({ kind: "bool.constant", target, value });
  return { name: target, type: "bool" };
}

function resolvedSymbol(context, name) {
  return context.symbolAliases.get(name) || name;
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

/*
 * Lower the useful mathematical spelling
 *
 *     sum(expression for index in range(...), start)
 *
 * directly to the same counted-loop IR as a handwritten accumulator.  This
 * is a source construct, not a call to the host's ``sum`` implementation: the
 * complete producer, reduction, and compiled dependency graph remain inside
 * the isolated core.  A hidden index preserves Python 3 comprehension scope,
 * including when the surrounding function already has a local of the same
 * name.
 */
function lowerExactSum(node, args, context, operations) {
  expect(
    context,
    node,
    args.length === 1 || args.length === 2,
    "native sum() accepts an exact comprehension and optional start",
  );
  const comprehension = args[0];
  expect(
    context,
    comprehension,
    nodeType(comprehension) === "AST_GeneratorComprehension" ||
      nodeType(comprehension) === "AST_ListComprehension",
    "native sum() currently requires a range comprehension",
  );
  const clauses = array(comprehension.clauses);
  expect(
    context,
    comprehension,
    clauses.length === 1,
    "native sum() currently supports one range-comprehension clause",
  );
  const clause = clauses[0];
  const indexNode = clause.init || comprehension.init;
  const iterable = clause.object || comprehension.object;
  expect(
    context,
    indexNode,
    nodeType(indexNode) === "AST_SymbolRef",
    "native sum() comprehension requires a local-name index",
  );

  // Python evaluates the outermost generator iterable before the optional
  // start argument.  Retain that order even though native range bounds are
  // normally pure scalar expressions.
  const range = lowerRange(iterable, context);
  operations.push(...range.operations);
  const initialOperations = [];
  let initial = args.length === 2
    ? lowerExpression(args[1], context, initialOperations)
    : emitConstant(context, node, initialOperations, 0n);
  initial = coerceInteger(
    initial,
    context,
    args[1] || node,
    initialOperations,
  );
  operations.push(...initialOperations);
  const accumulator = temporary(context, node, "Integer");
  operations.push({
    kind: "integer.copy",
    target: accumulator,
    source: initial.name,
  });

  const hiddenIndex = temporary(context, indexNode, range.indexType);
  const sourceIndex = indexNode.name;
  const previousAlias = context.symbolAliases.get(sourceIndex);
  const initializedBefore = new Set(context.initialized);
  context.symbolAliases.set(sourceIndex, hiddenIndex);
  context.initialized.add(hiddenIndex);
  context.controlDepth += 1;

  let condition;
  if (comprehension.condition !== undefined &&
      comprehension.condition !== null) {
    const conditionOperations = [];
    const value = lowerCondition(
      comprehension.condition,
      context,
      conditionOperations,
    );
    condition = { operations: conditionOperations, value: value.name };
  }
  const reductionOperations = [];
  let value = lowerExpression(
    comprehension.statement,
    context,
    reductionOperations,
  );
  value = coerceInteger(
    value,
    context,
    comprehension.statement,
    reductionOperations,
  );
  reductionOperations.push({
    kind: "integer.binary",
    operation: "add",
    target: accumulator,
    left: accumulator,
    right: value.name,
  });
  context.controlDepth -= 1;
  context.initialized = initializedBefore;
  if (previousAlias === undefined) context.symbolAliases.delete(sourceIndex);
  else context.symbolAliases.set(sourceIndex, previousAlias);

  // Match ordinary range-loop lowering by lifting immutable exact constants
  // out of the hot loop.  Conditions and producer expressions keep their
  // original relative evaluation order for every iteration.
  const hoisted = [];
  const retain = (body) => body.filter((operation) => {
    if (operation.kind === "integer.constant" &&
        operation.target.startsWith("sagejs_native_tmp_")) {
      hoisted.push(operation);
      return false;
    }
    return true;
  });
  if (condition !== undefined) {
    condition.operations = retain(condition.operations);
  }
  const reducedBody = retain(reductionOperations);
  const body = condition === undefined
    ? reducedBody
    : [{ kind: "if", condition, body: reducedBody, alternative: [] }];
  operations.push(...hoisted, {
    kind: range.kind,
    index: hiddenIndex,
    ...(range.kind === "loop.range"
      ? {
          start: range.start,
          count: range.count,
          step: range.step,
          boundIsStop: range.boundIsStop,
        }
      : { start: range.start, stop: range.stop }),
    body,
  });
  return { name: accumulator, type: "Integer" };
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

  // An explicit module import shadows a builtin with the same local name,
  // exactly as it does in Python. The declaration identity, rather than that
  // local spelling, determines the native operation.
  const foreign = context.foreignFunctions.get(name);
  if (foreign !== undefined) {
    const signature = foreign.function.signature;
    for (const type of [
      signature.return_type,
      ...signature.parameters.map((parameter) => parameter.type),
    ]) {
      const resource = context.foreignResources.get(type);
      if (resource !== undefined) {
        context.usedForeignResources.set(type, resource);
      }
    }
    expect(
      context,
      node,
      foreign.function.targets.native,
      `${foreign.declarationId} is not available to native kernels`,
    );
    expect(
      context,
      node,
      args.length === signature.parameters.length,
      `${name} expects ${signature.parameters.length} arguments, got ${args.length}`,
    );
    const lowered = signature.parameters.map((param, index) => {
      let value = lowerExpression(args[index], context, operations);
      if (param.type === "Integer") {
        value = coerceInteger(value, context, args[index], operations);
      }
      expect(
        context,
        args[index],
        value.type === param.type,
        `${name} argument ${index + 1} expects ${param.type}, got ${value.type}`,
      );
      return value;
    });
    const target = temporary(context, node, signature.return_type);
    if (context.foreignResources.has(signature.return_type)) {
      expect(
        context,
        node,
        context.controlDepth === 0,
        "owned FFI resources must be created in the top-level native block",
      );
    }
    operations.push({
      kind: "ffi.call",
      target,
      arguments: lowered,
      returnType: signature.return_type,
      foreign,
    });
    context.foreignDependencies.add(foreign.declarationIdentity);
    return { name: target, type: signature.return_type };
  }

  if (name === "sum" && !context.signatures.has(name)) {
    const keywords = array(node.args?.kwargs);
    expect(
      context,
      node,
      array(node.args?.kwarg_items).length === 0 && !node.args?.starargs &&
        keywords.length <= 1 &&
        keywords.every(([keyword]) => keyword?.name === "start") &&
        !(args.length === 2 && keywords.length === 1),
      "native sum() only accepts one optional positional or keyword start",
    );
    const reductionArgs = keywords.length === 0
      ? args
      : [...args, keywords[0][1]];
    return lowerExactSum(node, reductionArgs, context, operations);
  }

  if (name === "len") {
    expect(context, node, args.length === 1, "len() requires one argument");
    const buffer = lowerExpression(args[0], context, operations);
    expect(
      context,
      args[0],
      EXACT_BUFFER_TYPES.has(buffer.type),
      "exact len() requires an IntegerBuffer, Int64Buffer, or Int64Record",
    );
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: buffer.type === "IntegerBuffer"
        ? "integer.buffer.length"
        : "int64.buffer.length",
      target,
      buffer: buffer.name,
      bufferType: buffer.type,
    });
    return { name: target, type: "uint64" };
  }

  if (name === "int64_record") {
    expect(
      context,
      node,
      args.length === 3,
      "int64_record() requires a buffer, start, and length",
    );
    const buffer = lowerExpression(args[0], context, operations);
    expect(
      context,
      args[0],
      buffer.type === "Int64Buffer",
      "int64_record() requires an Int64Buffer",
    );
    const start = coerceInteger(
      lowerExpression(args[1], context, operations),
      context,
      args[1],
      operations,
    );
    const length = coerceInteger(
      lowerExpression(args[2], context, operations),
      context,
      args[2],
      operations,
    );
    const target = temporary(context, node, "Int64Record");
    operations.push({
      kind: "int64.record.view",
      target,
      buffer: buffer.name,
      start: start.name,
      length: length.name,
    });
    return { name: target, type: "Int64Record" };
  }

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
    const name = resolvedSymbol(context, node.name);
    const type = context.variables.get(name);
    expect(context, node, type !== undefined, `unknown native value ${node.name}`);
    expect(
      context,
      node,
      context.initialized.has(name),
      `native value ${node.name} may be uninitialized`,
    );
    return {
      name: context.resourceAliases.get(name) || name,
      type,
    };
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
    const bufferType = nodeType(node.expression) === "AST_SymbolRef"
      ? context.variables.get(node.expression.name)
      : undefined;
    if (EXACT_BUFFER_TYPES.has(bufferType)) {
      const buffer = lowerExpression(node.expression, context, operations);
      const index = coerceInteger(
        lowerExpression(node.property, context, operations),
        context,
        node.property,
        operations,
      );
      const target = temporary(context, node, "Integer");
      operations.push({
        kind: buffer.type === "IntegerBuffer"
          ? "integer.buffer.get"
          : "int64.buffer.get",
        target,
        buffer: buffer.name,
        bufferType: buffer.type,
        index: index.name,
      });
      return { name: target, type: "Integer" };
    }
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
    let left = lowerExpression(node.left, context, operations);
    let right = lowerExpression(node.right, context, operations);
    if (left.type === "uint64" && right.type === "uint64") {
      const target = temporary(context, node, "uint64");
      operations.push({
        kind: "uint64.binary",
        operation: arithmetic,
        target,
        left: left.name,
        right: right.name,
      });
      return { name: target, type: "uint64" };
    }
    left = coerceInteger(
      left,
      context,
      node.left,
      operations,
    );
    right = coerceInteger(
      right,
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

  const bitwise = uint64BitwiseOperation(node.operator);
  if (bitwise !== undefined) {
    const left = lowerUint64Operand(node.left, context, operations);
    const right = lowerUint64Operand(node.right, context, operations);
    expect(
      context,
      node,
      left.type === "uint64" && right.type === "uint64",
      `uint64 operator ${node.operator} requires uint64 operands`,
    );
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: "uint64.binary",
      operation: bitwise,
      target,
      left: left.name,
      right: right.name,
    });
    return { name: target, type: "uint64" };
  }

  const comparison = COMPARISONS.get(node.operator);
  if (comparison !== undefined) {
    let left = lowerExpression(node.left, context, operations);
    let right = lowerExpression(node.right, context, operations);
    if (left.type === "uint64" && right.type === "uint64") {
      const target = temporary(context, node, "bool");
      operations.push({
        kind: "uint64.compare",
        operation: comparison,
        target,
        left: left.name,
        right: right.name,
      });
      return { name: target, type: "bool" };
    }
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
    kind: copyKind(value.type),
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
  if (context.foreignResources.has(value.type)) {
    context.resourceAliases.set(
      targetNode.name,
      context.resourceAliases.get(value.name) || value.name,
    );
    context.initialized.add(targetNode.name);
    return;
  }
  operations.push({
    kind: copyKind(value.type),
    target: targetNode.name,
    source: value.name,
  });
  context.initialized.add(targetNode.name);
}

function lowerBufferAssignment(item, right, operator, context) {
  const operations = [];
  const buffer = lowerExpression(item.expression, context, operations);
  expect(
    context,
    item.expression,
    EXACT_BUFFER_TYPES.has(buffer.type),
    "indexed exact assignment requires an exact integer buffer",
  );
  const index = coerceInteger(
    lowerExpression(item.property, context, operations),
    context,
    item.property,
    operations,
  );
  let value = coerceInteger(
    lowerExpression(right, context, operations),
    context,
    right,
    operations,
  );
  if (operator !== "=") {
    const arithmetic = INTEGER_BINARY.get(
      operator.endsWith("=") ? operator.slice(0, -1) : "",
    );
    expect(
      context,
      item,
      arithmetic !== undefined,
      `unsupported indexed augmented operator ${operator}`,
    );
    const current = temporary(context, item, "Integer");
    operations.push({
      kind: buffer.type === "IntegerBuffer"
        ? "integer.buffer.get"
        : "int64.buffer.get",
      target: current,
      buffer: buffer.name,
      bufferType: buffer.type,
      index: index.name,
    });
    const target = temporary(context, item, "Integer");
    operations.push({
      kind: "integer.binary",
      operation: arithmetic,
      target,
      left: current,
      right: value.name,
    });
    value = { name: target, type: "Integer" };
  }
  operations.push({
    kind: buffer.type === "IntegerBuffer"
      ? "integer.buffer.set"
      : "int64.buffer.set",
    buffer: buffer.name,
    bufferType: buffer.type,
    index: index.name,
    value: value.name,
  });
  return operations;
}

function lowerAssignment(statement, context) {
  context.scalarCoercions = new Map();
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
      ["Integer", "uint64", "bool"].includes(declaredType),
      "native exact local annotation must be Integer, int, uint64, or bool",
    );
    const operations = [];
    let value = lowerExpression(assign.value, context, operations);
    if (declaredType === "uint64" && value.type === "Integer") {
      const literal = integerLiteral(assign.value);
      if (literal !== undefined) {
        operations.length = 0;
        value = emitUint64Constant(
          context, assign.value, operations, literal,
        );
      }
    }
    if (declaredType === "Integer") {
      value = coerceInteger(value, context, assign.value, operations);
    }
    expect(
      context,
      assign.value,
      value.type === declaredType,
      `local ${assign.target.name} declares ${declaredType}, got ${value.type}`,
    );
    assignScalar(assign.target, value, context, operations);
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
  expect(
    context,
    statement,
    nodeType(statement) === "AST_SimpleStatement" &&
      nodeType(assign) === "AST_Assign",
    "native assignments require an assignment statement",
  );
  const operations = [];
  if (assign.operator === "=") {
    if (nodeType(assign.left) === "AST_ItemAccess") {
      return lowerBufferAssignment(
        assign.left,
        assign.right,
        assign.operator,
        context,
      );
    }
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
  if (nodeType(assign.left) === "AST_ItemAccess") {
    return lowerBufferAssignment(
      assign.left,
      assign.right,
      assign.operator,
      context,
    );
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
  const bitwise = uint64BitwiseOperation(symbol);
  expect(
    context,
    assign,
    operation !== undefined || bitwise !== undefined,
    `unsupported augmented operator ${assign.operator}`,
  );
  const type = context.variables.get(target);
  if (type === "uint64" && bitwise !== undefined) {
    expect(
      context,
      assign.left,
      context.initialized.has(target),
      `augmented target ${target} must be an initialized uint64`,
    );
    const right = lowerUint64Operand(assign.right, context, operations);
    expect(
      context,
      assign.right,
      right.type === "uint64",
      `uint64 augmented operator ${assign.operator} requires a uint64 operand`,
    );
    operations.push({
      kind: "uint64.binary",
      operation: bitwise,
      target,
      left: target,
      right: right.name,
    });
    return operations;
  }
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
    context.variables.get(resolvedSymbol(context, countNode.name)) === "uint64"
  ) {
    countName = resolvedSymbol(context, countNode.name);
    boundIsStop = true;
  } else if (
    start !== undefined && start >= 0n &&
    start <= BigInt(Number.MAX_SAFE_INTEGER) &&
    nodeType(countNode) === "AST_Binary" &&
    countNode.operator === "+" &&
    nodeType(countNode.left) === "AST_SymbolRef" &&
    context.variables.get(
      resolvedSymbol(context, countNode.left.name),
    ) === "uint64" &&
    integerLiteral(countNode.right) === start
  ) {
    countName = resolvedSymbol(context, countNode.left.name);
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
      if (nodeType(statement.body) === "AST_Call") {
        const operations = [];
        lowerExpression(statement.body, context, operations);
        fail(
          context,
          statement,
          "native expression statements are unsupported; " +
            "host callbacks are prohibited",
        );
      }
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
      const returnedResource = context.foreignResources.get(value.type);
      if (returnedResource !== undefined) {
        expect(
          context,
          statement,
          returnedResource.ownership === "owned" &&
            context.locals.has(value.name),
          "native resource returns must transfer a newly owned local resource",
        );
      }
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
      context.controlDepth += 1;
      const body = lowerBlock(statement.body, context);
      context.controlDepth -= 1;
      const bodyInitialized = new Set(context.initialized);
      context.initialized = new Set(before);
      context.controlDepth += 1;
      const alternative = lowerBlock(statement.alternative, context);
      context.controlDepth -= 1;
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
      context.controlDepth += 1;
      const body = lowerBlock(statement.body, context);
      context.controlDepth -= 1;
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
      context.controlDepth += 1;
      const body = lowerBlock(statement.body, context);
      context.controlDepth -= 1;
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

function lowerIntegerFunction(
  fn,
  signature,
  signatures,
  foreignFunctions,
  importedForeignResources,
  filename,
  decorated,
) {
  const context = createContext(
    fn,
    signature,
    signatures,
    foreignFunctions,
    importedForeignResources,
    filename,
    decorated,
  );
  const body = lowerStatements(array(fn.body), context);
  expect(context, fn, containsReturn(body), "function has no return");
  const publicParams = signature.params.map((param) => {
    const resource = context.foreignResources.get(param.type);
    if (resource === undefined) return param;
    return {
      ...param,
      resourceIdentity: `resource:${resource.declaration_identity}:${resource.id}`,
    };
  });
  return {
    name: signature.name,
    decorated,
    kernelKind: "integer",
    sourceTransparent: true,
    params: publicParams,
    returnType: signature.returnType,
    locals: Array.from(context.locals, ([name, type]) => ({ name, type })),
    body,
    dependencies: Array.from(context.dependencies).sort(),
    foreignDependencies: Array.from(context.foreignDependencies).sort(),
    foreignResources: Array.from(context.usedForeignResources.values()),
    resourceAliases: Object.fromEntries(context.resourceAliases),
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
