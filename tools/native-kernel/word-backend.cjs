"use strict";

const { tupleElementTypes } = require("./integer-ir.cjs");

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
    "napi_env env",
    ...wordResults(fn.returnType),
    ...fn.params.map((param) =>
      `${wordType(param.type)} ${wordName(param.name)}`
    ),
  ].join(", ");
  return `static int word_${fn.name}(${parameters})${prototype ? ";" : ""}`;
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
  return [
    "integer.from_uint64",
    "integer.neg",
    "integer.abs",
    "integer.pow_uint",
    "integer.divmod",
    "integer.binary",
    "native.call",
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

function emitDivisionError(indent, failure) {
  return [
    `${indent}napi_throw_range_error(env, NULL, ` +
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
  if (operation.kind === "bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (["integer.copy", "bool.copy", "uint64.copy"].includes(operation.kind)) {
    return `${indent}${target} = ${value(operation.source)};`;
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
      `${indent}    napi_throw_range_error(env, NULL, "math domain error");`,
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
      `${indent}        napi_throw_range_error(env, NULL, ` +
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
    if (callee !== undefined && !callee.analysis.effects.replaySafe) {
      return promote();
    }
    const outputs = operation.results === undefined
      ? [`&${target}`]
      : operation.results.map((result) => `&${value(result.name)}`);
    const args = operation.arguments.map((argument) => value(argument.name));
    const status = `sagejs_word_status_${context.sites.get(operation)}`;
    return [
      `${indent}{`,
      `${indent}    const int ${status} = word_${operation.function}(` +
        `env, ${outputs.join(", ")}` +
        `${args.length ? `, ${args.join(", ")}` : ""});`,
      `${indent}    if (${status} == SAGEJS_WORD_ERROR)`,
      `${indent}        ${context.failure}`,
      `${indent}    if (${status} == SAGEJS_WORD_PROMOTE)`,
      context.promote(operation, `${indent}        `),
      `${indent}}`,
    ].join("\n");
  }
  throw new Error(`unsupported word C IR operation ${operation.kind}`);
}

function emitWordStatements(statements, context, indent) {
  const lines = [];
  for (const statement of statements) {
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
      lines.push(
        `${indent}for (${index} = UINT64_C(${statement.start}); ` +
          `(${index} - UINT64_C(${statement.start})) < ` +
          `${context.value(statement.count)}; ${index}++)`,
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
        `${indent}napi_throw_range_error(env, NULL, ${cString(statement.message)});`,
        `${indent}${context.failure}`,
      );
      continue;
    }
    lines.push(emitWordOperation(statement, context, indent));
  }
  return lines.filter(Boolean).join("\n");
}

function emitWordFunction(fn, functions) {
  const sites = promotionSites(fn);
  const params = new Set(fn.params.map((param) => param.name));
  const declarations = fn.locals
    .filter((local) =>
      !params.has(local.name) && !local.type.startsWith("IntegerSequence[")
    )
    .map((local) => `    ${wordType(local.type)} ${wordName(local.name)} = 0;`);
  const context = {
    failure: "return SAGEJS_WORD_ERROR;",
    promote(_operation, indent) {
      return `${indent}return SAGEJS_WORD_PROMOTE;`;
    },
    functions,
    sites,
    value: wordName,
  };
  return `${wordSignature(fn)}
{
${declarations.join("\n")}
${emitWordStatements(fn.body, context, "    ")}
    napi_throw_error(env, NULL, "native word function completed without returning");
    return SAGEJS_WORD_ERROR;
}`;
}

function generateWordFunctions(functions) {
  const functionMap = new Map(functions.map((fn) => [fn.name, fn]));
  return {
    prototypes: functions.map((fn) => wordSignature(fn, true)).join("\n"),
    functions: functions
      .map((fn) => emitWordFunction(fn, functionMap))
      .join("\n\n"),
  };
}

module.exports = {
  emitWordStatements,
  fitsInt64,
  generateWordFunctions,
  int64Constant,
  promotionSites,
  wordName,
  wordResults,
  wordSignature,
  wordType,
};
