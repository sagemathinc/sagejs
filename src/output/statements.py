# vim:fileencoding=utf-8
# License: BSD Copyright: 2016, Kovid Goyal <kovid at kovidgoyal.net>
from __python__ import hash_literals

from ast_types import (AST_Definitions, AST_Scope, AST_Method, AST_Except,
                       AST_EmptyStatement, AST_Statement, AST_Seq,
                       AST_BaseCall, AST_Dot, AST_Sub, AST_ItemAccess,
                       AST_Conditional, AST_Binary, AST_BlockStatement,
                       is_node_type)


def force_statement(stat, output):
    if output.options.bracketize:
        if not stat or is_node_type(stat, AST_EmptyStatement):
            output.print("{}")
        elif is_node_type(stat, AST_BlockStatement):
            stat.print(output)
        else:

            def f():
                output.indent()
                stat.print(output)
                output.newline()

            output.with_block(f)
    else:
        if not stat or is_node_type(stat, AST_EmptyStatement):
            output.force_semicolon()
        else:
            stat.print(output)


# return true if the node at the top of the stack (that means the
# innermost node in the current output) is lexically the first in
# a statement.
def first_in_statement(output):
    a = output.stack()
    i = a.length
    i -= 1
    node = a[i]
    i -= 1
    p = a[i]
    while i > 0:
        if is_node_type(p, AST_Statement) and p.body is node:
            return True
        if (is_node_type(p, AST_Seq) and p.car is node
                or is_node_type(p, AST_BaseCall) and p.expression is node
                or is_node_type(p, AST_Dot) and p.expression is node
                or is_node_type(p, AST_Sub) and p.expression is node
                or is_node_type(p, AST_ItemAccess) and p.expression is node
                or is_node_type(p, AST_Conditional) and p.condition is node
                or is_node_type(p, AST_Binary) and p.left is node):
            node = p
            i -= 1
            p = a[i]
        else:
            return False


def declare_vars(vars, output):
    # declare all variables as local, unless explictly set otherwise
    if vars.length:
        output.indent()
        output.print("var")
        output.space()
        for i, arg in enumerate(vars):
            if i:
                output.comma()

            arg.print(output)
        output.semicolon()
        output.newline()


def display_body(body, is_toplevel, output):
    last = body.length - 1
    for i, stmt in enumerate(body):
        if not (is_node_type(stmt, AST_EmptyStatement)) and not (is_node_type(
                stmt, AST_Definitions)):
            output.indent()
            stmt.print(output)
            if not (i is last and is_toplevel):
                output.newline()


def display_complex_body(node, is_toplevel, output, function_preamble):
    offset = 0
    # argument offset
    # this is a method, add 'var self = this'
    if (
        is_node_type(node, AST_Method)
        and not node.static
        and node.argnames.length
    ):
        output.indent()
        output.print("var")
        output.space()
        output.assign(node.argnames[0])
        output.print("this")
        output.semicolon()
        output.newline()
        offset += 1

    if is_node_type(node, AST_Scope):
        function_preamble(node, output, offset)
        declare_vars(node.localvars, output)

    elif is_node_type(node, AST_Except):
        if node.argname:
            output.indent()
            output.print("var")
            output.space()
            output.assign(node.argname)
            output.print("ρσ_Exception")
            output.semicolon()
            output.newline()
            output.indent()
            output.print('try')
            output.space()

            def handler_body():
                display_body(node.body, is_toplevel, output)

            output.with_block(handler_body)
            output.space()
            output.print('finally')
            output.space()

            def clear_exception_target():
                output.indent()
                output.assign(node.argname)
                output.print('void 0')
                output.end_statement()

            output.with_block(clear_exception_target)
            return

    display_body(node.body, is_toplevel, output)


def display_lambda_body(node, output, function_preamble):
    if function_preamble is not None:
        function_preamble(node, output, 0)
    output.indent()
    output.print("return ")
    if (
        output.options.python_tuples
        and is_node_type(node.body, AST_Seq)
    ):
        output.print('ρσ_math_tuple([')
        node.body.print(output)
        output.print('])')
    else:
        node.body.print(output)
    output.print(";")


