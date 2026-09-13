// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");
const { generateJavaScript } = require("../js-backend.cjs");
const {
  sanitizerEnvironment,
} = require("../../../test/helpers/sanitizers.cjs");

const root = resolve(__dirname, "../../..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

const source = String.raw`
from math import sqrt

from sagejs.native import (
    NativeExactArena,
    UInt64Buffer,
    checked_uint64,
    native,
    uint64,
)


@native
def resident_range(
    start: int,
    stop: int,
    step: int,
    prior: int,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> tuple[int, int, int]:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(1, 0)
        values[0] = 0
        visible = prior
        count = 0
        for visible in range(start, stop, step):
            values[0] = values[0] + visible
            count += 1
            visible = -999
            start = 123
            stop = 123
            step = 0
        return values[0], count, visible


@native
def range_count(start: int, stop: int, step: int) -> int:
    count = 0
    for visible in range(start, stop, step):
        count += 1
        visible = -77
        start = 0
        stop = 0
        step = 0
    return count


@native
def aliased_range(start: int, stop: int, step: int) -> int:
    total = 0
    for start in range(start, stop, step):
        total += start
    return total


@native
def promoted_range(base: int, start: int, stop: int, step: int) -> int:
    total = base
    for visible in range(start, stop, step):
        total += visible
    return total


@native
def bounded_range(
    stop: uint64, step: uint64, prior: uint64
) -> tuple[uint64, uint64]:
    total: uint64 = 0
    visible: uint64 = prior
    for visible in range(0, stop, step):
        total += visible
        visible = 99
        stop = 0
        step = 0
    return total, visible


@native
def record_range_argument(
    log: UInt64Buffer, position: uint64, value: int
) -> int:
    sequence = log[3]
    log[position] = sequence
    log[3] = sequence + 1
    return value


@native
def ordered_range(
    log: UInt64Buffer,
    start: int,
    stop: int,
    step: int,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(1, 0)
        values[0] = 0
        for visible in range(
            record_range_argument(log, 0, start),
            record_range_argument(log, 1, stop),
            record_range_argument(log, 2, step),
        ):
            values[0] = values[0] + visible
        return values[0]


@native
def generator_sum_order(step: int, divisor: int) -> int:
    return sum((i for i in range(0, 10, step)), 1 // divisor)


@native
def generator_error_order(divisor: int) -> int:
    return sum((round(sqrt(-1)) for i in range(0, 1, 1)), 1 // divisor)


@native
def eager_sum_order(start_divisor: int) -> int:
    return sum(
        [round(sqrt(-1)) for i in range(0, 1, 1)],
        1 // start_divisor,
    )
`;

function emittedFunction(text, marker) {
  let start = text.indexOf(marker);
  while (
    start !== -1 &&
    text.slice(start, text.indexOf("\n", start)).endsWith(";")
  ) {
    start = text.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted function ${marker}`);
  const brace = text.indexOf("{", start);
  assert.notEqual(brace, -1);
  let depth = 0;
  for (let index = brace; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  assert.fail(`unterminated emitted function ${marker}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function executableBody(fn) {
  const scope = fn.body.find((operation) => operation.kind === "integer.arena.scope");
  return scope?.body || fn.body;
}

test("range IR freezes arguments and separates iterator from target", async () => {
  const ir = await lowerSource(source, "exact-range-semantics.py");
  const functions = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const resident = functions.get("resident_range");
  const residentBody = executableBody(resident);
  const loop = residentBody.find((operation) =>
    operation.kind === "loop.range_exact"
  );
  assert.notEqual(loop, undefined);
  assert.notEqual(loop.iterator, loop.index);
  assert.deepEqual(
    [loop.start, loop.stop, loop.step].map((name) =>
      resident.locals.find((local) => local.name === name)?.type
    ),
    ["Integer", "Integer", "Integer"],
  );
  const loopPosition = residentBody.indexOf(loop);
  const validationPosition = residentBody.findIndex((operation) =>
    operation.kind === "range.validate_step"
  );
  assert.ok(validationPosition >= 0 && validationPosition < loopPosition);
  assert.deepEqual(
    residentBody.slice(validationPosition - 3, validationPosition).map(
      (operation) => operation.kind
    ),
    ["integer.copy", "integer.copy", "integer.copy"],
  );

  const bounded = functions.get("bounded_range");
  const boundedLoop = bounded.body.find((operation) =>
    operation.kind === "loop.range"
  );
  assert.notEqual(boundedLoop, undefined);
  assert.notEqual(boundedLoop.iterator, boundedLoop.index);

  const generator = functions.get("generator_sum_order");
  const generatorValidation = generator.body.findIndex((operation) =>
    operation.kind === "range.validate_step"
  );
  const generatorStartDivision = generator.body.findIndex((operation) =>
    operation.kind === "integer.binary" && operation.operation === "floordiv"
  );
  assert.ok(generatorValidation < generatorStartDivision);
  assert.ok(generatorStartDivision < generator.body.findIndex((operation) =>
    operation.kind.startsWith("loop.range")
  ));

  const eager = functions.get("eager_sum_order");
  const eagerLoop = eager.body.findIndex((operation) =>
    operation.kind.startsWith("loop.range")
  );
  const eagerStartDivision = eager.body.findIndex((operation, index) =>
    index > eagerLoop && operation.kind === "integer.binary" &&
      operation.operation === "floordiv"
  );
  assert.ok(eagerLoop >= 0 && eagerStartDivision > eagerLoop);

  assert.equal(resident.analysis.backend.kind, "fmpz");
  assert.equal(functions.get("ordered_range").analysis.backend.kind, "fmpz");
  assert.ok(resident.analysis.effects.mayRaise.includes("ValueError"));
});

test("every exact backend emits frozen signed range semantics", async () => {
  const ir = await lowerSource(source, "exact-range-emission.py");
  const core = generateHostCore(ir).source;
  const javascript = generateJavaScript(ir);
  const fmpz = emittedFunction(
    core,
    "static int fmpz_native_resident_range(",
  );
  const gmp = emittedFunction(core, "static int native_resident_range(");
  const tagged = emittedFunction(core, "static int tagged_range_count(");
  const word = emittedFunction(core, "SAGEJS_WORD_INLINE int word_range_count(");

  assert.match(fmpz, /fmpz_is_zero/);
  assert.match(fmpz, /fmpz_sgn/);
  assert.match(fmpz, /fmpz_cmp/);
  assert.match(fmpz, /fmpz_add/);
  assert.doesNotMatch(fmpz, /\bmpz_/);
  assert.match(gmp, /mpz_sgn/);
  assert.match(gmp, /mpz_cmp/);
  assert.match(gmp, /mpz_add/);
  assert.match(tagged, /sagejs_tagged_sgn/);
  assert.match(tagged, /sagejs_tagged_cmp/);
  assert.match(tagged, /sagejs_tagged_add/);
  assert.match(word, /sagejs_word_add_int64/);
  assert.match(word, /if \(!sagejs_word_add_int64\([\s\S]*?\)\)\s+break;/);
  assert.match(javascript, /range\(\) arg 3 must not be zero/);
  assert.match(javascript, /while \([^\n]* > 0n \?/);
  assert.doesNotMatch(core, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("range semantics agree in JavaScript, tagged, GMP, fmpz, and CPython", async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-exact-range-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sourcePath = join(temporary, "exact_range_semantics.py");
  writeFileSync(sourcePath, source);
  const compiled = await compileKernel({
    sourcePath,
    cacheRoot: join(temporary, "cache"),
  });
const runner = String.raw`
"use strict";
const assert = require("node:assert/strict");
globalThis.ValueError = class ValueError extends Error {};
globalThis.ZeroDivisionError = class ZeroDivisionError extends Error {};
const module = require(process.argv[1]);
const memory = 32n << 20n;
const temporary = 64n << 20n;
const tuple = (value) => Array.from(value, BigInt);
const resident = module.resident_range;
for (const implementation of [
  resident.javascript, resident.tagged, resident.gmp, resident.fmpz,
]) {
  assert.deepEqual(tuple(implementation(0n, 10n, 3n, 42n, memory, temporary)), [18n, 4n, -999n]);
  assert.deepEqual(tuple(implementation(10n, 0n, -3n, 42n, memory, temporary)), [22n, 4n, -999n]);
  assert.deepEqual(tuple(implementation(5n, 5n, 1n, 42n, memory, temporary)), [0n, 0n, 42n]);
  const huge = 1n << 200n;
  assert.deepEqual(tuple(implementation(huge, huge + 10n, 3n, 42n, memory, temporary)), [4n * huge + 18n, 4n, -999n]);
  assert.deepEqual(tuple(implementation(-huge, huge + 1n, huge, 42n, memory, temporary)), [0n, 3n, -999n]);
  assert.deepEqual(tuple(implementation(huge, -huge - 1n, -huge, 42n, memory, temporary)), [0n, 3n, -999n]);
  assert.throws(() => implementation(5n, 5n, 0n, 42n, memory, temporary), /range\(\) arg 3 must not be zero/);
  assert.throws(
    () => implementation(5n, 5n, 0n, 42n, memory, temporary),
    globalThis.ValueError,
  );
}
const count = module.range_count;
for (const implementation of [count.javascript, count.tagged, count.gmp]) {
  assert.equal(implementation((1n << 63n) - 2n, (1n << 63n) - 1n, 2n), 1n);
  assert.equal(implementation(-(1n << 63n) + 1n, -(1n << 63n), -2n), 1n);
}
for (const implementation of [
  module.aliased_range.javascript,
  module.aliased_range.tagged,
  module.aliased_range.gmp,
]) {
  assert.equal(implementation(1n, 8n, 2n), 16n);
}
for (const implementation of [
  module.promoted_range,
  module.promoted_range.javascript,
  module.promoted_range.tagged,
  module.promoted_range.gmp,
]) {
  assert.equal(
    implementation((1n << 63n) - 1n, 1n, 4n, 1n),
    (1n << 63n) + 5n,
  );
}
const bounded = module.bounded_range;
for (const implementation of [bounded.javascript, bounded.tagged, bounded.gmp]) {
  assert.deepEqual(tuple(implementation(10n, 3n, 42n)), [18n, 99n]);
  assert.deepEqual(tuple(implementation(0n, 1n, 42n)), [0n, 42n]);
  assert.throws(() => implementation(0n, 0n, 42n), /range\(\) arg 3 must not be zero/);
  const maximum = (1n << 64n) - 1n;
  assert.deepEqual(tuple(implementation(maximum, maximum - 1n, 42n)), [maximum - 1n, 99n]);
}
for (const implementation of [
  module.ordered_range.javascript,
  module.ordered_range.tagged,
  module.ordered_range.gmp,
  module.ordered_range.fmpz,
]) {
  const log = new BigUint64Array(4);
  assert.equal(implementation(log, 1n, 8n, 2n, memory, temporary), 16n);
  assert.deepEqual([...log], [0n, 1n, 2n, 3n]);
  const zeroLog = new BigUint64Array(4);
  assert.throws(
    () => implementation(zeroLog, 1n, 8n, 0n, memory, temporary),
    /range\(\) arg 3 must not be zero/,
  );
  assert.deepEqual([...zeroLog], [0n, 1n, 2n, 3n]);
}
for (const implementation of [
  module.generator_sum_order.javascript,
  module.generator_sum_order.tagged,
  module.generator_sum_order.gmp,
]) {
  assert.throws(() => implementation(0n, 0n), /range\(\) arg 3 must not be zero/);
}
for (const implementation of [
  module.generator_error_order.javascript,
  module.generator_error_order.tagged,
  module.generator_error_order.gmp,
]) {
  assert.throws(
    () => implementation(0n),
    globalThis.ZeroDivisionError,
  );
}
for (const implementation of [
  module.eager_sum_order.javascript,
  module.eager_sum_order.tagged,
  module.eager_sum_order.gmp,
]) {
  assert.throws(
    () => implementation(0n),
    globalThis.ValueError,
  );
}
`;
  run(process.execPath, ["-e", runner, compiled.modulePath]);

  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const cpython = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
    `sys.path.insert(0, ${JSON.stringify(temporary)})`,
    "from exact_range_semantics import *",
    "memory = 32 << 20",
    "temporary = 64 << 20",
    "assert resident_range(0, 10, 3, 42, memory, temporary) == (18, 4, -999)",
    "assert resident_range(10, 0, -3, 42, memory, temporary) == (22, 4, -999)",
    "assert resident_range(5, 5, 1, 42, memory, temporary) == (0, 0, 42)",
    "huge = 1 << 200",
    "assert resident_range(huge, huge + 10, 3, 42, memory, temporary) == (4 * huge + 18, 4, -999)",
    "assert resident_range(-huge, huge + 1, huge, 42, memory, temporary) == (0, 3, -999)",
    "assert resident_range(huge, -huge - 1, -huge, 42, memory, temporary) == (0, 3, -999)",
    "assert aliased_range(1, 8, 2) == 16",
    "assert promoted_range((1 << 63) - 1, 1, 4, 1) == (1 << 63) + 5",
    "log = [0, 0, 0, 0]",
    "assert ordered_range(log, 1, 8, 2, memory, temporary) == 16",
    "assert log == [0, 1, 2, 3]",
    "zero_log = [0, 0, 0, 0]",
    "try:",
    "    ordered_range(zero_log, 1, 8, 0, memory, temporary)",
    "except ValueError:",
    "    pass",
    "else:",
    "    raise AssertionError('zero range step succeeded')",
    "assert zero_log == [0, 1, 2, 3]",
    "try:",
    "    generator_error_order(0)",
    "except ZeroDivisionError:",
    "    pass",
    "else:",
    "    raise AssertionError('generator evaluated its body first')",
    "try:",
    "    eager_sum_order(0)",
    "except ValueError:",
    "    pass",
    "else:",
    "    raise AssertionError('list evaluated its start first')",
    "try:",
    "    generator_sum_order(0, 0)",
    "except ValueError as error:",
    "    assert str(error) == 'range() arg 3 must not be zero'",
    "else:",
    "    raise AssertionError('zero range step succeeded')",
    "print('cpython-exact-range-ok')",
    "",
  ].join("\n");
  assert.equal(run(python, ["-I", "-c", cpython]), "cpython-exact-range-ok");

});

test("exact range endpoints survive ASan and UBSan", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-range-sanitizer-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const ir = await lowerSource(source, "exact-range-sanitizer.py");
  const core = generateHostCore(ir);
  writeFileSync(join(temporary, "kernel_core.c"), core.source);
  writeFileSync(join(temporary, "kernel_core.h"), core.header);
  writeFileSync(join(temporary, "harness.c"), String.raw`
#include <assert.h>
#include <stdint.h>
#include <string.h>
#include "kernel_core.h"

int main(void)
{
    sagejs_native_status status = {0};
    mpz_t start, stop, step, prior, first, second, third;
    mpz_inits(start, stop, step, prior, first, second, third, NULL);

    mpz_set_si(start, 10);
    mpz_set_si(stop, 0);
    mpz_set_si(step, -3);
    mpz_set_si(prior, 42);
    assert(sagejs_kernel_resident_range(
        &status, first, second, third, start, stop, step, prior,
        UINT64_C(32) << 20, UINT64_C(64) << 20));
    assert(mpz_cmp_si(first, 22) == 0);
    assert(mpz_cmp_si(second, 4) == 0);
    assert(mpz_cmp_si(third, -999) == 0);

    mpz_set_si(start, INT64_MAX);
    mpz_sub_ui(start, start, 1);
    mpz_set_si(stop, INT64_MAX);
    mpz_set_ui(step, 2);
    assert(sagejs_kernel_range_count(&status, first, start, stop, step));
    assert(mpz_cmp_ui(first, 1) == 0);
    mpz_set_si(start, INT64_MIN);
    mpz_add_ui(start, start, 1);
    mpz_set_si(stop, INT64_MIN);
    mpz_set_si(step, -2);
    assert(sagejs_kernel_range_count(&status, first, start, stop, step));
    assert(mpz_cmp_ui(first, 1) == 0);

    status.code = SAGEJS_NATIVE_OK;
    status.message = NULL;
    mpz_set_ui(start, 1);
    mpz_mul_2exp(start, start, 200);
    mpz_add_ui(stop, start, 10);
    mpz_set_ui(step, 3);
    assert(sagejs_kernel_resident_range(
        &status, first, second, third, start, stop, step, prior,
        UINT64_C(32) << 20, UINT64_C(64) << 20));
    mpz_mul_ui(stop, start, 4);
    mpz_add_ui(stop, stop, 18);
    assert(mpz_cmp(first, stop) == 0);

    status.code = SAGEJS_NATIVE_OK;
    status.message = NULL;
    mpz_set_ui(first, 991);
    mpz_set_ui(second, 992);
    mpz_set_ui(third, 993);
    mpz_set_ui(start, 5);
    mpz_set_ui(stop, 5);
    mpz_set_ui(step, 0);
    assert(!sagejs_kernel_resident_range(
        &status, first, second, third, start, stop, step, prior,
        UINT64_C(32) << 20, UINT64_C(64) << 20));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    assert(strcmp(status.message, "range() arg 3 must not be zero") == 0);
    assert(mpz_cmp_ui(first, 991) == 0);
    assert(mpz_cmp_ui(second, 992) == 0);
    assert(mpz_cmp_ui(third, 993) == 0);

    mpz_clears(start, stop, step, prior, first, second, third, NULL);
    return 0;
}
`);
  const executable = join(temporary, "exact-range-sanitizer");
  const sanitizerFlags = process.platform === "darwin"
    ? ["-fsanitize=undefined"]
    : ["-fsanitize=address,undefined"];
  const libraries = [
    join(prefix, "lib", "libflint.a"),
    join(prefix, "lib", "libmpfr.a"),
    join(prefix, "lib", "libgmp.a"),
    join(prefix, "lib", "libopenblas.a"),
  ];
  const groupedLibraries = process.platform === "darwin"
    ? libraries
    : ["-Wl,--start-group", ...libraries, "-Wl,--end-group"];
  const build = spawnSync(process.env.CC || "cc", [
    "-std=c11",
    "-O1",
    "-g",
    "-Wall",
    "-Wextra",
    "-fno-omit-frame-pointer",
    ...sanitizerFlags,
    `-I${temporary}`,
    `-I${join(prefix, "include")}`,
    join(temporary, "kernel_core.c"),
    join(temporary, "harness.c"),
    ...groupedLibraries,
    "-lm",
    "-lpthread",
    "-ldl",
    "-o",
    executable,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(
    build.status,
    0,
    `sanitizer compile failed:\n${build.stdout}${build.stderr}`,
  );
  const result = spawnSync(executable, [], {
    cwd: root,
    encoding: "utf8",
    env: sanitizerEnvironment({ strictStringChecks: true }),
    timeout: 120_000,
  });
  assert.equal(
    result.status,
    0,
    `sanitizer harness failed: ${result.error?.message || ""}\n` +
      `${result.stdout}${result.stderr}`,
  );
});
