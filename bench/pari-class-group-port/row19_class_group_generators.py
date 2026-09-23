"""Row-19 class-group transforms and reduced ideal generators.

This is a narrow composition of already translated PARI 2.17.4 machinery.
It consumes the live terminal continuation, the authenticated prepared field,
and the independently computed prepared-prefix factor base.  It does not
consume PARI's class-group output, generator ideals, or invariant factors.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
import json
import sys
from math import prod
from typing import Any

from .class_group_smith_transform import pari_class_group_smith_transform
from .row3_reduced_genback_owner import _multiply, _reduce, _round_binary
from .signed_prime_ideal_reduction import pari_cubic_genback_tape


SCHEMA = "sagejs.pari-class-group/row19-class-group-generators-v1"
TERMINAL_SCHEMA = "sagejs.pari-class-group/row19-terminal-continuation-owner-v1"
PREFIX_SCHEMA = "sagejs.pari-class-group/row19-prepared-prefix-probe-v1"
TERMINAL_OWNER_SHA256 = (
    "f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76"
)
DEGREE = 3
DIMENSION = 9
FACTOR_BASE_SIZE = 424


class Row19ClassGroupFailure(ValueError):
    """The authenticated row-19 class-generator transaction failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row19ClassGroupFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row19ClassGroupFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row19ClassGroupFailure(label + " is not canonical")
        result.append(integer)
    return result


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _digest(values: list[int]) -> str:
    return hashlib.sha256("\n".join(_strings(values)).encode()).hexdigest()


def _json_digest(value: Any) -> str:
    payload = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(payload).hexdigest()


def _multiply_matrices(left: list[int], right: list[int], n: int) -> list[int]:
    """Multiply two column-major square integer matrices."""
    return [
        sum(left[k * n + row] * right[column * n + k] for k in range(n))
        for column in range(n)
        for row in range(n)
    ]


def _matrix_vector(matrix: list[int], vector: list[int], n: int) -> list[int]:
    return [
        sum(matrix[column * n + row] * vector[column] for column in range(n))
        for row in range(n)
    ]


def _smith(w: list[int]) -> dict[str, list[int]]:
    matrices = [[0] * (DIMENSION * DIMENSION) for _ in range(10)]
    invariants = [0] * DIMENSION
    class_number = [0]
    states = [[0] * 7 for _ in range(4)] + [[0] * 9]
    status = pari_class_group_smith_transform(
        w,
        DIMENSION,
        *matrices,
        invariants,
        class_number,
        [0] * DIMENSION,
        [0] * (DIMENSION * DIMENSION),
        [0] * (2 * DIMENSION * DIMENSION),
        *states,
    )
    if status != 0 or states[-1][0] != 0:
        raise Row19ClassGroupFailure("row-19 Smith transformation failed")
    names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"]
    output = dict(zip(names, matrices, strict=True))
    output["invariants"] = invariants
    output["classNumber"] = class_number
    output["state"] = states[-1]
    return output


def _candidate_tape(
    request: list[int], ideals: list[int], table: list[int], rounded_t2: list[int]
) -> tuple[list[int], list[dict[str, list[int]]]]:
    """Compute the exact candidate tape for the row-19 0/1 requests."""
    traces: list[tuple[list[int], list[int], list[int], list[int], list[int]]] = []
    reduced_terms: list[list[int]] = []
    for index, exponent in enumerate(request):
        if exponent not in (0, 1):
            raise Row19ClassGroupFailure("row-19 genback request left the 0/1 corridor")
        if exponent == 1:
            trace = _reduce(
                ideals[9 * index : 9 * (index + 1)], [1, 1], table, rounded_t2
            )
            traces.append(trace)
            reduced_terms.append(trace[-1])
    if not reduced_terms or len(reduced_terms) > 2:
        raise Row19ClassGroupFailure("row-19 request has unsupported support")
    if len(reduced_terms) == 2:
        product = _multiply(reduced_terms[0], reduced_terms[1], table)
        traces.append(_reduce(product, [1, 1], table, rounded_t2))
    tape = [value for trace in traces for value in trace[0]]
    published = [
        {
            "candidate": _strings(trace[0]),
            "inverseIdeal": _strings(trace[1]),
            "weightedBasis": _strings(trace[2]),
            "lllTransform": _strings(trace[3]),
            "reducedIdeal": _strings(trace[4]),
        }
        for trace in traces
    ]
    return tape, published


