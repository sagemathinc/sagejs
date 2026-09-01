#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "../..");

function evaluate(source) {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin/sagejs-source.cjs"), "--python", "-"],
    {
      cwd: root,
      input: source,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("public NLopt Nelder-Mead has an exact identity and heuristic conclusion", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import capabilities, minimize

methods = capabilities("minimize")["operations"]["minimize"]["methods"]
assert "nlopt-cobyla" not in methods
record = methods["nlopt-nelder-mead"]
assert record["max_dimension"] == 32
assert record["truth_level"] == "heuristic"
assert record["optimality"] == "local_and_global_not_certified"
assert record["validation_envelope"]["sampled_feasible_decrease"] == "any_representably_lower_sample_vetoes_heuristic_success"

result = minimize(
    lambda point: (point[0] - 2.0)**2 + (point[1] + 1.0)**2,
    [5.0, 5.0],
    bounds=[[-10.0, 10.0], [-10.0, 10.0]],
    method="nlopt-nelder-mead",
)
assert result.method == "nlopt-nelder-mead"
assert result.backend == "nlopt-mit-wasm"
assert result.success and result.validation.passed
assert result.validation.truth_level == "heuristic"
assert max(abs(result.value[0] - 2.0), abs(result.value[1] + 1.0)) < 1.0e-6
assert result.domain_payload["method_identity"] == "nlopt-nelder-mead"
assert result.domain_payload["optimality_claim"] == "heuristic_only"
assert result.domain_payload["local_optimum_certified"] is False
assert result.domain_payload["global_optimum_certified"] is False
limitation = next(
    check for check in result.validation.to_dict()["checks"]
    if check["kind"] == "optimality_limitation"
)
assert limitation["local_optimum_certified"] is False
assert limitation["global_optimum_certified"] is False
provenance = result.to_dict()["provenance"]
assert provenance["implementation_kind"] == "external_library_wasm"
assert not provenance["source_transparent"]

zero_scale = minimize(
    lambda point: point[0]**2,
    [1.0],
    method="nlopt-nelder-mead",
)
assert zero_scale.success and zero_scale.validation.passed
assert zero_scale.validation.truth_level == "heuristic"
assert zero_scale.evaluations < 1000
assert abs(zero_scale.value[0]) < 1.0e-7

automatic = minimize(lambda point: (point[0] - 2.0)**2, [0.0])
assert automatic.method == "nelder-mead"
assert automatic.backend == "ordinary-python"
assert automatic.to_dict()["provenance"]["source_transparent"]
print("public NLopt heuristic identity passed")
`), "public NLopt heuristic identity passed");
});

test("representably lower independent probes veto heuristic success", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import minimize

shifted_bound = minimize(
    lambda point: 1.0e6 + point[0],
    [1.0e-9],
    bounds=[[0.0, 1.0]],
    method="nlopt-nelder-mead",
    initial_step=1.0e-12,
    xtol=1.0e-3,
    max_evaluations=10000,
)
assert shifted_bound.status == "converged"
assert not shifted_bound.success and not shifted_bound.validation.passed
probe = next(
    check for check in shifted_bound.validation.to_dict()["checks"]
    if check["kind"] == "bounded_feasible_objective_probes"
)
assert probe["maximum_sampled_decrease"] > 0.0
assert probe["decrease_threshold"] == 0.0

anisotropic = minimize(
    lambda point: point[0] + 1.0e16*point[1]**2,
    [1.0e-9, 0.0],
    bounds=[[0.0, 1.0], [-1.0, 1.0]],
    method="nlopt-nelder-mead",
    initial_step=[1.0e-12, 1.0e-12],
    xtol=1.0e-3,
    max_evaluations=10000,
)
assert not anisotropic.success and not anisotropic.validation.passed
anisotropic_probe = next(
    check for check in anisotropic.validation.to_dict()["checks"]
    if check["kind"] == "bounded_feasible_objective_probes"
)
assert anisotropic_probe["maximum_sampled_decrease"] > 0.0
print("public NLopt contradiction probes passed")
`), "public NLopt contradiction probes passed");
});

