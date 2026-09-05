// sagejs-test-tier: native
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../../../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../../../tools/native-kernel/ir.cjs");
const { classifyWasmFunction, generateWasmBridge } = require("../../../tools/native-kernel/wasm-bridge.cjs");
const { inspectToolchain, wasmKernelToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const { closeSession } = require("../../../bench/numerics/performance/run.cjs");

const root = path.resolve(__dirname, "../../..");
const sourcePath = path.join(root, "src/lib/sagejs/numerics/statistics/_packed.py");

function oracle() {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const run = spawnSync(python, ["-I", path.join(__dirname, "packed-reductions.py")], {
    cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.schema, "sagejs.packed-sum-oracle/v1");
  assert.equal(result.cases.length, 200);
  return result.cases;
}

function toBits(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(value);
  return bytes.toString("hex");
}

function checkCases(implementation, cases) {
  for (const row of cases) {
    const input = Float64Array.from(row.values, (hex) => Buffer.from(hex, "hex").readDoubleBE());
    const scratch = new Float64Array(input.length);
    const output = new Float64Array([27, -31]);
    assert.equal(implementation(input, scratch, output, input.length), row.status, row.name);
    assert.equal(toBits(output[0]), row.answer, row.name);
    assert.equal(output[1], -31, row.name);
    assert.deepEqual(Array.from(input, toBits), row.values, row.name);
  }
  for (const [input, scratch, output, count] of [
    [[1], [0], [27], 2], [[1], [], [27], 1], [[1], [0], [], 1],
  ]) {
    const target = Float64Array.from(output);
    assert.equal(implementation(Float64Array.from(input), Float64Array.from(scratch), target, count), 2);
    assert.deepEqual(Array.from(target), output);
  }
}

test("finite sums have isolated, source-transparent binary64 lowering", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  assert.equal(ir.functions.length, 1);
  assert.equal(ir.functions[0].name, "finite_sum");
  assert.equal(ir.functions[0].kernelKind, "float64");
  assert.deepEqual(ir.functions[0].analysis.effects.mutates, ["output", "partials"]);
  assert.equal(classifyWasmFunction(ir.functions[0]).supported, true);
  const core = generateHostCore(ir, { moduleIdentity: "5ae0000000000002" });
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("ordinary Sage.js source preserves cancellation and final half-even rounding", {
  timeout: 180000,
}, async () => {
  const previous = process.env.SAGEJS_NATIVE_DISABLE;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  let sage;
  try {
    const { createSage } = require(path.join(root, "dist/tools/kernel.js"));
    sage = await createSage({ mode: "python" });
    const result = await sage.evaluate(readFileSync(sourcePath, "utf8") + `
from sagejs.native import is_compiled
assert not is_compiled(finite_sum)
for values, expected in [
    ([], 0.0),
    ([1e100, 1.0, -1e100], 1.0),
    ([1e16, 1.0, 1e-16], 10000000000000002.0),
    ([1e16, 1.0, -1e-16], 1e16),
    ([1.0, 5e-324, -1.0], 5e-324),
    ([0.1] * 100, 10.0),
]:
    output = [27.0, -31.0]
    assert finite_sum(values, [0.0] * len(values), output, len(values)) == 0.0
    assert output == [expected, -31.0]
for values in [[1.7976931348623157e308] * 2, [float("nan")], [float("inf")]]:
    output = [27.0]
    assert finite_sum(values, [0.0] * len(values), output, len(values)) == 1.0
    assert output == [27.0]
print("dynamic packed-sum witnesses passed")
`, { language: "python", timeout: 120000 });
    assert.equal(result.error, undefined, JSON.stringify(result.error));
    assert.equal(result.stdout.trim(), "dynamic packed-sum witnesses passed");
  } finally {
    if (sage) await closeSession(sage);
    if (previous === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = previous;
  }
});

test("packed summation agrees bit-for-bit with exact rationals and CPython", {
  timeout: 180000,
}, async () => {
  const cases = oracle();
  const temporary = mkdtempSync(path.join(tmpdir(), "sagejs-packed-sum-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot: temporary });
    assert.ok(compiled.addonPath);
    const module = require(compiled.modulePath);
    checkCases(module.finite_sum, cases);
    checkCases(module.finite_sum.javascript, cases);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

async function compileWasm(directory) {
  const toolchain = wasmKernelToolchain({ root });
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const moduleIdentity = "5ae0000000000002";
  const core = generateHostCore(ir, { moduleIdentity });
  const bridge = generateWasmBridge({ ir, moduleIdentity, functionNames: ["finite_sum"] });
  for (const [name, content] of [
    ["kernel_core.c", core.source], ["kernel_core.h", core.header],
    ["wasm_bridge.c", bridge.source],
  ]) writeFileSync(path.join(directory, name), content);
  const wasm = path.join(directory, "packed-sum.wasm");
  const compiled = spawnSync(toolchain.clang, [
    "--target=wasm32-wasi", `--sysroot=${toolchain.sysroot}`,
    "-mexec-model=reactor", "-O2", "-ffp-contract=off",
    `-I${directory}`, `-I${path.join(toolchain.gmpPrefix, "include")}`,
    path.join(directory, "kernel_core.c"), path.join(directory, "wasm_bridge.c"),
    `-L${path.join(toolchain.gmpPrefix, "lib")}`, "-lgmp", "-lm",
    ...bridge.exports.map((name) => `-Wl,--export=${name}`),
    "-Wl,--export-memory", "-Wl,--gc-sections", "-o", wasm,
  ], { cwd: root, encoding: "utf8", timeout: 120000 });
  if (compiled.error) throw compiled.error;
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  return { bytes: readFileSync(wasm), bridge };
}

// This function is also executed verbatim inside real browser workers.
// Any actual host import call fails: valid finite sums must be isolated.
async function wasmAnswers({ bytes, bridge, cases }) {
  const module = await WebAssembly.compile(Uint8Array.from(bytes));
  const imports = {};
  for (const item of WebAssembly.Module.imports(module)) {
    if (item.kind !== "function" || item.module !== "wasi_snapshot_preview1") {
      throw new Error("unexpected Wasm import " + JSON.stringify(item));
    }
    imports[item.module] ||= {};
    imports[item.module][item.name] = () => { throw new Error("host callback " + item.name); };
  }
  const { exports: api } = await WebAssembly.instantiate(module, imports);
  if (api._initialize) api._initialize();
  const scalarBytes = new ArrayBuffer(8);
  const view = new DataView(scalarBytes);
  function fromBits(hex) {
    for (let i = 0; i < 8; i++) view.setUint8(i, parseInt(hex.slice(2 * i, 2 * i + 2), 16));
    return view.getFloat64(0);
  }
  function toBits(value) {
    view.setFloat64(0, value);
    return Array.from(new Uint8Array(scalarBytes), (x) => x.toString(16).padStart(2, "0")).join("");
  }
  const answers = [];
  for (const row of cases) {
    const count = row.values.length;
    const input = Number(api[bridge.runtime.allocate](Math.max(count, 1) * 8));
    const scratch = Number(api[bridge.runtime.allocate](Math.max(count, 1) * 8));
    const output = Number(api[bridge.runtime.allocate](16));
    if (!input || !scratch || !output) throw new Error("Wasm allocation failed");
    try {
      new Float64Array(api.memory.buffer, input, count).set(row.values.map(fromBits));
      new Float64Array(api.memory.buffer, output, 2).set([27, -31]);
      const bridgeStatus = api[bridge.functions[0].export](
        input, count, scratch, count, output, 2, BigInt(count),
      );
      if (bridgeStatus !== 0) throw new Error("Wasm bridge error " + bridgeStatus);
      answers.push({
        name: row.name,
        status: api[bridge.runtime.resultFloat64](0),
        answer: toBits(new Float64Array(api.memory.buffer, output, 2)[0]),
        sentinel: new Float64Array(api.memory.buffer, output, 2)[1],
        input: Array.from(new Float64Array(api.memory.buffer, input, count), toBits),
      });
    } finally {
      api[bridge.runtime.deallocate](output);
      api[bridge.runtime.deallocate](scratch);
      api[bridge.runtime.deallocate](input);
    }
  }
  return answers;
}

function checkAnswers(answers, cases) {
  assert.equal(answers.length, cases.length);
  for (let i = 0; i < cases.length; i++) assert.deepEqual(answers[i], {
    name: cases[i].name, status: cases[i].status, answer: cases[i].answer,
    sentinel: -31, input: cases[i].values,
  });
}

test("packed sums execute in emitted Wasm without host callbacks", {
  skip: inspectToolchain({ root }).ready ? false : "prepared WASI toolchain required",
  timeout: 180000,
}, async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "sagejs-packed-sum-wasm-"));
  try {
    const { bytes, bridge } = await compileWasm(temporary);
    const cases = oracle();
    checkAnswers(await wasmAnswers({ bytes: Array.from(bytes), bridge, cases }), cases);
    if (process.env.SAGEJS_NUMERICAL_BROWSER_TESTS !== "1") return;
    const playwright = require("playwright-core");
    for (const name of ["chromium", "firefox", "webkit"]) {
      const browser = await playwright[name].launch({ headless: true });
      try {
        const page = await browser.newPage();
        const answers = await page.evaluate(async ({ source, payload }) => {
          const url = URL.createObjectURL(new Blob([
            "const run = " + source + "; onmessage = async (event) => { " +
            "try { postMessage({answers: await run(event.data)}); } " +
            "catch (error) { postMessage({error: String(error.stack || error)}); } };",
          ], { type: "text/javascript" }));
          const worker = new Worker(url);
          try {
            return await new Promise((resolve, reject) => {
              worker.onerror = (error) => reject(new Error(error.message));
              worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.answers);
              worker.postMessage(payload);
            });
          } finally {
            worker.terminate();
            URL.revokeObjectURL(url);
          }
        }, { source: wasmAnswers.toString(), payload: { bytes: Array.from(bytes), bridge, cases } });
        checkAnswers(answers, cases);
      } finally {
        await browser.close();
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
