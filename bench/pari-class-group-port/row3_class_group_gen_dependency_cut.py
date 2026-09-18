"""Executable row-3 prefix of PARI 2.17.4 ``class_group_gen``.

This deliberately stops before ``genback``.  Its only mathematical inputs are
the accepted two-column presentation and the terminal factor-base permutation.
It computes the full Smith transformations, both inverse-HNF divisions, ``M1``
and ``M2``, and the factor-base exponent vector which ``genback`` would consume.
No class number, invariant, PARI generator, or reduced ideal is an input.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .class_group_smith_transform import pari_class_group_smith_transform


@native
def pari_row3_class_group_gen_dependency_cut(
    presentation: IntegerBuffer,
    terminal_permutation: Int64Buffer,
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
    genback_exponents: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Compute the honest row-3 ``class_group_gen`` prefix and stop closed.

    ``state`` is status, Smith-complete, active generators, first and second
    HNF-division completion, prepared genback columns, completed genback
    columns, missing-owner code, and factor-base size.  Status ``1`` and
    missing-owner code ``1`` mean that a source-derived reduced-ideal candidate
    owner/backend is unavailable.  This is a diagnostic boundary, never a
    class-group result.
    """
    dimension = 2
    factor_base_size = 668
    size = dimension * dimension
    if (
        len(presentation) < size
        or len(terminal_permutation) < factor_base_size
        or len(genback_exponents) < factor_base_size * dimension
        or len(state) < 9
    ):
        raise ValueError("short row-3 class_group_gen dependency owner")
    for i in range(9):
        state[i] = 0
    state[0] = -1
    state[8] = factor_base_size
    # A permutation is neutral HNF state, but it must still be a true
    # permutation before it is allowed to select factor-base ideals.
    for i in range(factor_base_size):
        value = terminal_permutation[i]
        if value < 1 or value > factor_base_size:
            return -1
        for j in range(i):
            if terminal_permutation[j] == value:
                return -1
    status = pari_class_group_smith_transform(
        presentation,
        dimension,
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
    if status != 0:
        return -1
    active = smith_state[1]
    state[1] = 1
    state[2] = active
    if first_division_state[0] == 0:
        state[3] = 1
    if second_division_state[0] == 0:
        state[4] = 1
    for i in range(factor_base_size * dimension):
        genback_exponents[i] = 0
    # PARI passes one column of Uir to genback, paired with the first n ideals
    # in terminal factor-base order.  Retain that exact request in original
    # factor-base coordinates without pretending to execute idealpowred.
    for output_column in range(active):
        for row in range(dimension):
            original_row = terminal_permutation[row] - 1
            genback_exponents[output_column * factor_base_size + original_row] = uir[
                output_column * dimension + row
            ]
        state[5] += 1
    # No source-derived candidate/reduction owner for this row is available.
    # Publishing a generator ideal here would use an answer-derived PARI owner
    # or silently change algorithms.  Fail closed after the exact request.
    state[6] = 0
    state[7] = 1
    state[0] = 1
    return 1


__all__ = ["pari_row3_class_group_gen_dependency_cut"]
