"""Helpers for preparing functions and ranges for plotting."""

from typing import Any

import sagejs.runtime as runtime

FastCallablePlotWrapper: Any = runtime.reflect.get(
    runtime.global_object, "FastCallablePlotWrapper"
)
get_matplotlib_linestyle: Any = runtime.reflect.get(
    runtime.global_object, "get_matplotlib_linestyle"
)
setup_for_eval_on_grid: Any = runtime.reflect.get(
    runtime.global_object, "setup_for_eval_on_grid"
)
unify_arguments: Any = runtime.reflect.get(runtime.global_object, "unify_arguments")

__all__ = [
    "FastCallablePlotWrapper",
    "get_matplotlib_linestyle",
    "setup_for_eval_on_grid",
    "unify_arguments",
]
