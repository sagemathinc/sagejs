"""Exact relation words for the authentic real-cubic units.

The successful unit component publishes two provenance rows over the active
15-column relation matrix.  This module replays the earlier sparse cleanup
transform, maps those rows back to the 73 retained principal generators, and
checks the resulting products in the cubic field using ordinary exact Python
arithmetic.  Replay never calls PARI.

This is presentation authority only.  It neither proves unit saturation nor
publishes a complete class-and-unit computation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from __future__ import annotations

from fractions import Fraction
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from .hnfspec_cleanup import pari_hnfspec_cleanup
from .presentation_authority import (
    ACTIVE_COLUMNS,
    FACTOR_BASE_SIZE,
    FIELD_ID,
    RELATION_COUNT,
    RESIDENT_SHA256,
    PresentationAuthorityFailure,
    capture_presentation_authority,
    replay_presentation_authority,
)


SCHEMA = "sagejs.pari-class-group/unit-relation-authority-v1"
REGULATOR_FIXTURE_SHA256 = (
    "841b67df432950fdb47238559a78d98b97882fde2509b85acaf97fbe911d6ba2"
)
UNIT_COUNT = 2
KERNEL_COLUMNS = 7
DEGREE = 3
_MAX_BYTES = 2 * 1024 * 1024


class UnitRelationAuthorityFailure(ValueError):
    """Exact unit-to-principal-relation replay failed closed."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise UnitRelationAuthorityFailure(name + " must be an integer sequence")
    if len(value) != length:
        raise UnitRelationAuthorityFailure(name + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise UnitRelationAuthorityFailure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise UnitRelationAuthorityFailure(
                name + " contains a non-integer"
            ) from error
        if str(integer) != str(entry):
            raise UnitRelationAuthorityFailure(
                name + " contains a noncanonical integer"
            )
        answer.append(integer)
    return answer


def _decimal(values: Sequence[int]) -> list[str]:
    return [str(value) for value in values]


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
        raise UnitRelationAuthorityFailure("authority is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise UnitRelationAuthorityFailure("authority exceeds its byte bound")
    return raw


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _qualified_regulator_fixture(path: str | Path) -> Mapping[str, Any]:
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != REGULATOR_FIXTURE_SHA256:
        raise UnitRelationAuthorityFailure("regulator fixture is not qualified")
    try:
        fixture = json.loads(raw)
    except (TypeError, ValueError, UnicodeError) as error:
        raise UnitRelationAuthorityFailure("regulator fixture is not JSON") from error
    if not isinstance(fixture, Mapping):
        raise UnitRelationAuthorityFailure("regulator fixture is not a mapping")
    if fixture.get("source", {}).get("field_id") != FIELD_ID:
        raise UnitRelationAuthorityFailure("regulator fixture field changed")
    return fixture


def _cleanup_transform(presentation: Mapping[str, Any]) -> list[int]:
    """Replay the 73-column cleanup and return its column transform."""
    original = [
        value
        for relation in presentation["relations"]
        for value in _integers(
            relation["exponents"], FACTOR_BASE_SIZE, "relation exponents"
        )
    ]
    permutation = _integers(
        presentation["hnf"]["initial_permutation"],
        FACTOR_BASE_SIZE,
        "initial permutation",
    )

    def zeros(length: int) -> list[int]:
        return [0] * length

    transform = zeros(RELATION_COUNT * RELATION_COUNT)
    sparse_state = zeros(13)
    cleanup_state = zeros(10)
    status = pari_hnfspec_cleanup(
        original,
        FACTOR_BASE_SIZE,
        RELATION_COUNT,
        permutation,
        4,
        3,
        zeros(FACTOR_BASE_SIZE * RELATION_COUNT),
        zeros(4 * RELATION_COUNT),
        transform,
        zeros(RELATION_COUNT),
        zeros(1),
        sparse_state,
        zeros((FACTOR_BASE_SIZE - 4) * RELATION_COUNT),
        zeros(4 * RELATION_COUNT),
        zeros(FACTOR_BASE_SIZE * RELATION_COUNT),
        cleanup_state,
    )
    if status != 0 or sparse_state != [74, 8, 15, 4, 1, 0, 0, 56, 0, 24, 22, 12, 27]:
        raise UnitRelationAuthorityFailure("cleanup transform replay changed")
    if cleanup_state != [4, 0, 9, 15, 73, 1, 1244, 129, 98, 182]:
        raise UnitRelationAuthorityFailure("cleanup state replay changed")
    return transform


def _multiply(
    left: Sequence[Fraction],
    right: Sequence[Fraction],
    table: Sequence[int],
) -> list[Fraction]:
    matrix = [
        sum(
            (
                left[coordinate] * table[9 * coordinate + entry]
                for coordinate in range(3)
            ),
            Fraction(0),
        )
        for entry in range(9)
    ]
    return [
        sum(
            (matrix[3 * column + row] * right[column] for column in range(3)),
            Fraction(0),
        )
        for row in range(3)
    ]


def _inverse(value: Sequence[Fraction], table: Sequence[int]) -> list[Fraction]:
    matrix = [
        sum(
            (
                value[coordinate] * table[9 * coordinate + entry]
                for coordinate in range(3)
            ),
            Fraction(0),
        )
        for entry in range(9)
    ]
    augmented = [
        [Fraction(matrix[3 * column + row]) for column in range(3)]
        + [Fraction(row == 0)]
        for row in range(3)
    ]
    for column in range(3):
        pivot = next((row for row in range(column, 3) if augmented[row][column]), None)
        if pivot is None:
            raise UnitRelationAuthorityFailure("principal generator is zero")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [entry / divisor for entry in augmented[column]]
        for row in range(3):
            if row == column:
                continue
            multiplier = augmented[row][column]
            augmented[row] = [
                augmented[row][place] - multiplier * augmented[column][place]
                for place in range(4)
            ]
    return [augmented[row][3] for row in range(3)]


def _power(value: Sequence[int], exponent: int, table: Sequence[int]) -> list[Fraction]:
    if exponent < 0:
        return _power_fraction(
            _inverse(list(map(Fraction, value)), table), -exponent, table
        )
    return _power_fraction(list(map(Fraction, value)), exponent, table)


def _power_fraction(
    value: Sequence[Fraction], exponent: int, table: Sequence[int]
) -> list[Fraction]:
    answer = [Fraction(1), Fraction(0), Fraction(0)]
    base = list(value)
    while exponent:
        if exponent & 1:
            answer = _multiply(answer, base, table)
        exponent //= 2
        if exponent:
            base = _multiply(base, base, table)
    return answer


def _norm(value: Sequence[int], table: Sequence[int]) -> int:
    matrix = [
        sum(
            value[coordinate] * table[9 * coordinate + entry] for coordinate in range(3)
        )
        for entry in range(9)
    ]
    # The multiplication matrix is column-major.
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5])
        - matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2])
        + matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2])
    )


