"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

async function moduleApi() {
  return import("../packages/flint-wasm/algebraic.mjs");
}

function fakeAlgebraicInstance(api) {
  const memory = new WebAssembly.Memory({ initial: 48, maximum: 64 });
  const input = 4096;
  const output = 1_100_000;
  const roots = 2_200_000;
  const multiplicities = roots + 1024;
  const matrixEntries = multiplicities + 1024;
  let nextHandle = 1;
  let resultHandle = 0;
  let resultValue = 0;
  let resultCount = 0;
  let outputLength = 0;
  let live = 0;
  const handles = new Set();

  function writeOutput(bytes) {
    new Uint8Array(memory.buffer, output, bytes.length).set(bytes);
    outputLength = bytes.length;
  }
  function allocate() {
    resultHandle = nextHandle++;
    handles.add(resultHandle);
    live += 1;
    return 0;
  }
  const exports = {
    memory,
    sagejs_wasm_algebraic_input: () => input,
    sagejs_wasm_algebraic_input_capacity: () => 1_048_576,
    sagejs_wasm_algebraic_output: () => output,
    sagejs_wasm_algebraic_output_capacity: () => 1_048_576,
    sagejs_wasm_algebraic_output_length: () => outputLength,
    sagejs_wasm_algebraic_root_handles: () => roots,
    sagejs_wasm_algebraic_root_multiplicities: () => multiplicities,
    sagejs_wasm_algebraic_matrix_entry_handles: () => matrixEntries,
    sagejs_wasm_algebraic_result_count: () => resultCount,
    sagejs_wasm_algebraic_result_handle: () => resultHandle,
    sagejs_wasm_algebraic_result_value: () => resultValue,
    sagejs_wasm_algebraic_last_status: () => 0,
    sagejs_wasm_algebraic_live_count: () => live,
    sagejs_wasm_algebraic_initialize: () => 0,
    sagejs_wasm_algebraic_clear: () => {
      handles.clear();
      live = 0;
    },
    sagejs_wasm_algebraic_close: (handle) => {
      if (!handles.delete(handle)) return 2;
      live -= 1;
      return 0;
    },
    sagejs_wasm_algebraic_from_rational: (length) => {
      const values = api.unpackExactIntegers(
        new Uint8Array(memory.buffer, input, length),
      );
      if (values.length !== 2 || values[1] === 0n) return 8;
      // Force a growth event at an ABI call to prove the JS wrapper does not
      // retain stale typed-array views.
      memory.grow(1);
      return allocate();
    },
    sagejs_wasm_algebraic_i: allocate,
    sagejs_wasm_algebraic_root_of_unity: allocate,
    sagejs_wasm_algebraic_unary: allocate,
    sagejs_wasm_algebraic_binary: allocate,
    sagejs_wasm_algebraic_pow: allocate,
    sagejs_wasm_algebraic_pow_rational: allocate,
    sagejs_wasm_algebraic_equal: () => {
      resultValue = 1;
      return 0;
    },
    sagejs_wasm_algebraic_compare_real: () => {
      resultValue = -1;
      return 0;
    },
    sagejs_wasm_algebraic_property: (_handle, property) => {
      resultValue = property === 3 ? 2 : 1;
      return 0;
    },
    sagejs_wasm_algebraic_polynomial_roots: () => {
      resultCount = 2;
      const first = nextHandle++;
      const second = nextHandle++;
      handles.add(first);
      handles.add(second);
      live += 2;
      new Uint32Array(memory.buffer, roots, 2).set([first, second]);
      new Uint32Array(memory.buffer, multiplicities, 2).set([1, 1]);
      return 0;
    },
    sagejs_wasm_algebraic_minpoly: () => {
      writeOutput(api.packExactIntegers([-2n, 0n, 1n]));
      return 0;
    },
    sagejs_wasm_algebraic_enclosure: () => {
      writeOutput(api.packExactIntegers([1n, 2n, -1n, 0n, 0n, 0n]));
      return 0;
    },
    sagejs_wasm_algebraic_format: () => {
      writeOutput(new TextEncoder().encode("1.414213562373095"));
      return 0;
    },
    sagejs_wasm_algebraic_serialize: () => {
      writeOutput(Uint8Array.from([81, 66, 65, 82, 1, 0, 0, 0]));
      return 0;
    },
    sagejs_wasm_algebraic_deserialize: allocate,
    sagejs_wasm_algebraic_matrix_live_count: () => 0,
    sagejs_wasm_algebraic_matrix_close: () => 2,
    sagejs_wasm_algebraic_matrix_create: () => 7,
    sagejs_wasm_algebraic_matrix_binary: () => 7,
    sagejs_wasm_algebraic_matrix_unary: () => 7,
    sagejs_wasm_algebraic_matrix_scalar_mul: () => 7,
    sagejs_wasm_algebraic_matrix_entry: () => 7,
    sagejs_wasm_algebraic_matrix_det: () => 7,
    sagejs_wasm_algebraic_matrix_rank: () => 7,
    sagejs_wasm_algebraic_matrix_equal: () => 7,
    sagejs_wasm_algebraic_matrix_charpoly: () => 7,
  };
  return { exports };
}

test("canonical arbitrary integers round trip and reject malformed encodings", async () => {
  const api = await moduleApi();
  const values = [0n, -1n, 2n ** 521n + 17n, -(2n ** 257n - 3n)];
  assert.deepEqual(api.unpackExactIntegers(api.packExactIntegers(values)), values);
  const noncanonical = api.packExactIntegers([256n]);
  noncanonical[noncanonical.length - 1] = 0;
  assert.throws(
    () => api.unpackExactIntegers(noncanonical),
    /noncanonical/,
  );
});

test("Wasm wrapper refreshes memory views and owns generation-tagged resources", async () => {
  const api = await moduleApi();
  const backend = api.createAlgebraicBackend(fakeAlgebraicInstance(api));
  const two = backend.qqbarFromRational(2n, 1n);
  const root = backend.qqbarPowRational(two, 1n, 2n);
  const fourthRoot = backend.qqbarRootOfUnity(1n, 4n);
  assert.equal(backend.qqbarIsReal(root), true);
  assert.equal(backend.qqbarDegree(root), 2);
  assert.deepEqual(backend.qqbarMinpolyCoefficients(root), [-2n, 0n, 1n]);
  assert.equal(backend.qqbarToString(root), "1.414213562373095");
  assert.equal(backend.qqbarEnclosure(root).rigorous, true);
  const approximation = backend.qqbarApprox(root);
  assert.deepEqual(approximation.real, { numerator: 3n, exponent: -2n });
  assert.equal(backend.complexRealDouble(approximation), 0.75);
  assert.match(backend.complexToString(approximation), /^0\.75$/);
  const roots = backend.polyExactRoots({
    kind: "QQ",
    coefficients: [
      { numerator: -2n, denominator: 3n },
      { numerator: 0n, denominator: 1n },
      { numerator: 1n, denominator: 3n },
    ],
  });
  assert.equal(roots.length, 2);
  assert.deepEqual(roots.map((item) => item[1]), [1, 1]);
  const restored = backend.qqbarDeserialize(backend.qqbarSerialize(root));
  assert.equal(backend.qqbarEqual(root, restored), true);
  assert.equal(backend.__sagejs_algebraic_live_count__(), 6);
  for (const value of [two, root, fourthRoot, roots[0][0], roots[1][0], restored]) {
    backend.qqbarClose(value);
  }
  assert.equal(backend.__sagejs_algebraic_live_count__(), 0);
  assert.throws(() => backend.qqbarClose(restored), /expected a live/);
});
