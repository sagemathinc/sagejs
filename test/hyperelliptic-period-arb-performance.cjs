"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "bounded Arb edge batches match arbitrary-precision Python quadrature",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from mpmath import mp
import sagejs.hyperelliptic_curves.periods as period_module
import sagejs.runtime as runtime
R = PolynomialRing(QQ, "x")
x = R.gen()
models = [
    HyperellipticCurve(x**5-x+1),
    HyperellipticCurve(x**7-x+1, x**2),
]
for curve in models:
    genus = int(curve.genus())
    completed, coefficients = period_module._completed_model(curve)
    with mp.workprec(128):
        geometry = period_module._branch_geometry(curve, completed, 128)
        roots = geometry["ordered_points"]
        leading = period_module._mp_exact(coefficients[-1])
        arb_result = period_module._edge_integrals_arb(
            roots, leading, genus, 4, 16, 96
        )
        assert arb_result is not None
        arb_edges, diagnostics = arb_result
        reference = [
            period_module._edge_integrals(roots, leading, edge, genus, 4, 16)
            for edge in range(2 * genus)
        ]
        difference = max(
            abs(arb_edges[edge][differential] - reference[edge][differential])
            for edge in range(2 * genus)
            for differential in range(genus)
        )
        assert difference < mp.power(2, -80), (genus, difference)
        assert diagnostics["arithmetic_accuracy_bits"] >= 90
        assert diagnostics["sample_evaluations"] == 2 * genus * 4 * 16

backend = runtime.flint_backend()
native = runtime.reflect.get(
    backend, "hyperellipticPeriodEdgeBatchArb"
)
panels_rejected = False
try:
    runtime.reflect.apply(
        native,
        backend,
        [[['0', '0'] for _index in range(5)], '1', 2, 65, 16, 96],
    )
except:
    panels_rejected = True
assert panels_rejected
order_rejected = False
try:
    runtime.reflect.apply(
        native,
        backend,
        [[['0', '0'] for _index in range(5)], '1', 2, 4, 7, 96],
    )
except:
    order_rejected = True
assert order_rejected
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "public 64-bit periods retain two arbitrary-precision refinement witnesses",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.periods import clear_period_cache, real_period
R = PolynomialRing(QQ, "x")
x = R.gen()
for curve in (
    HyperellipticCurve(x**5-x+1),
    HyperellipticCurve(x**7-x+1, x**2),
):
    clear_period_cache()
    result = real_period(curve, prec=64, use_cache=False)
    runs = result.diagnostics()["refinement_runs"]
    arbitrary = [
        run
        for run in runs
        if all(
            attempt["engine"] == "arb-acb-gauss-legendre"
            for attempt in run["quadrature_attempts"]
        )
    ]
    assert len(arbitrary) >= 2
    assert all(run["quadrature_evidence_bits"] >= 64 for run in arbitrary)
    checks = result.verify()
    assert checks["verified"] and not checks["rigorous"]
    assert result.achieved_stability_bits > 44
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);
