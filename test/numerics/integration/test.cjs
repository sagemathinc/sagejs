#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");
const corpusPath = join(__dirname, "corpus.json");

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-integration-"));
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
import time
from sagejs.numerics.integration import (
    integrate,
    integration_capabilities,
    integration_problem,
    plan_integration,
)

def endpoint(value):
    if value == "+infinity":
        return float("inf")
    if value == "-infinity":
        return float("-inf")
    return float(value)

def integrand(name):
    if name == "x4": return lambda x: x**4
    if name == "x2": return lambda x: x*x
    if name == "sin": return math.sin
    if name == "cusp_03": return lambda x: abs(x-0.3)
    if name == "cusp_012345": return lambda x: abs(x-0.12345)
    if name == "step_025": return lambda x: 0.0 if x < 0.25 else 1.0
    if name == "log": return math.log
    if name == "inverse_sqrt": return lambda x: 1.0/math.sqrt(x)
    if name == "beta_half": return lambda x: 1.0/math.sqrt(x*(1.0-x))
    if name == "exp_negative": return lambda x: math.exp(-x)
    if name == "exp_positive": return math.exp
    if name == "gaussian": return lambda x: math.exp(-x*x)
    if name == "cauchy": return lambda x: 1.0/(1.0+x*x)
    if name == "odd_gaussian": return lambda x: x*math.exp(-x*x)
    if name == "odd_divergent": return lambda x: x/(1.0+x*x)
    if name == "tiny_constant": return lambda x: 1e-308
    if name == "inverse_sqrt_shift_1e10": return lambda x: 1.0/math.sqrt(x-1e10)
    if name == "large_odd": return lambda x: 1e3*x
    if name == "raise_at_center":
        def raises(x):
            if x == 0.5: raise RuntimeError("intentional")
            return x
        return raises
    if name == "nonfinite_at_center":
        return lambda x: float("inf") if x == 0.5 else x
    raise AssertionError(name)

with open(${JSON.stringify(corpusPath)}, "r", encoding="utf-8") as handle:
    corpus = json.load(handle)
assert corpus["schema_version"] == 1 and corpus["dimension"] == 1
assert integration_capabilities()["capability"]["dimensions"] == [1]

planning_calls = [0]
def counted_for_plan(x):
    planning_calls[0] += 1
    return x*x
problem = integration_problem(counted_for_plan, 0.0, 1.0, expression="x*x")
selected_plan = plan_integration(problem)
assert selected_plan.method == "adaptive_gauss_kronrod"
assert planning_calls[0] == 0

for case in corpus["cases"]:
    options = dict(case.get("options", {}))
    result = integrate(
        integrand(case["integrand"]),
        endpoint(case["bounds"][0]),
        endpoint(case["bounds"][1]),
        **options,
    )
    if "expected_stop_reason" in case:
        assert not result.success, case["id"]
        assert result.stop_reason == case["expected_stop_reason"], (
            case["id"], result.stop_reason
        )
        continue
    assert result.success and result.stop_reason == "converged", (
        case["id"], result.stop_reason, result.explain()
    )
    assert abs(result.value-case["expected"]) <= case["absolute_acceptance"], case["id"]
    assert result.validation.passed
    assert result.error_estimate is not None
    assert result.trace.events[0].kind == "start"
    assert result.trace.events[-1].kind == "finish"
    result_plot = result.plot()
    assert len(result_plot.layers) == 3
    assert len(result_plot.validate()) == 0
    assert "local-error allocation" in result_plot.alt_text()
    expected_diagnostic = case.get("expected_diagnostic")
    if expected_diagnostic is not None:
        assert expected_diagnostic in {item.code for item in result.diagnostics}

calls = [0]
def counted(x):
    calls[0] += 1
    return math.cos(x)
plotted = integrate(counted, 0.0, math.pi/2.0)
before_plot = calls[0]
assert len(plotted.plot().layers) == 3
assert calls[0] == before_plot
assert "independent check" in plotted.explain()
serialized = json.loads(plotted.to_json())
assert serialized["domain_payload"]["integration_status"] == "converged"
assert serialized["measurements"]["validation_evaluations"] > 0
detached_intervals = list(plotted.final_intervals)
detached_intervals[0]["depth"] = 999
detached_intervals[0]["parameter_interval"][0] = 999.0
assert plotted.final_intervals[0]["depth"] != 999
assert plotted.final_intervals[0]["parameter_interval"][0] != 999.0

def must_not_run(x):
    raise RuntimeError("must not run")
zero = integrate(must_not_run, 2.0, 2.0)
assert zero.success and zero.value == 0.0 and zero.evaluations == 0
assert zero.validation.truth_level == "exact"

cancelled = integrate(lambda x: x, 0.0, 1.0, cancel=lambda: True)
assert not cancelled.success and cancelled.stop_reason == "cancelled"

partial = integrate(
    lambda x: x, 0.0, 1.0, breakpoints=[0.5], max_evaluations=30,
)
assert not partial.success and partial.stop_reason == "maximum_evaluations"
assert partial.value is None and len(partial.final_intervals) == 0

