"""Fresh-prepared compact rank-two unit suffix for panel row 3.

This is the prepared-only entry point for the existing row-3 source replay,
regulator bridge, and ``getfu(LARGE)`` arithmetic.  It consumes the live
relation/HNF/acceptance owner; it never opens the retained driver trace.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Mapping, Sequence

from .panel1_exact_unit_authority import _norm
from .row34_real_cubic_presentation import _source_replay
from .row3_real_cubic_class_witness import compose_row3_real_cubic_class_witness
from .row3_rank2_unit_authority import (
    DEGREE,
    KERNEL,
    LOG_STRIDE,
    PLACES,
    RANK,
    RELATIONS,
    ROWS,
    _compose,
    _generator_signs,
    _raw_provenance,
    _root_intervals,
)
from .row4_rank2_unit_authority import (
    _bridge_with_exact_sign_fallback,
    _getfu_large,
)


SCHEMA = "sagejs.pari-class-group/row3-fresh-unit-suffix-v1"


class Row3FreshUnitFailure(ValueError):
    """The fresh row-3 compact unit suffix failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Row3FreshUnitFailure(label + " is not an integer sequence")
    if len(value) != length:
        raise Row3FreshUnitFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row3FreshUnitFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row3FreshUnitFailure(label + " is not canonical integer data")
        result.append(integer)
    return result


