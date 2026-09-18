"""Source-derived reduced ``genback`` owner for frozen panel row 3.

The input is the authenticated row-3 presentation owner.  This module derives
PARI's rounded T2 matrix from its retained exact embedding, computes the three
T2/LLL candidates required by the signed request ``(1, -1)``, and executes the
existing translated cubic ``genback`` arithmetic.  No PARI generator or
reduced ideal is an input.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
from typing import Any

from .prime_ideal_hnf import pari_prime_ideal_hnf
from .signed_genback_computed_t2 import pari_cubic_t2_candidate
from .signed_prime_ideal_reduction import (
    pari_cubic_genback_tape,
    pari_cubic_ideal_hnf_inverse_scaled,
    pari_cubic_ideal_hnf_multiply,
    pari_cubic_idealred_candidate,
)


SCHEMA = "sagejs.pari-class-group/row3-reduced-genback-owner-v1"
PRESENTATION_SCHEMA = "sagejs.pari-class-group/row34-real-cubic-presentation-v1"
FIELD_ID = (
    "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9"
)
ROWS = 668
COLUMNS = 675
DEGREE = 3
ORDER = 6
EMBEDDING_G_SHA256 = "a8f33ea6e2200a91cb4c0bfe3d10cc15271a7eb00a0bac0d044ab4be4f87ec85"


class Row3ReducedGenbackFailure(ValueError):
    """The row-3 source owner or computed reduction failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row3ReducedGenbackFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row3ReducedGenbackFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row3ReducedGenbackFailure(label + " is not canonical")
        result.append(integer)
    return result


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _digest(values: list[int]) -> str:
    return hashlib.sha256("\n".join(_strings(values)).encode()).hexdigest()


def _round_binary(mantissa: int, precision: int, exponent: int) -> int:
    """Round one retained PARI real to the nearest even integer exactly."""
    if precision == -1:
        return mantissa
    shift = precision - exponent
    if shift <= 0:
        return mantissa << -shift
    absolute = abs(mantissa)
    quotient, remainder = divmod(absolute, 1 << shift)
    half = 1 << (shift - 1)
    if remainder > half or (remainder == half and quotient % 2):
        quotient += 1
    return -quotient if mantissa < 0 else quotient


def _lll_storage() -> dict[str, list[int] | list[float]]:
    integer_sizes = {
        "inverse_basis": 9,
        "congruence_row": 3,
        "hnf_work": 30,
        "hnf_triangular": 12,
        "hnf_moduli": 3,
        "inverse_ideal": 9,
        "weighted_basis": 9,
        "lll_basis": 9,
        "lll_transform": 9,
        "lll_selection": 5,
        "lll_stages": 4,
        "flatter_input": 9,
        "flatter_current": 9,
        "flatter_transform": 9,
        "flatter_total_work": 9,
        "flatter_step_t": 9,
        "flatter_step_s": 9,
        "flatter_product": 9,
        "flatter_next_basis": 9,
        "qr_input": 27,
        "qr": 27,
        "qr_vectors": 27,
        "qr_betas": 9,
        "qr_norms": 9,
        "qr_column": 9,
        "flatter_y": 3,
        "flatter_diagnostic": 7,
        "flatter_r1": 12,
        "flatter_r2": 12,
        "flatter_r3": 12,
        "flatter_t1": 4,
        "flatter_t2": 4,
        "flatter_t3": 4,
        "flatter_integers": 4,
        "flatter_inverse": 12,
        "flatter_first": 12,
        "flatter_second": 12,
        "flatter_final": 12,
        "flatter_rounded": 4,
        "lll_exponents": 3,
        "lll_gram": 9,
        "lll_mu_exponents": 9,
        "lll_r_exponents": 9,
        "lll_s_exponents": 3,
        "lll_alpha": 3,
        "lll_column_exponents": 3,
        "output": 3,
    }
    float_sizes = {
        "lll_mu": 9,
        "lll_r": 9,
        "lll_s": 3,
        "lll_approximate": 9,
        "lll_float_gram": 9,
        "lll_float_scratch": 3,
        "lll_temporary": 1,
    }
    storage: dict[str, list[int] | list[float]] = {
        name: [0] * length for name, length in integer_sizes.items()
    }
    storage.update({name: [0.0] * length for name, length in float_sizes.items()})
    return storage


def _candidate(
    ideal: list[int], table: list[int], rounded_t2: list[int]
) -> tuple[list[int], list[int], list[int], list[int]]:
    storage = _lll_storage()
    pari_cubic_t2_candidate(
        ideal=ideal,
        multiplication_table=table,
        rounded_t2=rounded_t2,
        **storage,
    )
    if storage["lll_stages"][3] != 0:  # type: ignore[index]
        raise Row3ReducedGenbackFailure("row-3 candidate needs an LLL fallback")
    return (
        list(storage["output"]),  # type: ignore[arg-type]
        list(storage["inverse_ideal"]),  # type: ignore[arg-type]
        list(storage["weighted_basis"]),  # type: ignore[arg-type]
        list(storage["lll_transform"]),  # type: ignore[arg-type]
    )


