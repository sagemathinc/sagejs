from output.loop_common import (
    loop_can_catch_interrupt,
    prepare_loop_else,
    unpack_tuple,
)


def _field_operation_mask(operations, streaming=False, inplace_operations=None):
    bits = {
        "add": 1,
        "sub": 2,
        "mul": 4,
        "neg": 8,
        "equal": 16,
        "pow": 64,
        "coerce-integer": 1024,
    }
    inplace_bits = {"add": 128, "sub": 256, "mul": 512}
    answer = 0
    for operation in operations:
        answer |= bits[operation]
    if streaming:
        answer |= 32
    for operation in inplace_operations or []:
        answer |= inplace_bits[operation]
    return answer


def _print_region_variable(output, name, value):
    output.indent()
    output.print("var")
    output.space()
    output.assign(name)
    output.print(value)
    output.end_statement()


def _print_region_declaration(output, name):
    output.indent()
    output.print("var")
    output.space()
    output.print(name)
    output.end_statement()


def _print_optimizer_guard_error(output, region, reason):
    """Emit a stable contract error with the runtime guard's reason code."""
    output.indent()
    output.print("throw new RuntimeError(")
    output.print(
        JSON.stringify("optimizer runtime guard failed for " + region.id + ": ")
    )
    output.print(" + " + reason)
    output.print(")")
    output.end_statement()


def _region_temp(counter, suffix):
    name = "ρσ_FieldTemp" + suffix + "_" + str(counter[0])
    counter[0] += 1
    return name


def _region_power_product_count(exponent):
    products = 0
    has_result = False
    while exponent > 0:
        if exponent % 2:
            if has_result:
                products += 1
            has_result = True
        exponent //= 2
        if exponent > 0:
            products += 1
    return products


def _print_region_product(
    left,
    right,
    representation,
    degree,
    modulus_name,
    modulus_coefficients_name,
    output,
    counter,
    suffix,
):
    if representation == "prime":
        result = _region_temp(counter, suffix)
        _print_region_variable(
            output,
            result,
            "(" + left + " * " + right + ") % " + modulus_name,
        )
        return result

    product = []
    for exponent in range(2 * degree - 1):
        terms = []
        for left_index in range(degree):
            right_index = exponent - left_index
            if right_index < 0 or right_index >= degree:
                continue
            terms.append(left[left_index] + " * " + right[right_index])
        coefficient = _region_temp(counter, suffix)
        _print_region_variable(
            output,
            coefficient,
            "(" + " + ".join(terms) + ") % " + modulus_name,
        )
        product.append(coefficient)

    for exponent in range(2 * degree - 2, degree - 1, -1):
        factor = product[exponent]
        for modulus_index in range(degree):
            result_index = exponent - degree + modulus_index
            correction = _region_temp(counter, suffix)
            _print_region_variable(
                output,
                correction,
                "("
                + factor
                + " * "
                + modulus_coefficients_name[modulus_index]
                + ") % "
                + modulus_name,
            )
            coefficient = _region_temp(counter, suffix)
            _print_region_variable(
                output,
                coefficient,
                product[result_index]
                + " >= "
                + correction
                + " ? "
                + product[result_index]
                + " - "
                + correction
                + " : "
                + product[result_index]
                + " + "
                + modulus_name
                + " - "
                + correction,
            )
            product[result_index] = coefficient
    return product[:degree]


def _region_expression_key(expression, slot_versions=None):
    if expression.kind == "slot":
        version = 0 if slot_versions is None else slot_versions[expression.slot]
        return "slot:" + str(expression.slot) + "@" + str(version)
    if expression.kind == "sequence":
        return "sequence:" + str(expression.sequence) + ":" + expression.indexOrder
    if expression.kind == "integer-constant":
        return "integer:" + str(expression.value)
    if expression.kind == "neg":
        return "neg(" + _region_expression_key(expression.value, slot_versions) + ")"
    if expression.kind == "power":
        return (
            "power:"
            + str(expression.exponent)
            + "("
            + _region_expression_key(expression.value, slot_versions)
            + ")"
        )
    if expression.operator == "+" or expression.operator == "*":
        operands = []

        def collect(operand):
            if operand.kind == "binary" and operand.operator == expression.operator:
                collect(operand.left)
                collect(operand.right)
            else:
                operands.append(_region_expression_key(operand, slot_versions))

        collect(expression.left)
        collect(expression.right)
        operands.sort()
        return "associative:" + expression.operator + "(" + ",".join(operands) + ")"
    left = _region_expression_key(expression.left, slot_versions)
    right = _region_expression_key(expression.right, slot_versions)
    return "binary:" + expression.operator + "(" + left + "," + right + ")"


