import assert from "node:assert/strict";
import test from "node:test";

import {
  analyticOperations,
  createAnalyticWasmBackend,
  decodeAnalyticPacket,
} from "../analytic-backend.mjs";

const encoder = new TextEncoder();

function packet(values, precisionBits = 160) {
  const encoded = values.map(({ real, imaginary }) => [
    encoder.encode(real),
    encoder.encode(imaginary),
  ]);
  const length = 20 + encoded.reduce(
    (total, pair) => total + 20 + pair[0].length + pair[1].length,
    0,
  );
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  bytes.set(encoder.encode("SJA1"), 0);
  view.setUint16(4, 1, true);
  view.setUint16(6, 2, true);
  view.setUint32(8, values.length, true);
  view.setUint32(12, precisionBits, true);
  view.setUint32(16, Math.ceil(precisionBits * 0.30103) + 8, true);
  let offset = 20;
  for (const [real, imaginary] of encoded) {
    view.setInt32(offset, precisionBits - 8, true);
    view.setInt32(offset + 4, precisionBits - 9, true);
    view.setUint32(offset + 8, 1, true);
    view.setUint32(offset + 12, real.length, true);
    offset += 16;
    bytes.set(real, offset);
    offset += real.length;
    view.setUint32(offset, imaginary.length, true);
    offset += 4;
    bytes.set(imaginary, offset);
    offset += imaginary.length;
  }
  return bytes;
}

function fakeInstance({ outputTooSmallOnce = false } = {}) {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2048 });
  let inputCapacity = 0;
  let outputCapacity = 0;
  let outputLength = 0;
  let released = false;
  let executionCount = 0;
  let reserveCount = 0;
  let lastArguments;
  let lastInput;
  const inputPointer = () => 1024;
  const outputPointer = () => inputPointer() + inputCapacity;
  const fitMemory = (length) => {
    const missing = length - memory.buffer.byteLength;
    if (missing > 0) memory.grow(Math.ceil(missing / 65536));
  };
  const exports = {
    memory,
    sagejs_analytic_input: inputPointer,
    sagejs_analytic_input_capacity: () => inputCapacity,
    sagejs_analytic_output: outputPointer,
    sagejs_analytic_output_capacity: () => outputCapacity,
    sagejs_analytic_output_length: () => outputLength,
    sagejs_analytic_max_input_capacity: () => 8 * 1024 * 1024,
    sagejs_analytic_max_output_capacity: () => 64 * 1024 * 1024,
    sagejs_analytic_reserve(input, output) {
      reserveCount += 1;
      inputCapacity = Math.max(inputCapacity, input);
      outputCapacity = Math.max(outputCapacity, output);
      fitMemory(outputPointer() + outputCapacity);
      return 0;
    },
    sagejs_analytic_release() {
      released = true;
      inputCapacity = 0;
      outputCapacity = 0;
      outputLength = 0;
    },
    sagejs_analytic_execute_request(...args) {
      executionCount += 1;
      lastArguments = args;
      lastInput = new Uint8Array(memory.buffer, inputPointer(), args[0]).slice();
      if (outputTooSmallOnce && executionCount === 1) return 3;
      const operation = args[1];
      const count = operation === analyticOperations.RIEMANN_ZETA_JET ? args[6] : args[2];
      const known = operation === analyticOperations.COMPLEX_GAMMA_VALUES
        ? { real: "1.7724538509055160272981674833411451827975494561224", imaginary: "0" }
        : { real: "1.6449340668482264364724151666460251892189499012068", imaginary: "0" };
      const result = packet(Array.from({ length: count }, () => known), args[3]);
      if (result.length > outputCapacity) return 3;
      new Uint8Array(memory.buffer, outputPointer(), result.length).set(result);
      outputLength = result.length;
      return 0;
    },
  };
  return {
    instance: { exports },
    state: () => ({
      executionCount,
      inputCapacity,
      outputCapacity,
      released,
      reserveCount,
      lastArguments,
      lastInput,
    }),
  };
}

test("decodes arbitrary-precision decimal results and enclosure diagnostics", () => {
  const encoded = packet([{
    real: "1.6449340668482264364724151666460251892189499012068",
    imaginary: "-2.5e-90",
  }], 192);
  const decoded = decodeAnalyticPacket(encoded);
  assert.equal(decoded.precisionBits, 192);
  assert.equal(decoded.values[0].real,
    "1.6449340668482264364724151666460251892189499012068");
  assert.equal(decoded.values[0].imaginary, "-2.5e-90");
  assert.equal(decoded.values[0].finite, true);
  assert.equal(decoded.values[0].realAccuracyBits, 184);
});

