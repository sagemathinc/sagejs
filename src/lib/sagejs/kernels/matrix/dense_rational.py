"""Source-transparent structural kernels for dense rational matrices.

The canonical `RationalBuffer` aggregate consists of parallel row-major
`IntegerBuffer` values.  Numerators and denominators are coprime,
denominators are positive, and zero is always `0/1`.  The aggregate is
owned by the mathematical matrix object; its component buffers form the
explicit isolated-kernel ABI used below.
"""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64


@native
def dense_rational_matrix_gcd(left: int, right: int) -> int:
    """Return the nonnegative greatest common divisor."""
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


@native
def dense_rational_matrix_normalize(
    numerator: int,
    denominator: int,
) -> tuple[int, int]:
    if denominator == 0:
        raise ZeroDivisionError
    if numerator == 0:
        return 0, 1
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    common = dense_rational_matrix_gcd(numerator, denominator)
    return numerator // common, denominator // common


@native
def dense_rational_matrix_add_pair(
    left_numerator: int,
    left_denominator: int,
    right_numerator: int,
    right_denominator: int,
) -> tuple[int, int]:
    """Add two canonical pairs while limiting intermediate growth."""
    common = dense_rational_matrix_gcd(left_denominator, right_denominator)
    left_scale = left_denominator // common
    right_scale = right_denominator // common
    numerator = left_numerator * right_scale + right_numerator * left_scale
    if numerator == 0:
        return 0, 1
    remaining = dense_rational_matrix_gcd(numerator, common)
    numerator //= remaining
    denominator = left_scale * (right_denominator // remaining)
    return numerator, denominator


@native
def dense_rational_matrix_subtract_pair(
    left_numerator: int,
    left_denominator: int,
    right_numerator: int,
    right_denominator: int,
) -> tuple[int, int]:
    return dense_rational_matrix_add_pair(
        left_numerator,
        left_denominator,
        -right_numerator,
        right_denominator,
    )


@native
def dense_rational_matrix_multiply_pair(
    left_numerator: int,
    left_denominator: int,
    right_numerator: int,
    right_denominator: int,
) -> tuple[int, int]:
    """Multiply canonical pairs with cross-cancellation before products."""
    if left_numerator == 0 or right_numerator == 0:
        return 0, 1
    left_common = dense_rational_matrix_gcd(left_numerator, right_denominator)
    right_common = dense_rational_matrix_gcd(right_numerator, left_denominator)
    numerator = (left_numerator // left_common) * (right_numerator // right_common)
    denominator = (left_denominator // right_common) * (
        right_denominator // left_common
    )
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    return numerator, denominator


@native
def dense_rational_matrix_get(
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    index: int,
) -> tuple[int, int]:
    return numerators[index], denominators[index]


@native
def dense_rational_matrix_set(
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    index: int,
    numerator: int,
    denominator: int,
) -> bool:
    numerator, denominator = dense_rational_matrix_normalize(numerator, denominator)
    numerators[index] = numerator
    denominators[index] = denominator
    return True


@native
def dense_rational_matrix_copy(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
) -> bool:
    valid = len(output_numerators) == len(source_numerators)
    if len(output_denominators) != len(source_denominators):
        valid = False
    if len(source_numerators) != len(source_denominators):
        valid = False
    if valid:
        for index in range(len(source_numerators)):
            output_numerators[index] = source_numerators[index]
            output_denominators[index] = source_denominators[index]
    return valid


@native
def dense_rational_matrix_fill_denominator_one(
    denominators: IntegerBuffer,
) -> bool:
    """Initialize the canonical denominator component for integral entries."""
    for index in range(len(denominators)):
        denominators[index] = 1
    return True


@native
def dense_rational_matrix_identity(
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    size: uint64,
) -> bool:
    valid = len(numerators) == size * size
    if len(denominators) != size * size:
        valid = False
    if valid:
        for row in range(size):
            for column in range(size):
                index = row * size + column
                numerators[index] = 0
                if row == column:
                    numerators[index] = 1
                denominators[index] = 1
    return valid


@native
def dense_rational_matrix_add(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
) -> bool:
    length = len(left_numerators)
    valid = len(left_denominators) == length
    if len(right_numerators) != length:
        valid = False
    if len(right_denominators) != length:
        valid = False
    if len(output_numerators) != length:
        valid = False
    if len(output_denominators) != length:
        valid = False
    if valid:
        for index in range(length):
            numerator, denominator = dense_rational_matrix_add_pair(
                left_numerators[index],
                left_denominators[index],
                right_numerators[index],
                right_denominators[index],
            )
            output_numerators[index] = numerator
            output_denominators[index] = denominator
    return valid


@native
def dense_rational_matrix_subtract(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
) -> bool:
    length = len(left_numerators)
    valid = len(left_denominators) == length
    if len(right_numerators) != length:
        valid = False
    if len(right_denominators) != length:
        valid = False
    if len(output_numerators) != length:
        valid = False
    if len(output_denominators) != length:
        valid = False
    if valid:
        for index in range(length):
            numerator, denominator = dense_rational_matrix_subtract_pair(
                left_numerators[index],
                left_denominators[index],
                right_numerators[index],
                right_denominators[index],
            )
            output_numerators[index] = numerator
            output_denominators[index] = denominator
    return valid


@native
def dense_rational_matrix_negate(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
) -> bool:
    length = len(source_numerators)
    valid = len(source_denominators) == length
    if len(output_numerators) != length:
        valid = False
    if len(output_denominators) != length:
        valid = False
    if valid:
        for index in range(length):
            output_numerators[index] = -source_numerators[index]
            output_denominators[index] = source_denominators[index]
    return valid


@native
def dense_rational_matrix_scalar_multiply(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    scalar_numerator: int,
    scalar_denominator: int,
) -> bool:
    scalar_numerator, scalar_denominator = dense_rational_matrix_normalize(
        scalar_numerator, scalar_denominator
    )
    length = len(source_numerators)
    valid = len(source_denominators) == length
    if len(output_numerators) != length:
        valid = False
    if len(output_denominators) != length:
        valid = False
    if valid:
        for index in range(length):
            numerator, denominator = dense_rational_matrix_multiply_pair(
                source_numerators[index],
                source_denominators[index],
                scalar_numerator,
                scalar_denominator,
            )
            output_numerators[index] = numerator
            output_denominators[index] = denominator
    return valid


@native
def dense_rational_matrix_transpose(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    length = rows * columns
    valid = len(source_numerators) == length
    if len(source_denominators) != length:
        valid = False
    if len(output_numerators) != length:
        valid = False
    if len(output_denominators) != length:
        valid = False
    if valid:
        for row in range(rows):
            for column in range(columns):
                source = row * columns + column
                target = column * rows + row
                output_numerators[target] = source_numerators[source]
                output_denominators[target] = source_denominators[source]
    return valid


@native
def dense_rational_matrix_equal(
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
) -> bool:
    length = len(left_numerators)
    equal = len(left_denominators) == length
    if len(right_numerators) != length:
        equal = False
    if len(right_denominators) != length:
        equal = False
    if equal:
        for index in range(length):
            if left_numerators[index] != right_numerators[index]:
                equal = False
            if left_denominators[index] != right_denominators[index]:
                equal = False
    return equal


@native
def dense_rational_matrix_is_zero(numerators: IntegerBuffer) -> bool:
    answer = True
    for index in range(len(numerators)):
        if numerators[index] != 0:
            answer = False
    return answer


@native
def dense_rational_matrix_is_one(
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    answer = rows == columns and len(numerators) == rows * columns
    if len(denominators) != rows * columns:
        answer = False
    if answer:
        for row in range(rows):
            for column in range(columns):
                index = row * columns + column
                expected = 0
                if row == column:
                    expected = 1
                if numerators[index] != expected:
                    answer = False
                if denominators[index] != 1:
                    answer = False
    return answer


@native
def dense_rational_matrix_nonzero_count(numerators: IntegerBuffer) -> int:
    count = 0
    for index in range(len(numerators)):
        if numerators[index] != 0:
            count += 1
    return count


@native
def dense_rational_matrix_trace(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    size: uint64,
) -> bool:
    valid = len(source_numerators) == size * size
    if len(source_denominators) != size * size:
        valid = False
    if len(output_numerators) != 1 or len(output_denominators) != 1:
        valid = False
    if valid:
        numerator = 0
        denominator = 1
        for index in range(size):
            source = index * size + index
            numerator, denominator = dense_rational_matrix_add_pair(
                numerator,
                denominator,
                source_numerators[source],
                source_denominators[source],
            )
        output_numerators[0] = numerator
        output_denominators[0] = denominator
    return valid


@native
def dense_rational_matrix_stack(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    top_numerators: IntegerBuffer,
    top_denominators: IntegerBuffer,
    bottom_numerators: IntegerBuffer,
    bottom_denominators: IntegerBuffer,
) -> bool:
    valid = len(top_numerators) == len(top_denominators)
    if len(bottom_numerators) != len(bottom_denominators):
        valid = False
    length = len(top_numerators) + len(bottom_numerators)
    if len(output_numerators) != length:
        valid = False
    if len(output_denominators) != length:
        valid = False
    if valid:
        for index in range(len(top_numerators)):
            output_numerators[index] = top_numerators[index]
            output_denominators[index] = top_denominators[index]
        for index in range(len(bottom_numerators)):
            target = len(top_numerators) + index
            output_numerators[target] = bottom_numerators[index]
            output_denominators[target] = bottom_denominators[index]
    return valid


@native
def dense_rational_matrix_augment(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    rows: uint64,
    left_columns: uint64,
    right_columns: uint64,
) -> bool:
    valid = len(left_numerators) == rows * left_columns
    if len(left_denominators) != rows * left_columns:
        valid = False
    if len(right_numerators) != rows * right_columns:
        valid = False
    if len(right_denominators) != rows * right_columns:
        valid = False
    output_columns = left_columns + right_columns
    if len(output_numerators) != rows * output_columns:
        valid = False
    if len(output_denominators) != rows * output_columns:
        valid = False
    if valid:
        for row in range(rows):
            target = row * output_columns
            for column in range(left_columns):
                source = row * left_columns + column
                output_numerators[target + column] = left_numerators[source]
                output_denominators[target + column] = left_denominators[source]
            for column in range(right_columns):
                source = row * right_columns + column
                destination = target + left_columns + column
                output_numerators[destination] = right_numerators[source]
                output_denominators[destination] = right_denominators[source]
    return valid


@native
def dense_rational_matrix_select_rows(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    indices: IntegerBuffer,
    source_rows: uint64,
    columns: uint64,
) -> bool:
    valid = len(source_numerators) == source_rows * columns
    if len(source_denominators) != source_rows * columns:
        valid = False
    if len(output_numerators) != len(indices) * columns:
        valid = False
    if len(output_denominators) != len(indices) * columns:
        valid = False
    if valid:
        for target_row in range(len(indices)):
            source_row = indices[target_row]
            if source_row < 0 or source_row >= source_rows:
                valid = False
            else:
                for column in range(columns):
                    source = source_row * columns + column
                    target = target_row * columns + column
                    output_numerators[target] = source_numerators[source]
                    output_denominators[target] = source_denominators[source]
    return valid


@native
def dense_rational_matrix_select_columns(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    indices: IntegerBuffer,
    rows: uint64,
    source_columns: uint64,
) -> bool:
    valid = len(source_numerators) == rows * source_columns
    if len(source_denominators) != rows * source_columns:
        valid = False
    if len(output_numerators) != rows * len(indices):
        valid = False
    if len(output_denominators) != rows * len(indices):
        valid = False
    if valid:
        for row in range(rows):
            for target_column in range(len(indices)):
                source_column = indices[target_column]
                if source_column < 0 or source_column >= source_columns:
                    valid = False
                else:
                    source = row * source_columns + source_column
                    target = row * len(indices) + target_column
                    output_numerators[target] = source_numerators[source]
                    output_denominators[target] = source_denominators[source]
    return valid


@native
def dense_rational_matrix_kernel_from_rref(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    reduced_numerators: IntegerBuffer,
    reduced_denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    one: uint64,
) -> uint64:
    """Construct a right-kernel spanning set from an RREF matrix.

    The output is a `columns` by `columns` scratch matrix.  Its leading
    `nullity` rows contain one basis vector for each free column; callers
    may row-reduce that small result when they require Sage's canonical
    echelon basis.  Keeping this bookkeeping here makes it source-visible
    typed Python instead of a private C matrix-layout algorithm.
    """
    valid = len(reduced_numerators) == rows * columns
    if len(reduced_denominators) != rows * columns:
        valid = False
    if len(output_numerators) != columns * columns:
        valid = False
    if len(output_denominators) != columns * columns:
        valid = False
    if not valid:
        return rows - rows

    for index in range(columns * columns):
        output_numerators[index] = 0
        output_denominators[index] = 1

    nullity = columns - columns
    for free_column in range(columns):
        is_pivot = False
        for row in range(rows):
            pivot_column = columns
            for scan_column in range(columns):
                if (
                    pivot_column == columns
                    and reduced_numerators[row * columns + scan_column] != 0
                ):
                    pivot_column = scan_column
            if pivot_column == free_column:
                is_pivot = True
        if not is_pivot:
            output_numerators[nullity * columns + free_column] = 1
            for row in range(rows):
                pivot_column = columns
                for scan_column in range(columns):
                    if (
                        pivot_column == columns
                        and reduced_numerators[row * columns + scan_column] != 0
                    ):
                        pivot_column = scan_column
                if pivot_column < columns:
                    source = row * columns + free_column
                    target = nullity * columns + pivot_column
                    output_numerators[target] = -reduced_numerators[source]
                    output_denominators[target] = reduced_denominators[source]
            nullity = nullity + one
    return nullity