def _multiply(left: list[int], right: list[int], table: list[int]) -> list[int]:
    output = [0] * 9
    pari_cubic_ideal_hnf_multiply(
        left,
        right,
        table,
        [0] * 27,
        [0] * 18,
        [0] * 30,
        [0] * 12,
        [0] * 3,
        [0] * 9,
        output,
    )
    return output


def _reduce(
    ideal: list[int],
    content: list[int],
    table: list[int],
    rounded_t2: list[int],
) -> tuple[list[int], list[int], list[int], list[int], list[int]]:
    candidate, inverse, weighted, transform = _candidate(ideal, table, rounded_t2)
    output = [0] * 9
    pari_cubic_idealred_candidate(
        ideal,
        table,
        candidate,
        content,
        [0] * 8,
        [0] * 32,
        [0] * 8,
        [0],
        [0] * 9,
        [0] * 9,
        [0] * 3,
        [0],
        [0] * 30,
        [0] * 12,
        [0] * 3,
        output,
    )
    return candidate, inverse, weighted, transform, output


def _run_genback(
    ideals: list[int], table: list[int], candidates: list[int]
) -> tuple[list[int], list[int], list[int], list[int], int]:
    kinds = [0] * 8
    values = [0] * 32
    exponents = [0] * 8
    metadata = [0]
    cursor = [0]
    output = [0] * 9
    used = pari_cubic_genback_tape(
        ideals,
        [1, -1],
        2,
        table,
        candidates,
        cursor,
        kinds,
        values,
        exponents,
        metadata,
        [0] * 8,
        [0] * 32,
        [0] * 8,
        [0],
        [0] * 9,
        [0] * 9,
        [0] * 9,
        [0] * 9,
        [0] * 27,
        [0] * 18,
        [0] * 30,
        [0] * 12,
        [0] * 3,
        [0] * 9,
        [0] * 9,
        [0] * 3,
        [0] * 3,
        [0] * 2,
        [0] * 9,
        [0] * 9,
        [0] * 3,
        [0],
        output,
    )
    count = metadata[0]
    if cursor != [3] or used != 2:
        raise Row3ReducedGenbackFailure("row-3 genback schedule changed")
    return output, kinds[:count], values[: 4 * count], exponents[:count], used