test("grows bounded buffers on demand and preserves decimal ingress", () => {
  const fake = fakeInstance();
  const backend = createAnalyticWasmBackend(fake.instance);
  assert.equal(fake.state().inputCapacity, 0);
  assert.equal(fake.state().outputCapacity, 0);
  const [value] = backend.riemannZetaValues([
    ["2.00000000000000000000000000000000000001", "1e-80"],
  ], 192);
  assert.equal(value.precisionBits, 192);
  assert.equal(typeof value.real, "string");
  assert.ok(fake.state().inputCapacity >= fake.state().lastInput.length);
  assert.ok(fake.state().outputCapacity >= 4096);
  const inputText = new TextDecoder().decode(fake.state().lastInput);
  assert.match(inputText, /2\.00000000000000000000000000000000000001/);
  assert.match(inputText, /1e-80/);
});

test("retries an underestimated result without retaining stale memory views", () => {
  const fake = fakeInstance({ outputTooSmallOnce: true });
  const backend = createAnalyticWasmBackend(fake.instance);
  const values = backend.riemannZetaJet([2, 0], 0, 3, false, 160);
  assert.equal(values.length, 3);
  assert.equal(fake.state().executionCount, 2);
  assert.equal(fake.state().reserveCount, 2);
});

test("passes fixed-width Dirichlet and discriminant values as WebAssembly i64", () => {
  const fake = fakeInstance();
  const backend = createAnalyticWasmBackend(fake.instance);
  backend.quadraticDedekindValues(5n, 5n, 2n, [[2, 0]], 128, {
    completed: true,
  });
  const args = fake.state().lastArguments;
  assert.equal(args[1], analyticOperations.QUADRATIC_ZETA_VALUES);
  assert.equal(args[8], 5n);
  assert.equal(args[9], 2n);
  assert.equal(args[10], 5n);
  assert.equal(args[7], 2);
});

test("matches existing FLINT backend scalar and batch method signatures", () => {
  const fake = fakeInstance();
  const groupResource = Object.freeze({ handle: 17 });
  const routes = [];
  const backend = createAnalyticWasmBackend(fake.instance, {
    recordCapability(...record) {
      routes.push(record);
    },
    resolveDirichletModulus(group) {
      assert.equal(group, groupResource);
      return 5n;
    },
  });
  const value = backend.dirichletLValue(
    groupResource, 2n, [2, 0], 0, 144,
  );
  assert.equal(value.precisionBits, 144);
  assert.equal(fake.state().lastArguments[8], 5n);
  assert.equal(backend.riemannXiStandardValue([2, 0], 144).precisionBits, 144);
  backend.complexGammaValues([[0.5, 0]], 144);
  assert.deepEqual(
    routes.map(([capabilityId, selectedRoute]) => [capabilityId, selectedRoute]),
    [
      ["analytic:dirichlet-l-batch", "receipt-backed-wasm-artifact"],
      ["analytic:riemann-xi", "receipt-backed-wasm-artifact"],
      ["analytic:complex-gamma", "receipt-backed-wasm-artifact"],
    ],
  );
});

test("binary64 conversion is explicit and confined to tiled plot output", async () => {
  const fake = fakeInstance();
  const backend = createAnalyticWasmBackend(fake.instance);
  const points = Array.from({ length: 11 }, (_, index) => [1, index / 10]);
  const plot = await backend.riemannZetaPlotBatch(points, {
    precisionBits: 30,
    guardBits: 20,
    tileSize: 4,
  });
  assert.equal(plot.coarse.length, 11);
  assert.equal(typeof plot.coarse[0][0], "number");
  assert.equal(plot.diagnostics.tileCount, 3);
  assert.equal(plot.diagnostics.transport, "arbitrary-precision-decimal");
  assert.equal(plot.diagnostics.output, "explicit-binary64-plot");
  assert.equal(fake.state().executionCount, 6);
});

test("release deterministically returns analytic allocation to the module", () => {
  const fake = fakeInstance();
  const backend = createAnalyticWasmBackend(fake.instance);
  backend.complexGammaValues([[0.5, 0]], 96);
  assert.ok(fake.state().outputCapacity > 0);
  backend.release();
  assert.equal(fake.state().released, true);
  assert.equal(fake.state().inputCapacity, 0);
  assert.equal(fake.state().outputCapacity, 0);
});

test("rejects malformed packets, nonfinite points, and oversized orders", () => {
  assert.throws(() => decodeAnalyticPacket(new Uint8Array([1, 2, 3])), /truncated/);
  const fake = fakeInstance();
  const backend = createAnalyticWasmBackend(fake.instance);
  assert.throws(() => backend.riemannZetaValues([[Infinity, 0]]), /finite/);
  assert.throws(() => backend.riemannZetaJet(2, 0, 4097), /resultCount/);
});
