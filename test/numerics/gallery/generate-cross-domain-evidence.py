#!/usr/bin/env python3
"""Generate deterministic, callback-free evidence for the numerical gallery.

The gallery is deliberately downstream of the public numerical contracts.  A
story is made from a completed result, its retained trace, and its public
PlotSpec presentation.  Presentation happens only after the solver callback
count has been frozen, and every story records that the count stayed frozen.
"""

from __future__ import annotations

import collections.abc  # noqa: F401 -- needed by the Sage.js CPython shim
import hashlib  # noqa: F401 -- preload stdlib before src/lib shadows it
import json
import math
import sys
import typing  # noqa: F401 -- preload stdlib before src/lib shadows it
from collections.abc import Callable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sagejs.numerics import find_root
from sagejs.numerics.approximation import chebyshev_approximation, interpolate
from sagejs.numerics.integration import integrate
from sagejs.numerics.linear_algebra import solve
from sagejs.numerics.ode import OdeInvariant, solve_ivp
from sagejs.numerics.optimization import curve_fit, minimize
from sagejs.numerics.spectral import general_eigen, symmetric_eigen
from sagejs.numerics.statistics import huber_regression, linear_regression
from sagejs.plotting import (
    AnimationFrame,
    AnimationResourceLimits,
    AnimationTiming,
    PlotAnimation,
    PlotSpec,
    Provenance,
    lower_plot_animation,
    lower_plot_spec,
    make_layer,
    stable_frame_id,
)
from generate_sweep_evidence import sweep_story

SCHEMA = "sagejs.numerics.gallery.story/v1"


class Counted:
    """A tiny counter that keeps callback accounting explicit in the fixture."""

    def __init__(self, function: Callable[..., Any]) -> None:
        self.function = function
        self.calls = 0

    def __call__(self, *args: Any) -> Any:
        self.calls += 1
        return self.function(*args)


def _stable_result(result: Any) -> dict[str, Any]:
    record = result.to_dict()
    record["elapsed_ms"] = 0.0
    measurements = dict(record.get("measurements", {}))
    measurements.pop("elapsed_ms", None)
    measurements["fixture_elapsed_policy"] = "normalized; measured by the benchmark"
    record["measurements"] = measurements
    return record


def _diagnostic_codes(result: Any) -> list[str]:
    return [item.code for item in result.diagnostics]


def _bounded_indices(count: int, maximum: int) -> list[int]:
    if count <= maximum:
        return list(range(count))
    if maximum < 2:
        return [count - 1]
    indices = [(index * (count - 1)) // (maximum - 1) for index in range(maximum)]
    return list(dict.fromkeys(indices))


def _root_trace_animation(result: Any) -> PlotAnimation:
    """Replay retained root evidence without invoking the live callback.

    The public root visualizer now enforces this same durable-evidence contract.
    This compatibility helper preserves older fixture generation without ever
    sampling a callback or inventing intermediate states.
    """

    evaluations: list[dict[str, float]] = []
    iterations: list[dict[str, Any]] = []
    for event in result.trace.events:
        if event.kind == "evaluation":
            evaluations.append(
                {"x": float(event.data["x"]), "value": float(event.data["value"])}
            )
        elif event.kind == "iteration":
            iterations.append(dict(event.data))
    if not iterations:
        iterations = [{}, {}]
    elif len(iterations) == 1:
        iterations = [{}, iterations[0]]
    selected = _bounded_indices(len(iterations), 32)
    lower, upper = [float(value) for value in result.problem.bounds["bracket"]]

    def spec(through: int, iteration: dict[str, Any]) -> PlotSpec:
        candidate = float(
            iteration.get("candidate", result.value or (lower + upper) / 2)
        )
        bracket = iteration.get("bracket", [lower, upper])
        bracket = [float(bracket[0]), float(bracket[1])]
        retained = evaluations[:]
        # The trace may contain later validation evaluations.  Bound the visual
        # prefix by the candidate's last matching evaluation when possible.
        matching = [
            index for index, record in enumerate(retained) if record["x"] == candidate
        ]
        if matching:
            retained = retained[: matching[-1] + 1]
        candidate_y = next(
            (
                record["value"]
                for record in reversed(retained)
                if record["x"] == candidate
            ),
            None,
        )
        layers = [
            make_layer(
                "point",
                {
                    "x": [record["x"] for record in retained],
                    "y": [record["value"] for record in retained],
                },
                ordinal=0,
                namespace="numerical-gallery-root",
                source_intent={"operation": "scalar_root", "role": "evaluations"},
                style={"color": "#3366cc", "size": 6},
                legend={"label": "retained function evaluations", "show": True},
            ),
            make_layer(
                "line",
                {"x": bracket, "y": [0.0, 0.0]},
                ordinal=1,
                namespace="numerical-gallery-root",
                source_intent={"operation": "scalar_root", "role": "bracket"},
                style={"color": "#dd8452", "width": 5},
                legend={"label": "retained bracket", "show": True},
            ),
            make_layer(
                "point",
                {"x": [candidate], "y": [candidate_y]},
                ordinal=2,
                namespace="numerical-gallery-root",
                source_intent={"operation": "scalar_root", "role": "candidate"},
                style={"color": "#55a868", "size": 11},
                legend={"label": "current candidate", "show": True},
            ),
        ]
        return PlotSpec(
            2,
            layers,
            axes_or_scene={
                "xaxis": {
                    "title": {"text": "x"},
                    "range": [lower, upper],
                    "autorange": False,
                },
                "yaxis": {"title": {"text": "retained f(x) evaluations"}},
            },
            viewport={"responsive": True},
            provenance=Provenance(
                "sagejs.numerics.gallery",
                constructor="root_trace_animation",
                metadata={
                    "problem_digest": result.problem.digest,
                    "computed_evidence_only": True,
                    "callback_reevaluated": False,
                    "trace_prefix": through + 1,
                },
            ),
        )

    frames = []
    for frame_index, record_index in enumerate(selected):
        record = iterations[record_index]
        state = spec(record_index, record)
        frames.append(
            AnimationFrame(
                stable_frame_id(frame_index),
                state,
                label="retained iteration " + str(record_index + 1),
                metadata={
                    "trace_data": record,
                    "source_iteration": record_index + 1,
                    "interpolated": False,
                },
            )
        )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=32,
            max_layers_per_frame=3,
            max_total_samples=8192,
            max_payload_bytes=4_000_000,
            max_duration_ms=11_200,
        ),
        metadata={
            "source": "retained-root-trace",
            "computed_evidence_only": True,
            "callback_reevaluated": False,
            "trace_truncated": result.trace.truncated,
        },
    )


