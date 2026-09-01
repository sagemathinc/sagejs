#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "../../..");

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-optimization-"));
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

const successWitness = String.raw`
import json
import math
from sagejs.numerics.optimization import (
    MAX_FIT_OBSERVATIONS,
    MAX_RESIDUAL_DIMENSION,
    OptimizationResult,
    capabilities,
    curve_fit,
    least_squares,
    least_squares_problem,
    linear_fit,
    minimize,
    minimize_problem,
    minimize_scalar,
    plan,
    supports,
    solve_nonlinear_system,
)
from sagejs.numerics.model import NumericalValidation
from sagejs.numerics.trace import NumericalTrace
from sagejs.numerics.optimization.visualization import _decimate_records
from sagejs.plotting import lower_plot_spec

calls = [0]
def counted(point):
    calls[0] += 1
    return (point[0] - 1.0)**2 + 2.0*(point[1] + 2.0)**2

problem = minimize_problem(counted, [4.0, -5.0], method="nelder-mead")
selected = plan(problem)
assert selected.method == "nelder-mead" and calls[0] == 0
records = capabilities()
assert records["schema_version"] == 1
assert "cobyla" in records["explicitly_unsupported"]["nonlinear_constraints"]["methods"]
assert records["qualification"]["platforms"] == ["linux-x64"]
assert not records["qualification"]["browser"]
assert not records["qualification"]["sea"]
assert not records["qualification"]["four_platform_release"]
for operation in (
    "scalar_minimum", "minimize", "nonlinear_system",
    "nonlinear_least_squares", "curve_fit", "linear_fit",
):
    for method_record in records["operations"][operation]["methods"].values():
        assert method_record["views"]["explanation"]["structured"] == "optimization-explanation/v1"
        assert not method_record["views"]["explanation"]["callback_replay"]
        assert method_record["views"]["static"]["kind"] == "plot-spec"
        assert method_record["views"]["animation"]["kind"] == "plot-animation"
        assert not method_record["views"]["static"]["callback_replay"]
        assert not method_record["views"]["animation"]["callback_replay"]
records["operations"]["minimize"]["methods"]["bfgs"]["views"]["animation"]["controls"].append("mutation")
assert "mutation" not in capabilities()["operations"]["minimize"]["methods"]["bfgs"]["views"]["animation"]["controls"]

scalar_calls = [0]
def counted_scalar(x):
    scalar_calls[0] += 1
    return (x - 2.0)**2

interior = minimize_scalar(counted_scalar, -1.0, 5.0)
assert interior.success and abs(interior.value - 2.0) < 1.0e-8
assert interior.method == "bounded-brent"
assert interior.validation.passed and interior.verify().passed
ordinary_provenance = interior.to_dict()["provenance"]
assert ordinary_provenance["implementation_kind"] == "ordinary_python"
assert ordinary_provenance["execution_binding_status"] == "source_transparent"

external_problem = least_squares_problem(
    lambda point: [point[0] - 1.0],
    [0.0],
    method="cminpack-lmdif",
)
external_plan = plan(external_problem)
unexecuted_external = OptimizationResult(
    external_problem,
    external_plan,
    success=False,
    status="backend_failure",
    value=None,
    validation=NumericalValidation("indeterminate", False),
    diagnostics=[],
    iterations=0,
    evaluations=0,
    elapsed_ms=0.0,
    trace=NumericalTrace(external_problem.trace_policy),
    measurements={},
    domain_payload={"stop_reason": "backend_unavailable"},
).to_dict()
assert "implementation_kind" not in unexecuted_external["provenance"]
assert unexecuted_external["provenance"]["execution_binding_status"] == "external_execution_unobserved"
calls_after_solve_and_verify = scalar_calls[0]
assert interior.explanation()["outcome"]["success"]
assert "bounded-brent" in interior.explain()
assert scalar_calls[0] == calls_after_solve_and_verify
interior_plot = interior.plot()
assert scalar_calls[0] == calls_after_solve_and_verify
assert len(interior_plot.layers) == 5
assert "objective callback was not replayed" in interior_plot.alt_text()
assert "PLOT_ALT_TEXT_MISSING" not in {item.code for item in interior_plot.validate()}
assert lower_plot_spec(interior_plot)["layout"]["xaxis"]["title"]["text"] == "x"
assert interior.to_plot_spec().provenance["metadata"]["callback_replayed"] is False
assert scalar_calls[0] == calls_after_solve_and_verify
interior_animation = interior.animate().to_dict()
assert scalar_calls[0] == calls_after_solve_and_verify
assert not interior_animation["metadata"]["callback_replayed"]
assert len(interior_animation["frames"]) >= 2
assert interior_animation["controls"]["play"] and interior_animation["controls"]["pause"]
assert interior_animation["controls"]["slider_prefix"] == "Iteration: "
assert interior_animation["metadata"]["static_fallback"]["kind"] == "plot-spec"
assert interior_animation["limits"]["max_frames"] == 128
first_alt = interior_animation["frames"][0]["state"]["value"]["annotations"][0]["text"]
assert "Returned x=" not in first_alt
first_axes = interior_animation["frames"][0]["state"]["value"]["axes_or_scene"]
last_axes = interior_animation["frames"][-1]["state"]["value"]["axes_or_scene"]
assert first_axes == last_axes
assert not first_axes["xaxis"]["autorange"] and not first_axes["yaxis"]["autorange"]
first_interval_reference = interior_animation["frames"][0]["state"]["value"]["layers"][1]["data"]
last_interval_reference = interior_animation["frames"][-1]["state"]["value"]["layers"][1]["data"]
assert first_interval_reference == last_interval_reference
decimated = _decimate_records([{"ordinal": index} for index in range(1000)], 127)
assert len(decimated) == 127 and decimated[0]["ordinal"] == 0
assert decimated[-1]["ordinal"] == 999
first_path = interior_animation["frames"][0]["state"]["value"]["layers"][3]["data"]["x"]
last_path = interior_animation["frames"][-1]["state"]["value"]["layers"][3]["data"]["x"]
assert len(first_path) < len(last_path)
assert abs(first_path[0] - interior.value) > 1.0e-2
assert any(event.kind == "phase" for event in interior.trace.events)

boundary = minimize_scalar(lambda x: x, 0.0, 3.0)
assert boundary.success and boundary.value == 0.0

bfgs = minimize(
    counted,
    [4.0, -5.0],
    gradient=lambda point: [2.0*(point[0]-1.0), 4.0*(point[1]+2.0)],
    method="bfgs",
)
assert bfgs.success and abs(bfgs.value[0] - 1.0) < 1.0e-7
assert abs(bfgs.value[1] + 2.0) < 1.0e-7
assert bfgs.residual is not None and bfgs.residual < 1.0e-6
assert len(bfgs.to_plot_spec().layers) == 3
assert "projected_gradient_kkt" in bfgs.explain()
structured_bfgs = bfgs.explanation()
assert structured_bfgs["schema_version"] == 1
assert structured_bfgs["outcome"]["validation_passed"]
assert structured_bfgs["constraints"]["kind"] == "none"

simplex = minimize(
    lambda point: (1.0-point[0])**2 + 100.0*(point[1]-point[0]*point[0])**2,
    [-1.2, 1.0],
    method="nelder-mead",
    maxiter=2000,
)
assert simplex.success and abs(simplex.value[0] - 1.0) < 2.0e-5
simplex_roles = [layer.source_intent["role"] for layer in simplex.plot().layers]
assert simplex_roles[-1] == "simplex"

bounded = minimize(
    lambda point: (point[0]-3.0)**2 + (point[1]+1.0)**2,
    [0.0, 0.0],
    gradient=lambda point: [2.0*(point[0]-3.0), 2.0*(point[1]+1.0)],
    bounds=[(None, 1.0), (0.0, 2.0)],
    method="projected-bfgs",
)
assert bounded.success and bounded.value == [1.0, 0.0]
assert bounded.residual == 0.0
bounded_plot = bounded.plot()
bounded_roles = [layer.source_intent["role"] for layer in bounded_plot.layers]
assert "finite_box_bounds" in bounded_roles and "active_bound_iterate" in bounded_roles
assert lower_plot_spec(bounded_plot)["layout"]["yaxis"]["scaleanchor"] == "x"
bounded_explanation = bounded.explanation()
assert bounded_explanation["constraints"]["kind"] == "box_bounds"
assert len(bounded_explanation["constraints"]["active"]) == 2

system = solve_nonlinear_system(
    lambda point: [point[0]*point[0] + point[1]*point[1] - 1.0, point[0] - point[1]],
    [0.8, 0.6],
)
assert system.success and abs(system.value[0] - 2.0**-0.5) < 1.0e-9
assert system.residual is not None and system.residual < 1.0e-9
assert [layer.source_intent["role"] for layer in system.plot().layers] == [
    "parameter_path", "retained_iterates", "returned_point",
]

least = least_squares(
    lambda point: [point[0] - 1.0, 2.0*(point[1] + 2.0)],
    [0.0, 0.0],
)
assert least.success and abs(least.value[0] - 1.0) < 1.0e-8
assert least.domain_payload["parameter_diagnostics"]["covariance_available"]
assert least.explanation()["identifiability"]["state"] == "locally_identifiable"

rank_deficient = least_squares(
    lambda point: [point[0] + point[1] - 2.0, 2.0*(point[0]+point[1]-2.0)],
    [0.0, 0.0],
)
assert rank_deficient.success
assert rank_deficient.domain_payload["parameter_diagnostics"]["rank_deficient_or_ill_conditioned"]
assert rank_deficient.explanation()["identifiability"]["state"] == "rank_deficient_or_ill_conditioned"
assert "ill-conditioned" in rank_deficient.plot().alt_text()

linear = linear_fit([0.0, 1.0, 2.0, 3.0], [1.0, 3.0, 5.0, 7.0])
assert linear.success and linear.value == [2.0, 1.0]
assert len(linear.plot().layers) == 3
assert "PLOT_ALT_TEXT_MISSING" not in {item.code for item in linear.plot().validate()}
assert linear.explanation()["identifiability"]["state"] == "locally_identifiable"
assert linear.animate().to_dict()["metadata"]["fixed_axes"]

fit = curve_fit(
    lambda x, p: p[0]*math.exp(-p[1]*x),
    [0.0, 1.0, 2.0, 3.0],
    [2.0, 1.213061319, 0.735758882, 0.44626032],
    [1.5, 0.4],
)
assert fit.success and abs(fit.value[0] - 2.0) < 1.0e-7
assert abs(fit.value[1] - 0.5) < 1.0e-7
assert len(fit.plot().layers) == 3
assert lower_plot_spec(fit.plot())["layout"]["yaxis"]["title"]["text"] == "observed / fitted value"
fit_animation = fit.animate().to_dict()
first_fit = fit_animation["frames"][0]["state"]["value"]["layers"][1]["data"]["y"]
last_fit = fit_animation["frames"][-1]["state"]["value"]["layers"][1]["data"]["y"]
assert first_fit != last_fit
assert json.loads(fit.to_json())["method"] == "damped-gauss-newton"

bounded_problem = minimize_problem(
    lambda point: point[0]*point[0],
    [1.0],
    bounds=[(0.0, 2.0)],
)
assert not supports(bounded_problem, "bfgs")
try:
    plan(bounded_problem, "bfgs")
    raise AssertionError("method overrides must respect constraint envelopes")
except ValueError:
    pass

large_problem = minimize_problem(lambda point: sum(value*value for value in point), [0.0]*65)
large_plan = plan(large_problem)
assert large_plan.method == "bfgs" and supports(large_problem)

try:
    minimize(lambda point: point[0]*point[0], [1.0], constraints=[lambda point: point[0]])
    raise AssertionError("callable-only constraints must fail as malformed records")
except TypeError as error:
    assert "must be a mapping" in str(error)
    pass

print("optimization success laboratory passed")
`;

