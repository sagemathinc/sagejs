"""Actual recovery-helper witness; the test prepends production definitions."""

from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


def _recovery_poison_tail(
    value: FmpzMatrix,
    rows: uint64,
    columns: uint64,
    physical_rows: uint64,
    physical_columns: uint64,
    poison: int,
) -> bool:
    row: uint64 = 0
    while row < physical_rows:
        column: uint64 = 0
        while column < physical_columns:
            if row >= rows or column >= columns:
                value[row, column] = poison
            column += 1
        row += 1
    return True


def _recovery_check_tail(
    value: FmpzMatrix,
    rows: uint64,
    columns: uint64,
    physical_rows: uint64,
    physical_columns: uint64,
    poison: int,
) -> bool:
    row: uint64 = 0
    while row < physical_rows:
        column: uint64 = 0
        while column < physical_columns:
            if row >= rows or column >= columns:
                if value[row, column] != poison:
                    return False
            column += 1
        row += 1
    return True


@native
def recovery_prefix_schedule(
    coefficients: IntegerBuffer,
    table: IntegerBuffer,
    norm_form: IntegerBuffer,
    elements: IntegerBuffer,
    observations: IntegerBuffer,
    capacity: uint64,
    extra_columns: uint64,
    steps: uint64,
    first_rows: uint64,
    temporary_limit: uint64,
) -> bool:
    """Compare logical recovery prefixes without allocating inside the loop."""
    with NativeExactArena(1048576, temporary_limit) as arena:
        workspace = arena.integer_vector(8192, 0)
        index: uint64 = 0
        while index < 27:
            workspace[index] = table[index]
            index += 1
        index = 0
        while index < 10:
            workspace[_NORM_FORM_OFFSET + index] = norm_form[index]
            index += 1
        log_numerators = arena.foreign_resource(fmpz_matrix, 2, 1)
        log_denominators = arena.foreign_resource(fmpz_matrix, 2, 1)
        log_endpoints = arena.foreign_resource(fmpz_matrix, 4, 1)
        candidates = arena.foreign_resource(fmpz_matrix, capacity, 1 + extra_columns)
        relation_elements = arena.foreign_resource(
            fmpz_matrix, capacity, 3 + extra_columns
        )
        matrix = arena.foreign_resource(fmpz_matrix, capacity, 1 + extra_columns)
        hnf = arena.foreign_resource(fmpz_matrix, capacity, 1 + extra_columns)
        transform = arena.foreign_resource(fmpz_matrix, capacity, capacity)
        dependencies = arena.foreign_resource(fmpz_matrix, capacity - 1, capacity)
        reduced = arena.foreign_resource(fmpz_matrix, capacity - 1, capacity)
        dependency_transform = arena.foreign_resource(
            fmpz_matrix, capacity - 1, capacity - 1
        )
        logs = arena.foreign_resource(fmpz_matrix, capacity, 2 + extra_columns)
        combinations = arena.foreign_resource(fmpz_matrix, 2 + extra_columns, capacity)
        result = arena.foreign_resource(
            fmpz_matrix, 1 + extra_columns, 5 + extra_columns
        )
        scale: int = 18446744073709551616
        step: uint64 = 0
        while step < steps:
            rows: uint64 = first_rows
            if steps > 1 and step % 2 == 1:
                rows = 4
            poison = -991 - step
            poisoned = _recovery_poison_tail(
                candidates, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _recovery_poison_tail(
                relation_elements, rows, 3, capacity, 3 + extra_columns, poison
            )
            poisoned = _recovery_poison_tail(
                matrix, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _recovery_poison_tail(
                hnf, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _recovery_poison_tail(
                transform, rows, rows, capacity, capacity, poison
            )
            poisoned = _recovery_poison_tail(
                dependencies, rows - 1, rows, capacity - 1, capacity, poison
            )
            poisoned = _recovery_poison_tail(
                reduced, rows - 1, rows, capacity - 1, capacity, poison
            )
            poisoned = _recovery_poison_tail(
                dependency_transform,
                rows - 1,
                rows - 1,
                capacity - 1,
                capacity - 1,
                poison,
            )
            poisoned = _recovery_poison_tail(
                logs, rows, 2, capacity, 2 + extra_columns, poison
            )
            poisoned = _recovery_poison_tail(
                combinations, 2, rows, 2 + extra_columns, capacity, poison
            )
            poisoned = _recovery_poison_tail(
                result, 1, 5, 1 + extra_columns, 5 + extra_columns, poison
            )
            row: uint64 = 0
            while row < rows:
                candidates[row, 0] = 1
                column: uint64 = 0
                while column < 3:
                    relation_elements[row, column] = elements[3 * row + column]
                    column += 1
                if (
                    _cubic_coordinate_norm(
                        workspace,
                        elements[3 * row],
                        elements[3 * row + 1],
                        elements[3 * row + 2],
                    )
                    != 8
                ):
                    return False
                if (
                    _cubic_norm_form_value(
                        workspace,
                        elements[3 * row],
                        elements[3 * row + 1],
                        elements[3 * row + 2],
                    )
                    != 8
                ):
                    return False
                row += 1
            status = _cubic_relation_prefix_has_archimedean_unit(
                log_numerators,
                log_denominators,
                log_endpoints,
                workspace,
                coefficients,
                candidates,
                relation_elements,
                rows,
                1,
                1,
                1,
                0,
                0,
                1,
                0,
                1,
                scale,
                64,
                matrix,
                hnf,
                transform,
                dependencies,
                reduced,
                dependency_transform,
                logs,
                combinations,
                result,
            )
            observations[6 * step] = status
            if status != 1:
                return False
            index = 0
            while index < 5:
                observations[6 * step + 1 + index] = result[0, index]
                index += 1
            if not _recovery_check_tail(
                candidates, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _recovery_check_tail(
                relation_elements, rows, 3, capacity, 3 + extra_columns, poison
            ):
                return False
            if not _recovery_check_tail(
                matrix, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _recovery_check_tail(
                hnf, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _recovery_check_tail(
                transform, rows, rows, capacity, capacity, poison
            ):
                return False
            if not _recovery_check_tail(
                dependencies, rows - 1, rows, capacity - 1, capacity, poison
            ):
                return False
            if not _recovery_check_tail(
                reduced, rows - 1, rows, capacity - 1, capacity, poison
            ):
                return False
            if not _recovery_check_tail(
                dependency_transform,
                rows - 1,
                rows - 1,
                capacity - 1,
                capacity - 1,
                poison,
            ):
                return False
            if not _recovery_check_tail(
                logs, rows, 2, capacity, 2 + extra_columns, poison
            ):
                return False
            if not _recovery_check_tail(
                combinations, 2, rows, 2 + extra_columns, capacity, poison
            ):
                return False
            if not _recovery_check_tail(
                result, 1, 5, 1 + extra_columns, 5 + extra_columns, poison
            ):
                return False
            row = 0
            while row < rows:
                if candidates[row, 0] != 1:
                    return False
                column: uint64 = 0
                while column < 3:
                    if relation_elements[row, column] != elements[3 * row + column]:
                        return False
                    column += 1
                row += 1
            step += 1
        return True
