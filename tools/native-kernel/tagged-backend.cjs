"use strict";

const {
  isVerifiedFixedSpanAccess,
} = require("./checked-bounds-proofs.cjs");
const {
  checkedRegionDirectCallEmission,
  checkedRegionDirectResultEmission,
  checkedRegionInt64ArithmeticEmission,
  checkedRegionInt64RangeIncrementEmission,
  checkedRegionLocalVariant,
  checkedRegionVirtualUInt64Emission,
  isCheckedRegionBufferAccess,
  isCheckedRegionNonzeroStep,
  isCheckedRegionUnitRangeContinue,
} = require("./checked-regions.cjs");

const {
  cOperationComment,
  cSourceDirective,
} = require("./provenance.cjs");

const { tupleElementTypes } = require("./integer-ir.cjs");
const {
  emitWordStatements,
  promotionSites,
  wordName,
  wordType,
} = require("./word-backend.cjs");
const {
  emitTaggedForeignCall,
  resourceForFunctionType,
} = require("./ffi-codegen.cjs");
const {
  isUint64Shift,
  uint64COperator,
} = require("./uint64-operations.cjs");
const { int64CComparison, int64Constant: checkedInt64Constant } =
  require("./int64-operations.cjs");

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

function cString(value) {
  return JSON.stringify(String(value));
}

function fitsInt64(value) {
  const integer = BigInt(value);
  return integer >= INT64_MIN && integer <= INT64_MAX;
}

function int64Constant(value) {
  const integer = BigInt(value);
  if (integer === INT64_MIN) return "INT64_MIN";
  if (integer < 0n) return `(-INT64_C(${(-integer).toString()}))`;
  return `INT64_C(${integer.toString()})`;
}

function taggedName(name) {
  return `sagejs_local_tagged_${name}`;
}

function virtualUInt64Snapshot(claim, context) {
  const snapshot = context.virtualUInt64Snapshots.get(claim.viewTarget);
  if (snapshot === undefined) {
    throw new Error("missing authorized virtual UInt64 view snapshot");
  }
  return snapshot;
}

function scalarType(type, fn) {
  if (type === "Float64") return "double";
  if (type === "Float64Buffer") return "sagejs_float64_buffer";
  if (type === "uint64") return "uint64_t";
  if (type === "int64") return "int64_t";
  if (type === "bool") return "int";
  if (type === "Int64Buffer" || type === "Int64Record") {
    return "sagejs_int64_buffer";
  }
  if (type === "UInt64Buffer") return "sagejs_uint64_buffer";
  if (type === "IntegerBuffer") return "sagejs_integer_buffer";
  const resource = fn === undefined ? undefined : resourceForFunctionType(fn, type);
  if (resource !== undefined) return resource.abi_type;
  throw new Error(`unsupported tagged scalar type ${type}`);
}

function taggedResults(fn, type) {
  const tuple = tupleElementTypes(type) || [type];
  return tuple.map((element, index) => {
    if (element === "Integer") {
      return `sagejs_tagged_int *sagejs_tagged_output_${index}`;
    }
    const resource = resourceForFunctionType(fn, element);
    if (resource !== undefined) {
      return `${resource.abi_type} sagejs_tagged_output_${index}`;
    }
    return `${scalarType(element, fn)} *sagejs_tagged_output_${index}`;
  });
}

function taggedParameter(fn, param) {
  if (param.type === "Integer") {
    return `sagejs_tagged_int *sagejs_tagged_arg_${param.name}`;
  }
  return `${scalarType(param.type, fn)} sagejs_tagged_arg_${param.name}`;
}

// Verified private graphs are internal implementation details.  Give the C
// compiler freedom to inline and place those graphs without imposing a
// nonportable attribute on ordinary tagged functions or their public guards.
const CHECKED_REGION_ATTRIBUTES = `#if defined(_MSC_VER)
#define SAGEJS_CHECKED_REGION_HOT_INLINE static __inline
#define SAGEJS_CHECKED_REGION_FORCE_INLINE static __forceinline
#define SAGEJS_CHECKED_REGION_COLD static
#define SAGEJS_CHECKED_REGION_UNLIKELY(condition) (condition)
#elif defined(__GNUC__) || defined(__clang__)
#define SAGEJS_CHECKED_REGION_HOT_INLINE static inline __attribute__((hot))
#define SAGEJS_CHECKED_REGION_FORCE_INLINE \
    static inline __attribute__((hot, always_inline))
#define SAGEJS_CHECKED_REGION_COLD static __attribute__((cold))
#define SAGEJS_CHECKED_REGION_UNLIKELY(condition) \\
    __builtin_expect(!!(condition), 0)
#else
#define SAGEJS_CHECKED_REGION_HOT_INLINE static inline
#define SAGEJS_CHECKED_REGION_FORCE_INLINE static inline
#define SAGEJS_CHECKED_REGION_COLD static
#define SAGEJS_CHECKED_REGION_UNLIKELY(condition) (condition)
#endif`;

const CHECKED_REGION_FORCE_INLINE_MAX_OPERATIONS = 64;
const CHECKED_REGION_FORCE_INLINE_MIN_INCOMING_SITES = 8;
const CHECKED_REGION_FORCE_INLINE_MIN_CALLERS = 2;
const CHECKED_REGION_FORCE_INLINE_MAX_EXPANDED_OPERATIONS = 768;

function visitIrOperations(value, visitor, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (typeof value.kind === "string") visitor(value);
  if (Array.isArray(value)) {
    for (const child of value) visitIrOperations(child, visitor, seen);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "provenance") visitIrOperations(child, visitor, seen);
  }
}

// GCC's broad inliner already handles most authenticated private graphs well,
// while forcing an entire graph inline creates severe code-size pressure.  A
// small leaf with many static callers is different: duplication is bounded,
// and eliminating its call ABI can expose the caller's interval facts.  Keep
// this deliberately conservative and structural so no mathematical function
// name or workload-specific profile enters code generation.
function checkedRegionInlineCandidate(fn, functions) {
  const region = fn.checkedRegionVariant?.region;
  if (region === undefined || checkedRegionDirectResultEmission(fn) === undefined) {
    return undefined;
  }
  let operations = 0;
  let leaf = true;
  visitIrOperations(fn.body, (operation) => {
    operations += 1;
    if (operation.kind === "native.call") leaf = false;
  });
  if (!leaf || operations > CHECKED_REGION_FORCE_INLINE_MAX_OPERATIONS) {
    return undefined;
  }
  let incomingSites = 0;
  const callers = new Set();
  for (const caller of functions.values()) {
    if (caller.checkedRegionVariant?.region !== region) continue;
    visitIrOperations(caller.body, (operation) => {
      if (operation.kind !== "native.call") return;
      const direct = checkedRegionDirectCallEmission(
        caller,
        operation,
        functions,
      );
      // A residual guarded edge still needs both paths and does not provide
      // the unconditional call-site simplification this heuristic measures.
      if (direct?.function === fn.name && direct.guard === undefined) {
        incomingSites += 1;
        callers.add(caller.name);
      }
    });
  }
  if (incomingSites < CHECKED_REGION_FORCE_INLINE_MIN_INCOMING_SITES ||
      callers.size < CHECKED_REGION_FORCE_INLINE_MIN_CALLERS ||
      operations * incomingSites >
        CHECKED_REGION_FORCE_INLINE_MAX_EXPANDED_OPERATIONS) {
    return undefined;
  }
  return Object.freeze({ fn, incomingSites, operations });
}

// Select at most one candidate per generated graph. A tied top fan-in is
// intentionally rejected: absent a profile, choosing between equally broad
// expansions would be arbitrary and could create blanket code growth.
function checkedRegionForceInlineFunctions(functions) {
  const candidates = [...functions.values()]
    .map(fn => checkedRegionInlineCandidate(fn, functions))
    .filter(candidate => candidate !== undefined)
    .sort((left, right) =>
      right.incomingSites - left.incomingSites ||
      left.operations - right.operations ||
      left.fn.name.localeCompare(right.fn.name)
    );
  if (candidates.length === 0 ||
      (candidates.length > 1 &&
       candidates[0].incomingSites === candidates[1].incomingSites)) {
    return new Set();
  }
  return new Set([candidates[0].fn.name]);
}

function checkedRegionSmallHighFaninLeaf(fn, functions) {
  return checkedRegionForceInlineFunctions(functions).has(fn.name);
}

function checkedRegionStorage(fn, forceInlineFunctions) {
  if (!fn.checkedRegionVariant) return undefined;
  return forceInlineFunctions.has(fn.name)
    ? "SAGEJS_CHECKED_REGION_FORCE_INLINE"
    : "SAGEJS_CHECKED_REGION_HOT_INLINE";
}

function checkedRegionFailureCondition(caller, callee, condition) {
  return caller.checkedRegionVariant && callee.checkedRegionVariant
    ? `SAGEJS_CHECKED_REGION_UNLIKELY(${condition})`
    : condition;
}

function taggedSignature(fn, prototype = false, options = {}) {
  const parameters = [
    "sagejs_native_status *status",
    ...taggedResults(fn, fn.returnType),
    ...fn.params.map((param) => taggedParameter(fn, param)),
  ].join(", ");
  const storage = options.storage || (fn.checkedRegionVariant
    ? "SAGEJS_CHECKED_REGION_HOT_INLINE"
    : "static");
  const name = options.name || fn.name;
  return `${storage} int tagged_${name}(${parameters})${prototype ? ";" : ""}`;
}

