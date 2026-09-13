// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX ||
  join(root, "packages/flint/.native/prefix"));
const source = `
from sagejs.native import NativeExactArena, NativeIntegerVector, native, uint64


@native
def nested_while(value: int, outer_limit: uint64, inner_limit: uint64) -> int:
    result = value
    outer: uint64 = 0
    while outer < outer_limit:
        outer += 1
        if outer % 3 == 0:
            continue
        inner: uint64 = 0
        while inner < inner_limit:
            inner += 1
            if inner == 2:
                continue
            if inner == 4:
                break
            result = result * 2 + outer + inner
        if outer == 5:
            break
    return result


@native
def exact_while(start: int, stop: int, pause: int) -> tuple[int, int]:
    current = start
    result = 0
    while current < stop:
        current += 1
        if current == pause:
            continue
        if current == pause + 2:
            break
        result += current
    return result, current


@native
def range_containing_while(limit: uint64) -> int:
    result = 0
    for outer in range(limit):
        inner: uint64 = 0
        while inner < 10:
            inner += 1
            if inner == 2:
                continue
            if inner == 4:
                break
            result += outer + inner
    return result


@native
def scoped_while(value: int, limit: uint64, memory: uint64) -> int:
    result = value
    outer: uint64 = 0
    while outer < limit:
        outer += 1
        with NativeIntegerVector(1, memory) as values:
            values[0] = result
            inner: uint64 = 0
            while inner < 10:
                inner += 1
                if inner == 2:
                    continue
                if inner == 4:
                    break
                values[0] = values[0] + inner
            result = values[0]
    return result


@native
def resident_while(
    value: int, limit: uint64, fail: bool,
    memory: uint64, temporary: uint64,
) -> int:
    with NativeExactArena(memory, temporary) as arena:
        retained = arena.integer_vector(2, 0)
        retained[0] = value
        iteration: uint64 = 0
        while iteration < limit:
            iteration += 1
            if iteration == 2:
                continue
            retained[0] = nested_while(retained[0], 2, 3)
            if fail and iteration == 3:
                raise ZeroDivisionError
            if iteration == 4:
                break
        retained[1] = retained[0] + 7
        return retained[1]
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 120_000, ...options,
  });
  assert.equal(result.status, 0,
    `${result.error || ""}\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

function visit(operations, callback) {
  for (const operation of operations) {
    callback(operation);
    for (const block of [operation.setup, operation.body,
      operation.alternative, operation.condition?.operations]) {
      if (block) visit(block, callback);
    }
  }
}

test("while transfers retain provenance and one resident lifetime in all emitters", async () => {
  const ir = await lowerSource(source, "native-while-control-transfer.py");
  assert.equal(ir.version, 39);
  const operations = [];
  for (const fn of ir.functions) visit(fn.body, op => operations.push(op));
  assert.ok(operations.some(op => op.kind === "loop.break"));
  assert.ok(operations.some(op => op.kind === "loop.continue"));
  for (const operation of operations.filter(op =>
    op.kind === "loop.break" || op.kind === "loop.continue")) {
    assert.equal(operation.provenance.file, "native-while-control-transfer.py");
    assert.ok(operation.provenance.start.line > 0);
    assert.ok(operation.id);
  }
  const resident = ir.functions.find(fn => fn.name === "resident_while");
  assert.equal(resident.analysis.backend.kind, "fmpz");
  assert.equal(resident.analysis.liveExactWorkspace.scopes.length, 1);
  assert.equal(resident.analysis.liveExactWorkspace.scopes[0]
    .checkpointLifetime.placement, "immediately-after-arena-init-before-child-init");
  const core = generateHostCore(ir).source;
  for (const name of ["native_nested_while", "fmpz_native_nested_while",
    "tagged_nested_while", "word_nested_while"]) {
    const implementation = core.match(new RegExp(
      `(?:static|SAGEJS_WORD_INLINE)[^\\n]* ${name}\\([^;]+?\\n\\{[\\s\\S]*?\\n\\}`));
    assert.ok(implementation, `${name} missing`);
    assert.match(implementation[0], /continue;/);
    assert.match(implementation[0], /break;/);
  }
  assert.doesNotMatch(core, /\bnapi_|\bPyObject\b|checkpoint_rewind/);
});

