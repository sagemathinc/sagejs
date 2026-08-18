"""Independent construction and merge of coprime composite local orders.

A discriminant decomposition partitions its supports into pairwise-coprime
components.  Local maximality at one support is therefore unaffected by the
denominators introduced at another support.  Constructing every composite
overorder from the equation order keeps that separation explicit; the
resulting orders may then be joined as lattices.

This module deliberately knows nothing about the host `NumberFieldOrder`
representation.  Callers supply the two small host operations needed to
materialize and merge an independently certified local result.
"""

from __future__ import annotations

from typing import Any, Callable

from sagejs.number_fields.buchmann_lenstra import (
    BuchmannLenstraResult,
    buchmann_lenstra_multiplier_cycle,
    buchmann_lenstra_overorder,
    check_buchmann_lenstra_general_result,
    check_buchmann_lenstra_result,
)
from sagejs.number_fields.maximal_order_contracts import (
    DiscriminantComponent,
    OrderBasis,
)


def _gcd(left: int, right: int) -> int:
    a = abs(int(left))
    b = abs(int(right))
    while b:
        a, b = b, a % b
    return a


def equation_order_basis(degree: int) -> OrderBasis:
    """Return the canonical equation-order basis in degree `degree`."""
    if degree <= 0:
        raise ValueError("the equation-order degree must be positive")
    return OrderBasis(
        [
            [1 if row == column else 0 for column in range(degree)]
            for row in range(degree)
        ],
        1,
    )


def certified_composite_overorder_from_equation(
    polynomial_coefficients: list[int],
    component: DiscriminantComponent,
    equation_discriminant: int,
) -> BuchmannLenstraResult:
    """Construct and replay one composite local order from the equation order.

    A first Dedekind enlargement is continued only on the *same* local
    component.  Denominators belonging to earlier coprime components never
    enter this local multiplier cycle.
    """
    coefficients = [int(value) for value in polynomial_coefficients]
    if len(coefficients) < 2 or coefficients[-1] != 1:
        raise ValueError("the defining polynomial must be monic")
    if component.state not in ("composite", "unresolved-coprime-component"):
        raise ValueError("the independent composite path requires a composite")
    starting_basis = equation_order_basis(len(coefficients) - 1)
    result = buchmann_lenstra_overorder(
        coefficients,
        component,
        basis=starting_basis,
        equation_discriminant=int(equation_discriminant),
    )
    if not check_buchmann_lenstra_result(coefficients, result):
        raise ArithmeticError("composite Dedekind replay rejected its result")
    if result.state != "enlarged":
        return result
    if result.basis is None:
        raise ArithmeticError("a composite enlargement omitted its basis")
    local_start = result.basis
    result = buchmann_lenstra_multiplier_cycle(
        coefficients,
        component,
        local_start,
        equation_discriminant=int(equation_discriminant),
    )
    if not check_buchmann_lenstra_general_result(
        coefficients,
        local_start,
        result,
        equation_discriminant=int(equation_discriminant),
    ):
        raise ArithmeticError("composite multiplier-cycle replay rejected its result")
    return result


def merge_certified_coprime_composite_order(
    accumulated_order: Any,
    processed_supports: tuple[int, ...],
    result: BuchmannLenstraResult,
    *,
    materialize_local_order: Callable[[OrderBasis, int], Any],
    merge_orders: Callable[[Any, Any], Any],
) -> tuple[Any, tuple[int, ...]]:
    """Join one independently complete local order to prior coprime work.

    The caller remains responsible for the final global lattice certificate.
    This function enforces the exact local prerequisites before invoking host
    materialization: completeness, a basis/discriminant pair, and support
    coprimality with every already merged composite component.
    """
    if result.state != "complete":
        raise ValueError("only a complete composite local order may be merged")
    if result.basis is None or result.discriminant is None:
        raise ArithmeticError("a complete composite result omitted its lattice")
    support = int(result.component.value)
    normalized = tuple(int(value) for value in processed_supports)
    if support <= 1:
        raise ValueError("a composite support must exceed one")
    if any(value <= 1 for value in normalized):
        raise ValueError("processed composite supports must exceed one")
    if any(_gcd(support, value) != 1 for value in normalized):
        raise ArithmeticError("composite local-order supports are not coprime")
    local_order = materialize_local_order(result.basis, int(result.discriminant))
    return merge_orders(accumulated_order, local_order), normalized + (support,)


__all__ = [
    "certified_composite_overorder_from_equation",
    "equation_order_basis",
    "merge_certified_coprime_composite_order",
]
