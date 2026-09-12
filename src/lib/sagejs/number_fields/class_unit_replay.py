"""Strict detached components and bounded conditional completeness replay.

This adapter reconstructs exact objects through existing mathematical services.
It neither resumes a producer nor grants a class/unit computation or map token.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sagejs.number_fields._class_unit_replay_data import (
    ComponentReplayResourceError,
    _integer,
    _keys,
    _list,
    _rational,
    _require,
    _vector,
    preflight_field_order_primes,
    reconstruct_field_order_primes,
)

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


def _decode(text: str, *, proof_scalars: bool = False) -> dict[str, Any]:
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
        elif proof_scalars and (type(item) is bool or item is None):
            continue
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
    primes = payload["factor_base"]
    degree = preflight_field_order_primes(
        identity, primes, max_degree=4, max_base=MAX_FACTORS, max_prime=1000
    )
    field = identity["field"]
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


def _component_claim_source(
    source: Any, *, resumed_copy: bool = False
) -> tuple[Any, Any, Any]:
    """Bound standard producer claims without granting completeness authority."""
    from sagejs.number_fields import class_group_matrix as matrix
    from sagejs.number_fields import class_group_relations as relations
    from sagejs.number_fields import class_unit_analytic as analytic
    from sagejs.number_fields import class_unit_context as context
    from sagejs.number_fields import class_unit_groups as groups
    from sagejs.number_fields import prime_ideals
    from sagejs.number_fields import units as unit_support
    from sagejs.number_fields.factored_elements import FactoredNumberFieldElement

    if (
        type(source) is not groups.ClassUnitComputation
        or source.complete is not True
        or type(source.context) is not context.ClassUnitGroupContext
        or source.context.field is not source.field
        or source.context.order.number_field() is not source.field
        or type(source._unit_group) is not groups.UnitGroupComputation
        or source._unit_group.complete is not True
        or type(source.saturation_record) is not groups.ClassUnitSaturationRecord
        or source._unit_group._completion_evidence is not source.saturation_record
        or type(source.saturation_record._analytic_certificate)
        is not analytic.UnitSaturationIndexCertificate
        or type(source._unit_group.torsion) is not unit_support.RootsOfUnityResult
        or type(source._unit_group.torsion.certificate)
        is not unit_support.RootsOfUnityCertificate
        or type(source.conditional_presentation_evidence)
        is not matrix.RelationPresentation
    ):
        raise ComponentReplayCapabilityError(
            "component claims require standard generic terminal objects"
        )
    units = source._unit_group
    presentation = source.conditional_presentation_evidence
    if (
        not 2 <= int(source.field.degree()) <= 4
        or len(source.conditional_factor_base) > 32
        or len(source.conditional_relation_records) > MAX_RELATIONS
        or len(units.generators) > 3
        or len(units.torsion.elements) > 12
        or presentation.column_count > 32
        or len(presentation.relation_rows) > MAX_RELATIONS
        or any(len(row.entries) > 32 for row in presentation.relation_rows)
    ):
        raise ComponentReplayResourceError("producer components exceed replay limits")
    for prime in source.conditional_factor_base:
        _require(
            type(prime) is prime_ideals.NumberFieldPrimeIdeal, "nonstandard prime claim"
        )
    for rows in (
        presentation.hnf,
        presentation.hnf_left_transform,
        presentation.smith,
        presentation.smith_left_transform,
        presentation.smith_right_transform,
        presentation.smith_right_inverse,
    ):
        if len(rows) > MAX_RELATIONS or any(len(row) > MAX_RELATIONS for row in rows):
            raise ComponentReplayResourceError("presentation claim exceeds row limits")
    for record in source.conditional_relation_records:
        _require(type(record) is relations.RelationRecord, "nonstandard relation claim")
        if max(len(record.row), len(record.quotient_row), len(record.source_row)) > 32:
            raise ComponentReplayResourceError("relation claim exceeds row limit")
    for unit in units.generators:
        _require(
            type(unit) is FactoredNumberFieldElement and unit.field() is source.field,
            "nonstandard unit claim",
        )
        if len(unit.factors()) > MAX_FACTORS:
            raise ComponentReplayResourceError("unit claim exceeds factor limit")
    if resumed_copy:
        _preflight_resumed_copy(source)
    return source.context.order, units, source.saturation_record


def _terminal_component_body(source: Any) -> dict[str, Any]:
    """Copy bounded claim data; this body alone grants no authority."""
    from sagejs.number_fields import class_unit_context as context

    order, units, _ = _component_claim_source(source)
    primes = []
    for prime in source.conditional_factor_base:
        payload = prime.to_dict()
        del payload["field_instance"]
        del payload["order_instance"]
        primes.append(payload)
    records = []
    for record in source.conditional_relation_records:
        # Do not first copy discarded producer logs or provenance. Only these
        # exact claim fields enter the existing component envelope.
        records.append(
            {
                "schema": "sagejs.number-fields/class-relation-v2",
                "row": list(record.row),
                "source_row": list(record.source_row),
                "quotient_row": list(record.quotient_row),
                "witness": record.witness,
                "norm_smoothness": record.norm_smoothness,
                "provenance": {},
                "archimedean": {
                    "precision": 0,
                    "logs": [],
                    "complex_place_convention": "one-place-log-absolute-value-times-two",
                },
            }
        )
    return {
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


def _terminal_component_claims(source: Any) -> str:
    """Serialize claims only; callers establish live or fresh replay authority."""
    body = _terminal_component_body(source)
    body["content_sha256"] = _hash(body)
    text = _json(body)
    _preflight(_decode(text))
    return text


def export_terminal_components(source: Any) -> str:
    """Export recognized live components, without exporting their authority."""
    from sagejs.number_fields import class_unit_groups as groups
    from sagejs.number_fields.unit_coordinates import _recognized_authority

    _, _, evidence = _recognized_authority(source)
    if type(evidence) is not groups.ClassUnitSaturationRecord:
        raise ComponentReplayCapabilityError(
            "specialized terminal export is unsupported"
        )
    text = _terminal_component_claims(source)
    _recognized_authority(source)
    return text


def _preflight_resumed_copy(source: Any) -> None:
    """Bound caller-reachable data before the resumed path copies it to JSON.

    This is a representation guard, not a mathematical verifier. Existing
    decoded-envelope preflight and fresh exact replay remain mandatory.
    """
    order, units, evidence = (
        source.context.order,
        source._unit_group,
        source.saturation_record,
    )
    degree = int(source.field.degree())
    certificate = evidence._analytic_certificate
    body = certificate._body_snapshot
    _require(
        type(body) is dict
        and certificate._configuration is body.get("configuration")
        and certificate._analytic_proof is body.get("analytic_proof")
        and certificate._index_bound == body.get("index_bound"),
        "analytic claim aliases changed",
    )
    rows = [order._basis_rows] + [p._basis_rows for p in source.conditional_factor_base]
    if len(source.field._defining_coefficients) != degree + 1 or any(
        len(matrix) != degree or any(len(row) != degree for row in matrix)
        for matrix in rows
    ):
        raise ComponentReplayResourceError(
            "source field/order dimensions exceed policy"
        )
    for row in [source.field._defining_coefficients] + [
        row for matrix in rows for row in matrix
    ]:
        if any(
            max(abs(int(c._numerator)).bit_length(), int(c._denominator).bit_length())
            > 4096
            for c in row
        ):
            raise ComponentReplayResourceError(
                "source field/order coefficient exceeds policy"
            )
    state = source.context.proof_state
    presentation = source.conditional_presentation_evidence
    raw = [
        state._evidence,
        state.reason,
        state.factor_base_theorem,
        state.factor_base_bound,
        state.assumptions,
        body,
        source.field.variable_name(),
        int(order.discriminant()),
        units.torsion.certificate._payload_tuple(),
        units.torsion.order,
        units.torsion.complete,
        presentation.column_count,
        presentation.backend,
        presentation.hnf,
        presentation.hnf_left_transform,
        presentation.smith,
        presentation.smith_left_transform,
        presentation.smith_right_transform,
        presentation.smith_right_inverse,
    ]
    raw.extend([row.column_count, row.entries] for row in presentation.relation_rows)
    raw.extend(
        [r.row, r.source_row, r.quotient_row, r.witness, r.norm_smoothness]
        for r in source.conditional_relation_records
    )
    for prime in source.conditional_factor_base:
        _require(prime.ring() is order, "source prime order differs")
        if prime._residue_presentation is None:
            raise ComponentReplayCapabilityError(
                "resumed prime lacks retained residue data"
            )
        raw.append(
            [
                prime._residue_presentation,
                prime._rational_prime,
                prime._ramification_index,
                prime._residue_degree,
            ]
        )
    elements = list(units.torsion.elements) + [units.torsion.generator]
    for unit in units.generators:
        for factor, exponent in unit.factors():
            raw.append(exponent)
            elements.append(factor)
    for element in elements:
        _require(element.parent() is source.field, "source element field differs")
        # Ordinary elements trim trailing zero coefficients; list() pads them.
        if len(element._coefficients) > degree:
            raise ComponentReplayResourceError(
                "source element dimensions exceed policy"
            )
        for c in element._coefficients:
            raw.extend([int(c._numerator), int(c._denominator)])
    _bounded_claim_tree(raw)


def _bounded_claim_tree(raw: Any) -> None:
    """Conservatively bound JSON representation before copying/stringifying it."""
    # Breadth and depth checks precede expansion of the traversal stack. Tuples
    # are admitted here only as the producer representation of JSON arrays.
    pending: list[tuple[Any, int]] = [(raw, 0)]
    nodes = 0
    encoded_bytes = 0
    while pending:
        value, depth = pending.pop()
        nodes += 1
        if nodes > MAX_NODES or depth > MAX_DEPTH:
            raise ComponentReplayResourceError("source claim tree exceeds policy")
        if type(value) in (list, tuple, dict):
            maximum = 64 if type(value) is dict else 1024
            if len(value) > maximum:
                raise ComponentReplayResourceError(
                    "source claim container exceeds policy"
                )
            if type(value) is dict:
                _require(
                    all(type(k) is str and len(k) <= 128 for k in value),
                    "invalid claim key",
                )
                encoded_bytes += sum(12 * len(k) + 3 for k in value)
                values = value.values()
            else:
                values = value
            encoded_bytes += 2 + max(0, len(value) - 1)
            pending.extend((child, depth + 1) for child in values)
        elif type(value) is int:
            bits = abs(value).bit_length()
            if bits > 4096:
                raise ComponentReplayResourceError(
                    "source claim integer exceeds policy"
                )
            encoded_bytes += 2 + bits * 30103 // 100000
        elif type(value) is str:
            if len(value) > 4096:
                raise ComponentReplayResourceError("source claim string exceeds policy")
            # A non-BMP code point can require two JSON Unicode escapes.
            encoded_bytes += 2 + 12 * len(value)
        else:
            _require(
                value is None or type(value) is bool, "unsupported source claim value"
            )
            encoded_bytes += 5
        if encoded_bytes > MAX_BYTES:
            raise ComponentReplayResourceError(
                "source claim encoded size exceeds policy"
            )


def replay_terminal_components(text: str) -> dict[str, Any]:
    """Independently check components; never issue terminal completeness."""
    payload = _decode(text)
    _preflight(payload)
    _, _, factor_base, presentation, decoded_units, _ = _replay_component_payload(
        payload
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
        "relations_verified": len(payload["relations"]),
        "presentation_rank": presentation.rank,
        "presentation_columns": presentation.column_count,
        "relation_quotient_invariants": list(presentation.invariants),
        "unit_memberships_verified": len(decoded_units),
        "torsion_order_verified": payload["torsion"]["order"],
    }


def _replay_component_payload(payload: dict[str, Any]) -> tuple[Any, ...]:
    """Own fresh exact objects after the caller's bounded schema preflight."""
    from sagejs.number_fields import class_group_matrix as matrix
    from sagejs.number_fields import class_group_relations as relations
    from sagejs.number_fields import units
    from sagejs.number_fields.factored_elements import FactoredNumberFieldElement

    field, order, factor_base = reconstruct_field_order_primes(
        payload["field_order"], payload["factor_base"]
    )
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
    decoded_units = []
    for encoded in payload["units"]:
        unit = FactoredNumberFieldElement.from_dict(field, encoded)
        _require(
            unit.principal_ideal(order) == order.ideal(1),
            "factored input is not a unit",
        )
        decoded_units.append(unit)
    torsion = payload["torsion"]
    certificate = units.RootsOfUnityCertificate.from_dict(field, torsion["certificate"])
    algebra = __import__("sagejs._baselib.algebra", fromlist=["QQ"])
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
    return field, order, factor_base, presentation, decoded_units, result


