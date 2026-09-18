// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");
const {
  sanitizerEnvironment,
} = require("../../../test/helpers/sanitizers.cjs");

const repositoryRoot = resolve(__dirname, "../../..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(repositoryRoot, "packages", "flint", ".native", "prefix"),
);

const source = String.raw`
from sagejs.native import Int64Buffer, IntegerBuffer, NativeWorkspaceArena, int64_record, integer_buffer_view, native, uint64


def fill_workspace(
    values: IntegerBuffer,
    output: IntegerBuffer,
    length: uint64,
    stop: uint64,
) -> int:
    index: uint64 = 0
    while index < length:
        values[index] = int(index) + 1
        output[index] = values[index] * values[index]
        if index == stop:
            return -7
        index += 1
    return 0


def first_sign(signs: Int64Buffer) -> int:
    return int(signs[0])


@native
def int64_view_argument(signs: Int64Buffer, length: uint64) -> int:
    return first_sign(int64_record(signs, 1, length))


@native
def workspace_success(
    output: IntegerBuffer,
    length: uint64,
    memory_limit: uint64,
) -> int:
    with NativeWorkspaceArena(memory_limit) as arena:
        values = arena.integer_buffer(length, 2)
        scratch = arena.integer_buffer(length, 1)
        status = fill_workspace(values, output, length, length)
        if status != 0:
            return status
        view = integer_buffer_view(scratch, 0, length)
        view[0] = values[length - 1]
        return view[0]


@native
def workspace_early_return(
    output: IntegerBuffer,
    length: uint64,
    memory_limit: uint64,
) -> int:
    with NativeWorkspaceArena(memory_limit) as arena:
        values = arena.integer_buffer(length, 2)
        return fill_workspace(values, output, length, 1)


@native
def workspace_parent(
    output: IntegerBuffer,
    length: uint64,
    memory_limit: uint64,
) -> int:
    return workspace_success(output, length, memory_limit)


@native
def workspace_explicit_uint64(
    output: IntegerBuffer,
    length: int,
    memory_limit: uint64,
) -> int:
    with NativeWorkspaceArena(memory_limit) as arena:
        values = arena.integer_buffer(uint64(length + 1), 2)
        values[length] = length
        output[0] = values[length]
        return output[0]
`;

