"""Sage-compatible two-dimensional polygon exports."""

from typing import Any

import sagejs.runtime as runtime

Polygon: Any = runtime.reflect.get(runtime.global_object, "Polygon")
polygon: Any = runtime.reflect.get(runtime.global_object, "polygon")
polygon2d: Any = runtime.reflect.get(runtime.global_object, "polygon2d")

__all__ = ["Polygon", "polygon", "polygon2d"]
