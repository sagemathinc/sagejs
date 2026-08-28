from output.optimizer.scalar import (
    _field_operation_mask,
    _print_closed_field_fallback,
    _print_closed_field_fast_path,
    _print_optimizer_guard_error,
    _print_region_variable,
)


def _print_fixed_extension_v8_dispatch(self, output, plan, names):
    """Emit one independently outlined body for every verified tuple width."""
    context_name = names["context"]
    _print_region_variable(output, names["modulus"], context_name + ".modulus")
    variants = plan.fixedExtension.target.variants
    for index, variant in enumerate(variants):
        degree = variant.degree
        output.indent()
        output.print(
            ("if" if index == 0 else "else if")
            + " ("
            + context_name
            + ".degree === "
            + str(degree)
            + " && "
            + context_name
            + ".modulus <= "
            + str(variant.admittedMaximumPrime)
            + " && "
            + context_name
            + ".modulusCoefficients.length === "
            + str(degree)
            + ")"
        )
        output.space()

        def fixed_degree_path(degree=degree):
            # The guarded dispatch remains outside this closure.  TurboFan
            # therefore sees one coordinate width and one unrolled modulus
            # shape in each compilation unit rather than a megamorphic loop.
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
    output.space()
    output.print("else")
    output.space()

    def unsupported_shape():
        if self.optimization_region.guardFailure == "error":
            _print_optimizer_guard_error(
                output,
                self.optimization_region,
                JSON.stringify("fixed-extension-shape"),
            )
        else:
            _print_closed_field_fallback(self, output, plan, names)

    output.with_block(unsupported_shape)


def _print_fixed_extension_fast_path(self, output, plan, names):
    """Choose the coarse affine kernel or one fixed-width V8 outline."""
    if plan.affine and plan.affine.kind == "fixed-increment":
        suffix = names["suffix"]
        adaptive_result = "ρσ_FixedExtensionAdaptiveResult" + suffix
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

        def v8_path():
            _print_fixed_extension_v8_dispatch(self, output, plan, names)

        output.with_block(v8_path)
        return
    _print_fixed_extension_v8_dispatch(self, output, plan, names)


def print_fixed_extension_region(self, output):
    """Lower a verified fixed-extension graph with an exact dynamic fallback."""
    region = self.optimization_region
    plan = region.operands
    suffix = str(output.index_counter)
    output.index_counter += 1
    names = {
        "suffix": suffix,
        "count": "ρσ_FixedExtensionCount" + suffix,
        "context": "ρσ_FixedExtensionContext" + suffix,
        "index": "ρσ_FixedExtensionIndex" + suffix,
        "iterable": "ρσ_FixedExtensionIterable" + suffix,
        "range": "ρσ_FixedExtensionRange" + suffix,
        "modulus": "ρσ_FixedExtensionModulus" + suffix,
        "modulus_coefficients": "ρσ_FixedExtensionModulusCoefficients" + suffix,
        "zip_eligible": "ρσ_FixedExtensionZipEligible" + suffix,
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
            iterable_name = "ρσ_FixedExtensionZipIterable" + suffix + "_" + str(index)
            length_name = "ρσ_FixedExtensionZipLength" + suffix + "_" + str(index)
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

    # Do not read loop live-ins or body-only names on a zero-trip path.
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
        output.print("])")
        output.end_statement()
        output.indent()
        output.print(
            "if ("
            + names["context"]
            + ".ok === true && "
            + names["context"]
            + ".kind === 2 && "
            + names["context"]
            + ".modulusIdentityAuthentication === "
            + JSON.stringify("construction-time-modulus-identity.v1")
            + " && "
            + names["context"]
            + ".constructionContext !== undefined && Object.isFrozen("
            + names["context"]
            + ".constructionContext) && "
            + names["context"]
            + ".constructionContext.machineModulusCoefficients === "
            + names["context"]
            + ".modulusCoefficients && "
            + "ρσ_machine_extension_context_matches("
            + names["context"]
            + ".parent, "
            + names["context"]
            + ".modulusCoefficients) === true)"
        )
        output.space()

        def fast():
            _print_fixed_extension_fast_path(self, output, plan, names)

        output.with_block(fast)
        output.space()
        output.print("else")
        output.space()

        def fallback():
            if region.guardFailure == "error":
                reason = (
                    "("
                    + names["context"]
                    + ".ok === true ? 'not-fixed-extension-parent' : "
                    + names["context"]
                    + ".reason)"
                )
                _print_optimizer_guard_error(output, region, reason)
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
                    output,
                    region,
                    JSON.stringify("zip-shape"),
                )
            else:
                _print_closed_field_fallback(self, output, plan, names)

        output.with_block(invalid_zip)
    else:
        output.with_block(nonempty_region)
