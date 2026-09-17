"""Immutable live-owner handoff for the authentic composed `h = 1` root.

The composed root already owns the relation matrix, its 73 principal
generators, and both column transforms.  This module copies those logical
prefixes once into a generation-scoped immutable authority object.  A
downstream class/unit composer can then consume the exact algebraic owners
directly; it does not reopen the resident JSON or join a unit fixture.

This is an internal authority boundary for one pinned experiment.  It does not
prove class or unit saturation and does not publish a public result.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
import hashlib
import json
from typing import Any


SCHEMA = "sagejs.pari-class-group/live-h1-authority-owners-v1"
FIELD_ID = "x^3-20018*x+20034"
RUN_ID = "authentic-real-cubic-h1-p2304"
OWNER_GENERATION = 1
ROWS = 66
RELATIONS = 73
DEGREE = 3
ACTIVE_ROWS = 8
ACTIVE_COLUMNS = 15
KERNEL_COLUMNS = 7
AUTHENTIC_OWNER_SHA256 = (
    "7eed284b9a90e00bb27feea24fbbed30b9d1a9196ce4bddc5ead5e854b0eb6e9"
)
_MAX_INTEGER_DIGITS = 65536


class LiveH1AuthorityFailure(ValueError):
    """The live owner handoff is stale, malformed, or unauthenticated."""


@dataclass(frozen=True)
class LiveH1AuthorityExpectation:
    """Out-of-band identity of one accepted live-owner generation."""

    run_id: str
    owner_generation: int
    expected_owner_sha256: str

    def __post_init__(self) -> None:
        if not self.run_id:
            raise ValueError("live authority run id is empty")
        if self.owner_generation <= 0:
            raise ValueError("live authority generation must be positive")
        digest = self.expected_owner_sha256
        if len(digest) != 64 or any(ch not in "0123456789abcdef" for ch in digest):
            raise ValueError("live authority expectation needs a SHA-256 digest")


AUTHENTIC_EXPECTATION = LiveH1AuthorityExpectation(
    RUN_ID, OWNER_GENERATION, AUTHENTIC_OWNER_SHA256
)


@dataclass(frozen=True)
class ImmutableLiveH1Authority:
    """Copied exact owners and their derived raw-relation kernel map."""

    run_id: str
    owner_generation: int
    owner_sha256: str
    polynomial: tuple[int, ...]
    multiplication_table: tuple[int, ...]
    relation_exponents: tuple[int, ...]
    principal_alphas: tuple[int, ...]
    cleanup_transform: tuple[int, ...]
    active_relation: tuple[int, ...]
    active_hnf_transform: tuple[int, ...]
    kernel_relation_map: tuple[int, ...]

    def alpha(self, relation: int) -> tuple[int, int, int]:
        """Return one retained principal generator in integral-basis coordinates."""
        if relation < 0 or relation >= RELATIONS:
            raise IndexError("principal relation index is out of range")
        start = DEGREE * relation
        return (
            self.principal_alphas[start],
            self.principal_alphas[start + 1],
            self.principal_alphas[start + 2],
        )

    def kernel_relation_exponents(self, kernel: int) -> tuple[int, ...]:
        """Return one HNF-kernel factor as a word in the 73 `alpha_j`."""
        if kernel < 0 or kernel >= KERNEL_COLUMNS:
            raise IndexError("HNF kernel index is out of range")
        start = RELATIONS * kernel
        return self.kernel_relation_map[start : start + RELATIONS]


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise LiveH1AuthorityFailure(name + " contains a boolean")
    if isinstance(value, str):
        if not value or len(value) > _MAX_INTEGER_DIGITS:
            raise LiveH1AuthorityFailure(name + " contains an unbounded integer")
        try:
            answer = int(value)
        except (ValueError, OverflowError) as error:
            raise LiveH1AuthorityFailure(name + " contains a non-integer") from error
        if str(answer) != value:
            raise LiveH1AuthorityFailure(name + " contains noncanonical decimal")
        return answer
    if isinstance(value, (bytes, bytearray, float)):
        raise LiveH1AuthorityFailure(name + " contains a non-integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise LiveH1AuthorityFailure(name + " contains a non-integer") from error
    if answer != value:
        raise LiveH1AuthorityFailure(name + " contains a non-integer")
    return answer


def _owner(values: Any, length: int, name: str) -> tuple[int, ...]:
    if (
        isinstance(values, (str, bytes))
        or not isinstance(values, Sequence)
        or len(values) < length
    ):
        raise LiveH1AuthorityFailure(name + " does not cover its logical prefix")
    return tuple(_integer(values[index], name) for index in range(length))


def _decimal(values: Sequence[int]) -> list[str]:
    return [str(value) for value in values]


def _owner_record(
    run_id: str,
    owner_generation: int,
    polynomial: Sequence[int],
    multiplication_table: Sequence[int],
    relation_exponents: Sequence[int],
    principal_alphas: Sequence[int],
    cleanup_transform: Sequence[int],
    active_relation: Sequence[int],
    active_hnf_transform: Sequence[int],
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "run_id": run_id,
        "owner_generation": str(owner_generation),
        "field_id": FIELD_ID,
        "polynomial": _decimal(polynomial),
        "multiplication_table": _decimal(multiplication_table),
        "relation_shape": [str(ROWS), str(RELATIONS)],
        "relation_exponents": _decimal(relation_exponents),
        "principal_alpha_shape": [str(RELATIONS), str(DEGREE)],
        "principal_alphas": _decimal(principal_alphas),
        "cleanup_transform_shape": [str(RELATIONS), str(RELATIONS)],
        "cleanup_transform": _decimal(cleanup_transform),
        "active_relation_shape": [str(ACTIVE_ROWS), str(ACTIVE_COLUMNS)],
        "active_relation": _decimal(active_relation),
        "active_hnf_transform_shape": [str(ACTIVE_COLUMNS), str(ACTIVE_COLUMNS)],
        "active_hnf_transform": _decimal(active_hnf_transform),
    }


def _canonical(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise LiveH1AuthorityFailure("owner record is not canonical JSON") from error


def _owner_sha256(record: Any) -> str:
    return hashlib.sha256(_canonical(record)).hexdigest()


def _kernel_relation_map(
    cleanup: Sequence[int], active_transform: Sequence[int]
) -> tuple[int, ...]:
    """Compose raw<-active and active<-kernel column transforms."""
    return tuple(
        sum(
            active_transform[ACTIVE_COLUMNS * kernel + active_column]
            * cleanup[RELATIONS * active_column + relation]
            for active_column in range(ACTIVE_COLUMNS)
        )
        for kernel in range(KERNEL_COLUMNS)
        for relation in range(RELATIONS)
    )


def _validate_mathematics(
    relation_exponents: Sequence[int],
    active_relation: Sequence[int],
    active_transform: Sequence[int],
    kernel_map: Sequence[int],
) -> None:
    for kernel in range(KERNEL_COLUMNS):
        for row in range(ACTIVE_ROWS):
            if sum(
                active_relation[ACTIVE_ROWS * column + row]
                * active_transform[ACTIVE_COLUMNS * kernel + column]
                for column in range(ACTIVE_COLUMNS)
            ):
                raise LiveH1AuthorityFailure(
                    "active HNF transform does not publish a kernel column"
                )
        for factor in range(ROWS):
            if sum(
                relation_exponents[ROWS * relation + factor]
                * kernel_map[RELATIONS * kernel + relation]
                for relation in range(RELATIONS)
            ):
                raise LiveH1AuthorityFailure(
                    "raw kernel word does not cancel the factor base"
                )


def capture_live_h1_authority(
    expectation: LiveH1AuthorityExpectation,
    polynomial: Sequence[Any],
    multiplication_table: Sequence[Any],
    relation_exponents: Sequence[Any],
    principal_alphas: Sequence[Any],
    cleanup_transform: Sequence[Any],
    active_relation: Sequence[Any],
    active_hnf_transform: Sequence[Any],
) -> ImmutableLiveH1Authority:
    """Copy and authenticate logical prefixes from one composed live root.

    Inputs may be larger reusable workspaces. Only the documented logical
    prefixes are copied, so later root-workspace reuse cannot mutate the
    authority handed to downstream composition.
    """
    if type(expectation) is not LiveH1AuthorityExpectation:
        raise LiveH1AuthorityFailure("live authority expectation has the wrong type")
    polynomial_copy = _owner(polynomial, 4, "polynomial owner")
    table_copy = _owner(multiplication_table, DEGREE**3, "multiplication owner")
    relation_copy = _owner(relation_exponents, ROWS * RELATIONS, "relation owner")
    alpha_copy = _owner(principal_alphas, DEGREE * RELATIONS, "alpha owner")
    cleanup_copy = _owner(
        cleanup_transform, RELATIONS * RELATIONS, "cleanup transform owner"
    )
    active_copy = _owner(
        active_relation, ACTIVE_ROWS * ACTIVE_COLUMNS, "active relation owner"
    )
    active_transform_copy = _owner(
        active_hnf_transform,
        ACTIVE_COLUMNS * ACTIVE_COLUMNS,
        "active HNF transform owner",
    )
    if polynomial_copy != (20034, -20018, 0, 1):
        raise LiveH1AuthorityFailure("live authority field changed")
    record = _owner_record(
        expectation.run_id,
        expectation.owner_generation,
        polynomial_copy,
        table_copy,
        relation_copy,
        alpha_copy,
        cleanup_copy,
        active_copy,
        active_transform_copy,
    )
    digest = _owner_sha256(record)
    if digest != expectation.expected_owner_sha256:
        raise LiveH1AuthorityFailure("live owners do not match out-of-band authority")
    kernel_map = _kernel_relation_map(cleanup_copy, active_transform_copy)
    _validate_mathematics(relation_copy, active_copy, active_transform_copy, kernel_map)
    return ImmutableLiveH1Authority(
        expectation.run_id,
        expectation.owner_generation,
        digest,
        polynomial_copy,
        table_copy,
        relation_copy,
        alpha_copy,
        cleanup_copy,
        active_copy,
        active_transform_copy,
        kernel_map,
    )


def require_live_h1_authority(
    handoff: ImmutableLiveH1Authority,
    expectation: LiveH1AuthorityExpectation,
) -> ImmutableLiveH1Authority:
    """Reauthenticate a retained handoff without any file or fixture join."""
    if type(handoff) is not ImmutableLiveH1Authority:
        raise LiveH1AuthorityFailure("live authority handoff has the wrong type")
    if type(expectation) is not LiveH1AuthorityExpectation:
        raise LiveH1AuthorityFailure("live authority expectation has the wrong type")
    if (
        handoff.run_id != expectation.run_id
        or handoff.owner_generation != expectation.owner_generation
        or handoff.owner_sha256 != expectation.expected_owner_sha256
    ):
        raise LiveH1AuthorityFailure("live authority identity is stale")
    record = _owner_record(
        handoff.run_id,
        handoff.owner_generation,
        handoff.polynomial,
        handoff.multiplication_table,
        handoff.relation_exponents,
        handoff.principal_alphas,
        handoff.cleanup_transform,
        handoff.active_relation,
        handoff.active_hnf_transform,
    )
    if _owner_sha256(record) != handoff.owner_sha256:
        raise LiveH1AuthorityFailure("retained live owners changed")
    expected_kernel = _kernel_relation_map(
        handoff.cleanup_transform, handoff.active_hnf_transform
    )
    if handoff.kernel_relation_map != expected_kernel:
        raise LiveH1AuthorityFailure("retained kernel relation map changed")
    _validate_mathematics(
        handoff.relation_exponents,
        handoff.active_relation,
        handoff.active_hnf_transform,
        handoff.kernel_relation_map,
    )
    return handoff


__all__ = [
    "AUTHENTIC_EXPECTATION",
    "AUTHENTIC_OWNER_SHA256",
    "ImmutableLiveH1Authority",
    "LiveH1AuthorityExpectation",
    "LiveH1AuthorityFailure",
    "capture_live_h1_authority",
    "require_live_h1_authority",
]
