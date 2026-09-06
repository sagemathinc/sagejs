"""Exact prefix witnesses and frozen pre-extraction one-shot reference.

The reference block is copied from a72f4150, before helper extraction. It is a
test oracle only, not a second production mathematical implementation.
"""

from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


def _compact_poison_tail(
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


def _compact_check_tail(
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


def _compact_record_discovery(
    observations: IntegerBuffer,
    combinations: FmpzMatrix,
    offset: uint64,
    rows: uint64,
    found: bool,
    lower: int,
    upper: int,
    scale: int,
    bits: uint64,
    precision: uint64,
    cheap: bool,
) -> bool:
    observations[offset] = rows
    observations[offset + 1] = 0
    if found:
        observations[offset + 1] = 1
    observations[offset + 2] = lower
    observations[offset + 3] = upper
    observations[offset + 4] = scale
    observations[offset + 5] = bits
    observations[offset + 6] = precision
    column: uint64 = 0
    while column < 4:
        observations[offset + 7 + column] = 0
        observations[offset + 11 + column] = 0
        if not cheap and column < rows:
            observations[offset + 7 + column] = combinations[0, column]
            observations[offset + 11 + column] = combinations[1, column]
        column += 1
    # For (2*a^k), exact ideal dependence means exponent sum zero. The
    # surviving a-exponent certifies which actual unit the logs describe.
    exponent_sum = 0
    unit_power = 0
    column = 0
    while not cheap and column < rows:
        exponent_sum += combinations[0, column]
        unit_power += column * combinations[0, column]
        column += 1
    if exponent_sum != 0:
        return False
    observations[offset + 15] = unit_power
    return True


@native
def compact_one_shot_reference(
    coefficients: IntegerBuffer,
    elements: IntegerBuffer,
    output: IntegerBuffer,
    observations: IntegerBuffer,
    rows: uint64,
    cheap: bool,
    temporary_limit: uint64,
) -> bool:
    """Frozen one-shot body, with exact-sized owners and identical inputs."""
    with NativeExactArena(1048576, temporary_limit) as arena:
        resident_dimensions = arena.integer_vector(1, 0)
        resident_dimensions[0] = rows
        log_numerators = arena.foreign_resource(fmpz_matrix, 2, 1)
        log_denominators = arena.foreign_resource(fmpz_matrix, 2, 1)
        log_endpoints = arena.foreign_resource(fmpz_matrix, 4, 1)
        relation_count: uint64 = rows
        factor_count: uint64 = 1
        relation_rank: uint64 = 1
        one_column: uint64 = 1
        support_count: uint64 = 1
        proof_unit_found = cheap
        reuse_online_relation_support = True
        denominator = 1
        basis_zero_zero = 1
        basis_zero_one = 0
        basis_zero_two = 0
        basis_one_one = 1
        basis_one_two = 0
        basis_two_two = 1
        analytic_scale = 18446744073709551616
        class_number_upper = 1
        proof_regulator_lower = 0
        proof_regulator_upper = 0
        if cheap:
            support_count = rows
            proof_regulator_lower, proof_regulator_upper = _cubic_regulator_bounds(
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
                analytic_scale,
                64,
            )
        relation_matrix = arena.foreign_resource(fmpz_matrix, rows, 1)
        relation_elements = arena.foreign_resource(fmpz_matrix, rows, 3)
        relation_hnf = arena.foreign_resource(fmpz_matrix, rows, 1)
        proof_relation_support = arena.foreign_resource(fmpz_matrix, rows, 1)
        row: uint64 = 0
        while row < rows:
            relation_matrix[row, 0] = 1
            proof_relation_support[row, 0] = 0
            if row == 0 or cheap:
                proof_relation_support[row, 0] = 1
            column: uint64 = 0
            while column < 3:
                relation_elements[row, column] = elements[3 * row + column]
                column += 1
            row += 1
        if not fmpz_matrix_hnf_into(relation_hnf, relation_matrix):
            return False
        # Preserve a bounded tail of final reduced-ideal witnesses not already in
        # the HNF support.  These redundant principal relations are useful for
        # finding a short generator of the rank-one unit lattice.
        compact_tail_start: uint64 = 0
        if relation_count > _CUBIC_RELATION_REDUNDANCY_TAIL:
            compact_tail_start = relation_count - _CUBIC_RELATION_REDUNDANCY_TAIL
        compact_tail_count: uint64 = 0
        compact_source_row = compact_tail_start
        while compact_source_row < relation_count:
            if proof_relation_support[compact_source_row, 0] == 0:
                compact_tail_count += 1
            compact_source_row += 1
        compact_relation_count: uint64 = support_count + compact_tail_count
        compact_relation_matrix = arena.foreign_resource(
            fmpz_matrix,
            compact_relation_count,
            factor_count,
        )
        compact_relation_hnf = arena.foreign_resource(
            fmpz_matrix,
            compact_relation_count,
            factor_count,
        )
        compact_relation_elements = arena.foreign_resource(
            fmpz_matrix,
            compact_relation_count,
            3,
        )
        compact_row: uint64 = _cubic_copy_relation_support_tail(
            relation_matrix,
            relation_elements,
            proof_relation_support,
            relation_count,
            factor_count,
            compact_tail_start,
            compact_relation_matrix,
            compact_relation_elements,
        )
        if compact_row != compact_relation_count:
            return False
        if proof_unit_found:
            compact_row = 0
            while compact_row < compact_relation_count:
                compact_column: uint64 = 0
                while compact_column < factor_count:
                    compact_relation_hnf[compact_row, compact_column] = relation_hnf[
                        compact_row, compact_column
                    ]
                    compact_column += 1
                compact_row += 1
        elif not fmpz_matrix_hnf_into(
            compact_relation_hnf,
            compact_relation_matrix,
        ):
            return False
        compact_rank: uint64 = 0
        compact_row = 0
        while compact_row < compact_relation_count:
            compact_nonzero = False
            compact_column: uint64 = 0
            while compact_column < factor_count:
                if compact_relation_hnf[compact_row, compact_column] != 0:
                    compact_nonzero = True
                compact_column += 1
            if compact_nonzero:
                compact_rank += 1
            compact_row += 1
        if compact_rank != factor_count:
            return False
        if reuse_online_relation_support:
            compact_row = 0
            while compact_row < factor_count:
                compact_column = 0
                while compact_column < factor_count:
                    if (
                        compact_relation_hnf[compact_row, compact_column]
                        != relation_hnf[compact_row, compact_column]
                    ):
                        output[59] = 422
                        output[60] = support_count
                        return False
                    compact_column += 1
                compact_row += 1
        compact_index = class_number_upper
        if not proof_unit_found:
            compact_smith = arena.foreign_resource(
                fmpz_matrix,
                compact_relation_count,
                factor_count,
            )
            if not fmpz_matrix_snf_into(compact_smith, compact_relation_matrix):
                return False
            compact_index = 1
            compact_column = 0
            while compact_column < factor_count:
                compact_invariant = compact_smith[compact_column, compact_column]
                if compact_invariant < 0:
                    compact_invariant = -compact_invariant
                if compact_invariant < 1:
                    return False
                compact_index *= compact_invariant
                compact_column += 1
        if compact_index != class_number_upper:
            return False
        dependency_relation_elements = compact_relation_elements
        proof_relation_count = compact_relation_count
        output[52] = proof_relation_count
        # Reconstruct missing units from exact HNF dependencies.
        dependency_scan_active = not proof_unit_found
        dependency_relation_storage: uint64 = proof_relation_count
        dependency_row_storage: uint64 = proof_relation_count - relation_rank
        if not dependency_scan_active:
            dependency_relation_storage = 1
            dependency_row_storage = 1
        compact_relation_transform = arena.foreign_resource(
            fmpz_matrix,
            dependency_relation_storage,
            dependency_relation_storage,
        )
        if dependency_scan_active and not fmpz_matrix_hnf_transform(
            compact_relation_hnf,
            compact_relation_transform,
            compact_relation_matrix,
        ):
            return False
        output[59] = 431
        dependency_count: uint64 = proof_relation_count - relation_rank
        dependency_relations = arena.foreign_resource(
            fmpz_matrix,
            dependency_row_storage,
            dependency_relation_storage,
        )
        dependency_reduced = arena.foreign_resource(
            fmpz_matrix,
            dependency_row_storage,
            dependency_relation_storage,
        )
        dependency_lll_transform = arena.foreign_resource(
            fmpz_matrix,
            dependency_row_storage,
            dependency_row_storage,
        )
        if dependency_scan_active:
            if dependency_count == 0:
                output[63] = 43
                return False
            dependency_row: uint64 = 0
            while dependency_row < dependency_count:
                relation_index: uint64 = 0
                while relation_index < proof_relation_count:
                    dependency_relations[dependency_row, relation_index] = (
                        compact_relation_transform[
                            relation_rank + dependency_row, relation_index
                        ]
                    )
                    relation_index += 1
                dependency_row += 1
            if not fmpz_matrix_lll_transform(
                dependency_reduced,
                dependency_lll_transform,
                dependency_relations,
            ):
                return False
        # Plan log precision from the resident dependency coefficients.
        dependency_coefficient_bits: uint64 = 0
        if dependency_scan_active:
            dependency_probe_row: uint64 = 0
            while dependency_probe_row < dependency_count:
                relation_index: uint64 = 0
                while relation_index < proof_relation_count:
                    coefficient_bits = _cubic_bounded_bit_length(
                        dependency_reduced[dependency_probe_row, relation_index],
                        512,
                    )
                    if coefficient_bits > 512:
                        return False
                    if coefficient_bits > dependency_coefficient_bits:
                        dependency_coefficient_bits = coefficient_bits
                    relation_index += 1
                dependency_probe_row += 1
        output[59] = 432
        output[60] = dependency_coefficient_bits
        dependency_log_scale = analytic_scale
        # Budget for both dependency combination and Euclidean cleanup.
        dependency_precision_extra: uint64 = 2 * dependency_coefficient_bits + 64
        dependency_precision_index: uint64 = 0
        while dependency_precision_index < dependency_precision_extra:
            dependency_log_scale *= 2
            dependency_precision_index += 1
        dependency_log_precision: uint64 = (
            _CUBIC_ANALYTIC_PRECISION + dependency_precision_extra
        )
        relation_logs = arena.foreign_resource(
            fmpz_matrix,
            dependency_relation_storage,
            2,
        )
        if dependency_scan_active:
            dependency_root_lower, dependency_root_upper = _cubic_real_root_interval(
                coefficients, dependency_log_scale
            )
            if dependency_root_upper < dependency_root_lower:
                return False
            relation_index: uint64 = 0
            while relation_index < proof_relation_count:
                (
                    witness_log_lower,
                    witness_log_upper,
                ) = _cubic_real_log_bounds_from_root_interval(
                    log_numerators,
                    log_denominators,
                    log_endpoints,
                    denominator,
                    basis_zero_zero,
                    basis_zero_one,
                    basis_zero_two,
                    basis_one_one,
                    basis_one_two,
                    basis_two_two,
                    dependency_relation_elements[relation_index, 0],
                    dependency_relation_elements[relation_index, 1],
                    dependency_relation_elements[relation_index, 2],
                    dependency_root_lower,
                    dependency_root_upper,
                    dependency_log_scale,
                    dependency_log_precision,
                )
                if witness_log_upper < witness_log_lower:
                    return False
                relation_logs[relation_index, 0] = witness_log_lower
                relation_logs[relation_index, 1] = witness_log_upper
                relation_index += 1
        output[59] = 433
        unit_combinations = arena.foreign_resource(
            fmpz_matrix,
            2,
            dependency_relation_storage,
        )
        dependency_row = 0
        while dependency_scan_active and dependency_row < dependency_count:
            dependency_nonzero = False
            dependency_log_lower = 0
            dependency_log_upper = 0
            relation_index: uint64 = 0
            while relation_index < proof_relation_count:
                dependency_exponent = dependency_reduced[dependency_row, relation_index]
                if dependency_exponent != 0:
                    dependency_nonzero = True
                    witness_log_lower = relation_logs[relation_index, 0]
                    witness_log_upper = relation_logs[relation_index, 1]
                    if dependency_exponent > 0:
                        dependency_log_lower += dependency_exponent * witness_log_lower
                        dependency_log_upper += dependency_exponent * witness_log_upper
                    else:
                        dependency_log_lower += dependency_exponent * witness_log_upper
                        dependency_log_upper += dependency_exponent * witness_log_lower
                relation_index += 1
            dependency_orientation = 0
            dependency_regulator_lower = dependency_log_lower
            dependency_regulator_upper = dependency_log_upper
            if dependency_log_lower > 0:
                dependency_orientation = 1
            elif dependency_log_upper < 0:
                dependency_orientation = -1
                dependency_regulator_lower = -dependency_log_upper
                dependency_regulator_upper = -dependency_log_lower
            if dependency_nonzero and dependency_orientation != 0:
                relation_index = 0
                while relation_index < proof_relation_count:
                    dependency_exponent = dependency_reduced[
                        dependency_row, relation_index
                    ]
                    unit_combinations[1, relation_index] = (
                        dependency_orientation * dependency_exponent
                    )
                    relation_index += 1
                if not proof_unit_found:
                    relation_index = 0
                    while relation_index < proof_relation_count:
                        unit_combinations[0, relation_index] = unit_combinations[
                            1, relation_index
                        ]
                        relation_index += 1
                    proof_unit_found = True
                    proof_regulator_lower = dependency_regulator_lower
                    proof_regulator_upper = dependency_regulator_upper
                else:
                    candidate_middle = (
                        dependency_regulator_lower + dependency_regulator_upper
                    )
                    best_middle = proof_regulator_lower + proof_regulator_upper
                    if candidate_middle < best_middle:
                        relation_index = 0
                        while relation_index < proof_relation_count:
                            saved_exponent = unit_combinations[0, relation_index]
                            unit_combinations[0, relation_index] = unit_combinations[
                                1, relation_index
                            ]
                            unit_combinations[1, relation_index] = saved_exponent
                            relation_index += 1
                        saved_lower = proof_regulator_lower
                        saved_upper = proof_regulator_upper
                        proof_regulator_lower = dependency_regulator_lower
                        proof_regulator_upper = dependency_regulator_upper
                        dependency_regulator_lower = saved_lower
                        dependency_regulator_upper = saved_upper
                    reduction_step: uint64 = 0
                    reduction_active = True
                    while reduction_active and reduction_step < 1024:
                        candidate_middle = (
                            dependency_regulator_lower + dependency_regulator_upper
                        )
                        best_middle = proof_regulator_lower + proof_regulator_upper
                        reduction_quotient = (
                            candidate_middle + best_middle // 2
                        ) // best_middle
                        if reduction_quotient < 1:
                            reduction_quotient = 1
                        remainder_lower = (
                            dependency_regulator_lower
                            - reduction_quotient * proof_regulator_upper
                        )
                        remainder_upper = (
                            dependency_regulator_upper
                            - reduction_quotient * proof_regulator_lower
                        )
                        remainder_orientation = 0
                        if remainder_lower > 0:
                            remainder_orientation = 1
                        elif remainder_upper < 0:
                            remainder_orientation = -1
                            saved_lower = remainder_lower
                            remainder_lower = -remainder_upper
                            remainder_upper = -saved_lower
                        if (
                            remainder_orientation == 0
                            or remainder_upper >= proof_regulator_lower
                        ):
                            reduction_active = False
                        else:
                            relation_index = 0
                            while relation_index < proof_relation_count:
                                best_exponent = unit_combinations[0, relation_index]
                                candidate_exponent = unit_combinations[
                                    1, relation_index
                                ]
                                remainder_exponent = remainder_orientation * (
                                    candidate_exponent
                                    - reduction_quotient * best_exponent
                                )
                                unit_combinations[0, relation_index] = (
                                    remainder_exponent
                                )
                                unit_combinations[1, relation_index] = best_exponent
                                relation_index += 1
                            dependency_regulator_lower = proof_regulator_lower
                            dependency_regulator_upper = proof_regulator_upper
                            proof_regulator_lower = remainder_lower
                            proof_regulator_upper = remainder_upper
                        reduction_step += 1
            dependency_row += 1
        output[59] = 434
        return _compact_record_discovery(
            observations,
            unit_combinations,
            0,
            proof_relation_count,
            proof_unit_found,
            proof_regulator_lower,
            proof_regulator_upper,
            dependency_log_scale,
            dependency_coefficient_bits,
            dependency_log_precision,
            cheap,
        )


@native
def compact_prefix_schedule(
    coefficients: IntegerBuffer,
    elements: IntegerBuffer,
    output: IntegerBuffer,
    observations: IntegerBuffer,
    capacity: uint64,
    extra_columns: uint64,
    steps: uint64,
    first_rows: uint64,
    cheap: bool,
    temporary_limit: uint64,
) -> bool:
    """Reuse every owner across grow/shrink prefixes; poison all inactive data."""
    with NativeExactArena(1048576, temporary_limit) as arena:
        resident_dimensions = arena.integer_vector(1, 0)
        resident_dimensions[0] = capacity
        log_numerators = arena.foreign_resource(fmpz_matrix, 2, 1)
        log_denominators = arena.foreign_resource(fmpz_matrix, 2, 1)
        log_endpoints = arena.foreign_resource(fmpz_matrix, 4, 1)
        relation_matrix = arena.foreign_resource(
            fmpz_matrix, capacity, 1 + extra_columns
        )
        relation_elements = arena.foreign_resource(
            fmpz_matrix, capacity, 3 + extra_columns
        )
        relation_hnf = arena.foreign_resource(fmpz_matrix, capacity, 1 + extra_columns)
        proof_relation_support = arena.foreign_resource(
            fmpz_matrix, capacity, 1 + extra_columns
        )
        compact_matrix = arena.foreign_resource(
            fmpz_matrix, capacity, 1 + extra_columns
        )
        compact_elements = arena.foreign_resource(
            fmpz_matrix, capacity, 3 + extra_columns
        )
        compact_hnf = arena.foreign_resource(fmpz_matrix, capacity, 1 + extra_columns)
        compact_smith = arena.foreign_resource(fmpz_matrix, capacity, 1 + extra_columns)
        transform = arena.foreign_resource(fmpz_matrix, capacity, capacity)
        dependencies = arena.foreign_resource(fmpz_matrix, capacity - 1, capacity)
        reduced = arena.foreign_resource(fmpz_matrix, capacity - 1, capacity)
        lll_transform = arena.foreign_resource(fmpz_matrix, capacity - 1, capacity - 1)
        logs = arena.foreign_resource(fmpz_matrix, capacity, 2 + extra_columns)
        combinations = arena.foreign_resource(fmpz_matrix, 2 + extra_columns, capacity)
        analytic_scale = 18446744073709551616
        step: uint64 = 0
        while step < steps:
            rows: uint64 = first_rows
            if steps > 1 and step % 2 == 1:
                rows = 4
            if rows > resident_dimensions[0]:
                return False
            poison = -991 - step
            poisoned = _compact_poison_tail(
                relation_matrix, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                relation_elements, rows, 3, capacity, 3 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                relation_hnf, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                proof_relation_support, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                compact_matrix, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                compact_elements, rows, 3, capacity, 3 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                compact_hnf, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                compact_smith, rows, 1, capacity, 1 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                transform, rows, rows, capacity, capacity, poison
            )
            poisoned = _compact_poison_tail(
                dependencies, rows - 1, rows, capacity - 1, capacity, poison
            )
            poisoned = _compact_poison_tail(
                reduced, rows - 1, rows, capacity - 1, capacity, poison
            )
            poisoned = _compact_poison_tail(
                lll_transform, rows - 1, rows - 1, capacity - 1, capacity - 1, poison
            )
            poisoned = _compact_poison_tail(
                logs, rows, 2, capacity, 2 + extra_columns, poison
            )
            poisoned = _compact_poison_tail(
                combinations, 2, rows, 2 + extra_columns, capacity, poison
            )
            row: uint64 = 0
            while row < rows:
                relation_matrix[row, 0] = 1
                proof_relation_support[row, 0] = 0
                if row == 0 or cheap:
                    proof_relation_support[row, 0] = 1
                column: uint64 = 0
                while column < 3:
                    relation_elements[row, column] = elements[3 * row + column]
                    column += 1
                row += 1
            if not fmpz_matrix_hnf_prefix_into(relation_hnf, relation_matrix, rows, 1):
                return False
            support_count: uint64 = 1
            lower = 0
            upper = 0
            if cheap:
                support_count = rows
                lower, upper = _cubic_regulator_bounds(
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
                    analytic_scale,
                    64,
                )
            tail, count = _cubic_compact_relation_plan(
                proof_relation_support,
                rows,
                support_count,
            )
            if count != rows:
                return False
            if not _cubic_prepare_compact_presentation(
                relation_matrix,
                relation_elements,
                relation_hnf,
                proof_relation_support,
                compact_matrix,
                compact_elements,
                compact_hnf,
                output,
                rows,
                1,
                tail,
                count,
                support_count,
                cheap,
                True,
            ):
                return False
            if not cheap:
                if not _cubic_verify_compact_presentation_index(
                    compact_smith,
                    compact_matrix,
                    count,
                    1,
                    1,
                ):
                    return False
                if not fmpz_matrix_hnf_transform_prefix(
                    compact_hnf,
                    transform,
                    compact_matrix,
                    count,
                    1,
                ):
                    return False
            status, bits, scale, precision = _cubic_reduce_dependency_prefix(
                transform,
                dependencies,
                reduced,
                lll_transform,
                output,
                count,
                1,
                count - 1,
                not cheap,
                analytic_scale,
            )
            if status != 1:
                return False
            if not _cubic_fill_dependency_logs(
                coefficients,
                log_numerators,
                log_denominators,
                log_endpoints,
                compact_elements,
                logs,
                1,
                1,
                0,
                0,
                1,
                0,
                1,
                count,
                not cheap,
                scale,
                precision,
            ):
                return False
            found, lower, upper = _cubic_discover_dependency_unit(
                reduced,
                logs,
                combinations,
                count,
                count - 1,
                not cheap,
                cheap,
                lower,
                upper,
            )
            if not _compact_record_discovery(
                observations,
                combinations,
                16 * step,
                count,
                found,
                lower,
                upper,
                scale,
                bits,
                precision,
                cheap,
            ):
                return False
            if not _compact_check_tail(
                relation_matrix, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                relation_elements, rows, 3, capacity, 3 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                relation_hnf, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                proof_relation_support, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                compact_matrix, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                compact_elements, rows, 3, capacity, 3 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                compact_hnf, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                compact_smith, rows, 1, capacity, 1 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                transform, rows, rows, capacity, capacity, poison
            ):
                return False
            if not _compact_check_tail(
                dependencies, rows - 1, rows, capacity - 1, capacity, poison
            ):
                return False
            if not _compact_check_tail(
                reduced, rows - 1, rows, capacity - 1, capacity, poison
            ):
                return False
            if not _compact_check_tail(
                lll_transform, rows - 1, rows - 1, capacity - 1, capacity - 1, poison
            ):
                return False
            if not _compact_check_tail(
                logs, rows, 2, capacity, 2 + extra_columns, poison
            ):
                return False
            if not _compact_check_tail(
                combinations, 2, rows, 2 + extra_columns, capacity, poison
            ):
                return False
            row = 0
            while row < rows:
                if relation_matrix[row, 0] != 1:
                    return False
                column: uint64 = 0
                while column < 3:
                    if relation_elements[row, column] != elements[3 * row + column]:
                        return False
                    column += 1
                row += 1
            step += 1
        return True
