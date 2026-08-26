// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync, rmSync, writeFileSync } = require("node:fs");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { WASI } = require("node:wasi");

const { build, toolchainAvailable } = require(
  "../scripts/build-ffi-wasm-resource-adapter.cjs"
);
const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const {
  generatedWasmResourceAdapter,
} = require("../tools/ffi/wasm-adapters.cjs");
const {
  generatedWasmClosure,
} = require("../tools/ffi/wasm-closure.cjs");

const root = join(__dirname, "..");

function registry() {
  return loadRegistry({ root });
}

async function generatedModule(artifact, stem) {
  const directory = await mkdtemp(join(tmpdir(), `sagejs-${stem}-`));
  const path = join(directory, "backend.mjs");
  writeFileSync(path, artifact.javascriptSource);
  const module = await import(`${pathToFileURL(path).href}?${Date.now()}`);
  return { directory, module };
}

function mockStageExports(overrides = {}) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const stagePointer = 64;
  let status = 0;
  return {
    memory,
    sagejs_wasm_last_status: () => status,
    sagejs_wasm_stage_bytes: () => {
      /* Detach every previously obtained buffer to exercise the rule that the
         generated adapter reacquires memory only after growth. */
      memory.grow(1);
      status = 0;
      return 1;
    },
    sagejs_wasm_stage_pointer: () => stagePointer,
    sagejs_wasm_last_bytes_pointer: () => 0,
    sagejs_wasm_last_bytes_length: () => 0,
    sagejs_wasm_last_u64: () => 1n,
    setStatus: (value) => { status = value; },
    ...overrides,
  };
}