def _copy_region_operation_values(values):
    """Copy the emitter's compile-time value table as a plain object.

    The self-hosted emitter stores generated-expression keys as direct
    JavaScript properties.  Python's runtime `dict(values)` uses a different
    backing store after transpilation, so direct writes were not visible to
    later membership checks.  An object literal plus explicit copies preserves
    the intended compiler-internal representation.
    """
    answer = {}
    for key in values:
        answer[key] = values[key]
    return answer


def _print_region_sequence_value(
    sequence,
    index_order,
    representation,
    degree,
    context_name,
    index_name,
    count_name,
    modulus_name,
    output,
    counter,
    suffix,
    streaming=False,
    sequence_values=None,
):
    cache_key = str(sequence) + ":" + index_order
    if streaming and sequence_values is not None and cache_key in sequence_values:
        return sequence_values[cache_key]
    base = context_name + ".sequences[" + str(sequence) + "]"
    sequence_index = index_name
    if index_order == "reverse":
        sequence_index = "(" + count_name + " - 1 - " + index_name + ")"
    if streaming:
        element = _region_temp(counter, suffix)
        _print_region_variable(output, element, base + "[" + sequence_index + "]")
        valid = (
            context_name
            + ".elementBrand.has("
            + element
            + ") && "
            + element
            + "._parent === "
            + context_name
            + ".parent && Object.getPrototypeOf("
            + element
            + ") === "
            + context_name
            + ".prototype"
        )
        if representation == "prime":
            valid += (
                " && Number.isInteger("
                + element
                + "._value) && "
                + element
                + "._value >= 0 && "
                + element
                + "._value < "
                + modulus_name
            )
        else:
            coordinates = element + "._machineCoordinates"
            valid += (
                " && Array.isArray("
                + coordinates
                + ") && Object.isFrozen("
                + coordinates
                + ") && "
                + coordinates
                + ".length === "
                + str(degree)
            )
            for component in range(degree):
                coordinate = coordinates + "[" + str(component) + "]"
                valid += (
                    " && Number.isInteger("
                    + coordinate
                    + ") && "
                    + coordinate
                    + " >= 0 && "
                    + coordinate
                    + " < "
                    + modulus_name
                )
        output.indent()
        output.print("if (!(" + valid + "))")
        output.space()

        def reject_stream_element():
            output.indent()
            output.assign("ρσ_FieldStreamValid" + suffix)
            output.print("false")
            output.end_statement()
            output.indent()
            output.print("break")
            output.end_statement()

        output.with_block(reject_stream_element)
        if representation == "prime":
            value = element + "._value"
        else:
            value = [
                element + "._machineCoordinates[" + str(component) + "]"
                for component in range(degree)
            ]
        if sequence_values is not None:
            sequence_values[cache_key] = value
        return value
    if representation == "prime":
        return base + "[" + sequence_index + "]"
    return [
        base
        + "["
        + str(degree)
        + " * "
        + sequence_index
        + ("" if component == 0 else " + " + str(component))
        + "]"
        for component in range(degree)
    ]


