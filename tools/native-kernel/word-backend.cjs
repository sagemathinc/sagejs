"use strict";

const {
  cOperationComment,
  cSourceDirective,
} = require("./provenance.cjs");

const { tupleElementTypes } = require("./integer-ir.cjs");
const { emitWordForeignCall } = require("./ffi-codegen.cjs");
const { isForeignResourceType } = require("./ffi-codegen.cjs");
const {
  isUint64Shift,
  uint64COperator,
} = require("./uint64-operations.cjs");

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

function wordName(name) {
  return `sagejs_word_${name}`;
}

function wordType(type) {
  if (type === "Integer") return "int64_t";
  if (type === "uint64") return "uint64_t";
  if (type === "bool") return "int";
  if (type === "Int64Buffer" || type === "Int64Record") {
    return "sagejs_int64_buffer";
  }
  if (type === "UInt64Buffer") return "sagejs_uint64_buffer";
  if (type === "IntegerBuffer") return "sagejs_integer_buffer";
  throw new Error(`unsupported machine-word type ${type}`);
}

function wordResults(type) {
  const tuple = tupleElementTypes(type) || [type];
  return tuple.map((element, index) =>
    `${wordType(element)} *sagejs_word_output_${index}`
  );
}

function wordSignature(fn, prototype = false) {
  const parameters = [
    "sagejs_native_status *status",
    ...wordResults(fn.returnType),
    ...fn.params.map((param) =>
      `${wordType(param.type)} ${wordName(param.name)}`
    ),
  ].join(", ");
  const prefix = fn.analysis?.execution?.recursive
    ? "static"
    : "SAGEJS_WORD_INLINE";
  return `${prefix} int word_${fn.name}(${parameters})${prototype ? ";" : ""}`;
}

function walks(statements, visit) {
  for (const statement of statements) {
    if (statement.kind === "if") {
      walks(statement.condition.operations, visit);
      walks(statement.body, visit);
      walks(statement.alternative, visit);
    } else if (statement.kind === "while") {
      walks(statement.condition.operations, visit);
      walks(statement.body, visit);
    } else if (
      statement.kind === "loop.range" ||
      statement.kind === "loop.range_exact"
    ) {
      walks(statement.body, visit);
    } else if (statement.kind === "bool.short_circuit") {
      visit(statement);
      walks(statement.right.operations, visit);
    } else {
      visit(statement);
    }
  }
}

function mayPromote(operation) {
  if (operation.kind === "integer.constant") {
    return !fitsInt64(operation.value);
  }
  if (operation.kind === "integer.sequence.get") {
    return operation.values.some((value) => !fitsInt64(value));
  }
  if (operation.kind === "integer.buffer.get") return true;
  return [
    "integer.from_uint64",
    "integer.neg",
    "integer.abs",
    "integer.pow_uint",
    "integer.divmod",
    "integer.binary",
    "native.call",
    "ffi.call",
  ].includes(operation.kind);
}

function promotionSites(fn) {
  const sites = new Map();
  let next = 1;
  walks(fn.body, (operation) => {
    if (mayPromote(operation)) sites.set(operation, next++);
  });
  return sites;
}

/*
 * A direct helper call is not intrinsically a reason to abandon the machine
 * word core.  In particular, fixed-width helpers which only manipulate
 * uint64 values and borrowed buffers cannot request promotion at all.  This
 * small call-graph fixed point records that fact transitively, including for
 * mutually recursive helper groups.  Unknown callees remain conservative.
 *
 * This proof is distinct from replay safety: a buffer-mutating helper which
 * cannot promote is safe to call directly even though replaying it would not
 * be safe.  A mutating helper which *can* promote must still be rejected before
 * the call so that the exact backend never observes partially applied writes.
 */
function wordPromotionCapabilities(functions) {
  const byName = new Map(functions.map((fn) => [fn.name, fn]));
  const mayPromoteByName = new Map(functions.map((fn) => [fn.name, false]));
  let changed;
  do {
    changed = false;
    for (const fn of functions) {
      if (mayPromoteByName.get(fn.name)) continue;
      let mayPromoteTransitively = false;
      walks(fn.body, (operation) => {
        if (mayPromoteTransitively) return;
        if (operation.kind === "native.call") {
          mayPromoteTransitively = !byName.has(operation.function) ||
            mayPromoteByName.get(operation.function) === true;
          return;
        }
        mayPromoteTransitively = mayPromote(operation);
      });
      if (mayPromoteTransitively) {
        mayPromoteByName.set(fn.name, true);
        changed = true;
      }
    }
  } while (changed);
  return mayPromoteByName;
}