def _unit_data(fixture: Mapping[str, Any]) -> tuple[list[int], list[int], list[int]]:
    selected = fixture.get("selected_lattice")
    field = fixture.get("field")
    if not isinstance(selected, Mapping) or not isinstance(field, Mapping):
        raise UnitRelationAuthorityFailure("regulator fixture shape changed")
    if int(selected.get("columns", -1)) != KERNEL_COLUMNS:
        raise UnitRelationAuthorityFailure("unit kernel width changed")
    provenance = _integers(
        selected.get("relation_provenance"),
        UNIT_COUNT * KERNEL_COLUMNS,
        "unit kernel provenance",
    )
    basis_rows = field.get("integral_basis_power_coordinates")
    if not isinstance(basis_rows, Sequence) or len(basis_rows) != DEGREE:
        raise UnitRelationAuthorityFailure("integral basis shape changed")
    basis = [
        value
        for row in basis_rows
        for value in _integers(row, DEGREE, "integral basis row")
    ]
    unit_rows = fixture.get("exact_units_power_coordinates")
    if not isinstance(unit_rows, Sequence) or len(unit_rows) != UNIT_COUNT:
        raise UnitRelationAuthorityFailure("published unit shape changed")
    power_units = [
        value
        for row in unit_rows
        for value in _integers(row, DEGREE, "published power-basis unit")
    ]
    # The qualified basis has columns (1, x, -13345 + 2*x + x^2).
    if basis != [1, 0, 0, 0, 1, 0, -13345, 2, 1]:
        raise UnitRelationAuthorityFailure("qualified integral basis changed")
    integral_units: list[int] = []
    for unit in range(UNIT_COUNT):
        a, b, c = power_units[3 * unit : 3 * (unit + 1)]
        integral_units.extend([a + 13345 * c, b - 2 * c, c])
    return provenance, power_units, integral_units


