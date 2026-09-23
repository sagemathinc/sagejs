"""Exact row-1 class group from an authenticated retained presentation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The host boundary authenticates and decodes the retained PARI events.  This
source-transparent leaf receives only their exact one-dimensional relation HNF
and the first retained factor-base descriptor.  It computes the Smith
transforms, reconstructs the generator ideal, and publishes an exact order
witness; no class number, invariant, or generator ideal is an input.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .class_group_smith_transform import pari_class_group_smith_transform
from .prime_ideal_hnf import pari_prime_ideal_hnf


@native
def pari_row1_nontrivial_cubic_class_path(
    relation_hnf: IntegerBuffer,
    basis_table: IntegerBuffer,
    descriptor_generator: IntegerBuffer,
    descriptor_prime: int,
    descriptor_degree: int,
    descriptor_inert: int,
    smith: IntegerBuffer,
    left: IntegerBuffer,
    left_inverse: IntegerBuffer,
    right: IntegerBuffer,
    ur: IntegerBuffer,
    y: IntegerBuffer,
    uir: IntegerBuffer,
    x: IntegerBuffer,
    m1: IntegerBuffer,
    m2: IntegerBuffer,
    invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    smith_column: IntegerBuffer,
    smith_product: IntegerBuffer,
    smith_augmented: IntegerBuffer,
    left_inverse_state: Int64Buffer,
    right_inverse_state: Int64Buffer,
    first_division_state: Int64Buffer,
    second_division_state: Int64Buffer,
    smith_state: Int64Buffer,
    multiplication: IntegerBuffer,
    ideal_work: IntegerBuffer,
    ideal_pivots: IntegerBuffer,
    generator_ideal: IntegerBuffer,
    order_witness: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Derive the row-1 cyclic group and generator from live retained inputs.

    `order_witness` is `[invariant, generator coordinate, relation
    coefficient, common relation multiple, ideal norm]`.  The Smith identity
    proves that the generator coordinate has exact order `invariant`; the
    reconstructed prime ideal gives that abstract coordinate an exact ideal
    representative.
    """
    if (
        len(relation_hnf) < 1
        or len(basis_table) < 27
        or len(descriptor_generator) < 3
        or len(generator_ideal) < 9
        or len(order_witness) < 5
        or len(state) < 8
    ):
        raise ValueError("short row-1 cubic class-path owner")
    if descriptor_prime < 2 or descriptor_degree != 1 or descriptor_inert != 0:
        raise ValueError("unsupported row-1 factor-base descriptor")
    for i in range(8):
        state[i] = 0
    state[0] = -1

    status = pari_class_group_smith_transform(
        relation_hnf,
        1,
        smith,
        left,
        left_inverse,
        right,
        ur,
        y,
        uir,
        x,
        m1,
        m2,
        invariants,
        class_number,
        smith_column,
        smith_product,
        smith_augmented,
        left_inverse_state,
        right_inverse_state,
        first_division_state,
        second_division_state,
        smith_state,
    )
    state[1] = status
    if status != 0 or smith_state[1] != 1 or invariants[0] <= 1:
        return -1

    generator_coordinate = uir[0]
    relation_coefficient = m1[0]
    common_multiple = relation_hnf[0] * relation_coefficient
    if common_multiple != invariants[0] * generator_coordinate:
        return -1
    state[2] = 1

    ideal_status = pari_prime_ideal_hnf(
        basis_table,
        descriptor_generator,
        3,
        descriptor_prime,
        descriptor_inert,
        multiplication,
        ideal_work,
        ideal_pivots,
        generator_ideal,
    )
    state[3] = ideal_status
    if ideal_status < 1:
        return -1
    ideal_norm = generator_ideal[0] * generator_ideal[4] * generator_ideal[8]
    expected_norm = descriptor_prime
    if ideal_norm != expected_norm:
        return -1

    order_witness[0] = invariants[0]
    order_witness[1] = generator_coordinate
    order_witness[2] = relation_coefficient
    order_witness[3] = common_multiple
    order_witness[4] = ideal_norm
    state[0] = 0
    state[4] = smith_state[6]
    state[5] = invariants[0]
    state[6] = class_number[0]
    state[7] = ideal_norm
    return 0


__all__ = ["pari_row1_nontrivial_cubic_class_path"]
