"""Storage-neutral contracts for exact univariate polynomial invariants.

This module owns the small semantic layer around mature polynomial backends.
It deliberately does not factor, compute content, or divide a polynomial: the
public parent supplies those operations as callbacks.  A generated FLINT
resource, a packed portable polynomial, and an ordinary Python reference can
therefore share the same edge-case behavior without sharing physical storage.

Factorization callbacks return `(unit, factors)`, where `factors` is an
iterable of `(factor, positive_multiplicity)` pairs.  The unit is kept separate
and observable.  In particular, radicals retain the scalar unit exactly as
Sage does; they do not silently make the answer monic.
"""

from __future__ import annotations

from typing import Any, Callable, Iterable, TypeAlias, TypeVar

_Polynomial = TypeVar("_Polynomial")
_Factor = TypeVar("_Factor")
_Unit = TypeVar("_Unit")

CoefficientCount: TypeAlias = Callable[[Any], int]
CoefficientAt: TypeAlias = Callable[[Any, int], Any]
FactorizationPlan: TypeAlias = tuple[_Unit, tuple[tuple[_Factor, int], ...]]


def _index(value: Any) -> int:
    """Return an exact Python index without accepting truncating conversions."""
    if isinstance(value, int):
        return int(value)
    try:
        method = value.__index__
    except AttributeError:
        raise TypeError(
            "'" + type(value).__name__ + "' object cannot be interpreted as an integer"
        ) from None
    answer = method()
    if not isinstance(answer, int):
        raise TypeError("__index__ returned non-int")
    return int(answer)


def _coefficient_count(source: Any, count: CoefficientCount) -> int:
    length = _index(count(source))
    if length < 0:
        raise ValueError("polynomial coefficient count must be nonnegative")
    return length


def _logical_length(
    source: Any,
    zero: Any,
    count: CoefficientCount,
    coefficient: CoefficientAt,
) -> int:
    """Return the normalized length even if a fallback exposes trailing zeros."""
    length = _coefficient_count(source, count)
    while length > 0 and coefficient(source, length - 1) == zero:
        length -= 1
    return length


def polynomial_leading_coefficient(
    source: Any,
    zero: Any,
    count: CoefficientCount,
    coefficient: CoefficientAt,
) -> Any:
    """Return the leading coefficient, or the parent zero for zero input."""
    length = _logical_length(source, zero, count, coefficient)
    if length == 0:
        return zero
    return coefficient(source, length - 1)


def polynomial_constant_coefficient(
    source: Any,
    zero: Any,
    count: CoefficientCount,
    coefficient: CoefficientAt,
) -> Any:
    """Return the constant coefficient, or the parent zero for empty input."""
    if _coefficient_count(source, count) == 0:
        return zero
    return coefficient(source, 0)


def polynomial_valuation(
    source: Any,
    zero: Any,
    infinity: Any,
    count: CoefficientCount,
    coefficient: CoefficientAt,
) -> Any:
    """Return the smallest nonzero exponent, with `infinity` for zero.

    `infinity` is supplied by the public environment so CPython references can
    use `math.inf` while Sage and Sage.js retain their exact `+Infinity` object.
    """
    length = _coefficient_count(source, count)
    for index in range(length):
        if coefficient(source, index) != zero:
            return index
    return infinity


def polynomial_monic(
    source: _Polynomial,
    zero: Any,
    count: CoefficientCount,
    coefficient: CoefficientAt,
    divide_by_leading: Callable[[_Polynomial, Any], _Polynomial],
) -> _Polynomial:
    """Return a monic polynomial through a parent-aware division callback.

    The callback owns result construction and coercion.  Thus making
    `2*x + 1` monic over `ZZ` can return an element of `QQ[x]`, while a FLINT
    resource implementation can stay resource-to-resource without exporting
    all coefficients.  Zero is rejected before the backend operation.
    """
    leading = polynomial_leading_coefficient(source, zero, count, coefficient)
    if leading == zero:
        raise ZeroDivisionError("rational division by zero")
    return divide_by_leading(source, leading)


def polynomial_content(
    source: _Polynomial,
    content: Callable[[_Polynomial], Any],
) -> Any:
    """Return backend-defined content without imposing a field convention.

    Sage exposes signed integer content on `ZZ[x]` but no `content()` method on
    its canonical `QQ[x]` implementation.  Keeping this operation behind a
    callback preserves that domain distinction and lets FLINT own the costly
    coefficient arithmetic.
    """
    return content(source)


def checked_factorization(
    unit: _Unit,
    factors: Iterable[tuple[_Factor, Any]],
) -> FactorizationPlan[_Unit, _Factor]:
    """Snapshot and validate an opaque exact factorization result."""
    checked: list[tuple[_Factor, int]] = []
    for factor, raw_multiplicity in factors:
        multiplicity = _index(raw_multiplicity)
        if multiplicity <= 0:
            raise ValueError("factor multiplicity must be a positive integer")
        checked.append((factor, multiplicity))
    return unit, tuple(checked)