COMPLETION_SCHEMA = "sagejs.number-fields/class-unit-conditional-completion-v1"
BDF_COMPLETION_SCHEMA = "sagejs.number-fields/class-unit-conditional-completion-v2"
COMPACT_INDEX_SCHEMA = "sagejs.number-fields/compact-bf-index-v1"


def _sealed(body: dict[str, Any]) -> dict[str, Any]:
    result = dict(body)
    result["content_sha256"] = _hash(body)
    return result


def _preflight_completion(payload: dict[str, Any]) -> None:
    bdf = payload.get("schema") == BDF_COMPLETION_SCHEMA
    _keys(
        payload,
        "schema components generation analytic content_sha256"
        + (" assumptions" if bdf else ""),
    )
    _require(
        payload["schema"] in (COMPLETION_SCHEMA, BDF_COMPLETION_SCHEMA),
        "unknown completion schema",
    )
    body = dict(payload)
    digest = body.pop("content_sha256")
    _require(type(digest) is str and _hash(body) == digest, "completion hash mismatch")
    components = _decode(_json(payload["components"]))
    _preflight(components)
    from sagejs.number_fields import class_unit_generation_replay as generation
    from sagejs.number_fields.class_group_proof_contracts import (
        BDF_CLASS_CHARACTER_GRH,
        BELABAS_FRIEDMAN_ZETA_GRH,
    )

    generation_payload = _decode(_json(payload["generation"]))
    generation._preflight(generation_payload)
    _require(
        generation_payload["schema"]
        == (generation.BDF_SCHEMA if bdf else generation.SCHEMA),
        "completion and generation versions differ",
    )
    if bdf:
        _require(
            payload["assumptions"]
            == sorted([BDF_CLASS_CHARACTER_GRH, BELABAS_FRIEDMAN_ZETA_GRH]),
            "conditional theorem hypotheses differ",
        )
    _require(
        generation_payload["field_order"] == components["field_order"]
        and generation_payload["factor_base"] == components["factor_base"],
        "generation is not bound to the ordered component base",
    )
    analytic = payload["analytic"]
    _keys(
        analytic,
        "schema components_sha256 generation_sha256 configuration index_bound analytic_proof",
    )
    _require(
        analytic["schema"] == COMPACT_INDEX_SCHEMA
        and analytic["components_sha256"] == components["content_sha256"]
        and analytic["generation_sha256"] == generation_payload["content_sha256"],
        "compact analytic binding differs",
    )
    _require(
        type(analytic["index_bound"]) is int and analytic["index_bound"] == 1,
        "compact completion requires an index-one claim",
    )
    configuration = analytic["configuration"]
    _keys(
        configuration,
        "signature class_number roots_of_unity hr_precision_bits regulator zeta",
    )
    signature = _list(configuration["signature"], 2)
    _require(len(signature) == 2, "invalid analytic signature")
    for value in signature:
        _integer(value, 4)
    _require(
        signature[0] + 2 * signature[1] == components["field_order"]["field"]["degree"]
        and signature[0] + signature[1] - 1 == len(components["units"]),
        "analytic degree or free-unit count differs",
    )
    _integer(configuration["class_number"], (1 << 4096) - 1, minimum=1)
    _integer(configuration["roots_of_unity"], 12, minimum=1)
    _require(
        configuration["roots_of_unity"] == components["torsion"]["order"],
        "analytic torsion differs",
    )
    regulator = configuration["regulator"]
    _keys(regulator, "precision_bits absolute_tolerance_bits maximum_precision_bits")
    zeta = configuration["zeta"]
    _keys(zeta, "absolute_error absolute_error_history precision_bits limits")
    limits = zeta["limits"]
    _keys(
        limits,
        "maximum_prime_bound maximum_degree splitting_block_size maximum_precision_bits",
    )
    history = _list(zeta["absolute_error_history"], 32)
    for value in [zeta["absolute_error"]] + history:
        _require(type(value) is str, "analytic error must be an exact rational string")
        parts = value.split("/")
        _require(
            len(parts) in (1, 2) and all(part.isdigit() for part in parts),
            "invalid analytic rational",
        )
        pair = [
            _parse_integer(parts[0]),
            _parse_integer(parts[1]) if len(parts) == 2 else 1,
        ]
        _rational(pair, 4096)
        _require(pair[0] > 0, "analytic error must be positive")
    from sagejs.number_fields import class_unit_analytic

    # The existing verifier owns all analytic precision and prime-work limits,
    # including exact JSON-integer checks. Do not duplicate or widen its policy.
    class_unit_analytic._unit_index_replay_parameters(configuration)
    _keys(
        analytic["analytic_proof"],
        "regulator zeta_log_residue hr_index zeta_absolute_error_history",
    )