def _gallery_plotly_trace(layer: dict[str, Any]) -> dict[str, Any]:
    """Lower only the bounded 2-D evidence layer kinds used by the gallery."""

    kind = str(layer["kind"])
    if kind not in ("line", "point", "text"):
        raise ValueError("gallery Plotly lowering does not support layer kind " + kind)
    data = layer.get("data", {})
    style = layer.get("style", {})
    legend = layer.get("legend", {})
    common: dict[str, Any] = {
        "uid": layer["id"],
        "name": legend.get("label", layer["id"]),
        "showlegend": bool(legend.get("show", False)),
        "x": data.get("x", []),
        "y": data.get("y", []),
        "type": "scatter",
        "hovertemplate": "%{x:.8g}, %{y:.8g}<extra></extra>",
    }
    if kind == "line":
        common["mode"] = "lines"
        common["connectgaps"] = False
        common["line"] = {
            "color": style.get("color", "#3366cc"),
            "width": style.get("width", 2),
        }
    elif kind == "point":
        common["mode"] = "markers"
        common["marker"] = {
            "color": style.get("color", "#dd8452"),
            "size": style.get("size", 7),
        }
    else:
        common["mode"] = "text"
        common["text"] = data.get("text", [])
        common["textfont"] = {
            "color": style.get("color", "#202124"),
            "size": style.get("size", 14),
        }
    return common


def _gallery_plotly_layout(spec: dict[str, Any]) -> dict[str, Any]:
    axes = spec.get("axes_or_scene", {})

    def axis(name: str, canonical: str) -> dict[str, Any]:
        source = axes.get(name, axes.get(canonical, {}))
        output: dict[str, Any] = {}
        label = source.get("label")
        if label is not None:
            output["title"] = {"text": str(label)}
        title = source.get("title")
        if title is not None:
            output["title"] = title
        for key in ("range", "autorange", "type", "zeroline", "visible"):
            if key in source:
                output[key] = source[key]
        scale = source.get("scale")
        if scale == "log":
            output["type"] = "log"
        return output

    return {
        "autosize": True,
        "xaxis": axis("x", "xaxis"),
        "yaxis": axis("y", "yaxis"),
        "hovermode": "closest",
        "meta": {
            "semantic_source": "PlotSpec",
            "stable_layer_ids": [layer["id"] for layer in spec["layers"]],
            "gallery_lowering": "bounded point/line/text only",
        },
    }


def _gallery_lower_spec(spec: dict[str, Any]) -> dict[str, Any]:
    if spec.get("dimension") != 2:
        raise ValueError("gallery Plotly lowering is limited to 2-D evidence")
    return {
        "data": [_gallery_plotly_trace(layer) for layer in spec["layers"]],
        "layout": _gallery_plotly_layout(spec),
        "config": {"responsive": True, "displaylogo": False},
    }


def _gallery_lower_animation(animation: dict[str, Any]) -> dict[str, Any]:
    frames = []
    for frame in animation["frames"]:
        figure = _gallery_lower_spec(frame["state"]["value"])
        frames.append(
            {
                "name": frame["id"],
                "data": figure["data"],
                "traces": list(range(len(figure["data"]))),
                "layout": {},
                "meta": {
                    "semantic_frame_id": frame["id"],
                    "label": frame.get("label"),
                },
            }
        )
    first = _gallery_lower_spec(animation["frames"][0]["state"]["value"])
    duration = animation.get("timing", {}).get("frame_duration_ms", 350)
    transition = animation.get("timing", {}).get("transition_duration_ms", 0)
    step_options = {
        "frame": {"duration": duration, "redraw": True},
        "transition": {"duration": transition},
        "mode": "immediate",
    }
    first["frames"] = frames
    first["layout"]["updatemenus"] = [
        {
            "type": "buttons",
            "direction": "left",
            "showactive": False,
            "buttons": [
                {"label": "Play", "method": "animate", "args": [None, step_options]},
                {
                    "label": "Pause",
                    "method": "animate",
                    "args": [
                        [None],
                        {
                            "frame": {"duration": 0, "redraw": True},
                            "transition": {"duration": 0},
                            "mode": "immediate",
                        },
                    ],
                },
            ],
        }
    ]
    first["layout"]["sliders"] = [
        {
            "active": 0,
            "currentvalue": {"prefix": "Evidence step: "},
            "steps": [
                {
                    "label": str(index + 1),
                    "method": "animate",
                    "args": [[frame["name"]], step_options],
                }
                for index, frame in enumerate(frames)
            ],
        }
    ]
    first["layout"]["meta"]["semantic_source"] = "PlotAnimation"
    return first