def _print_region_expression(
    expression,
    representation,
    degree,
    slot_names,
    context_name,
    index_name,
    count_name,
    modulus_name,
    modulus_coefficients_name,
    output,
    counter,
    suffix,
    streaming=False,
    sequence_values=None,
    operation_values=None,
    slot_versions=None,
):
    if expression.kind == "slot":
        return slot_names[expression.slot]
    if expression.kind == "sequence":
        return _print_region_sequence_value(
            expression.sequence,
            expression.indexOrder,
            representation,
            degree,
            context_name,
            index_name,
            count_name,
            modulus_name,
            output,
            counter,
            suffix,
            streaming,
            sequence_values,
        )

    operation_key = _region_expression_key(expression, slot_versions)
    if operation_values is not None and operation_key in operation_values:
        return operation_values[operation_key]

    if expression.kind == "integer-constant":
        constant = _region_temp(counter, suffix)
        _print_region_variable(
            output,
            constant,
            context_name + ".integerConstants[" + str(expression.value) + "]",
        )
        result = (
            constant
            if representation == "prime"
            else [constant] + ["0" for _component in range(1, degree)]
        )
        if operation_values is not None:
            operation_values[operation_key] = result
        return result

    if expression.kind == "power":
        value = _print_region_expression(
            expression.value,
            representation,
            degree,
            slot_names,
            context_name,
            index_name,
            count_name,
            modulus_name,
            modulus_coefficients_name,
            output,
            counter,
            suffix,
            streaming,
            sequence_values,
            operation_values,
            slot_versions,
        )
        exponent = expression.exponent
        if exponent == 0:
            if representation == "prime":
                result = "1"
            else:
                result = ["1"] + ["0" for _component in range(1, degree)]
            if operation_values is not None:
                operation_values[operation_key] = result
            return result
        # Repeating the fully scalar multiplication emitter for every bit of
        # a sparse large exponent can turn a tiny source loop into hundreds of
        # kilobytes of JavaScript across the fixed extension variants.  Keep
        # squaring inline; use the guarded reusable primitive helper once
        # binary exponentiation needs more than one product.
        if _region_power_product_count(exponent) > 1:
            result_name = _region_temp(counter, suffix)
            if representation == "prime":
                helper_value = value
            else:
                helper_value = "[" + ",".join(value) + "]"
            _print_region_variable(
                output,
                result_name,
                "ρσ_machine_field_power("
                + context_name
                + ","
                + helper_value
                + ","
                + str(exponent)
                + ")",
            )
            if representation == "prime":
                result = result_name
            else:
                result = [
                    result_name + "[" + str(component) + "]"
                    for component in range(degree)
                ]
            if operation_values is not None:
                operation_values[operation_key] = result
            return result
        result = None
        factor = value
        while exponent:
            if exponent % 2:
                result = (
                    factor
                    if result is None
                    else _print_region_product(
                        result,
                        factor,
                        representation,
                        degree,
                        modulus_name,
                        modulus_coefficients_name,
                        output,
                        counter,
                        suffix,
                    )
                )
            exponent //= 2
            if exponent:
                factor = _print_region_product(
                    factor,
                    factor,
                    representation,
                    degree,
                    modulus_name,
                    modulus_coefficients_name,
                    output,
                    counter,
                    suffix,
                )
        if operation_values is not None:
            operation_values[operation_key] = result
        return result

    if expression.kind == "neg":
        value = _print_region_expression(
            expression.value,
            representation,
            degree,
            slot_names,
            context_name,
            index_name,
            count_name,
            modulus_name,
            modulus_coefficients_name,
            output,
            counter,
            suffix,
            streaming,
            sequence_values,
            operation_values,
            slot_versions,
        )
        if representation == "prime":
            result = _region_temp(counter, suffix)
            _print_region_variable(
                output,
                result,
                "(" + value + " === 0 ? 0 : " + modulus_name + " - " + value + ")",
            )
            if operation_values is not None:
                operation_values[operation_key] = result
            return result
        answer = []
        for component in value:
            result = _region_temp(counter, suffix)
            _print_region_variable(
                output,
                result,
                "("
                + component
                + " === 0 ? 0 : "
                + modulus_name
                + " - "
                + component
                + ")",
            )
            answer.append(result)
        if operation_values is not None:
            operation_values[operation_key] = answer
        return answer

    left = _print_region_expression(
        expression.left,
        representation,
        degree,
        slot_names,
        context_name,
        index_name,
        count_name,
        modulus_name,
        modulus_coefficients_name,
        output,
        counter,
        suffix,
        streaming,
        sequence_values,
        operation_values,
        slot_versions,
    )
    right = _print_region_expression(
        expression.right,
        representation,
        degree,
        slot_names,
        context_name,
        index_name,
        count_name,
        modulus_name,
        modulus_coefficients_name,
        output,
        counter,
        suffix,
        streaming,
        sequence_values,
        operation_values,
        slot_versions,
    )
    operator = expression.operator
    if operator == "*":
        result = _print_region_product(
            left,
            right,
            representation,
            degree,
            modulus_name,
            modulus_coefficients_name,
            output,
            counter,
            suffix,
        )
        if operation_values is not None:
            operation_values[operation_key] = result
        return result
    if representation == "prime":
        result = _region_temp(counter, suffix)
        if operator == "+":
            total = _region_temp(counter, suffix)
            _print_region_variable(output, total, left + " + " + right)
            value = (
                total
                + " >= "
                + modulus_name
                + " ? "
                + total
                + " - "
                + modulus_name
                + " : "
                + total
            )
        else:
            value = (
                left
                + " >= "
                + right
                + " ? "
                + left
                + " - "
                + right
                + " : "
                + left
                + " + "
                + modulus_name
                + " - "
                + right
            )
        _print_region_variable(output, result, value)
        if operation_values is not None:
            operation_values[operation_key] = result
        return result

    answer = []
    if operator in ("+", "-"):
        for component in range(degree):
            result = _region_temp(counter, suffix)
            if operator == "+":
                total = _region_temp(counter, suffix)
                _print_region_variable(
                    output,
                    total,
                    left[component] + " + " + right[component],
                )
                value = (
                    total
                    + " >= "
                    + modulus_name
                    + " ? "
                    + total
                    + " - "
                    + modulus_name
                    + " : "
                    + total
                )
            else:
                value = (
                    left[component]
                    + " >= "
                    + right[component]
                    + " ? "
                    + left[component]
                    + " - "
                    + right[component]
                    + " : "
                    + left[component]
                    + " + "
                    + modulus_name
                    + " - "
                    + right[component]
                )
            _print_region_variable(output, result, value)
            answer.append(result)
        if operation_values is not None:
            operation_values[operation_key] = answer
        return answer

    raise RuntimeError("unhandled ring operation")


