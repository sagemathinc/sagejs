from output.optimizer.scalar import (
    _print_closed_field_fallback,
    _print_region_declaration,
    _print_region_variable,
)


def _print_strict_float_expression(value, slot_names, output, names):
    """Emit one source-ordered binary64 expression without algebraic rewrites."""
    if value.kind == "slot":
        return slot_names[value.slot]
    if value.kind == "neg":
        operand = _print_strict_float_expression(value.value, slot_names, output, names)
        expression = "-(" + operand + ")"
    elif value.kind == "binary":
        left = _print_strict_float_expression(value.left, slot_names, output, names)
        right = _print_strict_float_expression(value.right, slot_names, output, names)
        expression = "(" + left + ") " + value.operator + " (" + right + ")"
    else:
        raise TypeError("unverified strict-float expression")
    temporary = names["temporary"] + str(names["temporary_index"])
    names["temporary_index"] += 1
    _print_region_variable(output, temporary, expression)
    return temporary


def _print_strict_float_statements(statements, slot_names, output, names):
    for statement in statements:
        if statement.kind == "assign":
            value = _print_strict_float_expression(
                statement.value, slot_names, output, names
            )
            output.indent()
            output.assign(slot_names[statement.target])
            output.print(value)
            output.end_statement()
            continue
        left = _print_strict_float_expression(
            statement.condition.left, slot_names, output, names
        )
        right = _print_strict_float_expression(
            statement.condition.right, slot_names, output, names
        )
        condition = "(" + left + ") === (" + right + ")"
        if statement.condition.operator == "!=":
            condition = "!(" + condition + ")"
        output.indent()
        output.print("if (" + condition + ")")
        output.space()

        def body():
            _print_strict_float_statements(statement.body, slot_names, output, names)

        output.with_block(body)
        if statement.alternative:
            output.space()
            output.print("else")
            output.space()

            def alternative():
                _print_strict_float_statements(
                    statement.alternative, slot_names, output, names
                )

            output.with_block(alternative)


def print_strict_float_region(self, output):
    """Lower a verified ordered IEEE-754 program to primitive Number locals."""
    region = self.optimization_region
    plan = region.operands
    suffix = str(output.index_counter)
    output.index_counter += 1
    names = {
        "suffix": suffix,
        "range": "ρσ_FloatRange" + suffix,
        "count": "ρσ_FloatCount" + suffix,
        "context": "ρσ_FloatContext" + suffix,
        "index": "ρσ_FloatIndex" + suffix,
        "temporary": "ρσ_FloatTemporary" + suffix + "_",
        "temporary_index": 0,
    }
    output.print("var")
    output.space()
    output.assign(names["range"])
    output.print("ρσ_range(")
    plan.count.print(output)
    output.print(")")
    output.end_statement()
    output.indent()
    _print_region_variable(output, names["count"], names["range"] + "._length")
    output.indent()
    output.print("if (" + names["count"] + " !== 0)")
    output.space()

    def nonempty_region():
        output.indent()
        output.print("var")
        output.space()
        output.assign(names["context"])
        output.print("ρσ_prepare_strict_float_region([")
        for position, input_slot in enumerate(plan.inputSlots):
            if position:
                output.comma()
            plan.slots[input_slot].node.print(output)
        output.print("]," + names["count"] + ")")
        output.end_statement()
        output.indent()
        output.print("if (" + names["context"] + " !== null)")
        output.space()

        def fast_path():
            slot_names = []
            for slot in range(len(plan.slots)):
                slot_name = "ρσ_FloatValue" + suffix + "_" + str(slot)
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
                        names["context"] + ".values[" + str(input_position) + "]",
                    )
            output.indent()
            output.print("for")
            output.space()

            def condition():
                output.spaced("var", names["index"], "=", "0")
                output.semicolon()
                output.space()
                output.spaced(names["index"], "<", names["count"])
                output.semicolon()
                output.space()
                output.print(names["index"] + "++")

            output.with_parens(condition)
            output.space()

            def body():
                _print_strict_float_statements(
                    plan.statements, slot_names, output, names
                )

            output.with_block(body)
            for state_slot in plan.stateSlots:
                output.indent()
                output.assign(plan.slots[state_slot].node)
                output.print(names["context"] + ".materialize(")
                output.print(slot_names[state_slot])
                output.print(")")
                output.end_statement()
            output.indent()
            output.assign(self.init)
            output.print(names["count"] + " - 1")
            output.end_statement()

        output.with_block(fast_path)
        output.space()
        output.print("else")
        output.space()

        def fallback():
            if region.guardFailure == "error":
                output.indent()
                output.print(
                    "throw new RuntimeError("
                    + JSON.stringify("optimizer runtime guard failed for " + region.id)
                    + ")"
                )
                output.end_statement()
            else:
                _print_closed_field_fallback(self, output, plan, names)

        output.with_block(fallback)

    output.with_block(nonempty_region)
