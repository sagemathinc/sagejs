"""Contract and portable oracle for arbitrary-prime univariate polynomials.

This module describes the semantic and ownership boundary for `GF(p)[x]` when
`p` does not fit in a FLINT word.  It is intentionally independent of both a
host object layout and FLINT's in-memory layout.  The production representation
is expected to be one generated opaque resource containing both an
`fmpz_mod_ctx_t` and its `fmpz_mod_poly_t`.  Each polynomial therefore remains
valid independently of its parent object, its operands, and every other
polynomial resource.

The decisive lifetime rules are:

- initialize the context before the polynomial and clear them in reverse order;
- synchronously borrow operands, but return newly allocated callee-owned
  resources for every non-mutating polynomial result;
- make each result own an equivalent context instead of borrowing an operand's
  context;
- return factorization, division, and extended-GCD aggregates as owned result
  resources whose extracted polynomial children are independent owners;
- return variable-size text and serialized data as callee-owned regions;
- never ask the caller to predict coefficient, limb, text, factor, or result
  capacity.

The dense-list functions are deliberately small.  They provide a correct
same-source oracle for construction, arithmetic, Euclidean division, GCD,
extended GCD, evaluation, and formatting.  Production operations should call
the mature `fmpz_mod_poly` algorithms through generated declarations rather
than use these quadratic reference algorithms for large inputs.

Coefficients are low-to-high canonical integer residues.  Coercion into a
finite field belongs to the public parent layer; this module receives exact
integer lifts after that coercion.  Polynomial variable names likewise remain
parent metadata and are needed only for formatting.
"""

from __future__ import annotations

from typing import Any, Iterable


def _index(value: Any) -> int:
    """Return an exact Python index without accepting truncating conversion."""
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


def checked_prime_modulus(modulus: Any) -> int:
    """Validate the shape of a prime modulus already certified by its parent.

    Primality testing is intentionally not repeated here.  The canonical
    finite-field parent owns that expensive proof or probable-prime policy.
    """
    value = _index(modulus)
    if value < 2:
        raise ValueError("prime modulus must be at least 2")
    return value


def require_same_prime_modulus(left: Any, right: Any) -> int:
    """Return a shared modulus or reject a mismatched resource operation."""
    left_value = checked_prime_modulus(left)
    right_value = checked_prime_modulus(right)
    if left_value != right_value:
        raise ValueError("arbitrary-prime polynomial moduli do not match")
    return left_value


def normalized_residues(coefficients: Iterable[Any], modulus: Any) -> list[int]:
    """Reduce exact integer lifts modulo `modulus` and remove trailing zeros."""
    prime = checked_prime_modulus(modulus)
    answer = [_index(coefficient) % prime for coefficient in coefficients]
    while answer and answer[-1] == 0:
        answer.pop()
    return answer


def _add_or_subtract(
    left: Iterable[Any],
    right: Iterable[Any],
    modulus: Any,
    subtract: bool,
) -> list[int]:
    prime = checked_prime_modulus(modulus)
    left_values = normalized_residues(left, prime)
    right_values = normalized_residues(right, prime)
    length = max(len(left_values), len(right_values))
    answer = [0] * length
    for index in range(length):
        left_value = left_values[index] if index < len(left_values) else 0
        right_value = right_values[index] if index < len(right_values) else 0
        answer[index] = (
            left_value - right_value if subtract else left_value + right_value
        ) % prime
    return normalized_residues(answer, prime)


def polynomial_add_mod(
    left: Iterable[Any], right: Iterable[Any], modulus: Any
) -> list[int]:
    """Add two dense polynomials in `GF(modulus)[x]`."""
    return _add_or_subtract(left, right, modulus, False)


def polynomial_subtract_mod(
    left: Iterable[Any], right: Iterable[Any], modulus: Any
) -> list[int]:
    """Subtract two dense polynomials in `GF(modulus)[x]`."""
    return _add_or_subtract(left, right, modulus, True)


def polynomial_negate_mod(source: Iterable[Any], modulus: Any) -> list[int]:
    """Negate a dense polynomial in `GF(modulus)[x]`."""
    prime = checked_prime_modulus(modulus)
    return normalized_residues(
        [(-coefficient) % prime for coefficient in normalized_residues(source, prime)],
        prime,
    )


