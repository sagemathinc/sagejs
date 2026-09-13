#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "../../..");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-polynomial-roots-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

const witness = String.raw`
import json
import math

from sagejs.numerics import ResourceBudget
from sagejs.numerics.approximation import (
    capabilities,
    plan as approximation_plan,
    polynomial_roots as public_polynomial_roots,
    supports,
)
from sagejs.numerics.approximation.polynomial_roots import (
    MAX_POLYNOMIAL_ROOT_DEGREE,
    plan_polynomial_roots,
    polynomial_roots,
    polynomial_roots_problem,
)


def close(left, right, tolerance=1.0e-9):
    assert abs(left - right) <= tolerance * max(1.0, abs(right)), (left, right)


def coefficients_from_roots(roots):
    coefficients = [1.0 + 0.0j]
    for root in roots:
        updated = [0.0j] * (len(coefficients) + 1)
        for index in range(len(coefficients)):
            updated[index] += coefficients[index]
            updated[index + 1] -= coefficients[index] * root
        coefficients = updated
    return coefficients


def match_roots(observed, expected, tolerance=1.0e-8):
    remaining = list(observed)
    for target in expected:
        nearest = min(range(len(remaining)), key=lambda index: abs(remaining[index] - target))
        close(remaining[nearest], target, tolerance)
        remaining.pop(nearest)
    assert len(remaining) == 0


assert MAX_POLYNOMIAL_ROOT_DEGREE == 64

# Planning is inspectable and spends no numerical iteration.
problem = polynomial_roots_problem([1, -6, 11, -6], trace="iterations")
plan = plan_polynomial_roots(problem)
assert plan.method == "aberth-ehrlich"
plan_record = plan.to_dict()
assert plan_record["capability"]["maximum_degree"] == 64
assert plan_record["capability"]["multiplicity_policy"] == "numerical-clusters-only-never-certified"
assert plan_record["capability"]["platform_support"]["browser"].startswith("pending_")
assert supports(problem)
assert approximation_plan(problem).to_dict() == plan_record
capability = capabilities("polynomial_roots")["operations"]["polynomial_roots"]
assert capability["maximum_degree"] == 64
assert capability["multiplicity_policy"] == "numerical_clusters_only_never_certified"

ordinary = polynomial_roots([1, -6, 11, -6], trace="iterations")
assert ordinary.success and ordinary.status == "converged"
match_roots(ordinary.roots, [1.0, 2.0, 3.0], 2.0e-11)
assert ordinary.validation.truth_level == "validated_approximate"
assert ordinary.value["maximum_backward_error"] < 1.0e-13
assert ordinary.value["vieta_reconstruction_error"] < 1.0e-13
assert ordinary.trace.events[0].kind == "start"
assert ordinary.trace.events[-1].kind == "finish"
assert public_polynomial_roots([1, -3, 2]).success
explanation = ordinary.explanation()
assert explanation["construction"]["root_count"] == 3
assert explanation["numerical_indicators"]["maximum_coefficientwise_backward_error"] < 1.0e-13
plot_spec = ordinary.to_plot_spec()
assert plot_spec.layers[0].kind == "point"
assert "do not certify multiplicity" in plot_spec.alt_text()
animation = ordinary.to_animation(max_frames=3)
assert len(animation.frames) == 3
assert animation.frames[-1].state.layers[0].data["x"] == [root.real for root in ordinary.roots]

# Returned JSON is finite and detached from the validated result.
record = json.loads(ordinary.to_json())
assert record["value"]["roots"][0]["real"] == ordinary.roots[0].real
detached = ordinary.value
detached["roots"][0]["real"] = 999.0
assert ordinary.roots[0] != 999.0
assert "multiplicity: not certified" in ordinary.explain()

# Ascending coefficient order is explicit rather than guessed.
ascending = polynomial_roots([-6, 11, -6, 1], order="ascending")
match_roots(ascending.roots, [1.0, 2.0, 3.0], 2.0e-11)
laguerre = polynomial_roots([1, -6, 11, -6], method="laguerre-deflation")
assert laguerre.success and laguerre.method == "laguerre-deflation"
match_roots(laguerre.roots, [1.0, 2.0, 3.0], 2.0e-11)

# Complex coefficients and roots remain complex throughout the same path.
complex_expected = [1.0 + 2.0j, -3.0 + 0.5j, 0.2 - 0.7j]
complex_result = polynomial_roots(coefficients_from_roots(complex_expected))
assert complex_result.success
match_roots(complex_result.roots, complex_expected, 2.0e-10)

# Real coefficients restore representable conjugate symmetry.
conjugate_result = polynomial_roots(coefficients_from_roots([1 + 3j, 1 - 3j, -2]))
assert conjugate_result.success
match_roots(conjugate_result.roots, [1 + 3j, 1 - 3j, -2], 2.0e-10)
positive = [root for root in conjugate_result.roots if root.imag > 0][0]
negative = [root for root in conjugate_result.roots if root.imag < 0][0]
assert positive == negative.conjugate()

# Coefficient normalization is invariant across the finite binary64 range.
for multiplier in (1.0e-300, 1.0e300):
    scaled = polynomial_roots([multiplier, -6*multiplier, 11*multiplier, -6*multiplier])
    assert scaled.success
    match_roots(scaled.roots, [1.0, 2.0, 3.0], 3.0e-10)

# The stable quadratic formula preserves a root pair separated by 300 orders
# of magnitude instead of losing the small root to cancellation.
wide = polynomial_roots([1.0, -1.0e150, 1.0])
assert wide.success
match_roots(wide.roots, [1.0e-150, 1.0e150], 2.0e-13)

# Term-wise logarithmic validation supports roots at both ends of binary64
# without normalizing the smaller coefficient away. The inverse envelope is
# equally important: tiny nonreal roots must not be snapped to real zero.
huge_imaginary = polynomial_roots([1.0e-308, 0.0, 1.0e308])
assert huge_imaginary.success
match_roots(huge_imaginary.roots, [1.0e308j, -1.0e308j], 3.0e-13)
tiny_imaginary = polynomial_roots([1.0e308, 0.0, 1.0e-308])
assert tiny_imaginary.success
match_roots(tiny_imaginary.roots, [1.0e-308j, -1.0e-308j], 3.0e-13)

# A finite coefficient list can still imply a root outside binary64. That is
# an honest structured validation failure, never an uncaught overflow.
unrepresentable = polynomial_roots([1.0e-300, 1.0e300])
assert not unrepresentable.success
assert unrepresentable.status == "validation_failed"

# Repeated and tightly clustered roots are backward validated, explicitly
# diagnosed as ill-conditioned, and never advertised as certified multiplicity.
repeated = polynomial_roots([1, -4, 6, -4, 1])
assert repeated.success
assert repeated.value["multiplicity_certified"] is False
assert any(diagnostic.code == "ill_conditioned" for diagnostic in repeated.diagnostics)
assert any(cluster["size"] > 1 for cluster in repeated.clusters)
assert repeated.value["maximum_backward_error"] < 1.0e-10

clustered_expected = [-2.0, 1.0, 1.0 + 1.0e-5]
clustered = polynomial_roots(coefficients_from_roots(clustered_expected))
assert clustered.success
match_roots(clustered.roots, clustered_expected, 1.0e-7)
assert any(diagnostic.code == "ill_conditioned" for diagnostic in clustered.diagnostics)

# Exact zeros are stripped before iteration and restored without division by a
# vanishing constant term. Leading zero coefficients lower the actual degree.
zeros = polynomial_roots([0, 0, 2, -6, 4, 0, 0])
assert zeros.success
match_roots(zeros.roots, [0, 0, 1, 2], 2.0e-11)
assert zeros.value["leading_zero_coefficients_ignored"] == 2
assert zeros.value["exact_zero_roots"] == 2

constant = polynomial_roots([7])
assert constant.success and constant.roots == ()
zero_polynomial = polynomial_roots([0, 0, 0])
assert not zero_polynomial.success and zero_polynomial.status == "invalid_problem"

# Cancellation and hard evaluation budgets return the stable shared statuses.
cancelled = polynomial_roots([1, 0, 0, 0, 0, -1], cancel=lambda: True)
assert not cancelled.success and cancelled.status == "cancelled"
tiny_budget = ResourceBudget(
    max_iterations=100,
    max_evaluations=1,
    max_elapsed_ms=30_000,
    max_trace_events=32,
    max_trace_bytes=100_000,
)
exhausted = polynomial_roots([1, 0, 0, 0, -1], resource_budget=tiny_budget)
assert not exhausted.success and exhausted.status == "maximum_evaluations"
elapsed_budget = ResourceBudget(
    max_iterations=1000,
    max_evaluations=100000,
    max_elapsed_ms=1,
    max_trace_events=32,
    max_trace_bytes=100_000,
)
timed_out = polynomial_roots(
    [1] + [0] * 63 + [-1], resource_budget=elapsed_budget
)
assert not timed_out.success and timed_out.status == "maximum_elapsed_time"

# Malformed and out-of-envelope inputs fail before numerical work.
for malformed in ([1, float("nan"), 2], [1, float("inf")], [complex(1, float("inf")), 1]):
    try:
        polynomial_roots_problem(malformed)
        raise AssertionError("nonfinite polynomial coefficient was accepted")
    except ValueError:
        pass
try:
    polynomial_roots_problem([1] + [0] * 65 + [1])
    raise AssertionError("degree above the portable envelope was accepted")
except ValueError:
    pass

print(json.dumps({
    "ordinary": ordinary.to_dict(),
    "repeated": repeated.to_dict(),
    "complex": complex_result.to_dict(),
}, sort_keys=True))
`;

test("polynomial-root corpus passes in CPython", () => {
  const result = JSON.parse(runCPython(witness));
  assert.equal(result.ordinary.success, true);
  assert.equal(result.repeated.value.multiplicity_certified, false);
});

test("polynomial-root corpus passes through Sage.js Python mode", () => {
  const result = JSON.parse(runSagejs(witness));
  assert.equal(result.ordinary.success, true);
  assert.equal(result.complex.value.roots.length, 3);
});
