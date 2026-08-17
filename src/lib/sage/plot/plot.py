"""Sage-compatible constructors and samplers for plane curves."""

from typing import Any

import sagejs.runtime as runtime

adaptive_refinement: Any = runtime.reflect.get(
    runtime.global_object, "adaptive_refinement"
)
generate_plot_points: Any = runtime.reflect.get(
    runtime.global_object, "generate_plot_points"
)
graphics_array: Any = runtime.reflect.get(runtime.global_object, "graphics_array")
list_plot: Any = runtime.reflect.get(runtime.global_object, "list_plot")
list_plot_loglog: Any = runtime.reflect.get(runtime.global_object, "list_plot_loglog")
list_plot_semilogx: Any = runtime.reflect.get(
    runtime.global_object, "list_plot_semilogx"
)
list_plot_semilogy: Any = runtime.reflect.get(
    runtime.global_object, "list_plot_semilogy"
)
multi_graphics: Any = runtime.reflect.get(runtime.global_object, "multi_graphics")
parametric_plot: Any = runtime.reflect.get(runtime.global_object, "parametric_plot")
plot: Any = runtime.reflect.get(runtime.global_object, "plot")
plot_loglog: Any = runtime.reflect.get(runtime.global_object, "plot_loglog")
plot_semilogx: Any = runtime.reflect.get(runtime.global_object, "plot_semilogx")
plot_semilogy: Any = runtime.reflect.get(runtime.global_object, "plot_semilogy")
polar_plot: Any = runtime.reflect.get(runtime.global_object, "polar_plot")

__all__ = [
    "adaptive_refinement",
    "generate_plot_points",
    "graphics_array",
    "list_plot",
    "list_plot_loglog",
    "list_plot_semilogx",
    "list_plot_semilogy",
    "multi_graphics",
    "parametric_plot",
    "plot",
    "plot_loglog",
    "plot_semilogx",
    "plot_semilogy",
    "polar_plot",
]