def fail_on_second_component(x):
    if x > 0.5:
        raise RuntimeError("intentional second-component failure")
    return x
partial_callback = integrate(
    fail_on_second_component, 0.0, 1.0, breakpoints=[0.5],
)
partial_callback_payload = partial_callback.to_dict()["domain_payload"]
assert not partial_callback.success and partial_callback.stop_reason == "callback_error"
assert partial_callback.value is None and len(partial_callback.final_intervals) == 0
assert partial_callback_payload["failure_details"]["phase"] == "integrand_callback"

validation_limited = integrate(
    lambda x: 1.0, 0.0, 1.0, max_evaluations=30,
)
validation_checks = validation_limited.validation.to_dict()["checks"]
assert not validation_limited.success
assert validation_limited.stop_reason == "maximum_evaluations"
assert validation_limited.to_dict()["domain_payload"]["solver_stop_reason"] == "converged"
assert validation_checks[0] == {"kind": "solver_converged", "passed": True}

validation_disagrees = integrate(
    lambda x: x**20, 0.0, 1.0,
    absolute_tolerance=1.2e-12, relative_tolerance=0.0,
)
assert not validation_disagrees.success
assert validation_disagrees.stop_reason == "validation_failed"
assert validation_disagrees.error_estimate > validation_disagrees.requested_tolerance

final_cancel_state = {"calls": 0, "cancelled": False}
def cancelled_on_final_validation(x):
    final_cancel_state["calls"] += 1
    if final_cancel_state["calls"] == 37:
        final_cancel_state["cancelled"] = True
    return 1.0
final_cancel = integrate(
    cancelled_on_final_validation, 0.0, 1.0,
    cancel=lambda: final_cancel_state["cancelled"],
)
assert not final_cancel.success and final_cancel.stop_reason == "cancelled"
assert final_cancel.to_dict()["domain_payload"]["solver_stop_reason"] == "converged"

def broken_cancel():
    raise RuntimeError("intentional cancellation callback failure")
cancel_error = integrate(lambda x: x, 0.0, 1.0, cancel=broken_cancel)
assert not cancel_error.success and cancel_error.stop_reason == "callback_error"
assert cancel_error.to_dict()["domain_payload"]["failure_details"]["phase"] == "cancellation_callback"

delayed_calls = [0]
def delayed_final_validation(x):
    delayed_calls[0] += 1
    if delayed_calls[0] == 37:
        time.sleep(0.15)
    return 1.0
elapsed = integrate(
    delayed_final_validation, 0.0, 1.0, max_elapsed_ms=100,
)
assert not elapsed.success and elapsed.stop_reason == "maximum_elapsed_time"
assert elapsed.status == "maximum_elapsed_time"
assert "maximum_elapsed_time" in {item.code for item in elapsed.diagnostics}
assert elapsed.to_dict()["domain_payload"]["solver_stop_reason"] == "converged"

scaled_endpoint = integrate(
    lambda x: 1e308, 0.0, 1e-308, endpoint_singularities="left",
)
assert scaled_endpoint.success
assert abs(scaled_endpoint.value-1.0) < 2e-14

def narrow_peak(x):
    return math.exp(-((x-0.1)/1e-4)**2)/1e-4
unmarked_peak = integrate(narrow_peak, 0.0, 1.0)
assert unmarked_peak.success and unmarked_peak.value == 0.0
assert unmarked_peak.validation.truth_level == "validated_approximate"
bracketed_peak = integrate(
    narrow_peak, 0.0, 1.0, breakpoints=[0.0995, 0.1, 0.1005],
)
assert bracketed_peak.success
assert abs(bracketed_peak.value-math.sqrt(math.pi)) < 1e-10

truncated = integrate(
    lambda x: abs(x-0.12345), 0.0, 1.0,
    absolute_tolerance=1e-13, relative_tolerance=1e-13,
    max_trace_events=4,
)
assert truncated.trace.truncated
assert len(truncated.trace.events) <= 4

try:
    integration_problem(lambda x: x, 0.0, 1.0, absolute_tolerance=0.0, relative_tolerance=0.0)
    raise AssertionError("zero tolerances accepted")
except ValueError:
    pass
try:
    integration_problem(lambda x: x, 0.0, float("inf"), breakpoints=[1.0])
    raise AssertionError("unsupported infinite breakpoint accepted")
except ValueError:
    pass

print("validated integration laboratory passed")
`;

test("analytic, pathological, and failure corpus agrees in CPython", () => {
  assert.equal(runCPython(witness), "validated integration laboratory passed");
});

test("the same integration corpus and evidence run in Sage.js", () => {
  assert.equal(runSagejs(witness), "validated integration laboratory passed");
});

test("the backend-neutral corpus is classified and finite", () => {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const classes = new Set(corpus.cases.map((value) => value.class));
  for (const required of ["analytic", "pathological", "singular", "infinite", "failure"]) {
    assert.ok(classes.has(required));
  }
  assert.ok(corpus.cases.length >= 18);
  assert.equal(new Set(corpus.cases.map((value) => value.id)).size, corpus.cases.length);
});
