"""Accessible, bounded semantic visualizations for statistical evidence."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from sagejs.plotting import (
    AnimationFrame,
    AnimationResourceLimits,
    AnimationTiming,
    PlotAnimation,
    PlotSpec,
    Provenance,
    make_layer,
    stable_frame_id,
)

from .result import StatisticsResult

_MAX_ANIMATION_FRAMES = 12
_MAX_ANIMATION_SAMPLES = 100_000
_MAX_ANIMATION_BYTES = 8_000_000
_MAX_VISUAL_DRAWS = 512


def _number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(name + " must be numeric")
    answer = float(value)
    if not math.isfinite(answer):
        raise ValueError(name + " must be finite")
    return answer


def _numbers(values: Any, name: str) -> list[float]:
    if not isinstance(values, list):
        raise TypeError(name + " must be a list")
    return [_number(value, name) for value in values]


def _provenance(result: StatisticsResult, alt_text: str) -> Provenance:
    return Provenance(
        "sagejs.numerics.statistics",
        source_language="python",
        constructor="StatisticsResult.to_plot_spec",
        metadata={
            "operation": result.operation,
            "method": result.method,
            "status": result.status,
            "truth_level": result.validation.truth_level,
            "alt_text": alt_text,
        },
    )


def _spec(
    result: StatisticsResult,
    layers: Sequence[Any],
    axes: Mapping[str, Any],
    alt_text: str,
) -> PlotSpec:
    return PlotSpec(
        2,
        layers,
        axes_or_scene=axes,
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": alt_text}],
        provenance=_provenance(result, alt_text),
    )


def _failure_spec(result: StatisticsResult) -> PlotSpec:
    diagnostic = (
        result.diagnostics[0].to_dict()["message"]
        if result.diagnostics
        else "No validated statistical estimate is available."
    )
    alt = (
        result.operation.replace("_", " ")
        + " did not produce a successful result; status "
        + result.status
        + ". "
        + str(diagnostic)
    )
    layer = make_layer(
        "text",
        {"x": [0.0], "y": [0.0], "text": ["status: " + result.status]},
        ordinal=0,
        namespace="statistics-failure",
        source_intent={"operation": result.operation, "role": "failure"},
        style={"color": "#a51c30", "size": 14},
        metadata={"status": result.status},
    )
    return _spec(
        result,
        [layer],
        {"x": {"visible": False}, "y": {"visible": False}},
        alt,
    )


def _distribution_spec(result: StatisticsResult, plot: Mapping[str, Any]) -> PlotSpec:
    xs = _numbers(plot.get("x"), "distribution x")
    ys = _numbers(plot.get("y"), "distribution y")
    if len(xs) != len(ys) or not xs:
        raise ValueError("distribution plot coordinates must be nonempty and paired")
    function = str(plot.get("function", "density"))
    tail_count = max(1, len(xs) // 5)
    if function == "cdf":
        tail_indices = list(range(tail_count))
        tail_phrase = "lower tail"
    elif function == "sf":
        tail_indices = list(range(len(xs) - tail_count, len(xs)))
        tail_phrase = "upper tail"
    else:
        tail_indices = list(range(tail_count)) + list(
            range(len(xs) - tail_count, len(xs))
        )
        tail_phrase = "outer tails"
    tail_x = [xs[index] for index in tail_indices]
    tail_y = [ys[index] for index in tail_indices]
    layers = [
        make_layer(
            "line",
            {"x": xs, "y": ys},
            ordinal=0,
            namespace="statistics-distribution",
            source_intent={"operation": result.operation, "role": function},
            style={"color": "#3366cc", "width": 2},
            legend={"label": function, "show": True},
        ),
        make_layer(
            "point",
            {"x": tail_x, "y": tail_y},
            ordinal=1,
            namespace="statistics-distribution",
            source_intent={"operation": result.operation, "role": "tail"},
            style={"color": "#a51c30", "size": 5},
            legend={"label": tail_phrase, "show": True},
        ),
    ]
    alt = (
        function
        + " curve for "
        + str(result.value.get("distribution", {}).get("name", "a distribution"))
        + " over "
        + str(len(xs))
        + " bounded samples; red points identify the "
        + tail_phrase
        + "."
    )
    return _spec(result, layers, {"x": {"label": "x"}, "y": {"label": function}}, alt)


def _sample_spec(result: StatisticsResult, plot: Mapping[str, Any]) -> PlotSpec:
    values = _numbers(plot.get("values"), "sample values")
    if not values:
        return (
            _failure_spec(result)
            if not result.success
            else _spec(
                result,
                [
                    make_layer(
                        "point",
                        {"x": [], "y": []},
                        ordinal=0,
                        namespace="statistics-sample",
                        source_intent={"operation": result.operation, "role": "draw"},
                    )
                ],
                {"x": {"label": "draw index"}, "y": {"label": "sample value"}},
                "The requested random sample is empty.",
            )
        )
    raw_indices = plot.get("indices")
    indices = (
        _numbers(raw_indices, "sample indices")
        if isinstance(raw_indices, list)
        else [float(index + 1) for index in range(len(values))]
    )
    if len(indices) != len(values):
        raise ValueError("sample display indices must match display values")
    layer = make_layer(
        "point",
        {"x": indices, "y": values},
        ordinal=0,
        namespace="statistics-sample",
        source_intent={"operation": result.operation, "role": "draw"},
        style={"color": "#3366cc", "size": 7},
        legend={"label": "completed draws", "show": True},
    )
    source_count = int(plot.get("source_count", len(values)))
    qualifier = " completed" if result.success else " completed before failure"
    alt = "Sequence plot showing " + str(len(values)) + " of " + str(source_count)
    alt += qualifier + " random draws at their original indices."
    return _spec(
        result,
        [layer],
        {"x": {"label": "draw index"}, "y": {"label": "sample value"}},
        alt,
    )


def _descriptive_spec(result: StatisticsResult, plot: Mapping[str, Any]) -> PlotSpec:
    values = _numbers(plot.get("ordered_values"), "ordered observations")
    if not values:
        return _failure_spec(result)
    ranks = _numbers(plot.get("empirical_ranks"), "empirical ranks")
    if len(ranks) != len(values):
        raise ValueError("empirical ranks must match ordered display observations")
    summary = result.value
    quartiles = [
        _number(summary["q1"], "q1"),
        _number(summary["median"], "median"),
        _number(summary["q3"], "q3"),
    ]
    layers = [
        make_layer(
            "point",
            {"x": values, "y": ranks},
            ordinal=0,
            namespace="statistics-summary",
            source_intent={"operation": result.operation, "role": "empirical-rank"},
            style={"color": "#3366cc", "size": 6},
            legend={"label": "ordered observations", "show": True},
            metadata={"visual_sample_count": len(values)},
        ),
        make_layer(
            "point",
            {"x": quartiles, "y": [0.25, 0.5, 0.75]},
            ordinal=1,
            namespace="statistics-summary",
            source_intent={"operation": result.operation, "role": "quartiles"},
            style={"color": "#dd8452", "size": 10},
            legend={"label": "quartiles", "show": True},
        ),
    ]
    alt = (
        "Empirical rank plot for "
        + str(summary["count"])
        + " observations, using "
        + str(len(values))
        + " bounded display points. The median is "
        + str(summary["median"])
        + " and the interquartile range is "
        + str(summary["interquartile_range"])
        + "."
    )
    return _spec(
        result,
        layers,
        {"x": {"label": "observation"}, "y": {"label": "empirical rank"}},
        alt,
    )


def _interval_display(
    estimate: float, lower: float | None, upper: float | None, null: float | None
) -> tuple[float, float]:
    finite = [estimate]
    if lower is not None:
        finite.append(lower)
    if upper is not None:
        finite.append(upper)
    if null is not None:
        finite.append(null)
    span = max(finite) - min(finite)
    radius = max(span, abs(estimate) * 0.1, 1.0)
    return (
        estimate - radius if lower is None else lower,
        estimate + radius if upper is None else upper,
    )


def _interval_spec(result: StatisticsResult, plot: Mapping[str, Any]) -> PlotSpec:
    estimate = _number(plot.get("estimate"), "interval estimate")
    raw_lower = plot.get("lower")
    raw_upper = plot.get("upper")
    lower = None if raw_lower is None else _number(raw_lower, "interval lower bound")
    upper = None if raw_upper is None else _number(raw_upper, "interval upper bound")
    raw_null = plot.get("null")
    null = None if raw_null is None else _number(raw_null, "null value")
    display_lower, display_upper = _interval_display(estimate, lower, upper, null)
    layers = [
        make_layer(
            "line",
            {"x": [display_lower, display_upper], "y": [0.0, 0.0]},
            ordinal=0,
            namespace="statistics-interval",
            source_intent={"operation": result.operation, "role": "confidence-set"},
            style={"color": "#3366cc", "width": 4},
            legend={"label": "confidence set", "show": True},
            metadata={
                "lower_unbounded": lower is None,
                "upper_unbounded": upper is None,
            },
        ),
        make_layer(
            "point",
            {"x": [estimate], "y": [0.0]},
            ordinal=1,
            namespace="statistics-interval",
            source_intent={"operation": result.operation, "role": "estimate"},
            style={"color": "#dd8452", "size": 11},
            legend={"label": "estimate", "show": True},
        ),
    ]
    if null is not None:
        layers.append(
            make_layer(
                "point",
                {"x": [null], "y": [0.0]},
                ordinal=2,
                namespace="statistics-interval",
                source_intent={"operation": result.operation, "role": "null"},
                style={"color": "#a51c30", "size": 9},
                legend={"label": "null value", "show": True},
            )
        )
    interval_text = (
        ("negative infinity" if lower is None else str(lower))
        + " to "
        + ("positive infinity" if upper is None else str(upper))
    )
    alt = (
        str(plot.get("parameter", "parameter"))
        + " estimate "
        + str(estimate)
        + " with confidence set "
        + interval_text
        + "."
    )
    if null is not None:
        alt += " The null value is " + str(null) + "."
    return _spec(
        result,
        layers,
        {
            "x": {"label": str(plot.get("parameter", "estimate"))},
            "y": {"visible": False},
        },
        alt,
    )


def _regression_spec(result: StatisticsResult, plot: Mapping[str, Any]) -> PlotSpec:
    xs = _numbers(plot.get("x"), "regression x")
    ys = _numbers(plot.get("y"), "regression y")
    line_x = _numbers(plot.get("line_x"), "fitted line x")
    line_y = _numbers(plot.get("line_y"), "fitted line y")
    if len(xs) != len(ys) or len(line_x) != 2 or len(line_y) != 2:
        raise ValueError("regression plot evidence is inconsistent")
    layers = [
        make_layer(
            "point",
            {"x": xs, "y": ys},
            ordinal=0,
            namespace="statistics-regression",
            source_intent={"operation": result.operation, "role": "observed"},
            style={"color": "#3366cc", "size": 8},
            legend={"label": "observed", "show": True},
        ),
        make_layer(
            "line",
            {"x": line_x, "y": line_y},
            ordinal=1,
            namespace="statistics-regression",
            source_intent={"operation": result.operation, "role": "fitted"},
            style={"color": "#dd8452", "width": 2},
            legend={"label": result.method, "show": True},
        ),
    ]
    weights = plot.get("weights")
    displayed_outlier_count = 0
    if isinstance(weights, list) and len(weights) == len(xs):
        indices = [index for index, weight in enumerate(weights) if float(weight) < 0.8]
        displayed_outlier_count = len(indices)
        layers.append(
            make_layer(
                "point",
                {
                    "x": [xs[index] for index in indices],
                    "y": [ys[index] for index in indices],
                },
                ordinal=2,
                namespace="statistics-regression",
                source_intent={"operation": result.operation, "role": "downweighted"},
                style={"color": "#a51c30", "size": 12},
                legend={"label": "downweighted observations", "show": True},
            )
        )
    source_count = int(plot.get("source_count", len(xs)))
    alt = (
        result.method
        + " line fit to "
        + str(source_count)
        + " observed pairs. The fitted slope is "
        + str(result.value.get("slope"))
        + " and intercept is "
        + str(result.value.get("intercept"))
        + "."
    )
    outlier_count = int(plot.get("downweighted_source_count", displayed_outlier_count))
    if outlier_count:
        alt += (
            " " + str(outlier_count) + " observations receive Huber weight below 0.8."
        )
        if displayed_outlier_count != outlier_count:
            alt += " The bounded display marks " + str(displayed_outlier_count) + "."
    if result.operation == "linear_regression" and source_count <= 4:
        alt += " This very small training set leaves little evidence against overfit."
    return _spec(result, layers, {"x": {"label": "x"}, "y": {"label": "y"}}, alt)


def _inferred_plot(result: StatisticsResult) -> dict[str, Any] | None:
    value = result.value
    if result.operation == "random_sample" and isinstance(value, list):
        if len(value) <= _MAX_VISUAL_DRAWS:
            indices = list(range(len(value)))
        else:
            last = len(value) - 1
            indices = [
                (index * last) // (_MAX_VISUAL_DRAWS - 1)
                for index in range(_MAX_VISUAL_DRAWS)
            ]
        visual_values = [value[index] for index in indices]
        return {
            "kind": "sample",
            "values": visual_values,
            "indices": [index + 1 for index in indices],
            "source_count": len(value),
        }
    if result.operation == "descriptive_statistics":
        return None
    if (
        result.operation
        in (
            "mean_confidence_interval",
            "one_sample_t_test",
            "two_sample_t_test",
        )
        and isinstance(value, dict)
        and "estimate" in value
    ):
        interval = value.get("interval", value.get("confidence_interval"))
        if isinstance(interval, list) and len(interval) == 2:
            parameter = (
                "difference in means"
                if result.operation == "two_sample_t_test"
                else "population mean"
            )
            return {
                "kind": "interval",
                "parameter": parameter,
                "estimate": value["estimate"],
                "lower": interval[0],
                "upper": interval[1],
                "null": value.get(
                    "null_value",
                    0.0 if result.operation == "two_sample_t_test" else None,
                ),
            }
    return None


def _plot_record(result: StatisticsResult) -> dict[str, Any] | None:
    plot = result._domain_payload.get("plot")
    if isinstance(plot, dict):
        return dict(plot)
    return _inferred_plot(result)


def statistics_plot(result: StatisticsResult) -> PlotSpec:
    """Return a detached PlotSpec derived only from recorded result evidence."""
    plot = _plot_record(result)
    if plot is None:
        return _failure_spec(result)
    kind = plot.get("kind")
    if kind == "distribution":
        return _distribution_spec(result, plot)
    if kind == "sample":
        return _sample_spec(result, plot)
    if kind == "descriptive":
        return _descriptive_spec(result, plot)
    if kind == "interval":
        return _interval_spec(result, plot)
    if kind == "regression":
        return _regression_spec(result, plot)
    raise ValueError("unknown statistics plot payload kind: " + str(kind))


def _prefix_record(plot: Mapping[str, Any], fraction: float) -> dict[str, Any]:
    output = dict(plot)
    kind = plot.get("kind")
    if kind == "distribution":
        xs = list(plot["x"])
        ys = list(plot["y"])
        count = max(2, min(len(xs), int(math.ceil(len(xs) * fraction))))
        output["x"] = xs[:count]
        output["y"] = ys[:count]
    elif kind == "sample":
        values = list(plot["values"])
        count = max(1, min(len(values), int(math.ceil(len(values) * fraction))))
        output["values"] = values[:count]
        if isinstance(plot.get("indices"), list):
            output["indices"] = list(plot["indices"][:count])
    elif kind == "descriptive":
        values = list(plot["ordered_values"])
        count = max(1, min(len(values), int(math.ceil(len(values) * fraction))))
        output["ordered_values"] = values[:count]
        output["empirical_ranks"] = list(plot["empirical_ranks"][:count])
    return output


def _animation_records(
    result: StatisticsResult, plot: dict[str, Any]
) -> list[dict[str, Any]]:
    kind = plot.get("kind")
    if kind in ("distribution", "sample", "descriptive"):
        length = len(plot.get("x", plot.get("values", plot.get("ordered_values", []))))
        frame_count = min(8, max(2, length))
        return [
            _prefix_record(plot, (index + 1) / frame_count)
            for index in range(frame_count)
        ]
    if kind == "interval":
        initial = dict(plot)
        initial["lower"] = plot["estimate"]
        initial["upper"] = plot["estimate"]
        return [initial, plot]
    if kind == "regression":
        xs = _numbers(plot.get("line_x"), "fitted line x")
        records: list[dict[str, Any]] = []
        for event in result.trace.events:
            data = event.data
            if (
                event.kind != "iteration"
                or "intercept" not in data
                or "slope" not in data
            ):
                continue
            intercept = _number(data["intercept"], "trace intercept")
            slope = _number(data["slope"], "trace slope")
            current = dict(plot)
            current["line_y"] = [intercept + slope * xs[0], intercept + slope * xs[1]]
            records.append(current)
        if len(records) > _MAX_ANIMATION_FRAMES - 1:
            step = (len(records) - 1) / (_MAX_ANIMATION_FRAMES - 2)
            records = [
                records[int(round(index * step))]
                for index in range(_MAX_ANIMATION_FRAMES - 1)
            ]
        if not records:
            center = math.fsum(_numbers(plot.get("y"), "regression y")) / len(plot["y"])
            initial = dict(plot)
            initial["line_y"] = [center, center]
            records.append(initial)
        records.append(plot)
        return records
    return [plot, plot]


def statistics_animation(result: StatisticsResult) -> PlotAnimation:
    """Replay bounded statistical evidence as a topology-stable animation."""
    plot = _plot_record(result)
    if plot is None:
        frames = [
            AnimationFrame(
                stable_frame_id(index),
                _failure_spec(result),
                label="failure evidence " + str(index + 1),
                metadata={"status": result.status},
            )
            for index in range(2)
        ]
    else:
        records = _animation_records(result, plot)
        frames = []
        for index, record in enumerate(records):
            kind = record.get("kind")
            if kind == "distribution":
                state = _distribution_spec(result, record)
            elif kind == "sample":
                state = _sample_spec(result, record)
            elif kind == "descriptive":
                state = _descriptive_spec(result, record)
            elif kind == "interval":
                state = _interval_spec(result, record)
            elif kind == "regression":
                state = _regression_spec(result, record)
            else:
                state = _failure_spec(result)
            frames.append(
                AnimationFrame(
                    stable_frame_id(index),
                    state,
                    label="evidence step " + str(index + 1),
                    metadata={"operation": result.operation, "step": index + 1},
                )
            )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=_MAX_ANIMATION_FRAMES,
            max_layers_per_frame=4,
            max_total_samples=_MAX_ANIMATION_SAMPLES,
            max_payload_bytes=_MAX_ANIMATION_BYTES,
            max_duration_ms=_MAX_ANIMATION_FRAMES * 350,
        ),
        metadata={
            "operation": result.operation,
            "status": result.status,
            "trace_truncated": result.trace.truncated,
            "source": "recorded-statistical-evidence",
        },
    )
