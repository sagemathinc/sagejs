"""Sage-compatible two-dimensional arrow exports."""

from typing import Any

import sagejs.runtime as runtime

Arrow: Any = runtime.reflect.get(runtime.global_object, "Arrow")
arrow: Any = runtime.reflect.get(runtime.global_object, "arrow")
arrow2d: Any = runtime.reflect.get(runtime.global_object, "arrow2d")

__all__ = ["Arrow", "arrow", "arrow2d"]
