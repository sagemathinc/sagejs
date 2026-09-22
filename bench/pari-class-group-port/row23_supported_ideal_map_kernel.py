"""Bounded native Smith map for the row-23 retained factor-base domain."""

from sagejs.native import IntegerBuffer, Int64Buffer, native


ROWS = 40
COLUMNS = 31
TAIL = 30
ORDER = 6


@native
def pari_row23_supported_ideal_map(
    exponents: IntegerBuffer,
    generator_factors: IntegerBuffer,
    generator_coordinate_inverse: int,
    smith_u: IntegerBuffer,
    smith_v: IntegerBuffer,
    relations: IntegerBuffer,
    transformed: IntegerBuffer,
    representative: IntegerBuffer,
    diagonal_coefficients: IntegerBuffer,
    relation_coefficients: IntegerBuffer,
    replay: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Reduce one signed factor tape through `U W V = D`.

    Matrices use the proof's row-major layout.  `state` is status, public
    coordinate, nonzero relation coefficients, and replayed cells.
    """
    if (
        len(exponents) < COLUMNS
        or len(generator_factors) < COLUMNS
        or len(smith_u) < ROWS * ROWS
        or len(smith_v) < COLUMNS * COLUMNS
        or len(relations) < ROWS * COLUMNS
        or len(transformed) < COLUMNS
        or len(representative) < COLUMNS
        or len(diagonal_coefficients) < ROWS
        or len(relation_coefficients) < ROWS
        or len(replay) < COLUMNS
        or len(state) < 4
    ):
        raise ValueError("short row-23 supported-ideal map owner")
    for index in range(4):
        state[index] = 0
    state[0] = -1
    for column in range(COLUMNS):
        value = 0
        for inner in range(COLUMNS):
            value += exponents[inner] * smith_v[inner * COLUMNS + column]
        transformed[column] = value
    raw_coordinate = transformed[TAIL] % ORDER
    coordinate = (raw_coordinate * generator_coordinate_inverse) % ORDER
    state[1] = coordinate
    for column in range(COLUMNS):
        representative[column] = coordinate * generator_factors[column]
        value = 0
        for inner in range(COLUMNS):
            value += (exponents[inner] - representative[inner]) * smith_v[
                inner * COLUMNS + column
            ]
        transformed[column] = value
        divisor = 1
        if column == TAIL:
            divisor = ORDER
        if value % divisor != 0:
            return -1
        diagonal_coefficients[column] = value // divisor
    for index in range(COLUMNS, ROWS):
        diagonal_coefficients[index] = 0
    for column in range(ROWS):
        value = 0
        for inner in range(ROWS):
            value += diagonal_coefficients[inner] * smith_u[inner * ROWS + column]
        relation_coefficients[column] = value
        if value != 0:
            state[2] += 1
    for column in range(COLUMNS):
        value = 0
        for relation in range(ROWS):
            value += (
                relation_coefficients[relation] * relations[relation * COLUMNS + column]
            )
        replay[column] = value
        if value != exponents[column] - representative[column]:
            return -1
        state[3] += 1
    state[0] = 0
    return 0


__all__ = ["pari_row23_supported_ideal_map"]
