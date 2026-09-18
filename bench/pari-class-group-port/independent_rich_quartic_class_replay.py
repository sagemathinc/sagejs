"""Detached class-witness replay for the rich fresh rows 13 and 14.

The input is only a neutral result payload.  This module neither imports a
row publisher nor consults a frozen PARI answer.  It checks the presentation,
the exact relation combination proving each published generator order, and
all principal relation equations when the neutral payload retained the field
multiplication table.  Any part which cannot be reconstructed from the
published owners is returned as a machine-readable missing-owner record.
"""

from __future__ import annotations

import importlib
import math
from collections.abc import Mapping, Sequence
from typing import Any


class RichQuarticClassReplayFailure(ValueError):
    """A detached rich-quartic class witness failed exact replay."""


def _integers(value: Any, label: str) -> list[int]:
    if not isinstance(value, list):
        raise RichQuarticClassReplayFailure(label + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise RichQuarticClassReplayFailure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise RichQuarticClassReplayFailure(label + " is not canonical")
        answer.append(number)
    return answer


def _owners(payload: Mapping[str, Any]) -> dict[str, list[int]]:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise RichQuarticClassReplayFailure("storage is absent")
    answer: dict[str, list[int]] = {}
    for item in storage:
        if not isinstance(item, Mapping) or not isinstance(item.get("name"), str):
            raise RichQuarticClassReplayFailure("a storage owner is malformed")
        name = item["name"]
        if name in answer:
            raise RichQuarticClassReplayFailure("duplicate storage owner " + name)
        entries = _integers(item.get("entries"), name)
        if item.get("logicalLength") != str(len(entries)):
            raise RichQuarticClassReplayFailure(name + " length changed")
        answer[name] = entries
    return answer


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _presentation_invariants(matrix: list[int]) -> list[int]:
    if len(matrix) == 1:
        return [] if abs(matrix[0]) == 1 else [abs(matrix[0])]
    if len(matrix) != 9:
        raise RichQuarticClassReplayFailure("unsupported presentation shape")
    first = math.gcd(*(abs(value) for value in matrix))
    minors: list[int] = []
    for rows in ((0, 1), (0, 2), (1, 2)):
        for columns in ((0, 1), (0, 2), (1, 2)):
            minors.append(
                matrix[3 * rows[0] + columns[0]] * matrix[3 * rows[1] + columns[1]]
                - matrix[3 * rows[0] + columns[1]] * matrix[3 * rows[1] + columns[0]]
            )
    second_product = math.gcd(*(abs(value) for value in minors))
    determinant = abs(_determinant3(matrix))
    if first == 0 or second_product == 0 or determinant == 0:
        raise RichQuarticClassReplayFailure("presentation is singular")
    diagonal = [first, second_product // first, determinant // second_product]
    return [entry for entry in diagonal if entry != 1]


def _quartic_principal_replay(
    records: list[int],
    generators: list[int],
    ideals: list[int],
    table: list[int],
    rows: int,
    columns: int,
) -> dict[str, int]:
    replay = importlib.import_module(
        "bench.pari-class-group-port.field3_relation_replay_map"
    )
    identity = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    products = 0
    nonzero = 0
    for column in range(columns):
        product = identity
        for row in range(rows):
            exponent = records[column * rows + row]
            if exponent < 0 or exponent > 64:
                raise RichQuarticClassReplayFailure(
                    "raw relation exponent left the detached replay bound"
                )
            if exponent == 0:
                continue
            nonzero += 1
            base = tuple(ideals[16 * row : 16 * (row + 1)])
            power = exponent
            while power:
                if power & 1:
                    product = replay._quartic_product(product, base, table)
                    products += 1
                power >>= 1
                if power:
                    base = replay._quartic_product(base, base, table)
                    products += 1
        alpha = generators[4 * column : 4 * (column + 1)]
        if not any(alpha) or product != replay._principal_hnf(alpha, table):
            raise RichQuarticClassReplayFailure(
                f"raw principal equation failed at relation {column}"
            )
    return {
        "principalRelationsReplayed": columns,
        "nonzeroRelationEntries": nonzero,
        "principalIdealMultiplications": products,
    }


def replay_rich_quartic_class(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Replay all class evidence supported by the detached neutral payload."""
    field = payload.get("field")
    group = payload.get("classGroup")
    if not isinstance(field, Mapping) or not isinstance(group, Mapping):
        raise RichQuarticClassReplayFailure("field or class group is absent")
    if field.get("degree") != "4":
        raise RichQuarticClassReplayFailure("this adapter accepts quartics only")
    owners = _owners(payload)
    required = {
        "class-generator-ideals",
        "class-order-principal-coefficients",
        "class-presentation",
        "factor-base-ideals",
        "factor-map",
        "principal-generators",
        "raw-relation-records",
    }
    missing_required = sorted(required - owners.keys())
    if missing_required:
        raise RichQuarticClassReplayFailure(
            "required owners are absent: " + ", ".join(missing_required)
        )

    invariants = _integers(group.get("invariantFactors"), "invariant factors")
    class_number = int(group.get("classNumber", 0))
    generator_count = int(group.get("generatorCount", -1))
    if math.prod(invariants) != class_number or len(invariants) != generator_count:
        raise RichQuarticClassReplayFailure("published class invariants changed")
    replayed_invariants = _presentation_invariants(owners["class-presentation"])
    if replayed_invariants != invariants:
        raise RichQuarticClassReplayFailure("presentation Smith invariants changed")

    ideals = owners["factor-base-ideals"]
    if len(ideals) % 16:
        raise RichQuarticClassReplayFailure("factor-base ideal storage changed")
    rows = len(ideals) // 16
    records = owners["raw-relation-records"]
    if rows == 0 or len(records) % rows:
        raise RichQuarticClassReplayFailure("relation matrix shape changed")
    columns = len(records) // rows
    coefficients = owners["class-order-principal-coefficients"]
    generator_ideals = owners["class-generator-ideals"]
    principal_generators = owners["principal-generators"]
    factor_map = owners["factor-map"]
    if (
        len(coefficients) != generator_count * columns
        or len(generator_ideals) != generator_count * 16
        or len(principal_generators) != columns * 4
        or len(factor_map) % rows
    ):
        raise RichQuarticClassReplayFailure("class witness shape changed")
    presentation_columns = len(factor_map) // rows
    if presentation_columns not in (1, 3):
        raise RichQuarticClassReplayFailure("factor-map width changed")

    # The retained factor maps in these two rich rows are distinct unit vectors.
    # This makes membership and coordinates in their presentation span exact and
    # independent of any row-specific terminal owner.
    pivots: list[int] = []
    for basis in range(presentation_columns):
        vector = factor_map[basis * rows : (basis + 1) * rows]
        support = [index for index, value in enumerate(vector) if value]
        if len(support) != 1 or vector[support[0]] != 1 or support[0] in pivots:
            raise RichQuarticClassReplayFailure("factor map is not a unit embedding")
        pivots.append(support[0])

    source_orders = owners.get("class-source-invariants")
    if source_orders is None:
        source_orders = invariants
    if len(source_orders) != generator_count:
        raise RichQuarticClassReplayFailure("source generator orders changed")
    coordinates: list[list[int]] = []
    directly_checked_ideals = 0
    missing_ideal_replays: list[dict[str, Any]] = []
    for generator in range(generator_count):
        order = source_orders[generator]
        if order <= 1:
            raise RichQuarticClassReplayFailure("source generator order changed")
        coefficient = coefficients[generator * columns : (generator + 1) * columns]
        quotient: list[int] = []
        for row in range(rows):
            total = sum(
                records[column * rows + row] * coefficient[column]
                for column in range(columns)
            )
            if total % order:
                raise RichQuarticClassReplayFailure(
                    f"generator {generator} order relation is not divisible at row {row}"
                )
            quotient.append(total // order)
        coordinate = [quotient[pivot] for pivot in pivots]
        reconstructed = [0] * rows
        for basis, scalar in enumerate(coordinate):
            for row in range(rows):
                reconstructed[row] += scalar * factor_map[basis * rows + row]
        if reconstructed != quotient:
            raise RichQuarticClassReplayFailure(
                f"generator {generator} order quotient left the factor-map span"
            )
        coordinates.append(coordinate)

        support = [(index, value) for index, value in enumerate(quotient) if value]
        published = generator_ideals[16 * generator : 16 * (generator + 1)]
        if len(support) == 1 and support[0][1] == 1:
            source = ideals[16 * support[0][0] : 16 * (support[0][0] + 1)]
            # Row 13 retained class ideals in factor-base column-HNF order;
            # row 14's C7 boundary normalized them to displayed row-major HNF.
            transposed = [source[(entry % 4) * 4 + entry // 4] for entry in range(16)]
            if published not in (source, transposed):
                raise RichQuarticClassReplayFailure(
                    f"published class generator {generator} changed"
                )
            directly_checked_ideals += 1
        else:
            missing_ideal_replays.append(
                {
                    "generator": generator,
                    "missingOwner": "signed-class-generator-reduction-witness",
                    "reason": "negative factor exponents require retained inverse and principal-scaling data",
                }
            )

    missing_owners: list[dict[str, Any]] = []
    principal_summary = {
        "principalRelationsReplayed": 0,
        "nonzeroRelationEntries": 0,
        "principalIdealMultiplications": 0,
    }
    table = owners.get("field-multiplication-table")
    if table is None:
        missing_owners.append(
            {
                "missingOwner": "field-multiplication-table",
                "affectedCheck": "raw-principal-ideal-equations",
            }
        )
    else:
        if len(table) != 64:
            raise RichQuarticClassReplayFailure("multiplication table changed")
        principal_summary = _quartic_principal_replay(
            records, principal_generators, ideals, table, rows, columns
        )

    return {
        "fieldId": field.get("id"),
        "classNumber": class_number,
        "invariantFactors": invariants,
        "sourceGeneratorOrders": source_orders,
        "generatorCount": generator_count,
        "factorBaseSize": rows,
        "relationCount": columns,
        "presentationColumns": presentation_columns,
        "presentationCoordinates": coordinates,
        "orderRelationsReplayed": generator_count,
        "classGeneratorIdealsDirectlyReplayed": directly_checked_ideals,
        "classGeneratorIdealReplayGaps": missing_ideal_replays,
        "missingOwners": missing_owners,
        "qualifiedTiming": False,
        **principal_summary,
    }


__all__ = ["RichQuarticClassReplayFailure", "replay_rich_quartic_class"]
