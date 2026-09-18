"""Exact compact rank-two units for development-panel row 3.

This producer starts from the authenticated row-3 presentation and pristine
relation trace.  It reruns the source HNF/log schedule, derives the rank-two
unit transform, and retains both units as exact signed products of the 675
authenticated principal relation generators.  PARI's flag-zero `LARGE`
policy is reproduced faithfully, so expanded power-basis coordinates are not
invented.

The pristine `fundamental_units` and terminal result events are never read.
PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from fractions import Fraction
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from .panel1_exact_unit_authority import _evaluate, _evaluate_interval, _norm
from .row34_real_cubic_presentation import (
    SCHEMA as PRESENTATION_SCHEMA,
    W0_SCHEMA,
    _event,
    _exported_vector,
    _raw_relations_and_logs,
    _source_replay,
)
from .row4_rank2_unit_authority import (
    _bridge_with_exact_sign_fallback,
    _getfu_large,
)


OUTPUT_SCHEMA = "sagejs.pari-class-group/row3-rank2-unit-authority-v1"
PRESENTATION_SHA256 = "200190446c7128e2fe8d549924f76c1ddfce205f857a0d55a1d523d287dd868b"
W0_SHA256 = "8ef5cd64a3baaf0ff6f3e57951cdb0d1a7549879aef6dd089d5a69b39da970b9"
FIELD_ID = (
    "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9"
)
POLYNOMIAL = [20000000042, -20000000022, 0, 1]
ROWS = 668
RELATIONS = 675
KERNEL = 7
RANK = 2
DEGREE = 3
PLACES = 3
LOG_STRIDE = 21


class Row3UnitFailure(ValueError):
    """The row-3 compact unit authority failed closed."""


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Row3UnitFailure(label + " is not an object")
    return value


def _integers(value: Any, length: int, label: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != length
    ):
        raise Row3UnitFailure(label + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row3UnitFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row3UnitFailure(label + " is not canonical integer data")
        answer.append(integer)
    return answer


def _array_sha256(values: Sequence[int]) -> str:
    return hashlib.sha256(
        "\n".join(str(value) for value in values).encode()
    ).hexdigest()


def _canonical_sha256(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    ).hexdigest()


def _file_sha256(value: Any) -> str:
    return hashlib.sha256(
        (json.dumps(value, separators=(",", ":"), ensure_ascii=True) + "\n").encode(
            "ascii"
        )
    ).hexdigest()


def _compose(left: Sequence[int], right: Sequence[int]) -> list[int]:
    """Compose column-major 7-by-2 and 2-by-2 transforms."""
    return [
        sum(
            left[source * KERNEL + row] * right[column * 2 + source]
            for source in range(2)
        )
        for column in range(2)
        for row in range(KERNEL)
    ]


def _raw_provenance(
    raw_to_kernel: Sequence[int], transform: Sequence[int]
) -> list[int]:
    return [
        sum(
            raw_to_kernel[kernel * RELATIONS + relation]
            * transform[unit * KERNEL + kernel]
            for kernel in range(KERNEL)
        )
        for unit in range(RANK)
        for relation in range(RELATIONS)
    ]


def _root_intervals(embedding: Any) -> list[list[str]]:
    triples = _integers(embedding, 27, "prepared root embedding")
    intervals: list[list[str]] = []
    for place in range(PLACES):
        at = 3 * (3 * place + 1)
        mantissa, precision, exponent = triples[at : at + 3]
        if mantissa == 0 or precision < 64 or precision % 64 != 0:
            raise Row3UnitFailure("prepared root approximation is invalid")
        shift = exponent - precision + 1
        approximation = (
            Fraction(mantissa << shift)
            if shift >= 0
            else Fraction(mantissa, 1 << -shift)
        )
        lower = approximation.numerator // approximation.denominator
        upper = lower + 1
        if intervals and int(intervals[-1][1]) >= lower:
            raise Row3UnitFailure("prepared roots are not ordered and disjoint")
        left = _evaluate(POLYNOMIAL, Fraction(lower))
        right = _evaluate(POLYNOMIAL, Fraction(upper))
        if left == 0 or right == 0 or (left < 0) == (right < 0):
            raise Row3UnitFailure("prepared root bracket lacks a sign change")
        intervals.append([str(lower), str(upper)])
    return intervals


def _generator_signs(
    generators: Sequence[int],
    generator_norms: Sequence[int],
    basis: Sequence[int],
    denominator: int,
    intervals_data: Sequence[Sequence[str]],
) -> list[int]:
    if denominator <= 0:
        raise Row3UnitFailure("integral basis denominator is not positive")
    intervals = [(Fraction(raw[0]), Fraction(raw[1])) for raw in intervals_data]
    signs: list[int] = []
    for relation in range(RELATIONS):
        element = generators[3 * relation : 3 * relation + 3]
        power = [
            sum(element[column] * basis[3 * column + row] for column in range(3))
            for row in range(3)
        ]
        relation_signs: list[int | None] = []
        for original_low, original_high in intervals:
            low, high = original_low, original_high
            left = _evaluate(POLYNOMIAL, low)
            right = _evaluate(POLYNOMIAL, high)
            if left == 0 or right == 0 or (left < 0) == (right < 0):
                raise Row3UnitFailure("root interval lost polynomial sign change")
            sign: int | None = None
            for _ in range(2048):
                value_low, value_high = _evaluate_interval(power, (low, high))
                if value_low > 0:
                    sign = 1
                    break
                if value_high < 0:
                    sign = -1
                    break
                middle = (low + high) / 2
                middle_value = _evaluate(POLYNOMIAL, middle)
                if middle_value == 0:
                    exact = _evaluate(power, middle)
                    if exact == 0:
                        raise Row3UnitFailure("principal generator is zero")
                    sign = 1 if exact > 0 else -1
                    break
                if (middle_value < 0) == (left < 0):
                    low, left = middle, middle_value
                else:
                    high, right = middle, middle_value
            relation_signs.append(sign)
        unknown = [index for index, sign in enumerate(relation_signs) if sign is None]
        if len(unknown) > 1:
            raise Row3UnitFailure("principal-generator root signs did not separate")
        if unknown:
            known = 1
            for sign in relation_signs:
                if sign is not None:
                    known *= sign
            norm_sign = 1 if generator_norms[relation] > 0 else -1
            relation_signs[unknown[0]] = norm_sign * known
        if relation_signs[0] * relation_signs[1] * relation_signs[2] != (
            1 if generator_norms[relation] > 0 else -1
        ):
            raise Row3UnitFailure("principal-generator signs disagree with exact norm")
        signs.extend(int(sign) for sign in relation_signs)
    return signs


def compose_row3_rank2_unit_authority(
    presentation_owner: Mapping[str, Any],
    presentation_sha256: str,
    w0: Mapping[str, Any],
    w0_sha256: str,
) -> dict[str, Any]:
    """Build exact factored units without reading a fundamental-unit answer."""
    owner = _mapping(presentation_owner, "presentation owner")
    if (
        presentation_sha256 != PRESENTATION_SHA256
        or _file_sha256(owner) != PRESENTATION_SHA256
        or owner.get("schema") != PRESENTATION_SCHEMA
        or _mapping(owner.get("field"), "field").get("id") != FIELD_ID
    ):
        raise Row3UnitFailure("wrong immutable row-3 presentation")
    if (
        w0_sha256 != W0_SHA256
        or _file_sha256(w0) != W0_SHA256
        or w0.get("schema") != W0_SCHEMA
    ):
        raise Row3UnitFailure("wrong pristine row-3 relation trace")
    field = _mapping(owner.get("field"), "field")
    dimensions = _mapping(owner.get("dimensions"), "dimensions")
    if (
        dimensions
        != {
            "degree": 3,
            "places": 3,
            "factorBaseSize": 668,
            "relationCount": 675,
            "kernelRank": 7,
            "unitRank": 2,
            "classPresentationDimension": 2,
            "subfactorCount": 4,
        }
        or _integers(field.get("polynomial"), 4, "field polynomial") != POLYNOMIAL
    ):
        raise Row3UnitFailure("row-3 field dimensions changed")

    relations = _mapping(owner.get("relations"), "relations")
    presentation = _mapping(owner.get("presentation"), "presentation")
    replay_owner = _mapping(owner.get("replay"), "presentation replay")
    records = _integers(relations.get("matrix"), ROWS * RELATIONS, "relations")
    generators = _integers(
        relations.get("principalGenerators"), DEGREE * RELATIONS, "principal generators"
    )
    raw_to_kernel = _integers(
        presentation.get("rawToKernel"), RELATIONS * KERNEL, "raw-to-kernel ancestry"
    )
    if (
        relations.get("matrixSha256") != _array_sha256(records)
        or relations.get("principalGeneratorsSha256") != _array_sha256(generators)
        or presentation.get("rawToKernelSha256") != _array_sha256(raw_to_kernel)
        or replay_owner.get("allPrincipalRelationsReplayed") is not True
        or replay_owner.get("rawRelationsTimesKernelZero") is not True
    ):
        raise Row3UnitFailure("row-3 presentation replay latches changed")

    events = w0.get("events")
    if not isinstance(events, list):
        raise Row3UnitFailure("pristine events are missing")
    prepared = _event(events, "prepared")
    hnf_events = [entry for entry in events if entry.get("event") == "hnf"]
    if len(hnf_events) != 1:
        raise Row3UnitFailure("pristine HNF event count changed")
    rebuilt_records, rebuilt_generators, raw_logs, scalar_prefix = (
        _raw_relations_and_logs(hnf_events[0], prepared, ROWS, RELATIONS)
    )
    if (
        rebuilt_records != records
        or rebuilt_generators != generators
        or scalar_prefix != relations.get("scalarPrefixCount")
        or _array_sha256(raw_logs) != relations.get("packedLogsSha256")
    ):
        raise Row3UnitFailure("pristine raw relation/log owners changed")
    factor = _event(events, "factor_base")
    source = _source_replay(
        records,
        raw_logs,
        _exported_vector(factor.get("perm"), ROWS, "initial permutation"),
        ROWS,
        RELATIONS,
        4,
    )
    kernel_logs = source["c"][: LOG_STRIDE * KERNEL]
    if (
        source["kernelMap"] != raw_to_kernel
        or source["state"] != replay_owner.get("hnfState")
        or source["permutation"]
        != _integers(
            replay_owner.get("terminalPermutation"), ROWS, "terminal permutation"
        )
    ):
        raise Row3UnitFailure("source rerun differs from presentation authority")

    lattice = _integers(presentation.get("relationLattice"), 14, "unit lattice")
    regulator = _integers(presentation.get("packedRegulator"), 3, "regulator")
    try:
        bridge = _bridge_with_exact_sign_fallback(kernel_logs, lattice, regulator)
        getfu = _getfu_large(
            bridge["cleanLogs"],
            _integers(field.get("embeddingM"), 27, "embedding matrix"),
            _integers(field.get("multiplicationTensor"), 27, "multiplication tensor"),
        )
    except ValueError as error:
        raise Row3UnitFailure(
            "row-3 translated unit suffix failed: " + str(error)
        ) from error
    if getfu["state"] != [2, 0, 0, 22, 0, 0, 0, 0]:
        raise Row3UnitFailure("row-3 getfu LARGE state changed")
    final_kernel_transform = _compose(bridge["transform"], getfu["factor"])
    provenance = _raw_provenance(raw_to_kernel, final_kernel_transform)

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
        raise Row3UnitFailure("factored units do not have principal ideal one")

    ordered_norms = _integers(
        _mapping(owner.get("factorBase"), "factor base").get("norms"),
        ROWS,
        "factor norms",
    )
    permutation = _integers(
        replay_owner.get("terminalPermutation"), ROWS, "permutation"
    )
    original_norms = [0] * ROWS
    for terminal, original in enumerate(permutation):
        original_norms[original - 1] = ordered_norms[terminal]
    tensor = _integers(field.get("multiplicationTensor"), 27, "multiplication tensor")
    generator_norms: list[int] = []
    for relation in range(RELATIONS):
        norm = _norm(generators[3 * relation : 3 * relation + 3], tensor)
        expected_absolute = 1
        for row in range(ROWS):
            exponent = records[relation * ROWS + row]
            if exponent:
                expected_absolute *= original_norms[row] ** exponent
        if abs(norm) != expected_absolute:
            raise Row3UnitFailure("principal relation norm replay failed")
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

    root_intervals = _root_intervals(field.get("embeddingG"))
    generator_signs = _generator_signs(
        generators,
        generator_norms,
        _integers(field.get("basis"), 9, "integral basis"),
        int(field.get("basisDenominator")),
        root_intervals,
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
            raise Row3UnitFailure("factored unit signs disagree with exact norm")

    arithmetic = {
        "kernelLogs": [str(value) for value in kernel_logs],
        "unitKernelTransform": [str(value) for value in final_kernel_transform],
        "rawUnitProvenance": [str(value) for value in provenance],
        "unitNorms": [str(value) for value in unit_norms],
        "unitRealSigns": unit_signs,
        "packedRegulator": [str(value) for value in regulator],
    }
    return {
        "schema": OUTPUT_SCHEMA,
        "field": dict(field),
        "dimensions": dict(dimensions),
        "ancestry": {
            "presentationAuthoritySha256": presentation_sha256,
            "pristineW0Sha256": w0_sha256,
            "producerSourceSha256": hashlib.sha256(
                Path(__file__).read_bytes()
            ).hexdigest(),
            "presentation": owner.get("ancestry"),
        },
        "sourceLogs": {
            "frozenW0UsedAsInput": True,
            "preparedNfLiveRoot": False,
            "qualifiedTiming": False,
            "rawPackedLogsSha256": _array_sha256(raw_logs),
            "kernelLogsShape": [PLACES, KERNEL, 7],
            "kernelLogs": arithmetic["kernelLogs"],
            "kernelLogsSha256": _array_sha256(kernel_logs),
        },
        "units": {
            "materialization": "not_given(LARGE)",
            "reason": "LARGE",
            "unitKernelTransformShape": [KERNEL, RANK],
            "unitKernelTransform": arithmetic["unitKernelTransform"],
            "rawUnitProvenanceShape": [RELATIONS, RANK],
            "rawUnitProvenance": arithmetic["rawUnitProvenance"],
            "factoredUnitBasis": "authenticated principalGenerators",
            "unitNorms": arithmetic["unitNorms"],
            "unitRealSignsShape": [PLACES, RANK],
            "unitRealSigns": unit_signs,
            "nonzeroRelationFactors": [
                sum(
                    value != 0
                    for value in provenance[unit * RELATIONS : (unit + 1) * RELATIONS]
                )
                for unit in range(RANK)
            ],
        },
        "regulator": {
            "packed": arithmetic["packedRegulator"],
            "computedFloat": bridge["computedRegulator"],
            "expectedFloat": bridge["expectedRegulator"],
            "source": "accepted relation lattice and source-scheduled kernel logs",
        },
        "replay": {
            "hnfState": source["state"],
            "bridgeStatus": bridge["bridgeStatus"],
            "bridgeState": bridge["bridgeState"],
            "bridgeTrace": bridge["bridgeTrace"],
            "u1": [str(value) for value in bridge["u1"]],
            "u2": [str(value) for value in bridge["u2"]],
            "getfuStatus": getfu["status"],
            "getfuState": getfu["state"],
            "getfuFactor": [str(value) for value in getfu["factor"]],
            "rawRelationsTimesUnitsZero": True,
            "allPrincipalRelationNormsReplayed": True,
            "allPrincipalGeneratorSignsProved": True,
            "fundamentalUnitEventRead": False,
            "terminalResultEventRead": False,
            "arithmeticSha256": _canonical_sha256(arithmetic),
        },
        "completion": {
            "compactFactoredUnitsRetained": True,
            "exactExpandedUnitsPublished": False,
            "exactSuffixComplete": True,
            "inputBoundaryComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


__all__ = [
    "OUTPUT_SCHEMA",
    "PRESENTATION_SHA256",
    "Row3UnitFailure",
    "W0_SHA256",
    "compose_row3_rank2_unit_authority",
]