function functionBody(text, marker) {
  let start = text.indexOf(marker);
  while (
    start !== -1 &&
    text.slice(start, text.indexOf("\n", start)).endsWith(";")
  ) {
    start = text.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted function ${marker}`);
  const next = text.indexOf("\nstatic int ", start + marker.length);
  return text.slice(start, next === -1 ? text.length : next);
}

test("NativeWorkspaceArena lowers to checked packed storage with lexical cleanup", async () => {
  const ir = await lowerSource(source, "native-workspace-arena.py");
  const root = ir.functions.find((fn) => fn.name === "workspace_success");
  const scope = root.body.find((operation) =>
    operation.kind === "workspace.arena.scope"
  );
  assert(scope);
  assert.deepEqual(scope.children.map((child) => child.wordCapacity), ["2", "1"]);
  assert.deepEqual(scope.children.map((child) => child.type), [
    "WorkspaceIntegerBuffer",
    "WorkspaceIntegerBuffer",
  ]);
  assert.equal(root.hostCallable, true);
  assert.equal(root.analysis.backend.kind, "gmp");
  assert.equal(root.analysis.storage.escapedValues.length, 0);
  const parent = ir.functions.find((fn) => fn.name === "workspace_parent");
  assert.equal(parent.analysis.backend.kind, "gmp");
  assert.equal(parent.analysis.backend.requiresExactWorkspace, true);
  assert(
    ir.functions.some((fn) => fn.name === "int64_view_argument"),
    "an Int64Record view must satisfy an Int64Buffer call parameter",
  );

  const explicit = ir.functions.find(
    (fn) => fn.name === "workspace_explicit_uint64",
  );
  const explicitScope = explicit.body.find((operation) =>
    operation.kind === "workspace.arena.scope"
  );
  assert(explicitScope);
  assert.equal(explicitScope.children[0].wordCapacity, "2");
  assert.ok(
    explicitScope.body.some(
      (operation) => operation.kind === "uint64.from_integer_checked",
    ),
    "explicit uint64 arena length must use a checked exact-to-word conversion",
  );

  const core = generateHostCore(ir);
  assert.equal(core.audit.hostCallbacks, 0);
  const generated = core.source;
  assert.doesNotMatch(generated, /static int tagged_workspace_parent\(/u);
  assert.match(
    functionBody(generated, "static int native_workspace_parent("),
    /native_workspace_success\(/u,
  );
  assert.match(generated, /typedef struct\s*\{\s*uint64_t limit;\s*uint64_t charged;\s*int open;\s*\} sagejs_native_workspace_arena;/u);
  assert.match(generated, /exact_capacity > SIZE_MAX \/ exact_length/u);
  assert.match(generated, /total > arena->limit - arena->charged/u);
  assert.match(generated, /calloc\(exact_length, sizeof\(int32_t\)\)/u);
  assert.match(generated, /calloc\(limb_count, sizeof\(uint64_t\)\)/u);
  assert.match(
    generated,
    /free\(buffer->limbs\);\s*free\(buffer->sizes\);\s*memset\(buffer, 0, sizeof\(\*buffer\)\);\s*arena->charged -= total;/u,
  );
  const emitted = functionBody(
    generated,
    "static int native_workspace_success(",
  );
  const scratchCleanup = emitted.lastIndexOf(
    "sagejs_native_workspace_integer_buffer_clear(&sagejs_scratch",
  );
  const valuesCleanup = emitted.lastIndexOf(
    "sagejs_native_workspace_integer_buffer_clear(&sagejs_values",
  );
  const arenaCleanup = emitted.lastIndexOf(
    "sagejs_native_workspace_arena_clear(&sagejs_arena)",
  );
  assert.ok(scratchCleanup >= 0 && valuesCleanup > scratchCleanup);
  assert.ok(arenaCleanup > valuesCleanup);
  assert.match(emitted, /mpz_init/u);
  assert.match(emitted, /mpz_clear/u);
  assert.doesNotMatch(emitted, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/u);
});

test("NativeWorkspaceArena executes success, early return, and budget failure", {
  timeout: 180_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-workspace-arena-"));
  try {
    const sourcePath = join(temporary, "native_workspace_arena.py");
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "cache"),
    });
    const module = require(compiled.modulePath);
    const success = module.workspace_success;
    const early = module.workspace_early_return;
    const parent = module.workspace_parent;
    const explicit = module.workspace_explicit_uint64;
    const int64View = module.int64_view_argument;
    assert.equal(success.nativeAvailable, true);
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const output = success.createIntegerBuffer(8, 2);
      assert.equal(success.gmp(output, 8n, 256n), 8n);
      assert.deepEqual(output.toArray(), [1n, 4n, 9n, 16n, 25n, 36n, 49n, 64n]);
      const stopped = early.createIntegerBuffer(8, 2);
      assert.equal(early.gmp(stopped, 8n, 160n), -7n);
      assert.deepEqual(stopped.toArray().slice(0, 3), [1n, 4n, 0n]);
    }
    const output = success.createIntegerBuffer(8, 2);
    assert.throws(
      () => success.gmp(output, 8n, 255n),
      /NativeWorkspaceArena memory limit exceeded/u,
    );
    assert.throws(
      () => success.gmp(output, (1n << 64n) - 1n, (1n << 64n) - 1n),
      /workspace IntegerBuffer (?:limb count|byte count) overflow/u,
    );
    const javascriptOutput = success.createIntegerBuffer(8, 2);
    assert.equal(success.javascript(javascriptOutput, 8n, 256n), 8n);
    assert.deepEqual(
      javascriptOutput.toArray(),
      [1n, 4n, 9n, 16n, 25n, 36n, 49n, 64n],
    );
    assert.throws(
      () => success.javascript(javascriptOutput, 8n, 255n),
      /NativeWorkspaceArena memory limit exceeded/u,
    );
    const parentOutput = parent.createIntegerBuffer(8, 2);
    assert.equal(parent.gmp(parentOutput, 8n, 256n), 8n);
    assert.deepEqual(parentOutput.toArray(), [1n, 4n, 9n, 16n, 25n, 36n, 49n, 64n]);
    const explicitOutput = explicit.createIntegerBuffer(1, 1);
    assert.equal(explicit.gmp(explicitOutput, 7n, 256n), 7n);
    assert.deepEqual(explicitOutput.toArray(), [7n]);
    assert.throws(
      () => explicit.gmp(explicitOutput, -2n, 256n),
      /integer is outside unsigned 64-bit/u,
    );
    const signs = int64View.createInt64Buffer([11n, -22n, 33n, -44n]);
    assert.equal(int64View.gmp(signs, 2n), -22n);
    assert.equal(int64View.javascript([11n, -22n, 33n, -44n], 2n), -22n);
    assert.throws(
      () => int64View.gmp(signs, 4n),
      /Int64Record is outside its buffer/u,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("NativeWorkspaceArena rejects malformed, nested, and escaping programs", async () => {
  const cases = [
    [
      "nonliteral capacity",
      `from sagejs.native import NativeWorkspaceArena, native, uint64\n@native\ndef bad(n: uint64, c: uint64) -> int:\n    with NativeWorkspaceArena(1000) as arena:\n        values = arena.integer_buffer(n, c)\n        return 0\n`,
      /word capacity must be a positive uint64 literal/u,
    ],
    [
      "zero capacity",
      `from sagejs.native import NativeWorkspaceArena, native, uint64\n@native\ndef bad(n: uint64) -> int:\n    with NativeWorkspaceArena(1000) as arena:\n        values = arena.integer_buffer(n, 0)\n        return 0\n`,
      /word capacity must be a positive uint64 literal/u,
    ],
    [
      "loop allocation",
      `from sagejs.native import NativeWorkspaceArena, native, uint64\n@native\ndef bad(n: uint64) -> int:\n    with NativeWorkspaceArena(1000) as arena:\n        while n > 0:\n            values = arena.integer_buffer(n, 1)\n            n -= 1\n        return 0\n`,
      /cannot be allocated repeatedly in a native loop/u,
    ],
    [
      "owner alias",
      `from sagejs.native import NativeWorkspaceArena, native, uint64\n@native\ndef bad(n: uint64) -> int:\n    with NativeWorkspaceArena(1000) as arena:\n        values = arena.integer_buffer(n, 1)\n        alias = values\n        return 0\n`,
      /cannot be aliased or captured/u,
    ],
    [
      "owner return",
      `from sagejs.native import IntegerBuffer, NativeWorkspaceArena, native, uint64\n@native\ndef bad(n: uint64) -> IntegerBuffer:\n    with NativeWorkspaceArena(1000) as arena:\n        values = arena.integer_buffer(n, 1)\n        return values\n`,
      /borrowed buffer values cannot be returned/u,
    ],
    [
      "nested workspace arena",
      `from sagejs.native import NativeWorkspaceArena, native\n@native\ndef bad() -> int:\n    with NativeWorkspaceArena(1000) as outer:\n        with NativeWorkspaceArena(1000) as inner:\n            values = inner.integer_buffer(1, 1)\n            return 0\n`,
      /nested NativeWorkspaceArena or NativeExactArena scopes/u,
    ],
    [
      "nested exact arena",
      `from sagejs.native import NativeExactArena, NativeWorkspaceArena, native\n@native\ndef bad() -> int:\n    with NativeWorkspaceArena(1000) as outer:\n        with NativeExactArena(1000, 1000) as inner:\n            values = inner.integer_vector(1, 8)\n            return 0\n`,
      /nested NativeExactArena or NativeWorkspaceArena scopes/u,
    ],
    [
      "missing terminal return",
      `from sagejs.native import NativeWorkspaceArena, native\n@native\ndef bad() -> int:\n    with NativeWorkspaceArena(1000) as arena:\n        values = arena.integer_buffer(1, 1)\n    return 0\n`,
      /body must end with an unconditional return/u,
    ],
  ];
  for (const [label, program, pattern] of cases) {
    await assert.rejects(() => lowerSource(program, `${label}.py`), pattern);
  }
});

test("NativeWorkspaceArena ordinary Python fallback accounts and invalidates", () => {
  const program = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(repositoryRoot, "src", "lib"))})
from sagejs.native import NativeWorkspaceArena

arena = NativeWorkspaceArena(40)
with arena:
    child = arena.integer_buffer(2, 2)
    assert child == [0, 0]
assert child == []
try:
    arena.integer_buffer(1, 1)
except ValueError as error:
    assert str(error) == "NativeWorkspaceArena is closed"
else:
    raise AssertionError("closed arena accepted an allocation")

try:
    with NativeWorkspaceArena(39) as too_small:
        too_small.integer_buffer(2, 2)
except MemoryError as error:
    assert str(error) == "NativeWorkspaceArena memory limit exceeded"
else:
    raise AssertionError("budget overflow succeeded")

try:
    NativeWorkspaceArena(1 << 64)
except OverflowError:
    pass
else:
    raise AssertionError("uint64 overflow succeeded")

escaped = None
try:
    with NativeWorkspaceArena(12) as exceptional:
        escaped = exceptional.integer_buffer(1, 1)
        raise RuntimeError("sentinel")
except RuntimeError:
    pass
assert escaped == []
`;
  const result = spawnSync(process.env.PYTHON || "python3", ["-c", program], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("NativeWorkspaceArena cleanup survives ASan, UBSan, and LeakSanitizer", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
  timeout: 180_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-workspace-arena-asan-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const ir = await lowerSource(source, "native-workspace-arena-asan.py");
  const core = generateHostCore(ir);
  writeFileSync(join(temporary, "kernel_core.c"), core.source);
  writeFileSync(join(temporary, "kernel_core.h"), core.header);
  writeFileSync(join(temporary, "allocator.h"), String.raw`
#include <stdlib.h>
void *sagejs_test_calloc(size_t count, size_t size);
#define calloc sagejs_test_calloc
`);
  writeFileSync(join(temporary, "harness.c"), String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "kernel_core.h"

#undef calloc
static int sagejs_test_calloc_failure = -1;
static int sagejs_test_calloc_calls = 0;

void *sagejs_test_calloc(size_t count, size_t size)
{
    if (sagejs_test_calloc_calls++ == sagejs_test_calloc_failure)
        return NULL;
    return calloc(count, size);
}

int main(void)
{
    enum { LENGTH = 8, CAPACITY = 2 };
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    int32_t sizes[LENGTH] = {0};
    uint64_t limbs[LENGTH * CAPACITY] = {0};
    sagejs_integer_buffer output = { sizes, limbs, LENGTH, CAPACITY };
    mpz_t answer;
    mpz_init(answer);
    for (unsigned round = 0; round < 100; round += 1)
    {
        status.code = SAGEJS_NATIVE_OK;
        status.message = NULL;
        assert(sagejs_kernel_workspace_success(
            &status, answer, output, LENGTH, UINT64_C(256)));
        assert(mpz_cmp_ui(answer, 8) == 0);
        status.code = SAGEJS_NATIVE_OK;
        status.message = NULL;
        assert(sagejs_kernel_workspace_early_return(
            &status, answer, output, LENGTH, UINT64_C(160)));
        assert(mpz_cmp_si(answer, -7) == 0);
    }
    status.code = SAGEJS_NATIVE_OK;
    status.message = NULL;
    assert(!sagejs_kernel_workspace_success(
        &status, answer, output, LENGTH, UINT64_C(255)));
    assert(status.code == SAGEJS_NATIVE_ERROR);
    assert(strcmp(status.message,
        "NativeWorkspaceArena memory limit exceeded") == 0);
    status.code = SAGEJS_NATIVE_OK;
    status.message = NULL;
    assert(!sagejs_kernel_workspace_success(
        &status, answer, output, UINT64_MAX, UINT64_MAX));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    for (sagejs_test_calloc_failure = 0;
         sagejs_test_calloc_failure < 2;
         sagejs_test_calloc_failure += 1)
    {
        sagejs_test_calloc_calls = 0;
        status.code = SAGEJS_NATIVE_OK;
        status.message = NULL;
        assert(!sagejs_kernel_workspace_success(
            &status, answer, output, LENGTH, UINT64_C(256)));
        assert(status.code == SAGEJS_NATIVE_ERROR);
        assert(strcmp(status.message,
            "NativeWorkspaceArena IntegerBuffer allocation failed") == 0);
    }
    mpz_clear(answer);
    return 0;
}
`);
  const executable = join(temporary, "native-workspace-arena-sanitizer");
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
    "-include",
    join(temporary, "allocator.h"),
    `-I${temporary}`,
    `-I${join(flintPrefix, "include")}`,
    join(temporary, "kernel_core.c"),
    join(temporary, "harness.c"),
    join(flintPrefix, "lib", "libgmp.a"),
    "-lm",
    "-lpthread",
    "-ldl",
    "-o",
    executable,
  ], { cwd: repositoryRoot, encoding: "utf8", timeout: 120_000 });
  assert.equal(
    build.status,
    0,
    `sanitizer compile failed:\n${build.stdout}${build.stderr}`,
  );
  const result = spawnSync(executable, [], {
    cwd: repositoryRoot,
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
