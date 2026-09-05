// sagejs-test-tier: native
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const { buildWasmProductionPacks } = require("../../../tools/native-kernel/wasm-production-pack.cjs");
const { inspectToolchain, wasmKernelToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const root = path.resolve(__dirname, "../../..");
const logical = "sagejs/numerics/statistics/_packed.py";

test("optional floating preparation binds Python sources before importing native decorators", {
  skip: inspectToolchain({ root }).ready ? false : "prepared WASI toolchain required",
  timeout: 180000,
}, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-floating-lazy-"));
  try {
    const manifestPath = path.join(directory, "sources.json");
    fs.writeFileSync(manifestPath, JSON.stringify({ kernels: [{
      id: "floating-lazy-test-production", source: "src/lib/" + logical,
      functions: ["finite_sum"], fallback: "same-source", oracles: ["cpython"],
    }] }));
    const toolchain = wasmKernelToolchain({ root });
    for (const name of ["flintPrefix", "gmpPrefix", "mpfrPrefix", "mpcPrefix"]) {
      toolchain[name] = path.join(directory, "absent", name);
    }
    const manifest = await buildWasmProductionPacks({
      root, manifestPath, outputRoot: directory, toolchain, isolateFloat64: true,
    });
    const loaderFilename = path.join(directory, "dist/wasm-pack-loader.mjs");
    fs.mkdirSync(path.dirname(loaderFilename), { recursive: true });
    fs.copyFileSync(path.join(root, "tools/native-kernel/wasm-pack-loader.mjs"), loaderFilename);
    fs.copyFileSync(path.join(root, "packages/flint-wasm/floating-kernels.mjs"), path.join(directory, "floating-kernels.mjs"));
    const { createLazyFloatingKernels } = await import(pathToFileURL(path.join(directory, "floating-kernels.mjs")));
    const moduleBundle = { modules: { "sagejs.numerics.statistics._packed": {
      source: logical,
      sourceSha256: createHash("sha256").update(fs.readFileSync(path.join(root, "src/lib", logical))).digest("hex"),
    } } };
    const wasm = fs.readFileSync(path.join(directory, manifest.packs[0].asset));
    const calls = [];
    function make(options = {}) {
      return createLazyFloatingKernels({
        moduleBundle,
        manifestUrl: "https://example.invalid/floating/index.json",
        async fetchResource(url) {
          calls.push(String(url));
          return new Response(String(url).endsWith("index.json") ? JSON.stringify(manifest) : wasm);
        },
        host(_pack, module) {
          const imports = {};
          for (const item of WebAssembly.Module.imports(module)) {
            assert.equal(item.module, "wasi_snapshot_preview1");
            assert.equal(item.kind, "function");
            imports[item.module] ??= {};
            imports[item.module][item.name] = () => { throw new Error("unexpected host callback"); };
          }
          return imports;
        },
        ...options,
      });
    }
    await t.test("unrelated imports and disabled configuration never fetch", async () => {
      const disabled = make({ manifestUrl: undefined });
      await disabled.prepare(["sagejs.numerics.statistics"]);
      assert.equal(disabled.status().state, "disabled");
      const lazy = make();
      await lazy.prepare(["math", "sagejs.numerics.roots", "statistics"]);
      assert.equal(lazy.status().state, "unloaded");
      assert.equal(lazy.resolve(logical, "finite_sum"), null);
      assert.equal(calls.length, 0);
    });
    await t.test("one shared load, immutable source binding, exact result and close", async () => {
      const bundle = structuredClone(moduleBundle);
      const lazy = make({ moduleBundle: bundle });
      bundle.modules["sagejs.numerics.statistics._packed"].sourceSha256 = "0".repeat(64);
      await Promise.all([lazy.prepare(["sagejs.numerics.statistics"]),
        lazy.prepare(["sagejs.numerics.statistics.prepared"])]);
      assert.deepEqual(lazy.status(), { state: "ready" });
      assert.equal(calls.length, 2);
      const sum = lazy.resolve(logical, "finite_sum");
      assert.equal(sum.executionTarget, "wasm");
      const input = sum.createFloat64Buffer([1e16, 1, -1e16]);
      const output = sum.createFloat64Buffer(1);
      assert.equal(sum(input, sum.createFloat64Buffer(3), output, 3n), 0);
      assert.equal(output[0], 1);
      for (const key of ["sourceHash", "abiHash", "portableIdentity", "declarationHash"]) {
        assert.equal(lazy.resolve(logical, "finite_sum", { [key]: "0".repeat(64) }), null);
      }
      assert.equal(lazy.resolve(logical, "not_a_function"), null);
      lazy.close();
      await lazy.prepare(["sagejs.numerics.statistics"]);
      assert.equal(lazy.resolve(logical, "finite_sum"), null);
      assert.equal(lazy.status().state, "closed");
      assert.equal(calls.length, 2);
    });
    await t.test("buffer transfers preserve custom iteration and copyback hooks", async () => {
      const lazy = make();
      await lazy.prepare(["sagejs.numerics.statistics"]);
      const sum = lazy.resolve(logical, "finite_sum");
      const output = sum.createFloat64Buffer(1);
      const scratch = sum.createFloat64Buffer(3);
      const ordinary = sum.createFloat64Buffer([1e16, 1, -1e16]);
      assert.equal(sum(ordinary, scratch, output, 3n), 0);
      assert.equal(output[0], 1);
      const customized = new Float64Array([9, 9, 9]);
      customized[Symbol.iterator] = function* () { yield 1; yield 2; yield 3; };
      assert.equal(sum(customized, scratch, output, 3n), 0);
      assert.equal(output[0], 6);
      class CustomBuffer extends Float64Array {
        *[Symbol.iterator]() { yield 2; yield 3; yield 4; }
      }
      assert.equal(sum(new CustomBuffer([9, 9, 9]), scratch, output, 3n), 0);
      assert.equal(output[0], 9);
      let probes = 0;
      Object.defineProperty(output, "sizes", { get() { probes++; return undefined; } });
      assert.equal(sum(ordinary, scratch, output, 3n), 0);
      assert.equal(output[0], 1);
      assert.equal(probes, 1, "custom copyback probes must not be optimized away");
      lazy.close();
    });
    for (const [name, mutate] of [
      ["source mismatch", (m) => { m.kernels[0].sourceHash = "0".repeat(64); }],
      ["exact domain", (m) => { m.packs[0].domain = "gmp"; }],
      ["linked archive", (m) => { m.packs[0].toolchain.archives.push("libgmp.a"); }],
      ["foreign declaration", (m) => { m.kernels[0].foreignDeclarations.push({ id: "unrelated" }); }],
      ["foreign asset URL", (m) => { m.packs[0].asset = "https://other.invalid/a.wasm"; }],
      ["oversized artifact", (m) => { m.packs[0].bytes = 32 * 1024 * 1024; }],
    ]) {
      await t.test(`${name} falls back without fetching Wasm`, async () => {
        const invalid = structuredClone(manifest);
        mutate(invalid);
        let fetched = 0;
        const lazy = make({ fetchResource: async () => { fetched++; return new Response(JSON.stringify(invalid)); } });
        await lazy.prepare(["sagejs.numerics.statistics"]);
        await lazy.prepare(["sagejs.numerics.statistics"]);
        assert.equal(lazy.status().state, "unavailable");
        assert.equal(lazy.resolve(logical, "finite_sum"), null);
        assert.equal(fetched, 1);
      });
    }
    await t.test("digest corruption fails closed before instantiation", async () => {
      let hosts = 0;
      const corrupt = new Uint8Array(wasm);
      corrupt[corrupt.length - 1] ^= 1;
      const lazy = make({ host: () => { hosts++; }, fetchResource: async (url) =>
        new Response(String(url).endsWith("index.json") ? JSON.stringify(manifest) : corrupt) });
      await lazy.prepare(["sagejs.numerics.statistics"]);
      assert.match(lazy.status().reason, /digest mismatch/);
      assert.equal(hosts, 0);
    });
    await t.test("missing resource is a cached unavailable acceleration, not an import error", async () => {
      const lazy = make({ fetchResource: async () => new Response("missing", { status: 404 }) });
      await lazy.prepare(["sagejs.numerics.statistics"]);
      assert.match(lazy.status().reason, /404/);
      assert.equal(lazy.resolve(logical, "finite_sum"), null);
    });
    await t.test("timeout aborts fetch and retains the fallback", async () => {
      const lazy = make({ timeoutMs: 5, fetchResource: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }) });
      await lazy.prepare(["sagejs.numerics.statistics"]);
      assert.equal(lazy.status().state, "unavailable");
    });
    await t.test("an unadvertised oversized manifest stream is cancelled", async () => {
      let cancelled = false;
      const lazy = make({ fetchResource: async () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
        cancel() { cancelled = true; },
      })) });
      await lazy.prepare(["sagejs.numerics.statistics"]);
      assert.equal(lazy.status().state, "unavailable");
      assert.match(lazy.status().reason, /byte budget/);
      assert.equal(cancelled, true);
    });
    await t.test("close cancels in-flight preparation without resurrecting a resolver", async () => {
      let started;
      const ready = new Promise((resolve) => { started = resolve; });
      const lazy = make({ fetchResource: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        started();
      }) });
      const pending = lazy.prepare(["sagejs.numerics.statistics"]);
      await ready;
      lazy.close();
      await pending;
      assert.equal(lazy.status().state, "closed");
      assert.equal(lazy.resolve(logical, "finite_sum"), null);
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
