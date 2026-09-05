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
  ["NativeIntegerVector", "NativeIntegerVector"],
]);
const INT64_BUFFER_TYPES = new Set(["Int64Buffer", "Int64Record"]);
const EXACT_BUFFER_TYPES = new Set([...INT64_BUFFER_TYPES, "IntegerBuffer"]);
const BORROWED_BUFFER_TYPES = new Set([...EXACT_BUFFER_TYPES, "UInt64Buffer"]);
const LIVE_INTEGER_VECTOR_TYPE = "NativeIntegerVector";
const LIVE_INTEGER_MATRIX_TYPE = "NativeIntegerMatrix";
const LIVE_EXACT_ARENA_TYPE = "NativeExactArena";
const LIVE_RECORD_VECTOR_PREFIX = "NativeRecordVector:";
const LIVE_BOUNDED_MAP_PREFIX = "NativeBoundedMap:";
const LIVE_BOUNDED_SET_PREFIX = "NativeBoundedSet:";
const LIVE_SPARSE_INTEGER_ROWS_TYPE = "NativeSparseIntegerRows";
const LIVE_EXACT_OWNER_TYPES = new Set([
  LIVE_EXACT_ARENA_TYPE,
  LIVE_INTEGER_VECTOR_TYPE,
  LIVE_INTEGER_MATRIX_TYPE,
  LIVE_SPARSE_INTEGER_ROWS_TYPE,
]);

function liveRecordVectorType(record) {
  return `${LIVE_RECORD_VECTOR_PREFIX}${record}`;
}

function recordVectorNameFromType(type) {
  return typeof type === "string" && type.startsWith(LIVE_RECORD_VECTOR_PREFIX)
    ? type.slice(LIVE_RECORD_VECTOR_PREFIX.length)
    : undefined;
}

function boundedCollectionType(kind, record) {
  return `${kind === "map" ? LIVE_BOUNDED_MAP_PREFIX : LIVE_BOUNDED_SET_PREFIX}` +
    record;
}

function boundedCollectionFromType(type) {
  if (typeof type !== "string") return undefined;
  if (type.startsWith(LIVE_BOUNDED_MAP_PREFIX)) {
    return { kind: "map", record: type.slice(LIVE_BOUNDED_MAP_PREFIX.length) };
  }
  if (type.startsWith(LIVE_BOUNDED_SET_PREFIX)) {
    return { kind: "set", record: type.slice(LIVE_BOUNDED_SET_PREFIX.length) };
  }
  return undefined;
}

function isLiveExactOwnerType(type) {
  return LIVE_EXACT_OWNER_TYPES.has(type) ||
    recordVectorNameFromType(type) !== undefined ||
    boundedCollectionFromType(type) !== undefined;
}
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
        param.type === LIVE_INTEGER_VECTOR_TYPE ||
        param.type === "UInt64Buffer" || EXACT_BUFFER_TYPES.has(param.type),
    )
  );
}

function copyKind(type) {
  if (type.startsWith("Record:")) return "record.copy";
  if (type === "IntegerBuffer") return "integer.buffer.copy";
  if (type === "UInt64Buffer") return "uint64.buffer.copy";
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
  records,
  filename,
  decorated,
  integerConstants = new Map(),
  canonicalForeignResources = new Map(),
) {
  const variables = new Map(
    signature.params.map((param) => [param.name, param.type]),
  );
  const foreignResources = new Map(canonicalForeignResources);
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
    integerConstants,
    controlDepth: 0,
    loopDepth: 0,
    loopTargets: [],
    resourceScopeDepth: 0,
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
    activeIntegerVectors: new Set(
      signature.params
        .filter((param) => param.type === LIVE_INTEGER_VECTOR_TYPE)
        .map((param) => param.name),
    ),
    activeIntegerMatrices: new Set(),
    activeRecordVectors: new Map(),
    activeBoundedCollections: new Map(),
    activeSparseIntegerRows: new Set(),
    activeExactArenas: new Map(),
    activeArenaForeignResources: new Set(),
    records,
    fn,
  };
}

function recordSchema(context, node, name) {
  const record = context.records.get(name);
  expect(context, node, record !== undefined, `unknown native record ${name}`);
  return record;
}

function liveRecordVector(node, context) {
  expect(
    context,
    node,
    nodeType(node) === "AST_SymbolRef",
    "live record-vector operation requires a NativeRecordVector local",
  );
  const recordName = recordVectorNameFromType(context.variables.get(node.name));
  const active = context.activeRecordVectors.get(node.name);
  expect(
    context,
    node,
    recordName !== undefined && active?.name === recordName &&
      context.initialized.has(node.name),
    `NativeRecordVector ${node.name} is outside its lexical scope`,
  );
  return { owner: node.name, record: active };
}

function liveBoundedCollection(node, context) {
  expect(
    context,
    node,
    nodeType(node) === "AST_SymbolRef",
    "bounded map/set operation requires a compiler-owned local",
  );
  const type = boundedCollectionFromType(context.variables.get(node.name));
  const active = context.activeBoundedCollections.get(node.name);
  expect(
    context,
    node,
    type !== undefined && active?.kind === type.kind &&
      active?.record.name === type.record && context.initialized.has(node.name),
    `NativeBoundedMap/Set ${node.name} is outside its lexical scope`,
  );
  return { owner: node.name, ...active };
}

function liveSparseIntegerRowsName(node, context) {
  expect(
    context,
    node,
    nodeType(node) === "AST_SymbolRef" &&
      context.variables.get(node.name) === LIVE_SPARSE_INTEGER_ROWS_TYPE,
    "sparse-row operation requires a compiler-owned local",
  );
  expect(
    context,
    node,
    context.activeSparseIntegerRows.has(node.name) &&
      context.initialized.has(node.name),
    `NativeSparseIntegerRows ${node.name} is outside its lexical scope`,
  );
  return node.name;
}

function liveExactArenaName(node, context) {
  expect(
    context,
    node,
    nodeType(node) === "AST_SymbolRef" &&
      context.variables.get(node.name) === LIVE_EXACT_ARENA_TYPE,
    "live exact-arena operation requires a NativeExactArena local",
  );
  expect(
    context,
    node,
    context.activeExactArenas.has(node.name) &&
      context.initialized.has(node.name),
    `NativeExactArena ${node.name} is outside its lexical scope`,
  );
  return node.name;
}

function liveIntegerVectorName(node, context) {
  expect(
    context,
    node,
    nodeType(node) === "AST_SymbolRef" &&
      context.variables.get(node.name) === LIVE_INTEGER_VECTOR_TYPE,
    "live exact-vector operation requires a NativeIntegerVector local",
  );
  expect(
    context,
    node,
    context.activeIntegerVectors.has(node.name) &&
      context.initialized.has(node.name),
    `NativeIntegerVector ${node.name} is outside its lexical scope`,
  );
  return node.name;
}

function liveIntegerMatrixName(node, context) {
  expect(
    context,
    node,
    nodeType(node) === "AST_SymbolRef" &&
      context.variables.get(node.name) === LIVE_INTEGER_MATRIX_TYPE,
    "live exact-matrix operation requires a NativeIntegerMatrix local",
  );
  expect(
    context,
    node,
    context.activeIntegerMatrices.has(node.name) &&
      context.initialized.has(node.name),
    `NativeIntegerMatrix ${node.name} is outside its lexical scope`,
  );
  return node.name;
}

function lowerLiveVectorIndex(node, context, operations) {
  const literal = integerLiteral(node);
  const value = literal !== undefined && literal >= 0n &&
      literal <= 18446744073709551615n
    ? emitUint64Constant(context, node, operations, literal)
    : lowerExpression(node, context, operations);
  expect(
    context,
    node,
    value.type === "uint64" || value.type === "Integer",
    "NativeIntegerVector index must be an exact integer",
  );
  return value;
}

function lowerLiveMatrixIndices(node, context, operations) {
  const indices = sequenceElements(node);
  expect(
    context,
    node,
    indices !== undefined && indices.length === 2,
    "NativeIntegerMatrix indexing requires row, column",
  );
  return indices.map((index) =>
    lowerLiveVectorIndex(index, context, operations)
  );
}

function liveVectorMethod(call) {
  return nodeType(call) === "AST_Call" &&
    nodeType(call.expression) === "AST_Dot" &&
    nodeType(call.expression.expression) === "AST_SymbolRef"
    ? {
        owner: call.expression.expression,
        method: call.expression.property,
      }
    : undefined;
}

