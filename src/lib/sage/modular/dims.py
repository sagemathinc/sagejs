"""Dimension functions exposed at SageMath's historical import path."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

_dimension_cusp_forms = runtime.reflect.get(
    runtime.global_object, 'dimension_cusp_forms')


def dimension_cusp_forms(
    group: Any,
    weight: Any = 2,
) -> int:
    return _dimension_cusp_forms(group, weight)
