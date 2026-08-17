"""Sage-qualified Plotly-native density plot constructor."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from sagejs.plotting.field_layers import density_field_layer, field_plot_spec
from sagejs.plotting.model import PlotSpec


class DensityPlot:
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
            raise ValueError("density data grid must not be empty")
        width = len(self.xy_data_array[0])
        if any(len(row) != width for row in self.xy_data_array):
            raise ValueError("density data grid must be rectangular")
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


def density_plot(
    f: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    **options: Any,
) -> PlotSpec:
    """Sample `f` and return a deterministic Plotly heatmap PlotSpec."""
    return field_plot_spec(density_field_layer(f, xrange, yrange, options=options))


__all__ = ["DensityPlot", "density_plot"]
