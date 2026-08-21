import assert from "node:assert/strict";
import test from "node:test";

import {
  createCurveBackend,
  curveCapabilities,
} from "../curve-backend.mjs";

function align(value, width) {
  return (value + width - 1) & ~(width - 1);
}

function fakeCurveReactor() {
  const memory = new WebAssembly.Memory({ initial: 4 });
  let next = 1024;
  let request;
  let decimalPointer = 0;
  let decimalOffsetPointer = 0;
  let decimalBytes = 0;
  let decimalOffsets = 0;
  let decimalFields = 0;
  let plotPointer = 0;
  let plotCount = 0;
  let clears = 0;
  let smalljac;
  let smalljacClears = 0;
  const diagnostics = [0, 31, 37, 9, 81, 53, 565, 2, 0.125, 1, 0, 1, 0];

  function allocate(bytes, width = 8) {
    next = align(next, width);
    const pointer = next;
    next += bytes;
    if (next > memory.buffer.byteLength) {
      memory.grow(Math.ceil((next - memory.buffer.byteLength) / 65536));
    }
    return pointer;
  }

  function packDecimals(pointCount, refinementBits) {
    decimalFields = refinementBits ? 25 : 15;
    const values = [];
    for (let point = 0; point < pointCount; point += 1) {
      const base = point + 1;
      values.push(
        `${base}.125`, `-${base}.25`, "1e-30", "2e-30", "52",
        `${base}.5`, `-${base}.75`, "3e-30", "4e-30", "51",
        "1e-18", "2e-18", "3e-18", "4e-18", "6e-18",
      );
      if (refinementBits) {
        values.push(
          `${base}.12`, `-${base}.24`, "1e-20", "2e-20", "36",
          `${base}.49`, `-${base}.74`, "3e-20", "4e-20", "35",
        );
      }
    }
    const encoded = values.map((value) => new TextEncoder().encode(value));
    decimalBytes = encoded.reduce((sum, value) => sum + value.length, 0);
    decimalPointer = allocate(decimalBytes, 1);
    decimalOffsets = values.length + 1;
    decimalOffsetPointer = allocate(decimalOffsets * 4, 4);
    const bytes = new Uint8Array(memory.buffer, decimalPointer, decimalBytes);
    const offsets = new Uint32Array(
      memory.buffer,
      decimalOffsetPointer,
      decimalOffsets,
    );
    let position = 0;
    encoded.forEach((value, index) => {
      offsets[index] = position;
      bytes.set(value, position);
      position += value.length;
    });
    offsets[encoded.length] = position;
  }

  const exports = {
    memory,
    sagejs_wasm_ec_lseries_begin(
      coefficientCount,
      pointCount,
      pointTextBytes,
      conductorTextBytes,
      precisionBits,
      refinementBits,
      workPrecisionBits,
      outputMode,
    ) {
      request = {
        coefficientCount,
        pointCount,
        pointTextBytes,
        conductorTextBytes,
        precisionBits,
        refinementBits,
        workPrecisionBits,
        outputMode,
        coefficientPointer: allocate(coefficientCount * 4, 4),
        pointPointer: allocate(pointTextBytes, 1),
        offsetPointer: allocate((pointCount * 2 + 1) * 4, 4),
        conductorPointer: allocate(conductorTextBytes, 1),
      };
      diagnostics[5] = precisionBits;
      diagnostics[6] = workPrecisionBits;
      diagnostics[7] = pointCount;
      return 0;
    },
    sagejs_wasm_ec_lseries_clear() {
      clears += 1;
    },
    sagejs_wasm_ec_lseries_coefficients: () => request.coefficientPointer,
    sagejs_wasm_ec_lseries_point_text: () => request.pointPointer,
    sagejs_wasm_ec_lseries_point_offsets: () => request.offsetPointer,
    sagejs_wasm_ec_lseries_conductor_text: () => request.conductorPointer,
    sagejs_wasm_ec_lseries_compute() {
      request.coefficients = Array.from(new Int32Array(
        memory.buffer,
        request.coefficientPointer,
        request.coefficientCount,
      ));
      request.pointText = new TextDecoder().decode(new Uint8Array(
        memory.buffer,
        request.pointPointer,
        request.pointTextBytes,
      ));
      request.pointOffsets = Array.from(new Uint32Array(
        memory.buffer,
        request.offsetPointer,
        request.pointCount * 2 + 1,
      ));
      request.conductor = new TextDecoder().decode(new Uint8Array(
        memory.buffer,
        request.conductorPointer,
        request.conductorTextBytes,
      ));
      if (request.outputMode === 0) {
        packDecimals(request.pointCount, request.refinementBits);
      } else if (request.outputMode === 2) {
        plotCount = request.pointCount * 5;
        plotPointer = allocate(plotCount * 8, 8);
        const output = new Float64Array(memory.buffer, plotPointer, plotCount);
        for (let index = 0; index < plotCount; index += 1) output[index] = index / 8;
      }
      return 0;
    },
    sagejs_wasm_ec_lseries_diagnostic(index) {
      return BigInt(Math.trunc(diagnostics[index] ?? 0));
    },
    sagejs_wasm_ec_lseries_diagnostic_double(index) {
      return diagnostics[index] ?? 0;
    },
    sagejs_wasm_ec_lseries_decimal_bytes: () => decimalPointer,
    sagejs_wasm_ec_lseries_decimal_byte_count: () => decimalBytes,
    sagejs_wasm_ec_lseries_decimal_offsets: () => decimalOffsetPointer,
    sagejs_wasm_ec_lseries_decimal_offset_count: () => decimalOffsets,
    sagejs_wasm_ec_lseries_decimal_field_count: () => decimalFields,
    sagejs_wasm_ec_lseries_plot_values: () => plotPointer,
    sagejs_wasm_ec_lseries_plot_value_count: () => plotCount,
    sagejs_wasm_ec_lseries_plot_stride: () => 5,
    sagejs_wasm_smalljac_begin(curveTextBytes, boundOrPrime, mode) {
      const words = mode === 0 ? Number(boundOrPrime) + 1 : 1;
      smalljac = {
        curveTextBytes,
        boundOrPrime,
        mode,
        curvePointer: allocate(curveTextBytes, 1),
        outputPointer: allocate(words * 4, 4),
        words,
      };
      return 0;
    },
    sagejs_wasm_smalljac_curve_text: () => smalljac.curvePointer,
    sagejs_wasm_smalljac_output: () => smalljac.outputPointer,
    sagejs_wasm_smalljac_output_words: () => smalljac.words,
    sagejs_wasm_smalljac_compute() {
      smalljac.curveText = new TextDecoder().decode(new Uint8Array(
        memory.buffer,
        smalljac.curvePointer,
        smalljac.curveTextBytes,
      ));
      const values = new Int32Array(
        memory.buffer,
        smalljac.outputPointer,
        smalljac.words,
      );
      if (smalljac.mode === 0) {
        values.set([0, 1, -2, -3, -2, -1].slice(0, smalljac.words));
      } else {
        values[0] = -6;
      }
      memory.grow(1);
      return 0;
    },
    sagejs_wasm_smalljac_clear() {
      smalljacClears += 1;
    },
  };
  return {
    instance: { exports },
    state: () => ({ request, clears, smalljac, smalljacClears }),
  };
}

