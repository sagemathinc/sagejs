// sagejs-test-tier: native
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");
const { inspectToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const { closeSession } = require("../../../bench/numerics/performance/run.cjs");
const { compileFloat64Wasm, runFloat64Cases, runBrowserCases } = require("../../helpers/float64-wasm.cjs");

const root = path.resolve(__dirname, "../../..");
const sourcePath = path.join(root, "src/lib/sagejs/numerics/statistics/_packed_centered.py");
const names = ["prepare_centered", "prepare_products"];
const toBits = (value) => { const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value); return bytes.toString("hex"); };
const fromBits = (hex) => Buffer.from(hex, "hex").readDoubleBE();

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
  assert.equal(result.cases.length, 198);
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
  skip: inspectToolchain({ root }).ready ? false : "prepared WASI toolchain required",
  timeout: 180000,
}, async () => {
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
