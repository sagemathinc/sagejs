from output.optimizer.scalar import (
    _print_closed_field_fallback,
    _print_optimizer_guard_error,
    _print_region_declaration,
    _print_region_variable,
)


def _print_strict_float_array_expression(
    value, slot_names, element_name, output, names
):
    """Emit one retained binary64 expression in exact source tree order."""
    if value.kind == "slot":
        return slot_names[value.slot]
    if value.kind == "sequence":
        return element_name
    if value.kind == "neg":
        operand = _print_strict_float_array_expression(
            value.value, slot_names, element_name, output, names
        )
        expression = "-(" + operand + ")"
    elif value.kind == "binary":
        left = _print_strict_float_array_expression(
            value.left, slot_names, element_name, output, names
        )
        right = _print_strict_float_array_expression(
            value.right, slot_names, element_name, output, names
        )
        expression = "(" + left + ") " + value.operator + " (" + right + ")"
    else:
        raise TypeError("unverified strict-float-array expression")
    temporary = names["temporary"] + str(names["temporary_index"])
    names["temporary_index"] += 1
    _print_region_variable(output, temporary, expression)
    return temporary


def _print_strict_float_array_statements(
    statements, slot_names, element_name, output, names
):
    for statement in statements:
        if statement.kind == "assign":
            value = _print_strict_float_array_expression(
                statement.value, slot_names, element_name, output, names
            )
            output.indent()
            output.assign(slot_names[statement.target])
            output.print(value)
            output.end_statement()
            continue
        left = _print_strict_float_array_expression(
            statement.condition.left, slot_names, element_name, output, names
        )
        right = _print_strict_float_array_expression(
            statement.condition.right, slot_names, element_name, output, names
        )
        condition = "(" + left + ") === (" + right + ")"
        if statement.condition.operator == "!=":
            condition = "!(" + condition + ")"
        output.indent()
        output.print("if (" + condition + ")")
        output.space()

        def body():
            _print_strict_float_array_statements(
                statement.body, slot_names, element_name, output, names
            )

        output.with_block(body)
        if statement.alternative:
            output.space()
            output.print("else")
            output.space()

            def alternative():
                _print_strict_float_array_statements(
                    statement.alternative, slot_names, element_name, output, names
                )

            output.with_block(alternative)


def _print_strict_float_array_fallback(loop, output, plan, names, reason):
    if loop.optimization_region.guardFailure == "error":
        _print_optimizer_guard_error(output, loop.optimization_region, reason)
    else:
        _print_closed_field_fallback(loop, output, plan, names)


