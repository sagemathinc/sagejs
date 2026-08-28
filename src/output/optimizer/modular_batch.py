def _batch_variable(output, name, value):
    output.indent()
    output.print("var")
    output.space()
    output.assign(name)
    output.print(value)
    output.end_statement()


def _batch_declaration(output, name):
    output.indent()
    output.print("var")
    output.space()
    output.print(name)
    output.end_statement()


def _batch_guard_error(output, region, reason):
    output.indent()
    output.print("throw new RuntimeError(")
    output.print(
        JSON.stringify("optimizer runtime guard failed for " + region.id + ": ")
    )
    output.print(" + " + reason)
    output.print(")")
    output.end_statement()


def _batch_fallback(loop, output, names):
    fallback_value = names["fallback"]
    output.indent()
    output.print(
        "for (var " + fallback_value + " of ρσ_Iterable(" + names["range"] + "))"
    )
    output.space()
    loop.simple_for_index = fallback_value
    loop._do_print_body(output)
    output.newline()


def _batch_temporary(output, names, expression):
    name = names["temporary"] + str(names["temporary_index"])
    names["temporary_index"] += 1
    _batch_variable(output, name, expression)
    return name


def _batch_expression(value, packed_inputs, constants, modulus, output, names):
    if value.kind == "input":
        return packed_inputs[value.input] + "[" + names["compute_index"] + "]"
    if value.kind == "integer-constant":
        return constants[str(value.value)]
    if value.kind == "neg":
        operand = _batch_expression(
            value.value, packed_inputs, constants, modulus, output, names
        )
        return _batch_temporary(
            output,
            names,
            operand + " === 0 ? 0 : " + modulus + " - " + operand,
        )
    left = _batch_expression(
        value.left, packed_inputs, constants, modulus, output, names
    )
    right = _batch_expression(
        value.right, packed_inputs, constants, modulus, output, names
    )
    if value.operator == "*":
        return _batch_temporary(
            output, names, "(" + left + " * " + right + ") % " + modulus
        )
    if value.operator == "+":
        total = _batch_temporary(output, names, left + " + " + right)
        return _batch_temporary(
            output,
            names,
            total + " >= " + modulus + " ? " + total + " - " + modulus + " : " + total,
        )
    return _batch_temporary(
        output,
        names,
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
        + modulus
        + " - "
        + right,
    )


def _print_complete_validation(plan, output, names):
    output.indent()
    output.print("if (" + names["ready"] + ")")
    output.space()

    def validate():
        for packed in names["packed_inputs"]:
            _batch_variable(output, packed, "new Float64Array(" + names["count"] + ")")
        output.indent()
        output.print("for")
        output.space()

        def condition():
            output.spaced("var", names["validation_index"], "=", "0")
            output.semicolon()
            output.space()
            output.spaced(names["validation_index"], "<", names["count"])
            output.semicolon()
            output.space()
            output.print(names["validation_index"] + "++")

        output.with_parens(condition)
        output.space()

        def body():
            for index in range(len(plan.inputs)):
                element = names["elements"][index]
                source = names["inputs"][index]
                _batch_variable(
                    output,
                    element,
                    source + "[" + names["validation_index"] + "]",
                )
                valid = (
                    names["context"]
                    + ".elementBrand.has("
                    + element
                    + ") && "
                    + element
                    + "._parent === "
                    + names["context"]
                    + ".parent && Object.getPrototypeOf("
                    + element
                    + ") === "
                    + names["context"]
                    + ".prototype && Number.isInteger("
                    + element
                    + "._value) && "
                    + element
                    + "._value >= 0 && "
                    + element
                    + "._value < "
                    + names["modulus"]
                )
                output.indent()
                output.print("if (!(" + valid + "))")
                output.space()

                def invalid():
                    output.indent()
                    output.assign(names["ready"])
                    output.print("false")
                    output.end_statement()
                    output.indent()
                    output.assign(names["reason"])
                    output.print(
                        JSON.stringify("sequence-element-representation-mismatch")
                    )
                    output.end_statement()
                    output.indent()
                    output.print("break")
                    output.end_statement()

                output.with_block(invalid)
                output.indent()
                output.assign(
                    names["packed_inputs"][index]
                    + "["
                    + names["validation_index"]
                    + "]"
                )
                output.print(element + "._value")
                output.end_statement()
            output.indent()
            output.print("if (!(" + names["ready"] + ")) break")
            output.end_statement()

        output.with_block(body)

    output.with_block(validate)