test("production closure includes every currently declared Wasm FFI function", () => {
  const first = generatedWasmClosure(registry(), { strict: true });
  const second = generatedWasmClosure(registry(), { strict: true });
  assert.equal(first.manifest.hash, second.manifest.hash);
  assert.match(first.manifest.hash, /^[a-f0-9]{64}$/);
  const declarations = registry();
  assert.deepEqual(
    first.manifest.libraries.map((library) => [
      library.library,
      library.functions.length,
      library.rejected.length,
    ]),
    declarations.libraries.map((declaration) => [
      declaration.library.id,
      declaration.functions.filter((fn) => fn.targets.wasm === true).length,
      0,
    ]),
  );
  const flint = first.artifacts.get("flint");
  assert.equal(flint.manifest.packed_transfer.byte_order, "little-endian");
  assert.equal(
    flint.manifest.packed_transfer.memory_growth,
    "reacquire-memory-buffer-before-every-copy",
  );
  assert.ok(flint.manifest.exports.includes("sagejs_wasm_last_status"));
  assert.match(flint.cSource, /sagejs_wasm_integer_get/);
  assert.match(flint.cSource, /nmod_mat_init/);
  assert.match(flint.cSource, /sagejs_wasm_stage_range/);
  assert.match(
    flint.cSource,
    /sagejs_wasm_resource_borrow_fmpz_matrix\(uint64_t handle,/,
  );
  assert.match(
    flint.cSource,
    /sagejs_wasm_resource_adopt_fmpz_matrix\(/,
  );
  assert.ok(flint.manifest.exports.includes(
    "sagejs_wasm_resource_borrow_fmpz_matrix",
  ));
  assert.ok(flint.manifest.exports.includes(
    "sagejs_wasm_resource_adopt_fmpz_matrix",
  ));
  const ownershipOnly = generatedWasmResourceAdapter(
    registry().byId.get("flint"),
    { resourceIds: ["fmpz_matrix"], resourceOnly: true },
  );
  assert.deepEqual(ownershipOnly.manifest.functions, []);
  assert.deepEqual(ownershipOnly.manifest.resources, ["fmpz_matrix"]);
  assert.ok(ownershipOnly.manifest.exports.includes(
    "sagejs_wasm_resource_borrow_fmpz_matrix",
  ));
  assert.doesNotMatch(ownershipOnly.cSource, /sagejs_wasm_ffiFmpzMatrixDet/);

  const reviewed = generatedWasmClosure(registry(), {
    strict: true,
    adapterInputs: {
      schema: "sagejs.wasm-adapter-inputs/v1",
      modules: {
        flint: {
          declaration: "flint",
          ownershipDomain: "flint-gmp-mpfr-arb",
          resources: ["dirichlet_group"],
          functions: ["dirichlet_group_init", "dirichlet_group_size"],
        },
      },
    },
  });
  assert.equal(reviewed.manifest.libraries[0].ownership_domain,
    "flint-gmp-mpfr-arb");
  assert.deepEqual(reviewed.manifest.libraries[0].functions,
    ["dirichlet_group_init", "dirichlet_group_size"]);
});

test("generated ownership bridge is branded and bound to one Wasm instance", async () => {
  const declaration = registry().byId.get("flint");
  const artifact = generatedWasmResourceAdapter(declaration, {
    resourceIds: ["fmpz_matrix"],
    functionIds: ["fmpz_matrix"],
  });
  const { directory, module } = await generatedModule(
    artifact,
    "wasm-resource-bridge",
  );
  try {
    let closeCalls = 0;
    const exports = mockStageExports({
      sagejs_wasm_ffiFmpzMatrixClose: (handle) => {
        assert.equal(handle, 9n);
        closeCalls += 1;
        return 1;
      },
    });
    const instance = { exports };
    const backend = module.createGeneratedWasmBackend(instance);
    assert.equal(Object.keys(backend).includes("resourceBridge"), false);
    const resource = Object.freeze({
      id: "fmpz_matrix",
      identity: `resource:${declaration.identity}:fmpz_matrix`,
      closeExport: "sagejs_wasm_ffiFmpzMatrixClose",
    });
    const value = backend.resourceBridge.wrap({
      instance,
      resource,
      handle: 9n,
    });
    assert.equal(backend.resourceBridge.unwrap({
      instance,
      resource,
      value,
    }), 9n);
    assert.throws(
      () => backend.resourceBridge.unwrap({
        instance: { exports },
        resource,
        value,
      }),
      /another Wasm instance/,
    );
    assert.throws(
      () => backend.resourceBridge.unwrap({
        instance,
        resource: { ...resource, identity: "resource:wrong:fmpz_matrix" },
        value,
      }),
      /another Wasm instance/,
    );
    backend.ffiFmpzMatrixClose(value);
    assert.equal(closeCalls, 1);
    assert.throws(
      () => backend.resourceBridge.unwrap({ instance, resource, value }),
      /closed/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("packed uint64 adapters are transactional and memory-growth-safe", async () => {
  const declaration = registry().byId.get("flint");
  const artifact = generatedWasmResourceAdapter(declaration, {
    functionIds: ["nmod_poly_add"],
  });
  const { directory, module } = await generatedModule(artifact, "wasm-u64");
  try {
    let fail = false;
    const exports = mockStageExports();
    exports.sagejs_wasm_ffiNmodPolyAdd = (
      outputOffset, outputLength, leftOffset, leftLength,
      rightOffset, rightLength, declaredOutput, declaredLeft,
      declaredRight, modulus,
    ) => {
      assert.equal(BigInt(outputLength), declaredOutput);
      assert.equal(BigInt(leftLength), declaredLeft);
      assert.equal(BigInt(rightLength), declaredRight);
      const view = new DataView(exports.memory.buffer);
      const base = exports.sagejs_wasm_stage_pointer();
      for (let index = 0; index < outputLength; index += 1) {
        const left = index < leftLength
          ? view.getBigUint64(base + leftOffset + index * 8, true) : 0n;
        const right = index < rightLength
          ? view.getBigUint64(base + rightOffset + index * 8, true) : 0n;
        view.setBigUint64(
          base + outputOffset + index * 8,
          (left + right) % modulus,
          true,
        );
      }
      exports.memory.grow(1);
      if (fail) {
        exports.setStatus(5);
        return 0;
      }
      return 1;
    };
    const backend = module.createGeneratedWasmBackend({ exports });
    const output = new BigUint64Array([91n, 91n, 91n]);
    backend.ffiNmodPolyAdd(
      output,
      new BigUint64Array([1n, 2n]),
      new BigUint64Array([3n, 4n, 5n]),
      3n, 2n, 3n, 7n,
    );
    assert.deepEqual(Array.from(output), [4n, 6n, 5n]);

    output.fill(19n);
    fail = true;
    assert.throws(
      () => backend.ffiNmodPolyAdd(
        output,
        new BigUint64Array([1n]),
        new BigUint64Array([2n]),
        3n, 1n, 1n, 7n,
      ),
      (error) => error.name === "WasmFfiError" &&
        error.code === "library-failure",
    );
    assert.deepEqual(Array.from(output), [19n, 19n, 19n]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("packed exact-integer output uses signed-size limb transport", async () => {
  const declaration = registry().byId.get("flint");
  const artifact = generatedWasmResourceAdapter(declaration, {
    functionIds: ["fmpz_mat_det"],
  });
  const { directory, module } = await generatedModule(artifact, "wasm-fmpz");
  try {
    const exports = mockStageExports();
    exports.sagejs_wasm_ffiFmpzMatDet = (
      outputSizes, outputLimbs, outputLength, outputCapacity,
      _sourceSizes, _sourceLimbs, sourceLength, _sourceCapacity,
      size, one,
    ) => {
      assert.equal(outputLength, 1);
      assert.equal(sourceLength, 4);
      assert.equal(size, 2n);
      assert.equal(one, 1n);
      const base = exports.sagejs_wasm_stage_pointer();
      const view = new DataView(exports.memory.buffer);
      view.setInt32(base + outputSizes, -1, true);
      view.setBigUint64(base + outputLimbs, 2n, true);
      exports.memory.grow(1);
      return outputCapacity >= 1 ? 1 : 0;
    };
    const backend = module.createGeneratedWasmBackend({ exports });
    const output = {
      sizes: new Int32Array(1),
      limbs: new BigUint64Array(2),
      length: 1,
      wordCapacity: 2,
    };
    const source = {
      sizes: new Int32Array([1, 1, 1, 1]),
      limbs: new BigUint64Array([1n, 0n, 2n, 0n, 3n, 0n, 4n, 0n]),
      length: 4,
      wordCapacity: 2,
    };
    assert.equal(backend.ffiFmpzMatDet(output, source, 2n, 1n), true);
    assert.equal(output.sizes[0], -1);
    assert.equal(output.limbs[0], 2n);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("borrowed resource views retain and follow their owned root", async () => {
  const original = registry().byId.get("igraph");
  const declaration = {
    ...original,
    resources: original.resources.map((resource) => ({
      ...resource,
      targets: { ...resource.targets, wasm: true },
    })),
    functions: original.functions.slice(0, 5).map((fn) => ({
      ...fn,
      targets: { ...fn.targets, wasm: true },
    })),
  };
  const artifact = generatedWasmResourceAdapter(declaration, {
    resourceIds: ["graph", "edges"],
    functionIds: declaration.functions.map((fn) => fn.id),
  });
  assert.match(artifact.cSource, /edges_invalidate_root\(handle\)/);
  assert.match(artifact.cSource, /root_handle/);
  const { directory, module } = await generatedModule(artifact, "wasm-view");
  try {
    let last = 0n;
    let graphLive = true;
    const exports = mockStageExports({
      sagejs_wasm_last_u64: () => last,
    });
    const byId = new Map(declaration.functions.map((fn) => [fn.id, fn]));
    exports[`sagejs_wasm_${byId.get("complete_graph").dynamic.export}`] = () => {
      last = 1n;
      graphLive = true;
      return 1;
    };
    exports[`sagejs_wasm_${byId.get("vertex_count").dynamic.export}`] = () => {
      last = 5n;
      return graphLive ? 1 : 0;
    };
    exports[`sagejs_wasm_${byId.get("edges").dynamic.export}`] = () => {
      last = 2n;
      return graphLive ? 1 : 0;
    };
    exports[`sagejs_wasm_${byId.get("edge_count").dynamic.export}`] = () => {
      last = 10n;
      return graphLive ? 1 : 0;
    };
    exports[`sagejs_wasm_${byId.get("edge_checksum").dynamic.export}`] = () => {
      last = 20n;
      return graphLive ? 1 : 0;
    };
    const closeExport = declaration.resources[0].dynamic.close_export;
    exports[`sagejs_wasm_${closeExport}`] = () => {
      graphLive = false;
      return 1;
    };
    const backend = module.createGeneratedWasmBackend({ exports });
    const graph = backend[byId.get("complete_graph").dynamic.export](5n, false, false);
    const edges = backend[byId.get("edges").dynamic.export](graph);
    assert.equal(backend[byId.get("edge_count").dynamic.export](edges), 10n);
    backend[closeExport](graph);
    assert.throws(
      () => backend[byId.get("edge_count").dynamic.export](edges),
      /resource root is closed/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generated packed adapter executes through real FLINT Wasm", {
  skip: toolchainAvailable("flint")
    ? false
    : "pinned FLINT Wasm toolchain is not available",
}, async () => {
  const output = await mkdtemp(join(tmpdir(), "sagejs-wasm-packed-real-"));
  try {
    const built = build({
      library: "flint",
      resources: ["fmpz_matrix"],
      functions: ["nmod_poly_add"],
      output,
    });
    const wasi = new WASI({ version: "preview1" });
    const wasmModule = await WebAssembly.compile(readFileSync(built.wasmPath));
    const instance = await WebAssembly.instantiate(
      wasmModule,
      wasi.getImportObject(),
    );
    wasi.initialize(instance);
    const generated = await import(
      `${pathToFileURL(join(output, "backend.mjs")).href}?packed-real`
    );
    const backend = generated.createGeneratedWasmBackend(instance);
    const result = new BigUint64Array(3);
    assert.equal(backend.ffiNmodPolyAdd(
      result,
      new BigUint64Array([1n, 2n]),
      new BigUint64Array([3n, 4n, 5n]),
      3n, 2n, 3n, 7n,
    ), true);
    assert.deepEqual(Array.from(result), [4n, 6n, 5n]);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
