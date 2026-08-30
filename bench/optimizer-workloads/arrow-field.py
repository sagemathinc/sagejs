"""Public vector-field workloads for checked arrow-loop feasibility evidence.

The representative and held-out entry points call the public Sage-qualified
constructors and the public PlotSpec lowerer.  The checked V8 helper is only a
campaign feasibility target: neither public entry point selects it unless the
runner explicitly installs it for one measured call.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Callable

import sagejs.plotting.field_layers as _field_layers
import sagejs.runtime as runtime
import sagejs.plotting.surface_layers as _surface_layers
from sage.plot.plot_field import plot_slope_field, plot_vector_field
from sagejs.plotting._json import materialize_object
from sagejs.plotting.field_layers import _legend
from sagejs.plotting.lowering import lower_plot_spec
from sagejs.plotting.model import PlotLayer
from sagejs.plotting.surface_layers import rectangular_surface_layer


STANDARD_PLOT_POINTS = 100
_CAMPAIGN1_SURFACE_GRIDS: dict[int, tuple[Any, Any, Any]] = {}


def _vector_u(x_value: float, _y_value: float) -> float:
    return float(x_value + 0.25)


def _vector_v(_x_value: float, _y_value: float) -> float:
    return 0.0


def _zero_slope(_x_value: float, _y_value: float) -> float:
    return 0.0


def campaign1_vector_field_figure(
    plot_points: int = STANDARD_PLOT_POINTS,
) -> dict[str, Any]:
    """Lower one public 100x100 vector field through `lower_plot_spec`."""
    specification = plot_vector_field(
        (_vector_u, _vector_v),
        (-4.0, 4.0),
        (-3.0, 3.0),
        plot_points=(plot_points, plot_points),
    )
    return lower_plot_spec(specification)


def campaign1_slope_field_figure(
    plot_points: int = STANDARD_PLOT_POINTS,
) -> dict[str, Any]:
    """Lower the public zero-slope heldout through `lower_plot_spec`."""
    specification = plot_slope_field(
        _zero_slope,
        (-4.0, 4.0),
        (-3.0, 3.0),
        plot_points=(plot_points, plot_points),
    )
    return lower_plot_spec(specification)


def _campaign1_surface_grids(plot_points: int) -> tuple[Any, Any, Any]:
    cached = _CAMPAIGN1_SURFACE_GRIDS.get(plot_points)
    if cached is not None:
        return cached
    denominator = float(plot_points - 1)
    x_grid = [
        [float(column) / denominator for column in range(plot_points)]
        for _row in range(plot_points)
    ]
    y_grid = [
        [float(row) / denominator for _column in range(plot_points)]
        for row in range(plot_points)
    ]
    z_grid = [
        [
            x_grid[row][column] - 2.0 * y_grid[row][column]
            for column in range(plot_points)
        ]
        for row in range(plot_points)
    ]
    cached = (x_grid, y_grid, z_grid)
    _CAMPAIGN1_SURFACE_GRIDS[plot_points] = cached
    return cached


def campaign1_rectangular_surface_layer(
    plot_points: int = STANDARD_PLOT_POINTS,
) -> dict[str, Any]:
    """Construct one public rectangular surface and publish its PlotLayer."""
    x_grid, y_grid, z_grid = _campaign1_surface_grids(plot_points)
    return rectangular_surface_layer(x_grid, y_grid, z_grid).to_dict()


def campaign1_complete_output_digest(output: dict[str, Any]) -> str:
    payload = json.dumps(
        output,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def campaign1_trace_digest(output: dict[str, Any]) -> str:
    trace = output["data"][0]
    payload = json.dumps(
        {"x": trace["x"], "y": trace["y"]},
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def campaign1_surface_bounds_digest(output: dict[str, Any]) -> str:
    payload = json.dumps(
        output["metadata"]["scene"]["bounds"],
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# BEGIN CAMPAIGN1 CHECKED ARROW LOOP
_CAMPAIGN1_ORIGINAL_ARROW_SEGMENTS = _field_layers._arrow_segments
_CAMPAIGN1_ARROW_FALLBACK_CALLS = 0
_CAMPAIGN1_ORIGINAL_BOUNDS = _surface_layers._bounds
_CAMPAIGN1_BOUNDS_FALLBACK_CALLS = 0


def _campaign1_bind_arrow_target() -> None:
    """Capture the evaluator-owned identities consumed by the checked target."""
    global _CAMPAIGN1_ARROW_BIND_SECONDS
    global _CAMPAIGN1_ARROW_FACTORY
    global _CAMPAIGN1_ARROW_TARGET
    global _CAMPAIGN1_BOUNDS_FACTORY
    global _CAMPAIGN1_BOUNDS_TARGET
    global _CAMPAIGN1_EXPECTED_HYPOT
    global _CAMPAIGN1_EXPECTED_PLOTLAYER

    started = runtime.wall_time()
    _CAMPAIGN1_EXPECTED_HYPOT = math.hypot
    _CAMPAIGN1_EXPECTED_PLOTLAYER = PlotLayer
    function_constructor = runtime.reflect.get(runtime.global_object, "Function")
    factory = runtime.reflect.construct(
        function_constructor,
        [
            "trustedUnbox",
            "trustedFloat",
            "trustedList",
            "trustedDict",
            "trustedInterrupt",
            "trustedHypot",
            r"""
