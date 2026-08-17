"""Sage-compatible two-dimensional line exports."""

from typing import Any

import sagejs.runtime as runtime

Line: Any = runtime.reflect.get(runtime.global_object, "Line")
line: Any = runtime.reflect.get(runtime.global_object, "line")
line2d: Any = runtime.reflect.get(runtime.global_object, "line2d")

__all__ = ["Line", "line", "line2d"]
