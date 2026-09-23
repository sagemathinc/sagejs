"""Rigorous authority for a live regulator produced by a native root.

The timed native computation supplies the regulator, exact units, ordered
unit provenance, and ordered logarithms.  This verifier independently rebuilds
outward-rounded logarithm owners from the exact units and accepts the live
regulator only when it lies in the resulting nonzero `RegulatorEnclosure`.

An ULP distance to a reference result is deliberately absent from this API.
Such a distance can be recorded by an external correspondence harness, but it
does not establish mathematical authority.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Sequence

from sagejs.number_fields.class_unit_analytic import (
    RationalEndpoint,
    certified_regulator_enclosure,
)
from sagejs.number_fields.factored_elements import (
    FactoredNumberFieldElement,
    field_fingerprint,
)


SCHEMA = "sagejs.pari-class-group/live-regulator-interval-authority-v1"


class RegulatorIntervalAuthorityFailure(ArithmeticError):
    """The live regulator or its ordered provenance failed verification."""


def _canonical(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("ascii")).hexdigest()


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    answer = int(value)
    if str(answer) != str(value):
        raise ValueError(name + " must use canonical decimal notation")
    return answer


def _packed_point(triple: Sequence[Any], name: str) -> RationalEndpoint:
    if isinstance(triple, (str, bytes)) or len(triple) != 3:
        raise ValueError(name + " needs one packed real triple")
    mantissa = _integer(triple[0], name + " mantissa")
    precision = _integer(triple[1], name + " precision")
    exponent = _integer(triple[2], name + " exponent")
    if precision == -1:
        if exponent != 0:
            raise ValueError(name + " has an invalid exact-integer triple")
        return RationalEndpoint(mantissa)
    if precision < 64 or precision % 64 or abs(mantissa).bit_length() != precision:
        raise ValueError(name + " is not a normalized packed real triple")
    shift = exponent - (precision - 1)
    if shift >= 0:
        return RationalEndpoint(mantissa * (2**shift))
    return RationalEndpoint(mantissa, 2 ** (-shift))


def _packed_triples(values: Sequence[Any], name: str) -> list[list[str]]:
    if isinstance(values, (str, bytes)) or len(values) % 3:
        raise ValueError(name + " has the wrong packed shape")
    answer: list[list[str]] = []
    for index in range(len(values) // 3):
        triple = [str(values[3 * index + offset]) for offset in range(3)]
        _packed_point(triple, name + " entry " + str(index))
        answer.append(triple)
    return answer


def _integer_rows(values: Sequence[Sequence[Any]], name: str) -> list[list[int]]:
    if isinstance(values, (str, bytes)) or not values:
        raise ValueError(name + " needs at least one row")
    width = -1
    rows: list[list[int]] = []
    for row_index, raw_row in enumerate(values):
        if isinstance(raw_row, (str, bytes)):
            raise ValueError(name + " row has the wrong shape")
        row = [_integer(value, name + " entry " + str(row_index)) for value in raw_row]
        if width < 0:
            width = len(row)
        if not row or len(row) != width:
            raise ValueError(name + " is not rectangular")
        rows.append(row)
    return rows


def _integer_matrix_rank(rows: Sequence[Sequence[int]]) -> int:
    """Return exact row rank using fraction-free elimination."""
    matrix = [list(row) for row in rows]
    height = len(matrix)
    width = len(matrix[0])
    pivot_row = 0
    for column in range(width):
        pivot = next(
            (row for row in range(pivot_row, height) if matrix[row][column]),
            None,
        )
        if pivot is None:
            continue
        matrix[pivot_row], matrix[pivot] = matrix[pivot], matrix[pivot_row]
        pivot_value = matrix[pivot_row][column]
        for row in range(pivot_row + 1, height):
            factor = matrix[row][column]
            if factor == 0:
                continue
            for entry in range(column, width):
                matrix[row][entry] = (
                    pivot_value * matrix[row][entry] - factor * matrix[pivot_row][entry]
                )
        pivot_row += 1
        if pivot_row == height:
            break
    return pivot_row


def _power_basis_element(field: Any, coordinates: Sequence[Any]) -> Any:
    degree = int(field.degree())
    if isinstance(coordinates, (str, bytes)) or len(coordinates) != degree:
        raise ValueError("an exact unit has the wrong power-basis dimension")
    generator = field.gen()
    answer: Any = 0
    power: Any = 1
    for index, coordinate in enumerate(coordinates):
        answer += _integer(coordinate, "unit coordinate " + str(index)) * power
        power *= generator
    return field(answer)


def build_live_regulator_interval_authority(
    field: Any,
    live_regulator: Sequence[Any],
    exact_units_power_coordinates: Sequence[Sequence[Any]],
    ordered_unit_provenance: Sequence[Sequence[Any]],
    ordered_packed_logs: Sequence[Any],
    *,
    initial_precision_bits: int = 128,
    absolute_tolerance_bits: int = 96,
    maximum_precision_bits: int = 512,
) -> dict[str, Any]:
    """Verify a live regulator against independently generated interval owners.

    This function belongs outside the timed native root.  The interval owners
    are generated here from `exact_units_power_coordinates`; a caller cannot
    inject a previously known serialized regulator interval.  Unit rows,
    provenance rows, and packed-log rows are ordered and their hashes are part
    of the returned authority.
    """
    unit_rows = _integer_rows(
        exact_units_power_coordinates, "exact unit power coordinates"
    )
    rank = len(unit_rows)
    degree = int(field.degree())
    if any(len(row) != degree for row in unit_rows):
        raise ValueError("an exact unit has the wrong field degree")
    provenance = _integer_rows(ordered_unit_provenance, "ordered unit provenance")
    if len(provenance) != rank or _integer_matrix_rank(provenance) != rank:
        raise RegulatorIntervalAuthorityFailure(
            "ordered unit provenance is not full row rank"
        )
    packed_logs = _packed_triples(ordered_packed_logs, "ordered packed logs")
    live_triple = [str(value) for value in live_regulator]
    live_point = _packed_point(live_triple, "live regulator")

    exact_units = [_power_basis_element(field, row) for row in unit_rows]
    norms = [_integer(str(unit.norm()), "exact unit norm") for unit in exact_units]
    if any(abs(norm) != 1 for norm in norms):
        raise RegulatorIntervalAuthorityFailure("an exact element is not a unit")
    factored = [
        FactoredNumberFieldElement.from_element(field, unit) for unit in exact_units
    ]
    calls: list[int] = []
    regulator_rows: dict[int, list[list[Any]]] = {}

    def logarithms(requested_precision: int) -> list[list[Any]]:
        calls.append(int(requested_precision))
        rows = [
            list(unit.regulator_logarithms(requested_precision, rank))
            for unit in factored
        ]
        regulator_rows[int(requested_precision)] = rows
        return rows

    enclosure = certified_regulator_enclosure(
        logarithms,
        rank,
        precision_bits=int(initial_precision_bits),
        absolute_tolerance_bits=int(absolute_tolerance_bits),
        maximum_precision_bits=int(maximum_precision_bits),
        weighted_complex_places=True,
    )
    if not enclosure.rigorous or not enclosure.full_rank_certified:
        raise RegulatorIntervalAuthorityFailure(
            "independent exact-unit regulator was not rigorously separated"
        )
    if calls != list(enclosure.precision_history):
        raise RegulatorIntervalAuthorityFailure(
            "independent regulator precision history is inconsistent"
        )
    if not enclosure.ball.contains(live_point):
        raise RegulatorIntervalAuthorityFailure(
            "live regulator left the independent exact-unit enclosure"
        )

    final_precision = enclosure.precision_bits
    full_rows = [
        list(unit.archimedean_logarithms(final_precision)) for unit in factored
    ]
    if not full_rows or any(len(row) != len(full_rows[0]) for row in full_rows):
        raise RegulatorIntervalAuthorityFailure(
            "independent logarithm owners have inconsistent shapes"
        )
    place_count = len(full_rows[0])
    if len(packed_logs) != rank * place_count:
        raise RegulatorIntervalAuthorityFailure(
            "ordered packed logs do not match unit/place shape"
        )
    packed_log_matches: list[bool] = []
    product_formula: list[dict[str, Any]] = []
    for unit_index, row in enumerate(full_rows):
        total = row[0]
        for place_index, rigorous_log in enumerate(row):
            packed = _packed_point(
                packed_logs[unit_index * place_count + place_index],
                "ordered packed log",
            )
            matched = rigorous_log.contains(packed)
            packed_log_matches.append(matched)
            if not matched:
                raise RegulatorIntervalAuthorityFailure(
                    "an ordered packed log left its exact-unit enclosure"
                )
            if place_index:
                total = total + rigorous_log
        if not total.contains_zero():
            raise RegulatorIntervalAuthorityFailure(
                "an exact unit violates the archimedean product formula"
            )
        product_formula.append(total.to_dict())

    normalized_units = [[str(value) for value in row] for row in unit_rows]
    normalized_provenance = [[str(value) for value in row] for row in provenance]
    flat_logs = [entry for triple in packed_logs for entry in triple]
    payload = {
        "schema": SCHEMA,
        "field": field_fingerprint(field),
        "ordered_inputs": {
            "exact_units_power_coordinates": normalized_units,
            "exact_units_sha256": _sha256(normalized_units),
            "unit_provenance": normalized_provenance,
            "unit_provenance_sha256": _sha256(normalized_provenance),
            "packed_logs": flat_logs,
            "packed_logs_sha256": _sha256(flat_logs),
            "live_regulator": live_triple,
            "live_regulator_sha256": _sha256(live_triple),
        },
        "evidence": {
            "exact_unit_norms": [str(value) for value in norms],
            "unit_rank": str(rank),
            "place_count": str(place_count),
            "provenance_full_row_rank": True,
            "packed_log_matches": packed_log_matches,
            "product_formula_enclosures": product_formula,
            "live_regulator_contained": True,
            "regulator_enclosure": enclosure.to_dict(),
            "precision_history": [str(value) for value in calls],
        },
        "authority": {
            "scope": "independent-exact-unit-interval-verifier",
            "timed_native_root": False,
            "intervals_generated_from_exact_units": True,
            "serialized_known_envelope_accepted_as_input": False,
            "ulp_corridor_used_for_acceptance": False,
            "external_ulp_fingerprint_may_be_recorded": True,
            "unit_saturation_index_one": False,
            "public_class_unit_complete": False,
        },
    }
    payload["authority_sha256"] = _sha256(payload)
    return payload
