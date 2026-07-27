"use strict";

// A deliberately narrow proof of concept for a native Sage.js backend.
// It parses a Sage.js function through the real compiler AST, validates one
// statically typed ComplexField loop shape, emits C/MPC, and builds a Node
// addon. It is an experiment, not yet a supported language feature.

const { existsSync, mkdirSync, readFileSync, writeFileSync } =
  require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const createCompiler = require("..");

const root = resolve(__dirname, "..");
const nativePrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

function fail(message) {
  throw new Error(`native compiler: ${message}`);
}

function nodeType(node) {
  return node?.constructor?.name;
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function array(value) {
  return Array.from(value || []);
}

function assignment(statement, description) {
  expect(
    nodeType(statement) === "AST_SimpleStatement" &&
      nodeType(statement.body) === "AST_Assign" &&
      statement.body.operator === "=",
    `expected ${description} to be a simple assignment`,
  );
  return statement.body;
}

function complexConstructor(assignmentNode, fieldName, description) {
  const call = assignmentNode.right;
  expect(
    nodeType(call) === "AST_Call" &&
      nodeType(call.expression) === "AST_SymbolRef" &&
      call.expression.name === fieldName,
    `expected ${description} to call ${fieldName}`,
  );
  const args = array(call.args);
  expect(
    args.length === 2 &&
      nodeType(args[0]) === "AST_String" &&
      nodeType(args[1]) === "AST_String",
    `expected ${description} to have two string literal components`,
  );
  return [args[0].value, args[1].value];
}

function analyze(source, filename) {
  const compiler = createCompiler();
  const toplevel = compiler.parse(source, {
    filename,
    jsage: true,
  });
  const statements = array(toplevel.body);
  expect(
    statements.length === 1 && nodeType(statements[0]) === "AST_Function",
    "expected exactly one top-level function",
  );
  const fn = statements[0];
  expect(
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(fn.name.name),
    "proof-of-concept native function names must be C identifiers",
  );
  const args = array(fn.argnames);
  expect(args.length === 2, "expected field and iteration arguments");
  const fieldName = args[0].name;
  const iterationsName = args[1].name;
  const body = array(fn.body);
  expect(body.length === 4, "expected two initializers, one loop, and return");

  const valueAssignment = assignment(body[0], "value initializer");
  const stepAssignment = assignment(body[1], "step initializer");
  expect(
    nodeType(valueAssignment.left) === "AST_SymbolRef" &&
      nodeType(stepAssignment.left) === "AST_SymbolRef",
    "expected local names for complex values",
  );
  const valueName = valueAssignment.left.name;
  const stepName = stepAssignment.left.name;
  const initial = complexConstructor(
    valueAssignment,
    fieldName,
    "value initializer",
  );
  const step = complexConstructor(
    stepAssignment,
    fieldName,
    "step initializer",
  );

  const loop = body[2];
  expect(nodeType(loop) === "AST_ForIn", "expected a for loop");
  expect(
    nodeType(loop.object) === "AST_Call" &&
      nodeType(loop.object.expression) === "AST_SymbolRef" &&
      loop.object.expression.name === "range",
    "expected for ... in range(...)",
  );
  const rangeArgs = array(loop.object.args);
  expect(
    rangeArgs.length === 1 &&
      nodeType(rangeArgs[0]) === "AST_SymbolRef" &&
      rangeArgs[0].name === iterationsName,
    "expected range(iterations)",
  );
  const loopStatements = array(loop.body?.body);
  expect(loopStatements.length === 1, "expected one loop statement");
  const update = assignment(loopStatements[0], "loop update");
  expect(
    nodeType(update.left) === "AST_SymbolRef" &&
      update.left.name === valueName &&
      nodeType(update.right) === "AST_Binary" &&
      update.right.operator === "*" &&
      nodeType(update.right.left) === "AST_SymbolRef" &&
      update.right.left.name === valueName &&
      nodeType(update.right.right) === "AST_SymbolRef" &&
      update.right.right.name === stepName,
    `expected ${valueName} = ${valueName} * ${stepName}`,
  );

  const returned = body[3];
  expect(
    nodeType(returned) === "AST_Return" &&
      nodeType(returned.value) === "AST_SymbolRef" &&
      returned.value.name === valueName,
    `expected return ${valueName}`,
  );

  return {
    functionName: fn.name.name,
    initial,
    step,
  };
}

function cString(value) {
  return JSON.stringify(String(value));
}

function generateC(program) {
  const [initialReal, initialImag] = program.initial;
  const [stepReal, stepImag] = program.step;
  return `// Generated from Sage.js AST by tools/native-compiler-poc.cjs.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>
#include <mpc.h>
#include <mpfr.h>

static int check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;
    if (status == napi_ok)
        return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message
            : "Node-API call failed");
    return 0;
}

static char *roundtrip_string(mpfr_srcptr value)
{
    mpfr_exp_t exponent;
    char *digits = mpfr_get_str(NULL, &exponent, 10, 0, value, MPFR_RNDN);
    char *result;
    size_t sign;
    size_t count;
    int decimal_exponent;
    int length;

    if (digits == NULL)
        return NULL;
    sign = digits[0] == '-' ? 1 : 0;
    count = strlen(digits + sign);
    decimal_exponent = (int) exponent - (int) count;
    length = snprintf(NULL, 0, "%se%d", digits, decimal_exponent);
    result = malloc((size_t) length + 1);
    if (result != NULL)
        snprintf(result, (size_t) length + 1,
            "%se%d", digits, decimal_exponent);
    mpfr_free_str(digits);
    return result;
}

static napi_value compiled_${program.functionName}(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    size_t argc = 2;
    int64_t precision;
    double iterations_value;
    uint64_t iterations;
    uint64_t index;
    mpc_t value;
    mpc_t step;
    char *real = NULL;
    char *imag = NULL;
    napi_value result;
    napi_value component;

    if (!check_napi(env,
        napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != 2)
    {
        napi_throw_type_error(env, NULL, "expected precision and iterations");
        return NULL;
    }
    if (!check_napi(env, napi_get_value_int64(env, args[0], &precision)) ||
        !check_napi(env,
            napi_get_value_double(env, args[1], &iterations_value)))
        return NULL;
    if (precision < MPFR_PREC_MIN ||
        (uint64_t) precision > MPFR_PREC_MAX)
    {
        napi_throw_range_error(env, NULL, "invalid precision");
        return NULL;
    }
    if (!isfinite(iterations_value) || iterations_value < 0 ||
        iterations_value > 9007199254740991.0 ||
        floor(iterations_value) != iterations_value)
    {
        napi_throw_range_error(env, NULL, "invalid iteration count");
        return NULL;
    }
    iterations = (uint64_t) iterations_value;

    mpc_init2(value, (mpfr_prec_t) precision);
    mpc_init2(step, (mpfr_prec_t) precision);
    if (mpfr_set_str(mpc_realref(value), ${cString(initialReal)},
            10, MPFR_RNDN) != 0 ||
        mpfr_set_str(mpc_imagref(value), ${cString(initialImag)},
            10, MPFR_RNDN) != 0 ||
        mpfr_set_str(mpc_realref(step), ${cString(stepReal)},
            10, MPFR_RNDN) != 0 ||
        mpfr_set_str(mpc_imagref(step), ${cString(stepImag)},
            10, MPFR_RNDN) != 0)
    {
        mpc_clear(value);
        mpc_clear(step);
        napi_throw_type_error(env, NULL, "invalid generated numeric literal");
        return NULL;
    }

    for (index = 0; index < iterations; index++)
        mpc_mul(value, value, step, MPC_RNDNN);

    real = roundtrip_string(mpc_realref(value));
    imag = roundtrip_string(mpc_imagref(value));
    mpc_clear(value);
    mpc_clear(step);
    if (real == NULL || imag == NULL)
    {
        free(real);
        free(imag);
        napi_throw_error(env, NULL, "unable to format native result");
        return NULL;
    }
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_create_string_utf8(env, real, NAPI_AUTO_LENGTH, &component)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "real", component)) ||
        !check_napi(env,
            napi_create_string_utf8(env, imag, NAPI_AUTO_LENGTH, &component)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "imag", component)))
    {
        free(real);
        free(imag);
        return NULL;
    }
    free(real);
    free(imag);
    return result;
}

static napi_value initialize(napi_env env, napi_value exports)
{
    napi_property_descriptor property = {
        ${cString(program.functionName)}, NULL,
        compiled_${program.functionName},
        NULL, NULL, NULL, napi_default, NULL
    };
    if (!check_napi(env,
        napi_define_properties(env, exports, 1, &property)))
        return NULL;
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
`;
}

function compile(sourcePath, outputPath) {
  sourcePath = resolve(sourcePath);
  outputPath = resolve(outputPath);
  const source = readFileSync(sourcePath, "utf8");
  const program = analyze(source, sourcePath);
  mkdirSync(outputPath, { recursive: true });
  writeFileSync(join(outputPath, "addon.c"), generateC(program));
  writeFileSync(
    join(outputPath, "binding.gyp"),
    `${JSON.stringify(
      {
        targets: [
          {
            target_name: "sagejs_native_poc",
            sources: ["addon.c"],
            include_dirs: [join(nativePrefix, "include")],
            libraries: [
              join(nativePrefix, "lib", "libmpc.a"),
              join(nativePrefix, "lib", "libmpfr.a"),
              "-lgmp",
              "-lm",
            ],
            defines: ["NAPI_VERSION=8"],
            cflags: ["-O3", "-fPIC", "-Wall", "-Wextra"],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  expect(
    existsSync(join(nativePrefix, "lib", "libmpc.a")),
    "native MPC dependencies are not built; run pnpm --dir packages/flint build",
  );
  const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
    paths: [join(root, "packages", "flint")],
  });
  const build = spawnSync(process.execPath, [nodeGyp, "rebuild"], {
    cwd: outputPath,
    encoding: "utf8",
  });
  if (build.status !== 0) {
    process.stderr.write(build.stdout);
    process.stderr.write(build.stderr);
    fail(`node-gyp exited with status ${build.status}`);
  }
  return {
    functionName: program.functionName,
    modulePath: join(
      outputPath,
      "build",
      "Release",
      "sagejs_native_poc.node",
    ),
  };
}

module.exports = { analyze, compile, generateC };

if (require.main === module) {
  const sourcePath =
    process.argv[2] || join(root, "bench", "native-compiler-input.sage");
  const outputPath =
    process.argv[3] || join(root, "bench", ".native-poc");
  const result = compile(sourcePath, outputPath);
  process.stdout.write(`${result.modulePath}\n`);
}