def print_bracketed(node, output, complex, function_preamble, before, after):
    if node.body.length > 0 or node.is_lambda:

        def f():
            if before:
                before(output)
            if node.is_lambda:
                display_lambda_body(node, output,
                                    function_preamble if complex else None)
            elif complex:
                display_complex_body(node, False, output, function_preamble)
            else:
                display_body(node.body, False, output)
            if after:
                after(output)

        output.with_block(f)
    else:
        if before or after:

            def f():
                if before:
                    before(output)
                if after:
                    after(output)

            output.with_block(f)
        else:
            output.print("{}")


def print_await_expression(output, print_expression):
    """Emit generator-based ``await`` around an expression."""
    output.print(
        '(yield* (function* () {'
        'try { '
        'var ρσ_await_iterator = ρσ_yield_from_impl('
    )
    print_expression()
    output.print(
        ');'
        'ρσ_await_iterator.throw = '
        'ρσ_await_iterator.__native_throw__;'
        'return yield* ρσ_await_iterator;'
        '} catch (ρσ_await_error) {'
        'if (ρσ_await_error instanceof ρσ_yield_from_return) '
        'return ρσ_await_error.value;'
        'throw ρσ_await_error;'
        '} })())'
    )


def print_with(self, output):
    exits = []
    output.assign('ρσ_with_exception'), output.print(
        'undefined'), output.end_statement()
    for clause in self.clauses:
        output.with_counter += 1
        clause_name = 'ρσ_with_clause_' + output.with_counter
        exits.push(clause_name)
        output.indent(), output.print('var '), output.assign(clause_name)
        clause.expression.print(output)
        output.end_statement()
        output.indent()
        if clause.alias:
            output.assign(clause.alias.name)
        method_name = '__aenter__' if self.is_async else '__enter__'
        if self.is_async:
            print_await_expression(
                output,
                lambda: output.print(
                    clause_name + '.' + method_name + '()'
                ),
            )
        else:
            output.print(clause_name + '.' + method_name + '()')
        output.end_statement()
    output.indent(), output.print('try'), output.space()

    def f_body():
        output.indent()
        self._do_print_body(output)
        output.newline()

    output.with_block(f_body)

    output.space(), output.print('catch(e)')

    def f_with():
        output.indent()
        output.assign('ρσ_with_exception')
        output.print('e')
        output.end_statement()

    output.with_block(f_with)

    def f_exit():
        for clause in reversed(exits):
            output.indent()
            if self.is_async:
                print_await_expression(
                    output,
                    lambda: output.print(
                        clause + '.__aexit__(null, null, null)'
                    ),
                )
            else:
                output.print(
                    clause + '.__exit__(null, null, null)')
            output.end_statement()

    def f_suppress():
        output.indent(), output.assign('ρσ_with_suppress'), output.print(
            'false'), output.end_statement()
        for clause in reversed(exits):
            output.indent()
            output.print('ρσ_with_suppress |= ρσ_bool(')
            if self.is_async:
                print_await_expression(
                    output,
                    lambda: output.print(
                        clause
                        + '.__aexit__('
                        + 'ρσ_with_exception.constructor, '
                        + 'ρσ_with_exception, '
                        + 'ρσ_with_exception.stack)'
                    ),
                )
            else:
                output.print(
                    clause
                    + '.__exit__(ρσ_with_exception.constructor, '
                    + 'ρσ_with_exception, '
                    + 'ρσ_with_exception.stack)'
                )
            output.print(')')
            output.end_statement()
        output.indent(), output.spaced(
            'if', '(!ρσ_with_suppress)',
            'throw ρσ_with_exception'), output.end_statement()

    def f_cleanup():
        output.indent(), output.spaced(
            'if', '(ρσ_with_exception', '===', 'undefined)')
        output.with_block(f_exit)
        output.space(), output.print('else'), output.space()
        output.with_block(f_suppress)

    output.newline(), output.indent(), output.print('finally'), output.space()
    output.with_block(f_cleanup)


def print_assert(self, output):
    if output.options.discard_asserts:
        return
    output.spaced('if', '(!(')
    output.print_truth_test(self.condition)
    output.spaced('))', 'throw new AssertionError')
    if self.message:
        output.print('(')
        self.message.print(output)
        output.print(')')
    output.end_statement()
