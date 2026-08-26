// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync, rmSync } = require("node:fs");
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

const root = join(__dirname, "..");
const functionIds = [
  "dirichlet_group_init",
  "dirichlet_group_size",
  "dirichlet_group_num_primitive",
];

function flintDeclaration() {
  return loadRegistry({ root }).byId.get("flint");
}

function withSyntheticBoolParameter(declaration) {
  const original = declaration.functions.find(
    (fn) => fn.id === "dirichlet_group_size",
  );
  const synthetic = {
    ...original,
    id: "dirichlet_group_bool_smoke",
    python_name: "dirichlet_group_bool_smoke",
    declaration_id: "flint:dirichlet_group_bool_smoke",
    signature: {
      ...original.signature,
      parameters: [
        ...original.signature.parameters,
        {
          name: "enabled",
          type: "bool",
          ownership: "value",
          mutability: "read",
          aliasing: "allowed",
        },
      ],
    },
    dynamic: { export: "ffiDirichletGroupBoolSmoke" },
    native: {
      ...original.native,
      symbol: "sagejs_dirichlet_group_bool_smoke",
      arguments: [
        ...original.native.arguments,
        {
          source: "enabled",
          abi_type: "int",
          direction: "in",
          adapter: null,
        },
      ],
    },
  };
  return {
    ...declaration,
    functions: [...declaration.functions, synthetic],
  };
}

test("generated Wasm resource selection is explicit and fail-closed", () => {
  const declaration = flintDeclaration();
  const generated = generatedWasmResourceAdapter(declaration, {
    resourceIds: ["dirichlet_group"],
    functionIds,
  });

  assert.deepEqual(generated.manifest.resources, ["dirichlet_group"]);
  assert.deepEqual(generated.manifest.functions, functionIds);
  assert.match(generated.cSource, /dirichlet_group_clear\(slot->value\)/);
  assert.match(generated.cSource, /slot->generation != generation/);
  assert.match(generated.javascriptSource, /generated Wasm FFI resource is closed/);
  assert.match(generated.hostSource, /def ffiDirichletGroupCreate/);
  assert.doesNotMatch(generated.hostSource, /def ffiFmpqMatrixCreate/);

  const scalarGenerated = generatedWasmResourceAdapter(declaration, {
    resourceIds: ["dirichlet_group"],
    functionIds: ["n_is_prime"],
  });
  assert.deepEqual(scalarGenerated.manifest.functions, ["n_is_prime"]);
  assert.match(
    scalarGenerated.cSource,
    /sagejs_wasm_wordIsPrime/,
  );
  assert.doesNotMatch(
    scalarGenerated.cSource,
    /static int\s+sagejs_wasm_stage_range/,
  );
  assert.throws(
    () => generatedWasmResourceAdapter(declaration, {
      resourceIds: ["fmpq_matrix"],
    }),
    /not declared for the Wasm target/,
  );

  const size = declaration.functions.find(
    (fn) => fn.id === "dirichlet_group_size",
  );
  const consumingSize = {
    ...size,
    signature: {
      ...size.signature,
      parameters: size.signature.parameters.map((parameter) => ({
        ...parameter,
        ownership: "owned",
      })),
    },
  };
  assert.throws(
    () => generatedWasmResourceAdapter({
      ...declaration,
      functions: declaration.functions.map((fn) =>
        fn.id === consumingSize.id ? consumingSize : fn
      ),
    }, {
      resourceIds: ["dirichlet_group"],
      functionIds: ["dirichlet_group_size"],
    }),
    /unsupported resource ownership owned/,
  );

  const boolGenerated = generatedWasmResourceAdapter(
    withSyntheticBoolParameter(declaration),
    {
      resourceIds: ["dirichlet_group"],
      functionIds: ["dirichlet_group_bool_smoke"],
    },
  );
  assert.match(
    boolGenerated.cSource,
    /int32_t sagejs_argument_enabled/,
  );
  assert.match(
    boolGenerated.javascriptSource,
    /enabled \? 1 : 0/,
  );
});