for (const transfer of ["break", "continue"]) {
  test(`${transfer} without a loop fails closed`, async () => {
    await assert.rejects(lowerSource(`
from sagejs.native import native
@native
def no_loop(value: int) -> int:
    ${transfer}
    return value
`, "no-loop.py"), /enclosing while loop|outside.*loop|not.*loop/i);
  });
  for (const owner of ["NativeIntegerVector(1, memory)",
    "NativeIntegerMatrix(1, 1, memory)", "NativeExactArena(memory, memory)"]) {
    test(`${transfer} cannot skip ${owner.split("(")[0]} cleanup`, async () => {
      const code = `
from sagejs.native import NativeExactArena, NativeIntegerVector, NativeIntegerMatrix, native, uint64
@native
def escape(memory: uint64) -> int:
    while memory > 0:
        with ${owner} as owner:
            ${transfer}
            return 0
    return 1
`;
      await assert.rejects(lowerSource(code, "unsafe-while-scope.py"),
        new RegExp(`native ${transfer} cannot exit a live exact resource scope`));
    });
  }
  test(`${transfer} does not accidentally target a while outside a range`, async () => {
    const code = `
from sagejs.native import native, uint64
@native
def range_target(limit: uint64) -> int:
    while limit > 0:
        for index in range(limit):
            ${transfer}
        limit -= 1
    return 0
`;
    await assert.rejects(lowerSource(code, "range-target.py"),
      /supports while-loop targets, not range loops/);
  });
}

test("while/else remains an explicit unsupported boundary", async () => {
  await assert.rejects(lowerSource(`
from sagejs.native import native
@native
def while_else(value: int) -> int:
    while value > 0:
        break
    else:
        return 1
    return 0
`, "while-else.py"), /while\/else is not yet supported/);
});

test("same-source CPython, JavaScript, tagged, GMP and fmpz agree", async t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-while-transfer-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, "while_transfer.py");
  writeFileSync(sourcePath, source);
  const compiled = await compileKernel({ sourcePath,
    cacheRoot: join(directory, "cache") });
  const python = `
import json, sys
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
sys.path.insert(0, ${JSON.stringify(directory)})
from while_transfer import nested_while, exact_while, range_containing_while, scoped_while, resident_while
values = [0, -7, (1 << 62) - 1, 1 << 200, -(1 << 255)]
rows = []
for value in values:
    for outer in range(9):
        for inner in range(7):
            rows.append([str(value), outer, inner, str(nested_while(value, outer, inner))])
for value in values:
    for limit in range(7):
        assert scoped_while(value, limit, 1 << 20) == value + 4 * limit
        if limit >= 3:
            try:
                resident_while(value, limit, True, 1 << 20, 1 << 20)
            except ZeroDivisionError:
                pass
            else:
                raise AssertionError('missing exception')
print(json.dumps({
    'nested': rows,
    'exact': [[str(value), *map(str, exact_while(value, value + 7, value + 2))] for value in values],
    'resident': [[str(value), limit, str(resident_while(value, limit, False, 1 << 20, 1 << 20))] for value in values for limit in range(7)],
    'range': [str(range_containing_while(limit)) for limit in range(9)]
}))
`;
  const oracle = run(pythonExecutable(), ["-I", "-c", python]);
  const runner = String.raw`
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const oracle = JSON.parse(process.argv[2]);
for (const implementation of [module.exact_while.javascript,
    module.exact_while.tagged, module.exact_while.gmp]) {
  for (const [initial, total, last] of oracle.exact) {
    const start = BigInt(initial);
    assert.deepEqual(implementation(start, start + 7n, start + 2n),
      [BigInt(total), BigInt(last)]);
    assert.deepEqual(implementation(start, start, start + 2n), [0n, start]);
  }
}
for (const [name, rows] of [["nested_while", oracle.nested],
    ["resident_while", oracle.resident]]) {
  const fn = module[name];
  for (const implementation of [fn, fn.javascript, fn.tagged, fn.gmp, fn.fmpz]) {
    assert.equal(typeof implementation, "function", name);
    for (const row of rows) {
      const value = BigInt(row[0]), limit = BigInt(row[1]);
      if (name === "nested_while") {
        assert.equal(implementation(value, limit, BigInt(row[2])), BigInt(row[3]));
      } else {
        const args = [value, limit, false, 1n << 20n, 1n << 20n];
        assert.equal(implementation(...args), BigInt(row[2]));
        if (limit >= 3n) {
          assert.throws(() => implementation(value, limit, true, 1n << 20n, 1n << 20n), /division by zero/);
          assert.equal(implementation(...args), BigInt(row[2]));
        }
      }
    }
  }
}
for (const implementation of [module.range_containing_while.javascript,
    module.range_containing_while.tagged, module.range_containing_while.gmp]) {
  for (let limit = 0; limit < oracle.range.length; limit++) {
    assert.equal(implementation(BigInt(limit)), BigInt(oracle.range[limit]));
  }
}
for (const implementation of [module.scoped_while.javascript,
    module.scoped_while.tagged, module.scoped_while.gmp]) {
  for (const value of [0n, -7n, 1n << 200n]) {
    assert.equal(implementation(value, 7n, 1n << 20n), value + 28n);
    assert.throws(() => implementation(value, 1n, 0n), /memory|limit|arena|budget/i);
    assert.equal(implementation(value, 3n, 1n << 20n), value + 12n);
  }
}
`;
  run(process.execPath, ["-e", runner, compiled.modulePath, oracle]);
});

