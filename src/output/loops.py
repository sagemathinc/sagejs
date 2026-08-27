# vim:fileencoding=utf-8
# License: BSD Copyright: 2016, Kovid Goyal <kovid at kovidgoyal.net>
from __python__ import hash_literals

from ast_types import (
    AST_Array,
    AST_AsyncFor,
    AST_BaseCall,
    AST_Dot,
    AST_GeneratorComprehension,
    AST_ItemAccess,
    AST_ListComprehension,
    AST_Number,
    AST_Seq,
    AST_Splice,
    AST_SymbolRef,
    AST_Try,
    AST_Unary,
    is_node_type,
)
from output.stream import OutputStream
from output.statements import force_statement, print_await_expression


def print_unpack_pattern(node, output):
    """Emit the shape consumed by `ρσ_unpack_nested` for a target."""
    if is_node_type(node, AST_Seq):
        node = AST_Array({"elements": node.to_array()})
    if is_node_type(node, AST_Array):
        output.print("[")
        for index, element in enumerate(node.elements):
            if index:
                output.comma()
            print_unpack_pattern(element, output)
        output.print("]")
    else:
        output.print("null")


def print_target_assignment(target, output, print_value):
    """Emit one Python assignment target using the appropriate runtime hook."""
    if is_node_type(target, AST_ItemAccess):
        output.print("ρσ_setitem(")
        target.expression.print(output)
        output.comma()
        target.property.print(output)
        output.comma()
        print_value()
        output.print(")")
        return
    if is_node_type(target, AST_Splice):
        output.print("ρσ_splice(")
        target.expression.print(output)
        output.comma()
        print_value()
        output.comma()
        target.property.print(output) if target.property else output.print("0")
        if target.property2:
            output.comma()
            target.property2.print(output)
        output.print(")")
        return
    if (
        output.options.python_attributes
        and is_node_type(target, AST_Dot)
        and not target.property.startswith("ρσ_")
        and "." not in target.property
    ):
        output.print("ρσ_setattr(")
        target.expression.print(output)
        output.comma()
        output.print(JSON.stringify(target.property))
        output.comma()
        print_value()
        output.print(")")
        return
    output.assign(target)
    print_value()


def unpack_tuple(elems, output, in_statement=False):
    for i, elem in enumerate(elems):
        output.indent()

        def print_value():
            output.print("ρσ_unpack")
            output.with_square(lambda: output.print(i))

        print_target_assignment(elem, output, print_value)
        if not in_statement or i < elems.length - 1:
            output.semicolon()
            output.newline()


def loop_can_catch_interrupt(output):
    stack = output.stack()
    for i in range(stack.length - 2, -1, -1):
        ancestor = stack[i]
        if is_node_type(ancestor, AST_Try) and ancestor.bcatch:
            return True
    return False


def print_interrupt_check(output):
    output.indent()
    output.print("if ((++ρσ_interrupt_counter & 255) === 0) ρσ_check_interrupt()")
    output.end_statement()
    output.newline()


def print_loop_body(loop, output):
    if not loop_can_catch_interrupt(output):
        loop._do_print_body(output)
        return

    def body():
        print_interrupt_check(output)
        for statement in loop.body.body:
            output.indent()
            statement.print(output)
            output.newline()

    output.with_block(body)


def print_do_loop(self, output):
    output.print("do")
    output.space()
    print_loop_body(self, output)
    output.space()
    output.print("while")
    output.space()
    output.with_parens(lambda: output.print_truth_test(self.condition))
    output.semicolon()


def print_while_loop(self, output):
    prepare_loop_else(self, output)
    output.print("while")
    output.space()
    output.with_parens(lambda: output.print_truth_test(self.condition))
    output.space()
    print_loop_body(self, output)
    print_loop_else(self, output)


def prepare_loop_else(loop, output):
    if not loop.alternative:
        return
    loop.else_flag = "ρσ_LoopElse" + output.loop_else_counter
    output.loop_else_counter += 1
    output.print("var " + loop.else_flag + " = true")
    output.end_statement()
    output.indent()


