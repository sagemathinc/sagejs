"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const PROTOCOL = "sagejs.numerical-qualification-adapter/v1";
const MARKER = "__SAGEJS_NUMERICAL_QUALIFICATION__";

let session = null;
let artifactRoot = null;
let cminpackBackend = null;
let initializedCapabilities = [];
let scipyPython = null;

function milliseconds(started) {
  return Number(process.hrtime.bigint() - started) / 1e6;
}

function pythonInput(input) {
  return `input_record = json.loads(${JSON.stringify(JSON.stringify(input))})`;
}

function findScipyPython() {
  const candidates = [];
  if (process.env.PYTHON) candidates.push({ executable: process.env.PYTHON, prefix: [] });
  candidates.push({ executable: "python3", prefix: [] });
  candidates.push({ executable: "python", prefix: [] });
  if (process.platform === "win32") candidates.push({ executable: "py", prefix: ["-3"] });
  for (const candidate of candidates) {
    const probe = spawnSync(candidate.executable, [
      ...candidate.prefix, "-I", "-c",
      "import numpy, scipy; print(scipy.__version__)",
    ], { encoding: "utf8", timeout: 30_000 });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function runScipySource(source, projection) {
  if (scipyPython === null) throw new Error("CPython with NumPy/SciPy is unavailable");
  const program = `${source}\nimport json\nprint(${JSON.stringify(MARKER)} + json.dumps(${projection}))`;
  const result = spawnSync(scipyPython.executable, [
    ...scipyPython.prefix, "-I", "-c", program,
  ], { encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`emitted SciPy program failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  const line = result.stdout.split(/\r?\n/)
    .findLast((candidate) => candidate.startsWith(MARKER));
  if (line === undefined) throw new Error("emitted SciPy program returned no qualification record");
  return JSON.parse(line.slice(MARKER.length));
}

function sourceFor(id, input) {
  const prefix = ["import json", "import math", pythonInput(input)].join("\n");
  const bodies = {
    "p0-result-contract": String.raw`
from sagejs.numerics import find_root
answer = find_root(lambda x: x*x - 2.0, 0.0, 2.0, method="brent")
record = answer.to_dict()
required = (
    "schema_version", "problem_digest", "success", "status", "value",
    "validation", "diagnostics", "method", "backend", "precision",
    "iterations", "evaluations", "elapsed_ms", "measurements", "trace",
    "provenance", "reproducibility", "domain_payload",
)
output_record = {
    "schema_version": record["schema_version"],
    "required_fields_present": all(name in record for name in required),
    "validation_passed": answer.validation.passed,
}`,
    "p1-root-cosine": String.raw`
from sagejs.numerics import find_root
answer = find_root(
    lambda x: math.cos(x) - x,
    input_record["lower"], input_record["upper"], method="brent",
)
output_record = {
    "value": answer.value,
    "status": answer.status,
    "validation_passed": answer.validation.passed,
    "evaluations": answer.evaluations,
}`,
    "p1-root-invalid-bracket": String.raw`
from sagejs.numerics import find_root
answer = find_root(
    lambda x: x*x + 1.0,
    input_record["lower"], input_record["upper"], method="brent",
)
output_record = {
    "status": answer.status,
    "success": answer.success,
    "evaluations": answer.evaluations,
}`,
    "p1-root-translation": String.raw`
from sagejs.numerics import find_root
roots = []
statuses = []
for shift in input_record["shifts"]:
    answer = find_root(
        lambda x, offset=shift: (x-offset)*(x-offset) - 2.0,
        shift, shift + 2.0, method="brent",
    )
    roots.append(answer.value)
    statuses.append(answer.status)
output_record = {"roots": roots, "statuses": statuses}`,
    "p2-interpolation-quadratic": String.raw`
from sagejs.numerics.approximation import interpolate
answer = interpolate(input_record["nodes"], input_record["values"])
output_record = {
    "value": answer.evaluate(input_record["point"]),
    "success": answer.success,
    "validation_passed": answer.validation.passed,
}`,
    "p2-polynomial-roots-known": String.raw`
from sagejs.numerics.approximation import polynomial_roots
answer = polynomial_roots(input_record["coefficients"], trace="iterations")
output_record = {
    "roots": [[root.real, root.imag] for root in answer.roots],
    "status": answer.status,
    "validation_passed": answer.validation.passed,
    "diagnostic_codes": [item.code for item in answer.diagnostics],
}`,
    "p2-polynomial-roots-clustered": String.raw`
from sagejs.numerics.approximation import polynomial_roots
answer = polynomial_roots(input_record["coefficients"], trace="iterations")
output_record = {
    "roots": [[root.real, root.imag] for root in answer.roots],
    "status": answer.status,
    "validation_passed": answer.validation.passed,
    "diagnostic_codes": [item.code for item in answer.diagnostics],
}`,
    "p2-quadrature-sine": String.raw`
from sagejs.numerics.integration import integrate
answer = integrate(math.sin, input_record["lower"], input_record["upper"])
output_record = {
    "value": answer.value,
    "status": answer.status,
    "validation_passed": answer.validation.passed,
    "evaluations": answer.evaluations,
}`,
    "p2-linear-solve": String.raw`
from sagejs.numerics.linear_algebra import solve
answer = solve(input_record["matrix"], input_record["rhs"])
output_record = {
    "value": answer.value,
    "status": answer.status,
    "validation_passed": answer.validation.passed,
}`,
    "p2-linear-scale-stress": String.raw`
from sagejs.numerics.linear_algebra import solve
scale = input_record["scale"]
answer = solve([[scale]], [scale], method="qr")
output_record = {
    "value": answer.value[0],
    "status": answer.status,
    "validation_passed": answer.validation.passed,
}`,
    "p2-linear-singular": String.raw`
from sagejs.numerics.linear_algebra import solve
answer = solve(input_record["matrix"], input_record["rhs"])
output_record = {"success": answer.success, "status": answer.status}`,
    "p3-scalar-minimum": String.raw`
from sagejs.numerics.optimization import minimize_scalar
answer = minimize_scalar(
    lambda x: (x-2.0)*(x-2.0),
    input_record["lower"], input_record["upper"],
)
output_record = {
    "value": answer.value,
    "status": answer.status,
    "validation_passed": answer.validation.passed,
    "evaluations": answer.evaluations,
}`,
    "p3-optimization-cancelled": String.raw`
from sagejs.numerics.optimization import minimize_scalar
cancel_checks = [0]
def cancelled():
    cancel_checks[0] += 1
    return True
answer = minimize_scalar(lambda x: x*x, -1.0, 1.0, cancel=cancelled)
output_record = {"status": answer.status, "cancel_checks": cancel_checks[0]}`,
    "p3-cminpack-optional-resource-fail-closed": String.raw`
import sagejs.runtime as runtime
from sagejs.numerics.optimization import least_squares

class UnavailableNumericalBackend:
    def __init__(self, kind):
        self.kind = kind
    def leastSquares(self, options):
        raise RuntimeError(self.kind + " private numerical-resource detail")

def residual(point):
    return [point[0] - 2.0]

backend_state = runtime._numerical_backends
had_backend = "cminpack" in backend_state
original_backend = backend_state["cminpack"] if had_backend else None
records = []
try:
    for kind in input_record["resource_failures"]:
        backend = UnavailableNumericalBackend(kind)
        backend_state["cminpack"] = backend
        automatic = least_squares(residual, [20.0], method="auto")
        explicit = least_squares(
            residual, [20.0], method="cminpack-lmdif"
        )
        serialized = json.dumps(explicit.to_dict(), sort_keys=True)
        records.append({
            "kind": kind,
            "automatic_success": automatic.success,
            "automatic_method": automatic.method,
            "automatic_backend": automatic.backend,
            "automatic_error": abs(automatic.value[0] - 2.0),
            "explicit_success": explicit.success,
            "explicit_status": explicit.status,
            "explicit_reason": explicit.domain_payload.get("stop_reason"),
            "private_detail_leaked": "private numerical-resource detail" in serialized,
        })
finally:
    if had_backend:
        backend_state["cminpack"] = original_backend
    else:
        del backend_state["cminpack"]
output_record = {"records": records}`,
    "p4-ode-exponential": String.raw`
from sagejs.numerics.ode import solve_ivp
answer = solve_ivp(
    lambda t, y: [y[0]],
    (input_record["t0"], input_record["t1"]),
    [input_record["y0"]],
    reference=lambda t: [math.exp(t)],
    reference_atol=1e-6,
    reference_rtol=1e-6,
)
output_record = {
    "value": answer.value[0],
    "status": answer.status,
    "validation_passed": answer.validation.passed,
    "evaluations": answer.evaluations,
}`,
    "p4-ode-stiff-decay": String.raw`
from sagejs.numerics.ode import solve_ivp
rate = input_record["rate"]
def rhs(t, y):
    return [-rate*y[0]]
def jacobian(t, y):
    return [[-rate]]
answer = solve_ivp(
    rhs,
    (input_record["t0"], input_record["t1"]),
    [input_record["y0"]],
    method="rosenbrock4",
    jacobian=jacobian,
    rtol=1e-6,
    atol=1e-9,
    max_validation_evaluations=8,
    max_elapsed_ms=60000,
)
output_record = {
    "value": answer.value[0],
    "status": answer.status,
    "validation_passed": answer.validation.passed,
    "evaluations": answer.evaluations,
}`,
    "p4-ode-decay-sweep": String.raw`
from sagejs.numerics.ode import ode_problem, run_ode_parameter_sweep
from sagejs.numerics.sweeps import SweepBudget
parameters = [{"rate": rate} for rate in input_record["rates"]]
budget = SweepBudget(
    max_items=8,
    max_concurrency=input_record["concurrency"],
    max_evaluations=2000,
    max_elapsed_ms=10000,
    max_memory_bytes=20000000,
    max_input_bytes=100000,
    max_result_bytes=4000000,
    max_trace_events=100,
    max_trace_bytes=100000,
)
def factory(parameter, limits):
    rate = float(parameter["rate"])
    return ode_problem(
        lambda t, y: [-rate*y[0]],
        (0.0, 1.0),
        [1.0],
        rtol=1e-7,
        atol=1e-10,
        max_evaluations=limits.max_evaluations,
        max_elapsed_ms=limits.max_elapsed_ms,
        max_output_points=128,
        max_validation_evaluations=16,
        max_trace_bytes=4096,
        function_record={"kind": "parameterized_decay", "rate": rate, "replayable": True},
    )
answer = run_ode_parameter_sweep(
    parameters,
    factory,
    budget=budget,
    seed=input_record["seed"],
    concurrency=input_record["concurrency"],
)
output_record = {
    "success": answer.success,
    "status": answer.status,
    "values": [item.value["value"][0] for item in answer.items],
    "indices": [item.index for item in answer.items],
    "effective_concurrency": answer.plan.effective_concurrency,
}`,
    "p4-ode-cancelled": String.raw`
from sagejs.numerics.ode import solve_ivp
cancel_checks = [0]
def cancelled():
    cancel_checks[0] += 1
    return True
answer = solve_ivp(lambda t, y: [1.0], (0.0, 1.0), [0.0], cancel=cancelled)
output_record = {"status": answer.status, "cancel_checks": cancel_checks[0]}`,
    "p5-symmetric-eigen": String.raw`
from sagejs.numerics.spectral import symmetric_eigen
answer = symmetric_eigen(input_record["matrix"])
output_record = {
    "value": answer.value,
    "status": answer.status,
    "validation_passed": answer.validation.passed,
}`,
    "p5-fft-direct-oracle": String.raw`
from sagejs.numerics.spectral import fft
answer = fft(input_record["samples"])
output_record = {
    "value": answer.value,
    "status": answer.status,
    "validation_passed": answer.validation.passed,
}`,
    "p5-statistics-summary": String.raw`
from sagejs.numerics.statistics import describe
answer = describe(input_record["samples"])
output_record = {
    "value": answer.value,
    "status": answer.status,
    "validation_passed": answer.validation.passed,
}`,
    "p5-bounded-sweep": String.raw`
from sagejs.numerics.sweeps import run_parameter_sweep
answer = run_parameter_sweep(
    input_record["parameters"],
    lambda parameter, context: parameter*parameter,
    seed=input_record["seed"],
    concurrency=input_record["concurrency"],
)
output_record = {
    "success": answer.success,
    "status": answer.status,
    "values": [item.value for item in answer.items],
    "indices": [item.index for item in answer.items],
    "effective_concurrency": answer.plan.effective_concurrency,
}`,
    "p6-multilingual-root-roundtrip": String.raw`
from sagejs.numerics.frontends import (
    FRONTEND_LANGUAGES, SCALAR_ROOT, create_frontend_registry,
    matlab_fzero_intent,
)
intent = matlab_fzero_intent(
    lambda x: math.cos(x) - x,
    [0.0, 1.0],
    {"Method": "brent", "TolX": 1e-12},
    expression="cos(x) - x",
)
registry = create_frontend_registry()
digests = []
for language in input_record["languages"]:
    source = registry.emit(intent, language)
    digests.append(registry.parse(source, language, SCALAR_ROOT).digest)
answer = registry.execute(intent)
output_record = {
    "intent_digest": intent.digest,
    "roundtrip_digests": digests,
    "value": answer.value,
    "success": answer.success,
}`,
    "p6-multilingual-catalog-roundtrip": String.raw`
from sagejs.numerics.frontends import (
    FRONTEND_LANGUAGES, UnsupportedFrontendError, create_frontend_registry,
    matlab_fzero_intent,
)
registry = create_frontend_registry()
entries = [
    matlab_fzero_intent(lambda x: math.cos(x)-x, [0.0, 1.0], expression="cos(x)-x"),
    registry.lower("sage", "solve", [[3, 1], [1, 2]], [9, 8]),
    registry.lower("matlab", "lsqminnorm", [[1, 0], [0, 1], [1, 1]], [1, 2, 3]),
    registry.lower("sage", "eigh", [[2, 1], [1, 2]]),
    registry.lower("sage", "eig", [[0, -1], [1, 0]]),
    registry.lower("sage", "svd", [[1, 2], [3, 4]]),
    registry.lower("sage", "fft", [1, 2, 3]),
    registry.lower("matlab", "conv", [1, 2], [3, 4]),
    registry.lower("sage", "interpolate", [0, 1, 2], [1, 2, 5]),
    registry.lower("sage", "cubic_spline", [0, 1, 2], [1, 2, 5]),
    registry.lower("wolfram", "NIntegrate", lambda x: x*x, 0, 1, expression="x^2"),
    registry.lower("matlab", "fminbnd", lambda x: (x-2)**2, 0, 4, expression="(x-2)^2"),
    registry.lower("sage", "minimize", lambda p: (p[0]-1)**2, [0], expression="(x0-1)^2"),
    registry.lower("matlab", "fsolve", lambda p: [p[0]**2-2], [1], expression=["x0^2-2"]),
    registry.lower("sage", "nonlinear_least_squares", lambda p: [p[0]-2], [0], expression=["x0-2"]),
    registry.lower("matlab", "polyfit", [0, 1, 2], [1, 3, 5]),
    registry.lower("matlab", "ode45", lambda t, y: [y[0]], [0, 0.25], [1], expression=["y0"]),
    registry.lower("wolfram", "SageJSDescribe", [1, 2, 3, 4]),
    registry.lower("sage", "one_sample_t_test", [1, 2, 4, 5], 2),
    registry.lower("wolfram", "TwoSampleTTest", [1, 2, 4], [2, 3, 5]),
    registry.lower("sage", "linear_regression", [0, 1, 2, 3], [1, 3, 5, 7]),
    registry.lower("sage", "run_parameter_sweep", [1, 2, 3], lambda p, c: p*p, expression="parameter^2"),
]
records = []
digest_mismatches = 0
tamper_rejections = 0
unexpected_diagnostics = []
for intent in entries:
    supported = []
    unsupported = []
    for language in FRONTEND_LANGUAGES:
        try:
            source = registry.emit(intent, language)
        except UnsupportedFrontendError as error:
            unsupported.append(language)
            if error.diagnostic.code != "unsupported_target":
                unexpected_diagnostics.append(error.diagnostic.code)
            continue
        reconstructed = registry.parse(source, language, intent.operation_ref)
        supported.append(language)
        if reconstructed.digest != intent.digest:
            digest_mismatches += 1
        changed = " " + source
        try:
            registry.parse(changed, language, intent.operation_ref)
        except UnsupportedFrontendError as error:
            if error.diagnostic.code == "semantic_mismatch":
                tamper_rejections += 1
            else:
                unexpected_diagnostics.append(error.diagnostic.code)
    records.append({
        "operation": intent.operation_ref.key,
        "supported": supported,
        "unsupported": unsupported,
    })
matrix = [[3, 1], [1, 2]]
right = [9, 8]
equivalent = [
    registry.lower("sage", "solve", matrix, right),
    registry.lower("python-scipy", "numpy.linalg.solve", matrix, right),
    registry.lower("matlab", "linsolve", matrix, right),
    registry.lower("wolfram", "LinearSolve", matrix, right),
]
output_record = {
    "operation_keys": [operation.key for operation in registry.operations()],
    "records": records,
    "digest_mismatches": digest_mismatches,
    "tamper_rejections": tamper_rejections,
    "unexpected_diagnostics": unexpected_diagnostics,
    "equivalent_digests": [intent.digest for intent in equivalent],
    "equivalent_values": [registry.execute(intent).value for intent in equivalent],
}`,
    "p6-scipy-emitted-execution": String.raw`
from sagejs.numerics.frontends import create_frontend_registry
registry = create_frontend_registry()
intents = {
    "linear_solve": registry.lower(
        "python-scipy", "numpy.linalg.solve", [[3.0, 1.0], [1.0, 2.0]], [9.0, 8.0]
    ),
    "integral": registry.lower(
        "python-scipy", "scipy.integrate.quad", lambda x: math.exp(-x), 0.0, 1.0,
        expression="exp(-x)",
    ),
    "minimum": registry.lower(
        "python-scipy", "scipy.optimize.minimize_scalar", lambda x: (x-2.0)**2,
        -1.0, 5.0, expression="(x-2)^2",
    ),
    "ode": registry.lower(
        "python-scipy", "scipy.integrate.solve_ivp", lambda t, y: [y[0]],
        [0.0, 0.25], [1.0], expression=["y0"],
    ),
}
output_record = {
    "sources": {name: registry.emit(intent, "python-scipy") for name, intent in intents.items()},
    "digests": {name: intent.digest for name, intent in intents.items()},
}`,
    "p6-frontend-failure-and-expression-guards": String.raw`
import matlab
import wolfram
from sagejs.numerics.frontends import (
    UnsupportedFrontendError, create_frontend_registry, expression_record,
    render_expression,
)
registry = create_frontend_registry()
projection_rejections = []
for module, name in ((matlab, "linsolve"), (wolfram, "LinearSolve")):
    rich = module.numerical_result(name, [[1.0, 1.0], [2.0, 2.0]], [1.0, 2.0])
    if rich.success:
        projection_rejections.append("unexpected-success:" + name)
    try:
        module.numerical_value(name, [[1.0, 1.0], [2.0, 2.0]], [1.0, 2.0])
        projection_rejections.append("escaped:" + name)
    except RuntimeError as error:
        if "failed:" in str(error):
            projection_rejections.append("rejected:" + name)

expression_codes = []
for source, parameters in (
    ("x + unbound", ("x",)),
    ("sin(x, 1)", ("x",)),
    ("1e9999 * x", ("x",)),
):
    try:
        expression_record(source, language="sage", parameters=parameters)
        expression_codes.append("accepted")
    except UnsupportedFrontendError as error:
        expression_codes.append(error.diagnostic.code)

parameter_guard = False
try:
    registry.lower(
        "matlab", "integral", lambda x: x, 0.0, 1.0,
        expression="x", parameters=("x", "unused"),
    )
except ValueError:
    parameter_guard = True

mismatched = registry.lower(
    "matlab", "integral", lambda x: x, 0.0, 1.0, expression="x^2"
)
mismatched_result = registry.execute(mismatched)
output_record = {
    "projection_rejections": projection_rejections,
    "expression_codes": expression_codes,
    "parameter_guard": parameter_guard,
    "callback_mismatch_success": mismatched_result.success,
    "callback_mismatch_status": mismatched_result.status,
    "matlab_inequality": render_expression(
        expression_record("x != 0", language="python", parameters=("x",)), "matlab"
    ),
}`,
    "p6-frontend-resource-guards": String.raw`
import base64
import hashlib
from sagejs.numerics.frontends import NumericalFrontendIntent, OperationRef, UnsupportedFrontendError
from sagejs.numerics.frontends.portable import attach_intent, parse_attached_intent, portable_value

rejections = []
deep = 0
for _index in range(70):
    deep = [deep]
try:
    portable_value(deep)
except ValueError as error:
    if "nesting depth" in str(error):
        rejections.append("depth")
try:
    portable_value([0] * 100001)
except ValueError as error:
    if "node count" in str(error):
        rejections.append("nodes")
operation = OperationRef("qualification", "resource_budget", 1)
intent = NumericalFrontendIntent(
    operation, operands={"value": 1}, source_language="sage", source_name="resource_budget"
)
try:
    attach_intent("x" * 2000001, intent, "sage")
except ValueError as error:
    if "byte budget" in str(error):
        rejections.append("source-bytes")

body = "result = 1"
semantic = intent.semantic_dict()
semantic["operands"] = {"value": deep}
envelope = {
    "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
    "semantic": semantic,
}
payload = base64.urlsafe_b64encode(
    json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode("utf-8")
).decode("ascii")
deep_envelope_code = None
try:
    parse_attached_intent(body + "\n# sagejs-intent-v1:" + payload, "sage", operation)
except UnsupportedFrontendError as error:
    deep_envelope_code = error.diagnostic.code
output_record = {
    "rejections": rejections,
    "deep_envelope_code": deep_envelope_code,
}`,
    "p7-root-teaching-artifacts": String.raw`
from sagejs.numerics import find_root
callback_calls = [0]
def function(x):
    callback_calls[0] += 1
    return math.cos(x) - x
answer = find_root(
    function, 0.0, 1.0,
    method="bisection", trace="iterations", max_trace_events=32,
)
calls_before_views = callback_calls[0]
plot_record = answer.to_plot_spec().to_dict()
animation_record = answer.to_animation().to_dict()
output_record = {
    "plot_layers": len(plot_record["layers"]),
    "animation_frames": len(animation_record["frames"]),
    "trace_events": len(answer.trace.events),
    "success": answer.success,
    "callback_replays": callback_calls[0] - calls_before_views,
}`,
    "p7-cross-domain-teaching-artifacts": String.raw`
from sagejs.numerics.approximation import interpolate
from sagejs.numerics.integration import integrate
from sagejs.numerics.linear_algebra import lu
from sagejs.numerics.ode import solve_ivp
from sagejs.numerics.optimization import minimize
from sagejs.numerics.spectral import fft
from sagejs.numerics.statistics import describe

callback_calls = {"integration": 0, "ode": 0, "optimization": 0}
def integrand(x):
    callback_calls["integration"] += 1
    return math.sin(x)
def ode_field(t, state):
    callback_calls["ode"] += 1
    return [state[1], -state[0]]
def objective(point):
    callback_calls["optimization"] += 1
    return (1.0-point[0])**2 + 100.0*(point[1]-point[0]*point[0])**2
approximation = interpolate([-1.0, 0.0, 1.0], [1.0, 0.0, 1.0], trace="iterations")
integration = integrate(integrand, 0.0, math.pi)
linear = lu([[0.0, 2.0, 3.0], [4.0, 5.0, 6.0], [7.0, 8.0, 10.0]], trace="iterations")
ode = solve_ivp(ode_field, (0.0, 2.0*math.pi), [1.0, 0.0], trace="iterations")
optimization = minimize(
    objective, [-1.2, 1.0], method="nelder-mead",
    maxiter=8, trace="iterations",
)
spectral = fft([1.0, 0.0, -1.0, 0.0, 0.5, 0.0, -0.5], trace="iterations")
statistics = describe([1.0, 2.0, 3.0, 4.0])
calls_before_views = dict(callback_calls)
artifacts = [
    ("approximation", approximation.to_plot_spec(33), approximation.to_animation(samples=17, max_frames=3)),
    ("integration", integration.to_plot_spec(), integration.to_animation()),
    ("linear-algebra", linear.plot("factorization"), linear.animate(max_frames=3)),
    ("ode", ode.plot("phase"), ode.animate("phase")),
    ("optimization", optimization.plot(), optimization.animate()),
    ("spectral", spectral.plot(), spectral.animate("result")),
    ("statistics", statistics.to_plot_spec(), statistics.animate()),
]
output_record = {
    "domains": [name for name, plot, animation in artifacts],
    "plot_layers": [len(plot.layers) for name, plot, animation in artifacts],
    "animation_frames": [len(animation.frames) for name, plot, animation in artifacts],
    "validation_issue_counts": {name: len(plot.validate()) for name, plot, animation in artifacts},
    "validation_error_counts": {name: sum(1 for item in plot.validate() if item.severity == "error") for name, plot, animation in artifacts},
    "validation_issue_codes": {name: [item.code for item in plot.validate()] for name, plot, animation in artifacts},
    "callback_replay_counts": {name: callback_calls[name] - calls_before_views[name] for name in callback_calls},
}`,
    "p7-scalar-optimization-retained-view": String.raw`
from sagejs.numerics.optimization import minimize_scalar
callback_calls = [0]
def objective(x):
    callback_calls[0] += 1
    return (x - 2.0)**2
answer = minimize_scalar(objective, -1.0, 5.0, trace="iterations")
calls_after_solve = callback_calls[0]
first_plot = answer.plot()
second_plot = answer.to_plot_spec()
first_animation = answer.animate()
second_animation = answer.to_animation()
output_record = {
    "success": answer.success,
    "value": answer.value,
    "callback_replays": callback_calls[0] - calls_after_solve,
    "plot_layers": len(first_plot.layers),
    "plot_validation_errors": sum(1 for issue in first_plot.validate() if issue.severity == "error"),
    "animation_frames": len(first_animation.frames),
    "repeated_plot_layers": len(second_plot.layers),
    "repeated_animation_frames": len(second_animation.frames),
    "plot_callback_replayed": first_plot.provenance["metadata"]["callback_replayed"],
    "animation_callback_replayed": first_animation.to_dict()["metadata"]["callback_replayed"],
}`,
    "p8-statistics-deterministic-fuzz": String.raw`
from sagejs.numerics.statistics import describe
state = input_record["seed"]
means = []
for trial in range(input_record["trials"]):
    values = []
    for index in range(input_record["width"]):
        state = (1103515245*state + 12345) % 2147483648
        values.append((state - 1073741824) / 1048576.0)
    means.append(describe(values).value["mean"])
output_record = {"means": means, "state": state}`,
    "p8-root-resource-budget": String.raw`
from sagejs.numerics import find_root
answer = find_root(
    lambda x: x*x - 2.0, 0.0, 2.0,
    method="brent", max_evaluations=input_record["max_evaluations"],
)
output_record = {"status": answer.status, "evaluations": answer.evaluations}`,
    "p8-callback-exception": String.raw`
from sagejs.numerics import find_root
answer = find_root(lambda x: 1.0/0.0, 0.0, 1.0, method="brent")
output_record = {"status": answer.status, "evaluations": answer.evaluations}`,
    "p8-cross-domain-repeated-stability": String.raw`
from sagejs.numerics import find_root
from sagejs.numerics.integration import integrate
from sagejs.numerics.linear_algebra import solve
from sagejs.numerics.spectral import fft
from sagejs.numerics.statistics import describe
records = []
for trial in range(input_record["trials"]):
    root = find_root(lambda x: math.cos(x)-x, 0.0, 1.0, method="brent")
    integral = integrate(math.sin, 0.0, math.pi)
    linear = solve([[3.0, 1.0], [1.0, 2.0]], [9.0, 8.0])
    transform = fft([1.0, 2.0, -1.0, 0.5, 3.0])
    summary = describe([1.0, 2.0, 3.0, 4.0])
    records.append({
        "root": root.value,
        "integral": integral.value,
        "linear": linear.value,
        "fft_dc": transform.value[0],
        "mean": summary.value["mean"],
        "successes": [
            root.success, integral.success, linear.success,
            transform.success, summary.success,
        ],
    })
output_record = {"records": records}`,
  };
  const body = bodies[id];
  if (body === undefined) throw new Error(`unknown product case ${id}`);
  return `${prefix}\n${body}\nprint(${JSON.stringify(MARKER)} + json.dumps(output_record, sort_keys=True, separators=(",", ":")))`;
}

function parseEvaluation(result) {
  const line = String(result?.stdout ?? "")
    .split(/\r?\n/)
    .findLast((candidate) => candidate.startsWith(MARKER));
  if (line === undefined) {
    throw new Error(`Sage.js evaluation did not return a qualification record: ${result?.stderr ?? ""}`);
  }
  return JSON.parse(line.slice(MARKER.length));
}

async function evaluate(id, input) {
  if (session === null) throw new Error("Sage.js qualification session is not initialized");
  const started = process.hrtime.bigint();
  const result = await session.evaluate(sourceFor(id, input));
  return { raw: parseEvaluation(result), kernelMs: milliseconds(started) };
}

async function evaluateParserGuards() {
  if (artifactRoot === null) throw new Error("Sage.js qualification artifact is not initialized");
  const started = process.hrtime.bigint();
  const { createForeignFrontend } = require(path.join(artifactRoot, "tools", "foreign", "index.js"));
  const matlab = await createForeignFrontend("matlab");
  const wolfram = await createForeignFrontend("wolfram");
  const cases = [
    [matlab, "eig([3 1;1 2])", "MatlabSyntaxError", "eig numerical syntax is not supported"],
    [matlab, "griddedInterpolant([0 1],[0 1])", "MatlabSyntaxError", "griddedInterpolant numerical syntax is not supported"],
    [matlab, "ttest2([1 2 3],[2 3 4])", "MatlabSyntaxError", "ttest2 numerical syntax is not supported"],
    [wolfram, "Fourier[{1,2,3}]", "WolframSyntaxError", "Fourier numerical syntax is not supported"],
    [wolfram, "Eigensystem[{{3,1},{1,2}}]", "WolframSyntaxError", "Eigensystem numerical syntax is not supported"],
    [wolfram, "FindMinimum[(x-2)^2,{x,0}]", "WolframSyntaxError", "FindMinimum numerical syntax is not supported"],
  ];
  const records = [];
  for (const [frontend, source, expectedName, expectedMessage] of cases) {
    try {
      frontend.lower(source, { captureResult: true });
      records.push({ source, rejected: false, name: null, message_matches: false });
    } catch (error) {
      records.push({
        source,
        rejected: true,
        name: error?.name ?? null,
        message_matches: String(error?.message ?? "").includes(expectedMessage),
        name_matches: error?.name === expectedName,
        positioned: Number.isInteger(error?.line) && Number.isInteger(error?.column),
      });
    }
  }
  const safe = [
    matlab.lower("integral(@(x) x^2,0,1)", { captureResult: true }).source,
    wolfram.lower("NIntegrate[x^2,{x,0,1}]", { captureResult: true }).source,
  ];
  return { raw: { records, safe }, kernelMs: milliseconds(started) };
}

async function evaluateMatlabShapes() {
  if (session === null) throw new Error("Sage.js qualification session is not initialized");
  const started = process.hrtime.bigint();
  const programs = {
    linsolve: "x=linsolve([3 1;1 2],[9;8]); size(x)",
    least_squares: "x=lsqminnorm([1 0;0 1;1 1],[1;2;3]); size(x)",
    singular_values: "x=svd([3 1;1 2]); size(x)",
    fminsearch_row: "x=fminsearch(@(x) (x(1,1)-1)^2+(x(1,2)-2)^2,[1 2]); size(x)",
    fminsearch_column: "x=fminsearch(@(x) (x(1,1)-1)^2+(x(2,1)-2)^2,[1;2]); size(x)",
    fsolve_row: "x=fsolve(@(x) [x(1,1)-1 x(1,2)-2],[1 2]); size(x)",
    fsolve_column: "x=fsolve(@(x) [x(1,1)-1;x(2,1)-2],[1;2]); size(x)",
    lsqnonlin_row: "x=lsqnonlin(@(x) [x(1,1)-1 x(1,2)-2],[1 2]); size(x)",
    lsqnonlin_column: "x=lsqnonlin(@(x) [x(1,1)-1;x(2,1)-2],[1;2]); size(x)",
    convolution_row: "x=conv([1 2],[3 4]); size(x)",
    arrayfun_matrix: "x=arrayfun(@(x) x^2,[1 2;3 4]); size(x)",
  };
  const shapes = {};
  for (const [name, source] of Object.entries(programs)) {
    const result = await session.evaluate(source, { language: "matlab" });
    shapes[name] = result.repr;
  }
  return { raw: { shapes }, kernelMs: milliseconds(started) };
}

function executeScipyPrograms(sources) {
  return {
    linear_solve: runScipySource(sources.linear_solve, "result.tolist()"),
    integral: runScipySource(sources.integral, "float(result)"),
    minimum: runScipySource(sources.minimum, "float(result)"),
    ode: runScipySource(sources.ode, "float(result.y[0, -1])"),
  };
}

async function evaluateCminpack(id, input) {
  if (cminpackBackend === null) throw new Error("cminpack qualification backend is not initialized");
  const started = process.hrtime.bigint();
  let cancelChecks = 0;
  const options = {
    method: input.method,
    initial: input.initial,
    residualCount: 2,
    residual: ([x, y]) => [10 * (y - x * x), 1 - x],
    maximumEvaluations: 1000,
    maximumCallbackEvaluations: 2000,
    functionTolerance: 1e-13,
    stepTolerance: 1e-13,
    gradientTolerance: 1e-13,
  };
  if (input.method === "cminpack-lmder") {
    options.jacobian = ([x]) => [[-20 * x, 10], [-1, 0]];
  }
  if (id === "p8-cminpack-cancelled") {
    options.cancelled = () => {
      cancelChecks += 1;
      return true;
    };
  }
  const result = cminpackBackend.leastSquares(options);
  return {
    raw: { ...result, cancelChecks, backendState: cminpackBackend.inspect() },
    kernelMs: milliseconds(started),
  };
}

function success(values, kernelMs, counters = {}) {
  return {
    outcome: { kind: "success", code: null },
    values,
    metrics: { phases_ms: { sagejs_artifact: kernelMs }, counters },
  };
}

function failure(code, values, kernelMs, counters = {}) {
  return {
    outcome: { kind: "failure", code },
    values,
    metrics: { phases_ms: { sagejs_artifact: kernelMs }, counters },
  };
}

function lagrange(nodes, values, point) {
  let answer = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    let basis = 1;
    for (let j = 0; j < nodes.length; j += 1) {
      if (i !== j) basis *= (point - nodes[j]) / (nodes[i] - nodes[j]);
    }
    answer += values[i] * basis;
  }
  return answer;
}

function complex(value) {
  if (Array.isArray(value)) return { re: value[0], im: value[1] };
  if (value !== null && typeof value === "object" &&
      Number.isFinite(value.re) && Number.isFinite(value.im)) {
    return { re: value.re, im: value.im };
  }
  return { re: value, im: 0 };
}

function dft(samples) {
  return samples.map((_, frequency) => {
    let re = 0;
    let im = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const angle = -2 * Math.PI * frequency * index / samples.length;
      re += samples[index] * Math.cos(angle);
      im += samples[index] * Math.sin(angle);
    }
    return { re, im };
  });
}

function evaluatePolynomial(coefficients, root) {
  let value = { re: 0, im: 0 };
  let scale = 0;
  const magnitude = Math.hypot(root.re, root.im);
  for (const coefficient of coefficients) {
    value = {
      re: value.re * root.re - value.im * root.im + coefficient,
      im: value.re * root.im + value.im * root.re,
    };
    scale = scale * magnitude + Math.abs(coefficient);
  }
  return Math.hypot(value.re, value.im) / Math.max(scale, Number.MIN_VALUE);
}

function matchRealRoots(observed, expected) {
  const remaining = observed.map(complex);
  let maximum = 0;
  for (const target of expected) {
    let nearest = 0;
    let distance = Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = Math.hypot(remaining[index].re - target, remaining[index].im);
      if (candidate < distance) {
        distance = candidate;
        nearest = index;
      }
    }
    maximum = Math.max(maximum, distance);
    remaining.splice(nearest, 1);
  }
  return maximum;
}

function cminpackEvidence(value) {
  const [x, y] = value;
  const residual = [10 * (y - x * x), 1 - x];
  const gradient = [
    -20 * x * residual[0] - residual[1],
    10 * residual[0],
  ];
  return {
    maxParameterError: Math.max(Math.abs(x - 1), Math.abs(y - 1)),
    residualNorm: Math.hypot(...residual),
    stationarity: Math.hypot(...gradient),
  };
}

function maxEigenResidual(matrix, values, vectors) {
  function orientationResidual(columns) {
    let maximum = 0;
    for (let column = 0; column < values.length; column += 1) {
      for (let row = 0; row < matrix.length; row += 1) {
        let image = 0;
        for (let index = 0; index < matrix.length; index += 1) {
          image += matrix[row][index] * columns[index][column];
        }
        maximum = Math.max(maximum, Math.abs(image - values[column] * columns[row][column]));
      }
    }
    return maximum;
  }
  const real = vectors.map((row) => row.map((entry) => complex(entry).re));
  const transposed = real[0].map((_, column) => real.map((row) => row[column]));
  return Math.min(orientationResidual(real), orientationResidual(transposed));
}

function regenerateFuzz(input) {
  let state = BigInt(input.seed);
  const means = [];
  for (let trial = 0; trial < input.trials; trial += 1) {
    let sum = 0;
    for (let index = 0; index < input.width; index += 1) {
      state = (1103515245n * state + 12345n) % 2147483648n;
      sum += (Number(state) - 1073741824) / 1048576;
    }
    means.push(sum / input.width);
  }
  return { state: Number(state), means };
}

function repeatedEvidence(records) {
  let maximum = 0;
  let failures = 0;
  for (const record of records) {
    maximum = Math.max(maximum, Math.abs(Math.cos(record.root) - record.root));
    maximum = Math.max(maximum, Math.abs(record.integral - 2));
    maximum = Math.max(maximum, Math.abs(record.linear[0] - 2), Math.abs(record.linear[1] - 3));
    maximum = Math.max(maximum, Math.abs(complex(record.fft_dc).re - 5.5));
    maximum = Math.max(maximum, Math.abs(complex(record.fft_dc).im));
    maximum = Math.max(maximum, Math.abs(record.mean - 2.5));
    failures += record.successes.filter((value) => value !== true).length;
  }
  return { maximum, failures };
}

function multilingualCatalogEvidence(raw, input) {
  const expected = new Map(input.targets.map((item) => [item.operation, item]));
  const observed = new Map(raw.records.map((item) => [item.operation, item]));
  const expectedKeys = [...expected.keys()].sort();
  const observedKeys = [...observed.keys()].sort();
  let targetMatrixMatches = JSON.stringify(expectedKeys) === JSON.stringify(observedKeys);
  let supportedTargets = 0;
  let unsupportedTargets = 0;
  for (const key of expectedKeys) {
    const actual = observed.get(key);
    const wanted = expected.get(key);
    if (actual === undefined ||
        JSON.stringify(actual.supported.slice().sort()) !== JSON.stringify(wanted.emit.slice().sort()) ||
        JSON.stringify(actual.unsupported.slice().sort()) !==
          JSON.stringify((wanted.unsupported ?? []).slice().sort())) {
      targetMatrixMatches = false;
      continue;
    }
    supportedTargets += actual.supported.length;
    unsupportedTargets += actual.unsupported.length;
  }
  let maximumLinearResidual = 0;
  for (const value of raw.equivalent_values) {
    maximumLinearResidual = Math.max(
      maximumLinearResidual,
      Math.abs(3 * value[0] + value[1] - 9),
      Math.abs(value[0] + 2 * value[1] - 8),
    );
  }
  return {
    operationKeysMatch: JSON.stringify(raw.operation_keys.slice().sort()) ===
      JSON.stringify(expectedKeys),
    targetMatrixMatches,
    supportedTargets,
    unsupportedTargets,
    equivalentDigests: new Set(raw.equivalent_digests).size === 1,
    maximumLinearResidual,
  };
}

async function normalize(sample) {
  const validationStarted = process.hrtime.bigint();
  let evaluated;
  if ([
    "p3-cminpack-rosenbrock-lmdif",
    "p3-cminpack-rosenbrock-lmder",
    "p8-cminpack-cancelled",
  ].includes(sample.id)) {
    evaluated = await evaluateCminpack(sample.id, sample.input);
  } else if (sample.id === "p6-multilingual-parser-fail-closed") {
    evaluated = await evaluateParserGuards();
  } else if (sample.id === "p6-matlab-vector-shapes") {
    evaluated = await evaluateMatlabShapes();
  } else {
    evaluated = await evaluate(sample.id, sample.input);
  }
  const { raw, kernelMs } = evaluated;
  const input = sample.input;
  let observation;
  switch (sample.id) {
    case "p0-result-contract":
      observation = success(raw, kernelMs);
      break;
    case "p1-root-cosine":
      observation = success({
        result: raw.value,
        independent_residual: Math.abs(Math.cos(raw.value) - raw.value),
        validation_passed: raw.validation_passed,
      }, kernelMs, { evaluations: raw.evaluations });
      break;
    case "p1-root-invalid-bracket":
      observation = failure("root.invalid-bracket", {
        solver_status: raw.status,
        same_sign_endpoints: ((input.lower ** 2 + 1) * (input.upper ** 2 + 1)) > 0,
      }, kernelMs, { evaluations: raw.evaluations });
      break;
    case "p1-root-translation": {
      const expected = input.shifts.map((shift) => shift + Math.SQRT2);
      const errors = raw.roots.map((value, index) => Math.abs(value - expected[index]));
      const residuals = raw.roots.map((value, index) =>
        Math.abs((value - input.shifts[index]) ** 2 - 2));
      observation = success({
        max_translation_error: Math.max(...errors),
        max_residual: Math.max(...residuals),
        trials: raw.roots.length,
      }, kernelMs, { transformations: raw.roots.length });
      break;
    }
    case "p2-interpolation-quadratic": {
      const oracle = lagrange(input.nodes, input.values, input.point);
      observation = success({
        result: raw.value,
        independent_error: Math.abs(raw.value - oracle),
      }, kernelMs);
      break;
    }
    case "p2-polynomial-roots-known":
    case "p2-polynomial-roots-clustered": {
      const roots = raw.roots.map(complex);
      observation = success({
        max_root_error: matchRealRoots(roots, input.expected_roots),
        max_normalized_residual: Math.max(
          ...roots.map((root) => evaluatePolynomial(input.coefficients, root)),
        ),
        validation_passed: raw.validation_passed,
        ill_conditioned_reported: raw.diagnostic_codes.includes("ill_conditioned"),
      }, kernelMs, { roots: roots.length });
      break;
    }
    case "p2-quadrature-sine":
      observation = success({
        result: raw.value,
        independent_error: Math.abs(raw.value - 2),
        validation_passed: raw.validation_passed,
      }, kernelMs, { evaluations: raw.evaluations });
      break;
    case "p2-linear-solve": {
      const residual = input.matrix.map((row, index) =>
        Math.abs(row.reduce((sum, value, column) => sum + value * raw.value[column], 0) - input.rhs[index]));
      observation = success({
        rounded_result: raw.value.map((value) => Math.round(value)),
        independent_residual: Math.max(...residual),
        validation_passed: raw.validation_passed,
      }, kernelMs);
      break;
    }
    case "p2-linear-scale-stress":
      observation = success({
        result: raw.value,
        relative_residual: Math.abs(input.scale * raw.value - input.scale) / input.scale,
      }, kernelMs);
      break;
    case "p2-linear-singular":
      observation = failure("linear.singular", {
        solver_success: raw.success,
        solver_status: raw.status,
        independent_determinant: input.matrix[0][0] * input.matrix[1][1] -
          input.matrix[0][1] * input.matrix[1][0],
      }, kernelMs);
      break;
    case "p3-scalar-minimum":
      observation = success({
        result: raw.value,
        independent_stationarity: Math.abs(2 * (raw.value - 2)),
        validation_passed: raw.validation_passed,
      }, kernelMs, { evaluations: raw.evaluations });
      break;
    case "p3-cminpack-rosenbrock-lmdif":
    case "p3-cminpack-rosenbrock-lmder": {
      const evidence = cminpackEvidence(raw.value);
      observation = success({
        max_parameter_error: evidence.maxParameterError,
        independent_residual_norm: evidence.residualNorm,
        independent_stationarity: evidence.stationarity,
        backend_status: raw.status,
        independent_validation_required: raw.independentValidationRequired,
        jacobian_evaluations: raw.jacobianEvaluations,
        live_allocations: raw.backendState.liveAllocations,
      }, kernelMs, {
        residual_evaluations: raw.residualEvaluations,
        jacobian_evaluations: raw.jacobianEvaluations,
      });
      break;
    }
    case "p3-optimization-cancelled":
      observation = failure("optimization.cancelled", {
        solver_status: raw.status,
        cancel_checks: raw.cancel_checks,
      }, kernelMs, { cancellation_checks: raw.cancel_checks });
      break;
    case "p3-cminpack-optional-resource-fail-closed": {
      const maximumAutomaticError = Math.max(...raw.records.map((item) =>
        item.automatic_error));
      observation = success({
        resource_failures: raw.records.map((item) => item.kind),
        automatic_successes: raw.records.filter((item) => item.automatic_success).length,
        automatic_methods: raw.records.map((item) => item.automatic_method),
        automatic_backends: raw.records.map((item) => item.automatic_backend),
        maximum_automatic_error: maximumAutomaticError,
        explicit_failures: raw.records.filter((item) => !item.explicit_success).length,
        explicit_statuses: raw.records.map((item) => item.explicit_status),
        explicit_reasons: raw.records.map((item) => item.explicit_reason),
        private_details_leaked: raw.records.filter((item) => item.private_detail_leaked).length,
      }, kernelMs, { injected_optional_resource_failures: raw.records.length });
      break;
    }
    case "p4-ode-exponential":
      observation = success({
        result: raw.value,
        independent_error: Math.abs(raw.value - Math.E),
        validation_passed: raw.validation_passed,
      }, kernelMs, { evaluations: raw.evaluations });
      break;
    case "p4-ode-stiff-decay": {
      const oracle = input.y0 * Math.exp(-input.rate * (input.t1 - input.t0));
      observation = success({
        result: raw.value,
        independent_error: Math.abs(raw.value - oracle),
        finite: Number.isFinite(raw.value),
        validation_passed: raw.validation_passed,
      }, kernelMs, { evaluations: raw.evaluations });
      break;
    }
    case "p4-ode-decay-sweep": {
      const errors = raw.values.map((value, index) =>
        Math.abs(value - Math.exp(-input.rates[index])));
      observation = success({
        max_independent_error: Math.max(...errors),
        stable_order: raw.indices.every((value, index) => value === index),
        items: raw.values.length,
        effective_concurrency: raw.effective_concurrency,
      }, kernelMs, { items: raw.values.length });
      break;
    }
    case "p4-ode-cancelled":
      observation = failure("ode.cancelled", {
        solver_status: raw.status,
        cancel_checks: raw.cancel_checks,
      }, kernelMs, { cancellation_checks: raw.cancel_checks });
      break;
    case "p5-symmetric-eigen": {
      const eigenvalues = raw.value.eigenvalues.map((value) => complex(value).re);
      observation = success({
        eigenvalue_sum: eigenvalues.reduce((left, right) => left + right, 0),
        max_independent_residual: maxEigenResidual(
          input.matrix, eigenvalues, raw.value.eigenvectors,
        ),
        validation_passed: raw.validation_passed,
      }, kernelMs);
      break;
    }
    case "p5-fft-direct-oracle": {
      const expected = dft(input.samples);
      const actual = raw.value.map(complex);
      const errors = actual.map((value, index) => Math.hypot(
        value.re - expected[index].re, value.im - expected[index].im,
      ));
      observation = success({
        dc: actual[0].re,
        max_dft_error: Math.max(...errors),
        validation_passed: raw.validation_passed,
      }, kernelMs);
      break;
    }
    case "p5-statistics-summary": {
      const mean = input.samples.reduce((left, right) => left + right, 0) / input.samples.length;
      const variance = input.samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        (input.samples.length - 1);
      observation = success({
        mean: raw.value.mean,
        independent_variance_error: Math.abs(raw.value.variance - variance),
        validation_passed: raw.validation_passed,
      }, kernelMs);
      break;
    }
    case "p5-bounded-sweep":
      observation = success({
        results: raw.values,
        stable_order: raw.indices.every((value, index) => value === index),
        effective_concurrency: raw.effective_concurrency,
      }, kernelMs, { items: raw.values.length });
      break;
    case "p6-multilingual-root-roundtrip":
      observation = success({
        digests_equal: raw.roundtrip_digests.every((value) => value === raw.intent_digest),
        trials: raw.roundtrip_digests.length,
        independent_residual: Math.abs(Math.cos(raw.value) - raw.value),
      }, kernelMs, { roundtrips: raw.roundtrip_digests.length });
      break;
    case "p6-multilingual-catalog-roundtrip": {
      const evidence = multilingualCatalogEvidence(raw, input);
      observation = success({
        operation_keys_match: evidence.operationKeysMatch,
        target_matrix_matches: evidence.targetMatrixMatches,
        supported_targets: evidence.supportedTargets,
        unsupported_targets: evidence.unsupportedTargets,
        digest_mismatches: raw.digest_mismatches,
        tamper_rejections: raw.tamper_rejections,
        unexpected_diagnostics: raw.unexpected_diagnostics.length,
        equivalent_digests: evidence.equivalentDigests,
        maximum_linear_residual: evidence.maximumLinearResidual,
      }, kernelMs, {
        operations: raw.records.length,
        emitted_roundtrips: evidence.supportedTargets,
        structured_unsupported: evidence.unsupportedTargets,
        tamper_rejections: raw.tamper_rejections,
      });
      break;
    }
    case "p6-multilingual-parser-fail-closed": {
      const rejected = raw.records.filter((item) => item.rejected).length;
      const named = raw.records.filter((item) => item.name_matches).length;
      const messaged = raw.records.filter((item) => item.message_matches).length;
      const positioned = raw.records.filter((item) => item.positioned).length;
      observation = success({
        cases: raw.records.length,
        structured_rejections: rejected,
        correct_error_names: named,
        specific_messages: messaged,
        source_positions: positioned,
        safe_lowerings: raw.safe.length,
        safe_lowerings_reach_runtime: raw.safe.every((source) =>
          source.includes(".integral(") || source.includes(".NIntegrate(")),
      }, kernelMs, { parser_rejections: rejected, safe_lowerings: raw.safe.length });
      break;
    }
    case "p6-matlab-vector-shapes": {
      const expected = {
        linsolve: "(2, 1)",
        least_squares: "(2, 1)",
        singular_values: "(2, 1)",
        fminsearch_row: "(1, 2)",
        fminsearch_column: "(2, 1)",
        fsolve_row: "(1, 2)",
        fsolve_column: "(2, 1)",
        lsqnonlin_row: "(1, 2)",
        lsqnonlin_column: "(2, 1)",
        convolution_row: "(1, 3)",
        arrayfun_matrix: "(2, 2)",
      };
      const mismatches = Object.keys(expected).filter((name) => raw.shapes[name] !== expected[name]);
      observation = success({
        witnesses: Object.keys(expected).length,
        mismatches,
        one_output_column_shapes: [
          raw.shapes.linsolve,
          raw.shapes.least_squares,
          raw.shapes.singular_values,
        ],
        callback_row_shapes: [
          raw.shapes.fminsearch_row,
          raw.shapes.fsolve_row,
          raw.shapes.lsqnonlin_row,
        ],
        callback_column_shapes: [
          raw.shapes.fminsearch_column,
          raw.shapes.fsolve_column,
          raw.shapes.lsqnonlin_column,
        ],
        container_shapes: [raw.shapes.convolution_row, raw.shapes.arrayfun_matrix],
      }, kernelMs, { matlab_programs: Object.keys(expected).length });
      break;
    }
    case "p6-scipy-emitted-execution": {
      const executed = executeScipyPrograms(raw.sources);
      const linear = executed.linear_solve;
      const linearResidual = Math.max(
        Math.abs(3 * linear[0] + linear[1] - 9),
        Math.abs(linear[0] + 2 * linear[1] - 8),
      );
      observation = success({
        programs: Object.keys(executed).length,
        distinct_intent_digests: new Set(Object.values(raw.digests)).size,
        linear_residual: linearResidual,
        integral_error: Math.abs(executed.integral - (1 - Math.exp(-1))),
        minimum_error: Math.abs(executed.minimum - 2),
        ode_error: Math.abs(executed.ode - Math.exp(0.25)),
      }, kernelMs, { emitted_programs_executed: Object.keys(executed).length });
      break;
    }
    case "p6-frontend-failure-and-expression-guards":
      observation = success({
        projection_rejections: raw.projection_rejections.slice().sort(),
        parse_failure_count: raw.expression_codes.filter((code) => code === "parse_failure").length,
        parameter_guard: raw.parameter_guard,
        callback_mismatch_success: raw.callback_mismatch_success,
        callback_mismatch_status: raw.callback_mismatch_status,
        matlab_inequality: raw.matlab_inequality,
      }, kernelMs, {
        failed_value_projections: raw.projection_rejections.filter((item) =>
          item.startsWith("rejected:"),
        ).length,
        expression_rejections: raw.expression_codes.length,
      });
      break;
    case "p6-frontend-resource-guards":
      observation = success({
        rejections: raw.rejections.slice().sort(),
        deep_envelope_code: raw.deep_envelope_code,
      }, kernelMs, { resource_rejections: raw.rejections.length + 1 });
      break;
    case "p7-root-teaching-artifacts":
      observation = success({
        plot_layers: raw.plot_layers,
        animation_frames: raw.animation_frames,
        trace_events: raw.trace_events,
        callback_replays: raw.callback_replays,
      }, kernelMs, { trace_events: raw.trace_events, animation_frames: raw.animation_frames });
      break;
    case "p7-cross-domain-teaching-artifacts":
      {
      const validationIssueDomains = Object.entries(raw.validation_issue_counts)
        .filter(([, count]) => count !== 0).map(([domain]) => domain).sort();
      const validationErrorDomains = Object.entries(raw.validation_error_counts)
        .filter(([, count]) => count !== 0).map(([domain]) => domain).sort();
      const callbackReplayDomains = Object.entries(raw.callback_replay_counts)
        .filter(([, count]) => count !== 0).map(([domain]) => domain).sort();
      observation = success({
        domain_count: raw.domains.length,
        min_plot_layers: Math.min(...raw.plot_layers),
        min_animation_frames: Math.min(...raw.animation_frames),
        max_animation_frames: Math.max(...raw.animation_frames),
        validation_issues: Object.values(raw.validation_issue_counts)
          .reduce((left, right) => left + right, 0),
        validation_issue_domains: validationIssueDomains,
        validation_issue_codes: raw.validation_issue_codes,
        validation_errors: Object.values(raw.validation_error_counts)
          .reduce((left, right) => left + right, 0),
        validation_error_domains: validationErrorDomains,
        callback_replays: Object.values(raw.callback_replay_counts)
          .reduce((left, right) => left + right, 0),
        callback_replay_domains: callbackReplayDomains,
      }, kernelMs, {
        domains: raw.domains.length,
        animation_frames: raw.animation_frames.reduce((left, right) => left + right, 0),
      });
      break;
      }
    case "p7-scalar-optimization-retained-view":
      observation = success({
        independent_minimum_error: Math.abs(raw.value - 2),
        callback_replays: raw.callback_replays,
        plot_layers: raw.plot_layers,
        plot_validation_errors: raw.plot_validation_errors,
        animation_frames: raw.animation_frames,
        repeated_plot_layers: raw.repeated_plot_layers,
        repeated_animation_frames: raw.repeated_animation_frames,
        plot_callback_replayed: raw.plot_callback_replayed,
        animation_callback_replayed: raw.animation_callback_replayed,
      }, kernelMs, {
        animation_frames: raw.animation_frames,
        repeated_views: 4,
      });
      break;
    case "p8-statistics-deterministic-fuzz": {
      const oracle = regenerateFuzz(input);
      const errors = raw.means.map((value, index) => Math.abs(value - oracle.means[index]));
      observation = success({
        max_mean_error: Math.max(...errors),
        trials: raw.means.length,
        final_state_matches: raw.state === oracle.state,
      }, kernelMs, { trials: raw.means.length });
      break;
    }
    case "p8-root-resource-budget":
      observation = failure("root.maximum-evaluations", {
        solver_status: raw.status,
        evaluations: raw.evaluations,
      }, kernelMs, { evaluations: raw.evaluations });
      break;
    case "p8-callback-exception":
      observation = failure("root.callback-error", {
        solver_status: raw.status,
        evaluations: raw.evaluations,
      }, kernelMs, { evaluations: raw.evaluations });
      break;
    case "p8-cminpack-cancelled":
      observation = failure("optimization.cancelled", {
        backend_status: raw.status,
        cancel_checks: raw.cancelChecks,
        live_allocations: raw.backendState.liveAllocations,
      }, kernelMs, { cancellation_checks: raw.cancelChecks });
      break;
    case "p8-cross-domain-repeated-stability": {
      const evidence = repeatedEvidence(raw.records);
      observation = success({
        max_independent_error: evidence.maximum,
        trials: raw.records.length,
        failures: evidence.failures,
      }, kernelMs, { trials: raw.records.length, operations: raw.records.length * 5 });
      break;
    }
    default:
      throw new Error(`unknown product case ${sample.id}`);
  }
  observation.metrics.phases_ms.host_independent_validation = milliseconds(validationStarted);
  return observation;
}

module.exports = {
  protocol: PROTOCOL,

  async initialize(context) {
    if (session !== null || cminpackBackend !== null) {
      throw new Error("the qualification adapter is already initialized");
    }
    const artifact = context.artifacts.find((item) => item.name === "sagejs-dist");
    if (artifact === undefined || !fs.statSync(artifact.path).isDirectory()) {
      throw new Error("the sagejs-dist artifact must be a built dist directory");
    }
    artifactRoot = artifact.path;
    const kernelPath = path.join(artifactRoot, "tools", "kernel.js");
    if (!fs.statSync(kernelPath).isFile()) throw new Error("sagejs-dist lacks tools/kernel.js");
    const cminpackArtifact = context.artifacts.find((item) => item.name === "cminpack-wasm");
    if (cminpackArtifact === undefined || !fs.statSync(cminpackArtifact.path).isFile()) {
      throw new Error("the cminpack-wasm artifact must be the built cminpack.wasm file");
    }
    const cminpackModulePath = path.resolve(
      __dirname, "..", "..", "..", "packages", "flint-wasm", "numerical", "index.mjs",
    );
    const { createCminpackBackend } = await import(pathToFileURL(cminpackModulePath).href);
    cminpackBackend = await createCminpackBackend(fs.readFileSync(cminpackArtifact.path));
    scipyPython = findScipyPython();
    try {
      const { createSage } = require(kernelPath);
      session = await createSage({ mode: "python" });

      const probe = await session.evaluate(String.raw`
import json
modules = [
    "sagejs.numerics",
    "sagejs.numerics.approximation",
    "sagejs.numerics.integration",
    "sagejs.numerics.linear_algebra",
    "sagejs.numerics.optimization",
    "sagejs.numerics.ode",
    "sagejs.numerics.spectral",
    "sagejs.numerics.statistics",
    "sagejs.numerics.sweeps",
    "sagejs.numerics.frontends",
]
available = []
for module in modules:
    try:
        __import__(module)
        available.append(module)
    except Exception:
        pass
print(${JSON.stringify(MARKER)} + json.dumps({"available": available}, sort_keys=True))
`);
      const present = new Set(parseEvaluation(probe).available);
      const requirements = {
      "numerics.contracts": "sagejs.numerics",
      "numerics.root.scalar": "sagejs.numerics",
      "numerics.approximation.interpolation": "sagejs.numerics.approximation",
      "numerics.approximation.polynomial_roots": "sagejs.numerics.approximation",
      "numerics.integration.quadrature": "sagejs.numerics.integration",
      "numerics.linear.solve": "sagejs.numerics.linear_algebra",
      "numerics.optimization.scalar": "sagejs.numerics.optimization",
      "numerics.optimization.cminpack": "external:cminpack-wasm",
      "numerics.optimization.cminpack_optional_resource": "sagejs.numerics.optimization",
      "numerics.ode.explicit_ivp": "sagejs.numerics.ode",
      "numerics.ode.stiff_ivp": "sagejs.numerics.ode",
      "numerics.ode.sweeps": "sagejs.numerics.ode",
      "numerics.spectral.dense": "sagejs.numerics.spectral",
      "numerics.spectral.fft": "sagejs.numerics.spectral",
      "numerics.statistics.descriptive": "sagejs.numerics.statistics",
      "numerics.sweeps.bounded": "sagejs.numerics.sweeps",
      "numerics.frontend.scalar_root": "sagejs.numerics.frontends",
      "numerics.frontend.catalog": "sagejs.numerics.frontends",
      "numerics.frontend.parser_guards": "sagejs.numerics.frontends",
      "numerics.frontend.matlab_shapes": "sagejs.numerics.frontends",
      "numerics.frontend.scipy_execution": "external:scipy-python",
      "numerics.frontend.guardrails": "sagejs.numerics.frontends",
      "numerics.teaching.root": "sagejs.numerics",
      "numerics.teaching.cross_domain": "sagejs.numerics",
      "numerics.teaching.scalar_optimization": "sagejs.numerics.optimization",
      "numerics.lifecycle.repeated": "sagejs.numerics",
      };
      initializedCapabilities = context.capabilities
        .filter((item) => item.status === "available" && (
          requirements[item.id] === "external:cminpack-wasm" ||
          (requirements[item.id] === "external:scipy-python" && scipyPython !== null) ||
          present.has(requirements[item.id])
        ))
        .map((item) => item.id)
        .sort();
      return {
        subject: { kind: "node", name: "node", version: process.version, engine: null },
        capability_ids: initializedCapabilities,
      };
    } catch (error) {
      if (session !== null) await session.close();
      session = null;
      artifactRoot = null;
      cminpackBackend = null;
      scipyPython = null;
      initializedCapabilities = [];
      throw error;
    }
  },

  async runCase(sample) {
    return normalize(sample);
  },

  async close() {
    if (session !== null) await session.close();
    session = null;
    artifactRoot = null;
    cminpackBackend = null;
    scipyPython = null;
    initializedCapabilities = [];
  },

  qualificationState() {
    return {
      initialized: session !== null,
      artifact_root: artifactRoot,
      cminpack_initialized: cminpackBackend !== null,
      scipy_python_initialized: scipyPython !== null,
      capability_ids: [...initializedCapabilities],
    };
  },
};
