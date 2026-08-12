"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync, rmSync } = require("node:fs");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { WASI } = require("node:wasi");

const { build, toolchain } = require(
  "../scripts/build-ffi-wasm-resource-adapter.cjs"
);
const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const {
  generatedWasmResourceAdapter,
} = require("../tools/ffi/wasm-adapters.cjs");

const root = join(__dirname, "..");
const resourceIds = ["matrix", "byte_region"];
const functionIds = [
  "available",
  "matrix",
  "matrix_nrows",
  "matrix_ncols",
  "matrix_set_entry",
  "matrix_entry_code",
  "matrix_copy",
  "matrix_equal",
  "matrix_add",
  "matrix_mul",
  "matrix_transpose",
  "matrix_rank",
  "matrix_rref",
  "matrix_determinant_code",
  "matrix_inverse",
  "matrix_solve",
  "matrix_right_kernel",
  "matrix_logical_words",
  "matrix_from_logical_words",
  "matrix_sagepack_bytes",
  "matrix_from_sagepack_bytes",
  "matrix_format",
];

function declaration() {
  return loadRegistry({ root }).byId.get("m4ri");
}

function hasToolchain() {
  const current = toolchain("m4ri");
  return existsSync(current.clang) && existsSync(current.sysroot) &&
    current.prefixes.every((prefix) =>
      existsSync(join(prefix.path, "include")) &&
      existsSync(join(prefix.path, "lib", `lib${prefix.name}.a`))
    );
}

function closeAll(backend, owned) {
  for (const [value, close] of owned.toReversed()) backend[close](value);
}

test("complete M4RI resource surface lowers generically to Wasm", () => {
  const selector = declaration().functions.find(
    (candidate) => candidate.id === "matrix_select_rows",
  );
  assert.ok(selector);
  assert.equal(selector.targets.wasm, false);
  const generated = generatedWasmResourceAdapter(declaration(), {
    resourceIds,
    functionIds,
  });
  assert.deepEqual(generated.manifest.resources, resourceIds);
  assert.deepEqual(generated.manifest.functions, functionIds);
  assert.equal(
    generated.manifest.functions.includes("matrix_select_rows"),
    false,
  );
  assert.deepEqual(generated.manifest.host_ingress, [{
    resource: "byte_region",
    kind: "copied_bytes",
    export: "ffiM4riByteRegionFromBytes",
  }]);
  assert.deepEqual(generated.manifest.host_transfer, [{
    resource: "byte_region",
    kind: "copied_bytes",
    export: "ffiM4riByteRegionCopyBytes",
  }]);
  assert.match(generated.cSource, /sagejs_m4ri_matrix_clear\(slot->value\)/);
  assert.match(generated.cSource, /sagejs_m4ri_matrix_mul/);
  assert.match(generated.cSource, /sagejs_wasm_ffiM4riAvailable/);
  assert.match(generated.javascriptSource, /new FinalizationRegistry/);
  assert.doesNotMatch(
    generated.javascriptSource,
    /fn\.id|matrix_mul.*===/,
    "generated output must not dispatch on a function name",
  );
});