def print_loop_else(loop, output):
    if not loop.alternative:
        return
    output.newline()
    output.indent()
    output.print("if")
    output.space()
    output.with_parens(lambda: output.print(loop.else_flag))
    output.space()
    force_statement(loop.alternative, output)


def is_simple_for_in(self):
    # return true if this loop can be simplified into a basic for (i in j) loop
    if (
        is_node_type(self.object, AST_BaseCall)
        and is_node_type(self.object.expression, AST_SymbolRef)
        and self.object.expression.name is "dir"
        and self.object.args.length is 1
    ):
        return True
    return False


def is_simple_for(self):
    # returns true if this loop can be simplified into a basic for(i=n;i<h;i++) loop
    args = self.object.args if is_node_type(self.object, AST_BaseCall) else None
    if args:
        for argument in args:
            if is_node_type(argument, AST_GeneratorComprehension):
                return False
    if (
        self.builtin_range is not False
        and is_node_type(self.object, AST_BaseCall)
        and is_node_type(self.object.expression, AST_SymbolRef)
        and self.object.expression.name is "range"
        and not args.starargs
        and not (args.kwarg_items and args.kwarg_items.length)
        and not (args.kwargs and args.kwargs.length)
        and not (is_node_type(self.init, AST_Array))
    ):
        a = args
        l = a.length
        if l < 3 or (
            is_node_type(a[2], AST_Number)
            or (
                is_node_type(a[2], AST_Unary)
                and a[2].operator is "-"
                and is_node_type(a[2].expression, AST_Number)
            )
        ):
            return True
    return False


def print_for_loop_body(output):
    self = this

    def f_print_for_loop_body():
        if not (self.simple_for_index or is_simple_for_in(self)):
            # if we're using multiple iterators, unpack them
            output.indent()
            itervar = "ρσ_Index" + output.index_counter
            if is_node_type(self.init, AST_Array):
                flat = self.init.flatten()
                output.assign("ρσ_unpack")
                if flat.length > self.init.elements.length:
                    output.print("ρσ_unpack_nested(")
                    print_unpack_pattern(self.init, output)
                    output.comma()
                    output.print(itervar)
                    output.print(")")
                else:
                    output.print(itervar)
                output.end_statement()
                unpack_tuple(flat, output)
            else:
                output.assign(self.init)
                output.print(itervar)
                output.end_statement()

            output.index_counter += 1
        if self.simple_for_index:
            output.indent()
            output.assign(self.init)
            output.print(self.simple_for_index)
            output.end_statement()

        if loop_can_catch_interrupt(output):
            print_interrupt_check(output)
        for stmt in self.body.body:
            output.indent()
            stmt.print(output)
            output.newline()

    output.with_block(f_print_for_loop_body)


def init_es6_itervar(output, itervar):
    output.indent()
    if output.options.python_attributes:
        output.print(itervar + " = ρσ_Iterable(" + itervar + ")")
        output.end_statement()
        return
    output.spaced(
        itervar,
        "=",
        "((typeof",
        itervar + "[Symbol.iterator]",
        "===",
        '"function")',
        "?",
        "(" + itervar,
        "instanceof",
        "Map",
        "?",
        itervar + ".keys()",
        ":",
        itervar + ")",
        ":",
        "Object.keys(" + itervar + "))",
    )
    output.end_statement()


