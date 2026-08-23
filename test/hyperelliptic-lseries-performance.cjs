"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("the competitive initialization gate measures analytic cache misses", () => {
  const source = readFileSync(
    join(
      __dirname,
      "..",
      "bench",
      "hyperelliptic",
      "benchmark-analytic-competitive.cjs",
    ),
    "utf8",
  );
  assert.match(
    source,
    /const initStage = `lfunction_init_order4_\$\{precisionBits\}bit_fresh_plan_coefficients_warm_100`;/u,
  );
  assert.match(
    source,
    /tuple\(HyperellipticLSeries\(C,isolated_prefix2\(\)\)\.init\(prec=\$\{precisionBits\},max_order=4,algorithm='native'\)\.central_value\(\) for _index in range\(100\)\)/u,
  );
  assert.match(
    source,
    /bit_coefficient_prefix_cache_hit_100/u,
  );
  assert.match(source, /bit_same_lseries_cache_hit_100/u);
  assert.match(source, /bounded-4-worker-sagejs-vs-resident-pari/u);
  assert.match(
    source,
    /bit_coefficients_warm_single_worker/u,
  );
});

test(
  "prepared LFunctionInit snapshots are independent and reuse cached central results",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x, x**3-x+1)
L = C.lseries()
from sagejs.hyperelliptic_curves.lseries import HyperellipticLSeries
first = L.init(prec=32, max_order=4, algorithm="native")
expected = tuple(first.central_jet(4))
diagnostics = first.diagnostics()
diagnostics["central"]["values"][0]["raw_derivatives"] = (("999", "0"),)
second = L.init(prec=32, max_order=4, algorithm="native")
assert tuple(second.central_jet(4)) == expected
assert tuple(first.central_jet(4)) == expected
assert second.diagnostics()["central"]["cache_hit"]
assert second.diagnostics()["central"]["cache_scope"] == "lseries"
assert L.cache_diagnostics()["evaluation_hits"] >= 1
shared_L = HyperellipticLSeries(C, L._coefficient_prefix)
shared = shared_L.init(prec=32, max_order=4, algorithm="native")
assert tuple(shared.central_jet(4)) == expected
assert shared.diagnostics()["central"]["cache_scope"] == "coefficient-prefix"
assert shared_L.cache_diagnostics()["coefficient_prefix"]["prepared_evaluation_hits"] >= 1
shared_diagnostics = shared.diagnostics()
shared_diagnostics["central"]["values"][0]["raw_derivatives"] = (("777", "0"),)
third = HyperellipticLSeries(C, L._coefficient_prefix).init(prec=32, max_order=4, algorithm="native")
assert tuple(third.central_jet(4)) == expected
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
from sagejs.hyperelliptic_curves.lseries import HyperellipticLSeries, native_central_weight_values
prefix = C.lseries()._coefficient_prefix
native_L = C.lseries()
native = native_L.central_jet(4, prec=32, algorithm="native")
reference_L = HyperellipticLSeries(C, prefix)
reference = reference_L.central_jet(4, prec=32, algorithm="inverse_mellin")
for left, right in zip(native, reference):
    assert float(abs(left-right)) <= 0.000244140625 * max(1.0, float(abs(right)))
assert native_L.last_diagnostics()["algorithm"] == "native-arb-central-mellin-weights"
assert native_L.last_diagnostics()["native_stage_diagnostics"]["coefficient_worker_count"] == 4
assert reference_L.last_diagnostics()["algorithm"] == "native-arb-double-mellin"
single = native_central_weight_values(C, 32, prefix, 4, coefficient_workers=1)
assert single is not None
assert single["native_stage_diagnostics"]["coefficient_worker_count"] == 1
for left, right in zip(native, single["values"][0]["raw_derivatives"]):
    single_value = CC(float(right[0]), float(right[1]))
    assert float(abs(left-single_value)) <= 0.000244140625 * max(1.0, float(abs(left)))
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
