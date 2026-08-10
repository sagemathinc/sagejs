"""Undirected graphs at SageMath's historical import path."""

from typing import Any

import sagejs.runtime as runtime

Graph: Any = runtime.reflect.get(runtime.global_object, "Graph")

__all__ = ["Graph"]
