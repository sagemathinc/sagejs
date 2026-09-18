"""Exact compact rank-two units for development-panel row 4.

This boundary starts from the authenticated row-4 relation presentation and
the pristine relation trace.  It reruns the source HNF log schedule, derives
the rank-two lattice transform, and retains each unit as an exact product of
the 567 authenticated principal generators.  PARI's `LARGE` policy prevents
expanded power-basis coordinates; it does not prevent an exact factored unit
or its ideal, norm, and real-sign certificates from being published.

The pristine `fundamental_units` and terminal result events are deliberately
not read.  PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from fractions import Fraction
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from .float_conversion import pari_real_to_float
from .log_matrix_transform import pari_log_matrix_transform
from .panel1_exact_unit_authority import (
    _evaluate,
    _evaluate_interval,
    _norm,
)
from .regulator_scalar import (
    pari_regulator_scalar_add,
    pari_regulator_scalar_multiply,
)
from .row34_real_cubic_presentation import (
    SCHEMA as PRESENTATION_SCHEMA,
    W0_SCHEMA,
    _event,
    _exported_vector,
    _raw_relations_and_logs,
    _source_replay,
)
from .unit_bridge_cubic import pari_cubic_unit_bridge_prepare
from .unit_reconstruction_cubic import pari_getfu_real_cubic


OUTPUT_SCHEMA = "sagejs.pari-class-group/row4-rank2-unit-authority-v1"
PRESENTATION_SHA256 = "122f1a9f8731f3c6d7202426c4f1c9b133bff815091aff55dce0166c6c53bcfa"
W0_SHA256 = "acebe2f9f4bdfc0c3da76ab6d9ad1aa409a1fb0bfd4113ebec9b825c432e2cb8"
FIELD_ID = (
    "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9"
)
POLYNOMIAL = [20000000018, -20000000010, 0, 1]
ROWS = 560
RELATIONS = 567
KERNEL = 7
RANK = 2
DEGREE = 3
PLACES = 3
LOG_STRIDE = 21


class Row4UnitFailure(ValueError):
    """The row-4 compact unit authority failed closed."""


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Row4UnitFailure(label + " is not an object")
    return value


def _integers(value: Any, length: int, label: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != length
    ):
        raise Row4UnitFailure(label + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row4UnitFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row4UnitFailure(label + " is not canonical integer data")
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
    """Digest the strict compact JSON representation used by both owners."""

    return hashlib.sha256(
        (json.dumps(value, separators=(",", ":"), ensure_ascii=True) + "\n").encode(
            "ascii"
        )
    ).hexdigest()


def _zeros(length: int) -> list[int]:
    return [0] * length


def _floats(length: int) -> list[float]:
    return [0.0] * length


def _bridge_with_exact_sign_fallback(
    kernel_logs: list[int], lattice: list[int], regulator: list[int]
) -> dict[str, Any]:
    """Run the translated bridge through its known low-phase-precision stop.

    Row 4 combines one kernel column with coefficient `-35372943053`.
    The 192-bit raw phase loses 13 low bits and the generic bridge therefore
    stops before publishing approximate signs.  Its integer and real LLL
    transforms are already complete.  Below, signs are proved from exact root
    isolation instead, while the real logs and regulator are checked here.
    """

    square = KERNEL * KERNEL
    u1, u2, transform = _zeros(14), _zeros(4), _zeros(14)
    au, clean = _zeros(42), _zeros(18)
    signs, state, trace = _zeros(6), _zeros(5), _floats(5)
    arguments: list[Any] = [
        kernel_logs,
        lattice,
        KERNEL,
        regulator,
        u1,
        u2,
        transform,
        _zeros(42),
        _zeros(18),
        au,
        clean,
        signs,
        state,
        trace,
        _zeros(5),
        _zeros(14),
        _zeros(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(KERNEL),
        _zeros(KERNEL),
        _floats(14),
        _floats(square),
        _zeros(KERNEL),
        _zeros(KERNEL),
        _zeros(KERNEL),
        _floats(KERNEL),
        _floats(KERNEL),
        _floats(KERNEL),
        _zeros(KERNEL),
        _zeros(6),
        _zeros(3),
        _zeros(6),
        _zeros(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(2),
        _zeros(2),
        _floats(6),
        _floats(4),
        _zeros(2),
        _zeros(3),
        _zeros(3),
        _floats(3),
        _floats(3),
        _floats(3),
        _zeros(3),
        _zeros(2),
    ]
    status = pari_cubic_unit_bridge_prepare(*arguments)
    if status != 4 or state[:3] != [0, 0, 2]:
        raise Row4UnitFailure("rank-two bridge left the authenticated phase stop")
    if abs(u2[0] * u2[3] - u2[1] * u2[2]) != 1:
        raise Row4UnitFailure("rank-two real transform is not unimodular")

    # Recompute the complete transformed log matrix: the bridge returned at
    # the first imprecise phase before filling the final real-log entries.
    pari_log_matrix_transform(kernel_logs, transform, PLACES, KERNEL, RANK, False, au)
    for unit in range(RANK):
        sm = 0
        sp = -1
        se = 0
        for place in range(PLACES):
            source = 7 * (unit * PLACES + place) + 1
            target = 3 * (unit * PLACES + place)
            clean[target : target + 3] = au[source : source + 3]
            sm, sp, se = pari_regulator_scalar_add(
                sm, sp, se, au[source], au[source + 1], au[source + 2]
            )
        if abs(pari_real_to_float(sm, sp, se)) >= 0.001953125:
            raise Row4UnitFailure(
                "rank-two real logs do not satisfy the product formula"
            )
    am, ap, ae = pari_regulator_scalar_multiply(
        clean[0], clean[1], clean[2], clean[12], clean[13], clean[14]
    )
    bm, bp, be = pari_regulator_scalar_multiply(
        clean[9], clean[10], clean[11], clean[3], clean[4], clean[5]
    )
    dm, dp, de = pari_regulator_scalar_add(am, ap, ae, -bm, bp, be)
    computed = abs(pari_real_to_float(dm, dp, de))
    expected = pari_real_to_float(regulator[0], regulator[1], regulator[2])
    if abs(computed - expected) >= 0.5:
        raise Row4UnitFailure("rank-two regulator differs from acceptance authority")
    return {
        "bridgeStatus": status,
        "bridgeState": state,
        "bridgeTrace": trace,
        "u1": u1,
        "u2": u2,
        "transform": transform,
        "transformedLogs": au,
        "cleanLogs": clean,
        "computedRegulator": computed,
        "expectedRegulator": expected,
    }


def _getfu_large(
    clean: list[int], embedding: list[int], tensor: list[int]
) -> dict[str, Any]:
    scratch = 128
    state = _zeros(8)
    arguments: list[Any] = [
        clean,
        embedding,
        tensor,
        192,
        _zeros(18),
        _zeros(6),
        _zeros(4),
        _zeros(18),
        _zeros(18),
        _zeros(27),
        _zeros(18),
        _zeros(18),
        _zeros(6),
        _zeros(9),
        _zeros(3),
        _zeros(6),
        _zeros(6),
        _zeros(18),
        state,
        _zeros(3),
        _floats(4),
        _floats(4),
        _floats(2),
        _floats(6),
        _zeros(2),
        _floats(4),
        _zeros(2),
        _zeros(3),
        _zeros(3),
        _floats(3),
        _floats(3),
        _zeros(4),
        _zeros(4),
        _zeros(4),
        _zeros(2),
        _zeros(scratch),
        _zeros(scratch),
        _zeros(scratch),
        _zeros(scratch),
        _zeros(scratch),
        _zeros(scratch),
    ]
    status = pari_getfu_real_cubic(*arguments)
    if status != 2 or state[0] != 2 or state[3] <= 20:
        raise Row4UnitFailure("row-4 getfu did not return LARGE")
    return {
        "status": status,
        "state": state,
        "factor": arguments[6],
        "transformedLogs": arguments[7],
    }


def _compose(left: Sequence[int], right: Sequence[int]) -> list[int]:
    # Column-major KERNEL by 2, followed by column-major 2 by 2.
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


def _generator_signs(
    generators: Sequence[int],
    generator_norms: Sequence[int],
    basis: Sequence[int],
    denominator: int,
    intervals_data: Sequence[Sequence[str]],
) -> list[int]:
    if denominator <= 0:
        raise Row4UnitFailure("integral basis denominator is not positive")
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
                raise Row4UnitFailure("root interval lost polynomial sign change")
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
                        raise Row4UnitFailure("principal generator is zero")
                    sign = 1 if exact > 0 else -1
                    break
                if (middle_value < 0) == (left < 0):
                    low, left = middle, middle_value
                else:
                    high, right = middle, middle_value
            relation_signs.append(sign)
        unknown = [index for index, sign in enumerate(relation_signs) if sign is None]
        if len(unknown) > 1:
            raise Row4UnitFailure("principal-generator root signs did not separate")
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
            raise Row4UnitFailure("principal-generator signs disagree with exact norm")
        signs.extend(int(sign) for sign in relation_signs)
    return signs


def _root_intervals(embedding: Any) -> list[list[str]]:
    """Extract the three `x` entries from row-4's place-major `embeddingG`."""

    triples = _integers(embedding, 27, "prepared root embedding")
    intervals: list[list[str]] = []
    for place in range(PLACES):
        at = 3 * (3 * place + 1)
        mantissa, precision, exponent = triples[at : at + 3]
        if mantissa == 0 or precision < 64 or precision % 64 != 0:
            raise Row4UnitFailure("prepared root approximation is invalid")
        shift = exponent - precision + 1
        approximation = (
            Fraction(mantissa << shift)
            if shift >= 0
            else Fraction(mantissa, 1 << -shift)
        )
        lower = approximation.numerator // approximation.denominator
        upper = lower + 1
        if intervals and int(intervals[-1][1]) >= lower:
            raise Row4UnitFailure("prepared roots are not ordered and disjoint")
        left = _evaluate(POLYNOMIAL, Fraction(lower))
        right = _evaluate(POLYNOMIAL, Fraction(upper))
        if left == 0 or right == 0 or (left < 0) == (right < 0):
            raise Row4UnitFailure("prepared root bracket lacks a sign change")
        intervals.append([str(lower), str(upper)])
    return intervals