def print_for_in(self, output):
    if self.optimization_region:
        if (
            self.optimization_region.kind == "closed-affine-recurrence"
            and self.builtin_range is not False
            and is_simple_for(self)
            and self.object.args.length is 1
        ):
            return print_optimization_region(self, output)
        if self.optimization_region.kind == "closed-field-region":
            return print_closed_field_region(self, output)
    prepare_loop_else(self, output)

    def write_object():
        if self.object.constructor is AST_Seq:
            (AST_Array({"elements": self.object.to_array()})).print(output)
        else:
            self.object.print(output)

    if is_simple_for(self):
        # optimize range() into a simple for loop
        increment = None
        args = self.object.args
        tmp_ = args.length
        if tmp_ is 1:
            start = 0
            end = args[0]
        elif tmp_ is 2:
            start = args[0]
            end = args[1]
        elif tmp_ is 3:
            start = args[0]
            end = args[1]
            increment = args[2]
        negative_increment = is_node_type(increment, AST_Unary)

        self.simple_for_index = idx = "ρσ_Index" + output.index_counter
        output.index_counter += 1

        # A Python range object captures all of its arguments before the loop
        # starts.  In particular, rebinding ``stop`` in the body must not
        # shorten the loop.  Materialize user-supplied arguments in their
        # left-to-right evaluation order before emitting the optimized loop.
        if tmp_ >= 2:
            start_name = "ρσ_Start" + output.index_counter
            output.index_counter += 1
            output.print("var")
            output.space()
            output.assign(start_name)
            start.print(output)
            output.end_statement()
            output.indent()
            start = AST_SymbolRef({"name": start_name})

        end_name = "ρσ_End" + output.index_counter
        output.index_counter += 1
        output.print("var")
        output.space()
        output.assign(end_name)
        end.print(output)
        output.end_statement()
        output.indent()
        end = AST_SymbolRef({"name": end_name})

        if tmp_ is 3:
            increment_name = "ρσ_Step" + output.index_counter
            output.index_counter += 1
            output.print("var")
            output.space()
            output.assign(increment_name)
            increment.print(output)
            output.end_statement()
            output.indent()
            increment = AST_SymbolRef({"name": increment_name})
        output.print("for")
        output.space()

        def f_simple_for():
            output.spaced("var", idx, "="), output.space()
            start.print(output) if start.print else output.print(start)
            output.semicolon()
            output.space()
            output.print(idx)
            output.space()
            output.print(">") if negative_increment else output.print("<")
            output.space()
            end.print(output)
            output.semicolon()
            output.space()
            output.print(idx)
            if increment:
                output.print("+=")
                increment.print(output)
            else:
                output.print("++")

        output.with_parens(f_simple_for)

    elif is_simple_for_in(self):
        # optimize dir() into a simple for in loop
        output.print("for")
        output.space()

        def f_simple_for_in():
            self.init.print(output)
            output.space()
            output.print("in")
            output.space()
            self.object.args[0].print(output)

        output.with_parens(f_simple_for_in)
    else:
        # regular loop
        itervar = "ρσ_Iter" + output.index_counter
        output.assign("var " + itervar)
        write_object()
        output.end_statement()
        init_es6_itervar(output, itervar)
        output.indent()
        output.spaced(
            "for", "(var", "ρσ_Index" + output.index_counter, "of", itervar + ")"
        )

    output.space()
    self._do_print_body(output)
    print_loop_else(self, output)


def print_optimization_region(self, output):
    """Lower one verified optimization-region plan to JavaScript."""
    region = self.optimization_region
    if region.kind != "closed-affine-recurrence":
        raise TypeError("unsupported optimization region " + region.kind)
    recurrence = region.operands
    suffix = output.index_counter
    output.index_counter += 1
    count_name = "ρσ_ResidueCount" + suffix
    range_name = "ρσ_ResidueRange" + suffix
    result_name = "ρσ_ResidueResult" + suffix
    index_name = "ρσ_ResidueIndex" + suffix

    output.print("var")
    output.space()
    output.assign(range_name)
    output.print("ρσ_range(")
    self.object.args[0].print(output)
    output.print(")")
    output.end_statement()
    output.indent()
    output.print("var")
    output.space()
    output.assign(count_name)
    output.print(range_name + "._length")
    output.end_statement()
    output.indent()
    output.print("if (" + count_name + " !== 0)")
    output.space()

    def nonempty_region():
        output.indent()
        output.print("var")
        output.space()
        output.assign(result_name)
        output.print("ρσ_fast_machine_residue_recurrence(")
        recurrence.accumulator.print(output)
        output.comma()
        recurrence.multiplier.print(output)
        output.comma()
        recurrence.increment.print(output)
        output.comma()
        output.print(count_name)
        output.print(")")
        output.end_statement()
        output.indent()
        output.print("if")
        output.space()
        output.with_parens(lambda: output.spaced(result_name, "!==", "null"))
        output.space()

        def fast_body():
            output.indent()
            output.assign(recurrence.accumulator)
            output.print(result_name)
            output.end_statement()
            output.indent()
            output.assign(self.init)
            output.print(count_name + " - 1")
            output.end_statement()

        output.with_block(fast_body)
        output.space()
        output.print("else")
        output.space()

        def generic_body():
            output.indent()
            output.print("for")
            output.space()
            output.print("(var " + index_name + " of ρσ_Iterable(" + range_name + "))")
            output.space()
            self.simple_for_index = index_name
            self._do_print_body(output)
            output.newline()

        output.with_block(generic_body)

    output.with_block(nonempty_region)


