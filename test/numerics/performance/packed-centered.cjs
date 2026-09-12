// sagejs-test-tier: native
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../../../tools/native-kernel/ir.cjs");
const { generateHostCore } = require("../../../tools/native-kernel/c-backend.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");
const { inspectToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const { compileFloat64Wasm, runFloat64Cases, runBrowserCases } = require("../../helpers/float64-wasm.cjs");

const root = path.resolve(__dirname, "../../..");
const sourcePath = path.join(root, "src/lib/sagejs/numerics/statistics/_packed_centered.py");
const names = ["prepare_centered", "prepare_products", "prepare_summary_checks"];
const toBits = (value) => { const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value); return bytes.toString("hex"); };
const fromBits = (hex) => Buffer.from(hex, "hex").readDoubleBE();

async function closeSession(session) {
  const ready = session.ready().catch(() => {});
  await session.close();
  await ready;
}

function corpus() {
  const run = spawnSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"),
    ["-I", path.join(__dirname, "packed-centered.py")], {
      cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.schema, "sagejs.packed-centered-oracle/v1");
  assert.equal(result.cases.length, 296);
  return result.cases;
}

test("ordinary Sage.js centered reductions retain the dynamic same-source fallback", { timeout: 180000 }, async () => {
  const before = process.env.SAGEJS_NATIVE_DISABLE;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  let sage;
  try {
    sage = await require(path.join(root, "dist/tools/kernel.js")).createSage({ mode: "python" });
    const result = await sage.evaluate(fs.readFileSync(sourcePath, "utf8") + `
from sagejs.native import is_compiled
assert not is_compiled(prepare_centered)
assert not is_compiled(prepare_products)
for values, center, scale, expected in [
    ([10.0, 12.0, 14.0], 12.0, 2.0, [-1.0, 0.0, 1.0]),
    ([5e-324, -5e-324], 0.0, 5e-324, [1.0, -1.0]),
    ([7.0, 7.0], 7.0, 0.0, [0.0, 0.0]),
]:
    count = len(values)
    deviations = [131.0] * count
    normalized = [137.0] * count
    squares = [139.0] * count
    output = [27.0, -31.0]
    assert prepare_centered(values, deviations, normalized, squares, output, center, count) == 0.0
    assert normalized == expected and output == [scale, -31.0]
    products = [149.0] * count
    assert prepare_products(normalized, normalized, products, output, count) == 0.0
    assert products == squares and output == [float(count), -31.0]
output = [27.0, -31.0]
assert prepare_centered([-1.7976931348623157e308], [0.0], [0.0], [0.0], output, 1.7976931348623157e308, 1) == 1.0
assert output == [27.0, -31.0]
assert prepare_centered([1.0], [], [0.0], [0.0], output, 0.0, 1) == 2.0
assert output == [27.0, -31.0]
print("centered dynamic fallback passed")
`, { language: "python", timeout: 120000 });
    assert.equal(result.error, undefined, JSON.stringify(result.error));
    assert.equal(result.stdout.trim(), "centered dynamic fallback passed");
  } finally {
    if (sage) await closeSession(sage);
    if (before === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = before;
  }
});

test("centered regions agree with exact rational rounding in native and JavaScript IR", { timeout: 180000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-centered-"));
  try {
    const cases = corpus();
    const artifact = await compileKernel({ sourcePath, cacheRoot: directory });
    const module = require(artifact.modulePath);
    const sort = module.prepare_centered.sortedFloat64Buffer;
    const input = Float64Array.of(3, -0, 0, -0, -2, 0, 3);
    const original = Array.from(input, toBits);
    const sorted = sort(input);
    assert.deepEqual(Array.from(sorted, toBits), [-2, -0, 0, -0, 0, 3, 3].map(toBits));
    assert.deepEqual(Array.from(input, toBits), original);
    sorted[0] = 123;
    assert.deepEqual(Array.from(input, toBits), original, "sorted storage must be detached");
    assert.deepEqual(Array.from(sort([])), []);
    assert.deepEqual(Array.from(sort([Object(2), 1])), [1, 2]);
    let coercions = 0;
    assert.throws(() => sort([{ valueOf() { coercions++; return 1; } }]));
    assert.equal(coercions, 0, "sorting must not invoke arbitrary scalar coercions");
    for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => sort([value]));
    for (const route of ["native", "javascript"]) {
      for (const row of cases) {
        const fn = module[names[row.function_index]];
        assert.equal(fn.nativeAvailable, true);
        const args = row.arguments.map((arg) => arg.type === "buffer" ? Float64Array.from(arg.value, fromBits)
          : arg.type === "float" ? fromBits(arg.value) : Number(arg.value));
        const status = (route === "native" ? fn : fn.javascript)(...args);
        assert.deepEqual({ status, buffers: args.filter((arg) => arg instanceof Float64Array)
          .map((values) => Array.from(values, toBits)) }, row.expected, route + ": " + row.name);
      }
    }
  } finally {
    removeLoadedNativeCache(directory);
  }
});