def compose_row3_fresh_unit_suffix(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Derive exact compact units from live prepared/relation owners."""
    records = _integers(payload.get("records"), ROWS * RELATIONS, "relations")
    generators = _integers(
        payload.get("generators"), DEGREE * RELATIONS, "principal generators"
    )
    raw_logs = _integers(
        payload.get("logs"), LOG_STRIDE * RELATIONS, "packed logarithms"
    )
    initial_permutation = _integers(
        payload.get("initialPermutation"), ROWS, "initial permutation"
    )
    expected_permutation = _integers(
        payload.get("terminalPermutation"), ROWS, "terminal permutation"
    )
    expected_w = _integers(payload.get("w"), 4, "terminal W")
    expected_b = _integers(payload.get("b"), 2 * 666, "terminal B")
    expected_c = _integers(payload.get("c"), LOG_STRIDE * RELATIONS, "terminal C")
    lattice = _integers(payload.get("relationLattice"), 14, "unit lattice")
    regulator = _integers(payload.get("regulator"), 3, "regulator")

    source = _source_replay(
        records,
        raw_logs,
        initial_permutation,
        ROWS,
        RELATIONS,
        4,
    )
    if (
        source["state"] != [2, 9, 666, 0, 7, 69, 0, 675, 0]
        or source["permutation"] != expected_permutation
        or source["w"] != expected_w
        or source["b"][: len(expected_b)] != expected_b
        or source["c"] != expected_c
    ):
        raise Row3FreshUnitFailure("live source replay differs from HNF owner")
    raw_to_kernel = source["kernelMap"]
    kernel_logs = source["c"][: LOG_STRIDE * KERNEL]

    prepared = payload.get("prepared")
    if not isinstance(prepared, Mapping):
        raise Row3FreshUnitFailure("prepared unit input is not an object")
    tensor = _integers(prepared.get("basisTable"), 27, "multiplication tensor")
    embedding_m = _integers(prepared.get("embeddingM"), 27, "embedding matrix")
    embedding_g = _integers(prepared.get("embeddingG"), 27, "root embedding")
    basis = _integers(prepared.get("basis"), 9, "integral basis")
    denominator = int(prepared.get("basisDenominator"))
    if denominator <= 0:
        raise Row3FreshUnitFailure("integral basis denominator is not positive")

    try:
        bridge = _bridge_with_exact_sign_fallback(kernel_logs, lattice, regulator)
        getfu = _getfu_large(bridge["cleanLogs"], embedding_m, tensor)
    except ValueError as error:
        raise Row3FreshUnitFailure(
            "translated unit suffix failed: " + str(error)
        ) from error
    if getfu["state"] != [2, 0, 0, 22, 0, 0, 0, 0]:
        raise Row3FreshUnitFailure("getfu LARGE state changed")
    transform = _compose(bridge["transform"], getfu["factor"])
    provenance = _raw_provenance(raw_to_kernel, transform)

    ideal_exponents = [
        sum(
            records[source_index * ROWS + row]
            * provenance[unit * RELATIONS + source_index]
            for source_index in range(RELATIONS)
        )
        for unit in range(RANK)
        for row in range(ROWS)
    ]
    if any(ideal_exponents):
        raise Row3FreshUnitFailure("factored units do not have principal ideal one")

    factor_norms = _integers(payload.get("factorNorms"), ROWS, "factor norms")
    generator_norms: list[int] = []
    for relation in range(RELATIONS):
        norm = _norm(generators[3 * relation : 3 * relation + 3], tensor)
        expected_absolute = 1
        for row in range(ROWS):
            exponent = records[relation * ROWS + row]
            if exponent:
                expected_absolute *= factor_norms[row] ** exponent
        if abs(norm) != expected_absolute:
            raise Row3FreshUnitFailure("principal relation norm replay failed")
        generator_norms.append(norm)
    unit_norms = [
        -1
        if sum(
            (provenance[unit * RELATIONS + relation] & 1)
            for relation in range(RELATIONS)
            if generator_norms[relation] < 0
        )
        & 1
        else 1
        for unit in range(RANK)
    ]

    intervals = _root_intervals(embedding_g)
    generator_signs = _generator_signs(
        generators, generator_norms, basis, denominator, intervals
    )
    unit_signs = [
        -1
        if sum(
            (provenance[unit * RELATIONS + relation] & 1)
            for relation in range(RELATIONS)
            if generator_signs[3 * relation + place] < 0
        )
        & 1
        else 1
        for unit in range(RANK)
        for place in range(PLACES)
    ]
    for unit in range(RANK):
        if (
            unit_signs[3 * unit] * unit_signs[3 * unit + 1] * unit_signs[3 * unit + 2]
            != unit_norms[unit]
        ):
            raise Row3FreshUnitFailure("unit signs disagree with exact norm")

    # The existing class-witness arithmetic is already input-neutral once it
    # has a presentation owner.  Construct that owner privately from this
    # live replay instead of weakening its public historical authority.
    source_descriptors = _integers(
        payload.get("factorDescriptors"), 16 * ROWS, "factor descriptors"
    )
    source_ideals = _integers(payload.get("factorIdeals"), 9 * ROWS, "factor ideals")
    terminal_descriptors = [
        source_descriptors[16 * (source - 1) + offset]
        for source in expected_permutation
        for offset in range(16)
    ]
    terminal_ideals = [
        source_ideals[9 * (source - 1) + offset]
        for source in expected_permutation
        for offset in range(9)
    ]
    presentation_owner = {
        "schema": "sagejs.pari-class-group/row34-real-cubic-presentation-v1",
        "field": {
            "id": "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9",
            "panelIndex": 3,
            "multiplicationTensor": [str(value) for value in tensor],
        },
        "dimensions": {
            "degree": 3,
            "factorBaseSize": ROWS,
            "relationCount": RELATIONS,
            "classPresentationDimension": 2,
        },
        "presentation": {
            "terminalW": [str(value) for value in expected_w],
            "classNumber": "6",
            "invariants": ["6"],
            "rawToClassPresentation": [str(value) for value in source["classMap"]],
        },
        "relations": {
            "matrix": [str(value) for value in records],
            "principalGenerators": [str(value) for value in generators],
        },
        "replay": {
            "terminalPermutation": [str(value) for value in expected_permutation],
        },
        "factorBase": {
            "descriptors": [str(value) for value in terminal_descriptors],
            "ideals": [str(value) for value in terminal_ideals],
        },
    }
    class_witness = compose_row3_real_cubic_class_witness(
        presentation_owner,
        {
            "preparedSha256": payload.get("preparedSha256"),
            "freshPreparedRoot": True,
            "frozenW0UsedAsInput": False,
        },
    )

    return {
        "schema": SCHEMA,
        "source": {
            "preparedNfLiveRoot": True,
            "frozenW0UsedAsInput": False,
            "hnfState": source["state"],
        },
        "units": {
            "materialization": "not_given(LARGE)",
            "reason": "LARGE",
            "unitKernelTransform": [str(value) for value in transform],
            "rawUnitProvenance": [str(value) for value in provenance],
            "unitNorms": [str(value) for value in unit_norms],
            "unitRealSigns": unit_signs,
        },
        "regulator": {
            "packed": [str(value) for value in regulator],
            "computedFloat": bridge["computedRegulator"],
            "expectedFloat": bridge["expectedRegulator"],
        },
        "replay": {
            "bridgeStatus": bridge["bridgeStatus"],
            "bridgeState": bridge["bridgeState"],
            "getfuStatus": getfu["status"],
            "getfuState": getfu["state"],
            "getfuFactor": [str(value) for value in getfu["factor"]],
            "rawRelationsTimesUnitsZero": True,
            "allPrincipalRelationNormsReplayed": True,
            "allPrincipalGeneratorSignsProved": True,
        },
        "classWitness": class_witness,
        "completion": {
            "compactFactoredUnitsRetained": True,
            "exactExpandedUnitsPublished": False,
            "exactSuffixComplete": True,
            "inputBoundaryComplete": True,
            "classWitnessComplete": True,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


def _main() -> None:
    payload = json.load(sys.stdin)
    json.dump(
        compose_row3_fresh_unit_suffix(payload), sys.stdout, separators=(",", ":")
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    _main()


__all__ = ["SCHEMA", "Row3FreshUnitFailure", "compose_row3_fresh_unit_suffix"]
