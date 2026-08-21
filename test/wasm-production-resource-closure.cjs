"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { WASI } = require("node:wasi");

const {
  buildWasmProductionPacks,
  inventoryProductionKernels,
} = require("../tools/native-kernel/wasm-production-pack.cjs");
const {
  resolveToolchain,
} = require("../packages/flint-wasm/scripts/wasm-toolchain.cjs");

const root = resolve(__dirname, "..");

async function reducedManifest(directory) {
  const registered = JSON.parse(readFileSync(
    join(root, "architecture", "native-kernels.json"),
    "utf8",
  ));
  const wanted = new Map([
    ["sparse-random-matrix-production", ["sparse_random_fmpq"]],
    ["dense-rational-flint-production", [
      "flint_dense_rational_matrix_entry",
      "flint_dense_rational_matrix_nonzero_count",
    ]],
  ]);
  const kernels = registered.kernels
    .filter((kernel) => wanted.has(kernel.id))
    .map((kernel) => ({ ...kernel, functions: wanted.get(kernel.id) }));
  assert.equal(kernels.length, wanted.size);
  const filename = join(directory, "native-kernels.json");
  writeFileSync(filename, `${JSON.stringify({ kernels }, null, 2)}\n`);
  return filename;
}

function ownershipAdapterSource() {
  return String.raw`#include <stdint.h>
#include <string.h>
#include "sagejs/fmpq_matrix_ffi.h"

typedef struct
{
    uint32_t generation;
    int live;
    sagejs_fmpq_matrix_t value;
}
sagejs_test_fmpq_slot;

static sagejs_test_fmpq_slot sagejs_test_slots[2] = {
    {1, 0, {{0}}}, {1, 0, {{0}}}
};
static uint64_t sagejs_test_live = 0;

static int sagejs_test_lookup(uint64_t handle, sagejs_test_fmpq_slot **slot)
{
    uint32_t encoded = (uint32_t) handle;
    uint32_t generation = (uint32_t) (handle >> 32);
    if (encoded == 0 || encoded > 2)
        return 0;
    *slot = &sagejs_test_slots[encoded - 1];
    return (*slot)->live && (*slot)->generation == generation;
}

int sagejs_wasm_resource_borrow_fmpq_matrix(
    uint64_t handle, sagejs_fmpq_matrix_t **value)
{
    sagejs_test_fmpq_slot *slot = NULL;
    if (value == NULL || !sagejs_test_lookup(handle, &slot))
        return 0;
    *value = &slot->value;
    return 1;
}

int sagejs_wasm_resource_adopt_fmpq_matrix(
    sagejs_fmpq_matrix_t value, uint64_t *handle)
{
    uint32_t index;
    if (handle == NULL)
        return 0;
    for (index = 0; index < 2; index++)
    {
        sagejs_test_fmpq_slot *slot = &sagejs_test_slots[index];
        if (!slot->live)
        {
            memcpy(slot->value, value, sizeof(slot->value));
            slot->live = 1;
            sagejs_test_live++;
            *handle = ((uint64_t) slot->generation << 32) | (index + 1);
            return 1;
        }
    }
    return 0;
}

int sagejs_wasm_ffiFmpqMatrixClose(uint64_t handle)
{
    sagejs_test_fmpq_slot *slot = NULL;
    if (!sagejs_test_lookup(handle, &slot))
        return 0;
    sagejs_fmpq_matrix_clear(slot->value);
    memset(slot->value, 0, sizeof(slot->value));
    slot->live = 0;
    slot->generation++;
    if (slot->generation == 0)
        slot->generation = 1;
    sagejs_test_live--;
    return 1;
}

uint64_t sagejs_test_resource_live_count(void)
{
    return sagejs_test_live;
}
`;
}

function toolchain() {
  const status = resolveToolchain({ root });
  if (!status.ready) return null;
  return {
    clang: status.paths.clang,
    sysroot: status.paths.sysroot,
    gmpPrefix: status.paths.libraries.gmp.prefix,
    flintPrefix: status.paths.libraries.flint.prefix,
    mpfrPrefix: status.paths.libraries.mpfr.prefix,
    mpcPrefix: status.paths.libraries.mpc.prefix,
  };
}

function resourceBridgeState() {
  const states = new WeakMap();
  let instance;
  const bridge = {
    wrap({ instance: owner, resource, handle }) {
      assert.equal(resource.id, "fmpq_matrix");
      instance ??= owner;
      assert.equal(owner, instance);
      const value = Object.freeze(Object.create(null));
      states.set(value, { instance: owner, identity: resource.identity, handle,
        closed: false });
      return value;
    },
    unwrap({ instance: owner, resource, value }) {
      const state = states.get(value);
      if (state === undefined || state.instance !== owner ||
          state.identity !== resource.identity || state.closed) {
        throw new TypeError("invalid or closed generated resource wrapper");
      }
      return state.handle;
    },
  };
  return {
    bridge,
    raw(value) {
      return states.get(value).handle;
    },
    close(value) {
      const state = states.get(value);
      if (state.closed) return;
      assert.equal(
        state.instance.exports.sagejs_wasm_ffiFmpqMatrixClose(state.handle),
        1,
      );
      state.closed = true;
      state.handle = 0n;
    },
  };
}