def _print_fast_batch(loop, output, plan, names):
    _batch_variable(output, names["stage"], "new Float64Array(" + names["count"] + ")")
    constants = {}
    for value in plan.integerConstants:
        constant_name = names["constant"] + str(len(constants))
        constants[str(value)] = constant_name
        _batch_variable(
            output,
            constant_name,
            names["context"] + ".integerConstants[" + JSON.stringify(str(value)) + "]",
        )
    output.indent()
    output.print("for")
    output.space()

    def compute_condition():
        output.spaced("var", names["compute_index"], "=", "0")
        output.semicolon()
        output.space()
        output.spaced(names["compute_index"], "<", names["count"])
        output.semicolon()
        output.space()
        output.print(names["compute_index"] + "++")

    output.with_parens(compute_condition)
    output.space()

    def compute_body():
        result = _batch_expression(
            plan.expression,
            names["packed_inputs"],
            constants,
            names["modulus"],
            output,
            names,
        )
        output.indent()
        output.assign(names["stage"] + "[" + names["compute_index"] + "]")
        output.print(result)
        output.end_statement()

    output.with_block(compute_body)
    output.indent()
    output.print("for")
    output.space()

    def publish_condition():
        output.spaced("var", names["publish_index"], "=", "0")
        output.semicolon()
        output.space()
        output.spaced(names["publish_index"], "<", names["count"])
        output.semicolon()
        output.space()
        output.print(names["publish_index"] + "++")

    output.with_parens(publish_condition)
    output.space()

    def publish_body():
        output.indent()
        output.assign(names["output"] + "[" + names["publish_index"] + "]")
        output.print("ρσ_materialize_machine_field_value(")
        output.print(names["context"])
        output.comma()
        output.print(names["stage"] + "[" + names["publish_index"] + "]")
        output.print(")")
        output.end_statement()

    output.with_block(publish_body)
    output.indent()
    output.assign(names["context"] + ".parent._lastCompilerOptimizationRoute")
    output.print("'v8-number-residue-batch'")
    output.end_statement()
    output.indent()
    output.assign(loop.init)
    output.print(names["count"] + " - 1")
    output.end_statement()


