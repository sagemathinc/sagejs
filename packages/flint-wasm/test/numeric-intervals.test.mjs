import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";

const wasm = new URL("../dist/flint-factor.wasm", import.meta.url);
const require = createRequire(import.meta.url);
const native = require("../../flint/index.cjs");

test("Arb and Acb intervals execute in the production Wasm reactor", async () => {
  const backend = await instantiateFlintFactor(await readFile(wasm));
  const resources = [];
  const keep = (value) => {
    resources.push(value);
    return value;
  };

  try {
    const third = keep(backend.realIntervalFromRational(1n, 9n, 10));
    const one = keep(backend.realIntervalFromRational(1n, 1n, 10));
    assert.equal(backend.realIntervalPrecision(third), 10);
    assert.equal(backend.realIntervalToString(third), "0.112?");
    assert.equal(
      backend.realIntervalToString(third, 1),
      "[0.11108 .. 0.11121]",
    );
    const inverse = keep(backend.realIntervalBinary(3, one, third, 10));
    assert.equal(backend.realIntervalToString(inverse), "9.0?");
    assert.equal(
      backend.realIntervalRelation(
        1,
        inverse,
        keep(backend.realIntervalFromRational(9n, 1n, 10)),
      ),
      true,
    );
    const disjointLeft = keep(backend.realIntervalFromRational(0n, 1n, 10));
    const disjointRight = keep(backend.realIntervalFromRational(2n, 1n, 10));
    const liveBeforeFailedIntersection = backend.numericLiveCount();
    assert.throws(
      () =>
        backend.realIntervalBinary(4, disjointLeft, disjointRight, 10),
      /invalid WebAssembly numeric input/,
    );
    assert.equal(backend.numericLiveCount(), liveBeforeFailedIntersection);
    const complex = keep(backend.complexIntervalFromParts(third, third, 10));
    assert.equal(
      backend.complexIntervalToString(complex),
      "0.112? + 0.112?*I",
    );
    assert.equal(
      backend.complexIntervalToString(complex, 1),
      "[0.11108 .. 0.11121] + [0.11108 .. 0.11121]*I",
    );
    assert.equal(
      backend.realIntervalRelation(
        0,
        keep(backend.complexIntervalPart(0, complex)),
        third,
      ),
      true,
    );
  } finally {
    for (const resource of resources.reverse()) {
      backend.closeNumericResource(resource);
    }
  }
  assert.equal(backend.numericLiveCount(), 0);
});

test("Wasm interval handles remain bounded and restore exact snapshots", async () => {
  const backend = await instantiateFlintFactor(await readFile(wasm));
  const values = [];
  for (let index = 1; index <= 1000; index += 1) {
    values.push(backend.realIntervalFromRational(
      BigInt(index), BigInt(index + 1), 80,
    ));
  }
  assert.equal(backend.numericLiveCount(), backend.numericHandleCacheLimit);
  assert.equal(
    backend.realIntervalToString(values[0]),
    "0.500000000000000000000000000000000000000000000?",
  );
  assert.equal(
    backend.realIntervalToString(values[999]),
    "0.999000999000999000999001?",
  );
  for (const value of values) backend.closeNumericResource(value);
  assert.equal(backend.numericLiveCount(), 0);
});

test("native and Wasm MPFR/Arb endpoint decisions agree", async () => {
  const backend = await instantiateFlintFactor(await readFile(wasm));
  const resources = [];
  const keep = (value) => {
    resources.push(value);
    return value;
  };
  const samples = [
    [1n, 3n],
    [-5n, 7n],
    [11n, 13n],
    [29n, 17n],
  ];
  try {
    for (const [numerator, denominator] of samples) {
      for (const rounding of [0, 1, 2, 3, 4]) {
        const wasmReal = keep(
          backend.realFromRational(numerator, denominator, 53, rounding),
        );
        const nativeReal = native.realFromRational(
          numerator, denominator, 53, rounding,
        );
        assert.equal(
          backend.realToString(wasmReal, 2, rounding, true),
          native.realToString(nativeReal, 2, rounding, true),
        );
      }

      const wasmInterval = keep(
        backend.realIntervalFromRational(numerator, denominator, 40),
      );
      const nativeInterval = native.realIntervalFromRational(
        numerator, denominator, 40,
      );
      assert.equal(
        backend.realIntervalToString(wasmInterval, 1),
        native.realIntervalToString(nativeInterval, 1),
      );
      const wasmCube = keep(
        backend.realIntervalPowInt(wasmInterval, 3n, 40),
      );
      const nativeCube = native.realIntervalPowInt(nativeInterval, 3n, 40);
      assert.equal(
        backend.realIntervalToString(wasmCube, 1),
        native.realIntervalToString(nativeCube, 1),
      );
    }

    for (let leftIndex = 0; leftIndex < samples.length; leftIndex += 1) {
      const [leftNumerator, leftDenominator] = samples[leftIndex];
      const [rightNumerator, rightDenominator] =
        samples[(leftIndex + 1) % samples.length];
      const wasmLeft = keep(backend.realIntervalFromRational(
        leftNumerator, leftDenominator, 40,
      ));
      const wasmRight = keep(backend.realIntervalFromRational(
        rightNumerator, rightDenominator, 40,
      ));
      const nativeLeft = native.realIntervalFromRational(
        leftNumerator, leftDenominator, 40,
      );
      const nativeRight = native.realIntervalFromRational(
        rightNumerator, rightDenominator, 40,
      );
      for (const operation of [0, 1, 2, 3]) {
        const wasmResult = keep(backend.realIntervalBinary(
          operation, wasmLeft, wasmRight, 40,
        ));
        const nativeResult = native.realIntervalBinary(
          operation, nativeLeft, nativeRight, 40,
        );
        assert.equal(
          backend.realIntervalToString(wasmResult, 1),
          native.realIntervalToString(nativeResult, 1),
        );
      }
    }
  } finally {
    for (const resource of resources.reverse()) {
      backend.closeNumericResource(resource);
    }
  }
  assert.equal(backend.numericLiveCount(), 0);
});
