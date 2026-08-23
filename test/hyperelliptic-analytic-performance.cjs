"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "period refinements reuse and revalidate exact branch topology",
  { timeout: 300_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.periods import clear_period_cache, period_cache_info, real_period
clear_period_cache()
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**7-x+1, x**2)
period = real_period(C, prec=64, use_cache=False)
info = period_cache_info()
runs = period.diagnostics()["refinement_runs"]
assert period.verify()["verified"]
assert len(runs) >= 3
assert info["topology_entries"] == 1
assert info["topology_hits"] >= 1
assert info["topology_replans"] == 0
assert info["angular_path_hits"] == 1
assert info["exhaustive_path_fallbacks"] == 0
assert info["float64_quadratures"] >= 1
assert all(
    attempt["engine"].startswith("packed-float64-")
    for attempt in runs[0]["quadrature_attempts"]
)
assert runs[0]["quadrature_evidence_bits"] == 44
assert runs[-1]["quadrature_evidence_bits"] > 44
assert all(
    attempt["representation_bits"] == 53
    and attempt["riemann_target_bits"] == 44
    and attempt["fallback_reason"] is None
    for attempt in runs[0]["quadrature_attempts"]
)
assert all(
    attempt["engine"] == "mpmath"
    and attempt["representation_bits"] > 53
    for run in runs[1:]
    for attempt in run["quadrature_attempts"]
)
assert not runs[0]["conjugation_action_reused"]
assert runs[-1]["conjugation_action_reused"]
assert period.achieved_stability_bits > 44
assert not runs[0]["topology_cache_hit"]
assert all(run["topology_cache_hit"] for run in runs[1:])
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "packed period quadrature matches its dynamic source and mpmath oracle",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from mpmath import mp
import sagejs.hyperelliptic_curves.periods as period_module
from sagejs.native import is_compiled
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**7-x+1, x**2)
completed, coefficients = period_module._completed_model(C)
with mp.workprec(96):
    geometry = period_module._branch_geometry(C, completed, 96)
    roots = geometry["ordered_points"]
    leading = period_module._mp_exact(coefficients[-1])
    packed = period_module._edge_integrals_float64(roots, leading, 3, 4, 16)
    source = getattr(period_module._period_edge_batch_float64, "__sagejs_native_source__")
    dynamic = period_module._edge_integrals_float64(
        roots, leading, 3, 4, 16, kernel=source
    )
    reference = [
        period_module._edge_integrals(roots, leading, edge, 3, 4, 16)
        for edge in range(6)
    ]
    native_dynamic_error = max(
        abs(packed[edge][differential] - dynamic[edge][differential])
        for edge in range(6)
        for differential in range(3)
    )
    oracle_error = max(
        abs(packed[edge][differential] - reference[edge][differential])
        for edge in range(6)
        for differential in range(3)
    )
    perturbed = [list(edge_values) for edge_values in packed]
    perturbation = mp.power(2, -45)
    perturbed[0][0] += perturbation
    perturbed_periods = period_module._periods_from_edges(perturbed, 3)
    reference_periods = period_module._periods_from_edges(reference, 3)
    outer_difference = period_module._maximum_matrix_difference(
        perturbed_periods["period_matrix"], reference_periods["period_matrix"]
    )
    outer_scale = max(
        mp.mpf(1),
        period_module._matrix_maximum(reference_periods["period_matrix"]),
    )
assert native_dynamic_error < mp.mpf("1e-13")
assert oracle_error < mp.mpf("1e-12")
assert perturbation < mp.power(2, -44)
assert outer_difference > mp.power(2, -48) * outer_scale
assert is_compiled(period_module._period_edge_batch_float64)
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "exact coefficient prefixes extend without rebuilding old coefficients",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.lseries import GlobalCoefficientPrefix
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x, x**3-x+1)
incremental = GlobalCoefficientPrefix(C)
first = list(incremental.through(80))
second = list(incremental.through(160))
one_shot = list(GlobalCoefficientPrefix(C).through(160))
diagnostics = incremental.diagnostics()
assert second == one_shot and second[:81] == first
assert diagnostics["bound"] == 160
assert diagnostics["extensions"] == 2
assert diagnostics["local_prime_bound"] == 160
assert diagnostics["cached_euler_factors"] >= 37
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "prepared L-functions reuse stronger jets and materialized central values",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x, x**3-x+1)
L = C.lseries()
jet4 = L.central_jet(4, prec=32, algorithm="native")
jet2 = L.central_jet(2, prec=32, algorithm="native")
cache = L.cache_diagnostics()
last = L.last_diagnostics()
assert len(jet4) == 5 and len(jet2) == 3
assert tuple(jet2) == tuple(jet4[:3])
assert last["cache_hit"]
assert last["cache_reused_maximum_derivative"] == 4
assert cache["evaluation_subsumption_hits"] == 1
initialized = L.init(prec=32, max_order=4, algorithm="native")
value = initialized.central_value()
assert value is initialized.central_value()
assert tuple(initialized.central_jet(2)) == tuple(jet4[:3])
assert initialized.diagnostics()["prepared_derivatives"] == 5
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);