def compose_row4_rank2_unit_authority(
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
        raise Row4UnitFailure("wrong immutable row-4 presentation")
    if (
        w0_sha256 != W0_SHA256
        or _file_sha256(w0) != W0_SHA256
        or w0.get("schema") != W0_SCHEMA
    ):
        raise Row4UnitFailure("wrong pristine row-4 relation trace")
    field = _mapping(owner.get("field"), "field")
    dimensions = _mapping(owner.get("dimensions"), "dimensions")
    if (
        dimensions
        != {
            "degree": 3,
            "places": 3,
            "factorBaseSize": 560,
            "relationCount": 567,
            "kernelRank": 7,
            "unitRank": 2,
            "classPresentationDimension": 1,
            "subfactorCount": 4,
        }
        or _integers(field.get("polynomial"), 4, "field polynomial") != POLYNOMIAL
    ):
        raise Row4UnitFailure("row-4 field dimensions changed")
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
        raise Row4UnitFailure("row-4 presentation replay latches changed")

    events = w0.get("events")
    if not isinstance(events, list):
        raise Row4UnitFailure("pristine events are missing")
    prepared = _event(events, "prepared")
    hnf_events = [entry for entry in events if entry.get("event") == "hnf"]
    if len(hnf_events) != 1:
        raise Row4UnitFailure("pristine HNF event count changed")
    rebuilt_records, rebuilt_generators, raw_logs, scalar_prefix = (
        _raw_relations_and_logs(hnf_events[0], prepared, ROWS, RELATIONS)
    )
    if (
        rebuilt_records != records
        or rebuilt_generators != generators
        or scalar_prefix != relations.get("scalarPrefixCount")
        or _array_sha256(raw_logs) != relations.get("packedLogsSha256")
    ):
        raise Row4UnitFailure("pristine raw relation/log owners changed")
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
        raise Row4UnitFailure("source rerun differs from presentation authority")

    lattice = _integers(presentation.get("relationLattice"), 14, "unit lattice")
    regulator = _integers(presentation.get("packedRegulator"), 3, "regulator")
    bridge = _bridge_with_exact_sign_fallback(kernel_logs, lattice, regulator)
    tensor = _integers(field.get("multiplicationTensor"), 27, "multiplication tensor")
    embedding = _integers(field.get("embeddingM"), 27, "embedding matrix")
    getfu = _getfu_large(bridge["cleanLogs"], embedding, tensor)
    final_kernel_transform = _compose(bridge["transform"], getfu["factor"])
    provenance = _raw_provenance(raw_to_kernel, final_kernel_transform)

    # Prove the compact products have trivial principal ideals.  This repeats
    # the aggregate R*T check at the final two-column boundary.
    ideal_exponents = [
        sum(
            records[source * ROWS + row] * provenance[unit * RELATIONS + source]
            for source in range(RELATIONS)
        )
        for unit in range(RANK)
        for row in range(ROWS)
    ]
    if any(ideal_exponents):
        raise Row4UnitFailure("factored units do not have principal ideal one")

    # Each authenticated relation already proves (alpha_j)=product(P_i^Rij).
    # Check its absolute norm independently; then R*provenance=0 proves the
    # enormous factored products have absolute norm one without expanding.
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
    generator_norms: list[int] = []
    for relation in range(RELATIONS):
        norm = _norm(generators[3 * relation : 3 * relation + 3], tensor)
        expected_absolute = 1
        for row in range(ROWS):
            exponent = records[relation * ROWS + row]
            if exponent:
                expected_absolute *= original_norms[row] ** exponent
        if abs(norm) != expected_absolute:
            raise Row4UnitFailure("principal relation norm replay failed")
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
        product = (
            unit_signs[3 * unit] * unit_signs[3 * unit + 1] * unit_signs[3 * unit + 2]
        )
        if product != unit_norms[unit]:
            raise Row4UnitFailure("factored unit signs disagree with exact norm")

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
    "Row4UnitFailure",
    "W0_SHA256",
    "compose_row4_rank2_unit_authority",
]
