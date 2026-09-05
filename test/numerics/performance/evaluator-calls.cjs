// sagejs-test-tier: native
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const { buildWasmProductionPacks } = require("../../../tools/native-kernel/wasm-production-pack.cjs");
const { wasmKernelToolchain, inspectToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const { lowerSource } = require("../../../tools/native-kernel/ir.cjs");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../../../tools/native-kernel/c-backend.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");
const sourcePath = path.join(__dirname, "evaluator-calls.py");
const root = path.resolve(__dirname, "../../..");

test("binary64 helpers lower their source closure and propagate alias/condition writes", async () => {
  const ir = await lowerSource(fs.readFileSync(sourcePath, "utf8"), sourcePath, { functions: ["combined", "condition", "failure_caller"] });
  const byName = new Map(ir.functions.map(fn => [fn.name, fn]));
  assert.deepEqual(byName.get("combined").dependencies, ["control", "update"]);
  for (const name of ["combined", "condition", "failure_caller"]) {
    assert.ok(byName.get(name).analysis.effects.mutates.includes("values"));
    assert.equal(byName.get(name).analysis.effects.pure, false);
  }
  const core = generateHostCore(ir);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.equal(core.audit.isolated, true);
  assert.match(core.source, /sagejs_kernel_update\(status,/);
});

test("helper calls preserve unsigned conversions, writes and failure propagation", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-float-calls-"));
  try {
    const artifact = await compileKernel({ sourcePath, cacheRoot: directory });
    const module = require(artifact.modulePath);
    assert.equal(module.combined.nativeAvailable, true);
    const routes = [name => module[name], name => module[name].javascript];
    if (inspectToolchain({ root }).ready) {
      const manifestPath = path.join(directory, "manifest.json");
      const fixture = "src/lib/sagejs/evaluator_calls.py";
      fs.mkdirSync(path.dirname(path.join(directory, fixture)), { recursive: true });
      fs.copyFileSync(sourcePath, path.join(directory, fixture));
      fs.writeFileSync(manifestPath, JSON.stringify({ kernels: [{ id: "floating-call-production",
        source: fixture, functions: ["combined", "condition", "failure_caller"],
        fallback: "same-source", oracles: ["CPython"],
      }] }));
      const toolchain = wasmKernelToolchain({ root });
      for (const key of ["gmpPrefix", "mpfrPrefix", "mpcPrefix", "flintPrefix"]) toolchain[key] = path.join(directory, "absent", key);
      const manifest = await buildWasmProductionPacks({ root: directory, manifestPath, outputRoot: directory, toolchain, isolateFloat64: true });
      const { instantiateWasmKernelPacks } = await import(pathToFileURL(path.join(root, "tools/native-kernel/wasm-pack-loader.mjs")));
      const resolver = await instantiateWasmKernelPacks({ manifest,
        load: pack => fs.readFileSync(path.join(directory, pack.asset)),
        host(_pack, compiled) {
          const imports = {};
          for (const entry of WebAssembly.Module.imports(compiled)) {
            assert.equal(entry.module, "wasi_snapshot_preview1");
            imports[entry.module] ??= {};
            imports[entry.module][entry.name] = () => { throw new Error("unexpected host callback"); };
          }
          return imports;
        },
      });
      routes.push(name => resolver.resolve("sagejs/evaluator_calls.py", name));
    }
    for (const call of routes) {
      const values = [3, 5];
      assert.equal(call("combined")(new BigUint64Array([7n]), values, 1n), 13);
      assert.deepEqual(values, [3, 6]);
      const signs = [-1];
      assert.equal(call("condition")(signs), 0);
      assert.deepEqual(signs, [0]);
      const failed = [0];
      assert.throws(() => call("failure_caller")(failed, 0), /division by zero/);
      assert.deepEqual(failed, [11]);
      assert.throws(() => call("combined")(new BigUint64Array([7n]), values, 7n), /index|range/i);
    }
  } finally { removeLoadedNativeCache(directory); }
});

test("helper witness agrees with its ordinary CPython source", () => {
  const program = pythonPrefix(root) + "\n" + fs.readFileSync(sourcePath, "utf8") + `
values = [3.0, 5.0]
assert combined([7], values, 1) == 13.0
assert values == [3.0, 6.0]
signs = [-1.0]
assert condition(signs) == 0.0 and signs == [0.0]
failed = [0.0]
try:
    failure_caller(failed, 0.0)
    assert False
except ZeroDivisionError:
    assert failed == [11.0]
`;
  const run = spawnSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-I", "-c", program], {encoding:"utf8", timeout:120000});
  assert.equal(run.status, 0, run.stderr);
});

test("recursive, mistyped and opaque binary64 calls fail closed", async () => {
  const prefix = "from sagejs.native import native\n";
  for (const source of [
    "@native\ndef first(x: float) -> float:\n    return first(x)\n",
    "@native\ndef first(x: float) -> float:\n    return second(x)\n@native\ndef second(x: float) -> float:\n    return first(x)\n",
  ]) await assert.rejects(lowerSource(prefix + source, "recursive-float.py"), /recursive binary64/);
  await assert.rejects(lowerSource(prefix + "@native\ndef first(x: float) -> float:\n    return missing(x)\n", "opaque-float.py"), /unsupported binary64 call/);
  await assert.rejects(lowerSource(prefix + "@native\ndef first(x: float) -> float:\n    return second(x,x)\n@native\ndef second(x: float) -> float:\n    return x\n", "arity-float.py"), /argument count/);
  await assert.rejects(lowerSource(prefix + "@native\ndef first(abs: float) -> float:\n    return abs(1.0)\n", "shadowed-float.py"), /shadowed binary64 callable/);
});
