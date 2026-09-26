"""Live exact `h = 1` class witness from relation/HNF prefix owners.

This suffix accepts only the relation matrix, its accepted HNF, and the live
HNF column transform.  It derives both relation/presentation witnesses, the
complete Smith transform, and the trivial-quotient proof before publishing any
class output.  Empty generator and generator-order arrays are therefore a
consequence of `D = I`, never an input or an expected answer.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .class_group_final_state import (
    ClassGeneratorComponentOutput,
    TransformComponentOutput,
    canonical_component_sha256,
)
from .class_group_smith_transform import pari_class_group_smith_transform
from .h1_live_class_binding import (
    ASSUMPTION_SCHEMA,
    PROOF_TIER,
    UPSTREAM_ASSUMPTIONS,
    pari_bind_live_h1_class_state,
)
from .relation_hnf_witness import pari_relation_hnf_witness


SCHEMA = "sagejs.pari-class-group/live-h1-class-witness-suffix-v1"


class LiveH1ClassWitnessFailure(ValueError):
    """The live relation/HNF owners do not prove a trivial class quotient."""


@native
def pari_live_h1_class_witness_suffix(
    relation: IntegerBuffer,
    rows: int,
    columns: int,
    full_hnf: IntegerBuffer,
    hnf_transform: IntegerBuffer,
    # Relation/HNF scratch.
    hnf_transform_inverse: IntegerBuffer,
    hnf_inverse_augmented: IntegerBuffer,
    hnf_inverse_state: Int64Buffer,
    relation_to_presentation_scratch: IntegerBuffer,
    presentation_to_relation_scratch: IntegerBuffer,
    relation_witness_state: Int64Buffer,
    # Smith scratch.
    presentation_scratch: IntegerBuffer,
    smith_scratch: IntegerBuffer,
    left_scratch: IntegerBuffer,
    left_inverse_scratch: IntegerBuffer,
    right_scratch: IntegerBuffer,
    ur_scratch: IntegerBuffer,
    y_scratch: IntegerBuffer,
    uir_scratch: IntegerBuffer,
    x_scratch: IntegerBuffer,
    m1_scratch: IntegerBuffer,
    m2_scratch: IntegerBuffer,
    invariants_scratch: IntegerBuffer,
    class_number_scratch: IntegerBuffer,
    smith_column_scratch: IntegerBuffer,
    right_inverse_scratch: IntegerBuffer,
    smith_augmented_scratch: IntegerBuffer,
    left_inverse_state: Int64Buffer,
    right_inverse_state: Int64Buffer,
    first_division_state: Int64Buffer,
    second_division_state: Int64Buffer,
    smith_state: Int64Buffer,
    binding_state: Int64Buffer,
    # Published evidence. These owners and `published_state` are transactional.
    published_presentation: IntegerBuffer,
    published_smith: IntegerBuffer,
    published_left: IntegerBuffer,
    published_left_inverse: IntegerBuffer,
    published_right: IntegerBuffer,
    published_right_inverse: IntegerBuffer,
    published_relation_to_presentation: IntegerBuffer,
    published_presentation_to_relation: IntegerBuffer,
    published_state: Int64Buffer,
) -> int:
    """Publish full class evidence only after the exact `h = 1` proof.

    `published_state` is status, relation rows, relation columns, zero HNF
    columns, checked relation/HNF cells, checked HNF inverse cells,
    presentation cells, Smith product cells, class number, invariant count,
    class-generator count, generator-order-witness count, both relation-map
    cell counts, Smith exact-product cells, and total published matrix cells.
    A mathematical rejection returns 1, 2, or 3 without changing any
    published owner.
    """
    m = rows
    n = columns
    if m < 1 or n < m:
        raise ValueError("invalid live h1 suffix dimensions")
    relation_size = m * n
    transform_size = n * n
    square_size = m * m
    if (
        len(relation) < relation_size
        or len(full_hnf) < relation_size
        or len(hnf_transform) < transform_size
        or len(hnf_transform_inverse) < transform_size
        or len(hnf_inverse_augmented) < 2 * transform_size
        or len(hnf_inverse_state) < 5
        or len(relation_to_presentation_scratch) < relation_size
        or len(presentation_to_relation_scratch) < relation_size
        or len(relation_witness_state) < 8
        or len(presentation_scratch) < square_size
        or len(smith_scratch) < square_size
        or len(left_scratch) < square_size
        or len(left_inverse_scratch) < square_size
        or len(right_scratch) < square_size
        or len(ur_scratch) < square_size
        or len(y_scratch) < square_size
        or len(uir_scratch) < square_size
        or len(x_scratch) < square_size
        or len(m1_scratch) < square_size
        or len(m2_scratch) < square_size
        or len(invariants_scratch) < m
        or len(class_number_scratch) < 1
        or len(smith_column_scratch) < m
        or len(right_inverse_scratch) < square_size
        or len(smith_augmented_scratch) < 2 * square_size
        or len(left_inverse_state) < 5
        or len(right_inverse_state) < 5
        or len(first_division_state) < 6
        or len(second_division_state) < 6
        or len(smith_state) < 7
        or len(binding_state) < 9
        or len(published_presentation) < square_size
        or len(published_smith) < square_size
        or len(published_left) < square_size
        or len(published_left_inverse) < square_size
        or len(published_right) < square_size
        or len(published_right_inverse) < square_size
        or len(published_relation_to_presentation) < relation_size
        or len(published_presentation_to_relation) < relation_size
        or len(published_state) < 16
    ):
        raise ValueError("short live h1 suffix owner")

    status = pari_relation_hnf_witness(
        relation,
        m,
        n,
        full_hnf,
        hnf_transform,
        hnf_transform_inverse,
        hnf_inverse_augmented,
        hnf_inverse_state,
        relation_to_presentation_scratch,
        presentation_to_relation_scratch,
        relation_witness_state,
    )
    if status != 0:
        return 1

    zero_columns = n - m
    for column in range(m):
        source_column = zero_columns + column
        for row in range(m):
            presentation_scratch[column * m + row] = full_hnf[source_column * m + row]

    status = pari_class_group_smith_transform(
        presentation_scratch,
        m,
        smith_scratch,
        left_scratch,
        left_inverse_scratch,
        right_scratch,
        ur_scratch,
        y_scratch,
        uir_scratch,
        x_scratch,
        m1_scratch,
        m2_scratch,
        invariants_scratch,
        class_number_scratch,
        smith_column_scratch,
        right_inverse_scratch,
        smith_augmented_scratch,
        left_inverse_state,
        right_inverse_state,
        first_division_state,
        second_division_state,
        smith_state,
    )
    if status != 0:
        return 2

    status = pari_bind_live_h1_class_state(
        presentation_scratch,
        m,
        smith_scratch,
        left_scratch,
        left_inverse_scratch,
        right_scratch,
        right_inverse_scratch,
        smith_state,
        binding_state,
    )
    if status != 0 or class_number_scratch[0] != 1:
        return 3

    for index in range(square_size):
        published_presentation[index] = presentation_scratch[index]
        published_smith[index] = smith_scratch[index]
        published_left[index] = left_scratch[index]
        published_left_inverse[index] = left_inverse_scratch[index]
        published_right[index] = right_scratch[index]
        published_right_inverse[index] = right_inverse_scratch[index]
    for index in range(relation_size):
        published_relation_to_presentation[index] = relation_to_presentation_scratch[
            index
        ]
        published_presentation_to_relation[index] = presentation_to_relation_scratch[
            index
        ]

    published_state[0] = 0
    published_state[1] = m
    published_state[2] = n
    published_state[3] = zero_columns
    published_state[4] = relation_witness_state[4]
    published_state[5] = relation_witness_state[5]
    published_state[6] = square_size
    published_state[7] = binding_state[4]
    published_state[8] = 1
    published_state[9] = 0
    published_state[10] = 0
    published_state[11] = 0
    published_state[12] = relation_witness_state[6]
    published_state[13] = relation_witness_state[7]
    published_state[14] = smith_state[6]
    published_state[15] = 6 * square_size + 2 * relation_size
    return 0


@dataclass(frozen=True)
class LiveH1ClassWitnessSuffix:
    """Host-facing final class components derived from the live prefix."""

    schema: str
    assumption_schema: str
    proof_tier: str
    upstream_assumptions: tuple[str, ...]
    native_state: tuple[str, ...]
    transforms: TransformComponentOutput
    generators: ClassGeneratorComponentOutput
    class_number: str = "1"
    invariant_factors: tuple[str, ...] = ()
    generator_order_witnesses: tuple[Any, ...] = ()


def _integers(values: Sequence[Any], length: int, name: str) -> list[int]:
    if isinstance(values, (str, bytes)) or len(values) != length:
        raise LiveH1ClassWitnessFailure(name + " has the wrong shape")
    answer: list[int] = []
    for value in values:
        if isinstance(value, bool):
            raise LiveH1ClassWitnessFailure(name + " contains a boolean")
        integer = int(value)
        if str(integer) != str(value):
            raise LiveH1ClassWitnessFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _row_major(values: Sequence[int], rows: int, columns: int) -> list[str]:
    return [
        str(values[column * rows + row])
        for row in range(rows)
        for column in range(columns)
    ]


def _digest(value: str, name: str) -> str:
    if len(value) != 64 or any(
        character not in "0123456789abcdef" for character in value
    ):
        raise LiveH1ClassWitnessFailure(name + " is not a SHA-256 digest")
    return value


def build_live_h1_class_witness_suffix(
    *,
    run_id: str,
    owner_generation: int,
    candidate_sha256: str,
    relation: Sequence[Any],
    rows: int,
    columns: int,
    full_hnf: Sequence[Any],
    hnf_transform: Sequence[Any],
) -> LiveH1ClassWitnessSuffix:
    """Run the same-source suffix and expose ordinary final-state components."""
    if not run_id or owner_generation < 0:
        raise LiveH1ClassWitnessFailure("invalid live owner provenance")
    candidate = _digest(candidate_sha256, "candidate fingerprint")
    relation_size = rows * columns
    transform_size = columns * columns
    square_size = rows * rows
    relation_input = _integers(relation, relation_size, "relation")
    hnf_input = _integers(full_hnf, relation_size, "full HNF")
    transform_input = _integers(hnf_transform, transform_size, "HNF transform")
    integer = lambda length: [0] * length
    int64 = lambda length: [0] * length
    public = [integer(square_size) for _ in range(6)]
    relation_public = [integer(relation_size), integer(relation_size)]
    state = int64(16)
    status = pari_live_h1_class_witness_suffix(
        relation_input,
        rows,
        columns,
        hnf_input,
        transform_input,
        integer(transform_size),
        integer(2 * transform_size),
        int64(5),
        integer(relation_size),
        integer(relation_size),
        int64(8),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(square_size),
        integer(rows),
        integer(1),
        integer(rows),
        integer(square_size),
        integer(2 * square_size),
        int64(5),
        int64(5),
        int64(6),
        int64(6),
        int64(7),
        int64(9),
        *public,
        *relation_public,
        state,
    )
    if status != 0:
        raise LiveH1ClassWitnessFailure("live relation/HNF owners do not prove h = 1")
    presentation, smith, left, left_inverse, right, right_inverse = public
    relation_to_presentation, presentation_to_relation = relation_public
    evidence = {
        "shape": [str(rows), str(rows)],
        "presentation": _row_major(presentation, rows, rows),
        "left": _row_major(left, rows, rows),
        "left_inverse": _row_major(left_inverse, rows, rows),
        "right": _row_major(right, rows, rows),
        "right_inverse": _row_major(right_inverse, rows, rows),
        "diagonal": _row_major(smith, rows, rows),
        "relation_to_presentation_shape": [str(columns), str(rows)],
        "relation_to_presentation": _row_major(relation_to_presentation, columns, rows),
        "presentation_to_relation_shape": [str(rows), str(columns)],
        "presentation_to_relation": _row_major(presentation_to_relation, rows, columns),
    }
    transforms = TransformComponentOutput(
        run_id,
        owner_generation,
        "smith-and-hnf-complete",
        candidate,
        evidence,
    )
    generators = ClassGeneratorComponentOutput(
        run_id,
        owner_generation,
        "class-group-gen-complete",
        candidate,
        canonical_component_sha256(evidence),
        {"entries": []},
    )
    return LiveH1ClassWitnessSuffix(
        SCHEMA,
        ASSUMPTION_SCHEMA,
        PROOF_TIER,
        UPSTREAM_ASSUMPTIONS,
        tuple(str(value) for value in state),
        transforms,
        generators,
    )


__all__ = [
    "LiveH1ClassWitnessFailure",
    "LiveH1ClassWitnessSuffix",
    "SCHEMA",
    "build_live_h1_class_witness_suffix",
    "pari_live_h1_class_witness_suffix",
]
