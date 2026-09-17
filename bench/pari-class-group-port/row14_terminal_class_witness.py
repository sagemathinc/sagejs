"""Fail-closed terminal class witnesses for mixed-quartic row 14.

This module deliberately does not contain a frozen terminal relation matrix.
It accepts the future live 806-relation owner, authenticates the exact map
from its raw relations to the three-column terminal presentation, proves the
minimal Smith orders, and returns compact products of the retained principal
factors.  Thus a W0 result can be used later as a differential oracle, but can
never supply an input to this computation.
"""

from __future__ import annotations

from collections.abc import Mapping
from math import gcd
from typing import Any


SCHEMA = "sagejs.pari-class-group/row14-terminal-class-witness-v1"
LIVE_SCHEMA = "sagejs.pari-class-group/row14-live-terminal-relations-v1"
FIELD_ID = (
    "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413"
)
POLYNOMIAL = (-200000002, -200000002, 0, 0, 1)
ROWS = 799
RAW_COLUMNS = 806
DIMENSION = 3

# These ideals are the independently computed direct-composition images of
# the two Smith columns.  They identify the requested generators; they do not
# determine either their order or a principal relation.
GENERATOR_IDEALS = (
    (5099, 0, 0, 0, 1784, 1, 0, 0, 2435, 0, 1, 0, 3663, 0, 0, 1),
    (
        334218769636951,
        0,
        0,
        0,
        58264613846794,
        1,
        0,
        0,
        132395815055232,
        0,
        1,
        0,
        140653091603643,
        0,
        0,
        1,
    ),
)


class Row14TerminalClassWitnessFailure(ValueError):
    """The live terminal owner did not prove the row-14 class witnesses."""