def _field_operation_mask(operations):
    bits = {"add": 1, "sub": 2, "mul": 4, "neg": 8, "equal": 16}
    answer = 0
    for operation in operations:
        answer |= bits[operation]
    return answer


def _print_region_variable(output, name, value):
    output.indent()
    output.print("var")
    output.space()
    output.assign(name)
    output.print(value)
    output.end_statement()


def _region_temp(counter, suffix):
    name = "ρσ_FieldTemp" + suffix + "_" + str(counter[0])
    counter[0] += 1
    return name


def _print_region_expression(
    expression,
    representation,
    slot_names,
    context_name,
    index_name,
    modulus_name,
    modulus_c0_name,
    modulus_c1_name,
    output,
    counter,
    suffix,
):
    if expression.kind == "slot":
        return slot_names[expression.slot]
    if expression.kind == "sequence":
        base = context_name + ".sequences[" + str(expression.sequence) + "]"
        if representation == "prime":
            return base + "[" + index_name + "]"
        return [
            base + "[2 * " + index_name + "]",
            base + "[2 * " + index_name + " + 1]",
        ]

    if expression.kind == "neg":
        value = _print_region_expression(
            expression.value,
            representation,
            slot_names,
            context_name,
            index_name,
            modulus_name,
            modulus_c0_name,
            modulus_c1_name,
            output,
            counter,
            suffix,
        )
        if representation == "prime":
            result = _region_temp(counter, suffix)
            _print_region_variable(
                output,
                result,
                "(" + value + " === 0 ? 0 : " + modulus_name + " - " + value + ")",
            )
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
        return answer

    left = _print_region_expression(
        expression.left,
        representation,
        slot_names,
        context_name,
        index_name,
        modulus_name,
        modulus_c0_name,
        modulus_c1_name,
        output,
        counter,
        suffix,
    )
    right = _print_region_expression(
        expression.right,
        representation,
        slot_names,
        context_name,
        index_name,
        modulus_name,
        modulus_c0_name,
        modulus_c1_name,
        output,
        counter,
        suffix,
    )
    operator = expression.operator
    if representation == "prime":
        result = _region_temp(counter, suffix)
        if operator == "+":
            value = "(" + left + " + " + right + ") % " + modulus_name
        elif operator == "-":
            value = (
                "(("
                + left
                + " - "
                + right
                + ") % "
                + modulus_name
                + " + "
                + modulus_name
                + ") % "
                + modulus_name
            )
        else:
            value = "(" + left + " * " + right + ") % " + modulus_name
        _print_region_variable(output, result, value)
        return result

    answer = []
    if operator in ("+", "-"):
        for component in range(2):
            result = _region_temp(counter, suffix)
            symbol = "+" if operator == "+" else "-"
            value = (
                "(("
                + left[component]
                + " "
                + symbol
                + " "
                + right[component]
                + ") % "
                + modulus_name
                + " + "
                + modulus_name
                + ") % "
                + modulus_name
            )
            _print_region_variable(output, result, value)
            answer.append(result)
        return answer

    quadratic = _region_temp(counter, suffix)
    _print_region_variable(output, quadratic, left[1] + " * " + right[1])
    result0 = _region_temp(counter, suffix)
    value0 = (
        "(("
        + left[0]
        + " * "
        + right[0]
        + " - "
        + quadratic
        + " * "
        + modulus_c0_name
        + ") % "
        + modulus_name
        + " + "
        + modulus_name
        + ") % "
        + modulus_name
    )
    _print_region_variable(output, result0, value0)
    result1 = _region_temp(counter, suffix)
    value1 = (
        "(("
        + left[0]
        + " * "
        + right[1]
        + " + "
        + left[1]
        + " * "
        + right[0]
        + " - "
        + quadratic
        + " * "
        + modulus_c1_name
        + ") % "
        + modulus_name
        + " + "
        + modulus_name
        + ") % "
        + modulus_name
    )
    _print_region_variable(output, result1, value1)
    return [result0, result1]


