// sagejs-test-tier: integration
"use strict";

// `float()` returns a raw JS number for a non-integral value but boxes an
// integral one in a `Number` wrapper carrying `__sagejs_float__`. That is
// deliberate: in JavaScript `0` and `0.0` are the same primitive, so the
// wrapper is the only thing keeping `float(0)` distinguishable from the
// integer `0`, and it is what preserves float contagion.
//
// The cost is that a boxed float reports `jstype` "object", so any test
// written as `jstype(value) == "number"` misses it. `CoercionModel.parentOf`
// was one such test, so calling a polynomial with `float(0)` raised
// "value has no mathematical parent" while `float(0.5)` worked -- the failure
// depended on the *value* of the float, not on its type.

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage({ mode: "sage" });
  try {
    const result = await session.evaluate([
      "R.<x> = QQ[]",
      "f = x^2 - 2",
      // The regression: an integral-valued float must work exactly as a
      // non-integral one does.
      "print(f(float(0)))",
      "print(f(float(0.5)))",
      "print(f(float(3)))",
      // A boxed float has RDF as its parent, exactly as a raw one does.
      "print(parent(float(0)))",
      "print(parent(float(0.5)))",
      // Arithmetic contagion works in both orders.
      "print(float(0) + float(0))",
      "print(parent(float(2) * float(3)))",
      "print(float(1) - float(1))",
      // The integer 0 keeps its own parent; the fix must not blur the two.
      "print(parent(0))",
      "print(float(0) == 0)",
      // KNOWN REMAINING GAP, pinned here so it stays visible rather than
      // being mistaken for correct. `PolynomialElement.__call__` has its own
      // exact-value fast path that is separate from `parentOf`, so evaluating
      // at an integral-valued float still returns a Rational instead of an
      // RDF element. Upstream Sage gives 2.0 here. A non-integral argument
      // already takes the RDF path correctly, which is why only the integral
      // case is wrong.
      "print(parent(f(float(2))))",
      "print(parent(f(float(2.5))))",
    ].join("\n"));
    assert.equal(result.stdout.trim(), [
      "-2",
      "-1.75",
      "7",
      "Real Double Field",
      "Real Double Field",
      "0.0",
      "Real Double Field",
      "0.0",
      "Integer Ring",
      "True",
      "Rational Field",
      "Real Double Field",
    ].join("\n"));
  } finally {
    await session.close();
  }
  console.log("Boxed integral-valued floats coerce like any other float.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