def _print_region_statements(
    statements,
    representation,
    degree,
    slot_names,
    context_name,
    index_name,
    count_name,
    modulus_name,
    modulus_coefficients_name,
    output,
    counter,
    suffix,
    streaming=False,
    sequence_values=None,
    operation_values=None,
    slot_versions=None,
    persistent_operation_values=None,
):
    if operation_values is None:
        operation_values = {}
    if slot_versions is None:
        slot_versions = [0 for _slot in slot_names]
    if persistent_operation_values is None:
        persistent_operation_values = {}
    for statement in statements:
        if statement.kind == "assign":
            value = _print_region_expression(
                statement.value,
                representation,
                degree,
                slot_names,
                context_name,
                index_name,
                count_name,
                modulus_name,
                modulus_coefficients_name,
                output,
                counter,
                suffix,
                streaming,
                sequence_values,
                operation_values,
                slot_versions,
            )
            targets = slot_names[statement.target]
            if representation == "prime":
                output.indent()
                output.assign(targets)
                output.print(value)
                output.end_statement()
            else:
                for component in range(degree):
                    output.indent()
                    output.assign(targets[component])
                    output.print(value[component])
                    output.end_statement()
            slot_versions[statement.target] += 1
            continue

        left = _print_region_expression(
            statement.condition.left,
            representation,
            degree,
            slot_names,
            context_name,
            index_name,
            count_name,
            modulus_name,
            modulus_coefficients_name,
            output,
            counter,
            suffix,
            streaming,
            sequence_values,
            operation_values,
            slot_versions,
        )
        right = _print_region_expression(
            statement.condition.right,
            representation,
            degree,
            slot_names,
            context_name,
            index_name,
            count_name,
            modulus_name,
            modulus_coefficients_name,
            output,
            counter,
            suffix,
            streaming,
            sequence_values,
            operation_values,
            slot_versions,
        )
        if representation == "prime":
            condition = left + " === " + right
        else:
            condition = " && ".join(
                left[component] + " === " + right[component]
                for component in range(degree)
            )
        if statement.condition.operator == "!=":
            condition = "!(" + condition + ")"
        output.indent()
        output.print("if (" + condition + ")")
        output.space()

        body_versions = list(slot_versions)
        alternative_versions = list(slot_versions)

        def consequent():
            _print_region_statements(
                statement.body,
                representation,
                degree,
                slot_names,
                context_name,
                index_name,
                count_name,
                modulus_name,
                modulus_coefficients_name,
                output,
                counter,
                suffix,
                streaming,
                sequence_values,
                _copy_region_operation_values(operation_values),
                body_versions,
                persistent_operation_values,
            )

        output.with_block(consequent)
        if statement.alternative:
            output.space()
            output.print("else")
            output.space()

            def alternative():
                _print_region_statements(
                    statement.alternative,
                    representation,
                    degree,
                    slot_names,
                    context_name,
                    index_name,
                    count_name,
                    modulus_name,
                    modulus_coefficients_name,
                    output,
                    counter,
                    suffix,
                    streaming,
                    sequence_values,
                    _copy_region_operation_values(operation_values),
                    alternative_versions,
                    persistent_operation_values,
                )

            output.with_block(alternative)
        for slot in range(len(slot_versions)):
            slot_versions[slot] = max(body_versions[slot], alternative_versions[slot])
        # A conditional join creates a new availability scope.  Rebinding is
        # intentional: compiler-internal dictionaries lower to plain objects,
        # not Python runtime dictionaries with a `clear` method.
        operation_values = _copy_region_operation_values(persistent_operation_values)


