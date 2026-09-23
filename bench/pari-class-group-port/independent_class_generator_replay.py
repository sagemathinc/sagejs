"""Cold mathematical replay of published class-generator order witnesses.

This verifier consumes only the data-only neutral result payload.  It does not
call a row-specific publisher, trust a publisher digest, or use a frozen PARI
answer.  For the cubic and quartic result layouts which retain the required
owners, it checks

* every raw principal relation used by a generator-order witness;
* the exact raw-relation linear combination `R*c = n*f`;
* the factor-base product defining the published generator ideal; and
* the published class presentation and generator orders.

The principal element is deliberately kept factored as `prod(alpha_j**c_j)`.
Negative coefficients therefore need no field-element inversion: replaying
each exact equality `(alpha_j) = prod(P_i**R_ij)` and the signed integer
linear combination is already an exact principal-ideal witness.
"""

from __future__ import annotations

import importlib
from collections.abc import Mapping
from typing import Any


class IndependentClassGeneratorReplayFailure(ValueError):
    """The detached class-generator witness failed mathematical replay."""


def _integers(value: Any, label: str, length: int | None = None) -> list[int]:
    if not isinstance(value, list) or (length is not None and len(value) != length):
        raise IndependentClassGeneratorReplayFailure(label + " has the wrong shape")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise IndependentClassGeneratorReplayFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise IndependentClassGeneratorReplayFailure(label + " is not canonical")
        result.append(integer)
    return result


def _owners(payload: Mapping[str, Any]) -> dict[str, list[int]]:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise IndependentClassGeneratorReplayFailure("storage is absent")
    result: dict[str, list[int]] = {}
    for owner in storage:
        if not isinstance(owner, Mapping) or not isinstance(owner.get("name"), str):
            raise IndependentClassGeneratorReplayFailure("malformed storage owner")
        name = owner["name"]
        if name in result:
            raise IndependentClassGeneratorReplayFailure("duplicate storage owner")
        entries = _integers(owner.get("entries"), name + " entries")
        if owner.get("logicalLength") != str(len(entries)):
            raise IndependentClassGeneratorReplayFailure(name + " length changed")
        result[name] = entries
    return result


def _multiply_ideal(
    left: list[int], right: list[int], table: list[int], degree: int
) -> list[int]:
    if degree == 3:
        exact = importlib.import_module(
            "bench.pari-class-group-port.generator_order_witness"
        )
        output = [0] * 9
        status = exact._pari_exact_cubic_ideal_multiply(
            left, right, table, [0] * 27, [0] * 27, output
        )
        if status:
            raise IndependentClassGeneratorReplayFailure(
                "exact cubic ideal multiplication failed"
            )
        return output
    if degree == 4:
        replay = importlib.import_module(
            "bench.pari-class-group-port.field3_relation_replay_map"
        )
        return list(replay._quartic_product(tuple(left), tuple(right), tuple(table)))
    raise IndependentClassGeneratorReplayFailure("unsupported ideal degree")


def _principal_ideal(alpha: list[int], table: list[int], degree: int) -> list[int]:
    if degree == 3:
        reduction = importlib.import_module(
            "bench.pari-class-group-port.signed_prime_ideal_reduction"
        )
        output = [0] * 9
        reduction.pari_cubic_mul_matrix(table, alpha, output)
        return output
    if degree == 4:
        replay = importlib.import_module(
            "bench.pari-class-group-port.field3_relation_replay_map"
        )
        return list(replay._principal_hnf(tuple(alpha), tuple(table)))
    raise IndependentClassGeneratorReplayFailure("unsupported principal degree")


def _same_ideal(left: list[int], right: list[int], degree: int) -> bool:
    if degree == 3:
        presentation = importlib.import_module(
            "bench.pari-class-group-port.mixed_cubic_presentation"
        )
        return bool(presentation._same_lattice(left, right))
    return left == right


