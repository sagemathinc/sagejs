"use strict";

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
  return `sagejs_tagged_${name}`;
}

function scalarType(type) {
  if (type === "uint64") return "uint64_t";
  if (type === "bool") return "int";
  if (type === "Int64Buffer" || type === "Int64Record") {
    return "sagejs_int64_buffer";
  }
  if (type === "IntegerBuffer") return "sagejs_integer_buffer";
  throw new Error(`unsupported tagged scalar type ${type}`);
}

function taggedResults(type) {
  const tuple = tupleElementTypes(type) || [type];
  return tuple.map((element, index) => {
    if (element === "Integer") {
      return `sagejs_tagged_int *sagejs_tagged_output_${index}`;
    }
    return `${scalarType(element)} *sagejs_tagged_output_${index}`;
  });
}

function taggedParameter(param) {
  if (param.type === "Integer") {
    return `sagejs_tagged_int *sagejs_tagged_arg_${param.name}`;
  }
  return `${scalarType(param.type)} sagejs_tagged_arg_${param.name}`;
}

function taggedSignature(fn, prototype = false) {
  const parameters = [
    "napi_env env",
    ...taggedResults(fn.returnType),
    ...fn.params.map(taggedParameter),
  ].join(", ");
  return `static int tagged_${fn.name}(${parameters})${prototype ? ";" : ""}`;
}

function taggedValue(name, context) {
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
    `${indent}    napi_throw_type_error(env, NULL, ` +
      '"invalid native integer literal");',
    `${indent}    goto fail;`,
    `${indent}}`,
  ].join("\n");
}

function emitDivisionGuard(right, indent) {
  return [
    `${indent}if (sagejs_tagged_sgn(${right}) == 0)`,
    `${indent}{`,
    `${indent}    napi_throw_range_error(env, NULL, ` +
      '"integer division or modulo by zero");',
    `${indent}    goto fail;`,
    `${indent}}`,
  ].join("\n");
}

