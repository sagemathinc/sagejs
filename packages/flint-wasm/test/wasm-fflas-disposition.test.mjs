import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createSage } from "../node-kernel.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const {
  FFLAS_DISPOSITIONS,
  checkedWasmRoutes,
  parsePayload,
  pythonSource,
} = require(path.join(repositoryRoot, "bench", "wasm-fflas-disposition.cjs"));

test("all ten desktop FFLAS boundaries have a precise public Wasm disposition", () => {
  assert.equal(FFLAS_DISPOSITIONS.length, 10);
  assert.equal(
    new Set(FFLAS_DISPOSITIONS.map(({ capability }) => capability)).size,
    10,
  );
  const probes = FFLAS_DISPOSITIONS.filter(({ capability }) =>
    capability.endsWith("_available"));
  assert.equal(probes.length, 2);
  assert.ok(probes.every(({ wasmCapability }) => wasmCapability === null));
  const operations = FFLAS_DISPOSITIONS.filter(({ wasmCapability }) =>
    wasmCapability !== null);
  assert.equal(operations.length, 8);
  assert.ok(operations.every(({ wasmCapability }) =>
    wasmCapability.startsWith("ffi:flint:nmod_")));
});

test("public float and double prime-matrix workloads agree with native exactly", {
  timeout: 120_000,
}, async () => {
  const session = await createSage();
  try {
    for (const modulus of [97, 65537]) {
      const configuration = { size: 32, modulus, samples: 1 };
      const source = pythonSource(configuration);
      const native = spawnSync(
        process.execPath,
        [path.join(repositoryRoot, "bin", "sagejs"), "-"],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            OPENBLAS_NUM_THREADS: "1",
            SAGEJS_NATIVE_TRACE: "1",
          },
          input: source,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      if (native.error) throw native.error;
      assert.equal(native.status, 0, native.stderr || native.stdout);
      const expected = parsePayload(native.stdout);
      const wasm = await session.evaluate(source, { timeout: 120_000 });
      const actual = parsePayload(wasm.stdout);
      assert.equal(actual.exact_sha256, expected.exact_sha256);
      assert.deepEqual(actual.mathematical, expected.mathematical);
      const routes = checkedWasmRoutes(wasm.instrumentation, modulus);
      assert.equal(routes.routes.length, 4);
      assert.ok(routes.boundary_crossings >= 4);
      assert.ok(routes.copied_bytes > 0);
    }
  } finally {
    await session.close();
  }
});

test("Wasm32 selects nmod resources exactly through its ulong range", {
  timeout: 120_000,
}, async () => {
  const session = await createSage();
  try {
    const within = await session.evaluate(`
p = 4294967291
A = matrix(GF(p), 2, 2, [1, 2, 3, 5])
print(A.det())
`, { timeout: 120_000 });
    assert.equal(within.stdout, "4294967290\n");
    assert.ok(within.instrumentation.routes.some(({ capability_id }) =>
      capability_id === "ffi:flint:nmod_matrix_det"));

    const above = await session.evaluate(`
p = 4294967311
A = matrix(GF(p), 2, 2, [1, 2, 3, 5])
print(A.det())
`, { timeout: 120_000 });
    assert.equal(above.stdout, "4294967310\n");
    assert.ok(!above.instrumentation.routes.some(({ capability_id }) =>
      capability_id.startsWith("ffi:flint:nmod_matrix_")));
  } finally {
    await session.close();
  }
});