test("resident transfers retain cleanup on exceptions and exhaustion under sanitizers", {
  skip: process.platform === "win32" ? "standalone sanitizer harness is Unix-only" : false,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-while-transfer-sanitizer-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const ir = await lowerSource(source, "native-while-control-transfer.py");
  const core = generateHostCore(ir);
  writeFileSync(join(directory, "kernel_core.c"), core.source);
  writeFileSync(join(directory, "kernel_core.h"), core.header);
  writeFileSync(join(directory, "harness.c"), `
#include <assert.h>
#include <gmp.h>
#include <flint/flint.h>
#include "kernel_core.c"
int main(void) {
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    mpz_t value, output, expected;
    mpz_inits(value, output, expected, NULL);
    for (int backend = 0; backend < 2; backend++) {
      for (int round = 0; round < 24; round++) {
        mpz_set_ui(value, 1);
        mpz_mul_2exp(value, value, round % 2 ? 255 : 80);
        mpz_set_ui(output, 991);
        for (int mode = 0; mode < 4; mode++) {
          status.code = SAGEJS_NATIVE_OK;
          status.message = NULL;
          const uint64_t memory = mode == 1 ? 0 : 1u << 20;
          const uint64_t temporary = mode == 2 ? 16 : 1u << 20;
          const int fail = mode == 0;
          const int ok = backend
            ? native_resident_while(&status, output, value, 7, fail, memory, temporary)
            : sagejs_kernel_resident_while(&status, output, value, 7, fail, memory, temporary);
          if (mode < 3) {
            assert(!ok);
            assert(status.code != SAGEJS_NATIVE_OK);
            assert(mpz_cmp_ui(output, 991) == 0);
          } else {
            assert(ok);
            mpz_set(expected, value);
            for (int iteration = 0; iteration < 3; iteration++) {
              for (int outer = 1; outer <= 2; outer++) {
                for (int inner = 1; inner <= 3; inner += 2) {
                  mpz_mul_2exp(expected, expected, 1);
                  mpz_add_ui(expected, expected, outer + inner);
                }
              }
            }
            mpz_add_ui(expected, expected, 7);
            assert(mpz_cmp(output, expected) == 0);
          }
        }
      }
    }
    /* A scope entered inside a loop closes normally after its INNER loop
       breaks. Repeat under ASan/LSan so bypassed owner cleanup is observable. */
    for (int round = 0; round < 24; round++) {
      status.code = SAGEJS_NATIVE_OK;
      status.message = NULL;
      assert(native_scoped_while(&status, output, value, 7, 1u << 20));
      mpz_add_ui(expected, value, 28);
      assert(mpz_cmp(output, expected) == 0);
    }
    mpz_clears(value, output, expected, NULL);
    flint_cleanup();
    return 0;
}
`);
  const executable = join(directory, "while-transfer-sanitizer");
  run(process.env.CC || "cc", [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    process.platform === "darwin" ? "-fsanitize=undefined" : "-fsanitize=address,undefined",
    `-I${directory}`, `-I${join(prefix, "include")}`,
    `-I${join(root, "packages/flint/include")}`,
    join(directory, "harness.c"), `-L${join(prefix, "lib")}`,
    "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
    "-o", executable,
  ]);
  run(executable, [], { env: sanitizerEnvironment({ strictStringChecks: true }) });
});