def compose_row3_reduced_genback_owner(
    owner: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Compute the row-3 reduced representative and exact witnesses."""
    if (
        owner.get("schema") != PRESENTATION_SCHEMA
        or owner.get("field", {}).get("id") != FIELD_ID
        or owner.get("field", {}).get("panelIndex") != 3
    ):
        raise Row3ReducedGenbackFailure("wrong row-3 presentation owner")
    dimensions = owner.get("dimensions", {})
    if (
        dimensions.get("degree") != DEGREE
        or dimensions.get("factorBaseSize") != ROWS
        or dimensions.get("relationCount") != COLUMNS
        or dimensions.get("classPresentationDimension") != 2
    ):
        raise Row3ReducedGenbackFailure("wrong row-3 dimensions")
    presentation = owner.get("presentation", {})
    if _integers(presentation.get("terminalW"), 4, "terminal W") != [3, 0, 0, 2]:
        raise Row3ReducedGenbackFailure("row-3 presentation changed")

    field = owner.get("field", {})
    table = _integers(field.get("multiplicationTensor"), 27, "tensor")
    embedding = _integers(field.get("embeddingG"), 27, "embedding G")
    if _digest(embedding) != EMBEDDING_G_SHA256:
        raise Row3ReducedGenbackFailure("row-3 exact embedding changed")
    rounded_t2 = [
        _round_binary(embedding[index], embedding[index + 1], embedding[index + 2])
        for index in range(0, 27, 3)
    ]
    factor_base = owner.get("factorBase", {})
    ideals = _integers(factor_base.get("ideals"), 9 * ROWS, "factor ideals")
    descriptors = _integers(
        factor_base.get("descriptors"), 16 * ROWS, "factor descriptors"
    )
    if _digest(ideals) != factor_base.get("idealsSha256"):
        raise Row3ReducedGenbackFailure("factor-ideal digest changed")
    permutation = _integers(
        owner.get("replay", {}).get("terminalPermutation"), ROWS, "permutation"
    )
    if (
        len(set(permutation)) != ROWS
        or min(permutation) != 1
        or max(permutation) != ROWS
    ):
        raise Row3ReducedGenbackFailure("terminal permutation changed")
    selected_ideals = ideals[:18]
    for terminal_index in range(2):
        descriptor = descriptors[16 * terminal_index : 16 * (terminal_index + 1)]
        reconstructed = [0] * 9
        pari_prime_ideal_hnf(
            table,
            descriptor[4:7],
            DEGREE,
            descriptor[0],
            descriptor[3],
            [0] * 9,
            [0] * 9,
            [0] * 3,
            reconstructed,
        )
        if (
            reconstructed
            != selected_ideals[9 * terminal_index : 9 * (terminal_index + 1)]
        ):
            raise Row3ReducedGenbackFailure(
                "selected prime ideal reconstruction failed"
            )

    first = selected_ideals[:9]
    second = selected_ideals[9:18]
    traces: list[tuple[list[int], list[int], list[int], list[int]]] = []
    candidate, inverse, weighted, transform, reduced_first = _reduce(
        first, [1, 1], table, rounded_t2
    )
    traces.append((candidate, inverse, weighted, transform))
    scaled_inverse = [0] * 9
    pari_cubic_ideal_hnf_inverse_scaled(
        second,
        table,
        [0] * 9,
        [0] * 3,
        [0] * 30,
        [0] * 12,
        [0] * 3,
        scaled_inverse,
    )
    candidate, inverse, weighted, transform, reduced_second = _reduce(
        scaled_inverse, [1, second[0]], table, rounded_t2
    )
    traces.append((candidate, inverse, weighted, transform))
    product = _multiply(reduced_first, reduced_second, table)
    candidate, inverse, weighted, transform, prepared_reduced = _reduce(
        product, [1, 1], table, rounded_t2
    )
    traces.append((candidate, inverse, weighted, transform))
    candidate_tape = [value for trace in traces for value in trace[0]]
    reduced, kinds, values, factor_exponents, used = _run_genback(
        selected_ideals, table, candidate_tape
    )
    if reduced != prepared_reduced:
        raise Row3ReducedGenbackFailure("computed-candidate replay disagrees")
    # Here the sole compact factor is 1/349.  Clearing it gives the exact,
    # answer-independent ideal identity J*P_349 = (349)*P_11.
    cleared_left = _multiply(reduced, second, table)
    cleared_right = [second[0] * value for value in first]
    if cleared_left != cleared_right:
        raise Row3ReducedGenbackFailure("cleared reduced-ideal witness failed")

    class_map = _integers(
        presentation.get("rawToClassPresentation"), 2 * COLUMNS, "class map"
    )
    relation_coefficients = [
        2 * class_map[column] - 3 * class_map[COLUMNS + column]
        for column in range(COLUMNS)
    ]
    relation_matrix = _integers(
        owner.get("relations", {}).get("matrix"), ROWS * COLUMNS, "relations"
    )
    target = [0] * ROWS
    target[permutation[0] - 1] = ORDER
    target[permutation[1] - 1] = -ORDER
    combined = [
        sum(
            relation_matrix[column * ROWS + row] * relation_coefficients[column]
            for column in range(COLUMNS)
        )
        for row in range(ROWS)
    ]
    if combined != target:
        raise Row3ReducedGenbackFailure("exact order-six relation changed")

    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "request": {
            "terminalIndices": [0, 1],
            "sourceIndices": [permutation[0] - 1, permutation[1] - 1],
            "signedExponents": ["1", "-1"],
            "nonzeroTerms": used,
        },
        "prepared": {
            "roundedT2": _strings(rounded_t2),
            "selectedIdealHnfs": [
                _strings(selected_ideals[:9]),
                _strings(selected_ideals[9:18]),
            ],
            "candidateTrace": [_strings(trace[0]) for trace in traces],
            "inverseIdealTrace": [_strings(trace[1]) for trace in traces],
            "weightedBasisTrace": [_strings(trace[2]) for trace in traces],
            "lllTransformTrace": [_strings(trace[3]) for trace in traces],
        },
        "reducedRepresentative": {
            "idealHnf": _strings(reduced),
            "factorKinds": kinds,
            "factorValues": _strings(values),
            "factorExponents": _strings(factor_exponents),
            "candidateCount": len(traces),
        },
        "principalWitness": {
            "identity": "J * P_349 = (349) * P_11",
            "leftHnf": _strings(cleared_left),
            "rightHnf": _strings(cleared_right),
            "exact": True,
        },
        "orderWitness": {
            "order": str(ORDER),
            "properDivisorsRejected": ["1", "2", "3"],
            "relationCoefficientsSha256": _digest(relation_coefficients),
            "factorBaseExponentsSha256": _digest(target),
            "factorBaseExponents": _strings(target),
            "exact": True,
        },
        "completion": {
            "candidateOwnerComplete": True,
            "genbackRequestComplete": True,
            "principalWitnessComplete": True,
            "orderWitnessComplete": True,
            "unitsComplete": False,
            "publicComplete": False,
        },
    }


__all__ = [
    "Row3ReducedGenbackFailure",
    "SCHEMA",
    "compose_row3_reduced_genback_owner",
]
