"""Strict detached component replay, deliberately without completeness authority.

This adapter reconstructs exact objects through existing mathematical services.
It neither resumes a producer nor grants a class/unit computation or map token.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

SCHEMA = "sagejs.number-fields/class-unit-components-v1"
MAX_BYTES = 4 * 1024 * 1024
MAX_NODES = 100_000
MAX_DEPTH = 32
MAX_FACTORS = 32
MAX_RELATIONS = 128
MAX_EXPONENT = 256
MAX_TOTAL_EXPONENT = 4096


class ComponentReplayCapabilityError(NotImplementedError):
    """The component adapter does not support this producer or proof kind."""


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


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _hash(value: Any) -> str:
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def _unique_object(pairs: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        _require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def _parse_integer(text: str) -> int:
    if len(text) > 1235:
        raise ComponentReplayResourceError("JSON integer token is too long")
    value = int(text)
    if abs(value).bit_length() > 4096:
        raise ComponentReplayResourceError("JSON integer exceeds 4096 bits")
    return value


def _reject_number(text: str) -> Any:
    raise ValueError("noninteger JSON numbers are unsupported: " + text[:32])


def _decode(text: str) -> dict[str, Any]:
    _require(type(text) is str, "component replay requires JSON text")
    if len(text) > MAX_BYTES or len(text.encode("utf-8")) > MAX_BYTES:
        raise ComponentReplayResourceError("component JSON exceeds its byte limit")
    depth, quoted, escaped = 0, False, False
    structural_nodes = 1
    for character in text:
        if quoted:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                quoted = False
        elif character == '"':
            quoted = True
        elif character in "[{":
            depth += 1
            structural_nodes += 1
            if depth > MAX_DEPTH:
                raise ComponentReplayResourceError(
                    "component JSON is too deeply nested"
                )
        elif character in "]}":
            depth -= 1
        elif character in ",:":
            structural_nodes += 1
        if structural_nodes > MAX_NODES:
            raise ComponentReplayResourceError(
                "component JSON exceeds its structural node budget"
            )
    value = json.loads(
        text,
        object_pairs_hook=_unique_object,
        parse_int=_parse_integer,
        parse_float=_reject_number,
        parse_constant=_reject_number,
    )
    pending = [value]
    count = 0
    while pending:
        item = pending.pop()
        count += 1
        if count > MAX_NODES:
            raise ComponentReplayResourceError("component JSON exceeds its node limit")
        if type(item) is dict:
            if len(item) > 64 or any(len(key) > 128 for key in item):
                raise ComponentReplayResourceError("oversized component object")
            pending.extend(item.values())
        elif type(item) is list:
            _list(item, 1024)
            pending.extend(item)
        elif type(item) is str:
            if len(item) > 4096:
                raise ComponentReplayResourceError("component string is too long")
        else:
            _require(type(item) is int, "unsupported component scalar")
    _require(type(value) is dict, "component envelope must be an object")
    return value


def _preflight(payload: Any) -> int:
    _keys(
        payload,
        "schema field_order source_proof_status factor_base relations presentation units torsion content_sha256",
    )
    _require(payload["schema"] == SCHEMA, "unsupported component schema")
    _require(
        payload["source_proof_status"]
        in ("exact-unconditional", "exact-relations-conditional-grh"),
        "unsupported source proof-status claim",
    )
    body = dict(payload)
    digest = body.pop("content_sha256")
    _require(type(digest) is str and _hash(body) == digest, "component hash mismatch")
    identity = payload["field_order"]
    _keys(identity, "field maximal_order_basis discriminant")
    field = identity["field"]
    _keys(field, "defining_polynomial degree variable")
    degree = _integer(field["degree"], 4, minimum=2)
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
    primes = _list(payload["factor_base"], MAX_FACTORS)
    for prime in primes:
        _keys(prime, "schema field_order_fingerprint prime e f basis residue")
        _require(
            prime["schema"] == "sagejs.number-fields.prime-ideal.v1",
            "unknown prime schema",
        )
        rational_prime = _integer(prime["prime"], 1000, minimum=2)
        _integer(prime["e"], degree, minimum=1)
        residue_degree = _integer(prime["f"], degree, minimum=1)
        _require(
            prime["field_order_fingerprint"]
            == {
                "defining_polynomial": field["defining_polynomial"],
                "variable": field["variable"],
                "maximal_order_basis": identity["maximal_order_basis"],
                "discriminant": identity["discriminant"],
            },
            "prime field/order binding differs",
        )
        _require(
            len(_list(prime["basis"], degree)) == degree, "incorrect prime basis size"
        )
        for row in prime["basis"]:
            _vector(row, degree)
        residue = prime["residue"]
        _keys(residue, "primitive quotient_matrix power_inverse modulus")
        for name, size in (("primitive", degree), ("modulus", residue_degree + 1)):
            _require(
                len(_list(residue[name], size)) == size, "incorrect residue vector size"
            )
            for entry in residue[name]:
                _integer(entry, rational_prime - 1)
        for name, row_count in (
            ("quotient_matrix", degree),
            ("power_inverse", residue_degree),
        ):
            _require(
                len(_list(residue[name], row_count)) == row_count,
                "incorrect residue matrix size",
            )
            for row in residue[name]:
                _require(
                    len(_list(row, residue_degree)) == residue_degree,
                    "incorrect residue row size",
                )
                for entry in row:
                    _integer(entry, rational_prime - 1)
    records = _list(payload["relations"], MAX_RELATIONS)
    power_sum = 0
    for record in records:
        _keys(
            record,
            "schema row source_row quotient_row witness norm_smoothness archimedean provenance",
        )
        _require(
            record["schema"] == "sagejs.number-fields/class-relation-v2",
            "unknown relation schema",
        )
        for name in ("row", "source_row", "quotient_row"):
            _require(
                len(_list(record[name], len(primes))) == len(primes),
                "incorrect relation width",
            )
            for exponent in record[name]:
                power_sum += abs(
                    _integer(exponent, MAX_EXPONENT, minimum=-MAX_EXPONENT)
                )
        _require(
            record["provenance"] == {}
            and record["archimedean"]
            == {
                "precision": 0,
                "logs": [],
                "complex_place_convention": "one-place-log-absolute-value-times-two",
            },
            "unverified relation metadata is unsupported",
        )
    unit_payloads = _list(payload["units"], 3)
    witnesses = [(record["witness"], False) for record in records] + [
        (unit, True) for unit in unit_payloads
    ]
    for witness, is_unit in witnesses:
        _keys(
            witness,
            "schema factors field content_sha256" if is_unit else "schema factors",
        )
        _require(
            witness["schema"]
            == (
                "sagejs.number-fields.factored-element.v1"
                if is_unit
                else "sagejs.number-fields/factored-principal-witness-v1"
            ),
            "unknown witness schema",
        )
        if is_unit:
            _require(witness["field"] == field, "unit field binding differs")
        for factor in _list(witness["factors"], 32):
            _keys(factor, "element exponent")
            _vector(factor["element"], degree)
            power_sum += abs(
                _integer(factor["exponent"], MAX_EXPONENT, minimum=-MAX_EXPONENT)
            )
    if power_sum > MAX_TOTAL_EXPONENT:
        raise ComponentReplayResourceError("aggregate ideal exponent policy exceeded")
    presentation = payload["presentation"]
    _keys(
        presentation,
        "schema columns rows hnf hnf_left smith smith_left smith_right smith_right_inverse backend",
    )
    _require(
        presentation["schema"] == "sagejs.number-fields/class-relation-presentation-v1",
        "unknown presentation schema",
    )
    _require(
        presentation["columns"] == len(primes),
        "presentation width differs from factor base",
    )
    _require(
        len(_list(presentation["rows"], len(records))) == len(records),
        "presentation relation count mismatch",
    )
    for sparse, record in zip(presentation["rows"], records, strict=True):
        _require(
            sparse
            == {
                "columns": len(primes),
                "entries": [
                    [index, exponent]
                    for index, exponent in enumerate(record["row"])
                    if exponent
                ],
            },
            "presentation sparse rows differ from verified relation inputs",
        )
    for name, rows, columns in (
        ("hnf", len(records), len(primes)),
        ("smith", len(records), len(primes)),
        ("hnf_left", len(records), len(records)),
        ("smith_left", len(records), len(records)),
        ("smith_right", len(primes), len(primes)),
        ("smith_right_inverse", len(primes), len(primes)),
    ):
        _require(
            len(_list(presentation[name], rows)) == rows,
            "incorrect presentation dimensions",
        )
        for row in presentation[name]:
            _require(
                len(_list(row, columns)) == columns, "incorrect presentation row width"
            )
            for entry in row:
                _integer(entry, (1 << 256) - 1, minimum=-(1 << 256) + 1)
    torsion = payload["torsion"]
    _keys(torsion, "order certificate")
    _integer(torsion["order"], 12, minimum=1)
    certificate = torsion["certificate"]
    _keys(
        certificate,
        "schema kind degree signature universal_prime_powers universal_exponent generator_coordinates prime_records coefficient_bounds candidates_checked candidate_cap proof_status",
    )
    _require(
        certificate["schema"] == "sagejs.number-fields/roots-of-unity-certificate-v1",
        "unknown torsion schema",
    )
    _require(
        certificate["degree"] == degree and certificate["proof_status"] == "exact",
        "torsion degree/status differs",
    )
    signature = _list(certificate["signature"], 2)
    _require(len(signature) == 2, "incorrect signature size")
    r1, r2 = (_integer(value, degree) for value in signature)
    _require(r1 + 2 * r2 == degree, "signature dimension differs")
    previous_prime = 1
    for pair in _list(certificate["universal_prime_powers"], 8):
        _require(len(_list(pair, 2)) == 2, "incorrect universal-prime pair")
        previous_prime = _integer(pair[0], degree + 1, minimum=previous_prime + 1)
        _integer(pair[1], 120, minimum=2)
    if certificate.get("kind") not in (
        "real-place",
        "imaginary-quadratic-classification",
    ):
        raise ComponentReplayCapabilityError(
            "only classification torsion replay is supported"
        )
    _integer(certificate.get("universal_exponent"), 120, minimum=1)
    _require(
        certificate.get("candidate_cap") == 0
        and certificate.get("candidates_checked") == 0
        and certificate.get("prime_records") == []
        and certificate.get("coefficient_bounds") == [],
        "torsion search evidence is unsupported",
    )
    _vector(certificate.get("generator_coordinates"), degree)
    return degree


def export_terminal_components(source: Any) -> str:
    """Export recognized live components, without exporting their authority."""
    from sagejs.number_fields import class_unit_context as context
    from sagejs.number_fields import class_unit_groups as groups
    from sagejs.number_fields.unit_coordinates import _recognized_authority

    order, units, evidence = _recognized_authority(source)
    if type(evidence) is not groups.ClassUnitSaturationRecord:
        raise ComponentReplayCapabilityError(
            "specialized terminal export is unsupported"
        )
    primes = []
    for prime in source.conditional_factor_base:
        payload = prime.to_dict()
        del payload["field_instance"]
        del payload["order_instance"]
        primes.append(payload)
    records = []
    for record in source.conditional_relation_records:
        payload = record.to_dict()
        payload["provenance"] = {}
        payload["archimedean"]["precision"] = 0
        payload["archimedean"]["logs"] = []
        records.append(payload)
    body = {
        "schema": SCHEMA,
        "field_order": context._order_fingerprint(source.field, order),
        "source_proof_status": source.proof_status,
        "factor_base": primes,
        "relations": records,
        "presentation": source.conditional_presentation_evidence.to_dict(),
        "units": [unit.to_dict() for unit in units.generators],
        "torsion": {
            "order": units.torsion.order,
            "certificate": units.torsion.certificate.to_dict(),
        },
    }
    body["content_sha256"] = _hash(body)
    text = _json(body)
    _preflight(_decode(text))
    _recognized_authority(source)
    return text


def replay_terminal_components(text: str) -> dict[str, Any]:
    """Independently check components; never issue terminal completeness."""
    payload = _decode(text)
    _preflight(payload)
    from sagejs.number_fields import class_unit_context as context
    from sagejs.number_fields import class_group_matrix as matrix
    from sagejs.number_fields import class_group_relations as relations
    from sagejs.number_fields import prime_ideals
    from sagejs.number_fields import units
    from sagejs.number_fields.factored_elements import FactoredNumberFieldElement

    identity = payload["field_order"]
    field_payload = identity["field"]
    algebra = __import__("sagejs._baselib.algebra", fromlist=["QQ"])
    polynomials = __import__("sagejs._baselib.polynomial", fromlist=["PolynomialRing"])
    polynomial = polynomials.PolynomialRing(algebra.QQ, "x")(
        [algebra.QQ(a) / b for a, b in field_payload["defining_polynomial"]]
    )
    number_fields = __import__(
        "sagejs._baselib.number_fields", fromlist=["NumberField"]
    )
    field = number_fields.NumberField(polynomial, field_payload["variable"])
    order = field.maximal_order()
    _require(
        context._order_fingerprint(field, order) == identity,
        "recomputed maximal order differs",
    )
    factor_base = []
    for portable in payload["factor_base"]:
        encoded = dict(portable)
        encoded["field_instance"] = prime_ideals._identity_token(field)
        encoded["order_instance"] = prime_ideals._identity_token(order)
        prime = prime_ideals.prime_ideal_from_dict(order, encoded)
        canonical = prime.to_dict()
        del canonical["field_instance"]
        del canonical["order_instance"]
        _require(canonical == portable, "prime payload is not canonical")
        _require(
            not any(prime == previous for previous in factor_base),
            "duplicate factor-base ideal",
        )
        factor_base.append(prime)
    _require(
        len(set(_json(p) for p in payload["factor_base"])) == len(factor_base),
        "duplicate factor-base prime",
    )
    records = [
        relations.RelationRecord.from_dict(record) for record in payload["relations"]
    ]
    cold = relations.FactorBaseIdealReconstructor(order, factor_base)
    for record in records:
        # Reject a false ideal equality before the existing verifier factors
        # its norm. The latter still runs independently, with no admission cache.
        _require(
            record._principal_from_witness(order) == cold.reconstruct(record.row),
            "relation principal ideal differs",
        )
        _require(
            record.verify(order, factor_base)["certified"] is True,
            "relation replay failed",
        )
    presentation = matrix.RelationPresentation.from_dict(payload["presentation"])
    _require(
        [row.dense() for row in presentation.relation_rows]
        == [list(record.row) for record in records],
        "presentation is not the verified relation lattice",
    )
    for encoded in payload["units"]:
        unit = FactoredNumberFieldElement.from_dict(field, encoded)
        _require(
            unit.principal_ideal(order) == order.ideal(1),
            "factored input is not a unit",
        )
    torsion = payload["torsion"]
    certificate = units.RootsOfUnityCertificate.from_dict(field, torsion["certificate"])
    generator = field._from_coefficients(
        [algebra.QQ(a) / b for a, b in certificate.generator_coordinates]
    )
    roots = [generator**exponent for exponent in range(torsion["order"])]
    result = units.RootsOfUnityResult(
        roots,
        generator,
        torsion["order"],
        True,
        "detached component replay",
        certificate,
    )
    _require(
        units.RootsOfUnityResult.verify(result, force_replay=True),
        "torsion replay failed",
    )
    return {
        "schema": "sagejs.number-fields/class-unit-component-report-v1",
        "component_only": True,
        "complete": False,
        "pending": ["class_generation", "analytic_index", "unit_lattice_completeness"],
        "source_proof_status_claim": payload["source_proof_status"],
        "source_proof_status_verified": False,
        "content_sha256": payload["content_sha256"],
        "maximal_order": "recomputed by exact service and compared",
        "factor_base_primes_verified": len(factor_base),
        "relations_verified": len(records),
        "presentation_rank": presentation.rank,
        "presentation_columns": presentation.column_count,
        "relation_quotient_invariants": list(presentation.invariants),
        "unit_memberships_verified": len(payload["units"]),
        "torsion_order_verified": torsion["order"],
    }
