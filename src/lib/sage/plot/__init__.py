"""Sage-compatible plotting namespace."""

from .contour_plot import ContourPlot, contour_plot, equify, implicit_plot, region_plot
from .density_plot import DensityPlot, density_plot
from .plot_field import PlotField, plot_slope_field, plot_vector_field

__all__ = [
    "ContourPlot",
    "DensityPlot",
    "PlotField",
    "contour_plot",
    "density_plot",
    "equify",
    "implicit_plot",
    "plot_slope_field",
    "plot_vector_field",
    "region_plot",
]