def _bounded_animation(animation: PlotAnimation, maximum: int = 32) -> PlotAnimation:
    """Select computed frames deterministically; never interpolate new states."""

    if len(animation.frames) <= maximum:
        return animation
    selected = _bounded_indices(len(animation.frames), maximum)
    frames = []
    for output_index, source_index in enumerate(selected):
        source = animation.frames[source_index]
        metadata = dict(source.metadata)
        metadata.update(
            {
                "source_frame_id": source.id,
                "source_frame_index": source_index,
                "interpolated": False,
            }
        )
        frames.append(
            AnimationFrame(
                stable_frame_id(output_index),
                source.state,
                label=source.label,
                metadata=metadata,
            )
        )
    metadata = dict(animation.to_dict()["metadata"])
    metadata.update(
        {
            "gallery_decimated": True,
            "source_frame_count": len(animation.frames),
            "selected_source_indices": selected,
            "decimation_policy": "deterministic evenly spaced computed frames",
            "interpolation": "none",
        }
    )
    return PlotAnimation(
        frames,
        timing=animation.timing,
        controls=animation.controls,
        limits=AnimationResourceLimits(
            max_frames=maximum,
            max_layers_per_frame=32,
            max_total_samples=131_072,
            max_payload_bytes=4_000_000,
            max_duration_ms=maximum * animation.timing.frame_duration_ms,
        ),
        metadata=metadata,
    )


def _presentation(
    result: Any,
    animation: PlotAnimation,
    *,
    callback_before: int | None = None,
    callback_after: int | None = None,
    source: str,
    gap: str | None = None,
) -> dict[str, Any]:
    animation = _bounded_animation(animation)
    semantic = animation.to_dict()
    shared_lowering: dict[str, Any] = {"status": "available", "diagnostics": []}
    try:
        plotly_figure = lower_plot_animation(animation)
        plotly_source = "sagejs.plotting.lower_plot_animation"
    except Exception as error:
        # Preserve an unexpected integration failure explicitly.  The tiny
        # fallback is deliberately limited to bounded point/line/text evidence
        # and is never treated as equivalent to the shared lowering contract.
        shared_lowering = {
            "status": "blocked",
            "error_type": type(error).__name__,
            "message": str(error),
        }
        plotly_figure = _gallery_lower_animation(semantic)
        plotly_source = "bounded gallery point/line/text lowering"
    static_spec = animation.frames[-1].state
    static = static_spec.to_dict()
    return {
        "source": source,
        "computed_evidence_only": True,
        "callback_reevaluated": (
            callback_before is not None
            and callback_after is not None
            and callback_before != callback_after
        ),
        "callback_count_before": callback_before,
        "callback_count_after": callback_after,
        "public_surface_gap": gap,
        "static_description": static_spec.alt_text(),
        "plot_spec": static,
        "plot_animation": semantic,
        "plotly": {
            "schema": "plotly-compatible/v1",
            "source": plotly_source,
            "shared_lowering": shared_lowering,
            "figure": plotly_figure,
        },
    }


def _static_presentation(result: Any, spec: PlotSpec, *, source: str) -> dict[str, Any]:
    semantic = spec.to_dict()
    shared_lowering: dict[str, Any] = {"status": "available", "diagnostics": []}
    try:
        plotly_figure = lower_plot_spec(spec)
        plotly_source = "sagejs.plotting.lower_plot_spec"
    except Exception as error:
        shared_lowering = {
            "status": "blocked",
            "error_type": type(error).__name__,
            "message": str(error),
        }
        plotly_figure = _gallery_lower_spec(semantic)
        plotly_source = "bounded gallery point/line/text lowering"
    return {
        "source": source,
        "computed_evidence_only": True,
        "callback_reevaluated": False,
        "callback_count_before": None,
        "callback_count_after": None,
        "public_surface_gap": None,
        "static_description": spec.alt_text(),
        "plot_spec": semantic,
        "plot_animation": None,
        "plotly": {
            "schema": "plotly-compatible/v1",
            "source": plotly_source,
            "shared_lowering": shared_lowering,
            "figure": plotly_figure,
        },
    }


