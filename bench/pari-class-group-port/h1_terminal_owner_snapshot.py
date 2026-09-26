"""Durable terminal snapshot for the unified real-cubic numeric owners.

The native computation owns mutable, preallocated buffers.  This module is the
single post-success publication boundary: it copies each logical prefix once,
replays the exact presentation, class, unit, regulator, and torsion identities,
and seals a canonical data-only envelope.  It never reads a path, fixture,
environment variable, or expected digest.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields
from fractions import Fraction
import hashlib
import json
from typing import Any

from .live_exact_units_cubic import (
    _norm,
    _relation_product,
    reconstruct_live_cubic_units,
)
from .log_matrix_transform import pari_log_matrix_transform
from .presentation_authority import (
    _multiply_ideals,
    _replay_relation_hnf,
    _same_integral_lattice,
)
from .relation_hnf_witness import pari_relation_hnf_witness
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix


SCHEMA = "sagejs.pari-class-group/h1-terminal-numeric-snapshot-v2"
ENVELOPE_SCHEMA = "sagejs.pari-class-group/h1-terminal-numeric-envelope-v2"
FIELD_ID = "x^3-20018*x+20034"
PARI_VERSION = "2.17.4"
PARI_BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac"
_MAX_BYTES = 64 * 1024 * 1024

ROWS = 8
ACTIVE_COLUMNS = 15
FACTOR_BASE_SIZE = 66
RELATIONS = 73
DEGREE = 3
PLACES = 3
LOG_WIDTH = 7
UNIT_RANK = 2
KERNEL_COLUMNS = 7

ASSUMPTION_NAMES = (
    "prepared-maximal-order-assumed-from-pari",
    "factor-base-generation-assumed-from-pari",
    "grh-and-upstream-bounds-assumed",
    "unit-index-selection-assumed-from-pari",
    "class-correspondence-complete",
    "unit-correspondence-complete",
    "runtime-pari-input-free",
    "answer-fixture-input-free",
    "public-class-complete",
    "public-class-unit-complete",
)
EXPECTED_ASSUMPTION_FLAGS = (1, 1, 1, 1, 1, 1, 1, 1, 0, 0)


class H1TerminalSnapshotFailure(ValueError):
    """A live numeric owner or detached terminal snapshot failed closed."""


@dataclass(frozen=True)
class H1TerminalNumericOwners:
    """Borrowed owners returned by one successful unified native invocation.

    Every field is a numeric buffer.  Backing buffers may be longer than their
    logical prefix; :func:`capture_h1_terminal_owner_snapshot` copies only the
    fixed prefix below.  The caller must not mutate owners until capture
    returns.  No field is an expected answer, digest, path, or serialized
    intermediate.
    """

    terminal_state: Sequence[Any]
    polynomial: Sequence[Any]
    integral_basis: Sequence[Any]
    multiplication_tensor: Sequence[Any]
    factor_base_ideals: Sequence[Any]
    factor_base_norms: Sequence[Any]
    relation_records: Sequence[Any]
    principal_generators: Sequence[Any]
    cleanup_transform: Sequence[Any]
    initial_permutation: Sequence[Any]
    collector_state: Sequence[Any]
    collector_increment: Sequence[Any]
    collector_cursor: Sequence[Any]
    relation_hashes: Sequence[Any]
    relation_metadata: Sequence[Any]
    relation_progress: Sequence[Any]
    relation_schedule: Sequence[Any]
    kummer_random_state: Sequence[Any]
    original_relation_logs: Sequence[Any]
    active_relation: Sequence[Any]
    full_hnf: Sequence[Any]
    active_hnf_transform: Sequence[Any]
    transformed_relation_logs: Sequence[Any]
    relation_to_presentation: Sequence[Any]
    presentation_to_relation: Sequence[Any]
    presentation: Sequence[Any]
    smith: Sequence[Any]
    left: Sequence[Any]
    left_inverse: Sequence[Any]
    right: Sequence[Any]
    right_inverse: Sequence[Any]
    ur: Sequence[Any]
    y: Sequence[Any]
    uir: Sequence[Any]
    x: Sequence[Any]
    m2: Sequence[Any]
    generator_arch: Sequence[Any]
    compact_unit_provenance: Sequence[Any]
    compact_unit_factor: Sequence[Any]
    retained_relation_provenance: Sequence[Any]
    exact_units_integral_basis: Sequence[Any]
    published_exact_units_integral_basis: Sequence[Any]
    exact_unit_norms: Sequence[Any]
    rebuilt_unit_logs: Sequence[Any]
    unit_phases: Sequence[Any]
    packed_regulator: Sequence[Any]
    regulator_interval: Sequence[Any]
    regulator_state: Sequence[Any]
    acceptance_state: Sequence[Any]
    reconstruction_state: Sequence[Any]
    attempt_state: Sequence[Any]
    unified_state: Sequence[Any]
    bridge_state: Sequence[Any]
    precision_authority_state: Sequence[Any]
    precision_retry_state: Sequence[Any]
    torsion_state: Sequence[Any]
    torsion_order: Sequence[Any]
    torsion_generator: Sequence[Any]
    invariant_factor_capacity: Sequence[Any]
    assumption_flags: Sequence[Any]


_PREFIX_LENGTHS = {
    "terminal_state": 16,
    "polynomial": 4,
    "integral_basis": 9,
    "multiplication_tensor": 27,
    "factor_base_ideals": FACTOR_BASE_SIZE * 9,
    "factor_base_norms": FACTOR_BASE_SIZE,
    "relation_records": FACTOR_BASE_SIZE * RELATIONS,
    "principal_generators": DEGREE * RELATIONS,
    "cleanup_transform": RELATIONS * RELATIONS,
    "initial_permutation": FACTOR_BASE_SIZE,
    "collector_state": 5,
    "collector_increment": 4,
    "collector_cursor": 4,
    "relation_hashes": 780,
    "relation_metadata": 2340,
    "relation_progress": 4,
    "relation_schedule": 4,
    "kummer_random_state": 66,
    "original_relation_logs": LOG_WIDTH * PLACES * RELATIONS,
    "active_relation": ROWS * ACTIVE_COLUMNS,
    "full_hnf": ROWS * ACTIVE_COLUMNS,
    "active_hnf_transform": ACTIVE_COLUMNS * ACTIVE_COLUMNS,
    "transformed_relation_logs": LOG_WIDTH * PLACES * RELATIONS,
    "relation_to_presentation": ACTIVE_COLUMNS * ROWS,
    "presentation_to_relation": ROWS * ACTIVE_COLUMNS,
    "presentation": ROWS * ROWS,
    "smith": ROWS * ROWS,
    "left": ROWS * ROWS,
    "left_inverse": ROWS * ROWS,
    "right": ROWS * ROWS,
    "right_inverse": ROWS * ROWS,
    "ur": ROWS * ROWS,
    "y": ROWS * ROWS,
    "uir": ROWS * ROWS,
    "x": ROWS * ROWS,
    "m2": ROWS * ROWS,
    "generator_arch": LOG_WIDTH * PLACES * ROWS,
    "compact_unit_provenance": UNIT_RANK * KERNEL_COLUMNS,
    "compact_unit_factor": 4,
    "retained_relation_provenance": UNIT_RANK * RELATIONS,
    "exact_units_integral_basis": UNIT_RANK * DEGREE,
    "published_exact_units_integral_basis": UNIT_RANK * DEGREE,
    "exact_unit_norms": UNIT_RANK,
    "rebuilt_unit_logs": UNIT_RANK * PLACES * 3,
    "unit_phases": UNIT_RANK * PLACES,
    "packed_regulator": 3,
    "regulator_interval": 4,
    "regulator_state": 5,
    "acceptance_state": 3,
    "reconstruction_state": 4,
    "attempt_state": 4,
    "unified_state": 12,
    "bridge_state": 16,
    "precision_authority_state": 16,
    "precision_retry_state": 6,
    "torsion_state": 6,
    "torsion_order": 1,
    "torsion_generator": DEGREE,
    "invariant_factor_capacity": ROWS,
    "assumption_flags": len(ASSUMPTION_NAMES),
}


@dataclass(frozen=True)
class H1TerminalSnapshotAuthority:
    envelope_sha256: str


@dataclass(frozen=True)
class ImmutableH1TerminalSnapshot:
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
        raise H1TerminalSnapshotFailure(
            "terminal snapshot is not canonical JSON"
        ) from error
    if len(raw) > _MAX_BYTES:
        raise H1TerminalSnapshotFailure("terminal snapshot exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise H1TerminalSnapshotFailure("terminal snapshot exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise H1TerminalSnapshotFailure("duplicate terminal key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise H1TerminalSnapshotFailure(
            "terminal snapshot is not strict JSON"
        ) from error
    if not isinstance(value, dict):
        raise H1TerminalSnapshotFailure("terminal envelope must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise H1TerminalSnapshotFailure(name + " contains a boolean")
    try:
        integer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise H1TerminalSnapshotFailure(name + " contains a non-integer") from error
    if str(integer) != str(value):
        raise H1TerminalSnapshotFailure(name + " contains a noncanonical integer")
    return integer


def _take(values: Sequence[Any], length: int, name: str) -> tuple[int, ...]:
    if isinstance(values, (str, bytes)):
        raise H1TerminalSnapshotFailure(name + " is not a numeric owner")
    try:
        if len(values) < length:
            raise H1TerminalSnapshotFailure(
                name + " is shorter than its logical prefix"
            )
        return tuple(_integer(values[index], name) for index in range(length))
    except (IndexError, TypeError) as error:
        raise H1TerminalSnapshotFailure(
            name + " is not indexable numeric storage"
        ) from error


def _decimals(values: Sequence[int]) -> list[str]:
    return [str(value) for value in values]


def _entries(record: Any, shape: list[int], name: str) -> list[int]:
    if not isinstance(record, Mapping) or set(record) != {"shape", "entries"}:
        raise H1TerminalSnapshotFailure(name + " has the wrong fields")
    if record["shape"] != shape:
        raise H1TerminalSnapshotFailure(name + " has the wrong shape")
    count = 1
    for dimension in shape:
        count *= dimension
    values = record["entries"]
    if not isinstance(values, list) or len(values) != count:
        raise H1TerminalSnapshotFailure(name + " has the wrong entry count")
    return [_integer(value, name) for value in values]


def _matrix_product(
    left: Sequence[int], right: Sequence[int], rows: int, middle: int, columns: int
) -> list[int]:
    """Multiply column-major matrices of shapes rows*middle and middle*columns."""
    return [
        sum(left[k * rows + row] * right[column * middle + k] for k in range(middle))
        for column in range(columns)
        for row in range(rows)
    ]


def _identity(size: int) -> list[int]:
    return [int(row == column) for column in range(size) for row in range(size)]


def _matrix_sum(left: Sequence[int], right: Sequence[int]) -> list[int]:
    return [a + b for a, b in zip(left, right)]


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _packed_point(values: Sequence[int], name: str) -> Fraction:
    if len(values) != 3:
        raise H1TerminalSnapshotFailure(name + " is not a packed real")
    mantissa, precision, exponent = values
    if precision == -1:
        if exponent != 0:
            raise H1TerminalSnapshotFailure(name + " has an invalid exact triple")
        return Fraction(mantissa)
    if precision < 64 or precision % 64 or abs(mantissa).bit_length() != precision:
        raise H1TerminalSnapshotFailure(name + " is not normalized")
    shift = exponent - (precision - 1)
    return (
        Fraction(mantissa << shift) if shift >= 0 else Fraction(mantissa, 1 << -shift)
    )


def _dyadic(mantissa: int, exponent: int) -> Fraction:
    return (
        Fraction(mantissa << exponent)
        if exponent >= 0
        else Fraction(mantissa, 1 << -exponent)
    )


def _snapshot_owners(owners: H1TerminalNumericOwners) -> dict[str, tuple[int, ...]]:
    """Copy each logical owner exactly once into immutable integer tuples."""
    answer: dict[str, tuple[int, ...]] = {}
    for field in fields(owners):
        name = field.name
        answer[name] = _take(getattr(owners, name), _PREFIX_LENGTHS[name], name)
    return answer


def _payload_from_snapshot(values: Mapping[str, tuple[int, ...]]) -> dict[str, Any]:
    def matrix(name: str, shape: Sequence[int]) -> dict[str, Any]:
        return {"shape": list(shape), "entries": _decimals(values[name])}

    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "polynomial": matrix("polynomial", [4]),
            "integral_basis": matrix("integral_basis", [3, 3]),
            "multiplication_tensor": matrix("multiplication_tensor", [3, 3, 3]),
        },
        "presentation": {
            "factor_base_ideals": matrix("factor_base_ideals", [66, 3, 3]),
            "factor_base_norms": matrix("factor_base_norms", [66]),
            "relation_records": matrix("relation_records", [66, 73]),
            "principal_generators": matrix("principal_generators", [73, 3]),
            "cleanup_transform": matrix("cleanup_transform", [73, 73]),
            "initial_permutation": matrix("initial_permutation", [66]),
            "collector_state": matrix("collector_state", [5]),
            "collector_increment": matrix("collector_increment", [4]),
            "collector_cursor": matrix("collector_cursor", [4]),
            "relation_hashes": matrix("relation_hashes", [780]),
            "relation_metadata": matrix("relation_metadata", [2340]),
            "relation_progress": matrix("relation_progress", [4]),
            "relation_schedule": matrix("relation_schedule", [4]),
            "kummer_random_state": matrix("kummer_random_state", [66]),
            "original_relation_logs": matrix("original_relation_logs", [73, 3, 7]),
            "active_relation": matrix("active_relation", [8, 15]),
            "full_hnf": matrix("full_hnf", [8, 15]),
            "active_hnf_transform": matrix("active_hnf_transform", [15, 15]),
            "transformed_relation_logs": matrix(
                "transformed_relation_logs", [73, 3, 7]
            ),
            "relation_to_presentation": matrix("relation_to_presentation", [15, 8]),
            "presentation_to_relation": matrix("presentation_to_relation", [8, 15]),
            "presentation": matrix("presentation", [8, 8]),
        },
        "class_group": {
            "smith": matrix("smith", [8, 8]),
            "left": matrix("left", [8, 8]),
            "left_inverse": matrix("left_inverse", [8, 8]),
            "right": matrix("right", [8, 8]),
            "right_inverse": matrix("right_inverse", [8, 8]),
            "ur": matrix("ur", [8, 8]),
            "y": matrix("y", [8, 8]),
            "uir": matrix("uir", [8, 8]),
            "x": matrix("x", [8, 8]),
            "m1": {"shape": [8, 0], "entries": []},
            "m2": matrix("m2", [8, 8]),
            "ga": {"shape": [0, 3, 7], "entries": []},
            "ge": {"shape": [0, 0], "entries": []},
            "gd": {"shape": [0, 3, 7], "entries": []},
            "generator_arch": matrix("generator_arch", [8, 3, 7]),
            "invariant_factors": [],
            "invariant_factor_capacity": matrix("invariant_factor_capacity", [8]),
            "class_number": "1",
        },
        "unit_group": {
            "compact_provenance": matrix("compact_unit_provenance", [2, 7]),
            "compact_factor": matrix("compact_unit_factor", [4]),
            "retained_relation_provenance": matrix(
                "retained_relation_provenance", [2, 73]
            ),
            "exact_units_integral_basis": matrix("exact_units_integral_basis", [2, 3]),
            "published_exact_units_integral_basis": matrix(
                "published_exact_units_integral_basis", [2, 3]
            ),
            "exact_unit_norms": matrix("exact_unit_norms", [2]),
            "rebuilt_logs": matrix("rebuilt_unit_logs", [2, 3, 3]),
            "phases": matrix("unit_phases", [2, 3]),
        },
        "regulator": {
            "packed": matrix("packed_regulator", [3]),
            "interval": matrix("regulator_interval", [4]),
            "state": matrix("regulator_state", [5]),
            "acceptance_state": matrix("acceptance_state", [3]),
            "reconstruction_state": matrix("reconstruction_state", [4]),
            "attempt_state": matrix("attempt_state", [4]),
            "unified_state": matrix("unified_state", [12]),
            "bridge_state": matrix("bridge_state", [16]),
            "precision_authority_state": matrix("precision_authority_state", [16]),
            "precision_retry_state": matrix("precision_retry_state", [6]),
        },
        "torsion": {
            "state": matrix("torsion_state", [6]),
            "order": matrix("torsion_order", [1]),
            "generator": matrix("torsion_generator", [3]),
        },
        "assumptions": {
            "upstream": {
                "system": "PARI",
                "version": PARI_VERSION,
                "buch2_sha256": PARI_BUCH2_SHA256,
            },
            "names": list(ASSUMPTION_NAMES),
            "flags": _decimals(values["assumption_flags"]),
        },
        "terminal": {
            "state": matrix("terminal_state", [16]),
            "atomic_publication": True,
            "single_snapshot": True,
            "intermediate_serializations": 0,
            "fixture_inputs": 0,
        },
    }


def _replay_presentation(payload: Mapping[str, Any], tensor: list[int]) -> None:
    factor_ideals = _entries(
        payload["factor_base_ideals"], [66, 3, 3], "factor-base ideals"
    )
    factor_norms = _entries(payload["factor_base_norms"], [66], "factor norms")
    ideals = [factor_ideals[9 * i : 9 * (i + 1)] for i in range(66)]
    for ideal, norm in zip(ideals, factor_norms):
        if norm <= 0 or abs(_determinant3(ideal)) != norm:
            raise H1TerminalSnapshotFailure("factor-base ideal norm changed")

    relations = _entries(payload["relation_records"], [66, 73], "relations")
    generators = _entries(
        payload["principal_generators"], [73, 3], "principal generators"
    )
    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for column in range(RELATIONS):
        exponents = relations[66 * column : 66 * (column + 1)]
        if any(exponent < 0 or exponent > 8 for exponent in exponents):
            raise H1TerminalSnapshotFailure("relation exponent left its domain")
        product = identity
        for ideal, exponent in zip(ideals, exponents):
            for _ in range(exponent):
                product = _multiply_ideals(product, ideal, tensor)
        principal = [0] * 9
        pari_cubic_mul_matrix(
            tensor, generators[3 * column : 3 * (column + 1)], principal
        )
        if not _same_integral_lattice(principal, product):
            raise H1TerminalSnapshotFailure(
                "principal relation failed at column " + str(column)
            )

    permutation = _entries(payload["initial_permutation"], [66], "initial permutation")
    original_logs = _entries(
        payload["original_relation_logs"], [73, 3, 7], "original relation logs"
    )
    active = _entries(payload["active_relation"], [8, 15], "active relation")
    full_hnf = _entries(payload["full_hnf"], [8, 15], "full HNF")
    transform = _entries(
        payload["active_hnf_transform"], [15, 15], "active HNF transform"
    )
    transformed_logs = _entries(
        payload["transformed_relation_logs"],
        [73, 3, 7],
        "transformed relation logs",
    )
    try:
        replayed = _replay_relation_hnf(relations, permutation, original_logs)
    except Exception as error:
        raise H1TerminalSnapshotFailure("relation-HNF replay failed") from error
    if (replayed[0], replayed[1], replayed[2], replayed[3]) != (
        active,
        full_hnf,
        transform,
        transformed_logs,
    ):
        raise H1TerminalSnapshotFailure("active HNF detached from full relations")

    inverse = [0] * 225
    r2p = [0] * 120
    p2r = [0] * 120
    state = [0] * 8
    if (
        pari_relation_hnf_witness(
            active,
            8,
            15,
            full_hnf,
            transform,
            inverse,
            [0] * 450,
            [0] * 5,
            r2p,
            p2r,
            state,
        )
        != 0
    ):
        raise H1TerminalSnapshotFailure("relation/HNF witness rejected")
    if r2p != _entries(
        payload["relation_to_presentation"], [15, 8], "relation witness"
    ) or p2r != _entries(
        payload["presentation_to_relation"], [8, 15], "presentation witness"
    ):
        raise H1TerminalSnapshotFailure("published relation witnesses changed")
    presentation = _entries(payload["presentation"], [8, 8], "presentation")
    if presentation != full_hnf[56:120]:
        raise H1TerminalSnapshotFailure("presentation is not the trailing HNF block")


def _replay_class(
    payload: Mapping[str, Any], presentation: list[int], relation_logs: list[int]
) -> None:
    smith = _entries(payload["smith"], [8, 8], "Smith matrix")
    left = _entries(payload["left"], [8, 8], "left transform")
    left_inverse = _entries(payload["left_inverse"], [8, 8], "left inverse")
    right = _entries(payload["right"], [8, 8], "right transform")
    right_inverse = _entries(payload["right_inverse"], [8, 8], "right inverse")
    ur = _entries(payload["ur"], [8, 8], "Ur")
    y = _entries(payload["y"], [8, 8], "Y")
    uir = _entries(payload["uir"], [8, 8], "Uir")
    x = _entries(payload["x"], [8, 8], "X")
    m2 = _entries(payload["m2"], [8, 8], "M2")
    identity = _identity(8)
    if smith != identity:
        raise H1TerminalSnapshotFailure("Smith quotient is not trivial")
    if (
        _matrix_product(_matrix_product(left, presentation, 8, 8, 8), right, 8, 8, 8)
        != smith
    ):
        raise H1TerminalSnapshotFailure("Smith identity failed")
    for first, second, name in (
        (left, left_inverse, "left inverse"),
        (left_inverse, left, "reverse left inverse"),
        (right, right_inverse, "right inverse"),
        (right_inverse, right, "reverse right inverse"),
    ):
        if _matrix_product(first, second, 8, 8, 8) != identity:
            raise H1TerminalSnapshotFailure(name + " failed")
    if ur != _matrix_sum(left, _matrix_product(smith, y, 8, 8, 8)):
        raise H1TerminalSnapshotFailure("Ur identity failed")
    if uir != _matrix_sum(left_inverse, _matrix_product(presentation, x, 8, 8, 8)):
        raise H1TerminalSnapshotFailure("Uir identity failed")
    expected_m2 = _matrix_sum(
        _matrix_product(x, ur, 8, 8, 8),
        _matrix_product(right, y, 8, 8, 8),
    )
    if m2 != expected_m2:
        raise H1TerminalSnapshotFailure("M2 identity failed")

    if payload["m1"] != {"shape": [8, 0], "entries": []}:
        raise H1TerminalSnapshotFailure("h=1 M1 is not empty")
    for name in ("ga", "ge", "gd"):
        expected_shape = [0, 0] if name == "ge" else [0, 3, 7]
        if payload[name] != {"shape": expected_shape, "entries": []}:
            raise H1TerminalSnapshotFailure("h=1 " + name + " is not empty")
    if payload["invariant_factors"] != [] or payload["class_number"] != "1":
        raise H1TerminalSnapshotFailure("h=1 class result changed")
    if (
        _entries(payload["invariant_factor_capacity"], [8], "invariant-factor capacity")
        != [0] * 8
    ):
        raise H1TerminalSnapshotFailure("h=1 invariant-factor capacity changed")
    generator_arch = _entries(payload["generator_arch"], [8, 3, 7], "generator arch")
    expected_arch = [0] * (8 * 3 * 7)
    pari_log_matrix_transform(
        relation_logs[: 8 * 3 * 7], m2, 3, 8, 8, True, expected_arch
    )
    if generator_arch != expected_arch:
        raise H1TerminalSnapshotFailure("generator arch detached from M2")


def _replay_units(
    payload: Mapping[str, Any],
    presentation: Mapping[str, Any],
    basis: list[int],
    tensor: list[int],
) -> None:
    generators = _entries(
        presentation["principal_generators"], [73, 3], "principal generators"
    )
    cleanup = _entries(presentation["cleanup_transform"], [73, 73], "cleanup transform")
    active = _entries(
        presentation["active_hnf_transform"], [15, 15], "active transform"
    )
    compact = _entries(payload["compact_provenance"], [2, 7], "compact provenance")
    compact_factor = _entries(payload["compact_factor"], [4], "compact factor")
    if compact_factor != [1, 0, 0, 1]:
        raise H1TerminalSnapshotFailure("compact factor is not unimodular rank two")
    try:
        component = reconstruct_live_cubic_units(
            generators, cleanup, active, compact, tensor
        )
    except Exception as error:
        raise H1TerminalSnapshotFailure("exact unit reconstruction failed") from error
    retained = _entries(
        payload["retained_relation_provenance"], [2, 73], "unit provenance"
    )
    integral = _entries(payload["exact_units_integral_basis"], [2, 3], "integral units")
    if integral != [value for unit in component.exact_units for value in unit]:
        raise H1TerminalSnapshotFailure("pre-getfu exact units changed")
    published = _entries(
        payload["published_exact_units_integral_basis"],
        [2, 3],
        "published exact units",
    )
    generator_rows = [generators[3 * index : 3 * (index + 1)] for index in range(73)]
    replayed: list[int] = []
    for unit in range(2):
        replayed.extend(
            _relation_product(
                generator_rows,
                retained[73 * unit : 73 * (unit + 1)],
                tensor,
            )
        )
    if published != replayed:
        raise H1TerminalSnapshotFailure(
            "published unit detached from retained relations"
        )
    norms = _entries(payload["exact_unit_norms"], [2], "exact unit norms")
    replayed_norms = [
        _norm(published[3 * unit : 3 * (unit + 1)], tensor) for unit in range(2)
    ]
    if norms != replayed_norms or any(abs(norm) != 1 for norm in norms):
        raise H1TerminalSnapshotFailure("published exact unit norms changed")


def _replay_regulator(payload: Mapping[str, Any]) -> None:
    packed = _entries(payload["packed"], [3], "packed regulator")
    interval = _entries(payload["interval"], [4], "regulator interval")
    state = _entries(payload["state"], [5], "regulator state")
    if state[:4] != [0, 1, 1, 1] or state[4] < 192:
        raise H1TerminalSnapshotFailure("regulator authority is incomplete")
    lower = _dyadic(interval[0], interval[1])
    upper = _dyadic(interval[2], interval[3])
    point = _packed_point(packed, "packed regulator")
    if lower <= 0 or upper < lower or not lower <= point <= upper:
        raise H1TerminalSnapshotFailure("packed regulator left its enclosure")
    if _entries(payload["acceptance_state"], [3], "acceptance state") != [2, 0, 0]:
        raise H1TerminalSnapshotFailure("analytic acceptance did not succeed")
    if _entries(payload["reconstruction_state"], [4], "reconstruction state") != [
        0,
        5,
        188,
        2,
    ]:
        raise H1TerminalSnapshotFailure("regulator reconstruction did not succeed")
    if _entries(payload["attempt_state"], [4], "attempt state") != [4, 0, 0, 1]:
        raise H1TerminalSnapshotFailure("class attempt did not succeed")
    unified = _entries(payload["unified_state"], [12], "unified state")
    bridge = _entries(payload["bridge_state"], [16], "bridge state")
    precision = _entries(
        payload["precision_authority_state"], [16], "precision authority state"
    )
    retry = _entries(payload["precision_retry_state"], [6], "precision retry state")
    if unified[0] != 0 or unified[3] != 1 or bridge[0] != 0:
        raise H1TerminalSnapshotFailure("unified numeric prefix did not succeed")
    if precision[:5] != [0, 5, 2304, 0, 3] or precision[14] != 1:
        raise H1TerminalSnapshotFailure("precision authority did not publish")
    if retry != [3, 1536, 2304, 2304, 768, 1]:
        raise H1TerminalSnapshotFailure("precision retry terminal state changed")


def _validate_payload(payload: Any) -> None:
    required = {
        "schema",
        "field",
        "presentation",
        "class_group",
        "unit_group",
        "regulator",
        "torsion",
        "assumptions",
        "terminal",
    }
    if (
        not isinstance(payload, Mapping)
        or set(payload) != required
        or payload["schema"] != SCHEMA
    ):
        raise H1TerminalSnapshotFailure("terminal payload has the wrong fields")
    field = payload["field"]
    if not isinstance(field, Mapping) or set(field) != {
        "id",
        "polynomial",
        "integral_basis",
        "multiplication_tensor",
    }:
        raise H1TerminalSnapshotFailure("field record has the wrong fields")
    if field["id"] != FIELD_ID:
        raise H1TerminalSnapshotFailure("field identity changed")
    polynomial = _entries(field["polynomial"], [4], "polynomial")
    basis = _entries(field["integral_basis"], [3, 3], "integral basis")
    tensor = _entries(field["multiplication_tensor"], [3, 3, 3], "tensor")
    if polynomial != [20034, -20018, 0, 1] or basis != [1, 0, 0, 0, 1, 0, -13345, 2, 1]:
        raise H1TerminalSnapshotFailure("neutral field data changed")

    presentation = payload["presentation"]
    class_group = payload["class_group"]
    unit_group = payload["unit_group"]
    regulator = payload["regulator"]
    torsion = payload["torsion"]
    if not all(
        isinstance(value, Mapping)
        for value in (presentation, class_group, unit_group, regulator, torsion)
    ):
        raise H1TerminalSnapshotFailure("terminal component is not a record")
    _replay_presentation(presentation, tensor)
    relation_logs = _entries(
        presentation["transformed_relation_logs"], [73, 3, 7], "relation logs"
    )
    presentation_matrix = _entries(presentation["presentation"], [8, 8], "presentation")
    _replay_class(class_group, presentation_matrix, relation_logs)
    _replay_units(unit_group, presentation, basis, tensor)

    logs = _entries(unit_group["rebuilt_logs"], [2, 3, 3], "unit logs")
    phases = _entries(unit_group["phases"], [2, 3], "unit phases")
    if any(value not in (0, 1) for value in phases):
        raise H1TerminalSnapshotFailure("unit phase is not a parity bit")
    log_points = [
        _packed_point(logs[3 * index : 3 * (index + 1)], "unit log")
        for index in range(6)
    ]
    precision = min(value for value in logs[1::3] if value >= 64)
    scale = max(abs(value) for value in log_points)
    tolerance = max(Fraction(1, 1 << (precision - 8)), scale / (1 << (precision - 8)))
    for unit in range(2):
        if abs(sum(log_points[3 * unit : 3 * (unit + 1)])) > tolerance:
            raise H1TerminalSnapshotFailure("unit logs violate the product formula")
    determinant = abs(log_points[0] * log_points[4] - log_points[1] * log_points[3])
    interval_values = _entries(regulator["interval"], [4], "regulator interval")
    lower = _dyadic(interval_values[0], interval_values[1])
    upper = _dyadic(interval_values[2], interval_values[3])
    if determinant == 0 or not lower <= determinant <= upper:
        raise H1TerminalSnapshotFailure(
            "unit-log determinant left the regulator enclosure"
        )
    _replay_regulator(regulator)

    if set(torsion) != {"state", "order", "generator"}:
        raise H1TerminalSnapshotFailure("torsion record has the wrong fields")
    torsion_state = _entries(torsion["state"], [6], "torsion state")
    torsion_order = _entries(torsion["order"], [1], "torsion order")
    torsion_generator = _entries(torsion["generator"], [3], "torsion generator")
    if (
        torsion_state[0:3] != [0, 3, 1]
        or torsion_state[3] <= 0
        or torsion_state[4:6] != [2, 1]
        or torsion_order != [2]
        or torsion_generator != [-1, 0, 0]
    ):
        raise H1TerminalSnapshotFailure("torsion authority changed")

    assumptions = payload["assumptions"]
    expected_upstream = {
        "system": "PARI",
        "version": PARI_VERSION,
        "buch2_sha256": PARI_BUCH2_SHA256,
    }
    if (
        not isinstance(assumptions, Mapping)
        or assumptions.get("upstream") != expected_upstream
        or assumptions.get("names") != list(ASSUMPTION_NAMES)
    ):
        raise H1TerminalSnapshotFailure("assumption names changed")
    flags = assumptions.get("flags")
    if (
        not isinstance(flags, list)
        or tuple(_integer(value, "assumption flag") for value in flags)
        != EXPECTED_ASSUMPTION_FLAGS
    ):
        raise H1TerminalSnapshotFailure("assumption flags changed")
    terminal = payload["terminal"]
    if not isinstance(terminal, Mapping) or set(terminal) != {
        "state",
        "atomic_publication",
        "single_snapshot",
        "intermediate_serializations",
        "fixture_inputs",
    }:
        raise H1TerminalSnapshotFailure("terminal publication record changed")
    expected_terminal = [
        0,
        0,
        0,
        0,
        0,
        0,
        73,
        8,
        1,
        0,
        2,
        2,
        0,
        811,
        1,
        0,
    ]
    if _entries(terminal["state"], [16], "terminal state") != expected_terminal or dict(
        terminal
    ) != {
        "state": terminal["state"],
        "atomic_publication": True,
        "single_snapshot": True,
        "intermediate_serializations": 0,
        "fixture_inputs": 0,
    }:
        raise H1TerminalSnapshotFailure("native terminal state did not publish")

    # The immutable mathematical records above are exactly the 811 cells
    # committed by `pari_unified_complete_h1_root`; `terminal.state` is the
    # separate commit/status owner written last.
    publication_cells = sum(
        len(_entries(record, shape, name))
        for record, shape, name in (
            (field["polynomial"], [4], "published polynomial"),
            (presentation["presentation"], [8, 8], "published presentation"),
            (class_group["smith"], [8, 8], "published Smith matrix"),
            (class_group["left"], [8, 8], "published left transform"),
            (class_group["left_inverse"], [8, 8], "published left inverse"),
            (class_group["right"], [8, 8], "published right transform"),
            (class_group["right_inverse"], [8, 8], "published right inverse"),
            (
                presentation["relation_to_presentation"],
                [15, 8],
                "published relation witness",
            ),
            (
                presentation["presentation_to_relation"],
                [8, 15],
                "published presentation witness",
            ),
            (unit_group["compact_provenance"], [2, 7], "published compact units"),
            (
                unit_group["retained_relation_provenance"],
                [2, 73],
                "published retained relations",
            ),
            (
                unit_group["published_exact_units_integral_basis"],
                [2, 3],
                "published exact units",
            ),
            (unit_group["exact_unit_norms"], [2], "published unit norms"),
            (regulator["packed"], [3], "published regulator"),
            (torsion["order"], [1], "published torsion order"),
            (torsion["generator"], [3], "published torsion generator"),
            (
                class_group["invariant_factor_capacity"],
                [8],
                "published invariant capacity",
            ),
        )
    )
    if publication_cells != 811 or expected_terminal[13] != publication_cells:
        raise H1TerminalSnapshotFailure("native publication cell count changed")


def capture_h1_terminal_owner_snapshot(
    owners: H1TerminalNumericOwners,
) -> ImmutableH1TerminalSnapshot:
    """Snapshot and seal one successful native owner bundle.

    This is called by the host immediately after the final native root returns
    success.  Native code does not call back into Python.  Serialization occurs
    once, after all logical prefixes have been copied and replayed.
    """
    if not isinstance(owners, H1TerminalNumericOwners):
        raise H1TerminalSnapshotFailure("expected an H1 numeric owner bundle")
    copied = _snapshot_owners(owners)
    payload = _payload_from_snapshot(copied)
    _validate_payload(payload)
    payload_raw = _canonical(payload)
    envelope = {
        "schema": ENVELOPE_SCHEMA,
        "payload": payload,
        "payload_sha256": _sha256(payload_raw),
    }
    raw = _canonical(envelope)
    return ImmutableH1TerminalSnapshot(raw, _sha256(raw))


def authority_for_h1_terminal_snapshot(
    snapshot: ImmutableH1TerminalSnapshot,
) -> H1TerminalSnapshotAuthority:
    if not isinstance(snapshot, ImmutableH1TerminalSnapshot):
        raise H1TerminalSnapshotFailure("expected an immutable terminal snapshot")
    if _sha256(snapshot.canonical_json) != snapshot.sha256:
        raise H1TerminalSnapshotFailure("terminal snapshot hash changed")
    return H1TerminalSnapshotAuthority(snapshot.sha256)


def cold_replay_h1_terminal_snapshot(
    snapshot: ImmutableH1TerminalSnapshot,
    authority: H1TerminalSnapshotAuthority,
) -> dict[str, Any]:
    """Reparse and independently replay a detached terminal snapshot."""
    if not isinstance(snapshot, ImmutableH1TerminalSnapshot) or not isinstance(
        authority, H1TerminalSnapshotAuthority
    ):
        raise H1TerminalSnapshotFailure("invalid terminal replay authority")
    if (
        snapshot.sha256 != authority.envelope_sha256
        or _sha256(snapshot.canonical_json) != snapshot.sha256
    ):
        raise H1TerminalSnapshotFailure("terminal envelope authority changed")
    envelope = _strict_loads(snapshot.canonical_json)
    if (
        set(envelope) != {"schema", "payload", "payload_sha256"}
        or envelope["schema"] != ENVELOPE_SCHEMA
    ):
        raise H1TerminalSnapshotFailure("terminal envelope has the wrong fields")
    payload = envelope["payload"]
    if envelope["payload_sha256"] != _sha256(_canonical(payload)):
        raise H1TerminalSnapshotFailure("terminal payload hash changed")
    try:
        _validate_payload(payload)
    except H1TerminalSnapshotFailure:
        raise
    except (ArithmeticError, IndexError, KeyError, TypeError, ValueError) as error:
        raise H1TerminalSnapshotFailure(
            "terminal replay rejected malformed data"
        ) from error
    return dict(payload)


__all__ = [
    "ASSUMPTION_NAMES",
    "EXPECTED_ASSUMPTION_FLAGS",
    "H1TerminalNumericOwners",
    "H1TerminalSnapshotAuthority",
    "H1TerminalSnapshotFailure",
    "ImmutableH1TerminalSnapshot",
    "authority_for_h1_terminal_snapshot",
    "capture_h1_terminal_owner_snapshot",
    "cold_replay_h1_terminal_snapshot",
]