def polynomial_is_squarefree(
    source: _Polynomial,
    is_zero: Callable[[_Polynomial], bool],
    factorization: Callable[[_Polynomial], tuple[Any, Iterable[tuple[Any, Any]]]],
    unit_is_squarefree: Callable[[Any], bool],
) -> bool:
    """Return whether every factor, including nonunit content, occurs once.

    The scalar callback defines the coefficient-domain convention.  A `ZZ[x]`
    caller tests the factorization unit (the signed content), so `4*x` is not
    squarefree; a `QQ[x]` caller accepts every nonzero unit.  This remains
    correct whether the backend exposes integer content as a factor or as its
    factorization unit.  Zero is always false, avoiding Sage 10.9's
    implementation-dependent `QQ[x]` zero anomaly.
    """
    if is_zero(source):
        return False
    unit, factors = factorization(source)
    checked_unit, checked = checked_factorization(unit, factors)
    if not unit_is_squarefree(checked_unit):
        return False
    for _factor, multiplicity in checked:
        if multiplicity > 1:
            return False
    return True


def polynomial_squarefree_decomposition(
    source: _Polynomial,
    is_zero: Callable[[_Polynomial], bool],
    decompose: Callable[[_Polynomial], tuple[_Unit, Iterable[tuple[_Factor, Any]]]],
    zero_decomposition: Callable[[], tuple[_Unit, Iterable[tuple[_Factor, Any]]]],
) -> FactorizationPlan[_Unit, _Factor]:
    """Return a checked backend squarefree decomposition without refactoring.

    Sage's exact domains differ at zero: `ZZ[x]` returns the empty
    factorization with unit zero, while `QQ[x]` raises `ValueError`.  The
    explicit zero callback preserves either parent policy.  Nonzero work is
    delegated unchanged to a mature squarefree-decomposition backend, and its
    scalar unit remains separate from the polynomial factors.
    """
    raw = zero_decomposition() if is_zero(source) else decompose(source)
    return checked_factorization(raw[0], raw[1])


def polynomial_radical_from_factorization(
    source: _Polynomial,
    is_zero: Callable[[_Polynomial], bool],
    factorization: Callable[[_Polynomial], tuple[_Unit, Iterable[tuple[_Factor, Any]]]],
    radical_unit: Callable[[_Unit], _Unit],
    polynomial_from_unit: Callable[[_Unit], _Polynomial],
    multiply: Callable[[_Polynomial, _Factor], _Polynomial],
) -> _Polynomial:
    """Return the unit times every distinct factor of a full factorization.

    The polynomial factorization is computed exactly once.  Multiplicities are
    discarded, but the scalar unit is not.  `radical_unit` applies the parent
    convention: it is the identity over `QQ`, so the radical of `-12*x^5` is
    `-12*x`; over `ZZ` it delegates integer radical computation and changes the
    signed content from `-12` to `-6`.  A backend may therefore keep content in
    its factorization unit instead of expanding scalar primes as polynomials.
    """
    if is_zero(source):
        raise ZeroDivisionError("division by zero")
    raw_unit, raw_factors = factorization(source)
    unit, factors = checked_factorization(raw_unit, raw_factors)
    answer = polynomial_from_unit(radical_unit(unit))
    for factor, _multiplicity in factors:
        answer = multiply(answer, factor)
    return answer


def polynomial_default_roots_from_factorization(
    source: _Polynomial,
    zero: Any,
    count: CoefficientCount,
    coefficient: CoefficientAt,
    factorization: Callable[[_Polynomial], tuple[Any, Iterable[tuple[_Factor, Any]]]],
    factor_degree: Callable[[_Factor], int],
    linear_root: Callable[[_Factor], Any],
    root_in_parent: Callable[[Any], tuple[bool, Any]],
    zero_roots: Callable[[], Any],
    multiplicities: bool = True,
) -> list[Any]:
    """Extract exact default-parent roots from a mature factorization.

    Only linear factors whose exact root is accepted by `root_in_parent` are
    returned.  Consequently `2*x - 1` contributes no default root over `ZZ`
    and contributes `1/2` over `QQ`.  Irreducible nonlinear factors are left to
    the mature backend rather than approximated.  The factor order is
    preserved, and repeated roots are combined defensively.

    `zero_roots` owns the domain-specific exception: Sage 10.9 raises
    `ValueError` over `ZZ` and `NotImplementedError` over `QQ`.  Constants
    return an empty list without invoking factorization.
    """
    length = _logical_length(source, zero, count, coefficient)
    if length == 0:
        zero_roots()
        raise AssertionError("zero_roots callback must not return")
    if length == 1:
        return []

    raw_unit, raw_factors = factorization(source)
    _unit, factors = checked_factorization(raw_unit, raw_factors)
    roots: list[tuple[Any, int]] = []
    positions: dict[Any, int] = {}
    for factor, multiplicity in factors:
        if _index(factor_degree(factor)) != 1:
            continue
        accepted, root = root_in_parent(linear_root(factor))
        if not accepted:
            continue
        try:
            found = positions.get(root, -1)
        except TypeError:
            # Exact extension-field elements are occasionally deliberately
            # unhashable.  Their factorizations are normally unique, but retain
            # the defensive duplicate behavior through equality in that case.
            found = -1
            for index, (known_root, _known_multiplicity) in enumerate(roots):
                if root == known_root:
                    found = index
                    break
        if found < 0:
            roots.append((root, multiplicity))
            try:
                positions[root] = len(roots) - 1
            except TypeError:
                pass
        else:
            roots[found] = (root, roots[found][1] + multiplicity)

    if multiplicities:
        return list(roots)
    return [root for root, _multiplicity in roots]
