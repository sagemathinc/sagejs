"""Sage-qualified semantic vector and slope field constructors."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from sagejs.plotting.field_layers import (
    field_plot_spec,
    slope_field_layer,
    vector_field_layer,
)
from sagejs.plotting.model import PlotSpec


class PlotField:
    """Portable data holder matching Sage's public primitive constructor."""

    def __init__(
        self,
        xpos_array: Sequence[Any],
        ypos_array: Sequence[Any],
        xvec_array: Sequence[Any],
        yvec_array: Sequence[Any],
        options: Mapping[str, Any],
    ) -> None:
        arrays = (
            list(xpos_array),
            list(ypos_array),
            list(xvec_array),
            list(yvec_array),
        )
        if len({len(array) for array in arrays}) != 1:
            raise ValueError("vector field arrays must have equal lengths")
        (
            self.xpos_array,
            self.ypos_array,
            self.xvec_array,
            self.yvec_array,
        ) = arrays
        self._options = dict(options)

    def options(self) -> dict[str, Any]:
        """Return detached primitive options."""
        return dict(self._options)

    def get_minmax_data(self) -> dict[str, float]:
        """Return Sage-compatible bounds of the vector anchor points."""
        if not self.xpos_array or not self.ypos_array:
            raise ValueError("vector field has no anchor points")
        x_values = [float(value) for value in self.xpos_array]
        y_values = [float(value) for value in self.ypos_array]
        return {
            "xmin": min(x_values),
            "xmax": max(x_values),
            "ymin": min(y_values),
            "ymax": max(y_values),
        }


def plot_vector_field(
    f_g: Sequence[Callable[[float, float], Any]],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    **options: Any,
) -> PlotSpec:
    """Sample a two-component callable field and return its semantic PlotSpec."""
    return field_plot_spec(vector_field_layer(f_g, xrange, yrange, options=options))


def plot_slope_field(
    f: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    **kwds: Any,
) -> PlotSpec:
    """Sample slope `f(x, y)` as normalized direction vectors."""
    return field_plot_spec(slope_field_layer(f, xrange, yrange, options=kwds))


__all__ = ["PlotField", "plot_slope_field", "plot_vector_field"]