test("generated Wasm route traces retain the declaration library identity", () => {
  const generated = generatedWasmResourceAdapter(flintDeclaration(), {
    functionIds,
    resourceIds: ["dirichlet_group"],
  });
  assert.doesNotMatch(generated.javascriptSource, /ffi:undefined:/);
  assert.match(generated.javascriptSource, /"ffi:flint:dirichlet" \+ "_"/);
});

test("generated FLINT resource has a real Wasm lifecycle", {
  skip: toolchainAvailable("flint")
    ? false
    : "Sage.js FLINT Wasm toolchain is not available",
}, async () => {
  const output = await mkdtemp(join(tmpdir(), "sagejs-wasm-resource-"));
  try {
    const built = build({
      library: "flint",
      resources: ["dirichlet_group"],
      functions: functionIds,
      output,
    });
    assert.equal(built.wasmPath, join(output, "adapter.wasm"));
    assert.deepEqual(
      JSON.parse(readFileSync(join(output, "manifest.json"), "utf8")),
      built.manifest,
    );

    const wasi = new WASI({ version: "preview1" });
    const module = await WebAssembly.compile(readFileSync(built.wasmPath));
    const instance = await WebAssembly.instantiate(
      module,
      wasi.getImportObject(),
    );
    wasi.initialize(instance);
    const { createGeneratedWasmBackend } = await import(
      pathToFileURL(join(output, "backend.mjs")).href
    );
    const backend = createGeneratedWasmBackend(instance);
    const wasm = instance.exports;

    const otherWasi = new WASI({ version: "preview1" });
    const otherInstance = await WebAssembly.instantiate(
      module,
      otherWasi.getImportObject(),
    );
    otherWasi.initialize(otherInstance);
    const otherBackend = createGeneratedWasmBackend(otherInstance);

    assert.equal(wasm.sagejs_wasm_resource_live_count(), 0n);
    assert.throws(
      () => backend.ffiDirichletGroupCreate(0n),
      /declared uint64 value/,
    );
    assert.throws(
      () => backend.ffiDirichletGroupCreate(13),
      /declared uint64 value/,
    );

    const first = backend.ffiDirichletGroupCreate(13n);
    const firstHandle = wasm.sagejs_wasm_last_u64();
    assert.equal(wasm.sagejs_wasm_resource_live_count(), 1n);
    assert.equal(backend.ffiDirichletGroupSize(first), 12n);
    assert.equal(backend.ffiDirichletGroupNumPrimitive(first), 11n);
    assert.throws(
      () => otherBackend.ffiDirichletGroupSize(first),
      /invalid generated Wasm FFI resource/,
      "resources must remain branded to the Wasm instance that owns them",
    );

    backend.ffiDirichletGroupClose(first);
    backend.ffiDirichletGroupClose(first);
    assert.equal(wasm.sagejs_wasm_resource_live_count(), 0n);
    assert.throws(
      () => backend.ffiDirichletGroupSize(first),
      /resource is closed/,
    );

    const second = backend.ffiDirichletGroupCreate(5n);
    const secondHandle = wasm.sagejs_wasm_last_u64();
    assert.notEqual(secondHandle, firstHandle);
    assert.equal(wasm.sagejs_wasm_resource_live_count(), 1n);
    assert.equal(backend.ffiDirichletGroupSize(second), 4n);

    assert.equal(
      wasm.sagejs_wasm_ffiDirichletGroupSize(firstHandle),
      0,
      "a stale raw handle must fail its generation check",
    );
    assert.equal(
      wasm.sagejs_wasm_ffiDirichletGroupClose(firstHandle),
      0,
    );
    assert.equal(wasm.sagejs_wasm_resource_live_count(), 1n);

    backend.ffiDirichletGroupClose(second);
    assert.equal(wasm.sagejs_wasm_resource_live_count(), 0n);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