def print_modular_batch_region(self, output):
    """Lower one independently verified complete modular residue batch."""
    region = self.optimization_region
    plan = region.operands
    suffix = str(output.index_counter)
    output.index_counter += 1
    names = {
        "range": "ρσ_ModularBatchRange" + suffix,
        "count": "ρσ_ModularBatchCount" + suffix,
        "context": "ρσ_ModularBatchContext" + suffix,
        "ready": "ρσ_ModularBatchReady" + suffix,
        "reason": "ρσ_ModularBatchReason" + suffix,
        "modulus": "ρσ_ModularBatchModulus" + suffix,
        "stage": "ρσ_ModularBatchStage" + suffix,
        "output": "ρσ_ModularBatchOutput" + suffix,
        "validation_index": "ρσ_ModularBatchValidate" + suffix,
        "compute_index": "ρσ_ModularBatchIndex" + suffix,
        "publish_index": "ρσ_ModularBatchPublish" + suffix,
        "fallback": "ρσ_ModularBatchFallback" + suffix,
        "temporary": "ρσ_ModularBatchTemporary" + suffix + "_",
        "temporary_index": 0,
        "constant": "ρσ_ModularBatchConstant" + suffix + "_",
        "inputs": [],
        "lengths": [],
        "packed_inputs": [],
        "elements": [],
    }
    output.print("var")
    output.space()
    output.assign(names["range"])
    output.print("ρσ_range(")
    plan.count.print(output)
    output.print(")")
    output.end_statement()
    output.indent()
    _batch_variable(output, names["count"], names["range"] + "._length")
    output.indent()
    output.print("if (" + names["count"] + " !== 0)")
    output.space()

    def nonempty():
        output.indent()
        output.print("var")
        output.space()
        output.assign(names["output"])
        plan.output.print(output)
        output.end_statement()
        for index in range(len(plan.inputs)):
            input_name = "ρσ_ModularBatchInput" + suffix + "_" + str(index)
            length_name = "ρσ_ModularBatchLength" + suffix + "_" + str(index)
            packed_name = "ρσ_ModularBatchPacked" + suffix + "_" + str(index)
            element_name = "ρσ_ModularBatchElement" + suffix + "_" + str(index)
            names["inputs"].append(input_name)
            names["lengths"].append(length_name)
            names["packed_inputs"].append(packed_name)
            names["elements"].append(element_name)
            output.indent()
            output.print("var")
            output.space()
            output.assign(input_name)
            plan.inputs[index].node.print(output)
            output.end_statement()
            _batch_variable(
                output,
                length_name,
                "ρσ_machine_field_sequence_length(" + input_name + ")",
            )
            _batch_declaration(output, packed_name)
        eligibility = names["output"] + ".length === " + names["count"]
        for length_name in names["lengths"]:
            eligibility += " && " + length_name + " >= " + names["count"]
        _batch_variable(output, names["ready"], eligibility)
        _batch_variable(output, names["reason"], JSON.stringify("batch-shape-mismatch"))
        _batch_declaration(output, names["context"])
        _batch_declaration(output, names["modulus"])
        output.indent()
        output.print("if (" + names["ready"] + ")")
        output.space()

        def prepare():
            output.indent()
            output.assign(names["context"])
            output.print("ρσ_prepare_machine_field_region([")
            output.print(names["inputs"][0] + "[0]")
            output.print("],[")
            for index, input_name in enumerate(names["inputs"]):
                if index:
                    output.comma()
                output.print(input_name)
            output.print("],")
            output.print(names["count"])
            output.comma()
            output.print(str(plan.representation.methodGuardMask))
            output.comma()
            output.print("[")
            for index, value in enumerate(plan.integerConstants):
                if index:
                    output.comma()
                output.print(str(value))
            output.print("])")
            output.end_statement()
            output.indent()
            output.assign(names["ready"])
            output.print(
                names["context"] + ".ok === true && " + names["context"] + ".kind === 1"
            )
            output.end_statement()
            output.indent()
            output.assign(names["reason"])
            output.print(
                names["context"]
                + ".ok === true ? "
                + JSON.stringify("non-prime-residue-representation")
                + " : "
                + names["context"]
                + ".reason"
            )
            output.end_statement()
            output.indent()
            output.print("if (" + names["ready"] + ")")
            output.space()

            def exact_bound():
                output.indent()
                output.assign(names["modulus"])
                output.print(names["context"] + ".modulus")
                output.end_statement()
                output.indent()
                output.assign(names["ready"])
                output.print(
                    names["modulus"]
                    + " >= "
                    + str(plan.representation.exactBounds.modulusMinimum)
                    + " && "
                    + names["modulus"]
                    + " <= "
                    + str(plan.representation.exactBounds.modulusMaximum)
                )
                output.end_statement()
                output.indent()
                output.print("if (!(" + names["ready"] + "))")
                output.space()

                def invalid_bound():
                    output.indent()
                    output.assign(names["reason"])
                    output.print(JSON.stringify("modulus-exact-bound"))
                    output.end_statement()

                output.with_block(invalid_bound)

            output.with_block(exact_bound)

        output.with_block(prepare)
        _print_complete_validation(plan, output, names)
        output.indent()
        output.print("if (" + names["ready"] + ")")
        output.space()

        def fast():
            _print_fast_batch(self, output, plan, names)

        output.with_block(fast)
        output.space()
        output.print("else")
        output.space()

        def fallback():
            if region.guardFailure == "error":
                _batch_guard_error(output, region, names["reason"])
            else:
                _batch_fallback(self, output, names)

        output.with_block(fallback)

    output.with_block(nonempty)
