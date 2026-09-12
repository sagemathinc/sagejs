"""Bounded portable data for verifier-owned class/unit replay objects.

Callers retain their envelope and mathematical policies. Preflight uses only
ordinary JSON values; exact mathematical services are imported only when a
caller has validated its complete envelope and requests fresh reconstruction.
"""

from __future__ import annotations

from typing import Any


class ComponentReplayResourceError(RuntimeError):
    """Detached input exceeds the fixed arithmetic preflight policy."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _keys(value: Any, names: str) -> None:
    _require(type(value) is dict and set(value) == set(names.split()), "invalid fields")


def _integer(value: Any, maximum: int, *, minimum: int = 0) -> int:
    _require(type(value) is int, "an exact JSON integer is required")
    if not minimum <= value <= maximum:
        raise ComponentReplayResourceError("integer exceeds its arithmetic preflight")
    return value


def _list(value: Any, maximum: int) -> list[Any]:
    _require(type(value) is list, "a JSON list is required")
    if len(value) > maximum:
        raise ComponentReplayResourceError("container exceeds its count limit")
    return value


def _rational(value: Any, bits: int = 512) -> None:
    _require(type(value) is list and len(value) == 2, "invalid rational pair")
    numerator = _integer(value[0], (1 << bits) - 1, minimum=-(1 << bits) + 1)
    denominator = _integer(value[1], (1 << bits) - 1, minimum=1)
    left, right = abs(numerator), denominator
    while right:
        left, right = right, left % right
    _require(left == 1, "noncanonical rational pair")


def _vector(value: Any, size: int, bits: int = 512) -> None:
    _require(len(_list(value, size)) == size, "incorrect coordinate count")
    for pair in value:
        _rational(pair, bits)


def preflight_field_order_primes(
    identity: Any,
    factor_base: Any,
    *,
    max_degree: int,
    max_base: int,
    max_prime: int,
) -> int:
    """Check the common portable schema under the caller's explicit caps."""
    _keys(identity, "field maximal_order_basis discriminant")
    field = identity["field"]
    _keys(field, "defining_polynomial degree variable")
    degree = _integer(field["degree"], max_degree, minimum=2)
    _require(
        type(field["variable"]) is str and field["variable"].isidentifier(),
        "invalid field variable",
    )
    _vector(field["defining_polynomial"], degree + 1, 32)
    _require(
        field["defining_polynomial"][-1] == [1, 1], "a monic presentation is required"
    )
    _integer(identity["discriminant"], (1 << 128) - 1, minimum=-(1 << 128) + 1)
    _require(
        len(_list(identity["maximal_order_basis"], degree)) == degree,
        "incorrect order basis size",
    )
    for row in identity["maximal_order_basis"]:
        _vector(row, degree)
    fingerprint = {
        "defining_polynomial": field["defining_polynomial"],
        "variable": field["variable"],
        "maximal_order_basis": identity["maximal_order_basis"],
        "discriminant": identity["discriminant"],
    }
    for prime in _list(factor_base, max_base):
        _keys(prime, "schema field_order_fingerprint prime e f basis residue")
        _require(
            prime["schema"] == "sagejs.number-fields.prime-ideal.v1",
            "unsupported prime schema",
        )
        _require(
            prime["field_order_fingerprint"] == fingerprint,
            "prime field/order binding differs",
        )
        p = _integer(prime["prime"], max_prime, minimum=2)
        _integer(prime["e"], degree, minimum=1)
        f = _integer(prime["f"], degree, minimum=1)
        _require(
            len(_list(prime["basis"], degree)) == degree, "incorrect prime basis size"
        )
        for row in prime["basis"]:
            _vector(row, degree)
        residue = prime["residue"]
        _keys(residue, "primitive quotient_matrix power_inverse modulus")
        for name, size in (("primitive", degree), ("modulus", f + 1)):
            _require(
                len(_list(residue[name], size)) == size, "incorrect residue vector size"
            )
            for entry in residue[name]:
                _integer(entry, p - 1)
        for name, rows in (("quotient_matrix", degree), ("power_inverse", f)):
            _require(
                len(_list(residue[name], rows)) == rows, "incorrect residue matrix size"
            )
            for row in residue[name]:
                _require(len(_list(row, f)) == f, "incorrect residue row size")
                for entry in row:
                    _integer(entry, p - 1)
    return degree


def _portable(prime: Any) -> dict[str, Any]:
    encoded = prime.to_dict()
    del encoded["field_instance"]
    del encoded["order_instance"]
    return encoded


def reconstruct_field_order_primes(
    identity: dict[str, Any], portable_primes: list[Any]
) -> tuple[Any, Any, list[Any]]:
    """Reconstruct fresh exact objects after the caller's complete preflight.

    No live producer objects, caches, reports or authority tokens are accepted.
    The portable identity and each prime are compared with their exact replay.
    """
    from sagejs.number_fields import class_unit_context as context
    from sagejs.number_fields import prime_ideals

    encoded_field = identity["field"]
    algebra = __import__("sagejs._baselib.algebra", fromlist=["QQ"])
    polynomials = __import__("sagejs._baselib.polynomial", fromlist=["PolynomialRing"])
    number_fields = __import__(
        "sagejs._baselib.number_fields", fromlist=["NumberField"]
    )
    polynomial = polynomials.PolynomialRing(algebra.QQ, "x")(
        [algebra.QQ(a) / b for a, b in encoded_field["defining_polynomial"]]
    )
    field = number_fields.NumberField(polynomial, encoded_field["variable"])
    order = field.maximal_order()
    _require(
        context._order_fingerprint(field, order) == identity,
        "recomputed maximal order differs",
    )
    factor_base = []
    for portable in portable_primes:
        encoded = dict(portable)
        encoded["field_instance"] = prime_ideals._identity_token(field)
        encoded["order_instance"] = prime_ideals._identity_token(order)
        prime = prime_ideals.prime_ideal_from_dict(order, encoded)
        _require(_portable(prime) == portable, "prime payload is not canonical")
        _require(
            not any(prime == previous for previous in factor_base),
            "duplicate factor-base ideal",
        )
        factor_base.append(prime)
    return field, order, factor_base
