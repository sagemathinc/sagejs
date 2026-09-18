"""Detached class-generator replay for development rows 19 and 23.

The entry points consume data-only neutral or source envelopes.  They never
call a row publisher, a fresh transaction, or a frozen PARI answer.  Row 23
retains enough source data for a complete degree-five replay.  Row 19 retains
enough data to replay its presentation and all nine relation combinations, but
not enough to replay an ideal identity; that boundary is returned explicitly.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from fractions import Fraction
from typing import Any


class DetachedIdealReplayFailure(ValueError):
    """A detached class-generator witness failed exact replay."""


def _integers(value: Any, label: str, length: int | None = None) -> list[int]:
    if not isinstance(value, list) or (length is not None and len(value) != length):
        raise DetachedIdealReplayFailure(label + " has the wrong shape")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise DetachedIdealReplayFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise DetachedIdealReplayFailure(label + " is not canonical")
        result.append(integer)
    return result


def _sha256_canonical(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _vector_digest(values: Sequence[int]) -> str:
    return hashlib.sha256("\n".join(map(str, values)).encode()).hexdigest()


def _matrix_product(left: Sequence[int], right: Sequence[int], size: int) -> list[int]:
    return [
        sum(
            left[size * row + inner] * right[size * inner + column]
            for inner in range(size)
        )
        for row in range(size)
        for column in range(size)
    ]


def _column_major_to_row_major(matrix: Sequence[int], size: int) -> list[int]:
    return [
        matrix[size * column + row] for row in range(size) for column in range(size)
    ]


def _determinant(matrix: Sequence[int], size: int) -> int:
    work = [
        [Fraction(matrix[size * row + column]) for column in range(size)]
        for row in range(size)
    ]
    result = Fraction(1)
    for column in range(size):
        pivot = next((row for row in range(column, size) if work[row][column]), size)
        if pivot == size:
            return 0
        if pivot != column:
            work[column], work[pivot] = work[pivot], work[column]
            result = -result
        value = work[column][column]
        result *= value
        for row in range(column + 1, size):
            scale = work[row][column] / value
            for entry in range(column, size):
                work[row][entry] -= scale * work[column][entry]
    if result.denominator != 1:
        raise DetachedIdealReplayFailure("integer determinant became fractional")
    return result.numerator


def _owners(payload: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise DetachedIdealReplayFailure("neutral storage is absent")
    result: dict[str, Mapping[str, Any]] = {}
    for owner in storage:
        if not isinstance(owner, Mapping) or not isinstance(owner.get("name"), str):
            raise DetachedIdealReplayFailure("malformed neutral owner")
        name = owner["name"]
        if name in result:
            raise DetachedIdealReplayFailure("duplicate neutral owner")
        result[name] = owner
    return result


def _owner_integers(owners: Mapping[str, Mapping[str, Any]], name: str) -> list[int]:
    owner = owners.get(name)
    if owner is None:
        raise DetachedIdealReplayFailure("missing neutral owner " + name)
    entries = _integers(owner.get("entries"), name + " entries")
    if owner.get("logicalLength") != str(len(entries)):
        raise DetachedIdealReplayFailure(name + " logical length changed")
    return entries


def _owner_json(owners: Mapping[str, Mapping[str, Any]], name: str) -> Any:
    entries = _owner_integers(owners, name)
    if any(entry < 0 or entry > 255 for entry in entries):
        raise DetachedIdealReplayFailure(name + " is not canonical JSON bytes")
    try:
        return json.loads(bytes(entries))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise DetachedIdealReplayFailure(name + " JSON is malformed") from error


def replay_row19_retained_witnesses(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Replay every row-19 relation tape and report the retained-data cut."""
    field = payload.get("field")
    group = payload.get("classGroup")
    if not isinstance(field, Mapping) or not isinstance(group, Mapping):
        raise DetachedIdealReplayFailure("row-19 field or class group is absent")
    if field.get("degree") != "3" or group.get("classNumber") != "39366":
        raise DetachedIdealReplayFailure("not the retained row-19 result")
    invariants = _integers(group.get("invariantFactors"), "row-19 invariants", 9)
    product = 1
    for invariant in invariants:
        product *= invariant
    if product != 39366 or sorted(invariants) != [3] * 8 + [6]:
        raise DetachedIdealReplayFailure("row-19 invariant factors changed")

    owners = _owners(payload)
    relations = _owner_integers(owners, "relation-records")
    generators = _owner_integers(owners, "relation-generators")
    published_ideals = _owner_integers(owners, "class-generator-ideals")
    factor_base = _owner_json(owners, "factor-base")
    presentation_owner = _owner_json(owners, "class-presentation")
    witnesses = _owner_json(owners, "class-order-witnesses")
    if len(relations) != 424 * 430 or len(generators) != 3 * 430:
        raise DetachedIdealReplayFailure("row-19 relation owner shape changed")
    if len(published_ideals) != 9 * 9:
        raise DetachedIdealReplayFailure("row-19 published ideal shape changed")
    if not isinstance(witnesses, list) or len(witnesses) != 9:
        raise DetachedIdealReplayFailure("row-19 witness count changed")
    if not isinstance(factor_base, Mapping) or factor_base.get("size") != 424:
        raise DetachedIdealReplayFailure("row-19 factor base changed")
    if not isinstance(presentation_owner, Mapping) or not isinstance(
        presentation_owner.get("matrices"), Mapping
    ):
        raise DetachedIdealReplayFailure("row-19 presentation owner changed")
    matrices = presentation_owner["matrices"]
    terminal_w = _column_major_to_row_major(
        _integers(presentation_owner.get("terminalW"), "row-19 terminal W", 81), 9
    )
    smith_d = _column_major_to_row_major(
        _integers(matrices.get("D"), "row-19 Smith D", 81), 9
    )
    smith_u = _column_major_to_row_major(
        _integers(matrices.get("U"), "row-19 Smith U", 81), 9
    )
    smith_v = _column_major_to_row_major(
        _integers(matrices.get("V"), "row-19 Smith V", 81), 9
    )
    smith_ui = _column_major_to_row_major(
        _integers(matrices.get("Ui"), "row-19 Smith Ui", 81), 9
    )
    identity = [int(row == column) for row in range(9) for column in range(9)]
    if (
        _matrix_product(_matrix_product(smith_u, terminal_w, 9), smith_v, 9) != smith_d
        or _matrix_product(smith_u, smith_ui, 9) != identity
        or _matrix_product(smith_ui, smith_u, 9) != identity
        or abs(_determinant(smith_u, 9)) != 1
        or abs(_determinant(smith_v, 9)) != 1
    ):
        raise DetachedIdealReplayFailure("row-19 Smith presentation failed")
    smith_orders = []
    for row in range(9):
        for column in range(9):
            if row != column and smith_d[9 * row + column]:
                raise DetachedIdealReplayFailure("row-19 Smith D is not diagonal")
        smith_orders.append(abs(smith_d[9 * row + row]))
    if smith_orders != [6] + [3] * 8:
        raise DetachedIdealReplayFailure("row-19 Smith orders changed")

    source_orders: list[int] = []
    support_total = 0
    for index, witness in enumerate(witnesses):
        if not isinstance(witness, Mapping):
            raise DetachedIdealReplayFailure("row-19 witness is malformed")
        presentation = witness.get("presentation")
        principal = witness.get("principal")
        if not isinstance(presentation, Mapping) or not isinstance(principal, Mapping):
            raise DetachedIdealReplayFailure("row-19 witness section is absent")
        left = _integers(presentation.get("left"), "presentation left", 9)
        right = _integers(presentation.get("right"), "presentation right", 9)
        quotient = _integers(
            presentation.get("quotientCoordinate"), "quotient coordinate", 9
        )
        relation = _integers(
            presentation.get("presentationRelation"), "presentation relation", 9
        )
        if left != right or quotient != relation or quotient[index] != 1:
            raise DetachedIdealReplayFailure(
                f"row-19 presentation witness {index} changed"
            )
        order = left[index]
        if order != smith_orders[index]:
            raise DetachedIdealReplayFailure("row-19 presentation order changed")
        expected_divisors = [
            divisor for divisor in range(1, order) if order % divisor == 0
        ]
        rejected = _integers(
            presentation.get("properDivisorsRejected"), "proper divisors"
        )
        if rejected != expected_divisors or presentation.get("exact") is not True:
            raise DetachedIdealReplayFailure("row-19 exact order proof changed")
        source_orders.append(order)

        coefficients = _integers(
            principal.get("rawRelationCoefficients"), "raw coefficients", 430
        )
        target = _integers(
            principal.get("factorBaseExponents"), "factor exponents", 424
        )
        generator_power = _integers(
            principal.get("generatorPowerFactorBaseExponents"),
            "generator power exponents",
            424,
        )
        if _vector_digest(coefficients) != principal.get(
            "rawRelationCoefficientsSha256"
        ) or _vector_digest(target) != principal.get("factorBaseExponentsSha256"):
            raise DetachedIdealReplayFailure("row-19 witness digest changed")
        computed = [
            sum(
                relations[column * 424 + row] * coefficients[column]
                for column in range(430)
            )
            for row in range(424)
        ]
        if computed != target or target != generator_power:
            raise DetachedIdealReplayFailure(f"row-19 order relation {index} failed")
        if any(value % order for value in target):
            raise DetachedIdealReplayFailure(
                f"row-19 generator request {index} is not order-integral"
            )

        support = [column for column, value in enumerate(coefficients) if value]
        famat_generators = principal.get("famatGenerators")
        if not isinstance(famat_generators, list):
            raise DetachedIdealReplayFailure("row-19 factored generators are absent")
        decoded_generators = [
            _integers(value, "factored principal generator", 3)
            for value in famat_generators
        ]
        famat_exponents = _integers(
            principal.get("famatExponents"), "factored principal exponents"
        )
        expected_generators = [
            generators[3 * column : 3 * column + 3] for column in support
        ]
        if (
            decoded_generators != expected_generators
            or famat_exponents != [coefficients[column] for column in support]
            or principal.get("factorCount") != len(support)
            or principal.get("identity") != f"J_{index}^{order}=(alpha_{index})"
        ):
            raise DetachedIdealReplayFailure(
                f"row-19 factored principal witness {index} changed"
            )
        support_total += len(support)

    # The source orders are [6,3,...,3], while the public invariant factors are
    # normalized increasingly.  They describe the same finite abelian group.
    if sorted(source_orders) != sorted(invariants):
        raise DetachedIdealReplayFailure("row-19 source/public orders disagree")
    missing = [
        "integral-basis multiplication tensor",
        "raw-principal-equation ideal replay",
        "reduction linkage from factor-base requests to published ideal HNFs",
    ]
    return {
        "row": 19,
        "classNumber": 39366,
        "generatorCount": 9,
        "sourceGeneratorOrders": source_orders,
        "relationRows": 424,
        "relationColumns": 430,
        "orderRelationsReplayed": 9,
        "factoredPrincipalSupportsReplayed": support_total,
        "presentationOrdersProved": True,
        "coefficientCombinationsExact": True,
        "factoredPrincipalAssemblyExact": True,
        "publishedIdealOrderIdentitiesReplayed": 0,
        "fullExactIdealReplay": False,
        "status": "blocked-by-retained-semantics",
        "missingSemantics": missing,
    }


