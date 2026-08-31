"""Resident exact relation discovery, HNF support, and bounded row selection.

The general selectors keep a complete source matrix resident while FLINT
supplies canonical row HNF.  The cubic slice additionally retains reduced
ideal shell candidates, exact norms, prime-power containment, and relation
rows in one arena before applying the same stable deletion schedule.  These
ordinary typed Python bodies also supply the generated JavaScript targets.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    fmpz_mat_det,
    fmpz_mat_hnf,
    fmpz_mat_hnf_transform,
    fmpz_mat_mul,
    fmpz_matrix,
    fmpz_matrix_det,
    fmpz_matrix_entry,
    fmpz_matrix_hnf_into,
    fmpz_matrix_hnf_transform,
    fmpz_matrix_set_entry,
)
from sagejs.native import (
    IntegerBuffer,
    NativeExactArena,
    NativeRecord,
    native,
    uint64,
)


class CubicShellCandidate(NativeRecord):
    """Private lifecycle metadata for one reduced-ideal shell candidate."""

    source_index: uint64
    relation_row: uint64
    smooth: uint64
    selected: uint64


@native
def cubic_reduced_shell_relation_hnf_v1(
    metadata: IntegerBuffer,
    candidate_coordinates: IntegerBuffer,
    candidate_norms: IntegerBuffer,
    candidate_rows: IntegerBuffer,
    selected_candidates: IntegerBuffer,
    hnf_basis: IntegerBuffer,
    norm_coefficients: IntegerBuffer,
    rational_primes: IntegerBuffer,
    reduced_order_rows: IntegerBuffer,
    initial_relation_rows: IntegerBuffer,
    order_basis_numerators: IntegerBuffer,
    prime_power_numerators: IntegerBuffer,
    prime_power_denominators: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_norms: IntegerBuffer,
    order_basis_denominator: int,
    source_count: uint64,
    initial_count: uint64,
    factor_count: uint64,
    prime_power_count: uint64,
    maximum_bits: uint64,
    maximum_trials: uint64,
    work_limit: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    """Discover and select a compact cubic relation slice in one exact arena.

    Each source contributes four candidates from the most productive pair of
    its three reduced basis rows.  Exact cubic norms, prime-power containment,
    smooth relation rows, canonical FLINT HNF, and stable source-order deletion
    all remain resident until the final transactional publication.  The caller
    independently replays every published norm and principal-ideal relation;
    this kernel is a bounded proposal mechanism, never proof authority.
    """
    degree: uint64 = 3
    shell_size: uint64 = 4
    maximum_candidates = source_count * shell_size
    maximum_rows = initial_count + maximum_candidates
    square: uint64 = 9
    valid = (
        source_count > 0
        and source_count <= 8
        and factor_count > 0
        and factor_count <= 16
        and len(rational_primes) > 0
        and len(rational_primes) <= factor_count
        and prime_power_count > 0
        and prime_power_count <= 4096
        and order_basis_denominator > 0
        and maximum_bits > 0
        and maximum_bits <= 65536
        and maximum_trials <= maximum_candidates
        and len(metadata) == 9
        and len(candidate_coordinates) == maximum_candidates * degree
        and len(candidate_norms) == maximum_candidates
        and len(candidate_rows) == maximum_candidates * factor_count
        and len(selected_candidates) == maximum_candidates
        and len(hnf_basis) == maximum_rows * factor_count
        and len(norm_coefficients) == 10
        and len(reduced_order_rows) == source_count * square
        and len(initial_relation_rows) == initial_count * factor_count
        and len(order_basis_numerators) == square
        and len(prime_power_numerators) == prime_power_count * square
        and len(prime_power_denominators) == prime_power_count
        and len(factor_offsets) == factor_count + 1
        and len(factor_norms) == factor_count
        and factor_offsets[0] == 0
        and factor_offsets[factor_count] == prime_power_count
    )
    previous_prime = 1
    prime_index: uint64 = 0
    while valid and prime_index < len(rational_primes):
        prime = rational_primes[prime_index]
        if prime <= previous_prime:
            valid = False
        previous_prime = prime
        prime_index = prime_index + 1
    factor_index: uint64 = 0
    while valid and factor_index < factor_count:
        if (
            factor_offsets[factor_index] > factor_offsets[factor_index + 1]
            or factor_norms[factor_index] <= 1
        ):
            valid = False
        factor_index = factor_index + 1
    power_index: uint64 = 0
    while valid and power_index < prime_power_count:
        if prime_power_denominators[power_index] <= 0:
            valid = False
        row: uint64 = 0
        while valid and row < degree:
            column: uint64 = 0
            while column < row:
                if (
                    prime_power_numerators[power_index * square + row * degree + column]
                    != 0
                ):
                    valid = False
                column = column + 1
            if prime_power_numerators[power_index * square + row * degree + row] == 0:
                valid = False
            row = row + 1
        power_index = power_index + 1
    if not valid:
        return -1

    with NativeExactArena(memory_limit, temporary_limit) as arena:
        coordinates = arena.integer_matrix(maximum_candidates, degree, maximum_bits)
        norms = arena.integer_vector(maximum_candidates, maximum_bits)
        relations = arena.integer_matrix(
            maximum_candidates,
            factor_count,
            maximum_bits,
        )
        exact_coordinates = arena.integer_vector(degree, maximum_bits)
        containment = arena.integer_vector(degree, maximum_bits)
        candidates = arena.records(CubicShellCandidate, maximum_candidates)

        candidate_count: uint64 = 0
        source_index: uint64 = 0
        while source_index < source_count:
            best_score: uint64 = 0
            best_pair: uint64 = 0
            pair_index: uint64 = 0
            while pair_index < degree:
                first: uint64 = 0
                second: uint64 = 1
                if pair_index == 1:
                    first = 0
                    second = 2
                elif pair_index == 2:
                    first = 1
                    second = 2
                score: uint64 = 0
                shell_index: uint64 = 0
                while shell_index < shell_size:
                    left = 1
                    middle = 0
                    if shell_index == 1:
                        left = 0
                        middle = 1
                    elif shell_index == 2:
                        left = 1
                        middle = 1
                    elif shell_index == 3:
                        left = -1
                        middle = 1
                    source_offset = source_index * square
                    x = (
                        left * reduced_order_rows[source_offset + first * degree]
                        + middle * reduced_order_rows[source_offset + second * degree]
                    )
                    y = (
                        left * reduced_order_rows[source_offset + first * degree + 1]
                        + middle
                        * reduced_order_rows[source_offset + second * degree + 1]
                    )
                    z = (
                        left * reduced_order_rows[source_offset + first * degree + 2]
                        + middle
                        * reduced_order_rows[source_offset + second * degree + 2]
                    )
                    norm = (
                        norm_coefficients[0] * x * x * x
                        + norm_coefficients[1] * y * y * y
                        + norm_coefficients[2] * z * z * z
                        + norm_coefficients[3] * x * x * y
                        + norm_coefficients[4] * x * x * z
                        + norm_coefficients[5] * x * y * y
                        + norm_coefficients[6] * y * y * z
                        + norm_coefficients[7] * x * z * z
                        + norm_coefficients[8] * y * z * z
                        + norm_coefficients[9] * x * y * z
                    )
                    if norm < 0:
                        norm = -norm
                    remaining = norm
                    prime_index = 0
                    while prime_index < len(rational_primes):
                        prime = rational_primes[prime_index]
                        while remaining > 1 and remaining % prime == 0:
                            remaining = remaining // prime
                        prime_index = prime_index + 1
                    if norm > 1 and remaining == 1:
                        score = score + 1
                    shell_index = shell_index + 1
                if pair_index == 0 or score > best_score:
                    best_score = score
                    best_pair = pair_index
                pair_index = pair_index + 1

            best_first: uint64 = 0
            best_second: uint64 = 1
            if best_pair == 1:
                best_first = 0
                best_second = 2
            elif best_pair == 2:
                best_first = 1
                best_second = 2
            shell_index = 0
            while shell_index < shell_size:
                left = 1
                middle = 0
                if shell_index == 1:
                    left = 0
                    middle = 1
                elif shell_index == 2:
                    left = 1
                    middle = 1
                elif shell_index == 3:
                    left = -1
                    middle = 1
                source_offset = source_index * square
                x = (
                    left * reduced_order_rows[source_offset + best_first * degree]
                    + middle * reduced_order_rows[source_offset + best_second * degree]
                )
                y = (
                    left * reduced_order_rows[source_offset + best_first * degree + 1]
                    + middle
                    * reduced_order_rows[source_offset + best_second * degree + 1]
                )
                z = (
                    left * reduced_order_rows[source_offset + best_first * degree + 2]
                    + middle
                    * reduced_order_rows[source_offset + best_second * degree + 2]
                )
                norm = (
                    norm_coefficients[0] * x * x * x
                    + norm_coefficients[1] * y * y * y
                    + norm_coefficients[2] * z * z * z
                    + norm_coefficients[3] * x * x * y
                    + norm_coefficients[4] * x * x * z
                    + norm_coefficients[5] * x * y * y
                    + norm_coefficients[6] * y * y * z
                    + norm_coefficients[7] * x * z * z
                    + norm_coefficients[8] * y * z * z
                    + norm_coefficients[9] * x * y * z
                )
                if norm < 0:
                    norm = -norm
                if norm > 1:
                    coordinates[candidate_count, 0] = x
                    coordinates[candidate_count, 1] = y
                    coordinates[candidate_count, 2] = z
                    norms[candidate_count] = norm
                    candidates[candidate_count] = CubicShellCandidate(
                        source_index,
                        0,
                        0,
                        0,
                    )
                    candidate_count = candidate_count + 1
                shell_index = shell_index + 1
            source_index = source_index + 1

        smooth_count: uint64 = 0
        candidate_index: uint64 = 0
        while candidate_index < candidate_count:
            coordinate: uint64 = 0
            while coordinate < degree:
                exact_coordinates[coordinate] = 0
                basis_index: uint64 = 0
                while basis_index < degree:
                    exact_coordinates.addmul(
                        coordinate,
                        coordinates[candidate_index, basis_index],
                        order_basis_numerators[basis_index * degree + coordinate],
                    )
                    basis_index = basis_index + 1
                coordinate = coordinate + 1

            row_norm = 1
            any_valuation = False
            factor_index = 0
            while factor_index < factor_count:
                valuation: uint64 = 0
                candidate_power_index = factor_offsets[factor_index]
                stop = factor_offsets[factor_index + 1]
                member = True
                while member and candidate_power_index < stop:
                    coordinate = 0
                    while member and coordinate < degree:
                        value = (
                            prime_power_denominators[candidate_power_index]
                            * exact_coordinates[coordinate]
                        )
                        prior: uint64 = 0
                        while prior < coordinate:
                            value = (
                                value
                                - containment[prior]
                                * prime_power_numerators[
                                    candidate_power_index * square
                                    + prior * degree
                                    + coordinate
                                ]
                            )
                            prior = prior + 1
                        diagonal = prime_power_numerators[
                            candidate_power_index * square
                            + coordinate * degree
                            + coordinate
                        ]
                        if diagonal == 0 or value % diagonal != 0:
                            member = False
                        else:
                            quotient = value // diagonal
                            containment[coordinate] = quotient
                            if quotient % order_basis_denominator != 0:
                                member = False
                        coordinate = coordinate + 1
                    if member:
                        valuation = valuation + 1
                        any_valuation = True
                    candidate_power_index = candidate_power_index + 1
                relations[candidate_index, factor_index] = valuation
                exponent: uint64 = 0
                while exponent < valuation:
                    row_norm = row_norm * factor_norms[factor_index]
                    exponent = exponent + 1
                factor_index = factor_index + 1
            if any_valuation and row_norm == norms[candidate_index]:
                candidates[candidate_index] = CubicShellCandidate(
                    candidates[candidate_index].source_index,  # type: ignore[attr-defined]
                    initial_count + smooth_count,
                    1,
                    1,
                )
                smooth_count = smooth_count + 1
            candidate_index = candidate_index + 1
        if smooth_count == 0:
            return 0

        total_rows = initial_count + smooth_count
        source_matrix = arena.foreign_resource(fmpz_matrix, total_rows, factor_count)
        basis_matrix = arena.foreign_resource(fmpz_matrix, total_rows, factor_count)
        trial_source_matrix = arena.foreign_resource(
            fmpz_matrix,
            total_rows,
            factor_count,
        )
        trial_hnf_matrix = arena.foreign_resource(
            fmpz_matrix,
            total_rows,
            factor_count,
        )
        source_row: uint64 = 0
        while source_row < initial_count:
            column = 0
            while column < factor_count:
                value = initial_relation_rows[source_row * factor_count + column]
                if not fmpz_matrix_set_entry(
                    source_matrix,
                    source_row,
                    column,
                    value,
                ) or not fmpz_matrix_set_entry(
                    trial_source_matrix,
                    source_row,
                    column,
                    value,
                ):
                    return -1
                column = column + 1
            source_row = source_row + 1
        candidate_index = 0
        while candidate_index < candidate_count:
            candidate = candidates[candidate_index]
            if candidate.smooth == 1:  # type: ignore[attr-defined]
                source_row = candidate.relation_row  # type: ignore[attr-defined]
                column = 0
                while column < factor_count:
                    value = relations[candidate_index, column]
                    if not fmpz_matrix_set_entry(
                        source_matrix,
                        source_row,
                        column,
                        value,
                    ) or not fmpz_matrix_set_entry(
                        trial_source_matrix,
                        source_row,
                        column,
                        value,
                    ):
                        return -1
                    column = column + 1
            candidate_index = candidate_index + 1
        if not fmpz_matrix_hnf_into(basis_matrix, source_matrix):
            return -1
        hnf_calls: uint64 = 1
        work: uint64 = 0
        rank: uint64 = 0
        source_row = 0
        while source_row < total_rows:
            nonzero = False
            column = 0
            while column < factor_count:
                work = work + 1
                if work > work_limit:
                    return -1
                if fmpz_matrix_entry(basis_matrix, source_row, column) != 0:
                    nonzero = True
                column = column + 1
            if nonzero:
                rank = rank + 1
            source_row = source_row + 1

        selected_count = smooth_count
        trials: uint64 = 0
        deletion_complete = True
        candidate_index = 0
        while candidate_index < candidate_count:
            candidate = candidates[candidate_index]
            if candidate.smooth == 1:  # type: ignore[attr-defined]
                if trials >= maximum_trials:
                    deletion_complete = False
                    candidate_index = candidate_count
                elif initial_count + selected_count - 1 >= rank:
                    source_row = candidate.relation_row  # type: ignore[attr-defined]
                    column = 0
                    while column < factor_count:
                        work = work + 1
                        if work > work_limit:
                            return -1
                        if not fmpz_matrix_set_entry(
                            trial_source_matrix,
                            source_row,
                            column,
                            0,
                        ):
                            return -1
                        column = column + 1
                    if not fmpz_matrix_hnf_into(trial_hnf_matrix, trial_source_matrix):
                        return -1
                    hnf_calls = hnf_calls + 1
                    trials = trials + 1
                    same_lattice = True
                    trial_row: uint64 = 0
                    while trial_row < total_rows:
                        column = 0
                        while column < factor_count:
                            work = work + 1
                            if work > work_limit:
                                return -1
                            if fmpz_matrix_entry(
                                trial_hnf_matrix,
                                trial_row,
                                column,
                            ) != fmpz_matrix_entry(
                                basis_matrix,
                                trial_row,
                                column,
                            ):
                                same_lattice = False
                            column = column + 1
                        trial_row = trial_row + 1
                    if same_lattice:
                        selected_count = selected_count - 1
                        candidates[candidate_index] = CubicShellCandidate(
                            candidate.source_index,  # type: ignore[attr-defined]
                            source_row,
                            1,
                            0,
                        )
                    else:
                        column = 0
                        while column < factor_count:
                            work = work + 1
                            if work > work_limit:
                                return -1
                            if not fmpz_matrix_set_entry(
                                trial_source_matrix,
                                source_row,
                                column,
                                relations[candidate_index, column],
                            ):
                                return -1
                            column = column + 1
            candidate_index = candidate_index + 1

        # No caller-owned buffer changes before the complete exact transaction
        # has succeeded.  Publish smooth candidates densely in source order.
        output_index: uint64 = 0
        while output_index < len(candidate_coordinates):
            candidate_coordinates[output_index] = 0
            output_index = output_index + 1
        output_index = 0
        while output_index < len(candidate_norms):
            candidate_norms[output_index] = 0
            selected_candidates[output_index] = 0
            output_index = output_index + 1
        output_index = 0
        while output_index < len(candidate_rows):
            candidate_rows[output_index] = 0
            output_index = output_index + 1
        output_index = 0
        while output_index < len(hnf_basis):
            hnf_basis[output_index] = 0
            output_index = output_index + 1
        published: uint64 = 0
        candidate_index = 0
        while candidate_index < candidate_count:
            candidate = candidates[candidate_index]
            if candidate.smooth == 1:  # type: ignore[attr-defined]
                coordinate = 0
                while coordinate < degree:
                    candidate_coordinates[published * degree + coordinate] = (
                        coordinates[candidate_index, coordinate]
                    )
                    coordinate = coordinate + 1
                candidate_norms[published] = norms[candidate_index]
                selected_candidates[published] = candidate.selected  # type: ignore[attr-defined]
                column = 0
                while column < factor_count:
                    candidate_rows[published * factor_count + column] = relations[
                        candidate_index, column
                    ]
                    column = column + 1
                published = published + 1
            candidate_index = candidate_index + 1
        source_row = 0
        while source_row < total_rows:
            column = 0
            while column < factor_count:
                hnf_basis[source_row * factor_count + column] = fmpz_matrix_entry(
                    basis_matrix,
                    source_row,
                    column,
                )
                column = column + 1
            source_row = source_row + 1
        metadata[0] = candidate_count
        metadata[1] = smooth_count
        metadata[2] = rank
        metadata[3] = selected_count
        metadata[4] = trials
        metadata[5] = hnf_calls
        if deletion_complete:
            metadata[6] = 1
        else:
            metadata[6] = 0
        metadata[7] = work
        metadata[8] = total_rows
        return 1
    return -1


@native
def stable_exact_relation_hnf_select_v1(
    metadata: IntegerBuffer,
    basis: IntegerBuffer,
    selected: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    initial_rows: uint64,
    columns: uint64,
    maximum_trials: uint64,
    work_limit: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    """Apply stable source-order deletion in one basis-only FLINT arena.

    This is deliberately a different kernel from the transform-based resident
    selector below.  It implements the ordinary stable selector exactly: all
    candidate rows begin retained, the canonical HNF basis is computed once,
    and candidates are deleted from left to right precisely when the basis is
    unchanged.  Four fixed-shape matrices are allocated before arithmetic;
    there are no transformation matrices, determinant, or GMP replay
    accumulator.  The packed buffers are only transactional ingress/egress.
    """
    row_entries = rows * columns
    candidate_rows = rows - initial_rows
    valid = rows > 0 and columns > 0 and initial_rows <= rows
    if len(metadata) != 7 or len(basis) != row_entries:
        valid = False
    if len(selected) != candidate_rows or len(source) != row_entries:
        valid = False
    if not valid:
        return -1

    work: uint64 = 0
    for metadata_index in range(7):
        metadata[metadata_index] = 0
    for selected_index in range(candidate_rows):
        selected[selected_index] = 1

    with NativeExactArena(memory_limit, temporary_limit) as arena:
        source_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        basis_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        trial_source_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        trial_hnf_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)

        for source_row in range(rows):
            for source_column in range(columns):
                source_index = source_row * columns + source_column
                source_value = source[source_index]
                if not fmpz_matrix_set_entry(
                    source_matrix, source_row, source_column, source_value
                ):
                    return -1
                if not fmpz_matrix_set_entry(
                    trial_source_matrix, source_row, source_column, source_value
                ):
                    return -1

        if not fmpz_matrix_hnf_into(basis_matrix, source_matrix):
            return -1
        metadata[4] = 1

        rank: uint64 = 0
        for basis_row in range(rows):
            nonzero = False
            for basis_column in range(columns):
                work = work + 1
                if work > work_limit:
                    return -1
                value = fmpz_matrix_entry(basis_matrix, basis_row, basis_column)
                basis[basis_row * columns + basis_column] = value
                if value != 0:
                    nonzero = True
            if nonzero:
                rank = rank + 1

        selected_count: uint64 = candidate_rows
        trials: uint64 = 0
        deletion_complete = True
        candidate_index: uint64 = 0
        while candidate_index < candidate_rows:
            if trials >= maximum_trials:
                deletion_complete = False
                candidate_index = candidate_rows
            elif initial_rows + selected_count - 1 < rank:
                candidate_index = candidate_index + 1
            else:
                deleted_row: uint64 = initial_rows + candidate_index
                for deleted_column in range(columns):
                    work = work + 1
                    if work > work_limit:
                        return -1
                    if not fmpz_matrix_set_entry(
                        trial_source_matrix, deleted_row, deleted_column, 0
                    ):
                        return -1

                if not fmpz_matrix_hnf_into(trial_hnf_matrix, trial_source_matrix):
                    return -1
                metadata[4] = metadata[4] + 1
                same_lattice = True
                for trial_row in range(rows):
                    for trial_column in range(columns):
                        work = work + 1
                        if work > work_limit:
                            return -1
                        if fmpz_matrix_entry(
                            trial_hnf_matrix, trial_row, trial_column
                        ) != fmpz_matrix_entry(basis_matrix, trial_row, trial_column):
                            same_lattice = False
                trials = trials + 1
                if same_lattice:
                    selected[candidate_index] = 0
                    selected_count = selected_count - 1
                else:
                    for restored_column in range(columns):
                        work = work + 1
                        if work > work_limit:
                            return -1
                        restored_index = deleted_row * columns + restored_column
                        if not fmpz_matrix_set_entry(
                            trial_source_matrix,
                            deleted_row,
                            restored_column,
                            source[restored_index],
                        ):
                            return -1
                candidate_index = candidate_index + 1

        metadata[0] = rank
        metadata[1] = initial_rows + selected_count
        metadata[2] = selected_count
        metadata[3] = trials
        metadata[5] = work
        if deletion_complete:
            metadata[6] = 1
        return 1
    return -1


@native
def resident_exact_relation_hnf_select_v2(
    metadata: IntegerBuffer,
    basis: IntegerBuffer,
    support: IntegerBuffer,
    selected: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    initial_rows: uint64,
    columns: uint64,
    maximum_trials: uint64,
    work_limit: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    """Select exact relation rows in one resident FLINT workspace.

    The packed source is an authenticated ingress/checkpoint format only.
    Six fixed-shape FLINT matrices are allocated before arithmetic begins;
    source import, HNF, exact transform replay, support extraction, and every
    bounded deletion trial then run under one native checkpoint.  No public
    matrix or Python ideal is constructed inside the region.  Return values
    are the same compact basis and masks as the original selector.
    """
    row_entries = rows * columns
    candidate_rows = rows - initial_rows
    valid = rows > 0 and columns > 0 and initial_rows <= rows
    if len(metadata) != 7 or len(basis) != row_entries:
        valid = False
    if len(support) != rows or len(selected) != candidate_rows:
        valid = False
    if len(source) != row_entries:
        valid = False
    if not valid:
        return -1

    work: uint64 = 0
    for metadata_index in range(7):
        metadata[metadata_index] = 0
    for support_index in range(rows):
        support[support_index] = 0
    for selected_index in range(candidate_rows):
        selected[selected_index] = 0

    with NativeExactArena(memory_limit, temporary_limit) as arena:
        source_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        basis_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        transform_matrix = arena.foreign_resource(fmpz_matrix, rows, rows)
        trial_source_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        trial_hnf_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        trial_transform_matrix = arena.foreign_resource(fmpz_matrix, rows, rows)

        for source_row in range(rows):
            for source_column in range(columns):
                source_index = source_row * columns + source_column
                source_value = source[source_index]
                if not fmpz_matrix_set_entry(
                    source_matrix, source_row, source_column, source_value
                ):
                    return -1
                if not fmpz_matrix_set_entry(
                    trial_source_matrix, source_row, source_column, source_value
                ):
                    return -1

        if not fmpz_matrix_hnf_transform(basis_matrix, transform_matrix, source_matrix):
            return -1
        metadata[4] = 1

        # Replay `transform * source == basis` without allocating a product
        # matrix. Exact locals and direct exact FFI values stay under the
        # arena checkpoint established after the fixed resource preflight.
        for replay_row in range(rows):
            for replay_column in range(columns):
                replay_value = 0
                for replay_inner in range(rows):
                    replay_value = replay_value + fmpz_matrix_entry(
                        transform_matrix, replay_row, replay_inner
                    ) * fmpz_matrix_entry(source_matrix, replay_inner, replay_column)
                    work = work + 1
                    if work > work_limit:
                        return -1
                if replay_value != fmpz_matrix_entry(
                    basis_matrix, replay_row, replay_column
                ):
                    return 0
        determinant = fmpz_matrix_det(transform_matrix)
        if determinant != 1 and determinant != -1:
            return 0

        rank: uint64 = 0
        for basis_row in range(rows):
            nonzero = False
            for basis_column in range(columns):
                work = work + 1
                if work > work_limit:
                    return -1
                value = fmpz_matrix_entry(basis_matrix, basis_row, basis_column)
                basis[basis_row * columns + basis_column] = value
                if value != 0:
                    nonzero = True
            if nonzero:
                rank = rank + 1

        support_count: uint64 = 0
        for support_source_row in range(rows):
            used = False
            for support_hnf_row in range(rank):
                work = work + 1
                if work > work_limit:
                    return -1
                if (
                    fmpz_matrix_entry(
                        transform_matrix, support_hnf_row, support_source_row
                    )
                    != 0
                ):
                    used = True
            if used:
                support[support_source_row] = 1
                support_count = support_count + 1
                if support_source_row >= initial_rows:
                    selected[support_source_row - initial_rows] = 1

        selected_count: uint64 = 0
        for candidate_index in range(candidate_rows):
            if selected[candidate_index] == 1:
                selected_count = selected_count + 1

        # Zero unretained candidate rows once. Rejected deletion trials restore
        # one exact row; accepted trials leave it absent for later HNF calls.
        for retained_candidate in range(candidate_rows):
            retained_row: uint64 = initial_rows + retained_candidate
            if selected[retained_candidate] == 0:
                for retained_column in range(columns):
                    work = work + 1
                    if work > work_limit:
                        return -1
                    if not fmpz_matrix_set_entry(
                        trial_source_matrix, retained_row, retained_column, 0
                    ):
                        return -1

        trials: uint64 = 0
        deletion_complete = True
        deletion_candidate: uint64 = 0
        while deletion_candidate < candidate_rows:
            if selected[deletion_candidate] == 0:
                deletion_candidate = deletion_candidate + 1
            elif trials >= maximum_trials:
                deletion_complete = False
                deletion_candidate = candidate_rows
            elif initial_rows + selected_count - 1 < rank:
                deletion_candidate = deletion_candidate + 1
            else:
                deleted_row: uint64 = initial_rows + deletion_candidate
                for deleted_column in range(columns):
                    work = work + 1
                    if work > work_limit:
                        return -1
                    if not fmpz_matrix_set_entry(
                        trial_source_matrix, deleted_row, deleted_column, 0
                    ):
                        return -1

                if not fmpz_matrix_hnf_transform(
                    trial_hnf_matrix,
                    trial_transform_matrix,
                    trial_source_matrix,
                ):
                    return -1
                metadata[4] = metadata[4] + 1
                same_lattice = True
                for trial_row in range(rows):
                    for trial_column in range(columns):
                        work = work + 1
                        if work > work_limit:
                            return -1
                        if fmpz_matrix_entry(
                            trial_hnf_matrix, trial_row, trial_column
                        ) != fmpz_matrix_entry(basis_matrix, trial_row, trial_column):
                            same_lattice = False
                trials = trials + 1
                if same_lattice:
                    selected[deletion_candidate] = 0
                    selected_count = selected_count - 1
                else:
                    for restored_column in range(columns):
                        work = work + 1
                        if work > work_limit:
                            return -1
                        restored_index = deleted_row * columns + restored_column
                        if not fmpz_matrix_set_entry(
                            trial_source_matrix,
                            deleted_row,
                            restored_column,
                            source[restored_index],
                        ):
                            return -1
                    deletion_candidate = deletion_candidate + 1

        metadata[0] = rank
        metadata[1] = support_count
        metadata[2] = selected_count
        metadata[3] = trials
        metadata[5] = work
        if deletion_complete:
            metadata[6] = 1
        return 1
    return -1


@native
def resident_exact_relation_hnf_select(
    metadata: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    support: IntegerBuffer,
    selected: IntegerBuffer,
    trial_source: IntegerBuffer,
    trial_hnf: IntegerBuffer,
    replay_product: IntegerBuffer,
    determinant: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    initial_rows: uint64,
    columns: uint64,
    maximum_trials: uint64,
    work_limit: uint64,
    one: uint64,
) -> int:
    """Select source-supported rows in one isolated exact-matrix region.

    Return `1` on success, `0` when exact replay fails, and `-1` for an
    invalid packed ABI or a declared FLINT failure.  `metadata` receives
    rank, support count, selected count, deletion trials, HNF calls, scalar
    work units, and a flag saying whether the deletion schedule completed.
    """
    row_entries = rows * columns
    square_entries = rows * rows
    candidate_rows = rows - initial_rows
    valid = rows > 0 and columns > 0 and initial_rows <= rows
    if len(metadata) != 7:
        valid = False
    if len(basis) != row_entries or len(transform) != square_entries:
        valid = False
    if len(support) != rows or len(selected) != candidate_rows:
        valid = False
    if len(trial_source) != row_entries or len(trial_hnf) != row_entries:
        valid = False
    if len(replay_product) != row_entries or len(determinant) != 1:
        valid = False
    if len(source) != row_entries or one != 1:
        valid = False
    if not valid:
        return -1

    work: uint64 = 0
    for metadata_index in range(7):
        metadata[metadata_index] = 0
    for support_index in range(rows):
        support[support_index] = 0
    for candidate_zero_index in range(candidate_rows):
        selected[candidate_zero_index] = 0

    if not fmpz_mat_hnf_transform(basis, transform, source, rows, columns):
        return -1
    metadata[4] = 1
    if not fmpz_mat_mul(
        replay_product,
        transform,
        source,
        rows,
        rows,
        columns,
    ):
        return -1
    for replay_index in range(row_entries):
        work = work + 1
        if work > work_limit:
            return -1
        if replay_product[replay_index] != basis[replay_index]:
            return 0
    if not fmpz_mat_det(determinant, transform, rows, one):
        return -1
    if determinant[0] != 1 and determinant[0] != -1:
        return 0

    rank: uint64 = 0
    for row in range(rows):
        nonzero = False
        for column in range(columns):
            work = work + 1
            if work > work_limit:
                return -1
            if basis[row * columns + column] != 0:
                nonzero = True
        if nonzero:
            rank = rank + 1

    support_count: uint64 = 0
    for source_row in range(rows):
        used = False
        for hnf_row in range(rank):
            work = work + 1
            if work > work_limit:
                return -1
            if transform[hnf_row * rows + source_row] != 0:
                used = True
        if used:
            support[source_row] = 1
            support_count = support_count + 1
            if source_row >= initial_rows:
                selected[source_row - initial_rows] = 1

    selected_count: uint64 = 0
    for selected_index in range(candidate_rows):
        if selected[selected_index] == 1:
            selected_count = selected_count + 1

    # Construct the retained workspace once.  A deletion trial changes only
    # one candidate row; rejected deletions restore that row, while accepted
    # deletions leave it zero for all later trials.
    for retained_source_row in range(rows):
        retain_source_row = retained_source_row < initial_rows
        if retained_source_row >= initial_rows:
            retained_candidate = retained_source_row - initial_rows
            retain_source_row = selected[retained_candidate] == 1
        for retained_column in range(columns):
            work = work + 1
            if work > work_limit:
                return -1
            retained_target = retained_source_row * columns + retained_column
            if retain_source_row:
                trial_source[retained_target] = source[retained_target]
            else:
                trial_source[retained_target] = 0

    trials: uint64 = 0
    deletion_complete = True
    candidate_index: uint64 = 0
    while candidate_index < candidate_rows:
        if selected[candidate_index] == 0:
            candidate_index = candidate_index + 1
        elif trials >= maximum_trials:
            deletion_complete = False
            candidate_index = candidate_rows
        elif initial_rows + selected_count - 1 < rank:
            candidate_index = candidate_index + 1
        else:
            deleted_row = initial_rows + candidate_index
            for deleted_column in range(columns):
                work = work + 1
                if work > work_limit:
                    return -1
                deleted_target = deleted_row * columns + deleted_column
                trial_source[deleted_target] = 0

            if not fmpz_mat_hnf(trial_hnf, trial_source, rows, columns):
                return -1
            metadata[4] = metadata[4] + 1
            same_lattice = True
            for trial_index in range(row_entries):
                work = work + 1
                if work > work_limit:
                    return -1
                if trial_hnf[trial_index] != basis[trial_index]:
                    same_lattice = False
            trials = trials + 1
            if same_lattice:
                selected[candidate_index] = 0
                selected_count = selected_count - 1
            else:
                for restored_column in range(columns):
                    work = work + 1
                    if work > work_limit:
                        return -1
                    restored_target = deleted_row * columns + restored_column
                    trial_source[restored_target] = source[restored_target]
                candidate_index = candidate_index + 1

    metadata[0] = rank
    metadata[1] = support_count
    metadata[2] = selected_count
    metadata[3] = trials
    metadata[5] = work
    if deletion_complete:
        metadata[6] = 1
    return 1


__all__ = [
    "cubic_reduced_shell_relation_hnf_v1",
    "resident_exact_relation_hnf_select",
    "resident_exact_relation_hnf_select_v2",
    "stable_exact_relation_hnf_select_v1",
]
