"""Directed graphs at SageMath's historical import path."""

from typing import Any

import sagejs.runtime as runtime

DiGraph: Any = runtime.reflect.get(runtime.global_object, 'DiGraph')

__all__ = ['DiGraph']