def polynomial_multiply_mod(
    left: Iterable[Any], right: Iterable[Any], modulus: Any
) -> list[int]:
    """Multiply two dense polynomials using the portable quadratic oracle."""
    prime = checked_prime_modulus(modulus)
    left_values = normalized_residues(left, prime)
    right_values = normalized_residues(right, prime)
    if not left_values or not right_values:
        return []
    answer = [0] * (len(left_values) + len(right_values) - 1)
    for left_index, left_value in enumerate(left_values):
        for right_index, right_value in enumerate(right_values):
            index = left_index + right_index
            answer[index] = (answer[index] + left_value * right_value) % prime
    return normalized_residues(answer, prime)


def _scalar_multiply(source: list[int], scalar: int, prime: int) -> list[int]:
    return normalized_residues(
        [(coefficient * scalar) % prime for coefficient in source], prime
    )


def polynomial_divrem_mod(
    numerator: Iterable[Any], denominator: Iterable[Any], modulus: Any
) -> tuple[list[int], list[int]]:
    """Return Euclidean quotient and remainder over an arbitrary prime field."""
    prime = checked_prime_modulus(modulus)
    dividend = normalized_residues(numerator, prime)
    divisor = normalized_residues(denominator, prime)
    if not divisor:
        raise ZeroDivisionError("division by zero polynomial")
    if len(dividend) < len(divisor):
        return [], dividend
    quotient = [0] * (len(dividend) - len(divisor) + 1)
    inverse_leading = pow(divisor[-1], -1, prime)
    while dividend and len(dividend) >= len(divisor):
        shift = len(dividend) - len(divisor)
        coefficient = dividend[-1] * inverse_leading % prime
        quotient[shift] = coefficient
        for index, divisor_coefficient in enumerate(divisor):
            target = index + shift
            dividend[target] = (
                dividend[target] - coefficient * divisor_coefficient
            ) % prime
        while dividend and dividend[-1] == 0:
            dividend.pop()
    return normalized_residues(quotient, prime), dividend


def _monic_with_scale(source: list[int], prime: int) -> tuple[list[int], int]:
    if not source:
        return [], 1
    scale = pow(source[-1], -1, prime)
    return _scalar_multiply(source, scale, prime), scale


def polynomial_gcd_mod(
    left: Iterable[Any], right: Iterable[Any], modulus: Any
) -> list[int]:
    """Return Sage's monic polynomial GCD, with `gcd(0, 0) == 0`."""
    prime = checked_prime_modulus(modulus)
    old = normalized_residues(left, prime)
    current = normalized_residues(right, prime)
    while current:
        _quotient, remainder = polynomial_divrem_mod(old, current, prime)
        old, current = current, remainder
    return _monic_with_scale(old, prime)[0]


def polynomial_xgcd_mod(
    left: Iterable[Any], right: Iterable[Any], modulus: Any
) -> tuple[list[int], list[int], list[int]]:
    """Return monic `(g, s, t)` satisfying `s*left + t*right == g`.

    The zero pair follows Sage 10.9 and returns `(0, 1, 0)`.
    """
    prime = checked_prime_modulus(modulus)
    old_remainder = normalized_residues(left, prime)
    remainder = normalized_residues(right, prime)
    old_left_cofactor, left_cofactor = [1], []
    old_right_cofactor, right_cofactor = [], [1]
    while remainder:
        quotient, next_remainder = polynomial_divrem_mod(
            old_remainder, remainder, prime
        )
        old_remainder, remainder = remainder, next_remainder
        old_left_cofactor, left_cofactor = (
            left_cofactor,
            polynomial_subtract_mod(
                old_left_cofactor,
                polynomial_multiply_mod(quotient, left_cofactor, prime),
                prime,
            ),
        )
        old_right_cofactor, right_cofactor = (
            right_cofactor,
            polynomial_subtract_mod(
                old_right_cofactor,
                polynomial_multiply_mod(quotient, right_cofactor, prime),
                prime,
            ),
        )
    if not old_remainder:
        return [], [1], []
    gcd, scale = _monic_with_scale(old_remainder, prime)
    return (
        gcd,
        _scalar_multiply(old_left_cofactor, scale, prime),
        _scalar_multiply(old_right_cofactor, scale, prime),
    )


