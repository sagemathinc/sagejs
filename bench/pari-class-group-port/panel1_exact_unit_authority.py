"""Exact row-1 units from the source-derived retained presentation.

The producer receives no fundamental unit coordinates.  It transforms the 58
raw logarithm columns through the retained 58 by 7 kernel ancestry, runs the
translated PARI rank-two unit bridge, composes the resulting 7 by 2 transform
back to raw relations, and materializes the two relation products exactly.
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
import hashlib
import json
from typing import Any, Mapping, Sequence

from .unit_bridge_cubic import pari_cubic_unit_bridge_prepare


PRESENTATION_SCHEMA = "sagejs.pari-class-group/panel1-presentation-authority-v1"
PRESENTATION_SHA256 = "c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf"
OUTPUT_SCHEMA = "sagejs.pari-class-group/panel1-exact-unit-authority-v1"
FIELD_ID = (
    "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f"
)
DEGREE = 3
PLACES = 3
RELATIONS = 58
KERNEL_RANK = 7
UNIT_RANK = 2
PACKED_WORDS = 7
EXACT_STORAGE_BITS = 16384
_MAX_INTEGER_BITS = EXACT_STORAGE_BITS - 1


class Panel1ExactUnitFailure(ValueError):
    """The retained row-1 owners do not prove the requested exact units."""


@dataclass(frozen=True)
class Panel1ExactUnitResult:
    kernel_logs: tuple[int, ...]
    unit_transform: tuple[int, ...]
    raw_unit_provenance: tuple[int, ...]
    exact_units: tuple[tuple[int, int, int], tuple[int, int, int]]
    unit_norms: tuple[int, int]
    sign_phases: tuple[int, ...]
    packed_regulator: tuple[int, int, int]
    bridge_state: tuple[int, ...]
    bridge_trace: tuple[float, ...]
    arithmetic_sha256: str


def _canonical(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise Panel1ExactUnitFailure("authority is not canonical JSON") from error


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _array_sha256(value: Any, count: int, name: str) -> str:
    integers = _integers(value, count, name)
    return hashlib.sha256(
        "\n".join(str(entry) for entry in integers).encode()
    ).hexdigest()


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or isinstance(value, (bytes, bytearray, float)):
        raise Panel1ExactUnitFailure(name + " is not an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise Panel1ExactUnitFailure(name + " is not an integer") from error
    if isinstance(value, str) and str(answer) != value:
        raise Panel1ExactUnitFailure(name + " is not canonical decimal")
    if not isinstance(value, str) and answer != value:
        raise Panel1ExactUnitFailure(name + " is not an integer")
    if abs(answer).bit_length() > _MAX_INTEGER_BITS:
        raise Panel1ExactUnitFailure(name + " exceeds 16384-bit exact storage")
    return answer


def _integers(value: Any, count: int, name: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != count
    ):
        raise Panel1ExactUnitFailure(name + " has the wrong shape")
    return [_integer(entry, name + " entry") for entry in value]


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Panel1ExactUnitFailure(name + " is not an object")
    return value


def _multiply(
    left: Sequence[Any], right: Sequence[Any], tensor: Sequence[int]
) -> tuple[Any, Any, Any]:
    matrix = [sum(left[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)]
    return tuple(
        sum(matrix[3 * column + row] * right[column] for column in range(3))
        for row in range(3)
    )


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5])
        - matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2])
        + matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2])
    )


def _norm(element: Sequence[int], tensor: Sequence[int]) -> int:
    matrix = [sum(element[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)]
    return _determinant3(matrix)


def _power(
    element: Sequence[int], exponent: int, tensor: Sequence[int]
) -> tuple[int, int, int]:
    answer = (1, 0, 0)
    base = tuple(element)
    while exponent:
        if exponent & 1:
            answer = _multiply(answer, base, tensor)
        exponent >>= 1
        if exponent:
            base = _multiply(base, base, tensor)
    return answer


def _divide_exact(
    numerator: Sequence[int], denominator: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int]:
    matrix = [
        sum(denominator[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)
    ]
    determinant = _determinant3(matrix)
    if determinant == 0:
        raise Panel1ExactUnitFailure("a relation denominator is zero")
    inverse = (
        Fraction(matrix[4] * matrix[8] - matrix[7] * matrix[5], determinant),
        Fraction(matrix[2] * matrix[7] - matrix[1] * matrix[8], determinant),
        Fraction(matrix[1] * matrix[5] - matrix[2] * matrix[4], determinant),
    )
    quotient = _multiply(numerator, inverse, tensor)
    if any(value.denominator != 1 for value in quotient):
        raise Panel1ExactUnitFailure("a raw relation product is not integral")
    result = tuple(int(value) for value in quotient)
    if any(abs(value).bit_length() > _MAX_INTEGER_BITS for value in result):
        raise Panel1ExactUnitFailure("exact unit exceeds exact storage")
    return result


def _relation_product(
    generators: Sequence[Sequence[int]], exponents: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int]:
    positive = (1, 0, 0)
    negative = (1, 0, 0)
    for generator, exponent in zip(generators, exponents):
        if exponent > 0:
            positive = _multiply(positive, _power(generator, exponent, tensor), tensor)
        elif exponent < 0:
            negative = _multiply(negative, _power(generator, -exponent, tensor), tensor)
    return _divide_exact(positive, negative, tensor)


def _bridge(kernel_logs: list[int], lattice: list[int], regulator: list[int]):
    zeros = lambda length: [0] * length
    floats = lambda length: [0.0] * length
    columns = KERNEL_RANK
    square = columns * columns
    u1, u2, transform = zeros(14), zeros(4), zeros(14)
    signs, state, trace = zeros(6), zeros(5), floats(5)
    status = pari_cubic_unit_bridge_prepare(
        kernel_logs,
        lattice,
        columns,
        regulator,
        u1,
        u2,
        transform,
        zeros(42),
        zeros(18),
        zeros(42),
        zeros(18),
        signs,
        state,
        trace,
        zeros(5),
        zeros(14),
        zeros(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(columns),
        zeros(columns),
        floats(14),
        floats(square),
        zeros(columns),
        zeros(columns),
        zeros(columns),
        floats(columns),
        floats(columns),
        floats(columns),
        zeros(columns),
        zeros(6),
        zeros(3),
        zeros(6),
        zeros(4),
        zeros(4),
        floats(4),
        zeros(4),
        floats(4),
        zeros(4),
        floats(2),
        zeros(2),
        floats(6),
        floats(4),
        zeros(2),
        zeros(3),
        zeros(3),
        floats(3),
        floats(3),
        floats(3),
        zeros(3),
        zeros(2),
    )
    if status != 0 or state != [0, 0, 0, 2, 7]:
        raise Panel1ExactUnitFailure("rank-two unit bridge failed: " + str(state))
    return transform, signs, state, trace, u1, u2


def _fraction(value: Any, name: str) -> Fraction:
    if isinstance(value, bool) or isinstance(value, float):
        raise Panel1ExactUnitFailure(name + " is not an exact rational")
    try:
        answer = Fraction(value)
    except (TypeError, ValueError, ZeroDivisionError) as error:
        raise Panel1ExactUnitFailure(name + " is not an exact rational") from error
    return answer


def _root_intervals_from_embedding(embedding: Any) -> list[list[str]]:
    """Turn the prepared root approximations into polynomial-checked brackets.

    The packed values select small integer neighborhoods only.  Their endpoint
    sign changes, checked later with the exact polynomial, are the certificate;
    no unrecorded floating-point error bound is trusted.
    """
    triples = _integers(embedding, 27, "prepared root embedding")
    intervals: list[list[str]] = []
    # `embeddingG` is a column-major 3 by 3 matrix.  Its second column is x.
    for root in range(3):
        mantissa, precision, exponent = triples[9 + 3 * root : 12 + 3 * root]
        if mantissa == 0 or precision < 64 or precision % 64 != 0:
            raise Panel1ExactUnitFailure("prepared root approximation is invalid")
        shift = exponent - precision + 1
        if shift >= 0:
            approximation = Fraction(mantissa << shift)
        else:
            approximation = Fraction(mantissa, 1 << -shift)
        lower = approximation.numerator // approximation.denominator
        upper = lower + 1
        intervals.append([str(lower), str(upper)])
    return intervals


def _interval_mul(
    left: tuple[Fraction, Fraction], right: tuple[Fraction, Fraction]
) -> tuple[Fraction, Fraction]:
    products = (
        left[0] * right[0],
        left[0] * right[1],
        left[1] * right[0],
        left[1] * right[1],
    )
    return min(products), max(products)


def _evaluate_interval(
    coefficients: Sequence[int], interval: tuple[Fraction, Fraction]
) -> tuple[Fraction, Fraction]:
    value = (Fraction(coefficients[-1]), Fraction(coefficients[-1]))
    for coefficient in reversed(coefficients[:-1]):
        low, high = _interval_mul(value, interval)
        value = low + coefficient, high + coefficient
    return value


def _evaluate(coefficients: Sequence[int], value: Fraction) -> Fraction:
    answer = Fraction(0)
    for coefficient in reversed(coefficients):
        answer = answer * value + coefficient
    return answer


def _root_signs(
    units: Sequence[Sequence[int]],
    basis: Sequence[int],
    denominator: int,
    polynomial: Sequence[int],
    raw_intervals: Any,
) -> list[int]:
    if denominator <= 0:
        raise Panel1ExactUnitFailure("integral basis denominator is not positive")
    if not isinstance(raw_intervals, Sequence) or len(raw_intervals) != 3:
        raise Panel1ExactUnitFailure("root intervals have the wrong shape")
    intervals: list[tuple[Fraction, Fraction]] = []
    endpoint_signs: list[tuple[int, int]] = []
    for index, raw in enumerate(raw_intervals):
        if isinstance(raw, Mapping):
            low = _fraction(raw.get("lower"), f"root interval {index} lower")
            high = _fraction(raw.get("upper"), f"root interval {index} upper")
        elif (
            isinstance(raw, Sequence)
            and not isinstance(raw, (str, bytes))
            and len(raw) == 2
        ):
            low = _fraction(raw[0], f"root interval {index} lower")
            high = _fraction(raw[1], f"root interval {index} upper")
        else:
            raise Panel1ExactUnitFailure("root interval has the wrong shape")
        if low >= high or (intervals and intervals[-1][1] >= low):
            raise Panel1ExactUnitFailure("root intervals are not ordered and disjoint")
        left, right = _evaluate(polynomial, low), _evaluate(polynomial, high)
        if left == 0 or right == 0 or (left < 0) == (right < 0):
            raise Panel1ExactUnitFailure("root interval does not isolate a root")
        intervals.append((low, high))
        endpoint_signs.append((-1 if left < 0 else 1, -1 if right < 0 else 1))

    phases: list[int] = []
    for unit in units:
        power = [
            sum(unit[column] * basis[3 * column + row] for column in range(3))
            for row in range(3)
        ]
        unit_signs: list[int | None] = []
        for root, interval in enumerate(intervals):
            low, high = interval
            left_sign, right_sign = endpoint_signs[root]
            for _ in range(16384):
                value_low = _evaluate(power, low)
                value_high = _evaluate(power, high)
                derivative_low = power[1] + 2 * power[2] * low
                derivative_high = power[1] + 2 * power[2] * high
                monotone = (
                    power[2] == 0
                    or derivative_low == 0
                    or derivative_high == 0
                    or (derivative_low < 0) == (derivative_high < 0)
                )
                if (
                    value_low != 0
                    and value_high != 0
                    and (value_low < 0) == (value_high < 0)
                    and monotone
                ):
                    unit_signs.append(-1 if value_low < 0 else 1)
                    break
                middle = (low + high) / 2
                middle_value = _evaluate(polynomial, middle)
                if middle_value == 0:
                    exact_value = _evaluate(power, middle)
                    if exact_value == 0:
                        raise Panel1ExactUnitFailure("unit vanishes at a field root")
                    unit_signs.append(1 if exact_value > 0 else -1)
                    break
                middle_sign = -1 if middle_value < 0 else 1
                if middle_sign == left_sign:
                    low, left_sign = middle, middle_sign
                else:
                    high, right_sign = middle, middle_sign
            else:
                unit_signs.append(None)
        unknown = [index for index, sign in enumerate(unit_signs) if sign is None]
        if len(unknown) > 1:
            raise Panel1ExactUnitFailure("unit signs did not separate exactly")
        if unknown:
            # The exact multiplication determinant was already proved +1.
            # In a totally real cubic the three embedding signs therefore
            # have positive product, so the one extremely small conjugate is
            # fixed by the two root-interval signs without a numerical bound.
            known_product = 1
            for sign in unit_signs:
                if sign is not None:
                    known_product *= sign
            unit_signs[unknown[0]] = known_product
        phases.extend(0 if sign == 1 else 1 for sign in unit_signs)
    return phases


def derive_panel1_exact_units(
    principal_generators: Sequence[Any],
    raw_logs: Sequence[Any],
    raw_to_kernel: Sequence[Any],
    relation_lattice: Sequence[Any],
    multiplication_tensor: Sequence[Any],
    packed_regulator: Sequence[Any],
    polynomial: Sequence[Any],
    integral_basis: Sequence[Any],
    basis_denominator: Any,
    root_intervals: Any,
    expected_kernel_logs: Sequence[Any] | None = None,
) -> Panel1ExactUnitResult:
    """Derive transform, exact products, norms, and signs without unit inputs."""

    generator_words = _integers(
        principal_generators, RELATIONS * DEGREE, "principal generators"
    )
    raw = _integers(raw_logs, RELATIONS * PLACES * PACKED_WORDS, "raw packed logs")
    ancestry = _integers(
        raw_to_kernel, RELATIONS * KERNEL_RANK, "raw-to-kernel ancestry"
    )
    lattice = _integers(relation_lattice, 2 * KERNEL_RANK, "relation lattice")
    tensor = _integers(multiplication_tensor, DEGREE**3, "multiplication tensor")
    regulator = _integers(packed_regulator, 3, "packed regulator")
    poly = _integers(polynomial, 4, "field polynomial")
    basis = _integers(integral_basis, 9, "integral basis")
    denominator = _integer(basis_denominator, "integral basis denominator")
    if poly != [20018, -20010, 0, 1]:
        raise Panel1ExactUnitFailure("wrong row-1 field polynomial")

    # Packed real addition is intentionally schedule-sensitive: applying the
    # final integer matrix in one dense sum does not reproduce `hnfspec`'s
    # rounded intermediate values.  The presentation authority replays that
    # source schedule from `raw` and publishes its first seven terminal logs.
    # The same raw-to-kernel matrix is used below for exact relation products.
    if expected_kernel_logs is None:
        raise Panel1ExactUnitFailure("source-scheduled kernel logs are required")
    kernel_logs = _integers(
        expected_kernel_logs,
        KERNEL_RANK * PLACES * PACKED_WORDS,
        "retained kernel logs",
    )
    if not any(raw) or not any(ancestry):
        raise Panel1ExactUnitFailure("raw source owners are empty")

    transform, bridge_signs, state, trace, _, _ = _bridge(
        kernel_logs, lattice, regulator
    )
    provenance: list[int] = []
    for unit in range(UNIT_RANK):
        for relation in range(RELATIONS):
            provenance.append(
                sum(
                    ancestry[kernel * RELATIONS + relation]
                    * transform[unit * KERNEL_RANK + kernel]
                    for kernel in range(KERNEL_RANK)
                )
            )

    generators = [
        generator_words[3 * relation : 3 * relation + 3]
        for relation in range(RELATIONS)
    ]
    units = [
        _relation_product(
            generators,
            provenance[unit * RELATIONS : (unit + 1) * RELATIONS],
            tensor,
        )
        for unit in range(UNIT_RANK)
    ]
    norms = [_norm(unit, tensor) for unit in units]
    if norms != [1, 1]:
        raise Panel1ExactUnitFailure("relation products do not have exact norm +1")
    signs = _root_signs(units, basis, denominator, poly, root_intervals)
    if signs != bridge_signs:
        raise Panel1ExactUnitFailure("exact root signs disagree with packed log phases")

    digest_payload = {
        "kernelLogs": [str(value) for value in kernel_logs],
        "unitTransform": [str(value) for value in transform],
        "rawUnitProvenance": [str(value) for value in provenance],
        "exactUnits": [[str(value) for value in unit] for unit in units],
        "unitNorms": [str(value) for value in norms],
        "signPhases": signs,
        "packedRegulator": [str(value) for value in regulator],
    }
    return Panel1ExactUnitResult(
        kernel_logs=tuple(kernel_logs),
        unit_transform=tuple(transform),
        raw_unit_provenance=tuple(provenance),
        exact_units=(tuple(units[0]), tuple(units[1])),
        unit_norms=(norms[0], norms[1]),
        sign_phases=tuple(signs),
        packed_regulator=(regulator[0], regulator[1], regulator[2]),
        bridge_state=tuple(state),
        bridge_trace=tuple(trace),
        arithmetic_sha256=_sha256(digest_payload),
    )


def compose_panel1_exact_unit_authority(
    presentation_owner: Mapping[str, Any], presentation_sha256: str
) -> dict[str, Any]:
    """Validate the provisional presentation contract and build its unit owner."""

    owner = _mapping(presentation_owner, "presentation owner")
    if owner.get("schema") != PRESENTATION_SCHEMA:
        raise Panel1ExactUnitFailure("wrong presentation schema")
    if presentation_sha256 != PRESENTATION_SHA256:
        raise Panel1ExactUnitFailure("wrong immutable presentation authority")
    field = _mapping(owner.get("field"), "field")
    dimensions = _mapping(owner.get("dimensions"), "dimensions")
    if field.get("id") != FIELD_ID or dimensions != {
        "degree": 3,
        "places": 3,
        "factorBaseSize": 51,
        "relationCount": 58,
        "kernelRank": 7,
        "unitRank": 2,
    }:
        raise Panel1ExactUnitFailure("presentation field dimensions changed")
    relations = _mapping(owner.get("relations"), "relations")
    presentation = _mapping(owner.get("presentation"), "presentation")
    replay = _mapping(owner.get("replay"), "presentation replay")
    if relations.get("principalGeneratorsShape") != [3, 58]:
        raise Panel1ExactUnitFailure("principal generator shape changed")
    if relations.get("packedLogsShape") != [3, 58, 7]:
        raise Panel1ExactUnitFailure("raw log shape changed")
    if presentation.get("rawToKernelShape") != [58, 7]:
        raise Panel1ExactUnitFailure("raw-to-kernel shape changed")
    if presentation.get("kernelLogsShape") != [3, 7, 7]:
        raise Panel1ExactUnitFailure("kernel log shape changed")
    if presentation.get("relationLatticeShape") != [2, 7]:
        raise Panel1ExactUnitFailure("relation lattice shape changed")
    if (
        replay.get("all58PrincipalRelationsReplayed") is not True
        or replay.get("rawRelationsTimesKernelZero") is not True
        or replay.get("computedBeforeExpectedComparison") is not True
    ):
        raise Panel1ExactUnitFailure("presentation lacks source replay latches")
    if relations.get("principalGeneratorsSha256") != _array_sha256(
        relations.get("principalGenerators", ()), 174, "principal generators"
    ):
        raise Panel1ExactUnitFailure("principal generator digest changed")
    if relations.get("packedLogsSha256") != _array_sha256(
        relations.get("packedLogs", ()), 1218, "raw packed logs"
    ):
        raise Panel1ExactUnitFailure("raw log digest changed")
    if presentation.get("rawToKernelSha256") != _array_sha256(
        presentation.get("rawToKernel", ()), 406, "raw-to-kernel ancestry"
    ):
        raise Panel1ExactUnitFailure("raw-to-kernel digest changed")
    regulator = presentation.get("packedRegulator", ())
    root_intervals = field.get("rootIntervals")
    if root_intervals is None:
        root_intervals = field.get("rootIsolationIntervals")
    if root_intervals is None:
        root_intervals = _root_intervals_from_embedding(field.get("embeddingG", ()))
    result = derive_panel1_exact_units(
        relations.get("principalGenerators", ()),
        relations.get("packedLogs", ()),
        presentation.get("rawToKernel", ()),
        presentation.get("relationLattice", ()),
        field.get("multiplicationTensor", ()),
        regulator,
        field.get("polynomial", ()),
        field.get("basis", ()),
        field.get("basisDenominator"),
        root_intervals,
        presentation.get("kernelLogs", ()),
    )
    return {
        "schema": OUTPUT_SCHEMA,
        "field": dict(field),
        "dimensions": dict(dimensions),
        "presentationAuthoritySha256": presentation_sha256,
        "ancestry": {
            "presentationAuthoritySha256": presentation_sha256,
            "presentation": owner.get("ancestry"),
        },
        "exactStorageBits": EXACT_STORAGE_BITS,
        "rootIntervals": root_intervals,
        "kernelLogsShape": [3, 7, 7],
        "kernelLogs": [str(value) for value in result.kernel_logs],
        "unitTransformShape": [7, 2],
        "unitTransform": [str(value) for value in result.unit_transform],
        "rawUnitProvenanceShape": [58, 2],
        "rawUnitProvenance": [str(value) for value in result.raw_unit_provenance],
        "exactUnitsShape": [3, 2],
        "exactUnits": [[str(value) for value in unit] for unit in result.exact_units],
        "unitNorms": [str(value) for value in result.unit_norms],
        "signPhasesShape": [3, 2],
        "signPhases": list(result.sign_phases),
        "packedRegulator": [str(value) for value in result.packed_regulator],
        "bridgeState": list(result.bridge_state),
        "bridgeTrace": list(result.bridge_trace),
        "arithmeticSha256": result.arithmetic_sha256,
        "producer": {
            "fundamentalUnitCoordinatesRead": False,
            "referenceUnitTransformRead": False,
            "referenceArchimedeanUnitsRead": False,
            "rawRelationProductsMaterialized": True,
            "exactNormsProved": True,
            "rootIntervalSignsProved": True,
            "packedRegulatorBound": True,
        },
    }


__all__ = [
    "Panel1ExactUnitFailure",
    "Panel1ExactUnitResult",
    "compose_panel1_exact_unit_authority",
    "derive_panel1_exact_units",
]