def export_conditional_class_unit(
    source: Any, *, generation_theorem: str = "minkowski"
) -> str:
    """Bind compact terminal claims for independent conditional replay.

    This format is distinct from the ordinary-coordinate v1 index certificate.
    Export does not establish detached completeness; the receiver rechecks it.
    Explicit `generation_theorem="bdf"` emits v2 with both named hypotheses.
    """
    from sagejs.number_fields.unit_coordinates import _recognized_authority

    _recognized_authority(source)
    text = _conditional_completion_claims(source, generation_theorem=generation_theorem)
    _recognized_authority(source)
    return text


def _conditional_completion_claims(source: Any, *, generation_theorem: str) -> str:
    """Copy bounded terminal claims without calling a producer verifier."""
    _require(
        generation_theorem in ("minkowski", "bdf"),
        "unsupported generation theorem",
    )
    from sagejs.number_fields import class_group_factor_base as bases
    from sagejs.number_fields import class_unit_generation_replay as generation
    from sagejs.number_fields.class_group_proof_contracts import (
        BDF_CLASS_CHARACTER_GRH,
        BELABAS_FRIEDMAN_ZETA_GRH,
    )

    components = _decode(_terminal_component_claims(source))
    order, _, evidence = _component_claim_source(source)
    bdf = generation_theorem == "bdf"
    generation_body: dict[str, Any] = {
        "schema": generation.BDF_SCHEMA if bdf else generation.SCHEMA,
        "field_order": components["field_order"],
        "factor_base": components["factor_base"],
    }
    if bdf:
        generation_body.update(
            {
                "theorem": "bdf",
                "assumptions": [BDF_CLASS_CHARACTER_GRH],
                "claimed_bound": bases.bdf_bound(
                    order, max_bound=generation.MAX_BOUND
                ).bound,
            }
        )
    else:
        generation_body["claimed_minkowski_bound"] = bases.minkowski_bound(order).bound
    generating_base = _sealed(generation_body)
    certificate = evidence._analytic_certificate
    analytic = {
        "schema": COMPACT_INDEX_SCHEMA,
        "components_sha256": components["content_sha256"],
        "generation_sha256": generating_base["content_sha256"],
        "configuration": certificate.configuration,
        "index_bound": certificate.index_bound,
        "analytic_proof": certificate.analytic_proof,
    }
    body: dict[str, Any] = {
        "schema": BDF_COMPLETION_SCHEMA if bdf else COMPLETION_SCHEMA,
        "components": components,
        "generation": generating_base,
        "analytic": analytic,
    }
    if bdf:
        body["assumptions"] = sorted(
            [BDF_CLASS_CHARACTER_GRH, BELABAS_FRIEDMAN_ZETA_GRH]
        )
    text = _json(_sealed(body))
    _preflight_completion(_decode(text, proof_scalars=True))
    return text