def polynomial_evaluate_mod(
    coefficients: Iterable[Any], value: Any, modulus: Any
) -> int:
    """Evaluate a dense polynomial by Horner's method."""
    prime = checked_prime_modulus(modulus)
    point = _index(value) % prime
    answer = 0
    for coefficient in reversed(normalized_residues(coefficients, prime)):
        answer = (answer * point + coefficient) % prime
    return answer


def polynomial_format_mod(
    coefficients: Iterable[Any], variable: str, modulus: Any
) -> str:
    """Format canonical residues using Sage's dense prime-field convention."""
    if not isinstance(variable, str):
        raise TypeError("polynomial variable name must be a string")
    prime = checked_prime_modulus(modulus)
    values = normalized_residues(coefficients, prime)
    pieces: list[str] = []
    for exponent in range(len(values) - 1, -1, -1):
        coefficient = values[exponent]
        if coefficient == 0:
            continue
        if exponent == 0:
            term = str(coefficient)
        else:
            power = variable if exponent == 1 else variable + "^" + str(exponent)
            term = power if coefficient == 1 else str(coefficient) + "*" + power
        pieces.append(term)
    return " + ".join(pieces) if pieces else "0"


def arbitrary_prime_resource_contract() -> dict[str, Any]:
    """Return the machine-readable generated-resource design contract.

    This is a design witness, not an FFI declaration.  A later integration
    lane should translate it into the declaration schema without changing the
    ownership or semantic requirements asserted by this module's tests.
    """
    return {
        "schema": "sagejs.resource-contract/fmpz-mod-polynomial-v1",
        "resource": "FmpzModPolynomial",
        "owns": ("fmpz_mod_ctx_t", "fmpz_mod_poly_t"),
        "initialize": ("fmpz_mod_ctx_init", "fmpz_mod_poly_init"),
        "close": ("fmpz_mod_poly_clear", "fmpz_mod_ctx_clear"),
        "closePolicy": "deterministic-idempotent-with-finalizer-fallback",
        "operands": "synchronously-borrowed-and-rooted",
        "result": "fresh-callee-owned-self-contained-resource",
        "contextCompatibility": "equal-modulus-not-pointer-identity",
        "crossResourceLifetimeDependency": False,
        "callerPredictsCapacity": False,
        "variable": "public-parent-metadata-not-native-resource-state",
        "operations": (
            "construct",
            "copy",
            "coefficient",
            "length",
            "equal",
            "add",
            "subtract",
            "negate",
            "multiply",
            "power",
            "divrem",
            "gcd",
            "xgcd",
            "evaluate",
            "format",
            "factor",
            "roots",
            "serialize",
            "deserialize",
        ),
        "aggregateResults": {
            "divrem": "owned aggregate; extracted quotient and remainder own contexts",
            "xgcd": "owned aggregate; extracted gcd and cofactors own contexts",
            "factor": "owned aggregate; extracted factors own contexts",
            "roots": "owned aggregate; extracted roots are arbitrary-precision integer residues",
        },
        "variableSizeResults": {
            "format": "callee-owned UTF-8 region copied once then freed",
            "serialize": "callee-owned byte region copied once then freed",
            "polynomial": "callee-owned resource; no packed output capacity",
        },
        "publicSemantics": {
            "canonicalCoefficients": "least nonnegative residues, trailing zeros removed",
            "explicitPolynomialCoercion": "lift coefficients then reduce in target parent",
            "binaryParentMismatch": "TypeError before the foreign call",
            "resourceModulusMismatch": "checked rejection before FLINT arithmetic",
            "gcdNormalization": "monic, with gcd(0, 0) equal to zero",
            "xgcdNormalization": "monic gcd and Bezout identity; xgcd(0, 0)=(0,1,0)",
            "factorNormalization": "leading coefficient is the unit; factors are monic",
            "roots": "multiplicities retained; ordering is not a semantic promise",
            "serialization": "modulus, variable, and coefficients round-trip exactly",
        },
        "portableFallback": "normalized dense integer residues",
        "windows": "same-source fallback until generated FLINT capability is available",
        "wasm": "same declaration owns context and polynomial in Wasm linear memory",
    }