def capture_unit_relation_authority(
    resident_output: str | Path, regulator_fixture_path: str | Path
) -> dict[str, Any]:
    """Capture the exact 15-to-73 unit provenance and replay it immediately."""
    presentation = capture_presentation_authority(resident_output)
    fixture = _qualified_regulator_fixture(regulator_fixture_path)
    unit_kernel, power_units, integral_units = _unit_data(fixture)
    cleanup = _cleanup_transform(presentation)
    active_hnf_transform = _integers(
        presentation["hnf"]["transform"],
        ACTIVE_COLUMNS * ACTIVE_COLUMNS,
        "active HNF transform",
    )
    active = [
        sum(
            unit_kernel[KERNEL_COLUMNS * unit + kernel]
            * active_hnf_transform[ACTIVE_COLUMNS * kernel + relation]
            for kernel in range(KERNEL_COLUMNS)
        )
        for unit in range(UNIT_COUNT)
        for relation in range(ACTIVE_COLUMNS)
    ]
    retained_map = [
        cleanup[RELATION_COUNT * active_column + relation]
        for active_column in range(ACTIVE_COLUMNS)
        for relation in range(RELATION_COUNT)
    ]
    retained = [
        sum(
            active[ACTIVE_COLUMNS * unit + column]
            * retained_map[RELATION_COUNT * column + relation]
            for column in range(ACTIVE_COLUMNS)
        )
        for unit in range(UNIT_COUNT)
        for relation in range(RELATION_COUNT)
    ]
    presentation_summary = replay_presentation_authority(presentation)
    payload = {
        "schema": SCHEMA,
        "field": FIELD_ID,
        "source": {
            "resident_sha256": RESIDENT_SHA256,
            "regulator_fixture_sha256": REGULATOR_FIXTURE_SHA256,
            "relations_sha256": presentation_summary["relations_sha256"],
            "active_sha256": presentation_summary["active_sha256"],
        },
        "unit_kernel_provenance": {
            "shape": [str(UNIT_COUNT), str(KERNEL_COLUMNS)],
            "entries": _decimal(unit_kernel),
        },
        "active_relation_provenance": {
            "shape": [str(UNIT_COUNT), str(ACTIVE_COLUMNS)],
            "entries": _decimal(active),
        },
        "active_to_retained_relations": {
            "shape": [str(ACTIVE_COLUMNS), str(RELATION_COUNT)],
            "entries": _decimal(retained_map),
        },
        "retained_relation_provenance": {
            "shape": [str(UNIT_COUNT), str(RELATION_COUNT)],
            "entries": _decimal(retained),
        },
        "published_units_power_basis": {
            "shape": [str(UNIT_COUNT), str(DEGREE)],
            "entries": _decimal(power_units),
        },
        "published_units_integral_basis": {
            "shape": [str(UNIT_COUNT), str(DEGREE)],
            "entries": _decimal(integral_units),
        },
        "torsion_signs": ["1", "1"],
        "scope": {
            "unit_saturation_proved": False,
            "public_completion": False,
        },
    }
    replay_unit_relation_authority(payload, presentation)
    return payload


def _shaped(value: Any, rows: int, columns: int, name: str) -> list[int]:
    if not isinstance(value, Mapping) or set(value) != {"shape", "entries"}:
        raise UnitRelationAuthorityFailure(name + " has the wrong fields")
    if value["shape"] != [str(rows), str(columns)]:
        raise UnitRelationAuthorityFailure(name + " has the wrong shape")
    return _integers(value["entries"], rows * columns, name)


