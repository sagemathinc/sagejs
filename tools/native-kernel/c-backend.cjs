"use strict";

const NATIVE_ABI_VERSION = 1;

function cString(value) {
  return JSON.stringify(String(value));
}

function cName(name) {
  return `sagejs_${name}`;
}

function nativeValue(local) {
  return local.storage === "return"
    ? `${cName(local.name)}->value`
    : cName(local.name);
}

function emitOperation(operation, locals, indent) {
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
  throw new Error(`unsupported C IR operation ${operation.kind}`);
}

function emitFunction(fn) {
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
    if (operation.kind === "real.constant") {
      const local = locals.get(operation.target);
      statements.push(
        `    if (mpfr_set_str(${nativeValue(local)}, ` +
          `${cString(operation.value)}, 10, MPFR_RNDN) != 0)`,
        "    {",
        '        napi_throw_type_error(env, NULL, "invalid native literal");',
        "        goto fail;",
        "    }",
      );
    } else if (operation.kind === "complex.constant") {
      const local = locals.get(operation.target);
      statements.push(
        `    if (mpfr_set_str(mpc_realref(${nativeValue(local)}), ` +
          `${cString(operation.real)}, 10, MPFR_RNDN) != 0 ||`,
        `        mpfr_set_str(mpc_imagref(${nativeValue(local)}), ` +
          `${cString(operation.imag)}, 10, MPFR_RNDN) != 0)`,
        "    {",
        '        napi_throw_type_error(env, NULL, "invalid native literal");',
        "        goto fail;",
        "    }",
      );
    } else if (operation.kind === "loop.range") {
      statements.push(
        `    for (${cName(operation.index)} = 0; ` +
          `${cName(operation.index)} < ${cName(operation.count)}; ` +
          `${cName(operation.index)}++)`,
        "    {",
      );
      for (const item of operation.body)
        statements.push(emitOperation(item, locals, "        "));
      statements.push("    }");
    } else if (operation.kind !== "return") {
      throw new Error(`unsupported C IR statement ${operation.kind}`);
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

function generateC(ir) {
  const functions = ir.functions.map(emitFunction).join("\n");
  const properties = ir.functions
    .map(
      (fn) =>
        `        {${cString(fn.name)}, NULL, compiled_${fn.name}, ` +
        "NULL, NULL, NULL, napi_default, NULL}",
    )
    .join(",\n");
  return `// Generated by Sage.js Native Kernel v0.
#include <math.h>
#include <stdint.h>

#include <node_api.h>
#include <sagejs/native.h>

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
