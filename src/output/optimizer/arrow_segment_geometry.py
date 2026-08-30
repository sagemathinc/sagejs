from output.loop_common import (
    loop_can_catch_interrupt,
    print_interrupt_check,
    unpack_tuple,
)
from output.optimizer.scalar import (
    _print_optimizer_profile_terminal,
    _print_profiled_optimizer_guard_error,
    _print_region_variable,
)


def _print_operand_list(output, operands):
    for index, operand in enumerate(operands):
        if index:
            output.comma()
        operand.print(output)


def print_arrow_segment_geometry_region(self, output):
    """Lower one independently verified rectangular binary64 transaction."""
    region = self.optimization_region
    plan = region.operands
    suffix = str(output.index_counter)
    output.index_counter += 1
    names = {
        "suffix": suffix,
        "context": "ρσ_ArrowGeometryContext" + suffix,
        "iterable": "ρσ_ArrowGeometryFallbackIterable" + suffix,
        "fallback_value": "ρσ_ArrowGeometryFallbackValue" + suffix,
    }

    output.indent()
    output.print("var")
    output.space()
    output.assign(names["context"])
    output.print("ρσ_fast_arrow_segment_geometry_region(")
    _print_operand_list(
        output,
        [
            plan.xSequence,
            plan.ySequence,
            plan.uGrid,
            plan.vGrid,
            plan.maximum,
            plan.extent,
            plan.pivot,
            plan.headLength,
            plan.headWidth,
            plan.hypot,
        ],
    )
    output.comma()
    output.print("true" if loop_can_catch_interrupt(output) else "false")
    output.comma()
    output.print(str(plan.maximumOutputEntries))
    output.print(")")
    output.end_statement()

    output.indent()
    output.print("if (" + names["context"] + ".ok === true)")
    output.space()

    def fast_path():
        output.indent()
        output.assign(plan.xOutput)
        output.print(names["context"] + ".xs")
        output.end_statement()
        output.indent()
        output.assign(plan.yOutput)
        output.print(names["context"] + ".ys")
        output.end_statement()
        if output.options.optimizer_profile_observer:
            output.indent()
            output.print("if (" + names["context"] + ".zeroTrip === true)")
            output.space()
            output.with_block(
                lambda: _print_optimizer_profile_terminal(output, region, "zero-trip")
            )
            output.space()
            output.print("else")
            output.space()
            output.with_block(
                lambda: _print_optimizer_profile_terminal(
                    output, region, "guarded-fast"
                )
            )

    output.with_block(fast_path)
    output.space()
    output.print("else")
    output.space()

    def fallback_path():
        if region.guardFailure == "error":
            _print_profiled_optimizer_guard_error(
                output, region, names["context"] + ".reason"
            )
            return
        output.indent()
        output.print("var")
        output.space()
        output.assign(names["iterable"])
        plan.iterable.print(output)
        output.end_statement()
        output.indent()
        output.print(
            "for (var "
            + names["fallback_value"]
            + " of ρσ_Iterable("
            + names["iterable"]
            + "))"
        )
        output.space()

        def untouched_loop():
            output.indent()
            output.assign("ρσ_unpack")
            output.print(names["fallback_value"])
            output.end_statement()
            unpack_tuple(self.init.flatten(), output)
            if loop_can_catch_interrupt(output):
                print_interrupt_check(output)
            for statement in self.body.body:
                output.indent()
                statement.print(output)
                output.newline()

        output.with_block(untouched_loop)
        output.newline()
        _print_optimizer_profile_terminal(
            output,
            region,
            "guarded-fallback",
            names["context"] + ".reason",
        )

    output.with_block(fallback_path)
