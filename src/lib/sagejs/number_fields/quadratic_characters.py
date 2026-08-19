"""Primitive quadratic Dirichlet characters without group enumeration.

For a fundamental discriminant `D`, the associated primitive character is
`chi_D(n) = (D/n)`, where the right hand side is the Kronecker symbol.  A
Dirichlet group in Sage.js is stored as a product of cyclic groups.  Evaluating
the Kronecker symbol only on its unit generators therefore determines the
character directly: the component log is zero for value `+1` and half the
component order for value `-1`.

This is ordinary CPython-parseable mathematical source.  The public baselib
hook supplies Sage.js's `DirichletGroup`; tests can instead provide a small
group implementing `unit_gens()`, `_orders`, and `_from_logs()`.
"""

from __future__ import annotations

from typing import Any, Callable

__all__ = [
    "fundamental_discriminant",
    "is_fundamental_discriminant",
    "kronecker_character",
    "kronecker_character_logs",
    "kronecker_symbol",
    "squarefree_part",
]


def _isqrt(value: int) -> int:
    if value < 0:
        raise ValueError("integer square root requires a nonnegative integer")
    if value < 2:
        return value
    previous = value
    current = (previous + 1) // 2
    while current < previous:
        previous = current
        current = (current + value // current) // 2
    return previous


def _integer(value: Any, name: str = "value") -> int:
    try:
        result = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    try:
        if value != result:
            raise TypeError(name + " must be an integer")
    except TypeError:
        raise
    except Exception:
        pass
    return result


def kronecker_symbol(left: Any, right: Any) -> int:
    """Return the exact Kronecker symbol `(left/right)`.

    The implementation is the binary Jacobi algorithm with the standard
    extensions at a negative denominator, powers of two, and denominator zero.
    It does not factor either argument.
    """

    a = _integer(left, "left argument")
    b = _integer(right, "right argument")
    if b == 0:
        return 1 if abs(a) == 1 else 0
    result = 1
    if b < 0:
        b = -b
        if a < 0:
            result = -result

    while b % 2 == 0:
        b //= 2
        residue = a % 8
        if residue % 2 == 0:
            return 0
        if residue in (3, 5):
            result = -result

    if b == 1:
        return result
    a %= b
    while a:
        while a % 2 == 0:
            a //= 2
            if b % 8 in (3, 5):
                result = -result
        a, b = b, a
        if a % 4 == 3 and b % 4 == 3:
            result = -result
        a %= b
    return result if b == 1 else 0


def _is_squarefree_trial(value: int) -> bool:
    value = abs(value)
    if value == 0:
        return False
    if value % 4 == 0:
        return False
    prime = 3
    while prime <= _isqrt(value):
        if value % (prime * prime) == 0:
            return False
        prime += 2
    return True


def _sage_factor_provider(value: int) -> list[tuple[Any, Any]] | None:
    """Use Sage.js's mature factorizer in the mathematics environment."""

    try:
        import sagejs as sage

        factor = getattr(sage, "factor", None)
        if factor is not None:
            return list(factor(value))
    except (ImportError, AttributeError):
        pass
    return None


def is_fundamental_discriminant(
    discriminant: Any,
    *,
    factor_provider: Callable[[int], list[tuple[Any, Any]]] | None = None,
) -> bool:
    """Return whether `discriminant` is a fundamental discriminant.

    The conductor-one discriminant `1` is accepted; it is useful for the
    trivial Kronecker character even though it is not a quadratic-field
    discriminant.  A caller with a mature integer factorizer may supply it to
    avoid the portable trial-division fallback for very large inputs.
    """

    value = _integer(discriminant, "discriminant")
    if value == 0:
        return False
    if value % 4 == 1:
        core = value
    elif value % 4 == 0 and (value // 4) % 4 in (2, 3):
        core = value // 4
    else:
        return False
    if factor_provider is None:
        factors = _sage_factor_provider(abs(core))
        if factors is None:
            return _is_squarefree_trial(core)
    else:
        factors = factor_provider(abs(core))
    return all(_integer(exponent, "factor exponent") == 1 for _, exponent in factors)


def squarefree_part(
    radicand: Any,
    *,
    factor_provider: Callable[[int], list[tuple[Any, Any]]] | None = None,
) -> int:
    """Return the signed squarefree part of a nonzero integer."""

    value = _integer(radicand, "radicand")
    if value == 0:
        raise ValueError("a quadratic radicand must be nonzero")
    sign = -1 if value < 0 else 1
    absolute = abs(value)
    result = 1
    if factor_provider is None:
        prime = 2
        remaining = absolute
        while prime <= _isqrt(remaining):
            parity = 0
            while remaining % prime == 0:
                remaining //= prime
                parity ^= 1
            if parity:
                result *= prime
            prime = 3 if prime == 2 else prime + 2
        if remaining > 1:
            result *= remaining
    else:
        for prime, exponent in factor_provider(absolute):
            if _integer(exponent, "factor exponent") % 2:
                result *= _integer(prime, "prime factor")
    return sign * result


def fundamental_discriminant(
    radicand: Any,
    *,
    factor_provider: Callable[[int], list[tuple[Any, Any]]] | None = None,
) -> int:
    """Return the field discriminant of `QQ(sqrt(radicand))`.

    Perfect-square radicands do not define quadratic fields and are rejected.
    """

    core = squarefree_part(radicand, factor_provider=factor_provider)
    if core == 1:
        raise ValueError("a perfect-square radicand does not define a quadratic field")
    return core if core % 4 == 1 else 4 * core


def kronecker_character_logs(
    discriminant: Any,
    unit_generators: list[Any] | tuple[Any, ...],
    cyclic_orders: list[Any] | tuple[Any, ...],
) -> list[int]:
    """Return mixed-radix character logs from unit-group generators."""

    value = _integer(discriminant, "discriminant")
    if len(unit_generators) != len(cyclic_orders):
        raise ValueError("unit generators and cyclic orders must have equal length")
    logs = []
    for generator, raw_order in zip(unit_generators, cyclic_orders, strict=True):
        order = _integer(raw_order, "cyclic order")
        if order <= 0:
            raise ValueError("cyclic orders must be positive")
        character_value = kronecker_symbol(value, generator)
        if character_value == 1:
            logs.append(0)
        elif character_value == -1 and order % 2 == 0:
            logs.append(order // 2)
        elif character_value == -1:
            raise ArithmeticError("a value -1 cannot occur on an odd cyclic factor")
        else:
            raise ArithmeticError("a Dirichlet unit generator was not coprime to D")
    return logs


def _default_group_factory(modulus: int) -> Any:
    import sagejs as sage

    sage_module: Any = sage
    return sage_module.DirichletGroup(modulus)


def kronecker_character(
    discriminant_or_radicand: Any,
    *,
    reduce_radicand: bool = False,
    group_factory: Callable[[int], Any] | None = None,
    factor_provider: Callable[[int], list[tuple[Any, Any]]] | None = None,
) -> Any:
    """Construct `chi_D` directly in a Dirichlet group.

    Set `reduce_radicand=True` to interpret the input as a quadratic radicand
    and replace it by its fundamental field discriminant.  The constructor
    never enumerates the characters of the group.
    """

    if reduce_radicand:
        discriminant = fundamental_discriminant(
            discriminant_or_radicand,
            factor_provider=factor_provider,
        )
    else:
        discriminant = _integer(discriminant_or_radicand, "discriminant")
        if not is_fundamental_discriminant(
            discriminant,
            factor_provider=factor_provider,
        ):
            raise ValueError("D must be a fundamental discriminant")
    factory = _default_group_factory if group_factory is None else group_factory
    group = factory(abs(discriminant))
    orders = list(group._orders)
    logs = kronecker_character_logs(discriminant, list(group.unit_gens()), orders)
    character = group._from_logs(logs)

    # These are independent checks of the mixed-radix construction and catch
    # representation or normalization drift at the native group boundary.
    if int(character.modulus()) != abs(discriminant):
        raise ArithmeticError("Kronecker character has the wrong modulus")
    if int(character.conductor()) != abs(discriminant):
        raise ArithmeticError("Kronecker character has the wrong conductor")
    if not character.is_primitive() or not character.is_real():
        raise ArithmeticError("Kronecker character is not primitive and real")
    expected_even = discriminant > 0
    if bool(character.is_even()) != expected_even:
        raise ArithmeticError("Kronecker character has the wrong parity")
    return character
