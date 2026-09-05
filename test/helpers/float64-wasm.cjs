"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { lowerSource } = require("../../tools/native-kernel/ir.cjs");
const { generateHostCore } = require("../../tools/native-kernel/c-backend.cjs");
const { generateWasmBridge } = require("../../tools/native-kernel/wasm-bridge.cjs");
const { wasmKernelToolchain } = require("../../packages/wasm-toolchain/scripts/toolchain.cjs");

const root = path.resolve(__dirname, "../..");

async function compileFloat64Wasm(sourcePath, directory, functionNames) {
  const toolchain = wasmKernelToolchain({ root });
  const ir = await lowerSource(fs.readFileSync(sourcePath, "utf8"), sourcePath);
  const moduleIdentity = "5ae0000000000003";
  assert.ok(ir.functions.every((fn) => fn.kernelKind === "float64"));
  const core = generateHostCore(ir, { moduleIdentity });
  assert.equal(core.audit.hostCallbacks, 0);
  assert.deepEqual(core.audit.nativeDependencies, ["libc", "libm"]);
  const bridge = generateWasmBridge({ ir, moduleIdentity, functionNames });
  for (const [name, content] of [["kernel_core.c", core.source], ["kernel_core.h", core.header],
    ["wasm_bridge.c", bridge.source]]) fs.writeFileSync(path.join(directory, name), content);
  const target = path.join(directory, "kernel.wasm");
  const compiled = spawnSync(toolchain.clang, [
    "--target=wasm32-wasi", `--sysroot=${toolchain.sysroot}`, "-mexec-model=reactor",
    "-O2", "-ffp-contract=off", `-I${directory}`, path.join(directory, "kernel_core.c"),
    path.join(directory, "wasm_bridge.c"), "-lm",
    ...bridge.exports.map((name) => `-Wl,--export=${name}`),
    "-Wl,--export-memory", "-Wl,--gc-sections", "-o", target,
  ], { cwd: root, encoding: "utf8", timeout: 120000 });
  if (compiled.error) throw compiled.error;
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  return { bytes: Array.from(fs.readFileSync(target)), bridge };
}

// Self-contained so exactly the same runner executes in real browser workers.
async function runFloat64Cases({ bytes, bridge, cases }) {
  const module = await WebAssembly.compile(Uint8Array.from(bytes));
  const imports = {};
  for (const item of WebAssembly.Module.imports(module)) {
    if (item.kind !== "function" || item.module !== "wasi_snapshot_preview1") {
      throw new Error("unexpected import " + JSON.stringify(item));
    }
    imports[item.module] ||= {};
    imports[item.module][item.name] = () => { throw new Error("host callback " + item.name); };
  }
  const { exports: api } = await WebAssembly.instantiate(module, imports);
  if (api._initialize) api._initialize();
  const scalar = new DataView(new ArrayBuffer(8));
  const fromBits = (hex) => {
    scalar.setBigUint64(0, BigInt("0x" + hex));
    return scalar.getFloat64(0);
  };
  const toBits = (value) => {
    scalar.setFloat64(0, value);
    return scalar.getBigUint64(0).toString(16).padStart(16, "0");
  };
  const answers = [];
  for (const row of cases) {
    const allocated = [];
    try {
      const args = [];
      for (const argument of row.arguments) {
        if (argument.type === "buffer") {
          const count = argument.value.length;
          const pointer = Number(api[bridge.runtime.allocate](Math.max(count, 1) * 8));
          if (!pointer) throw new Error("allocation failed");
          allocated.push({ pointer, count });
          new Float64Array(api.memory.buffer, pointer, count).set(argument.value.map(fromBits));
          args.push(pointer, count);
        } else if (argument.type === "float") args.push(fromBits(argument.value));
        else if (argument.type === "uint64") args.push(BigInt(argument.value));
        else throw new Error("unknown test argument type");
      }
      const bridgeStatus = api[bridge.functions[row.function_index].export](...args);
      if (bridgeStatus !== 0) throw new Error("bridge error " + bridgeStatus);
      answers.push({ status: api[bridge.runtime.resultFloat64](0), buffers: allocated.map(
        ({ pointer, count }) => Array.from(new Float64Array(api.memory.buffer, pointer, count), toBits),
      ) });
    } finally {
      for (const { pointer } of allocated.reverse()) api[bridge.runtime.deallocate](pointer);
    }
  }
  return answers;
}

async function runBrowserCases(engine, runner, payload) {
  const browser = await require("playwright-core")[engine].launch({ headless: true });
  try {
    const page = await browser.newPage();
    return await page.evaluate(async ({ source, payload }) => {
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
    }, { source: runner.toString(), payload });
  } finally {
    await browser.close();
  }
}

module.exports = { compileFloat64Wasm, runFloat64Cases, runBrowserCases };
