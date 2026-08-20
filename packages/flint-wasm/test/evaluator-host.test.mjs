import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrowserEnvironment,
  instantiateSageEvaluator,
  normalizeBrowserPosixPath,
} from "../evaluator.mjs";

function fakeWorkerClass(initialization) {
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
          : message.source;
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
    schema: "sagejs.lazy-module-bundle/v1",
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
});

test("evaluator host shares process.env and separates stdout from stderr", async () => {
  const WorkerConstructor = fakeWorkerClass(
    "globalThis.ρσ_modules={builtins:{}};globalThis.ρσ_repr=String;",
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