def print_strict_float_array_region(self, output):
    """Lower one verified immutable binary64 sequence reduction to V8 locals."""
    region = self.optimization_region
    plan = region.operands
    suffix = str(output.index_counter)
    output.index_counter += 1
    names = {
        "suffix": suffix,
        "iterable": "ρσ_FloatArrayIterable" + suffix,
        "count": "ρσ_FloatArrayCount" + suffix,
        "context": "ρσ_FloatArrayContext" + suffix,
        "index": "ρσ_FloatArrayIndex" + suffix,
        "source_index": "ρσ_FloatArraySourceIndex" + suffix,
        "descriptor": "ρσ_FloatArrayDescriptor" + suffix,
        "original": "ρσ_FloatArrayOriginal" + suffix,
        "last_original": "ρσ_FloatArrayLastOriginal" + suffix,
        "element": "ρσ_FloatArrayElement" + suffix,
        "valid": "ρσ_FloatArrayValid" + suffix,
        "reason": "ρσ_FloatArrayReason" + suffix,
        "temporary": "ρσ_FloatArrayTemporary" + suffix + "_",
        "temporary_index": 0,
    }

    output.print("var")
    output.space()
    output.assign(names["iterable"])
    plan.iterable.print(output)
    output.end_statement()
    output.indent()
    _print_region_variable(
        output,
        names["count"],
        "ρσ_machine_field_sequence_length(" + names["iterable"] + ")",
    )

    # A zero-length authentic tuple performs no body reads, materializations,
    # or loop-target writes. Invalid or mutable sequences take the untouched
    # iterator before any optimized state is published.
    output.indent()
    output.print("if (" + names["count"] + " > 0)")
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
        output.print("if (" + names["context"] + ".ok === true)")
        output.space()

        def guarded_region():
            slot_names = []
            for slot in range(len(plan.slots)):
                slot_name = "ρσ_FloatArrayValue" + suffix + "_" + str(slot)
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
            _print_region_variable(output, names["valid"], "true")
            _print_region_variable(
                output, names["reason"], JSON.stringify("sequence-element-not-binary64")
            )
            _print_region_declaration(output, names["last_original"])

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
                source_index = names["index"]
                if plan.iterationOrder == "reverse":
                    source_index = names["count"] + " - 1 - " + names["index"]
                _print_region_variable(output, names["source_index"], source_index)
                _print_region_variable(
                    output,
                    names["descriptor"],
                    "Object.getOwnPropertyDescriptor("
                    + names["iterable"]
                    + ","
                    + names["source_index"]
                    + ")",
                )
                output.indent()
                output.print(
                    "if ("
                    + names["descriptor"]
                    + " === undefined || !Object.prototype.hasOwnProperty.call("
                    + names["descriptor"]
                    + ',"value"))'
                )
                output.space()

                def invalid_descriptor():
                    output.indent()
                    output.assign(names["valid"])
                    output.print("false")
                    output.end_statement()
                    output.indent()
                    output.assign(names["reason"])
                    output.print(JSON.stringify("sequence-element-descriptor"))
                    output.end_statement()
                    output.indent()
                    output.print("break")
                    output.end_statement()

                output.with_block(invalid_descriptor)
                _print_region_variable(
                    output,
                    names["original"],
                    names["descriptor"] + ".value",
                )
                _print_region_variable(
                    output,
                    names["element"],
                    "ρσ_strict_float_unbox(" + names["original"] + ")",
                )
                output.indent()
                output.print("if (" + names["element"] + " === null)")
                output.space()

                def invalid_element():
                    output.indent()
                    output.assign(names["valid"])
                    output.print("false")
                    output.end_statement()
                    output.indent()
                    output.print("break")
                    output.end_statement()

                output.with_block(invalid_element)
                output.indent()
                output.assign(names["last_original"])
                output.print(names["original"])
                output.end_statement()
                _print_strict_float_array_statements(
                    plan.statements, slot_names, names["element"], output, names
                )

            output.with_block(body)
            output.indent()
            output.print("if (" + names["valid"] + ")")
            output.space()

            def commit():
                for state_slot in plan.stateSlots:
                    output.indent()
                    output.assign(plan.slots[state_slot].node)
                    output.print(names["context"] + ".materialize(")
                    output.print(slot_names[state_slot])
                    output.print(")")
                    output.end_statement()
                output.indent()
                output.assign(plan.iterator)
                output.print(names["last_original"])
                output.end_statement()

            output.with_block(commit)
            output.space()
            output.print("else")
            output.space()

            def invalid_element_fallback():
                _print_strict_float_array_fallback(
                    self, output, plan, names, names["reason"]
                )

            output.with_block(invalid_element_fallback)

        output.with_block(guarded_region)
        output.space()
        output.print("else")
        output.space()

        def scalar_guard_fallback():
            _print_strict_float_array_fallback(
                self, output, plan, names, names["context"] + ".reason"
            )

        output.with_block(scalar_guard_fallback)

    output.with_block(nonempty_region)
    output.space()
    output.print("else if (" + names["count"] + " < 0)")
    output.space()

    def invalid_sequence_fallback():
        _print_strict_float_array_fallback(
            self,
            output,
            plan,
            names,
            JSON.stringify("sequence-not-immutable-tuple"),
        )

    output.with_block(invalid_sequence_fallback)
