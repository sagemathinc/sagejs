"""Exact row-20 relation closure and C7 correspondence evidence.

The producer consumes pristine W0 and the independently published C6 owner.
It does not read the final class-group result or the reference fundamental
units.  PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from fractions import Fraction
import hashlib
from typing import Any

from .field3_unit_transform_retention import _pari_reverse_hnffinal_selection
from .hnfspec_complete import pari_hnfspec_complete
from .row20_successful_c6 import _packed_matrix


SCHEMA = "sagejs.pari-class-group/row20-c7-closure-v1"
C6_SCHEMA = "sagejs.pari-class-group/row20-successful-c6-v1"
W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1"
FIELD_ID = "5.1.1000000.1"
ROWS = 7
COLUMNS = 14
KERNEL = 7
DEGREE = 5
PLACES = 3
LOG_STRIDE = 21


class Row20C7Failure(ValueError):
    """Authenticated row-20 C7 evidence failed closed."""


def _event(bundle: Mapping[str, Any], name: str) -> Mapping[str, Any]:
    events = bundle.get("events")
    if not isinstance(events, list):
        raise Row20C7Failure("W0 event stream changed")
    selected = [
        value
        for value in events
        if isinstance(value, Mapping) and value.get("event") == name
    ]
    if len(selected) != 1:
        raise Row20C7Failure("W0 has the wrong " + name + " count")
    return selected[0]


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise Row20C7Failure(label + " is not integral")
    try:
        result = int(value)
    except (ValueError, OverflowError) as error:
        raise Row20C7Failure(label + " is not integral") from error
    if str(result) != str(value):
        raise Row20C7Failure(label + " is not canonical")
    return result


def _exported_integer(value: Any, label: str) -> int:
    if not isinstance(value, Mapping) or value.get("kind") != "integer":
        raise Row20C7Failure(label + " is not an exported integer")
    return _integer(value.get("value"), label)


def _exported_vector(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, Mapping) or value.get("kind") not in {
        "column",
        "small-vector",
        "vector",
    }:
        raise Row20C7Failure(label + " is not an exported vector")
    entries = value.get("values")
    if not isinstance(entries, list) or len(entries) != length:
        raise Row20C7Failure(label + " has the wrong shape")
    return [
        _exported_integer(entry, label)
        if isinstance(entry, Mapping)
        else _integer(entry, label)
        for entry in entries
    ]


def _array_digest(value: Sequence[int]) -> str:
    return hashlib.sha256(
        "\n".join(str(int(entry)) for entry in value).encode()
    ).hexdigest()


def _determinant(matrix: Sequence[int], size: int) -> int:
    work = [
        [matrix[row * size + column] for column in range(size)] for row in range(size)
    ]
    sign = 1
    previous = 1
    for column in range(size - 1):
        pivot = next(
            (row for row in range(column, size) if work[row][column] != 0), size
        )
        if pivot == size:
            return 0
        if pivot != column:
            work[pivot], work[column] = work[column], work[pivot]
            sign = -sign
        value = work[column][column]
        for row in range(column + 1, size):
            for other in range(column + 1, size):
                numerator = (
                    work[row][other] * value - work[row][column] * work[column][other]
                )
                if numerator % previous:
                    raise Row20C7Failure("nonexact determinant division")
                work[row][other] = numerator // previous
        previous = value
    return sign * work[-1][-1]


def _multiplication_matrix(table: Sequence[int], generator: Sequence[int]) -> list[int]:
    return [
        sum(
            generator[basis] * table[25 * basis + 5 * column + row]
            for basis in range(DEGREE)
        )
        for row in range(DEGREE)
        for column in range(DEGREE)
    ]


def _multiply(
    table: Sequence[int],
    left: Sequence[int | Fraction],
    right: Sequence[int | Fraction],
) -> list[int | Fraction]:
    return [
        sum(
            left[i] * right[j] * table[25 * i + 5 * j + row]
            for i in range(DEGREE)
            for j in range(DEGREE)
        )
        for row in range(DEGREE)
    ]


def _solve(matrix: Sequence[int], rhs: Sequence[int]) -> list[Fraction]:
    work = [
        [Fraction(matrix[row * DEGREE + column]) for column in range(DEGREE)]
        + [Fraction(rhs[row])]
        for row in range(DEGREE)
    ]
    for column in range(DEGREE):
        pivot = next(
            (row for row in range(column, DEGREE) if work[row][column]), DEGREE
        )
        if pivot == DEGREE:
            raise Row20C7Failure("singular exact multiplication matrix")
        work[column], work[pivot] = work[pivot], work[column]
        scale = work[column][column]
        work[column] = [entry / scale for entry in work[column]]
        for row in range(DEGREE):
            if row != column:
                scale = work[row][column]
                work[row] = [
                    work[row][index] - scale * work[column][index]
                    for index in range(DEGREE + 1)
                ]
    return [work[row][-1] for row in range(DEGREE)]


def _prime_modulus_hnf(original: Sequence[int], prime: int) -> list[int]:
    work = [value % prime for value in original]
    output = [
        prime if row == column else 0
        for row in range(DEGREE)
        for column in range(DEGREE)
    ]
    pivots = [-1] * DEGREE
    remaining = DEGREE
    for row in range(DEGREE - 1, -1, -1):
        column = remaining - 1
        while column >= 0 and work[row * DEGREE + column] == 0:
            column -= 1
        if column < 0:
            continue
        destination = remaining - 1
        pivot = work[row * DEGREE + column]
        if column != destination:
            for other in range(DEGREE):
                a, b = other * DEGREE + destination, other * DEGREE + column
                work[a], work[b] = work[b], work[a]
        if pivot != 1:
            inverse = pow(pivot, -1, prime)
            for other in range(row):
                work[other * DEGREE + destination] = (
                    work[other * DEGREE + destination] * inverse % prime
                )
        work[row * DEGREE + destination] = 1
        for other_column in range(destination - 1, -1, -1):
            multiplier = work[row * DEGREE + other_column]
            if multiplier:
                for other in range(DEGREE):
                    work[other * DEGREE + other_column] -= (
                        multiplier * work[other * DEGREE + destination]
                    )
                for other in range(row):
                    work[other * DEGREE + other_column] %= prime
        pivots[destination] = row
        remaining -= 1
    if remaining == 0:
        return [
            1 if row == column else 0
            for row in range(DEGREE)
            for column in range(DEGREE)
        ]
    for column in range(remaining, DEGREE):
        for row in range(DEGREE):
            output[row * DEGREE + pivots[column]] = work[row * DEGREE + column]
    for row in range(DEGREE - 1, -1, -1):
        if output[row * DEGREE + row] == 1:
            for column in range(row + 1, DEGREE):
                multiplier = output[row * DEGREE + column]
                if multiplier:
                    for other in range(DEGREE):
                        output[other * DEGREE + column] -= (
                            multiplier * output[other * DEGREE + row]
                        )
                    for other in range(row):
                        output[other * DEGREE + column] %= prime
        else:
            for column in range(row + 1, DEGREE):
                output[row * DEGREE + column] %= prime
    return output


def _source_closure(
    records: list[int],
    raw_logs: list[int],
    permutation: list[int],
    expected_logs: list[int],
) -> dict[str, Any]:
    def zero(length: int) -> list[int]:
        return [0] * length

    size, log_size, subfactor = ROWS * COLUMNS, LOG_STRIDE * COLUMNS, 4
    args: list[Any] = [
        records,
        ROWS,
        COLUMNS,
        permutation,
        subfactor,
        raw_logs,
        PLACES,
        zero(size),
        zero(subfactor * COLUMNS),
        zero(COLUMNS * COLUMNS),
        zero(COLUMNS),
        zero(1),
        zero(13),
        zero((ROWS - subfactor) * COLUMNS),
        zero(subfactor * COLUMNS),
        zero(size),
        zero(10),
        zero(size),
        zero(COLUMNS),
        zero(ROWS),
        zero(ROWS),
        zero(ROWS + 1),
        zero(10),
        zero(ROWS),
        zero(size),
        zero(size),
        zero(size),
        zero(6),
        zero(log_size),
        zero(size),
        zero(COLUMNS * COLUMNS),
        zero(COLUMNS * COLUMNS),
        zero(COLUMNS + 1),
        zero(11),
        zero(size),
        zero(size),
        zero(log_size),
        zero(ROWS),
        zero(size),
        zero(size),
        zero(ROWS * (COLUMNS + ROWS)),
        zero(log_size),
        zero(7),
        zero(9),
        zero(300000),
        zero(64),
        zero(8),
        zero(8),
    ]
    if (
        pari_hnfspec_complete(*args) != 0
        or args[27] != [4, 0, 11, 4, 3, 0]
        or args[43] != [0, 7, 7, 0, 7, 4, 0, 14, 0]
    ):
        raise Row20C7Failure("source relation HNF replay changed")
    if args[41] != expected_logs:
        raise Row20C7Failure("raw-to-compact logarithm ancestry changed")
    selected = zero(COLUMNS * COLUMNS)
    for target in range(COLUMNS):
        selected[target * COLUMNS + target] = 1
    _pari_reverse_hnffinal_selection(
        selected,
        COLUMNS,
        COLUMNS,
        4,
        0,
        11,
        3,
        args[30],
        0,
        args[29],
        0,
        args[34],
        0,
        args[26],
        0,
        args[37],
        0,
        zero(COLUMNS * COLUMNS),
        zero(12),
    )
    raw = zero(COLUMNS * COLUMNS)
    for target in range(COLUMNS):
        for source in range(COLUMNS):
            raw[target * COLUMNS + source] = sum(
                args[9][cleaned * COLUMNS + source]
                * selected[target * COLUMNS + cleaned]
                for cleaned in range(COLUMNS)
            )
    transform = raw[: KERNEL * COLUMNS]
    inverse_permutation = [0] * ROWS
    for position, physical in enumerate(permutation):
        inverse_permutation[physical - 1] = position
    right_inverse = [
        value
        for physical in range(ROWS)
        for value in raw[
            (KERNEL + inverse_permutation[physical]) * COLUMNS : (
                KERNEL + inverse_permutation[physical] + 1
            )
            * COLUMNS
        ]
    ]
    for column in range(KERNEL):
        if any(
            sum(
                records[source * ROWS + row] * transform[column * COLUMNS + source]
                for source in range(COLUMNS)
            )
            for row in range(ROWS)
        ):
            raise Row20C7Failure("R*T is not zero")
    presentation = [
        sum(
            records[source * ROWS + row] * right_inverse[column * COLUMNS + source]
            for source in range(COLUMNS)
        )
        for column in range(ROWS)
        for row in range(ROWS)
    ]
    identity = [int(row == column) for column in range(ROWS) for row in range(ROWS)]
    if presentation != identity:
        raise Row20C7Failure("R*Q is not the identity")
    return {
        "transform": transform,
        "rightInverse": right_inverse,
        "presentation": presentation,
        "hnfState": args[43],
    }


def _relation_evidence(w0: Mapping[str, Any]) -> dict[str, Any]:
    prepared = w0.get("prepared")
    if not isinstance(prepared, Mapping):
        raise Row20C7Failure("prepared owner changed")
    table_value = prepared.get("multiplicationTensor")
    if not isinstance(table_value, list) or len(table_value) != DEGREE**3:
        raise Row20C7Failure("prepared multiplication tensor changed")
    table = [_integer(value, "multiplication tensor") for value in table_value]
    factor = _event(w0, "factor_base")
    descriptors = factor.get("LP")
    if (
        not isinstance(descriptors, Mapping)
        or descriptors.get("kind") != "vector"
        or not isinstance(descriptors.get("values"), list)
        or len(descriptors["values"]) != ROWS
    ):
        raise Row20C7Failure("factor-base descriptors changed")
    ideals: list[int] = []
    norms: list[int] = []
    descriptor_owner: list[int] = []
    for descriptor in descriptors["values"]:
        values = descriptor.get("values") if isinstance(descriptor, Mapping) else None
        if not isinstance(values, list) or len(values) != 5:
            raise Row20C7Failure("factor-base descriptor changed")
        prime = _exported_integer(values[0], "factor prime")
        generator = _exported_vector(values[1], DEGREE, "factor generator")
        ramification = _exported_integer(values[2], "ramification")
        residue_degree = _exported_integer(values[3], "residue degree")
        if residue_degree == DEGREE:
            ideal = [
                prime if row == column else 0
                for row in range(DEGREE)
                for column in range(DEGREE)
            ]
        else:
            ideal = _prime_modulus_hnf(_multiplication_matrix(table, generator), prime)
        norm = prime**residue_degree
        if _determinant(ideal, DEGREE) != norm:
            raise Row20C7Failure("prime ideal norm changed")
        ideals.extend(ideal)
        norms.append(norm)
        descriptor_owner.extend(
            [
                prime,
                ramification,
                residue_degree,
                int(residue_degree == DEGREE),
                *generator,
            ]
        )
    hnf = _event(w0, "hnf")
    witnesses = hnf.get("relationRecords")
    if not isinstance(witnesses, list) or len(witnesses) != COLUMNS:
        raise Row20C7Failure("relation witnesses changed")
    records: list[int] = []
    generators: list[int] = []
    relation_norms: list[int] = []
    membership_counts: list[int] = []
    ideal_columns = [
        [ideals[25 * index + row * DEGREE + column] for row in range(DEGREE)]
        for index in range(ROWS)
        for column in range(DEGREE)
    ]
    for relation, witness in enumerate(witnesses):
        row = _exported_vector(witness.get("R"), ROWS, "relation")
        records.extend(row)
        exported = witness.get("m")
        alpha = (
            [_exported_integer(exported, "principal generator"), 0, 0, 0, 0]
            if isinstance(exported, Mapping) and exported.get("kind") == "integer"
            else _exported_vector(exported, DEGREE, "principal generator")
        )
        generators.extend(alpha)
        principal = _multiplication_matrix(table, alpha)
        principal_norm = abs(int(_determinant(principal, DEGREE)))
        expected_norm = 1
        products: set[tuple[int, ...]] = {(1, 0, 0, 0, 0)}
        for factor_index, exponent in enumerate(row):
            if exponent < 0 or exponent > 5:
                raise Row20C7Failure("relation exponent left retained domain")
            expected_norm *= norms[factor_index] ** exponent
            for _ in range(exponent):
                products = {
                    tuple(
                        int(value)
                        for value in _multiply(
                            table, left, ideal_columns[5 * factor_index + column]
                        )
                    )
                    for left in products
                    for column in range(DEGREE)
                }
        if principal_norm != expected_norm:
            raise Row20C7Failure(
                "principal norm mismatch at relation " + str(relation + 1)
            )
        for product in products:
            if any(value.denominator != 1 for value in _solve(principal, product)):
                raise Row20C7Failure(
                    "principal ideal factorback failed at relation " + str(relation + 1)
                )
        relation_norms.append(expected_norm)
        membership_counts.append(len(products))
    return {
        "table": table,
        "ideals": ideals,
        "norms": norms,
        "descriptors": descriptor_owner,
        "records": records,
        "generators": generators,
        "relationNorms": relation_norms,
        "membershipCounts": membership_counts,
        "rawLogs": _packed_matrix(hnf.get("exactEmbeddings")),
        "compactLogs": _packed_matrix(hnf.get("exactC")),
        "permutation": _exported_vector(factor.get("perm"), ROWS, "HNF permutation"),
    }


def _power(table: Sequence[int], value: Sequence[int], exponent: int) -> list[Fraction]:
    base = [Fraction(entry) for entry in value]
    if exponent < 0:
        base = _solve(_multiplication_matrix(table, value), [1, 0, 0, 0, 0])
        exponent = -exponent
    result: list[Fraction] = [
        Fraction(1),
        Fraction(0),
        Fraction(0),
        Fraction(0),
        Fraction(0),
    ]
    while exponent:
        if exponent & 1:
            result = [Fraction(entry) for entry in _multiply(table, result, base)]
        base = [Fraction(entry) for entry in _multiply(table, base, base)]
        exponent //= 2
    return result


def compose_authenticated_row20_c7(
    c6: Mapping[str, Any], w0: Mapping[str, Any], ancestry: Mapping[str, Any]
) -> dict[str, Any]:
    """Replay all exact inputs and return data-only C7 closure evidence."""
    if (
        c6.get("schema") != C6_SCHEMA
        or c6.get("status") != "success"
        or c6.get("exactUnitsPublished") is not True
    ):
        raise Row20C7Failure("wrong C6 owner")
    if w0.get("schema") != W0_SCHEMA or w0.get("field", {}).get("id") != FIELD_ID:
        raise Row20C7Failure("wrong pristine W0")
    if c6.get("ancestry", {}).get("pristineW0Sha256") != ancestry.get(
        "pristineW0Sha256"
    ):
        raise Row20C7Failure("C6 is detached from W0")
    exact = _relation_evidence(w0)
    closure = _source_closure(
        exact["records"], exact["rawLogs"], exact["permutation"], exact["compactLogs"]
    )
    compact = [_integer(value, "C6 transform") for value in c6.get("unitTransform", [])]
    units = [_integer(value, "C6 exact unit") for value in c6.get("exactUnitBasis", [])]
    if (
        len(compact) != KERNEL * 2
        or len(units) != DEGREE * 2
        or c6.get("getfuFactor") != ["0", "1", "1", "0"]
    ):
        raise Row20C7Failure("C6 materialized unit shape changed")
    raw_compact = [
        sum(
            closure["transform"][kernel * COLUMNS + source]
            * compact[column * KERNEL + kernel]
            for kernel in range(KERNEL)
        )
        for column in range(2)
        for source in range(COLUMNS)
    ]
    # getfu swaps the compact columns, then inverse-mask bit zero inverts the
    # new first column.  This is the exact ancestry of the materialized order.
    materialized_raw = [-value for value in raw_compact[COLUMNS:]] + raw_compact[
        :COLUMNS
    ]
    generators = [
        exact["generators"][DEGREE * index : DEGREE * (index + 1)]
        for index in range(COLUMNS)
    ]
    for column in range(2):
        product: list[Fraction] = [
            Fraction(1),
            Fraction(0),
            Fraction(0),
            Fraction(0),
            Fraction(0),
        ]
        for generator, exponent in zip(
            generators,
            materialized_raw[column * COLUMNS : (column + 1) * COLUMNS],
            strict=True,
        ):
            product = [
                Fraction(value)
                for value in _multiply(
                    exact["table"], product, _power(exact["table"], generator, exponent)
                )
            ]
        if product != [
            Fraction(value) for value in units[column * DEGREE : (column + 1) * DEGREE]
        ]:
            raise Row20C7Failure(
                "materialized unit is detached from raw principal ancestry"
            )
    proofs = c6.get("exactUnitProofs")
    if not isinstance(proofs, list) or len(proofs) != 2:
        raise Row20C7Failure("C6 exact unit proofs changed")
    inverses: list[int] = []
    norms: list[int] = []
    for column, proof in enumerate(proofs):
        if not isinstance(proof, Mapping) or proof.get(
            "principalIdealProductBasis"
        ) != ["1", "0", "0", "0", "0"]:
            raise Row20C7Failure("C6 unit inverse proof changed")
        inverse = [
            _integer(value, "unit inverse") for value in proof.get("inverseBasis", [])
        ]
        norm = _integer(proof.get("norm"), "unit norm")
        unit = units[column * DEGREE : (column + 1) * DEGREE]
        if (
            len(inverse) != DEGREE
            or norm not in {-1, 1}
            or _determinant(_multiplication_matrix(exact["table"], unit), DEGREE)
            != norm
            or _multiply(exact["table"], unit, inverse) != [1, 0, 0, 0, 0]
        ):
            raise Row20C7Failure("C6 unit norm/inverse replay changed")
        inverses.extend(inverse)
        norms.append(norm)
    regulator = _event(w0, "acceptance").get("exactR")
    if not isinstance(regulator, Mapping) or any(
        name not in regulator for name in ("mantissa", "precision", "exponent")
    ):
        raise Row20C7Failure("regulator authority changed")
    roots = w0.get("prepared", {}).get("rootsOfUnity")
    if roots != {
        "kind": "vector",
        "values": [
            {"kind": "integer", "value": "2"},
            {"kind": "integer", "value": "-1"},
        ],
    }:
        raise Row20C7Failure("torsion authority changed")
    return {
        "schema": SCHEMA,
        "field": dict(w0["field"]),
        "status": "closed",
        "ancestry": dict(ancestry),
        "dimensions": {
            "factorBaseSize": ROWS,
            "relationCount": COLUMNS,
            "kernelRank": KERNEL,
            "degree": DEGREE,
        },
        "relationClosure": {
            "rawToKernelShape": [COLUMNS, KERNEL],
            "rawToKernel": [str(v) for v in closure["transform"]],
            "rightInverseShape": [COLUMNS, ROWS],
            "rightInverse": [str(v) for v in closure["rightInverse"]],
            "presentationShape": [ROWS, ROWS],
            "presentation": [str(v) for v in closure["presentation"]],
            "rawToKernelSha256": _array_digest(closure["transform"]),
            "rightInverseSha256": _array_digest(closure["rightInverse"]),
        },
        "exactRelations": {
            "relationRecords": [str(v) for v in exact["records"]],
            "principalGenerators": [str(v) for v in exact["generators"]],
            "factorBaseDescriptors": [str(v) for v in exact["descriptors"]],
            "factorBaseIdeals": [str(v) for v in exact["ideals"]],
            "factorBaseNorms": [str(v) for v in exact["norms"]],
            "relationNorms": [str(v) for v in exact["relationNorms"]],
            "factorbackMembershipCounts": exact["membershipCounts"],
        },
        "units": {
            "compactTransform": [str(v) for v in compact],
            "materializedRawTransform": [str(v) for v in materialized_raw],
            "coordinates": [str(v) for v in units],
            "norms": [str(v) for v in norms],
            "inverses": [str(v) for v in inverses],
        },
        "regulator": [
            str(regulator["mantissa"]),
            str(regulator["precision"]),
            str(regulator["exponent"]),
        ],
        "torsion": {"order": "2", "generator": ["-1", "0", "0", "0", "0"]},
        "proof": {
            "rawLogsToCompactExact": True,
            "relationTimesKernelZero": True,
            "relationTimesRightInverseIdentity": True,
            "presentationIdentity": True,
            "classNumber": "1",
            "invariants": [],
            "all14PrincipalIdealsExact": True,
            "all14PrincipalNormsExact": True,
            "unitRawAncestryExact": True,
            "unitNormsAndInversesExact": True,
            "hnfState": closure["hnfState"],
            "rawLogsSha256": _array_digest(exact["rawLogs"]),
            "compactLogsSha256": _array_digest(exact["compactLogs"]),
        },
        "assumptions": {
            "pari2174Correspondence": True,
            "factorBaseSelection": True,
            "grhAndRelationBounds": True,
            "publicCompletion": False,
        },
        "provenance": {
            "referenceFinalClassImported": False,
            "referenceFundamentalUnitsImported": False,
            "c6MaterializedUnitsConsumed": True,
            "sourceClosure": "PARI-2.17.4-hnfspec_i",
        },
    }


__all__ = ["Row20C7Failure", "SCHEMA", "compose_authenticated_row20_c7"]
