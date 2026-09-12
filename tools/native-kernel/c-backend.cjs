"use strict";

const { createHash } = require("node:crypto");

const {
  isLiveExactOwnerType,
  isTupleType,
  tupleElementTypes,
} = require("./integer-ir.cjs");
const {
  generateTaggedFunctions,
} = require("./tagged-backend.cjs");
const {
  generateFmpzFunctions,
} = require("./fmpz-backend.cjs");
const {
  fitsInt64,
  generateWordFunctions,
  int64Constant,
  wordPromotionCapabilities,
} = require("./word-backend.cjs");
const {
  emitPrimeFieldCoreFunction,
  emitPrimeFieldNodeAdapter,
  generatePrimeFieldNodeSupport,
  generatePrimeFieldSupport,
  primeFieldCoreSignature,
} = require("./prime-field-backend.cjs");
const {
  emitPrimeSourceCoreFunction,
  emitPrimeSourceNodeAdapter,
  generatePrimeSourceSupport,
  generatePrimeSourceNodeSupport,
  primeSourceCoreSignature,
} = require("./prime-source-backend.cjs");
const {
  cOperationComment,
  cSourceDirective,
} = require("./provenance.cjs");
const {
  auditHostCore,
  generateNodeStatusAdapter,
  generateStatusDeclarations,
  generateStatusRuntime,
} = require("./core-abi.cjs");
const {
  generateExactCoreRuntime,
  generateExactNodeHelpers,
} = require("./exact-runtime.cjs");
const {
  FMPZ_EXACT_RUNTIME_C_SOURCE,
} = require("./fmpz-runtime.cjs");
const {
  GMP_CHECKPOINT_ALLOCATOR_C_SOURCE,
} = require("./gmp-checkpoint-allocator.cjs");
const {
  emitExactForeignCall,
  exceptionShimInclude,
  foreignDependencies,
  foreignHeaders,
  resourceForFunctionType,
} = require("./ffi-codegen.cjs");
const {
  isUint64Shift,
  uint64COperator,
} = require("./uint64-operations.cjs");

const NATIVE_ABI_VERSION = 23;
const RESOURCE_FINALIZATION_CAPABILITY = Object.freeze({
  model: "node-api-basic-post-finalizer-v1",
  self_finalizing: true,
});

function statusFailure(kind, message, indent) {
  const code = {
    error: "SAGEJS_NATIVE_ERROR",
    type: "SAGEJS_NATIVE_TYPE_ERROR",
    range: "SAGEJS_NATIVE_RANGE_ERROR",
  }[kind];
  if (code === undefined) throw new Error(`unknown native status kind ${kind}`);
  return `${indent}sagejs_native_status_set(status, ${code}, ${cString(message)});`;
}

function isInt64BufferType(type) {
  return type === "Int64Buffer" || type === "Int64Record";
}

function isIntegerBufferType(type) {
  return type === "IntegerBuffer";
}

function isUInt64BufferType(type) {
  return type === "UInt64Buffer";
}

/**
 * Classify target properties that affect the generated isolated C core.
 *
 * Packed `IntegerBuffer` slots are arrays of 64-bit words.  The resident fmpz
 * helpers deliberately borrow those words without allocating or repacking, so
 * they are valid only when one FLINT limb is also 64 bits.  Keep this predicate
 * beside the emitter that owns that representation invariant.  Target packers
 * must call it before presenting a generated core as compilable.
 */
function classifyHostCoreTarget(ir, capabilities = {}) {
  const exact = ir.functions.filter((fn) => fn.kernelKind === "integer");
  const usesFmpz = exact.some((fn) =>
    fn.analysis?.backend?.kind === "fmpz"
  );
  const usesIntegerBuffers = exact.some((fn) =>
    fn.params.some((param) => isIntegerBufferType(param.type)) ||
    fn.locals.some((local) => isIntegerBufferType(local.type))
  );
  if (usesFmpz && usesIntegerBuffers && capabilities.flintLimbBits !== 64) {
    return {
      supported: false,
      reason: "fmpz-integer-buffer-requires-64-bit-flint-limbs",
      requirement: {
        integerBufferWordBits: 64,
        flintLimbBits: 64,
      },
      actual: {
        target: capabilities.target ?? null,
        flintLimbBits: capabilities.flintLimbBits ?? null,
      },
    };
  }
  return { supported: true };
}

function exactBufferCType(type) {
  if (isInt64BufferType(type)) return "sagejs_int64_buffer";
  if (isUInt64BufferType(type)) return "sagejs_uint64_buffer";
  if (isIntegerBufferType(type)) return "sagejs_integer_buffer";
  return undefined;
}

function cString(value) {
  return JSON.stringify(String(value));
}

// GMP's textual parser is dramatically more expensive than its machine-word
// setters.  Native IR has already authenticated integer literals, so emit the
// direct operation whenever the value fits the smallest `long`/`unsigned
// long` widths supported by our targets (32 bits, notably Windows x64).
// Larger literals retain the portable decimal path.
function mpzMachineLiteral(target, value) {
  let integer;
  try {
    integer = BigInt(String(value));
  } catch (_error) {
    return null;
  }
  if (integer >= -2147483647n && integer <= 2147483647n) {
    return `mpz_set_si(${target}, ${integer}L)`;
  }
  if (integer >= 0n && integer <= 4294967295n) {
    return `mpz_set_ui(${target}, ${integer}UL)`;
  }
  return null;
}

function cName(name) {
  return `sagejs_${name}`;
}

function recordCType(record) {
  return `sagejs_native_record_${record}`;
}

function nativeValue(local) {
  if (local.type === "Integer") return cName(local.name);
  return local.storage === "return"
    ? "sagejs_native_output"
    : cName(local.name);
}

