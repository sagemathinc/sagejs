"use strict";

const {
  isTupleType,
  tupleElementTypes,
} = require("./integer-ir.cjs");
const {
  generateTaggedFunctions,
} = require("./tagged-backend.cjs");
const {
  fitsInt64,
  generateWordFunctions,
  int64Constant,
} = require("./word-backend.cjs");
const {
  emitPrimeFieldFunction,
  generatePrimeFieldSupport,
} = require("./prime-field-backend.cjs");
const {
  emitPrimeSourceFunction,
  generatePrimeSourceSupport,
} = require("./prime-source-backend.cjs");
const {
  cOperationComment,
  cSourceDirective,
} = require("./provenance.cjs");

const NATIVE_ABI_VERSION = 13;

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

function exactBufferCType(type) {
  if (isInt64BufferType(type)) return "sagejs_int64_buffer";
  if (isIntegerBufferType(type)) return "sagejs_integer_buffer";
  return undefined;
}

function cString(value) {
  return JSON.stringify(String(value));
}

function cName(name) {
  return `sagejs_${name}`;
}

function nativeValue(local) {
  if (local.type === "Integer") return cName(local.name);
  return local.storage === "return"
    ? `${cName(local.name)}->value`
    : cName(local.name);
}

function emitOperation(operation, locals, indent) {
  if (operation.kind === "integer.constant") {
    return [
      `${indent}if (mpz_set_str(${nativeValue(locals.get(operation.target))}, ` +
        `${cString(operation.value)}, 10) != 0)`,
      `${indent}{`,
      `${indent}    napi_throw_type_error(env, NULL, "invalid native integer literal");`,
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "real.constant") {
    const target = locals.get(operation.target);
    return [
      `${indent}if (mpfr_set_str(${nativeValue(target)}, ` +
        `${cString(operation.value)}, 10, MPFR_RNDN) != 0)`,
      `${indent}{`,
      `${indent}    napi_throw_type_error(env, NULL, "invalid native literal");`,
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
      `${indent}    napi_throw_type_error(env, NULL, "invalid native literal");`,
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
  if (context.storage.borrowedParameters.includes(name)) {
    return `sagejs_arg_${name}`;
  }
  return cName(name);
}

function internalArgument(param) {
  const name = `sagejs_arg_${param.name}`;
  if (param.type === "Integer") return `const mpz_t ${name}`;
  if (param.type === "uint64") return `uint64_t ${name}`;
  if (param.type === "bool") return `int ${name}`;
  if (isInt64BufferType(param.type)) return `sagejs_int64_buffer ${name}`;
  if (isIntegerBufferType(param.type)) return `sagejs_integer_buffer ${name}`;
  throw new Error(`unsupported exact native parameter ${param.type}`);
}

function internalResults(type) {
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
  throw new Error(`unsupported exact native return ${type}`);
}

function internalSignature(fn, prototype = false) {
  const argumentsList = [
    "sagejs_native_status *status",
    ...internalResults(fn.returnType),
    ...fn.params.map(internalArgument),
  ].join(", ");
  return `static int native_${fn.name}(${argumentsList})${prototype ? ";" : ""}`;
}

function emitExactOperation(operation, context, indent) {
  const target = exactValue(operation.target, context);
  if (operation.kind === "integer.constant") {
    return [
      `${indent}if (mpz_set_str(${target}, ${cString(operation.value)}, 10) != 0)`,
      `${indent}{`,
      statusFailure("type", "invalid native integer literal", `${indent}    `),
      `${indent}    goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (operation.kind === "integer.copy") {
    return `${indent}mpz_set(${target}, ` +
      `${exactValue(operation.source, context)});`;
  }
  if (operation.kind === "bool.copy" || operation.kind === "uint64.copy") {
    return `${indent}${target} = ${exactValue(operation.source, context)};`;
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
  if (operation.kind === "integer.from_uint64") {
    return `${indent}set_mpz_uint64(${target}, ` +
      `${exactValue(operation.source, context)});`;
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
    const cases = operation.values.map((value, itemIndex) => [
      `${indent}        case ${itemIndex}:`,
      `${indent}            if (mpz_set_str(${target}, ` +
        `${cString(value)}, 10) != 0) goto fail;`,
      `${indent}            break;`,
    ].join("\n")).join("\n");
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
      exactValue(argument.name, context)
    );
    return [
      `${indent}if (!native_${operation.function}(status, ${outputs.join(", ")}` +
        `${args.length ? `, ${args.join(", ")}` : ""}))`,
      `${indent}    goto fail;`,
    ].join("\n");
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
      const bound = exactValue(statement.count, context);
      const condition = statement.boundIsStop
        ? `${index} < ${bound}`
        : `(${index} - UINT64_C(${statement.start})) < ${bound}`;
      lines.push(
        `${indent}for (${index} = ` +
          `UINT64_C(${statement.start}); ` +
          `${condition}; ` +
          `${index} += ` +
          `UINT64_C(${statement.step || 1}))`,
        `${indent}{`,
        emitExactStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range_exact") {
      const index = exactValue(statement.index, context);
      lines.push(
        `${indent}mpz_set(${index}, ` +
          `${exactValue(statement.start, context)});`,
        `${indent}while (mpz_cmp(${index}, ` +
          `${exactValue(statement.stop, context)}) < 0)`,
        `${indent}{`,
        emitExactStatements(statement.body, context, `${indent}    `),
        `${indent}    mpz_add_ui(${index}, ${index}, 1);`,
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "return") {
      const tuple = tupleElementTypes(statement.type);
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
      } else {
        lines.push(`${indent}*sagejs_native_output = ` +
          `${exactValue(statement.value, context)};`);
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
  for (let slot = 0; slot < storage.scratchSlots; slot += 1) {
    declarations.push(`    mpz_t sagejs_scratch_${slot};`);
    initialization.push(`    mpz_init(sagejs_scratch_${slot});`);
    cleanup.unshift(`    mpz_clear(sagejs_scratch_${slot});`);
  }
  for (const param of fn.params) {
    if (param.type === "Integer") continue;
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
    if (local.type === "Integer" || local.type.startsWith("IntegerSequence[")) {
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
  const context = { storage };
  for (const name of storage.mutableParameters) {
    initialization.push(
      `    mpz_set(${exactValue(name, context)}, sagejs_arg_${name});`,
    );
  }
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

function emitTaggedWrapper(fn) {
  const declarations = ["    sagejs_native_status sagejs_wrapper_status = {0, NULL};"];
  const initialization = [];
  const parsing = [];
  const cleanup = [];
  const requiredCount = fn.params.filter(
    (param) => param.default === undefined,
  ).length;
  for (const [index, param] of fn.params.entries()) {
    const value = wrapperValue(param);
    let parse;
    let defaultValue;
    if (param.type === "Integer") {
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
  const resultArguments = [];
  const resultCreation = [];
  resultTypes.forEach((type, index) => {
    const suffix = tupleResult ? `_${index}` : "";
    const value = `sagejs_wrapper_result${suffix}`;
    if (type === "Integer") {
      declarations.push(`    sagejs_tagged_int ${value};`);
      initialization.push(`    sagejs_tagged_init(&${value});`);
      cleanup.push(`    sagejs_tagged_clear(&${value});`);
      resultArguments.push(`&${value}`);
      resultCreation.push(tupleResult
        ? `    sagejs_wrapper_item = create_tagged_bigint(env, &${value});`
        : `    result = create_tagged_bigint(env, &${value});`);
    } else {
      declarations.push(
        `    ${type === "uint64" ? "uint64_t" : "int"} ${value};`,
      );
      resultArguments.push(`&${value}`);
      const create = type === "bool"
        ? `napi_get_boolean(env, ${value} != 0, ` +
          `${tupleResult ? "&sagejs_wrapper_item" : "&result"})`
        : `napi_create_bigint_uint64(env, ${value}, ` +
          `${tupleResult ? "&sagejs_wrapper_item" : "&result"})`;
      resultCreation.push(
        `    if (!sagejs_native_check_napi(env, ${create}))`,
        "        goto fail;",
      );
    }
    if (tupleResult) {
      resultCreation.push(
        "    if (sagejs_wrapper_item == NULL)",
        "        goto fail;",
        `    if (!sagejs_native_check_napi(env, napi_set_element(env, result, ${index}, sagejs_wrapper_item)))`,
        "        goto fail;",
        "    sagejs_wrapper_item = NULL;",
      );
    }
  });
  if (tupleResult) {
    resultCreation.unshift(
      `    if (!sagejs_native_check_napi(env, napi_create_array_with_length(env, ${resultTypes.length}, &result)))`,
      "        goto fail;",
    );
    declarations.push("    napi_value sagejs_wrapper_item = NULL;");
  }
  const argumentsList = fn.params.map((param) =>
    param.type === "Integer"
      ? `&${wrapperValue(param)}`
      : wrapperValue(param)
  );
  const execution = `    if (!tagged_${fn.name}(&sagejs_wrapper_status, ` +
    `${resultArguments.join(", ")}` +
    `${argumentsList.length ? `, ${argumentsList.join(", ")}` : ""}))\n` +
    "    {\n" +
    "        sagejs_native_throw_status(env, &sagejs_wrapper_status);\n" +
    "        goto fail;\n" +
    "    }";
  return `
static napi_value compiled_${fn.name}(napi_env env, napi_callback_info info)
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
${resultCreation.join("\n")}
${cleanup.join("\n")}
    return result;

fail:
${cleanup.join("\n")}
    return NULL;
}`;
}

function emitExactWrapper(fn) {
  const declarations = ["    sagejs_native_status sagejs_wrapper_status = {0, NULL};"];
  const initialization = [];
  const parsing = [];
  const cleanup = [];
  const requiredCount = fn.params.filter(
    (param) => param.default === undefined,
  ).length;
  for (const [index, param] of fn.params.entries()) {
    const value = wrapperValue(param);
    let parse;
    let defaultValue;
    if (param.type === "Integer") {
      declarations.push(`    mpz_t ${value};`, `    int ${value}_initialized = 0;`);
      initialization.push(`    mpz_init(${value});`, `    ${value}_initialized = 1;`);
      parse = `if (!get_integer(env, args[${index}], ${value}))\n` +
        "            goto fail;";
      defaultValue = `if (mpz_set_str(${value}, ` +
        `${cString(param.default)}, 10) != 0)\n` +
        "            goto fail;";
      cleanup.push(`    if (${value}_initialized)`, `        mpz_clear(${value});`);
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
  const resultArguments = [];
  const resultCreation = [];
  resultTypes.forEach((type, index) => {
    const suffix = tupleResult ? `_${index}` : "";
    const value = `sagejs_wrapper_result${suffix}`;
    if (type === "Integer") {
      declarations.push(`    mpz_t ${value};`, `    int ${value}_initialized = 0;`);
      initialization.push(`    mpz_init(${value});`, `    ${value}_initialized = 1;`);
      cleanup.push(`    if (${value}_initialized)`, `        mpz_clear(${value});`);
      resultArguments.push(value);
      resultCreation.push(tupleResult
        ? `    sagejs_wrapper_item = create_bigint(env, ${value});`
        : `    result = create_bigint(env, ${value});`);
    } else {
      declarations.push(
        `    ${type === "uint64" ? "uint64_t" : "int"} ${value};`,
      );
      resultArguments.push(`&${value}`);
      const create = type === "bool"
        ? `napi_get_boolean(env, ${value} != 0, ` +
          `${tupleResult ? "&sagejs_wrapper_item" : "&result"})`
        : `napi_create_bigint_uint64(env, ${value}, ` +
          `${tupleResult ? "&sagejs_wrapper_item" : "&result"})`;
      resultCreation.push(
        `    if (!sagejs_native_check_napi(env, ${create}))`,
        "        goto fail;",
      );
    }
    if (tupleResult) {
      resultCreation.push(
        "    if (sagejs_wrapper_item == NULL)",
        "        goto fail;",
        `    if (!sagejs_native_check_napi(env, napi_set_element(env, result, ${index}, sagejs_wrapper_item)))`,
        "        goto fail;",
        "    sagejs_wrapper_item = NULL;",
      );
    }
  });
  if (tupleResult) {
    resultCreation.unshift(
      `    if (!sagejs_native_check_napi(env, napi_create_array_with_length(env, ${resultTypes.length}, &result)))`,
      "        goto fail;",
    );
    declarations.push("    napi_value sagejs_wrapper_item = NULL;");
  }
  const argumentsList = fn.params.map(wrapperValue);
  const execution = `    if (!native_${fn.name}(&sagejs_wrapper_status, ${resultArguments.join(", ")}` +
    `${argumentsList.length ? `, ${argumentsList.join(", ")}` : ""}))\n` +
    "    {\n" +
    "        sagejs_native_throw_status(env, &sagejs_wrapper_status);\n" +
    "        goto fail;\n" +
    "    }";
  return `
static napi_value compiled_${fn.name}_gmp(napi_env env, napi_callback_info info)
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
${resultCreation.join("\n")}
${cleanup.join("\n")}
    return result;

fail:
${cleanup.join("\n")}
    return NULL;
}`;
}

function emitExactWrappers(fn) {
  return [emitTaggedWrapper(fn), emitExactWrapper(fn)].join("\n\n");
}

function emitFieldFunction(fn) {
  const real = fn.returnType === "RealNumber";
  const prefix = real ? "real" : "complex";
  const parentType = real ? "RealField" : "ComplexField";
  const nativeType = real ? "sagejs_real" : "sagejs_complex";
  const localType = real ? "mpfr_t" : "mpc_t";
  const parent = fn.params.find((param) => param.type === parentType);
  const iterations = fn.params.find((param) => param.type === "uint64");
  const locals = new Map(fn.locals.map((local) => [local.name, local]));
  const returned = fn.locals.find((local) => local.storage === "return");
  const declarations = [];
  const initialization = [];
  const cleanup = [];
  const loopIndexes = new Set(
    fn.body
      .filter((operation) => operation.kind === "loop.range")
      .map((operation) => operation.index),
  );

  for (const local of fn.locals) {
    if (local.storage === "return") {
      declarations.push(`    ${nativeType} *${cName(local.name)} = NULL;`);
      initialization.push(
        `    ${cName(local.name)} = sagejs_native_new_${prefix}` +
          "(env, precision);",
        `    if (${cName(local.name)} == NULL)`,
        "        goto fail;",
      );
    } else {
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

  return `
static napi_value compiled_${fn.name}(napi_env env, napi_callback_info info)
{
    napi_value args[${fn.params.length}];
    size_t argc = ${fn.params.length};
    mpfr_prec_t precision;
    uint64_t ${cName(iterations.name)};
${Array.from(loopIndexes, (name) => `    uint64_t ${cName(name)};`).join("\n")}
${declarations.join("\n")}
    napi_value wrapped;

    if (!sagejs_native_check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != ${fn.params.length})
    {
        napi_throw_type_error(env, NULL, "wrong native argument count");
        return NULL;
    }
    if (!get_precision(env, args[${fn.params.indexOf(parent)}], &precision) ||
        !get_uint64(env, args[${fn.params.indexOf(iterations)}],
            &${cName(iterations.name)}))
        return NULL;
${initialization.join("\n")}
${statements.join("\n")}
${cleanup.join("\n")}
    wrapped = sagejs_native_wrap_${prefix}(env, ${cName(returned.name)});
    ${cName(returned.name)} = NULL;
    return wrapped;

fail:
${cleanup.join("\n")}
    if (${cName(returned.name)} != NULL)
        sagejs_native_finalize_${prefix}(
            env, ${cName(returned.name)}, NULL);
    return NULL;
}`;
}

function emitFunction(fn) {
  return emitFieldFunction(fn);
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
      `${indent}    napi_throw_range_error(env, NULL, "math domain error");`,
      `${indent}    return NULL;`,
      `${indent}}`,
      `${indent}${target} = sqrt(${source});`,
    ].join("\n");
  }
  if (operation.kind === "uint64.binary") {
    return `${indent}${target} = ${cName(operation.left)} ` +
      `${operation.operation} ${cName(operation.right)};`;
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
      `${indent}    napi_throw_range_error(env, NULL, "Float64Record is outside its buffer");`,
      `${indent}    return NULL;`,
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
      `${indent}    napi_throw_range_error(env, NULL, "Float64 buffer index out of range");`,
      `${indent}    return NULL;`,
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
      `${indent}    napi_throw_range_error(env, NULL, "Float64 buffer index out of range");`,
      `${indent}    return NULL;`,
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
        `${indent}    napi_throw_range_error(env, NULL, ` +
          `"float division by zero");`,
        `${indent}    return NULL;`,
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
    if (statement.kind === "return") {
      lines.push(
        `${indent}if (napi_create_double(env, ${cName(statement.value)}, ` +
          `&sagejs_float64_result) != napi_ok)`,
        `${indent}    return NULL;`,
        `${indent}return sagejs_float64_result;`,
      );
      continue;
    }
    lines.push(emitFloat64Operation(statement, indent));
  }
  return lines.filter(Boolean).join("\n");
}

function emitFloat64Function(fn) {
  const declarations = ["    napi_value sagejs_float64_result;"];
  const parsing = [];
  for (const [index, param] of fn.params.entries()) {
    const name = cName(param.name);
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
  const params = new Set(fn.params.map((param) => param.name));
  for (const local of fn.locals) {
    if (params.has(local.name)) continue;
    const type = local.type === "uint64"
      ? "uint64_t"
      : ["Float64Buffer", "Float64Record"].includes(local.type)
        ? "sagejs_float64_buffer"
        : "double";
    declarations.push(`    ${type} ${cName(local.name)} = {0};`);
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
${emitFloat64Statements(fn.body, "    ")}
    napi_throw_error(env, NULL, "binary64 function completed without returning");
    return NULL;
}`;
}

function generateFloat64BufferSupport() {
  return `
typedef struct
{
    double *data;
    size_t length;
} sagejs_float64_buffer;

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

function generateInt64BufferSupport() {
  return `
typedef struct
{
    int64_t *data;
    size_t length;
} sagejs_int64_buffer;

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
}

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

function generateIntegerBufferSupport() {
  return `
typedef struct
{
    int32_t *sizes;
    uint64_t *limbs;
    size_t length;
    size_t word_capacity;
} sagejs_integer_buffer;

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
    memset(slot, 0, buffer->word_capacity * sizeof(*slot));
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
}

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

function generateCombinedC(ir) {
  const functionMap = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const exactFunctions = ir.functions.filter(
    (fn) => fn.kernelKind === "integer",
  );
  const primeFieldFunctions = ir.functions.filter(
    (fn) => fn.kernelKind === "prime-field-matrix",
  );
  const primeSourceFunctions = ir.functions.filter(
    (fn) => fn.kernelKind === "prime-field-source",
  );
  const float64Functions = ir.functions.filter(
    (fn) => fn.kernelKind === "float64",
  );
  const fieldFunctions = ir.functions.filter(
    (fn) => ![
      "integer",
      "float64",
      "prime-field-matrix",
      "prime-field-source",
    ].includes(fn.kernelKind),
  );
  const prototypes = exactFunctions
    .map((fn) => internalSignature(fn, true))
    .join("\n");
  const tagged = generateTaggedFunctions(exactFunctions);
  const word = generateWordFunctions(exactFunctions);
  const usesInt64Buffers = exactFunctions.some((fn) =>
    fn.params.some((param) => isInt64BufferType(param.type)) ||
    fn.locals.some((local) => isInt64BufferType(local.type))
  );
  const usesIntegerBuffers = exactFunctions.some((fn) =>
    fn.params.some((param) => isIntegerBufferType(param.type)) ||
    fn.locals.some((local) => isIntegerBufferType(local.type))
  );
  const functions = [
    usesInt64Buffers ? generateInt64BufferSupport() : "",
    usesIntegerBuffers ? generateIntegerBufferSupport() : "",
    prototypes,
    word.prototypes,
    tagged.prototypes,
    word.functions,
    tagged.functions,
    primeFieldFunctions.length > 0 ? generatePrimeFieldSupport() : "",
    primeSourceFunctions.length > 0 ? generatePrimeSourceSupport() : "",
    float64Functions.some((fn) =>
      fn.params.some((param) => param.type === "Float64Buffer") ||
      fn.locals.some((local) =>
        ["Float64Buffer", "Float64Record"].includes(local.type)
      )
    ) ? generateFloat64BufferSupport() : "",
    ...exactFunctions.map((fn) => emitExactInternalFunction(fn, functionMap)),
    ...exactFunctions.map(emitExactWrappers),
    ...float64Functions.map(emitFloat64Function),
    ...primeFieldFunctions.map(emitPrimeFieldFunction),
    ...primeSourceFunctions.map(emitPrimeSourceFunction),
    ...fieldFunctions.map(emitFunction),
  ].filter(Boolean).join("\n\n");
  const properties = ir.functions
    .flatMap((fn) => {
      const ordinary =
        `        {${cString(fn.name)}, NULL, compiled_${fn.name}, ` +
        "NULL, NULL, NULL, napi_default, NULL}";
      return fn.kernelKind === "integer"
        ? [
          ordinary,
          `        {${cString(`${fn.name}$gmp`)}, NULL, ` +
            `compiled_${fn.name}_gmp, NULL, NULL, NULL, napi_default, NULL}`,
        ]
        : [ordinary];
    })
    .join(",\n");
  if (
    primeFieldFunctions.length + primeSourceFunctions.length > 0 &&
    primeFieldFunctions.length + primeSourceFunctions.length === ir.functions.length
  ) {
    return `// Generated by Sage.js source-transparent Native Kernel experiment.
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>
#include <sagejs/native.h>

/* SAGEJS_GENERATED_FUNCTIONS_BEGIN */
${functions}
/* SAGEJS_GENERATED_FUNCTIONS_END */

static napi_value initialize(napi_env env, napi_value exports)
{
    napi_property_descriptor properties[] = {
${properties}
    };
    if (!sagejs_native_check_napi(env,
        napi_define_properties(env, exports,
            sizeof(properties) / sizeof(properties[0]), properties)))
        return NULL;
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
`;
  }
  return `// Generated by Sage.js Native Kernel v16.
#include <math.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>
#include <gmp.h>
#include <sagejs/native.h>

typedef enum
{
    SAGEJS_NATIVE_OK = 0,
    SAGEJS_NATIVE_ERROR = 1,
    SAGEJS_NATIVE_TYPE_ERROR = 2,
    SAGEJS_NATIVE_RANGE_ERROR = 3
} sagejs_native_status_code;

typedef struct
{
    sagejs_native_status_code code;
    const char *message;
} sagejs_native_status;

static void sagejs_native_status_set(
    sagejs_native_status *status,
    sagejs_native_status_code code,
    const char *message)
{
    if (status != NULL && status->code == SAGEJS_NATIVE_OK)
    {
        status->code = code;
        status->message = message;
    }
}

static void sagejs_native_status_reset(sagejs_native_status *status)
{
    if (status != NULL)
    {
        status->code = SAGEJS_NATIVE_OK;
        status->message = NULL;
    }
}

static void sagejs_native_throw_status(
    napi_env env, const sagejs_native_status *status)
{
    const char *message = status != NULL && status->message != NULL
        ? status->message : "native kernel failed";
    if (status != NULL && status->code == SAGEJS_NATIVE_TYPE_ERROR)
        napi_throw_type_error(env, NULL, message);
    else if (status != NULL && status->code == SAGEJS_NATIVE_RANGE_ERROR)
        napi_throw_range_error(env, NULL, message);
    else
        napi_throw_error(env, NULL, message);
}

static void set_mpz_uint64(mpz_t target, uint64_t value)
{
#if ULONG_MAX >= UINT64_MAX
    mpz_set_ui(target, (unsigned long) value);
#else
    mpz_import(target, 1, -1, sizeof(value), 0, 0, &value);
#endif
}

static void set_mpz_int64(mpz_t target, int64_t value)
{
    const int negative = value < 0;
    const uint64_t magnitude = negative
        ? (uint64_t) (-(value + 1)) + UINT64_C(1)
        : (uint64_t) value;
    set_mpz_uint64(target, magnitude);
    if (negative)
        mpz_neg(target, target);
}

static int mpz_to_int64(const mpz_t value, int64_t *result)
{
    const int sign = mpz_sgn(value);
    size_t count = 0;
    uint64_t magnitude = 0;
    if (sign == 0)
    {
        *result = 0;
        return 1;
    }
    mpz_export(&magnitude, &count, -1, sizeof(magnitude), 0, 0, value);
    if (count > 1)
        return 0;
    if (sign > 0)
    {
        if (magnitude > (uint64_t) INT64_MAX)
            return 0;
        *result = (int64_t) magnitude;
        return 1;
    }
    if (magnitude > (UINT64_C(1) << 63))
        return 0;
    if (magnitude == (UINT64_C(1) << 63))
        *result = INT64_MIN;
    else
        *result = -(int64_t) magnitude;
    return 1;
}

#define SAGEJS_WORD_PROMOTE 0
#define SAGEJS_WORD_OK 1
#define SAGEJS_WORD_ERROR -1

#if defined(_MSC_VER)
#define SAGEJS_WORD_INLINE static __forceinline
#elif defined(__GNUC__) || defined(__clang__)
#define SAGEJS_WORD_INLINE static inline __attribute__((always_inline))
#else
#define SAGEJS_WORD_INLINE static inline
#endif

static int sagejs_word_add_int64(int64_t left, int64_t right, int64_t *result)
{
#if defined(__GNUC__) || defined(__clang__)
    int64_t temporary;
    if (__builtin_add_overflow(left, right, &temporary))
        return 0;
    *result = temporary;
    return 1;
#else
    if ((right > 0 && left > INT64_MAX - right) ||
        (right < 0 && left < INT64_MIN - right))
        return 0;
    *result = left + right;
    return 1;
#endif
}

static int sagejs_word_sub_int64(int64_t left, int64_t right, int64_t *result)
{
#if defined(__GNUC__) || defined(__clang__)
    int64_t temporary;
    if (__builtin_sub_overflow(left, right, &temporary))
        return 0;
    *result = temporary;
    return 1;
#else
    if ((right > 0 && left < INT64_MIN + right) ||
        (right < 0 && left > INT64_MAX + right))
        return 0;
    *result = left - right;
    return 1;
#endif
}

static int sagejs_word_mul_int64(int64_t left, int64_t right, int64_t *result)
{
#if defined(__GNUC__) || defined(__clang__)
    int64_t temporary;
    if (__builtin_mul_overflow(left, right, &temporary))
        return 0;
    *result = temporary;
    return 1;
#else
    if (left == 0 || right == 0)
    {
        *result = 0;
        return 1;
    }
    if ((left == -1 && right == INT64_MIN) ||
        (right == -1 && left == INT64_MIN))
        return 0;
    if ((left > 0 && right > 0 && left > INT64_MAX / right) ||
        (left > 0 && right < 0 && right < INT64_MIN / left) ||
        (left < 0 && right > 0 && left < INT64_MIN / right) ||
        (left < 0 && right < 0 && left < INT64_MAX / right))
        return 0;
    *result = left * right;
    return 1;
#endif
}

static int sagejs_word_pow_int64(
    int64_t base, uint64_t exponent, int64_t *result)
{
    int64_t answer = 1;
    while (exponent != 0)
    {
        if ((exponent & UINT64_C(1)) != 0 &&
            !sagejs_word_mul_int64(answer, base, &answer))
            return 0;
        exponent >>= 1;
        if (exponent != 0 &&
            !sagejs_word_mul_int64(base, base, &base))
            return 0;
    }
    *result = answer;
    return 1;
}

static void sagejs_word_fdiv_int64(
    int64_t left, int64_t right, int64_t *quotient, int64_t *remainder)
{
    int64_t q = left / right;
    int64_t r = left % right;
    if (r != 0 && ((r < 0) != (right < 0)))
    {
        q -= 1;
        r += right;
    }
    if (quotient != NULL)
        *quotient = q;
    if (remainder != NULL)
        *remainder = r;
}

typedef struct
{
    int is_big;
    int big_initialized;
    int64_t small;
    mpz_t big;
} sagejs_tagged_int;

static void sagejs_tagged_init(sagejs_tagged_int *value)
{
    value->is_big = 0;
    value->big_initialized = 0;
    value->small = 0;
}

static void sagejs_tagged_clear(sagejs_tagged_int *value)
{
    if (value->big_initialized)
        mpz_clear(value->big);
    value->is_big = 0;
    value->big_initialized = 0;
    value->small = 0;
}

static void sagejs_tagged_set_small(
    sagejs_tagged_int *value, int64_t small)
{
    value->small = small;
    value->is_big = 0;
}

static void sagejs_tagged_make_big(sagejs_tagged_int *value)
{
    if (!value->big_initialized)
    {
        mpz_init(value->big);
        value->big_initialized = 1;
    }
    if (!value->is_big)
        set_mpz_int64(value->big, value->small);
    value->is_big = 1;
}

static void sagejs_tagged_copy(
    sagejs_tagged_int *target, sagejs_tagged_int *source)
{
    if (target == source)
        return;
    if (!source->is_big)
    {
        sagejs_tagged_set_small(target, source->small);
        return;
    }
    sagejs_tagged_make_big(target);
    mpz_set(target->big, source->big);
}

static int sagejs_tagged_set_decimal(
    sagejs_tagged_int *target, const char *value)
{
    sagejs_tagged_make_big(target);
    return mpz_set_str(target->big, value, 10) == 0;
}

static void sagejs_tagged_set_uint64(
    sagejs_tagged_int *target, uint64_t value)
{
    if (value <= (uint64_t) INT64_MAX)
    {
        sagejs_tagged_set_small(target, (int64_t) value);
        return;
    }
    sagejs_tagged_make_big(target);
    set_mpz_uint64(target->big, value);
}

static void sagejs_tagged_set_double(
    sagejs_tagged_int *target, double value)
{
    if (value >= -9223372036854775808.0 &&
        value < 9223372036854775808.0)
    {
        sagejs_tagged_set_small(target, (int64_t) value);
        return;
    }
    sagejs_tagged_make_big(target);
    mpz_set_d(target->big, value);
}

static int sagejs_tagged_to_int64(
    sagejs_tagged_int *value, int64_t *result)
{
    if (!value->is_big)
    {
        *result = value->small;
        return 1;
    }
    return mpz_to_int64(value->big, result);
}

static int sagejs_tagged_sgn(sagejs_tagged_int *value)
{
    if (value->is_big)
        return mpz_sgn(value->big);
    return (value->small > 0) - (value->small < 0);
}

static double sagejs_tagged_get_double(sagejs_tagged_int *value)
{
    return value->is_big ? mpz_get_d(value->big) : (double) value->small;
}

static void sagejs_tagged_add(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t result;
    if (!left->is_big && !right->is_big &&
        sagejs_word_add_int64(left->small, right->small, &result))
    {
        sagejs_tagged_set_small(target, result);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_add(target->big, left->big, right->big);
}

static void sagejs_tagged_sub(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t result;
    if (!left->is_big && !right->is_big &&
        sagejs_word_sub_int64(left->small, right->small, &result))
    {
        sagejs_tagged_set_small(target, result);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_sub(target->big, left->big, right->big);
}

static void sagejs_tagged_mul(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t result;
    if (!left->is_big && !right->is_big &&
        sagejs_word_mul_int64(left->small, right->small, &result))
    {
        sagejs_tagged_set_small(target, result);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_mul(target->big, left->big, right->big);
}

static void sagejs_tagged_neg(
    sagejs_tagged_int *target, sagejs_tagged_int *source)
{
    if (!source->is_big && source->small != INT64_MIN)
    {
        sagejs_tagged_set_small(target, -source->small);
        return;
    }
    sagejs_tagged_make_big(source);
    sagejs_tagged_make_big(target);
    mpz_neg(target->big, source->big);
}

static void sagejs_tagged_abs(
    sagejs_tagged_int *target, sagejs_tagged_int *source)
{
    if (!source->is_big && source->small != INT64_MIN)
    {
        sagejs_tagged_set_small(
            target, source->small < 0 ? -source->small : source->small);
        return;
    }
    sagejs_tagged_make_big(source);
    sagejs_tagged_make_big(target);
    mpz_abs(target->big, source->big);
}

static void sagejs_tagged_pow_ui(
    sagejs_tagged_int *target,
    sagejs_tagged_int *base,
    uint64_t exponent)
{
    int64_t result;
    if (!base->is_big &&
        sagejs_word_pow_int64(base->small, exponent, &result))
    {
        sagejs_tagged_set_small(target, result);
        return;
    }
    sagejs_tagged_make_big(base);
    sagejs_tagged_make_big(target);
    mpz_pow_ui(target->big, base->big, (unsigned long) exponent);
}

static int sagejs_tagged_cmp(
    sagejs_tagged_int *left, sagejs_tagged_int *right)
{
    if (!left->is_big && !right->is_big)
        return (left->small > right->small) - (left->small < right->small);
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    return mpz_cmp(left->big, right->big);
}

static void sagejs_tagged_floordiv(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t quotient;
    if (!left->is_big && !right->is_big &&
        !(left->small == INT64_MIN && right->small == -1))
    {
        sagejs_word_fdiv_int64(left->small, right->small, &quotient, NULL);
        sagejs_tagged_set_small(target, quotient);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_fdiv_q(target->big, left->big, right->big);
}

static void sagejs_tagged_mod(
    sagejs_tagged_int *target,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t remainder;
    if (!left->is_big && !right->is_big &&
        !(left->small == INT64_MIN && right->small == -1))
    {
        sagejs_word_fdiv_int64(left->small, right->small, NULL, &remainder);
        sagejs_tagged_set_small(target, remainder);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(target);
    mpz_fdiv_r(target->big, left->big, right->big);
}

static void sagejs_tagged_divmod(
    sagejs_tagged_int *quotient,
    sagejs_tagged_int *remainder,
    sagejs_tagged_int *left,
    sagejs_tagged_int *right)
{
    int64_t q;
    int64_t r;
    if (!left->is_big && !right->is_big &&
        !(left->small == INT64_MIN && right->small == -1))
    {
        sagejs_word_fdiv_int64(left->small, right->small, &q, &r);
        sagejs_tagged_set_small(quotient, q);
        sagejs_tagged_set_small(remainder, r);
        return;
    }
    sagejs_tagged_make_big(left);
    sagejs_tagged_make_big(right);
    sagejs_tagged_make_big(quotient);
    sagejs_tagged_make_big(remainder);
    mpz_fdiv_qr(quotient->big, remainder->big, left->big, right->big);
}

static void sagejs_tagged_add_one(sagejs_tagged_int *value)
{
    if (!value->is_big && value->small != INT64_MAX)
    {
        value->small += 1;
        return;
    }
    sagejs_tagged_make_big(value);
    mpz_add_ui(value->big, value->big, 1);
}

static napi_value create_bigint(napi_env env, const mpz_t value)
{
    const int sign = mpz_sgn(value) < 0;
    const size_t capacity =
        (mpz_sizeinbase(value, 2) + (sizeof(uint64_t) * 8 - 1)) /
        (sizeof(uint64_t) * 8);
    size_t count = 0;
    uint64_t inline_words[4];
    uint64_t *words = inline_words;
    napi_value result;

    if (capacity != 0)
    {
        if (capacity > sizeof(inline_words) / sizeof(inline_words[0]))
            words = (uint64_t *) malloc(capacity * sizeof(*words));
        if (words == NULL)
        {
            napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
            return NULL;
        }
        mpz_export(words, &count, -1, sizeof(*words), 0, 0, value);
    }
    if (!sagejs_native_check_napi(env,
        napi_create_bigint_words(env, sign, count, words, &result)))
    {
        if (words != inline_words)
            free(words);
        return NULL;
    }
    if (words != inline_words)
        free(words);
    return result;
}

static napi_value create_tagged_bigint(
    napi_env env, sagejs_tagged_int *value)
{
    napi_value result;
    if (value->is_big)
        return create_bigint(env, value->big);
    if (!sagejs_native_check_napi(
        env, napi_create_bigint_int64(env, value->small, &result)))
        return NULL;
    return result;
}

static int get_precision(
    napi_env env, napi_value value, mpfr_prec_t *precision)
{
    int64_t result;
    if (!sagejs_native_check_napi(
        env, napi_get_value_int64(env, value, &result)))
        return 0;
    if (result < MPFR_PREC_MIN || (uint64_t) result > MPFR_PREC_MAX)
    {
        napi_throw_range_error(env, NULL, "invalid field precision");
        return 0;
    }
    *precision = (mpfr_prec_t) result;
    return 1;
}

static int get_uint64(
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
}

static int get_bool(napi_env env, napi_value value, int *result)
{
    napi_valuetype type;
    bool boolean;
    if (!sagejs_native_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_boolean ||
        !sagejs_native_check_napi(
            env, napi_get_value_bool(env, value, &boolean)))
    {
        napi_throw_type_error(env, NULL, "expected a bool argument");
        return 0;
    }
    *result = boolean ? 1 : 0;
    return 1;
}

static int get_integer(napi_env env, napi_value value, mpz_t result)
{
    napi_valuetype type;
    if (!sagejs_native_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type == napi_bigint)
    {
        int64_t small;
        bool lossless;
        if (!sagejs_native_check_napi(env,
            napi_get_value_bigint_int64(env, value, &small, &lossless)))
            return 0;
        if (lossless)
        {
            const int negative = small < 0;
            const uint64_t magnitude = negative
                ? (uint64_t) (-(small + 1)) + UINT64_C(1)
                : (uint64_t) small;
            set_mpz_uint64(result, magnitude);
            if (negative)
                mpz_neg(result, result);
            return 1;
        }
        else
        {
            int sign = 0;
            size_t count = 0;
            uint64_t inline_words[4];
            uint64_t *words = inline_words;
            if (!sagejs_native_check_napi(
                env, napi_get_value_bigint_words(
                    env, value, NULL, &count, NULL)))
                return 0;
            if (count != 0)
            {
                size_t actual = count;
                if (count > sizeof(inline_words) / sizeof(inline_words[0]))
                    words = (uint64_t *) malloc(count * sizeof(*words));
                if (words == NULL)
                {
                    napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
                    return 0;
                }
                if (!sagejs_native_check_napi(env,
                    napi_get_value_bigint_words(
                        env, value, &sign, &actual, words)))
                {
                    if (words != inline_words)
                        free(words);
                    return 0;
                }
                mpz_import(result, actual, -1, sizeof(*words), 0, 0, words);
                if (words != inline_words)
                    free(words);
                if (sign)
                    mpz_neg(result, result);
            }
            return 1;
        }
    }
    if (type == napi_number)
    {
        double number;
        if (!sagejs_native_check_napi(
            env, napi_get_value_double(env, value, &number)))
            return 0;
        if (!isfinite(number) || floor(number) != number ||
            number < -9007199254740991.0 ||
            number > 9007199254740991.0)
        {
            napi_throw_range_error(env, NULL, "invalid exact integer argument");
            return 0;
        }
        mpz_set_d(result, number);
        return 1;
    }
    napi_throw_type_error(env, NULL, "expected an exact integer argument");
    return 0;
}

static int get_tagged_integer(
    napi_env env, napi_value value, sagejs_tagged_int *result)
{
    napi_valuetype type;
    if (!sagejs_native_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type == napi_bigint)
    {
        int64_t small;
        bool lossless;
        if (!sagejs_native_check_napi(env,
            napi_get_value_bigint_int64(env, value, &small, &lossless)))
            return 0;
        if (lossless)
        {
            sagejs_tagged_set_small(result, small);
            return 1;
        }
        else
        {
            int sign = 0;
            size_t count = 0;
            uint64_t inline_words[4];
            uint64_t *words = inline_words;
            if (!sagejs_native_check_napi(
                env, napi_get_value_bigint_words(
                    env, value, NULL, &count, NULL)))
                return 0;
            if (count == 0)
            {
                sagejs_tagged_set_small(result, 0);
                return 1;
            }
            else
            {
                size_t actual = count;
                if (count > sizeof(inline_words) / sizeof(inline_words[0]))
                    words = (uint64_t *) malloc(count * sizeof(*words));
                if (words == NULL)
                {
                    napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
                    return 0;
                }
                if (!sagejs_native_check_napi(env,
                    napi_get_value_bigint_words(
                        env, value, &sign, &actual, words)))
                {
                    if (words != inline_words)
                        free(words);
                    return 0;
                }
                sagejs_tagged_make_big(result);
                mpz_import(
                    result->big, actual, -1, sizeof(*words), 0, 0, words);
                if (words != inline_words)
                    free(words);
                if (sign)
                    mpz_neg(result->big, result->big);
                return 1;
            }
        }
    }
    if (type == napi_number)
    {
        double number;
        if (!sagejs_native_check_napi(
            env, napi_get_value_double(env, value, &number)))
            return 0;
        if (!isfinite(number) || floor(number) != number ||
            number < -9007199254740991.0 ||
            number > 9007199254740991.0)
        {
            napi_throw_range_error(env, NULL, "invalid exact integer argument");
            return 0;
        }
        sagejs_tagged_set_small(result, (int64_t) number);
        return 1;
    }
    napi_throw_type_error(env, NULL, "expected an exact integer argument");
    return 0;
}
/* SAGEJS_GENERATED_FUNCTIONS_BEGIN */
${functions}
/* SAGEJS_GENERATED_FUNCTIONS_END */

static napi_value initialize(napi_env env, napi_value exports)
{
    napi_property_descriptor properties[] = {
${properties}
    };
    if (!sagejs_native_check_napi(env,
        napi_define_properties(env, exports,
            sizeof(properties) / sizeof(properties[0]), properties)))
        return NULL;
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
`;
}

function exactFunctions(ir) {
  return ir.functions.filter((fn) => fn.kernelKind === "integer");
}

function exactOnly(ir) {
  return ir.functions.length > 0 &&
    ir.functions.every((fn) => fn.kernelKind === "integer");
}

function beforeMarker(source, marker) {
  const position = source.indexOf(marker);
  if (position < 0) throw new Error(`generated C marker is missing: ${marker}`);
  return source.slice(0, position).trim();
}

function fromMarker(source, marker) {
  const position = source.indexOf(marker);
  if (position < 0) throw new Error(`generated C marker is missing: ${marker}`);
  return source.slice(position).trim();
}

function publicCoreSignature(fn, prototype = false) {
  const parameters = [
    "sagejs_native_status *status",
    ...internalResults(fn.returnType),
    ...fn.params.map(internalArgument),
  ].join(", ");
  return `int sagejs_kernel_${fn.name}(${parameters})${prototype ? ";" : ""}`;
}

function publicCoreFunction(fn) {
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

function coreHeader(ir) {
  const functions = exactFunctions(ir);
  const usesInt64Buffers = functions.some((fn) =>
    fn.params.some((param) => isInt64BufferType(param.type)) ||
    fn.locals.some((local) => isInt64BufferType(local.type))
  );
  const usesIntegerBuffers = functions.some((fn) =>
    fn.params.some((param) => isIntegerBufferType(param.type)) ||
    fn.locals.some((local) => isIntegerBufferType(local.type))
  );
  return `/* Generated by Sage.js Native Kernel v16. */
#ifndef SAGEJS_GENERATED_KERNEL_CORE_H
#define SAGEJS_GENERATED_KERNEL_CORE_H

#include <stddef.h>
#include <stdint.h>
#include <gmp.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum
{
    SAGEJS_NATIVE_OK = 0,
    SAGEJS_NATIVE_ERROR = 1,
    SAGEJS_NATIVE_TYPE_ERROR = 2,
    SAGEJS_NATIVE_RANGE_ERROR = 3
} sagejs_native_status_code;

typedef struct
{
    sagejs_native_status_code code;
    const char *message;
} sagejs_native_status;
${usesInt64Buffers ? `
typedef struct
{
    int64_t *data;
    size_t length;
} sagejs_int64_buffer;
` : ""}${usesIntegerBuffers ? `
typedef struct
{
    int32_t *sizes;
    uint64_t *limbs;
    size_t length;
    size_t word_capacity;
} sagejs_integer_buffer;
` : ""}
/* Integer outputs are initialized mpz_t values owned by the caller. */
${functions.map((fn) => publicCoreSignature(fn, true)).join("\n")}

#ifdef __cplusplus
}
#endif

#endif
`;
}

function generateHostCore(ir) {
  if (!exactOnly(ir)) {
    const kinds = Array.from(new Set(ir.functions.map((fn) => fn.kernelKind)));
    throw new Error(
      "host-isolated core emission currently requires exact-integer kernels; " +
      `found ${kinds.join(", ")}`,
    );
  }
  const functions = exactFunctions(ir);
  const functionMap = new Map(functions.map((fn) => [fn.name, fn]));
  const combined = generateCombinedC(ir);
  const runtimeStart = combined.indexOf("static void sagejs_native_status_set");
  const runtimeEnd = combined.indexOf("static napi_value create_bigint");
  if (runtimeStart < 0 || runtimeEnd < 0 || runtimeEnd <= runtimeStart) {
    throw new Error("unable to locate the generated host-core runtime");
  }
  const runtime = combined.slice(runtimeStart, runtimeEnd)
    .replace(
      /static void sagejs_native_throw_status\([\s\S]*?\n\}\n\n/,
      "",
    )
    .trim();
  const tagged = generateTaggedFunctions(functions);
  const word = generateWordFunctions(functions);
  const usesInt64Buffers = functions.some((fn) =>
    fn.params.some((param) => isInt64BufferType(param.type)) ||
    fn.locals.some((local) => isInt64BufferType(local.type))
  );
  const usesIntegerBuffers = functions.some((fn) =>
    fn.params.some((param) => isIntegerBufferType(param.type)) ||
    fn.locals.some((local) => isIntegerBufferType(local.type))
  );
  const pieces = [
    runtime,
    usesInt64Buffers
      ? beforeMarker(
          fromMarker(
            generateInt64BufferSupport(),
            "static int sagejs_int64_buffer_index",
          ),
          "static int sagejs_native_get_int64_buffer",
        )
      : "",
    usesIntegerBuffers
      ? beforeMarker(
          fromMarker(
            generateIntegerBufferSupport(),
            "static int sagejs_integer_buffer_index",
          ),
          "static int sagejs_native_get_integer_buffer",
        )
      : "",
    functions.map((fn) => internalSignature(fn, true)).join("\n"),
    word.prototypes,
    tagged.prototypes,
    word.functions,
    tagged.functions,
    ...functions.map((fn) => emitExactInternalFunction(fn, functionMap)),
    ...functions.map(publicCoreFunction),
  ].filter(Boolean);
  const source = `/* Generated by Sage.js Native Kernel v16.
 * Host-isolated mathematical core: no Node, JavaScript, or Python runtime.
 */
#include <math.h>
#include <limits.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <gmp.h>
#include "kernel_core.h"

${pieces.join("\n\n")}
`;
  const forbidden = [
    ["Node-API", /\bnapi_/],
    ["Node header", /node_api/],
    ["CPython API", /\b(?:PyObject|Py_|_Py)/],
    ["JavaScript engine API", /\b(?:JSValue|v8::)/],
  ];
  const violations = forbidden
    .filter(([_name, pattern]) => pattern.test(source))
    .map(([name]) => name);
  if (violations.length > 0) {
    throw new Error(
      `host-isolation audit failed: ${violations.join(", ")}`,
    );
  }
  return {
    source,
    header: coreHeader(ir),
    audit: {
      isolated: true,
      boundary: "packed-c-abi",
      hostCallbacks: 0,
      forbiddenApis: forbidden.map(([name]) => name),
      nativeDependencies: ["libc", "libm", "GMP"],
      functions: functions.map((fn) => fn.name),
    },
  };
}

function generateExactNodeAdapter(ir) {
  const functions = exactFunctions(ir);
  const combined = generateCombinedC(ir);
  const helpersStart = combined.indexOf("static napi_value create_bigint");
  const helpersEnd = combined.indexOf("/* SAGEJS_GENERATED_FUNCTIONS_BEGIN */");
  if (helpersStart < 0 || helpersEnd < 0 || helpersEnd <= helpersStart) {
    throw new Error("unable to locate the generated Node adapter runtime");
  }
  const helpers = combined.slice(helpersStart, helpersEnd).trim();
  const usesInt64Buffers = functions.some((fn) =>
    fn.params.some((param) => isInt64BufferType(param.type)) ||
    fn.locals.some((local) => isInt64BufferType(local.type))
  );
  const usesIntegerBuffers = functions.some((fn) =>
    fn.params.some((param) => isIntegerBufferType(param.type)) ||
    fn.locals.some((local) => isIntegerBufferType(local.type))
  );
  const bufferAdapters = [
    usesInt64Buffers
      ? fromMarker(
          generateInt64BufferSupport(),
          "static int sagejs_native_get_int64_buffer",
        )
      : "",
    usesIntegerBuffers
      ? fromMarker(
          generateIntegerBufferSupport(),
          "static int sagejs_native_get_integer_buffer",
        )
      : "",
  ].filter(Boolean).join("\n\n");
  const wrappers = functions.map(emitExactWrappers).join("\n\n");
  const properties = functions.flatMap((fn) => [
    `        {${cString(fn.name)}, NULL, compiled_${fn.name}, ` +
      "NULL, NULL, NULL, napi_default, NULL}",
    `        {${cString(`${fn.name}$gmp`)}, NULL, ` +
      `compiled_${fn.name}_gmp, NULL, NULL, NULL, napi_default, NULL}`,
  ]).join(",\n");
  return `/* Generated by Sage.js Native Kernel v16.
 * Node adapter only; mathematical execution lives in kernel_core.c.
 */
#include <math.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>
#include <gmp.h>
#include <sagejs/native.h>

#include "kernel_core.c"

static void sagejs_native_throw_status(
    napi_env env, const sagejs_native_status *status)
{
    const char *message = status != NULL && status->message != NULL
        ? status->message : "native kernel failed";
    if (status != NULL && status->code == SAGEJS_NATIVE_TYPE_ERROR)
        napi_throw_type_error(env, NULL, message);
    else if (status != NULL && status->code == SAGEJS_NATIVE_RANGE_ERROR)
        napi_throw_range_error(env, NULL, message);
    else
        napi_throw_error(env, NULL, message);
}

${helpers}

${bufferAdapters}

${wrappers}

static napi_value initialize(napi_env env, napi_value exports)
{
    napi_property_descriptor properties[] = {
${properties}
    };
    if (!sagejs_native_check_napi(env,
        napi_define_properties(env, exports,
            sizeof(properties) / sizeof(properties[0]), properties)))
        return NULL;
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
`;
}

function generateC(ir) {
  return exactOnly(ir) ? generateExactNodeAdapter(ir) : generateCombinedC(ir);
}

module.exports = {
  NATIVE_ABI_VERSION,
  generateC,
  generateHostCore,
};
