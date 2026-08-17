"""Sage-compatible two-dimensional text exports."""

from typing import Any

import sagejs.runtime as runtime

Text: Any = runtime.reflect.get(runtime.global_object, "Text")
text: Any = runtime.reflect.get(runtime.global_object, "text")

__all__ = ["Text", "text"]
