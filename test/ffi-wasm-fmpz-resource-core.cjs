"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync, rmSync } = require("node:fs");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { WASI } = require("node:wasi");

const {
  build,
  toolchain,
} = require("../scripts/build-ffi-wasm-resource-adapter.cjs");
const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const {
  generatedWasmResourceAdapter,
} = require("../tools/ffi/wasm-adapters.cjs");

const root = join(__dirname, "..");
const resourceIds = ["fmpz_matrix", "byte_region"];
const functionIds = [
  "flint_byte_region",
  "flint_byte_region_set",
  "fmpz_matrix",
  "fmpz_matrix_nrows",
  "fmpz_matrix_ncols",
  "fmpz_matrix_set_entry",
  "fmpz_matrix_entry",
  "fmpz_matrix_copy",
  "fmpz_matrix_mul",
  "fmpz_matrix_det",
  "fmpz_matrix_format",
  "fmpz_matrix_serialize",
  "fmpz_matrix_deserialize",
  "fmpz_matrix_deserialize_entries",
];

function flintDeclaration() {
  return loadRegistry({ root }).byId.get("flint");
}

function hasWasmFlintToolchain() {
  const current = toolchain();
  return existsSync(current.clang) && existsSync(current.sysroot) &&
    current.prefixes.every((prefix) =>
      existsSync(join(prefix.path, "include")) &&
      existsSync(join(prefix.path, "lib", `lib${prefix.name}.a`))
    );
}

function closeAll(backend, values) {
  const closes = {
    matrix: "ffiFmpzMatrixClose",
    bytes: "ffiFlintByteRegionClose",
  };
  for (const [kind, value] of values.toReversed()) {
    backend[closes[kind]](value);
  }
}

