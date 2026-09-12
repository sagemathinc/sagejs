"""Exercise the production BF planner and evaluator on reusable scratch."""

# The test loader prepends the actual production helpers and their imports.


def _record_bf_prefix(
    workspace: NativeIntegerVector,
    values: FmpzMatrix,
    endpoints: FmpzMatrix,
    output: IntegerBuffer,
    offset: uint64,
    term_count: uint64,
    value_count: uint64,
    lower: int,
    upper: int,
    tail: int,
) -> bool:
    output[offset] = term_count
    output[offset + 1] = value_count
    output[offset + 2] = lower
    output[offset + 3] = upper
    output[offset + 4] = tail
    index: uint64 = 0
    while index < value_count:
        output[offset + 5 + index] = values[index, 0]
        index += 1
    index = 0
    while index < 4 * value_count:
        output[offset + 261 + index] = endpoints[index, 0]
        index += 1
    index = 0
    while index < 5 * term_count:
        output[offset + 1285 + index] = workspace[_CUBIC_ANALYTIC_TERM_OFFSET + index]
        index += 1
    return True


@native
def bf_exact_snapshot(
    coefficients: IntegerBuffer,
    output: IntegerBuffer,
    threshold: uint64,
    class_upper: int,
) -> bool:
    """The original exact-sized allocation and whole-batch Arb evaluation."""
    scale: int = 18_446_744_073_709_551_616
    with NativeExactArena(1_048_576, 3_145_728) as arena:
        field = arena.integer_vector(_CUBIC_WORKSPACE_LENGTH, 0)
        workspace = arena.integer_vector(_CUBIC_ANALYTIC_WORKSPACE_LENGTH, 0)
        ready, term_count, value_count = _cubic_prepare_bf_plan(
            field,
            workspace,
            coefficients,
            1,
            -1,
            -1,
            0,
            23,
            257,
            0,
            1,
            1,
            0,
            0,
            class_upper,
            threshold,
        )
        if not ready:
            return False
        values = arena.foreign_resource(fmpz_matrix, value_count, 1)
        endpoints = arena.foreign_resource(fmpz_matrix, 4 * value_count, 1)
        ready, lower, upper, tail = _original_exact_bf_evaluation(
            workspace,
            values,
            endpoints,
            term_count,
            value_count,
            scale,
        )
        if not ready:
            return False
        return _record_bf_prefix(
            workspace,
            values,
            endpoints,
            output,
            0,
            term_count,
            value_count,
            lower,
            upper,
            tail,
        )


@native
def bf_prefix_schedule(
    coefficients: IntegerBuffer,
    output: IntegerBuffer,
) -> bool:
    """Rebuild plans after changing the class bound; reuse both owners."""
    scale: int = 18_446_744_073_709_551_616
    poison: int = -scale * scale * scale * 256
    with NativeExactArena(1_048_576, 3_145_728) as arena:
        field = arena.integer_vector(_CUBIC_WORKSPACE_LENGTH, 0)
        workspace = arena.integer_vector(_CUBIC_ANALYTIC_WORKSPACE_LENGTH, 0)
        values = arena.foreign_resource(fmpz_matrix, 256, 1)
        endpoints = arena.foreign_resource(fmpz_matrix, 1024, 1)
        stage: uint64 = 0
        while stage < 4:
            threshold: uint64 = _CUBIC_ANALYTIC_THRESHOLD
            class_upper = 1
            if stage == 1:
                threshold = _CUBIC_ANALYTIC_REFINED_THRESHOLD
                class_upper = 2
            elif stage == 2:
                class_upper = 3
            # Poison all scratch, including promoted negative integers that
            # the positive-word Arb primitive must never read in the tail.
            index: uint64 = 0
            while index < 256:
                values[index, 0] = poison - 17
                index += 1
            index = 0
            while index < 1024:
                endpoints[index, 0] = poison - 19
                index += 1
            ready, term_count, value_count = _cubic_prepare_bf_plan(
                field,
                workspace,
                coefficients,
                1,
                -1,
                -1,
                0,
                23,
                257,
                0,
                1,
                1,
                0,
                0,
                class_upper,
                threshold,
            )
            if not ready:
                return False
            ready, lower, upper, tail = _cubic_evaluate_bf_plan(
                workspace,
                values,
                endpoints,
                term_count,
                value_count,
                scale,
            )
            if not ready:
                return False
            index = value_count
            while index < 256:
                if values[index, 0] != poison - 17:
                    return False
                index += 1
            index = 4 * value_count
            while index < 1024:
                if endpoints[index, 0] != poison - 19:
                    return False
                index += 1
            if not _record_bf_prefix(
                workspace,
                values,
                endpoints,
                output,
                4096 * stage,
                term_count,
                value_count,
                lower,
                upper,
                tail,
            ):
                return False
            stage += 1
        return True
