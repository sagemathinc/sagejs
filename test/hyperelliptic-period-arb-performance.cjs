"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { compile } = require("@sagemath/sagejs/native");
const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const periodSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "periods.py",
);

function runSage(source, environment) {
  const result = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

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
  "packed sign and conjugation preselectors match arbitrary precision",
  { timeout: 180_000 },
  async () => {
    const cache = mkdtempSync(join(tmpdir(), "sagejs-period-assembly-native-"));
    try {
      const compiled = await compile({
        sourcePath: periodSource,
        cacheRoot: cache,
      });
      for (const name of [
        "_period_sign_mask_float64_kernel",
        "_conjugation_action_float64_kernel",
      ]) {
        assert.equal(
          compiled.ir.functions.find((item) => item.name === name).kernelKind,
          "float64",
        );
      }
      const witness = String.raw`
from mpmath import mp
import sagejs.hyperelliptic_curves.periods as period_module
from sagejs.native import is_compiled
R = PolynomialRing(QQ, "x")
x = R.gen()
summary = []
for curve in (
    HyperellipticCurve(x**5-x+1),
    HyperellipticCurve(x**7-x+1, x**2),
):
    genus = int(curve.genus())
    completed, coefficients = period_module._completed_model(curve)
    with mp.workprec(128):
        geometry = period_module._branch_geometry(curve, completed, 128)
        arb = period_module._edge_integrals_arb(
            geometry["ordered_points"],
            period_module._mp_exact(coefficients[-1]),
            genus,
            4,
            16,
            112,
        )
        assert arb is not None
        edges, _diagnostics = arb
        selected = period_module._periods_from_edges(edges, genus)
        exhaustive = period_module._periods_from_edges(edges, genus, True)
        difference = period_module._maximum_matrix_difference(
            selected["period_matrix"], exhaustive["period_matrix"]
        )
        assert difference < mp.power(2, -90), difference
        candidate = period_module._float64_conjugation_preselection(
            selected["period_matrix"], genus
        )
        assert candidate is not None
        tolerance = mp.power(2, -80)
        checked = period_module._conjugation_action(
            selected["period_matrix"], genus, tolerance, candidate
        )
        derived = period_module._conjugation_action(
            selected["period_matrix"], genus, tolerance, None
        )
        assert checked["matrix"] == derived["matrix"]
        summary.append((genus, checked["matrix"]))
print(summary)
`;
      const native = runSage(`${witness}\nassert is_compiled(period_module._period_sign_mask_float64_kernel)\nassert is_compiled(period_module._conjugation_action_float64_kernel)`, {
        SAGEJS_NATIVE_CACHE_DIR: cache,
      });
      const dynamic = runSage(witness, {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_DISABLE: "1",
      });
      assert.equal(native, dynamic);
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  },
);

test(
  "complete FLINT periods match the pinned PARI corpus with bounded evidence",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from mpmath import mp
import sagejs.runtime as runtime
backend = runtime.flint_backend()
native_period = runtime.reflect.get(backend, "hyperellipticRealPeriodArb")
cases = [
    (
        ["0", "1", "1"],
        ["1", "0", "1", "1"],
        2,
        "32.667031090507096110005902370143563809",
    ),
    (
        ["0", "1", "1", "0", "-2", "-1", "1", "1"],
        ["1", "0", "1"],
        3,
        "69.081200998004027497103951240276008092",
    ),
]
for f_coefficients, h_coefficients, genus, expected in cases:
    native = runtime.reflect.apply(
        native_period,
        backend,
        [f_coefficients, h_coefficients, genus, 64, 3, 4, 16],
    )
    assert str(runtime.reflect.get(native, "status")) == "ok"
    value = mp.mpf(str(runtime.reflect.get(native, "modelPeriod")))
    assert abs(value - mp.mpf(expected)) / mp.mpf(expected) < mp.power(2, -64)
    assert int(runtime.reflect.get(native, "achievedStabilityBits")) > 44
    assert int(runtime.reflect.get(native, "arithmeticAccuracyBits")) > 44
    runs = runtime.reflect.get(native, "refinementRuns")
    assert len(runs) >= 2
    previous_bits = 0
    previous_panels = 0
    for run in runs:
        work_bits = int(runtime.reflect.get(run, "workPrecisionBits"))
        panels = int(runtime.reflect.get(run, "quadraturePanels"))
        order = int(runtime.reflect.get(run, "quadratureOrder"))
        samples = int(runtime.reflect.get(run, "sampleEvaluations"))
        assert str(runtime.reflect.get(run, "engine")) == "arb-acb-complete-period"
        assert work_bits > previous_bits and panels > previous_panels
        assert samples == 2 * genus * panels * order
        previous_bits = work_bits
        previous_panels = panels

precision_rejected = False
try:
    runtime.reflect.apply(
        native_period,
        backend,
        [["0", "1", "1"], ["0"], 2, 1025, 3, 4, 16],
    )
except:
    precision_rejected = True
assert precision_rejected

squarefree_rejected = False
try:
    runtime.reflect.apply(
        native_period,
        backend,
        [["0", "0", "0", "0", "0", "1"], ["0"], 2, 64, 3, 4, 16],
    )
except:
    squarefree_rejected = True
assert squarefree_rejected
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
from mpmath import mp
R = PolynomialRing(QQ, "x")
x = R.gen()
for curve in (
    HyperellipticCurve(x**5-x+1),
    HyperellipticCurve(x**7-x+1, x**2),
):
    clear_period_cache()
    result = real_period(curve, prec=64, use_cache=False)
    diagnostics = result.diagnostics()
    runs = diagnostics["refinement_runs"]
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
    complete = diagnostics["complete_arb_refinement_runs"]
    assert len(complete) >= 2
    assert all(run["engine"] == "arb-acb-complete-period" for run in complete)
    assert mp.mpf(diagnostics["complete_arb_crosscheck_difference"]) < mp.power(2, -44)
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
