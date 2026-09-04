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
const {
  sanitizerEnvironment,
} = require("../../../test/helpers/sanitizers.cjs");

const root = resolve(__dirname, "../../..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

const source = String.raw`
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


@native
def fmpz_buffer_step(value: int, divisor: int, bias: int) -> int:
    quotient = value // divisor
    remainder = value % divisor
    return quotient * 17 + remainder + bias


@native
def resident_fmpz_integer_buffers(
    output: IntegerBuffer,
    source: IntegerBuffer,
    count: uint64,
    divisor: int,
    bias: int,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(128, 0)
        if len(output) < count + 1 or len(source) < count:
            return -1
        index: uint64 = 0
        checksum = 0
        while index < count:
            transformed = fmpz_buffer_step(source[index], divisor, bias)
            values[index] = transformed
            output[index] = values[index]
            checksum += output[index]
            index += 1
        tail = fmpz_buffer_step(source[-1], divisor, bias)
        output[-1] = tail
        return checksum + output[-1]
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
  const markers = ["\nstatic ", "\nint sagejs_kernel_"];
  const candidates = markers
    .map((next) => text.indexOf(next, start + marker.length))
    .filter((value) => value !== -1);
  const end = candidates.length === 0 ? text.length : Math.min(...candidates);
  return text.slice(start, end);
}

test("closed fmpz roots admit borrowed packed integer ingress and publication", async () => {
  const ir = await lowerSource(source, "fmpz-buffer-ingress.py");
  const functions = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const rootFunction = functions.get("resident_fmpz_integer_buffers");
  assert.equal(rootFunction.analysis.backend.kind, "fmpz");
  assert.equal(
    rootFunction.analysis.backend.qualification,
    "direct-fmpz-packed-buffer-call-graph-v3",
  );
  assert.equal(
    rootFunction.analysis.fmpzExact.residentContainers,
    "inline-promoting-fmpz-vector-and-borrowed-packed-integer-buffer",
  );
  assert.match(rootFunction.analysis.fmpzExact.hostBoundary, /packed-limb-views/);
  assert.equal(functions.get("fmpz_buffer_step").analysis.backend.kind, "fmpz");

  const core = generateHostCore(ir).source;
  const implementation = emittedFunction(
    core,
    "static int fmpz_native_resident_fmpz_integer_buffers(",
  );
  assert.match(
    implementation,
    /sagejs_integer_buffer sagejs_arg_output/,
  );
  assert.match(implementation, /sagejs_integer_buffer_get_fmpz/);
  assert.match(implementation, /sagejs_integer_buffer_set_fmpz/);
  assert.match(implementation, /sagejs_fmpz_integer_buffer_index/);
  assert.doesNotMatch(implementation, /sagejs_integer_buffer_(?:get|set)_mpz/);
  assert.doesNotMatch(implementation, /fmpz_(?:set|get)_mpz/);
  assert.doesNotMatch(implementation, /\bmpz_/);

  const ingress = emittedFunction(
    core,
    "static void sagejs_integer_buffer_get_fmpz(",
  );
  const publication = emittedFunction(
    core,
    "static int sagejs_integer_buffer_set_fmpz(",
  );
  assert.match(ingress, /fmpz_set_ui_array/);
  assert.match(publication, /fmpz_get_signed_ui_array/);
  assert.match(publication, /const uint64_t inverted = ~slot\[limb\]/);
  assert.doesNotMatch(ingress + publication, /\bmpz_/);

  const publicBridge = emittedFunction(
    core,
    "int sagejs_kernel_resident_fmpz_integer_buffers(",
  );
  assert.match(publicBridge, /fmpz_native_resident_fmpz_integer_buffers/);
  assert.match(publicBridge, /fmpz_set_mpz/);
  assert.match(publicBridge, /fmpz_get_mpz/);
  assert.doesNotMatch(publicBridge, /integer_buffer_(?:get|set)_mpz/);
});

test("IntegerBuffer parameters stay root-only and unsupported views fail closed", async () => {
  const bufferHelper = source.replace(
    "def fmpz_buffer_step(value: int, divisor: int, bias: int) -> int:\n" +
      "    quotient = value // divisor",
    "def fmpz_buffer_step(value: int, divisor: int, bias: int, " +
      "source: IntegerBuffer) -> int:\n" +
      "    value += source[0]\n" +
      "    quotient = value // divisor",
  ).replace(
    "fmpz_buffer_step(source[index], divisor, bias)",
    "fmpz_buffer_step(source[index], divisor, bias, source)",
  ).replace(
    "fmpz_buffer_step(source[-1], divisor, bias)",
    "fmpz_buffer_step(source[-1], divisor, bias, source)",
  );
  const helperIr = await lowerSource(bufferHelper, "fmpz-buffer-helper.py");
  assert.notEqual(
    helperIr.functions.find((fn) =>
      fn.name === "resident_fmpz_integer_buffers"
    ).analysis.backend.kind,
    "fmpz",
  );
  assert.notEqual(
    helperIr.functions.find((fn) => fn.name === "fmpz_buffer_step")
      .analysis.backend.kind,
    "fmpz",
  );

  const copied = source.replace(
    "values = arena.integer_vector(128, 0)",
    "values = arena.integer_vector(128, 0)\n        copied = source",
  );
  const copiedIr = await lowerSource(copied, "fmpz-buffer-copy.py");
  assert.notEqual(
    copiedIr.functions.find((fn) =>
      fn.name === "resident_fmpz_integer_buffers"
    ).analysis.backend.kind,
    "fmpz",
  );
});

test("direct packed fmpz views agree for small, negative, and promoted integers", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-buffer-"));
  try {
    const sourcePath = join(temporary, "fmpz_buffer_ingress.py");
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "cache"),
    });
    const backendInput = compiled.foreignInputs.find(
      (input) => input.id === "sagejs-resident-fmpz",
    );
    assert.ok(backendInput);
    assert.equal(backendInput.headers[0].name, "flint/fmpz.h");
    assert.match(backendInput.libraries[0].name, /flint/);
    const runner = String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const root = module.resident_fmpz_integer_buffers;
assert.equal(root.backendPolicy.kind, "fmpz");
assert.equal(root.nativeAvailable, true);

const datasets = [
  [0n, 1n, -1n, 37n, -91n],
  [(1n << 255n) + 123n, -((1n << 511n) + 77n), 9n, -13n],
  [(1n << 4095n) + 51n, -((1n << 3901n) + 99n), 17n],
];
for (const values of datasets) {
  const implementations = [
    root,
    root.fmpz,
    root.tagged,
    root.gmp,
    root.javascript,
  ];
  const results = implementations.map((implementation) => {
    const input = root.packIntegerBuffer(values, 128);
    const output = root.createIntegerBuffer(values.length + 1, 128);
    const answer = implementation(
      output,
      input,
      BigInt(values.length),
      -((1n << 70n) + 3n),
      (1n << 130n) + 19n,
      32n << 20n,
      64n << 20n,
    );
    return [answer, output.toArray()];
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
}

const aliasSource = [17n, -31n, 1n << 255n, -(1n << 511n), 99n, -7n];
const aliasResults = [root.fmpz, root.tagged, root.gmp, root.javascript].map(
  (implementation) => {
    const aliased = root.packIntegerBuffer(aliasSource, 128);
    const answer = implementation(
      aliased,
      aliased,
      5n,
      -37n,
      (1n << 130n) + 19n,
      32n << 20n,
      64n << 20n,
    );
    return [answer, aliased.toArray()];
  },
);
for (const result of aliasResults.slice(1)) {
  assert.deepEqual(result, aliasResults[0]);
}

const promoted = root.packIntegerBuffer([(1n << 4095n) + 7n], 64);
const tooSmall = root.createIntegerBuffer(2, 1);
assert.throws(
  () => root.fmpz(
    tooSmall,
    promoted,
    1n,
    3n,
    5n,
    32n << 20n,
    64n << 20n,
  ),
  /IntegerBuffer word capacity exceeded/,
);
const output = root.createIntegerBuffer(2, 128);
assert.throws(
  () => root.fmpz(output, promoted, 1n, 0n, 5n, 32n << 20n, 64n << 20n),
  /division or modulo by zero/,
);
assert.equal(
  typeof root.fmpz(output, promoted, 1n, 3n, 5n, 32n << 20n, 64n << 20n),
  "bigint",
);
`;
    const result = spawnSync(
      process.execPath,
      ["-e", runner, compiled.modulePath],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const core = readFileSync(compiled.coreSourcePath, "utf8");
    const implementation = emittedFunction(
      core,
      "static int fmpz_native_resident_fmpz_integer_buffers(",
    );
    assert.doesNotMatch(implementation, /\bmpz_/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("borrowed packed views survive success and failure under sanitizers", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const ir = await lowerSource(source, "fmpz-buffer-sanitizer.py");
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-buffer-asan-"));
  const harness = String.raw`
#include <assert.h>
#include <stdint.h>
#include <string.h>
#include <gmp.h>
#include "kernel_core.h"

int main(void)
{
    enum { CAPACITY = 64, SOURCE_LENGTH = 3, OUTPUT_LENGTH = 4 };
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    int32_t source_sizes[SOURCE_LENGTH] = {1, -64, 2};
    int32_t output_sizes[OUTPUT_LENGTH] = {0};
    uint64_t source_limbs[SOURCE_LENGTH * CAPACITY] = {0};
    uint64_t output_limbs[OUTPUT_LENGTH * CAPACITY] = {0};
    sagejs_integer_buffer source_buffer = {
        source_sizes, source_limbs, SOURCE_LENGTH, CAPACITY
    };
    sagejs_integer_buffer output_buffer = {
        output_sizes, output_limbs, OUTPUT_LENGTH, CAPACITY
    };
    sagejs_integer_buffer short_output = {
        output_sizes, output_limbs, OUTPUT_LENGTH, 1
    };
    mpz_t result, divisor, bias;
    mpz_inits(result, divisor, bias, NULL);
    mpz_set_si(divisor, -37);
    mpz_ui_pow_ui(bias, 2, 130);
    mpz_add_ui(bias, bias, 19);
    source_limbs[0] = 17;
    for (size_t limb = 0; limb < CAPACITY; limb += 1)
        source_limbs[CAPACITY + limb] = UINT64_MAX - limb;
    source_limbs[2 * CAPACITY] = UINT64_MAX;
    source_limbs[2 * CAPACITY + 1] = 1;

    for (unsigned round = 0; round < 250; round += 1)
    {
        assert(sagejs_kernel_resident_fmpz_integer_buffers(
            &status, result, output_buffer, source_buffer, SOURCE_LENGTH,
            divisor, bias, 32U << 20, 64U << 20));
        assert(status.code == SAGEJS_NATIVE_OK);
        assert(output_sizes[OUTPUT_LENGTH - 1] != 0);
    }

    mpz_set_ui(result, 123);
    assert(!sagejs_kernel_resident_fmpz_integer_buffers(
        &status, result, short_output, source_buffer, SOURCE_LENGTH,
        divisor, bias, 32U << 20, 64U << 20));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    assert(mpz_cmp_ui(result, 123) == 0);

    assert(sagejs_kernel_resident_fmpz_integer_buffers(
        &status, result, output_buffer, source_buffer, SOURCE_LENGTH,
        divisor, bias, 32U << 20, 64U << 20));
    assert(status.code == SAGEJS_NATIVE_OK);
    mpz_clears(result, divisor, bias, NULL);
    return 0;
}
`;
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "harness.c"), harness);
    const executable = join(temporary, "fmpz-buffer-sanitizer");
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
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
      "-Wl,--start-group",
      join(prefix, "lib", "libflint.a"),
      join(prefix, "lib", "libmpfr.a"),
      join(prefix, "lib", "libgmp.a"),
      join(prefix, "lib", "libopenblas.a"),
      "-Wl,--end-group",
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
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment({ strictStringChecks: true }),
      timeout: 120_000,
    });
    assert.equal(
      run.status,
      0,
      `sanitizer harness failed: ${run.error?.message || ""}\n` +
        `${run.stdout}${run.stderr}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