"use strict";
const listPrototype = Object.getPrototypeOf(trustedList([]));
const isArray = Array.isArray;
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const hasOwn = Object.hasOwn;
const isFiniteNumber = Number.isFinite;
return function campaign1CheckedArrowLoop(
    xValues, yValues, uValues, vValues, maximumValue, extentValue,
    pivotValue, headLengthValue, headWidthValue, colorValue, widthValue
) {
  if (globalThis.ρσ_strict_float_unbox !== trustedUnbox ||
      globalThis.float !== trustedFloat ||
      globalThis.ρσ_list_decorate !== trustedList ||
      globalThis.ρσ_dict !== trustedDict ||
      globalThis.ρσ_check_interrupt !== trustedInterrupt ||
      typeof trustedHypot !== "function") return null;

  function denseList(value) {
    if (!isArray(value) || getPrototypeOf(value) !== listPrototype) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = getOwnPropertyDescriptor(value, index);
      if (!descriptor || !hasOwn(descriptor, "value")) return false;
    }
    return true;
  }

  if (!denseList(xValues) || !denseList(yValues) ||
      !denseList(uValues) || !denseList(vValues) ||
      uValues.length !== yValues.length || vValues.length !== yValues.length ||
      (pivotValue !== "tail" && pivotValue !== "middle" &&
       pivotValue !== "tip")) return null;

  const maximum = trustedUnbox(maximumValue);
  const extent = trustedUnbox(extentValue);
  const headLength = trustedUnbox(headLengthValue);
  const headWidth = trustedUnbox(headWidthValue);
  if (maximum === null || extent === null || headLength === null ||
      headWidth === null || !isFiniteNumber(maximum) ||
      !isFiniteNumber(extent) || !isFiniteNumber(headLength) ||
      !isFiniteNumber(headWidth)) return null;

  const rowCount = yValues.length;
  const columnCount = xValues.length;
  // Authenticate every indexed read and strict binary64 value before the
  // first interrupt poll or output allocation.  The core below has no guard
  // exit: rejection always restarts the untouched source before effects.
  for (let xIndex = 0; xIndex < columnCount; xIndex += 1) {
    if (trustedUnbox(xValues[xIndex]) === null) return null;
  }
  for (let yIndex = 0; yIndex < rowCount; yIndex += 1) {
    const uRow = uValues[yIndex];
    const vRow = vValues[yIndex];
    if (!denseList(uRow) || !denseList(vRow) ||
        uRow.length < columnCount || vRow.length < columnCount ||
        trustedUnbox(yValues[yIndex]) === null) return null;
    for (let xIndex = 0; xIndex < columnCount; xIndex += 1) {
      const uValue = uRow[xIndex];
      const vValue = vRow[xIndex];
      if (uValue === null || vValue === null) {
        if (uValue !== null || vValue !== null) return null;
      } else if (trustedUnbox(uValue) === null ||
                 trustedUnbox(vValue) === null) return null;
    }
  }

  const withHead = headWidth > 0 && headLength > 0;
  const maximumEntries = rowCount * columnCount * (withHead ? 7 : 3);
  if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 0 ||
      maximumEntries > 7000000) return null;

  // The arrays remain private until every guard and computation succeeds.
  const xs = new Array(maximumEntries);
  const ys = new Array(maximumEntries);
  let outputIndex = 0;
  let ordinal = 0;
  for (let yIndex = 0; yIndex < rowCount; yIndex += 1) {
    const uRow = uValues[yIndex];
    const vRow = vValues[yIndex];
    const y = trustedUnbox(yValues[yIndex]);
    for (let xIndex = 0; xIndex < columnCount; xIndex += 1) {
      if ((ordinal & 4095) === 0) trustedInterrupt();
      ordinal += 1;
      const uValue = uRow[xIndex];
      const vValue = vRow[xIndex];
      if (uValue === null) continue;
      const x = trustedUnbox(xValues[xIndex]);
      const u = trustedUnbox(uValue);
      const v = trustedUnbox(vValue);
      const magnitude = trustedUnbox(trustedHypot(u, v));
      if (magnitude === 0 || maximum === 0) continue;
      const dx = u / maximum * extent;
      const dy = v / maximum * extent;
      let x0;
      let y0;
      if (pivotValue === "middle") {
        x0 = x - dx / 2;
        y0 = y - dy / 2;
      } else if (pivotValue === "tip") {
        x0 = x - dx;
        y0 = y - dy;
      } else {
        x0 = x;
        y0 = y;
      }
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      xs[outputIndex] = trustedFloat(x0);
      ys[outputIndex++] = trustedFloat(y0);
      xs[outputIndex] = trustedFloat(x1);
      ys[outputIndex++] = trustedFloat(y1);
      xs[outputIndex] = null;
      ys[outputIndex++] = null;
      if (withHead) {
        const unitX = u / magnitude;
        const unitY = v / magnitude;
        const backX = x1 - dx * headLength;
        const backY = y1 - dy * headLength;
        const arrowLength = trustedUnbox(trustedHypot(dx, dy));
        const sideX = -unitY * arrowLength * headWidth;
        const sideY = unitX * arrowLength * headWidth;
        xs[outputIndex] = trustedFloat(backX + sideX);
        ys[outputIndex++] = trustedFloat(backY + sideY);
        xs[outputIndex] = trustedFloat(x1);
        ys[outputIndex++] = trustedFloat(y1);
        xs[outputIndex] = trustedFloat(backX - sideX);
        ys[outputIndex++] = trustedFloat(backY - sideY);
        xs[outputIndex] = null;
        ys[outputIndex++] = null;
      }
    }
  }
  xs.length = outputIndex;
  ys.length = outputIndex;
  return trustedDict({
    type: "scatter",
    mode: "lines",
    x: trustedList(xs),
    y: trustedList(ys),
    line: trustedDict({color: colorValue, width: widthValue}),
    hoverinfo: "skip",
  });
};
""",
        ],
    )
    _CAMPAIGN1_ARROW_FACTORY = factory
    _CAMPAIGN1_ARROW_TARGET = runtime.reflect.apply(
        factory,
        runtime.undefined,
        [
            runtime.reflect.get(runtime.global_object, "ρσ_strict_float_unbox"),
            runtime.reflect.get(runtime.global_object, "float"),
            runtime.reflect.get(runtime.global_object, "ρσ_list_decorate"),
            runtime.reflect.get(runtime.global_object, "ρσ_dict"),
            runtime.reflect.get(runtime.global_object, "ρσ_check_interrupt"),
            math.hypot,
        ],
    )
    bounds_factory = runtime.reflect.construct(
        function_constructor,
        [
            "trustedUnbox",
            "trustedFloat",
            "trustedList",
            "trustedDict",
            "trustedInterrupt",
            r"""