function lowerLiveVectorMethodStatement(call, context) {
  const method = liveVectorMethod(call);
  expect(
    context,
    call,
    method !== undefined,
    "native expression statements are unsupported; host callbacks are prohibited",
  );
  const ownerType = context.variables.get(method.owner.name);
  if (boundedCollectionFromType(ownerType) !== undefined) {
    const operations = [];
    const value = lowerBoundedCollectionCall(call, context, operations);
    operations.push({ kind: "value.discard", source: value.name });
    return operations;
  }
  if (ownerType === LIVE_SPARSE_INTEGER_ROWS_TYPE) {
    const operations = [];
    const value = lowerSparseRowsCall(call, context, operations);
    expect(
      context,
      call,
      value.type === "None",
      "sparse-row expression statements require append()",
    );
    return operations;
  }
  if (ownerType === LIVE_INTEGER_MATRIX_TYPE) {
    const matrix = liveIntegerMatrixName(method.owner, context);
    const args = array(call.args);
    const operations = [];
    if (method.method === "addmul" || method.method === "submul") {
      expect(
        context,
        call,
        args.length === 4,
        `NativeIntegerMatrix.${method.method}() requires row, column, left, and right`,
      );
      const row = lowerLiveVectorIndex(args[0], context, operations);
      const column = lowerLiveVectorIndex(args[1], context, operations);
      const left = coerceInteger(
        lowerExpression(args[2], context, operations),
        context,
        args[2],
        operations,
      );
      const right = coerceInteger(
        lowerExpression(args[3], context, operations),
        context,
        args[3],
        operations,
      );
      operations.push({
        kind: `integer.matrix.${method.method}`,
        matrix,
        row: row.name,
        rowType: row.type,
        column: column.name,
        columnType: column.type,
        left: left.name,
        right: right.name,
      });
      return operations;
    }
    if (method.method === "swap_rows") {
      expect(
        context,
        call,
        args.length === 2,
        "NativeIntegerMatrix.swap_rows() requires two row indices",
      );
      const left = lowerLiveVectorIndex(args[0], context, operations);
      const right = lowerLiveVectorIndex(args[1], context, operations);
      operations.push({
        kind: "integer.matrix.swap_rows",
        matrix,
        left: left.name,
        leftType: left.type,
        right: right.name,
        rightType: right.type,
      });
      return operations;
    }
    fail(
      context,
      call,
      `unsupported NativeIntegerMatrix method ${method.method}`,
    );
  }
  const vector = liveIntegerVectorName(method.owner, context);
  const args = array(call.args);
  const operations = [];
  if (method.method === "addmul" || method.method === "submul") {
    expect(
      context,
      call,
      args.length === 3,
      `NativeIntegerVector.${method.method}() requires index, left, and right`,
    );
    const index = lowerLiveVectorIndex(args[0], context, operations);
    const left = coerceInteger(
      lowerExpression(args[1], context, operations),
      context,
      args[1],
      operations,
    );
    const right = coerceInteger(
      lowerExpression(args[2], context, operations),
      context,
      args[2],
      operations,
    );
    operations.push({
      kind: `integer.vector.${method.method}`,
      vector,
      index: index.name,
      indexType: index.type,
      left: left.name,
      right: right.name,
    });
    return operations;
  }
  if (method.method === "swap") {
    expect(
      context,
      call,
      args.length === 2,
      "NativeIntegerVector.swap() requires two indices",
    );
    const left = lowerLiveVectorIndex(args[0], context, operations);
    const right = lowerLiveVectorIndex(args[1], context, operations);
    operations.push({
      kind: "integer.vector.swap",
      vector,
      left: left.name,
      leftType: left.type,
      right: right.name,
      rightType: right.type,
    });
    return operations;
  }
  fail(
    context,
    call,
    `unsupported NativeIntegerVector method ${method.method}`,
  );
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
  return lowerExpression(node, context, operations, "uint64");
}

/* UInt64Buffer stores uint64 values, but its subscript still has ordinary
 * Python sequence semantics.  Negative and oversized integer literals are
 * exact indices rather than invalid uint64 literals, so they reach the
 * runtime bounds check and raise IndexError.  In-range nonnegative literals,
 * uint64 symbols, and contextual uint64 arithmetic retain compact word IR. */
function lowerUInt64BufferIndex(node, context, operations) {
  const literal = integerLiteral(node);
  return literal !== undefined &&
      (literal < 0n || literal > 18446744073709551615n)
    ? lowerExpression(node, context, operations)
    : lowerUint64Operand(node, context, operations);
}

/*
 * Python integer literals have no fixed-width type of their own.  Keep them
 * exact unless their enclosing native operation supplies a uint64 context.
 * This lets ordinary typed source spell `length - 1`, `length > 0`, and
 * helper calls such as `span(output, 0, length)` without inserting a cast or
 * silently promoting the machine-word value to GMP arithmetic.
 *
 * Comparisons additionally infer a literal's type from the opposite operand;
 * this is safe because the result type is always bool.  Arithmetic without an
 * enclosing uint64 context keeps literals exact, preserving intentional
 * promotion idioms such as `exact_level = level + 0`.  When the left operand
 * is a comparison literal, retain Python's left-to-right operation order even
 * though the right side must be lowered first to discover its type.
 */
function lowerContextualBinaryOperands(
  node,
  context,
  operations,
  expectedType = undefined,
  inferLiteralType = false,
) {
  if (expectedType === "uint64") {
    return [
      lowerExpression(node.left, context, operations, "uint64"),
      lowerExpression(node.right, context, operations, "uint64"),
    ];
  }
  if (!inferLiteralType) {
    return [
      lowerExpression(node.left, context, operations),
      lowerExpression(node.right, context, operations),
    ];
  }
  const leftLiteral = integerLiteral(node.left);
  const rightLiteral = integerLiteral(node.right);
  if (leftLiteral !== undefined && rightLiteral === undefined) {
    const rightOperations = [];
    const right = lowerExpression(node.right, context, rightOperations);
    const left = right.type === "uint64"
      ? emitUint64Constant(context, node.left, operations, leftLiteral)
      : emitConstant(context, node.left, operations, leftLiteral);
    operations.push(...rightOperations);
    return [left, right];
  }
  const left = lowerExpression(node.left, context, operations);
  const right = rightLiteral !== undefined && left.type === "uint64"
    ? emitUint64Constant(context, node.right, operations, rightLiteral)
    : lowerExpression(node.right, context, operations);
  return [left, right];
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
  const eager = nodeType(comprehension) === "AST_ListComprehension";
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
  let initial;
  if (eager) {
    initial = emitConstant(context, node, initialOperations, 0n);
  } else {
    initial = args.length === 2
      ? lowerExpression(args[1], context, initialOperations)
      : emitConstant(context, node, initialOperations, 0n);
    initial = coerceInteger(
      initial,
      context,
      args[1] || node,
      initialOperations,
    );
  }
  operations.push(...initialOperations);
  const accumulator = temporary(context, node, "Integer");
  operations.push({
    kind: "integer.copy",
    target: accumulator,
    source: initial.name,
  });

  const hiddenIndex = temporary(context, indexNode, range.indexType);
  const hiddenIterator = temporary(context, indexNode, range.indexType);
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
    iterator: hiddenIterator,
    start: range.start,
    stop: range.stop,
    step: range.step,
    body,
  });
  if (eager) {
    // Exact Integer addition is associative and side-effect free, so the list
    // need not be materialized merely to preserve Python's eager call order.
    // Its producer is fully evaluated first; only then is sum's optional
    // start expression evaluated and combined with the exact subtotal.
    const eagerInitialOperations = [];
    let eagerInitial = args.length === 2
      ? lowerExpression(args[1], context, eagerInitialOperations)
      : emitConstant(context, node, eagerInitialOperations, 0n);
    eagerInitial = coerceInteger(
      eagerInitial,
      context,
      args[1] || node,
      eagerInitialOperations,
    );
    const result = temporary(context, node, "Integer");
    operations.push(...eagerInitialOperations, {
      kind: "integer.binary",
      operation: "add",
      target: result,
      left: eagerInitial.name,
      right: accumulator,
    });
    return { name: result, type: "Integer" };
  }
  return { name: accumulator, type: "Integer" };
}

