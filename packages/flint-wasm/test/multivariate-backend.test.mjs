import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";
import {
  createMultivariateBackend,
  multivariateResultantCapability,
} from "../multivariate-backend.mjs";

const artifact = new URL("../dist/flint-factor.wasm", import.meta.url);

function ring(backend, order = "degrevlex") {
  const context = backend.mpolyContext("zz", 3, order, 0n);
  const [x, y, z] = [0, 1, 2].map((index) => backend.mpolyGen(context, index));
  const constant = (value) => backend.mpolyConstant(context, BigInt(value), 1n);
  const add = (...values) => values.reduce(backend.mpolyAdd);
  const multiply = backend.mpolyMul;
  return { context, x, y, z, constant, add, multiply };
}

function workload(backend) {
  const { x, y, z, constant, add, multiply } = ring(backend);
  const negative = (value) => backend.mpolyNeg(value);
  const power = backend.mpolyPow;
  const left = add(
    power(add(x, y, z, constant(1)), 7),
    power(add(x, negative(y), multiply(constant(2), z), constant(3)), 6),
    multiply(power(y, 5), z),
  );
  const right = add(
    power(add(multiply(constant(2), x), negative(y), z, constant(2)), 6),
    power(add(x, multiply(constant(2), y), negative(z), constant(1)), 5),
    power(z, 6),
  );
  return { left, right };
}

test("the production artifact executes the exact one-crossing packed resultant", async () => {
  const routes = [];
  const backend = await instantiateFlintFactor(await readFile(artifact), {
    recordCapability(...record) { routes.push(record); },
  });
  const { left, right } = workload(backend);
  assert.equal(backend.mpolyLength(left), 120);
  assert.equal(backend.mpolyLength(right), 84);
  const result = backend.mpolyResultant(left, right, 0);
  assert.equal(backend.mpolyLength(result), 946);
  assert.deepEqual(routes, [[
    multivariateResultantCapability,
    "receipt-backed-wasm-artifact",
    {
      executionTarget: "wasm-artifact",
      ingressBytes: 4_928,
      egressBytes: 32_192,
      boundaryCrossings: 1,
      copiedBytes: 37_120,
    },
  ]]);
});

test("canonical sparse construction materializes exact public polynomials", async () => {
  const backend = await instantiateFlintFactor(await readFile(artifact));
  const { x, y, z, add } = ring(backend, "lex");
  const result = backend.mpolyResultant(
    add(backend.mpolyPow(x, 2), y),
    add(x, z),
    0,
  );
  assert.equal(backend.mpolyToString(result, ["x", "y", "z"]), "y+z^2");
  assert.equal(backend.mpolyLength(result), 2);
  assert.equal(backend.mpolyDegree(result, 0), 0);
  assert.equal(backend.mpolyDegree(result, 2), 2);
});

test("disabled and out-of-domain resultants fail closed without a fake route", async () => {
  const module = await WebAssembly.compile(await readFile(artifact));
  const { createWasiHost } = await import("../dist/wasi-runtime.mjs");
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  const routes = [];
  const disabled = createMultivariateBackend(instance, {
    enabled: false,
    recordCapability(...record) { routes.push(record); },
  });
  const { x, y, z, add } = ring(disabled);
  assert.throws(
    () => disabled.mpolyResultant(add(x, y), add(x, z), 0),
    /WebAssembly capability unavailable.*fmpz-mpoly-resultant-packed-v1/,
  );
  assert.deepEqual(routes, []);
  assert.equal(Object.hasOwn(disabled, "recordCapability"), false);

  const enabled = createMultivariateBackend(instance, {
    recordCapability(...record) { routes.push(record); },
  });
  const values = ring(enabled);
  assert.throws(
    () => enabled.mpolyResultant(enabled.mpolyPow(values.x, 9), values.y, 0),
    /eliminated-variable degree is limited to 8/,
  );
  assert.throws(
    () => enabled.mpolyResultant(
      enabled.mpolyMul(
        enabled.mpolyConstant(values.context, 1n << 512n, 1n),
        values.x,
      ),
      values.y,
      0,
    ),
    /input coefficients are limited to 16 32-bit words/,
  );
  assert.deepEqual(routes, []);
});