"use strict";
const listPrototype = Object.getPrototypeOf(trustedList([]));
const isArray = Array.isArray;
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const hasOwn = Object.hasOwn;
return function campaign1CheckedBounds(points) {
  if (globalThis.ρσ_strict_float_unbox !== trustedUnbox ||
      globalThis.float !== trustedFloat ||
      globalThis.ρσ_list_decorate !== trustedList ||
      globalThis.ρσ_dict !== trustedDict ||
      globalThis.ρσ_check_interrupt !== trustedInterrupt) return null;

  function denseList(value) {
    if (!isArray(value) || getPrototypeOf(value) !== listPrototype) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = getOwnPropertyDescriptor(value, index);
      if (!descriptor || !hasOwn(descriptor, "value")) return false;
    }
    return true;
  }

  if (!denseList(points) || points.length === 0 ||
      points.length > 1000000) return null;
  // Preflight every row and coordinate before the first interrupt.  The
  // reduction core below has no rejection exit and publishes only at return.
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!denseList(point) || point.length < 3 ||
        trustedUnbox(point[0]) === null ||
        trustedUnbox(point[1]) === null ||
        trustedUnbox(point[2]) === null) return null;
  }
  const first = points[0];
  const minimum = [
    trustedUnbox(first[0]), trustedUnbox(first[1]), trustedUnbox(first[2]),
  ];
  const maximum = [minimum[0], minimum[1], minimum[2]];
  for (let index = 0; index < points.length; index += 1) {
    if ((index & 4095) === 0) trustedInterrupt();
    const point = points[index];
    for (let coordinate = 0; coordinate < 3; coordinate += 1) {
      const value = trustedUnbox(point[coordinate]);
      if (value < minimum[coordinate]) minimum[coordinate] = value;
      if (value > maximum[coordinate]) maximum[coordinate] = value;
    }
  }
  return trustedDict({
    x: trustedList([trustedFloat(minimum[0]), trustedFloat(maximum[0])]),
    y: trustedList([trustedFloat(minimum[1]), trustedFloat(maximum[1])]),
    z: trustedList([trustedFloat(minimum[2]), trustedFloat(maximum[2])]),
  });
};
""",
        ],
    )
    _CAMPAIGN1_BOUNDS_FACTORY = bounds_factory
    _CAMPAIGN1_BOUNDS_TARGET = runtime.reflect.apply(
        bounds_factory,
        runtime.undefined,
        [
            runtime.reflect.get(runtime.global_object, "ρσ_strict_float_unbox"),
            runtime.reflect.get(runtime.global_object, "float"),
            runtime.reflect.get(runtime.global_object, "ρσ_list_decorate"),
            runtime.reflect.get(runtime.global_object, "ρσ_dict"),
            runtime.reflect.get(runtime.global_object, "ρσ_check_interrupt"),
        ],
    )
    _CAMPAIGN1_ARROW_BIND_SECONDS = runtime.wall_time() - started


def _campaign1_checked_arrow_segments(layer: PlotLayer) -> dict[str, Any]:
    """Run the private checked target or restart the untouched source."""
    global _CAMPAIGN1_ARROW_FALLBACK_CALLS

    if (
        type(layer) is not _CAMPAIGN1_EXPECTED_PLOTLAYER
        or layer.kind not in ("vector-field", "slope-field")
        or math.hypot is not _CAMPAIGN1_EXPECTED_HYPOT
    ):
        _CAMPAIGN1_ARROW_FALLBACK_CALLS += 1
        return _CAMPAIGN1_ORIGINAL_ARROW_SEGMENTS(layer)
    data = materialize_object(layer.data, "$.field.data")
    x_values = data["x"]
    y_values = data["y"]
    u_values = data["u"]
    v_values = data["v"]
    if not all(
        isinstance(value, list) for value in (x_values, y_values, u_values, v_values)
    ):
        _CAMPAIGN1_ARROW_FALLBACK_CALLS += 1
        return _CAMPAIGN1_ORIGINAL_ARROW_SEGMENTS(layer)
    style = layer.style
    maximum = float(data.get("maximum_magnitude", 0.0))
    spacing = data["spacing"]
    if not isinstance(spacing, list) or len(spacing) != 2:
        _CAMPAIGN1_ARROW_FALLBACK_CALLS += 1
        return _CAMPAIGN1_ORIGINAL_ARROW_SEGMENTS(layer)
    extent = min(float(spacing[0]), float(spacing[1])) * float(style["scale"])
    pivot = style["pivot"]
    head_length = float(style["headlength"])
    head_width = float(style["headwidth"])
    trace = runtime.reflect.apply(
        _CAMPAIGN1_ARROW_TARGET,
        runtime.undefined,
        [
            x_values,
            y_values,
            u_values,
            v_values,
            maximum,
            extent,
            pivot,
            head_length,
            head_width,
            style["color"],
            style["width"],
        ],
    )
    if trace is None:
        _CAMPAIGN1_ARROW_FALLBACK_CALLS += 1
        return _CAMPAIGN1_ORIGINAL_ARROW_SEGMENTS(layer)
    _legend(layer, trace)
    if not layer.visibility:
        trace["visible"] = False
    return trace


def _campaign1_with_arrow_target(callback: Callable[[], Any]) -> Any:
    original = _field_layers._arrow_segments
    _field_layers._arrow_segments = _campaign1_checked_arrow_segments
    try:
        return callback()
    finally:
        _field_layers._arrow_segments = original


def _campaign1_copy_materialized_arrow_segments(
    layer: PlotLayer,
) -> dict[str, Any]:
    """Plausible but copy-heavy target retained as executed negative evidence."""
    trace = _campaign1_checked_arrow_segments(layer)
    copied = dict(trace)
    copied["x"] = [None if value is None else float(value) for value in trace["x"]]
    copied["y"] = [None if value is None else float(value) for value in trace["y"]]
    return copied


def _campaign1_with_copy_negative(callback: Callable[[], Any]) -> Any:
    original = _field_layers._arrow_segments
    _field_layers._arrow_segments = _campaign1_copy_materialized_arrow_segments
    try:
        return callback()
    finally:
        _field_layers._arrow_segments = original


def _campaign1_checked_bounds(points: Any) -> dict[str, Any]:
    global _CAMPAIGN1_BOUNDS_FALLBACK_CALLS

    answer = runtime.reflect.apply(
        _CAMPAIGN1_BOUNDS_TARGET,
        runtime.undefined,
        [points],
    )
    if answer is None:
        _CAMPAIGN1_BOUNDS_FALLBACK_CALLS += 1
        return _CAMPAIGN1_ORIGINAL_BOUNDS(points)
    return answer


def _campaign1_with_bounds_target(callback: Callable[[], Any]) -> Any:
    original = _surface_layers._bounds
    _surface_layers._bounds = _campaign1_checked_bounds
    try:
        return callback()
    finally:
        _surface_layers._bounds = original


def campaign1_vector_field_target(
    plot_points: int = STANDARD_PLOT_POINTS,
) -> dict[str, Any]:
    return _campaign1_with_arrow_target(
        lambda: campaign1_vector_field_figure(plot_points)
    )


def campaign1_slope_field_target(
    plot_points: int = STANDARD_PLOT_POINTS,
) -> dict[str, Any]:
    return _campaign1_with_arrow_target(
        lambda: campaign1_slope_field_figure(plot_points)
    )


def campaign1_vector_field_copy_negative(
    plot_points: int = STANDARD_PLOT_POINTS,
) -> dict[str, Any]:
    return _campaign1_with_copy_negative(
        lambda: campaign1_vector_field_figure(plot_points)
    )


def campaign1_rectangular_surface_target(
    plot_points: int = STANDARD_PLOT_POINTS,
) -> dict[str, Any]:
    return _campaign1_with_bounds_target(
        lambda: campaign1_rectangular_surface_layer(plot_points)
    )


_campaign1_bind_arrow_target()
# END CAMPAIGN1 CHECKED ARROW LOOP


def __profile_prepare__() -> None:
    campaign1_vector_field_figure(5)
    campaign1_slope_field_figure(5)
    campaign1_rectangular_surface_layer(5)


def __profile_run__() -> tuple[Any, ...]:
    vector = campaign1_vector_field_figure()
    slope = campaign1_slope_field_figure()
    surface = campaign1_rectangular_surface_layer()
    return (
        len(vector["data"][0]["x"]),
        len(vector["data"][0]["y"]),
        len(slope["data"][0]["x"]),
        len(slope["data"][0]["y"]),
        surface["metadata"]["scene"]["bounds"],
    )