function lowerBoundedCollectionCall(node, context, operations) {
  const expression = node.expression;
  expect(
    context,
    node,
    nodeType(expression) === "AST_Dot" &&
      nodeType(expression.expression) === "AST_SymbolRef",
    "bounded map/set calls require a direct compiler-owned local",
  );
  const collection = liveBoundedCollection(expression.expression, context);
  const method = expression.property;
  const args = array(node.args);
  expect(
    context,
    node,
    array(node.args?.kwarg_items).length === 0 && !node.args?.starargs,
    "bounded map/set calls do not accept keyword or starred arguments",
  );
  const keyMethods = collection.kind === "map"
    ? new Set(["insert", "contains", "get"])
    : new Set(["add", "contains"]);
  expect(
    context,
    expression,
    keyMethods.has(method),
    `unsupported NativeBounded${collection.kind === "map" ? "Map" : "Set"} ` +
      `method ${method}`,
  );
  const expectedArguments = collection.kind === "map" && method === "insert"
    ? 2
    : collection.kind === "map" && method === "get"
      ? 2
      : 1;
  expect(
    context,
    node,
    args.length === expectedArguments,
    `NativeBounded${collection.kind === "map" ? "Map" : "Set"}.${method}()` +
      ` requires ${expectedArguments} argument(s)`,
  );
  const key = lowerExpression(args[0], context, operations);
  expect(
    context,
    args[0],
    key.type === collection.record.type,
    `NativeBounded${collection.kind === "map" ? "Map" : "Set"} ` +
      `requires ${collection.record.name} keys`,
  );
  let value;
  if (expectedArguments === 2) {
    value = lowerUint64Operand(args[1], context, operations);
    expect(
      context,
      args[1],
      value.type === "uint64",
      `NativeBoundedMap.${method}() value must be uint64`,
    );
  }
  const returnsBool = method === "insert" || method === "add" ||
    method === "contains";
  const target = temporary(context, node, returnsBool ? "bool" : "uint64");
  operations.push({
    kind: `bounded.${collection.kind}.${method}`,
    target,
    owner: collection.owner,
    record: collection.record.name,
    fields: collection.record.fields,
    key: key.name,
    ...(value === undefined ? {} : { value: value.name }),
  });
  return { name: target, type: returnsBool ? "bool" : "uint64" };
}

function lowerSparseRowsCall(node, context, operations) {
  const expression = node.expression;
  expect(
    context,
    node,
    nodeType(expression) === "AST_Dot" &&
      nodeType(expression.expression) === "AST_SymbolRef",
    "sparse-row calls require a direct compiler-owned local",
  );
  const owner = liveSparseIntegerRowsName(expression.expression, context);
  const method = expression.property;
  const args = array(node.args);
  expect(
    context,
    node,
    array(node.args?.kwarg_items).length === 0 && !node.args?.starargs,
    "sparse-row calls do not accept keyword or starred arguments",
  );
  expect(
    context,
    expression,
    ["append", "get", "row_length"].includes(method),
    `unsupported NativeSparseIntegerRows method ${method}`,
  );
  const expectedArguments = method === "row_length" ? 1 : 3;
  expect(
    context,
    node,
    args.length === expectedArguments,
    `NativeSparseIntegerRows.${method}() requires ${expectedArguments} argument(s)`,
  );
  const row = lowerUint64Operand(args[0], context, operations);
  if (method === "row_length") {
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: "sparse.rows.row_length",
      target,
      owner,
      row: row.name,
    });
    return { name: target, type: "uint64" };
  }
  const column = lowerUint64Operand(args[1], context, operations);
  const value = coerceInteger(
    lowerExpression(args[2], context, operations),
    context,
    args[2],
    operations,
  );
  if (method === "append") {
    operations.push({
      kind: "sparse.rows.append",
      owner,
      row: row.name,
      column: column.name,
      value: value.name,
    });
    return { name: null, type: "None" };
  }
  const target = temporary(context, node, "Integer");
  operations.push({
    kind: "sparse.rows.get",
    target,
    owner,
    row: row.name,
    column: column.name,
    defaultValue: value.name,
  });
  return { name: target, type: "Integer" };
}

