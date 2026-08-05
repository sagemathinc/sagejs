"""Sage-compatible graph namespace."""

from typing import Any

import sagejs.runtime as runtime

DiGraph: Any = runtime.reflect.get(runtime.global_object, 'DiGraph')
Graph: Any = runtime.reflect.get(runtime.global_object, 'Graph')
digraphs: Any = runtime.reflect.get(runtime.global_object, 'digraphs')
graphs: Any = runtime.reflect.get(runtime.global_object, 'graphs')

__all__ = ['DiGraph', 'Graph', 'digraphs', 'graphs']