function emitDivisionError(indent, failure) {
  return [
    `${indent}sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
      '"integer division or modulo by zero");',
    `${indent}${failure}`,
  ].join("\n");
}

function emitWordOperation(operation, context, indent) {
  const value = context.value;
  const target = operation.target === undefined
    ? undefined
    : value(operation.target);
  const promote = () => context.promote(operation, indent);
  if (operation.kind === "integer.constant") {
    return fitsInt64(operation.value)
      ? `${indent}${target} = ${int64Constant(operation.value)};`
      : promote();
  }
  if (operation.kind === "uint64.constant") {
    return `${indent}${target} = UINT64_C(${operation.value});`;
  }
  if (operation.kind === "bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (["integer.copy", "bool.copy", "uint64.copy"].includes(operation.kind)) {
    return `${indent}${target} = ${value(operation.source)};`;
  }
  if (operation.kind === "uint64.binary") {
    const left = value(operation.left);
    const right = value(operation.right);
    if (operation.operation === "floordiv" || operation.operation === "mod") {
      const operator = operation.operation === "floordiv" ? "/" : "%";
      return [
        `${indent}if (${right} == 0)`,
        `${indent}{`,
        emitDivisionError(`${indent}    `, context.failure),
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
        `${indent}    ${context.failure}`,
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
    return `${indent}${target} = ${value(operation.left)} ${operator} ` +
      `${value(operation.right)};`;
  }
  if (operation.kind === "integer.mod_uint64") {
    const divisor = value(operation.right);
    return [
      `${indent}if (${divisor} == 0)`,
      `${indent}{`,
      emitDivisionError(`${indent}    `, context.failure),
      `${indent}}`,
      `${indent}${target} = sagejs_int64_mod_uint64(` +
        `${value(operation.left)}, ${divisor});`,
    ].join("\n");
  }
  if (operation.kind === "uint64.buffer.copy") {
    return `${indent}${target} = ${value(operation.source)};`;
  }
  if (operation.kind === "uint64.buffer.length") {
    return `${indent}${target} = (uint64_t) ${value(operation.buffer)}.length;`;
  }
  if (operation.kind === "uint64.buffer.get" ||
      operation.kind === "uint64.buffer.set") {
    const buffer = value(operation.buffer);
    const index = value(operation.index);
    const position = operation.indexType === "Integer"
      ? "sagejs_buffer_position" : `(size_t) ${index}`;
    const access = operation.kind === "uint64.buffer.get"
      ? `${target} = ${buffer}.data[${position}];`
      : `${buffer}.data[${position}] = ${value(operation.value)};`;
    if (operation.indexType === "Integer") {
      return [
        `${indent}{`,
        `${indent}    size_t sagejs_buffer_position;`,
        `${indent}    if (!sagejs_signed_buffer_index(` +
          `${buffer}.length, ${index}, &sagejs_buffer_position))`,
        `${indent}    {`,
        `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
          `"UInt64Buffer index out of range");`,
        `${indent}        ${context.failure}`,
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
      `${indent}    ${context.failure}`,
      `${indent}}`,
      `${indent}${access}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.copy") {
    return `${indent}${target} = ${value(operation.source)};`;
  }
  if (operation.kind === "int64.buffer.length") {
    return `${indent}${target} = (uint64_t) ${value(operation.buffer)}.length;`;
  }
  if (operation.kind === "int64.record.view") {
    const buffer = value(operation.buffer);
    const start = value(operation.start);
    const length = value(operation.length);
    return [
      `${indent}if (${start} < 0 || ${length} < 0 ||`,
      `${indent}    (uint64_t) ${start} > (uint64_t) ${buffer}.length ||`,
      `${indent}    (uint64_t) ${length} > ` +
        `(uint64_t) ${buffer}.length - (uint64_t) ${start})`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"Int64Record is outside its buffer");`,
      `${indent}    ${context.failure}`,
      `${indent}}`,
      `${indent}${target}.data = ${buffer}.data + (size_t) ${start};`,
      `${indent}${target}.length = (size_t) ${length};`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.get") {
    const buffer = value(operation.buffer);
    const index = value(operation.index);
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_int64_buffer_index(` +
        `&${buffer}, ${index}, &sagejs_buffer_position))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"Int64 buffer index out of range");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
      `${indent}    ${target} = ${buffer}.data[sagejs_buffer_position];`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.set") {
    const buffer = value(operation.buffer);
    const index = value(operation.index);
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_int64_buffer_index(` +
        `&${buffer}, ${index}, &sagejs_buffer_position))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"Int64 buffer index out of range");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
      `${indent}    ${buffer}.data[sagejs_buffer_position] = ` +
        `${value(operation.value)};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.buffer.copy") {
    return `${indent}${target} = ${value(operation.source)};`;
  }
  if (operation.kind === "integer.buffer.length") {
    return `${indent}${target} = (uint64_t) ${value(operation.buffer)}.length;`;
  }
  if (operation.kind === "integer.buffer.get") {
    const buffer = value(operation.buffer);
    const index = value(operation.index);
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_integer_buffer_index(` +
        `&${buffer}, ${index}, &sagejs_buffer_position))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"IntegerBuffer index out of range");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
      `${indent}    if (!sagejs_integer_buffer_get_int64(` +
        `&${buffer}, sagejs_buffer_position, &${target}))`,
      promote(),
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.buffer.set") {
    const buffer = value(operation.buffer);
    const index = value(operation.index);
    return [
      `${indent}{`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_integer_buffer_index(` +
        `&${buffer}, ${index}, &sagejs_buffer_position))`,
      `${indent}    {`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        `"IntegerBuffer index out of range");`,
      `${indent}        ${context.failure}`,
      `${indent}    }`,
      `${indent}    sagejs_integer_buffer_set_int64(` +
        `&${buffer}, sagejs_buffer_position, ${value(operation.value)});`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.from_uint64") {
    const source = value(operation.source);
    return [
      `${indent}if (${source} > (uint64_t) INT64_MAX)`,
      promote(),
      `${indent}${target} = (int64_t) ${source};`,
    ].join("\n");
  }
  if (operation.kind === "integer.neg" || operation.kind === "integer.abs") {
    const source = value(operation.source);
    const expression = operation.kind === "integer.neg"
      ? `-${source}`
      : `${source} < 0 ? -${source} : ${source}`;
    return [
      `${indent}if (${source} == INT64_MIN)`,
      promote(),
      `${indent}${target} = ${expression};`,
    ].join("\n");
  }
  if (operation.kind === "integer.pow_uint") {
    return [
      `${indent}if (!sagejs_word_pow_int64(${value(operation.base)}, ` +
        `UINT64_C(${operation.exponent}), &${target}))`,
      promote(),
    ].join("\n");
  }
  if (operation.kind === "integer.divmod") {
    const left = value(operation.left);
    const right = value(operation.right);
    return [
      `${indent}if (${right} == 0)`,
      `${indent}{`,
      emitDivisionError(`${indent}    `, context.failure),
      `${indent}}`,
      `${indent}if (${left} == INT64_MIN && ${right} == -1)`,
      promote(),
      `${indent}sagejs_word_fdiv_int64(${left}, ${right}, ` +
        `&${value(operation.quotient)}, &${value(operation.remainder)});`,
    ].join("\n");
  }
  if (operation.kind === "integer.round_sqrt") {
    const source = value(operation.source);
    return [
      `${indent}if (${source} < 0)`,
      `${indent}{`,
      `${indent}    sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, "math domain error");`,
      `${indent}    ${context.failure}`,
      `${indent}}`,
      `${indent}${target} = (int64_t) nearbyint(sqrt((double) ${source}));`,
    ].join("\n");
  }
  if (operation.kind === "integer.sequence.get") {
    const index = value(operation.index);
    const cases = operation.values.map((item, position) => [
      `${indent}    case ${position}:`,
      fitsInt64(item)
        ? `${indent}        ${target} = ${int64Constant(item)};`
        : context.promote(operation, `${indent}        `),
      `${indent}        break;`,
    ].join("\n")).join("\n");
    return [
      `${indent}{`,
      `${indent}    int64_t sagejs_word_position = ${index};`,
      `${indent}    if (sagejs_word_position < 0)`,
      `${indent}        sagejs_word_position += ` +
        `INT64_C(${operation.values.length});`,
      `${indent}    switch (sagejs_word_position)`,
      `${indent}    {`,
      cases,
      `${indent}    default:`,
      `${indent}        sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ` +
        '"native sequence index out of range");',
      `${indent}        ${context.failure}`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.binary") {
    const left = value(operation.left);
    const right = value(operation.right);
    const checked = { add: "add", sub: "sub", mul: "mul" }[
      operation.operation
    ];
    if (checked !== undefined) {
      return [
        `${indent}if (!sagejs_word_${checked}_int64(` +
          `${left}, ${right}, &${target}))`,
        promote(),
      ].join("\n");
    }
    if (["floordiv", "mod"].includes(operation.operation)) {
      const output = operation.operation === "floordiv"
        ? `&${target}, NULL`
        : `NULL, &${target}`;
      return [
        `${indent}if (${right} == 0)`,
        `${indent}{`,
        emitDivisionError(`${indent}    `, context.failure),
        `${indent}}`,
        `${indent}if (${left} == INT64_MIN && ${right} == -1)`,
        promote(),
        `${indent}sagejs_word_fdiv_int64(${left}, ${right}, ${output});`,
      ].join("\n");
    }
    throw new Error(`unsupported word operation ${operation.operation}`);
  }
  if (operation.kind === "integer.compare" || operation.kind === "bool.compare") {
    const operator = {
      eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=",
    }[operation.operation];
    return `${indent}${target} = ${value(operation.left)} ${operator} ` +
      `${value(operation.right)};`;
  }
  if (operation.kind === "bool.binary") {
    const operator = operation.operation === "and" ? "&&" : "||";
    return `${indent}${target} = ${value(operation.left)} ${operator} ` +
      `${value(operation.right)};`;
  }
  if (operation.kind === "bool.short_circuit") {
    const test = operation.operation === "and" ? target : `!${target}`;
    return [
      `${indent}${target} = ${value(operation.left)};`,
      `${indent}if (${test})`,
      `${indent}{`,
      emitWordStatements(operation.right.operations, context, `${indent}    `),
      `${indent}    ${target} = ${value(operation.right.value)};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "bool.not") {
    return `${indent}${target} = !${value(operation.source)};`;
  }
  if (operation.kind === "integer.truth" || operation.kind === "uint64.truth") {
    return `${indent}${target} = ${value(operation.source)} != 0;`;
  }
  if (operation.kind === "native.call") {
    const callee = context.functions?.get(operation.function);
    const calleeMayPromote = context.mayPromote?.get(operation.function) ?? true;
    if (callee !== undefined && !callee.analysis.effects.replaySafe &&
        calleeMayPromote) {
      return promote();
    }
    const outputs = operation.results === undefined
      ? [`&${target}`]
      : operation.results.map((result) => `&${value(result.name)}`);
    const args = operation.arguments.map((argument) => value(argument.name));
    const status = `sagejs_word_status_${context.sites.get(operation)}`;
    const lines = [
      `${indent}{`,
      `${indent}    const int ${status} = word_${operation.function}(` +
        `status, ${outputs.join(", ")}` +
        `${args.length ? `, ${args.join(", ")}` : ""});`,
      `${indent}    if (${status} == SAGEJS_WORD_ERROR)`,
      `${indent}        ${context.failure}`,
    ];
    if (calleeMayPromote) {
      lines.push(
        `${indent}    if (${status} == SAGEJS_WORD_PROMOTE)`,
        context.promote(operation, `${indent}        `),
      );
    }
    lines.push(`${indent}}`);
    return lines.join("\n");
  }
  if (operation.kind === "ffi.call") {
    return emitWordForeignCall(operation, {
      value,
      result: value,
      promote: context.promote,
      failure: context.failure,
    }, indent);
  }
  throw new Error(`unsupported word C IR operation ${operation.kind}`);
}

function emitWordStatements(statements, context, indent) {
  const lines = [];
  for (const statement of statements) {
    const comment = cOperationComment(statement, indent);
    if (comment) lines.push(comment);
    const directive = cSourceDirective(statement);
    if (directive) lines.push(directive);
    if (statement.kind === "if") {
      lines.push(
        emitWordStatements(statement.condition.operations, context, indent),
        `${indent}if (${context.value(statement.condition.value)})`,
        `${indent}{`,
        emitWordStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      if (statement.alternative.length > 0) {
        lines.push(
          `${indent}else`, `${indent}{`,
          emitWordStatements(statement.alternative, context, `${indent}    `),
          `${indent}}`,
        );
      }
      continue;
    }
    if (statement.kind === "while") {
      lines.push(
        `${indent}for (;;)`, `${indent}{`,
        emitWordStatements(statement.condition.operations, context, `${indent}    `),
        `${indent}    if (!${context.value(statement.condition.value)})`,
        `${indent}        break;`,
        emitWordStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range") {
      const index = context.value(statement.index);
      const bound = context.value(statement.count);
      const condition = statement.boundIsStop
        ? `${index} < ${bound}`
        : `(${index} - UINT64_C(${statement.start})) < ${bound}`;
      lines.push(
        `${indent}for (${index} = UINT64_C(${statement.start}); ` +
          `${condition}; ` +
          `${index} += UINT64_C(${statement.step || 1}))`,
        `${indent}{`,
        emitWordStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range_exact") {
      const index = context.value(statement.index);
      lines.push(
        `${indent}${index} = ${context.value(statement.start)};`,
        `${indent}while (${index} < ${context.value(statement.stop)})`,
        `${indent}{`,
        emitWordStatements(statement.body, context, `${indent}    `),
        `${indent}    ${index} += INT64_C(1);`,
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "return") {
      const values = statement.values || [statement.value];
      if (context.returnWord !== undefined) {
        lines.push(context.returnWord(statement, values, indent));
      } else {
        values.forEach((value, index) => {
          lines.push(
            `${indent}*sagejs_word_output_${index} = ${context.value(value)};`,
          );
        });
        lines.push(`${indent}return SAGEJS_WORD_OK;`);
      }
      continue;
    }
    if (statement.kind === "raise") {
      lines.push(
        `${indent}sagejs_native_status_set(status, SAGEJS_NATIVE_RANGE_ERROR, ${cString(statement.message)});`,
        `${indent}${context.failure}`,
      );
      continue;
    }
    lines.push(emitWordOperation(statement, context, indent));
  }
  return lines.filter(Boolean).join("\n");
}

function emitWordFunction(fn, functions, mayPromote) {
  const sites = promotionSites(fn);
  const params = new Set(fn.params.map((param) => param.name));
  const declarations = fn.locals
    .filter((local) =>
      !params.has(local.name) && !local.type.startsWith("IntegerSequence[") &&
      !isForeignResourceType(fn, local.type)
    )
    .map((local) => `    ${wordType(local.type)} ${wordName(local.name)} = ` +
      `${local.type === "Int64Buffer" || local.type === "Int64Record" ||
        local.type === "IntegerBuffer" || local.type === "UInt64Buffer"
        ? "{0}" : "0"};`);
  const context = {
    failure: "return SAGEJS_WORD_ERROR;",
    promote(_operation, indent) {
      return `${indent}return SAGEJS_WORD_PROMOTE;`;
    },
    functions,
    mayPromote,
    sites,
    value: wordName,
  };
  return `${wordSignature(fn)}
{
${declarations.join("\n")}
${emitWordStatements(fn.body, context, "    ")}
    sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
        "native word function completed without returning");
    return SAGEJS_WORD_ERROR;
}`;
}

function generateWordFunctions(functions) {
  const functionMap = new Map(functions.map((fn) => [fn.name, fn]));
  const mayPromote = wordPromotionCapabilities(functions);
  return {
    prototypes: functions.map((fn) => wordSignature(fn, true)).join("\n"),
    functions: functions
      .map((fn) => emitWordFunction(fn, functionMap, mayPromote))
      .join("\n\n"),
  };
}

module.exports = {
  emitWordStatements,
  fitsInt64,
  generateWordFunctions,
  int64Constant,
  promotionSites,
  wordPromotionCapabilities,
  wordName,
  wordResults,
  wordSignature,
  wordType,
};
