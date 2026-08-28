from ast_types import (
    AST_Array,
    AST_Dot,
    AST_ItemAccess,
    AST_Seq,
    AST_Splice,
    AST_Try,
    is_node_type,
)
from output.statements import force_statement


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