def _print_closed_field_fallback(self, output, plan, names):
    fallback_value = "ρσ_FieldFallback" + names["suffix"]
    output.indent()
    output.print("for")
    output.space()
    if plan.iteratorKind == "range":
        output.print(
            "(var " + fallback_value + " of ρσ_Iterable(" + names["range"] + "))"
        )
    elif plan.iteratorKind == "zip":
        output.print("(var " + fallback_value + " of ρσ_Iterable(")
        plan.zipCall.print(output)
        output.print("))")
    else:
        iterable = names["iterable"]
        if plan.iterationOrder == "reverse":
            iterable = "ρσ_reversed(" + iterable + ")"
        output.print("(var " + fallback_value + " of ρσ_Iterable(" + iterable + "))")
    output.space()
    if plan.iteratorKind == "zip":

        def zip_body():
            output.indent()
            output.assign("ρσ_unpack")
            output.print(fallback_value)
            output.end_statement()
            unpack_tuple(plan.zipTargets, output)
            for statement in self.body.body:
                output.indent()
                statement.print(output)
                output.newline()

        output.with_block(zip_body)
        output.newline()
        return
    self.simple_for_index = fallback_value
    self._do_print_body(output)
    output.newline()


def _print_closed_field_fast_path(self, output, plan, names, representation, degree=1):
    context_name = names["context"]
    count_name = names["count"]
    index_name = names["index"]
    suffix = names["suffix"]
    modulus_name = names["modulus"]
    modulus_coefficients_name = names["modulus_coefficients"]
    streaming = plan.sequenceStrategy == "stream"
    # The stage-one self-hosting compiler can supply the immediately previous
    # plan schema.  Its plans treated every slot as a live-in.  The newly built
    # compiler always supplies `inputSlots`, and its independent verifier makes
    # that field exact before lowering.
    input_slots = getattr(plan, "inputSlots", None)
    if input_slots is None:
        input_slots = list(range(len(plan.slots)))
    hoisted_expressions = getattr(plan, "hoistedExpressions", None)
    if hoisted_expressions is None:
        hoisted_expressions = []
    if representation == "extension":
        modulus_coefficients_name = []
        for component in range(degree):
            coefficient_name = (
                "ρσ_FieldModulusCoefficient"
                + suffix
                + "_"
                + str(degree)
                + "_"
                + str(component)
            )
            _print_region_variable(
                output,
                coefficient_name,
                context_name + ".modulusCoefficients[" + str(component) + "]",
            )
            modulus_coefficients_name.append(coefficient_name)
    slot_names = []
    for slot in range(len(plan.slots)):
        input_position = -1
        for position, input_slot in enumerate(input_slots):
            if input_slot == slot:
                input_position = position
                break
        if representation == "prime":
            name = "ρσ_FieldValue" + suffix + "_" + str(slot)
            if input_position == -1:
                _print_region_declaration(output, name)
            else:
                _print_region_variable(
                    output,
                    name,
                    context_name + ".values[" + str(input_position) + "]",
                )
            slot_names.append(name)
        else:
            coordinates = []
            for component in range(degree):
                name = "ρσ_FieldValue" + suffix + "_" + str(slot) + "_" + str(component)
                if input_position == -1:
                    _print_region_declaration(output, name)
                else:
                    _print_region_variable(
                        output,
                        name,
                        context_name
                        + ".values["
                        + str(degree * input_position + component)
                        + "]",
                    )
                coordinates.append(name)
            slot_names.append(coordinates)

    expression_counter = [0]
    hoisted_values = {}
    hoisted_versions = [0 for _slot in slot_names]
    for expression in hoisted_expressions:
        _print_region_expression(
            expression,
            representation,
            degree,
            slot_names,
            context_name,
            index_name,
            count_name,
            modulus_name,
            modulus_coefficients_name,
            output,
            expression_counter,
            suffix,
            streaming,
            {},
            hoisted_values,
            hoisted_versions,
        )

    if streaming:
        _print_region_variable(output, "ρσ_FieldStreamValid" + suffix, "true")

    output.indent()
    output.print("for")
    output.space()

    def condition():
        output.spaced("var", index_name, "=", "0")
        output.semicolon()
        output.space()
        output.spaced(index_name, "<", count_name)
        output.semicolon()
        output.space()
        output.print(index_name + "++")

    output.with_parens(condition)
    output.space()

    def body():
        sequence_values = {}
        if streaming:
            # Validate every source-level sequence view, including reads whose
            # pure result disappeared during dead-store elimination.  A failed
            # value guard still restarts the untouched semantic loop.
            for access in plan.sequenceAccesses:
                _print_region_sequence_value(
                    access.sequence,
                    access.indexOrder,
                    representation,
                    degree,
                    context_name,
                    index_name,
                    count_name,
                    modulus_name,
                    output,
                    expression_counter,
                    suffix,
                    streaming,
                    sequence_values,
                )
        _print_region_statements(
            plan.statements,
            representation,
            degree,
            slot_names,
            context_name,
            index_name,
            count_name,
            modulus_name,
            modulus_coefficients_name,
            output,
            expression_counter,
            suffix,
            streaming,
            sequence_values,
            _copy_region_operation_values(hoisted_values),
            [0 for _slot in slot_names],
            hoisted_values,
        )

    output.with_block(body)
    output.indent()
    output.print(
        "if ("
        + ("ρσ_FieldStreamValid" + suffix if streaming else count_name + " > 0")
        + ")"
    )
    output.space()

    def materialize():
        for state_slot in plan.stateSlots:
            output.indent()
            output.assign(plan.slots[state_slot].node)
            output.print("ρσ_materialize_machine_field_value(")
            output.print(context_name)
            output.comma()
            if representation == "prime":
                output.print(slot_names[state_slot])
            else:
                output.print("[")
                for component in range(degree):
                    if component:
                        output.comma()
                    output.print(slot_names[state_slot][component])
                output.print("]")
            output.print(")")
            output.end_statement()
        if streaming:
            output.indent()
            output.assign(context_name + ".parent._lastCompilerOptimizationRoute")
            output.print(
                "'v8-number-residue-stream'"
                if representation == "prime"
                else "'v8-extension-tuple-stream'"
            )
            output.end_statement()
        if plan.iteratorKind == "range":
            output.indent()
            output.assign(self.init)
            output.print(count_name + " - 1")
            output.end_statement()
        elif plan.iteratorKind == "sequence":
            output.indent()
            output.assign(self.init)
            if plan.iterationOrder == "reverse":
                output.print(names["iterable"] + "[0]")
            else:
                output.print(names["iterable"] + "[" + count_name + " - 1]")
            output.end_statement()
        else:
            # The reviewed zip region has plain symbol targets and immutable
            # branded tuple inputs, so left-to-right scalar assignment is the
            # exact final successful unpacking effect.
            for target_index, target in enumerate(plan.zipTargets):
                output.indent()
                output.assign(target)
                output.print(
                    names["zip_iterables"][target_index] + "[" + count_name + " - 1]"
                )
                output.end_statement()

    if streaming:
        output.with_block(materialize)
        output.space()
        output.print("else")
        output.space()

        def streaming_fallback():
            if self.optimization_region.guardFailure == "error":
                output.indent()
                output.print(
                    "throw new RuntimeError("
                    + JSON.stringify(
                        "optimizer runtime guard failed for "
                        + self.optimization_region.id
                    )
                    + ")"
                )
                output.end_statement()
            else:
                _print_closed_field_fallback(self, output, plan, names)

        output.with_block(streaming_fallback)
    else:
        output.with_block(materialize)


