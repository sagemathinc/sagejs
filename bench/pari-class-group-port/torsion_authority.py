"""Exact torsion authority for the prepared totally real cubic boundary.

The PARI `buchall_end` result contains the order and a generator of the roots
of unity.  For a number field with a real embedding this datum has a very
small exact authority: every root of unity maps injectively to a real root of
unity, hence is `1` or `-1`.  This module derives that situation from the
prepared defining polynomial and independently checks the order of `-1` in
the exact quotient algebra.

This is intentionally ordinary CPython-parseable Python.  The operation is a
once-per-field finalization check, so native compilation would add a boundary
without removing meaningful work.
"""

from __future__ import annotations

from collections.abc import Sequence as SequenceABC
from dataclasses import dataclass
import hashlib
import json
from math import isqrt
from typing import Any, Mapping, Sequence


TORSION_SCHEMA = "sagejs.pari-class-group/real-cubic-torsion-v1"
_MAX_BYTES = 64 * 1024
_MAX_CONSTANT = 10**12


class TorsionFailure(ValueError):
    """Prepared input or detached torsion replay failed closed."""


@dataclass(frozen=True)
class TorsionReplayAuthority:
    """Pins replay to prepared neutral field data, not to a desired answer."""

    polynomial_sha256: str
    expected_result_sha256: str | None = None


@dataclass(frozen=True)
class ImmutableTorsionResult:
    """Canonical, detached exact torsion result."""

    canonical_json: bytes
    sha256: str

    def detached_payload(self) -> dict[str, Any]:
        return dict(_strict_loads(self.canonical_json)["payload"])