def _print_region_statements(
    statements,
    representation,
    slot_names,
    context_name,
    index_name,
    modulus_name,
    modulus_c0_name,
    modulus_c1_name,
    output,
    counter,
    suffix,
):
    for statement in statements:
        if statement.kind == "assign":
            value = _print_region_expression(
                statement.value,
                representation,
                slot_names,
                context_name,
                index_name,
                modulus_name,
                modulus_c0_name,
                modulus_c1_name,
                output,
                counter,
                suffix,
            )
            targets = slot_names[statement.target]
            if representation == "prime":
                output.indent()
                output.assign(targets)
                output.print(value)
                output.end_statement()
            else:
                for component in range(2):
                    output.indent()
                    output.assign(targets[component])
                    output.print(value[component])
                    output.end_statement()
            continue

        left = _print_region_expression(
            statement.condition.left,
            representation,
            slot_names,
            context_name,
            index_name,
            modulus_name,
            modulus_c0_name,
            modulus_c1_name,
            output,
            counter,
            suffix,
        )
        right = _print_region_expression(
            statement.condition.right,
            representation,
            slot_names,
            context_name,
            index_name,
            modulus_name,
            modulus_c0_name,
            modulus_c1_name,
            output,
            counter,
            suffix,
        )
        condition = (
            left + " === " + right
            if representation == "prime"
            else left[0] + " === " + right[0] + " && " + left[1] + " === " + right[1]
        )
        output.indent()
        output.print("if (" + condition + ")")
        output.space()

        def consequent():
            _print_region_statements(
                statement.body,
                representation,
                slot_names,
                context_name,
                index_name,
                modulus_name,
                modulus_c0_name,
                modulus_c1_name,
                output,
                counter,
                suffix,
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
                    slot_names,
                    context_name,
                    index_name,
                    modulus_name,
                    modulus_c0_name,
                    modulus_c1_name,
                    output,
                    counter,
                    suffix,
                )

            output.with_block(alternative)


def _print_closed_field_fast_path(self, output, plan, names, representation):
    context_name = names["context"]
    count_name = names["count"]
    index_name = names["index"]
    suffix = names["suffix"]
    modulus_name = names["modulus"]
    modulus_c0_name = names["modulus_c0"]
    modulus_c1_name = names["modulus_c1"]
    slot_names = []
    for slot in range(len(plan.slots)):
        if representation == "prime":
            name = "ρσ_FieldValue" + suffix + "_" + str(slot)
            _print_region_variable(
                output, name, context_name + ".values[" + str(slot) + "]"
            )
            slot_names.append(name)
        else:
            pair = []
            for component in range(2):
                name = "ρσ_FieldValue" + suffix + "_" + str(slot) + "_" + str(component)
                _print_region_variable(
                    output,
                    name,
                    context_name + ".values[" + str(2 * slot + component) + "]",
                )
                pair.append(name)
            slot_names.append(pair)

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
        _print_region_statements(
            plan.statements,
            representation,
            slot_names,
            context_name,
            index_name,
            modulus_name,
            modulus_c0_name,
            modulus_c1_name,
            output,
            [0],
            suffix,
        )

    output.with_block(body)
    output.indent()
    output.print("if (" + count_name + " > 0)")
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
                output.print(slot_names[state_slot][0])
                output.comma()
                output.print(slot_names[state_slot][1])
            output.print(")")
            output.end_statement()
        output.indent()
        output.assign(self.init)
        if plan.iteratorKind == "range":
            output.print(count_name + " - 1")
        else:
            output.print(names["iterable"] + "[" + count_name + " - 1]")
        output.end_statement()

    output.with_block(materialize)


