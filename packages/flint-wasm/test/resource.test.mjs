import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const resourceBackend = await fs.readFile(
  new URL("../dist/ffi-resource-backend.mjs", import.meta.url),
);
const serializationBackend = await fs.readFile(
  new URL("../dist/serialization.mjs", import.meta.url),
);
const flint = await instantiateFlintFactor(wasm);

function liveResources() {
  return flint.__sagejs_wasm_resource_live_count__();
}

test("loads the generated resource backend through the public package", () => {
  assert.ok(
    wasm.byteLength <= 5_050_000,
    `FLINT Wasm payload grew to ${wasm.byteLength} bytes`,
  );
  assert.ok(
    resourceBackend.byteLength <= 32_000,
    `generated resource backend grew to ${resourceBackend.byteLength} bytes`,
  );
  assert.ok(
    serializationBackend.byteLength <= 50_000,
    `browser SagePack backend grew to ${serializationBackend.byteLength} bytes`,
  );
  assert.equal(
    flint.__sagejs_ffi_manifest__.library,
    flint.__sagejs_ffi_manifest__.declaration,
  );
  assert.deepEqual(flint.__sagejs_ffi_manifest__.resources, [
    "fmpz_matrix",
    "fmpq_matrix",
    "fmpq_value",
    "byte_region",
    "dirichlet_group",
  ]);
  assert.equal(liveResources(), 0n);

  const group = flint.ffiDirichletGroupCreate(13n);
  assert.equal(flint.ffiDirichletGroupSize(group), 12n);
  assert.equal(flint.ffiDirichletGroupNumPrimitive(group), 11n);
  assert.equal(liveResources(), 1n);
  flint.ffiDirichletGroupClose(group);
  flint.ffiDirichletGroupClose(group);
  assert.equal(liveResources(), 0n);
});

test("host finalizers can release generated Wasm handles", {
  skip: typeof globalThis.gc === "function"
    ? false
    : "the JavaScript host does not expose forced garbage collection",
}, async () => {
  let finalized = 0;
  const registry = new FinalizationRegistry((handle) => {
    flint.ffiDirichletGroupClose(handle);
    finalized += 1;
  });
  (() => {
    const token = Object.create(null);
    const handle = flint.ffiDirichletGroupCreate(17n);
    registry.register(token, handle, token);
    assert.equal(flint.ffiDirichletGroupSize(handle), 16n);
  })();
  assert.equal(liveResources(), 1n);

  for (let attempt = 0; attempt < 30 && finalized === 0; attempt++) {
    globalThis.gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(finalized, 1);
  assert.equal(liveResources(), 0n);
});