test("decimal elliptic L-series values preserve exact packed transport", () => {
  const reactor = fakeCurveReactor();
  const backend = createCurveBackend(reactor.instance);
  const result = backend.ecLseriesValues(
    123456789012345678901234567890n,
    -1,
    new Int32Array([0, 1, -2, 3]),
    [["1.0000000000000000001", "2.5"], ["3", "-4.25"]],
    53,
    16,
  );
  assert.equal(result.status, "ok");
  assert.equal(result.values.length, 2);
  assert.equal(result.values[0].completed.realMidpoint, "1.125");
  assert.equal(result.values[0].raw.accuracyBits, 51);
  assert.equal(result.coarseValues[1].raw.imagMidpoint, "-2.74");
  assert.equal(result.analyticErrorBound, "6e-18");
  assert.equal(result.rigorous, false);
  const state = reactor.state();
  assert.deepEqual(state.request.coefficients, [0, 1, -2, 3]);
  assert.equal(state.request.conductor, "123456789012345678901234567890");
  assert.equal(
    state.request.pointText,
    "1.00000000000000000012.53-4.25",
  );
  assert.deepEqual(state.request.pointOffsets, [0, 21, 24, 25, 30]);
  assert.equal(state.clears, 1);
});

test("plot results use the explicit five-double packed contract", () => {
  const reactor = fakeCurveReactor();
  const backend = createCurveBackend(reactor.instance);
  const result = backend.ecLseriesValues(
    11n,
    1,
    [0, 1, -1],
    [["1", "0"], ["1", "1"]],
    24,
    8,
    2,
  );
  assert.equal(result.packedStride, 5);
  assert.ok(result.packedValues instanceof Float64Array);
  assert.deepEqual(Array.from(result.packedValues), [
    0, 0.125, 0.25, 0.375, 0.5,
    0.625, 0.75, 0.875, 1, 1.125,
  ]);
  assert.equal(reactor.state().clears, 1);
});