def print_closed_field_region(self, output):
    """Lower a verified field-operation graph without rediscovering meaning."""
    region = self.optimization_region
    plan = region.operands
    suffix = str(output.index_counter)
    output.index_counter += 1
    names = {
        "suffix": suffix,
        "count": "ρσ_FieldCount" + suffix,
        "context": "ρσ_FieldContext" + suffix,
        "index": "ρσ_FieldIndex" + suffix,
        "iterable": "ρσ_FieldIterable" + suffix,
        "range": "ρσ_FieldRange" + suffix,
        "modulus": "ρσ_FieldModulus" + suffix,
        "modulus_coefficients": "ρσ_FieldModulusCoefficients" + suffix,
        "zip_eligible": "ρσ_FieldZipEligible" + suffix,
        "zip_iterables": [],
        "zip_lengths": [],
    }
    if plan.iteratorKind == "sequence":
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
    elif plan.iteratorKind == "range":
        output.print("var")
        output.space()
        output.assign(names["range"])
        output.print("ρσ_range(")
        plan.count.print(output)
        output.print(")")
        output.end_statement()
        output.indent()
        _print_region_variable(
            output,
            names["count"],
            names["range"] + "._length",
        )
    else:
        for index, source in enumerate(plan.zipIterables):
            iterable_name = "ρσ_FieldZipIterable" + suffix + "_" + str(index)
            length_name = "ρσ_FieldZipLength" + suffix + "_" + str(index)
            names["zip_iterables"].append(iterable_name)
            names["zip_lengths"].append(length_name)
            output.print("var")
            output.space()
            output.assign(iterable_name)
            source.print(output)
            output.end_statement()
            output.indent()
            _print_region_variable(
                output,
                length_name,
                "ρσ_machine_field_sequence_length(" + iterable_name + ")",
            )
        _print_region_variable(
            output,
            names["count"],
            names["zip_lengths"][0]
            if plan.zipStrict
            else "Math.min(" + ",".join(names["zip_lengths"]) + ")",
        )
        eligibility = " && ".join(length + " >= 0" for length in names["zip_lengths"])
        if plan.zipStrict:
            eligibility += " && " + " && ".join(
                length + " === " + names["zip_lengths"][0]
                for length in names["zip_lengths"][1:]
            )
        _print_region_variable(output, names["zip_eligible"], eligibility)

    # A zero-trip loop must not read body-only names or sequence elements.
    # Versioning therefore occurs only after the ordinary iterable/count
    # expression has been evaluated and a nonzero trip is established.
    if plan.iteratorKind != "zip":
        output.indent()
        output.print("if (" + names["count"] + " !== 0)")
        output.space()

    def nonempty_region():
        input_slots = getattr(plan, "inputSlots", None)
        if input_slots is None:
            input_slots = list(range(len(plan.slots)))
        output.indent()
        output.print("var")
        output.space()
        output.assign(names["context"])
        output.print("ρσ_prepare_machine_field_region([")
        for index, input_slot in enumerate(input_slots):
            if index:
                output.comma()
            plan.slots[input_slot].node.print(output)
        output.print("],[")
        for index, sequence in enumerate(plan.sequences):
            if index:
                output.comma()
            if plan.iteratorKind == "sequence" and index == 0:
                output.print(names["iterable"])
            elif plan.iteratorKind == "zip":
                source_index = 0
                for binding_index, binding in enumerate(plan.zipSequenceBindings):
                    if binding == index:
                        source_index = binding_index
                        break
                output.print(names["zip_iterables"][source_index])
            else:
                sequence.node.print(output)
        output.print("],")
        output.print(names["count"])
        output.comma()
        output.print(
            str(
                _field_operation_mask(
                    plan.operations,
                    plan.sequenceStrategy == "stream",
                    plan.inplaceOperations,
                )
            )
        )
        output.comma()
        output.print("[")
        for index, value in enumerate(plan.integerConstants):
            if index:
                output.comma()
            output.print(str(value))
        output.print("]")
        output.print(")")
        output.end_statement()
        output.indent()
        output.print("if (" + names["context"] + ".ok === true)")
        output.space()

        def fast():
            def v8_path():
                _print_region_variable(
                    output,
                    names["modulus"],
                    names["context"] + ".modulus",
                )
                output.indent()
                output.print("if (" + names["context"] + ".kind === 1)")
                output.space()

                def prime():
                    _print_closed_field_fast_path(self, output, plan, names, "prime")

                output.with_block(prime)
                output.space()
                output.print("else")
                output.space()

                def extension():
                    _print_region_variable(
                        output,
                        names["modulus_coefficients"],
                        names["context"] + ".modulusCoefficients",
                    )
                    for degree in range(2, 5):
                        output.indent()
                        output.print(
                            ("if" if degree == 2 else "else if")
                            + " ("
                            + names["context"]
                            + ".degree === "
                            + str(degree)
                            + ")"
                        )
                        output.space()

                        def fixed_degree_path(degree=degree):
                            # Keep each fixed-shape variant in its own V8
                            # compilation unit.  Emitting degrees 2--4 into
                            # one large enclosing function made TurboFan
                            # optimize all three mutually exclusive bodies as
                            # one region and was several times slower for
                            # degree 3.  The entry guard selects exactly one
                            # outlined closure, whose loop remains entirely
                            # scalar and monomorphic.
                            output.print("(() =>")
                            output.space()

                            def outlined_degree_path():
                                _print_closed_field_fast_path(
                                    self,
                                    output,
                                    plan,
                                    names,
                                    "extension",
                                    degree,
                                )

                            output.with_block(outlined_degree_path)
                            output.print(")()")
                            output.end_statement()

                        output.with_block(fixed_degree_path)

                output.with_block(extension)

            if plan.affine and plan.affine.kind == "fixed-increment":
                adaptive_result = "ρσ_FieldAdaptiveResult" + suffix
                accumulator = plan.slots[plan.affine.accumulatorSlot]
                multiplier = plan.slots[plan.affine.multiplierSlot]
                increment = plan.slots[plan.affine.incrementSlot]
                output.indent()
                output.print("var")
                output.space()
                output.assign(adaptive_result)
                output.print("ρσ_fast_machine_residue_recurrence(")
                accumulator.node.print(output)
                output.comma()
                multiplier.node.print(output)
                output.comma()
                increment.node.print(output)
                output.comma()
                output.print(names["count"])
                output.print(")")
                output.end_statement()
                output.indent()
                output.print("if (" + adaptive_result + " !== null)")
                output.space()

                def isolated_path():
                    output.indent()
                    output.assign(accumulator.node)
                    output.print(adaptive_result)
                    output.end_statement()
                    output.indent()
                    output.assign(self.init)
                    output.print(names["count"] + " - 1")
                    output.end_statement()

                output.with_block(isolated_path)
                output.space()
                output.print("else")
                output.space()
                output.with_block(v8_path)
            else:
                v8_path()

        output.with_block(fast)
        output.space()
        output.print("else")
        output.space()

        def fallback():
            if region.guardFailure == "error":
                _print_optimizer_guard_error(
                    output, region, names["context"] + ".reason"
                )
            else:
                _print_closed_field_fallback(self, output, plan, names)

        output.with_block(fallback)

    if plan.iteratorKind == "zip":
        output.indent()
        output.print("if (" + names["zip_eligible"] + ")")
        output.space()

        def eligible_zip():
            output.indent()
            output.print("if (" + names["count"] + " !== 0)")
            output.space()
            output.with_block(nonempty_region)

        output.with_block(eligible_zip)
        output.space()
        output.print("else")
        output.space()

        def invalid_zip():
            if region.guardFailure == "error":
                _print_optimizer_guard_error(
                    output, region, JSON.stringify("zip-shape")
                )
            else:
                _print_closed_field_fallback(self, output, plan, names)

        output.with_block(invalid_zip)
    else:
        output.with_block(nonempty_region)
