"""Exercise the production borrowed presentation with real exact reductions."""

from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_matrix,
    fmpz_matrix_hnf_prefix_into,
    fmpz_matrix_snf_prefix_into,
)
from sagejs.native import (
    IntegerBuffer,
    NativeExactArena,
    NativeIntegerVector,
    UInt64Buffer,
    native,
    uint64,
)
from sagejs.number_fields.cubic_class_number_native import (
    _cubic_prepare_full_relation_presentation,
    _cubic_finish_full_relation_presentation,
    _cubic_publish_trivial_relation_presentation,
    _cubic_publish_relation_factor_rows,
    _cubic_publish_relation_rows,
)


@native
def presentation_schedule(
    input_rows: IntegerBuffer,
    prefixes: UInt64Buffer,
    observations: IntegerBuffer,
    diagnostics: IntegerBuffer,
    dimension: uint64,
    reuse_online: bool,
    established_full_rank: bool,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> bool:
    """Poison every owner, then use growing and shrinking logical prefixes."""
    if (
        dimension == 0
        or dimension > 9
        or len(input_rows) % dimension != 0
        or len(input_rows) // dimension > 44
        or len(observations) != 16 * len(prefixes)
        or len(diagnostics) != 64
    ):
        return False
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        workspace = arena.integer_vector(8192, 0)
        source = arena.foreign_resource(fmpz_matrix, 46, 11)
        relation_matrix = arena.foreign_resource(fmpz_matrix, 46, 11)
        hermite = arena.foreign_resource(fmpz_matrix, 46, 11)
        smith = arena.foreign_resource(fmpz_matrix, 46, 11)
        oracle_hnf = arena.foreign_resource(fmpz_matrix, 46, 11)
        online_basis = arena.foreign_resource(fmpz_matrix, 11, 11)
        input_count: uint64 = len(input_rows) // dimension
        row: uint64 = 0
        while row < 46:
            column: uint64 = 0
            while column < 11:
                source[row, column] = -733
                if row < input_count and column < dimension:
                    source[row, column] = input_rows[dimension * row + column]
                column += 1
            row += 1
        stage: uint64 = 0
        while stage < len(prefixes):
            count = prefixes[stage]
            if count > input_count:
                return False
            row = 0
            while row < 46:
                column = 0
                while column < 11:
                    relation_matrix[row, column] = -911
                    hermite[row, column] = -911
                    smith[row, column] = -911
                    oracle_hnf[row, column] = -911
                    if row < 11:
                        online_basis[row, column] = -919
                    column += 1
                row += 1
            if count > 0:
                if not fmpz_matrix_hnf_prefix_into(
                    oracle_hnf, source, count, dimension
                ):
                    return False
            if count >= dimension:
                row = 0
                while row < dimension:
                    column = 0
                    while column < dimension:
                        online_basis[row, column] = oracle_hnf[row, column]
                        column += 1
                    row += 1
            status, rank = _cubic_prepare_full_relation_presentation(
                source,
                online_basis,
                relation_matrix,
                hermite,
                diagnostics,
                count,
                dimension,
                reuse_online,
                established_full_rank,
            )
            finish_status: int = -911
            index: int = 0
            invariant_count: uint64 = 0
            if status == 1:
                finish_status, index, invariant_count = (
                    _cubic_finish_full_relation_presentation(
                        workspace,
                        relation_matrix,
                        smith,
                        diagnostics,
                        count,
                        dimension,
                    )
                )
            offset: uint64 = 16 * stage
            observations[offset] = status
            observations[offset + 1] = rank
            observations[offset + 2] = finish_status
            observations[offset + 3] = index
            observations[offset + 4] = invariant_count
            entry: uint64 = 0
            while entry < 8:
                observations[offset + 5 + entry] = 0
                if entry < invariant_count:
                    observations[offset + 5 + entry] = workspace[
                        _ROW_SCRATCH_OFFSET + entry
                    ]
                entry += 1
            logical_hnf_rows: uint64 = count
            if reuse_online:
                logical_hnf_rows = dimension
            if count < dimension:
                logical_hnf_rows = 0
            row = 0
            while row < 46:
                column = 0
                while column < 11:
                    expected_source = -733
                    if row < input_count and column < dimension:
                        expected_source = input_rows[dimension * row + column]
                    if source[row, column] != expected_source:
                        return False
                    expected_relation = -911
                    if count >= dimension and row < count and column < dimension:
                        expected_relation = expected_source
                    if relation_matrix[row, column] != expected_relation:
                        return False
                    expected_hnf = -911
                    if row < logical_hnf_rows and column < dimension:
                        expected_hnf = oracle_hnf[row, column]
                    if hermite[row, column] != expected_hnf:
                        return False
                    if status != 1 or row >= count or column >= dimension:
                        if smith[row, column] != -911:
                            return False
                    if row < 11:
                        expected_online = -919
                        if (
                            count >= dimension
                            and row < dimension
                            and column < dimension
                        ):
                            expected_online = oracle_hnf[row, column]
                        if online_basis[row, column] != expected_online:
                            return False
                    column += 1
                row += 1
            observations[offset + 13] = 1
            observations[offset + 14] = 1
            observations[offset + 15] = logical_hnf_rows
            stage += 1
        return True


@native
def presentation_publication(
    output: IntegerBuffer,
    factors: IntegerBuffer,
    rows: IntegerBuffer,
    elements: IntegerBuffer,
    transcript_mode: uint64,
    use_grh: bool,
) -> bool:
    """Check the unchanged receipt layout for a synthetic trivial quotient."""
    if len(output) != 64 or transcript_mode > 1:
        return False
    with NativeExactArena(1048576, 1048576) as arena:
        workspace = arena.integer_vector(8192, 0)
        source = arena.foreign_resource(fmpz_matrix, 5, 4)
        hermite = arena.foreign_resource(fmpz_matrix, 5, 4)
        smith = arena.foreign_resource(fmpz_matrix, 5, 4)
        online = arena.foreign_resource(fmpz_matrix, 1, 1)
        relation_matrix = arena.foreign_resource(fmpz_matrix, 5, 4)
        relation_elements = arena.foreign_resource(fmpz_matrix, 5, 4)
        source[0, 0] = 2
        source[1, 1] = 3
        source[2, 0] = 1
        source[2, 1] = 1
        factor: uint64 = 0
        while factor < 2:
            entry: uint64 = 0
            while entry < 9:
                workspace[_POWER_OFFSET + factor * _CUBIC_MAX_POWERS * 9 + entry] = (
                    100 * factor + entry + 1
                )
                entry += 1
            factor += 1
        row: uint64 = 0
        while row < 3:
            column: uint64 = 0
            while column < 3:
                relation_elements[row, column] = 10 * row + column + 1
                column += 1
            row += 1
        status, rank = _cubic_prepare_full_relation_presentation(
            source, online, relation_matrix, hermite, output, 3, 2, False, False
        )
        if status != 1:
            return False
        status, index, count = _cubic_finish_full_relation_presentation(
            workspace, relation_matrix, smith, output, 3, 2
        )
        if status != 1 or index != 1 or count != 0:
            return False
        return _cubic_publish_trivial_relation_presentation(
            workspace,
            relation_matrix,
            relation_elements,
            output,
            factors,
            rows,
            elements,
            transcript_mode,
            3,
            2,
            1,
            rank,
            4,
            17,
            1,
            0,
            0,
            -123,
            3,
            9,
            2,
            9,
            -1107,
            use_grh,
            8,
            3,
            3,
        )
