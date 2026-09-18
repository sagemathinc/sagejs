"""Exact bounded factor/reduce/combine map for fresh prepared row 14.

This is deliberately a *bounded map boundary*, not the missing public ideal
class map.  It proves that the retained row-14 owners already suffice for all
three mathematical operations on one nontrivial, explicitly described domain:

* factor one retained active factor-base ideal by exact HNF identity;
* reduce ``P * (beta)`` by a deterministic search over the active class primes
  and a small canonical coefficient box; and
* combine retained principal relations as a factored principal witness.

The reduction receipt uses the convention of ``_EngineClassGroup``:
``(beta) = I * Q``.  Hence ``Q`` has exponent ``-1`` at the recovered prime and
the ambient class row is its negation.  Exact cancellation is justified by the
checked equality ``I = P * (beta)`` in the group of invertible ideals.

The input is only the neutral result payload produced by the fresh prepared
transaction.  No PARI process, frozen answer, or reserve artifact is consulted.
General arbitrary-ideal factorization and unbounded reduction remain explicitly
outside this boundary.
"""

from __future__ import annotations

import hashlib
import itertools
import json
from collections.abc import Mapping, Sequence
from typing import Any


SCHEMA = "sagejs.pari-class-group/row14-bounded-ideal-maps-v1"
FIELD_ID = (
    "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413"
)
DEGREE = 4
ROWS = 799
RELATIONS = 806
PRESENTATION = (24, 0, 0, 4, 4, 0, 5, 3, 2)
SOURCE_GENERATOR_ORDERS = (24, 8)
SOURCE_GENERATOR_ROWS = ((1, 0, 0), (-2, -1, -1))
EXPECTED_ACTIVE_ROWS = (692, 767, 796)
REDUCTION_RADIUS = 2


class Row14IdealMapFailure(ArithmeticError):
    """The bounded row-14 ideal-map boundary failed exact replay."""