def _integers(value: Any, length: int, label: str) -> tuple[int, ...]:
    if not isinstance(value, list) or len(value) != length:
        raise Row14TerminalClassWitnessFailure(label + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row14TerminalClassWitnessFailure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Row14TerminalClassWitnessFailure(label + " is not canonical")
        answer.append(number)
    return tuple(answer)


def _digest(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise Row14TerminalClassWitnessFailure(label + " is not a SHA-256 digest")
    return value


def _presentation_coordinates(
    presentation: tuple[int, ...], target: tuple[int, int, int]
) -> tuple[int, int, int] | None:
    """Solve an upper-triangular, column-major 3-by-3 presentation."""
    if any(
        presentation[column * 3 + row] != 0
        for column in range(3)
        for row in range(column + 1, 3)
    ):
        raise Row14TerminalClassWitnessFailure("presentation is not upper triangular")
    if any(presentation[index * 4] <= 0 for index in range(3)):
        raise Row14TerminalClassWitnessFailure("presentation diagonal is not positive")
    diagonal2 = presentation[8]
    if target[2] % diagonal2:
        return None
    x2 = target[2] // diagonal2
    remainder1 = target[1] - presentation[7] * x2
    diagonal1 = presentation[4]
    if remainder1 % diagonal1:
        return None
    x1 = remainder1 // diagonal1
    remainder0 = target[0] - presentation[3] * x1 - presentation[6] * x2
    diagonal0 = presentation[0]
    if remainder0 % diagonal0:
        return None
    return (remainder0 // diagonal0, x1, x2)


def _principal_factors(value: Any) -> tuple[tuple[tuple[str, ...], str, str], ...]:
    """Validate one retained compact principal owner without expanding it."""
    if not isinstance(value, list) or not value:
        raise Row14TerminalClassWitnessFailure(
            "a raw principal factorization is absent"
        )
    answer: list[tuple[tuple[str, ...], str, str]] = []
    for term in value:
        if not isinstance(term, Mapping):
            raise Row14TerminalClassWitnessFailure(
                "a compact principal term is malformed"
            )
        values = _integers(term.get("values"), 4, "principal term values")
        denominator = _integers([term.get("denominator")], 1, "principal denominator")[
            0
        ]
        exponent = _integers([term.get("exponent")], 1, "principal exponent")[0]
        if denominator <= 0 or exponent == 0 or not any(values):
            raise Row14TerminalClassWitnessFailure(
                "a compact principal term is degenerate"
            )
        answer.append(
            (tuple(str(entry) for entry in values), str(denominator), str(exponent))
        )
    return tuple(answer)


def compose_row14_terminal_class_witness(
    live_owner: Mapping[str, Any],
) -> dict[str, Any]:
    """Derive exact order-24 and order-8 witnesses from a live terminal owner.

    The compact principal factors are retained evidence from each raw
    relation.  This function never expands them: a resulting principal
    generator is represented exactly as a signed product of those immutable
    owners.
    """
    if live_owner.get("schema") != LIVE_SCHEMA:
        raise Row14TerminalClassWitnessFailure("live terminal owner is required")
    field = live_owner.get("field")
    if not isinstance(field, Mapping):
        raise Row14TerminalClassWitnessFailure("field identity is absent")
    if (
        field.get("id") != FIELD_ID
        or _integers(field.get("coefficients"), 5, "field coefficients") != POLYNOMIAL
        or field.get("signature") != [2, 1]
    ):
        raise Row14TerminalClassWitnessFailure("wrong exact row-14 field")
    dimensions = live_owner.get("dimensions")
    if not isinstance(dimensions, Mapping) or dimensions != {
        "factorBaseSize": ROWS,
        "relationCount": RAW_COLUMNS,
        "presentationDimension": DIMENSION,
    }:
        raise Row14TerminalClassWitnessFailure("wrong live terminal dimensions")
    ancestry = live_owner.get("ancestry")
    if not isinstance(ancestry, Mapping):
        raise Row14TerminalClassWitnessFailure("live ancestry is absent")
    source_sha256 = _digest(ancestry.get("sourceSha256"), "source digest")
    terminal_sha256 = _digest(ancestry.get("terminalOwnerSha256"), "terminal digest")

    presentation = _integers(live_owner.get("presentation"), 9, "presentation")
    if presentation != (24, 0, 0, 4, 4, 0, 5, 3, 2):
        raise Row14TerminalClassWitnessFailure("wrong terminal presentation")
    mapped_ideals = _integers(
        live_owner.get("mappedGeneratorIdeals"), 32, "mapped ideals"
    )
    if mapped_ideals != GENERATOR_IDEALS[0] + GENERATOR_IDEALS[1]:
        raise Row14TerminalClassWitnessFailure("mapped generator ideals changed")
    quotient = _integers(
        live_owner.get("smithQuotientCoordinates"), 6, "Smith coordinates"
    )
    if quotient != (1, 0, 0, -2, -1, -1):
        raise Row14TerminalClassWitnessFailure("Smith generator map changed")

    factor_map = _integers(live_owner.get("factorMap"), ROWS * DIMENSION, "factor map")
    relations = _integers(
        live_owner.get("rawRelations"), ROWS * RAW_COLUMNS, "raw relations"
    )
    transform = _integers(
        live_owner.get("rawToPresentation"), RAW_COLUMNS * DIMENSION, "raw transform"
    )
    compact = live_owner.get("rawPrincipalFactors")
    if not isinstance(compact, list) or len(compact) != RAW_COLUMNS:
        raise Row14TerminalClassWitnessFailure("raw principal owners are absent")
    # Validate every owner, including relations not used by the two final
    # combinations.  Principal arithmetic authentication remains the live
    # owner's responsibility; this consumer refuses an omitted owner.
    compact_owners = tuple(_principal_factors(value) for value in compact)

    checked_transform_cells = 0
    for terminal_column in range(DIMENSION):
        for row in range(ROWS):
            raw_value = sum(
                relations[raw_column * ROWS + row]
                * transform[terminal_column * RAW_COLUMNS + raw_column]
                for raw_column in range(RAW_COLUMNS)
            )
            terminal_value = sum(
                factor_map[column * ROWS + row]
                * presentation[terminal_column * DIMENSION + column]
                for column in range(DIMENSION)
            )
            if raw_value != terminal_value:
                raise Row14TerminalClassWitnessFailure(
                    "raw transform failed exact replay"
                )
            checked_transform_cells += 1

    orders = (24, 8)
    determinant = presentation[0] * presentation[4] * presentation[8]
    minor_gcd = 0
    for first_row in range(DIMENSION):
        for second_row in range(first_row + 1, DIMENSION):
            for first_column in range(DIMENSION):
                for second_column in range(first_column + 1, DIMENSION):
                    minor = (
                        presentation[first_column * DIMENSION + first_row]
                        * presentation[second_column * DIMENSION + second_row]
                        - presentation[second_column * DIMENSION + first_row]
                        * presentation[first_column * DIMENSION + second_row]
                    )
                    minor_gcd = gcd(minor_gcd, abs(minor))
    if (
        gcd(*(abs(value) for value in presentation)) != 1
        or minor_gcd != 8
        or determinant != orders[0] * orders[1]
    ):
        raise Row14TerminalClassWitnessFailure("presentation has the wrong Smith group")

    # The two mapped Smith vectors must account for every one of the 192
    # quotient classes, not merely have the requested individual orders.
    independence_checks = 0
    for first in range(orders[0]):
        for second in range(orders[1]):
            target = (
                first * quotient[0] + second * quotient[3],
                first * quotient[1] + second * quotient[4],
                first * quotient[2] + second * quotient[5],
            )
            is_zero = _presentation_coordinates(presentation, target) is not None
            if is_zero != (first == 0 and second == 0):
                raise Row14TerminalClassWitnessFailure(
                    "Smith generators are not independent"
                )
            independence_checks += 1

    witnesses: list[dict[str, Any]] = []
    minimality_checks = 0
    checked_raw_cells = 0
    for generator, order in enumerate(orders):
        q = quotient[generator * DIMENSION : (generator + 1) * DIMENSION]
        first_membership = 0
        relation_coordinates: tuple[int, int, int] | None = None
        for multiple in range(1, order + 1):
            target = (multiple * q[0], multiple * q[1], multiple * q[2])
            coordinates = _presentation_coordinates(presentation, target)
            minimality_checks += 1
            if coordinates is not None:
                first_membership = multiple
                relation_coordinates = coordinates
                break
        if first_membership != order or relation_coordinates is None:
            raise Row14TerminalClassWitnessFailure(
                "Smith coordinate has the wrong minimal order"
            )
        raw_coefficients = tuple(
            sum(
                transform[column * RAW_COLUMNS + raw_column]
                * relation_coordinates[column]
                for column in range(DIMENSION)
            )
            for raw_column in range(RAW_COLUMNS)
        )
        for row in range(ROWS):
            raw_value = sum(
                relations[column * ROWS + row] * raw_coefficients[column]
                for column in range(RAW_COLUMNS)
            )
            target_value = sum(
                factor_map[column * ROWS + row] * order * q[column]
                for column in range(DIMENSION)
            )
            if raw_value != target_value:
                raise Row14TerminalClassWitnessFailure(
                    "order relation failed raw replay"
                )
            checked_raw_cells += 1
        factors = [
            {
                "rawRelationIndex": index,
                "exponent": str(exponent),
                "principalFactors": [
                    {
                        "values": list(values),
                        "denominator": denominator,
                        "exponent": factor_exponent,
                    }
                    for values, denominator, factor_exponent in compact_owners[index]
                ],
            }
            for index, exponent in enumerate(raw_coefficients)
            if exponent
        ]
        if not factors:
            raise Row14TerminalClassWitnessFailure(
                "order witness has no principal factors"
            )
        witnesses.append(
            {
                "idealHnf": [str(value) for value in GENERATOR_IDEALS[generator]],
                "order": str(order),
                "smithQuotientCoordinates": [str(value) for value in q],
                "presentationRelation": [str(value) for value in relation_coordinates],
                "properMultiplesRejected": order - 1,
                "rawPrincipalProduct": factors,
            }
        )

    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "coefficients": [str(value) for value in POLYNOMIAL],
            "signature": [2, 1],
        },
        "ancestry": {
            "sourceSha256": source_sha256,
            "terminalOwnerSha256": terminal_sha256,
        },
        "classGroup": {"classNumber": "192", "invariants": ["24", "8"]},
        "witnesses": witnesses,
        "proof": {
            "rawRelations": RAW_COLUMNS,
            "factorBaseSize": ROWS,
            "checkedTransformCells": checked_transform_cells,
            "checkedRawOrderCells": checked_raw_cells,
            "minimalityChecks": minimality_checks,
            "independenceChecks": independence_checks,
            "smithMinorGcd": minor_gcd,
            "compactPrincipalFactorsExpanded": False,
            "frozenW0UsedAsInput": False,
        },
        "publicComplete": False,
    }


__all__ = [
    "LIVE_SCHEMA",
    "Row14TerminalClassWitnessFailure",
    "compose_row14_terminal_class_witness",
]
