import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import test from "node:test";

import { createNumberFieldZetaBackend } from "../number-field-zeta.mjs";
import { createWasiHost } from "../dist/wasi-runtime.mjs";

const require = createRequire(import.meta.url);
const nativeFlint = require("../../flint");
const wasmBytes = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const module = await WebAssembly.compile(wasmBytes);
const wasi = createWasiHost();
const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: wasi.imports,
});
wasi.initialize(instance);
const wasmFlint = createNumberFieldZetaBackend(instance);

function plain(result) {
  return {
    degree: result.degree,
    primeCount: result.primeCount,
    factorCounts: Array.from(result.factorCounts, Number),
    exponents: Array.from(result.exponents, Number),
    degrees: Array.from(result.degrees, Number),
  };
}

test("shares exact factor-degree results between Node and WebAssembly", () => {
  const cases = [
    {
      coefficients: [-1n, -1n, 0n, 1n],
      primes: [2n, 3n, 5n, 7n, 11n, 101n, 65537n],
    },
    {
      coefficients: [1n, -2n, 1n],
      primes: [2n, 3n, 5n, 17n],
    },
    {
      coefficients: [
        -(2n ** 180n) - 1n,
        2n ** 150n + 7n,
        -(2n ** 96n),
        0n,
        1n,
      ],
      primes: [3n, 5n, 257n, 65521n],
    },
  ];
  for (const { coefficients, primes } of cases) {
    const packedPrimes = BigUint64Array.from(primes);
    assert.deepEqual(
      plain(wasmFlint.nfFactorDegreesBatch(coefficients, packedPrimes)),
      plain(nativeFlint.nfFactorDegreesBatch(coefficients, packedPrimes)),
    );
  }
});

test("returns copied packed output independent of Wasm allocation lifetime", () => {
  const first = wasmFlint.nfFactorDegreesBatch(
    [-1n, -1n, 0n, 1n],
    BigUint64Array.from([2n, 3n, 5n, 7n, 11n]),
  );
  const snapshot = plain(first);
  wasmFlint.nfFactorDegreesBatch(
    [1n, 0n, 1n],
    BigUint64Array.from([13n, 17n, 19n]),
  );
  assert.deepEqual(plain(first), snapshot);
});

test("enforces the bounded Wasm word-prime and monic contracts", () => {
  assert.equal(wasmFlint.nfFactorDegreesBatchMaxPrime, 0xffffffffn);
  assert.throws(
    () => wasmFlint.nfFactorDegreesBatch(
      [-1n, -1n, 0n, 1n],
      BigUint64Array.from([2n ** 32n + 15n]),
    ),
    (error) => error.code === "SAGEJS_WASM_WORD_PRIME_UNAVAILABLE",
  );
  assert.throws(
    () => wasmFlint.nfFactorDegreesBatch(
      [-1n, -1n, 0n, 2n],
      BigUint64Array.from([5n]),
    ),
    /monic/,
  );
  assert.throws(
    () => wasmFlint.nfFactorDegreesBatch(
      [-1n, -1n, 0n, 1n],
      BigUint64Array.from([4n]),
    ),
    /supplied prime index 0/,
  );
});
