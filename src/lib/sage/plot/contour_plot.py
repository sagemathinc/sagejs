"""Sage-qualified semantic contour, implicit, and region constructors.

The constructors return a `PlotSpec` until the central `Graphics` bridge is
connected.  They intentionally accept callable numerical fields only;
symbolic expression compilation belongs in that bridge and is rejected here
instead of being mistaken for sampled data.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from sagejs.plotting.field_layers import (
    contour_field_layer,
    field_plot_spec,
    implicit_field_layer,
    region_field_layer,
)
from sagejs.plotting.model import PlotSpec


class ContourPlot:
    """Portable data holder matching Sage's public primitive constructor."""

    def __init__(
        self,
        xy_data_array: Sequence[Sequence[Any]],
        xrange: Sequence[Any],
        yrange: Sequence[Any],
        options: Mapping[str, Any],
    ) -> None:
        self.xy_data_array = [list(row) for row in xy_data_array]
        if not self.xy_data_array or not self.xy_data_array[0]:
            raise ValueError("contour data grid must not be empty")
        width = len(self.xy_data_array[0])
        if any(len(row) != width for row in self.xy_data_array):
            raise ValueError("contour data grid must be rectangular")
        self.xy_array_row = len(self.xy_data_array)
        self.xy_array_col = width
        self.xrange = list(xrange)
        self.yrange = list(yrange)
        self._options = dict(options)

    def options(self) -> dict[str, Any]:
        """Return detached primitive options."""
        return dict(self._options)

    def get_minmax_data(self) -> dict[str, float]:
        """Return Sage-compatible x/y primitive bounds."""
        x_values = self.xrange[-2:]
        y_values = self.yrange[-2:]
        return {
            "xmin": float(x_values[0]),
            "xmax": float(x_values[1]),
            "ymin": float(y_values[0]),
            "ymax": float(y_values[1]),
        }


def contour_plot(
    f: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    **options: Any,
) -> PlotSpec:
    """Sample `f` and return a deterministic Plotly-native contour PlotSpec."""
    return field_plot_spec(contour_field_layer(f, xrange, yrange, options=options))


def equify(f: Any) -> Callable[[float, float], Any]:
    """Return a callable field, rejecting symbolic equations explicitly."""
    if callable(f):
        return f
    raise NotImplementedError(
        "symbolic equation normalization requires the central Sage expression bridge; pass a callable"
    )


def implicit_plot(
    f: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    **options: Any,
) -> PlotSpec:
    """Plot the zero set of a callable field as a semantic contour layer."""
    return field_plot_spec(
        implicit_field_layer(equify(f), xrange, yrange, options=options)
    )


def region_plot(
    f: Callable[[float, float], Any] | Sequence[Callable[[float, float], Any]],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    **options: Any,
) -> PlotSpec:
    """Plot the intersection of callable predicates using Sage truthiness."""
    return field_plot_spec(region_field_layer(f, xrange, yrange, options=options))


__all__ = [
    "ContourPlot",
    "contour_plot",
    "equify",
    "implicit_plot",
    "region_plot",
]