def _case(
    case_id: str,
    title: str,
    kind: str,
    question: str,
    description: str,
    result: Any,
    presentation: dict[str, Any] | None = None,
    *,
    evidence: list[str] | None = None,
    reference_comparison: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = {
        "id": case_id,
        "title": title,
        "kind": kind,
        "question": question,
        "static_description": description,
        "result": _stable_result(result),
        "evidence": evidence
        or [
            "/result/status",
            "/result/success",
            "/result/validation/passed",
            "/result/diagnostics",
        ],
        "presentation": presentation,
    }
    if reference_comparison is not None:
        record["reference_comparison"] = reference_comparison
    return record


def _root_reference_comparison(
    primary: Any,
    reference: Any,
    *,
    primary_callback_calls: int,
    reference_callback_calls: int,
) -> dict[str, Any]:
    primary_record = _stable_result(primary)
    reference_record = _stable_result(reference)
    threshold = max(
        float(primary_record["reproducibility"]["problem"]["tolerances"]["xtol"]),
        float(reference_record["reproducibility"]["problem"]["tolerances"]["xtol"]),
    )
    difference = abs(float(primary_record["value"]) - float(reference_record["value"]))

    def summary(record: dict[str, Any], callback_calls: int) -> dict[str, Any]:
        return {
            "method": record["method"],
            "value": record["value"],
            "residual": record["validation"]["residual"],
            "iterations": record["iterations"],
            "evaluations": record["evaluations"],
            "callback_calls": callback_calls,
            "validation_passed": record["validation"]["passed"],
            "truth_level": record["validation"]["truth_level"],
        }

    return {
        "schema": "sagejs.numerics.reference-comparison/v1",
        "claim": (
            "Two independently executed bracketed methods return validated candidates "
            "that agree within the declared x-tolerance."
        ),
        "primary": summary(primary_record, primary_callback_calls),
        "reference": summary(reference_record, reference_callback_calls),
        "agreement": {
            "absolute_value_difference": difference,
            "threshold": threshold,
            "passed": difference <= threshold,
        },
        "execution": {
            "independent_runs": True,
            "distinct_callback_instances": True,
            "callback_reevaluated_for_presentation": False,
        },
        "reference_result": reference_record,
        "evidence": [
            "/result/method",
            "/result/value",
            "/result/validation/residual",
            "/result/iterations",
            "/result/evaluations",
            "/reference_comparison/reference_result/method",
            "/reference_comparison/reference_result/value",
            "/reference_comparison/reference_result/validation/residual",
            "/reference_comparison/reference_result/iterations",
            "/reference_comparison/reference_result/evaluations",
        ],
    }


def _story(
    story_id: str,
    domain: str,
    operation: str,
    title: str,
    summary: str,
    objectives: list[str],
    assumptions: list[str],
    cases: list[dict[str, Any]],
    source: str,
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "id": story_id,
        "domain": domain,
        "operation": operation,
        "title": title,
        "summary": summary,
        "learning_objectives": objectives,
        "method_assumptions": assumptions,
        "canonical_python": source,
        "cases": cases,
    }


def root_story() -> dict[str, Any]:
    callback = Counted(lambda x: math.cos(x) - x)
    success = find_root(
        callback,
        0.0,
        1.0,
        method="brent",
        expression="math.cos(x) - x",
        trace="evaluations",
        max_trace_events=96,
        max_trace_bytes=131_072,
    )
    before = callback.calls
    animation = success.animate()
    presentation = _presentation(
        success,
        animation,
        callback_before=before,
        callback_after=callback.calls,
        source="NumericalResult.animate() retained-evidence view",
    )
    reference_callback = Counted(lambda x: math.cos(x) - x)
    reference = find_root(
        reference_callback,
        0.0,
        1.0,
        method="bisection",
        expression="math.cos(x) - x",
        trace="evaluations",
        max_trace_events=96,
        max_trace_bytes=131_072,
    )
    reference_comparison = _root_reference_comparison(
        success,
        reference,
        primary_callback_calls=before,
        reference_callback_calls=reference_callback.calls,
    )
    jump_callback = Counted(lambda x: -1.0 if x < 0.0 else 1.0)
    jump = find_root(
        jump_callback,
        -1.0,
        1.0,
        method="brent",
        expression="-1.0 if x < 0.0 else 1.0",
        trace="iterations",
    )
    jump_before = jump_callback.calls
    jump_presentation = _presentation(
        jump,
        jump.animate(),
        callback_before=jump_before,
        callback_after=jump_callback.calls,
        source="NumericalResult.animate() retained-evidence failure view",
    )
    return _story(
        "root-brent",
        "roots",
        "scalar_root",
        "A sign change is evidence, not the answer",
        "Brent rapidly solves cos(x)=x and a separate bisection run checks the candidate, while the same stopping rule is rejected on a discontinuity by independent residual validation.",
        [
            "Read a shrinking bracket from retained solver evidence.",
            "Separate a solver stopping status from independent mathematical validation.",
            "Compare Brent and bisection using retained accuracy and work measurements.",
        ],
        [
            "Brent requires a finite sign-changing bracket.",
            "Bisection uses the same bracket assumptions but guarantees halving steps.",
            "The bracket-to-root implication requires continuity.",
        ],
        [
            _case(
                "cosine-fixed-point",
                "Convergence of cos(x)=x",
                "success",
                "Where does cos(x) meet x on [0,1]?",
                "The retained evaluations and brackets converge to 0.7390851332; independent residual and bracket checks pass. A separately executed bisection solve agrees within the declared x-tolerance, with its full result retained below.",
                success,
                presentation,
                reference_comparison=reference_comparison,
            ),
            _case(
                "jump-discontinuity",
                "A bracket can shrink around a jump",
                "failure",
                "Does every sign change contain a zero?",
                "No. The solver stopping rule is reached, but the retained candidate has residual one, so validation rejects success.",
                jump,
                jump_presentation,
            ),
        ],
        """import math
from sagejs.numerics import find_root

result = find_root(
    lambda x: math.cos(x) - x,
    0.0,
    1.0,
    method="brent",
    trace="evaluations",
)
result""",
    )


def fit_story() -> dict[str, Any]:
    model = Counted(lambda x, parameters: parameters[0] * math.exp(-parameters[1] * x))
    result = curve_fit(
        model,
        [0.0, 1.0, 2.0, 3.0],
        [2.0, 1.213061319, 0.735758882, 0.44626032],
        [1.5, 0.4],
        trace="iterations",
    )
    before = model.calls
    animation = result.animate()
    presentation = _presentation(
        result,
        animation,
        callback_before=before,
        callback_after=model.calls,
        source="OptimizationResult.animate() from retained fitted values",
    )

    def broken_model(x: float, parameters: list[float]) -> float:
        if parameters[0] > 1.0:
            raise ArithmeticError("intentional model-domain failure")
        return parameters[0] * x

    failed = curve_fit(broken_model, [0.0, 1.0, 2.0], [0.0, 1.0, 2.0], [2.0])
    return _story(
        "nonlinear-fit",
        "optimization",
        "curve_fit",
        "A fitted curve is more than a parameter vector",
        "Damped Gauss-Newton retains observations, evolving fitted values, residuals, and independent stationarity evidence.",
        [
            "Inspect residual sticks as the parameter estimate changes.",
            "Treat callback-domain failures as structured outcomes rather than fitted parameters.",
        ],
        [
            "Residuals and finite-difference perturbations must stay in the model domain.",
            "A small residual does not by itself certify parameter identifiability.",
        ],
        [
            _case(
                "exponential-decay",
                "Recover an exponential decay law",
                "success",
                "Can four observations recover amplitude two and decay rate one half?",
                "The retained model sequence converges to the independently validated least-squares fit; residual sticks show the remaining data mismatch.",
                result,
                presentation,
            ),
            _case(
                "model-domain-error",
                "The model is undefined near the initial guess",
                "failure",
                "What if the callback cannot evaluate the requested parameters?",
                "The callback exception becomes a callback_error result with no invented fit or animation.",
                failed,
            ),
        ],
        """import math
from sagejs.numerics.optimization import curve_fit

xdata = [0.0, 1.0, 2.0, 3.0]
ydata = [2.0, 1.213061319, 0.735758882, 0.44626032]

def model(x, parameters):
    return parameters[0] * math.exp(-parameters[1] * x)

result = curve_fit(model, xdata, ydata, [1.5, 0.4], trace="iterations")
result""",
    )


def ode_story() -> dict[str, Any]:
    field = Counted(lambda _t, state: [state[1], -state[0]])
    result = solve_ivp(
        field,
        (0.0, 2.0 * math.pi),
        [1.0, 0.0],
        rtol=1.0e-8,
        atol=1.0e-11,
        trace="iterations",
        invariants=[
            OdeInvariant(
                lambda _t, state: state[0] * state[0] + state[1] * state[1],
                name="squared_norm",
                atol=2.0e-7,
                rtol=2.0e-7,
            )
        ],
        reference=lambda t: [math.cos(t), -math.sin(t)],
        reference_atol=2.0e-8,
        reference_rtol=2.0e-7,
    )
    before = field.calls
    animation = result.animate("phase")
    presentation = _presentation(
        result,
        animation,
        callback_before=before,
        callback_after=field.calls,
        source="OdeResult.animate('phase') from retained trajectory and events",
    )
    stiff_field = Counted(
        lambda _t, state: [-1000.0 * (state[0] - math.cos(_t)) - math.sin(_t)]
    )
    limited = solve_ivp(
        stiff_field,
        (0.0, 1.0),
        [0.0],
        method="rk45",
        max_evaluations=12,
        trace="iterations",
    )
    limited_before = stiff_field.calls
    limited_presentation = _presentation(
        limited,
        limited.animate("step_size"),
        callback_before=limited_before,
        callback_after=stiff_field.calls,
        source="OdeResult.animate('step_size') from retained failed attempts",
    )
    return _story(
        "ode-adaptivity",
        "ode",
        "initial_value_problem",
        "Adaptive steps should preserve the mathematics you care about",
        "A harmonic oscillator closes its phase curve and passes sampled invariant/reference checks; an explicit method honestly exhausts its budget on a stiff tracker.",
        [
            "Relate adaptive trajectory points to independent invariant checks.",
            "Recognize stiffness from repeated work and a bounded failure status.",
        ],
        [
            "Local error estimates are not global error bounds.",
            "Explicit RK methods can be inappropriate even for smooth stiff equations.",
        ],
        [
            _case(
                "harmonic-oscillator",
                "One orbit of a harmonic oscillator",
                "success",
                "Does the adaptive trajectory return to its initial state without unacceptable invariant drift?",
                "The retained phase trajectory closes after one period and the separately sampled squared-norm and reference checks pass.",
                result,
                presentation,
            ),
            _case(
                "stiff-explicit-budget",
                "An explicit solver meets a stiff workload",
                "failure",
                "What does bounded failure look like when RK45 is the wrong tool?",
                "The solver returns maximum_evaluations without inventing a completed trajectory or a global-accuracy claim.",
                limited,
                limited_presentation,
            ),
        ],
        """import math
from sagejs.numerics.ode import solve_ivp

def oscillator(_t, state):
    return [state[1], -state[0]]

result = solve_ivp(
    oscillator,
    (0.0, 2.0 * math.pi),
    [1.0, 0.0],
    rtol=1e-8,
    atol=1e-11,
    trace="iterations",
)
result""",
    )


def linear_story() -> dict[str, Any]:
    result = solve(
        [
            [2.7885359691576745, -9.49978489554666, -4.499413632617615],
            [-5.5357852370235445, 4.729424283280249, 3.533989748458225],
            [7.843591354096908, -8.261223347411677, -1.561563606294591],
        ],
        [26.752113888947807, 25.823734998854537, -27.440931113276115],
        tolerance=2.0e-17,
        max_refinement=3,
        trace="iterations",
    )
    animation = result.animate("convergence")
    presentation = _presentation(
        result,
        animation,
        source="LinearAlgebraResult.animate('convergence') from refinement trace",
    )
    singular = solve([[1.0, 2.0], [2.0, 4.0]], [3.0, 6.0], trace="iterations")
    failure_spec = singular.plot()
    return _story(
        "linear-refinement",
        "linear_algebra",
        "solve",
        "A solution is credible only with a scale-aware residual",
        "Iterative refinement records improving backward error, while a singular system produces an explicit diagnostic instead of a spurious vector.",
        [
            "Read normwise backward error rather than raw residual alone.",
            "Distinguish singularity from an ordinary convergence failure.",
        ],
        [
            "Binary64 residuals must be interpreted relative to matrix and solution scale.",
            "A singular coefficient matrix does not define a unique solution.",
        ],
        [
            _case(
                "iterative-refinement",
                "Refinement improves backward error",
                "success",
                "Can a residual correction make a computed solve more trustworthy?",
                "The retained refinement trace shows the final backward error below the initial backward error and validation passes.",
                result,
                presentation,
            ),
            _case(
                "singular-system",
                "No unique solution exists",
                "failure",
                "What should solve return for linearly dependent equations?",
                "The singularity diagnostic is preserved; no solution vector is invented.",
                singular,
                _static_presentation(
                    singular,
                    failure_spec,
                    source="LinearAlgebraResult.plot() failure view",
                ),
            ),
        ],
        """from sagejs.numerics.linear_algebra import solve

A = [
    [2.7885359691576745, -9.49978489554666, -4.499413632617615],
    [-5.5357852370235445, 4.729424283280249, 3.533989748458225],
    [7.843591354096908, -8.261223347411677, -1.561563606294591],
]
b = [26.752113888947807, 25.823734998854537, -27.440931113276115]
result = solve(A, b, tolerance=2e-17, max_refinement=3, trace="iterations")
result""",
    )


def quadrature_story() -> dict[str, Any]:
    integrand = Counted(lambda x: math.exp(-x * x))
    result = integrate(
        integrand,
        -2.0,
        2.0,
        absolute_tolerance=1.0e-10,
        relative_tolerance=1.0e-10,
        trace="iterations",
    )
    before = integrand.calls
    animation = result.animate()
    presentation = _presentation(
        result,
        animation,
        callback_before=before,
        callback_after=integrand.calls,
        source="IntegrationResult.animate() from retained partition evidence",
    )
    oscillatory = Counted(lambda x: math.sin(500.0 * x))
    limited = integrate(
        oscillatory,
        0.0,
        1.0,
        max_evaluations=15,
        trace="iterations",
    )
    limited_before = oscillatory.calls
    limited_presentation = _presentation(
        limited,
        limited.animate(),
        callback_before=limited_before,
        callback_after=oscillatory.calls,
        source="IntegrationResult.animate() from retained incomplete partition evidence",
    )
    return _story(
        "adaptive-quadrature",
        "integration",
        "adaptive_quadrature",
        "An error estimate is a budget allocation record",
        "Adaptive Gauss-Kronrod exposes the retained interval partition and local error allocation; an evaluation ceiling suppresses an unvalidated partial estimate.",
        [
            "See where an adaptive integrator spends its evaluations.",
            "Understand why an incomplete partition is not a public integral value.",
        ],
        [
            "The integrand must be finite on every evaluated point.",
            "The reported error is an estimator under the method's smoothness assumptions.",
        ],
        [
            _case(
                "gaussian-area",
                "Allocate work around a Gaussian peak",
                "success",
                "How does adaptive quadrature distribute error over [-2,2]?",
                "The final interval partition and convergence frames come only from computed panels, and the independent validation pass is retained.",
                result,
                presentation,
            ),
            _case(
                "oscillation-budget",
                "The evaluation budget ends first",
                "failure",
                "What is returned when too few samples are allowed for a rapid oscillation?",
                "The result records maximum_evaluations and suppresses an incomplete solver estimate rather than presenting it as the integral.",
                limited,
                limited_presentation,
            ),
        ],
        """import math
from sagejs.numerics.integration import integrate

result = integrate(
    lambda x: math.exp(-x * x),
    -2.0,
    2.0,
    absolute_tolerance=1e-10,
    relative_tolerance=1e-10,
    trace="iterations",
)
result""",
    )


def approximation_story() -> dict[str, Any]:
    runge = lambda x: 1.0 / (1.0 + 25.0 * x * x)
    counted_runge = Counted(runge)
    chebyshev = chebyshev_approximation(
        counted_runge, [-1.0, 1.0], 16, trace="iterations"
    )
    before = counted_runge.calls
    animation = chebyshev.to_animation(samples=129, max_frames=16)
    presentation = _presentation(
        chebyshev,
        animation,
        callback_before=before,
        callback_after=counted_runge.calls,
        source="ApproximationResult.to_animation() from retained representation",
    )
    nodes = [-1.0 + 2.0 * index / 16.0 for index in range(17)]
    equispaced = interpolate(nodes, [runge(x) for x in nodes], trace="iterations")
    grid = [-1.0 + 2.0 * index / 400.0 for index in range(401)]
    error = max(abs(equispaced.evaluate(x) - runge(x)) for x in grid)
    failure_spec = equispaced.to_plot_spec(129)
    failure = _case(
        "runge-equispaced",
        "A stable formula cannot repair bad nodes",
        "failure",
        "Does stable barycentric evaluation prevent the Runge phenomenon?",
        "No. Construction and node reproduction validate, yet the independently sampled maximum error on [-1,1] is "
        + format(error, ".6g")
        + ". This is an approximation-design failure, not an arithmetic failure.",
        equispaced,
        _static_presentation(
            equispaced,
            failure_spec,
            source="ApproximationResult.to_plot_spec() from stored interpolant",
        ),
        evidence=[
            "/result/status",
            "/result/success",
            "/result/validation/passed",
            "/teaching_metrics/max_grid_error",
        ],
    )
    failure["teaching_metrics"] = {
        "oracle": "analytic Runge function on a deterministic 401-point grid",
        "max_grid_error": error,
    }
    return _story(
        "runge-approximation",
        "approximation",
        "polynomial_approximation",
        "Representation stability and approximation quality are different",
        "Chebyshev nodes control Runge oscillation; equispaced interpolation can be represented stably and still be a poor approximation between nodes.",
        [
            "Separate stable evaluation from a good approximation design.",
            "Compare retained construction stages without inventing intermediate polynomials.",
        ],
        [
            "Validation at construction nodes does not bound between-node error.",
            "The deterministic grid metric is evidence, not a rigorous supremum norm.",
        ],
        [
            _case(
                "runge-chebyshev",
                "Chebyshev nodes tame endpoint oscillation",
                "success",
                "How should a degree-16 polynomial sample the Runge function?",
                "The retained Chebyshev representation passes construction validation and its bounded animation reveals only computed construction stages.",
                chebyshev,
                presentation,
            ),
            failure,
        ],
        """from sagejs.numerics.approximation import chebyshev_approximation

def runge(x):
    return 1.0 / (1.0 + 25.0 * x * x)

result = chebyshev_approximation(runge, [-1.0, 1.0], 16, trace="iterations")
result""",
    )


def spectral_story() -> dict[str, Any]:
    result = symmetric_eigen(
        [[4.0, 1.0, 0.0], [1.0, 3.0, 0.5], [0.0, 0.5, 1.0]],
        trace="iterations",
    )
    animation = result.animate("convergence")
    presentation = _presentation(
        result,
        animation,
        source="SpectralResult.animate('convergence') from retained Jacobi trace",
    )
    unsafe = general_eigen([[1.0, 1.0], [0.0, 1.0 + 1.0e-12]], trace="iterations")
    failure_spec = unsafe.plot()
    return _story(
        "spectral-conditioning",
        "spectral",
        "eigensystem",
        "Eigenvalues can be available when an eigenbasis is not trustworthy",
        "Hermitian Jacobi iterations expose decreasing off-diagonal mass; a nearly defective general matrix fails the eigenbasis conditioning gate.",
        [
            "Read convergence evidence for a Hermitian eigensystem.",
            "Recognize why a numerically singular eigenvector basis must be withheld.",
        ],
        [
            "The successful path requires a finite Hermitian matrix.",
            "A clustered nonnormal spectrum can make eigenvectors arbitrarily sensitive.",
        ],
        [
            _case(
                "hermitian-jacobi",
                "Off-diagonal mass decreases",
                "success",
                "How does cyclic Jacobi expose convergence to a Hermitian eigensystem?",
                "Each retained sweep reports convergence evidence, followed by independent eigenpair, orthogonality, and reconstruction checks.",
                result,
                presentation,
            ),
            _case(
                "near-defective-basis",
                "The eigenbasis is too ill-conditioned",
                "failure",
                "Should a nearly defective matrix return a full eigenbasis?",
                "No. The reciprocal-condition gate fails, so the public value is withheld and the conditioning evidence remains visible.",
                unsafe,
                _static_presentation(
                    unsafe, failure_spec, source="SpectralResult.plot() failure view"
                ),
            ),
        ],
        """from sagejs.numerics.spectral import symmetric_eigen

A = [[4.0, 1.0, 0.0], [1.0, 3.0, 0.5], [0.0, 0.5, 1.0]]
result = symmetric_eigen(A, trace="iterations")
result""",
    )


def optimization_story() -> dict[str, Any]:
    objective = Counted(
        lambda point: (
            (1.0 - point[0]) ** 2 + 100.0 * (point[1] - point[0] * point[0]) ** 2
        )
    )
    result = minimize(
        objective,
        [-1.2, 1.0],
        method="nelder-mead",
        maxiter=2000,
        trace="iterations",
    )
    before = objective.calls
    animation = result.animate()
    presentation = _presentation(
        result,
        animation,
        callback_before=before,
        callback_after=objective.calls,
        source="OptimizationResult.animate() from retained simplex/iterate summaries",
    )
    limited_objective = Counted(
        lambda point: (
            (1.0 - point[0]) ** 2 + 100.0 * (point[1] - point[0] * point[0]) ** 2
        )
    )
    limited = minimize(
        limited_objective,
        [-1.2, 1.0],
        method="nelder-mead",
        maxiter=2,
        trace="iterations",
    )
    limited_before = limited_objective.calls
    limited_presentation = _presentation(
        limited,
        limited.animate(),
        callback_before=limited_before,
        callback_after=limited_objective.calls,
        source="OptimizationResult.animate() from retained budget-limited iterates",
    )
    return _story(
        "optimization-path",
        "optimization",
        "minimize",
        "A path explains both convergence and a budget stop",
        "Nelder-Mead retains accepted simplex summaries on Rosenbrock's valley; the same problem with two iterations stops explicitly instead of claiming the best point is optimal.",
        [
            "Follow a derivative-free path through a curved valley.",
            "Distinguish a useful incumbent from a validated optimum.",
        ],
        [
            "Nelder-Mead is local and supplies no global optimality proof.",
            "A maximum-iteration status must not be relabeled as convergence.",
        ],
        [
            _case(
                "rosenbrock-convergence",
                "Traverse Rosenbrock's curved valley",
                "success",
                "Can a derivative-free method reach the minimizer near (1,1)?",
                "The retained parameter path reaches a point whose independent objective and local checks pass.",
                result,
                presentation,
            ),
            _case(
                "rosenbrock-budget",
                "Two iterations are not enough",
                "failure",
                "Is the best point after two iterations a solution?",
                "It is only an incumbent. The result records maximum_iterations and validation does not promote it to success.",
                limited,
                limited_presentation,
            ),
        ],
        """from sagejs.numerics.optimization import minimize

def rosenbrock(point):
    x, y = point
    return (1.0 - x) ** 2 + 100.0 * (y - x * x) ** 2

result = minimize(
    rosenbrock,
    [-1.2, 1.0],
    method="bfgs",
    maxiter=200,
    gtol=1e-5,
    trace="iterations",
)
result""",
    )


def statistics_story() -> dict[str, Any]:
    x_values = list(range(8))
    y_values = [1.0 + 2.0 * value for value in x_values]
    y_values[-1] = 30.0
    result = huber_regression(x_values, y_values, trace="iterations")
    animation = result.animate()
    presentation = _presentation(
        result,
        animation,
        source="StatisticsResult.animate() from retained weights and regression trace",
    )
    ill_x = [1.0e10 + value for value in range(-5, 6)]
    ill_y = [
        -3.0e10 + 2.0 * value + 0.01 * ((value * value) % 3) for value in range(-5, 6)
    ]
    unsafe = linear_regression(ill_x, ill_y)
    failure_spec = unsafe.to_plot_spec()
    return _story(
        "robust-regression",
        "statistics",
        "regression",
        "Robust fitting shows which observations lost influence",
        "Huber regression retains weights and parameter progress for one outlier; a translated large-offset regression is rejected when independent validation cannot support its coefficients.",
        [
            "Connect robust weights to visible outlier influence.",
            "Treat a finite coefficient vector as provisional until scale-aware validation passes.",
        ],
        [
            "Robust fitting changes the loss; it does not identify data errors automatically.",
            "Binary64 regression with large offsets can lose information through cancellation.",
        ],
        [
            _case(
                "huber-outlier",
                "Downweight one extreme observation",
                "success",
                "How does Huber regression limit one point's leverage?",
                "The retained fit sequence converges while the final PlotSpec marks observations with weight below 0.8.",
                result,
                presentation,
            ),
            _case(
                "large-offset-validation",
                "Finite coefficients can still fail validation",
                "failure",
                "Should a large-offset regression be trusted because its coefficients are finite?",
                "No. Independent validation detects the unstable translated geometry and returns validation_failed with a diagnostic plot.",
                unsafe,
                _static_presentation(
                    unsafe,
                    failure_spec,
                    source="StatisticsResult.to_plot_spec() failure view",
                ),
            ),
        ],
        """from sagejs.numerics.statistics import huber_regression

x = list(range(8))
y = [1.0 + 2.0 * value for value in x]
y[-1] = 30.0
result = huber_regression(x, y, trace="iterations")
result""",
    )


def _count_scalars(value: Any) -> int:
    if isinstance(value, dict):
        return sum(_count_scalars(item) for item in value.values())
    if isinstance(value, list):
        return sum(_count_scalars(item) for item in value)
    return 1


def _measure(story: dict[str, Any]) -> dict[str, Any]:
    frames = 0
    max_frame_scalars = 0
    animation_bytes = 0
    plotly_bytes = 0
    trace_events = 0
    trace_bytes = 0
    for case in story["cases"]:
        result = case["result"]
        results = [result]
        comparison = case.get("reference_comparison")
        if comparison:
            results.append(comparison["reference_result"])
        for result in results:
            traces = []
            if "trace" in result:
                traces.append(result["trace"])
            elif result.get("operation") == "parameter_sweep":
                for item in result["items"]:
                    traces.append(item["trace"])
                    nested = item.get("value")
                    if isinstance(nested, dict) and "trace" in nested:
                        traces.append(nested["trace"])
            else:
                raise ValueError("gallery result has no retained trace evidence")
            for trace in traces:
                trace_events = max(trace_events, int(trace["retained_events"]))
                trace_bytes = max(
                    trace_bytes,
                    len(
                        json.dumps(
                            trace, allow_nan=False, separators=(",", ":")
                        ).encode()
                    ),
                )
        presentation = case.get("presentation")
        if not presentation:
            continue
        animation = presentation.get("plot_animation")
        if animation:
            frames = max(frames, len(animation["frames"]))
            animation_bytes = max(
                animation_bytes,
                len(json.dumps(animation, separators=(",", ":")).encode()),
            )
            for frame in animation["frames"]:
                max_frame_scalars = max(max_frame_scalars, _count_scalars(frame))
        plotly = presentation.get("plotly")
        if plotly:
            plotly_bytes = max(
                plotly_bytes,
                len(json.dumps(plotly, separators=(",", ":")).encode()),
            )
    return {
        "story_bytes": 0,
        "max_trace_events": trace_events,
        "max_trace_bytes": trace_bytes,
        "max_animation_frames": frames,
        "max_frame_scalars": max_frame_scalars,
        "max_semantic_animation_bytes": animation_bytes,
        "max_plotly_bytes": plotly_bytes,
    }


def build() -> dict[str, Any]:
    stories = [
        root_story(),
        fit_story(),
        ode_story(),
        linear_story(),
        quadrature_story(),
        approximation_story(),
        spectral_story(),
        optimization_story(),
        statistics_story(),
        sweep_story(),
    ]
    budgets = {
        "max_bundle_bytes": 8_000_000,
        "max_story_bytes": 1_500_000,
        "max_trace_events_per_result": 256,
        "max_trace_bytes_per_result": 1_000_000,
        "max_animation_frames": 32,
        "max_scalars_per_frame": 16_384,
        "max_semantic_animation_bytes": 4_000_000,
        "max_plotly_bytes": 4_000_000,
        # These are deliberately generous release ceilings rather than
        # benchmark targets.  They make accidental quadratic rendering or a
        # hung evidence build fail closed without treating ordinary CI noise
        # as a product regression.
        "max_evidence_generation_ms": 180_000,
        "max_parse_and_budget_validation_ms": 1_000,
        "max_static_html_generation_ms": 1_000,
        "max_all_exports_generation_ms": 2_000,
        "max_browser_hydration_ms": 20_000,
        "max_single_plot_render_ms": 5_000,
    }
    for story in stories:
        measurements = _measure(story)
        story["measurements"] = measurements
        while True:
            measured = len(
                json.dumps(
                    story,
                    allow_nan=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode()
            )
            if measured == measurements["story_bytes"]:
                break
            measurements["story_bytes"] = measured
    bundle = {
        "schema": "sagejs.numerics.gallery.bundle/v1",
        "generation_policy": "deterministic; elapsed times normalized; no callback replay",
        "budgets": budgets,
        "story_order": [story["id"] for story in stories],
        "stories": stories,
    }
    bundle["measurements"] = {
        "bundle_bytes": 0,
        "story_count": len(stories),
        "case_count": sum(len(story["cases"]) for story in stories),
        "animated_case_count": sum(
            1
            for story in stories
            for case in story["cases"]
            if (case.get("presentation") or {}).get("plot_animation")
        ),
    }
    while True:
        measured = (
            len(
                json.dumps(
                    bundle,
                    allow_nan=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode()
            )
            + 1
        )
        if measured == bundle["measurements"]["bundle_bytes"]:
            break
        bundle["measurements"]["bundle_bytes"] = measured
    return bundle


if __name__ == "__main__":
    print(json.dumps(build(), allow_nan=False, sort_keys=True, separators=(",", ":")))
