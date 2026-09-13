"""Actual arithmetic witness; tests prepend the private production helpers."""

from sagejs.ffi.flint import fmpz_matrix
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


@native
def materialize_unit_schedule(
    coefficients: IntegerBuffer,
    table: IntegerBuffer,
    norm_form: IntegerBuffer,
    observations: IntegerBuffer,
    factor: int,
    scale_quotient: int,
    mode: uint64,
    steps: uint64,
) -> bool:
    """Reuse poisoned owners while materializing (factor*a)/factor exactly.

    Mode 0 is unmodified reconstruction; mode 1 deliberately makes only the
    reconstruction unavailable and exercises the actual exact-product fallback.
    Modes 2--4 are invalid scales; 5--6 are exponent caps; 7 is a nonintegral
    quotient; 8 is an integral nonunit. The latter four force product fallback.
    """
    with NativeExactArena(1048576, 3 * 1048576) as arena:
        workspace = arena.integer_vector(8192, 0)
        index: uint64 = 0
        while index < 27:
            workspace[index] = table[index]
            index += 1
        workspace[_IDENTITY_OFFSET] = 1
        index = 0
        while index < 10:
            workspace[_NORM_FORM_OFFSET + index] = norm_form[index]
            index += 1
        log_numerators = arena.foreign_resource(fmpz_matrix, 2, 1)
        log_denominators = arena.foreign_resource(fmpz_matrix, 2, 1)
        log_endpoints = arena.foreign_resource(fmpz_matrix, 4, 1)
        elements = arena.foreign_resource(fmpz_matrix, 7, 5)
        combinations = arena.foreign_resource(fmpz_matrix, 2, 7)
        coordinates = arena.foreign_resource(fmpz_matrix, 8, 5)
        scale: int = 18446744073709551616
        step: uint64 = 0
        while step < steps:
            poison = -791 - step
            row: uint64 = 0
            while row < 7:
                column: uint64 = 0
                while column < 5:
                    elements[row, column] = poison
                    column += 1
                row += 1
            row = 0
            while row < 2:
                column = 0
                while column < 7:
                    combinations[row, column] = poison
                    column += 1
                row += 1
            row = 0
            while row < 8:
                column = 0
                while column < 5:
                    coordinates[row, column] = poison
                    column += 1
                row += 1
            relation_count: uint64 = 2
            if mode == 6:
                relation_count = 5
            row = 0
            while row < relation_count:
                elements[row, 0] = 0
                elements[row, 1] = 0
                elements[row, 2] = 0
                combinations[0, row] = 0
                row += 1
            elements[0, 0] = factor
            elements[1, 1] = factor
            combinations[0, 0] = -1
            combinations[0, 1] = 1
            if mode == 5:
                combinations[0, 1] = 4097
            if mode == 6:
                row = 0
                while row < relation_count:
                    combinations[0, row] = 4096
                    row += 1
            if mode == 7:
                elements[1, 1] = factor + 1
            if mode == 8:
                elements[1, 1] = 2 * factor
            expected_lower, expected_upper = _cubic_regulator_bounds(
                log_numerators,
                log_denominators,
                log_endpoints,
                coefficients,
                1,
                1,
                0,
                0,
                1,
                0,
                1,
                0,
                1,
                0,
                scale,
                64,
            )
            if expected_lower <= 0 or expected_upper < expected_lower:
                return False
            analytic_scale = scale
            dependency_scale = scale * scale_quotient
            if mode == 2:
                analytic_scale = 0
            if mode == 3:
                dependency_scale = scale - 1
            if mode == 4:
                dependency_scale = scale + 1
            index = 0
            while index < 64:
                observations[index] = poison
                index += 1
            # Match the production caller's fatal materialization phase.
            observations[63] = 44
            ready = False
            zero = 0
            one = 0
            two = 0
            lower = 0
            upper = 0
            if mode == 1 or mode >= 5:
                ready, zero, one, two, lower, upper = _materialize_product_only(
                    workspace,
                    coefficients,
                    1,
                    1,
                    0,
                    0,
                    1,
                    0,
                    1,
                    elements,
                    combinations,
                    relation_count,
                    expected_lower * scale_quotient,
                    expected_upper * scale_quotient,
                    analytic_scale,
                    dependency_scale,
                    log_numerators,
                    log_denominators,
                    log_endpoints,
                    coordinates,
                    1,
                    0,
                    0,
                    733,
                    734,
                    735,
                    observations,
                )
            else:
                ready, zero, one, two, lower, upper = (
                    _cubic_materialize_dependency_unit(
                        workspace,
                        coefficients,
                        1,
                        1,
                        0,
                        0,
                        1,
                        0,
                        1,
                        elements,
                        combinations,
                        relation_count,
                        expected_lower * scale_quotient,
                        expected_upper * scale_quotient,
                        analytic_scale,
                        dependency_scale,
                        log_numerators,
                        log_denominators,
                        log_endpoints,
                        coordinates,
                        1,
                        0,
                        0,
                        733,
                        734,
                        735,
                        observations,
                    )
                )
            base: uint64 = 64 + 12 * step
            observations[base] = 0
            if ready:
                observations[base] = 1
            observations[base + 1] = zero
            observations[base + 2] = one
            observations[base + 3] = two
            observations[base + 4] = lower
            observations[base + 5] = upper
            observations[base + 6] = expected_lower
            observations[base + 7] = expected_upper
            observations[base + 8] = observations[59]
            observations[base + 9] = observations[60]
            observations[base + 10] = observations[63]
            observations[base + 11] = observations[62]
            index = 0
            while index < 27:
                if workspace[index] != table[index]:
                    return False
                index += 1
            index = 0
            while index < 10:
                if workspace[_NORM_FORM_OFFSET + index] != norm_form[index]:
                    return False
                index += 1
            row = 0
            while row < relation_count:
                expected_exponent = 0
                if row == 0:
                    expected_exponent = -1
                if row == 1:
                    expected_exponent = 1
                    if mode == 5:
                        expected_exponent = 4097
                if mode == 6:
                    expected_exponent = 4096
                if combinations[0, row] != expected_exponent:
                    return False
                column = 0
                while column < 3:
                    expected_element = 0
                    if row == 0 and column == 0:
                        expected_element = factor
                    if row == 1 and column == 1:
                        expected_element = factor
                        if mode == 7:
                            expected_element = factor + 1
                        if mode == 8:
                            expected_element = 2 * factor
                    if elements[row, column] != expected_element:
                        return False
                    column += 1
                row += 1
            if not ready:
                if (
                    observations[56] != poison
                    or observations[57] != poison
                    or observations[58] != poison
                ):
                    return False
            if mode >= 2 and mode <= 6:
                row = 0
                while row < 8:
                    column = 0
                    while column < 5:
                        if coordinates[row, column] != poison:
                            return False
                        column += 1
                    row += 1
            row = 0
            while row < 8:
                column = 0
                while column < 5:
                    if row >= 6 or column >= 3:
                        if coordinates[row, column] != poison:
                            return False
                    if row < 7 and (row >= relation_count or column >= 3):
                        if elements[row, column] != poison:
                            return False
                    column += 1
                row += 1
            row = 0
            while row < 2:
                column = 0
                while column < 7:
                    if row == 1 or column >= relation_count:
                        if combinations[row, column] != poison:
                            return False
                    column += 1
                row += 1
            step += 1
        return True
