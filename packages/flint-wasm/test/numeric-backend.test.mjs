import assert from "node:assert/strict";
import test from "node:test";

import { createNumericBackend } from "../numeric-backend.mjs";

test("browser numeric values preserve decimal field arithmetic", () => {
  const backend = createNumericBackend();
  const one = backend.realFromString("1.25", 100);
  const two = backend.realFromRational(3n, 4n, 100);
  assert.equal(backend.realToString(backend.realAdd(one, two)), "2");

  const left = backend.complexFromStrings("1.5", "-0.25", 100);
  const right = backend.complexFromStrings("2", "3", 100);
  const product = backend.complexMul(left, right);
  assert.equal(backend.complexToString(product), "3.75 + 4*I");
  assert.equal(backend.complexPrecision(product), 100);
  assert.equal(backend.complexToString(backend.complexDiv(product, right)),
    "1.5 - 0.25*I");
});

test("analytic serialization remains arbitrary-precision decimal", () => {
  const backend = createNumericBackend();
  const value = backend.complexFromStrings(
    "1.6449340668482264364724151666460251892",
    "-2.5e-40",
    160,
  );
  assert.deepEqual(backend.serializeAnalyticPoint(value), [
    "1.6449340668482264364724151666460251892",
    "-0.00000000000000000000000000000000000000025",
  ]);
});