test("centered regions execute identically in isolated Node-Wasm and browser workers", {
  skip: inspectToolchain({ root }).ready || process.env.SAGEJS_NUMERICAL_BROWSER_TESTS === "1"
    ? false : "prepared WASI toolchain required",
  timeout: 180000,
}, async () => {
  assert.equal(inspectToolchain({ root }).ready, true,
    "explicit browser qualification requires the prepared WASI toolchain");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-centered-wasm-"));
  try {
    const cases = corpus();
    const payload = { ...await compileFloat64Wasm(sourcePath, directory, names), cases };
    const expected = cases.map((row) => row.expected);
    assert.deepEqual(await runFloat64Cases(payload), expected);
    if (process.env.SAGEJS_NUMERICAL_BROWSER_TESTS === "1") {
      for (const engine of ["chromium", "firefox", "webkit"]) {
        assert.deepEqual(await runBrowserCases(engine, runFloat64Cases, payload), expected, engine);
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("centered regions preserve their complete corpus under address/undefined/leak checks", {
  skip: process.env.SAGEJS_NUMERICAL_SANITIZER_TESTS !== "1"
    ? "set SAGEJS_NUMERICAL_SANITIZER_TESTS=1 on a qualified sanitizer host" : false,
  timeout: 180000,
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-centered-sanitizers-"));
  try {
    const ir = await lowerSource(fs.readFileSync(sourcePath, "utf8"), sourcePath);
    const core = generateHostCore(ir, { moduleIdentity: "5ae0000000000004" });
    for (const [name, content] of [["kernel_core.c", core.source], ["kernel_core.h", core.header]]) {
      fs.writeFileSync(path.join(directory, name), content);
    }
    const cases = corpus();
    const rows = cases.map((row, caseIndex) => {
      const setup = [], checks = [], cleanup = [], args = [];
      let bufferIndex = 0;
      for (const [index, arg] of row.arguments.entries()) {
        if (arg.type === "buffer") {
          const count = arg.value.length, name = "b" + index;
          setup.push(`double *${name} = calloc(${count + 2}, sizeof(double)); assert(${name});`,
            `${name}[0] = 17.0; ${name}[${count + 1}] = 19.0;`);
          for (const [i, hex] of arg.value.entries()) setup.push(`${name}[${i + 1}] = from_bits(UINT64_C(0x${hex}));`);
          args.push(`(sagejs_float64_buffer){${name} + 1, ${count}}`);
          checks.push(`assert(${name}[0] == 17.0 && ${name}[${count + 1}] == 19.0);`);
          for (const [i, hex] of row.expected.buffers[bufferIndex++].entries()) {
            checks.push(`assert(bits_of(${name}[${i + 1}]) == UINT64_C(0x${hex}));`);
          }
          cleanup.push(`free(${name});`);
        } else if (arg.type === "float") args.push(`from_bits(UINT64_C(0x${arg.value}))`);
        else args.push(`UINT64_C(${arg.value})`);
      }
      return `static void case_${caseIndex}(void) { ${setup.join("\n")}\n double returned = -1; sagejs_native_status status = {0, NULL};
assert(sagejs_kernel_${names[row.function_index]}(&status, &returned, ${args.join(",")}));
assert(status.code == SAGEJS_NATIVE_OK && returned == ${row.expected.status});
${checks.join("\n")}\n${cleanup.join("\n")} }`;
    }).join("\n");
    fs.writeFileSync(path.join(directory, "driver.c"), `
#include <assert.h>
#include <stdlib.h>
#include <string.h>
#include "kernel_core.h"
static double from_bits(uint64_t bits) { double x; memcpy(&x, &bits, 8); return x; }
static uint64_t bits_of(double x) { uint64_t bits; memcpy(&bits, &x, 8); return bits; }
${rows}
int main(void) { ${cases.map((_, index) => `case_${index}();`).join("\n")} return 0; }
`);
    const executable = path.join(directory, process.platform === "win32" ? "driver.exe" : "driver");
    // Optimize the actual mathematical core, not thousands of literal oracle
    // assertions. A monolithic optimized driver obscures compiler failures by
    // spending its entire timeout constant-folding the test fixture itself.
    const flags = ["-std=c11", "-g", "-ffp-contract=off", "-fno-omit-frame-pointer",
      "-fsanitize=address,undefined", "-I", directory];
    for (const args of [
      [...flags, "-O1", "-c", path.join(directory, "kernel_core.c"), "-o", path.join(directory, "core.o")],
      [...flags, "-O0", "-c", path.join(directory, "driver.c"), "-o", path.join(directory, "driver.o")],
      ["-fsanitize=address,undefined", path.join(directory, "core.o"), path.join(directory, "driver.o"), "-lm", "-o", executable],
    ]) {
      const compiled = spawnSync(process.env.CC || "cc", args,
        {encoding: "utf8", timeout: 120000, detached: process.platform !== "win32"});
      if (compiled.error) {
        if (process.platform !== "win32" && compiled.pid) {
          try { process.kill(-compiled.pid, "SIGKILL"); } catch {}
        }
        throw compiled.error;
      }
      assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    }
    const result = spawnSync(executable, [], {encoding: "utf8", timeout: 60000,
      env: {...process.env, ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1", UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1"}});
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    fs.rmSync(directory, {recursive:true, force:true});
  }
});