function lowerForeignInvocation(
  node,
  foreign,
  args,
  context,
  operations,
  displayName,
  evaluationOrder = undefined,
) {
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
    `${displayName} expects ${signature.parameters.length} arguments, got ` +
      `${args.length}`,
  );
  const order = evaluationOrder || signature.parameters.map((_, index) => index);
  expect(
    context,
    node,
    order.length === args.length &&
      new Set(order).size === args.length &&
      order.every((index) => Number.isInteger(index) && index >= 0 && index < args.length),
    `${displayName} has an invalid argument evaluation order`,
  );
  const lowered = new Array(args.length);
  for (const index of order) {
    const param = signature.parameters[index];
    let value = lowerExpression(
      args[index],
      context,
      operations,
      param.type === "uint64" ? "uint64" : undefined,
    );
    if (param.type === "Integer") {
      value = coerceInteger(value, context, args[index], operations);
    }
    expect(
      context,
      args[index],
      value.type === param.type,
      `${displayName} argument ${index + 1} expects ${param.type}, got ` +
        `${value.type}`,
    );
    lowered[index] = value;
  }
  const target = temporary(context, node, signature.return_type);
  if (context.foreignResources.has(signature.return_type)) {
    expect(
      context,
      node,
      context.controlDepth === 0 && context.activeExactArenas.size === 0,
      "owned FFI resources must be created in the top-level native block " +
        "or explicitly with NativeExactArena.foreign_resource()",
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

function lowerCall(node, context, operations) {
  if (nodeType(node.expression) === "AST_Dot") {
    const owner = node.expression.expression;
    const ownerType = nodeType(owner) === "AST_SymbolRef"
      ? context.variables.get(owner.name)
      : undefined;
    if (boundedCollectionFromType(ownerType) !== undefined) {
      return lowerBoundedCollectionCall(node, context, operations);
    }
    if (ownerType === LIVE_SPARSE_INTEGER_ROWS_TYPE) {
      return lowerSparseRowsCall(node, context, operations);
    }
    fail(context, node, "native method call target is not a live exact owner");
  }
  expect(
    context,
    node,
    nodeType(node.expression) === "AST_SymbolRef",
    "native calls require a simple function name",
  );
  const name = node.expression.name;
  const args = array(node.args);

  const record = context.records.get(name);
  if (record !== undefined) {
    expect(
      context,
      node,
      args.length === record.fields.length &&
        array(node.args?.kwarg_items).length === 0 && !node.args?.starargs,
      `${name} expects ${record.fields.length} fields, got ${args.length}`,
    );
    const fields = args.map((argument, index) => {
      const field = record.fields[index];
      const value = lowerExpression(
        argument,
        context,
        operations,
        field.type === "uint64" || field.type === "PrimeModulusValue"
          ? "uint64" : undefined,
      );
      expect(
        context,
        argument,
        value.type === field.type ||
          (field.type === "PrimeModulusValue" && value.type === "uint64"),
        `${name}.${field.name} expects ${field.type}, got ${value.type}`,
      );
      return { ...field, value: value.name };
    });
    const target = temporary(context, node, record.type);
    operations.push({
      kind: "record.construct",
      target,
      record: name,
      fields,
    });
    return { name: target, type: record.type };
  }

  // An explicit module import shadows a builtin with the same local name,
  // exactly as it does in Python. The declaration identity, rather than that
  // local spelling, determines the native operation.
  const foreign = context.foreignFunctions.get(name);
  if (foreign !== undefined) {
    return lowerForeignInvocation(
      node,
      foreign,
      args,
      context,
      operations,
      name,
    );
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
    if (
      nodeType(args[0]) === "AST_SymbolRef" &&
      context.variables.get(args[0].name) === LIVE_INTEGER_VECTOR_TYPE
    ) {
      const vector = liveIntegerVectorName(args[0], context);
      const target = temporary(context, node, "uint64");
      operations.push({
        kind: "integer.vector.length",
        target,
        vector,
      });
      return { name: target, type: "uint64" };
    }
    if (
      nodeType(args[0]) === "AST_SymbolRef" &&
      context.variables.get(args[0].name) === LIVE_INTEGER_MATRIX_TYPE
    ) {
      const matrix = liveIntegerMatrixName(args[0], context);
      const target = temporary(context, node, "uint64");
      operations.push({
        kind: "integer.matrix.length",
        target,
        matrix,
      });
      return { name: target, type: "uint64" };
    }
    if (
      nodeType(args[0]) === "AST_SymbolRef" &&
      recordVectorNameFromType(context.variables.get(args[0].name)) !== undefined
    ) {
      const vector = liveRecordVector(args[0], context);
      const target = temporary(context, node, "uint64");
      operations.push({
        kind: "record.vector.length",
        target,
        vector: vector.owner,
      });
      return { name: target, type: "uint64" };
    }
    if (nodeType(args[0]) === "AST_SymbolRef") {
      const collectionType = boundedCollectionFromType(
        context.variables.get(args[0].name),
      );
      if (collectionType !== undefined) {
        const collection = liveBoundedCollection(args[0], context);
        const target = temporary(context, node, "uint64");
        operations.push({
          kind: `bounded.${collection.kind}.length`,
          target,
          owner: collection.owner,
        });
        return { name: target, type: "uint64" };
      }
    }
    if (
      nodeType(args[0]) === "AST_SymbolRef" &&
      context.variables.get(args[0].name) === LIVE_SPARSE_INTEGER_ROWS_TYPE
    ) {
      const owner = liveSparseIntegerRowsName(args[0], context);
      const target = temporary(context, node, "uint64");
      operations.push({ kind: "sparse.rows.length", target, owner });
      return { name: target, type: "uint64" };
    }
    const buffer = lowerExpression(args[0], context, operations);
    expect(
      context,
      args[0],
      BORROWED_BUFFER_TYPES.has(buffer.type),
      "exact len() requires an IntegerBuffer, Int64Buffer, Int64Record, or UInt64Buffer",
    );
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: buffer.type === "IntegerBuffer"
        ? "integer.buffer.length"
        : buffer.type === "UInt64Buffer"
          ? "uint64.buffer.length"
          : "int64.buffer.length",
      target,
      buffer: buffer.name,
      bufferType: buffer.type,
    });
    return { name: target, type: "uint64" };
  }

  if (name === "checked_uint64") {
    expect(
      context,
      node,
      args.length === 1 && array(node.args?.kwarg_items).length === 0 &&
        !node.args?.starargs,
      "checked_uint64() requires one positional argument",
    );
    const source = coerceInteger(
      lowerExpression(args[0], context, operations),
      context,
      args[0],
      operations,
    );
    const target = temporary(context, node, "uint64");
    operations.push({
      kind: "uint64.from_integer_checked",
      target,
      source: source.name,
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
      } else if (param.type === "uint64") {
        value = emitUint64Constant(
          context,
          node,
          operations,
          BigInt(param.default),
        );
      } else {
        value = emitConstant(
          context,
          node,
          operations,
          BigInt(param.default),
        );
      }
    } else {
      value = lowerExpression(
        arg,
        context,
        operations,
        param.type === "uint64" || param.type === LIVE_INTEGER_VECTOR_TYPE
          ? param.type
          : undefined,
      );
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

function lowerExpression(node, context, operations, expectedType = undefined) {
  const integer = integerLiteral(node);
  if (integer !== undefined) {
    return expectedType === "uint64"
      ? emitUint64Constant(context, node, operations, integer)
      : emitConstant(context, node, operations, integer);
  }
  const boolean = booleanLiteral(node);
  if (boolean !== undefined) {
    return emitBoolean(context, node, operations, boolean);
  }
  if (nodeType(node) === "AST_SymbolRef") {
    const name = resolvedSymbol(context, node.name);
    const type = context.variables.get(name);
    if (type === undefined && context.integerConstants.has(name)) {
      const value = context.integerConstants.get(name);
      return expectedType === "uint64"
        ? emitUint64Constant(context, node, operations, value)
        : emitConstant(context, node, operations, value);
    }
    expect(context, node, type !== undefined, `unknown native value ${node.name}`);
    if (isLiveExactOwnerType(type)) {
      expect(
        context,
        node,
        type === LIVE_INTEGER_VECTOR_TYPE && expectedType === type,
        "live exact owners cannot be copied, passed, or returned; " +
          "they may only be borrowed by a matching native helper parameter",
      );
      liveIntegerVectorName(node, context);
      return { name, type };
    }
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
    const name = source.type.slice("Record:".length);
    const record = recordSchema(context, node, name);
    const field = record.fields.find((candidate) =>
      candidate.name === node.property
    );
    expect(context, node, field !== undefined,
      `${name} has no field ${node.property}`);
    const target = temporary(context, node, field.type);
    operations.push({
      kind: "record.get",
      target,
      source: source.name,
      record: name,
      field: field.name,
      type: field.type,
    });
    return { name: target, type: field.type };
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
    const liveOwnerType = nodeType(node.expression) === "AST_SymbolRef"
      ? context.variables.get(node.expression.name)
      : undefined;
    if (liveOwnerType === LIVE_INTEGER_VECTOR_TYPE) {
      const vector = liveIntegerVectorName(node.expression, context);
      const index = lowerLiveVectorIndex(
        node.property,
        context,
        operations,
      );
      const target = temporary(context, node, "Integer");
      operations.push({
        kind: "integer.vector.get",
        target,
        vector,
        index: index.name,
        indexType: index.type,
      });
      return { name: target, type: "Integer" };
    }
    if (liveOwnerType === LIVE_INTEGER_MATRIX_TYPE) {
      const matrix = liveIntegerMatrixName(node.expression, context);
      const [row, column] = lowerLiveMatrixIndices(
        node.property,
        context,
        operations,
      );
      const target = temporary(context, node, "Integer");
      operations.push({
        kind: "integer.matrix.get",
        target,
        matrix,
        row: row.name,
        rowType: row.type,
        column: column.name,
        columnType: column.type,
      });
      return { name: target, type: "Integer" };
    }
    if (recordVectorNameFromType(liveOwnerType) !== undefined) {
      const vector = liveRecordVector(node.expression, context);
      const index = lowerLiveVectorIndex(node.property, context, operations);
      const target = temporary(context, node, vector.record.type);
      operations.push({
        kind: "record.vector.get",
        target,
        vector: vector.owner,
        record: vector.record.name,
        index: index.name,
        indexType: index.type,
      });
      return { name: target, type: vector.record.type };
    }
    const foreignResource = context.foreignResources.get(liveOwnerType);
    if (foreignResource !== undefined) {
      expect(context, node, foreignResource.item_get?.function?.signature !== undefined,
        `${liveOwnerType} does not declare a qualified native indexed read`);
      const indices = sequenceElements(node.property) || [node.property];
      const dimensions =
        foreignResource.item_get.function.signature.parameters.length - 1;
      expect(
        context,
        node.property,
        indices.length === dimensions,
        `${liveOwnerType} indexing expects ${dimensions} indices, got ` +
          `${indices.length}`,
      );
      return lowerForeignInvocation(
        node,
        foreignResource.item_get,
        [node.expression, ...indices],
        context,
        operations,
        `${liveOwnerType}.__getitem__`,
      );
    }
    const bufferType = nodeType(node.expression) === "AST_SymbolRef"
      ? context.variables.get(node.expression.name)
      : undefined;
    if (BORROWED_BUFFER_TYPES.has(bufferType)) {
      const buffer = lowerExpression(node.expression, context, operations);
      const loweredIndex = buffer.type === "UInt64Buffer"
        ? lowerUInt64BufferIndex(node.property, context, operations)
        : lowerExpression(node.property, context, operations);
      const index = buffer.type === "UInt64Buffer"
        ? loweredIndex
        : coerceInteger(
            loweredIndex, context, node.property, operations,
          );
      expect(
        context,
        node.property,
        buffer.type !== "UInt64Buffer" ||
          index.type === "uint64" || index.type === "Integer",
        "UInt64Buffer indexing requires an exact integer index",
      );
      const targetType = buffer.type === "UInt64Buffer" ? "uint64" : "Integer";
      const target = temporary(context, node, targetType);
      operations.push({
        kind: buffer.type === "IntegerBuffer"
          ? "integer.buffer.get"
          : buffer.type === "UInt64Buffer"
            ? "uint64.buffer.get"
            : "int64.buffer.get",
        target,
        buffer: buffer.name,
        bufferType: buffer.type,
        index: index.name,
        indexType: index.type,
      });
      return { name: target, type: targetType };
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
    let [left, right] = lowerContextualBinaryOperands(
      node,
      context,
      operations,
      expectedType,
    );
    if (arithmetic === "mod" && left.type === "Integer" &&
        right.type === "uint64") {
      const target = temporary(context, node, "uint64");
      operations.push({
        kind: "integer.mod_uint64",
        target,
        left: left.name,
        right: right.name,
      });
      return { name: target, type: "uint64" };
    }
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
    let [left, right] = lowerContextualBinaryOperands(
      node,
      context,
      operations,
      undefined,
      true,
    );
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
    expect(
      context,
      targetNode,
      context.controlDepth === 0,
      "FFI resource aliases cannot depend on native control flow",
    );
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
    ...(value.type.startsWith("Record:")
      ? { record: value.type.slice("Record:".length) }
      : {}),
  });
  context.initialized.add(targetNode.name);
}

function lowerBufferAssignment(item, right, operator, context) {
  const operations = [];
  const liveOwnerType = nodeType(item.expression) === "AST_SymbolRef"
    ? context.variables.get(item.expression.name)
    : undefined;
  const foreignResource = context.foreignResources.get(liveOwnerType);
  if (foreignResource !== undefined) {
    expect(context, item, foreignResource.item_set?.function?.signature !== undefined,
      `${liveOwnerType} does not declare a qualified native indexed assignment`);
    expect(
      context,
      item,
      operator === "=",
      `${liveOwnerType} does not support augmented indexed assignment`,
    );
    const indices = sequenceElements(item.property) || [item.property];
    const dimensions =
      foreignResource.item_set.function.signature.parameters.length - 2;
    expect(
      context,
      item.property,
      indices.length === dimensions,
      `${liveOwnerType} indexing expects ${dimensions} indices, got ` +
        `${indices.length}`,
    );
    lowerForeignInvocation(
      item,
      foreignResource.item_set,
      [item.expression, ...indices, right],
      context,
      operations,
      `${liveOwnerType}.__setitem__`,
      [indices.length + 1, 0, ...indices.map((_, index) => index + 1)],
    );
    return operations;
  }
  if (liveOwnerType === LIVE_INTEGER_VECTOR_TYPE) {
    const vector = liveIntegerVectorName(item.expression, context);
    const index = lowerLiveVectorIndex(item.property, context, operations);
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
        kind: "integer.vector.get",
        target: current,
        vector,
        index: index.name,
        indexType: index.type,
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
      kind: "integer.vector.set",
      vector,
      index: index.name,
      indexType: index.type,
      value: value.name,
    });
    return operations;
  }
  if (liveOwnerType === LIVE_INTEGER_MATRIX_TYPE) {
    const matrix = liveIntegerMatrixName(item.expression, context);
    const [row, column] = lowerLiveMatrixIndices(
      item.property,
      context,
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
        kind: "integer.matrix.get",
        target: current,
        matrix,
        row: row.name,
        rowType: row.type,
        column: column.name,
        columnType: column.type,
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
      kind: "integer.matrix.set",
      matrix,
      row: row.name,
      rowType: row.type,
      column: column.name,
      columnType: column.type,
      value: value.name,
    });
    return operations;
  }
  if (recordVectorNameFromType(liveOwnerType) !== undefined) {
    expect(
      context,
      item,
      operator === "=",
      "NativeRecordVector entries do not support augmented assignment",
    );
    const vector = liveRecordVector(item.expression, context);
    const index = lowerLiveVectorIndex(item.property, context, operations);
    const value = lowerExpression(right, context, operations);
    expect(
      context,
      right,
      value.type === vector.record.type,
      `NativeRecordVector ${vector.owner} requires ${vector.record.name} values`,
    );
    operations.push({
      kind: "record.vector.set",
      vector: vector.owner,
      record: vector.record.name,
      index: index.name,
      indexType: index.type,
      value: value.name,
    });
    return operations;
  }
  const buffer = lowerExpression(item.expression, context, operations);
  expect(
    context,
    item.expression,
    BORROWED_BUFFER_TYPES.has(buffer.type),
    "indexed exact assignment requires an exact integer or UInt64Buffer",
  );
  const loweredIndex = buffer.type === "UInt64Buffer"
    ? lowerUInt64BufferIndex(item.property, context, operations)
    : lowerExpression(item.property, context, operations);
  const index = buffer.type === "UInt64Buffer"
    ? loweredIndex
    : coerceInteger(
        loweredIndex, context, item.property, operations,
      );
  expect(
    context,
    item.property,
    buffer.type !== "UInt64Buffer" ||
      index.type === "uint64" || index.type === "Integer",
    "UInt64Buffer assignment requires an exact integer index",
  );
  let value = buffer.type === "UInt64Buffer"
    ? lowerUint64Operand(right, context, operations)
    : lowerExpression(right, context, operations);
  if (buffer.type !== "UInt64Buffer") {
    value = coerceInteger(value, context, right, operations);
  }
  expect(
    context,
    right,
    buffer.type !== "UInt64Buffer" || value.type === "uint64",
    "UInt64Buffer assignment requires a uint64 value",
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
    const valueType = buffer.type === "UInt64Buffer" ? "uint64" : "Integer";
    const current = temporary(context, item, valueType);
    operations.push({
      kind: buffer.type === "IntegerBuffer"
        ? "integer.buffer.get"
        : buffer.type === "UInt64Buffer"
          ? "uint64.buffer.get"
          : "int64.buffer.get",
      target: current,
      buffer: buffer.name,
      bufferType: buffer.type,
      index: index.name,
      indexType: index.type,
    });
    const target = temporary(context, item, valueType);
    operations.push({
      kind: buffer.type === "UInt64Buffer"
        ? "uint64.binary"
        : "integer.binary",
      operation: arithmetic,
      target,
      left: current,
      right: value.name,
    });
    value = { name: target, type: valueType };
  }
  operations.push({
    kind: buffer.type === "IntegerBuffer"
      ? "integer.buffer.set"
      : buffer.type === "UInt64Buffer"
        ? "uint64.buffer.set"
        : "int64.buffer.set",
    buffer: buffer.name,
    bufferType: buffer.type,
    index: index.name,
    indexType: index.type,
    value: value.name,
  });
  return operations;
}

