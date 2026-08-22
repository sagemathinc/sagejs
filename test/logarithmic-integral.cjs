"use strict";

// `Li` is Sage's *offset* logarithmic integral, `log_integral_offset`:
//
//     Li(x) = integral from 2 to x of dt / log(t) = li(x) - li(2)
//
// Sage.js returned the unoffset `li(x)` under that name, which is a wrong
// answer rather than a missing feature: every value was too large by
// li(2) = 1.0451637801174927. The offset is what makes `Li(x)` an
// approximation to `prime_pi(x)`, so dropping it does not merely shift the
// result by a constant -- it stops `Li` being the function the Riemann
// hypothesis is stated against.
//
// The reference values below are Sage's own, from the doctests of
// `Function_log_integral_offset` in sage/functions/exp_integral.py.

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage({ mode: "sage" });
  try {
    const result = await session.evaluate([
      // log_integral_offset(2) is exactly 0: the lower limit of integration.
      "print(Li(2))",
      // N(log_integral_offset(3)) -> 1.11842481454970
      "print(abs(Li(3.0) - 1.11842481454970) < 1e-13)",
      // N(log_integral_offset(1e6)) -> 78626.5039956821
      "print(abs(Li(1000000.0) - 78626.5039956821) < 1e-8)",
      // Sage's own identity doctest: li(4.5) - li(2.0) - Li(4.5) == 0
      "print(li(4.5) - li(2.0) - Li(4.5))",
      // `li` keeps the unoffset meaning, and the two differ by exactly li(2).
      "print(abs((li(3.0) - Li(3.0)) - li(2.0)) < 1e-15)",
      // Li grows past prime_pi and stays close to it, which is the whole
      // point of the offset; the unoffset li(x) is off by ~1.045 here.
      "print(abs(Li(100.0) - 29.080977) < 1e-5)",
      // A non-positive argument has no real logarithmic integral.
      "try:",
      "    Li(0)",
      "except ValueError as error:",
      "    print(error)",
    ].join("\n"));
    assert.equal(result.stdout.trim(), [
      "0.0",
      "True",
      "True",
      "0.0",
      "True",
      "True",
      "li() currently requires a positive real argument",
    ].join("\n"));
  } finally {
    await session.close();
  }
  console.log("Offset logarithmic integral Li matches Sage.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
