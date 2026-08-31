// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBrowserRuntimeModules } from
  "../../packages/flint-wasm/evaluator.mjs";
import { createCminpackBackend } from
  "../../packages/flint-wasm/numerical/index.mjs";
import { createNloptBackend } from
  "../../packages/flint-wasm/numerical/nlopt-index.mjs";

const artifact = new URL(
  "../../packages/flint-wasm/numerical/build/cminpack.wasm",
  import.meta.url,
);
const nloptArtifact = new URL(
  "../../src/lib/sagejs/numerics/optimization/backends/nlopt/build/nlopt-methods.wasm",
  import.meta.url,
);

test("browser runtime prepares numerical backends without claiming execution", async () => {
  const bytes = await readFile(artifact);
  const nloptBytes = await readFile(nloptArtifact);
  let fetches = 0;
  let adapterImports = 0;
  const capabilities = [];
  const modules = createBrowserRuntimeModules({
    numerical: "receipt-bound:cminpack",
    numericalNlopt: "receipt-bound:nlopt",
    numericalAdapter: "receipt-bound:cminpack-adapter",
    nloptAdapter: "receipt-bound:nlopt-adapter",
    async fetchNumerical(url) {
      fetches += 1;
      assert.ok(
        url === "receipt-bound:cminpack" || url === "receipt-bound:nlopt",
      );
      return {
        ok: true,
        async arrayBuffer() {
          return url === "receipt-bound:cminpack" ? bytes : nloptBytes;
        },
      };
    },
    async importNumerical(url) {
      adapterImports += 1;
      if (url === "receipt-bound:cminpack-adapter") {
        return { createCminpackBackend };
      }
      assert.equal(url, "receipt-bound:nlopt-adapter");
      return { createNloptBackend };
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
  const nlopt = modules.get("@sagemath/sagejs-numerical-nlopt");
  assert.equal(nlopt.capability.backend, "nlopt-mit-wasm");
  assert.deepEqual(capabilities[1], [
    "wasm-library:nlopt:derivative-free-explicit",
    "receipt-backed-wasm-artifact",
    { executionTarget: "wasm-artifact" },
  ]);
  assert.equal(fetches, 2);
  assert.equal(adapterImports, 2);
  await modules.prepare(["sagejs.numerics.optimization"]);
  assert.equal(fetches, 2);
  assert.equal(adapterImports, 2);
});

test("browser optimization imports survive unavailable explicit resources", async () => {
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
  const unavailableNlopt = modules.get("@sagemath/sagejs-numerical-nlopt");
  assert.equal(unavailableNlopt.capability.backend, "nlopt-unavailable");
  assert.throws(
    () => unavailableNlopt.solve({}),
    /unable to load NLopt numerical backend \(404\)/,
  );
  assert.deepEqual(capabilities, []);
});