const failureWitness = String.raw`
import json
from sagejs.numerics.optimization import (
    MAX_FIT_OBSERVATIONS,
    MAX_RESIDUAL_DIMENSION,
    curve_fit,
    least_squares,
    linear_fit,
    minimize,
    minimize_scalar,
    solve_nonlinear_system,
)
from sagejs.plotting import lower_plot_spec

callback_error = minimize_scalar(lambda x: 1.0/0.0, -1.0, 1.0)
assert not callback_error.success and callback_error.status == "callback_error"

nonfinite = minimize_scalar(lambda x: float("inf"), -1.0, 1.0)
assert not nonfinite.success and nonfinite.status == "nonfinite_evaluation"

cancelled = minimize_scalar(lambda x: x*x, -1.0, 1.0, cancel=lambda: True)
assert not cancelled.success and cancelled.status == "cancelled"
assert cancelled.domain_payload["stop_reason"] == "explicit_cancellation"

budget = minimize_scalar(lambda x: x*x, -1.0, 1.0, max_evaluations=1)
assert not budget.success and budget.status == "maximum_evaluations"

false_gradient = minimize(
    lambda point: (point[0]-2.0)**2,
    [0.0],
    gradient=lambda point: [0.0],
    method="bfgs",
)
assert false_gradient.status == "converged" and not false_gradient.success
assert not false_gradient.validation.passed
assert "validation_failed" in {item.code for item in false_gradient.diagnostics}

shallow_false_gradient = minimize(
    lambda point: 1.0e-4*point[0],
    [0.0],
    gradient=lambda point: [0.0],
    method="bfgs",
)
assert shallow_false_gradient.status == "converged"
assert not shallow_false_gradient.success
assert shallow_false_gradient.validation.residual > 5.0e-5

stationary_maximum = least_squares(
    lambda point: [point[0]*point[0] - 1.0],
    [0.0],
)
assert stationary_maximum.status == "converged"
assert not stationary_maximum.success
second_order = [
    check for check in stationary_maximum.validation.to_dict()["checks"]
    if check["kind"] == "coordinate_second_order_minimum"
][0]
assert not second_order["passed"] and second_order["minimum_sampled_curvature"] < 0.0
stationary_explanation = stationary_maximum.explanation()
assert stationary_explanation["outcome"]["solver_status"] == "converged"
assert not stationary_explanation["outcome"]["validation_passed"]
assert "not supported by independent validation" in stationary_maximum.plot().alt_text()

tiny = minimize_scalar(
    lambda x: (x - 5.0e-13)**2,
    0.0,
    1.0e-12,
    xtol=1.0e-15,
    rtol=0.0,
)
assert tiny.success and abs(tiny.value - 5.0e-13) <= 1.0e-15

bad_scalar = minimize_scalar(lambda x: "not-a-number", 0.0, 1.0)
assert bad_scalar.status == "invalid_problem" and not bad_scalar.success
bad_scalar_plot = bad_scalar.plot()
assert "stopped: invalid problem" in bad_scalar_plot.alt_text()
assert len(lower_plot_spec(bad_scalar_plot)["data"]) == 5
assert "PLOT_ALT_TEXT_MISSING" not in {item.code for item in bad_scalar_plot.validate()}

bad_vector = minimize(lambda point: "not-a-vector", [0.0], method="nelder-mead")
assert bad_vector.status == "invalid_problem" and not bad_vector.success

bad_gradient = minimize(
    lambda point: point[0]*point[0],
    [1.0],
    gradient=lambda point: ["not-a-number"],
    method="bfgs",
)
assert bad_gradient.status == "invalid_problem" and not bad_gradient.success

bad_residual = least_squares(lambda point: "not-a-vector", [0.0])
assert bad_residual.status == "invalid_problem" and not bad_residual.success

bad_jacobian = least_squares(
    lambda point: [point[0] - 1.0],
    [0.0],
    jacobian=lambda point: [["not-a-number"]],
)
assert bad_jacobian.status == "invalid_problem" and not bad_jacobian.success

oversized_residual = least_squares(
    lambda point: [0.0]*(MAX_RESIDUAL_DIMENSION + 1),
    [0.0],
)
assert oversized_residual.status == "invalid_problem"

try:
    linear_fit(
        list(range(MAX_FIT_OBSERVATIONS + 1)),
        [0.0]*(MAX_FIT_OBSERVATIONS + 1),
    )
    raise AssertionError("fit input ceilings must fail before solving")
except ValueError:
    pass

class ValidationFailure:
    def __init__(self):
        self.calls = 0

    def __call__(self, point):
        self.calls += 1
        if self.calls > 1:
            raise LookupError("validation-only failure")
        return (point[0] - 1.0)**2

validation_callback = minimize(
    ValidationFailure(),
    [1.0],
    gradient=lambda point: [0.0],
    method="bfgs",
)
assert validation_callback.status == "callback_error"
assert not validation_callback.success
callback_items = [
    item.to_dict() for item in validation_callback.diagnostics
    if item.code == "callback_error"
]
assert len(callback_items) == 1
assert callback_items[0]["details"]["phase"] == "validation"

validation_budget = minimize(
    lambda point: (point[0] - 1.0)**2,
    [1.0],
    gradient=lambda point: [0.0],
    method="bfgs",
    max_evaluations=2,
)
assert validation_budget.status == "maximum_evaluations"
assert not validation_budget.success

ill_conditioned = least_squares(
    lambda point: [
        point[0] + point[1] - 1.0,
        point[0] + (1.0 + 1.0e-6)*point[1] - 1.0,
    ],
    [0.0, 0.0],
)
assert ill_conditioned.success
condition = ill_conditioned.domain_payload["parameter_diagnostics"]
assert condition["covariance_available"]
assert condition["rank_deficient_or_ill_conditioned"]
assert condition["normal_matrix_condition_estimate"] > 1.0e12
assert ill_conditioned.explanation()["identifiability"]["state"] == "rank_deficient_or_ill_conditioned"

large_scale = least_squares(
    lambda point: [1.0e200*(point[0] - 1.0)],
    [0.0],
)
assert large_scale.success and abs(large_scale.value[0] - 1.0) < 1.0e-8
assert large_scale.objective is None
assert large_scale.domain_payload["residual_norm"] > 1.0e180
large_record = json.loads(large_scale.to_json())
assert large_record["domain_payload"]["objective"] is None
assert large_record["domain_payload"]["cost"] is None
large_explanation = large_scale.explanation()
assert large_explanation["scale_evidence"]["squared_cost_outside_binary64"]
assert json.loads(large_scale.plot().to_json())["provenance"]["metadata"]["success"]

small_scale = least_squares(
    lambda point: [1.0e-200*(point[0] - 1.0)],
    [0.0],
)
assert small_scale.success and abs(small_scale.value[0] - 1.0) < 1.0e-8
assert small_scale.objective is None
assert small_scale.domain_payload["residual_norm"] > 0.0

unresolved_least_squares_scale = least_squares(
    lambda point: [point[0]/1.0e200 - 1.0],
    [0.0],
)
assert unresolved_least_squares_scale.status == "converged"
assert not unresolved_least_squares_scale.success
assert unresolved_least_squares_scale.validation.truth_level == "indeterminate"
least_squares_resolution_check = [
    check for check in unresolved_least_squares_scale.validation.to_dict()["checks"]
    if check["kind"] == "objective_probe_resolution"
][0]
assert not least_squares_resolution_check["passed"]
unresolved_least_squares_explanation = unresolved_least_squares_scale.explanation()
assert not unresolved_least_squares_explanation["outcome"]["validation_passed"]
assert any(
    check["kind"] == "objective_probe_resolution"
    for check in unresolved_least_squares_explanation["failure"]["failed_checks"]
)

unresolved_scale = minimize(
    lambda point: (point[0]/1.0e200 - 1.0)**2,
    [0.0],
    gradient=lambda point: [2.0*(point[0]/1.0e200 - 1.0)/1.0e200],
    method="bfgs",
)
assert unresolved_scale.status == "converged"
assert not unresolved_scale.success
assert unresolved_scale.validation.truth_level == "indeterminate"
resolution_check = [
    check for check in unresolved_scale.validation.to_dict()["checks"]
    if check["kind"] == "objective_probe_resolution"
][0]
assert not resolution_check["passed"]
assert "independent validation did not support" in unresolved_scale.explanation()["failure"]["narrative"]
assert "not supported by independent validation" in unresolved_scale.plot().alt_text()

no_trace_calls = [0]
def counted_no_trace(x):
    no_trace_calls[0] += 1
    return x*x

no_trace = minimize_scalar(counted_no_trace, -1.0, 1.0, trace="none")
no_trace_calls_after_solve = no_trace_calls[0]
no_trace_plot = no_trace.plot()
assert no_trace_calls[0] == no_trace_calls_after_solve
assert "1 retained finite objective state" in no_trace_plot.alt_text()
try:
    no_trace.animate()
    raise AssertionError("animations must not fabricate unretained iterations")
except ValueError:
    pass
assert no_trace_calls[0] == no_trace_calls_after_solve

truncated = minimize(
    lambda point: (1.0-point[0])**2 + 100.0*(point[1]-point[0]*point[0])**2,
    [-1.2, 1.0],
    method="nelder-mead",
    maxiter=2000,
    trace="iterations",
    max_trace_events=4,
)
assert truncated.trace.truncated and len(truncated.trace.events) <= 4

print("optimization failure laboratory passed")
`;

