"use strict";

const { tupleElementTypes } = require("./integer-ir.cjs");

function cString(value) {
  return JSON.stringify(String(value));
}

function wordName(name) {
  return `sagejs_word_${name}`;
}

function int64Constant(value) {
  const integer = BigInt(value);
  if (integer === -(1n << 63n)) return "INT64_MIN";
  if (integer < 0n) return `(-INT64_C(${(-integer).toString()}))`;
  return `INT64_C(${integer.toString()})`;
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

function wordValue(name) {
  return wordName(name);
}

function emitDivisionError(indent) {
  return [
    `${indent}napi_throw_range_error(env, NULL, ` +
      '"integer division or modulo by zero");',
    `${indent}return SAGEJS_WORD_ERROR;`,
  ].join("\n");
}

function emitWordOperation(operation, context, indent) {
  const target = wordValue(operation.target);
  if (operation.kind === "integer.constant") {
    return `${indent}${target} = ${int64Constant(operation.value)};`;
  }
  if (operation.kind === "bool.constant") {
    return `${indent}${target} = ${operation.value ? 1 : 0};`;
  }
  if (
    operation.kind === "integer.copy" ||
    operation.kind === "bool.copy" ||
    operation.kind === "uint64.copy"
  ) {
    return `${indent}${target} = ${wordValue(operation.source)};`;
  }
  if (operation.kind === "integer.from_uint64") {
    const source = wordValue(operation.source);
    return [
      `${indent}if (${source} > (uint64_t) INT64_MAX)`,
      `${indent}    return SAGEJS_WORD_PROMOTE;`,
      `${indent}${target} = (int64_t) ${source};`,
    ].join("\n");
  }
  if (operation.kind === "integer.neg") {
    return [
      `${indent}if (${wordValue(operation.source)} == INT64_MIN)`,
      `${indent}    return SAGEJS_WORD_PROMOTE;`,
      `${indent}${target} = -${wordValue(operation.source)};`,
    ].join("\n");
  }
  if (operation.kind === "integer.abs") {
    const source = wordValue(operation.source);
    return [
      `${indent}if (${source} == INT64_MIN)`,
      `${indent}    return SAGEJS_WORD_PROMOTE;`,
      `${indent}${target} = ${source} < 0 ? -${source} : ${source};`,
    ].join("\n");
  }
  if (operation.kind === "integer.pow_uint") {
    return [
      `${indent}if (!sagejs_word_pow_int64(${wordValue(operation.base)}, ` +
        `UINT64_C(${operation.exponent}), &${target}))`,
      `${indent}    return SAGEJS_WORD_PROMOTE;`,
    ].join("\n");
  }
  if (operation.kind === "integer.divmod") {
    const left = wordValue(operation.left);
    const right = wordValue(operation.right);
    return [
      `${indent}if (${right} == 0)`,
      `${indent}{`,
      emitDivisionError(`${indent}    `),
      `${indent}}`,
      `${indent}if (${left} == INT64_MIN && ${right} == -1)`,
      `${indent}    return SAGEJS_WORD_PROMOTE;`,
      `${indent}sagejs_word_fdiv_int64(${left}, ${right}, ` +
        `&${wordValue(operation.quotient)}, ` +
        `&${wordValue(operation.remainder)});`,
    ].join("\n");
  }
  if (operation.kind === "integer.round_sqrt") {
    const source = wordValue(operation.source);
    return [
      `${indent}if (${source} < 0)`,
      `${indent}{`,
      `${indent}    napi_throw_range_error(env, NULL, "math domain error");`,
      `${indent}    return SAGEJS_WORD_ERROR;`,
      `${indent}}`,
      `${indent}${target} = (int64_t) nearbyint(sqrt((double) ${source}));`,
    ].join("\n");
  }
  if (operation.kind === "integer.sequence.get") {
    const index = wordValue(operation.index);
    const cases = operation.values.map((value, position) => [
      `${indent}    case ${position}:`,
      `${indent}        ${target} = ${int64Constant(value)};`,
      `${indent}        break;`,
    ].join("\n")).join("\n");
    return [
      `${indent}{`,
      `${indent}    int64_t sagejs_word_position = ${index};`,
      `${indent}    if (sagejs_word_position < 0)`,
      `${indent}        sagejs_word_position += INT64_C(${operation.values.length});`,
      `${indent}    switch (sagejs_word_position)`,
      `${indent}    {`,
      cases,
      `${indent}    default:`,
      `${indent}        napi_throw_range_error(env, NULL, ` +
        '"native sequence index out of range");',
      `${indent}        return SAGEJS_WORD_ERROR;`,
      `${indent}    }`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "integer.binary") {
    const left = wordValue(operation.left);
    const right = wordValue(operation.right);
    const checked = {
      add: "add",
      sub: "sub",
      mul: "mul",
    }[operation.operation];
    if (checked !== undefined) {
      return [
        `${indent}if (!sagejs_word_${checked}_int64(` +
          `${left}, ${right}, &${target}))`,
        `${indent}    return SAGEJS_WORD_PROMOTE;`,
      ].join("\n");
    }
    if (operation.operation === "floordiv" || operation.operation === "mod") {
      const output = operation.operation === "floordiv"
        ? `&${target}, NULL`
        : `NULL, &${target}`;
      return [
        `${indent}if (${right} == 0)`,
        `${indent}{`,
        emitDivisionError(`${indent}    `),
        `${indent}}`,
        `${indent}if (${left} == INT64_MIN && ${right} == -1)`,
        `${indent}    return SAGEJS_WORD_PROMOTE;`,
        `${indent}sagejs_word_fdiv_int64(${left}, ${right}, ${output});`,
      ].join("\n");
    }
    throw new Error(`unsupported machine-word operation ${operation.operation}`);
  }
  if (operation.kind === "integer.compare" || operation.kind === "bool.compare") {
    const operator = {
      eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=",
    }[operation.operation];
    return `${indent}${target} = ${wordValue(operation.left)} ${operator} ` +
      `${wordValue(operation.right)};`;
  }
  if (operation.kind === "bool.binary") {
    const operator = operation.operation === "and" ? "&&" : "||";
    return `${indent}${target} = ${wordValue(operation.left)} ${operator} ` +
      `${wordValue(operation.right)};`;
  }
  if (operation.kind === "bool.short_circuit") {
    const test = operation.operation === "and" ? target : `!${target}`;
    return [
      `${indent}${target} = ${wordValue(operation.left)};`,
      `${indent}if (${test})`,
      `${indent}{`,
      emitWordStatements(operation.right.operations, context, `${indent}    `),
      `${indent}    ${target} = ${wordValue(operation.right.value)};`,
      `${indent}}`,
    ].join("\n");
  }
  if (operation.kind === "bool.not") {
    return `${indent}${target} = !${wordValue(operation.source)};`;
  }
  if (operation.kind === "integer.truth" || operation.kind === "uint64.truth") {
    return `${indent}${target} = ${wordValue(operation.source)} != 0;`;
  }
  if (operation.kind === "native.call") {
    const callee = context.functions.get(operation.function);
    if (!callee?.analysis?.machineWord?.eligible) {
      throw new Error(`callee ${operation.function} lacks word specialization`);
    }
    const outputs = operation.results === undefined
      ? [`&${target}`]
      : operation.results.map((result) => `&${wordValue(result.name)}`);
    const args = operation.arguments.map((argument) => wordValue(argument.name));
    return [
      `${indent}{`,
      `${indent}    const int sagejs_word_status = ` +
        `word_${operation.function}(env, ${outputs.join(", ")}` +
        `${args.length ? `, ${args.join(", ")}` : ""});`,
      `${indent}    if (sagejs_word_status != SAGEJS_WORD_OK)`,
      `${indent}        return sagejs_word_status;`,
      `${indent}}`,
    ].join("\n");
  }
  throw new Error(`unsupported machine-word IR operation ${operation.kind}`);
}

function emitWordStatements(statements, context, indent) {
  const lines = [];
  for (const statement of statements) {
    if (statement.kind === "if") {
      lines.push(
        emitWordStatements(statement.condition.operations, context, indent),
        `${indent}if (${wordValue(statement.condition.value)})`,
        `${indent}{`,
        emitWordStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      if (statement.alternative.length > 0) {
        lines.push(
          `${indent}else`,
          `${indent}{`,
          emitWordStatements(statement.alternative, context, `${indent}    `),
          `${indent}}`,
        );
      }
      continue;
    }
    if (statement.kind === "while") {
      lines.push(
        `${indent}for (;;)`,
        `${indent}{`,
        emitWordStatements(
          statement.condition.operations,
          context,
          `${indent}    `,
        ),
        `${indent}    if (!${wordValue(statement.condition.value)})`,
        `${indent}        break;`,
        emitWordStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range") {
      const index = wordValue(statement.index);
      lines.push(
        `${indent}for (${index} = UINT64_C(${statement.start}); ` +
          `(${index} - UINT64_C(${statement.start})) < ` +
          `${wordValue(statement.count)}; ${index}++)`,
        `${indent}{`,
        emitWordStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "loop.range_exact") {
      const index = wordValue(statement.index);
      lines.push(
        `${indent}${index} = ${wordValue(statement.start)};`,
        `${indent}while (${index} < ${wordValue(statement.stop)})`,
        `${indent}{`,
        emitWordStatements(statement.body, context, `${indent}    `),
        `${indent}    ${index} += INT64_C(1);`,
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "return") {
      const values = statement.values || [statement.value];
      values.forEach((value, index) => {
        lines.push(
          `${indent}*sagejs_word_output_${index} = ${wordValue(value)};`,
        );
      });
      lines.push(`${indent}return SAGEJS_WORD_OK;`);
      continue;
    }
    if (statement.kind === "raise") {
      lines.push(
        `${indent}napi_throw_range_error(env, NULL, ` +
          `${cString(statement.message)});`,
        `${indent}return SAGEJS_WORD_ERROR;`,
      );
      continue;
    }
    lines.push(emitWordOperation(statement, context, indent));
  }
  return lines.filter(Boolean).join("\n");
}

function emitWordFunction(fn, functions) {
  if (!fn.analysis.machineWord.eligible) return "";
  const params = new Set(fn.params.map((param) => param.name));
  const declarations = fn.locals
    .filter((local) =>
      !params.has(local.name) && !local.type.startsWith("IntegerSequence[")
    )
    .map((local) => `    ${wordType(local.type)} ${wordName(local.name)} = 0;`);
  return `${wordSignature(fn)}
{
${declarations.join("\n")}
${emitWordStatements(fn.body, { functions }, "    ")}
    napi_throw_error(env, NULL, "native word function completed without returning");
    return SAGEJS_WORD_ERROR;
}`;
}

function generateWordFunctions(functions) {
  const functionMap = new Map(functions.map((fn) => [fn.name, fn]));
  const eligible = functions.filter(
    (fn) => fn.analysis.machineWord.eligible,
  );
  return {
    prototypes: eligible.map((fn) => wordSignature(fn, true)).join("\n"),
    functions: eligible
      .map((fn) => emitWordFunction(fn, functionMap))
      .join("\n\n"),
  };
}

module.exports = {
  generateWordFunctions,
  int64Constant,
  wordName,
  wordResults,
  wordSignature,
  wordType,
};
