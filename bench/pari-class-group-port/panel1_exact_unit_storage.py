"""Transactional 16384-bit publication check for the row-1 exact units."""

from sagejs.native import IntegerBuffer, Int64Buffer, native


@native
def pari_panel1_exact_unit_storage(
    units: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    published_units: IntegerBuffer,
    norms: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Prove both cubic norms are +1, then publish their six coordinates."""
    if (
        len(units) < 6
        or len(multiplication_tensor) < 27
        or len(published_units) < 6
        or len(norms) < 2
        or len(state) < 4
    ):
        raise ValueError("short panel-1 exact-unit storage")
    for i in range(4):
        state[i] = 0
    state[0] = -1
    for unit in range(2):
        matrix0 = 0
        matrix1 = 0
        matrix2 = 0
        matrix3 = 0
        matrix4 = 0
        matrix5 = 0
        matrix6 = 0
        matrix7 = 0
        matrix8 = 0
        for k in range(3):
            coefficient = units[3 * unit + k]
            matrix0 += coefficient * multiplication_tensor[9 * k]
            matrix1 += coefficient * multiplication_tensor[9 * k + 1]
            matrix2 += coefficient * multiplication_tensor[9 * k + 2]
            matrix3 += coefficient * multiplication_tensor[9 * k + 3]
            matrix4 += coefficient * multiplication_tensor[9 * k + 4]
            matrix5 += coefficient * multiplication_tensor[9 * k + 5]
            matrix6 += coefficient * multiplication_tensor[9 * k + 6]
            matrix7 += coefficient * multiplication_tensor[9 * k + 7]
            matrix8 += coefficient * multiplication_tensor[9 * k + 8]
        determinant = (
            matrix0 * (matrix4 * matrix8 - matrix7 * matrix5)
            - matrix3 * (matrix1 * matrix8 - matrix7 * matrix2)
            + matrix6 * (matrix1 * matrix5 - matrix4 * matrix2)
        )
        state[unit + 1] = determinant
        if determinant != 1:
            return 1
    for i in range(6):
        published_units[i] = units[i]
    norms[0] = 1
    norms[1] = 1
    state[0] = 0
    state[3] = 6
    return 0


__all__ = ["pari_panel1_exact_unit_storage"]
