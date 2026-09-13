"""Checked canonical coordinate transfer for the declared FLINT mpoly resource.

Ingress is one packed word buffer: coefficient rows followed by exponent rows.
Egress is the versioned SJFM packet, carrying the exact defining modulus and
order before its interleaved coefficient/exponent rows. No native identity or
printed polynomial is serialized, and output always binds to the supplied field.
"""

from __future__ import annotations

from typing import Any

from sagejs.polynomial_algorithms import groebner_contract as engine
from sagejs.polynomial_algorithms.generic_groebner import GenericGroebnerRing

MAX_TERMS = 4096
MAX_EXPONENT = 1048576
MAX_BYTES = 16777216
ORDERS = {"lex": 0, "deglex": 1, "degrevlex": 2}


def _context(field: Any, variables: int, order: str) -> Any:
    if (
        field.family != "finite-extension"
        or not 2 <= field.characteristic <= 4294967295
    ):
        raise NotImplementedError(
            "fq multivariate transfer needs a finite extension with p <= 4294967295"
        )
    if not 2 <= field.degree <= 1024:
        raise NotImplementedError("fq multivariate transfer needs degree 2..1024")
    if order not in ORDERS:
        raise ValueError("unsupported fq multivariate monomial order")
    return GenericGroebnerRing(variables, field, order)


def _size(field: Any, variables: int, terms: int) -> int:
    if terms < 0 or terms > MAX_TERMS:
        raise ValueError("fq multivariate transfer exceeds its term limit")
    size = 48 + 8 * (field.degree + 1 + terms * (field.degree + variables))
    if size > MAX_BYTES:
        raise ValueError("fq multivariate transfer exceeds 16 MiB")
    return size


def pack_terms(
    terms: Any, field: Any, variables: int, order: str
) -> tuple[list[int], int]:
    """Validate and pack canonical terms for one checked resource call."""
    ring = _context(field, variables, order)
    bounded = []
    for term in terms:
        if len(bounded) == MAX_TERMS:
            raise ValueError("fq multivariate transfer exceeds its input term limit")
        bounded.append(term)
    normalized = engine.canonical_polynomial(bounded, ring)
    _size(field, variables, len(normalized))
    coefficients = []
    exponents = []
    for coefficient, powers in normalized:
        coordinates = field.coordinates(coefficient)
        if len(coordinates) != field.degree or any(
            not isinstance(c, int)
            or isinstance(c, bool)
            or c < 0
            or c >= field.characteristic
            for c in coordinates
        ):
            raise ArithmeticError("field adapter returned noncanonical coordinate rows")
        coefficients.extend(coordinates)
        exponents.extend(powers)
    return coefficients + exponents, len(normalized)


def _word(source: bytes, offset: int) -> int:
    return int.from_bytes(source[offset : offset + 8], "little")


def _unpack_rows(source: bytes, field: Any, variables: int, order: str) -> Any:
    ring = _context(field, variables, order)
    if not isinstance(source, bytes) or not 48 <= len(source) <= MAX_BYTES:
        raise ValueError("invalid fq multivariate packet length")
    if source[:8] != b"SJFM\x01\x00\x00\x00":
        raise ValueError("unknown fq multivariate packet version")
    if (_word(source, 8), _word(source, 16), _word(source, 24), _word(source, 32)) != (
        field.characteristic,
        field.degree,
        variables,
        ORDERS[order],
    ):
        raise ValueError(
            "fq multivariate packet has a different field, dimension or order"
        )
    count = _word(source, 40)
    if len(source) != _size(field, variables, count):
        raise ValueError("fq multivariate packet length does not match its dimensions")
    modulus = [int(c) for c in field.descriptor()["modulus"]]
    if [_word(source, 48 + i * 8) for i in range(field.degree + 1)] != modulus:
        raise ValueError("fq multivariate packet has a different defining polynomial")
    offset = 48 + (field.degree + 1) * 8
    rows = []
    previous = None
    for _ in range(count):
        coordinates = [_word(source, offset + i * 8) for i in range(field.degree)]
        offset += field.degree * 8
        exponents = tuple(_word(source, offset + i * 8) for i in range(variables))
        offset += variables * 8
        if not any(coordinates) or any(c >= field.characteristic for c in coordinates):
            raise ValueError(
                "fq multivariate packet has a zero or noncanonical coefficient"
            )
        if any(e > MAX_EXPONENT for e in exponents):
            raise ValueError("fq multivariate packet exceeds its exponent limit")
        if (
            previous is not None
            and engine._compare_monomials(previous, exponents, ring) <= 0
        ):
            raise ValueError("fq multivariate packet terms are not strictly descending")
        rows.append((coordinates, exponents))
        previous = exponents
    return rows


def unpack_terms(source: bytes, field: Any, variables: int, order: str) -> Any:
    """Reject malformed, reordered or foreign-presentation packets.

    Preflight all coordinate/exponent rows before constructing field elements.
    This avoids allocating foreign resources for a packet whose last row is bad.
    """
    rows = _unpack_rows(source, field, variables, order)
    return tuple((field.from_coordinates(c), exponents) for c, exponents in rows)


def unpack_factorization(source: bytes, field: Any, variables: int, order: str) -> Any:
    """Decode a copied SJFF unit and factors without borrowing foreign handles.

    Framing and every embedded polynomial are preflighted before constructing
    any coefficient. This verifies transfer integrity, not factor completeness
    or irreducibility; those remain obligations of the producing algorithm.
    """
    _context(field, variables, order)
    if not isinstance(source, bytes) or not 24 <= len(source) <= MAX_BYTES:
        raise ValueError("invalid fq factorization packet length")
    if source[:8] != b"SJFF\x01\x00\x00\x00":
        raise ValueError("unknown fq factorization packet version")
    count = _word(source, 8)
    if count > MAX_TERMS:
        raise ValueError("fq factorization packet exceeds its factor limit")
    length = _word(source, 16)
    if length > len(source) - 24:
        raise ValueError("truncated fq factorization unit")
    unit = _unpack_rows(source[24 : 24 + length], field, variables, order)
    if len(unit) != 1 or any(unit[0][1]):
        raise ValueError("fq factorization unit must be a nonzero constant")
    offset = 24 + length
    factors = []
    for _ in range(count):
        if len(source) - offset < 16:
            raise ValueError("truncated fq factorization entry")
        exponent = _word(source, offset)
        length = _word(source, offset + 8)
        offset += 16
        if exponent < 1 or exponent > 4294967295:
            raise ValueError("fq factorization multiplicity is outside its envelope")
        if length > len(source) - offset:
            raise ValueError("truncated fq factorization base")
        rows = _unpack_rows(source[offset : offset + length], field, variables, order)
        if not rows or not any(any(powers) for _, powers in rows):
            raise ValueError("fq factorization base must be nonconstant")
        factors.append((rows, exponent))
        offset += length
    if offset != len(source):
        raise ValueError("trailing bytes in fq factorization packet")
    return field.from_coordinates(unit[0][0]), tuple(
        (tuple((field.from_coordinates(c), powers) for c, powers in rows), exponent)
        for rows, exponent in factors
    )
