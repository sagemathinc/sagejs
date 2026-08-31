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

from sagejs.numerics import ResourceBudget
from sagejs.numerics.statistics import (
    RNG_ALGORITHM,
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
assert summary.validation["passed"]
assert summary.trace.events[0].kind == "start"
assert json.loads(summary.to_json())["schema_version"] == 1

shifted = describe([1e12 + value for value in (1.0, 2.0, 3.0, 4.0)])
assert shifted.value["variance"] == summary.value["variance"]
cancelled_summary = describe([1, 2, 3], cancel=lambda: True)
assert not cancelled_summary.success and cancelled_summary.status == "cancelled"
assert quantile([1, 2, 3, 4], 0.25) == 1.75
assert close(covariance([1, 2, 3], [2, 4, 6]), 2.0)
assert close(correlation([1, 2, 3], [6, 4, 2]), -1.0)

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
assert binomial.quantile(0.75) == 4
assert poisson.quantile(0.75) == 5
assert close(sum(binomial.pmf(k) for k in range(11)), 1.0)
assert close(sum(poisson.pmf(k) for k in range(60)), 1.0)
assert Poisson(0).pmf(0) == 1.0 and Poisson(0).quantile(1.0) == 0
assert len(normal.plot("cdf", lower=-4, upper=4, points=33).layers) == 1

rng = RandomStream(42)
assert RNG_ALGORITHM == "pcg32-xsh-rr-v1"
assert [rng.uint32() for _ in range(6)] == [
    2407118424, 709687639, 1786268354, 2856568764, 678584461, 1666930401
]
snapshot = rng.state()
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
assert sample_a.to_dict()["reproducibility"]["rng_before"]["draw_count"] == 0
assert json.loads(sample_a.to_json())["reproducibility"]["rng_after"]["draw_count"] > 0
sample_cancelled = sample(Normal(), 12, seed=1, cancel=lambda: True)
assert sample_cancelled.status == "cancelled" and sample_cancelled.value == []
sample_limited = sample(
    Normal(), 12, seed=1,
    budget=ResourceBudget(max_iterations=4, max_evaluations=1),
)
assert sample_limited.status == "maximum_evaluations"
assert sample(Poisson(0), 5, seed=1).value == [0, 0, 0, 0, 0]

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
zero_variance = one_sample_t_test([4, 4, 4], 4)
assert zero_variance.status == "invalid_problem"
assert zero_variance.diagnostics[0]["code"] == "zero_variance"

welch = two_sample_t_test(
    [1.0, 2.0, 4.0, 7.0, 8.0],
    [2.0, 3.0, 3.5, 4.0, 6.0, 9.0],
)
assert welch.success
assert close(welch.value["statistic"], -0.10703853682964778)
assert close(welch.value["degrees_of_freedom"], 7.856356479923678)
assert close(welch.value["p_value"], 0.9174412028711223)

x = [0, 1, 2, 3, 4, 5]
y = [1.1, 2.9, 5.2, 6.8, 9.1, 10.9]
ols = linear_regression(x, y)
assert ols.success and close(ols.value["slope"], 1.9771428571428569)
assert close(ols.value["intercept"], 1.0571428571428578)
assert close(ols.value["slope_standard_error"], 0.03979539507767356)
assert ols.validation["passed"] and len(ols.to_plot_spec().layers) == 2

robust_x = list(range(8))
robust_y = [1 + 2*value for value in robust_x]
robust_y[-1] = 30
theil = theil_sen_regression(robust_x, robust_y)
assert theil.success and theil.value["slope"] == 2.0
assert theil.value["intercept"] == 1.0
assert theil.value["slope_confidence_interval"] == [2.0, 4.5]
huber = huber_regression(robust_x, robust_y)
assert huber.success
assert close(huber.value["slope"], 2.0, 2e-7)
assert close(huber.value["intercept"], 1.0, 2e-7)
assert huber.value["weights"][-1] < 1e-5
assert len(huber.trace.events) >= 3

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

for function in (
    lambda: describe([]),
    lambda: describe([1, float("nan")]),
    lambda: Normal(0, 0),
    lambda: StudentT(0),
    lambda: RandomStream(-1),
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

test("offline SciPy/R and failure corpora remain versioned", () => {
  const oracle = JSON.parse(readFileSync(
    join(__dirname, "oracle-fixtures.json"), "utf8",
  ));
  const failures = JSON.parse(readFileSync(
    join(__dirname, "failure-corpus.json"), "utf8",
  ));
  assert.equal(oracle.schema_version, 1);
  assert.match(oracle.provenance.generated_with, /^SciPy /);
  assert.match(oracle.provenance.secondary_oracle, /^R stats /);
  assert.ok(oracle.distributions.normal.length >= 5);
  assert.ok(oracle.distributions.student_t_5_quantiles.length >= 5);
  assert.equal(failures.schema_version, 1);
  assert.ok(failures.cases.length >= 10);
});
