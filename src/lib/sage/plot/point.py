"""Sage-compatible two-dimensional point exports."""

from typing import Any

import sagejs.runtime as runtime

Point: Any = runtime.reflect.get(runtime.global_object, "Point")
point: Any = runtime.reflect.get(runtime.global_object, "point")
point2d: Any = runtime.reflect.get(runtime.global_object, "point2d")

__all__ = ["Point", "point", "point2d"]
