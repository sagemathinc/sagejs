import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrowserRuntimeModules,
  createBrowserEnvironment,
  instrumentEllipticFallbackPrototype,
  instantiateSageEvaluator,
  normalizeBrowserPosixPath,
} from "../evaluator.mjs";

test("numpy-ts is loaded only for compiled NumPy imports and then cached", async () => {
  const backend = { array() {}, NDArray: class NDArray {} };
  const imports = [];
  const modules = createBrowserRuntimeModules({
    numpy: "receipt-bound:numpy-ts",
    async importNumpy(url) {
      imports.push(url);
      return backend;
    },
  });
  assert.deepEqual(await modules.prepare(["math", "statistics"]), []);
  assert.equal(modules.get("numpy-ts"), undefined);
  assert.deepEqual(await modules.prepare(["numpy.linalg"]), [
    "specialist:numpy-ts",
  ]);
  assert.equal(modules.get("numpy-ts"), backend);
  assert.deepEqual(await modules.prepare(["numpy"]), ["specialist:numpy-ts"]);
  assert.deepEqual(imports, ["receipt-bound:numpy-ts"]);
});

test("numpy-ts specialist validation fails closed", async () => {
  const modules = createBrowserRuntimeModules({
    importNumpy: async () => ({ array() {} }),
  });
  await assert.rejects(modules.prepare(["numpy"]), /specialist is invalid/);
});

function fakeWorkerClass(initialization, moduleImports = () => []) {
  return class FakeWorker {
    static instances = [];

    constructor() {
      this.terminated = false;
      FakeWorker.instances.push(this);
    }

    postMessage(message) {
      queueMicrotask(() => {
        const result = message.type === "initialize"
          ? initialization
          : {
              javascript: message.source,
              dynamicImports: [],
              moduleImports: moduleImports(message.source),
            };
        this.onmessage({ data: { id: message.id, ok: true, result } });
      });
    }

    terminate() {
      this.terminated = true;
    }
  };
}

const backendOptions = {
  instantiateFlint: async () => ({}),
  instantiateM4riBackend: async () => ({}),
  importSymbolic: async () => ({}),
  fetchLazyModules: async () => ({
    schema: "sagejs.lazy-module-bundle/v2",
    generator: {
      path: "scripts/build-lazy-module-cache.cjs",
      sha256: "0".repeat(64),
    },
    config: {
      path: "scripts/precompiled-python-packages.json",
      sha256: "0".repeat(64),
    },
    roots: { package: [], taskRuntime: [] },
    modules: {},
  }),
  createConwayData: () => ({
    close() {},
    ready: Promise.resolve(),
    loadFile() {
      throw new Error("the mock evaluator has no Conway table");
    },
  }),
  fetchCapabilityReport: async () => ({
    ok: true,
    async json() {
      return {
        schema: "sagejs.wasm-capability-report/v1",
        source: "architecture/wasm-capabilities.json",
        source_sha256: "0".repeat(64),
        counts: {
          total: 0,
          by_kind: {},
          by_disposition: {},
          by_status: {},
        },
        workflow_aliases: {},
        capabilities: [],
      };
    },
  }),
  fetchAutoReceiptPolicy: async () => ({
    ok: true,
    async json() {
      return {
        schema: "sagejs.hyperelliptic-auto-receipt-policy/v1",
        enabled: false,
        required_platforms: [
          "linux-x64",
          "linux-arm64",
          "darwin-arm64",
          "win32-x64",
        ],
        source_bundle_contract: { algorithm: "test", paths: [] },
        source_bundle: null,
        entries: [],
      };
    },
  }),
};

test("browser POSIX realpath normalization is rooted and rejects NUL", () => {
  assert.equal(normalizeBrowserPosixPath(""), "/");
  assert.equal(normalizeBrowserPosixPath("a//b/../c/./"), "/a/c");
  assert.equal(normalizeBrowserPosixPath("/../../tmp///x"), "/tmp/x");
  assert.throws(() => normalizeBrowserPosixPath("bad\0path"), /null bytes/);
  assert.throws(() => normalizeBrowserPosixPath(12), /string/);
});