test("plan mode reports resource metadata without result materialization", () => {
  const reactor = fakeCurveReactor();
  const backend = createCurveBackend(reactor.instance);
  const result = backend.ecLseriesValues(
    37n,
    1,
    [0, 1],
    [["1", "3"]],
    53,
    8,
    1,
  );
  assert.equal(result.requiredCutoff, 37);
  assert.equal(result.gridPoints, 9);
  assert.equal(result.pointCount, 1);
  assert.equal(result.values, undefined);
});

test("curve capability decisions distinguish shared cores and specialists", () => {
  assert.equal(curveCapabilities["elliptic-lseries-values"].status, "implemented");
  assert.equal(curveCapabilities["elliptic-lseries-plot"].limits.tiled, true);
  assert.equal(
    curveCapabilities["elliptic-lseries-direct-values"].disposition,
    "portable-fallback",
  );
  assert.equal(
    curveCapabilities["elliptic-root-number-semistable"].status,
    "implemented",
  );
  assert.equal(
    curveCapabilities["elliptic-coefficients-smalljac-wasm"].disposition,
    "shared-core",
  );
  assert.equal(
    curveCapabilities["hyperelliptic-genus3-candidate-scan"].disposition,
    "compiled-source",
  );
  assert.equal(
    curveCapabilities["smalljac-local-factors"].disposition,
    "shared-core",
  );
  assert.deepEqual(
    curveCapabilities["smalljac-local-factors"].limits.fullLpolynomialGenus,
    [2],
  );
  for (const name of [
    "eclib-descent-and-rank",
    "rforest-genus3",
  ]) {
    assert.equal(curveCapabilities[name].disposition, "desktop-only");
    assert.match(curveCapabilities[name].fallback, /fallback|rank|exhaustive|capability/i);
  }
});

test("smalljac coefficients use copied exact input and survive memory growth", () => {
  const reactor = fakeCurveReactor();
  const traces = [];
  const backend = createCurveBackend(reactor.instance, {
    recordCapability(...args) { traces.push(args); },
  });
  assert.equal(backend.ecApIntegral(1n, 2n, 3n, 4n, 999n, 101n), -6);
  assert.deepEqual(
    Array.from(backend.ecAnlistIntegral(0n, 0n, 1n, -1n, 0n, 37n, 5n)),
    [0, 1, -2, -3, -2, -1],
  );
  assert.equal(reactor.state().smalljac.curveText, "[0,0,1,-1,0]");
  assert.equal(reactor.state().smalljacClears, 2);
  assert.deepEqual(
    traces.map(([id, route]) => [id, route]),
    [
      ["elliptic-coefficients-smalljac-wasm", "receipt-backed-wasm-artifact"],
      ["elliptic-coefficients-smalljac-wasm", "receipt-backed-wasm-artifact"],
    ],
  );
});

test("one Wasm tile has an explicit bounded point count", () => {
  const reactor = fakeCurveReactor();
  const backend = createCurveBackend(reactor.instance);
  assert.throws(
    () => backend.ecLseriesValues(
      11n,
      1,
      [0, 1],
      Array.from({ length: 10_001 }, () => ["1", "0"]),
      24,
    ),
    /at most 10000 entries per tile/,
  );
});