def _canonical(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("ascii")


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _integers(value: Any, length: int, label: str) -> tuple[int, ...]:
    if not isinstance(value, list) or len(value) != length:
        raise Row14IdealMapFailure(label + " has the wrong shape")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row14IdealMapFailure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Row14IdealMapFailure(label + " is not canonical")
        result.append(number)
    return tuple(result)


def _owners(payload: Mapping[str, Any]) -> dict[str, tuple[int, ...]]:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise Row14IdealMapFailure("retained storage is absent")
    owners: dict[str, tuple[int, ...]] = {}
    for item in storage:
        if not isinstance(item, Mapping) or not isinstance(item.get("name"), str):
            raise Row14IdealMapFailure("a retained owner is malformed")
        name = item["name"]
        entries = item.get("entries")
        if name in owners or not isinstance(entries, list):
            raise Row14IdealMapFailure("a retained owner is duplicate or malformed")
        owners[name] = _integers(entries, len(entries), name)
        if item.get("logicalLength") != str(len(entries)):
            raise Row14IdealMapFailure(name + " logical length changed")
    return owners


def _arithmetic() -> Any:
    import importlib

    return importlib.import_module(
        "bench.pari-class-group-port.field3_relation_replay_map"
    )


def _detached_replay(payload: Mapping[str, Any]) -> dict[str, Any]:
    import importlib

    replay = importlib.import_module(
        "bench.pari-class-group-port.independent_rich_quartic_class_replay"
    )
    try:
        result = replay.replay_rich_quartic_class(payload)
    except replay.RichQuarticClassReplayFailure as error:
        raise Row14IdealMapFailure("detached row-14 owner replay failed") from error
    expected = {
        "classNumber": 192,
        "factorBaseSize": ROWS,
        "generatorCount": 2,
        "invariantFactors": [8, 24],
        "presentationColumns": 3,
        "principalRelationsReplayed": RELATIONS,
        "relationCount": RELATIONS,
    }
    if any(result.get(key) != value for key, value in expected.items()):
        raise Row14IdealMapFailure("detached row-14 replay summary changed")
    if result.get("missingOwners") != []:
        raise Row14IdealMapFailure("principal relation replay has missing owners")
    return result


def _decode(payload: Mapping[str, Any]) -> dict[str, Any]:
    field = payload.get("field")
    group = payload.get("classGroup")
    terminal = payload.get("terminal")
    if (
        not isinstance(field, Mapping)
        or field.get("id") != FIELD_ID
        or field.get("degree") != "4"
        or field.get("definingPolynomialAscending")
        != ["-200000002", "-200000002", "0", "0", "1"]
        or not isinstance(group, Mapping)
        or group.get("classNumber") != "192"
        or group.get("invariantFactors") != ["8", "24"]
        or not isinstance(terminal, Mapping)
        or terminal.get("correspondence_complete") is not True
        or terminal.get("public_complete") is not False
    ):
        raise Row14IdealMapFailure("wrong row-14 neutral result")
    replay = _detached_replay(payload)
    owners = _owners(payload)
    required = {
        "class-presentation": 9,
        "factor-base-ideals": ROWS * 16,
        "factor-map": ROWS * 3,
        "field-multiplication-table": 64,
        "principal-generators": RELATIONS * DEGREE,
        "raw-relation-records": RELATIONS * ROWS,
    }
    for name, length in required.items():
        if len(owners.get(name, ())) != length:
            raise Row14IdealMapFailure(name + " is absent or has the wrong shape")
    if owners["class-presentation"] != PRESENTATION:
        raise Row14IdealMapFailure("class presentation changed")
    factor_map = owners["factor-map"]
    active: list[int] = []
    for column in range(3):
        vector = factor_map[column * ROWS : (column + 1) * ROWS]
        support = [index for index, value in enumerate(vector) if value]
        if len(support) != 1 or vector[support[0]] != 1:
            raise Row14IdealMapFailure("factor map is not a unit embedding")
        active.append(support[0])
    if tuple(active) != EXPECTED_ACTIVE_ROWS:
        raise Row14IdealMapFailure("active factor-map rows changed")
    ideals = tuple(
        owners["factor-base-ideals"][16 * index : 16 * (index + 1)]
        for index in range(ROWS)
    )
    return {
        "active": tuple(active),
        "factor_base": ideals,
        "generators": tuple(
            owners["principal-generators"][4 * index : 4 * (index + 1)]
            for index in range(RELATIONS)
        ),
        "owners": owners,
        "replay": replay,
        "table": owners["field-multiplication-table"],
    }


def _identity() -> tuple[int, ...]:
    return (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)


def _factor_active_ideal(
    ideal: Sequence[int], decoded: Mapping[str, Any]
) -> tuple[int, ...]:
    candidate = tuple(int(value) for value in ideal)
    if len(candidate) != 16:
        raise Row14IdealMapFailure("factor input is not a quartic ideal HNF")
    matches = [
        index
        for index in decoded["active"]
        if decoded["factor_base"][index] == candidate
    ]
    if len(matches) != 1:
        raise Row14IdealMapFailure(
            "ideal is outside the bounded active-prime factor domain"
        )
    row = [0] * ROWS
    row[matches[0]] = 1
    if decoded["factor_base"][matches[0]] != candidate:
        raise Row14IdealMapFailure("factor reconstruction failed")
    return tuple(row)


def _canonical_elements(radius: int) -> tuple[tuple[int, ...], ...]:
    result = []
    for value in itertools.product(range(-radius, radius + 1), repeat=DEGREE):
        if not any(value):
            continue
        first = next(entry for entry in value if entry)
        if first > 0:
            result.append(value)
    return tuple(result)


def _reduce_active_principal_multiple(
    ideal: Sequence[int], decoded: Mapping[str, Any]
) -> tuple[tuple[int, ...], tuple[int, ...], int]:
    arithmetic = _arithmetic()
    candidate = tuple(int(value) for value in ideal)
    if len(candidate) != 16:
        raise Row14IdealMapFailure("reduction input is not a quartic ideal HNF")
    matches: list[tuple[int, tuple[int, ...]]] = []
    for position in decoded["active"]:
        prime = decoded["factor_base"][position]
        for beta in _canonical_elements(REDUCTION_RADIUS):
            principal = arithmetic._principal_hnf(beta, decoded["table"])
            if (
                arithmetic._quartic_product(prime, principal, decoded["table"])
                == candidate
            ):
                matches.append((position, beta))
    if len(matches) != 1:
        raise Row14IdealMapFailure(
            "ideal has no unique decomposition in the bounded reduction domain"
        )
    position, beta = matches[0]
    principal = arithmetic._principal_hnf(beta, decoded["table"])
    if (
        arithmetic._quartic_product(
            decoded["factor_base"][position], principal, decoded["table"]
        )
        != candidate
    ):
        raise Row14IdealMapFailure("reduction witness failed exact ideal replay")
    quotient = [0] * ROWS
    quotient[position] = -1
    return tuple(quotient), beta, position


def _presentation_coordinates(target: Sequence[int]) -> tuple[int, int, int] | None:
    value = tuple(int(entry) for entry in target)
    x2, remainder = divmod(value[2], PRESENTATION[8])
    if remainder:
        return None
    remainder1 = value[1] - PRESENTATION[7] * x2
    x1, remainder = divmod(remainder1, PRESENTATION[4])
    if remainder:
        return None
    remainder0 = value[0] - PRESENTATION[3] * x1 - PRESENTATION[6] * x2
    x0, remainder = divmod(remainder0, PRESENTATION[0])
    if remainder:
        return None
    return (x0, x1, x2)


def _class_coordinates(row: Sequence[int], active: Sequence[int]) -> tuple[int, int]:
    ambient = tuple(int(row[index]) for index in active)
    matches: list[tuple[int, int]] = []
    for order24 in range(24):
        for order8 in range(8):
            delta = tuple(
                ambient[index]
                - order24 * SOURCE_GENERATOR_ROWS[0][index]
                - order8 * SOURCE_GENERATOR_ROWS[1][index]
                for index in range(3)
            )
            if _presentation_coordinates(delta) is not None:
                matches.append((order24, order8))
    if len(matches) != 1:
        raise Row14IdealMapFailure("class-coordinate solution is not unique")
    source = matches[0]
    # Public invariant order is normalized (8,24), whereas the retained source
    # generator order is (24,8).
    return (source[1], source[0])


def _combine_relations(
    coefficients: Sequence[int], decoded: Mapping[str, Any]
) -> dict[str, Any]:
    values = tuple(int(value) for value in coefficients)
    if len(values) != RELATIONS or any(value < 0 or value > 2 for value in values):
        raise Row14IdealMapFailure("coefficients left the bounded combine domain")
    if not any(values) or sum(values) > 4:
        raise Row14IdealMapFailure("combine support is empty or too large")
    arithmetic = _arithmetic()
    records = decoded["owners"]["raw-relation-records"]
    ambient = [0] * ROWS
    left = _identity()
    right = _identity()
    terms: list[dict[str, Any]] = []
    for relation, coefficient in enumerate(values):
        if coefficient == 0:
            continue
        row = records[relation * ROWS : (relation + 1) * ROWS]
        alpha = decoded["generators"][relation]
        for _ in range(coefficient):
            for position, exponent in enumerate(row):
                ambient[position] += exponent
                for _power in range(exponent):
                    left = arithmetic._quartic_product(
                        left, decoded["factor_base"][position], decoded["table"]
                    )
            right = arithmetic._quartic_product(
                right,
                arithmetic._principal_hnf(alpha, decoded["table"]),
                decoded["table"],
            )
        terms.append(
            {
                "coefficient": str(coefficient),
                "principalGenerator": [str(value) for value in alpha],
                "relation": str(relation),
            }
        )
    if left != right:
        raise Row14IdealMapFailure("combined principal relation failed exact replay")
    return {
        "ambientSupport": [
            [str(index), str(value)] for index, value in enumerate(ambient) if value
        ],
        "principalIdealHnf": [str(value) for value in right],
        "terms": terms,
    }


def build_row14_bounded_map_receipt(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Build and independently replay one exact three-operation map receipt."""
    decoded = _decode(payload)
    arithmetic = _arithmetic()
    factor_position = decoded["active"][0]
    factor_ideal = decoded["factor_base"][factor_position]
    factor_row = _factor_active_ideal(factor_ideal, decoded)

    beta = (0, 0, 0, 1)
    arbitrary = arithmetic._quartic_product(
        factor_ideal,
        arithmetic._principal_hnf(beta, decoded["table"]),
        decoded["table"],
    )
    # The chosen beta has a genuinely nontrivial principal ideal, so this is
    # not merely the direct factor probe under a different element name.
    if arbitrary == factor_ideal:
        raise Row14IdealMapFailure("reduction probe collapsed to direct factoring")
    quotient_row, recovered_beta, recovered_position = (
        _reduce_active_principal_multiple(arbitrary, decoded)
    )
    ambient_row = tuple(-value for value in quotient_row)
    if recovered_beta != beta or recovered_position != factor_position:
        raise Row14IdealMapFailure("bounded reduction recovered different material")
    coordinates = _class_coordinates(ambient_row, decoded["active"])
    direct_coordinates = _class_coordinates(factor_row, decoded["active"])
    if coordinates != direct_coordinates or coordinates != (0, 1):
        raise Row14IdealMapFailure("factor/reduce class coordinates disagree")

    coefficients = [0] * RELATIONS
    coefficients[0] = 1
    coefficients[1] = 1
    combined = _combine_relations(coefficients, decoded)
    body = {
        "schema": SCHEMA,
        "fieldId": FIELD_ID,
        "scope": {
            "factor": "exact retained active-prime HNF lookup",
            "reduce": "active prime times a principal ideal from canonical radius-2 search",
            "combine": "nonnegative retained-relation combinations with coefficient <=2 and total <=4",
            "generalArbitraryIdealMapReady": False,
        },
        "source": {
            "neutralPayloadSha256": _sha256(payload),
            "factorBaseSize": str(ROWS),
            "relationsReplayed": str(decoded["replay"]["principalRelationsReplayed"]),
            "principalIdealMultiplications": str(
                decoded["replay"]["principalIdealMultiplications"]
            ),
        },
        "factor": {
            "inputIdealHnf": [str(value) for value in factor_ideal],
            "rowSupport": [[str(factor_position), "1"]],
            "classCoordinatesNormalized": [str(value) for value in direct_coordinates],
            "exactReconstruction": True,
        },
        "reduce": {
            "inputIdealHnf": [str(value) for value in arbitrary],
            "quotientRowSupport": [[str(factor_position), "-1"]],
            "ambientClassRowSupport": [[str(factor_position), "1"]],
            "principalGenerator": [str(value) for value in recovered_beta],
            "classCoordinatesNormalized": [str(value) for value in coordinates],
            "exactIdentity": "input = factor-base-prime * (principal-generator)",
            "exactReconstruction": True,
        },
        "combine": combined,
        "roundTrip": {
            "factorAndReductionCoordinatesAgree": True,
            "reducedRepresentativeHnf": [str(value) for value in factor_ideal],
            "principalQuotientReconstructsInput": True,
            "combinedRelationsArePrincipal": True,
        },
        "missingForGeneralMap": [
            "arbitrary-ideal valuation/factorization owner",
            "unbounded deterministic reduction/search owner",
            "signed factor-base inverse and denominator/scaling replay",
            "full Smith coordinate and relation-combination transforms",
        ],
        "qualifiedTiming": False,
    }
    return {**body, "contentSha256": _sha256(body)}


def verify_row14_bounded_map_receipt(
    payload: Mapping[str, Any], receipt: Mapping[str, Any]
) -> dict[str, Any]:
    """Recompute the bounded receipt and reject every byte-level difference."""
    if not isinstance(receipt, Mapping):
        raise Row14IdealMapFailure("map receipt is absent")
    body = dict(receipt)
    claimed = body.pop("contentSha256", None)
    if claimed != _sha256(body):
        raise Row14IdealMapFailure("map receipt content digest changed")
    expected = build_row14_bounded_map_receipt(payload)
    if _canonical(receipt) != _canonical(expected):
        raise Row14IdealMapFailure("map receipt differs from exact replay")
    return expected


__all__ = [
    "Row14IdealMapFailure",
    "build_row14_bounded_map_receipt",
    "verify_row14_bounded_map_receipt",
]