def replay_conditional_class_unit(text: str) -> dict[str, Any]:
    """Prove bounded completeness under the envelope's explicit hypotheses.

    Returns detached evidence only, never a producer context or map token.
    Every exact and analytic check is recomputed on verifier-owned objects.
    """
    return _replay_conditional_owned(text)[-1]


def _replay_conditional_owned(text: str) -> tuple[Any, ...]:
    """Keep fresh verified objects private for existing bounded consumers.

    Only this full replay issues the return value. No producer object, callback,
    success report, or restored authority token is accepted as input.
    """
    payload = _decode(text, proof_scalars=True)
    _preflight_completion(payload)
    components = payload["components"]
    field, order, factor_base, presentation, units, torsion = _replay_component_payload(
        components
    )
    from sagejs.number_fields import class_unit_analytic as analytic
    from sagejs.number_fields import class_unit_generation_replay as generation
    from sagejs.number_fields.class_group_proof_contracts import (
        BELABAS_FRIEDMAN_ZETA_GRH,
        analytic_class_unit_assumptions,
    )

    checked_generation = generation._check_generating_base(
        payload["generation"], field, order, factor_base
    )
    if checked_generation["status"] == "resource-limit":
        raise ComponentReplayResourceError("generating-base replay exceeded its policy")
    bdf = payload["schema"] == BDF_COMPLETION_SCHEMA
    assumptions = list(
        analytic_class_unit_assumptions(
            checked_generation["bound_evidence"]["theorem"],
            tuple(checked_generation["assumptions"]),
        )
    )
    _require(
        assumptions == (payload["assumptions"] if bdf else [BELABAS_FRIEDMAN_ZETA_GRH]),
        "fresh completion hypotheses differ",
    )
    _require(
        checked_generation["generation_verified"] is True,
        "factor-base generation was not established",
    )
    _require(
        presentation.rank == len(factor_base) and presentation.order is not None,
        "relation quotient is not finite",
    )
    binding = payload["analytic"]
    configuration = binding["configuration"]
    _require(
        configuration["class_number"] == presentation.order,
        "analytic h-prime differs from verified relation quotient",
    )
    _require(
        configuration["roots_of_unity"] == torsion.order,
        "analytic torsion differs from exact replay",
    )
    index, proof = analytic._compute_unit_index_proof(
        field, order, units, configuration, workspace=None
    )
    _require(
        index == 1 and proof == binding["analytic_proof"],
        "fresh compact BF proof is not the claimed index one",
    )
    report = {
        "schema": "sagejs.number-fields/class-unit-conditional-report-v2"
        if bdf
        else "sagejs.number-fields/class-unit-conditional-report-v1",
        "complete": True,
        "proof_status": "exact-relations-conditional-grh",
        "assumptions": assumptions,
        "content_sha256": payload["content_sha256"],
        "field_order": components["field_order"],
        "class_number": presentation.order,
        "class_invariants": list(presentation.invariants),
        "free_unit_rank": len(units),
        "torsion_order": torsion.order,
        "analytic_index": index,
        "regulator": proof["regulator"],
        "generation": checked_generation,
        "live_context_authority": False,
    }
    return field, order, tuple(units), torsion, report