def _genback(
    request: list[int], ideals: list[int], table: list[int], rounded_t2: list[int]
) -> dict[str, Any]:
    tape, traces = _candidate_tape(request, ideals, table, rounded_t2)
    kinds = [0] * 32
    values = [0] * 128
    exponents = [0] * 32
    metadata = [0]
    cursor = [0]
    output = [0] * 9
    used = pari_cubic_genback_tape(
        prime_ideals=ideals,
        relation_exponents=request,
        prime_count=DIMENSION,
        multiplication_table=table,
        candidates=tape,
        candidate_cursor=cursor,
        output_kinds=kinds,
        output_values=values,
        output_exponents=exponents,
        output_metadata=metadata,
        term_kinds=[0] * 32,
        term_values=[0] * 128,
        term_exponents=[0] * 32,
        term_metadata=[0],
        base=[0] * 9,
        term=[0] * 9,
        current=[0] * 9,
        matrix_scratch=[0] * 9,
        generators=[0] * 27,
        hnf_input=[0] * 18,
        hnf_work=[0] * 30,
        hnf_triangular=[0] * 12,
        hnf_moduli=[0] * 3,
        hnf_intermediate=[0] * 9,
        inverse_basis=[0] * 9,
        congruence_row=[0] * 3,
        candidate=[0] * 3,
        content=[0] * 2,
        multiplication_matrix=[0] * 9,
        product=[0] * 9,
        inverse_numerator=[0] * 3,
        inverse_denominator=[0] * 3,
        output=output,
    )
    if used != sum(value != 0 for value in request) or cursor[0] != len(traces):
        raise Row19ClassGroupFailure("row-19 genback schedule changed")
    count = metadata[0]
    return {
        "idealHnf": _strings(output),
        "factorKinds": kinds[:count],
        "factorValues": _strings(values[: 4 * count]),
        "factorExponents": _strings(exponents[:count]),
        "nonzeroTerms": used,
        "candidateCount": cursor[0],
        "trace": traces,
    }


