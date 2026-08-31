// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBrowserRuntimeModules } from
  "../../packages/flint-wasm/evaluator.mjs";
import { createCminpackBackend } from
  "../../packages/flint-wasm/numerical/index.mjs";

const artifact = new URL(
  "../../packages/flint-wasm/numerical/build/cminpack.wasm",
  import.meta.url,
);

test("browser runtime fetches cminpack only for optimization imports", async () => {
  const bytes = await readFile(artifact);
  let fetches = 0;
  let adapterImports = 0;
  const capabilities = [];
  const modules = createBrowserRuntimeModules({
    numerical: "receipt-bound:cminpack",
    numericalAdapter: "receipt-bound:cminpack-adapter",
    async fetchNumerical(url) {
      fetches += 1;
      assert.equal(url, "receipt-bound:cminpack");
      return {
        ok: true,
        async arrayBuffer() {
          return bytes;
        },
      };
    },
    async importNumerical(url) {
      adapterImports += 1;
      assert.equal(url, "receipt-bound:cminpack-adapter");
      return { createCminpackBackend };
    },
    recordCapability(...record) {
      capabilities.push(record);
    },
  });

  assert.deepEqual(await modules.prepare(["math", "sagejs.numerics"]), []);
  assert.equal(fetches, 0);
  assert.equal(adapterImports, 0);
  assert.deepEqual(
    await modules.prepare(["sagejs.numerics.optimization.least_squares"]),
    [],
  );
  assert.deepEqual(capabilities, []);
  const backend = modules.get("@sagemath/sagejs-numerical");
  assert.equal(backend.capability.backend, "cminpack-wasm");
  assert.deepEqual(capabilities, [[
    "wasm-library:cminpack:least-squares-explicit",
    "receipt-backed-wasm-artifact",
    { executionTarget: "wasm-artifact" },
  ]]);
  assert.equal(fetches, 1);
  assert.equal(adapterImports, 1);
  await modules.prepare(["sagejs.numerics.optimization"]);
  assert.equal(fetches, 1);
  assert.equal(adapterImports, 1);
});

test("browser optimization imports survive an unavailable cminpack resource", async () => {
  const capabilities = [];
  const modules = createBrowserRuntimeModules({
    numerical: "missing:cminpack",
    async fetchNumerical() {
      return { ok: false, status: 404 };
    },
    recordCapability(...record) {
      capabilities.push(record);
    },
  });

  assert.deepEqual(
    await modules.prepare(["sagejs.numerics.optimization.least_squares"]),
    [],
  );
  const unavailable = modules.get("@sagemath/sagejs-numerical");
  assert.equal(unavailable.capability.backend, "cminpack-unavailable");
  assert.throws(
    () => unavailable.leastSquares({}),
    /unable to load cminpack numerical backend \(404\)/,
  );
  assert.deepEqual(capabilities, []);
});
