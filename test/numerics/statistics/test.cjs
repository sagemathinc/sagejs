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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-statistics-"));
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

from sagejs.numerics import (
    STATUS_CODES,
    NumericalDiagnostic,
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from sagejs.numerics.statistics import (
    RNG_ALGORITHM,
    RNG_CONTRACT_VERSION,
    Binomial,
    ChiSquare,
    Normal,
    Poisson,
    RandomStream,
    StudentT,
    cauchy_loss,
    confidence_interval_mean,
    correlation,
    covariance,
    describe,
    huber_loss,
    huber_regression,
    linear_regression,
    one_sample_t_test,
    quantile,
    sample,
    soft_l1_loss,
    theil_sen_regression,
    two_sample_t_test,
)

def close(left, right, tolerance=1e-11):
    return abs(left - right) <= tolerance * max(1.0, abs(right))

summary = describe([1.0, 2.0, 3.0, 4.0])
assert summary.success and summary.method == "corrected-two-pass"
assert summary.value["mean"] == 2.5
assert close(summary.value["variance"], 5.0 / 3.0)
assert summary.value["q1"] == 1.75 and summary.value["q3"] == 3.25
assert isinstance(summary, NumericalResult)
assert isinstance(summary.problem, NumericalProblem)
assert isinstance(summary.plan_record, NumericalPlan)
assert isinstance(summary.validation, NumericalValidation)
assert summary.validation.passed
assert summary.trace.events[0].kind == "start"
summary_record = json.loads(summary.to_json())
assert summary_record["schema_version"] == 1
assert summary_record["status"] in STATUS_CODES
assert {
    "schema_version", "problem_digest", "success", "status", "value",
    "validation", "diagnostics", "method", "backend", "precision",
    "iterations", "evaluations", "elapsed_ms", "measurements", "trace",
    "provenance", "reproducibility", "domain_payload",
}.issubset(summary_record)
detached_summary = summary.value
detached_summary["mean"] = -999
assert summary.value["mean"] == 2.5
detached_record = summary.to_dict()
detached_record["value"]["mean"] = -998
assert summary.to_dict()["value"]["mean"] == 2.5

shifted = describe([1e12 + value for value in (1.0, 2.0, 3.0, 4.0)])
assert shifted.value["variance"] == summary.value["variance"]
cancelled_summary = describe([1, 2, 3], cancel=lambda: True)
assert not cancelled_summary.success and cancelled_summary.status == "cancelled"
assert cancelled_summary.validation.truth_level == "indeterminate"
assert cancelled_summary.diagnostics[0].to_dict()["details"]["statistics_reason"] == "cancellation_callback"
assert quantile([1, 2, 3, 4], 0.25) == 1.75
assert quantile([-1e308, 1e308], 0.5) == 0.0
assert close(covariance([1, 2, 3], [2, 4, 6]), 2.0)
assert close(correlation([1, 2, 3], [6, 4, 2]), -1.0)
large_correlated = [-1e150, 0.0, 1e150]
assert close(correlation(large_correlated, large_correlated), 1.0, 2e-15)

normal = Normal()
student = StudentT(5)
chi_square = ChiSquare(4)
binomial = Binomial(10, 0.3)
poisson = Poisson(4)
for distribution, points in (
    (normal, (-8.0, -1.0, 0.0, 1.0, 8.0)),
    (student, (-10.0, -1.0, 0.0, 2.0, 10.0)),
    (chi_square, (0.0, 0.1, 1.0, 5.0, 20.0)),
):
    for point in points:
        assert close(distribution.cdf(point) + distribution.sf(point), 1.0, 2e-13)
    for probability in (0.001, 0.025, 0.5, 0.975, 0.999):
        candidate = distribution.quantile(probability)
        assert close(distribution.cdf(candidate), probability, 2e-10)

assert close(normal.quantile(0.975), 1.959963984540054)
assert close(student.quantile(0.975), 2.5705818356363146)
assert close(chi_square.quantile(0.95), 9.487729036781154)
assert close(
    ChiSquare(5).quantile(0.9999999999999999),
    84.1950322365213,
    2e-13,
)
assert close(StudentT(10000).cdf(1e-6), 0.500000398932307, 2e-13)
student_tail = StudentT(5).isf(1e-12)
assert close(StudentT(5).sf(student_tail) / 1e-12, 1.0, 2e-12)
chi_tail = ChiSquare(5).isf(1e-100)
assert close(ChiSquare(5).sf(chi_tail) / 1e-100, 1.0, 2e-12)
chi_lower = ChiSquare(.1).quantile(1e-12)
assert close(ChiSquare(.1).cdf(chi_lower) / 1e-12, 1.0, 2e-12)
assert binomial.quantile(0.75) == 4
assert poisson.quantile(0.75) == 5
assert close(sum(binomial.pmf(k) for k in range(11)), 1.0)
assert close(sum(poisson.pmf(k) for k in range(60)), 1.0)
assert Poisson(0).pmf(0) == 1.0 and Poisson(0).quantile(1.0) == 0
assert len(normal.plot("cdf", lower=-4, upper=4, points=33).layers) == 1

rng = RandomStream(42)
assert RNG_ALGORITHM == "pcg32-xsh-rr-v1"
assert RNG_CONTRACT_VERSION == 2
assert [rng.uint32() for _ in range(6)] == [
    2407118424, 709687639, 1786268354, 2856568764, 678584461, 1666930401
]
snapshot = rng.state()
assert isinstance(snapshot["state"], str) and snapshot["state"].startswith("0x")
assert isinstance(snapshot["increment"], str) and snapshot["increment"].startswith("0x")
assert RandomStream.from_state(json.loads(json.dumps(snapshot))).state() == snapshot
numeric_snapshot = dict(snapshot)
numeric_snapshot["state"] = 1
try:
    RandomStream.from_state(numeric_snapshot)
    raise AssertionError("browser-rounded numeric state must be rejected")
except ValueError:
    pass
continuation = [rng.random(), rng.normal(), rng.randbelow(17)]
restored = RandomStream.from_state(snapshot)
assert continuation == [restored.random(), restored.normal(), restored.randbelow(17)]
child_a = RandomStream(42).spawn(3)
child_b = RandomStream(42).spawn(3)
assert [child_a.uint32() for _ in range(3)] == [child_b.uint32() for _ in range(3)]
assert RandomStream(42).spawn(3).uint32() != RandomStream(42).spawn(4).uint32()

sample_a = sample(Normal(2, 3), 12, seed=2026)
sample_b = sample(Normal(2, 3), 12, seed=2026)
assert sample_a.success and sample_a.value == sample_b.value
sample_replay = sample_a.to_dict()["reproducibility"]
assert sample_replay["replayable"]
sample_evidence = sample_replay["problem"]["function"]["evidence"]
assert sample_evidence["rng_before"]["draw_count"] == "0"
assert int(sample_evidence["rng_after"]["draw_count"]) > 0
sample_cancelled = sample(Normal(), 12, seed=1, cancel=lambda: True)
assert sample_cancelled.status == "cancelled" and sample_cancelled.value == []
sample_limited = sample(
    Normal(), 12, seed=1,
    budget=ResourceBudget(max_iterations=4, max_evaluations=1),
)
assert sample_limited.status == "maximum_evaluations"
assert sample_limited.problem.resource_budget.max_evaluations == 1
assert sample(Poisson(0), 5, seed=1).value == [0, 0, 0, 0, 0]
unsupported_student = sample(StudentT(1e-300), 1, seed=0)
assert unsupported_student.status == "invalid_problem"
assert unsupported_student.diagnostics[0].code == "nonfinite_evaluation"
assert isinstance(unsupported_student.diagnostics[0], NumericalDiagnostic)
assert sample(ChiSquare(.01), 1, seed=0).status == "invalid_problem"
large_poisson_sample = sample(Poisson(1e6), 12, seed=1)
assert large_poisson_sample.success and len(set(large_poisson_sample.value)) > 1

data = [1.2, 2.4, 3.1, 4.9, 5.0, 7.3]
interval = confidence_interval_mean(data)
assert interval.success
assert close(interval.value["interval"][0], 1.6885300735771764)
assert close(interval.value["interval"][1], 6.278136593089491)
assert len(interval.to_plot_spec().layers) == 2
one = one_sample_t_test(data, 3.0)
assert one.success and close(one.value["statistic"], 1.1015056712578364)
assert close(one.value["p_value"], 0.3208546351075598)
assert one.assumptions and "assumptions:" in one.explain()
one_sided = one_sample_t_test([-.4, .6, 1.6, 2.6, 3.6], 0, alternative="greater")
assert one_sided.value["reject_at_alpha"]
assert one_sided.value["confidence_interval"][0] > 0
assert one_sided.value["confidence_interval"][1] is None
assert one_sided.validation.to_dict()["checks"][1]["passed"]
zero_variance = one_sample_t_test([4, 4, 4], 4)
assert zero_variance.status == "invalid_problem"
assert zero_variance.diagnostics[0].code == "validation_failed"

welch = two_sample_t_test(
    [1.0, 2.0, 4.0, 7.0, 8.0],
    [2.0, 3.0, 3.5, 4.0, 6.0, 9.0],
)
assert welch.success
assert close(welch.value["statistic"], -0.10703853682964778)
assert close(welch.value["degrees_of_freedom"], 7.856356479923678)
assert close(welch.value["p_value"], 0.9174412028711223)
large_welch = two_sample_t_test(
    [-1e150, 0.0, 1e150],
    [-1e150, 1e140, 1e150],
)
assert large_welch.success
assert "mutually independent" in " ".join(large_welch.assumptions)

x = [0, 1, 2, 3, 4, 5]
y = [1.1, 2.9, 5.2, 6.8, 9.1, 10.9]
ols = linear_regression(x, y)
assert ols.success and close(ols.value["slope"], 1.9771428571428569)
assert close(ols.value["intercept"], 1.0571428571428578)
assert close(ols.value["slope_standard_error"], 0.03979539507767356)
assert ols.validation.passed and len(ols.to_plot_spec().layers) == 2
large_ols = linear_regression(large_correlated, large_correlated)
assert large_ols.success and close(large_ols.value["correlation"], 1.0, 2e-15)
ill_x = [1e10 + value for value in range(-5, 6)]
ill_y = [-3e10 + 2*value + .01*((value*value) % 3) for value in range(-5, 6)]
ill_ols = linear_regression(ill_x, ill_y)
assert not ill_ols.success and ill_ols.status == "validation_failed"
assert ill_ols.value["slope"] is not None and not ill_ols.validation.passed
assert ill_ols.diagnostics[0].code == "validation_failed"

robust_x = list(range(8))
robust_y = [1 + 2*value for value in robust_x]
robust_y[-1] = 30
theil = theil_sen_regression(robust_x, robust_y)
assert theil.success and theil.value["slope"] == 2.0
assert theil.value["intercept"] == 1.0
assert theil.value["slope_confidence_interval"] == [2.0, 4.5]
huber = huber_regression(robust_x, robust_y)
assert huber.success
robust_ols = linear_regression(robust_x, robust_y)
assert abs(huber.value["slope"] - 2.0) < abs(robust_ols.value["slope"] - 2.0)
assert huber.value["weights"][-1] < 0.5
assert close(
    huber.value["objective"],
    sum(
        huber_loss(residual / huber.value["scale"]) * huber.value["scale"] ** 2
        for residual in huber.value["residuals"]
    ),
    2e-13,
)
assert len(huber.trace.events) >= 2

limited = theil_sen_regression(
    [0, 1, 2, 3], [0, 1, 2, 3],
    budget=ResourceBudget(max_iterations=4, max_evaluations=5),
)
assert limited.status == "maximum_evaluations"
cancelled = huber_regression([0, 1, 2], [0, 1, 2], cancel=lambda: True)
assert cancelled.status == "cancelled"
truncated = huber_regression(
    robust_x, robust_y,
    budget=ResourceBudget(
        max_iterations=100, max_evaluations=100000,
        max_trace_events=4, max_trace_bytes=4096,
    ),
)
assert truncated.trace.truncated and len(truncated.trace.events) <= 4

assert huber_loss(3) < 0.5 * 3 * 3
assert soft_l1_loss(3) < 3 * 3
assert cauchy_loss(3) < soft_l1_loss(3)
assert abs(soft_l1_loss(1e-9) / 1e-18 - 1.0) < 2e-15
assert math.isfinite(soft_l1_loss(1e155))
assert math.isfinite(cauchy_loss(1e155))

for function in (
    lambda: describe([]),
    lambda: describe([1, float("nan")]),
    lambda: Normal(0, 0),
    lambda: StudentT(0),
    lambda: StudentT(10001),
    lambda: StudentT(.01).quantile(.001),
    lambda: ChiSquare(.01).quantile(.001),
    lambda: ChiSquare(10001),
    lambda: ChiSquare(5).isf(1e-301),
    lambda: Poisson(1000001),
    lambda: Normal(1e308, 1e308).quantile(.9),
    lambda: ChiSquare(1).plot("pdf", lower=0, upper=1),
    lambda: RandomStream(-1),
    lambda: RandomStream(1 << 4097),
    lambda: confidence_interval_mean([1, 2, 3], 0.9999999999999999),
    lambda: linear_regression([1, 1, 1], [1, 2, 3]),
):
    try:
        function()
        raise AssertionError("expected an explicit invalid-input failure")
    except ValueError:
        pass

print("statistics vertical slice passed")
`;

test("statistics vertical slice agrees in CPython", () => {
  assert.equal(runCPython(witness), "statistics vertical slice passed");
});

test("statistics vertical slice runs in Sage.js", () => {
  assert.equal(runSagejs(witness), "statistics vertical slice passed");
});

const oracleText = readFileSync(join(__dirname, "oracle-fixtures.json"), "utf8");
const failureText = readFileSync(join(__dirname, "failure-corpus.json"), "utf8");

const oracleWitness = String.raw`
import json
from sagejs.numerics.statistics import (
    Binomial, ChiSquare, Normal, Poisson, StudentT,
    describe, linear_regression, one_sample_t_test, theil_sen_regression,
    two_sample_t_test,
)

records = json.loads(${JSON.stringify(oracleText)})

def close(left, right, absolute, relative):
    return abs(left - right) <= max(absolute, relative * max(1.0, abs(right)))

continuous = {
    "normal": Normal(),
    "student_t_5": StudentT(5),
    "chi_square_4": ChiSquare(4),
}
for name, distribution in continuous.items():
    for row in records["distributions"][name]:
        for function in ("pdf", "cdf", "sf"):
            assert close(getattr(distribution, function)(row["x"]), row[function], 5e-13, 5e-13)

quantiles = {
    "normal_quantiles": Normal(),
    "student_t_5_quantiles": StudentT(5),
    "chi_square_4_quantiles": ChiSquare(4),
}
for name, distribution in quantiles.items():
    for row in records["distributions"][name]:
        assert close(distribution.quantile(row["p"]), row["value"], 2e-13, 2e-11)

discrete = {
    "binomial_10_03": Binomial(10, .3),
    "poisson_4": Poisson(4),
}
for name, distribution in discrete.items():
    for row in records["distributions"][name]:
        for function in ("pmf", "cdf", "sf"):
            assert close(getattr(distribution, function)(row["k"]), row[function], 5e-13, 5e-13)

one_record = records["one_sample"]
one = one_sample_t_test(one_record["data"], one_record["null"])
one_summary = describe(one_record["data"])
assert close(one.value["estimate"], one_record["mean"], 5e-13, 5e-12)
assert close(one_summary.value["variance"], one_record["variance"], 5e-13, 5e-12)
assert one.value["degrees_of_freedom"] == one_record["df"]
assert close(one.value["statistic"], one_record["statistic"], 5e-13, 5e-12)
assert close(one.value["p_value"], one_record["p_value"], 5e-13, 5e-12)
for left, right in zip(one.value["confidence_interval"], one_record["ci"]):
    assert close(left, right, 5e-13, 5e-12)

welch_record = records["welch"]
welch = two_sample_t_test(welch_record["first"], welch_record["second"])
assert close(welch.value["statistic"], welch_record["statistic"], 5e-13, 5e-12)
assert close(welch.value["p_value"], welch_record["p_value"], 5e-13, 5e-12)
assert close(welch.value["degrees_of_freedom"], welch_record["df"], 5e-13, 5e-12)
assert close(welch.value["estimate"], welch_record["difference"], 5e-13, 5e-12)
for left, right in zip(welch.value["confidence_interval"], welch_record["ci"]):
    assert close(left, right, 5e-13, 5e-12)

linear_record = records["linear_regression"]
linear = linear_regression(linear_record["x"], linear_record["y"])
for output, reference in (
    ("slope", "slope"),
    ("intercept", "intercept"),
    ("correlation", "rvalue"),
    ("slope_p_value", "pvalue"),
    ("slope_standard_error", "stderr"),
    ("intercept_standard_error", "intercept_stderr"),
):
    assert close(linear.value[output], linear_record[reference], 5e-13, 5e-12)

theil_record = records["theil_sen"]
theil = theil_sen_regression(theil_record["x"], theil_record["y"])
assert close(theil.value["slope"], theil_record["slope"], 5e-13, 5e-12)
assert close(theil.value["intercept"], theil_record["intercept"], 5e-13, 5e-12)
assert close(theil.value["slope_confidence_interval"][0], theil_record["low_slope"], 5e-13, 5e-12)
assert close(theil.value["slope_confidence_interval"][1], theil_record["high_slope"], 5e-13, 5e-12)
print("oracle corpus executed")
`;

const failureWitness = String.raw`
import json
from sagejs.numerics import ResourceBudget
from sagejs.numerics.statistics import (
    Normal, RandomStream, StudentT, describe, huber_regression,
    linear_regression, one_sample_t_test, sample, theil_sen_regression,
)

records = json.loads(${JSON.stringify(failureText)})
for case in records["cases"]:
    operation = case["operation"]
    expected_failure = case.get("failure")
    try:
        if operation == "describe":
            data = [float("nan") if value == "NaN" else value for value in case["input"]]
            result = describe(data)
        elif operation == "Normal":
            result = Normal(standard_deviation=case["input"]["standard_deviation"])
        elif operation == "StudentT":
            result = StudentT(case["input"]["degrees_of_freedom"])
        elif operation == "RandomStream":
            result = RandomStream(case["input"]["seed"])
        elif operation == "one_sample_t_test":
            result = one_sample_t_test(case["input"])
        elif operation == "linear_regression":
            result = linear_regression(case["input"]["x"], case["input"]["y"])
        elif operation == "theil_sen_regression":
            result = theil_sen_regression(
                case["input"]["x"], case["input"]["y"],
                budget=ResourceBudget(max_iterations=4, max_evaluations=case["input"]["max_evaluations"]),
            )
        elif operation == "huber_regression":
            result = huber_regression(
                case["input"]["x"], case["input"]["y"], cancel=lambda: True,
            )
        elif operation == "sample":
            result = sample(
                Normal(), case["input"]["size"], seed=1,
                budget=ResourceBudget(max_iterations=4, max_evaluations=case["input"]["max_evaluations"]),
            )
        else:
            raise AssertionError("unhandled failure corpus operation: " + operation)
        if expected_failure is not None:
            raise AssertionError("expected " + expected_failure + " for " + operation)
        assert result.status == case["status"]
        if case.get("diagnostic") is not None:
            assert result.diagnostics[0].code == case["diagnostic"]
    except ValueError:
        if expected_failure != "ValueError":
            raise
print("failure corpus executed")
`;

test("SciPy oracle corpus executes in CPython and Sage.js", () => {
  assert.equal(runCPython(oracleWitness), "oracle corpus executed");
  assert.equal(runSagejs(oracleWitness), "oracle corpus executed");
});

test("failure corpus executes in CPython and Sage.js", () => {
  assert.equal(runCPython(failureWitness), "failure corpus executed");
  assert.equal(runSagejs(failureWitness), "failure corpus executed");
});

test("RNG replay JSON survives a browser-number boundary", () => {
  const source = String.raw`
import json
from sagejs.numerics.statistics import RandomStream
stream = RandomStream(42)
stream.normal()
print(json.dumps(stream.state(), sort_keys=True))
`;
  const cpython = runCPython(source);
  const sagejs = runSagejs(source);
  const parsed = JSON.parse(cpython);
  assert.deepEqual(JSON.parse(sagejs), parsed);
  assert.equal(typeof parsed.state, "string");
  assert.equal(typeof parsed.increment, "string");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), parsed);
});

test("offline SciPy/R and failure corpora remain versioned", () => {
  const oracle = JSON.parse(oracleText);
  const failures = JSON.parse(failureText);
  assert.equal(oracle.schema_version, 1);
  assert.match(oracle.provenance.generated_with, /^SciPy /);
  assert.match(oracle.provenance.secondary_oracle, /^R stats /);
  assert.ok(oracle.distributions.normal.length >= 5);
  assert.ok(oracle.distributions.student_t_5_quantiles.length >= 5);
  assert.equal(failures.schema_version, 1);
  assert.ok(failures.cases.length >= 10);
});
