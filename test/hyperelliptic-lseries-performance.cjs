"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "prepared LFunctionInit snapshots are independent and reuse the central plan",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x, x**3-x+1)
L = C.lseries()
first = L.init(prec=32, max_order=4, algorithm="native")
expected = tuple(first.central_jet(4))
diagnostics = first.diagnostics()
diagnostics["central"]["values"][0]["raw_derivatives"] = (("999", "0"),)
second = L.init(prec=32, max_order=4, algorithm="native")
assert tuple(second.central_jet(4)) == expected
assert tuple(first.central_jet(4)) == expected
assert second.diagnostics()["central"]["cache_hit"]
assert L.cache_diagnostics()["evaluation_hits"] >= 1
first.close()
assert tuple(second.central_jet(4)) == expected
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "native central derivatives retain the inverse-Mellin differential oracle",
  { timeout: 300_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x, x**3-x+1)
from sagejs.hyperelliptic_curves.lseries import HyperellipticLSeries
prefix = C.lseries()._coefficient_prefix
native_L = C.lseries()
native = native_L.central_jet(4, prec=32, algorithm="native")
reference_L = HyperellipticLSeries(C, prefix)
reference = reference_L.central_jet(4, prec=32, algorithm="inverse_mellin")
for left, right in zip(native, reference):
    assert float(abs(left-right)) <= 0.000244140625 * max(1.0, float(abs(right)))
assert native_L.last_diagnostics()["algorithm"] == "native-arb-central-mellin-weights"
assert reference_L.last_diagnostics()["algorithm"] == "native-arb-double-mellin"
C3 = HyperellipticCurve(R([0,1,3,5,7,6,4,1]), R([1]))
prefix3 = C3.lseries()._coefficient_prefix
native3_L = C3.lseries()
native3 = native3_L.central_jet(4, prec=16, algorithm="native")
reference3_L = HyperellipticLSeries(C3, prefix3)
reference3 = reference3_L.central_jet(4, prec=16, algorithm="inverse_mellin")
for left, right in zip(native3, reference3):
    assert float(abs(left-right)) <= 0.00390625 * max(1.0, float(abs(right)))
diagnostics3 = native3_L.last_diagnostics()
assert diagnostics3["genus"] == 3
assert diagnostics3["conductor"] == 24055
assert diagnostics3["cutoff"] == 124
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);