def print_closed_field_region(self, output):
    """Lower a verified field-operation graph without rediscovering meaning."""
    plan = self.optimization_region.operands
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
        "modulus_c0": "ρσ_FieldModulusC0_" + suffix,
        "modulus_c1": "ρσ_FieldModulusC1_" + suffix,
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
    else:
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

    # A zero-trip loop must not read body-only names or sequence elements.
    # Versioning therefore occurs only after the ordinary iterable/count
    # expression has been evaluated and a nonzero trip is established.
    output.indent()
    output.print("if (" + names["count"] + " !== 0)")
    output.space()

    def nonempty_region():
        output.indent()
        output.print("var")
        output.space()
        output.assign(names["context"])
        output.print("ρσ_prepare_machine_field_region([")
        for index, slot in enumerate(plan.slots):
            if index:
                output.comma()
            slot.node.print(output)
        output.print("],[")
        for index, sequence in enumerate(plan.sequences):
            if index:
                output.comma()
            if plan.iteratorKind == "sequence" and index == 0:
                output.print(names["iterable"])
            else:
                sequence.node.print(output)
        output.print("],")
        output.print(names["count"])
        output.comma()
        output.print(str(_field_operation_mask(plan.operations)))
        output.print(")")
        output.end_statement()
        output.indent()
        output.print("if (" + names["context"] + " !== null)")
        output.space()

        def fast():
            _print_region_variable(
                output, names["modulus"], names["context"] + ".modulus"
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
                    names["modulus_c0"],
                    names["context"] + ".modulusC0",
                )
                _print_region_variable(
                    output,
                    names["modulus_c1"],
                    names["context"] + ".modulusC1",
                )
                _print_closed_field_fast_path(self, output, plan, names, "extension")

            output.with_block(extension)

        output.with_block(fast)
        output.space()
        output.print("else")
        output.space()

        def fallback():
            fallback_value = "ρσ_FieldFallback" + suffix
            output.indent()
            output.print("for")
            output.space()
            if plan.iteratorKind == "range":
                output.print(
                    "(var "
                    + fallback_value
                    + " of ρσ_Iterable("
                    + names["range"]
                    + "))"
                )
            else:
                output.print(
                    "(var "
                    + fallback_value
                    + " of ρσ_Iterable("
                    + names["iterable"]
                    + "))"
                )
            output.space()
            self.simple_for_index = fallback_value
            self._do_print_body(output)
            output.newline()

        output.with_block(fallback)

    output.with_block(nonempty_region)


def print_async_for(self, output):
    prepare_loop_else(self, output)
    iterator_name = "ρσ_AsyncIter" + output.index_counter
    output.index_counter += 1
    value_name = "ρσ_AsyncValue" + output.index_counter
    output.index_counter += 1

    output.print("var ")
    output.assign(iterator_name)
    self.object.print(output)
    output.print(".__aiter__()")
    output.end_statement()
    output.indent()
    output.print("while (true)")
    output.space()

    def loop_body():
        if loop_can_catch_interrupt(output):
            print_interrupt_check(output)
        output.indent()
        output.print("var " + value_name)
        output.end_statement()
        output.indent()
        output.print("try")
        output.space()

        def next_value():
            output.indent()
            output.assign(value_name)
            print_await_expression(
                output,
                lambda: output.print(iterator_name + ".__anext__()"),
            )
            output.end_statement()

        output.with_block(next_value)
        output.space()
        output.print("catch (ρσ_AsyncError)")
        output.space()

        def stop_or_raise():
            output.indent()
            output.print("if (ρσ_AsyncError instanceof StopAsyncIteration) break")
            output.end_statement()
            output.indent()
            output.print("throw ρσ_AsyncError")
            output.end_statement()

        output.with_block(stop_or_raise)
        output.newline()
        output.indent()
        output.assign(self.init)
        output.print(value_name)
        output.end_statement()
        for statement in self.body.body:
            output.indent()
            statement.print(output)
            output.newline()

    output.with_block(loop_body)
    print_loop_else(self, output)


