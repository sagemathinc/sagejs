"""Bounded source-transparent partial-pivot LU on owned binary64 buffers.

Private N3 candidate, not an automatically selected public backend. Status 1
rejects shape/storage, status 2 rejects nonfinite input or arithmetic. Status 0
means the factorization completed, not that the matrix is nonsingular. The
caller discards all writable buffers on failure and independently validates
reconstruction. Buffers must be separate and exclusively owned.
"""

from sagejs.native import Float64Buffer, native, uint64


@native
def factor_partial_pivot(
    source: Float64Buffer,
    working: Float64Buffer,
    permutation: Float64Buffer,
    output: Float64Buffer,
    rows: uint64,
    columns: uint64,
) -> float:
    """Factor at most 128 by 128 entries with the ordinary LU pivot policy.

    `working` contains unit-lower multipliers and the upper factor. Permutation
    indices are exact binary64 integers within this bounded shape. `output[0]`
    counts row swaps. There are no host callbacks or fast-math reassociations.
    """
    if rows < 1:
        return 1.0
    if rows > 128:
        return 1.0
    if columns < 1:
        return 1.0
    if columns > 128:
        return 1.0
    count = rows * columns
    if len(source) < count:
        return 1.0
    if len(working) < count:
        return 1.0
    if len(permutation) < rows:
        return 1.0
    if len(output) < 1:
        return 1.0
    maximum = 1.7976931348623157e308
    for index in range(count):
        value = source[index]
        if value != value:
            return 2.0
        if abs(value) > maximum:
            return 2.0
        working[index] = value
    for row in range(rows):
        permutation[row] = float(row)
    swaps = 0.0
    steps = rows
    if columns < steps:
        steps = columns
    for index in range(steps):
        pivot_row = index
        pivot_size = 0.0
        for row in range(index, rows):
            candidate = abs(working[row * columns + index])
            if candidate > pivot_size:
                pivot_size = candidate
                pivot_row = row
        if pivot_size != 0.0:
            if pivot_row != index:
                for column in range(columns):
                    upper = index * columns + column
                    lower = pivot_row * columns + column
                    temporary = working[upper]
                    working[upper] = working[lower]
                    working[lower] = temporary
                temporary = permutation[index]
                permutation[index] = permutation[pivot_row]
                permutation[pivot_row] = temporary
                swaps = swaps + 1.0
            pivot = working[index * columns + index]
            for row in range(index + 1, rows):
                location = row * columns + index
                multiplier = working[location] / pivot
                working[location] = multiplier
                for column in range(index + 1, columns):
                    target = row * columns + column
                    value = (
                        working[target] - multiplier * working[index * columns + column]
                    )
                    if value != value:
                        return 2.0
                    if abs(value) > maximum:
                        return 2.0
                    working[target] = value
    output[0] = swaps
    return 0.0
