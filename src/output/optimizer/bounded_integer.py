from output.loop_common import print_interrupt_check
from output.optimizer.scalar import (
    _print_optimizer_guard_error,
    _print_region_declaration,
    _print_region_variable,
)


_MAX_EXACT_NUMBER = "9007199254740991"


def _bounded_integer_check(value):
    """Return an intrinsic-only JavaScript exact-Number predicate."""
    return (
        "typeof "
        + value
        + ' === "number" && '
        + value
        + " === "
        + value
        + " && "
        + value
        + " % 1 === 0 && "
        + value
        + " >= -"
        + _MAX_EXACT_NUMBER
        + " && "
        + value
        + " <= "
        + _MAX_EXACT_NUMBER
        + " && 1 / "
        + value
        + " !== -Infinity"
    )


def _reject_bounded_integer(output, names, reason):
    output.indent()
    output.assign(names["valid"])
    output.print("false")
    output.end_statement()
    output.indent()
    output.assign(names["reason"])
    output.print(JSON.stringify(reason))
    output.end_statement()


def _check_bounded_integer(output, value, names):
    output.indent()
    output.print("if (!(")
    output.print(_bounded_integer_check(value))
    output.print("))")
    output.space()

    def reject():
        _reject_bounded_integer(output, names, "intermediate-overflow")

    output.with_block(reject)


def _bounded_temporary(output, names, expression):
    temporary = names["temporary"] + str(names["temporary_index"])
    names["temporary_index"] += 1
    _print_region_variable(output, temporary, expression)
    _check_bounded_integer(output, temporary, names)
    return temporary


def _print_bounded_integer_expression(value, slot_names, output, names):
    """Emit one verified integer expression and its exact range check."""
    if value.kind == "slot":
        return slot_names[value.slot]
    if value.kind == "integer-constant":
        return str(value.value)
    if value.kind == "neg":
        operand = _print_bounded_integer_expression(
            value.value, slot_names, output, names
        )
        return _bounded_temporary(output, names, "-(" + operand + ")")
    if value.kind == "binary":
        left = _print_bounded_integer_expression(value.left, slot_names, output, names)
        right = _print_bounded_integer_expression(
            value.right, slot_names, output, names
        )
        return _bounded_temporary(
            output,
            names,
            "(" + left + ") " + value.operator + " (" + right + ")",
        )
    raise TypeError("unverified bounded-integer expression")


def _print_bounded_integer_statements(statements, slot_names, output, names):
    for statement in statements:
        if statement.kind == "assign":
            value = _print_bounded_integer_expression(
                statement.value, slot_names, output, names
            )
            output.indent()
            output.print("if (" + names["valid"] + ")")
            output.space()

            def assign():
                output.indent()
                output.assign(slot_names[statement.target])
                output.print(value)
                output.end_statement()

            output.with_block(assign)
            continue
        left = _print_bounded_integer_expression(
            statement.condition.left, slot_names, output, names
        )
        right = _print_bounded_integer_expression(
            statement.condition.right, slot_names, output, names
        )
        condition = "(" + left + ") === (" + right + ")"
        if statement.condition.operator == "!=":
            condition = "!(" + condition + ")"
        output.indent()
        output.print("if (" + names["valid"] + ")")
        output.space()

        def valid_branch():
            output.indent()
            output.print("if (" + condition + ")")
            output.space()

            def body():
                _print_bounded_integer_statements(
                    statement.body, slot_names, output, names
                )

            output.with_block(body)
            if statement.alternative:
                output.space()
                output.print("else")
                output.space()

                def alternative():
                    _print_bounded_integer_statements(
                        statement.alternative, slot_names, output, names
                    )

                output.with_block(alternative)

        output.with_block(valid_branch)


def _print_bounded_integer_fallback(self, output, plan, names):
    fallback_value = "ρσ_IntegerFallback" + names["suffix"]
    output.indent()
    output.print(
        "for (var " + fallback_value + " of ρσ_Iterable(" + names["range"] + "))"
    )
    output.space()

    def body():
        self.simple_for_index = fallback_value
        self._do_print_body(output)

    output.with_block(body)


def print_bounded_integer_region(self, output):
    """Lower a verified exact-integer graph to transactional Number locals."""
    region = self.optimization_region
    plan = region.operands
    suffix = str(output.index_counter)
    output.index_counter += 1
    names = {
        "suffix": suffix,
        "range": "ρσ_IntegerRange" + suffix,
        "count": "ρσ_IntegerCount" + suffix,
        "index": "ρσ_IntegerIndex" + suffix,
        "valid": "ρσ_IntegerValid" + suffix,
        "reason": "ρσ_IntegerReason" + suffix,
        "temporary": "ρσ_IntegerTemporary" + suffix + "_",
        "temporary_index": 0,
    }
    output.print("var")
    output.space()
    output.assign(names["range"])
    output.print("ρσ_range(")
    plan.count.print(output)
    output.print(")")
    output.end_statement()
    _print_region_variable(output, names["count"], names["range"] + "._length")
    output.indent()
    output.print("if (" + names["count"] + " !== 0)")
    output.space()

    def nonempty():
        entry_checks = [
            _bounded_integer_check("ρσ_IntegerInput" + suffix + "_" + str(index))
            for index in range(len(plan.inputSlots))
        ]
        for index, slot in enumerate(plan.inputSlots):
            input_name = "ρσ_IntegerInput" + suffix + "_" + str(index)
            output.indent()
            output.print("var")
            output.space()
            output.assign(input_name)
            plan.slots[slot].node.print(output)
            output.end_statement()
        _print_region_variable(
            output,
            names["valid"],
            "("
            + _bounded_integer_check(names["count"])
            + ") && ("
            + ") && (".join(entry_checks)
            + ")",
        )
        _print_region_variable(
            output,
            names["reason"],
            names["valid"] + ' ? null : "live-in-not-exact-number"',
        )
        slot_names = []
        for slot in range(len(plan.slots)):
            slot_name = "ρσ_IntegerValue" + suffix + "_" + str(slot)
            slot_names.append(slot_name)
            input_position = -1
            for position, input_slot in enumerate(plan.inputSlots):
                if input_slot == slot:
                    input_position = position
                    break
            if input_position == -1:
                _print_region_declaration(output, slot_name)
            else:
                _print_region_variable(
                    output,
                    slot_name,
                    "ρσ_IntegerInput" + suffix + "_" + str(input_position),
                )
        output.indent()
        output.print("for")
        output.space()

        def condition():
            output.spaced("var", names["index"], "=", "0")
            output.semicolon()
            output.space()
            output.print(
                names["index"] + " < " + names["count"] + " && " + names["valid"]
            )
            output.semicolon()
            output.space()
            output.print(names["index"] + "++")

        output.with_parens(condition)
        output.space()

        def loop_body():
            print_interrupt_check(output)
            _print_bounded_integer_statements(
                plan.statements, slot_names, output, names
            )

        output.with_block(loop_body)
        output.indent()
        output.print("if (" + names["valid"] + ")")
        output.space()

        def commit():
            for state_slot in plan.stateSlots:
                output.indent()
                output.assign(plan.slots[state_slot].node)
                output.print(slot_names[state_slot])
                output.end_statement()
            output.indent()
            output.assign(self.init)
            output.print(names["count"] + " - 1")
            output.end_statement()

        output.with_block(commit)
        output.space()
        output.print("else")
        output.space()

        def fallback():
            if region.guardFailure == "error":
                _print_optimizer_guard_error(output, region, names["reason"])
            else:
                _print_bounded_integer_fallback(self, output, plan, names)

        output.with_block(fallback)

    output.with_block(nonempty)
