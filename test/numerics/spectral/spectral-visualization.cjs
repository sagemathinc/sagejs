#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-spectral-visual-"));
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
  const executable =
    process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

const witness = String.raw`
import json
from sagejs.numerics import (
    NumericalPlan,
    NumericalProblem,
    NumericalTrace,
    NumericalValidation,
    TracePolicy,
)
from sagejs.numerics.spectral import (
    SpectralResult,
    capabilities,
    convolve,
    fft,
    general_eigen,
    plan as spectral_plan,
    supports as spectral_supports,
    svd,
    symmetric_eigen,
)
from sagejs.numerics.spectral.visualization import _convergence_spec

def checked_plot(spec, alt_fragment):
    assert alt_fragment in spec.alt_text()
    assert spec.description()["layer_count"] == len(spec.layers)
    assert spec.describe()
    assert len(spec.validate()) == 0, [item.to_dict() for item in spec.validate()]
    json.loads(spec.to_json())

def checked_animation(animation):
    assert 2 <= len(animation.frames) <= 32
    record = animation.to_dict()
    assert record["metadata"]["computed_evidence_only"]
    assert isinstance(record["metadata"]["static_fallback"], dict)
    baseline = [
        (layer.kind, layer.id) for layer in animation.frames[0].state.layers
    ]
    for frame in animation.frames:
        assert [(layer.kind, layer.id) for layer in frame.state.layers] == baseline
        assert "status" in frame.state.alt_text().lower()
        assert frame.state.description()["layer_count"] == len(frame.state.layers)
        assert frame.state.describe()
        assert len(frame.state.validate()) == 0, [
            item.to_dict() for item in frame.state.validate()
        ]
        json.loads(frame.state.to_json())
    json.loads(animation.to_json())

def forbidden_callback(*args):
    raise AssertionError("spectral discovery evaluated an opaque callback")

fft_problem = NumericalProblem(
    "spectral",
    "fourier_transform",
    function=forbidden_callback,
    initial_data={"samples": [0.0 for _ in range(7)]},
    method="auto",
)
assert spectral_supports(fft_problem)
fft_plan = spectral_plan(fft_problem)
assert fft_plan.method == "bluestein_radix2"
assert fft_plan.to_dict()["capability"]["selected_method"] == "bluestein_radix2"
assert spectral_plan(
    NumericalProblem(
        "spectral",
        "inverse_fourier_transform",
        initial_data={"samples": [0.0 for _ in range(8)]},
    )
).method == "radix2_cooley_tukey"

convolution_problem = NumericalProblem(
    "spectral",
    "convolution",
    initial_data={
        "left": [0.0 for _ in range(65)],
        "right": [0.0 for _ in range(65)],
    },
)
assert spectral_plan(convolution_problem).method == "fft"

uncertified_sparse = NumericalProblem(
    "spectral",
    "sparse_linear_solve",
    numeric_type="complex_binary64",
    metadata={"spd_certified": False},
)
assert spectral_supports(uncertified_sparse)
assert spectral_plan(uncertified_sparse).method == "bicgstab"
assert not spectral_supports(uncertified_sparse, "cg")
try:
    spectral_plan(uncertified_sparse, "cg")
    raise AssertionError("spectral planner inferred SPD without a certificate")
except ValueError:
    pass

uncertified_dominance = NumericalProblem(
    "spectral",
    "sparse_dominant_eigen",
    metadata={"dominant_magnitude_certified": False},
)
assert not spectral_supports(uncertified_dominance)
assert not spectral_supports(
    NumericalProblem("optimization", "fourier_transform", initial_data={"samples": [1.0]})
)

detached = capabilities("fourier_transform")
assert detached["operations"]["fourier_transform"]["visualization"] == [
    "spectrum", "aliasing", "convergence"
]
detached["operations"]["fourier_transform"]["methods"].append("invented")
assert "invented" not in capabilities("fourier_transform")["operations"][
    "fourier_transform"
]["methods"]

hermitian = symmetric_eigen(
    [[4.0, 1.0, 0.0], [1.0, 3.0, 0.5], [0.0, 0.5, 1.0]],
    trace="iterations",
)
assert isinstance(hermitian, SpectralResult)
explanation = hermitian.explanation()
assert explanation["schema_version"] == 1
assert explanation["domain"] == "spectral"
assert explanation["operation"] == "symmetric_eigen"
assert explanation["visualization"]["computed_evidence_only"]
assert any(mode["kind"] == "convergence" for mode in explanation["failure_modes"])
assert "Hermitian eigensystem" in hermitian.explain()
json.loads(hermitian.explanation_json())
checked_plot(hermitian.plot(), "Complex-plane eigensystem")
checked_plot(hermitian.plot("convergence"), "Convergence evidence")
checked_animation(hermitian.animate("convergence"))
checked_animation(hermitian.animate("result"))

unsafe = general_eigen(
    [[1.0, 1.0], [0.0, 1.0 + 1e-12]], trace="iterations"
)
assert not unsafe.success and unsafe.value is None
unsafe_explanation = unsafe.explanation()
conditioning_modes = [
    mode for mode in unsafe_explanation["failure_modes"]
    if mode["kind"] == "conditioning"
]
assert conditioning_modes[0]["detected"]
assert "detected failure mode: conditioning" in unsafe.explain()
conditioning_plot = unsafe.plot()
checked_plot(conditioning_plot, "no eigensystem was returned")
assert conditioning_plot.layers[0].source_intent["role"] == "eigenbasis_reciprocal_condition"

decomposition = svd(
    [[3.0, 0.0, 0.0], [0.0, 1e-8, 0.0], [0.0, 0.0, 0.0]],
    trace="iterations",
)
assert decomposition.success
checked_plot(decomposition.plot(), "Reduced SVD singular spectrum")
checked_plot(decomposition.plot("conditioning"), "Reduced SVD singular spectrum")
checked_animation(decomposition.animate("convergence"))
checked_animation(decomposition.animate("result"))

transform = fft(
    [1.0, 0.0, -1.0, 0.0, 0.5, 0.0, -0.5], trace="iterations"
)
assert transform.success
fft_explanation = transform.explanation()
alias_modes = [
    mode for mode in fft_explanation["failure_modes"] if mode["kind"] == "aliasing"
]
assert len(alias_modes) == 1 and not alias_modes[0]["detected"]
assert "modulo one cycle per sample" in fft_explanation["interpretation"]
checked_plot(transform.plot(), "Discrete Fourier magnitude spectrum")
alias_plot = transform.plot("aliasing")
checked_plot(alias_plot, "Aliasing explanation")
assert len(alias_plot.layers) == 3
checked_animation(transform.animate("convergence"))
checked_animation(transform.animate("result"))

left = [float((index % 5) - 2) for index in range(70)]
right = [float((index % 7) - 3) for index in range(70)]
product = convolve(left, right, method="fft", trace="iterations")
assert product.success
checked_plot(product.plot(), "Linear-convolution output")
wrapped = product.plot("aliasing")
checked_plot(wrapped, "Circular-convolution aliasing map")
assert wrapped.layers[0].data["circular_period"] == 70
checked_animation(product.animate("convergence"))
checked_animation(product.animate("result"))

direct = convolve([1.0, 2.0], [3.0, 4.0], method="direct", trace="iterations")
assert direct.explanation()["visualization"]["available_animation_kinds"] == [
    "result"
]
try:
    direct.animate("convergence")
    raise AssertionError("direct convolution invented convergence trace events")
except ValueError:
    pass
checked_animation(direct.animate())

large = fft([float(index % 13) for index in range(2048)])
large_plot = large.plot()
assert len(large_plot.layers[0].data["x"]) == 1024
approximations = large_plot.provenance["approximations"]
assert approximations[0]["kind"] == "deterministic_visual_decimation"
assert approximations[0]["source_count"] == 2048
assert approximations[0]["retained_count"] == 1024
checked_plot(large_plot, "1024 of 2048 bins")

extreme_problem = NumericalProblem(
    "spectral",
    "fourier_transform",
    initial_data={"samples": [0.0]},
)
extreme_plan = NumericalPlan(
    extreme_problem,
    method="radix2_cooley_tukey",
    backend="ordinary-python",
    reason="finite-component visualization scale witness",
    capability={"classification": "translated"},
)
extreme_transform = SpectralResult(
    extreme_problem,
    extreme_plan,
    success=True,
    status="converged",
    value=[[1.7e308, 1.7e308]],
    validation=NumericalValidation("validated_approximate", True),
)
extreme_plot = extreme_transform.plot()
checked_plot(extreme_plot, "remain representable")
assert extreme_plot.layers[0].data["magnitude_scale"] == 1.7e308
assert extreme_plot.provenance["approximations"][0]["kind"] == (
    "binary64_magnitude_normalization"
)
json.loads(extreme_transform.animate("result").to_json())

long_trace_policy = TracePolicy("iterations", max_events=100, max_bytes=100000)
long_trace_problem = NumericalProblem(
    "spectral",
    "sparse_linear_solve",
    trace_policy=long_trace_policy,
)
long_trace_plan = NumericalPlan(
    long_trace_problem,
    method="bicgstab",
    backend="ordinary-python",
    reason="bounded retained-trace visualization witness",
    capability={"classification": "extension"},
)
animation_trace = NumericalTrace(long_trace_policy)
for index in range(33):
    animation_trace.append(
        "iteration",
        data={"residual_norm": 1.0 / (index + 1), "target": 1e-10},
    )
animation_result = SpectralResult(
    long_trace_problem,
    long_trace_plan,
    success=False,
    status="maximum_iterations",
    validation=NumericalValidation("indeterminate", False),
    trace=animation_trace,
)
bounded_animation = animation_result.animate("convergence")
assert len(bounded_animation.frames) == 32
json.loads(bounded_animation.to_json())

decimation_records = [
    {
        "sequence": index,
        "metric": "residual_norm",
        "value": 1.0 / (index + 1),
        "target": 1e-10,
        "phase": "iteration",
    }
    for index in range(1100)
]
bounded_progress = _convergence_spec(animation_result, decimation_records)
assert len(bounded_progress.layers[0].data["x"]) == 1024
assert bounded_progress.provenance["approximations"][0]["kind"] == (
    "deterministic_visual_decimation"
)

truncated = symmetric_eigen(
    [[4.0, 1.0, 0.5], [1.0, 3.0, 0.25], [0.5, 0.25, 2.0]],
    trace="iterations",
    max_trace_events=4,
)
assert truncated.trace.truncated
truncated_animation = truncated.animate("convergence")
assert len(truncated_animation.frames) <= 4
assert truncated_animation.to_dict()["metadata"]["trace_truncated"]

print("spectral explanations and visualizations passed")
`;

test("spectral explanations and PlotSpec views agree in CPython", () => {
  assert.equal(
    runCPython(witness),
    "spectral explanations and visualizations passed",
  );
});

test("spectral explanations and PlotSpec views run in Sage.js", () => {
  assert.equal(
    runSagejs(witness),
    "spectral explanations and visualizations passed",
  );
});