function lowerArenaForeignResourceAllocation(
  assign,
  arena,
  arenaState,
  context,
) {
  const call = assign.right;
  if (call.expression.property !== "foreign_resource") return undefined;
  const args = array(call.args);
  expect(
    context,
    call,
    args.length >= 1 && nodeType(args[0]) === "AST_SymbolRef" &&
      array(call.args?.kwarg_items).length === 0 && !call.args?.starargs,
    "NativeExactArena.foreign_resource() requires a declared resource " +
      "constructor followed by positional arguments",
  );
  const foreign = context.foreignFunctions.get(args[0].name);
  expect(
    context,
    args[0],
    foreign !== undefined && foreign.function.targets.native,
    "NativeExactArena.foreign_resource() requires a native-capable declared " +
      "FFI constructor",
  );
  const signature = foreign.function.signature;
  const resource = context.foreignResources.get(signature.return_type);
  expect(
    context,
    args[0],
    resource !== undefined && resource.ownership === "owned" &&
      typeof resource.native?.clear_symbol === "string" &&
      typeof resource.native?.size_symbol === "string",
    "NativeExactArena.foreign_resource() requires an owned declared resource " +
      "with native clear and size protocols",
  );
  expect(
    context,
    call,
    args.length - 1 === signature.parameters.length,
    `${args[0].name} expects ${signature.parameters.length} arguments, got ` +
      `${args.length - 1}`,
  );
  const operations = [];
  const lowered = signature.parameters.map((param, index) => {
    const argument = args[index + 1];
    let value = lowerExpression(
      argument,
      context,
      operations,
      param.type === "uint64" ? "uint64" : undefined,
    );
    if (param.type === "Integer") {
      value = coerceInteger(value, context, argument, operations);
    }
    expect(
      context,
      argument,
      value.type === param.type,
      `${args[0].name} argument ${index + 1} expects ${param.type}, got ` +
        `${value.type}`,
    );
    return value;
  });
  const child = assign.left.name;
  expect(
    context,
    assign.left,
    !context.variables.has(child),
    `NativeExactArena child ${child} shadows an existing native value`,
  );
  ensureVariable(context, assign.left, child, signature.return_type);
  context.initialized.add(child);
  context.activeArenaForeignResources.add(child);
  context.usedForeignResources.set(signature.return_type, resource);
  context.foreignDependencies.add(foreign.declarationIdentity);
  const descriptor = {
    owner: child,
    type: signature.return_type,
    childKind: "foreign-resource",
    resourceId: resource.id,
    resourceIdentity: `resource:${foreign.declarationIdentity.split(":")[0]}:` +
      `${resource.id}`,
    abiType: resource.abi_type,
    clearSymbol: resource.native.clear_symbol,
    sizeSymbol: resource.native.size_symbol,
    constructorDeclarationId: foreign.declarationId,
  };
  arenaState.children.push(descriptor);
  operations.push({
    kind: "ffi.arena.resource.allocate",
    arena,
    target: child,
    arguments: lowered,
    returnType: signature.return_type,
    foreign,
    resource: descriptor,
  });
  return operations;
}