test("opaque black-box optimality is never certified", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import minimize

# Every finite deterministic poll set can miss a sufficiently narrow smooth
# decrease. A positive result is therefore heuristic, not a proof.
a = 1.0e-12
def narrow_maximum(point):
    x2 = point[0]**2
    return x2*(x2-a*a)/(x2+a*a)

result = minimize(
    narrow_maximum,
    [0.0],
    method="nlopt-nelder-mead",
    initial_step=1.0e-4,
    xtol=1.0e-3,
)
assert result.status == "converged"
assert result.success and result.validation.passed
assert result.validation.truth_level == "heuristic"
assert narrow_maximum([a/2.0]) < narrow_maximum([0.0])
limitation = next(
    check for check in result.validation.to_dict()["checks"]
    if check["kind"] == "optimality_limitation"
)
assert limitation["conclusion"] == "heuristic_only"
assert not limitation["local_optimum_certified"]
print("public NLopt optimality limitation passed")
`), "public NLopt optimality limitation passed");
});

test("finite high-scale objectives fail closed without nonfinite diagnostics", () => {
  assert.equal(evaluate(String.raw`
import json
from sagejs.numerics.optimization import minimize

for function in (
    lambda point: 1.0e308*(point[0]**2 + point[1]**2),
    lambda point: 8.0e307*point[0]**2 + point[1]**2,
):
    result = minimize(
        function,
        [0.0, 0.0],
        method="nlopt-nelder-mead",
        initial_step=1.0e-6,
        max_evaluations=10000,
    )
    assert result.validation.truth_level in ("heuristic", "indeterminate")
    if result.validation.passed:
        assert result.validation.truth_level == "heuristic"
        assert result.domain_payload["local_optimum_certified"] is False
    json.dumps(result.to_dict(), allow_nan=False)
print("public NLopt high-scale failure passed")
`), "public NLopt high-scale failure passed");
});

test("COBYLA and nonlinear constraints are explicitly deferred", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import capabilities, minimize

unsupported = capabilities("minimize")["explicitly_unsupported"]
assert "nlopt-cobyla" in unsupported["nonlinear_constraints"]["methods"]
assert "pointer-provenance undefined behavior" in unsupported["nonlinear_constraints"]["reason"]

try:
    minimize(lambda point: point[0]**2, [1.0], method="nlopt-cobyla")
except ValueError as error:
    assert "unsupported" in str(error)
else:
    raise AssertionError("deferred NLopt COBYLA remained public")

try:
    minimize(
        lambda point: point[0]**2,
        [1.0],
        constraints=[{"type": "ineq", "fun": lambda point: point[0]}],
    )
except NotImplementedError as error:
    assert "sanitizer-clean" in str(error)
else:
    raise AssertionError("nonlinear constraints entered an unqualified backend")
print("public COBYLA deferral passed")
`), "public COBYLA deferral passed");
});

test("NLopt failures are attributed honestly and leave the backend reusable", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import minimize

def broken(_point):
    raise RuntimeError("private callback detail")

callback = minimize(broken, [1.0], method="nlopt-nelder-mead")
assert not callback.success and callback.status == "callback_error"
provenance = callback.to_dict()["provenance"]
assert provenance["implementation_kind"] == "external_library_wasm"
assert not provenance["source_transparent"]

checks = [0]
def cancel():
    checks[0] += 1
    return checks[0] >= 3

cancelled = minimize(
    lambda point: (point[0] - 2.0)**2,
    [20.0],
    method="nlopt-nelder-mead",
    cancel=cancel,
)
assert not cancelled.success and cancelled.status == "cancelled"
cancelled_provenance = cancelled.to_dict()["provenance"]
assert cancelled_provenance["implementation_kind"] == "external_library_wasm"

recovered = minimize(
    lambda point: (point[0] - 2.0)**2,
    [20.0],
    method="nlopt-nelder-mead",
)
assert recovered.success and recovered.validation.passed
assert recovered.validation.truth_level == "heuristic"
assert abs(recovered.value[0] - 2.0) < 1.0e-6
print("public NLopt failure contracts passed")
`), "public NLopt failure contracts passed");
});
