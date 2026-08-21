import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";
import { createGeneratedWasmBackend } from "../dist/ffi-resource-backend.mjs";
import { createWasiHost } from "../dist/wasi-runtime.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);

function close(value, operation) {
  operation(value);
  operation(value);
}

function decodeCoordinates(bytes, magic) {
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), magic);
  assert.equal(bytes[4], 1);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const degree = Number(view.getBigUint64(8, true));
  const count = magic === "SJFC"
    ? Number(view.getBigUint64(16, true))
    : 1;
  const offset = magic === "SJFC" ? 24 : 16;
  const coordinates = [];
  for (let index = 0; index < degree * count; index += 1) {
    coordinates.push(view.getBigUint64(offset + 8 * index, true));
  }
  return { degree, count, coordinates };
}

function takeCoordinates(flint, region, magic) {
  try {
    return decodeCoordinates(flint.ffiFlintByteRegionCopyBytes(region), magic);
  } finally {
    close(region, flint.ffiFlintByteRegionClose);
  }
}

async function instantiateObserved() {
  const module = await WebAssembly.compile(wasm);
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  return {
    backend: createGeneratedWasmBackend(instance),
    liveResources: () => instance.exports.sagejs_wasm_resource_live_count(),
    memory: instance.exports.memory,
  };
}

test("runs exact FLINT extension-field resources in real Wasm", async () => {
  const flint = await instantiateFlintFactor(wasm);
  assert.ok(flint.__sagejs_ffi_manifest__.resources.includes("fq_context"));
  assert.ok(flint.__sagejs_ffi_manifest__.resources.includes("fq_element"));
  assert.ok(flint.__sagejs_ffi_manifest__.resources.includes("fq_polynomial"));
  assert.equal(flint.ffiFqElementCoordinate, undefined);
  assert.equal(flint.ffiFqPolynomialCoordinate, undefined);

  const context = flint.ffiFqContextCreate(
    new BigUint64Array([1n, 0n, 1n]), 3n, 3n,
  );
  const otherContext = flint.ffiFqContextCreate(
    new BigUint64Array([1n, 0n, 1n]), 3n, 3n,
  );
  const left = flint.ffiFqElementCreate(
    context, new BigUint64Array([1n, 2n]), 2n,
  );
  const right = flint.ffiFqElementCreate(
    context, new BigUint64Array([2n, 1n]), 2n,
  );
  const foreign = flint.ffiFqElementCreate(
    otherContext, new BigUint64Array([2n, 1n]), 2n,
  );
  const sum = flint.ffiFqElementAdd(left, right);
  const product = flint.ffiFqElementMul(left, right);
  const inverse = flint.ffiFqElementInverse(left);
  const power = flint.ffiFqElementPow(left, 17n);

  assert.deepEqual(
    takeCoordinates(
      flint,
      flint.ffiFqElementCoordinateBytes(sum),
      "SJFE",
    ).coordinates,
    [0n, 0n],
  );
  assert.deepEqual(
    takeCoordinates(
      flint,
      flint.ffiFqElementCoordinateBytes(product),
      "SJFE",
    ).coordinates,
    [0n, 2n],
  );
  assert.deepEqual(
    takeCoordinates(
      flint,
      flint.ffiFqElementCoordinateBytes(inverse),
      "SJFE",
    ).coordinates,
    [2n, 2n],
  );
  assert.equal(flint.ffiFqElementEqual(power, left), true);
  assert.throws(
    () => flint.ffiFqElementAdd(left, foreign),
    /finite extension contexts differ/,
  );

  const polynomial = flint.ffiFqPolynomialCreate(
    context,
    new BigUint64Array([1n, 2n, 0n, 1n, 2n, 2n]),
    6n,
    3n,
  );
  const multiplier = flint.ffiFqPolynomialCreate(
    context,
    new BigUint64Array([2n, 0n, 1n, 1n]),
    4n,
    2n,
  );
  const polynomialProduct = flint.ffiFqPolynomialMul(polynomial, multiplier);
  const region = flint.ffiFqPolynomialCoordinateBytes(polynomialProduct);
  const decoded = decodeCoordinates(
    flint.ffiFlintByteRegionCopyBytes(region),
    "SJFC",
  );
  assert.deepEqual(decoded, {
    degree: 2,
    count: 4,
    coordinates: [2n, 1n, 2n, 2n, 0n, 2n, 0n, 1n],
  });
  close(region, flint.ffiFlintByteRegionClose);

  // Dependents own retained context references and remain valid after the
  // public context wrapper is closed.
  close(context, flint.ffiFqContextClose);
  assert.equal(flint.ffiFqPolynomialLength(polynomialProduct), 4n);

  for (const value of [polynomialProduct, multiplier, polynomial]) {
    close(value, flint.ffiFqPolynomialClose);
  }
  for (const value of [power, inverse, product, sum, foreign, right, left]) {
    close(value, flint.ffiFqElementClose);
  }
  close(otherContext, flint.ffiFqContextClose);
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);
});

test("survives Wasm memory growth during bulk extension ingress", async () => {
  const { backend: flint, liveResources, memory } = await instantiateObserved();
  const before = memory.buffer.byteLength;
  const context = flint.ffiFqContextCreate(
    new BigUint64Array([1n, 0n, 1n]), 3n, 3n,
  );
  const coefficientCount = 400_000;
  const coordinates = new BigUint64Array(2 * coefficientCount);
  coordinates[coordinates.length - 2] = 1n;
  const polynomial = flint.ffiFqPolynomialCreate(
    context,
    coordinates,
    BigInt(coordinates.length),
    BigInt(coefficientCount),
  );
  assert.ok(memory.buffer.byteLength > before);
  assert.equal(flint.ffiFqPolynomialLength(polynomial), BigInt(coefficientCount));
  close(polynomial, flint.ffiFqPolynomialClose);
  close(context, flint.ffiFqContextClose);
  assert.equal(liveResources(), 0n);
});

test("uses arbitrary-prime FLINT polynomial resources beyond word size", async () => {
  const flint = await instantiateFlintFactor(wasm);
  const prime = (1n << 127n) - 1n;
  const left = flint.ffiFmpzModPolynomialCreate(prime, 3n);
  const right = flint.ffiFmpzModPolynomialCreate(prime, 2n);
  flint.ffiFmpzModPolynomialSetCoefficient(left, 0n, prime - 1n);
  flint.ffiFmpzModPolynomialSetCoefficient(left, 1n, prime - 2n);
  flint.ffiFmpzModPolynomialSetCoefficient(left, 2n, 5n);
  flint.ffiFmpzModPolynomialSetCoefficient(right, 0n, 7n);
  flint.ffiFmpzModPolynomialSetCoefficient(right, 1n, 11n);
  flint.ffiFmpzModPolynomialSeal(left);
  flint.ffiFmpzModPolynomialSeal(right);
  const product = flint.ffiFmpzModPolynomialMul(left, right);
  assert.equal(flint.ffiFmpzModPolynomialModulus(product), prime);
  assert.deepEqual(
    [0n, 1n, 2n, 3n].map((index) =>
      flint.ffiFmpzModPolynomialCoefficient(product, index)
    ),
    [prime - 7n, prime - 25n, 13n, 55n],
  );
  close(product, flint.ffiFmpzModPolynomialClose);
  close(right, flint.ffiFmpzModPolynomialClose);
  close(left, flint.ffiFmpzModPolynomialClose);
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);
});
