"""Independent regulator replay for the authentic real-cubic PARI port.

This module deliberately proves less than the class-and-unit engine.  It
reconstructs the two selected exact units, proves their norms, recomputes their
archimedean logarithms with outward rounding, and encloses the determinant.
Agreement with PARI's packed logs and regulator is correspondence evidence;
it is not an index-one or class-group completion certificate.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Sequence

from sagejs.number_fields.class_unit_analytic import (
    RationalEndpoint,
    certified_regulator_enclosure,
)
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement


FIXTURE_SCHEMA = "sagejs.pari-class-group.regulator-acceptance-replay-fixture.v1"
PAYLOAD_SCHEMA = "sagejs.pari-class-group.regulator-acceptance-replay.v1"
ENVELOPE_SCHEMA = "sagejs.pari-class-group.regulator-acceptance-envelope.v1"


class RegulatorReplayFailure(ArithmeticError):
    """The selected lattice or one of its claimed correspondences did not replay."""


class RegulatorReplayAuthority:
    """Explicit authority for one immutable cold-replay envelope."""

    def __init__(self, envelope_sha256: str) -> None:
        digest = str(envelope_sha256)
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("a replay authority needs a lowercase SHA-256 digest")
        self.envelope_sha256 = digest


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
    if len(triple) != 3:
        raise ValueError(name + " needs one packed real triple")
    mantissa = _integer(triple[0], name + " mantissa")
    precision = _integer(triple[1], name + " precision")
    exponent = _integer(triple[2], name + " exponent")
    if precision == -1:
        if exponent != 0:
            raise ValueError(name + " has an invalid exact-integer triple")
        return RationalEndpoint(mantissa)
    if precision < 64 or precision % 64 or abs(mantissa).bit_length() != precision:
        raise ValueError(name + " is not a normalized PARI real triple")
    shift = exponent - (precision - 1)
    if shift >= 0:
        return RationalEndpoint(mantissa * (2**shift))
    return RationalEndpoint(mantissa, 2 ** (-shift))


def _triples(values: Sequence[Any], count: int, name: str) -> list[list[str]]:
    if len(values) != 3 * count:
        raise ValueError(name + " has the wrong packed length")
    answer = []
    for index in range(count):
        triple = [str(values[3 * index + offset]) for offset in range(3)]
        _packed_point(triple, name + " entry " + str(index))
        answer.append(triple)
    return answer


def _power_basis_element(field: Any, coordinates: Sequence[Any]) -> Any:
    if len(coordinates) != 3:
        raise ValueError("a cubic unit needs three power-basis coordinates")
    generator = field.gen()
    values = [_integer(value, "unit coordinate") for value in coordinates]
    return field(values[0] + values[1] * generator + values[2] * generator**2)


def _selected_lattice_payload(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise TypeError("selected-lattice evidence must be a dictionary")
    columns = _integer(raw.get("columns"), "selected-lattice column count")
    transform = tuple(
        _integer(value, "selected-lattice transform")
        for value in raw.get("unit_transform", ())
    )
    provenance = tuple(
        _integer(value, "selected-lattice provenance")
        for value in raw.get("relation_provenance", ())
    )
    if columns < 2 or len(transform) != 2 * columns or provenance != transform:
        raise RegulatorReplayFailure("selected unit provenance does not replay")
    first, second = transform[:columns], transform[columns:]
    nonzero_first = next((i for i, value in enumerate(first) if value), None)
    if nonzero_first is None:
        raise RegulatorReplayFailure("the first selected unit vector is zero")
    if all(
        first[nonzero_first] * second[index] == second[nonzero_first] * first[index]
        for index in range(columns)
    ):
        raise RegulatorReplayFailure("the selected unit vectors are dependent")
    for key in ("accepted_arch_sha256", "relation_lattice_sha256"):
        digest = str(raw.get(key))
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("selected-lattice source hashes must be SHA-256 digests")
    return {
        "columns": str(columns),
        "unit_transform": [str(value) for value in transform],
        "relation_provenance": [str(value) for value in provenance],
        "unit_transform_sha256": _sha256([str(value) for value in transform]),
        "accepted_arch_sha256": str(raw["accepted_arch_sha256"]),
        "relation_lattice_sha256": str(raw["relation_lattice_sha256"]),
        "rank": 2,
    }


def _normalized_inputs(fixture: Any) -> dict[str, Any]:
    if not isinstance(fixture, dict) or fixture.get("schema") != FIXTURE_SCHEMA:
        raise ValueError("unsupported regulator replay fixture schema")
    source = fixture.get("source")
    field_data = fixture.get("field")
    retry = fixture.get("retry")
    replay = fixture.get("rigorous_replay")
    if not all(
        isinstance(value, dict) for value in (source, field_data, retry, replay)
    ):
        raise TypeError("regulator replay metadata must be dictionaries")
    polynomial = [
        str(_integer(value, "defining polynomial coefficient"))
        for value in field_data.get("defining_polynomial_coefficients", ())
    ]
    if len(polynomial) != 4 or polynomial[-1] != "1":
        raise ValueError("the replay requires one monic cubic")
    integral_basis = [
        [str(_integer(value, "integral-basis coordinate")) for value in row]
        for row in field_data.get("integral_basis_power_coordinates", ())
    ]
    if len(integral_basis) != 3 or any(len(row) != 3 for row in integral_basis):
        raise ValueError("the replay needs the exact three-element integral basis")
    units = [
        [str(_integer(value, "unit coordinate")) for value in row]
        for row in fixture.get("exact_units_power_coordinates", ())
    ]
    if len(units) != 2 or any(len(row) != 3 for row in units):
        raise ValueError("the rank-two replay needs exactly two cubic units")
    resident = fixture.get("resident")
    if not isinstance(resident, dict):
        raise TypeError("resident packed evidence must be a dictionary")
    packed_logs = _triples(resident.get("packed_logs", ()), 6, "resident logs")
    packed_regulator = _triples(
        resident.get("packed_regulator", ()), 1, "resident regulator"
    )[0]
    source_payload = {str(key): str(value) for key, value in source.items()}
    required_source_keys = {
        "field_id",
        "pari_version",
        "pari_archive_sha256",
        "buch2_sha256",
        "unit_bridge_fixture_sha256",
    }
    if set(source_payload) != required_source_keys:
        raise ValueError("the regulator replay source identity is incomplete")
    for key in required_source_keys - {"field_id", "pari_version"}:
        digest = source_payload[key]
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("source identities must use SHA-256 digests")
    retry_payload = {str(key): str(value) for key, value in retry.items()}
    for key in ("packed_logs_sha256", "packed_regulator_sha256"):
        digest = retry_payload.get(key, "")
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("retry output hashes must be SHA-256 digests")
    precision = {
        "initial_precision_bits": str(
            _integer(replay.get("initial_precision_bits"), "initial precision")
        ),
        "absolute_tolerance_bits": str(
            _integer(replay.get("absolute_tolerance_bits"), "absolute tolerance")
        ),
        "maximum_precision_bits": str(
            _integer(replay.get("maximum_precision_bits"), "maximum precision")
        ),
    }
    return {
        "source": source_payload,
        "field": {
            "defining_polynomial_coefficients": polynomial,
            "integral_basis_power_coordinates": integral_basis,
        },
        "selected_lattice": _selected_lattice_payload(fixture.get("selected_lattice")),
        "exact_units_power_coordinates": units,
        "resident": {
            "precision_bits": str(
                _integer(resident.get("precision_bits"), "resident precision")
            ),
            "packed_logs": [entry for triple in packed_logs for entry in triple],
            "packed_regulator": packed_regulator,
        },
        "retry": retry_payload,
        "rigorous_replay": precision,
    }


def build_regulator_acceptance_replay(field: Any, fixture: Any) -> dict[str, Any]:
    """Recompute the selected unit regulator and return authenticated evidence."""
    inputs = _normalized_inputs(fixture)
    if int(field.degree()) != 3:
        raise RegulatorReplayFailure("the replay field is not cubic")
    polynomial = [
        int(value) for value in inputs["field"]["defining_polynomial_coefficients"]
    ]
    actual_polynomial = [
        _integer(str(value), "actual defining polynomial coefficient")
        for value in field.defining_polynomial().list()
    ]
    if actual_polynomial != polynomial:
        raise RegulatorReplayFailure("the replay field polynomial changed")
    exact_units = [
        _power_basis_element(field, row)
        for row in inputs["exact_units_power_coordinates"]
    ]
    norms = [_integer(str(unit.norm()), "exact unit norm") for unit in exact_units]
    if any(abs(norm) != 1 for norm in norms):
        raise RegulatorReplayFailure("a selected exact element is not a unit")
    factored = [
        FactoredNumberFieldElement.from_element(field, unit) for unit in exact_units
    ]
    precision = inputs["rigorous_replay"]
    initial_precision = int(precision["initial_precision_bits"])
    tolerance = int(precision["absolute_tolerance_bits"])
    maximum_precision = int(precision["maximum_precision_bits"])
    logarithm_rows: dict[int, list[list[Any]]] = {}
    calls: list[int] = []

    def logarithms(requested_precision: int) -> list[list[Any]]:
        calls.append(int(requested_precision))
        rows = [
            list(unit.regulator_logarithms(requested_precision, 2)) for unit in factored
        ]
        logarithm_rows[int(requested_precision)] = rows
        return rows

    enclosure = certified_regulator_enclosure(
        logarithms,
        2,
        precision_bits=initial_precision,
        absolute_tolerance_bits=tolerance,
        maximum_precision_bits=maximum_precision,
        weighted_complex_places=True,
    )
    if not enclosure.rigorous or not enclosure.full_rank_certified:
        raise RegulatorReplayFailure("the selected unit determinant was not separated")
    final_precision = enclosure.precision_bits
    rows = logarithm_rows[final_precision]
    full_rows = [
        list(unit.archimedean_logarithms(final_precision)) for unit in factored
    ]
    product_formula = []
    for row in full_rows:
        total = row[0]
        for entry in row[1:]:
            total = total + entry
        if not total.contains_zero():
            raise RegulatorReplayFailure("an exact unit violates the product formula")
        product_formula.append(total.to_dict())
    packed_logs = _triples(inputs["resident"]["packed_logs"], 6, "resident logs")
    log_matches = []
    for unit_index in range(2):
        for place_index in range(3):
            packed = _packed_point(
                packed_logs[3 * unit_index + place_index], "resident log"
            )
            rigorous_log = full_rows[unit_index][place_index]
            matched = rigorous_log.contains(packed)
            log_matches.append(matched)
            if not matched:
                raise RegulatorReplayFailure(
                    "a packed PARI logarithm left its rigorous enclosure"
                )
    packed_regulator = _packed_point(
        inputs["resident"]["packed_regulator"], "resident regulator"
    )
    if not enclosure.ball.contains(packed_regulator):
        raise RegulatorReplayFailure(
            "PARI's packed regulator left the independent determinant enclosure"
        )
    if calls != list(enclosure.precision_history):
        raise RegulatorReplayFailure(
            "the regulator precision schedule was not replayable"
        )
    evidence = {
        "exact_unit_norms": [str(value) for value in norms],
        "exact_unit_coordinate_sha256": _sha256(
            inputs["exact_units_power_coordinates"]
        ),
        "selected_lattice_rank": 2,
        "packed_log_matches": log_matches,
        "packed_regulator_matches": True,
        "product_formula_enclosures": product_formula,
        "regulator": enclosure.to_dict(),
        "precision_decisions": {
            "requested_initial_bits": str(initial_precision),
            "requested_absolute_tolerance_bits": str(tolerance),
            "requested_maximum_bits": str(maximum_precision),
            "actual_history": [str(value) for value in enclosure.precision_history],
            "retry_log_bits": inputs["retry"]["log_precision_bits"],
            "retry_embedding_bits": inputs["retry"]["embedding_precision_bits"],
            "retry_working_capacity_bits": inputs["retry"]["working_capacity_bits"],
        },
    }
    assumptions = {
        "pari_correspondence": {
            "assumed": True,
            "version": inputs["source"]["pari_version"],
            "claim": "selected lattice, packed-log path, and heuristic acceptance follow pinned PARI 2.17.4",
        },
        "rigorous_local_replay": {
            "exact_unit_norms": True,
            "selected_lattice_full_rank": True,
            "weighted_log_regulator_enclosed": True,
            "packed_values_contained": True,
        },
        "public_certification": {
            "unit_saturation_index_one": False,
            "factor_base_and_relation_completion": False,
            "class_unit_complete": False,
            "reason": "no independent saturation/index-one or complete class-presentation certificate is supplied",
        },
    }
    payload = {
        "schema": PAYLOAD_SCHEMA,
        "inputs": inputs,
        "evidence": evidence,
        "assumptions": assumptions,
        "status": "rigorous-selected-lattice-regulator; pari-correspondence-assumed",
    }
    return payload


def seal_regulator_acceptance_replay(
    payload: Any,
) -> tuple[bytes, RegulatorReplayAuthority]:
    """Seal one replay payload without granting any public proof authority."""
    if not isinstance(payload, dict) or payload.get("schema") != PAYLOAD_SCHEMA:
        raise ValueError("unsupported regulator replay payload")
    payload_text = _canonical(payload)
    envelope = {
        "schema": ENVELOPE_SCHEMA,
        "payload": payload,
        "payload_sha256": hashlib.sha256(payload_text.encode("ascii")).hexdigest(),
    }
    raw = _canonical(envelope).encode("ascii")
    authority = RegulatorReplayAuthority(hashlib.sha256(raw).hexdigest())
    return raw, authority


def cold_replay_regulator_acceptance(
    field: Any,
    raw: bytes,
    authority: RegulatorReplayAuthority,
) -> dict[str, Any]:
    """Recompute every mathematical field of a sealed replay envelope."""
    if not isinstance(raw, bytes) or type(authority) is not RegulatorReplayAuthority:
        raise TypeError("cold replay needs bytes and explicit replay authority")
    if hashlib.sha256(raw).hexdigest() != authority.envelope_sha256:
        raise RegulatorReplayFailure("the regulator replay envelope lacks authority")
    envelope = json.loads(raw.decode("ascii"))
    if not isinstance(envelope, dict) or envelope.get("schema") != ENVELOPE_SCHEMA:
        raise RegulatorReplayFailure("unsupported regulator replay envelope")
    payload = envelope.get("payload")
    if not isinstance(payload, dict) or hashlib.sha256(
        _canonical(payload).encode("ascii")
    ).hexdigest() != envelope.get("payload_sha256"):
        raise RegulatorReplayFailure("the regulator replay payload hash changed")
    inputs = payload.get("inputs")
    fixture = {
        "schema": FIXTURE_SCHEMA,
        "source": inputs.get("source") if isinstance(inputs, dict) else None,
        "field": inputs.get("field") if isinstance(inputs, dict) else None,
        "selected_lattice": (
            inputs.get("selected_lattice") if isinstance(inputs, dict) else None
        ),
        "exact_units_power_coordinates": (
            inputs.get("exact_units_power_coordinates")
            if isinstance(inputs, dict)
            else None
        ),
        "resident": inputs.get("resident") if isinstance(inputs, dict) else None,
        "retry": inputs.get("retry") if isinstance(inputs, dict) else None,
        "rigorous_replay": (
            inputs.get("rigorous_replay") if isinstance(inputs, dict) else None
        ),
    }
    replayed = build_regulator_acceptance_replay(field, fixture)
    if _canonical(replayed) != _canonical(payload):
        raise RegulatorReplayFailure("cold regulator replay changed the evidence")
    return replayed


__all__ = [
    "ENVELOPE_SCHEMA",
    "FIXTURE_SCHEMA",
    "PAYLOAD_SCHEMA",
    "RegulatorReplayAuthority",
    "RegulatorReplayFailure",
    "build_regulator_acceptance_replay",
    "cold_replay_regulator_acceptance",
    "seal_regulator_acceptance_replay",
]