test("FmpzMatrix Wasm surface is selected entirely from declarations", () => {
  const generated = generatedWasmResourceAdapter(flintDeclaration(), {
    resourceIds,
    functionIds,
  });
  assert.deepEqual(generated.manifest.resources, resourceIds);
  assert.deepEqual(generated.manifest.functions, [
    "fmpz_matrix",
    "fmpz_matrix_nrows",
    "fmpz_matrix_ncols",
    "fmpz_matrix_set_entry",
    "fmpz_matrix_entry",
    "fmpz_matrix_copy",
    "fmpz_matrix_mul",
    "fmpz_matrix_det",
    "fmpz_matrix_format",
    "fmpz_matrix_serialize",
    "flint_byte_region",
    "flint_byte_region_set",
    "fmpz_matrix_deserialize",
    "fmpz_matrix_deserialize_entries",
  ]);
  assert.equal(generated.manifest.schema, "sagejs.ffi/wasm-resource-adapter-v2");
  assert.deepEqual(generated.manifest.host_ingress, [{
    resource: "byte_region",
    kind: "copied_bytes",
    export: "ffiFlintByteRegionFromBytes",
  }]);
  assert.deepEqual(generated.manifest.host_transfer, [{
    resource: "byte_region",
    kind: "copied_bytes",
    export: "ffiFlintByteRegionCopyBytes",
  }]);
  assert.match(
    generated.cSource,
    /sagejs_fmpz_matrix_mul\(sagejs_slot->value, sagejs_resource_left->value/,
  );
  assert.match(generated.cSource, /sagejs_wasm_staged_integer/);
  assert.match(generated.cSource, /sagejs_wasm_publish_fmpz/);
  assert.match(generated.javascriptSource, /new FinalizationRegistry/);
  assert.match(generated.javascriptSource, /finalizer\?\.unregister/);
  assert.doesNotMatch(
    generated.javascriptSource,
    /fn\.id|fmpz_matrix_mul|ffiFmpzMatrixMul.*===/,
    "generated output must not dispatch on a declaration or function name",
  );
});

test("generated FmpzMatrix resources execute through real FLINT Wasm", {
  skip: hasWasmFlintToolchain()
    ? false
    : "CoWasm FLINT toolchain is not available",
}, async () => {
  const output = await mkdtemp(join(tmpdir(), "sagejs-wasm-fmpz-core-"));
  try {
    const built = build({
      library: "flint",
      resources: resourceIds,
      functions: functionIds,
      output,
    });
    const wasi = new WASI({ version: "preview1" });
    const module = await WebAssembly.compile(readFileSync(built.wasmPath));
    const instance = await WebAssembly.instantiate(
      module,
      wasi.getImportObject(),
    );
    wasi.initialize(instance);
    const { createGeneratedWasmBackend } = await import(
      `${pathToFileURL(join(output, "backend.mjs")).href}?fmpz-core`
    );
    const backend = createGeneratedWasmBackend(instance);
    const wasm = instance.exports;
    const owned = [];
    const large = 123456789012345678901234567891n;

    const matrix = backend.ffiFmpzMatrixCreate(2n, 2n);
    owned.push(["matrix", matrix]);
    assert.equal(backend.ffiFmpzMatrixNrows(matrix), 2n);
    assert.equal(backend.ffiFmpzMatrixNcols(matrix), 2n);
    backend.ffiFmpzMatrixSetEntry(matrix, 0n, 0n, large);
    backend.ffiFmpzMatrixSetEntry(matrix, 0n, 1n, -3n);
    backend.ffiFmpzMatrixSetEntry(matrix, 1n, 0n, 5n);
    backend.ffiFmpzMatrixSetEntry(matrix, 1n, 1n, 7n);
    assert.equal(backend.ffiFmpzMatrixEntry(matrix, 0n, 0n), large);

    const copy = backend.ffiFmpzMatrixCopy(matrix);
    owned.push(["matrix", copy]);
    const product = backend.ffiFmpzMatrixMul(matrix, copy);
    owned.push(["matrix", product]);
    assert.equal(
      backend.ffiFmpzMatrixEntry(product, 0n, 0n),
      large * large - 15n,
    );
    assert.equal(backend.ffiFmpzMatrixDet(matrix), 7n * large + 15n);

    const formatted = backend.ffiFmpzMatrixFormat(matrix);
    owned.push(["bytes", formatted]);
    const formattedBytes = backend.ffiFlintByteRegionCopyBytes(formatted);
    backend.ffiFlintByteRegionClose(formatted);
    owned.pop();
    assert.match(new TextDecoder().decode(formattedBytes), /123456789012345/);

    const serialized = backend.ffiFmpzMatrixSerialize(matrix);
    owned.push(["bytes", serialized]);
    const stableBytes = backend.ffiFlintByteRegionCopyBytes(serialized);
    const ingress = backend.ffiFlintByteRegionFromBytes(stableBytes);
    owned.push(["bytes", ingress]);
    const restored = backend.ffiFmpzMatrixDeserialize(ingress);
    owned.push(["matrix", restored]);
    assert.equal(backend.ffiFmpzMatrixEntry(restored, 0n, 0n), large);

    const entriesIngress = backend.ffiFlintByteRegionFromBytes(
      stableBytes.subarray(24),
    );
    owned.push(["bytes", entriesIngress]);
    const restoredEntries = backend.ffiFmpzMatrixDeserializeEntries(
      entriesIngress,
      2n,
      2n,
    );
    owned.push(["matrix", restoredEntries]);
    assert.equal(backend.ffiFmpzMatrixEntry(restoredEntries, 1n, 0n), 5n);

    const incompatible = backend.ffiFmpzMatrixCreate(1n, 1n);
    owned.push(["matrix", incompatible]);
    const liveBeforeFailure = wasm.sagejs_wasm_resource_live_count();
    assert.throws(
      () => backend.ffiFmpzMatrixMul(matrix, incompatible),
      /dimensions are incompatible/,
    );
    assert.equal(
      wasm.sagejs_wasm_resource_live_count(),
      liveBeforeFailure,
      "failed resource results must not consume a live output slot",
    );
    assert.throws(
      () => backend.ffiFmpzMatrixEntry(matrix, 9n, 0n),
      /out of bounds/,
    );

    const invalidBytes = stableBytes.slice();
    invalidBytes[0] = 0;
    const invalidIngress = backend.ffiFlintByteRegionFromBytes(invalidBytes);
    owned.push(["bytes", invalidIngress]);
    const liveBeforeInvalid = wasm.sagejs_wasm_resource_live_count();
    assert.throws(
      () => backend.ffiFmpzMatrixDeserialize(invalidIngress),
      /invalid SJZM v1/,
    );
    assert.equal(wasm.sagejs_wasm_resource_live_count(), liveBeforeInvalid);

    closeAll(backend, owned);
    backend.ffiFmpzMatrixClose(matrix);
    assert.equal(wasm.sagejs_wasm_resource_live_count(), 0n);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
