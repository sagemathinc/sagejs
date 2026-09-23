"""Exact compact row-11 rank-two units and the authentic C5/C6 policy."""

from __future__ import annotations

import hashlib
import json
from fractions import Fraction
from pathlib import Path
from typing import Any, Mapping, Sequence

from .field3_mixed_unit_suffix import (
    pari_cleanarchunit_mixed_quartic,
    pari_field3_prepare_getfu,
)
from .getfu_mixed_quartic import pari_getfu_mixed_quartic
from .log_matrix_transform import pari_log_matrix_transform
from .panel1_exact_unit_authority import _evaluate, _evaluate_interval
from .quartic_signed_genback import pari_quartic_mul_matrix
from .regulator_scalar import pari_regulator_scalar_add, pari_regulator_scalar_multiply
from .float_conversion import pari_real_to_float
from .unit_lattice_reduction import (
    pari_unit_compose_rank_two,
    pari_unit_integer_lattice_rank_two,
    pari_unit_real_lattice_rank_two,
)
from .unit_lattice_selection import pari_unit_lattice_selection
from .field3_relation_replay_map import _determinant4


SCHEMA = "sagejs.pari-class-group/row11-rank2-c5-c6-v1"
LANE_A_SCHEMA = "sagejs.pari-class-group/row11-terminal-class-closure-v1"
LANE_A_SHA256 = "46d74e9bcecc768bf90e61bdee702a240fde22f75e213a7fec0b9b5212618879"
W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1"
W0_SHA256 = "6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165"
FIELD_ID = (
    "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab"
)
POLYNOMIAL = [-2000018, -2000010, 0, 0, 1]
RELATIONS, ROWS, KERNEL, RANK, PLACES, DEGREE, PRECISION = 430, 421, 9, 2, 3, 4, 192
POISON = 31337


class Row11Rank2Failure(ValueError):
    pass


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Row11Rank2Failure(label + " is not an object")
    return value


def _integers(value: Any, length: int, label: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != length
    ):
        raise Row11Rank2Failure(label + " has the wrong shape")
    answer = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row11Rank2Failure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Row11Rank2Failure(label + " is not canonical integer data")
        answer.append(number)
    return answer


def _array_sha(values: Sequence[int]) -> str:
    return hashlib.sha256(
        "\n".join(str(value) for value in values).encode()
    ).hexdigest()