test("browser environment validates values and exposes a coherent proxy", () => {
  const environment = createBrowserEnvironment();
  environment.set("SAGE", "yes");
  assert.equal(environment.proxy.SAGE, "yes");
  environment.proxy.SAGE = "updated";
  assert.deepEqual(environment.entries(), [["SAGE", "updated"]]);
  assert.deepEqual({ ...environment.proxy }, { SAGE: "updated" });
  delete environment.proxy.SAGE;
  assert.deepEqual(environment.entries(), []);

  for (const key of ["", "A=B", "A\0B"]) {
    assert.throws(() => environment.set(key, "x"), TypeError);
  }
  assert.throws(() => environment.set("A", 1), /value must be a string/);
  assert.throws(() => environment.set("A", "x\0y"), /null byte/);
});

test("a throwing post-worker initialization terminates and restores globals", async () => {
  const WorkerConstructor = fakeWorkerClass("boom");
  const sentinelRequire = globalThis.require;
  const sentinelProcess = globalThis.process;

  await assert.rejects(
    instantiateSageEvaluator({
      ...backendOptions,
      WorkerConstructor,
      evaluateGlobal() {
        throw new Error("deliberate browser init failure");
      },
    }),
    /deliberate browser init failure/,
  );

  assert.equal(WorkerConstructor.instances[0].terminated, true);
  assert.equal(globalThis.require, sentinelRequire);
  assert.equal(globalThis.process, sentinelProcess);
  assert.equal(globalThis.__sagejs_host__, undefined);
  assert.equal(globalThis.__sagejs_output_write__, undefined);
  assert.equal(globalThis.__sagejs_runtime_require__, undefined);
  assert.equal(globalThis.__sagejs_hyperelliptic_auto_receipt_policy__, undefined);
});

test("evaluator host shares process.env and separates stdout from stderr", async () => {
  const WorkerConstructor = fakeWorkerClass(
    "globalThis.ρσ_modules={builtins:{}};globalThis.ρσ_repr=String;" +
      "globalThis.ρσ_baselib_facade=null;",
  );
  const originalModules = globalThis.ρσ_modules;
  const evaluator = await instantiateSageEvaluator({
    ...backendOptions,
    WorkerConstructor,
  });
  try {
    assert.deepEqual(globalThis.__sagejs_host__.call("setEnv", ["SAGE", "wasm"]), {
      ok: true,
      value: null,
    });
    assert.equal(globalThis.process.env.SAGE, "wasm");
    globalThis.process.env.SAGE = "browser";
    assert.deepEqual(globalThis.__sagejs_host__.call("environmentEntries", []), {
      ok: true,
      value: [["SAGE", "browser"]],
    });
    assert.equal(
      globalThis.__sagejs_host__.call("realpath", ["tmp/../work//file"]).value,
      "/work/file",
    );
    assert.equal(globalThis.__sagejs_host__.call("realpath", ["bad\0path"]).ok, false);

    const stdout = [];
    const stderr = [];
    await evaluator.evaluate(
      'process.stdout.write("out");process.stderr.write("err");undefined',
      { onOutput: (text) => stdout.push(text), onError: (text) => stderr.push(text) },
    );
    assert.deepEqual(stdout, ["out"]);
    assert.deepEqual(stderr, ["err"]);
  } finally {
    evaluator.terminate();
  }
  assert.equal(globalThis.ρσ_modules, originalModules);
});

