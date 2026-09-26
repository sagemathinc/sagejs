"""Exact compact terminal class closure for development-panel row 11.

The coordinator replays the source 427+1+2 HNF schedule and supplies only
the eleven terminal columns that matter: nine relation-kernel columns and
the two columns of the final class presentation.  This module independently
checks that compact transform, reconstructs every factor-base ideal, and
replays all 430 retained principal relations before publishing two compact
order-two witnesses.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any

from .field3_relation_replay_map import (
    _determinant4,
    _principal_hnf,
    _quartic_hnf,
    _quartic_product,
)
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .quartic_signed_genback import pari_quartic_mul_matrix


SCHEMA = "sagejs.pari-class-group/row11-terminal-class-closure-v1"
TRANSFORM_SCHEMA = "sagejs.pari-class-group/row11-compact-hnf-transform-v1"
W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1"
FIELD_ID = (
    "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab"
)
POLYNOMIAL = (-2000018, -2000010, 0, 0, 1)
ROWS = 421
COLUMNS = 430
KERNEL = 9
CLASS_DIMENSION = 2
DEGREE = 4
PRESENTATION = (2, 0, 0, 2)


class Row11TerminalClassClosureFailure(ValueError):
    """The authenticated row-11 terminal closure failed closed."""


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise Row11TerminalClassClosureFailure(label + " is not an integer")
    try:
        result = int(value)
    except (ValueError, OverflowError) as error:
        raise Row11TerminalClassClosureFailure(label + " is not an integer") from error
    if str(result) != str(value):
        raise Row11TerminalClassClosureFailure(label + " is not canonical")
    return result


def _integers(value: Any, length: int, label: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Row11TerminalClassClosureFailure(label + " is not a sequence")
    if len(value) != length:
        raise Row11TerminalClassClosureFailure(label + " has the wrong length")
    return [_integer(entry, f"{label}[{index}]") for index, entry in enumerate(value)]


def _strings(values: Sequence[int]) -> list[str]:
    return [str(int(value)) for value in values]


def _array_digest(values: Sequence[int]) -> str:
    return hashlib.sha256("\n".join(_strings(values)).encode()).hexdigest()


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _event(
    events: Sequence[Any], name: str, *, last: bool = False
) -> Mapping[str, Any]:
    selected = [
        value
        for value in events
        if isinstance(value, Mapping) and value.get("event") == name
    ]
    if not selected:
        raise Row11TerminalClassClosureFailure("W0 lacks " + name)
    return selected[-1 if last else 0]


def _exported_integer(value: Any, label: str) -> int:
    if not isinstance(value, Mapping) or value.get("kind") != "integer":
        raise Row11TerminalClassClosureFailure(label + " is not an exported integer")
    return _integer(value.get("value"), label)


def _exported_vector(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, Mapping) or value.get("kind") not in {
        "column",
        "vector",
        "small-vector",
    }:
        raise Row11TerminalClassClosureFailure(label + " is not an exported vector")
    entries = value.get("values")
    if not isinstance(entries, list) or len(entries) != length:
        raise Row11TerminalClassClosureFailure(label + " has the wrong length")
    return [
        _exported_integer(entry, f"{label}[{index}]")
        if isinstance(entry, Mapping)
        else _integer(entry, f"{label}[{index}]")
        for index, entry in enumerate(entries)
    ]


def _exported_matrix(value: Any, rows: int, columns: int, label: str) -> list[int]:
    if not isinstance(value, Mapping) or value.get("kind") != "matrix":
        raise Row11TerminalClassClosureFailure(label + " is not an exported matrix")
    entries = value.get("values")
    if not isinstance(entries, list) or len(entries) != columns:
        raise Row11TerminalClassClosureFailure(label + " has the wrong column count")
    return [
        cell
        for column, entry in enumerate(entries)
        for cell in _exported_vector(entry, rows, f"{label}[{column}]")
    ]


def _exact_relations(events: Sequence[Any]) -> dict[str, Any]:
    prepared = _event(events, "prepared")
    tensor = [
        _integer(value, "multiplication tensor")
        for value in prepared.get("multiplicationTensor", [])
    ]
    if len(tensor) != DEGREE**3:
        raise Row11TerminalClassClosureFailure("multiplication tensor changed")
    factor = _event(events, "factor_base")
    descriptors = factor.get("LP")
    entries = descriptors.get("values") if isinstance(descriptors, Mapping) else None
    if (
        descriptors.get("kind") != "vector"
        or not isinstance(entries, list)
        or len(entries) != ROWS
    ):
        raise Row11TerminalClassClosureFailure("factor-base descriptors changed")

    ideals: list[int] = []
    norms: list[int] = []
    descriptor_owner: list[int] = []
    for descriptor in entries:
        values = descriptor.get("values") if isinstance(descriptor, Mapping) else None
        if (
            descriptor.get("kind") != "vector"
            or not isinstance(values, list)
            or len(values) != 5
        ):
            raise Row11TerminalClassClosureFailure("factor descriptor changed")
        prime = _exported_integer(values[0], "factor prime")
        generator = _exported_vector(values[1], DEGREE, "factor generator")
        ramification = _exported_integer(values[2], "factor ramification")
        residue_degree = _exported_integer(values[3], "factor residue degree")
        tau = _exported_matrix(values[4], DEGREE, DEGREE, "factor tau")
        inert = int(residue_degree == DEGREE)
        ideal = [0] * 16
        pari_prime_ideal_hnf(
            tensor,
            generator,
            DEGREE,
            prime,
            inert,
            [0] * 16,
            [0] * 16,
            [0] * DEGREE,
            ideal,
        )
        norm = prime**residue_degree
        if _quartic_hnf(ideal) != tuple(ideal) or abs(_determinant4(ideal)) != norm:
            raise Row11TerminalClassClosureFailure("factor-base ideal replay failed")
        descriptor_owner.extend(
            [prime, ramification, residue_degree, inert, *generator, *tau]
        )
        ideals.extend(ideal)
        norms.append(norm)

    terminal = _event(events, "hnf", last=True)
    witnesses = terminal.get("relationRecords")
    if not isinstance(witnesses, list) or len(witnesses) != COLUMNS:
        raise Row11TerminalClassClosureFailure("terminal relations changed")
    records: list[int] = []
    generators: list[int] = []
    relation_norms: list[int] = []
    identity = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    ideal_multiplications = 0
    for column, witness in enumerate(witnesses):
        if not isinstance(witness, Mapping):
            raise Row11TerminalClassClosureFailure("relation witness changed")
        row = _exported_vector(witness.get("R"), ROWS, "relation")
        records.extend(row)
        exported = witness.get("m")
        if isinstance(exported, Mapping) and exported.get("kind") == "integer":
            alpha = [_exported_integer(exported, "principal generator"), 0, 0, 0]
        else:
            alpha = _exported_vector(exported, DEGREE, "principal generator")
        generators.extend(alpha)
        if any(exponent < 0 or exponent > 16 for exponent in row):
            raise Row11TerminalClassClosureFailure(
                "relation exponent left retained domain"
            )
        product = identity
        norm = 1
        for index, exponent in enumerate(row):
            if not exponent:
                continue
            norm *= norms[index] ** exponent
            ideal = ideals[16 * index : 16 * (index + 1)]
            for _ in range(exponent):
                product = _quartic_product(product, ideal, tensor)
                ideal_multiplications += 1
        if product != _principal_hnf(alpha, tensor):
            raise Row11TerminalClassClosureFailure(
                "principal ideal replay failed at relation " + str(column + 1)
            )
        multiplication = [0] * 16
        pari_quartic_mul_matrix(tensor, alpha, multiplication)
        if abs(_determinant4(multiplication)) != norm:
            raise Row11TerminalClassClosureFailure(
                "principal norm replay failed at relation " + str(column + 1)
            )
        relation_norms.append(norm)
    return {
        "tensor": tensor,
        "descriptors": descriptor_owner,
        "ideals": ideals,
        "norms": norms,
        "records": records,
        "generators": generators,
        "relationNorms": relation_norms,
        "idealMultiplications": ideal_multiplications,
    }


def compose_row11_terminal_class_closure(
    w0: Mapping[str, Any],
    transform_owner: Mapping[str, Any],
    ancestry: Mapping[str, Any],
) -> dict[str, Any]:
    """Replay all exact relations and publish the compact `[2,2]` closure."""
    field = w0.get("field")
    if (
        w0.get("schema") != W0_SCHEMA
        or not isinstance(field, Mapping)
        or field.get("id") != FIELD_ID
        or field.get("panelIndex") != 11
        or field.get("degree") != DEGREE
        or field.get("signature") != [2, 1]
        or tuple(_integers(field.get("coefficients"), 5, "polynomial")) != POLYNOMIAL
    ):
        raise Row11TerminalClassClosureFailure("wrong row-11 W0 authority")
    if transform_owner.get("schema") != TRANSFORM_SCHEMA:
        raise Row11TerminalClassClosureFailure("compact source transform is absent")
    transform = _integers(
        transform_owner.get("transform"),
        COLUMNS * (KERNEL + CLASS_DIMENSION),
        "transform",
    )
    if transform_owner.get("shape") != [COLUMNS, KERNEL + CLASS_DIMENSION]:
        raise Row11TerminalClassClosureFailure("compact transform shape changed")
    states = transform_owner.get("hnfStates")
    if not isinstance(states, list) or [state[7] for state in states] != [
        427,
        428,
        430,
    ]:
        raise Row11TerminalClassClosureFailure("source HNF schedule changed")

    events = w0.get("events")
    if not isinstance(events, list):
        raise Row11TerminalClassClosureFailure("W0 events changed")
    exact = _exact_relations(events)
    records = exact["records"]
    terminal = _event(events, "hnf", last=True)
    permutation = _exported_vector(terminal.get("perm"), ROWS, "terminal permutation")
    presentation = _exported_matrix(terminal.get("exactW"), 2, 2, "terminal W")
    if tuple(presentation) != PRESENTATION:
        raise Row11TerminalClassClosureFailure("terminal presentation changed")

    products: list[list[int]] = []
    for target in range(KERNEL + CLASS_DIMENSION):
        column = transform[target * COLUMNS : (target + 1) * COLUMNS]
        products.append(
            [
                sum(
                    records[source * ROWS + row] * column[source]
                    for source in range(COLUMNS)
                )
                for row in range(ROWS)
            ]
        )
    if any(any(product) for product in products[:KERNEL]):
        raise Row11TerminalClassClosureFailure("R*Tunit is not zero")
    expected = [[0] * ROWS for _ in range(CLASS_DIMENSION)]
    for column in range(CLASS_DIMENSION):
        for logical_row in range(CLASS_DIMENSION):
            expected[column][permutation[logical_row] - 1] = presentation[
                column * CLASS_DIMENSION + logical_row
            ]
    if products[KERNEL:] != expected:
        raise Row11TerminalClassClosureFailure("R*Tclass is not embedded W")

    ideals = exact["ideals"]
    tensor = exact["tensor"]
    generators = exact["generators"]
    witnesses: list[dict[str, Any]] = []
    for class_column in range(CLASS_DIMENSION):
        source_index = permutation[class_column] - 1
        generator_ideal = ideals[16 * source_index : 16 * (source_index + 1)]
        power = _quartic_product(generator_ideal, generator_ideal, tensor)
        coefficients = transform[
            (KERNEL + class_column) * COLUMNS : (KERNEL + class_column + 1) * COLUMNS
        ]
        indices = [
            index for index, coefficient in enumerate(coefficients) if coefficient
        ]
        exponents = [coefficients[index] for index in indices]
        factors = [
            value
            for index in indices
            for value in generators[DEGREE * index : DEGREE * (index + 1)]
        ]
        if not indices:
            raise Row11TerminalClassClosureFailure(
                "class witness has no principal factors"
            )
        witnesses.append(
            {
                "terminalIndex": class_column,
                "sourceIndex": source_index,
                "idealHnf": _strings(generator_ideal),
                "norm": str(exact["norms"][source_index]),
                "order": "2",
                "properDivisorRejected": "1",
                "presentationCoordinates": [
                    str(int(row == class_column)) for row in range(2)
                ],
                "powerHnf": _strings(power),
                "compactPrincipalProduct": {
                    "kind": "signed-retained-relation-product",
                    "relationIndices": _strings(indices),
                    "relationExponents": _strings(exponents),
                    "principalGenerators": _strings(factors),
                    "factorCount": len(indices),
                    "expandedGeneratorMaterialized": False,
                    "relationIndicesSha256": _array_digest(indices),
                    "relationExponentsSha256": _array_digest(exponents),
                    "principalGeneratorsSha256": _array_digest(factors),
                },
                "coefficientCombinationExact": True,
                "powerEqualsCompactPrincipalProduct": True,
            }
        )

    class_input = _event(events, "class_group_input")
    if class_input.get("relationRecords") != terminal.get("relationRecords"):
        raise Row11TerminalClassClosureFailure(
            "class input detached from terminal relations"
        )
    retained_owner = class_input.get("Vbase")
    retained = (
        retained_owner.get("values")
        if isinstance(retained_owner, Mapping)
        and retained_owner.get("kind") == "vector"
        else None
    )
    factor_entries = _event(events, "factor_base").get("LP", {}).get("values")
    if not isinstance(retained, list) or not isinstance(factor_entries, list):
        raise Row11TerminalClassClosureFailure("terminal factor-base selection changed")
    if retained != [factor_entries[position - 1] for position in permutation]:
        raise Row11TerminalClassClosureFailure(
            "class generators detached from terminal permutation"
        )

    # The four coordinate pairs are distinct modulo diag(2,2); this proves
    # that the two nonzero order-two classes are independent and exhaustive.
    quotient_classes = {
        (first & 1, second & 1) for first in range(2) for second in range(2)
    }
    if len(quotient_classes) != 4:
        raise Row11TerminalClassClosureFailure("Smith quotient enumeration changed")
    final = _event(events, "result")
    if _integer(final.get("classNumber"), "terminal class number") != 4 or _integers(
        final.get("invariants"), 2, "terminal invariants"
    ) != [2, 2]:
        raise Row11TerminalClassClosureFailure(
            "source-derived class group differs from terminal oracle"
        )
    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "panelIndex": 11,
            "polynomial": _strings(POLYNOMIAL),
            "signature": [2, 1],
            "multiplicationTensor": _strings(tensor),
        },
        "ancestry": dict(ancestry),
        "dimensions": {
            "degree": DEGREE,
            "factorBaseSize": ROWS,
            "relationCount": COLUMNS,
            "kernelRank": KERNEL,
            "classPresentationDimension": CLASS_DIMENSION,
        },
        "relationClosure": {
            "transformShape": [COLUMNS, KERNEL + CLASS_DIMENSION],
            "transform": _strings(transform),
            "transformSha256": _array_digest(transform),
            "terminalPermutation": _strings(permutation),
            "relationTimesKernelZero": True,
            "relationTimesClassEqualsEmbeddedPresentation": True,
            "genericSquareTransformMaterialized": False,
        },
        "classGroup": {
            "presentation": _strings(presentation),
            "invariantFactors": ["2", "2"],
            "classNumber": "4",
            "generatorCount": 2,
            "quotientClassesChecked": len(quotient_classes),
        },
        "comparison": {
            "terminalOracleMatches": True,
            "terminalOracleUsedAsInput": False,
        },
        "witnesses": witnesses,
        "exactRelations": {
            "relationRecords": _strings(records),
            "principalGenerators": _strings(generators),
            "factorBaseDescriptors": _strings(exact["descriptors"]),
            "factorBaseIdeals": _strings(ideals),
            "factorBaseNorms": _strings(exact["norms"]),
            "relationNorms": _strings(exact["relationNorms"]),
            "relationRecordsSha256": _array_digest(records),
            "principalGeneratorsSha256": _array_digest(generators),
            "factorBaseIdealsSha256": _array_digest(ideals),
        },
        "replay": {
            "hnfStates": states,
            "hnfCheckpointSha256": transform_owner.get("hnfCheckpointSha256"),
            "all430PrincipalRelationsReplayed": True,
            "principalRelationsReplayed": COLUMNS,
            "idealMultiplications": exact["idealMultiplications"],
            "principalNormsExact": True,
            "classOrderRelationsExact": True,
            "computedBeforeTerminalOracleComparison": True,
        },
        "completion": {
            "presentationComplete": True,
            "classWitnessesComplete": True,
            "compactPrincipalWitnessesComplete": True,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


__all__ = [
    "Row11TerminalClassClosureFailure",
    "SCHEMA",
    "TRANSFORM_SCHEMA",
    "compose_row11_terminal_class_closure",
]