def _replay_unit_relation_authority_unchecked(
    payload: Mapping[str, Any], presentation: Mapping[str, Any]
) -> dict[str, Any]:
    required = {
        "schema",
        "field",
        "source",
        "unit_kernel_provenance",
        "active_relation_provenance",
        "active_to_retained_relations",
        "retained_relation_provenance",
        "published_units_power_basis",
        "published_units_integral_basis",
        "torsion_signs",
        "scope",
    }
    if not isinstance(payload, Mapping) or set(payload) != required:
        raise UnitRelationAuthorityFailure("authority has the wrong top-level fields")
    if payload["schema"] != SCHEMA or payload["field"] != FIELD_ID:
        raise UnitRelationAuthorityFailure("authority identity changed")
    if payload["scope"] != {
        "unit_saturation_proved": False,
        "public_completion": False,
    }:
        raise UnitRelationAuthorityFailure("authority overclaims its scope")
    presentation_summary = replay_presentation_authority(presentation)
    expected_source = {
        "resident_sha256": RESIDENT_SHA256,
        "regulator_fixture_sha256": REGULATOR_FIXTURE_SHA256,
        "relations_sha256": presentation_summary["relations_sha256"],
        "active_sha256": presentation_summary["active_sha256"],
    }
    if payload["source"] != expected_source:
        raise UnitRelationAuthorityFailure("authority source changed")

    unit_kernel = _shaped(
        payload["unit_kernel_provenance"], UNIT_COUNT, KERNEL_COLUMNS, "unit kernel"
    )
    if unit_kernel != [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, -1]:
        raise UnitRelationAuthorityFailure("qualified unit provenance changed")
    active = _shaped(
        payload["active_relation_provenance"],
        UNIT_COUNT,
        ACTIVE_COLUMNS,
        "active provenance",
    )
    active_hnf_transform = _integers(
        presentation["hnf"]["transform"],
        ACTIVE_COLUMNS * ACTIVE_COLUMNS,
        "active HNF transform",
    )
    expected_active = [
        sum(
            unit_kernel[KERNEL_COLUMNS * unit + kernel]
            * active_hnf_transform[ACTIVE_COLUMNS * kernel + relation]
            for kernel in range(KERNEL_COLUMNS)
        )
        for unit in range(UNIT_COUNT)
        for relation in range(ACTIVE_COLUMNS)
    ]
    if active != expected_active:
        raise UnitRelationAuthorityFailure("active unit provenance changed")

    cleanup = _cleanup_transform(presentation)
    retained_map = _shaped(
        payload["active_to_retained_relations"],
        ACTIVE_COLUMNS,
        RELATION_COUNT,
        "active-to-retained map",
    )
    expected_map = [
        cleanup[RELATION_COUNT * active_column + relation]
        for active_column in range(ACTIVE_COLUMNS)
        for relation in range(RELATION_COUNT)
    ]
    if retained_map != expected_map:
        raise UnitRelationAuthorityFailure("active-to-retained map changed")
    retained = _shaped(
        payload["retained_relation_provenance"],
        UNIT_COUNT,
        RELATION_COUNT,
        "retained provenance",
    )
    expected_retained = [
        sum(
            active[ACTIVE_COLUMNS * unit + column]
            * retained_map[RELATION_COUNT * column + relation]
            for column in range(ACTIVE_COLUMNS)
        )
        for unit in range(UNIT_COUNT)
        for relation in range(RELATION_COUNT)
    ]
    if retained != expected_retained:
        raise UnitRelationAuthorityFailure("retained unit provenance changed")

    relation_exponents = [
        value
        for relation in presentation["relations"]
        for value in _integers(
            relation["exponents"], FACTOR_BASE_SIZE, "relation exponents"
        )
    ]
    for unit in range(UNIT_COUNT):
        for factor in range(FACTOR_BASE_SIZE):
            exponent = sum(
                relation_exponents[FACTOR_BASE_SIZE * relation + factor]
                * retained[RELATION_COUNT * unit + relation]
                for relation in range(RELATION_COUNT)
            )
            if exponent:
                raise UnitRelationAuthorityFailure(
                    "retained unit word does not cancel the factor base"
                )

    power_units = _shaped(
        payload["published_units_power_basis"], UNIT_COUNT, DEGREE, "power units"
    )
    integral_units = _shaped(
        payload["published_units_integral_basis"],
        UNIT_COUNT,
        DEGREE,
        "integral units",
    )
    converted: list[int] = []
    for unit in range(UNIT_COUNT):
        a, b, c = power_units[3 * unit : 3 * (unit + 1)]
        converted.extend([a + 13345 * c, b - 2 * c, c])
    if integral_units != converted:
        raise UnitRelationAuthorityFailure("published unit basis conversion changed")
    signs = _integers(payload["torsion_signs"], UNIT_COUNT, "torsion signs")
    if any(sign not in (-1, 1) for sign in signs):
        raise UnitRelationAuthorityFailure("invalid real-cubic torsion sign")
    table = _integers(
        presentation["field"]["multiplication_table"], 27, "multiplication table"
    )
    alphas = [
        _integers(relation["alpha"], DEGREE, "principal generator")
        for relation in presentation["relations"]
    ]
    products: list[int] = []
    for unit in range(UNIT_COUNT):
        product = [Fraction(1), Fraction(0), Fraction(0)]
        for relation, alpha in enumerate(alphas):
            exponent = retained[RELATION_COUNT * unit + relation]
            if exponent:
                product = _multiply(product, _power(alpha, exponent, table), table)
        if any(coordinate.denominator != 1 for coordinate in product):
            raise UnitRelationAuthorityFailure("unit word did not become integral")
        exact = [coordinate.numerator for coordinate in product]
        expected = [
            signs[unit] * coordinate
            for coordinate in integral_units[3 * unit : 3 * (unit + 1)]
        ]
        if exact != expected:
            raise UnitRelationAuthorityFailure(
                "principal relation product is not the published unit"
            )
        if _norm(exact, table) not in (-1, 1):
            raise UnitRelationAuthorityFailure("relation product is not a unit")
        products.extend(exact)
    return {
        "schema": SCHEMA,
        "field": FIELD_ID,
        "active_shape": [UNIT_COUNT, ACTIVE_COLUMNS],
        "retained_shape": [UNIT_COUNT, RELATION_COUNT],
        "nonzero_retained_counts": [
            sum(
                retained[RELATION_COUNT * unit + relation] != 0
                for relation in range(RELATION_COUNT)
            )
            for unit in range(UNIT_COUNT)
        ],
        "max_abs_retained_exponents": [
            max(
                abs(retained[RELATION_COUNT * unit + relation])
                for relation in range(RELATION_COUNT)
            )
            for unit in range(UNIT_COUNT)
        ],
        "unit_norms": [
            _norm(products[3 * unit : 3 * (unit + 1)], table)
            for unit in range(UNIT_COUNT)
        ],
        "authority_sha256": _sha256(payload),
        "unit_saturation_proved": False,
        "public_completion": False,
    }


def replay_unit_relation_authority(
    payload: Mapping[str, Any], presentation: Mapping[str, Any]
) -> dict[str, Any]:
    """Replay exact unit words, normalizing every malformed-input failure."""
    try:
        return _replay_unit_relation_authority_unchecked(payload, presentation)
    except (UnitRelationAuthorityFailure, PresentationAuthorityFailure):
        raise
    except (
        IndexError,
        KeyError,
        StopIteration,
        TypeError,
        ValueError,
        ZeroDivisionError,
    ) as error:
        raise UnitRelationAuthorityFailure(
            "unit relation replay rejected malformed evidence"
        ) from error


__all__ = [
    "REGULATOR_FIXTURE_SHA256",
    "SCHEMA",
    "UnitRelationAuthorityFailure",
    "capture_unit_relation_authority",
    "replay_unit_relation_authority",
]