test("complete M4RI resources execute through real Wasm", {
  skip: hasToolchain() ? false : "CoWasm M4RI toolchain is not available",
}, async () => {
  const output = await mkdtemp(join(tmpdir(), "sagejs-wasm-m4ri-"));
  try {
    const built = build({
      library: "m4ri",
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
      `${pathToFileURL(join(output, "backend.mjs")).href}?m4ri-core`
    );
    const backend = createGeneratedWasmBackend(instance);
    const owned = [];
    const keep = (value, close) => {
      owned.push([value, close]);
      return value;
    };
    const keepMatrix = (value) => keep(value, "ffiM4riMatrixClose");
    const keepBytes = (value) => keep(value, "ffiM4riByteRegionClose");

    assert.equal(backend.ffiM4riAvailable(), true);
    const input = keepBytes(backend.ffiM4riByteRegionFromBytes(
      new Uint8Array([1, 1, 0, 0, 1, 1, 1, 1, 1]),
    ));
    const matrix = keepMatrix(
      backend.ffiM4riMatrixFromSagepackBytes(input, 3n, 3n),
    );
    assert.equal(backend.ffiM4riMatrixNrows(matrix), 3n);
    assert.equal(backend.ffiM4riMatrixNcols(matrix), 3n);
    assert.equal(backend.ffiM4riMatrixEntryCode(matrix, 0n, 1n), 1n);
    assert.equal(backend.ffiM4riMatrixEntryCode(matrix, 9n, 0n), 2n);
    assert.equal(backend.ffiM4riMatrixRank(matrix), 3n);
    assert.equal(backend.ffiM4riMatrixDeterminantCode(matrix), 1n);

    const copy = keepMatrix(backend.ffiM4riMatrixCopy(matrix));
    assert.equal(backend.ffiM4riMatrixEqual(matrix, copy), true);
    backend.ffiM4riMatrixSetEntry(copy, 0n, 0n, 0n);
    assert.equal(backend.ffiM4riMatrixEqual(matrix, copy), false);
    const zero = keepMatrix(backend.ffiM4riMatrixAdd(matrix, matrix));
    assert.equal(backend.ffiM4riMatrixRank(zero), 0n);
    const transpose = keepMatrix(backend.ffiM4riMatrixTranspose(matrix));
    assert.equal(backend.ffiM4riMatrixEntryCode(transpose, 1n, 0n), 1n);

    const identity = keepMatrix(backend.ffiM4riMatrixCreate(3n, 3n));
    for (let index = 0n; index < 3n; index += 1n) {
      backend.ffiM4riMatrixSetEntry(identity, index, index, 1n);
    }
    const inverse = keepMatrix(backend.ffiM4riMatrixInverse(matrix));
    const product = keepMatrix(backend.ffiM4riMatrixMul(matrix, inverse));
    assert.equal(backend.ffiM4riMatrixEqual(product, identity), true);
    const solved = keepMatrix(backend.ffiM4riMatrixSolve(matrix, identity));
    assert.equal(backend.ffiM4riMatrixEqual(solved, inverse), true);
    const rref = keepMatrix(backend.ffiM4riMatrixRref(matrix));
    assert.equal(backend.ffiM4riMatrixEqual(rref, identity), true);
    assert.equal(backend.ffiM4riMatrixRank(rref), 3n);
    for (let column = 0n; column < 3n; column += 1n) {
      backend.ffiM4riMatrixSetEntry(rref, 0n, column, 0n);
    }
    assert.equal(backend.ffiM4riMatrixRank(rref), 2n);
    const kernel = keepMatrix(backend.ffiM4riMatrixRightKernel(matrix));
    assert.equal(backend.ffiM4riMatrixNrows(kernel), 0n);
    assert.equal(backend.ffiM4riMatrixNcols(kernel), 3n);

    const logical = keepBytes(backend.ffiM4riMatrixLogicalWords(matrix));
    const logicalHost = backend.ffiM4riByteRegionCopyBytes(logical);
    assert.equal(logicalHost.length, 24);
    const logicalInput = keepBytes(
      backend.ffiM4riByteRegionFromBytes(logicalHost),
    );
    const roundTrip = keepMatrix(
      backend.ffiM4riMatrixFromLogicalWords(logicalInput, 3n, 3n),
    );
    assert.equal(backend.ffiM4riMatrixEqual(matrix, roundTrip), true);
    const packed = keepBytes(backend.ffiM4riMatrixSagepackBytes(matrix));
    assert.deepEqual(
      Array.from(backend.ffiM4riByteRegionCopyBytes(packed)),
      [1, 1, 0, 0, 1, 1, 1, 1, 1],
    );
    const formatted = keepBytes(backend.ffiM4riMatrixFormat(matrix));
    assert.equal(
      new TextDecoder().decode(backend.ffiM4riByteRegionCopyBytes(formatted)),
      "[1 1 0]\n[0 1 1]\n[1 1 1]",
    );

    assert.equal(
      instance.exports.sagejs_wasm_resource_live_count(),
      BigInt(owned.length),
    );
    closeAll(backend, owned);
    assert.equal(instance.exports.sagejs_wasm_resource_live_count(), 0n);
    assert.throws(
      () => backend.ffiM4riMatrixRank(matrix),
      /closed/,
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
