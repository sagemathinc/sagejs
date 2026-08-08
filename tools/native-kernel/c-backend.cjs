"use strict";

const NATIVE_ABI_VERSION = 2;

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
  throw new Error(`unsupported exact native parameter ${param.type}`);
}

function internalResult(type) {
  if (type === "Integer") return "mpz_t sagejs_native_output";
  if (type === "uint64") return "uint64_t *sagejs_native_output";
  if (type === "bool") return "int *sagejs_native_output";
  throw new Error(`unsupported exact native return ${type}`);
}

function internalSignature(fn, prototype = false) {
  const argumentsList = [
    "napi_env env",
    internalResult(fn.returnType),
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
      `${indent}    napi_throw_type_error(env, NULL, "invalid native integer literal");`,
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
        `${indent}    napi_throw_range_error(env, NULL, "integer division or modulo by zero");`,
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
    const output = operation.returnType === "Integer" ? target : `&${target}`;
    const args = operation.arguments.map((argument) =>
      exactValue(argument.name, context)
    );
    return [
      `${indent}if (!native_${operation.function}(env, ${output}` +
        `${args.length ? `, ${args.join(", ")}` : ""}))`,
      `${indent}    goto fail;`,
    ].join("\n");
  }
  throw new Error(`unsupported exact C IR operation ${operation.kind}`);
}

function emitExactStatements(statements, context, indent) {
  const lines = [];
  for (const statement of statements) {
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
      lines.push(
        `${indent}for (${exactValue(statement.index, context)} = ` +
          `UINT64_C(${statement.start}); ` +
          `(${exactValue(statement.index, context)} - ` +
          `UINT64_C(${statement.start})) < ` +
          `${exactValue(statement.count, context)}; ` +
          `${exactValue(statement.index, context)}++)`,
        `${indent}{`,
        emitExactStatements(statement.body, context, `${indent}    `),
        `${indent}}`,
      );
      continue;
    }
    if (statement.kind === "return") {
      if (statement.type === "Integer") {
        lines.push(`${indent}mpz_set(sagejs_native_output, ` +
          `${exactValue(statement.value, context)});`);
      } else {
        lines.push(`${indent}*sagejs_native_output = ` +
          `${exactValue(statement.value, context)};`);
      }
      lines.push(`${indent}goto success;`);
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
    const type = param.type === "uint64" ? "uint64_t" : "int";
    declarations.push(
      `    ${type} ${cName(param.name)} = sagejs_arg_${param.name};`,
    );
  }
  for (const local of fn.locals) {
    if (local.type === "Integer") continue;
    const type = local.type === "uint64" ? "uint64_t" : "int";
    declarations.push(`    ${type} ${cName(local.name)} = 0;`);
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
    napi_throw_error(env, NULL, "native function completed without returning");
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

function emitExactWrapper(fn) {
  const declarations = [];
  const initialization = [];
  const parsing = [];
  const cleanup = [];
  for (const [index, param] of fn.params.entries()) {
    const value = wrapperValue(param);
    if (param.type === "Integer") {
      declarations.push(`    mpz_t ${value};`, `    int ${value}_initialized = 0;`);
      initialization.push(`    mpz_init(${value});`, `    ${value}_initialized = 1;`);
      parsing.push(`    if (!get_integer(env, args[${index}], ${value}))`, "        goto fail;");
      cleanup.push(`    if (${value}_initialized)`, `        mpz_clear(${value});`);
    } else if (param.type === "uint64") {
      declarations.push(`    uint64_t ${value};`);
      parsing.push(`    if (!get_uint64(env, args[${index}], &${value}))`, "        goto fail;");
    } else {
      declarations.push(`    int ${value};`);
      parsing.push(`    if (!get_bool(env, args[${index}], &${value}))`, "        goto fail;");
    }
  }
  let resultDeclaration;
  let resultInitialization = "";
  let resultCleanup = "";
  let resultArgument;
  let resultCreation;
  if (fn.returnType === "Integer") {
    resultDeclaration = "    mpz_t sagejs_wrapper_result;\n" +
      "    int sagejs_wrapper_result_initialized = 0;";
    resultInitialization = "    mpz_init(sagejs_wrapper_result);\n" +
      "    sagejs_wrapper_result_initialized = 1;";
    resultCleanup = "    if (sagejs_wrapper_result_initialized)\n" +
      "        mpz_clear(sagejs_wrapper_result);";
    resultArgument = "sagejs_wrapper_result";
    resultCreation = "    result = create_bigint(env, sagejs_wrapper_result);";
  } else {
    resultDeclaration = `    ${fn.returnType === "uint64" ? "uint64_t" : "int"} sagejs_wrapper_result;`;
    resultArgument = "&sagejs_wrapper_result";
    resultCreation = fn.returnType === "bool"
      ? "    if (!sagejs_native_check_napi(env, napi_get_boolean(env, sagejs_wrapper_result != 0, &result)))\n        goto fail;"
      : "    if (!sagejs_native_check_napi(env, napi_create_bigint_uint64(env, sagejs_wrapper_result, &result)))\n        goto fail;";
  }
  const argumentsList = fn.params.map(wrapperValue);
  return `
static napi_value compiled_${fn.name}(napi_env env, napi_callback_info info)
{
    napi_value args[${Math.max(1, fn.params.length)}];
    size_t argc = ${fn.params.length};
${declarations.join("\n")}
${resultDeclaration}
    napi_value result = NULL;

    if (!sagejs_native_check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != ${fn.params.length})
    {
        napi_throw_type_error(env, NULL, "wrong native argument count");
        return NULL;
    }
${initialization.join("\n")}
${resultInitialization}
${parsing.join("\n")}
    if (!native_${fn.name}(env, ${resultArgument}` +
      `${argumentsList.length ? `, ${argumentsList.join(", ")}` : ""}))
        goto fail;
${resultCreation}
${cleanup.join("\n")}
${resultCleanup}
    return result;

fail:
${cleanup.join("\n")}
${resultCleanup}
    return NULL;
}`;
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
          `${cName(operation.index)}++)`,
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

function generateC(ir) {
  const functionMap = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const exactFunctions = ir.functions.filter(
    (fn) => fn.kernelKind === "integer",
  );
  const fieldFunctions = ir.functions.filter(
    (fn) => fn.kernelKind !== "integer",
  );
  const prototypes = exactFunctions
    .map((fn) => internalSignature(fn, true))
    .join("\n");
  const functions = [
    prototypes,
    ...exactFunctions.map((fn) => emitExactInternalFunction(fn, functionMap)),
    ...exactFunctions.map(emitExactWrapper),
    ...fieldFunctions.map(emitFunction),
  ].filter(Boolean).join("\n\n");
  const properties = ir.functions
    .map(
      (fn) =>
        `        {${cString(fn.name)}, NULL, compiled_${fn.name}, ` +
        "NULL, NULL, NULL, napi_default, NULL}",
    )
    .join(",\n");
  return `// Generated by Sage.js Native Kernel v4.
#include <math.h>
#include <limits.h>
#include <stdint.h>
#include <stdlib.h>

#include <node_api.h>
#include <gmp.h>
#include <sagejs/native.h>

static void set_mpz_uint64(mpz_t target, uint64_t value)
{
#if ULONG_MAX >= UINT64_MAX
    mpz_set_ui(target, (unsigned long) value);
#else
    mpz_import(target, 1, -1, sizeof(value), 0, 0, &value);
#endif
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
${functions}

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

module.exports = {
  NATIVE_ABI_VERSION,
  generateC,
};