function emitOperation(operation, locals, indent) {
  if (operation.kind === "integer.constant") {
    const machine = mpzMachineLiteral(
      nativeValue(locals.get(operation.target)),
      operation.value,
    );
    if (machine !== null) return `${indent}${machine};`;
    return [
      `${indent}if (mpz_set_str(${nativeValue(locals.get(operation.target))}, ` +
        `${cString(operation.value)}, 10) != 0)`,
      `${indent}{`,
      statusFailure("type", "invalid native integer literal", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "uint64.constant") {
    return `${indent}${nativeValue(locals.get(operation.target))} = ` +
      `UINT64_C(${operation.value});`;
  }
  if (operation.kind === "real.constant") {
    const target = locals.get(operation.target);
    return [
      `${indent}if (mpfr_set_str(${nativeValue(target)}, ` +
        `${cString(operation.value)}, 10, MPFR_RNDN) != 0)`,
      `${indent}{`,
      statusFailure("type", "invalid native literal", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "complex.constant") {
    const target = locals.get(operation.target);
    return [
      `${indent}if (mpfr_set_str(mpc_realref(${nativeValue(target)}), ` +
        `${cString(operation.real)}, 10, MPFR_RNDN) != 0 ||`,
      `${indent}    mpfr_set_str(mpc_imagref(${nativeValue(target)}), ` +
        `${cString(operation.imag)}, 10, MPFR_RNDN) != 0)`,
      `${indent}{`,
      statusFailure("type", "invalid native literal", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "real.binary") {
    const target = locals.get(operation.target);
    const left = locals.get(operation.left);
    const right = locals.get(operation.right);
    return `${indent}mpfr_${operation.operation}(${nativeValue(target)}, ` +
      `${nativeValue(left)}, ${nativeValue(right)}, MPFR_RNDN);`;
  }
  if (operation.kind === "complex.binary") {
    const target = locals.get(operation.target);
    const left = locals.get(operation.left);
    const right = locals.get(operation.right);
    return `${indent}mpc_${operation.operation}(${nativeValue(target)}, ` +
      `${nativeValue(left)}, ${nativeValue(right)}, MPC_RNDNN);`;
  }
  if (operation.kind === "integer.binary") {
    const target = locals.get(operation.target);
    const left = locals.get(operation.left);
    const right = locals.get(operation.right);
    return `${indent}mpz_${operation.operation}(${nativeValue(target)}, ` +
      `${nativeValue(left)}, ${nativeValue(right)});`;
  }
  if (operation.kind === "real.copy") {
    return `${indent}mpfr_set(${nativeValue(locals.get(operation.target))}, ` +
      `${nativeValue(locals.get(operation.source))}, MPFR_RNDN);`;
  }
  if (operation.kind === "complex.copy") {
    return `${indent}mpc_set(${nativeValue(locals.get(operation.target))}, ` +
      `${nativeValue(locals.get(operation.source))}, MPC_RNDNN);`;
  }
  if (operation.kind === "integer.copy") {
    return `${indent}mpz_set(${nativeValue(locals.get(operation.target))}, ` +
      `${nativeValue(locals.get(operation.source))});`;
  }
  if (operation.kind === "real.from_uint64") {
    return `${indent}mpfr_set_uj(` +
      `${nativeValue(locals.get(operation.target))}, ` +
      `${cName(operation.source)}, MPFR_RNDN);`;
  }
  if (operation.kind === "complex.from_uint64") {
    const target = nativeValue(locals.get(operation.target));
    return [
      `${indent}mpfr_set_uj(mpc_realref(${target}), ` +
        `${cName(operation.source)}, MPFR_RNDN);`,
      `${indent}mpfr_set_zero(mpc_imagref(${target}), 0);`,
    ].join("\n");
  }
  if (operation.kind === "integer.from_uint64") {
    return `${indent}set_mpz_uint64(` +
      `${nativeValue(locals.get(operation.target))}, ` +
      `${cName(operation.source)});`;
  }
  if (operation.kind === "uint64.from_integer_checked") {
    return [
      `${indent}if (!mpz_to_uint64(` +
        `${nativeValue(locals.get(operation.source))}, ` +
        `&${nativeValue(locals.get(operation.target))}))`,
      `${indent}{`,
      statusFailure(
        "range", "integer is outside unsigned 64-bit", `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "real.pow_uint") {
    return `${indent}mpfr_pow_ui(` +
      `${nativeValue(locals.get(operation.target))}, ` +
      `${nativeValue(locals.get(operation.base))}, ` +
      `${operation.exponent}, MPFR_RNDN);`;
  }
  if (operation.kind === "complex.pow_uint") {
    return `${indent}mpc_pow_ui(` +
      `${nativeValue(locals.get(operation.target))}, ` +
      `${nativeValue(locals.get(operation.base))}, ` +
      `${operation.exponent}, MPC_RNDNN);`;
  }
  if (operation.kind === "integer.pow_uint") {
    return `${indent}mpz_pow_ui(` +
      `${nativeValue(locals.get(operation.target))}, ` +
      `${nativeValue(locals.get(operation.base))}, ` +
      `${operation.exponent});`;
  }
  throw new Error(`unsupported C IR operation ${operation.kind}`);
}

function exactValue(name, context) {
  const slot = context.storage.slots[name];
  if (slot !== undefined) return `sagejs_scratch_${slot}`;
  if ((context.storage.borrowedLocals || []).includes(name)) return cName(name);
  if (context.storage.borrowedParameters.includes(name)) {
    return `sagejs_arg_${name}`;
  }
  if (context.liveIntegerVectorParameters?.has(name)) {
    return `(*sagejs_arg_${name})`;
  }
  if (context.resourceParameters?.has(name)) return `sagejs_arg_${name}`;
  return cName(name);
}

function internalArgument(fn, param) {
  const name = `sagejs_arg_${param.name}`;
  if (param.type === "Integer") return `const mpz_t ${name}`;
  if (param.type === "uint64") return `uint64_t ${name}`;
  if (param.type === "bool") return `int ${name}`;
  if (isInt64BufferType(param.type)) return `sagejs_int64_buffer ${name}`;
  if (isUInt64BufferType(param.type)) return `sagejs_uint64_buffer ${name}`;
  if (isIntegerBufferType(param.type)) return `sagejs_integer_buffer ${name}`;
  if (param.type === "NativeIntegerVector") {
    return `sagejs_native_integer_vector *${name}`;
  }
  const resource = resourceForFunctionType(fn, param.type);
  if (resource !== undefined) return `${resource.abi_type} ${name}`;
  throw new Error(`unsupported exact native parameter ${param.type}`);
}

function internalResults(fn, type) {
  const tuple = tupleElementTypes(type);
  if (tuple !== undefined) {
    return tuple.map((elementType, index) => {
      if (elementType === "Integer") {
        return `mpz_t sagejs_native_output_${index}`;
      }
      if (elementType === "uint64") {
        return `uint64_t *sagejs_native_output_${index}`;
      }
      if (elementType === "bool") {
        return `int *sagejs_native_output_${index}`;
      }
      throw new Error(`unsupported exact tuple element ${elementType}`);
    });
  }
  if (type === "Integer") return ["mpz_t sagejs_native_output"];
  if (type === "uint64") return ["uint64_t *sagejs_native_output"];
  if (type === "bool") return ["int *sagejs_native_output"];
  const resource = resourceForFunctionType(fn, type);
  if (resource !== undefined) {
    return [`${resource.abi_type} sagejs_native_output`];
  }
  throw new Error(`unsupported exact native return ${type}`);
}

function internalSignature(fn, prototype = false) {
  const argumentsList = [
    "sagejs_native_status *status",
    ...internalResults(fn, fn.returnType),
    ...fn.params.map((param) => internalArgument(fn, param)),
  ].join(", ");
  return `static int native_${fn.name}(${argumentsList})${prototype ? ";" : ""}`;
}

function emitBoundedCollectionOperation(operation, context, indent) {
  const table = exactValue(operation.owner, context);
  const target = exactValue(operation.target, context);
  if (operation.kind === "bounded.map.length" ||
      operation.kind === "bounded.set.length") {
    return `${indent}${target} = (uint64_t) ${table}.size;`;
  }
  const key = exactValue(operation.key, context);
  const recordType = recordCType(operation.record);
  const equality = operation.fields.map((field) =>
    `sagejs_bounded_entries[sagejs_bounded_position].` +
      `sagejs_field_${field.name} == sagejs_bounded_key.sagejs_field_${field.name}`
  ).join(" && ");
  const hash = operation.fields.flatMap((field) => [
    `${indent}    sagejs_bounded_hash ^= ` +
      `sagejs_bounded_key.sagejs_field_${field.name};`,
    `${indent}    sagejs_bounded_hash *= UINT64_C(1099511628211);`,
  ]);
  const common = [
    `${indent}{`,
    `${indent}    sagejs_native_bounded_table *sagejs_bounded_table = &${table};`,
    `${indent}    ${recordType} *sagejs_bounded_entries = ` +
      `(${recordType} *) sagejs_bounded_table->keys;`,
    `${indent}    ${recordType} sagejs_bounded_key = ${key};`,
    `${indent}    uint64_t sagejs_bounded_hash = ` +
      `UINT64_C(1469598103934665603);`,
    ...hash,
  ];
  if (operation.kind === "bounded.map.contains" ||
      operation.kind === "bounded.set.contains" ||
      operation.kind === "bounded.map.get") {
    const initial = operation.kind === "bounded.map.get"
      ? exactValue(operation.value, context)
      : "0";
    const found = operation.kind === "bounded.map.get"
      ? "sagejs_bounded_table->values[sagejs_bounded_position]"
      : "1";
    return [
      ...common,
      `${indent}    ${target} = ${initial};`,
      `${indent}    if (sagejs_bounded_table->capacity != 0)`,
      `${indent}    {`,
      `${indent}        size_t sagejs_bounded_position = (size_t) ` +
        `(sagejs_bounded_hash % sagejs_bounded_table->capacity);`,
      `${indent}        size_t sagejs_bounded_probe;`,
      `${indent}        for (sagejs_bounded_probe = 0; ` +
        `sagejs_bounded_probe < sagejs_bounded_table->capacity; ` +
        `sagejs_bounded_probe++)`,
      `${indent}        {`,
      `${indent}            if (!sagejs_bounded_table->occupied[` +
        `sagejs_bounded_position])`,
      `${indent}                break;`,
      `${indent}            if (${equality})`,
      `${indent}            {`,
      `${indent}                ${target} = ${found};`,
      `${indent}                break;`,
      `${indent}            }`,
      `${indent}            sagejs_bounded_position++;`,
      `${indent}            if (sagejs_bounded_position == ` +
        `sagejs_bounded_table->capacity)`,
      `${indent}                sagejs_bounded_position = 0;`,
      `${indent}        }`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");
  }
  const isMap = operation.kind === "bounded.map.insert";
  const kindName = isMap ? "Map" : "Set";
  const update = isMap
    ? `${indent}                sagejs_bounded_table->values[` +
      `sagejs_bounded_position] = ${exactValue(operation.value, context)};`
    : "";
  const insertValue = isMap
    ? `${indent}                sagejs_bounded_table->values[` +
      `sagejs_bounded_position] = ${exactValue(operation.value, context)};`
    : "";
  return [
    ...common,
    `${indent}    int sagejs_bounded_done = 0;`,
    `${indent}    ${target} = 0;`,
    `${indent}    if (sagejs_bounded_table->capacity != 0)`,
    `${indent}    {`,
    `${indent}        size_t sagejs_bounded_position = (size_t) ` +
      `(sagejs_bounded_hash % sagejs_bounded_table->capacity);`,
    `${indent}        size_t sagejs_bounded_probe;`,
    `${indent}        for (sagejs_bounded_probe = 0; ` +
      `sagejs_bounded_probe < sagejs_bounded_table->capacity; ` +
      `sagejs_bounded_probe++)`,
    `${indent}        {`,
    `${indent}            if (!sagejs_bounded_table->occupied[` +
      `sagejs_bounded_position])`,
    `${indent}            {`,
    `${indent}                sagejs_bounded_entries[sagejs_bounded_position] = ` +
      `sagejs_bounded_key;`,
    insertValue,
    `${indent}                sagejs_bounded_table->occupied[` +
      `sagejs_bounded_position] = 1;`,
    `${indent}                sagejs_bounded_table->size++;`,
    `${indent}                ${target} = 1;`,
    `${indent}                sagejs_bounded_done = 1;`,
    `${indent}                break;`,
    `${indent}            }`,
    `${indent}            if (${equality})`,
    `${indent}            {`,
    update,
    `${indent}                sagejs_bounded_done = 1;`,
    `${indent}                break;`,
    `${indent}            }`,
    `${indent}            sagejs_bounded_position++;`,
    `${indent}            if (sagejs_bounded_position == ` +
      `sagejs_bounded_table->capacity)`,
    `${indent}                sagejs_bounded_position = 0;`,
    `${indent}        }`,
    `${indent}    }`,
    `${indent}    if (!sagejs_bounded_done)`,
    `${indent}    {`,
    statusFailure(
      "range",
      `NativeBounded${kindName} capacity exceeded`,
      `${indent}        `,
    ),
    `${indent}        goto fail;`,
    `${indent}    }`,
    `${indent}}`,
  ].filter(Boolean).join("\n");
}

function emitSparseRowsOperation(operation, context, indent) {
  const owner = exactValue(operation.owner, context);
  const target = operation.target === undefined
    ? undefined
    : exactValue(operation.target, context);
  if (operation.kind === "sparse.rows.length") {
    return `${indent}${target} = (uint64_t) ${owner}.length;`;
  }
  const row = exactValue(operation.row, context);
  if (operation.kind === "sparse.rows.row_length") {
    return [
      `${indent}if (${row} >= (uint64_t) ${owner}.rows)`,
      `${indent}{`,
      statusFailure(
        "range", "NativeSparseIntegerRows row out of range", `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${target} = ${owner}.row_lengths[(size_t) ${row}];`,
    ].join("\n");
  }
  const column = exactValue(operation.column, context);
  const indexCheck = [
    `${indent}if (${row} >= (uint64_t) ${owner}.rows || ` +
      `${column} >= (uint64_t) ${owner}.column_count)`,
    `${indent}{`,
    statusFailure(
      "range", "NativeSparseIntegerRows index out of range", `${indent}    `,
    ),
    `${indent}    goto fail;`,
    `${indent}}`,
  ];
  if (operation.kind === "sparse.rows.append") {
    return [
      ...indexCheck,
      `${indent}if (${owner}.has_last && ` +
        `(${row} < ${owner}.last_row || ` +
        `(${row} == ${owner}.last_row && ${column} <= ${owner}.last_column)))`,
      `${indent}{`,
      statusFailure(
        "range",
        "NativeSparseIntegerRows entries must be strictly row-major",
        `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}if (${owner}.length == ${owner}.entry_capacity)`,
      `${indent}{`,
      statusFailure(
        "range", "NativeSparseIntegerRows capacity exceeded", `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}if (!sagejs_native_integer_vector_set(status, ` +
        `&${owner}.values, ${owner}.length, ` +
        `${exactValue(operation.value, context)}))`,
      `${indent}    goto fail;`,
      `${indent}${owner}.entry_rows[${owner}.length] = ${row};`,
      `${indent}${owner}.columns[${owner}.length] = ${column};`,
      `${indent}${owner}.row_lengths[(size_t) ${row}]++;`,
      `${indent}${owner}.length++;`,
      `${indent}${owner}.last_row = ${row};`,
      `${indent}${owner}.last_column = ${column};`,
      `${indent}${owner}.has_last = 1;`,
    ].join("\n");
  }
  return [
    ...indexCheck,
    `${indent}{`,
    `${indent}    size_t sagejs_sparse_position;`,
    `${indent}    int sagejs_sparse_found = 0;`,
    `${indent}    for (sagejs_sparse_position = 0; ` +
      `sagejs_sparse_position < ${owner}.length; sagejs_sparse_position++)`,
    `${indent}    {`,
    `${indent}        uint64_t sagejs_sparse_row = ` +
      `${owner}.entry_rows[sagejs_sparse_position];`,
    `${indent}        uint64_t sagejs_sparse_column = ` +
      `${owner}.columns[sagejs_sparse_position];`,
    `${indent}        if (sagejs_sparse_row == ${row} && ` +
      `sagejs_sparse_column == ${column})`,
    `${indent}        {`,
    `${indent}            mpz_set(${target}, ` +
      `${owner}.values.entries[sagejs_sparse_position]);`,
    `${indent}            sagejs_sparse_found = 1;`,
    `${indent}            break;`,
    `${indent}        }`,
    `${indent}        if (sagejs_sparse_row > ${row} || ` +
      `(sagejs_sparse_row == ${row} && sagejs_sparse_column > ${column}))`,
    `${indent}            break;`,
    `${indent}    }`,
    `${indent}    if (!sagejs_sparse_found)`,
    `${indent}        mpz_set(${target}, ` +
      `${exactValue(operation.defaultValue, context)});`,
    `${indent}}`,
  ].join("\n");
}

function emitExactOperation(operation, context, indent) {
  const target = exactValue(operation.target, context);
  if (operation.kind === "integer.constant") {
    const machine = mpzMachineLiteral(target, operation.value);
    if (machine !== null) return `${indent}${machine};`;
    return [
      `${indent}if (mpz_set_str(${target}, ${cString(operation.value)}, 10) != 0)`,
      `${indent}{`,
      statusFailure("type", "invalid native integer literal", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "uint64.constant") {
    return `${indent}${target} = UINT64_C(${operation.value});`;
  }
  if (operation.kind === "bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (operation.kind === "range.validate_step") {
    const step = exactValue(operation.step, context);
    const condition = operation.stepType === "Integer"
      ? `mpz_sgn(${step}) == 0`
      : `${step} == 0`;
    return [
      `${indent}if (${condition})`,
      `${indent}{`,
      statusFailure(
        "range",
        "range() arg 3 must not be zero",
        `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.copy") {
    return `${indent}mpz_set(${target}, ` +
      `${exactValue(operation.source, context)});`;
  }
  if (operation.kind === "bool.copy" || operation.kind === "uint64.copy") {
    return `${indent}${target} = ${exactValue(operation.source, context)};`;
  }
  if (operation.kind === "value.discard") {
    return `${indent}(void) ${exactValue(operation.source, context)};`;
  }
  if (operation.kind === "record.construct") {
    return operation.fields.map((field) =>
      `${indent}${target}.sagejs_field_${field.name} = ` +
        `${exactValue(field.value, context)};`
    ).join("\n");
  }
  if (operation.kind === "record.copy") {
    return `${indent}${target} = ${exactValue(operation.source, context)};`;
  }
  if (operation.kind === "record.get") {
    return `${indent}${target} = ${exactValue(operation.source, context)}.` +
      `sagejs_field_${operation.field};`;
  }
  if (operation.kind === "record.vector.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${exactValue(operation.vector, context)}.length;`;
  }
  if (operation.kind === "record.vector.get" ||
      operation.kind === "record.vector.set") {
    const vector = exactValue(operation.vector, context);
    const index = exactValue(operation.index, context);
    const position = "sagejs_record_position";
    const check = operation.indexType === "Integer"
      ? `!sagejs_native_mpz_bounded_index(${index}, ${vector}.length, ` +
        "&sagejs_record_position)"
      : `${index} >= (uint64_t) ${vector}.length`;
    const entries = `((${recordCType(operation.record)} *) ${vector}.entries)`;
    const action = operation.kind === "record.vector.get"
      ? `${target} = ${entries}[${position}];`
      : `${entries}[${position}] = ${exactValue(operation.value, context)};`;
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_record_position = ` +
        `${operation.indexType === "Integer" ? "0" : `(size_t) ${index}`};`,
      `${indent}    if (${check})`,
      `${indent}    {`,
      statusFailure(
        "range",
        "NativeRecordVector index out of range",
        `${indent}        `,
      ),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    ${action}`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind.startsWith("bounded.") &&
      !operation.kind.endsWith(".arena.allocate")) {
    return emitBoundedCollectionOperation(operation, context, indent);
  }
  if (operation.kind.startsWith("sparse.rows.") &&
      operation.kind !== "sparse.rows.arena.allocate") {
    return emitSparseRowsOperation(operation, context, indent);
  }
  if (operation.kind === "integer.mod_uint64") {
    const divisor = exactValue(operation.right, context);
    return [
      `${indent}if (${divisor} == 0)`,
      `${indent}{`,
      statusFailure(
        "range",
        "integer division or modulo by zero",
        `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${target} = sagejs_mpz_mod_uint64(` +
        `${exactValue(operation.left, context)}, ${divisor});`,
    ].join("\n");
  }
  if (operation.kind === "uint64.buffer.copy") {
    return `${indent}${target} = ${exactValue(operation.source, context)};`;
  }
  if (operation.kind === "uint64.buffer.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${exactValue(operation.buffer, context)}.length;`;
  }
  if (operation.kind === "uint64.buffer.get" ||
      operation.kind === "uint64.buffer.set") {
    const buffer = exactValue(operation.buffer, context);
    const index = exactValue(operation.index, context);
    const position = operation.indexType === "Integer"
      ? "sagejs_buffer_position" : `(size_t) ${index}`;
    const access = operation.kind === "uint64.buffer.get"
      ? `${target} = ${buffer}.data[${position}];`
      : `${buffer}.data[${position}] = ` +
        `${exactValue(operation.value, context)};`;
    if (operation.indexType === "Integer") {
      return [
        `${indent}{`,
        `${indent}    int64_t sagejs_buffer_index;`,
        `${indent}    size_t sagejs_buffer_position;`,
        `${indent}    if (!mpz_to_int64(${index}, &sagejs_buffer_index) ||`,
        `${indent}        !sagejs_signed_buffer_index(${buffer}.length, ` +
          `sagejs_buffer_index, &sagejs_buffer_position))`,
        `${indent}    {`,
        statusFailure(
          "range", "UInt64Buffer index out of range", `${indent}        `,
        ),
        `${indent}        goto fail;`,
        `${indent}    }`,
        `${indent}    ${access}`,
        `${indent}}`,
      ].join("\n");
    }
    return [
      `${indent}if (${index} >= (uint64_t) ${buffer}.length)`,
      `${indent}{`,
      statusFailure(
        "range", "UInt64Buffer index out of range", `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${access}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.copy") {
    return `${indent}${target} = ${exactValue(operation.source, context)};`;
  }
  if (operation.kind === "int64.buffer.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${exactValue(operation.buffer, context)}.length;`;
  }
  if (operation.kind === "int64.record.view") {
    const buffer = exactValue(operation.buffer, context);
    const start = exactValue(operation.start, context);
    const length = exactValue(operation.length, context);
    return [
      `${indent}{`,
      `${indent}    int64_t sagejs_record_start;`,
      `${indent}    int64_t sagejs_record_length;`,
      `${indent}    if (!mpz_to_int64(${start}, &sagejs_record_start) ||`,
      `${indent}        !mpz_to_int64(${length}, &sagejs_record_length) ||`,
      `${indent}        sagejs_record_start < 0 || ` +
        `sagejs_record_length < 0 ||`,
      `${indent}        (uint64_t) sagejs_record_start > ` +
        `(uint64_t) ${buffer}.length ||`,
      `${indent}        (uint64_t) sagejs_record_length > ` +
        `(uint64_t) ${buffer}.length - ` +
        `(uint64_t) sagejs_record_start)`,
      `${indent}    {`,
      statusFailure("range", "Int64Record is outside its buffer", `${indent}        `),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    ${target}.data = ${buffer}.data + ` +
        `(size_t) sagejs_record_start;`,
      `${indent}    ${target}.length = (size_t) sagejs_record_length;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.get") {
    const buffer = exactValue(operation.buffer, context);
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_mpz_buffer_index(&${buffer}, ` +
        `${exactValue(operation.index, context)}, ` +
        `&sagejs_buffer_position))`,
      `${indent}    {`,
      statusFailure("range", "Int64 buffer index out of range", `${indent}        `),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    set_mpz_int64(${target}, ` +
        `${buffer}.data[sagejs_buffer_position]);`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.set") {
    const buffer = exactValue(operation.buffer, context);
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    int64_t sagejs_buffer_value;`,
      `${indent}    if (!sagejs_mpz_buffer_index(&${buffer}, ` +
        `${exactValue(operation.index, context)}, ` +
        `&sagejs_buffer_position))`,
      `${indent}    {`,
      statusFailure("range", "Int64 buffer index out of range", `${indent}        `),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    if (!mpz_to_int64(` +
        `${exactValue(operation.value, context)}, &sagejs_buffer_value))`,
      `${indent}    {`,
      statusFailure("range", "Int64Buffer value is outside signed 64-bit", `${indent}        `),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    ${buffer}.data[sagejs_buffer_position] = ` +
        `sagejs_buffer_value;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.buffer.copy") {
    return `${indent}${target} = ${exactValue(operation.source, context)};`;
  }
  if (operation.kind === "integer.buffer.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${exactValue(operation.buffer, context)}.length;`;
  }
  if (operation.kind === "integer.buffer.get") {
    const buffer = exactValue(operation.buffer, context);
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_mpz_integer_buffer_index(&${buffer}, ` +
        `${exactValue(operation.index, context)}, &sagejs_buffer_position))`,
      `${indent}    {`,
      statusFailure("range", "IntegerBuffer index out of range", `${indent}        `),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    sagejs_integer_buffer_get_mpz(` +
        `&${buffer}, sagejs_buffer_position, ${target});`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.buffer.set") {
    const buffer = exactValue(operation.buffer, context);
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_mpz_integer_buffer_index(&${buffer}, ` +
        `${exactValue(operation.index, context)}, &sagejs_buffer_position))`,
      `${indent}    {`,
      statusFailure("range", "IntegerBuffer index out of range", `${indent}        `),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    if (!sagejs_integer_buffer_set_mpz(status, ` +
        `&${buffer}, sagejs_buffer_position, ` +
        `${exactValue(operation.value, context)}))`,
      `${indent}        goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.vector.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${exactValue(operation.vector, context)}.length;`;
  }
  if (
    operation.kind === "integer.vector.get" ||
    operation.kind === "integer.vector.borrow" ||
    operation.kind === "integer.vector.set" ||
    operation.kind === "integer.vector.addmul" ||
    operation.kind === "integer.vector.submul"
  ) {
    const vector = exactValue(operation.vector, context);
    const index = exactValue(operation.index, context);
    const check = operation.indexType === "Integer"
      ? `!sagejs_native_integer_vector_mpz_index(&${vector}, ${index}, ` +
        "&sagejs_vector_position)"
      : `${index} >= (uint64_t) ${vector}.length`;
    let action;
    if (operation.kind === "integer.vector.get") {
      action = `mpz_set(${target}, ${vector}.entries[sagejs_vector_position]);`;
    } else if (operation.kind === "integer.vector.borrow") {
      action = `${target} = ${vector}.entries[sagejs_vector_position];`;
    } else if (operation.kind === "integer.vector.set") {
      action = `if (!sagejs_native_integer_vector_set(status, &${vector}, ` +
        `sagejs_vector_position, ${exactValue(operation.value, context)}))\n` +
        `${indent}        goto fail;`;
    } else {
      action = `if (!sagejs_native_integer_vector_addmul(status, &${vector}, ` +
        `sagejs_vector_position, ${exactValue(operation.left, context)}, ` +
        `${exactValue(operation.right, context)}, ` +
        `${operation.kind === "integer.vector.submul" ? 1 : 0}))\n` +
        `${indent}        goto fail;`;
    }
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_vector_position = ` +
        `${operation.indexType === "Integer" ? "0" : `(size_t) ${index}`};`,
      `${indent}    if (${check})`,
      `${indent}    {`,
      statusFailure(
        "range",
        "NativeIntegerVector index out of range",
        `${indent}        `,
      ),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    ${action}`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.vector.swap") {
    const vector = exactValue(operation.vector, context);
    const left = exactValue(operation.left, context);
    const right = exactValue(operation.right, context);
    const leftCheck = operation.leftType === "Integer"
      ? `!sagejs_native_integer_vector_mpz_index(&${vector}, ${left}, ` +
        "&sagejs_vector_left)"
      : `${left} >= (uint64_t) ${vector}.length`;
    const rightCheck = operation.rightType === "Integer"
      ? `!sagejs_native_integer_vector_mpz_index(&${vector}, ${right}, ` +
        "&sagejs_vector_right)"
      : `${right} >= (uint64_t) ${vector}.length`;
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_vector_left = ` +
        `${operation.leftType === "Integer" ? "0" : `(size_t) ${left}`};`,
      `${indent}    size_t sagejs_vector_right = ` +
        `${operation.rightType === "Integer" ? "0" : `(size_t) ${right}`};`,
      `${indent}    if (${leftCheck} || ${rightCheck})`,
      `${indent}    {`,
      statusFailure(
        "range",
        "NativeIntegerVector index out of range",
        `${indent}        `,
      ),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    mpz_swap(${vector}.entries[sagejs_vector_left], ` +
        `${vector}.entries[sagejs_vector_right]);`,
      `${indent}    {`,
      `${indent}        const uint64_t sagejs_vector_charge = ` +
        `${vector}.payload_charges[sagejs_vector_left];`,
      `${indent}        ${vector}.payload_charges[sagejs_vector_left] = ` +
        `${vector}.payload_charges[sagejs_vector_right];`,
      `${indent}        ${vector}.payload_charges[sagejs_vector_right] = ` +
        `sagejs_vector_charge;`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.matrix.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${exactValue(operation.matrix, context)}.rows;`;
  }
  if (
    operation.kind === "integer.matrix.get" ||
    operation.kind === "integer.matrix.borrow" ||
    operation.kind === "integer.matrix.set" ||
    operation.kind === "integer.matrix.addmul" ||
    operation.kind === "integer.matrix.submul"
  ) {
    const matrix = exactValue(operation.matrix, context);
    const row = exactValue(operation.row, context);
    const column = exactValue(operation.column, context);
    const rowCheck = operation.rowType === "Integer"
      ? `!sagejs_native_mpz_bounded_index(${row}, ${matrix}.rows, ` +
        "&sagejs_matrix_row)"
      : `${row} >= (uint64_t) ${matrix}.rows`;
    const columnCheck = operation.columnType === "Integer"
      ? `!sagejs_native_mpz_bounded_index(${column}, ${matrix}.columns, ` +
        "&sagejs_matrix_column)"
      : `${column} >= (uint64_t) ${matrix}.columns`;
    let action;
    if (operation.kind === "integer.matrix.get") {
      action = `mpz_set(${target}, ` +
        `${matrix}.storage.entries[sagejs_matrix_position]);`;
    } else if (operation.kind === "integer.matrix.borrow") {
      action = `${target} = ` +
        `${matrix}.storage.entries[sagejs_matrix_position];`;
    } else if (operation.kind === "integer.matrix.set") {
      action = `if (!sagejs_native_integer_matrix_set(status, &${matrix}, ` +
        `sagejs_matrix_position, ${exactValue(operation.value, context)}))\n` +
        `${indent}        goto fail;`;
    } else {
      action = `if (!sagejs_native_integer_matrix_addmul(status, &${matrix}, ` +
        `sagejs_matrix_position, ${exactValue(operation.left, context)}, ` +
        `${exactValue(operation.right, context)}, ` +
        `${operation.kind === "integer.matrix.submul" ? 1 : 0}))\n` +
        `${indent}        goto fail;`;
    }
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_matrix_row = ` +
        `${operation.rowType === "Integer" ? "0" : `(size_t) ${row}`};`,
      `${indent}    size_t sagejs_matrix_column = ` +
        `${operation.columnType === "Integer" ? "0" : `(size_t) ${column}`};`,
      `${indent}    size_t sagejs_matrix_position;`,
      `${indent}    if (${rowCheck} || ${columnCheck})`,
      `${indent}    {`,
      statusFailure(
        "range",
        "NativeIntegerMatrix index out of range",
        `${indent}        `,
      ),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    sagejs_matrix_position = ` +
        `sagejs_matrix_row * ${matrix}.columns + sagejs_matrix_column;`,
      `${indent}    ${action}`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.matrix.swap_rows") {
    const matrix = exactValue(operation.matrix, context);
    const left = exactValue(operation.left, context);
    const right = exactValue(operation.right, context);
    const leftCheck = operation.leftType === "Integer"
      ? `!sagejs_native_mpz_bounded_index(${left}, ${matrix}.rows, ` +
        "&sagejs_matrix_left)"
      : `${left} >= (uint64_t) ${matrix}.rows`;
    const rightCheck = operation.rightType === "Integer"
      ? `!sagejs_native_mpz_bounded_index(${right}, ${matrix}.rows, ` +
        "&sagejs_matrix_right)"
      : `${right} >= (uint64_t) ${matrix}.rows`;
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_matrix_left = ` +
        `${operation.leftType === "Integer" ? "0" : `(size_t) ${left}`};`,
      `${indent}    size_t sagejs_matrix_right = ` +
        `${operation.rightType === "Integer" ? "0" : `(size_t) ${right}`};`,
      `${indent}    size_t sagejs_matrix_column;`,
      `${indent}    if (${leftCheck} || ${rightCheck})`,
      `${indent}    {`,
      statusFailure(
        "range",
        "NativeIntegerMatrix row index out of range",
        `${indent}        `,
      ),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    for (sagejs_matrix_column = 0; ` +
        `sagejs_matrix_column < ${matrix}.columns; sagejs_matrix_column += 1)`,
      `${indent}    {`,
      `${indent}        const size_t sagejs_matrix_left_position = ` +
        `sagejs_matrix_left * ${matrix}.columns + sagejs_matrix_column;`,
      `${indent}        const size_t sagejs_matrix_right_position = ` +
        `sagejs_matrix_right * ${matrix}.columns + sagejs_matrix_column;`,
      `${indent}        uint64_t sagejs_matrix_charge;`,
      `${indent}        mpz_swap(` +
        `${matrix}.storage.entries[sagejs_matrix_left_position], ` +
        `${matrix}.storage.entries[sagejs_matrix_right_position]);`,
      `${indent}        sagejs_matrix_charge = ` +
        `${matrix}.storage.payload_charges[sagejs_matrix_left_position];`,
      `${indent}        ${matrix}.storage.payload_charges[` +
        `sagejs_matrix_left_position] = ${matrix}.storage.payload_charges[` +
        `sagejs_matrix_right_position];`,
      `${indent}        ${matrix}.storage.payload_charges[` +
        `sagejs_matrix_right_position] = sagejs_matrix_charge;`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.arena.vector.allocate") {
    const arena = exactValue(operation.arena, context);
    const owner = exactValue(operation.owner, context);
    return [
      `${indent}if (!sagejs_native_integer_vector_init_in_budget(status, ` +
        `&${owner}, ${exactValue(operation.capacity, context)}, ` +
        `${exactValue(operation.maximumBits, context)}, ` +
        `&${arena}.budget, "NativeExactArena memory limit exceeded"))`,
      `${indent}    goto fail;`,
      `${indent}${cName(operation.owner)}_initialized = 1;`,
    ].join("\n");
  }
  if (operation.kind === "integer.arena.matrix.allocate") {
    const arena = exactValue(operation.arena, context);
    const owner = exactValue(operation.owner, context);
    return [
      `${indent}if (!sagejs_native_integer_matrix_init_in_budget(status, ` +
        `&${owner}, ${exactValue(operation.rows, context)}, ` +
        `${exactValue(operation.columns, context)}, ` +
        `${exactValue(operation.maximumBits, context)}, &${arena}.budget, ` +
        `"NativeExactArena memory limit exceeded"))`,
      `${indent}    goto fail;`,
      `${indent}${cName(operation.owner)}_initialized = 1;`,
    ].join("\n");
  }
  if (operation.kind === "record.arena.vector.allocate") {
    const arena = exactValue(operation.arena, context);
    const owner = exactValue(operation.owner, context);
    return [
      `${indent}if (!sagejs_native_record_vector_init_in_budget(status, ` +
        `&${owner}, ${exactValue(operation.capacity, context)}, ` +
        `sizeof(${recordCType(operation.record)}), ` +
        `UINT64_C(${operation.entryCharge}), &${arena}.budget, ` +
        `"NativeExactArena memory limit exceeded"))`,
      `${indent}    goto fail;`,
      `${indent}${cName(operation.owner)}_initialized = 1;`,
    ].join("\n");
  }
  if (operation.kind === "bounded.map.arena.allocate" ||
      operation.kind === "bounded.set.arena.allocate") {
    const arena = exactValue(operation.arena, context);
    const owner = exactValue(operation.owner, context);
    const withValues = operation.kind === "bounded.map.arena.allocate" ? 1 : 0;
    return [
      `${indent}if (!sagejs_native_bounded_table_init_in_budget(status, ` +
        `&${owner}, ${exactValue(operation.capacity, context)}, ` +
        `sizeof(${recordCType(operation.record)}), ${withValues}, ` +
        `UINT64_C(${operation.entryCharge}), &${arena}.budget, ` +
        `"NativeExactArena memory limit exceeded"))`,
      `${indent}    goto fail;`,
      `${indent}${cName(operation.owner)}_initialized = 1;`,
    ].join("\n");
  }
  if (operation.kind === "sparse.rows.arena.allocate") {
    const arena = exactValue(operation.arena, context);
    const owner = exactValue(operation.owner, context);
    return [
      `${indent}if (!sagejs_native_sparse_integer_rows_init_in_budget(status, ` +
        `&${owner}, ${exactValue(operation.rows, context)}, ` +
        `${exactValue(operation.columns, context)}, ` +
        `${exactValue(operation.entryCapacity, context)}, ` +
        `${exactValue(operation.maximumBits, context)}, &${arena}.budget, ` +
        `"NativeExactArena memory limit exceeded"))`,
      `${indent}    goto fail;`,
      `${indent}${cName(operation.owner)}_initialized = 1;`,
    ].join("\n");
  }
  if (operation.kind === "integer.from_uint64") {
    return `${indent}set_mpz_uint64(${target}, ` +
      `${exactValue(operation.source, context)});`;
  }
  if (operation.kind === "uint64.from_integer_checked") {
    return [
      `${indent}if (!mpz_to_uint64(` +
        `${exactValue(operation.source, context)}, &${target}))`,
      `${indent}{`,
      statusFailure(
        "range", "integer is outside unsigned 64-bit", `${indent}    `,
      ),
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.neg") {
    return `${indent}mpz_neg(${target}, ` +
      `${exactValue(operation.source, context)});`;
  }
  if (operation.kind === "integer.abs") {
    return `${indent}mpz_abs(${target}, ` +
      `${exactValue(operation.source, context)});`;
  }
  if (operation.kind === "integer.pow_uint") {
    return `${indent}mpz_pow_ui(${target}, ` +
      `${exactValue(operation.base, context)}, ` +
      `${operation.exponent});`;
  }
  if (operation.kind === "integer.divmod") {
    const right = exactValue(operation.right, context);
    return [
      `${indent}if (mpz_sgn(${right}) == 0)`,
      `${indent}{`,
      statusFailure("range", "integer division or modulo by zero", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}mpz_fdiv_qr(` +
        `${exactValue(operation.quotient, context)}, ` +
        `${exactValue(operation.remainder, context)}, ` +
        `${exactValue(operation.left, context)}, ${right});`,
    ].join("\n");
  }
  if (operation.kind === "integer.round_sqrt") {
    const source = exactValue(operation.source, context);
    return [
      `${indent}if (mpz_sgn(${source}) < 0)`,
      `${indent}{`,
      statusFailure("range", "math domain error", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}{`,
      `${indent}    const double sagejs_input = mpz_get_d(${source});`,
      `${indent}    if (!isfinite(sagejs_input))`,
      `${indent}    {`,
      statusFailure("range", "int too large to convert to float", `${indent}        `),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    mpz_set_d(${target}, nearbyint(sqrt(sagejs_input)));`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.sequence.get") {
    const index = exactValue(operation.index, context);
    const position = `sagejs_sequence_index_${operation.target}`;
    const cases = operation.values.map((value, itemIndex) => {
      const machine = mpzMachineLiteral(target, value);
      const assignment = machine === null
        ? `if (mpz_set_str(${target}, ${cString(value)}, 10) != 0) goto fail;`
        : `${machine};`;
      return [
        `${indent}        case ${itemIndex}:`,
        `${indent}            ${assignment}`,
        `${indent}            break;`,
      ].join("\n");
    }).join("\n");
    return [
      `${indent}{`,
      `${indent}    long ${position};`,
      `${indent}    if (!mpz_fits_slong_p(${index}))`,
      `${indent}    {`,
      statusFailure("range", "native sequence index is too large", `${indent}        `),
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    ${position} = mpz_get_si(${index});`,
      `${indent}    if (${position} < 0) ${position} += ${operation.values.length};`,
      `${indent}    switch (${position})`,
      `${indent}    {`,
      cases,
      `${indent}        default:`,
      statusFailure("range", "native sequence index out of range", `${indent}            `),
      `${indent}            goto fail;`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.binary") {
    const left = exactValue(operation.left, context);
    const right = exactValue(operation.right, context);
    const simple = { add: "add", sub: "sub", mul: "mul" }[
      operation.operation
    ];
    if (simple !== undefined) {
      return `${indent}mpz_${simple}(${target}, ${left}, ${right});`;
    }
    const division = {
      floordiv: "fdiv_q",
      mod: "fdiv_r",
    }[operation.operation];
    if (division !== undefined) {
      return [
        `${indent}if (mpz_sgn(${right}) == 0)`,
        `${indent}{`,
        statusFailure("range", "integer division or modulo by zero", `${indent}    `),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}mpz_${division}(${target}, ${left}, ${right});`,
      ].join("\n");
    }
    throw new Error(`unsupported exact integer operation ${operation.operation}`);
  }
  if (operation.kind === "uint64.binary") {
    const left = exactValue(operation.left, context);
    const right = exactValue(operation.right, context);
    if (operation.operation === "floordiv" || operation.operation === "mod") {
      const operator = operation.operation === "floordiv" ? "/" : "%";
      return [
        `${indent}if (${right} == 0)`,
        `${indent}{`,
        statusFailure(
          "range",
          "unsigned integer division or modulo by zero",
          `${indent}    `,
        ),
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
        statusFailure(
          "range",
          "uint64 shift count must be between 0 and 63",
          `${indent}    `,
        ),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${left} ${operator} (unsigned int) ${right};`,
      ].join("\n");
    }
    return `${indent}${target} = ${left} ${operator} ${right};`;
  }
  if (operation.kind === "integer.compare") {
    const comparison = {
      eq: "== 0",
      ne: "!= 0",
      lt: "< 0",
      le: "<= 0",
      gt: "> 0",
      ge: ">= 0",
    }[operation.operation];
    return `${indent}${target} = mpz_cmp(` +
      `${exactValue(operation.left, context)}, ` +
      `${exactValue(operation.right, context)}) ${comparison};`;
  }
  if (operation.kind === "uint64.compare") {
    const operator = {
      eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=",
    }[operation.operation];
    return `${indent}${target} = ${exactValue(operation.left, context)} ` +
      `${operator} ${exactValue(operation.right, context)};`;
  }
  if (operation.kind === "bool.compare") {
    const operator = {
      eq: "==",
      ne: "!=",
      lt: "<",
      le: "<=",
      gt: ">",
      ge: ">=",
    }[operation.operation];
    return `${indent}${target} = ` +
      `${exactValue(operation.left, context)} ${operator} ` +
      `${exactValue(operation.right, context)};`;
  }
  if (operation.kind === "bool.binary") {
    const operator = operation.operation === "and" ? "&&" : "||";
    return `${indent}${target} = ` +
      `${exactValue(operation.left, context)} ${operator} ` +
      `${exactValue(operation.right, context)};`;
  }
  if (operation.kind === "bool.short_circuit") {
    const test = operation.operation === "and" ? target : `!${target}`;
    return [
      `${indent}${target} = ${exactValue(operation.left, context)};`,
      `${indent}if (${test})`,
      `${indent}{`,
      emitExactStatements(operation.right.operations, context, `${indent}    `),
      `${indent}    ${target} = ` +
        `${exactValue(operation.right.value, context)};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "bool.not") {
    return `${indent}${target} = !${exactValue(operation.source, context)};`;
  }
  if (operation.kind === "integer.truth") {
    return `${indent}${target} = mpz_sgn(` +
      `${exactValue(operation.source, context)}) != 0;`;
  }
  if (operation.kind === "uint64.truth") {
    return `${indent}${target} = ` +
      `${exactValue(operation.source, context)} != 0;`;
  }
  if (operation.kind === "native.call") {
    const callee = context.functions.get(operation.function);
    if (callee === undefined) {
      throw new Error(`unknown exact native callee ${operation.function}`);
    }
    const outputs = operation.results === undefined
      ? [operation.returnType === "Integer" ? target : `&${target}`]
      : operation.results.map((result) =>
        result.type === "Integer"
          ? exactValue(result.name, context)
          : `&${exactValue(result.name, context)}`
      );
    const args = operation.arguments.map((argument) =>
      argument.type === "NativeIntegerVector"
        ? context.liveIntegerVectorParameters?.has(argument.name)
          ? `sagejs_arg_${argument.name}`
          : `&${exactValue(argument.name, context)}`
        : exactValue(argument.name, context)
    );
    return [
      `${indent}if (!native_${operation.function}(status, ${outputs.join(", ")}` +
        `${args.length ? `, ${args.join(", ")}` : ""}))`,
      `${indent}    goto fail;`,
    ].join("\n");
  }
  if (operation.kind === "ffi.call" ||
      operation.kind === "ffi.arena.resource.allocate") {
    return emitExactForeignCall(operation, {
      value: (name) => exactValue(name, context),
      result: (name) => exactValue(name, context),
      failure: "goto fail;",
      resourceInitialized: context.resourceInitialized,
    }, indent);
  }
  throw new Error(`unsupported exact C IR operation ${operation.kind}`);
}

function emitExactStatements(statements, context, indent) {
  const lines = [];
  for (const statement of statements) {
    const comment = cOperationComment(statement, indent);
    if (comment) lines.push(comment);
    const directive = cSourceDirective(statement);
    if (directive) lines.push(directive);
    if (statement.kind === "if") {
      lines.push(
        emitExactStatements(statement.condition.operations, context, indent),
        `${indent}if (${exactValue(statement.condition.value, context)})`,
        `${indent}{`,
        emitExactStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      if (statement.alternative.length > 0) {
        lines.push(
          `${indent}else`,
          `${indent}{`,
          emitExactStatements(statement.alternative, context, `${indent}    `),
          `${indent}}`,
        );
      }
      continue;
    }
    if (statement.kind === "loop.break" || statement.kind === "loop.continue") {
      lines.push(`${indent}${statement.kind.slice(5)};`);
      continue;
    }
    if (statement.kind === "while") {
      lines.push(`${indent}for (;;)`, `${indent}{`);
      lines.push(
        emitExactStatements(
          statement.condition.operations,
          context,
          `${indent}    `,
        ),
        `${indent}    if (!${exactValue(statement.condition.value, context)})`,
        `${indent}        break;`,
        emitExactStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range") {
      const index = exactValue(statement.index, context);
      const iterator = exactValue(statement.iterator, context);
      const start = exactValue(statement.start, context);
      const stop = exactValue(statement.stop, context);
      const step = exactValue(statement.step, context);
      lines.push(
        `${indent}${iterator} = ${start};`,
        `${indent}while (${iterator} < ${stop})`,
        `${indent}{`,
        `${indent}    ${index} = ${iterator};`,
        `${indent}    (void) ${index};`,
        emitExactStatements(statement.body, context, `${indent}    `),
        `${indent}    if (${step} >= ${stop} - ${iterator})`,
        `${indent}        break;`,
        `${indent}    ${iterator} += ${step};`,
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range_exact") {
      const index = exactValue(statement.index, context);
      const iterator = exactValue(statement.iterator, context);
      const start = exactValue(statement.start, context);
      const stop = exactValue(statement.stop, context);
      const step = exactValue(statement.step, context);
      lines.push(
        `${indent}mpz_set(${iterator}, ${start});`,
        `${indent}for (;;)`,
        `${indent}{`,
        `${indent}    if (mpz_sgn(${step}) > 0)`,
        `${indent}    {`,
        `${indent}        if (mpz_cmp(${iterator}, ${stop}) >= 0)`,
        `${indent}            break;`,
        `${indent}    }`,
        `${indent}    else if (mpz_cmp(${iterator}, ${stop}) <= 0)`,
        `${indent}        break;`,
        `${indent}    mpz_set(${index}, ${iterator});`,
        `${indent}    (void) ${index};`,
        emitExactStatements(statement.body, context, `${indent}    `),
        `${indent}    mpz_add(${iterator}, ${iterator}, ${step});`,
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "integer.vector.scope") {
      const owner = exactValue(statement.owner, context);
      lines.push(
        emitExactStatements(statement.setup, context, indent),
        `${indent}if (!sagejs_native_integer_vector_init(status, &${owner}, ` +
          `${exactValue(statement.capacity, context)}, ` +
          `${exactValue(statement.memoryLimit, context)}))`,
        `${indent}    goto fail;`,
        `${indent}${cName(statement.owner)}_initialized = 1;`,
        emitExactStatements(statement.body, context, indent),
        `${indent}sagejs_native_integer_vector_clear(&${owner});`,
        `${indent}${cName(statement.owner)}_initialized = 0;`,
      );
      continue;
    }
    if (statement.kind === "integer.matrix.scope") {
      const owner = exactValue(statement.owner, context);
      lines.push(
        emitExactStatements(statement.setup, context, indent),
        `${indent}if (!sagejs_native_integer_matrix_init(status, &${owner}, ` +
          `${exactValue(statement.rows, context)}, ` +
          `${exactValue(statement.columns, context)}, ` +
          `${exactValue(statement.memoryLimit, context)}))`,
        `${indent}    goto fail;`,
        `${indent}${cName(statement.owner)}_initialized = 1;`,
        emitExactStatements(statement.body, context, indent),
        `${indent}sagejs_native_integer_matrix_clear(&${owner});`,
        `${indent}${cName(statement.owner)}_initialized = 0;`,
      );
      continue;
    }
    if (statement.kind === "integer.arena.scope") {
      const owner = exactValue(statement.owner, context);
      const lastAllocation = statement.body.findLastIndex((operation) =>
        operation.kind === "integer.arena.vector.allocate" ||
        operation.kind === "integer.arena.matrix.allocate" ||
        operation.kind === "record.arena.vector.allocate" ||
        operation.kind === "bounded.map.arena.allocate" ||
        operation.kind === "bounded.set.arena.allocate" ||
        operation.kind === "sparse.rows.arena.allocate" ||
        operation.kind === "ffi.arena.resource.allocate"
      );
      const residentSetup = statement.body.slice(0, lastAllocation + 1);
      const checkpointBody = statement.body.slice(lastAllocation + 1);
      const checkpointContext = {
        ...context,
        checkpointActive: true,
        checkpointOwner: owner,
      };
      const cleanupChildren = [...statement.children].reverse().flatMap(
        (child) => {
          if (child.childKind === "foreign-resource") {
            return [
              `${indent}if (${cName(child.owner)}_initialized)`,
              `${indent}{`,
              `${indent}    ${child.clearSymbol}(` +
                `${exactValue(child.owner, context)});`,
              `${indent}    ${cName(child.owner)}_initialized = 0;`,
              `${indent}}`,
            ];
          }
          const clear = child.type === "NativeIntegerMatrix"
            ? "sagejs_native_integer_matrix_clear"
            : child.type === "NativeIntegerVector"
              ? "sagejs_native_integer_vector_clear"
              : child.type.startsWith("NativeBoundedMap:") ||
                  child.type.startsWith("NativeBoundedSet:")
                ? "sagejs_native_bounded_table_clear"
                : child.type === "NativeSparseIntegerRows"
                  ? "sagejs_native_sparse_integer_rows_clear"
                  : "sagejs_native_record_vector_clear";
          return [
            `${indent}if (${cName(child.owner)}_initialized)`,
            `${indent}{`,
            `${indent}    ${clear}(&${exactValue(child.owner, context)});`,
            `${indent}    ${cName(child.owner)}_initialized = 0;`,
            `${indent}}`,
          ];
        },
      );
      lines.push(
        emitExactStatements(statement.setup, context, indent),
        `${indent}if (!sagejs_native_exact_arena_init(status, &${owner}, ` +
          `${exactValue(statement.memoryLimit, context)}, ` +
          `${exactValue(statement.temporaryLimit, context)}))`,
        `${indent}    goto fail;`,
        `${indent}${cName(statement.owner)}_initialized = 1;`,
        emitExactStatements(residentSetup, context, indent),
        `${indent}if (${owner}.temporary_limit > (uint64_t) SIZE_MAX ||`,
        `${indent}    !sagejs_native_gmp_checkpoint_begin(` +
          `&${owner}.checkpoint, (size_t) ${owner}.temporary_limit))`,
        `${indent}{`,
        statusFailure(
          "error",
          "NativeExactArena checkpoint allocation failed",
          `${indent}    `,
        ),
        `${indent}    goto fail;`,
        `${indent}}`,
        emitExactStatements(checkpointBody, checkpointContext, indent),
        ...cleanupChildren,
        ...(context.checkpointCleanupSymbols || []).map(
          (symbol) => `${indent}${symbol}();`,
        ),
        `${indent}sagejs_native_exact_arena_clear(&${owner});`,
        `${indent}${cName(statement.owner)}_initialized = 0;`,
      );
      continue;
    }
    if (statement.kind === "return") {
      const tuple = tupleElementTypes(statement.type);
      const publishesExact = tuple !== undefined
        ? tuple.includes("Integer")
        : statement.type === "Integer";
      if (context.checkpointActive) {
        lines.push(
          `${indent}if (${context.checkpointOwner}.checkpoint.soft_limit_exhaustions != 0 ||`,
          `${indent}    ${context.checkpointOwner}.checkpoint.upstream_allocations != 0)`,
          `${indent}{`,
          `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RETRY,`,
          `${indent}        "NativeExactArena temporary capacity exhausted");`,
          `${indent}    goto fail;`,
          `${indent}}`,
        );
      }
      if (context.checkpointActive && publishesExact) {
        lines.push(`${indent}sagejs_native_gmp_checkpoint_suspend();`);
      }
      if (tuple !== undefined) {
        tuple.forEach((type, index) => {
          if (type === "Integer") {
            lines.push(`${indent}mpz_set(sagejs_native_output_${index}, ` +
              `${exactValue(statement.values[index], context)});`);
          } else {
            lines.push(`${indent}*sagejs_native_output_${index} = ` +
              `${exactValue(statement.values[index], context)};`);
          }
        });
      } else if (statement.type === "Integer") {
        lines.push(`${indent}mpz_set(sagejs_native_output, ` +
          `${exactValue(statement.value, context)});`);
      } else if (context.resourceForType(statement.type) !== undefined) {
        const resource = context.resourceForType(statement.type);
        lines.push(
          `${indent}memcpy(sagejs_native_output, ` +
            `${exactValue(statement.value, context)}, sizeof(${resource.abi_type}));`,
          `${indent}${context.resourceInitialized(statement.value)} = 0;`,
        );
      } else {
        lines.push(`${indent}*sagejs_native_output = ` +
          `${exactValue(statement.value, context)};`);
      }
      if (context.checkpointActive && publishesExact) {
        lines.push(
          `${indent}if (!sagejs_native_gmp_checkpoint_resume())`,
          `${indent}{`,
          statusFailure(
            "error",
            "NativeExactArena checkpoint publication failed",
            `${indent}    `,
          ),
          `${indent}    goto fail;`,
          `${indent}}`,
        );
      }
      lines.push(`${indent}goto success;`);
      continue;
    }
    if (statement.kind === "raise") {
      lines.push(
        statusFailure("range", statement.message, indent),
        `${indent}goto fail;`,
      );
      continue;
    }
    lines.push(emitExactOperation(statement, context, indent));
  }
  return lines.filter(Boolean).join("\n");
}

function exactDeclarations(fn) {
  const storage = fn.analysis.storage;
  const declarations = [];
  const initialization = [];
  const cleanup = [];
  const arenaCleanup = [];
  for (let slot = 0; slot < storage.scratchSlots; slot += 1) {
    declarations.push(`    mpz_t sagejs_scratch_${slot};`);
    initialization.push(`    mpz_init(sagejs_scratch_${slot});`);
    cleanup.unshift(`    mpz_clear(sagejs_scratch_${slot});`);
  }
  for (const name of storage.borrowedLocals || []) {
    declarations.push(`    mpz_srcptr ${cName(name)} = NULL;`);
  }
  for (const param of fn.params) {
    if (param.type === "Integer") continue;
    if (param.type === "NativeIntegerVector") continue;
    if (resourceForFunctionType(fn, param.type) !== undefined) continue;
    const type = param.type === "uint64"
      ? "uint64_t"
      : exactBufferCType(param.type) !== undefined
        ? exactBufferCType(param.type)
        : "int";
    declarations.push(
      `    ${type} ${cName(param.name)} = sagejs_arg_${param.name};`,
    );
  }
  for (const local of fn.locals) {
    if ((fn.resourceAliases || {})[local.name] !== undefined) continue;
    const resource = resourceForFunctionType(fn, local.type);
    if (resource !== undefined) {
      declarations.push(`    ${resource.abi_type} ${cName(local.name)};`);
      if (resource.ownership === "owned") {
        declarations.push(`    int ${cName(local.name)}_initialized = 0;`);
        cleanup.unshift(
          `    if (${cName(local.name)}_initialized)`,
          `        ${resource.native.clear_symbol}(${cName(local.name)});`,
        );
      }
      continue;
    }
    if (local.type === "NativeIntegerVector") {
      declarations.push(
        `    sagejs_native_integer_vector ${cName(local.name)} = {0};`,
        `    int ${cName(local.name)}_initialized = 0;`,
      );
      cleanup.unshift(
        `    if (${cName(local.name)}_initialized)`,
        `        sagejs_native_integer_vector_clear(&${cName(local.name)});`,
      );
      continue;
    }
    if (local.type === "NativeIntegerMatrix") {
      declarations.push(
        `    sagejs_native_integer_matrix ${cName(local.name)} = {0};`,
        `    int ${cName(local.name)}_initialized = 0;`,
      );
      cleanup.unshift(
        `    if (${cName(local.name)}_initialized)`,
        `        sagejs_native_integer_matrix_clear(&${cName(local.name)});`,
      );
      continue;
    }
    if (local.type.startsWith("NativeRecordVector:")) {
      declarations.push(
        `    sagejs_native_record_vector ${cName(local.name)} = {0};`,
        `    int ${cName(local.name)}_initialized = 0;`,
      );
      cleanup.unshift(
        `    if (${cName(local.name)}_initialized)`,
        `        sagejs_native_record_vector_clear(&${cName(local.name)});`,
      );
      continue;
    }
    if (local.type.startsWith("NativeBoundedMap:") ||
        local.type.startsWith("NativeBoundedSet:")) {
      declarations.push(
        `    sagejs_native_bounded_table ${cName(local.name)} = {0};`,
        `    int ${cName(local.name)}_initialized = 0;`,
      );
      cleanup.unshift(
        `    if (${cName(local.name)}_initialized)`,
        `        sagejs_native_bounded_table_clear(&${cName(local.name)});`,
      );
      continue;
    }
    if (local.type === "NativeSparseIntegerRows") {
      declarations.push(
        `    sagejs_native_sparse_integer_rows ${cName(local.name)} = {0};`,
        `    int ${cName(local.name)}_initialized = 0;`,
      );
      cleanup.unshift(
        `    if (${cName(local.name)}_initialized)`,
        `        sagejs_native_sparse_integer_rows_clear(&${cName(local.name)});`,
      );
      continue;
    }
    if (local.type === "NativeExactArena") {
      declarations.push(
        `    sagejs_native_exact_arena ${cName(local.name)} = {0};`,
        `    int ${cName(local.name)}_initialized = 0;`,
      );
      arenaCleanup.unshift(
        `    if (${cName(local.name)}_initialized)`,
        `        sagejs_native_exact_arena_clear(&${cName(local.name)});`,
      );
      continue;
    }
    if (local.type === "Integer" || local.type.startsWith("IntegerSequence[")) {
      continue;
    }
    if (local.type.startsWith("Record:")) {
      declarations.push(
        `    ${recordCType(local.type.slice("Record:".length))} ` +
          `${cName(local.name)} = {0};`,
      );
      continue;
    }
    const type = local.type === "uint64"
      ? "uint64_t"
      : exactBufferCType(local.type) !== undefined
        ? exactBufferCType(local.type)
        : "int";
    declarations.push(`    ${type} ${cName(local.name)} = ` +
      `${exactBufferCType(local.type) !== undefined ? "{0}" : "0"};`);
  }
  const context = {
    storage,
    liveIntegerVectorParameters: new Set(
      fn.params
        .filter((param) => param.type === "NativeIntegerVector")
        .map((param) => param.name),
    ),
    checkpointCleanupSymbols: fn.checkpointCleanupSymbols || [],
    resourceParameters: new Set(
      fn.params
        .filter((param) => resourceForFunctionType(fn, param.type) !== undefined)
        .map((param) => param.name),
    ),
    resourceAliases: fn.resourceAliases || {},
    resourceForType(type) {
      return resourceForFunctionType(fn, type);
    },
    resourceInitialized(name) {
      return `${cName(name)}_initialized`;
    },
  };
  for (const name of storage.mutableParameters) {
    initialization.push(
      `    mpz_set(${exactValue(name, context)}, sagejs_arg_${name});`,
    );
  }
  /* Any GMP value whose limbs were obtained while an exact checkpoint was
     active must be cleared while that checkpoint still owns its slab.  Arena
     owners therefore always come after exact scratch, resident children, and
     foreign resources in both success and failure cleanup. */
  const checkpointCleanupSymbols = fn.checkpointCleanupSymbols || [];
  if (arenaCleanup.length > 0 && checkpointCleanupSymbols.length > 0) {
    const liveCheckpoint = fn.locals
      .filter((local) => local.type === "NativeExactArena")
      .map((local) =>
        `(${cName(local.name)}_initialized && ` +
        `${cName(local.name)}.checkpoint.open)`)
      .join(" || ");
    cleanup.push(
      `    if (${liveCheckpoint})`,
      "    {",
      ...checkpointCleanupSymbols.map((symbol) => `        ${symbol}();`),
      "    }",
    );
  }
  cleanup.push(...arenaCleanup);
  return { context, declarations, initialization, cleanup };
}

function emitExactInternalFunction(fn, functions) {
  const { context, declarations, initialization, cleanup } =
    exactDeclarations(fn);
  context.functions = functions;
  return `${internalSignature(fn)}
{
${declarations.join("\n")}
${initialization.join("\n")}
${emitExactStatements(fn.body, context, "    ")}
    sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
        "native function completed without returning");
    goto fail;

success:
${cleanup.join("\n")}
    return 1;

fail:
${cleanup.join("\n")}
    return 0;
}`;
}

function wrapperValue(param) {
  return `sagejs_wrapper_${param.name}`;
}

function createIdentifierAllocator(initial = []) {
  const used = new Set(initial);
  return (base) => {
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  };
}

function wrapperIdentifierContext(fn) {
  const parameters = new Map(fn.params.map((param) => [
    param.name,
    wrapperValue(param),
  ]));
  const fresh = createIdentifierAllocator(parameters.values());
  return {
    fresh,
    parameter(param) {
      return parameters.get(param.name);
    },
  };
}

function exactArenaRetryable(fn) {
  return fn.analysis?.liveExactWorkspace?.scopes?.some((scope) =>
    scope.storage === "shared-budget-lexical-exact-arena"
  ) && fn.analysis?.effects?.replaySafe === true &&
    (fn.analysis.effects.externalWrites || []).length === 0;
}

function exactWrapperExecution(
  fn,
  call,
  wrapperStatus,
  failureRefresh,
  identifiers,
  declarations,
) {
  if (!exactArenaRetryable(fn)) {
    return `    if (!${call})\n` +
      "    {\n" +
      `${failureRefresh.join("\n")}` +
      `${failureRefresh.length ? "\n" : ""}` +
      `        sagejs_native_throw_status(env, &${wrapperStatus});\n` +
      "        goto fail;\n" +
      "    }";
  }
  if (failureRefresh.length !== 0) {
    throw new Error(
      `${fn.name} cannot retry an exact arena with external refresh effects`,
    );
  }
  const attempt = identifiers.fresh("sagejs_checkpoint_attempt");
  const shift = identifiers.fresh("sagejs_checkpoint_shift");
  const nextShift = identifiers.fresh("sagejs_checkpoint_next_shift");
  const completed = identifiers.fresh("sagejs_checkpoint_completed");
  declarations.push(
    `    unsigned ${attempt} = 0;`,
    `    unsigned ${shift} = 0;`,
    `    unsigned ${nextShift} = 0;`,
    `    int ${completed} = 0;`,
  );
  return [
    `    for (${attempt} = 0;`,
    `        ${attempt} <= SAGEJS_NATIVE_GMP_MAX_RETRY_SHIFT &&`,
    `        ${shift} <= SAGEJS_NATIVE_GMP_MAX_RETRY_SHIFT;`,
    `        ${attempt} += 1)`,
    "    {",
    `        sagejs_native_status_reset(&${wrapperStatus});`,
    `        if (!sagejs_native_gmp_set_retry_shift(${shift}))`,
    "        {",
    `            sagejs_native_status_set(&${wrapperStatus},`,
    "                SAGEJS_NATIVE_ERROR,",
    '                "unable to configure exact checkpoint retry");',
    "            break;",
    "        }",
    `        if (${call})`,
    "        {",
    `            ${completed} = 1;`,
    "            break;",
    "        }",
    `        if (${wrapperStatus}.code != SAGEJS_NATIVE_RETRY)`,
    "            break;",
    `        ${nextShift} = ${shift} + 1;`,
    "        (void) sagejs_native_gmp_recommended_retry_shift(",
    `            ${shift}, SAGEJS_NATIVE_GMP_MAX_RETRY_SHIFT, &${nextShift});`,
    `        if (${nextShift} <= ${shift})`,
    "            break;",
    `        ${shift} = ${nextShift};`,
    "    }",
    "    (void) sagejs_native_gmp_set_retry_shift(0);",
    `    if (!${completed})`,
    "    {",
    `        if (${wrapperStatus}.code == SAGEJS_NATIVE_RETRY)`,
    "        {",
    `            sagejs_native_status_reset(&${wrapperStatus});`,
    `            sagejs_native_status_set(&${wrapperStatus},`,
    "                SAGEJS_NATIVE_RANGE_ERROR,",
    '                "NativeExactArena temporary capacity exhausted after retry");',
    "        }",
    `        sagejs_native_throw_status(env, &${wrapperStatus});`,
    "        goto fail;",
    "    }",
  ].join("\n");
}

function resourceCName(resource) {
  return String(resource.compiler_type || resource.python_name)
    .replace(/[^A-Za-z0-9_]/g, "_");
}

function resourceHolderName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_holder`;
}

function resourceUnwrapName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_unwrap`;
}

function resourceWrapName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_wrap`;
}

function resourceFinalizeName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_finalize`;
}

function resourcePostFinalizeName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_post_finalize`;
}

function resourceDestroyName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_destroy`;
}

function resourceReleaseName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_release`;
}

function resourceCloseName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_close`;
}

function resourceRefreshName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_refresh_external_memory`;
}

function resourceCopyBytesName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_copy_bytes`;
}

function resourceFromBytesName(resource) {
  return `sagejs_resource_${resourceCName(resource)}_from_bytes`;
}

function functionResource(fn, type) {
  return resourceForFunctionType(fn, type);
}

function writtenSizedResourceParameters(fn) {
  const written = new Set(fn.analysis?.effects?.externalWrites || []);
  return fn.params.flatMap((parameter) => {
    const resource = functionResource(fn, parameter.type);
    return written.has(parameter.name) &&
      resource?.native.size_symbol !== undefined
      ? [{ parameter, resource }]
      : [];
  });
}

function resourceRefreshStatements(fn, parameterValue = wrapperValue) {
  return writtenSizedResourceParameters(fn).flatMap(({ parameter, resource }) => [
    `    if (!sagejs_native_check_napi(env, ` +
      `${resourceRefreshName(resource)}(env, ${parameterValue(parameter)})))`,
    "        goto fail;",
  ]);
}

function resourceFailureRefreshStatements(fn, parameterValue = wrapperValue) {
  return writtenSizedResourceParameters(fn).map(({ parameter, resource }) =>
    `        (void) ${resourceRefreshName(resource)}(env, ` +
      `${parameterValue(parameter)});`
  );
}

function emitTaggedWrapper(fn, options = {}) {
  const identifiers = wrapperIdentifierContext(fn);
  const parameterValue = (param) => identifiers.parameter(param);
  const wrapperStatus = identifiers.fresh("sagejs_wrapper_status");
  const declarations = [
    `    sagejs_native_status ${wrapperStatus} = {0, NULL};`,
  ];
  const initialization = [];
  const parsing = [];
  const cleanup = [];
  const requiredCount = fn.params.filter(
    (param) => param.default === undefined,
  ).length;
  for (const [index, param] of fn.params.entries()) {
    const value = parameterValue(param);
    let parse;
    let defaultValue;
    const resource = functionResource(fn, param.type);
    if (resource !== undefined) {
      declarations.push(`    ${resourceHolderName(resource)} *${value} = NULL;`);
      parse = `if (!${resourceUnwrapName(resource)}(env, args[${index}], ` +
        `&${value}))\n            goto fail;`;
    } else if (param.type === "Integer") {
      declarations.push(`    sagejs_tagged_int ${value};`);
      initialization.push(`    sagejs_tagged_init(&${value});`);
      parse = `if (!get_tagged_integer(env, args[${index}], &${value}))\n` +
        "            goto fail;";
      defaultValue = param.default !== undefined && fitsInt64(param.default)
        ? `sagejs_tagged_set_small(&${value}, ` +
          `${int64Constant(param.default)});`
        : `if (!sagejs_tagged_set_decimal(&${value}, ` +
          `${cString(param.default)}))\n` +
          "            goto fail;";
      cleanup.push(`    sagejs_tagged_clear(&${value});`);
    } else if (param.type === "uint64") {
      declarations.push(`    uint64_t ${value};`);
      parse = `if (!get_uint64(env, args[${index}], &${value}))\n` +
        "            goto fail;";
      defaultValue = `${value} = UINT64_C(${param.default});`;
    } else if (isInt64BufferType(param.type)) {
      declarations.push(`    sagejs_int64_buffer ${value};`);
      parse = `if (!sagejs_native_get_int64_buffer(env, args[${index}], ` +
        `&${value}, ${cString(param.name + " must be a BigInt64Array")}))\n` +
        "            goto fail;";
    } else if (isUInt64BufferType(param.type)) {
      declarations.push(`    sagejs_uint64_buffer ${value};`);
      parse = `if (!sagejs_native_get_uint64_buffer(env, args[${index}], ` +
        `&${value}, ${cString(param.name + " must be a BigUint64Array")}))\n` +
        "            goto fail;";
    } else if (isIntegerBufferType(param.type)) {
      declarations.push(`    sagejs_integer_buffer ${value};`);
      parse = `if (!sagejs_native_get_integer_buffer(env, args[${index}], ` +
        `&${value}, ${cString(param.name + " must be a packed IntegerBuffer")}))\n` +
        "            goto fail;";
    } else {
      declarations.push(`    int ${value};`);
      parse = `if (!get_bool(env, args[${index}], &${value}))\n` +
        "            goto fail;";
      defaultValue = `${value} = ${param.default ? 1 : 0};`;
    }
    if (param.default === undefined) {
      parsing.push(`    ${parse}`);
    } else {
      parsing.push(
        `    if (argc > ${index})`,
        "    {",
        `        ${parse}`,
        "    }",
        "    else",
        "    {",
        `        ${defaultValue}`,
        "    }",
      );
    }
  }
  const resultTypes = tupleElementTypes(fn.returnType) || [fn.returnType];
  const tupleResult = isTupleType(fn.returnType);
  const wrapperItem = tupleResult
    ? identifiers.fresh("sagejs_wrapper_item")
    : undefined;
  const returnedResource = functionResource(fn, fn.returnType);
  if (returnedResource !== undefined && tupleResult) {
    throw new Error("native resource tuple returns are not supported");
  }
  const resultArguments = [];
  const resultInitialization = [];
  const resultCreation = [];
  resultTypes.forEach((type, index) => {
    const suffix = tupleResult ? `_${index}` : "";
    const value = identifiers.fresh(`sagejs_wrapper_result${suffix}`);
    const resource = functionResource(fn, type);
    if (resource !== undefined) {
      declarations.push(
        `    ${resourceHolderName(resource)} *${value} = NULL;`,
      );
      initialization.push(
        `    ${value} = (${resourceHolderName(resource)} *) ` +
          `calloc(1, sizeof(*${value}));`,
        `    if (${value} == NULL)`,
        "    {",
        '        napi_throw_error(env, NULL, "unable to allocate FFI resource");',
        "        goto fail;",
        "    }",
        `    ${value}->magic = ${resourceHolderName(resource)}_MAGIC;`,
      );
      cleanup.push(
        `    if (${value} != NULL)`,
        `        ${resourceDestroyName(resource)}(env, ${value});`,
      );
      resultArguments.push(`${value}->value`);
      resultInitialization.push(`    ${value}->initialized = 1;`);
      resultCreation.push(
        `    result = ${resourceWrapName(resource)}(env, &${value});`,
        "    if (result == NULL)",
        "        goto fail;",
      );
    } else if (type === "Integer") {
      declarations.push(`    sagejs_tagged_int ${value};`);
      initialization.push(`    sagejs_tagged_init(&${value});`);
      cleanup.push(`    sagejs_tagged_clear(&${value});`);
      resultArguments.push(`&${value}`);
      resultCreation.push(tupleResult
        ? `    ${wrapperItem} = create_tagged_bigint(env, &${value});`
        : `    result = create_tagged_bigint(env, &${value});`);
    } else {
      declarations.push(
        `    ${type === "uint64" ? "uint64_t" : "int"} ${value};`,
      );
      resultArguments.push(`&${value}`);
      const create = type === "bool"
        ? `napi_get_boolean(env, ${value} != 0, ` +
          `${tupleResult ? `&${wrapperItem}` : "&result"})`
        : `napi_create_bigint_uint64(env, ${value}, ` +
          `${tupleResult ? `&${wrapperItem}` : "&result"})`;
      resultCreation.push(
        `    if (!sagejs_native_check_napi(env, ${create}))`,
        "        goto fail;",
      );
    }
    if (tupleResult) {
      resultCreation.push(
        `    if (${wrapperItem} == NULL)`,
        "        goto fail;",
        `    if (!sagejs_native_check_napi(env, napi_set_element(env, result, ${index}, ${wrapperItem})))`,
        "        goto fail;",
        `    ${wrapperItem} = NULL;`,
      );
    }
  });
  if (tupleResult) {
    resultCreation.unshift(
      `    if (!sagejs_native_check_napi(env, napi_create_array_with_length(env, ${resultTypes.length}, &result)))`,
      "        goto fail;",
    );
    declarations.push(`    napi_value ${wrapperItem} = NULL;`);
  }
  const argumentsList = fn.params.map((param) =>
    functionResource(fn, param.type) !== undefined
      ? `${parameterValue(param)}->value`
      : param.type === "Integer"
      ? `&${parameterValue(param)}`
      : parameterValue(param)
  );
  const failureRefresh = resourceFailureRefreshStatements(fn, parameterValue);
  const execution = exactWrapperExecution(
    fn,
    `tagged_${fn.name}(&${wrapperStatus}, ` +
      `${resultArguments.join(", ")}` +
      `${argumentsList.length ? `, ${argumentsList.join(", ")}` : ""})`,
    wrapperStatus,
    failureRefresh,
    identifiers,
    declarations,
  );
  return `
static napi_value ${options.wrapper || `compiled_${fn.name}`}(
    napi_env env, napi_callback_info info)
{
    napi_value args[${Math.max(1, fn.params.length)}];
    size_t argc = ${fn.params.length};
${declarations.join("\n")}
    napi_value result = NULL;

    if (!sagejs_native_check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc < ${requiredCount} || argc > ${fn.params.length})
    {
        napi_throw_type_error(env, NULL, "wrong native argument count");
        return NULL;
    }
${initialization.join("\n")}
${parsing.join("\n")}
${execution}
${resultInitialization.join("\n")}
${resourceRefreshStatements(fn, parameterValue).join("\n")}
${resultCreation.join("\n")}
${cleanup.join("\n")}
    return result;

fail:
${cleanup.join("\n")}
    return NULL;
}`;
}

function emitExactWrapper(fn, options = {}) {
  const identifiers = wrapperIdentifierContext(fn);
  const parameterValue = (param) => identifiers.parameter(param);
  const wrapperStatus = identifiers.fresh("sagejs_wrapper_status");
  const declarations = [
    `    sagejs_native_status ${wrapperStatus} = {0, NULL};`,
  ];
  const initialization = [];
  const parsing = [];
  const cleanup = [];
  const requiredCount = fn.params.filter(
    (param) => param.default === undefined,
  ).length;
  for (const [index, param] of fn.params.entries()) {
    const value = parameterValue(param);
    let parse;
    let defaultValue;
    const resource = functionResource(fn, param.type);
    if (resource !== undefined) {
      declarations.push(`    ${resourceHolderName(resource)} *${value} = NULL;`);
      parse = `if (!${resourceUnwrapName(resource)}(env, args[${index}], ` +
        `&${value}))\n            goto fail;`;
    } else if (param.type === "Integer") {
      const initialized = identifiers.fresh(`${value}_initialized`);
      declarations.push(`    mpz_t ${value};`, `    int ${initialized} = 0;`);
      initialization.push(`    mpz_init(${value});`, `    ${initialized} = 1;`);
      parse = `if (!get_integer(env, args[${index}], ${value}))\n` +
        "            goto fail;";
      const machine = mpzMachineLiteral(value, param.default);
      defaultValue = machine === null
        ? `if (mpz_set_str(${value}, ` +
          `${cString(param.default)}, 10) != 0)\n` +
          "            goto fail;"
        : `${machine};`;
      cleanup.push(`    if (${initialized})`, `        mpz_clear(${value});`);
    } else if (param.type === "uint64") {
      declarations.push(`    uint64_t ${value};`);
      parse = `if (!get_uint64(env, args[${index}], &${value}))\n` +
        "            goto fail;";
      defaultValue = `${value} = UINT64_C(${param.default});`;
    } else if (isInt64BufferType(param.type)) {
      declarations.push(`    sagejs_int64_buffer ${value};`);
      parse = `if (!sagejs_native_get_int64_buffer(env, args[${index}], ` +
        `&${value}, ${cString(param.name + " must be a BigInt64Array")}))\n` +
        "            goto fail;";
    } else if (isUInt64BufferType(param.type)) {
      declarations.push(`    sagejs_uint64_buffer ${value};`);
      parse = `if (!sagejs_native_get_uint64_buffer(env, args[${index}], ` +
        `&${value}, ${cString(param.name + " must be a BigUint64Array")}))\n` +
        "            goto fail;";
    } else if (isIntegerBufferType(param.type)) {
      declarations.push(`    sagejs_integer_buffer ${value};`);
      parse = `if (!sagejs_native_get_integer_buffer(env, args[${index}], ` +
        `&${value}, ${cString(param.name + " must be a packed IntegerBuffer")}))\n` +
        "            goto fail;";
    } else {
      declarations.push(`    int ${value};`);
      parse = `if (!get_bool(env, args[${index}], &${value}))\n` +
        "            goto fail;";
      defaultValue = `${value} = ${param.default ? 1 : 0};`;
    }
    if (param.default === undefined) {
      parsing.push(`    ${parse}`);
    } else {
      parsing.push(
        `    if (argc > ${index})`,
        "    {",
        `        ${parse}`,
        "    }",
        "    else",
        "    {",
        `        ${defaultValue}`,
        "    }",
      );
    }
  }
  const resultTypes = tupleElementTypes(fn.returnType) || [fn.returnType];
  const tupleResult = isTupleType(fn.returnType);
  const wrapperItem = tupleResult
    ? identifiers.fresh("sagejs_wrapper_item")
    : undefined;
  const returnedResource = functionResource(fn, fn.returnType);
  if (returnedResource !== undefined && tupleResult) {
    throw new Error("native resource tuple returns are not supported");
  }
  const resultArguments = [];
  const resultInitialization = [];
  const resultCreation = [];
  resultTypes.forEach((type, index) => {
    const suffix = tupleResult ? `_${index}` : "";
    const value = identifiers.fresh(`sagejs_wrapper_result${suffix}`);
    const resource = functionResource(fn, type);
    if (resource !== undefined) {
      declarations.push(
        `    ${resourceHolderName(resource)} *${value} = NULL;`,
      );
      initialization.push(
        `    ${value} = (${resourceHolderName(resource)} *) ` +
          `calloc(1, sizeof(*${value}));`,
        `    if (${value} == NULL)`,
        "    {",
        '        napi_throw_error(env, NULL, "unable to allocate FFI resource");',
        "        goto fail;",
        "    }",
        `    ${value}->magic = ${resourceHolderName(resource)}_MAGIC;`,
      );
      cleanup.push(
        `    if (${value} != NULL)`,
        `        ${resourceDestroyName(resource)}(env, ${value});`,
      );
      resultArguments.push(`${value}->value`);
      resultInitialization.push(`    ${value}->initialized = 1;`);
      resultCreation.push(
        `    result = ${resourceWrapName(resource)}(env, &${value});`,
        "    if (result == NULL)",
        "        goto fail;",
      );
    } else if (type === "Integer") {
      const initialized = identifiers.fresh(`${value}_initialized`);
      declarations.push(`    mpz_t ${value};`, `    int ${initialized} = 0;`);
      initialization.push(`    mpz_init(${value});`, `    ${initialized} = 1;`);
      cleanup.push(`    if (${initialized})`, `        mpz_clear(${value});`);
      resultArguments.push(value);
      resultCreation.push(tupleResult
        ? `    ${wrapperItem} = create_bigint(env, ${value});`
        : `    result = create_bigint(env, ${value});`);
    } else {
      declarations.push(
        `    ${type === "uint64" ? "uint64_t" : "int"} ${value};`,
      );
      resultArguments.push(`&${value}`);
      const create = type === "bool"
        ? `napi_get_boolean(env, ${value} != 0, ` +
          `${tupleResult ? `&${wrapperItem}` : "&result"})`
        : `napi_create_bigint_uint64(env, ${value}, ` +
          `${tupleResult ? `&${wrapperItem}` : "&result"})`;
      resultCreation.push(
        `    if (!sagejs_native_check_napi(env, ${create}))`,
        "        goto fail;",
      );
    }
    if (tupleResult) {
      resultCreation.push(
        `    if (${wrapperItem} == NULL)`,
        "        goto fail;",
        `    if (!sagejs_native_check_napi(env, napi_set_element(env, result, ${index}, ${wrapperItem})))`,
        "        goto fail;",
        `    ${wrapperItem} = NULL;`,
      );
    }
  });
  if (tupleResult) {
    resultCreation.unshift(
      `    if (!sagejs_native_check_napi(env, napi_create_array_with_length(env, ${resultTypes.length}, &result)))`,
      "        goto fail;",
    );
    declarations.push(`    napi_value ${wrapperItem} = NULL;`);
  }
  const argumentsList = fn.params.map((param) =>
    functionResource(fn, param.type) !== undefined
      ? `${parameterValue(param)}->value`
      : parameterValue(param)
  );
  const failureRefresh = resourceFailureRefreshStatements(fn, parameterValue);
  const execution = exactWrapperExecution(
    fn,
    `${options.call || `native_${fn.name}`}(&${wrapperStatus}, ` +
      `${resultArguments.join(", ")}` +
      `${argumentsList.length ? `, ${argumentsList.join(", ")}` : ""})`,
    wrapperStatus,
    failureRefresh,
    identifiers,
    declarations,
  );
  return `
static napi_value ${options.wrapper || `compiled_${fn.name}_gmp`}(
    napi_env env, napi_callback_info info)
{
    napi_value args[${Math.max(1, fn.params.length)}];
    size_t argc = ${fn.params.length};
${declarations.join("\n")}
    napi_value result = NULL;

    if (!sagejs_native_check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc < ${requiredCount} || argc > ${fn.params.length})
    {
        napi_throw_type_error(env, NULL, "wrong native argument count");
        return NULL;
    }
${initialization.join("\n")}
${parsing.join("\n")}
${execution}
${resultInitialization.join("\n")}
${resourceRefreshStatements(fn, parameterValue).join("\n")}
${resultCreation.join("\n")}
${cleanup.join("\n")}
    return result;

fail:
${cleanup.join("\n")}
    return NULL;
}`;
}

function emitExactWrappers(fn) {
  if (fn.analysis?.backend?.kind === "fmpz") {
    return [
      emitExactWrapper(fn, {
        wrapper: `compiled_${fn.name}`,
        call: `sagejs_kernel_${fn.name}`,
      }),
      emitTaggedWrapper(fn, {
        wrapper: `compiled_${fn.name}_tagged`,
      }),
      emitExactWrapper(fn),
    ].join("\n\n");
  }
  return [emitTaggedWrapper(fn), emitExactWrapper(fn)].join("\n\n");
}

function fieldKind(fn) {
  return fn.returnType === "RealNumber" ? "real" : "complex";
}

function fieldCoreSignature(fn, prototype = false) {
  const valueType = fieldKind(fn) === "real" ? "mpfr_t" : "mpc_t";
  const parameters = fn.params.map((param) =>
    param.type === "uint64"
      ? `uint64_t ${cName(param.name)}`
      : `mpfr_prec_t ${cName(param.name)}_precision`
  );
  return `int sagejs_kernel_${fn.name}(` + [
    "sagejs_native_status *status",
    `${valueType} sagejs_native_output`,
    ...parameters,
  ].join(", ") + `)${prototype ? ";" : ""}`;
}

function emitFieldCoreFunction(fn) {
  const real = fn.returnType === "RealNumber";
  const prefix = real ? "real" : "complex";
  const parentType = real ? "RealField" : "ComplexField";
  const localType = real ? "mpfr_t" : "mpc_t";
  const parent = fn.params.find((param) => param.type === parentType);
  const locals = new Map(fn.locals.map((local) => [local.name, local]));
  const declarations = [];
  const initialization = [];
  const cleanup = [];
  const loopIndexes = new Set(
    fn.body
      .filter((operation) => operation.kind === "loop.range")
      .map((operation) => operation.index),
  );

  for (const local of fn.locals) {
    if (local.storage !== "return") {
      declarations.push(`    ${localType} ${cName(local.name)};`);
      declarations.push(`    int ${cName(local.name)}_initialized = 0;`);
      initialization.push(
        `    ${prefix === "real" ? "mpfr" : "mpc"}_init2(` +
          `${cName(local.name)}, precision);`,
        `    ${cName(local.name)}_initialized = 1;`,
      );
      cleanup.push(
        `    if (${cName(local.name)}_initialized)`,
        `        ${prefix === "real" ? "mpfr" : "mpc"}_clear(` +
          `${cName(local.name)});`,
      );
    }
  }

  const statements = [];
  for (const operation of fn.body) {
    if (operation.kind === "loop.range") {
      statements.push(
        `    for (${cName(operation.index)} = ` +
          `UINT64_C(${operation.start}); ` +
          `(${cName(operation.index)} - UINT64_C(${operation.start})) < ` +
          `${cName(operation.count)}; ` +
          `${cName(operation.index)} += UINT64_C(${operation.step || 1}))`,
        "    {",
      );
      for (const item of operation.body)
        statements.push(emitOperation(item, locals, "        "));
      statements.push("    }");
    } else if (operation.kind !== "return") {
      statements.push(emitOperation(operation, locals, "    "));
    }
  }

  return `${fieldCoreSignature(fn)}
{
    const mpfr_prec_t precision = ${cName(parent.name)}_precision;
${Array.from(loopIndexes, (name) => `    uint64_t ${cName(name)};`).join("\n")}
${declarations.join("\n")}
    sagejs_native_status_reset(status);
${initialization.join("\n")}
${statements.join("\n")}
    goto success;

success:
${cleanup.join("\n")}
    return 1;

fail:
${cleanup.join("\n")}
    return 0;
}`;
}

function emitFieldNodeAdapter(fn) {
  const prefix = fieldKind(fn);
  const nativeType = prefix === "real" ? "sagejs_real" : "sagejs_complex";
  const parentType = prefix === "real" ? "RealField" : "ComplexField";
  const parent = fn.params.find((param) => param.type === parentType);
  const iterations = fn.params.find((param) => param.type === "uint64");
  const coreArguments = fn.params.map((param) =>
    param.type === "uint64"
      ? cName(param.name)
      : `${cName(param.name)}_precision`
  );
  return `static napi_value compiled_${fn.name}(
    napi_env env, napi_callback_info info)
{
    napi_value args[${fn.params.length}];
    size_t argc = ${fn.params.length};
    sagejs_native_status status = {0, NULL};
    mpfr_prec_t ${cName(parent.name)}_precision;
    uint64_t ${cName(iterations.name)};
    ${nativeType} *result = NULL;
    napi_value wrapped;
    if (!sagejs_native_check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != ${fn.params.length})
    {
        napi_throw_type_error(env, NULL, "wrong native argument count");
        return NULL;
    }
    if (!get_precision(env, args[${fn.params.indexOf(parent)}],
            &${cName(parent.name)}_precision) ||
        !get_uint64(env, args[${fn.params.indexOf(iterations)}],
            &${cName(iterations.name)}))
        return NULL;
    result = sagejs_native_new_${prefix}(
        env, ${cName(parent.name)}_precision);
    if (result == NULL)
        return NULL;
    if (!sagejs_kernel_${fn.name}(&status, result->value,
            ${coreArguments.join(", ")}))
    {
        sagejs_native_throw_status(env, &status);
        sagejs_native_finalize_${prefix}(env, result, NULL);
        return NULL;
    }
    wrapped = sagejs_native_wrap_${prefix}(env, result);
    return wrapped;
}`;
}

function emitFloat64Operation(operation, indent) {
  const target = cName(operation.target);
  if (operation.kind === "uint64.constant") {
    return `${indent}${target} = UINT64_C(${operation.value});`;
  }
  if (operation.kind === "float64.constant") {
    return `${indent}${target} = ${operation.value};`;
  }
  if (operation.kind === "float64.copy" || operation.kind === "uint64.copy") {
    return `${indent}${target} = ${cName(operation.source)};`;
  }
  if (operation.kind === "float64.from_uint64") {
    return `${indent}${target} = (double)${cName(operation.source)};`;
  }
  if (operation.kind === "float64.abs") {
    return `${indent}${target} = fabs(${cName(operation.source)});`;
  }
  if (operation.kind === "float64.sqrt") {
    const source = cName(operation.source);
    return [
      `${indent}if (${source} < 0.0)`,
      `${indent}{`,
      statusFailure("range", "math domain error", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${target} = sqrt(${source});`,
    ].join("\n");
  }
  if (operation.kind === "float64.negate") {
    return `${indent}${target} = -${cName(operation.source)};`;
  }
  if (operation.kind === "float64.compare" ||
      operation.kind === "uint64.compare") {
    const operator = {
      eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=",
    }[operation.operation];
    return `${indent}${target} = ${cName(operation.left)} ${operator} ` +
      `${cName(operation.right)};`;
  }
  if (operation.kind === "uint64.binary") {
    const left = cName(operation.left);
    const right = cName(operation.right);
    const operator = uint64COperator(operation.operation);
    if (isUint64Shift(operation.operation)) {
      return [
        `${indent}if (${right} >= UINT64_C(64))`,
        `${indent}{`,
        statusFailure(
          "range",
          "uint64 shift count must be between 0 and 63",
          `${indent}    `,
        ),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${left} ${operator} (unsigned int) ${right};`,
      ].join("\n");
    }
    return `${indent}${target} = ${left} ${operator} ${right};`;
  }
  if (operation.kind === "float64.buffer.copy") {
    return `${indent}${target} = ${cName(operation.source)};`;
  }
  if (operation.kind === "float64.buffer.length") {
    return `${indent}${target} = (uint64_t) ${cName(operation.buffer)}.length;`;
  }
  if (operation.kind === "float64.record.view") {
    const buffer = cName(operation.buffer);
    const start = cName(operation.start);
    const length = cName(operation.length);
    return [
      `${indent}if (${start} > (uint64_t) ${buffer}.length ||`,
      `${indent}    ${length} > (uint64_t) ${buffer}.length - ${start})`,
      `${indent}{`,
      statusFailure("range", "Float64Record is outside its buffer", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${target}.data = ${buffer}.data + (size_t) ${start};`,
      `${indent}${target}.length = (size_t) ${length};`,
    ].join("\n");
  }
  if (operation.kind === "float64.buffer.get") {
    const buffer = cName(operation.buffer);
    const index = cName(operation.index);
    return [
      `${indent}if (${index} >= (uint64_t) ${buffer}.length)`,
      `${indent}{`,
      statusFailure("range", "Float64 buffer index out of range", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${target} = ${buffer}.data[(size_t) ${index}];`,
    ].join("\n");
  }
  if (operation.kind === "float64.buffer.set") {
    const buffer = cName(operation.buffer);
    const index = cName(operation.index);
    return [
      `${indent}if (${index} >= (uint64_t) ${buffer}.length)`,
      `${indent}{`,
      statusFailure("range", "Float64 buffer index out of range", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}${buffer}.data[(size_t) ${index}] = ${cName(operation.value)};`,
    ].join("\n");
  }
  if (operation.kind === "float64.binary") {
    const operator = { add: "+", sub: "-", mul: "*", div: "/" }[
      operation.operation
    ];
    const left = cName(operation.left);
    const right = cName(operation.right);
    if (operation.operation === "div") {
      return [
        `${indent}if (${right} == 0.0)`,
        `${indent}{`,
        statusFailure("range", "float division by zero", `${indent}    `),
        `${indent}    goto fail;`,
        `${indent}}`,
        `${indent}${target} = ${left} ${operator} ${right};`,
      ].join("\n");
    }
    return `${indent}${target} = ${left} ${operator} ${right};`;
  }
  throw new Error(`unsupported binary64 C operation ${operation.kind}`);
}

function emitFloat64Statements(statements, indent) {
  const lines = [];
  for (const statement of statements) {
    const comment = cOperationComment(statement, indent);
    if (comment) lines.push(comment);
    const directive = cSourceDirective(statement);
    if (directive) lines.push(directive);
    if (statement.kind === "loop.range") {
      const index = cName(statement.index);
      const start = statement.stop === undefined
        ? `UINT64_C(${statement.start})`
        : cName(statement.start);
      const bound = cName(statement.stop ?? statement.count);
      lines.push(
        `${indent}for (${index} = ${start}; ` +
          `${index} < ${bound}; ` +
          `${index} += UINT64_C(${statement.step || 1}))`,
        `${indent}{`,
        emitFloat64Statements(statement.body, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "if") {
      lines.push(
        emitFloat64Statements(statement.condition.operations, indent),
        `${indent}if (${cName(statement.condition.value)})`,
        `${indent}{`,
        emitFloat64Statements(statement.body, `${indent}    `),
        `${indent}}`,
      );
      if (statement.alternative.length > 0) {
        lines.push(
          `${indent}else`,
          `${indent}{`,
          emitFloat64Statements(statement.alternative, `${indent}    `),
          `${indent}}`,
        );
      }
      continue;
    }
    if (statement.kind === "return") {
      lines.push(
        `${indent}*sagejs_native_output = ${cName(statement.value)};`,
        `${indent}goto success;`,
      );
      continue;
    }
    lines.push(emitFloat64Operation(statement, indent));
  }
  return lines.filter(Boolean).join("\n");
}

function float64Parameter(param) {
  if (param.type === "uint64") return `uint64_t ${cName(param.name)}`;
  if (param.type === "Float64") return `double ${cName(param.name)}`;
  if (param.type === "Float64Buffer") {
    return `sagejs_float64_buffer ${cName(param.name)}`;
  }
  throw new Error(`unsupported binary64 parameter ${param.type}`);
}

function float64CoreSignature(fn, prototype = false) {
  return `int sagejs_kernel_${fn.name}(` + [
    "sagejs_native_status *status",
    "double *sagejs_native_output",
    ...fn.params.map(float64Parameter),
  ].join(", ") + `)${prototype ? ";" : ""}`;
}

function emitFloat64CoreFunction(fn) {
  const declarations = [];
  const params = new Set(fn.params.map((param) => param.name));
  for (const local of fn.locals) {
    if (params.has(local.name)) continue;
    const type = local.type === "uint64"
      ? "uint64_t"
      : local.type === "bool"
        ? "int"
        : ["Float64Buffer", "Float64Record"].includes(local.type)
          ? "sagejs_float64_buffer"
          : "double";
    declarations.push(`    ${type} ${cName(local.name)} = {0};`);
  }
  return `${float64CoreSignature(fn)}
{
${declarations.join("\n")}
    sagejs_native_status_reset(status);
${emitFloat64Statements(fn.body, "    ")}
    sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
        "binary64 function completed without returning");
    goto fail;

success:
    return 1;
fail:
    return 0;
}`;
}

function emitFloat64NodeAdapter(fn) {
  const parameterNames = new Map(fn.params.map((param) => [
    param.name,
    cName(param.name),
  ]));
  const fresh = createIdentifierAllocator(parameterNames.values());
  const wrapperStatus = fresh("sagejs_wrapper_status");
  const float64Result = fresh("sagejs_float64_result");
  const declarations = [
    `    sagejs_native_status ${wrapperStatus} = {0, NULL};`,
    `    double ${float64Result} = 0.0;`,
    "    napi_value result;",
  ];
  const parsing = [];
  for (const [index, param] of fn.params.entries()) {
    const name = parameterNames.get(param.name);
    if (param.type === "uint64") {
      declarations.push(`    uint64_t ${name};`);
      parsing.push(
        `    if (!get_uint64(env, args[${index}], &${name})) return NULL;`,
      );
    } else if (param.type === "Float64") {
      declarations.push(`    double ${name};`);
      parsing.push(
        `    if (napi_get_value_double(env, args[${index}], &${name}) ` +
          `!= napi_ok)`,
        "    {",
        `        napi_throw_type_error(env, NULL, ` +
          `${cString(param.name + " must be a binary64 float")});`,
        "        return NULL;",
        "    }",
      );
    } else {
      declarations.push(`    sagejs_float64_buffer ${name};`);
      parsing.push(
        `    if (!sagejs_native_get_float64_buffer(env, args[${index}], ` +
          `&${name}, ${cString(param.name + " must be a Float64Array")})) ` +
          `return NULL;`,
      );
    }
  }
  return `
static napi_value compiled_${fn.name}(napi_env env, napi_callback_info info)
{
    napi_value args[${fn.params.length}];
    size_t argc = ${fn.params.length};
${declarations.join("\n")}
    if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok)
        return NULL;
    if (argc != ${fn.params.length})
    {
        napi_throw_type_error(env, NULL, "${fn.name}() expects exactly ${fn.params.length} arguments");
        return NULL;
    }
${parsing.join("\n")}
    if (!sagejs_kernel_${fn.name}(&${wrapperStatus},
            &${float64Result}, ${fn.params.map((param) => parameterNames.get(param.name)).join(", ")}))
    {
        sagejs_native_throw_status(env, &${wrapperStatus});
        return NULL;
    }
    if (!sagejs_native_check_napi(env,
            napi_create_double(env, ${float64Result}, &result)))
        return NULL;
    return result;
}`;
}

function generateFloat64BufferDeclaration() {
  return `
typedef struct
{
    double *data;
    size_t length;
} sagejs_float64_buffer;`;
}

function generateFloat64BufferNodeAdapter() {
  return `
static int sagejs_native_get_float64_buffer(
    napi_env env,
    napi_value value,
    sagejs_float64_buffer *result,
    const char *argument)
{
    bool typed = false;
    napi_typedarray_type type;
    size_t length = 0;
    void *data = NULL;
    napi_value array_buffer;
    size_t byte_offset = 0;
    if (napi_is_typedarray(env, value, &typed) != napi_ok || !typed ||
        napi_get_typedarray_info(env, value, &type, &length, &data,
            &array_buffer, &byte_offset) != napi_ok ||
        type != napi_float64_array)
    {
        napi_throw_type_error(env, NULL, argument);
        return 0;
    }
    result->data = (double *) data;
    result->length = length;
    return 1;
}`;
}

function generateInt64BufferDeclaration() {
  return `
typedef struct
{
    int64_t *data;
    size_t length;
} sagejs_int64_buffer;`;
}

function generateUInt64BufferNodeAdapter() {
  return `
static int sagejs_native_get_uint64_buffer(
    napi_env env,
    napi_value value,
    sagejs_uint64_buffer *result,
    const char *argument)
{
    bool typed = false;
    napi_typedarray_type type;
    size_t length = 0;
    void *data = NULL;
    napi_value array_buffer;
    size_t byte_offset = 0;
    if (napi_is_typedarray(env, value, &typed) != napi_ok || !typed ||
        napi_get_typedarray_info(env, value, &type, &length, &data,
            &array_buffer, &byte_offset) != napi_ok ||
        type != napi_biguint64_array)
    {
        napi_throw_type_error(env, NULL, argument);
        return 0;
    }
    result->data = (uint64_t *) data;
    result->length = length;
    return 1;
}`;
}

function generateInt64BufferCoreSupport() {
  return `
static int sagejs_int64_buffer_index(
    const sagejs_int64_buffer *buffer,
    int64_t index,
    size_t *position)
{
    if (index >= 0)
    {
        if ((uint64_t) index >= (uint64_t) buffer->length)
            return 0;
        *position = (size_t) index;
        return 1;
    }
    const uint64_t magnitude = (uint64_t) (-(index + 1)) + UINT64_C(1);
    if (magnitude > (uint64_t) buffer->length)
        return 0;
    *position = buffer->length - (size_t) magnitude;
    return 1;
}

static int sagejs_mpz_buffer_index(
    const sagejs_int64_buffer *buffer,
    const mpz_t index,
    size_t *position)
{
    int64_t small;
    return mpz_to_int64(index, &small) &&
        sagejs_int64_buffer_index(buffer, small, position);
}`;
}

function generateInt64BufferNodeAdapter() {
  return `
static int sagejs_native_get_int64_buffer(
    napi_env env,
    napi_value value,
    sagejs_int64_buffer *result,
    const char *argument)
{
    bool typed = false;
    napi_typedarray_type type;
    size_t length = 0;
    void *data = NULL;
    napi_value array_buffer;
    size_t byte_offset = 0;
    if (napi_is_typedarray(env, value, &typed) != napi_ok || !typed ||
        napi_get_typedarray_info(env, value, &type, &length, &data,
            &array_buffer, &byte_offset) != napi_ok ||
        type != napi_bigint64_array)
    {
        napi_throw_type_error(env, NULL, argument);
        return 0;
    }
    result->data = (int64_t *) data;
    result->length = length;
    return 1;
}`;
}

function generateIntegerBufferDeclaration() {
  return `
typedef struct
{
    int32_t *sizes;
    uint64_t *limbs;
    size_t length;
    size_t word_capacity;
} sagejs_integer_buffer;`;
}

function generateIntegerBufferCoreSupport(includeFmpz = false) {
  return `
static int sagejs_integer_buffer_index(
    const sagejs_integer_buffer *buffer,
    int64_t index,
    size_t *position)
{
    if (index >= 0)
    {
        if ((uint64_t) index >= (uint64_t) buffer->length)
            return 0;
        *position = (size_t) index;
        return 1;
    }
    const uint64_t magnitude = (uint64_t) (-(index + 1)) + UINT64_C(1);
    if (magnitude > (uint64_t) buffer->length)
        return 0;
    *position = buffer->length - (size_t) magnitude;
    return 1;
}

static int sagejs_mpz_integer_buffer_index(
    const sagejs_integer_buffer *buffer,
    const mpz_t index,
    size_t *position)
{
    int64_t small;
    return mpz_to_int64(index, &small) &&
        sagejs_integer_buffer_index(buffer, small, position);
}
${includeFmpz ? `
#if FLINT_BITS != 64
#error "resident fmpz IntegerBuffer views require 64-bit FLINT limbs"
#endif

static int sagejs_fmpz_integer_buffer_index(
    const sagejs_integer_buffer *buffer,
    const fmpz_t index,
    size_t *position)
{
    if (!fmpz_fits_si(index))
        return 0;
    return sagejs_integer_buffer_index(
        buffer, (int64_t) fmpz_get_si(index), position);
}

static void sagejs_integer_buffer_get_fmpz(
    const sagejs_integer_buffer *buffer,
    size_t position,
    fmpz_t result)
{
    const int32_t signed_size = buffer->sizes[position];
    const slong count = signed_size < 0
        ? (slong) (-(int64_t) signed_size) : (slong) signed_size;
    if (count == 0)
    {
        fmpz_zero(result);
        return;
    }
    fmpz_set_ui_array(result,
        (const ulong *) (buffer->limbs +
            position * buffer->word_capacity), count);
    if (signed_size < 0)
        fmpz_neg(result, result);
}

static int sagejs_integer_buffer_set_fmpz(
    sagejs_native_status *status,
    sagejs_integer_buffer *buffer,
    size_t position,
    const fmpz_t value)
{
    const int sign = fmpz_sgn(value);
    const flint_bitcnt_t bits = fmpz_bits(value);
    const size_t count = sign == 0 ? 0 :
        (size_t) (UINT64_C(1) + (bits - 1) / 64);
    uint64_t *slot = buffer->limbs + position * buffer->word_capacity;
    if (count > buffer->word_capacity || count > (size_t) INT32_MAX)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "IntegerBuffer word capacity exceeded");
        return 0;
    }
    memset(slot, 0, buffer->word_capacity * sizeof(*slot));
    if (count != 0)
    {
        if (sign > 0)
        {
            fmpz_get_ui_array((ulong *) slot, (slong) count, value);
        }
        else
        {
            uint64_t carry = UINT64_C(1);
            /* FLINT publishes a negative value in two's-complement form.
               IntegerBuffer stores a separate sign and unsigned magnitude,
               so negate the fixed-width limb sequence in place. */
            fmpz_get_signed_ui_array((ulong *) slot, (slong) count, value);
            for (size_t limb = 0; limb < count; limb += 1)
            {
                const uint64_t inverted = ~slot[limb];
                slot[limb] = inverted + carry;
                carry = carry && slot[limb] == 0;
            }
        }
    }
    buffer->sizes[position] = sign < 0
        ? -(int32_t) count : (int32_t) count;
    return 1;
}
` : ""}

static void sagejs_integer_buffer_get_mpz(
    const sagejs_integer_buffer *buffer,
    size_t position,
    mpz_t result)
{
    const int32_t signed_size = buffer->sizes[position];
    const size_t count = signed_size < 0
        ? (size_t) (-(int64_t) signed_size) : (size_t) signed_size;
    if (count == 0)
    {
        mpz_set_ui(result, 0);
        return;
    }
    mpz_import(result, count, -1, sizeof(uint64_t), 0, 0,
        buffer->limbs + position * buffer->word_capacity);
    if (signed_size < 0)
        mpz_neg(result, result);
}

static int sagejs_integer_buffer_set_mpz(
    sagejs_native_status *status,
    sagejs_integer_buffer *buffer,
    size_t position,
    const mpz_t value)
{
    const int sign = mpz_sgn(value);
    const size_t count = sign == 0 ? 0 :
        (mpz_sizeinbase(value, 2) + 63) / 64;
    uint64_t *slot = buffer->limbs + position * buffer->word_capacity;
    size_t actual = 0;
    if (count > buffer->word_capacity || count > (size_t) INT32_MAX)
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR,
            "IntegerBuffer word capacity exceeded");
        return 0;
    }
    memset(slot, 0, buffer->word_capacity * sizeof(*slot));
    if (count != 0)
        mpz_export(slot, &actual, -1, sizeof(*slot), 0, 0, value);
    buffer->sizes[position] = sign < 0 ? -(int32_t) actual : (int32_t) actual;
    return 1;
}

static int sagejs_integer_buffer_get_int64(
    const sagejs_integer_buffer *buffer,
    size_t position,
    int64_t *result)
{
    const int32_t size = buffer->sizes[position];
    if (size == 0)
    {
        *result = 0;
        return 1;
    }
    if (size > 1 || size < -1)
        return 0;
    const uint64_t magnitude =
        buffer->limbs[position * buffer->word_capacity];
    if (size > 0)
    {
        if (magnitude > (uint64_t) INT64_MAX)
            return 0;
        *result = (int64_t) magnitude;
        return 1;
    }
    if (magnitude > (UINT64_C(1) << 63))
        return 0;
    *result = magnitude == (UINT64_C(1) << 63)
        ? INT64_MIN : -(int64_t) magnitude;
    return 1;
}

static void sagejs_integer_buffer_set_int64(
    sagejs_integer_buffer *buffer,
    size_t position,
    int64_t value)
{
    const int negative = value < 0;
    const uint64_t magnitude = negative
        ? (uint64_t) (-(value + 1)) + UINT64_C(1)
        : (uint64_t) value;
    uint64_t *slot = buffer->limbs + position * buffer->word_capacity;
    /* sizes[position] is authoritative; spare limbs are intentionally
       unspecified.  Clearing every reserved limb here made small-integer
       loops proportional to capacity and rewrote slot[0] immediately. */
    slot[0] = magnitude;
    buffer->sizes[position] = magnitude == 0 ? 0 : (negative ? -1 : 1);
}

static void sagejs_integer_buffer_get_tagged(
    const sagejs_integer_buffer *buffer,
    size_t position,
    sagejs_tagged_int *result)
{
    int64_t small;
    if (sagejs_integer_buffer_get_int64(buffer, position, &small))
    {
        sagejs_tagged_set_small(result, small);
        return;
    }
    sagejs_tagged_make_big(result);
    sagejs_integer_buffer_get_mpz(buffer, position, result->big);
}

static int sagejs_integer_buffer_set_tagged(
    sagejs_native_status *status,
    sagejs_integer_buffer *buffer,
    size_t position,
    sagejs_tagged_int *value)
{
    if (!value->is_big)
    {
        sagejs_integer_buffer_set_int64(buffer, position, value->small);
        return 1;
    }
    return sagejs_integer_buffer_set_mpz(
        status, buffer, position, value->big);
}`;
}

function generateIntegerBufferNodeAdapter() {
  return `
static int sagejs_native_get_integer_buffer(
    napi_env env,
    napi_value value,
    sagejs_integer_buffer *result,
    const char *argument)
{
    napi_value sizes_value, limbs_value, length_value, capacity_value;
    bool sizes_typed = false, limbs_typed = false;
    napi_typedarray_type sizes_type, limbs_type;
    size_t sizes_length = 0, limbs_length = 0;
    void *sizes_data = NULL, *limbs_data = NULL;
    napi_value sizes_array_buffer, limbs_array_buffer;
    size_t sizes_offset = 0, limbs_offset = 0;
    uint64_t length = 0, capacity = 0;
    if (napi_get_named_property(env, value, "sizes", &sizes_value) != napi_ok ||
        napi_get_named_property(env, value, "limbs", &limbs_value) != napi_ok ||
        napi_get_named_property(env, value, "length", &length_value) != napi_ok ||
        napi_get_named_property(env, value, "wordCapacity", &capacity_value) != napi_ok ||
        !get_uint64(env, length_value, &length) ||
        !get_uint64(env, capacity_value, &capacity) || capacity == 0 ||
        napi_is_typedarray(env, sizes_value, &sizes_typed) != napi_ok ||
        !sizes_typed ||
        napi_get_typedarray_info(env, sizes_value, &sizes_type, &sizes_length,
            &sizes_data, &sizes_array_buffer, &sizes_offset) != napi_ok ||
        sizes_type != napi_int32_array ||
        napi_is_typedarray(env, limbs_value, &limbs_typed) != napi_ok ||
        !limbs_typed ||
        napi_get_typedarray_info(env, limbs_value, &limbs_type, &limbs_length,
            &limbs_data, &limbs_array_buffer, &limbs_offset) != napi_ok ||
        limbs_type != napi_biguint64_array ||
        length > SIZE_MAX || capacity > SIZE_MAX ||
        sizes_length < (size_t) length ||
        ((size_t) length != 0 && (size_t) capacity > SIZE_MAX / (size_t) length) ||
        limbs_length < (size_t) length * (size_t) capacity)
    {
        napi_throw_type_error(env, NULL, argument);
        return 0;
    }
    result->sizes = (int32_t *) sizes_data;
    result->limbs = (uint64_t *) limbs_data;
    result->length = (size_t) length;
    result->word_capacity = (size_t) capacity;
    for (size_t index = 0; index < result->length; index++)
    {
        const int64_t size = result->sizes[index];
        const uint64_t magnitude = size < 0 ? (uint64_t) -size : (uint64_t) size;
        if (magnitude > capacity)
        {
            napi_throw_range_error(env, NULL,
                "IntegerBuffer slot exceeds its word capacity");
            return 0;
        }
    }
    return 1;
}`;
}

function resourceTagWords(resource) {
  const identity = `${resource.declaration_identity || ""}:` +
    `${resource.id}:${resource.abi_type}`;
  const digest = createHash("sha256").update(identity).digest("hex");
  return [digest.slice(0, 16), digest.slice(16, 32)];
}

function generateOwnedResourceNodeSupport(resource) {
  if (resource.ownership !== "owned") {
    throw new Error(
      `public native resource ${resource.python_name} must be owned`,
    );
  }
  const holder = resourceHolderName(resource);
  const finalize = resourceFinalizeName(resource);
  const postFinalize = resourcePostFinalizeName(resource);
  const destroy = resourceDestroyName(resource);
  const release = resourceReleaseName(resource);
  const unwrap = resourceUnwrapName(resource);
  const wrap = resourceWrapName(resource);
  const close = resourceCloseName(resource);
  const refresh = resourceRefreshName(resource);
  const copyBytes = resourceCopyBytesName(resource);
  const fromBytes = resourceFromBytesName(resource);
  const [tagHigh, tagLow] = resourceTagWords(resource);
  const tag = `sagejs_resource_${resourceCName(resource)}_type_tag`;
  const sized = resource.native.size_symbol !== undefined;
  const byteTransfer = resource.host_transfer?.kind === "copied_bytes"
    ? resource.host_transfer : null;
  const byteIngress = resource.host_ingress?.kind === "copied_bytes"
    ? resource.host_ingress : null;
  const refreshSupport = sized ? `
static napi_status ${refresh}(napi_env env, ${holder} *holder)
{
    const size_t measured = ${resource.native.size_symbol}(holder->value);
    const int64_t retained = measured > (size_t) INT64_MAX
        ? INT64_MAX : (int64_t) measured;
    const int64_t change = retained - holder->accounted_bytes;
    int64_t adjusted = 0;
    if (change == 0)
        return napi_ok;
    const napi_status status =
        napi_adjust_external_memory(env, change, &adjusted);
    if (status != napi_ok)
        return status;
    holder->accounted_bytes = retained;
    return napi_ok;
}
` : "";
  const initialAccounting = sized ? `
    const napi_status accounting_status = ${refresh}(env, holder);
    if (accounting_status != napi_ok)
    {
        void *removed = NULL;
        if (napi_remove_wrap(env, object, &removed) == napi_ok &&
            removed == holder)
            ${destroy}(env, holder);
        (void) sagejs_native_check_napi(env, accounting_status);
        return NULL;
    }` : "";
  const byteTransferSupport = byteTransfer === null ? "" :
    byteTransfer.native.copy_symbol === undefined ? `
static napi_value ${copyBytes}(napi_env env, napi_callback_info info)
{
    napi_value argument;
    napi_value result = NULL;
    size_t argc = 1;
    ${holder} *holder = NULL;
    if (!sagejs_native_check_napi(env,
            napi_get_cb_info(env, info, &argc, &argument, NULL, NULL)))
        return NULL;
    if (argc != 1 || !${unwrap}(env, argument, &holder))
        return NULL;
    const uint64_t length64 =
        ${byteTransfer.native.length_symbol}(holder->value);
    if (length64 > (uint64_t) SIZE_MAX)
    {
        napi_throw_range_error(env, NULL,
            "FFI byte payload is too large for this host");
        return NULL;
    }
    const size_t length = (size_t) length64;
    const unsigned char *data =
        ${byteTransfer.native.data_symbol}(holder->value);
    if (length != 0 && data == NULL)
    {
        napi_throw_error(env, NULL,
            "FFI byte payload has nonzero length but no data");
        return NULL;
    }
    const void *source = length == 0 ? (const void *) "" : data;
    if (!sagejs_native_check_napi(env,
            napi_create_buffer_copy(env, length, source, NULL, &result)))
        return NULL;
    return result;
}` : `
static napi_value ${copyBytes}(napi_env env, napi_callback_info info)
{
    napi_value argument;
    napi_value result = NULL;
    size_t argc = 1;
    ${holder} *holder = NULL;
    unsigned char *data = NULL;
    uint64_t length64 = 0;
    if (!sagejs_native_check_napi(env,
            napi_get_cb_info(env, info, &argc, &argument, NULL, NULL)))
        return NULL;
    if (argc != 1 || !${unwrap}(env, argument, &holder))
        return NULL;
    if (!${byteTransfer.native.copy_symbol}(
            &data, &length64, holder->value))
    {
        ${byteTransfer.native.clear_symbol}(data);
        napi_throw_error(env, NULL,
            "unable to compute FFI byte payload");
        return NULL;
    }
    if (length64 > (uint64_t) SIZE_MAX)
    {
        ${byteTransfer.native.clear_symbol}(data);
        napi_throw_range_error(env, NULL,
            "FFI byte payload is too large for this host");
        return NULL;
    }
    const size_t length = (size_t) length64;
    if (length != 0 && data == NULL)
    {
        ${byteTransfer.native.clear_symbol}(data);
        napi_throw_error(env, NULL,
            "computed FFI byte payload has nonzero length but no data");
        return NULL;
    }
    const void *source = length == 0 ? (const void *) "" : data;
    const napi_status status =
        napi_create_buffer_copy(env, length, source, NULL, &result);
    ${byteTransfer.native.clear_symbol}(data);
    if (!sagejs_native_check_napi(env, status))
        return NULL;
    return result;
}`;
  const byteIngressSupport = byteIngress === null ? "" : `
static napi_value ${fromBytes}(napi_env env, napi_callback_info info)
{
    napi_value arguments[2];
    napi_value argument;
    napi_value array_buffer;
    napi_value result = NULL;
    size_t argc = 2;
    size_t length = 0;
    size_t byte_offset = 0;
    napi_typedarray_type array_type;
    void *data = NULL;
    bool is_typedarray = false;
    ${holder} *holder = NULL;
    if (!sagejs_native_check_napi(env,
            napi_get_cb_info(env, info, &argc, arguments, NULL, NULL)))
        return NULL;
    if (argc != 1)
    {
        napi_throw_type_error(env, NULL,
            "FFI copied-byte ingress requires exactly one Uint8Array");
        return NULL;
    }
    argument = arguments[0];
    if (!sagejs_native_check_napi(env,
            napi_is_typedarray(env, argument, &is_typedarray)))
        return NULL;
    if (!is_typedarray ||
        !sagejs_native_check_napi(env,
            napi_get_typedarray_info(env, argument, &array_type, &length,
                &data, &array_buffer, &byte_offset)))
    {
        if (!is_typedarray)
            napi_throw_type_error(env, NULL,
                "FFI copied-byte ingress requires a Uint8Array");
        return NULL;
    }
    (void) array_buffer;
    (void) byte_offset;
    if (array_type != napi_uint8_array)
    {
        napi_throw_type_error(env, NULL,
            "FFI copied-byte ingress requires a Uint8Array");
        return NULL;
    }
    holder = (${holder} *) calloc(1, sizeof(*holder));
    if (holder == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate FFI resource");
        return NULL;
    }
    holder->magic = ${holder}_MAGIC;
    /* The declared initializer is transactional: failure owns nothing. */
    if (!${byteIngress.native.init_symbol}(
            holder->value, (const unsigned char *) data, (uint64_t) length))
    {
        napi_throw_error(env, NULL, "unable to copy bytes into FFI resource");
        goto fail;
    }
    holder->initialized = 1;
    result = ${wrap}(env, &holder);
    if (result == NULL)
        goto fail;
    return result;

fail:
    if (holder != NULL)
        ${destroy}(env, holder);
    return NULL;
}`;
  return `
#define ${holder}_MAGIC UINT64_C(0x${tagHigh})

typedef struct
{
    uint64_t magic;
    int initialized;
    int64_t accounted_bytes;
    ${resource.abi_type} value;
} ${holder};

static const napi_type_tag ${tag} = {
    UINT64_C(0x${tagHigh}), UINT64_C(0x${tagLow})
};

${refreshSupport}
static void ${holder}_clear_native(${holder} *holder)
{
    if (holder->initialized)
        ${resource.native.clear_symbol}(holder->value);
    holder->initialized = 0;
}

static void ${holder}_release_accounting(napi_env env, ${holder} *holder)
{
    const int64_t accounted = holder->accounted_bytes;
    holder->accounted_bytes = 0;
    if (env != NULL && accounted != 0)
    {
        int64_t adjusted = 0;
        (void) napi_adjust_external_memory(env, -accounted, &adjusted);
    }
}

static void ${release}(napi_env env, ${holder} *holder)
{
    ${holder}_clear_native(holder);
    ${holder}_release_accounting(env, holder);
}

static void ${destroy}(napi_env env, ${holder} *holder)
{
    ${release}(env, holder);
    holder->magic = 0;
    free(holder);
}

static void ${postFinalize}(napi_env env, void *data, void *hint)
{
    ${holder} *holder = (${holder} *) data;
    (void) hint;
    if (holder == NULL || holder->magic != ${holder}_MAGIC)
        return;
    ${holder}_release_accounting(env, holder);
    holder->magic = 0;
    free(holder);
}

static void ${finalize}(
    node_api_basic_env env, void *data, void *hint)
{
    ${holder} *holder = (${holder} *) data;
    (void) hint;
    if (holder == NULL || holder->magic != ${holder}_MAGIC)
        return;
    /* GC finalization may run while JavaScript and ordinary Node-API calls
       are forbidden.  Clear only foreign mathematical state here. */
    ${holder}_clear_native(holder);
    if (env == NULL ||
        node_api_post_finalizer(
            env, ${postFinalize}, holder, NULL) != napi_ok)
    {
        /* Environment teardown may reject deferred work.  The expensive
           native state is already gone; reclaim the tiny holder without
           touching Node-API.  Its dying environment discards accounting. */
        holder->magic = 0;
        free(holder);
    }
}

static int ${unwrap}(
    napi_env env, napi_value object, ${holder} **result)
{
    bool tagged = false;
    ${holder} *holder = NULL;
    if (!sagejs_native_check_napi(env,
            napi_check_object_type_tag(env, object, &${tag}, &tagged)) ||
        !tagged ||
        !sagejs_native_check_napi(env,
            napi_unwrap(env, object, (void **) &holder)) ||
        holder == NULL || holder->magic != ${holder}_MAGIC ||
        !holder->initialized)
    {
        if (!tagged)
            napi_throw_type_error(env, NULL,
                "expected declared ${resource.python_name} resource");
        else if (holder == NULL || holder->magic != ${holder}_MAGIC ||
                 !holder->initialized)
            napi_throw_error(env, NULL, "FFI resource is closed");
        return 0;
    }
    *result = holder;
    return 1;
}

static napi_value ${wrap}(napi_env env, ${holder} **holder_address)
{
    napi_value object = NULL;
    ${holder} *holder = *holder_address;
    if (!sagejs_native_check_napi(env, napi_create_object(env, &object)) ||
        !sagejs_native_check_napi(env,
            napi_type_tag_object(env, object, &${tag})))
        return NULL;
    if (!sagejs_native_check_napi(env,
            napi_wrap(env, object, holder, ${finalize}, NULL, NULL)))
        return NULL;
    *holder_address = NULL;${initialAccounting}
    return object;
}

static napi_value ${close}(napi_env env, napi_callback_info info)
{
    napi_value argument;
    napi_value result = NULL;
    size_t argc = 1;
    bool tagged = false;
    ${holder} *holder = NULL;
    if (!sagejs_native_check_napi(env,
            napi_get_cb_info(env, info, &argc, &argument, NULL, NULL)))
        return NULL;
    if (argc != 1 ||
        !sagejs_native_check_napi(env,
            napi_check_object_type_tag(env, argument, &${tag}, &tagged)) ||
        !tagged ||
        !sagejs_native_check_napi(env,
            napi_unwrap(env, argument, (void **) &holder)) ||
        holder == NULL || holder->magic != ${holder}_MAGIC)
    {
        if (!tagged)
            napi_throw_type_error(env, NULL,
                "expected declared ${resource.python_name} resource");
        return NULL;
    }
    ${release}(env, holder);
    if (!sagejs_native_check_napi(env, napi_get_undefined(env, &result)))
        return NULL;
    return result;
}
${byteTransferSupport}
${byteIngressSupport}`;
}

function generateResourceMemoryInspection(resources) {
  if (resources.length === 0) return "";
  const probes = resources.map((resource) => {
    const holder = resourceHolderName(resource);
    const tag = `sagejs_resource_${resourceCName(resource)}_type_tag`;
    return `    tagged = false;
    if (!sagejs_native_check_napi(env,
            napi_check_object_type_tag(env, argument, &${tag}, &tagged)))
        return NULL;
    if (tagged)
    {
        ${holder} *holder = NULL;
        if (!sagejs_native_check_napi(env,
                napi_unwrap(env, argument, (void **) &holder)) ||
            holder == NULL || holder->magic !=
                ${resourceHolderName(resource)}_MAGIC)
            return NULL;
        if (!sagejs_native_check_napi(env,
                napi_create_bigint_int64(
                    env, holder->accounted_bytes, &result)))
            return NULL;
        return result;
    }`;
  }).join("\n");
  return `
static napi_value sagejs_resource_external_memory(
    napi_env env, napi_callback_info info)
{
    napi_value argument;
    napi_value result = NULL;
    size_t argc = 1;
    bool tagged = false;
    if (!sagejs_native_check_napi(env,
            napi_get_cb_info(env, info, &argc, &argument, NULL, NULL)))
        return NULL;
    if (argc != 1)
    {
        napi_throw_type_error(env, NULL, "expected one FFI resource");
        return NULL;
    }
${probes}
    napi_throw_type_error(env, NULL, "expected declared owned FFI resource");
    return NULL;
}`;
}

function exactFunctions(ir) {
  return ir.functions.filter((fn) => fn.kernelKind === "integer");
}

function hostCallable(fn) {
  return fn.hostCallable !== false;
}

function publicCoreSignature(fn, prototype = false) {
  const parameters = [
    "sagejs_native_status *status",
    ...internalResults(fn, fn.returnType),
    ...fn.params.map((param) => internalArgument(fn, param)),
  ].join(", ");
  return `int sagejs_kernel_${fn.name}(${parameters})${prototype ? ";" : ""}`;
}

function publicCoreFunction(fn) {
  if (fn.analysis?.backend?.kind === "fmpz") {
    const declarations = ["    int sagejs_core_ok;"];
    const initialization = [];
    const cleanup = [];
    const conversions = [];
    const tuple = tupleElementTypes(fn.returnType);
    const resultTypes = tuple || [fn.returnType];
    const resultArguments = [];
    resultTypes.forEach((type, index) => {
      const suffix = tuple === undefined ? "" : `_${index}`;
      const output = `sagejs_native_output${suffix}`;
      if (type !== "Integer") {
        resultArguments.push(output);
        return;
      }
      const value = `sagejs_fmpz_result${suffix}`;
      declarations.push(`    fmpz_t ${value};`);
      initialization.push(`    fmpz_init(${value});`);
      cleanup.unshift(`    fmpz_clear(${value});`);
      resultArguments.push(value);
      conversions.push(`        fmpz_get_mpz(${output}, ${value});`);
    });
    const arguments_ = [];
    for (const param of fn.params) {
      if (param.type !== "Integer") {
        arguments_.push(`sagejs_arg_${param.name}`);
        continue;
      }
      const value = `sagejs_core_arg_${cName(param.name)}`;
      declarations.push(`    fmpz_t ${value};`);
      initialization.push(
        `    fmpz_init(${value});`,
        `    fmpz_set_mpz(${value}, sagejs_arg_${param.name});`,
      );
      cleanup.unshift(`    fmpz_clear(${value});`);
      arguments_.push(value);
    }
    return `${publicCoreSignature(fn)}
{
${declarations.join("\n")}
    sagejs_native_status_reset(status);
${initialization.join("\n")}
    sagejs_core_ok = fmpz_native_${fn.name}(status, ` +
      `${resultArguments.join(", ")}` +
      `${arguments_.length ? `, ${arguments_.join(", ")}` : ""});
    if (sagejs_core_ok)
    {
${conversions.join("\n")}
    }
${cleanup.join("\n")}
    return sagejs_core_ok;
}`;
  }
  if (fn.analysis?.backend?.kind === "tagged") {
    const declarations = ["    int sagejs_core_ok;"];
    const initialization = [];
    const cleanup = [];
    const arguments_ = [];
    const conversions = [];
    for (const param of fn.params) {
      if (param.type !== "Integer") {
        arguments_.push(`sagejs_arg_${param.name}`);
        continue;
      }
      const value = `sagejs_core_arg_${cName(param.name)}`;
      const small = `${value}_small`;
      declarations.push(
        `    sagejs_tagged_int ${value};`,
        `    int64_t ${small};`,
      );
      initialization.push(
        `    sagejs_tagged_init(&${value});`,
        `    if (mpz_to_int64(sagejs_arg_${param.name}, &${small}))`,
        `        sagejs_tagged_set_small(&${value}, ${small});`,
        "    else",
        "    {",
        `        sagejs_tagged_make_big(&${value});`,
        `        mpz_set(${value}.big, sagejs_arg_${param.name});`,
        "    }",
      );
      cleanup.unshift(`    sagejs_tagged_clear(&${value});`);
      arguments_.push(`&${value}`);
    }
    const resultTypes = tupleElementTypes(fn.returnType) || [fn.returnType];
    const resultArguments = [];
    resultTypes.forEach((type, index) => {
      const output = tupleElementTypes(fn.returnType) === undefined
        ? "sagejs_native_output"
        : `sagejs_native_output_${index}`;
      if (type !== "Integer") {
        resultArguments.push(output);
        return;
      }
      const value = `sagejs_core_result_${index}`;
      declarations.push(`    sagejs_tagged_int ${value};`);
      initialization.push(`    sagejs_tagged_init(&${value});`);
      cleanup.unshift(`    sagejs_tagged_clear(&${value});`);
      resultArguments.push(`&${value}`);
      conversions.push(
        `        if (${value}.is_big)`,
        `            mpz_set(${output}, ${value}.big);`,
        "        else",
        `            set_mpz_int64(${output}, ${value}.small);`,
      );
    });
    const copyResults = conversions.length === 0
      ? ""
      : `    if (sagejs_core_ok)\n    {\n${conversions.join("\n")}\n    }\n`;
    return `${publicCoreSignature(fn)}
{
${declarations.join("\n")}
    sagejs_native_status_reset(status);
${initialization.join("\n")}
    sagejs_core_ok = tagged_${fn.name}(status, ${resultArguments.join(", ")}` +
      `${arguments_.length ? `, ${arguments_.join(", ")}` : ""});
${copyResults}
${cleanup.join("\n")}
    return sagejs_core_ok;
}`;
  }
  const outputs = tupleElementTypes(fn.returnType) === undefined
    ? ["sagejs_native_output"]
    : tupleElementTypes(fn.returnType).map((_type, index) =>
      `sagejs_native_output_${index}`
    );
  const args = fn.params.map((param) => `sagejs_arg_${param.name}`);
  return `${publicCoreSignature(fn)}
{
    sagejs_native_status_reset(status);
    return native_${fn.name}(status, ${outputs.join(", ")}` +
    `${args.length ? `, ${args.join(", ")}` : ""});
}`;
}

function generatedCoreSymbolAliases(ir, moduleIdentity) {
  if (moduleIdentity === undefined) return "";
  if (!/^[a-f0-9]{16}$/.test(moduleIdentity)) {
    throw new TypeError(`invalid generated module identity ${moduleIdentity}`);
  }
  return ir.functions.filter(hostCallable).map((fn) =>
    `#define sagejs_kernel_${fn.name} ` +
      `sagejs_kernel_m_${moduleIdentity}_${fn.name}`
  ).join("\n");
}

function coreHeader(ir, options = {}) {
  const functions = ir.functions.filter(hostCallable);
  const exact = functions.filter((fn) => fn.kernelKind === "integer");
  const floats = functions.filter((fn) => fn.kernelKind === "float64");
  const fields = functions.filter((fn) =>
    ["real-field", "complex-field"].includes(fn.kernelKind)
  );
  const primeSources = functions.filter((fn) =>
    fn.kernelKind === "prime-field-source"
  );
  const primeFields = functions.filter((fn) =>
    fn.kernelKind === "prime-field-matrix"
  );
  const usesInt64Buffers = exact.some((fn) =>
    fn.params.some((param) => isInt64BufferType(param.type)) ||
    fn.locals.some((local) => isInt64BufferType(local.type))
  );
  const usesUInt64Buffers = exact.some((fn) =>
    fn.params.some((param) => isUInt64BufferType(param.type)) ||
    fn.locals.some((local) => isUInt64BufferType(local.type))
  );
  const usesIntegerBuffers = exact.some((fn) =>
    fn.params.some((param) => isIntegerBufferType(param.type)) ||
    fn.locals.some((local) => isIntegerBufferType(local.type))
  );
  const nativeRecordDeclarations = (ir.records || []).map((record) => {
    const fields = record.fields.map((field) => {
      const type = field.type === "UInt64Buffer"
        ? "sagejs_source_u64_buffer"
        : ["uint64", "PrimeModulusValue"].includes(field.type)
          ? "uint64_t"
          : null;
      if (type === null) {
        throw new Error(
          `unsupported compiler-owned record field ${record.name}.${field.name}`,
        );
      }
      return `    ${type} sagejs_field_${field.name};`;
    }).join("\n");
    return `typedef struct\n{\n${fields}\n} sagejs_native_record_${record.name};`;
  }).join("\n\n");
  return `/* Generated by Sage.js Native Kernel v36. */
#ifndef SAGEJS_GENERATED_KERNEL_CORE_H
#define SAGEJS_GENERATED_KERNEL_CORE_H

#include <stddef.h>
#include <stdint.h>
${exact.length > 0 ? "#include <gmp.h>" : ""}
${fields.some((fn) => fn.kernelKind === "real-field") ? "#include <mpfr.h>" : ""}
${fields.some((fn) => fn.kernelKind === "complex-field") ? "#include <mpc.h>" : ""}
${primeSources.length + primeFields.length > 0
    ? [
      "#include <flint/nmod.h>",
      "#include <flint/nmod_mat.h>",
      "#include <flint/ulong_extras.h>",
    ].join("\n") : ""}
${foreignHeaders(ir).map((header) => `#include <${header}>`).join("\n")}

${generatedCoreSymbolAliases(ir, options.moduleIdentity)}

#ifdef __cplusplus
extern "C" {
#endif

${generateStatusDeclarations()}
${primeFields.length > 0
    ? "typedef struct sagejs_prime_factor sagejs_prime_factor;" : ""}
${primeSources.length > 0 ? `
#ifndef SAGEJS_UINT64_BUFFER_DEFINED
#define SAGEJS_UINT64_BUFFER_DEFINED
typedef struct
{
    uint64_t *data;
    size_t length;
} sagejs_uint64_buffer;
#endif
#ifndef SAGEJS_SOURCE_U64_BUFFER_DEFINED
#define SAGEJS_SOURCE_U64_BUFFER_DEFINED
typedef sagejs_uint64_buffer sagejs_source_u64_buffer;
#endif
` : ""}
${nativeRecordDeclarations}
${usesInt64Buffers ? `
typedef struct
{
    int64_t *data;
    size_t length;
} sagejs_int64_buffer;
` : ""}${usesUInt64Buffers ? `
#ifndef SAGEJS_UINT64_BUFFER_DEFINED
#define SAGEJS_UINT64_BUFFER_DEFINED
typedef struct
{
    uint64_t *data;
    size_t length;
} sagejs_uint64_buffer;
#endif
` : ""}${usesIntegerBuffers ? `
typedef struct
{
    int32_t *sizes;
    uint64_t *limbs;
    size_t length;
    size_t word_capacity;
} sagejs_integer_buffer;
` : ""}${floats.some((fn) =>
    fn.params.some((param) => param.type === "Float64Buffer") ||
    fn.locals.some((local) =>
      ["Float64Buffer", "Float64Record"].includes(local.type)
    )
  ) ? `
typedef struct
{
    double *data;
    size_t length;
} sagejs_float64_buffer;
` : ""}
/* Exact-integer outputs are initialized mpz_t values owned by the caller. */
${functions.map((fn) => fn.kernelKind === "integer"
    ? publicCoreSignature(fn, true)
    : fn.kernelKind === "float64"
      ? float64CoreSignature(fn, true)
      : fn.kernelKind === "prime-field-source"
        ? primeSourceCoreSignature(fn, true)
        : fn.kernelKind === "prime-field-matrix"
          ? primeFieldCoreSignature(fn, true)
          : fieldCoreSignature(fn, true)).join("\n")}

#ifdef __cplusplus
}
#endif

#endif
`;
}

function generateHostCore(ir, options = {}) {
  const supported = new Set([
    "integer", "float64", "real-field", "complex-field",
    "prime-field-source", "prime-field-matrix",
  ]);
  if (ir.functions.length === 0 ||
      ir.functions.some((fn) => !supported.has(fn.kernelKind))) {
    const kinds = Array.from(new Set(ir.functions.map((fn) => fn.kernelKind)));
    throw new Error(
      "host-isolated core emission currently requires certified kernel kinds; " +
      `found ${kinds.join(", ")}`,
    );
  }
  const checkpointCleanupByLibrary = new Map(
    (ir.foreignLibraries || [])
      .filter((library) =>
        typeof library.native?.checkpoint_cleanup === "string")
      .map((library) => [library.id, library.native.checkpoint_cleanup]),
  );
  const functions = ir.functions.map((fn) => {
    const libraryIds = new Set();
    for (const dependency of fn.foreignDependencies || []) {
      const separator = dependency.indexOf("@");
      if (separator > 0) libraryIds.add(dependency.slice(0, separator));
    }
    for (const resource of fn.foreignResources || []) {
      if (resource.library?.id) libraryIds.add(resource.library.id);
    }
    return {
      ...fn,
      checkpointCleanupSymbols: Array.from(libraryIds)
        .map((id) => checkpointCleanupByLibrary.get(id))
        .filter((symbol) => symbol !== undefined)
        .sort(),
    };
  });
  const exact = functions.filter((fn) => fn.kernelKind === "integer");
  const exactEntries = exact.filter(hostCallable);
  // Prime-source callers use the checked scalar core ABI, even when their
  // integer dependency is not a public entry. Keep those adapters internal;
  // removing a host export must not remove a cross-representation call edge.
  const crossRepresentationCallees = new Set(functions
    .filter((fn) => fn.kernelKind === "prime-field-source")
    .flatMap((fn) => ir.callGraph?.[fn.name] || []));
  const privateCoreAdapters = exact.filter((fn) =>
    !hostCallable(fn) && crossRepresentationCallees.has(fn.name)
  );
  const floats = functions.filter((fn) => fn.kernelKind === "float64");
  const fields = functions.filter((fn) =>
    ["real-field", "complex-field"].includes(fn.kernelKind)
  );
  const primeSources = functions.filter((fn) =>
    fn.kernelKind === "prime-field-source"
  );
  const primeFields = functions.filter((fn) =>
    fn.kernelKind === "prime-field-matrix"
  );
  const functionMap = new Map(exact.map((fn) => [fn.name, fn]));
  const fmpz = generateFmpzFunctions(exact);
  // Scalar dependency-only functions still need internal tagged/word bodies.
  // Host export selection is distinct from representation eligibility: live
  // owned and fmpz-only aggregate borrows continue to use their direct core.
  const bridgeFunctions = exact.filter((fn) =>
    !fn.params.some((param) => isLiveExactOwnerType(param.type)) &&
    fn.analysis?.fmpzExact?.hostBoundary !== "none-internal-borrowed-aggregate-only"
  );
  const tagged = generateTaggedFunctions(bridgeFunctions);
  const wordFunctions = bridgeFunctions.filter((fn) =>
    ![fn.returnType, ...fn.params.map((param) => param.type)].some((type) =>
      resourceForFunctionType(fn, type) !== undefined
    )
  );
  const word = generateWordFunctions(wordFunctions);
  const wordFunctionMap = new Map(wordFunctions.map((fn) => [fn.name, fn]));
  const wordMayPromote = wordPromotionCapabilities(wordFunctions);
  const usesInt64Buffers = exact.some((fn) =>
    fn.params.some((param) => isInt64BufferType(param.type)) ||
    fn.locals.some((local) => isInt64BufferType(local.type))
  );
  const usesUInt64Buffers = exact.some((fn) =>
    fn.params.some((param) => isUInt64BufferType(param.type)) ||
    fn.locals.some((local) => isUInt64BufferType(local.type))
  );
  const usesIntegerBuffers = exact.some((fn) =>
    fn.params.some((param) => isIntegerBufferType(param.type)) ||
    fn.locals.some((local) => isIntegerBufferType(local.type))
  );
  const pieces = [
    generateStatusRuntime(),
    exact.length > 0 ? GMP_CHECKPOINT_ALLOCATOR_C_SOURCE : "",
    exact.length > 0 ? generateExactCoreRuntime() : "",
    fmpz.selected.length > 0 ? FMPZ_EXACT_RUNTIME_C_SOURCE : "",
    usesInt64Buffers ? generateInt64BufferCoreSupport() : "",
    usesIntegerBuffers
      ? generateIntegerBufferCoreSupport(fmpz.selected.length > 0)
      : "",
    exact.map((fn) => internalSignature(fn, true)).join("\n"),
    fmpz.prototypes,
    word.prototypes,
    tagged.prototypes,
    word.functions,
    tagged.functions,
    fmpz.functions,
    ...exact.map((fn) => emitExactInternalFunction(fn, functionMap)),
    ...exactEntries.map(publicCoreFunction),
    ...privateCoreAdapters.map((fn) =>
      publicCoreFunction(fn).replace(/^int sagejs_kernel_/m, "static int sagejs_kernel_")
    ),
    ...floats.map(emitFloat64CoreFunction),
    ...fields.map(emitFieldCoreFunction),
    primeSources.length > 0 ? generatePrimeSourceSupport() : "",
    ...primeSources.map((fn) => emitPrimeSourceCoreFunction(fn, {
      wordFunctions: wordFunctionMap,
      wordMayPromote,
    })),
    primeFields.length > 0 ? generatePrimeFieldSupport() : "",
    ...primeFields.map(emitPrimeFieldCoreFunction),
  ].filter(Boolean);
  const source = `/* Generated by Sage.js Native Kernel v36.
 * Host-isolated mathematical core: no Node, JavaScript, or Python runtime.
 */
#include <math.h>
#include <limits.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#if defined(_MSC_VER)
#include <intrin.h>
#endif

${exact.length > 0 ? "#include <gmp.h>" : ""}
${fmpz.selected.length > 0 ? "#include <flint/fmpz.h>" : ""}
${fields.some((fn) => fn.kernelKind === "real-field") ? "#include <mpfr.h>" : ""}
${fields.some((fn) => fn.kernelKind === "complex-field") ? "#include <mpc.h>" : ""}
${primeSources.length + primeFields.length > 0
    ? [
      "#include <flint/nmod.h>",
      "#include <flint/nmod_mat.h>",
      "#include <flint/ulong_extras.h>",
    ].join("\n") : ""}
${foreignHeaders(ir).map((header) => `#include <${header}>`).join("\n")}
${exceptionShimInclude(ir)}
#include "kernel_core.h"

${pieces.join("\n\n")}
`;
  return {
    source,
    header: coreHeader(ir, options),
    audit: auditHostCore(source, {
      nativeDependencies: Array.from(new Set([
        "libc",
        "libm",
        ...(exact.length > 0 ? ["GMP"] : []),
        ...(fields.some((fn) => fn.kernelKind === "real-field")
          ? ["MPFR"] : []),
        ...(fields.some((fn) => fn.kernelKind === "complex-field")
          ? ["MPC"] : []),
        ...(primeSources.length > 0 ? ["FLINT"] : []),
        ...(primeFields.length > 0 ? ["FLINT"] : []),
        ...(exceptionShimInclude(ir) ? ["C++ runtime"] : []),
        ...foreignDependencies(ir),
      ])),
      functions: functions.filter(hostCallable).map((fn) => fn.name),
      kernelKinds: Array.from(new Set(
        functions.filter(hostCallable).map((fn) => fn.kernelKind),
      )),
    }),
  };
}

function generateNodeAdapter(ir) {
  const functions = ir.functions.filter(hostCallable);
  const exact = exactFunctions(ir);
  const exactEntries = exact.filter(hostCallable);
  const usesExactArena = exact.some((fn) =>
    fn.analysis?.liveExactWorkspace?.scopes?.some((scope) =>
      scope.storage === "shared-budget-lexical-exact-arena"
    )
  );
  const floats = functions.filter((fn) => fn.kernelKind === "float64");
  const fields = functions.filter((fn) =>
    ["real-field", "complex-field"].includes(fn.kernelKind)
  );
  const primeSources = functions.filter((fn) =>
    fn.kernelKind === "prime-field-source"
  );
  const primeFields = functions.filter((fn) =>
    fn.kernelKind === "prime-field-matrix"
  );
  const publicResources = Array.from(new Map(exactEntries.flatMap((fn) =>
    [fn.returnType, ...fn.params.map((param) => param.type)].flatMap((type) => {
      const resource = resourceForFunctionType(fn, type);
      return resource === undefined
        ? []
        : [[resource.compiler_type || resource.python_name, resource]];
    })
  )).values());
  let helpers = exact.length > 0
    ? generateExactNodeHelpers()
    : `static int get_uint64(
    napi_env env, napi_value value, uint64_t *result)
{
    napi_valuetype type;
    bool lossless;
    double number;
    if (!sagejs_native_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type == napi_bigint)
    {
        if (!sagejs_native_check_napi(env,
            napi_get_value_bigint_uint64(env, value, result, &lossless)))
            return 0;
        if (!lossless)
        {
            napi_throw_range_error(env, NULL, "uint64 argument is too large");
            return 0;
        }
        return 1;
    }
    if (type != napi_number ||
        !sagejs_native_check_napi(
            env, napi_get_value_double(env, value, &number)))
    {
        napi_throw_type_error(env, NULL, "expected a uint64 argument");
        return 0;
    }
    if (!isfinite(number) || number < 0 ||
        number > 9007199254740991.0 || floor(number) != number)
    {
        napi_throw_range_error(env, NULL, "invalid uint64 argument");
        return 0;
    }
    *result = (uint64_t) number;
    return 1;
}`;
  if (exact.length === 0 && fields.length > 0) {
    helpers += `

static int get_precision(
    napi_env env, napi_value value, mpfr_prec_t *result)
{
    uint64_t precision;
    if (!get_uint64(env, value, &precision))
        return 0;
    if (precision < MPFR_PREC_MIN || precision > MPFR_PREC_MAX)
    {
        napi_throw_range_error(env, NULL, "invalid field precision");
        return 0;
    }
    *result = (mpfr_prec_t) precision;
    return 1;
}`;
  }
  const usesInt64Buffers = exact.some((fn) =>
    fn.params.some((param) => isInt64BufferType(param.type)) ||
    fn.locals.some((local) => isInt64BufferType(local.type))
  );
  const usesUInt64Buffers = exact.some((fn) =>
    fn.params.some((param) => isUInt64BufferType(param.type)) ||
    fn.locals.some((local) => isUInt64BufferType(local.type))
  );
  const usesIntegerBuffers = exact.some((fn) =>
    fn.params.some((param) => isIntegerBufferType(param.type)) ||
    fn.locals.some((local) => isIntegerBufferType(local.type))
  );
  const bufferAdapters = [
    usesInt64Buffers ? generateInt64BufferNodeAdapter() : "",
    usesUInt64Buffers ? generateUInt64BufferNodeAdapter() : "",
    usesIntegerBuffers ? generateIntegerBufferNodeAdapter() : "",
  ].filter(Boolean).join("\n\n");
  const floatBuffers = floats.some((fn) =>
    fn.params.some((param) => param.type === "Float64Buffer") ||
    fn.locals.some((local) =>
      ["Float64Buffer", "Float64Record"].includes(local.type)
    )
  );
  const wrappers = [
    ...exactEntries.map(emitExactWrappers),
    ...floats.map(emitFloat64NodeAdapter),
    ...fields.map(emitFieldNodeAdapter),
    ...primeSources.map(emitPrimeSourceNodeAdapter),
    ...primeFields.map(emitPrimeFieldNodeAdapter),
  ].join("\n\n");
  const properties = [
    ...functions.flatMap((fn) => {
    const ordinary =
      `        {${cString(fn.name)}, NULL, compiled_${fn.name}, ` +
      "NULL, NULL, NULL, napi_default, NULL}";
    return fn.kernelKind === "integer"
      ? [
        ordinary,
        ...(fn.analysis?.backend?.kind === "fmpz" ? [
          `        {${cString(`${fn.name}$tagged`)}, NULL, ` +
            `compiled_${fn.name}_tagged, NULL, NULL, NULL, napi_default, NULL}`,
        ] : []),
        `        {${cString(`${fn.name}$gmp`)}, NULL, ` +
          `compiled_${fn.name}_gmp, NULL, NULL, NULL, napi_default, NULL}`,
      ]
      : [ordinary];
    }),
    ...publicResources.map((resource) =>
      `        {${cString(resource.dynamic.close_export)}, NULL, ` +
        `${resourceCloseName(resource)}, NULL, NULL, NULL, napi_default, NULL}`
    ),
    ...publicResources.flatMap((resource) =>
      resource.host_transfer?.kind === "copied_bytes"
        ? [
          `        {${cString(resource.host_transfer.dynamic.export)}, NULL, ` +
            `${resourceCopyBytesName(resource)}, NULL, NULL, NULL, ` +
            `napi_default, NULL}`,
        ]
        : []
    ),
    ...publicResources.flatMap((resource) =>
      resource.host_ingress?.kind === "copied_bytes"
        ? [
          `        {${cString(resource.host_ingress.dynamic.export)}, NULL, ` +
            `${resourceFromBytesName(resource)}, NULL, NULL, NULL, ` +
            `napi_default, NULL}`,
        ]
        : []
    ),
    ...(publicResources.length === 0 ? [] : [
      `        {"__sagejsFfiResourceExternalMemory", NULL, ` +
        "sagejs_resource_external_memory, NULL, NULL, NULL, " +
        "napi_default, NULL}",
    ]),
  ].join(",\n");
  return `/* Generated by Sage.js Native Kernel v36.
 * Node adapter only; mathematical execution lives in kernel_core.c.
 */
#include <math.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

${publicResources.length === 0 ? "" : `#ifndef NAPI_EXPERIMENTAL
#define NAPI_EXPERIMENTAL
#endif
#ifndef NODE_API_EXPERIMENTAL_NO_WARNING
#define NODE_API_EXPERIMENTAL_NO_WARNING
#endif
`}
#include <node_api.h>
${publicResources.length === 0 ? "" : `#ifndef NODE_API_EXPERIMENTAL_HAS_POST_FINALIZER
#error "generated resource adapters require node_api_post_finalizer"
#endif
`}
${exact.length > 0 ? "#include <gmp.h>" : ""}
${fields.some((fn) => fn.kernelKind === "real-field") ? "#include <mpfr.h>" : ""}
${fields.some((fn) => fn.kernelKind === "complex-field") ? "#include <mpc.h>" : ""}
${primeSources.length + primeFields.length > 0
    ? "#include <flint/nmod_mat.h>" : ""}
#include <sagejs/native.h>

#include "kernel_core.c"

${generateNodeStatusAdapter()}

${helpers}

${bufferAdapters}

${publicResources.map(generateOwnedResourceNodeSupport).join("\n\n")}

${generateResourceMemoryInspection(publicResources)}

${floatBuffers ? generateFloat64BufferNodeAdapter() : ""}

${primeSources.length > 0 ? generatePrimeSourceNodeSupport() : ""}

${primeFields.length > 0 ? generatePrimeFieldNodeSupport() : ""}

${wrappers}

#ifdef SAGEJS_NATIVE_PACK_INITIALIZER
#define SAGEJS_NATIVE_INITIALIZER SAGEJS_NATIVE_PACK_INITIALIZER
#define SAGEJS_NATIVE_INITIALIZER_LINKAGE
#else
#define SAGEJS_NATIVE_INITIALIZER initialize
#define SAGEJS_NATIVE_INITIALIZER_LINKAGE static
#endif

SAGEJS_NATIVE_INITIALIZER_LINKAGE napi_value SAGEJS_NATIVE_INITIALIZER(
    napi_env env, napi_value exports)
{
#if defined(_WIN32)
    /*
     * clang-cl's first call through node-gyp's delay-load thunk can clobber
     * the XMM register carrying napi_create_double's value argument.  Resolve
     * that thunk while the value is intentionally disposable so the first
     * public binary64 result is not corrupted.
     */
    napi_value sagejs_native_double_warmup;
    if (!sagejs_native_check_napi(env,
        napi_create_double(env, 0.0, &sagejs_native_double_warmup)))
        return NULL;
#endif
    napi_property_descriptor properties[] = {
${properties}
    };
${usesExactArena
    ? "    if (!sagejs_native_gmp_allocator_install()) return NULL;"
    : ""}
    if (!sagejs_native_check_napi(env,
        napi_define_properties(env, exports,
            sizeof(properties) / sizeof(properties[0]), properties)))
        return NULL;
    return exports;
}

#ifndef SAGEJS_NATIVE_PACK_INITIALIZER
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
#endif
`;
}

function generateC(ir) {
  return generateNodeAdapter(ir);
}

function generateArtifacts(ir, options = {}) {
  const core = generateHostCore(ir, options);
  return {
    adapterSource: generateNodeAdapter(ir),
    coreSource: core.source,
    coreHeader: core.header,
    hostIsolation: core.audit,
  };
}

module.exports = {
  NATIVE_ABI_VERSION,
  RESOURCE_FINALIZATION_CAPABILITY,
  classifyHostCoreTarget,
  generateArtifacts,
  generateC,
  generateHostCore,
};