test("production resource closure compiles every registered function", async () => {
  const inventory = await inventoryProductionKernels({
    root,
    manifestPath: join(root, "architecture", "native-kernels.json"),
  });
  const unsupported = inventory.inventory.flatMap((kernel) =>
    kernel.functions.filter((fn) => fn.status === "unsupported")
      .map((fn) => [kernel.id, fn.name, fn.reason, fn.resources])
  );
  assert.equal(inventory.inventory.flatMap((kernel) => kernel.functions)
    .filter((fn) => fn.status === "compiled-source").length, 229);
  assert.deepEqual(unsupported, []);
});

test("real FLINT Wasm adopts, borrows, grows memory, and closes resources", {
  skip: toolchain() === null ? "pinned production Wasm toolchain is unavailable" : false,
  timeout: 180_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-resource-pack-"));
  try {
    const manifestPath = await reducedManifest(temporary);
    const adapterPath = join(temporary, "ownership-adapter.c");
    writeFileSync(adapterPath, ownershipAdapterSource());
    const outputRoot = join(temporary, "output");
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["flint"],
      emitOnly: false,
      toolchain: toolchain(),
      ownershipAdapters: {
        flint: {
          identity: "test:fmpq-matrix-generation-table-v1",
          sources: [adapterPath],
          exports: [
            "sagejs_wasm_ffiFmpqMatrixClose",
            "sagejs_test_resource_live_count",
          ],
        },
      },
    });
    assert.equal(manifest.compiledFunctions, 3);
    assert.equal(manifest.unsupportedFunctions, 0);
    assert.deepEqual(
      manifest.packs[0].requiredResourceAdapters.map((item) => item.id),
      ["fmpq_matrix"],
    );

    const { instantiateWasmKernelPacks } = await import(
      "../tools/native-kernel/wasm-pack-loader.mjs"
    );
    let unwrappedInstance;
    const unwrapped = await instantiateWasmKernelPacks({
      manifest,
      load(pack) {
        return readFileSync(join(outputRoot, pack.asset));
      },
      host() {
        const wasi = new WASI({ version: "preview1", returnOnExit: true });
        return {
          imports: { wasi_snapshot_preview1: wasi.wasiImport },
          initialize(owner) {
            unwrappedInstance = owner;
            wasi.initialize(owner);
          },
        };
      },
    });
    const unwrappedCreate = unwrapped.function(
      "sagejs/linear_algebra/sparse_random_public.py",
      "sparse_random_fmpq",
    );
    assert.throws(() => unwrappedCreate(
      2n, 2n, 2n, 1n, 1n, 0n, 5n, 5n, 1n, [0n, 0n],
      2147483648n, 1103515245n, 12345n,
    ), /requires its same-instance generated ownership adapter/);
    assert.equal(
      unwrappedInstance.exports.sagejs_test_resource_live_count(),
      0n,
      "a missing host wrapper must close the already-adopted C resource",
    );

    const resources = resourceBridgeState();
    let instance;
    const runtime = await instantiateWasmKernelPacks({
      manifest,
      load(pack) {
        return readFileSync(join(outputRoot, pack.asset));
      },
      host() {
        const wasi = new WASI({ version: "preview1", returnOnExit: true });
        return {
          imports: { wasi_snapshot_preview1: wasi.wasiImport },
          initialize(owner) {
            instance = owner;
            wasi.initialize(owner);
          },
        };
      },
      resources: resources.bridge,
    });
    const create = runtime.function(
      "sagejs/linear_algebra/sparse_random_public.py",
      "sparse_random_fmpq",
    );
    const entry = runtime.function(
      "sagejs/kernels/matrix/dense_rational_flint.py",
      "flint_dense_rational_matrix_entry",
    );
    const nonzero = runtime.function(
      "sagejs/kernels/matrix/dense_rational_flint.py",
      "flint_dense_rational_matrix_nonzero_count",
    );
    const createZero = () => create(
      2n, 2n, 2n, 1n, 1n, 0n, 5n, 5n, 1n,
      [0n, 0n], // invalid length deliberately returns the new zero matrix
      2147483648n, 1103515245n, 12345n,
    );

    const first = createZero();
    assert.equal(instance.exports.sagejs_test_resource_live_count(), 1n);
    assert.deepEqual(entry(first, 0n, 0n), [0n, 1n]);
    assert.equal(nonzero(first, 2n, 2n), 0n);
    instance.exports.memory.grow(1);
    assert.deepEqual(entry(first, 1n, 1n), [0n, 1n]);
    assert.throws(() => nonzero(Object.freeze({}), 2n, 2n),
      /invalid or closed generated resource wrapper/);

    const stale = resources.raw(first);
    assert.equal(instance.exports.sagejs_wasm_ffiFmpqMatrixClose(stale), 1);
    assert.throws(() => nonzero(first, 2n, 2n),
      /invalid or closed same-instance Wasm resource handle/);

    const second = createZero();
    const third = createZero();
    assert.equal(instance.exports.sagejs_test_resource_live_count(), 2n);
    assert.throws(() => createZero(), /unable to adopt returned Wasm resource/);
    assert.equal(instance.exports.sagejs_test_resource_live_count(), 2n);
    resources.close(second);
    resources.close(second);
    resources.close(third);
    assert.equal(instance.exports.sagejs_test_resource_live_count(), 0n);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
