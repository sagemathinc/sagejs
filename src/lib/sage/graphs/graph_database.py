"""Graph database classes at SageMath's historical import path."""

from typing import Any

import sagejs.runtime as runtime

GraphDatabase: Any = runtime.reflect.get(runtime.global_object, 'GraphDatabase')
GraphQuery: Any = runtime.reflect.get(runtime.global_object, 'GraphQuery')

__all__ = ['GraphDatabase', 'GraphQuery']