function directResultName(name) {
  return `sagejs_direct_${name}`;
}

function directResultSignature(fn, prototype = false, options = {}) {
  const parameters = fn.params.map((param) =>
    `${scalarType(param.type, fn)} sagejs_tagged_arg_${param.name}`
  ).join(", ") || "void";
  const storage = options.storage || "SAGEJS_CHECKED_REGION_HOT_INLINE";
  return `${storage} ${scalarType(fn.returnType, fn)} ` +
    `${directResultName(fn.name)}(${parameters})${prototype ? ";" : ""}`;
}

function taggedForwardArguments(fn) {
  const results = tupleElementTypes(fn.returnType) || [fn.returnType];
  return [
    "status",
    ...results.map((_type, index) => `sagejs_tagged_output_${index}`),
    ...fn.params.map((param) => `sagejs_tagged_arg_${param.name}`),
  ];
}

function int64Literal(value) {
  const integer = BigInt(value);
  if (integer === INT64_MIN) return "INT64_MIN";
  if (integer < 0n) return `(-INT64_C(${(-integer).toString()}))`;
  return `INT64_C(${integer.toString()})`;
}

function uint64Literal(value) {
  return `UINT64_C(${BigInt(value).toString()})`;
}

function checkedRegionGuard(
  region,
  argument = (name) => `sagejs_tagged_arg_${name}`,
  indent = "    ",
) {
  const setup = [`${indent}int sagejs_checked_region_guard = 1;`];
  const conditions = [];
  for (const predicate of region.guard) {
    if (predicate.kind === "checked-nonnegative-int64-product") {
      const product = `sagejs_checked_product_${predicate.name}`;
      const left = argument(predicate.left);
      const right = argument(predicate.right);
      setup.push(
        `${indent}int64_t ${product} = 0;`,
        `${indent}if (${left} < 0 || ${right} < 0 ||`,
        `${indent}    (${right} != 0 && ${left} > INT64_MAX / ${right}))`,
        `${indent}    sagejs_checked_region_guard = 0;`,
        `${indent}else`,
        `${indent}    ${product} = ${left} * ${right};`,
      );
      continue;
    }
    if (predicate.kind === "buffer-min-length-product") {
      const product = `sagejs_checked_product_${predicate.product}`;
      const buffer = argument(predicate.buffer);
      conditions.push(
        `((uint64_t) ${product} <= (uint64_t) SIZE_MAX && ` +
        `${buffer}.length >= (size_t) ${product})`,
      );
      continue;
    }
    if (["buffer-min-length-scalar", "buffer-min-length-affine"].includes(
      predicate.kind,
    )) {
      const scalar = argument(predicate.scalar);
      const buffer = argument(predicate.buffer);
      const offset = int64Literal(predicate.offset);
      const value = predicate.kind === "buffer-min-length-affine"
        ? `(${scalar} + ${offset})`
        : scalar;
      const safeAdd = predicate.kind === "buffer-min-length-affine"
        ? `${scalar} <= INT64_MAX - ${offset} && `
        : "";
      conditions.push(
        `(${scalar} >= 0 && ${safeAdd}` +
        `(uint64_t) ${value} <= (uint64_t) SIZE_MAX && ` +
        `${buffer}.length >= (size_t) ${value})`,
      );
      continue;
    }
    const value = argument(predicate.parameter);
    if (predicate.kind === "buffer-min-length") {
      conditions.push(
        `(UINT64_C(${predicate.minimum}) <= (uint64_t) SIZE_MAX && ` +
        `${value}.length >= (size_t) UINT64_C(${predicate.minimum}))`,
      );
      continue;
    }
    if (predicate.kind === "integer-int64-range") {
      conditions.push(`(!${value}->is_big && ${value}->small >= ` +
        `${int64Literal(predicate.minimum)} && ${value}->small <= ` +
        `${int64Literal(predicate.maximum)})`);
      continue;
    }
    const literal = predicate.kind === "uint64-range"
      ? uint64Literal
      : int64Literal;
    conditions.push(`(${value} >= ${literal(predicate.minimum)} && ` +
      `${value} <= ${literal(predicate.maximum)})`);
  }
  return {
    setup: setup.join("\n"),
    condition: ["sagejs_checked_region_guard", ...conditions].join(" && "),
  };
}

function taggedValue(name, context) {
  if (context.resourceParameters?.has(name)) {
    return `sagejs_tagged_arg_${name}`;
  }
  if (context.types.get(name) === "Integer") {
    return context.tagLocals.has(name)
      ? `&${taggedName(name)}`
      : `sagejs_tagged_arg_${name}`;
  }
  return taggedName(name);
}

function setInteger(target, value, indent) {
  if (fitsInt64(value)) {
    return `${indent}sagejs_tagged_set_small(${target}, ` +
      `${int64Constant(value)});`;
  }
  return [
    `${indent}if (!sagejs_tagged_set_decimal(${target}, ` +
      `${cString(value)}))`,
    `${indent}{`,
    `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_TYPE_ERROR, ` +
      '"invalid native integer literal");',
    `${indent}    goto fail;`,
    `${indent}}`,
  ].join("\n");
}

