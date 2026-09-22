import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createClassGroupEvaluatorBackend,
  instantiateSageEvaluator,
} from "../evaluator.mjs";

const RESPONSE_SCHEMA = "sagejs.class-groups/service-response-v1";

function byteFetch(bytes) {
  return async () => new Response(bytes);
}

function fakeCore(invocations, { maximumMemoryPages = 4096 } = {}) {
  let closed = false;
  return {
    invoke(request) {
      invocations.push(request);
      let result;
      if (request.operation === "unsupported") {
        return {
          schema: RESPONSE_SCHEMA,
          abi: 1,
          id: request.id,
          ok: false,
          error: {
            schema: RESPONSE_SCHEMA,
            outcome: "error",
            category: "capability-declined",
            operation: "unsupported",
            message: "unsupported service operation",
          },
        };
      }
      if (request.operation === "capability") {
        result = { schema: RESPONSE_SCHEMA, outcome: "available", operation: "capability" };
      } else if (request.operation === "open") {
        result = {
          schema: RESPONSE_SCHEMA,
          outcome: "open",
          operation: "open",
          generation: "7",
          handle: "30064771073",
          completion: { schema: "qualified-completion" },
        };
      } else {
        result = {
          schema: RESPONSE_SCHEMA,
          outcome: request.operation === "close" ? "closed" : "complete",
          operation: request.operation,
          handle: request.handle,
        };
      }
      return {
        schema: RESPONSE_SCHEMA,
        abi: 1,
        id: request.id,
        ok: true,
        result,
      };
    },
    diagnostics() {
      return {
        maximumMemoryPages,
        maximumMemoryBytes: maximumMemoryPages * 65_536,
        cancellation: "worker-termination",
      };
    },
    close() { closed = true; },
    get closed() { return closed; },
  };
}

test("evaluator class-group backend is synchronous, receipt-bound, and session-safe", async () => {
  const bytes = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const invocations = [];
  const core = fakeCore(invocations);
  const backend = await createClassGroupEvaluatorBackend({
    artifact: "test:class-group",
    receipt: { bytes: bytes.byteLength, sha256 },
    fetchImpl: byteFetch(bytes),
    subtle: globalThis.crypto.subtle,
    instantiateCore: async () => core,
  });

  const capability = backend.call("capability", {});
  assert.equal(capability.outcome, "available");
  assert.equal(capability instanceof Promise, false);
  assert.deepEqual(invocations[0], {
    schema: "sagejs.class-groups/service-request-v1",
    abi: 1,
    id: "evaluator-1",
    operation: "capability",
  });
  assert.deepEqual(backend.call("unsupported", {}), {
    schema: RESPONSE_SCHEMA,
    outcome: "error",
    category: "capability-declined",
    operation: "unsupported",
    message: "unsupported service operation",
  });

  const opened = backend.call("open", { schema: "completion-request" });
  assert.equal(opened.artifactSha256, sha256);
  assert.equal(opened.generation, "7");
  assert.equal(opened.handle, "30064771073");
  assert.deepEqual(opened.completion, { schema: "qualified-completion" });
  assert.equal(backend.diagnostics().residentSessions, 1);

  const publication = backend.call("publication", {
    generation: opened.generation,
    handle: opened.handle,
  });
  assert.equal(publication.operation, "publication");
  assert.equal(publication instanceof Promise, false);
  backend.call("close", { generation: opened.generation, handle: opened.handle });
  assert.equal(backend.diagnostics().residentSessions, 0);

  backend.close();
  assert.equal(core.closed, true);
  assert.throws(() => backend.call("capability", {}), /closed/);
});

test("evaluator teardown closes every resident class-group session", async () => {
  const bytes = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const invocations = [];
  const core = fakeCore(invocations);
  const backend = await createClassGroupEvaluatorBackend({
    receipt: { bytes: bytes.byteLength, sha256 },
    fetchImpl: byteFetch(bytes),
    subtle: globalThis.crypto.subtle,
    instantiateCore: async () => core,
  });
  backend.call("open", { schema: "completion-request" });
  backend.close();
  assert.equal(invocations.at(-1).operation, "close");
  assert.equal(invocations.at(-1).generation, "7");
  assert.equal(invocations.at(-1).handle, "30064771073");
});

test("evaluator rejects a reactor outside the 256 MiB maximum", async () => {
  const bytes = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const core = fakeCore([], { maximumMemoryPages: 4097 });
  await assert.rejects(createClassGroupEvaluatorBackend({
    receipt: { bytes: bytes.byteLength, sha256 },
    fetchImpl: byteFetch(bytes),
    subtle: globalThis.crypto.subtle,
    instantiateCore: async () => core,
  }), /256 MiB/);
  assert.equal(core.closed, true);
});

function fakeCompilerWorker() {
  return class FakeWorker {
    postMessage(message) {
      queueMicrotask(() => this.onmessage({
        data: {
          id: message.id,
          ok: true,
          result: message.type === "initialize"
            ? "globalThis.ρσ_modules={builtins:{}};globalThis.ρσ_repr=String;globalThis.ρσ_baselib_facade=null;"
            : { javascript: message.source, dynamicImports: [], moduleImports: [] },
        },
      }));
    }
    terminate() {}
  };
}

const emptyLazyBundle = {
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
};

test("compiled code reaches the direct backend through __sagejs_host__ only", async () => {
  let backendCloses = 0;
  const evaluator = await instantiateSageEvaluator({
    WorkerConstructor: fakeCompilerWorker(),
    classGroup: {},
    createClassGroupBackend: async () => Object.freeze({
      call(operation, request) {
        return { schema: RESPONSE_SCHEMA, outcome: "available", operation, request };
      },
      close() { backendCloses += 1; },
    }),
    instantiateFlint: async () => ({
      __sagejs_ffi_manifest__: { declaration: "test", resources: [], functions: [] },
    }),
    instantiateM4riBackend: async () => ({}),
    instantiateExtensionBackend: async () => ({
      backend: {},
      manifest: { declaration: "test", resources: [], functions: [] },
      close() {},
    }),
    importSymbolic: async () => ({}),
    fetchLazyModules: async () => emptyLazyBundle,
    createConwayData: () => ({ ready: Promise.resolve(), close() {}, loadFile() {} }),
    fetchCapabilityReport: async () => ({
      ok: true,
      json: async () => ({
        schema: "sagejs.wasm-capability-report/v1",
        source: "test",
        source_sha256: "0".repeat(64),
        counts: { total: 0, by_kind: {}, by_disposition: {}, by_status: {} },
        workflow_aliases: {},
        capabilities: [],
      }),
    }),
    fetchAutoReceiptPolicy: async () => ({
      ok: true,
      json: async () => ({
        schema: "sagejs.hyperelliptic-auto-receipt-policy/v1",
        enabled: false,
        required_platforms: [],
        source_bundle_contract: { algorithm: "test", paths: [] },
        source_bundle: null,
        entries: [],
      }),
    }),
  });
  try {
    assert.equal(globalThis.__sagejs_class_group_backend__, undefined);
    const result = await evaluator.evaluate(
      '__sagejs_host__.call("classGroup", ["capability", {}]).value',
    );
    assert.deepEqual(result.value, {
      schema: RESPONSE_SCHEMA,
      outcome: "available",
      operation: "capability",
      request: {},
    });
    assert.equal(result.value instanceof Promise, false);
  } finally {
    evaluator.terminate();
  }
  assert.equal(backendCloses, 1);
  assert.equal(globalThis.__sagejs_host__, undefined);
});
