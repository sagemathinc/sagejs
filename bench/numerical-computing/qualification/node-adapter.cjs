"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PROTOCOL = "sagejs.numerical-qualification-adapter/v1";
const MARKER = "__SAGEJS_NUMERICAL_QUALIFICATION__";

let session = null;
let artifactRoot = null;
let cminpackBackend = null;
let initializedCapabilities = [];

function milliseconds(started) {
  return Number(process.hrtime.bigint() - started) / 1e6;
}

function pythonInput(input) {
  return `input_record = json.loads(${JSON.stringify(JSON.stringify(input))})`;
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
    "p7-root-teaching-artifacts": String.raw`
from sagejs.numerics import find_root
answer = find_root(
    lambda x: math.cos(x) - x, 0.0, 1.0,
    method="bisection", trace="iterations", max_trace_events=32,
)
plot_record = answer.to_plot_spec().to_dict()
animation_record = answer.to_animation().to_dict()
output_record = {
    "plot_layers": len(plot_record["layers"]),
    "animation_frames": len(animation_record["frames"]),
    "trace_events": len(answer.trace.events),
    "success": answer.success,
}`,
    "p7-cross-domain-teaching-artifacts": String.raw`
from sagejs.numerics.approximation import interpolate
from sagejs.numerics.integration import integrate
from sagejs.numerics.linear_algebra import lu
from sagejs.numerics.spectral import fft
from sagejs.numerics.statistics import describe

approximation = interpolate([-1.0, 0.0, 1.0], [1.0, 0.0, 1.0], trace="iterations")
integration = integrate(math.sin, 0.0, math.pi)
linear = lu([[0.0, 2.0, 3.0], [4.0, 5.0, 6.0], [7.0, 8.0, 10.0]], trace="iterations")
spectral = fft([1.0, 0.0, -1.0, 0.0, 0.5, 0.0, -0.5], trace="iterations")
statistics = describe([1.0, 2.0, 3.0, 4.0])
artifacts = [
    ("approximation", approximation.to_plot_spec(33), approximation.to_animation(samples=17, max_frames=3)),
    ("integration", integration.to_plot_spec(), integration.to_animation()),
    ("linear-algebra", linear.plot("factorization"), linear.animate(max_frames=3)),
    ("spectral", spectral.plot(), spectral.animate("result")),
    ("statistics", statistics.to_plot_spec(), statistics.animate()),
]
output_record = {
    "domains": [name for name, plot, animation in artifacts],
    "plot_layers": [len(plot.layers) for name, plot, animation in artifacts],
    "animation_frames": [len(animation.frames) for name, plot, animation in artifacts],
    "validation_issues": [len(plot.validate()) for name, plot, animation in artifacts],
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

async function normalize(sample) {
  const validationStarted = process.hrtime.bigint();
  const { raw, kernelMs } = sample.id.startsWith("p3-cminpack-") ||
    sample.id === "p8-cminpack-cancelled"
    ? await evaluateCminpack(sample.id, sample.input)
    : await evaluate(sample.id, sample.input);
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
    case "p7-root-teaching-artifacts":
      observation = success({
        plot_layers: raw.plot_layers,
        animation_frames: raw.animation_frames,
        trace_events: raw.trace_events,
      }, kernelMs, { trace_events: raw.trace_events, animation_frames: raw.animation_frames });
      break;
    case "p7-cross-domain-teaching-artifacts":
      observation = success({
        domain_count: raw.domains.length,
        min_plot_layers: Math.min(...raw.plot_layers),
        min_animation_frames: Math.min(...raw.animation_frames),
        max_animation_frames: Math.max(...raw.animation_frames),
        validation_issues: raw.validation_issues.reduce((left, right) => left + right, 0),
      }, kernelMs, {
        domains: raw.domains.length,
        animation_frames: raw.animation_frames.reduce((left, right) => left + right, 0),
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
      "numerics.ode.explicit_ivp": "sagejs.numerics.ode",
      "numerics.ode.stiff_ivp": "sagejs.numerics.ode",
      "numerics.ode.sweeps": "sagejs.numerics.ode",
      "numerics.spectral.dense": "sagejs.numerics.spectral",
      "numerics.spectral.fft": "sagejs.numerics.spectral",
      "numerics.statistics.descriptive": "sagejs.numerics.statistics",
      "numerics.sweeps.bounded": "sagejs.numerics.sweeps",
      "numerics.frontend.scalar_root": "sagejs.numerics.frontends",
      "numerics.teaching.root": "sagejs.numerics",
      "numerics.teaching.cross_domain": "sagejs.numerics",
      "numerics.lifecycle.repeated": "sagejs.numerics",
      };
      initializedCapabilities = context.capabilities
        .filter((item) => item.status === "available" && (
          requirements[item.id] === "external:cminpack-wasm" || present.has(requirements[item.id])
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
    initializedCapabilities = [];
  },

  qualificationState() {
    return {
      initialized: session !== null,
      artifact_root: artifactRoot,
      cminpack_initialized: cminpackBackend !== null,
      capability_ids: [...initializedCapabilities],
    };
  },
};