const visualizationWitness = String.raw`
import json
import math
from sagejs.numerics.optimization import (
    curve_fit,
    least_squares,
    minimize,
    minimize_scalar,
    solve_nonlinear_system,
)
from sagejs.plotting import lower_plot_spec

def summarize(result):
    spec = result.plot()
    lowered = lower_plot_spec(spec)
    explanation = result.explanation()
    animation = result.animate().to_dict()
    frame_axes = [frame["state"]["value"]["axes_or_scene"] for frame in animation["frames"]]
    failed_checks = explanation["failure"]["failed_checks"]
    return {
        "operation": result.problem.operation,
        "method": result.method,
        "success": result.success,
        "status": result.status,
        "truth_level": result.validation.truth_level,
        "layer_roles": [layer.source_intent["role"] for layer in spec.layers],
        "layer_kinds": [layer.kind for layer in spec.layers],
        "alt_text": spec.alt_text(),
        "plot_diagnostics": [item.code for item in spec.validate()],
        "lowered_trace_count": len(lowered["data"]),
        "x_axis": lowered["layout"]["xaxis"]["title"]["text"],
        "y_axis": lowered["layout"]["yaxis"]["title"]["text"],
        "constraint_kind": explanation["constraints"]["kind"],
        "active_constraint_count": len(explanation["constraints"]["active"]),
        "identifiability": explanation["identifiability"]["state"],
        "squared_cost_outside_binary64": explanation["scale_evidence"]["squared_cost_outside_binary64"],
        "failed_checks": [check["kind"] for check in failed_checks],
        "animation_frames": len(animation["frames"]),
        "animation_topology": animation["topology"],
        "animation_controls": animation["controls"],
        "animation_limit": animation["limits"]["max_frames"],
        "animation_axes_stable": all(axes == frame_axes[0] for axes in frame_axes),
        "animation_fixed_axes": animation["metadata"]["fixed_axes"],
        "static_fallback_kind": animation["metadata"]["static_fallback"]["kind"],
    }

scalar = minimize_scalar(lambda x: (x-2.0)**2, -1.0, 5.0)
bounded = minimize(
    lambda point: (point[0]-3.0)**2 + (point[1]+1.0)**2,
    [0.0, 0.0],
    gradient=lambda point: [2.0*(point[0]-3.0), 2.0*(point[1]+1.0)],
    bounds=[(None, 1.0), (0.0, 2.0)],
    method="projected-bfgs",
)
system = solve_nonlinear_system(
    lambda point: [point[0]*point[0] + point[1]*point[1] - 1.0, point[0]-point[1]],
    [0.8, 0.6],
)
rank_deficient = least_squares(
    lambda point: [point[0]+point[1]-2.0, 2.0*(point[0]+point[1]-2.0)],
    [0.0, 0.0],
)
fit = curve_fit(
    lambda x, point: point[0]*math.exp(-point[1]*x),
    [0.0, 1.0, 2.0, 3.0],
    [2.0, 1.213061319, 0.735758882, 0.44626032],
    [1.5, 0.4],
)
stationary_maximum = least_squares(
    lambda point: [point[0]*point[0]-1.0],
    [0.0],
)
large_scale = least_squares(
    lambda point: [1.0e200*(point[0]-1.0)],
    [0.0],
)

print(json.dumps({
    "schema_version": 1,
    "cases": {
        "bounded_minimum": summarize(bounded),
        "curve_fit": summarize(fit),
        "large_scale_least_squares": summarize(large_scale),
        "nonlinear_system": summarize(system),
        "rank_deficient_least_squares": summarize(rank_deficient),
        "scalar_minimum": summarize(scalar),
        "stationary_maximum_failure": summarize(stationary_maximum),
    },
}, sort_keys=True, separators=(",", ":")))
`;

const visualizationFixture = JSON.parse(readFileSync(join(
  root,
  "docs/numerical-computing/optimization/visualization-fixtures.json",
), "utf8"));

test("optimization success corpus agrees in CPython", () => {
  assert.equal(runCPython(successWitness), "optimization success laboratory passed");
});

test("optimization success corpus runs in Sage.js", () => {
  assert.equal(runSagejs(successWitness), "optimization success laboratory passed");
});

test("optimization failure and budget corpus agrees in CPython", () => {
  assert.equal(runCPython(failureWitness), "optimization failure laboratory passed");
});

test("optimization failure and budget corpus runs in Sage.js", () => {
  assert.equal(runSagejs(failureWitness), "optimization failure laboratory passed");
});

test("optimization explanation and visualization fixtures agree in CPython", () => {
  assert.deepEqual(JSON.parse(runCPython(visualizationWitness)), visualizationFixture);
});

test("optimization explanation and visualization fixtures run in Sage.js", () => {
  assert.deepEqual(JSON.parse(runSagejs(visualizationWitness)), visualizationFixture);
});
