"""Dimension functions exposed at SageMath's historical import path."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

_dimension_cusp_forms = runtime.reflect.get(
    runtime.global_object, 'dimension_cusp_forms')
_dimension_eis = runtime.reflect.get(
    runtime.global_object, 'dimension_eis')
_dimension_modular_forms = runtime.reflect.get(
    runtime.global_object, 'dimension_modular_forms')
_cohen_oesterle = runtime.reflect.get(
    runtime.global_object, 'CohenOesterle')
_co_delta = runtime.reflect.get(
    runtime.global_object, 'CO_delta')
_co_nu = runtime.reflect.get(
    runtime.global_object, 'CO_nu')


def dimension_cusp_forms(
    group: Any,
    weight: Any = 2,
) -> int:
    return _dimension_cusp_forms(group, weight)


def dimension_eis(
    group: Any,
    weight: Any = 2,
) -> int:
    return _dimension_eis(group, weight)


def dimension_modular_forms(
    group: Any,
    weight: Any = 2,
) -> int:
    return _dimension_modular_forms(group, weight)


def CohenOesterle(
    character: Any,
    weight: Any,
) -> Any:
    return _cohen_oesterle(character, weight)


def CO_delta(
    exponent: Any,
    prime: Any,
    modulus: Any,
    character: Any,
) -> int:
    return _co_delta(
        exponent, prime, modulus, character)


def CO_nu(
    exponent: Any,
    prime: Any,
    modulus: Any,
    character: Any,
) -> int:
    return _co_nu(
        exponent, prime, modulus, character)
