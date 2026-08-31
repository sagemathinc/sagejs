"""PlotSpec views derived only from retained integration evidence."""

from __future__ import annotations

from sagejs.plotting import PlotSpec, Provenance, make_layer

from .result import IntegrationResult


def integration_plot(result: IntegrationResult) -> PlotSpec:
    """Show the final adaptive partition and its local error allocation.

    The view never reevaluates the user callback.  Finite problems use the
    physical `x` coordinate; infinite problems use the documented transformed
    coordinate `t`, so no visual sample can consume an unrecorded evaluation.
    """
    intervals = list(result.final_intervals)
    if not intervals:
        raise ValueError("integration visualization requires a retained partition")
    intervals.sort(key=lambda value: float(value["plot_left"]))
    midpoints: list[float] = []
    errors: list[float] = []
    widths: list[float] = []
    depths: list[int] = []
    left_edges: list[float] = []
    right_edges: list[float] = []
    for interval in intervals:
        left = float(interval["plot_left"])
        right = float(interval["plot_right"])
        left_edges.append(left)
        right_edges.append(right)
        midpoints.append(left + 0.5 * (right - left))
        errors.append(max(0.0, float(interval["error_estimate"])))
        widths.append(right - left)
        depths.append(int(interval["depth"]))
    positive_errors = [value for value in errors if value > 0.0]
    display_floor = min(positive_errors) * 0.25 if positive_errors else 1e-300
    display_errors = [max(value, display_floor) for value in errors]
    threshold = result.requested_tolerance
    threshold_value = (
        display_floor if threshold is None else max(threshold, display_floor)
    )
    coordinate = str(intervals[0].get("plot_coordinate", "physical_x"))
    coordinate_label = "x" if coordinate == "physical_x" else "transformed t"
    layers = [
        make_layer(
            "line",
            {
                "x": midpoints,
                "y": display_errors,
                "local_error": errors,
                "interval_left": left_edges,
                "interval_right": right_edges,
                "interval_width": widths,
                "depth": depths,
            },
            ordinal=0,
            source_intent={
                "operation": "definite_integral",
                "role": "local_error_allocation",
            },
            style={"color": "#3366cc", "width": 2},
            legend={"label": "local error estimate", "show": True},
        ),
        make_layer(
            "point",
            {
                "x": midpoints,
                "y": display_errors,
                "local_error": errors,
                "depth": depths,
            },
            ordinal=1,
            source_intent={
                "operation": "definite_integral",
                "role": "active_intervals",
            },
            style={"color": "#55a868", "size": 8},
            legend={"label": "active interval", "show": True},
        ),
        make_layer(
            "line",
            {
                "x": [min(left_edges), max(right_edges)],
                "y": [threshold_value, threshold_value],
            },
            ordinal=2,
            source_intent={
                "operation": "definite_integral",
                "role": "global_requested_tolerance",
            },
            style={"color": "#dd8452", "width": 1, "dash": "dash"},
            legend={"label": "global requested tolerance", "show": True},
        ),
    ]
    error_text = (
        "unavailable" if result.error_estimate is None else str(result.error_estimate)
    )
    target_text = (
        "unavailable"
        if result.requested_tolerance is None
        else str(result.requested_tolerance)
    )
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": coordinate_label},
            "y": {"label": "estimated local absolute error", "scale": "log"},
        },
        viewport={"responsive": True},
        annotations=[
            {
                "kind": "alt_text",
                "text": "Adaptive quadrature local-error allocation across "
                + str(len(intervals))
                + " retained intervals in "
                + coordinate_label
                + ". Status "
                + result.stop_reason
                + "; reported global absolute-error evidence "
                + error_text
                + "; requested target "
                + target_text
                + ".",
            }
        ],
        provenance=Provenance(
            "sagejs.numerics.integration",
            source_language=str(result.problem.source_intent.get("language", "python")),
            constructor="integration_plot",
            metadata={
                "problem_digest": result.problem.digest,
                "method": result.method,
                "truth_level": result.validation.truth_level,
                "callback_reevaluated": False,
            },
        ),
    )
