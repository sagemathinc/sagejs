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
const resourceIds = ["fmpq_matrix", "fmpq_value", "byte_region"];
const functionIds = [
  "flint_byte_region",
  "flint_byte_region_set",
  "fmpq_matrix",
  "fmpq_matrix_nrows",
  "fmpq_matrix_ncols",
  "fmpq_matrix_set_entry",
  "fmpq_matrix_entry_numerator",
  "fmpq_matrix_entry_denominator",
  "fmpq_matrix_entry_is_zero",
  "fmpq_matrix_copy",
  "fmpq_matrix_mul",
  "fmpq_matrix_rref",
  "fmpq_matrix_rank",
  "fmpq_matrix_det",
  "fmpq_value_numerator",
  "fmpq_value_denominator",
  "fmpq_matrix_format",
  "fmpq_matrix_serialize",
  "fmpq_matrix_deserialize",
];

function flintDeclaration() {
  return loadRegistry({ root }).byId.get("flint");
}

function closeAll(backend, values) {
  const closes = {
    matrix: "ffiFmpqMatrixClose",
    value: "ffiFmpqValueClose",
    bytes: "ffiFlintByteRegionClose",
  };
  for (const [kind, value] of values.toReversed()) {
    backend[closes[kind]](value);
  }
}

test("Fmpq Wasm surface is selected entirely from declarations", () => {
  const generated = generatedWasmResourceAdapter(flintDeclaration(), {
    resourceIds,
    functionIds,
  });
  assert.deepEqual(generated.manifest.resources, resourceIds);
  assert.deepEqual(generated.manifest.functions, functionIds);
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
    /sagejs_fmpq_matrix_mul\(sagejs_slot->value, sagejs_resource_left->value/,
  );
  assert.match(generated.cSource, /sagejs_wasm_staged_integer/);
  assert.match(generated.cSource, /sagejs_wasm_publish_fmpz/);
  assert.match(generated.cSource, /sagejs_flint_byte_region_init_copy/);
  assert.match(generated.javascriptSource, /new FinalizationRegistry/);
  assert.match(generated.javascriptSource, /finalizer\?\.unregister/);
  assert.match(generated.javascriptSource, /return copiedLastBytes\(\)/);
  assert.doesNotMatch(
    generated.javascriptSource,
    /fn\.id|fmpq_matrix_mul|ffiFmpqMatrixMul.*===/,
    "generated output must not dispatch on a declaration or function name",
  );
});

test("generated Fmpq resources execute through real FLINT Wasm", {
  skip: toolchainAvailable()
    ? false
    : "Sage.js FLINT Wasm toolchain is not available",
}, async () => {
  const output = await mkdtemp(join(tmpdir(), "sagejs-wasm-fmpq-core-"));
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
      `${pathToFileURL(join(output, "backend.mjs")).href}?fmpq-core`
    );
    const backend = createGeneratedWasmBackend(instance);
    const wasm = instance.exports;
    const owned = [];

    const matrix = backend.ffiFmpqMatrixCreate(2n, 2n);
    owned.push(["matrix", matrix]);
    assert.equal(backend.ffiFmpqMatrixNrows(matrix), 2n);
    assert.equal(backend.ffiFmpqMatrixNcols(matrix), 2n);
    assert.equal(
      backend.ffiFmpqMatrixSetEntry(
        matrix,
        0n,
        0n,
        123456789012345678901234567891n,
        2n,
      ),
      true,
    );
    backend.ffiFmpqMatrixSetEntry(matrix, 0n, 1n, 1n, 3n);
    backend.ffiFmpqMatrixSetEntry(matrix, 1n, 0n, 2n, 1n);
    backend.ffiFmpqMatrixSetEntry(matrix, 1n, 1n, 3n, 1n);
    assert.equal(
      backend.ffiFmpqMatrixEntryNumerator(matrix, 0n, 0n),
      123456789012345678901234567891n,
    );
    assert.equal(backend.ffiFmpqMatrixEntryDenominator(matrix, 0n, 0n), 2n);
    assert.equal(backend.ffiFmpqMatrixEntryIsZero(matrix, 0n, 1n), false);

    const copy = backend.ffiFmpqMatrixCopy(matrix);
    owned.push(["matrix", copy]);
    const product = backend.ffiFmpqMatrixMul(matrix, copy);
    owned.push(["matrix", product]);
    assert.equal(backend.ffiFmpqMatrixNrows(product), 2n);
    const reduced = backend.ffiFmpqMatrixRref(matrix);
    owned.push(["matrix", reduced]);
    assert.equal(backend.ffiFmpqMatrixRank(reduced), 2n);
    assert.equal(backend.ffiFmpqMatrixEntryNumerator(reduced, 0n, 0n), 1n);
    assert.equal(backend.ffiFmpqMatrixEntryIsZero(reduced, 0n, 1n), true);

    const determinant = backend.ffiFmpqMatrixDet(matrix);
    owned.push(["value", determinant]);
    assert.equal(
      backend.ffiFmpqValueNumerator(determinant),
      1111111101111111110111111111015n,
    );
    assert.equal(backend.ffiFmpqValueDenominator(determinant), 6n);

    const formatted = backend.ffiFmpqMatrixFormat(matrix);
    owned.push(["bytes", formatted]);
    const formattedBytes = backend.ffiFlintByteRegionCopyBytes(formatted);
    const formattedText = new TextDecoder().decode(formattedBytes);
    assert.match(formattedText, /123456789012345678901234567891\/2/);
    backend.ffiFlintByteRegionClose(formatted);
    owned.pop();
    assert.match(new TextDecoder().decode(formattedBytes), /123456789/);

    const serialized = backend.ffiFmpqMatrixSerialize(matrix);
    owned.push(["bytes", serialized]);
    const stableBytes = backend.ffiFlintByteRegionCopyBytes(serialized);
    const ingress = backend.ffiFlintByteRegionFromBytes(stableBytes);
    owned.push(["bytes", ingress]);
    const restored = backend.ffiFmpqMatrixDeserialize(ingress, 2n, 2n);
    owned.push(["matrix", restored]);
    assert.equal(
      backend.ffiFmpqMatrixEntryNumerator(restored, 0n, 0n),
      123456789012345678901234567891n,
    );

    const incompatible = backend.ffiFmpqMatrixCreate(1n, 1n);
    owned.push(["matrix", incompatible]);
    const liveBeforeFailure = wasm.sagejs_wasm_resource_live_count();
    assert.throws(
      () => backend.ffiFmpqMatrixMul(matrix, incompatible),
      /dimensions are incompatible/,
    );
    assert.equal(
      wasm.sagejs_wasm_resource_live_count(),
      liveBeforeFailure,
      "failed resource results must not consume a live output slot",
    );
    assert.throws(
      () => backend.ffiFmpqMatrixEntryNumerator(matrix, 9n, 0n),
      /out of bounds/,
    );

    closeAll(backend, owned);
    backend.ffiFmpqMatrixClose(matrix);
    assert.equal(wasm.sagejs_wasm_resource_live_count(), 0n);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