function emitDivisionGuard(right, indent) {
  return [
    `${indent}if (sagejs_tagged_sgn(${right}) == 0)`,
    `${indent}{`,
    `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
      '"integer division or modulo by zero");',
    `${indent}    goto fail;`,
    `${indent}}`,
  ].join("\n");
}

function emitTaggedOperation(operation, context, indent) {
  if (typeof operation.target === "string" &&
      context.directDeadExactNames?.has(operation.target)) return "";
  const target = operation.target === undefined
    ? undefined
    : taggedValue(operation.target, context);
  if (operation.kind.startsWith("float64.") ||
      operation.kind === "integer.from_float64" ||
      operation.kind === "integer.round_float64") {
    // Reuse GMP's floating semantics, adapting only explicit integer edges.
    // Function-owned temporaries are cleared by the ordinary failure path.
    const outputs = operation.results?.map(result => result.name) ||
      (operation.target === undefined ? [] : [operation.target]);
    const integerOutputs = outputs.filter(name => context.types.get(name) === "Integer");
    const integerInputs = [operation.source, operation.exponent]
      .filter(name => name !== undefined && context.types.get(name) === "Integer");
    if (integerInputs.length > 1 || integerOutputs.length > 1) {
      throw new Error("unsupported mixed tagged conversion arity");
    }
    const aliases = new Map();
    const lines = [];
    for (const name of integerInputs) {
      const source = taggedValue(name, context);
      aliases.set(name, "sagejs_mixed_input");
      lines.push(`${indent}if ((${source})->is_big)`,
        `${indent}    mpz_set(sagejs_mixed_input, (${source})->big);`,
        `${indent}else`,
        `${indent}    set_mpz_int64(sagejs_mixed_input, (${source})->small);`);
    }
    for (const name of integerOutputs) aliases.set(name, "sagejs_mixed_output");
    lines.push(context.emitMixedOperation(operation, {
      ...context,
      value: name => aliases.get(name) || taggedValue(name, context),
    }, indent));
    for (const name of integerOutputs) {
      const output = taggedValue(name, context);
      lines.push(`${indent}if (mpz_to_int64(sagejs_mixed_output, &sagejs_mixed_small))`,
        `${indent}    sagejs_tagged_set_small(${output}, sagejs_mixed_small);`,
        `${indent}else {`,
        `${indent}    sagejs_tagged_make_big(${output});`,
        `${indent}    mpz_set((${output})->big, sagejs_mixed_output);`,
        `${indent}}`);
    }
    return lines.join("\n");
  }
  if (operation.kind === "integer.constant") {
    return setInteger(target, operation.value, indent);
  }
  if (operation.kind === "uint64.constant") {
    return `${indent}${target} = UINT64_C(${operation.value});`;
  }
  if (operation.kind === "int64.constant") {
    return `${indent}${target} = ${checkedInt64Constant(operation.value)};`;
  }
  if (operation.kind === "bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (operation.kind === "range.validate_step") {
    if (context.directResult === true &&
        isCheckedRegionNonzeroStep(operation)) return "";
    const step = taggedValue(operation.step, context);
    const condition = operation.stepType === "Integer"
      ? `sagejs_tagged_sgn(${step}) == 0`
      : `${step} == 0`;
    return [
      `${indent}if (${condition})`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `${cString("range() arg 3 must not be zero")});`,
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.copy") {
    return `${indent}sagejs_tagged_copy(${target}, ` +
      `${taggedValue(operation.source, context)});`;
  }
  if (["bool.copy", "uint64.copy", "int64.copy"].includes(operation.kind)) {
    return `${indent}${target} = ${taggedValue(operation.source, context)};`;
  }
  if (operation.kind === "uint64.binary") {
    const left = taggedValue(operation.left, context);
    const right = taggedValue(operation.right, context);
    if (operation.operation === "floordiv" || operation.operation === "mod") {
      const operator = operation.operation === "floordiv" ? "/" : "%";
      return [
        `${indent}if (${right} == 0)`,
        `${indent}{`,
        `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"unsigned integer division or modulo by zero");`,
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${left} ${operator} ${right};`,
      ].join("\n");
    }
    const operator = uint64COperator(operation.operation);
    if (isUint64Shift(operation.operation)) {
      return [
        `${indent}if (${right} >= UINT64_C(64))`,
        `${indent}{`,
        `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"uint64 shift count must be between 0 and 63");`,
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${left} ${operator} (unsigned int) ${right};`,
      ].join("\n");
    }
    return `${indent}${target} = ${left} ${operator} ${right};`;
  }
  if (operation.kind === "uint64.compare") {
    const operator = {
      eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=",
    }[operation.operation];
    return `${indent}${target} = ${taggedValue(operation.left, context)} ` +
      `${operator} ${taggedValue(operation.right, context)};`;
  }
  if (operation.kind === "int64.binary") {
    const left = taggedValue(operation.left, context);
    const right = taggedValue(operation.right, context);
    if (["add", "sub", "mul"].includes(operation.operation)) {
      if (context.int64Arithmetic.isAuthorized(operation)) {
        const operator = { add: "+", sub: "-", mul: "*" }[
          operation.operation
        ];
        return `${indent}${target} = ${left} ${operator} ${right};`;
      }
      return [
        `${indent}if (!sagejs_word_${operation.operation}_int64(` +
          `${left}, ${right}, &${target}))`,
        `${indent}{`,
        `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"int64 arithmetic overflow");`,
        `${indent}    goto fail;`, `${indent}}`,
      ].join("\n");
    }
    const quotient = operation.operation === "floordiv";
    return [
      `${indent}if (${right} == 0)`, `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"integer division or modulo by zero");`,
      `${indent}    goto fail;`, `${indent}}`,
      `${indent}if (${left} == INT64_MIN && ${right} == -1)`, `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"int64 arithmetic overflow");`,
      `${indent}    goto fail;`, `${indent}}`,
      `${indent}sagejs_word_fdiv_int64(${left}, ${right}, ` +
        `${quotient ? `&${target}, NULL` : `NULL, &${target}`});`,
    ].join("\n");
  }
  if (operation.kind === "int64.compare") {
    return `${indent}${target} = ${taggedValue(operation.left, context)} ` +
      `${int64CComparison(operation.operation)} ` +
      `${taggedValue(operation.right, context)};`;
  }
  if (operation.kind === "integer.mod_uint64") {
    const divisor = taggedValue(operation.right, context);
    return [
      `${indent}if (${divisor} == 0)`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"integer division or modulo by zero");`,
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${target} = sagejs_tagged_mod_uint64(` +
        `${taggedValue(operation.left, context)}, ${divisor});`,
    ].join("\n");
  }
  if (operation.kind === "uint64.buffer.copy") {
    if (context.virtualUInt64Views.claim(operation, "alias") !== undefined) {
      return "";
    }
    return `${indent}${target} = ${taggedValue(operation.source, context)};`;
  }
  if (operation.kind === "uint64.buffer.length") {
    const virtual = context.virtualUInt64Views.claim(operation, "access");
    if (virtual !== undefined) {
      return virtual.mode === "validated"
        ? `${indent}${target} = (uint64_t) ` +
          `${virtualUInt64Snapshot(virtual, context).length};`
        : `${indent}${target} = UINT64_C(${virtual.length});`;
    }
    return `${indent}${target} = (uint64_t) ` +
      `${taggedValue(operation.buffer, context)}.length;`;
  }
  if (operation.kind === "uint64.buffer.get" ||
      operation.kind === "uint64.buffer.set") {
    const buffer = taggedValue(operation.buffer, context);
    const index = taggedValue(operation.index, context);
    const virtual = context.virtualUInt64Views.claim(operation, "access");
    if (virtual !== undefined) {
      if (virtual.mode === "validated") {
        const { data, length } = virtualUInt64Snapshot(virtual, context);
        const direct = operation.kind === "uint64.buffer.get"
          ? `${target} = ${data}[(size_t) (${index})];`
          : `${data}[(size_t) (${index})] = ` +
            `${taggedValue(operation.value, context)};`;
        if (isVerifiedFixedSpanAccess(operation) ||
            virtual.logicalIndexProof?.authority ===
              "checked-region-virtual-view-range-v1") {
          return `${indent}${direct}`;
        }
        const signedIndex = operation.indexType === "Integer" ||
          operation.indexType === "int64";
        const position = signedIndex
          ? "sagejs_buffer_position" : `(size_t) ${index}`;
        const checkedAccess = operation.kind === "uint64.buffer.get"
          ? `${target} = ${data}[${position}];`
          : `${data}[${position}] = ` +
            `${taggedValue(operation.value, context)};`;
        if (operation.indexType === "Integer") {
          return [
            `${indent}{`,
            `${indent}    int64_t sagejs_buffer_index;`,
            `${indent}    size_t sagejs_buffer_position;`,
            `${indent}    if (!sagejs_tagged_to_int64(${index}, ` +
              `&sagejs_buffer_index) ||`,
            `${indent}        !sagejs_signed_buffer_index(${length}, ` +
              `sagejs_buffer_index, &sagejs_buffer_position))`,
            `${indent}    {`,
            `${indent}        sagejs_native_status_set(status, ` +
              `SAGEJS_NATIVE_RANGE_ERROR, "UInt64Buffer index out of range");`,
            `${indent}        goto fail;`,
            `${indent}    }`,
            `${indent}    ${checkedAccess}`,
            `${indent}}`,
          ].join("\n");
        }
        if (operation.indexType === "int64") {
          return [
            `${indent}{`,
            `${indent}    size_t sagejs_buffer_position;`,
            `${indent}    if (!sagejs_signed_buffer_index(${length}, ${index}, ` +
              `&sagejs_buffer_position))`,
            `${indent}    {`,
            `${indent}        sagejs_native_status_set(status, ` +
              `SAGEJS_NATIVE_RANGE_ERROR, "UInt64Buffer index out of range");`,
            `${indent}        goto fail;`,
            `${indent}    }`,
            `${indent}    ${checkedAccess}`,
            `${indent}}`,
          ].join("\n");
        }
        return [
          `${indent}if (${index} >= (uint64_t) ${length})`,
          `${indent}{`,
          `${indent}    sagejs_native_status_set(status, ` +
            `SAGEJS_NATIVE_RANGE_ERROR, "UInt64Buffer index out of range");`,
          `${indent}    goto fail;`,
          `${indent}}`,
          `${indent}${checkedAccess}`,
        ].join("\n");
      }
      const root = taggedValue(virtual.root, context);
      const start = virtual.startKind === "constant"
        ? int64Constant(virtual.startExpression)
        : taggedValue(virtual.startExpression, context);
      const position = `(size_t) (${start}) + (size_t) (${index})`;
      const direct = operation.kind === "uint64.buffer.get"
        ? `${target} = ${root}.data[${position}];`
        : `${root}.data[${position}] = ` +
          `${taggedValue(operation.value, context)};`;
      // Only the fixed-span verifier binds the iterator to this exact view's
      // logical length. A generic checked-region buffer fact may concern the
      // containing root and cannot authorize a logical subview access.
      if (isVerifiedFixedSpanAccess(operation) ||
          virtual.logicalIndexProof?.authority ===
            "checked-region-virtual-view-range-v1") {
        return `${indent}${direct}`;
      }
      const checkedAccess = operation.kind === "uint64.buffer.get"
        ? `${target} = ${root}.data[` +
          `(size_t) (${start}) + sagejs_buffer_position];`
        : `${root}.data[(size_t) (${start}) + sagejs_buffer_position] = ` +
          `${taggedValue(operation.value, context)};`;
      if (operation.indexType === "Integer") {
        return [
          `${indent}{`,
          `${indent}    int64_t sagejs_buffer_index;`,
          `${indent}    size_t sagejs_buffer_position;`,
          `${indent}    if (!sagejs_tagged_to_int64(${index}, ` +
            `&sagejs_buffer_index) ||`,
          `${indent}        !sagejs_signed_buffer_index(` +
            `(size_t) UINT64_C(${virtual.length}), sagejs_buffer_index, ` +
            `&sagejs_buffer_position))`,
          `${indent}    {`,
          `${indent}        sagejs_native_status_set(status, ` +
            `SAGEJS_NATIVE_RANGE_ERROR, "UInt64Buffer index out of range");`,
          `${indent}        goto fail;`,
          `${indent}    }`,
          `${indent}    ${checkedAccess}`,
          `${indent}}`,
        ].join("\n");
      }
      if (operation.indexType === "int64") {
        return [
          `${indent}{`,
          `${indent}    size_t sagejs_buffer_position;`,
          `${indent}    if (!sagejs_signed_buffer_index(` +
            `(size_t) UINT64_C(${virtual.length}), ${index}, ` +
            `&sagejs_buffer_position))`,
          `${indent}    {`,
          `${indent}        sagejs_native_status_set(status, ` +
            `SAGEJS_NATIVE_RANGE_ERROR, "UInt64Buffer index out of range");`,
          `${indent}        goto fail;`,
          `${indent}    }`,
          `${indent}    ${checkedAccess}`,
          `${indent}}`,
        ].join("\n");
      }
      return [
        `${indent}if (${index} >= UINT64_C(${virtual.length}))`,
        `${indent}{`,
        `${indent}    sagejs_native_status_set(status, ` +
          `SAGEJS_NATIVE_RANGE_ERROR, "UInt64Buffer index out of range");`,
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${direct}`,
      ].join("\n");
    }
    const signedIndex = operation.indexType === "Integer" ||
      operation.indexType === "int64";
    const position = signedIndex
      ? "sagejs_buffer_position" : `(size_t) ${index}`;
    const access = operation.kind === "uint64.buffer.get"
      ? `${target} = ${buffer}.data[${position}];`
      : `${buffer}.data[${position}] = ` +
        `${taggedValue(operation.value, context)};`;
    if (isVerifiedFixedSpanAccess(operation) ||
        isCheckedRegionBufferAccess(operation)) {
      const verifiedAccess = operation.kind === "uint64.buffer.get"
        ? `${target} = ${buffer}.data[(size_t) ${index}];`
        : `${buffer}.data[(size_t) ${index}] = ` +
          `${taggedValue(operation.value, context)};`;
      return `${indent}${verifiedAccess}`;
    }
    if (operation.indexType === "Integer") {
      return [
        `${indent}{`,
        `${indent}    int64_t sagejs_buffer_index;`,
        `${indent}    size_t sagejs_buffer_position;`,
        `${indent}    if (!sagejs_tagged_to_int64(${index}, ` +
          `&sagejs_buffer_index) ||`,
        `${indent}        !sagejs_signed_buffer_index(${buffer}.length, ` +
          `sagejs_buffer_index, &sagejs_buffer_position))`,
        `${indent}    {`,
        `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"UInt64Buffer index out of range");`,
        `${indent}        goto fail;`,
        `${indent}    }`,
        `${indent}    ${access}`,
        `${indent}}`,
      ].join("\n");
    }
    if (operation.indexType === "int64") {
      return [
        `${indent}{`,
        `${indent}    size_t sagejs_buffer_position;`,
        `${indent}    if (!sagejs_signed_buffer_index(${buffer}.length, ` +
          `${index}, &sagejs_buffer_position))`,
        `${indent}    {`,
        `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"UInt64Buffer index out of range");`,
        `${indent}        goto fail;`,
        `${indent}    }`,
        `${indent}    ${access}`,
        `${indent}}`,
      ].join("\n");
    }
    return [
      `${indent}if (${index} >= (uint64_t) ${buffer}.length)`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"UInt64Buffer index out of range");`,
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${access}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.copy") {
    return `${indent}${target} = ${taggedValue(operation.source, context)};`;
  }
  if (operation.kind === "int64.buffer.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${taggedValue(operation.buffer, context)}.length;`;
  }
  if (operation.kind === "int64.record.view" ||
      operation.kind === "integer.buffer.view" ||
      operation.kind === "uint64.buffer.view") {
    if (operation.kind === "uint64.buffer.view") {
      const virtual = context.virtualUInt64Views.claim(operation, "view");
      if (virtual?.mode === "fixed") return "";
      if (virtual?.mode === "validated") {
        const buffer = taggedValue(operation.buffer, context);
        const start = taggedValue(operation.start, context);
        const length = taggedValue(operation.length, context);
        const { data: dataSnapshot, length: lengthSnapshot } =
          virtualUInt64Snapshot(virtual, context);
        return [
          `${indent}{`,
          `${indent}    int64_t sagejs_record_start;`,
          `${indent}    int64_t sagejs_record_length;`,
          `${indent}    if (!sagejs_tagged_to_int64(${start}, ` +
            `&sagejs_record_start) ||`,
          `${indent}        !sagejs_tagged_to_int64(${length}, ` +
            `&sagejs_record_length) ||`,
          `${indent}        sagejs_record_start < 0 || ` +
            `sagejs_record_length < 0 ||`,
          `${indent}        (uint64_t) sagejs_record_start > ` +
            `(uint64_t) ${buffer}.length ||`,
          `${indent}        (uint64_t) sagejs_record_length > ` +
            `(uint64_t) ${buffer}.length - ` +
            `(uint64_t) sagejs_record_start)`,
          `${indent}    {`,
          `${indent}        sagejs_native_status_set(status, ` +
            `SAGEJS_NATIVE_RANGE_ERROR, ` +
            `"UInt64Buffer view is outside its buffer");`,
          `${indent}        goto fail;`,
          `${indent}    }`,
          `${indent}    ${dataSnapshot} = ${buffer}.data;`,
          `${indent}    if ((size_t) sagejs_record_start != 0)`,
          `${indent}        ${dataSnapshot} += (size_t) sagejs_record_start;`,
          `${indent}    ${lengthSnapshot} = ` +
            `(size_t) sagejs_record_length;`,
          `${indent}}`,
        ].join("\n");
      }
    }
    const exactView = operation.kind === "integer.buffer.view";
    const uint64View = operation.kind === "uint64.buffer.view";
    const buffer = taggedValue(operation.buffer, context);
    const start = taggedValue(operation.start, context);
    const length = taggedValue(operation.length, context);
    return [
      `${indent}{`,
      `${indent}    int64_t sagejs_record_start;`,
      `${indent}    int64_t sagejs_record_length;`,
      `${indent}    if (!sagejs_tagged_to_int64(${start}, ` +
        `&sagejs_record_start) ||`,
      `${indent}        !sagejs_tagged_to_int64(${length}, ` +
        `&sagejs_record_length) ||`,
      `${indent}        sagejs_record_start < 0 || ` +
        `sagejs_record_length < 0 ||`,
      `${indent}        (uint64_t) sagejs_record_start > ` +
        `(uint64_t) ${buffer}.length ||`,
      `${indent}        (uint64_t) sagejs_record_length > ` +
        `(uint64_t) ${buffer}.length - ` +
        `(uint64_t) sagejs_record_start)`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `${cString(exactView ? "IntegerBuffer view is outside its buffer" : uint64View ? "UInt64Buffer view is outside its buffer" : "Int64Record is outside its buffer")});`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      ...(exactView ? [
        `${indent}    ${target} = ${buffer};`,
        `${indent}    if ((size_t) sagejs_record_start != 0) {`,
        `${indent}        ${target}.sizes += (size_t) sagejs_record_start;`,
        `${indent}        ${target}.limbs += (size_t) sagejs_record_start * ${buffer}.word_capacity;`,
        `${indent}    }`,
      ] : [
      `${indent}    ${target}.data = ${buffer}.data;`,
      `${indent}    if ((size_t) sagejs_record_start != 0)`,
      `${indent}        ${target}.data += (size_t) sagejs_record_start;`,
      ]),
      `${indent}    ${target}.length = (size_t) sagejs_record_length;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.get") {
    const buffer = taggedValue(operation.buffer, context);
    const index = taggedValue(operation.index, context);
    const directIndex = operation.indexType === "int64";
    const unsignedIndex = operation.indexType === "uint64";
    if (isCheckedRegionBufferAccess(operation)) {
      return operation.valueType === "int64"
        ? `${indent}${target} = ${buffer}.data[(size_t) ${index}];`
        : `${indent}sagejs_tagged_set_small(${target}, ` +
          `${buffer}.data[(size_t) ${index}]);`;
    }
    return [
      `${indent}{`,
      ...(!directIndex && !unsignedIndex
        ? [`${indent}    int64_t sagejs_buffer_index;`]
        : []),
      `${indent}    size_t sagejs_buffer_position = ` +
        `${unsignedIndex ? `(size_t) ${index}` : "0"};`,
      `${indent}    if (` + (unsignedIndex
        ? `${index} >= (uint64_t) ${buffer}.length`
        : (!directIndex
        ? `!sagejs_tagged_to_int64(${index}, &sagejs_buffer_index) || `
        : "") + `!sagejs_int64_buffer_index(&${buffer}, ` +
        `${directIndex ? index : "sagejs_buffer_index"}, ` +
        `&sagejs_buffer_position)`) + `)`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"Int64 buffer index out of range");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      operation.valueType === "int64"
        ? `${indent}    ${target} = ${buffer}.data[sagejs_buffer_position];`
        : `${indent}    sagejs_tagged_set_small(${target}, ` +
          `${buffer}.data[sagejs_buffer_position]);`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.set") {
    const buffer = taggedValue(operation.buffer, context);
    const index = taggedValue(operation.index, context);
    const source = taggedValue(operation.value, context);
    const directIndex = operation.indexType === "int64";
    const unsignedIndex = operation.indexType === "uint64";
    const directValue = operation.valueType === "int64";
    if (isCheckedRegionBufferAccess(operation)) {
      if (directValue) {
        return `${indent}${buffer}.data[(size_t) ${index}] = ${source};`;
      }
      return [
        `${indent}{`,
        `${indent}    int64_t sagejs_buffer_value;`,
        `${indent}    if (!sagejs_tagged_to_int64(${source}, ` +
          `&sagejs_buffer_value))`,
        `${indent}    {`,
        `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"Int64Buffer value is outside signed 64-bit");`,
        `${indent}        goto fail;`,
        `${indent}    }`,
        `${indent}    ${buffer}.data[(size_t) ${index}] = ` +
          `sagejs_buffer_value;`,
        `${indent}}`,
      ].join("\n");
    }
    return [
      `${indent}{`,
      ...(!directIndex && !unsignedIndex
        ? [`${indent}    int64_t sagejs_buffer_index;`]
        : []),
      ...(!directValue ? [`${indent}    int64_t sagejs_buffer_value;`] : []),
      `${indent}    size_t sagejs_buffer_position = ` +
        `${unsignedIndex ? `(size_t) ${index}` : "0"};`,
      `${indent}    if (` + (unsignedIndex
        ? `${index} >= (uint64_t) ${buffer}.length`
        : (!directIndex
        ? `!sagejs_tagged_to_int64(${index}, &sagejs_buffer_index) || `
        : "") + `!sagejs_int64_buffer_index(&${buffer}, ` +
        `${directIndex ? index : "sagejs_buffer_index"}, ` +
        `&sagejs_buffer_position)`) + `)`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"Int64 buffer index out of range");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      ...(!directValue ? [
        `${indent}    if (!sagejs_tagged_to_int64(${source}, ` +
          `&sagejs_buffer_value))`,
        `${indent}    {`,
        `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"Int64Buffer value is outside signed 64-bit");`,
        `${indent}        goto fail;`, `${indent}    }`,
      ] : []),
      `${indent}    ${buffer}.data[sagejs_buffer_position] = ` +
        `${directValue ? source : "sagejs_buffer_value"};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.buffer.copy") {
    return `${indent}${target} = ${taggedValue(operation.source, context)};`;
  }
  if (operation.kind === "integer.buffer.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${taggedValue(operation.buffer, context)}.length;`;
  }
  if (operation.kind === "integer.buffer.get") {
    const buffer = taggedValue(operation.buffer, context);
    const index = taggedValue(operation.index, context);
    return [
      `${indent}{`,
      `${indent}    int64_t sagejs_buffer_index;`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_tagged_to_int64(${index}, ` +
        `&sagejs_buffer_index) ||`,
      `${indent}        !sagejs_integer_buffer_index(&${buffer}, ` +
        `sagejs_buffer_index, &sagejs_buffer_position))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"IntegerBuffer index out of range");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    sagejs_integer_buffer_get_tagged(` +
        `&${buffer}, sagejs_buffer_position, ${target});`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.buffer.set") {
    const buffer = taggedValue(operation.buffer, context);
    const index = taggedValue(operation.index, context);
    const source = taggedValue(operation.value, context);
    return [
      `${indent}{`,
      `${indent}    int64_t sagejs_buffer_index;`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_tagged_to_int64(${index}, ` +
        `&sagejs_buffer_index) ||`,
      `${indent}        !sagejs_integer_buffer_index(&${buffer}, ` +
        `sagejs_buffer_index, &sagejs_buffer_position))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"IntegerBuffer index out of range");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    if (!sagejs_integer_buffer_set_tagged(status, ` +
        `&${buffer}, sagejs_buffer_position, ${source}))`,
      `${indent}        goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.from_uint64") {
    return `${indent}sagejs_tagged_set_uint64(${target}, ` +
      `${taggedValue(operation.source, context)});`;
  }
  if (operation.kind === "integer.from_int64") {
    return `${indent}sagejs_tagged_set_small(${target}, ` +
      `${taggedValue(operation.source, context)});`;
  }
  if (operation.kind === "int64.from_integer_checked") {
    return [
      `${indent}if (!sagejs_tagged_to_int64(` +
        `${taggedValue(operation.source, context)}, &${target}))`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"integer is outside signed 64-bit");`,
      `${indent}    goto fail;`, `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "int64.from_uint64_checked") {
    const source = taggedValue(operation.source, context);
    return [
      `${indent}if (${source} > (uint64_t) INT64_MAX)`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"integer is outside signed 64-bit");`,
      `${indent}    goto fail;`, `${indent}}`,
      `${indent}${target} = (int64_t) ${source};`,
    ].join("\n");
  }
  if (operation.kind === "uint64.from_int64_checked") {
    const source = taggedValue(operation.source, context);
    return [
      `${indent}if (${source} < 0)`, `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"integer is outside unsigned 64-bit");`,
      `${indent}    goto fail;`, `${indent}}`,
      `${indent}${target} = (uint64_t) ${source};`,
    ].join("\n");
  }
  if (operation.kind === "uint64.from_integer_checked") {
    return [
      `${indent}if (!sagejs_tagged_to_uint64(` +
        `${taggedValue(operation.source, context)}, &${target}))`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"integer is outside unsigned 64-bit");`,
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.neg" || operation.kind === "integer.abs") {
    return `${indent}sagejs_tagged_${operation.kind.slice(8)}(${target}, ` +
      `${taggedValue(operation.source, context)});`;
  }
  if (operation.kind === "int64.neg" || operation.kind === "int64.abs") {
    const source = taggedValue(operation.source, context);
    const expression = operation.kind === "int64.neg"
      ? `-${source}` : `${source} < 0 ? -${source} : ${source}`;
    return [
      `${indent}if (${source} == INT64_MIN)`, `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"int64 arithmetic overflow");`,
      `${indent}    goto fail;`, `${indent}}`,
      `${indent}${target} = ${expression};`,
    ].join("\n");
  }
  if (operation.kind === "integer.bit_length") {
    return `${indent}sagejs_tagged_bit_length(${target}, ${taggedValue(operation.source, context)});`;
  }
  if (operation.kind === "integer.isqrt") {
    return `${indent}if (!sagejs_tagged_isqrt(status, ${target}, ${taggedValue(operation.source, context)})) goto fail;`;
  }
  if (operation.kind === "integer.gcd") {
    return `${indent}sagejs_tagged_gcd(${target}, ${taggedValue(operation.left, context)}, ${taggedValue(operation.right, context)});`;
  }
  if (operation.kind === "integer.shift") {
    if (operation.countType === "uint64") return `${indent}if (!sagejs_tagged_shift_uint64(status, ${target}, ${taggedValue(operation.left, context)}, ${taggedValue(operation.right, context)}, ${operation.operation === "left" ? 1 : 0})) goto fail;`;
    return `${indent}if (!sagejs_tagged_shift(status, ${target}, ${taggedValue(operation.left, context)}, ${taggedValue(operation.right, context)}, ${operation.operation === "left" ? 1 : 0})) goto fail;`;
  }
  if (operation.kind === "integer.pow_uint") {
    return `${indent}sagejs_tagged_pow_ui(${target}, ` +
      `${taggedValue(operation.base, context)}, ` +
      `UINT64_C(${operation.exponent}));`;
  }
  if (operation.kind === "integer.divmod") {
    const left = taggedValue(operation.left, context);
    const right = taggedValue(operation.right, context);
    return [
      emitDivisionGuard(right, indent),
      `${indent}sagejs_tagged_divmod(` +
        `${taggedValue(operation.quotient, context)}, ` +
        `${taggedValue(operation.remainder, context)}, ${left}, ${right});`,
    ].join("\n");
  }
  if (operation.kind === "integer.round_sqrt") {
    const source = taggedValue(operation.source, context);
    return [
      `${indent}if (sagejs_tagged_sgn(${source}) < 0)`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, "math domain error");`,
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}{`,
      `${indent}    const double sagejs_input = ` +
        `sagejs_tagged_get_double(${source});`,
      `${indent}    if (!isfinite(sagejs_input))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        '"int too large to convert to float");',
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    sagejs_tagged_set_double(${target}, ` +
        `nearbyint(sqrt(sagejs_input)));`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.sequence.get") {
    const index = taggedValue(operation.index, context);
    const position = `sagejs_sequence_index_${operation.target}`;
    const cases = operation.values.map((value, itemIndex) => [
      `${indent}        case ${itemIndex}:`,
      setInteger(target, value, `${indent}            `),
      `${indent}            break;`,
    ].join("\n")).join("\n");
    return [
      `${indent}{`,
      `${indent}    int64_t ${position};`,
      `${indent}    if (!sagejs_tagged_to_int64(${index}, &${position}))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        '"native sequence index is too large");',
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    if (${position} < 0) ` +
        `${position} += INT64_C(${operation.values.length});`,
      `${indent}    switch (${position})`,
      `${indent}    {`,
      cases,
      `${indent}        default:`,
      `${indent}            sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        '"native sequence index out of range");',
      `${indent}            goto fail;`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.binary") {
    const left = taggedValue(operation.left, context);
    const right = taggedValue(operation.right, context);
    if (["add", "sub", "mul", "and"].includes(operation.operation)) {
      return `${indent}sagejs_tagged_${operation.operation}(` +
        `${target}, ${left}, ${right});`;
    }
    if (["floordiv", "mod"].includes(operation.operation)) {
      return [
        emitDivisionGuard(right, indent),
        `${indent}sagejs_tagged_${operation.operation}(` +
          `${target}, ${left}, ${right});`,
      ].join("\n");
    }
    throw new Error(`unsupported tagged operation ${operation.operation}`);
  }
  if (operation.kind === "integer.compare") {
    const comparison = {
      eq: "== 0", ne: "!= 0", lt: "< 0", le: "<= 0", gt: "> 0", ge: ">= 0",
    }[operation.operation];
    return `${indent}${target} = sagejs_tagged_cmp(` +
      `${taggedValue(operation.left, context)}, ` +
      `${taggedValue(operation.right, context)}) ${comparison};`;
  }
  if (operation.kind === "bool.compare") {
    const operator = {
      eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=",
    }[operation.operation];
    return `${indent}${target} = ${taggedValue(operation.left, context)} ` +
      `${operator} ${taggedValue(operation.right, context)};`;
  }
  if (operation.kind === "bool.binary") {
    const operator = operation.operation === "and" ? "&&" : "||";
    return `${indent}${target} = ${taggedValue(operation.left, context)} ` +
      `${operator} ${taggedValue(operation.right, context)};`;
  }
  if (operation.kind === "bool.short_circuit") {
    const test = operation.operation === "and" ? target : `!${target}`;
    return [
      `${indent}${target} = ${taggedValue(operation.left, context)};`,
      `${indent}if (${test})`,
      `${indent}{`,
      emitTaggedStatements(operation.right.operations, context, `${indent}    `),
      `${indent}    ${target} = ` +
        `${taggedValue(operation.right.value, context)};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "bool.not") {
    return `${indent}${target} = !${taggedValue(operation.source, context)};`;
  }
  if (operation.kind === "integer.truth") {
    return `${indent}${target} = sagejs_tagged_sgn(` +
      `${taggedValue(operation.source, context)}) != 0;`;
  }
  if (operation.kind === "uint64.truth" || operation.kind === "int64.truth") {
    return `${indent}${target} = ${taggedValue(operation.source, context)} != 0;`;
  }
  if (operation.kind === "native.call") {
    const callee = context.functions.get(operation.function);
    if (callee === undefined) {
      throw new Error(`unknown tagged callee ${operation.function}`);
    }
    const direct = checkedRegionDirectCallEmission(
      context.currentFunction, operation, context.functions,
    );
    if (direct !== undefined) {
      if (operation.results !== undefined || operation.target === undefined) {
        throw new Error("direct result call must have one scalar target");
      }
      const args = operation.arguments.map((argument) =>
        taggedValue(argument.name, context)
      );
      if (direct.guard !== undefined) {
        const values = new Map(direct.parameters.map((parameter) => [
          parameter.name,
          taggedValue(parameter.argument, context),
        ]));
        const guard = checkedRegionGuard(
          { guard: direct.guard },
          (name) => {
            const value = values.get(name);
            if (value === undefined) {
              throw new Error(`unknown guarded direct parameter ${name}`);
            }
            return value;
          },
          `${indent}    `,
        );
        const outputs = operation.results === undefined
          ? [operation.returnType === "Integer" ? target : `&${target}`]
          : operation.results.map((result) =>
            result.type === "Integer"
              ? taggedValue(result.name, context)
              : `&${taggedValue(result.name, context)}`
          );
        const fallbackCall = `!tagged_${operation.function}(status, ` +
          `${outputs.join(", ")}` +
          `${args.length ? `, ${args.join(", ")}` : ""})`;
        return [
          `${indent}{`,
          guard.setup,
          `${indent}    if (${guard.condition})`,
          `${indent}        ${target} = ${directResultName(direct.function)}(` +
            `${args.join(", ")});`,
          `${indent}    else if (` + checkedRegionFailureCondition(
            context.currentFunction,
            callee,
            fallbackCall,
          ) + ")",
          `${indent}        goto fail;`,
          `${indent}}`,
        ].join("\n");
      }
      return `${indent}${target} = ${directResultName(direct.function)}(` +
        `${args.join(", ")});`;
    }
    const outputs = operation.results === undefined
      ? [operation.returnType === "Integer" ? target : `&${target}`]
      : operation.results.map((result) =>
        result.type === "Integer"
          ? taggedValue(result.name, context)
          : `&${taggedValue(result.name, context)}`
      );
    const args = operation.arguments.map((argument) =>
      taggedValue(argument.name, context)
    );
    const calleeCall =
      `!${callee.kernelKind === "float64" ? "sagejs_kernel" : "tagged"}_` +
      `${operation.function}(status, ${outputs.join(", ")}` +
      `${args.length ? `, ${args.join(", ")}` : ""})`;
    return [
      `${indent}if (` + checkedRegionFailureCondition(
        context.currentFunction,
        callee,
        calleeCall,
      ) + ")",
      `${indent}    goto fail;`,
    ].join("\n");
  }
  if (operation.kind === "ffi.call") {
    return emitTaggedForeignCall(operation, {
      value: (name) => taggedValue(name, context),
      result: (name) => taggedValue(name, context),
      failure: "goto fail;",
      resourceInitialized: context.resourceInitialized,
    }, indent);
  }
  if (operation.kind === "value.discard") {
    return `${indent}(void) ${taggedValue(operation.source, context)};`;
  }
  throw new Error(`unsupported tagged C IR operation ${operation.kind}`);
}

function emitTaggedStatements(statements, context, indent) {
  const lines = [];
  for (const statement of statements) {
    const comment = cOperationComment(statement, indent);
    if (comment) lines.push(comment);
    const directive = cSourceDirective(statement);
    if (statement.kind === "if") {
      lines.push(
        emitTaggedStatements(statement.condition.operations, context, indent),
        `${indent}if (${taggedValue(statement.condition.value, context)})`,
        `${indent}{`,
        emitTaggedStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      if (statement.alternative.length > 0) {
        lines.push(
          `${indent}else`,
          `${indent}{`,
          emitTaggedStatements(statement.alternative, context, `${indent}    `),
          `${indent}}`,
        );
      }
      continue;
    }
    if (statement.kind === "loop.break" || statement.kind === "loop.continue") {
      if (statement.range) {
        const {kind} = statement.range;
        const iterator = taggedValue(statement.range.iterator, context);
        const step = taggedValue(statement.range.step, context);
        const stop = taggedValue(statement.range.stop, context);
        if (kind === "loop.range") {
          lines.push(`${indent}if (${step} >= ${stop} - ${iterator}) break;`, `${indent}${iterator} += ${step};`);
        } else if (kind === "loop.range_int64") {
          const active = context.activeInt64RangeIncrement;
          const authorized = active !== undefined &&
            isCheckedRegionUnitRangeContinue(statement, active.operation) &&
            active.iterator === statement.range.iterator &&
            active.stop === statement.range.stop &&
            active.step === statement.range.step;
          const portable = context.currentFunction.checkedRegionVariant ===
              undefined && statement.range.incrementProof !== undefined;
          lines.push(authorized || portable
            ? `${indent}${iterator} += ${step};`
            : `${indent}if (!sagejs_word_add_int64(${iterator}, ${step}, &${iterator})) break;`);
        } else lines.push(`${indent}sagejs_tagged_add(${iterator}, ${iterator}, ${step});`);
      }
      lines.push(`${indent}${statement.kind.slice(5)};`);
      continue;
    }
    if (statement.kind === "while") {
      lines.push(
        `${indent}for (;;)`,
        `${indent}{`,
        emitTaggedStatements(
          statement.condition.operations,
          context,
          `${indent}    `,
        ),
        `${indent}    if (!${taggedValue(statement.condition.value, context)})`,
        `${indent}        break;`,
        emitTaggedStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range") {
      const index = taggedValue(statement.index, context);
      const iterator = taggedValue(statement.iterator, context);
      const start = taggedValue(statement.start, context);
      const stop = taggedValue(statement.stop, context);
      const step = taggedValue(statement.step, context);
      lines.push(
        `${indent}${iterator} = ${start};`,
        `${indent}while (${iterator} < ${stop})`,
        `${indent}{`,
        `${indent}    ${index} = ${iterator};`,
        `${indent}    (void) ${index};`,
        emitTaggedStatements(statement.body, context, `${indent}    `),
        `${indent}    if (${step} >= ${stop} - ${iterator})`,
        `${indent}        break;`,
        `${indent}    ${iterator} += ${step};`,
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range_int64") {
      const index = taggedValue(statement.index, context);
      const iterator = taggedValue(statement.iterator, context);
      const start = taggedValue(statement.start, context);
      const stop = taggedValue(statement.stop, context);
      const step = taggedValue(statement.step, context);
      const authenticated = context.int64RangeIncrements
        .isAuthorized(statement);
      const bodyContext = {
        ...context,
        activeInt64RangeIncrement: authenticated
          ? {
            operation: statement.id,
            iterator: statement.iterator,
            stop: statement.stop,
            step: statement.step,
          }
          : undefined,
      };
      lines.push(
        `${indent}${iterator} = ${start};`, `${indent}for (;;)`, `${indent}{`,
        `${indent}    if (${step} > 0 ? ${iterator} >= ${stop} : ${iterator} <= ${stop})`,
        `${indent}        break;`, `${indent}    ${index} = ${iterator};`,
        `${indent}    (void) ${index};`,
        emitTaggedStatements(statement.body, bodyContext, `${indent}    `),
        ...(authenticated || (context.currentFunction.checkedRegionVariant ===
            undefined && statement.incrementProof !== undefined &&
            context.directResult !== true)
          ? [`${indent}    ${iterator} += ${step};`]
          : [
            `${indent}    if (!sagejs_word_add_int64(${iterator}, ${step}, &${iterator}))`,
            `${indent}        break;`,
          ]),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range_exact") {
      const index = taggedValue(statement.index, context);
      const iterator = taggedValue(statement.iterator, context);
      const start = taggedValue(statement.start, context);
      const stop = taggedValue(statement.stop, context);
      const step = taggedValue(statement.step, context);
      lines.push(
        `${indent}sagejs_tagged_copy(${iterator}, ${start});`,
        `${indent}for (;;)`,
        `${indent}{`,
        `${indent}    if (sagejs_tagged_sgn(${step}) > 0)`,
        `${indent}    {`,
        `${indent}        if (sagejs_tagged_cmp(${iterator}, ${stop}) >= 0)`,
        `${indent}            break;`,
        `${indent}    }`,
        `${indent}    else if (sagejs_tagged_cmp(${iterator}, ${stop}) <= 0)`,
        `${indent}        break;`,
        `${indent}    sagejs_tagged_copy(${index}, ${iterator});`,
        `${indent}    (void) ${index};`,
        emitTaggedStatements(statement.body, context, `${indent}    `),
        `${indent}    sagejs_tagged_add(${iterator}, ${iterator}, ${step});`,
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "return") {
      if (context.directResult === true) {
        if (statement.value === undefined || statement.values !== undefined) {
          throw new Error("direct result function must return one scalar");
        }
        lines.push(`${indent}return ${taggedValue(statement.value, context)};`);
        continue;
      }
      const tuple = tupleElementTypes(statement.type);
      if (tuple !== undefined) {
        tuple.forEach((type, index) => {
          if (type === "Integer") {
            lines.push(`${indent}sagejs_tagged_copy(` +
              `sagejs_tagged_output_${index}, ` +
              `${taggedValue(statement.values[index], context)});`);
          } else {
            lines.push(`${indent}*sagejs_tagged_output_${index} = ` +
              `${taggedValue(statement.values[index], context)};`);
          }
        });
      } else if (statement.type === "Integer") {
        lines.push(`${indent}sagejs_tagged_copy(sagejs_tagged_output_0, ` +
          `${taggedValue(statement.value, context)});`);
      } else if (context.resourceForType(statement.type) !== undefined) {
        const resource = context.resourceForType(statement.type);
        lines.push(
          `${indent}memcpy(sagejs_tagged_output_0, ` +
            `${taggedValue(statement.value, context)}, sizeof(${resource.abi_type}));`,
          `${indent}${context.resourceInitialized(statement.value)} = 0;`,
        );
      } else {
        lines.push(`${indent}*sagejs_tagged_output_0 = ` +
          `${taggedValue(statement.value, context)};`);
      }
      lines.push(`${indent}goto success;`);
      continue;
    }
    if (statement.kind === "raise") {
      lines.push(
        `${indent}sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ${cString(statement.exception === "ValueError" ? `ValueError: ${statement.message}` : statement.message)});`,
        `${indent}goto fail;`,
      );
      continue;
    }
    const resume = context.sites.get(statement);
    if (resume !== undefined) {
      lines.push(`${indent}sagejs_tagged_resume_${resume}: ;`);
    }
    lines.push(emitTaggedOperation(statement, context, indent));
  }
  return lines.filter(Boolean).join("\n");
}

function emitTaggedFunction(fn, functions, options) {
  const storage = fn.analysis.storage;
  const types = new Map(
    [...fn.params, ...fn.locals].map((value) => [value.name, value.type]),
  );
  const mixed = fn.analysis?.mixedFloat64 || [...fn.params, ...fn.locals]
    .some(value => value.type === "Float64" || value.type === "Float64Buffer");
  // The all-word speculative loop is not yet qualified for Float64 edges.
  // Tagged arithmetic itself still uses its small-value fast paths.
  const sites = mixed ? new Map() : promotionSites(fn);
  const virtualUInt64Views = checkedRegionVirtualUInt64Emission(fn, functions);
  const int64Arithmetic = checkedRegionInt64ArithmeticEmission(fn, functions);
  const int64RangeIncrements = checkedRegionInt64RangeIncrementEmission(
    fn, functions,
  );
  const virtualUInt64Snapshots = new Map(
    virtualUInt64Views.validatedViews().map((claim, index) => [
      claim.viewTarget,
      Object.freeze({
        data: `sagejs_virtual_uint64_data_${index}`,
        length: `sagejs_virtual_uint64_length_${index}`,
      }),
    ]),
  );
  const tagLocals = new Set([
    ...storage.mutableParameters,
    ...fn.locals
      .filter((local) => local.type === "Integer")
      .map((local) => local.name),
  ]);
  const declarations = [];
  const tagInitialization = [];
  const cleanup = [];
  for (const snapshot of virtualUInt64Snapshots.values()) {
    declarations.push(
      `    uint64_t *${snapshot.data} = NULL;`,
      `    size_t ${snapshot.length} = 0;`,
    );
  }
  if (mixed) {
    declarations.push("    mpz_t sagejs_mixed_input, sagejs_mixed_output;",
      "    int64_t sagejs_mixed_small;");
    tagInitialization.push("    mpz_init(sagejs_mixed_input); mpz_init(sagejs_mixed_output);");
    cleanup.push("        mpz_clear(sagejs_mixed_output); mpz_clear(sagejs_mixed_input);");
  }
  for (const name of tagLocals) {
    declarations.push(`    sagejs_tagged_int ${taggedName(name)};`);
    tagInitialization.push(`    sagejs_tagged_init(&${taggedName(name)});`);
    cleanup.unshift(`        sagejs_tagged_clear(&${taggedName(name)});`);
  }
  declarations.push("    int sagejs_tagged_initialized = 0;");
  if (sites.size > 0) {
    declarations.push("    int sagejs_tagged_resume = 0;");
  }
  for (const param of fn.params) {
    if (param.type === "Integer") continue;
    if (resourceForFunctionType(fn, param.type) !== undefined) continue;
    declarations.push(
      `    ${scalarType(param.type, fn)} ${taggedName(param.name)} = ` +
        `sagejs_tagged_arg_${param.name};`,
    );
  }
  for (const local of fn.locals) {
    if (virtualUInt64Views.isVirtualLocal(local.name)) continue;
    if ((fn.resourceAliases || {})[local.name] !== undefined) continue;
    const resource = resourceForFunctionType(fn, local.type);
    if (resource !== undefined) {
      declarations.push(`    ${resource.abi_type} ${taggedName(local.name)};`);
      if (resource.ownership === "owned") {
        declarations.push(`    int ${taggedName(local.name)}_initialized = 0;`);
        cleanup.unshift(
          `        if (${taggedName(local.name)}_initialized)`,
          `            ${resource.native.clear_symbol}(${taggedName(local.name)});`,
        );
      }
      continue;
    }
    if (local.type === "Integer" || local.type.startsWith("IntegerSequence[")) {
      continue;
    }
    declarations.push(`    ${scalarType(local.type, fn)} ${taggedName(local.name)} = ` +
      `${local.type === "Int64Buffer" || local.type === "Int64Record" ||
        local.type === "IntegerBuffer" || local.type === "UInt64Buffer" ||
        local.type === "Float64Buffer"
        ? "{0}" : "0"};`);
  }
  const integerNames = [
    ...fn.params,
    ...fn.locals,
  ].filter((value) => value.type === "Integer");
  for (const value of integerNames) {
    declarations.push(`    int64_t ${wordName(value.name)} = 0;`);
  }
  let mixedSerial = 0;
  const context = {
    currentFunction: fn,
    emitMixedOperation: options.emitMixedOperation,
    freshIdentifier: prefix => `${prefix}_${mixedSerial++}`,
    functions,
    int64Arithmetic,
    int64RangeIncrements,
    sites,
    storage,
    tagLocals,
    types,
    virtualUInt64Views,
    virtualUInt64Snapshots,
    resourceParameters: new Set(
      fn.params
        .filter((param) => resourceForFunctionType(fn, param.type) !== undefined)
        .map((param) => param.name),
    ),
    resourceForType(type) {
      return resourceForFunctionType(fn, type);
    },
    resourceInitialized(name) {
      return `${taggedName(name)}_initialized`;
    },
  };
  const wordContext = {
    failure: "goto fail;",
    functions,
    promote(operation, indent) {
      const resume = sites.get(operation);
      if (resume === undefined) {
        throw new Error(`missing tagged resume site for ${operation.kind}`);
      }
      return `${indent}do { sagejs_tagged_resume = ${resume}; ` +
        "goto sagejs_tagged_promote; } while (0);";
    },
    returnWord(statement, values, indent) {
      const resultTypes = tupleElementTypes(statement.type) || [statement.type];
      const lines = resultTypes.map((type, index) => {
        const source = values[index];
        if (type === "Integer") {
          return `${indent}sagejs_tagged_set_small(` +
            `sagejs_tagged_output_${index}, ${wordName(source)});`;
        }
        const resource = resourceForFunctionType(fn, type);
        if (resource !== undefined) {
          return `${indent}memcpy(sagejs_tagged_output_${index}, ` +
            `${taggedName(source)}, sizeof(${resource.abi_type}));\n` +
            `${indent}${taggedName(source)}_initialized = 0;`;
        }
        return `${indent}*sagejs_tagged_output_${index} = ${taggedName(source)};`;
      });
      lines.push(`${indent}return 1;`);
      return lines.join("\n");
    },
    sites,
    value(name) {
      return types.get(name) === "Integer" ? wordName(name) : taggedName(name);
    },
  };
  const integerParams = fn.params.filter((param) => param.type === "Integer");
  const hasPublicResource = [
    fn.returnType,
    ...fn.params.map((param) => param.type),
  ].some((type) => resourceForFunctionType(fn, type) !== undefined);
  const fastGuard = hasPublicResource
    ? "0"
    : integerParams.length === 0
    ? "1"
    : integerParams
      .map((param) => `!sagejs_tagged_arg_${param.name}->is_big`)
      .join(" && ");
  const wordParamCopies = integerParams.map((param) =>
    `        ${wordName(param.name)} = ` +
      `sagejs_tagged_arg_${param.name}->small;`
  );
  // Foreign resources have no machine-word ABI.  A dead `if (0)` word body
  // still has to type-check nonexistent word callees and resource locals in
  // C, so resource-bearing functions must enter directly through tagged IR.
  const wordExecution = hasPublicResource || mixed || fn.checkedRegionVariant
    ? ""
    : `    if (${fastGuard})
    {
${wordParamCopies.join("\n")}
${emitWordStatements(fn.body, wordContext, "        ")}
    }
`;
  const initializeTags = [
    ...tagInitialization,
    "    sagejs_tagged_initialized = 1;",
  ].join("\n");
  const promoteCopies = Array.from(tagLocals, (name) =>
    `    sagejs_tagged_set_small(&${taggedName(name)}, ${wordName(name)});`
  );
  const entryCopies = storage.mutableParameters.map((name) =>
    `    sagejs_tagged_copy(&${taggedName(name)}, sagejs_tagged_arg_${name});`
  );
  const promotionBlock = sites.size === 0
    ? ""
    : `
sagejs_tagged_promote:
${initializeTags}
${promoteCopies.join("\n")}
    switch (sagejs_tagged_resume)
    {
${Array.from(sites.values(), (resume) =>
    `        case ${resume}: goto sagejs_tagged_resume_${resume};`
  ).join("\n")}
        default: goto fail;
    }
`;
  return `${taggedSignature(fn, false, {
    name: options.emittedName,
    storage: options.storage,
  })}
{
${declarations.join("\n")}
${wordExecution}
    goto sagejs_tagged_entry;
${promotionBlock}
sagejs_tagged_entry:
${initializeTags}
${entryCopies.join("\n")}
${emitTaggedStatements(fn.body, context, "    ")}
    sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
        "tagged native function completed without returning");
    goto fail;

success:
    if (sagejs_tagged_initialized)
    {
${cleanup.join("\n")}
    }
    return 1;

fail:
    if (sagejs_tagged_initialized)
    {
${cleanup.join("\n")}
    }
    return 0;
}`;
}

function emitDirectResultFunction(
  fn,
  functions,
  metadata,
  forceInlineFunctions,
) {
  const types = new Map(
    [...fn.params, ...fn.locals].map((value) => [value.name, value.type]),
  );
  const deadExactNames = new Set(metadata.deadExactNames);
  const virtualUInt64Views = checkedRegionVirtualUInt64Emission(fn, functions);
  const int64Arithmetic = checkedRegionInt64ArithmeticEmission(fn, functions);
  const int64RangeIncrements = checkedRegionInt64RangeIncrementEmission(
    fn, functions,
  );
  const declarations = [];
  for (const param of fn.params) {
    declarations.push(
      `    ${scalarType(param.type, fn)} ${taggedName(param.name)} = ` +
      `sagejs_tagged_arg_${param.name};`,
    );
  }
  for (const local of fn.locals) {
    if (deadExactNames.has(local.name) ||
        virtualUInt64Views.isVirtualLocal(local.name)) continue;
    declarations.push(
      `    ${scalarType(local.type, fn)} ${taggedName(local.name)} = ` +
      `${["Int64Buffer", "Int64Record", "UInt64Buffer", "Float64Buffer"]
        .includes(local.type) ? "{0}" : "0"};`,
    );
  }
  const context = {
    currentFunction: fn,
    directResult: true,
    directDeadExactNames: deadExactNames,
    emitMixedOperation() {
      throw new Error("direct result function cannot use mixed operations");
    },
    functions,
    int64Arithmetic,
    int64RangeIncrements,
    sites: new Map(),
    storage: fn.analysis.storage,
    tagLocals: new Set(),
    types,
    virtualUInt64Views,
    virtualUInt64Snapshots: new Map(),
    resourceParameters: new Set(),
    resourceForType() { return undefined; },
    resourceInitialized() {
      throw new Error("direct result function cannot own resources");
    },
  };
  const body = emitTaggedStatements(fn.body, context, "    ");
  // Provenance comments may contain words such as `status` or `fail`; only
  // emitted executable C determines whether the status-free ABI is valid.
  const executableBody = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const forbidden = [
    /\bstatus\b/, /sagejs_tagged_output_/, /goto\s+fail/, /sagejs_native_status_set/,
  ];
  const retained = forbidden.find((pattern) => pattern.test(executableBody));
  if (retained !== undefined) {
    throw new Error(
      `direct result function retained a fallible ABI operation ${retained}`,
    );
  }
  return `${directResultSignature(fn, false, {
    storage: checkedRegionStorage(fn, forceInlineFunctions),
  })}
{
${declarations.join("\n")}
${body}
}`;
}

function checkedFallbackName(fn) {
  return `sagejs_checked_fallback_${fn.name}`;
}

function emitCheckedRegionDispatcher(fn, region) {
  const guard = checkedRegionGuard(region);
  const arguments_ = taggedForwardArguments(fn).join(", ");
  return `${taggedSignature(fn)}
{
${guard.setup}
    if (${guard.condition})
        return tagged_${region.variantEntry}(${arguments_});
    return tagged_${checkedFallbackName(fn)}(${arguments_});
}`;
}

function emitCheckedLocalVariantDispatcher(fn, local) {
  const guard = checkedRegionGuard({ guard: local.guard });
  const arguments_ = taggedForwardArguments(fn).join(", ");
  return `${taggedSignature(fn)}
{
${guard.setup}
    if (${guard.condition})
        return tagged_${local.fastName}(${arguments_});
    return tagged_${local.slowName}(${arguments_});
}`;
}

function emitGmpWorkspaceBridge(fn) {
  const declarations = ["    int sagejs_workspace_ok;"];
  const initialization = [];
  const cleanup = [];
  const arguments_ = [];
  for (const param of fn.params) {
    if (param.type !== "Integer") {
      arguments_.push(`sagejs_tagged_arg_${param.name}`);
      continue;
    }
    const local = `sagejs_workspace_arg_${param.name}`;
    declarations.push(`    mpz_t ${local};`);
    initialization.push(
      `    mpz_init(${local});`,
      `    if (sagejs_tagged_arg_${param.name}->is_big)`,
      `        mpz_set(${local}, sagejs_tagged_arg_${param.name}->big);`,
      "    else",
      `        set_mpz_int64(${local}, ` +
        `sagejs_tagged_arg_${param.name}->small);`,
    );
    cleanup.unshift(`    mpz_clear(${local});`);
    arguments_.push(local);
  }
  const resultTypes = tupleElementTypes(fn.returnType) || [fn.returnType];
  const resultArguments = [];
  const copies = [];
  resultTypes.forEach((type, index) => {
    if (type !== "Integer") {
      if (resourceForFunctionType(fn, type) !== undefined) {
        throw new Error(
          "live exact workspace functions cannot return owned resources",
        );
      }
      resultArguments.push(`sagejs_tagged_output_${index}`);
      return;
    }
    const local = `sagejs_workspace_result_${index}`;
    const small = `${local}_small`;
    declarations.push(`    mpz_t ${local};`, `    int64_t ${small};`);
    initialization.push(`    mpz_init(${local});`);
    cleanup.unshift(`    mpz_clear(${local});`);
    resultArguments.push(local);
    copies.push(
      `        if (mpz_to_int64(${local}, &${small}))`,
      `            sagejs_tagged_set_small(` +
        `sagejs_tagged_output_${index}, ${small});`,
      "        else",
      "        {",
      `            sagejs_tagged_make_big(sagejs_tagged_output_${index});`,
      `            mpz_set(sagejs_tagged_output_${index}->big, ${local});`,
      "        }",
    );
  });
  return `${taggedSignature(fn)}
{
${declarations.join("\n")}
${initialization.join("\n")}
    sagejs_workspace_ok = native_${fn.name}(status, ` +
    `${resultArguments.join(", ")}` +
    `${arguments_.length ? `, ${arguments_.join(", ")}` : ""});
    if (sagejs_workspace_ok)
    {
${copies.join("\n")}
    }
${cleanup.join("\n")}
    return sagejs_workspace_ok;
}`;
}

function generateTaggedFunctions(functions, options = {}) {
  const functionMap = new Map((options.functions || functions).map((fn) => [fn.name, fn]));
  const forceInlineFunctions = checkedRegionForceInlineFunctions(functionMap);
  const usesCheckedRegions = functions.some((fn) => fn.checkedRegionVariant);
  return {
    prototypes: [
      usesCheckedRegions ? CHECKED_REGION_ATTRIBUTES : "",
      functions.map((fn) => {
        const direct = checkedRegionDirectResultEmission(fn);
        return direct === undefined
          ? taggedSignature(fn, true, {
            storage: checkedRegionStorage(fn, forceInlineFunctions),
          })
          : directResultSignature(fn, true, {
            storage: checkedRegionStorage(fn, forceInlineFunctions),
          });
      }).join("\n"),
    ].filter(Boolean).join("\n\n"),
    functions: functions
      .map((fn) => {
        const direct = checkedRegionDirectResultEmission(fn);
        if (direct !== undefined) {
          return emitDirectResultFunction(
            fn,
            functionMap,
            direct,
            forceInlineFunctions,
          );
        }
        if (fn.analysis?.backend?.requiresExactWorkspace) {
          return emitGmpWorkspaceBridge(fn);
        }
        const region = options.checkedRegionEntries?.get(fn.name);
        const local = checkedRegionLocalVariant(fn);
        if (local !== undefined) {
          return emitCheckedLocalVariantDispatcher(fn, local);
        }
        if (region === undefined) {
          return emitTaggedFunction(fn, functionMap, {
            ...options,
            storage: checkedRegionStorage(fn, forceInlineFunctions),
          });
        }
        const fallback = emitTaggedFunction(fn, functionMap, {
          ...options,
          emittedName: checkedFallbackName(fn),
          storage: "SAGEJS_CHECKED_REGION_COLD",
        });
        return `${fallback}\n\n${emitCheckedRegionDispatcher(fn, region)}`;
      })
      .join("\n\n"),
  };
}

module.exports = {
  checkedRegionSmallHighFaninLeaf,
  generateTaggedFunctions,
  int64Constant,
  taggedResults,
  taggedSignature,
};
