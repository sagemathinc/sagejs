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

function groebnerWorkload(backend, kind, modulus = 0n) {
  const context = backend.mpolyContext(kind, 2, "degrevlex", modulus);
  const x = backend.mpolyGen(context, 0);
  const y = backend.mpolyGen(context, 1);
  const constant = (value, denominator = 1n) =>
    backend.mpolyConstant(context, BigInt(value), BigInt(denominator));
  return {
    generators: [
      backend.mpolySub(backend.mpolyMul(x, y), constant(1)),
      backend.mpolyAdd(
        backend.mpolyPow(x, 3),
        backend.mpolyMul(constant(7), backend.mpolyPow(y, 2)),
      ),
    ],
  };
}

test("the production artifact computes reduced prime-field F4 bases", async () => {
  const routes = [];
  const backend = await instantiateFlintFactor(await readFile(artifact), {
    recordCapability(...record) { routes.push(record); },
  });
  const { generators } = groebnerWorkload(backend, "nmod", 65537n);
  const basis = backend.mpolyGroebnerMsolve(generators);
  assert.deepEqual(
    basis.map((value) => backend.mpolyToString(value, ["x", "y"])),
    ["x*y+65536", "y^3+18725*x^2", "x^3+7*y^2"],
  );
  assert.deepEqual(
    generators.map((value) =>
      backend.mpolyToString(backend.mpolyReduce(value, basis), ["x", "y"])),
    ["0", "0"],
  );
  assert.equal(routes.length, 1);
  assert.equal(routes[0][0], "wasm-library:msolve:f4-prime-field-packed-v1");
  assert.equal(routes[0][2].boundaryCrossings, 1);
});

test("the production artifact computes explicit modular QQ bases", async () => {
  const routes = [];
  const backend = await instantiateFlintFactor(await readFile(artifact), {
    recordCapability(...record) { routes.push(record); },
  });
  const { generators } = groebnerWorkload(backend, "qq");
  const basis = backend.mpolyGroebnerMsolve(generators);
  assert.deepEqual(
    basis.map((value) => backend.mpolyToString(value, ["x", "y"])),
    ["x*y-1", "y^3+1/7*x^2", "x^3+7*y^2"],
  );
  assert.deepEqual(
    generators.map((value) =>
      backend.mpolyToString(backend.mpolyReduce(value, basis), ["x", "y"])),
    ["0", "0"],
  );
  assert.equal(routes.length, 1);
  assert.equal(routes[0][0], "wasm-library:msolve:modular-qq-packed-v1");
  assert.equal(routes[0][2].boundaryCrossings, 1);
});

test("the packed Groebner ABI rejects malformed input without entering msolve", async () => {
  const module = await WebAssembly.compile(await readFile(artifact));
  const { createWasiHost } = await import("../dist/wasi-runtime.mjs");
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  const exports = instance.exports;
  const inputPointer = Number(exports.sagejs_wasm_mpoly_input()) >>> 0;
  const input = new Uint8Array(exports.memory.buffer, inputPointer, 32);
  input.fill(0);
  assert.equal(Number(exports.sagejs_wasm_mpoly_groebner(31)), 1);
  assert.equal(Number(exports.sagejs_wasm_mpoly_groebner_qq(31)), 1);
  assert.equal(Number(exports.sagejs_wasm_mpoly_groebner(32)), 1);
  assert.equal(Number(exports.sagejs_wasm_mpoly_groebner_qq(32)), 1);
  assert.equal(Number(exports.sagejs_wasm_mpoly_output_length()), 0);
});

test("Groebner resource limits fail before entering the Wasm engine", async () => {
  const module = await WebAssembly.compile(await readFile(artifact));
  const { createWasiHost } = await import("../dist/wasi-runtime.mjs");
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  let crossings = 0;
  const backend = createMultivariateBackend(instance, {
    recordCapability() { crossings += 1; },
  });
  const context = backend.mpolyContext(
    "nmod", 4097, "degrevlex", 65537n,
  );
  assert.throws(
    () => backend.mpolyGroebnerMsolve([backend.mpolyGen(context, 0)]),
    /reviewed msolve resource envelope/,
  );
  assert.equal(crossings, 0);
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