def _unwrap_source_envelope(envelope: Mapping[str, Any]) -> Mapping[str, Any]:
    payload = envelope.get("payload")
    if not isinstance(payload, Mapping):
        raise DetachedIdealReplayFailure("row-23 source payload is absent")
    if envelope.get("payloadSha256") != _sha256_canonical(payload):
        raise DetachedIdealReplayFailure("row-23 source payload digest changed")
    return payload


def _row23_source_from_neutral(payload: Mapping[str, Any]) -> Mapping[str, Any]:
    owners = _owners(payload)
    source = _owner_json(owners, "row23-source-envelope")
    if not isinstance(source, Mapping):
        raise DetachedIdealReplayFailure("row-23 retained source is malformed")
    return _unwrap_source_envelope(source)


def replay_row23_source_envelope(envelope: Mapping[str, Any]) -> dict[str, Any]:
    """Replay row 23 directly from its detached final-source envelope."""
    return _replay_row23_source(_unwrap_source_envelope(envelope))


def replay_row23_neutral_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Replay row 23 from the source bytes retained in its neutral payload."""
    return _replay_row23_source(_row23_source_from_neutral(payload))


def _replay_row23_source(source: Mapping[str, Any]) -> dict[str, Any]:
    arithmetic = __import__(
        "bench.pari-class-group-port.row23_degree5_correspondence",
        fromlist=["_column_hnf"],
    )
    field = source.get("field")
    group = source.get("classGroup")
    relations = source.get("relations")
    if not all(isinstance(value, Mapping) for value in (field, group, relations)):
        raise DetachedIdealReplayFailure("row-23 source sections are absent")
    if field.get("degree") != "5" or group.get("classNumber") != "6":
        raise DetachedIdealReplayFailure("not the retained row-23 source")
    table = _integers(field.get("multiplicationTable"), "multiplication table", 125)
    invariants = _integers(group.get("invariantFactors"), "row-23 invariants", 1)
    orders = _integers(group.get("generatorOrders"), "row-23 orders", 1)
    if invariants != [6] or orders != [6]:
        raise DetachedIdealReplayFailure("row-23 class order changed")

    presentation = group.get("presentation")
    if not isinstance(presentation, Mapping):
        raise DetachedIdealReplayFailure("row-23 presentation is absent")
    matrices = presentation.get("matrices")
    if not isinstance(matrices, Mapping):
        raise DetachedIdealReplayFailure("row-23 presentation matrices are absent")
    matrix = {name: _integers(matrices.get(name), name, 1)[0] for name in matrices}
    if (
        _integers(presentation.get("W"), "row-23 W", 1) != [6]
        or _integers(presentation.get("invariants"), "presentation invariants", 1)
        != [6]
        or matrix.get("U", 0) * 6 * matrix.get("V", 0) != matrix.get("D")
        or matrix.get("U", 0) * matrix.get("Ui", 0) != 1
        or matrix.get("Ui", 0) * matrix.get("U", 0) != 1
        or matrix.get("Ur") != matrix.get("U") + matrix.get("D") * matrix.get("Y")
        or matrix.get("Uir") != matrix.get("Ui") + 6 * matrix.get("X")
    ):
        raise DetachedIdealReplayFailure("row-23 Smith presentation failed")

    witnesses = group.get("compactPrincipalOrderWitnesses")
    if not isinstance(witnesses, list) or len(witnesses) != 1:
        raise DetachedIdealReplayFailure("row-23 compact witness changed")
    witness = witnesses[0]
    if not isinstance(witness, Mapping):
        raise DetachedIdealReplayFailure("row-23 compact witness is malformed")
    coefficients = _integers(
        witness.get("rawRelationCoefficients"), "row-23 coefficients", 40
    )
    records = _integers(
        relations.get("recordsColumnMajor"), "row-23 relation matrix", 31 * 40
    )
    target = [
        sum(records[column * 31 + row] * coefficients[column] for column in range(40))
        for row in range(31)
    ]
    expected = _integers(
        witness.get("factorBaseExponents"), "row-23 factor exponents", 31
    )
    if target != expected or expected != [6] + [0] * 30:
        raise DetachedIdealReplayFailure("row-23 class-order relation failed")
    if _vector_digest(coefficients) != witness.get(
        "rawRelationCoefficientsSha256"
    ) or _vector_digest(expected) != witness.get("factorBaseExponentsSha256"):
        raise DetachedIdealReplayFailure("row-23 compact witness digest changed")

    relation_generators = _integers(
        relations.get("principalGenerators"), "row-23 principal generators", 200
    )
    indices = witness.get("relationIndices")
    if not isinstance(indices, list) or any(
        isinstance(index, bool) or not isinstance(index, int) for index in indices
    ):
        raise DetachedIdealReplayFailure("row-23 relation indices changed")
    support = [index for index, value in enumerate(coefficients) if value]
    compact_generators = [
        _integers(value, "compact principal generator", 5)
        for value in witness.get("principalGenerators", [])
    ]
    compact_exponents = _integers(
        witness.get("relationExponents"), "compact relation exponents"
    )
    if (
        indices != support
        or compact_generators
        != [relation_generators[5 * index : 5 * index + 5] for index in support]
        or compact_exponents != [coefficients[index] for index in support]
    ):
        raise DetachedIdealReplayFailure("row-23 factored principal tape changed")

    alpha: list[Fraction] = [
        Fraction(1),
        Fraction(0),
        Fraction(0),
        Fraction(0),
        Fraction(0),
    ]
    for generator, exponent in zip(compact_generators, compact_exponents, strict=True):
        alpha = list(
            map(
                Fraction,
                arithmetic._multiply(
                    table, alpha, arithmetic._power(table, generator, exponent)
                ),
            )
        )
    if any(value.denominator != 1 for value in alpha):
        raise DetachedIdealReplayFailure("row-23 expanded alpha is not integral")
    expanded_alpha = [value.numerator for value in alpha]
    if expanded_alpha != _integers(
        group.get("expandedPrincipalGenerator"), "published expanded alpha", 5
    ):
        raise DetachedIdealReplayFailure("row-23 expanded principal changed")

    ideals = group.get("generatorIdeals")
    if not isinstance(ideals, list) or len(ideals) != 1:
        raise DetachedIdealReplayFailure("row-23 generator ideal changed")
    ideal = _integers(ideals[0], "row-23 generator ideal", 25)
    ideal_columns = [
        [ideal[5 * row + column] for row in range(5)] for column in range(5)
    ]
    identity = [[int(row == column) for row in range(5)] for column in range(5)]
    current = identity
    for _ in range(6):
        current = arithmetic._ideal_product(table, current, ideal_columns)
    power_hnf = [current[column][row] for row in range(5) for column in range(5)]
    multiplication = arithmetic._multiplication_matrix(table, expanded_alpha)
    principal_columns = arithmetic._column_hnf(
        [[multiplication[5 * row + column] for row in range(5)] for column in range(5)]
    )
    principal_hnf = [
        principal_columns[column][row] for row in range(5) for column in range(5)
    ]
    if power_hnf != principal_hnf:
        raise DetachedIdealReplayFailure("row-23 J^6 and (alpha) differ")
    genback = group.get("genback")
    if (
        not isinstance(genback, Mapping)
        or _integers(genback.get("reducedGeneratorIdealHnf"), "reduced generator", 25)
        != ideal
    ):
        raise DetachedIdealReplayFailure("row-23 published reduced ideal changed")

    return {
        "row": 23,
        "classNumber": 6,
        "generatorCount": 1,
        "generatorOrders": [6],
        "presentationOrdersProved": True,
        "orderRelationsReplayed": 1,
        "factoredPrincipalSupportsReplayed": len(support),
        "publishedIdealOrderIdentitiesReplayed": 1,
        "idealMultiplications": 6,
        "identity": "J^6=(alpha)",
        "fullExactIdealReplay": True,
        "status": "complete",
        "missingSemantics": [],
    }


__all__ = [
    "DetachedIdealReplayFailure",
    "replay_row19_retained_witnesses",
    "replay_row23_neutral_payload",
    "replay_row23_source_envelope",
]