def print_list_comprehension(self, output):
    tname = self.constructor.name.slice(4)
    result_obj = {
        "ListComprehension": "[]",
        "DictComprehension": ("Object.create(null)" if self.is_jshash else "{}"),
        "SetComprehension": "ρσ_set()",
    }[tname]
    is_generator = tname is "GeneratorComprehension"
    add_to_result = None
    if tname is "DictComprehension":
        if self.is_pydict:
            result_obj = "ρσ_dict()"

            def add_to_result0(output):
                output.indent()
                output.print("ρσ_Result.set")

                def f_dict():
                    self.statement.print(output)
                    output.space()
                    output.print(",")
                    output.space()

                    def f_dict0():
                        if (
                            self.value_statement.constructor is AST_Seq
                            and not output.options.python_tuples
                        ):
                            output.with_square(
                                lambda: self.value_statement.print(output)
                            )
                        else:
                            self.value_statement.print(output)

                    output.with_parens(f_dict0)

                output.with_parens(f_dict)
                output.end_statement()

            add_to_result = add_to_result0

        else:

            def add_to_result0(output):
                output.indent()
                output.print("ρσ_Result")
                output.with_square(lambda: self.statement.print(output))
                output.space(), output.print("="), output.space()

                def f_result():
                    if (
                        self.value_statement.constructor is AST_Seq
                        and not output.options.python_tuples
                    ):
                        output.with_square(lambda: self.value_statement.print(output))
                    else:
                        self.value_statement.print(output)

                output.with_parens(f_result)
                output.end_statement()

            add_to_result = add_to_result0
    else:
        push_func = "ρσ_Result." + (
            "push" if self.constructor is AST_ListComprehension else "add"
        )
        if is_generator:
            push_func = "yield "

        def add_to_result0(output):
            output.indent()
            output.print(push_func)

            def f_output_statement():
                if (
                    self.statement.constructor is AST_Seq
                    and not output.options.python_tuples
                ):
                    output.with_square(lambda: self.statement.print(output))
                else:
                    self.statement.print(output)

            output.with_parens(f_output_statement)
            output.end_statement()

        add_to_result = add_to_result0

    def f_body():
        output.print("function")
        output.print("()")
        output.space()

        def f_body0():
            body_out = output
            clauses = self.clauses or [
                {
                    "init": self.init,
                    "object": self.object,
                    "conditions": [self.condition] if self.condition else [],
                }
            ]
            if is_generator:
                body_out.indent()
                (
                    body_out.print("function* js_generator()"),
                    body_out.space(),
                    body_out.print("{"),
                )
                body_out.newline()
                previous_indentation = output.indentation()
                output.set_indentation(output.next_indent())
            if body_out.uses_python_truthiness():
                body_out.indent()
                body_out.print("var ρσ_cond_temp")
                body_out.end_statement()
            body_out.indent()
            body_out.print("var")
            body_out.space()
            body_out.print("ρσ_Result")
            if result_obj:
                body_out.space()
                body_out.assign("")
                body_out.print(result_obj)

            # A tuple target assigns the shared ρσ_unpack temporary in the
            # comprehension body.  Declare it in the same scope: an undeclared
            # assignment reaches for a global, which throws in the strict-mode
            # wrapper the compiler emits for a program file.
            unpacks_tuple = False
            for clause in clauses:
                if is_node_type(clause.init, AST_Array):
                    unpacks_tuple = True
            if unpacks_tuple:
                body_out.comma()
                body_out.print("ρσ_unpack")

            # make sure to locally scope loop variables
            def print_declaration_target(target):
                previous_assignment_target = body_out.assignment_target
                body_out.assignment_target = True
                try:
                    target.print(body_out)
                finally:
                    body_out.assignment_target = previous_assignment_target

            for clause in clauses:
                if is_node_type(clause.init, AST_Array):
                    # Nested tuple targets are destructuring patterns, not
                    # tuple-valued variable declarations.  Declare each leaf
                    # name; printing an inner AST_Array with python_tuples
                    # enabled would otherwise emit invalid JavaScript such as
                    # ``var rho_math_tuple([x, y])``.
                    for i in clause.init.flatten():
                        body_out.comma()
                        print_declaration_target(i)
                else:
                    body_out.comma()
                    print_declaration_target(clause.init)
            body_out.end_statement()

            def print_clause(clause_index):
                clause = clauses[clause_index]
                iter_name = "ρσ_Iter" + clause_index
                index_name = "ρσ_Index" + clause_index
                body_out.indent()
                body_out.assign("var " + iter_name)
                clause.object.print(body_out)
                body_out.end_statement()
                init_es6_itervar(body_out, iter_name)
                body_out.indent()
                body_out.print("for")
                body_out.space()
                body_out.with_parens(
                    lambda: body_out.spaced("var", index_name, "of", iter_name)
                )
                body_out.space()

                def print_clause_body():
                    body_out.indent()
                    if is_node_type(clause.init, AST_Array):
                        flat = clause.init.flatten()
                        body_out.assign("ρσ_unpack")
                        if flat.length > clause.init.elements.length:
                            body_out.print("ρσ_flatten(" + index_name + ")")
                        else:
                            body_out.print(index_name)
                        body_out.end_statement()
                        unpack_tuple(flat, body_out)
                    else:
                        body_out.assign(clause.init)
                        body_out.print(index_name)
                        body_out.end_statement()

                    def print_filtered_body(condition_index):
                        if condition_index < clause.conditions.length:
                            body_out.indent()
                            body_out.print("if")
                            body_out.space()
                            body_out.with_parens(
                                lambda: body_out.print_truth_test(
                                    clause.conditions[condition_index]
                                )
                            )
                            body_out.space()
                            body_out.with_block(
                                lambda: print_filtered_body(condition_index + 1)
                            )
                        elif clause_index + 1 < clauses.length:
                            print_clause(clause_index + 1)
                        else:
                            add_to_result(body_out)

                    print_filtered_body(0)

                body_out.with_block(print_clause_body)
                body_out.newline()

            print_clause(0)
            if self.constructor is AST_ListComprehension:
                body_out.indent()
                body_out.spaced("ρσ_Result", "=", "ρσ_list_constructor(ρσ_Result)")
                body_out.end_statement()
            if not is_generator:
                body_out.indent()
                body_out.print("return ρσ_Result")
                body_out.end_statement()
            if is_generator:
                output.set_indentation(previous_indentation)
                (
                    body_out.newline(),
                    body_out.indent(),
                    body_out.print("}"),
                )  # end js_generator
                output.newline(), output.indent()
                output.spaced("var", "result", "=", "js_generator.call(this)")
                output.end_statement()
                # Python's generator objects use a separate method to send data to the generator
                output.indent()
                output.spaced("result.send", "=", "result.next")
                output.end_statement()
                output.indent()
                output.spaced("return", "result")
                output.end_statement()

        output.with_block(f_body0)

    output.with_parens(f_body)
    output.print("()")


def print_ellipses_range(self, output):
    output.print("ρσ_ellipsis_iter(" if self.is_iterator else "ρσ_ellipsis_range(")
    for i, element in enumerate(self.elements):
        if i:
            output.comma()
        element.print(output)
    output.print(")")