def _canonical_sha(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _event(events: Sequence[Any], name: str, last: bool = False) -> Mapping[str, Any]:
    found = [
        entry
        for entry in events
        if isinstance(entry, Mapping) and entry.get("event") == name
    ]
    if not found:
        raise Row11Rank2Failure("missing " + name)
    return found[-1 if last else 0]


def _exported_integer(value: Any, label: str) -> int:
    if not isinstance(value, Mapping) or value.get("kind") != "integer":
        raise Row11Rank2Failure(label + " is not an exported integer")
    return _integers([value.get("value")], 1, label)[0]


def _triple(value: Any, label: str) -> list[int]:
    if isinstance(value, Mapping) and value.get("kind") == "integer":
        return [_exported_integer(value, label), -1, 0]
    if not isinstance(value, Mapping) or value.get("kind") != "real":
        raise Row11Rank2Failure(label + " is not an exported real")
    return _integers(
        [value.get("mantissa"), value.get("precision"), value.get("exponent")], 3, label
    )


def _matrix(
    matrix: Any, rows: int, columns: int, label: str, logs: bool = False
) -> list[int]:
    if not isinstance(matrix, Mapping) or matrix.get("kind") != "matrix":
        raise Row11Rank2Failure(label + " is not a matrix")
    entries = matrix.get("values")
    if not isinstance(entries, list) or len(entries) != columns:
        raise Row11Rank2Failure(label + " has the wrong width")
    answer: list[int] = []
    for column, owner in enumerate(entries):
        values = owner.get("values") if isinstance(owner, Mapping) else None
        if not isinstance(values, list) or len(values) != rows:
            raise Row11Rank2Failure(label + " column has the wrong height")
        for row, value in enumerate(values):
            if logs:
                if isinstance(value, Mapping) and value.get("kind") == "complex":
                    answer.extend(
                        [
                            2,
                            *_triple(value.get("real"), label),
                            *_triple(value.get("imag"), label),
                        ]
                    )
                else:
                    answer.extend([1, *_triple(value, label), 0, -1, 0])
            else:
                answer.append(
                    _exported_integer(value, f"{label}[{column},{row}]")
                    if isinstance(value, Mapping)
                    else _integers([value], 1, label)[0]
                )
    return answer


def _zeros(length: int) -> list[int]:
    return [0] * length


def _floats(length: int) -> list[float]:
    return [0.0] * length


def _real_factor(packed: list[int]) -> tuple[int, list[int]]:
    triples = _zeros(18)
    for row in range(PLACES):
        for column in range(RANK):
            source, target = 7 * (column * PLACES + row) + 1, 3 * (row * RANK + column)
            triples[target : target + 3] = packed[source : source + 3]
    factor = _zeros(4)
    status = pari_unit_real_lattice_rank_two(
        triples,
        PLACES,
        _zeros(6),
        factor,
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
    )
    return status, factor


def _c5(
    kernel_logs: list[int], lattice: list[int], regulator: list[int]
) -> dict[str, Any]:
    selected, selection_state = _zeros(KERNEL), _zeros(7)
    selection = pari_unit_lattice_selection(
        lattice,
        2,
        KERNEL,
        selected,
        selection_state,
        _zeros(2 * KERNEL),
        _zeros(2 * KERNEL),
        _zeros(2),
        _zeros(2 * KERNEL),
        _zeros(2 * KERNEL),
        _zeros(2 * KERNEL),
        _zeros(2),
        _zeros(KERNEL),
        _zeros(15),
    )
    if selection != 0 or selection_state[:2] != [0, 0]:
        raise Row11Rank2Failure("C5 lattice selection failed")
    square = KERNEL * KERNEL
    u1, integer_state = _zeros(2 * KERNEL), _zeros(5)
    integer = pari_unit_integer_lattice_rank_two(
        lattice,
        KERNEL,
        u1,
        integer_state,
        _zeros(2 * KERNEL),
        _zeros(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(KERNEL),
        _zeros(KERNEL),
        _floats(2 * KERNEL),
        _floats(square),
        _zeros(KERNEL),
        _zeros(KERNEL),
        _zeros(KERNEL),
        _floats(KERNEL),
        _floats(KERNEL),
        _floats(KERNEL),
        _zeros(KERNEL),
    )
    if integer != 0:
        raise Row11Rank2Failure("C5 integer reduction failed")
    first = _zeros(42)
    pari_log_matrix_transform(kernel_logs, u1, PLACES, KERNEL, RANK, False, first)
    real, u2 = _real_factor(first)
    determinant_u2 = u2[0] * u2[3] - u2[1] * u2[2]
    if real != 0 or abs(determinant_u2) != 1:
        raise Row11Rank2Failure("C5 real reduction failed")
    u = _zeros(2 * KERNEL)
    pari_unit_compose_rank_two(u1, KERNEL, u2, u)
    au, clean, clean_state = _zeros(42), _zeros(42), _zeros(6)
    pari_log_matrix_transform(kernel_logs, u, PLACES, KERNEL, RANK, False, au)
    clean_status = pari_cleanarchunit_mixed_quartic(
        au,
        regulator,
        PRECISION,
        _zeros(3),
        _zeros(1024),
        _zeros(1024),
        _zeros(1024),
        _zeros(1024),
        _zeros(2048),
        _zeros(42),
        clean,
        clean_state,
    )
    if clean_status != 0:
        raise Row11Rank2Failure("C5 cleanarch failed: " + str(clean_state))
    matep, arch, candidate = _zeros(42), _zeros(42), _zeros(42)
    pari_field3_prepare_getfu(
        clean,
        [1, 0, 0, 1],
        matep,
        arch,
        candidate,
        _zeros(18),
        _zeros(18),
        _zeros(18),
        _zeros(18),
    )
    factor_status, factor = _real_factor(matep)
    factor[1], factor[2] = factor[2], factor[1]
    determinant_factor = factor[0] * factor[3] - factor[1] * factor[2]
    if factor_status != 0 or abs(determinant_factor) != 1:
        raise Row11Rank2Failure("C5 private getfu factor failed")
    arch_real, arch_imag, clean_real, clean_imag = (_zeros(18) for _ in range(4))
    pari_field3_prepare_getfu(
        clean,
        factor,
        matep,
        arch,
        candidate,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    am, ap, ae = pari_regulator_scalar_multiply(
        clean[1], clean[2], clean[3], clean[29], clean[30], clean[31]
    )
    bm, bp, be = pari_regulator_scalar_multiply(
        clean[22], clean[23], clean[24], clean[8], clean[9], clean[10]
    )
    dm, dp, de = pari_regulator_scalar_add(am, ap, ae, -bm, bp, be)
    if dm < 0:
        dm = -dm
    if abs(pari_real_to_float(dm, dp, de) - pari_real_to_float(*regulator)) >= 0.5:
        raise Row11Rank2Failure("computed C5 regulator changed")
    return {
        "u1": u1,
        "u2": u2,
        "u": u,
        "a": clean,
        "factor": factor,
        "candidate": candidate,
        "archReal": arch_real,
        "archImag": arch_imag,
        "cleanReal": clean_real,
        "cleanImag": clean_imag,
        "computedRegulator": [dm, dp, de],
        "state": [
            selection,
            *selection_state,
            integer,
            *integer_state,
            real,
            determinant_u2,
            clean_status,
            *clean_state,
            factor_status,
            determinant_factor,
        ],
    }


def _prepared(w0: Mapping[str, Any]) -> tuple[list[int], list[int], list[int]]:
    prepared = _event(w0["events"], "prepared")
    values = prepared.get("embeddingM")
    if not isinstance(values, list) or len(values) != 16:
        raise Row11Rank2Failure("prepared embedding changed")
    triples = [_triple(value, "prepared embedding") for value in values]
    real, imaginary = [], []
    for column in range(4):
        for row in [0, 1, 2]:
            real.extend(triples[4 * row + column])
        imaginary.extend([0, -1, 0, 0, -1, 0, *triples[12 + column]])
    return (
        real,
        imaginary,
        _integers(prepared.get("multiplicationTensor"), 64, "multiplication tensor"),
    )


def _c6(c5: Mapping[str, Any], w0: Mapping[str, Any]) -> dict[str, Any]:
    embedding_real, embedding_imag, tensor = _prepared(w0)
    work = {
        name: _zeros(length)
        for name, length in {
            "expReal": 18,
            "expImag": 18,
            "splitMatrix": 48,
            "splitRhs": 24,
            "solveWork": 48,
            "solveRhs": 24,
            "solved": 24,
            "rounded": 8,
            "multiplication": 16,
            "inverse": 4,
            "candidateUnits": 8,
            "normalizedFactor": 4,
        }.items()
    }
    output_units, output_real, output_imag, output_factor = (
        [POISON] * 8,
        [POISON] * 18,
        [POISON] * 18,
        [POISON] * 4,
    )
    state = _zeros(8)
    status = pari_getfu_mixed_quartic(
        list(c5["archReal"]),
        list(c5["archImag"]),
        list(c5["cleanReal"]),
        list(c5["cleanImag"]),
        list(c5["factor"]),
        embedding_real,
        embedding_imag,
        tensor,
        PRECISION,
        work["expReal"],
        work["expImag"],
        work["splitMatrix"],
        work["splitRhs"],
        work["solveWork"],
        work["solveRhs"],
        work["solved"],
        work["rounded"],
        work["multiplication"],
        work["inverse"],
        work["candidateUnits"],
        work["normalizedFactor"],
        output_units,
        output_real,
        output_imag,
        output_factor,
        state,
        _zeros(4),
        _zeros(3),
        _zeros(3),
        _zeros(512),
        _zeros(512),
        _zeros(512),
        _zeros(512),
        _zeros(91),
    )
    if status not in (0, 2, 3) or state[0] != status:
        raise Row11Rank2Failure(
            "C6 returned an unsupported terminal state: " + str(state)
        )
    poisoned = (
        output_units == [POISON] * 8
        and output_real == [POISON] * 18
        and output_imag == [POISON] * 18
        and output_factor == [POISON] * 4
    )
    if (status == 0) == poisoned:
        raise Row11Rank2Failure("C6 publication policy changed")
    return {
        "status": status,
        "state": state,
        "poisoned": poisoned,
        "outputUnits": output_units,
        "outputLogsReal": output_real,
        "outputLogsImag": output_imag,
        "outputFactor": output_factor,
        "traceSha256": {
            name: _array_sha(work[name])
            for name in ("solved", "rounded", "candidateUnits")
        },
    }


def _root_intervals(prepared: Mapping[str, Any]) -> list[tuple[Fraction, Fraction]]:
    embedding = prepared.get("embeddingG")
    if not isinstance(embedding, list) or len(embedding) != 16:
        raise Row11Rank2Failure("prepared root embedding changed")
    intervals = []
    for place in range(2):
        mantissa, precision, exponent = _triple(
            embedding[4 * place + 1], "prepared root"
        )
        shift = exponent - precision + 1
        approximation = (
            Fraction(mantissa << shift)
            if shift >= 0
            else Fraction(mantissa, 1 << -shift)
        )
        low = approximation.numerator // approximation.denominator
        high = low + 1
        if (_evaluate(POLYNOMIAL, Fraction(low)) < 0) == (
            _evaluate(POLYNOMIAL, Fraction(high)) < 0
        ):
            raise Row11Rank2Failure("prepared interval does not isolate a real root")
        intervals.append((Fraction(low), Fraction(high)))
    return intervals


def _generator_signs(generators: list[int], prepared: Mapping[str, Any]) -> list[int]:
    basis = _integers(prepared.get("zk"), 16, "integral basis")
    intervals = _root_intervals(prepared)
    answer = []
    for relation in range(RELATIONS):
        element = generators[4 * relation : 4 * relation + 4]
        power = [
            sum(element[column] * basis[4 * column + row] for column in range(4))
            for row in range(4)
        ]
        for original in intervals:
            low, high = original
            sign = None
            left = _evaluate(POLYNOMIAL, low)
            for _ in range(4096):
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
                        raise Row11Rank2Failure("principal generator vanishes")
                    sign = 1 if exact > 0 else -1
                    break
                if (middle_value < 0) == (left < 0):
                    low, left = middle, middle_value
                else:
                    high = middle
            if sign is None:
                raise Row11Rank2Failure("principal generator sign did not separate")
            answer.append(sign)
    return answer


def compose_row11_rank2_c5_c6(
    lane_a: Mapping[str, Any], lane_a_sha256: str, w0: Mapping[str, Any], w0_sha256: str
) -> dict[str, Any]:
    lane_a = _mapping(lane_a, "Lane A owner")
    w0 = _mapping(w0, "W0")
    if lane_a_sha256 != LANE_A_SHA256:
        raise Row11Rank2Failure("wrong Lane A owner digest")
    if (
        lane_a.get("schema") != LANE_A_SCHEMA
        or lane_a.get("field", {}).get("id") != FIELD_ID
    ):
        raise Row11Rank2Failure("wrong Lane A owner")
    if w0_sha256 != W0_SHA256 or w0.get("schema") != W0_SCHEMA:
        raise Row11Rank2Failure("wrong pristine W0")
    closure = _mapping(lane_a.get("relationClosure"), "relation closure")
    transform = _integers(closure.get("transform"), RELATIONS * 11, "Lane A transform")
    raw_to_kernel = transform[: RELATIONS * KERNEL]
    if (
        closure.get("transformSha256") != _array_sha(transform)
        or closure.get("relationTimesKernelZero") is not True
    ):
        raise Row11Rank2Failure("Lane A transform changed")
    exact = _mapping(lane_a.get("exactRelations"), "exact relations")
    records = _integers(exact.get("relationRecords"), ROWS * RELATIONS, "relations")
    generators = _integers(
        exact.get("principalGenerators"), DEGREE * RELATIONS, "principal generators"
    )
    if exact.get("relationRecordsSha256") != _array_sha(records) or exact.get(
        "principalGeneratorsSha256"
    ) != _array_sha(generators):
        raise Row11Rank2Failure("Lane A exact relation owner changed")
    events = w0.get("events")
    if not isinstance(events, list):
        raise Row11Rank2Failure("W0 events missing")
    terminal = _event(events, "hnf", last=True)
    raw_logs = _matrix(
        terminal.get("exactEmbeddings"), PLACES, RELATIONS, "source logs", True
    )
    kernel_logs = _zeros(7 * PLACES * KERNEL)
    pari_log_matrix_transform(
        raw_logs, raw_to_kernel, PLACES, RELATIONS, KERNEL, False, kernel_logs
    )
    # Independently retain the exact ideal-kernel equation.
    for unit_column in range(KERNEL):
        for row in range(ROWS):
            if (
                sum(
                    records[source * ROWS + row]
                    * raw_to_kernel[unit_column * RELATIONS + source]
                    for source in range(RELATIONS)
                )
                != 0
            ):
                raise Row11Rank2Failure("R*Tunit is not zero")
    acceptance = _event(events, "acceptance", last=True)
    lattice = _matrix(acceptance.get("lattice"), 2, KERNEL, "accepted lattice")
    regulator = _triple(acceptance.get("exactR"), "accepted regulator")
    c5 = _c5(kernel_logs, lattice, regulator)
    provenance = [
        sum(
            raw_to_kernel[k * RELATIONS + r] * c5["u"][unit * KERNEL + k]
            for k in range(KERNEL)
        )
        for unit in range(RANK)
        for r in range(RELATIONS)
    ]
    for unit in range(RANK):
        for row in range(ROWS):
            if (
                sum(
                    records[r * ROWS + row] * provenance[unit * RELATIONS + r]
                    for r in range(RELATIONS)
                )
                != 0
            ):
                raise Row11Rank2Failure("R*Wraw is not zero")
    prepared = _event(events, "prepared")
    tensor = _integers(
        prepared.get("multiplicationTensor"), 64, "multiplication tensor"
    )
    generator_norms = []
    for relation in range(RELATIONS):
        multiplication = _zeros(16)
        pari_quartic_mul_matrix(
            tensor, generators[4 * relation : 4 * relation + 4], multiplication
        )
        generator_norms.append(_determinant4(multiplication))
    unit_norms = [
        -1
        if sum(
            (provenance[u * RELATIONS + r] & 1)
            for r, norm in enumerate(generator_norms)
            if norm < 0
        )
        & 1
        else 1
        for u in range(RANK)
    ]
    generator_signs = _generator_signs(generators, prepared)
    unit_signs = [
        -1
        if sum(
            (provenance[u * RELATIONS + r] & 1)
            for r in range(RELATIONS)
            if generator_signs[2 * r + p] < 0
        )
        & 1
        else 1
        for u in range(RANK)
        for p in range(2)
    ]
    compact_units = []
    for unit in range(RANK):
        indices = [
            relation
            for relation in range(RELATIONS)
            if provenance[unit * RELATIONS + relation]
        ]
        exponents = [provenance[unit * RELATIONS + relation] for relation in indices]
        factors = [
            value
            for relation in indices
            for value in generators[DEGREE * relation : DEGREE * (relation + 1)]
        ]
        compact_units.append(
            {
                "kind": "signed-retained-relation-product",
                "factorCount": len(indices),
                "relationIndices": list(map(str, indices)),
                "relationExponents": list(map(str, exponents)),
                "principalGenerators": list(map(str, factors)),
                "relationIndicesSha256": _array_sha(indices),
                "relationExponentsSha256": _array_sha(exponents),
                "principalGeneratorsSha256": _array_sha(factors),
                "norm": str(unit_norms[unit]),
                "realSigns": unit_signs[2 * unit : 2 * unit + 2],
                "expandedGeneratorMaterialized": False,
            }
        )
    c6 = _c6(c5, w0)
    reason = {0: "SUCCESS", 2: "LARGE", 3: "PRECI"}[c6["status"]]
    arithmetic = {
        "kernelLogs": list(map(str, kernel_logs)),
        "unitKernelTransform": list(map(str, c5["u"])),
        "rawUnitProvenance": list(map(str, provenance)),
        "unitNorms": list(map(str, unit_norms)),
        "unitRealSigns": unit_signs,
        "regulator": list(map(str, regulator)),
    }
    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "panelIndex": 11,
            "polynomial": list(map(str, POLYNOMIAL)),
            "signature": [2, 1],
        },
        "dimensions": {
            "factorBaseSize": ROWS,
            "relationCount": RELATIONS,
            "kernelRank": KERNEL,
            "unitRank": RANK,
        },
        "ancestry": {
            "laneAOwnerSha256": lane_a_sha256,
            "pristineW0Sha256": w0_sha256,
            "producerSourceSha256": hashlib.sha256(
                Path(__file__).read_bytes()
            ).hexdigest(),
        },
        "sourceLogs": {
            "sourceOrderReconstructed": True,
            "rawPackedLogsSha256": _array_sha(raw_logs),
            "kernelLogsShape": [PLACES, KERNEL, 7],
            "kernelLogs": arithmetic["kernelLogs"],
            "kernelLogsSha256": _array_sha(kernel_logs),
            "frozenW0UsedAsInput": True,
            "preparedNfLiveRoot": False,
        },
        "units": {
            "unitKernelTransformShape": [KERNEL, RANK],
            "unitKernelTransform": arithmetic["unitKernelTransform"],
            "rawUnitProvenanceShape": [RELATIONS, RANK],
            "rawUnitProvenance": arithmetic["rawUnitProvenance"],
            "rawRelationsTimesUnitKernelZero": True,
            "rawRelationsTimesUnitsZero": True,
            "factoredUnitBasis": "Lane A authenticated principalGenerators",
            "compactFactoredUnits": compact_units,
            "nonzeroRelationFactors": [
                sum(x != 0 for x in provenance[u * RELATIONS : (u + 1) * RELATIONS])
                for u in range(RANK)
            ],
            "unitNorms": arithmetic["unitNorms"],
            "unitRealSignsShape": [2, RANK],
            "unitRealSigns": unit_signs,
        },
        "regulator": {
            "acceptedPacked": arithmetic["regulator"],
            "computedPacked": list(map(str, c5["computedRegulator"])),
            "matchesAccepted": True,
        },
        "c5": {
            "state": c5["state"],
            "u1": list(map(str, c5["u1"])),
            "u2": list(map(str, c5["u2"])),
            "archimedeanUnits": list(map(str, c5["a"])),
            "privateGetfuFactor": list(map(str, c5["factor"])),
        },
        "c6": {
            "executions": 1,
            "status": c6["status"],
            "reason": reason,
            "state": c6["state"],
            "materialization": "expanded"
            if c6["status"] == 0
            else f"not_given({reason})",
            "expandedUnitsPublished": c6["status"] == 0,
            "traceSha256": c6["traceSha256"],
        },
        "replay": {
            "arithmeticSha256": _canonical_sha(arithmetic),
            "fundamentalUnitEventRead": False,
            "comparisonPerformedByCheckerOnly": True,
        },
        "completion": {
            "compactFactoredUnitsRetained": True,
            "exactSuffixComplete": True,
            "inputBoundaryComplete": False,
            "correspondenceComplete": True,
            "publicComplete": False,
        },
    }


__all__ = [
    "SCHEMA",
    "LANE_A_SHA256",
    "W0_SHA256",
    "Row11Rank2Failure",
    "compose_row11_rank2_c5_c6",
]
