"""Bounded row-19 class-presentation suffix over retained terminal owners.

PARI 2.17.4 algorithm, copyright (C) The PARI group; GPL-2.0-or-later.
"""

from typing import TypedDict

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    int64_workspace,
    integer_buffer_view,
    integer_workspace,
    native,
    uint64,
)

from .class_group_smith_transform import pari_class_group_smith_transform


class Row19ClassManifest(TypedDict):
    factor_count: uint64
    relation_count: uint64
    class_dimension: uint64


@native
def pari_row19_phase6_resident_class_private(
    manifest: Row19ClassManifest,
    terminal_h_owner: IntegerBuffer,
    invariants_output: IntegerBuffer,
    class_number_output: IntegerBuffer,
    class_state_output: Int64Buffer,
) -> int:
    """Compute the Smith presentation without materializing host matrices."""
    dimension = 9
    size = 81
    terminal_h: IntegerBuffer = integer_buffer_view(terminal_h_owner, 0, 81)
    smith: IntegerBuffer = integer_workspace(81, 16)
    left: IntegerBuffer = integer_workspace(81, 16)
    left_inverse: IntegerBuffer = integer_workspace(81, 16)
    right: IntegerBuffer = integer_workspace(81, 16)
    ur: IntegerBuffer = integer_workspace(81, 16)
    y: IntegerBuffer = integer_workspace(81, 16)
    uir: IntegerBuffer = integer_workspace(81, 16)
    x: IntegerBuffer = integer_workspace(81, 16)
    m1: IntegerBuffer = integer_workspace(81, 16)
    m2: IntegerBuffer = integer_workspace(81, 16)
    column: IntegerBuffer = integer_workspace(9, 16)
    product: IntegerBuffer = integer_workspace(81, 16)
    augmented: IntegerBuffer = integer_workspace(162, 16)
    left_inverse_state: Int64Buffer = int64_workspace(5)
    right_inverse_state: Int64Buffer = int64_workspace(5)
    first_division_state: Int64Buffer = int64_workspace(6)
    second_division_state: Int64Buffer = int64_workspace(6)
    smith_state: Int64Buffer = int64_workspace(7)

    if (
        manifest["factor_count"] != 424
        or manifest["relation_count"] != 430
        or manifest["class_dimension"] != 9
        or len(terminal_h_owner) < size
        or len(invariants_output) < dimension
        or len(class_number_output) < 1
        or len(class_state_output) < 12
    ):
        raise ValueError("unsupported row-19 resident class boundary")
    for i in range(12):
        class_state_output[i] = 0
    status = pari_class_group_smith_transform(
        terminal_h,
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
        invariants_output,
        class_number_output,
        column,
        product,
        augmented,
        left_inverse_state,
        right_inverse_state,
        first_division_state,
        second_division_state,
        smith_state,
    )
    class_state_output[0] = status
    for i in range(7):
        class_state_output[1 + i] = smith_state[i]
    if status != 0:
        return status
    if class_number_output[0] != 39366:
        class_state_output[8] = 1
        return 1
    for i in range(dimension):
        expected = 3
        if i == 0:
            expected = 6
        if invariants_output[i] != expected:
            class_state_output[8] = 2
            class_state_output[9] = i
            return 2
    class_state_output[8] = 0
    class_state_output[10] = smith_state[1]
    class_state_output[11] = smith_state[6]
    return 0
