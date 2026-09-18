"""Independent analytic unit-index replay for the genuine row-0 result.

The replay proves that the two exact retained units have index one provided
the independently replayed phase-3 class-number-one presentation is a complete
class presentation.  It does not prove PARI's factor-base generation bound;
that premise remains explicit in both the evidence and the output-v2 gap list.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Sequence

from sagejs.number_fields.class_unit_analytic import (
    ZetaLogResidueLimits,
    regulator_from_factored_units,
    validate_hr_index,
    zeta_log_residue_bound,
)
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement


SCHEMA = "sagejs.pari-class-group/row0-unit-saturation-evidence-v1"
CORRESPONDENCE_SHA256 = (
    "dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58"
)
FIELD_ID = "pari-2.17.4:x^3-20018*x+20034"
RAW_SMITH_MATERIAL = {
    "d": "8f6662599644d6d45486149a56f8dadaf94ecbb0f2a1d1f7dbaee4516e2e5031",
    "u": "ffd9913326285aba2215b6352b8dc52e8e2868697eded42f7bbc6dffc2f56602",
    "v": "7e66fe7790aa07259f7822bf7b5c41384de755e5b94167f5facb50d6199dbd70",
}


class Row0UnitSaturationFailure(ArithmeticError):
    """The row-0 source or analytic unit-index proof failed replay."""


def _canonical(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )


def _sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _sha256(value: Any) -> str:
    return _sha256_bytes(_canonical(value).encode("ascii"))


def _read_correspondence(filename: str) -> tuple[dict[str, Any], bytes]:
    raw = Path(filename).read_bytes()
    if _sha256_bytes(raw) != CORRESPONDENCE_SHA256:
        raise Row0UnitSaturationFailure("row-0 correspondence identity changed")
    envelope = json.loads(raw.decode("ascii"))
    if _canonical(envelope).encode("ascii") != raw:
        raise Row0UnitSaturationFailure("row-0 correspondence is not canonical")
    payload = envelope.get("payload")
    if (
        not isinstance(payload, dict)
        or envelope.get("payloadSha256") != _sha256(payload)
        or payload.get("field", {}).get("id") != FIELD_ID
        or payload.get("classGroup", {}).get("classNumber") != "1"
        or payload.get("classGroup", {}).get("invariantFactors") != []
        or payload.get("unitGroup", {}).get("rank") != "2"
    ):
        raise Row0UnitSaturationFailure("row-0 correspondence payload changed")
    return payload, raw


def _owners(payload: dict[str, Any]) -> dict[str, list[str]]:
    answer: dict[str, list[str]] = {}
    for owner in payload.get("storage", ()):
        name = owner.get("name")
        entries = owner.get("entries")
        if (
            not isinstance(name, str)
            or not isinstance(entries, list)
            or owner.get("logicalLength") != str(len(entries))
            or name in answer
        ):
            raise Row0UnitSaturationFailure("row-0 storage ownership changed")
        answer[name] = [str(value) for value in entries]
    return answer


def _row0_objects(payload: dict[str, Any]) -> tuple[Any, Any, tuple[Any, ...]]:
    owners = _owners(payload)
    coordinates = owners.get("exact-unit-coordinates")
    norms = owners.get("exact-unit-norms")
    if coordinates is None or len(coordinates) != 6 or norms != ["-1", "-1"]:
        raise Row0UnitSaturationFailure("row-0 exact units changed")
    polynomial_ring = PolynomialRing(QQ, "x")  # noqa: F821
    x = polynomial_ring.gen()
    field = NumberField(x**3 - 20018 * x + 20034, "a")  # noqa: F821
    generator = field.gen()
    units = []
    for index in range(2):
        offset = 3 * index
        value = field(
            int(coordinates[offset])
            + int(coordinates[offset + 1]) * generator
            + int(coordinates[offset + 2]) * generator**2
        )
        if str(value.norm()) != norms[index]:
            raise Row0UnitSaturationFailure("row-0 exact unit norm changed")
        units.append(FactoredNumberFieldElement.from_element(field, value))
    return field, field.maximal_order(), tuple(units)


def _generation_evidence(payload: dict[str, Any]) -> dict[str, Any]:
    owners = _owners(payload)
    return {
        "schema": "sagejs.pari-class-group/row0-phase3-premise-v1",
        "correspondence_sha256": CORRESPONDENCE_SHA256,
        "field_id": FIELD_ID,
        "class_number": "1",
        "raw_relation_matrix_sha256": _sha256(owners["replay-relation_records"]),
        "factor_base_sha256": _sha256(owners["replay-packet_ideals"]),
        "raw_smith_material_sha256": dict(RAW_SMITH_MATERIAL),
        "raw_smith_diagonal": {"ones": "66", "other_factors": []},
        "factor_base_generation_proved": False,
        "scope": "unit-index conditional on the authenticated phase-3 class-number-one premise",
    }


def _analytic_certificate(
    field: Any,
    order: Any,
    units: tuple[Any, ...],
    premise: dict[str, Any],
) -> dict[str, Any]:
    regulator = regulator_from_factored_units(
        units,
        unit_rank=2,
        precision_bits=128,
        maximum_precision_bits=512,
    )
    zeta = zeta_log_residue_bound(
        int(order.discriminant()),
        int(field.degree()),
        order.splitting_records,
        absolute_error="1/8",
        precision_bits=128,
        limits=ZetaLogResidueLimits(
            maximum_prime_bound=1_000_000,
            maximum_precision_bits=512,
        ),
    )
    index = validate_hr_index(
        signature=(3, 0),
        discriminant=int(order.discriminant()),
        class_number=1,
        roots_of_unity=2,
        regulator=regulator,
        zeta_log_residue=zeta,
        precision_bits=128,
    )
    zeta_payload = zeta.to_dict()
    zeta_payload.pop("diagnostics", None)
    body = {
        "schema": "sagejs.pari-class-group/row0-conditional-analytic-unit-index-certificate-v1",
        "premise": premise,
        "configuration": {
            "signature": [3, 0],
            "discriminant": str(order.discriminant()),
            "class_number": "1",
            "roots_of_unity": "2",
            "precision_bits": "128",
            "maximum_precision_bits": "512",
            "zeta_absolute_error": "1/8",
            "maximum_prime_bound": "1000000",
        },
        "analytic_proof": {
            "regulator": regulator.to_dict(),
            "zeta_log_residue": zeta_payload,
            "hr_index": index.to_dict(),
        },
    }
    return {**body, "content_sha256": _sha256(body)}


def build(filename: str) -> dict[str, Any]:
    payload, _raw = _read_correspondence(filename)
    field, order, units = _row0_objects(payload)
    generation = _generation_evidence(payload)
    certificate_payload = _analytic_certificate(field, order, units, generation)
    proof = certificate_payload["analytic_proof"]
    if proof["hr_index"].get("unique_index") != 1:
        raise Row0UnitSaturationFailure("row-0 analytic unit index is not one")
    certificate_json = _canonical(certificate_payload)
    body = {
        "schema": SCHEMA,
        "source": {
            "correspondence_sha256": CORRESPONDENCE_SHA256,
            "field_id": FIELD_ID,
        },
        "premise": generation,
        "certificate": {
            "canonical_json": certificate_json,
            "canonical_json_sha256": _sha256_bytes(certificate_json.encode("ascii")),
            "content_sha256": str(certificate_payload["content_sha256"]),
        },
        "conclusion": {
            "class_number_premise": "1",
            "lower_index": str(proof["hr_index"]["lower_index"]),
            "upper_index": str(proof["hr_index"]["upper_index"]),
            "unique_index": str(proof["hr_index"]["unique_index"]),
            "unit_index_one": True,
            "rigorous": True,
            "factor_base_generation_proved": False,
            "public_class_unit_complete": False,
        },
    }
    return {**body, "content_sha256": _sha256(body)}


def verify(filename: str, evidence: Any) -> bool:
    try:
        if not isinstance(evidence, dict) or set(evidence) != {
            "schema",
            "source",
            "premise",
            "certificate",
            "conclusion",
            "content_sha256",
        }:
            return False
        body = dict(evidence)
        digest = body.pop("content_sha256")
        if evidence.get("schema") != SCHEMA or digest != _sha256(body):
            return False
        payload, _raw = _read_correspondence(filename)
        field, order, units = _row0_objects(payload)
        expected_generation = _generation_evidence(payload)
        if evidence.get("premise") != expected_generation:
            return False
        conclusion = evidence.get("conclusion")
        if conclusion != {
            "class_number_premise": "1",
            "lower_index": "1",
            "upper_index": "1",
            "unique_index": "1",
            "unit_index_one": True,
            "rigorous": True,
            "factor_base_generation_proved": False,
            "public_class_unit_complete": False,
        }:
            return False
        retained_certificate = evidence.get("certificate")
        if not isinstance(retained_certificate, dict) or set(retained_certificate) != {
            "canonical_json",
            "canonical_json_sha256",
            "content_sha256",
        }:
            return False
        certificate_json = retained_certificate["canonical_json"]
        if not isinstance(certificate_json, str) or retained_certificate[
            "canonical_json_sha256"
        ] != _sha256_bytes(certificate_json.encode("ascii")):
            return False
        certificate_payload = json.loads(certificate_json)
        if _canonical(certificate_payload) != certificate_json or retained_certificate[
            "content_sha256"
        ] != certificate_payload.get("content_sha256"):
            return False
        certificate_body = dict(certificate_payload)
        certificate_digest = certificate_body.pop("content_sha256", None)
        if (
            certificate_payload.get("schema")
            != "sagejs.pari-class-group/row0-conditional-analytic-unit-index-certificate-v1"
            or certificate_payload.get("premise") != expected_generation
            or certificate_digest != _sha256(certificate_body)
        ):
            return False
        replayed = _analytic_certificate(field, order, units, expected_generation)
        return bool(replayed == certificate_payload)
    except (KeyError, TypeError, ValueError, ArithmeticError):
        return False


def main(argv: Sequence[str]) -> None:
    configured_result = os.environ.get("SAGEJS_ROW0_SATURATION_RESULT")
    if configured_result:
        arguments = [configured_result]
        evidence_file = os.environ.get("SAGEJS_ROW0_SATURATION_EVIDENCE")
        if evidence_file:
            arguments.append(evidence_file)
    else:
        arguments = list(argv[1:])
    if len(arguments) not in (1, 2):
        raise SystemExit(
            "usage: row0_unit_saturation_evidence.py RESULT.json [EVIDENCE.json]"
        )
    if len(arguments) == 1:
        evidence = build(arguments[0])
    else:
        evidence = json.loads(Path(arguments[1]).read_text(encoding="ascii"))
        if not verify(arguments[0], evidence):
            raise Row0UnitSaturationFailure("row-0 unit saturation evidence failed")
    print(_canonical(evidence))


if __name__ == "__main__":
    main(sys.argv)