function lowerArenaAllocation(statement, context) {
  const assign = statement.body;
  if (
    nodeType(assign) !== "AST_Assign" ||
    assign.operator !== "=" ||
    nodeType(assign.left) !== "AST_SymbolRef" ||
    nodeType(assign.right) !== "AST_Call" ||
    nodeType(assign.right.expression) !== "AST_Dot" ||
    nodeType(assign.right.expression.expression) !== "AST_SymbolRef"
  ) {
    return undefined;
  }
  const arenaNode = assign.right.expression.expression;
  if (context.variables.get(arenaNode.name) !== LIVE_EXACT_ARENA_TYPE) {
    return undefined;
  }
  const arena = liveExactArenaName(arenaNode, context);
  const arenaState = context.activeExactArenas.get(arena);
  expect(
    context,
    statement,
    context.loopDepth === arenaState.loopDepth,
    "NativeExactArena children may be conditional but cannot be allocated repeatedly in a native loop",
  );
  const method = assign.right.expression.property;
  const foreignResource = lowerArenaForeignResourceAllocation(
    assign,
    arena,
    arenaState,
    context,
  );
  if (foreignResource !== undefined) return foreignResource;
  const args = array(assign.right.args);
  let record;
  if (["records", "bounded_map", "bounded_set"].includes(method)) {
    expect(
      context,
      assign.right,
      nodeType(args[0]) === "AST_SymbolRef",
      `NativeExactArena.${method}() requires a NativeRecord key type`,
    );
    record = recordSchema(context, args[0], args[0].name);
    expect(
      context,
      args[0],
      record.fields.every((field) => field.type === "uint64"),
      `NativeExactArena.${method}() currently requires scalar uint64 fields; ` +
        `${record.name} contains a borrowed or unsupported field`,
    );
  }
  if (method === "bounded_map") {
    expect(
      context,
      args[1],
      nodeType(args[1]) === "AST_SymbolRef" && args[1].name === "uint64",
      "NativeExactArena.bounded_map() value type must be uint64",
    );
  }
  const childType = method === "integer_vector"
    ? LIVE_INTEGER_VECTOR_TYPE
    : method === "integer_matrix"
      ? LIVE_INTEGER_MATRIX_TYPE
      : method === "records"
        ? liveRecordVectorType(record.name)
        : method === "bounded_map"
          ? boundedCollectionType("map", record.name)
          : method === "bounded_set"
            ? boundedCollectionType("set", record.name)
            : method === "sparse_integer_rows"
              ? LIVE_SPARSE_INTEGER_ROWS_TYPE
              : undefined;
  expect(
    context,
    assign.right.expression,
    childType !== undefined,
    `unsupported NativeExactArena allocation ${method}`,
  );
  const collection = boundedCollectionFromType(childType);
  const expectedArguments = childType === LIVE_SPARSE_INTEGER_ROWS_TYPE
    ? 4
    : childType === LIVE_INTEGER_MATRIX_TYPE ||
      collection?.kind === "map"
      ? 3
      : 2;
  expect(
    context,
    assign.right,
    args.length === expectedArguments &&
      array(assign.right.args?.kwarg_items).length === 0 &&
      !assign.right.args?.starargs,
    childType === LIVE_INTEGER_MATRIX_TYPE
      ? "NativeExactArena.integer_matrix() requires rows, columns, and maximum_bits"
      : childType === LIVE_SPARSE_INTEGER_ROWS_TYPE
        ? "NativeExactArena.sparse_integer_rows() requires rows, columns, entry_capacity, and maximum_bits"
      : method === "records"
        ? "NativeExactArena.records() requires a NativeRecord type and capacity"
        : collection?.kind === "map"
          ? "NativeExactArena.bounded_map() requires key type, uint64, and capacity"
          : collection?.kind === "set"
            ? "NativeExactArena.bounded_set() requires key type and capacity"
            : "NativeExactArena.integer_vector() requires capacity and maximum_bits",
  );
  const child = assign.left.name;
  expect(
    context,
    assign.left,
    !context.variables.has(child),
    `NativeExactArena child ${child} shadows an existing native value`,
  );
  const operations = [];
  const capacityIndex = method === "records" || collection?.kind === "set"
    ? 1
    : collection?.kind === "map"
      ? 2
      : 0;
  const firstDimension = lowerUint64Operand(
    args[capacityIndex], context, operations,
  );
  const secondDimension = childType === LIVE_INTEGER_MATRIX_TYPE
      || childType === LIVE_SPARSE_INTEGER_ROWS_TYPE
    ? lowerUint64Operand(args[1], context, operations)
    : undefined;
  const entryCapacity = childType === LIVE_SPARSE_INTEGER_ROWS_TYPE
    ? lowerUint64Operand(args[2], context, operations)
    : undefined;
  const maximumBits = record === undefined
    ? lowerUint64Operand(
        args[childType === LIVE_SPARSE_INTEGER_ROWS_TYPE
          ? 3
          : childType === LIVE_INTEGER_MATRIX_TYPE
            ? 2
            : 1],
        context,
        operations,
      )
    : undefined;
  expect(
    context,
    assign.right,
    firstDimension.type === "uint64" &&
      (secondDimension === undefined || secondDimension.type === "uint64") &&
      (entryCapacity === undefined || entryCapacity.type === "uint64") &&
      (maximumBits === undefined || maximumBits.type === "uint64"),
    childType === LIVE_INTEGER_MATRIX_TYPE
      ? "arena matrix rows and columns must be uint64"
      : childType === LIVE_SPARSE_INTEGER_ROWS_TYPE
        ? "arena sparse rows shape, capacity, and maximum bits must be uint64"
      : method === "records"
        ? "arena record-vector capacity must be uint64"
        : collection !== undefined
          ? "arena bounded collection capacity must be uint64"
          : "arena vector capacity must be uint64",
  );
  ensureVariable(context, assign.left, child, childType);
  context.initialized.add(child);
  if (childType === LIVE_INTEGER_MATRIX_TYPE) {
    context.activeIntegerMatrices.add(child);
  } else if (childType === LIVE_INTEGER_VECTOR_TYPE) {
    context.activeIntegerVectors.add(child);
  } else if (collection !== undefined) {
    context.activeBoundedCollections.set(child, {
      kind: collection.kind,
      record,
    });
  } else if (childType === LIVE_SPARSE_INTEGER_ROWS_TYPE) {
    context.activeSparseIntegerRows.add(child);
  } else {
    context.activeRecordVectors.set(child, record);
  }
  const descriptor = childType === LIVE_INTEGER_MATRIX_TYPE
    ? {
        owner: child,
        type: childType,
        rows: firstDimension.name,
        columns: secondDimension.name,
        maximumBits: maximumBits.name,
      }
    : childType === LIVE_SPARSE_INTEGER_ROWS_TYPE ? {
        owner: child,
        type: childType,
        rows: firstDimension.name,
        columns: secondDimension.name,
        entryCapacity: entryCapacity.name,
        maximumBits: maximumBits.name,
        metadataBaseCharge: 32,
        rowCharge: 8,
        entryCharge: 16,
      }
    : record === undefined ? {
        owner: child,
        type: childType,
        capacity: firstDimension.name,
        maximumBits: maximumBits.name,
      } : collection !== undefined ? {
        owner: child,
        type: childType,
        capacity: firstDimension.name,
        collectionKind: collection.kind,
        record: record.name,
        fields: record.fields,
        entryCharge: (collection.kind === "map" ? 32 : 24) +
          8 * record.fields.length,
      } : {
        owner: child,
        type: childType,
        capacity: firstDimension.name,
        record: record.name,
        fields: record.fields,
        entryCharge: 16 + 8 * record.fields.length,
      };
  arenaState.children.push(descriptor);
  operations.push({
    kind: childType === LIVE_INTEGER_MATRIX_TYPE
      ? "integer.arena.matrix.allocate"
      : childType === LIVE_SPARSE_INTEGER_ROWS_TYPE
        ? "sparse.rows.arena.allocate"
      : collection !== undefined
        ? `bounded.${collection.kind}.arena.allocate`
        : record !== undefined
        ? "record.arena.vector.allocate"
        : "integer.arena.vector.allocate",
    arena,
    ...descriptor,
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
    let value = lowerExpression(
      assign.value,
      context,
      operations,
      declaredType === "uint64" ? "uint64" : undefined,
    );
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
    const existingType = nodeType(assign.left) === "AST_SymbolRef"
      ? context.variables.get(assign.left.name)
      : undefined;
    const value = lowerExpression(
      assign.right,
      context,
      operations,
      existingType === "uint64" ? "uint64" : undefined,
    );
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
  if (type === "uint64") {
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
      operation: bitwise ?? operation,
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

function directUint64RangeArgument(node, context) {
  const literal = integerLiteral(node);
  if (literal !== undefined) {
    return literal >= 0n && literal <= 18446744073709551615n;
  }
  if (nodeType(node) !== "AST_SymbolRef") return false;
  const name = resolvedSymbol(context, node.name);
  if (context.variables.get(name) === "uint64") return true;
  const constant = context.integerConstants.get(name);
  return constant !== undefined && constant >= 0n &&
    constant <= 18446744073709551615n;
}

function directUint64RangeVariable(node, context) {
  return nodeType(node) === "AST_SymbolRef" &&
    context.variables.get(resolvedSymbol(context, node.name)) === "uint64";
}

function freezeRangeValue(value, node, context, operations, type) {
  if (type === "Integer") {
    value = coerceInteger(value, context, node, operations);
  } else {
    expect(
      context,
      node,
      value.type === "uint64",
      `native uint64 range argument has type ${value.type}`,
    );
  }
  const target = temporary(context, node, type);
  operations.push({
    kind: type === "Integer" ? "integer.copy" : "uint64.copy",
    target,
    source: value.name,
  });
  return target;
}

function freezeRangeArgument(node, context, operations, type) {
  let value = lowerExpression(
    node,
    context,
    operations,
    type === "uint64" ? "uint64" : undefined,
  );
  return freezeRangeValue(value, node, context, operations, type);
}

/*
 * A range is an immutable value even though its source expressions need not
 * be.  Evaluate and snapshot each supplied argument in Python's left-to-right
 * order, before evaluating the next one.  The loop operation subsequently
 * owns a separate hidden iterator and copies each yielded value into the
 * visible target; assignments to that target therefore cannot perturb the
 * sequence.
 *
 * The compact uint64 form is deliberately limited to direct nonnegative
 * values.  More general expressions retain ordinary exact-Integer semantics
 * instead of acquiring fixed-width overflow merely because they occur in a
 * range call.
 */
function lowerRange(node, context, targetName = undefined) {
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
  const operations = [];
  const startNode = args.length === 1 ? null : args[0];
  const stopNode = args.length === 1 ? args[0] : args[1];
  const stepNode = args.length === 3 ? args[2] : null;
  const existingTargetType = targetName === undefined
    ? undefined
    : context.variables.get(targetName);
  const supplied = args;
  const useUint64 = existingTargetType !== "Integer" &&
    (existingTargetType === "uint64" ||
      supplied.some((argument) => directUint64RangeVariable(argument, context))) &&
    supplied.every((argument) => directUint64RangeArgument(argument, context));
  const type = useUint64 ? "uint64" : "Integer";

  let start;
  let stop;
  let step;
  if (args.length === 1) {
    const zero = type === "uint64"
      ? emitUint64Constant(context, node, operations, 0n)
      : emitConstant(context, node, operations, 0n);
    start = freezeRangeValue(zero, node, context, operations, type);
    stop = freezeRangeArgument(stopNode, context, operations, type);
  } else {
    start = freezeRangeArgument(startNode, context, operations, type);
    stop = freezeRangeArgument(stopNode, context, operations, type);
  }
  if (stepNode === null) {
    const one = type === "uint64"
      ? emitUint64Constant(context, node, operations, 1n)
      : emitConstant(context, node, operations, 1n);
    step = temporary(context, node, type);
    operations.push({
      kind: type === "Integer" ? "integer.copy" : "uint64.copy",
      target: step,
      source: one.name,
    });
  } else {
    step = freezeRangeArgument(stepNode, context, operations, type);
  }
  const stepLiteral = stepNode === null ? 1n : integerLiteral(stepNode);
  if (stepLiteral === undefined || stepLiteral === 0n) {
    operations.push({
      kind: "range.validate_step",
      step,
      stepType: type,
    });
  }
  return {
    kind: useUint64 ? "loop.range" : "loop.range_exact",
    start,
    stop,
    step,
    indexType: type,
    operations,
  };
}

function lowerStatements(statements, context) {
  const result = [];
  for (const statement of statements) {
    if (nodeType(statement) === "AST_SimpleStatement") {
      const arenaAllocation = lowerArenaAllocation(statement, context);
      if (arenaAllocation !== undefined) {
        annotateOperations(
          arenaAllocation,
          sourceSpan(statement, context.filename),
        );
        result.push(...arenaAllocation);
        continue;
      }
      if (nodeType(statement.body) === "AST_Call") {
        const method = liveVectorMethod(statement.body);
        if (method === undefined) {
          const operations = [];
          const value = lowerExpression(statement.body, context, operations);
          const last = operations.at(-1);
          expect(
            context,
            statement,
            last?.kind === "ffi.call" && last.target === value.name,
            "native expression statements require one declared FFI call; " +
              "host callbacks are prohibited",
          );
          operations.push({ kind: "value.discard", source: value.name });
          annotateOperations(operations, sourceSpan(statement, context.filename));
          result.push(...operations);
          continue;
        }
        const operations = lowerLiveVectorMethodStatement(
          statement.body,
          context,
        );
        annotateOperations(operations, sourceSpan(statement, context.filename));
        result.push(...operations);
        continue;
      }
      const operations = lowerAssignment(statement, context);
      annotateOperations(operations, sourceSpan(statement, context.filename));
      result.push(...operations);
      continue;
    }
    if (nodeType(statement) === "AST_With") {
      context.scalarCoercions = new Map();
      const clauses = array(statement.clauses);
      expect(
        context,
        statement,
        statement.is_async !== true && clauses.length === 1,
        "a live exact owner requires one synchronous with clause",
      );
      const clause = clauses[0];
      const constructor = clause.expression;
      const constructorArgs = array(constructor?.args);
      const constructorName = nodeType(constructor) === "AST_Call" &&
          nodeType(constructor.expression) === "AST_SymbolRef"
        ? constructor.expression.name
        : undefined;
      const ownerType = constructorName === LIVE_INTEGER_VECTOR_TYPE
        ? LIVE_INTEGER_VECTOR_TYPE
        : constructorName === LIVE_INTEGER_MATRIX_TYPE
          ? LIVE_INTEGER_MATRIX_TYPE
          : constructorName === LIVE_EXACT_ARENA_TYPE
            ? LIVE_EXACT_ARENA_TYPE
            : undefined;
      const expectedArguments = ownerType === LIVE_INTEGER_MATRIX_TYPE
        ? 3
        : ownerType === LIVE_EXACT_ARENA_TYPE
          ? 2
          : 2;
      expect(
        context,
        constructor,
        ownerType !== undefined &&
          constructorArgs.length === expectedArguments &&
          array(constructor.args?.kwarg_items).length === 0 &&
          !constructor.args?.starargs,
        ownerType === LIVE_INTEGER_MATRIX_TYPE
          ? "NativeIntegerMatrix() requires rows, columns, and memory_limit"
          : ownerType === LIVE_EXACT_ARENA_TYPE
            ? "NativeExactArena() requires memory_limit and temporary_limit"
            : "NativeIntegerVector() requires capacity and memory_limit",
      );
      expect(
        context,
        clause.alias,
        nodeType(clause.alias) === "AST_SymbolAlias" &&
          isCIdentifier(clause.alias.name),
        "a live exact owner must be a simple local name",
      );
      const owner = clause.alias.name;
      expect(
        context,
        clause.alias,
        !context.variables.has(owner),
        `live exact owner ${owner} shadows an existing native value`,
      );
      if (ownerType === LIVE_EXACT_ARENA_TYPE) {
        expect(
          context,
          statement,
          context.activeExactArenas.size === 0,
          "nested NativeExactArena scopes are not supported",
        );
        const setup = [];
        const memoryLimit = lowerUint64Operand(
          constructorArgs[0],
          context,
          setup,
        );
        const temporaryLimit = lowerUint64Operand(
          constructorArgs[1],
          context,
          setup,
        );
        expect(
          context,
          constructor,
          memoryLimit.type === "uint64" && temporaryLimit.type === "uint64",
          "NativeExactArena memory_limit and temporary_limit must be uint64",
        );
        ensureVariable(context, clause.alias, owner, ownerType);
        context.initialized.add(owner);
        const arenaState = {
          children: [],
          controlDepth: context.controlDepth,
          loopDepth: context.loopDepth,
        };
        context.activeExactArenas.set(owner, arenaState);
        context.resourceScopeDepth += 1;
        const body = lowerBlock(statement.body, context);
        context.resourceScopeDepth -= 1;
        expect(
          context,
          statement,
          body.at(-1)?.kind === "return",
          "NativeExactArena body must end with an unconditional return",
        );
        context.activeExactArenas.delete(owner);
        context.initialized.delete(owner);
        for (const child of arenaState.children) {
          if (child.childKind === "foreign-resource") {
            context.activeArenaForeignResources.delete(child.owner);
          } else if (child.type === LIVE_INTEGER_MATRIX_TYPE) {
            context.activeIntegerMatrices.delete(child.owner);
          } else if (child.type === LIVE_INTEGER_VECTOR_TYPE) {
            context.activeIntegerVectors.delete(child.owner);
          } else if (boundedCollectionFromType(child.type) !== undefined) {
            context.activeBoundedCollections.delete(child.owner);
          } else if (child.type === LIVE_SPARSE_INTEGER_ROWS_TYPE) {
            context.activeSparseIntegerRows.delete(child.owner);
          } else {
            context.activeRecordVectors.delete(child.owner);
          }
          context.initialized.delete(child.owner);
        }
        const operation = {
          kind: "integer.arena.scope",
          owner,
          memoryLimit: memoryLimit.name,
          temporaryLimit: temporaryLimit.name,
          setup,
          children: arenaState.children,
          body,
        };
        annotateOperations([operation], sourceSpan(statement, context.filename));
        result.push(operation);
        continue;
      }
      const setup = [];
      const firstDimension = lowerUint64Operand(
        constructorArgs[0],
        context,
        setup,
      );
      const secondDimension = ownerType === LIVE_INTEGER_MATRIX_TYPE
        ? lowerUint64Operand(constructorArgs[1], context, setup)
        : undefined;
      const memoryLimit = lowerUint64Operand(
        constructorArgs[ownerType === LIVE_INTEGER_MATRIX_TYPE ? 2 : 1],
        context,
        setup,
      );
      expect(
        context,
        constructor,
        firstDimension.type === "uint64" &&
          (secondDimension === undefined || secondDimension.type === "uint64") &&
          memoryLimit.type === "uint64",
        ownerType === LIVE_INTEGER_MATRIX_TYPE
          ? "NativeIntegerMatrix rows, columns, and memory_limit must be uint64"
          : "NativeIntegerVector capacity and memory_limit must be uint64",
      );
      ensureVariable(context, clause.alias, owner, ownerType);
      context.initialized.add(owner);
      const activeOwners = ownerType === LIVE_INTEGER_MATRIX_TYPE
        ? context.activeIntegerMatrices
        : context.activeIntegerVectors;
      activeOwners.add(owner);
      context.resourceScopeDepth += 1;
      const body = lowerBlock(statement.body, context);
      context.resourceScopeDepth -= 1;
      activeOwners.delete(owner);
      context.initialized.delete(owner);
      const operation = ownerType === LIVE_INTEGER_MATRIX_TYPE
        ? {
            kind: "integer.matrix.scope",
            owner,
            rows: firstDimension.name,
            columns: secondDimension.name,
            memoryLimit: memoryLimit.name,
            setup,
            body,
          }
        : {
            kind: "integer.vector.scope",
            owner,
            capacity: firstDimension.name,
            memoryLimit: memoryLimit.name,
            setup,
            body,
          };
      annotateOperations([operation], sourceSpan(statement, context.filename));
      result.push(operation);
      continue;
    }
    if (nodeType(statement) === "AST_Return") {
      context.scalarCoercions = new Map();
      const operations = [];
      let value = lowerExpression(
        statement.value,
        context,
        operations,
        context.returnType === "uint64" ? "uint64" : undefined,
      );
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
            context.locals.has(value.name) &&
            !context.activeArenaForeignResources.has(value.name),
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
    if (nodeType(statement) === "AST_Break" ||
        nodeType(statement) === "AST_Continue") {
      const kind = nodeType(statement) === "AST_Break" ? "break" : "continue";
      const target = context.loopTargets.at(-1);
      expect(context, statement, target !== undefined,
        `native ${kind} requires an enclosing while loop`);
      expect(context, statement, target.kind === "while",
        `native ${kind} currently supports while-loop targets, not range loops`);
      // A C transfer would bypass lexical owner cleanup when a scope was
      // entered after the target loop. Loops entirely inside an existing owner
      // do not end its lifetime and require no cleanup at the transfer site.
      expect(context, statement,
        target.resourceScopeDepth === context.resourceScopeDepth,
        `native ${kind} cannot exit a live exact resource scope; ` +
          "cross-scope loop cleanup is not yet supported");
      context.scalarCoercions = new Map();
      const operation = { kind: `loop.${kind}` };
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
      context.loopDepth += 1;
      context.loopTargets.push({ kind: "while",
        resourceScopeDepth: context.resourceScopeDepth });
      const body = lowerBlock(statement.body, context);
      context.loopTargets.pop();
      context.loopDepth -= 1;
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
      const range = lowerRange(statement.object, context, index);
      ensureVariable(context, statement.init, index, range.indexType);
      const iterator = temporary(context, statement.init, range.indexType);
      const before = new Set(context.initialized);
      context.initialized.add(index);
      context.controlDepth += 1;
      context.loopDepth += 1;
      context.loopTargets.push({ kind: "range",
        resourceScopeDepth: context.resourceScopeDepth });
      const body = lowerBlock(statement.body, context);
      context.loopTargets.pop();
      context.loopDepth -= 1;
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
        iterator,
        start: range.start,
        stop: range.stop,
        step: range.step,
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
        statement.kind === "loop.range_exact" ||
        statement.kind === "integer.vector.scope" ||
        statement.kind === "integer.matrix.scope" ||
        statement.kind === "integer.arena.scope") &&
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
  records,
  filename,
  decorated,
  integerConstants = new Map(),
  canonicalForeignResources = new Map(),
) {
  const context = createContext(
    fn,
    signature,
    signatures,
    foreignFunctions,
    importedForeignResources,
    records,
    filename,
    decorated,
    integerConstants,
    canonicalForeignResources,
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
    hostCallable: !signature.params.some(
      (param) => isLiveExactOwnerType(param.type),
    ),
    kernelKind: "integer",
    sourceTransparent: true,
    params: publicParams,
    returnType: signature.returnType,
    locals: Array.from(context.locals, ([name, type]) => ({ name, type })),
    body,
    dependencies: Array.from(context.dependencies).sort(),
    foreignDependencies: Array.from(context.foreignDependencies).sort(),
    foreignResources: Array.from(context.usedForeignResources.values()),
    records: Array.from(records.values()),
    resourceAliases: Object.fromEntries(context.resourceAliases),
  };
}

module.exports = {
  canonicalType,
  isIntegerSignature,
  isLiveExactOwnerType,
  isTupleType,
  lowerIntegerFunction,
  signatureFromFunction,
  tupleElementTypes,
};