def replay_published_class_generators(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Independently replay every published nontrivial generator-order witness."""
    field = payload.get("field")
    group = payload.get("classGroup")
    if not isinstance(field, Mapping) or not isinstance(group, Mapping):
        raise IndependentClassGeneratorReplayFailure("field or class group is absent")
    degree = int(field.get("degree", 0))
    generator_count = int(group.get("generatorCount", 0))
    invariants = _integers(group.get("invariantFactors"), "invariant factors")
    class_number = int(group.get("classNumber", 0))
    product = 1
    for value in invariants:
        product *= value
    if product != class_number or len(invariants) != generator_count:
        raise IndependentClassGeneratorReplayFailure("class invariants changed")
    if generator_count == 0:
        return {
            "degree": degree,
            "classNumber": class_number,
            "generatorCount": 0,
            "principalRelationsReplayed": 0,
            "orderRelationsReplayed": 0,
        }

    owners = _owners(payload)
    required = {
        "class-generator-ideals",
        "class-order-principal-coefficients",
        "factor-base-ideals",
        "factor-map",
        "field-multiplication-table",
        "principal-generators",
        "raw-relation-records",
    }
    missing = sorted(required - owners.keys())
    if missing:
        raise IndependentClassGeneratorReplayFailure(
            "published payload lacks mathematical replay owners: " + ", ".join(missing)
        )
    table = owners["field-multiplication-table"]
    if len(table) != degree**3:
        raise IndependentClassGeneratorReplayFailure("multiplication table changed")
    factor_ideals = owners["factor-base-ideals"]
    if len(factor_ideals) % (degree * degree):
        raise IndependentClassGeneratorReplayFailure(
            "factor-base ideal storage changed"
        )
    rows = len(factor_ideals) // (degree * degree)
    relations = owners["raw-relation-records"]
    if rows == 0 or len(relations) % rows:
        raise IndependentClassGeneratorReplayFailure("relation matrix changed")
    columns = len(relations) // rows
    coefficients = owners["class-order-principal-coefficients"]
    factor_map = owners["factor-map"]
    generator_ideals = owners["class-generator-ideals"]
    principal_generators = owners["principal-generators"]
    if (
        len(coefficients) != generator_count * columns
        or len(factor_map) != generator_count * rows
        or len(generator_ideals) != generator_count * degree * degree
        or len(principal_generators) != columns * degree
    ):
        raise IndependentClassGeneratorReplayFailure("class witness shape changed")

    # PARI source order is retained separately when it differs from the neutral
    # normalized order (row 14 has [24,8] versus [8,24]).
    orders = owners.get("class-source-invariants", invariants)
    if len(orders) != generator_count:
        raise IndependentClassGeneratorReplayFailure("generator orders changed")

    identity = [
        1 if row == column else 0 for row in range(degree) for column in range(degree)
    ]
    used_relations = {
        column
        for generator in range(generator_count)
        for column in range(columns)
        if coefficients[generator * columns + column]
    }
    ideal_products = 0
    for column in sorted(used_relations):
        relation_product = identity
        for row in range(rows):
            exponent = relations[column * rows + row]
            if exponent < 0 or exponent > 64:
                raise IndependentClassGeneratorReplayFailure(
                    "raw relation exponent left the replay bound"
                )
            ideal = factor_ideals[row * degree * degree : (row + 1) * degree * degree]
            for _ in range(exponent):
                relation_product = _multiply_ideal(
                    relation_product, ideal, table, degree
                )
                ideal_products += 1
        alpha = principal_generators[column * degree : (column + 1) * degree]
        if not any(alpha) or not _same_ideal(
            relation_product, _principal_ideal(alpha, table, degree), degree
        ):
            raise IndependentClassGeneratorReplayFailure(
                f"raw principal equation failed at relation {column}"
            )

    for generator in range(generator_count):
        coefficient = coefficients[generator * columns : (generator + 1) * columns]
        factor_exponents = factor_map[generator * rows : (generator + 1) * rows]
        order = orders[generator]
        for row in range(rows):
            total = sum(
                relations[column * rows + row] * coefficient[column]
                for column in range(columns)
            )
            if total != order * factor_exponents[row]:
                raise IndependentClassGeneratorReplayFailure(
                    f"generator {generator} order relation failed at factor row {row}"
                )
        product_ideal = identity
        for row, exponent in enumerate(factor_exponents):
            if exponent < 0 or exponent > 64:
                raise IndependentClassGeneratorReplayFailure(
                    "class factor exponent left the replay bound"
                )
            ideal = factor_ideals[row * degree * degree : (row + 1) * degree * degree]
            for _ in range(exponent):
                product_ideal = _multiply_ideal(product_ideal, ideal, table, degree)
                ideal_products += 1
        published = generator_ideals[
            generator * degree * degree : (generator + 1) * degree * degree
        ]
        if not _same_ideal(product_ideal, published, degree):
            raise IndependentClassGeneratorReplayFailure(
                f"published class generator {generator} is not its factor-base product"
            )

    return {
        "degree": degree,
        "classNumber": class_number,
        "generatorCount": generator_count,
        "factorBaseSize": rows,
        "relationCount": columns,
        "principalRelationsReplayed": len(used_relations),
        "orderRelationsReplayed": generator_count,
        "idealMultiplications": ideal_products,
        "factoredPrincipalWitnessesExact": True,
    }


__all__ = [
    "IndependentClassGeneratorReplayFailure",
    "replay_published_class_generators",
]