def compose_row19_class_group_generators(
    terminal: dict[str, Any],
    prepared: dict[str, Any],
    prefix: dict[str, Any],
    ancestry: dict[str, Any],
) -> dict[str, Any]:
    """Compute Smith transforms, genback requests, and reduced generators."""
    if (
        ancestry.get("terminalOwnerSha256") != TERMINAL_OWNER_SHA256
        or ancestry.get("preparedProjectionSha256") != _json_digest(prepared)
        or ancestry.get("prefixProjectionSha256") != _json_digest(prefix)
        or terminal.get("schema") != TERMINAL_SCHEMA
        or terminal.get("authority", {}).get("preparedAuthoritySha256")
        != ancestry.get("preparedAuthoritySha256")
        or terminal.get("authority", {}).get("prefixSha256")
        != ancestry.get("prefixSha256")
        or terminal.get("classNumber") != "39366"
        or terminal.get("acceptanceState") != [2, 0, 0]
        or terminal.get("publication", {}).get("terminalHnfComplete") is not True
        or terminal.get("publication", {}).get("acceptanceComplete") is not True
        or terminal.get("publication", {}).get("oracleDataConsumed") is not False
    ):
        raise Row19ClassGroupFailure("wrong terminal continuation owner")
    if prefix.get("schema") != PREFIX_SCHEMA:
        raise Row19ClassGroupFailure("wrong prepared-prefix owner")
    table = _integers(prepared.get("basis_table"), 27, "multiplication table")
    embedding = _integers(prepared.get("preparation_embedding"), 27, "embedding")
    w = _integers(terminal.get("result", {}).get("W"), 81, "terminal W")
    permutation = _integers(
        terminal.get("result", {}).get("perm"), FACTOR_BASE_SIZE, "permutation"
    )
    if len(set(permutation)) != FACTOR_BASE_SIZE or sorted(permutation) != list(
        range(1, FACTOR_BASE_SIZE + 1)
    ):
        raise Row19ClassGroupFailure("terminal permutation is not bijective")
    factor = prefix.get("factor", {})
    packet_ideals = _integers(
        factor.get("packetIdeals"), 9 * FACTOR_BASE_SIZE, "factor ideals"
    )
    selected: list[int] = []
    for source_index in permutation[:DIMENSION]:
        selected.extend(packet_ideals[9 * (source_index - 1) : 9 * source_index])
    rounded_t2 = [
        _round_binary(embedding[index], embedding[index + 1], embedding[index + 2])
        for index in range(0, 27, 3)
    ]

    smith = _smith(w)
    if smith["classNumber"] != [int(terminal["classNumber"])] or prod(
        smith["invariants"]
    ) != int(terminal["classNumber"]):
        raise Row19ClassGroupFailure("Smith class number disagrees with acceptance")
    identity = [int(i == j) for j in range(DIMENSION) for i in range(DIMENSION)]
    if (
        _multiply_matrices(
            _multiply_matrices(smith["U"], w, DIMENSION), smith["V"], DIMENSION
        )
        != smith["D"]
        or _multiply_matrices(smith["U"], smith["Ui"], DIMENSION) != identity
        or _multiply_matrices(smith["Ui"], smith["U"], DIMENSION) != identity
    ):
        raise Row19ClassGroupFailure("Smith identities changed")

    generators: list[dict[str, Any]] = []
    for column, order in enumerate(smith["invariants"]):
        request = smith["Uir"][column * DIMENSION : (column + 1) * DIMENSION]
        relation = smith["M1"][column * DIMENSION : (column + 1) * DIMENSION]
        left = [order * value for value in request]
        right = _matrix_vector(w, relation, DIMENSION)
        if left != right:
            raise Row19ClassGroupFailure("Smith order relation changed")
        coordinate = _matrix_vector(smith["U"], request, DIMENSION)
        quotient_coordinate = [
            coordinate[index] % smith["invariants"][index] for index in range(DIMENSION)
        ]
        expected_coordinate = [int(index == column) for index in range(DIMENSION)]
        if quotient_coordinate != expected_coordinate:
            raise Row19ClassGroupFailure("Smith generator is not primitive")
        proper_divisors = [value for value in range(1, order) if order % value == 0]
        for divisor in proper_divisors:
            if all(
                divisor * quotient_coordinate[index] % smith["invariants"][index] == 0
                for index in range(DIMENSION)
            ):
                raise Row19ClassGroupFailure("proper divisor kills Smith generator")
        reduced = _genback(request, selected, table, rounded_t2)
        generators.append(
            {
                "smithIndex": column,
                "order": str(order),
                "request": _strings(request),
                "sourceIndices": [
                    permutation[index] - 1
                    for index, exponent in enumerate(request)
                    if exponent != 0
                ],
                "selectedIdealHnfs": [
                    _strings(selected[9 * index : 9 * (index + 1)])
                    for index, exponent in enumerate(request)
                    if exponent != 0
                ],
                "reducedRepresentative": reduced,
                "orderWitness": {
                    "presentationRelation": _strings(relation),
                    "left": _strings(left),
                    "right": _strings(right),
                    "quotientCoordinate": _strings(quotient_coordinate),
                    "properDivisorsRejected": _strings(proper_divisors),
                    "exact": True,
                },
            }
        )

    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "presentation": {
            "dimension": DIMENSION,
            "W": _strings(w),
            "classNumber": terminal["classNumber"],
            "invariants": _strings(smith["invariants"]),
            "matrices": {
                name: _strings(smith[name])
                for name in ("D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2")
            },
            "state": smith["state"],
        },
        "factorBase": {
            "terminalSourceIndices": [value - 1 for value in permutation[:DIMENSION]],
            "selectedIdealHnfs": [
                _strings(selected[9 * index : 9 * (index + 1)])
                for index in range(DIMENSION)
            ],
            "selectedIdealSha256": _digest(selected),
            "roundedT2": _strings(rounded_t2),
        },
        "generators": generators,
        "nextMissingOwner": {
            "name": "raw-to-terminal principal-relation transform",
            "neededFor": [
                "aggregate collected principal generators for each Smith order relation",
                "publish principal ideal equalities for generator powers",
                "construct Ge/Ga/GD/ga and the final class/unit object",
            ],
            "availablePresentationOrderWitnesses": True,
            "principalIdealOrderWitnessesComplete": False,
        },
        "completion": {
            "smithComplete": True,
            "inverseHnfComplete": True,
            "m1M2Complete": True,
            "genbackRequestsComplete": True,
            "reducedClassGeneratorIdealsComplete": True,
            "presentationOrderWitnessesComplete": True,
            "principalIdealOrderWitnessesComplete": False,
            "classArchimedeanAssemblyComplete": False,
            "oracleDataConsumed": False,
            "publicComplete": False,
        },
    }


def main() -> None:
    payload = json.load(sys.stdin)
    answer = compose_row19_class_group_generators(
        payload["terminal"], payload["prepared"], payload["prefix"], payload["ancestry"]
    )
    json.dump(answer, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()


__all__ = ["Row19ClassGroupFailure", "SCHEMA", "compose_row19_class_group_generators"]