function emitTaggedOperation(operation, context, indent) {
  const target = operation.target === undefined
    ? undefined
    : taggedValue(operation.target, context);
  if (operation.kind === "integer.constant") {
    return setInteger(target, operation.value, indent);
  }
  if (operation.kind === "bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (operation.kind === "integer.copy") {
    return `${indent}sagejs_tagged_copy(${target}, ` +
      `${taggedValue(operation.source, context)});`;
  }
  if (operation.kind === "bool.copy" || operation.kind === "uint64.copy") {
    return `${indent}${target} = ${taggedValue(operation.source, context)};`;
  }
  if (operation.kind === "int64.buffer.copy") {
    return `${indent}${target} = ${taggedValue(operation.source, context)};`;
  }
  if (operation.kind === "int64.buffer.length") {
    return `${indent}${target} = (uint64_t) ` +
      `${taggedValue(operation.buffer, context)}.length;`;
  }
  if (operation.kind === "int64.record.view") {
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
      `${indent}        napi_throw_range_error(env, NULL, ` +
        `"Int64Record is outside its buffer");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    ${target}.data = ${buffer}.data + ` +
        `(size_t) sagejs_record_start;`,
      `${indent}    ${target}.length = (size_t) sagejs_record_length;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.get") {
    const buffer = taggedValue(operation.buffer, context);
    const index = taggedValue(operation.index, context);
    return [
      `${indent}{`,
      `${indent}    int64_t sagejs_buffer_index;`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_tagged_to_int64(${index}, ` +
        `&sagejs_buffer_index) ||`,
      `${indent}        !sagejs_int64_buffer_index(&${buffer}, ` +
        `sagejs_buffer_index, &sagejs_buffer_position))`,
      `${indent}    {`,
      `${indent}        napi_throw_range_error(env, NULL, ` +
        `"Int64 buffer index out of range");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    sagejs_tagged_set_small(${target}, ` +
        `${buffer}.data[sagejs_buffer_position]);`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "int64.buffer.set") {
    const buffer = taggedValue(operation.buffer, context);
    const index = taggedValue(operation.index, context);
    const source = taggedValue(operation.value, context);
    return [
      `${indent}{`,
      `${indent}    int64_t sagejs_buffer_index;`,
      `${indent}    int64_t sagejs_buffer_value;`,
      `${indent}    size_t sagejs_buffer_position;`,
      `${indent}    if (!sagejs_tagged_to_int64(${index}, ` +
        `&sagejs_buffer_index) ||`,
      `${indent}        !sagejs_int64_buffer_index(&${buffer}, ` +
        `sagejs_buffer_index, &sagejs_buffer_position))`,
      `${indent}    {`,
      `${indent}        napi_throw_range_error(env, NULL, ` +
        `"Int64 buffer index out of range");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    if (!sagejs_tagged_to_int64(${source}, ` +
        `&sagejs_buffer_value))`,
      `${indent}    {`,
      `${indent}        napi_throw_range_error(env, NULL, ` +
        `"Int64Buffer value is outside signed 64-bit");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    ${buffer}.data[sagejs_buffer_position] = ` +
        `sagejs_buffer_value;`,
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
      `${indent}        napi_throw_range_error(env, NULL, ` +
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
      `${indent}        napi_throw_range_error(env, NULL, ` +
        `"IntegerBuffer index out of range");`,
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    if (!sagejs_integer_buffer_set_tagged(env, ` +
        `&${buffer}, sagejs_buffer_position, ${source}))`,
      `${indent}        goto fail;`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.from_uint64") {
    return `${indent}sagejs_tagged_set_uint64(${target}, ` +
      `${taggedValue(operation.source, context)});`;
  }
  if (operation.kind === "integer.neg" || operation.kind === "integer.abs") {
    return `${indent}sagejs_tagged_${operation.kind.slice(8)}(${target}, ` +
      `${taggedValue(operation.source, context)});`;
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
      `${indent}    napi_throw_range_error(env, NULL, "math domain error");`,
      `${indent}    goto fail;`,
      `${indent}}`,
      `${indent}{`,
      `${indent}    const double sagejs_input = ` +
        `sagejs_tagged_get_double(${source});`,
      `${indent}    if (!isfinite(sagejs_input))`,
      `${indent}    {`,
      `${indent}        napi_throw_range_error(env, NULL, ` +
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
      `${indent}        napi_throw_range_error(env, NULL, ` +
        '"native sequence index is too large");',
      `${indent}        goto fail;`,
      `${indent}    }`,
      `${indent}    if (${position} < 0) ` +
        `${position} += INT64_C(${operation.values.length});`,
      `${indent}    switch (${position})`,
      `${indent}    {`,
      cases,
      `${indent}        default:`,
      `${indent}            napi_throw_range_error(env, NULL, ` +
        '"native sequence index out of range");',
      `${indent}            goto fail;`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.binary") {
    const left = taggedValue(operation.left, context);
    const right = taggedValue(operation.right, context);
    if (["add", "sub", "mul"].includes(operation.operation)) {
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
  if (operation.kind === "uint64.truth") {
    return `${indent}${target} = ${taggedValue(operation.source, context)} != 0;`;
  }
  if (operation.kind === "native.call") {
    const callee = context.functions.get(operation.function);
    if (callee === undefined) {
      throw new Error(`unknown tagged callee ${operation.function}`);
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
    return [
      `${indent}if (!tagged_${operation.function}(env, ${outputs.join(", ")}` +
        `${args.length ? `, ${args.join(", ")}` : ""}))`,
      `${indent}    goto fail;`,
    ].join("\n");
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
      const bound = taggedValue(statement.count, context);
      const condition = statement.boundIsStop
        ? `${index} < ${bound}`
        : `(${index} - UINT64_C(${statement.start})) < ${bound}`;
      lines.push(
        `${indent}for (${index} = UINT64_C(${statement.start}); ` +
          `${condition}; ` +
          `${index} += UINT64_C(${statement.step || 1}))`,
        `${indent}{`,
        emitTaggedStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range_exact") {
      const index = taggedValue(statement.index, context);
      lines.push(
        `${indent}sagejs_tagged_copy(${index}, ` +
          `${taggedValue(statement.start, context)});`,
        `${indent}while (sagejs_tagged_cmp(${index}, ` +
          `${taggedValue(statement.stop, context)}) < 0)`,
        `${indent}{`,
        emitTaggedStatements(statement.body, context, `${indent}    `),
        `${indent}    sagejs_tagged_add_one(${index});`,
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "return") {
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
      } else {
        lines.push(`${indent}*sagejs_tagged_output_0 = ` +
          `${taggedValue(statement.value, context)};`);
      }
      lines.push(`${indent}goto success;`);
      continue;
    }
    if (statement.kind === "raise") {
      lines.push(
        `${indent}napi_throw_range_error(env, NULL, ${cString(statement.message)});`,
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

function emitTaggedFunction(fn, functions) {
  const storage = fn.analysis.storage;
  const types = new Map(
    [...fn.params, ...fn.locals].map((value) => [value.name, value.type]),
  );
  const sites = promotionSites(fn);
  const tagLocals = new Set([
    ...storage.mutableParameters,
    ...fn.locals
      .filter((local) => local.type === "Integer")
      .map((local) => local.name),
  ]);
  const declarations = [];
  const tagInitialization = [];
  const cleanup = [];
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
    declarations.push(
      `    ${scalarType(param.type)} ${taggedName(param.name)} = ` +
        `sagejs_tagged_arg_${param.name};`,
    );
  }
  for (const local of fn.locals) {
    if (local.type === "Integer" || local.type.startsWith("IntegerSequence[")) {
      continue;
    }
    declarations.push(`    ${scalarType(local.type)} ${taggedName(local.name)} = ` +
      `${local.type === "Int64Buffer" || local.type === "Int64Record" ||
        local.type === "IntegerBuffer"
        ? "{0}" : "0"};`);
  }
  const integerNames = [
    ...fn.params,
    ...fn.locals,
  ].filter((value) => value.type === "Integer");
  for (const value of integerNames) {
    declarations.push(`    int64_t ${wordName(value.name)} = 0;`);
  }
  const context = { functions, sites, storage, tagLocals, types };
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
        return type === "Integer"
          ? `${indent}sagejs_tagged_set_small(` +
            `sagejs_tagged_output_${index}, ${wordName(source)});`
          : `${indent}*sagejs_tagged_output_${index} = ${taggedName(source)};`;
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
  const fastGuard = integerParams.length === 0
    ? "1"
    : integerParams
      .map((param) => `!sagejs_tagged_arg_${param.name}->is_big`)
      .join(" && ");
  const wordParamCopies = integerParams.map((param) =>
    `        ${wordName(param.name)} = ` +
      `sagejs_tagged_arg_${param.name}->small;`
  );
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
  return `${taggedSignature(fn)}
{
${declarations.join("\n")}
    if (${fastGuard})
    {
${wordParamCopies.join("\n")}
${emitWordStatements(fn.body, wordContext, "        ")}
    }
    goto sagejs_tagged_entry;
${promotionBlock}
sagejs_tagged_entry:
${initializeTags}
${entryCopies.join("\n")}
${emitTaggedStatements(fn.body, context, "    ")}
    napi_throw_error(env, NULL, "tagged native function completed without returning");
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

function generateTaggedFunctions(functions) {
  const functionMap = new Map(functions.map((fn) => [fn.name, fn]));
  return {
    prototypes: functions.map((fn) => taggedSignature(fn, true)).join("\n"),
    functions: functions
      .map((fn) => emitTaggedFunction(fn, functionMap))
      .join("\n\n"),
  };
}

module.exports = {
  generateTaggedFunctions,
  int64Constant,
  taggedResults,
  taggedSignature,
};