def _canonical(value: Any) -> bytes:
    try:
        raw = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise TorsionFailure("torsion record is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise TorsionFailure("torsion record exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise TorsionFailure("torsion record exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise TorsionFailure("duplicate torsion key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise TorsionFailure("torsion record is not strict JSON") from error
    if not isinstance(value, dict):
        raise TorsionFailure("torsion envelope must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _integers(values: Sequence[Any], length: int, name: str) -> tuple[int, ...]:
    if (
        isinstance(values, (str, bytes))
        or not isinstance(values, SequenceABC)
        or len(values) != length
    ):
        raise TorsionFailure(name + " has the wrong shape")
    answer: list[int] = []
    for value in values:
        if isinstance(value, bool):
            raise TorsionFailure(name + " contains a non-integer")
        try:
            integer = int(value)
        except (TypeError, ValueError, OverflowError) as error:
            raise TorsionFailure(name + " contains a non-integer") from error
        if str(integer) != str(value):
            raise TorsionFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return tuple(answer)


def _polynomial_sha256(coefficients: Sequence[int]) -> str:
    return _sha256(_canonical([str(value) for value in coefficients]))


def prepared_polynomial_sha256(coefficients: Sequence[int]) -> str:
    """Return the neutral prepared-field identity used by replay authority."""

    polynomial = _integers(coefficients, 4, "prepared polynomial")
    return _polynomial_sha256(polynomial)


def _evaluate(coefficients: Sequence[int], value: int) -> int:
    answer = 0
    for coefficient in reversed(coefficients):
        answer = answer * value + coefficient
    return answer


def _rational_root_transcript(coefficients: Sequence[int]) -> tuple[int, str]:
    """Prove a monic cubic irreducible by exhausting its possible roots."""

    constant = abs(coefficients[0])
    if constant == 0 or constant > _MAX_CONSTANT:
        raise TorsionFailure("cubic constant is outside the replay bound")
    candidates: list[int] = []
    for divisor in range(1, isqrt(constant) + 1):
        if constant % divisor == 0:
            candidates.extend((divisor, -divisor))
            quotient = constant // divisor
            if quotient != divisor:
                candidates.extend((quotient, -quotient))
    candidates.sort()
    transcript = bytearray()
    for candidate in candidates:
        value = _evaluate(coefficients, candidate)
        if value == 0:
            raise TorsionFailure("prepared cubic is reducible")
        transcript.extend(f"{candidate}:{value}\n".encode("ascii"))
    return len(candidates), _sha256(bytes(transcript))


def _cubic_discriminant(coefficients: Sequence[int]) -> int:
    d, c, b, a = coefficients
    return (
        b * b * c * c
        - 4 * a * c * c * c
        - 4 * b * b * b * d
        - 27 * a * a * d * d
        + 18 * a * b * c * d
    )


def _multiply_mod(
    left: Sequence[int], right: Sequence[int], polynomial: Sequence[int]
) -> tuple[int, int, int]:
    """Multiply power-basis coordinates in `Z[x]/(polynomial)`."""

    product = [0] * 5
    for i in range(3):
        for j in range(3):
            product[i + j] += left[i] * right[j]
    # The polynomial is monic: x^3 = -(f[0] + f[1]x + f[2]x^2).
    for degree in (4, 3):
        leading = product[degree]
        if leading:
            product[degree] = 0
            for lower in range(3):
                product[degree - 3 + lower] -= leading * polynomial[lower]
    return product[0], product[1], product[2]


def _determinant_3x3(entries: Sequence[int]) -> int:
    a, d, g, b, e, h, c, f, i = entries
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


def _derive_payload(coefficients: Sequence[Any]) -> dict[str, Any]:
    polynomial = _integers(coefficients, 4, "prepared polynomial")
    if polynomial[3] != 1:
        raise TorsionFailure("prepared cubic must be monic")
    if any(abs(value).bit_length() > 256 for value in polynomial):
        raise TorsionFailure("prepared cubic coefficient exceeds the replay bound")

    tested_roots, root_transcript_sha256 = _rational_root_transcript(polynomial)
    discriminant = _cubic_discriminant(polynomial)
    if discriminant <= 0:
        raise TorsionFailure("prepared cubic has no certified real embedding")

    one = (1, 0, 0)
    generator = (-1, 0, 0)
    square = _multiply_mod(generator, generator, polynomial)
    if generator == one or square != one:
        raise TorsionFailure("torsion generator does not have exact order two")
    multiplication = tuple(
        coordinate
        for basis in ((1, 0, 0), (0, 1, 0), (0, 0, 1))
        for coordinate in _multiply_mod(generator, basis, polynomial)
    )
    generator_norm = _determinant_3x3(multiplication)
    if generator_norm != -1:
        raise TorsionFailure("torsion generator has the wrong exact norm")

    # A positive cubic discriminant gives three real embeddings.  Under any
    # one of them, a root of unity lands in R and is therefore +/-1.  The
    # embedding is injective, so the two elements verified above are all of
    # mu(K), not merely a subgroup of it.
    return {
        "field": {
            "polynomial_ascending": [str(value) for value in polynomial],
            "polynomial_sha256": _polynomial_sha256(polynomial),
            "degree": "3",
            "discriminant": str(discriminant),
            "real_places": "3",
            "complex_places": "0",
        },
        "irreducibility": {
            "method": "monic-cubic-rational-root-exhaustion",
            "tested_root_count": str(tested_roots),
            "transcript_sha256": root_transcript_sha256,
        },
        "torsion": {
            "order": "2",
            "generator_power_basis": ["-1", "0", "0"],
            "generator_squared": ["1", "0", "0"],
            "generator_norm": str(generator_norm),
        },
        "maximality": {
            "method": "injective-real-embedding",
            "real_root_of_unity_bound": "2",
            "verified_exact_order": "2",
        },
    }


def derive_real_cubic_torsion(coefficients: Sequence[Any]) -> ImmutableTorsionResult:
    """Derive and seal exact roots-of-unity data from a prepared cubic."""

    payload = _derive_payload(coefficients)
    payload_raw = _canonical(payload)
    envelope = {
        "schema": TORSION_SCHEMA,
        "payload": payload,
        "payload_sha256": _sha256(payload_raw),
    }
    canonical_json = _canonical(envelope)
    return ImmutableTorsionResult(canonical_json, _sha256(canonical_json))


def _exact_mapping(value: Any, fields: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise TorsionFailure(name + " has the wrong fields")
    return value


def cold_replay_torsion(
    value: ImmutableTorsionResult | bytes | str,
    authority: TorsionReplayAuthority,
) -> ImmutableTorsionResult:
    """Recompute every claim and enforce the neutral prepared-field pin."""

    raw = value.canonical_json if isinstance(value, ImmutableTorsionResult) else value
    envelope = _strict_loads(raw)
    _exact_mapping(envelope, {"schema", "payload", "payload_sha256"}, "envelope")
    if envelope["schema"] != TORSION_SCHEMA:
        raise TorsionFailure("wrong torsion schema")
    payload = _exact_mapping(
        envelope["payload"],
        {"field", "irreducibility", "torsion", "maximality"},
        "payload",
    )
    field = _exact_mapping(
        payload["field"],
        {
            "polynomial_ascending",
            "polynomial_sha256",
            "degree",
            "discriminant",
            "real_places",
            "complex_places",
        },
        "field",
    )
    polynomial = _integers(field["polynomial_ascending"], 4, "replayed polynomial")
    expected = _derive_payload(polynomial)
    if payload != expected:
        raise TorsionFailure("torsion evidence does not replay exactly")
    payload_raw = _canonical(payload)
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise TorsionFailure("torsion payload hash mismatch")
    if field["polynomial_sha256"] != authority.polynomial_sha256:
        raise TorsionFailure("torsion field does not match prepared authority")
    canonical_json = _canonical(envelope)
    result = ImmutableTorsionResult(canonical_json, _sha256(canonical_json))
    if (
        authority.expected_result_sha256 is not None
        and result.sha256 != authority.expected_result_sha256
    ):
        raise TorsionFailure("torsion result does not match publication authority")
    return result