test("compiled module dependencies prepare receipt-bound runtime specialists", async () => {
  const backend = {
    marker: "numpy-loaded",
    array() {},
    NDArray: class NDArray {},
  };
  const imports = [];
  const WorkerConstructor = fakeWorkerClass(
    "globalThis.ρσ_modules={builtins:{}};globalThis.ρσ_repr=String;",
    (source) => source.includes('require("numpy-ts")') ? ["numpy"] : [],
  );
  const evaluator = await instantiateSageEvaluator({
    ...backendOptions,
    WorkerConstructor,
    numpy: "receipt-bound:numpy-ts",
    async importNumpy(url) {
      imports.push(url);
      return backend;
    },
  });
  try {
    const result = await evaluator.evaluate('require("numpy-ts").marker');
    assert.equal(result.value, "numpy-loaded");
    assert.deepEqual(imports, ["receipt-bound:numpy-ts"]);
    assert.deepEqual(
      result.instrumentation.routes.find(
        (route) => route.capability_id === "specialist:numpy-ts",
      ),
      {
        capability_id: "specialist:numpy-ts",
        selected_route: "receipt-backed-wasm-artifact",
        execution_target: "wasm-artifact",
        call_count: 1,
        ingress_bytes: 0,
        egress_bytes: 0,
      },
    );
  } finally {
    evaluator.terminate();
  }
});

test("evaluated code cannot discover or invoke the private route recorder", async () => {
  const WorkerConstructor = fakeWorkerClass(
    "globalThis.ρσ_modules={builtins:{}};globalThis.ρσ_repr=String;",
  );
  const evaluator = await instantiateSageEvaluator({
    ...backendOptions,
    WorkerConstructor,
  });
  try {
    assert.equal(globalThis.__sagejs_capability_trace__, undefined);
    const result = await evaluator.evaluate(`(() => {
      globalThis.__sagejs_capability_trace__ = () => "counterfeit";
      globalThis.__sagejs_capability_trace__(
        "forged:capability", "receipt-backed-wasm-artifact");
      for (const key of Reflect.ownKeys(globalThis)) {
        const text = typeof key === "symbol" ? key.description ?? "" : key;
        if (!text.toLowerCase().includes("capability") ||
            !text.toLowerCase().includes("trace")) continue;
        const candidate = globalThis[key];
        if (typeof candidate === "function") {
          candidate("forged:enumerated", "receipt-backed-wasm-artifact");
        }
      }
      delete globalThis.__sagejs_capability_trace__;
      return "forge-attempt-complete";
    })()`);
    assert.equal(result.value, "forge-attempt-complete");
    assert.deepEqual(result.instrumentation.routes, []);
    assert.equal(
      Reflect.ownKeys(globalThis).some((key) =>
        String(key).includes("__sagejs_capability_trace__")),
      false,
    );
  } finally {
    evaluator.terminate();
  }
});

test("elliptic evidence follows successful fallback execution", () => {
  const records = [];
  const prototype = {
    root_number(precomputed = null) {
      if (precomputed !== null) return precomputed;
      this._root_number = -1;
      return -1;
    },
    anlist(bound) {
      const native = this._anlist_native(bound);
      return native ?? [0, 1, -2];
    },
  };
  instrumentEllipticFallbackPrototype(
    prototype,
    { record: (...args) => records.push(args) },
    {},
  );
  const curve = Object.create(prototype);
  curve._root_number = undefined;
  curve._anlist_native = () => null;
  assert.equal(curve.root_number(), -1);
  assert.deepEqual(curve.anlist(2), [0, 1, -2]);
  assert.deepEqual(records, [
    ["elliptic-root-number-semistable", "portable-fallback"],
    ["elliptic-coefficients-portable", "portable-fallback"],
  ]);

  records.length = 0;
  const accelerated = Object.create(prototype);
  accelerated._root_number = undefined;
  accelerated._anlist_native = () => [0, 1, 7];
  assert.deepEqual(accelerated.anlist(2), [0, 1, 7]);
  assert.equal(accelerated.root_number(1), 1);
  assert.deepEqual(records, []);
});
