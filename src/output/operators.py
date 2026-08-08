# vim:fileencoding=utf-8
# License: BSD Copyright: 2016, Kovid Goyal <kovid at kovidgoyal.net>
from __python__ import hash_literals
from ast_types import (AST_Array, AST_Assign, AST_BaseCall, AST_Binary,
                       AST_Conditional, AST_Dot, AST_Existential, AST_ForIn, AST_ItemAccess, AST_Number,
                       AST_Object, AST_Return, AST_Scope, AST_Seq, AST_Set,
                       AST_SimpleStatement, AST_Splice, AST_Statement, AST_String, AST_Sub,
                       AST_Symbol, AST_SymbolRef, AST_Unary,
                       is_node_type)
from output.loops import print_target_assignment, unpack_tuple


def print_getattr(self, output, skip_expression):  # AST_Dot
    def is_native_attribute_chain(expression):
        while is_node_type(expression, AST_Dot):
            expression = expression.expression
        if not (
            is_node_type(expression, AST_SymbolRef)
            and expression.name in (
                'Array', 'BigInt', 'JSON', 'Map', 'Math', 'Number',
                'Object', 'Proxy', 'PyLang', 'Reflect', 'RegExp',
                'Set', 'String', 'Symbol', 'console'
            )
        ):
            return False

        # These names denote JavaScript namespaces only while they remain
        # unbound in Python.  Libraries are free to bind names such as
        # ``Number`` (Pygments does so for its token hierarchy), at which
        # point every attribute access must use normal Python dispatch.
        for index in range(output.stack().length - 1, -1, -1):
            scope = output.stack()[index]
            if not is_node_type(scope, AST_Scope):
                continue
            for name in scope.scope_bindings or []:
                if expression.name is name:
                    return False
            for symbol in scope.localvars or []:
                if expression.name is symbol.name:
                    return False
            for symbol in scope.exports or []:
                if expression.name is symbol.name:
                    return False
        return True

    assignment_target = False
    stack = output.stack()
    for index in range(stack.length):
        ancestor = stack[index]
        if not is_node_type(ancestor, AST_Assign):
            continue
        # Only the outermost dot is the storage target.  In
        # ``obj.child.value = x``, ``obj.child`` is an ordinary attribute
        # read and must still raise AttributeError (or run a descriptor)
        # before setattr handles ``value``.
        if ancestor.left is self:
            assignment_target = True
            break
        if ancestor.is_chained():
            left_hand_sides, _rhs = ancestor.traverse_chain()
            for lhs in left_hand_sides:
                if lhs is self:
                    assignment_target = True
                    break
            if assignment_target:
                break
    if (
        output.options.python_attributes
        and not skip_expression
        and not assignment_target
        # Sage.js's legacy existential access ``value?.name`` is lowered to
        # a conditional expression whose fallback deliberately has no
        # attributes.  It must retain JavaScript's optional-access result
        # instead of raising Python's AttributeError.
        and not is_node_type(self.expression, AST_Existential)
        and not self.property.startswith('ρσ_')
        and '.' not in self.property
        and not is_native_attribute_chain(self)
    ):
        output.print('ρσ_getattr_internal(')
        self.expression.print(output)
        output.comma()
        output.print(JSON.stringify(self.property))
        output.comma()
        output.print('ρσ_getattr_missing')
        output.print(')')
        return
    expr = self.expression
    if not skip_expression:
        expr.print(output)
    if is_node_type(expr, AST_Number) and expr.value >= 0:
        if not RegExp("[xa-f.]", "i").test(output.last()):
            output.print(".")
    output.print(".")
    # the name after dot would be mapped about here.
    output.print_name(self.property)


def print_getitem(self, output):  # AST_Sub
    expr = self.expression
    prop = self.property
    if self.native_access:
        expr.print(output)
        output.print('['), prop.print(output), output.print(']')
        return
    if (is_node_type(prop, AST_Number) or is_node_type(prop, AST_String)) or (
            is_node_type(prop, AST_SymbolRef) and prop.name
            and prop.name.startsWith('ρσ_')):
        expr.print(output)
        output.print('['), prop.print(output), output.print(']')
        return
    is_negative_number = is_node_type(
        prop, AST_Unary) and prop.operator is "-" and is_node_type(
            prop.expression, AST_Number)
    is_repeatable = is_node_type(expr, AST_SymbolRef)
    if is_repeatable:
        expr.print(output)
    else:
        output.spaced('(ρσ_expr_temp', '=', expr), output.print(')')
        expr = {'print': lambda: output.print('ρσ_expr_temp')}

    if is_negative_number:
        output.print('['), expr.print(output), output.print(
            '.length-'), prop.expression.print(output), output.print(']')
        return
    is_repeatable = is_node_type(prop, AST_SymbolRef)
    # We have to check the type of the property because if it is a Symbol, it
    # will raise a TypeError with the < operator.
    if is_repeatable:
        output.spaced('[(typeof', prop, '===', '"number"', '&&', prop)
        output.spaced('', '<', '0)', '?',
                      expr), output.spaced('.length', '+', prop, ':', prop)
        output.print("]")
    else:
        output.print('[ρσ_bound_index('), prop.print(
            output), output.comma(), expr.print(output), output.print(')]')


def print_rich_getitem(self, output):  # AST_ItemAccess
    func = 'ρσ_' + ('setitem' if self.assignment else 'getitem')
    output.print(func + '(')
    self.expression.print(output), output.comma(), self.property.print(output)
    if self.assignment:
        output.comma(), self.assignment.print(output)
    output.print(')')


def print_splice_assignment(self, output):  # AST_Splice
    # splice assignment via pythonic array[start:end]
    output.print('ρσ_splice(')
    self.expression.print(output), output.comma(), self.assignment.print(
        output), output.comma()
    self.property.print(output) if self.property else output.print('0')
    if self.property2:
        output.comma()
        self.property2.print(output)
    output.print(')')


def print_delete(self, output):
    if is_node_type(self, AST_Seq) or is_node_type(self, AST_Array):
        values = self.to_array() if is_node_type(
            self, AST_Seq) else self.flatten()

        def print_values():
            for index, value in enumerate(values):
                print_delete(value, output)
                if index + 1 < len(values):
                    output.comma()

        output.with_parens(print_values)
    elif is_node_type(self, AST_Symbol):
        output.assign(self)
        output.print('ρσ_delete_name(')
        self.print(output)
        output.comma()
        output.print(JSON.stringify(self.name))
        output.print(')')
    elif (
        is_node_type(self, AST_Dot)
        and output.options.python_attributes
    ):
        output.print('ρσ_delattr(')
        self.expression.print(output)
        output.comma()
        output.print(JSON.stringify(self.property))
        output.print(')')
    elif is_node_type(self, AST_Sub) or is_node_type(self, AST_ItemAccess):
        output.print('ρσ_delitem('), self.expression.print(
            output), output.comma(), self.property.print(output), output.print(
                ')')
    else:
        output.spaced('delete', self)


# def print_unary_prefix(self, output):
#     op = self.operator
#     if op is 'delete':
#         return print_delete(self.expression, output)
#     if op is '-':
#         output.print("ρσ_operator_neg(")
#     else:
#         output.print(op)
#     if RegExp("^[a-z]", "i").test(op):
#         output.space()
#     if self.parenthesized:
#         output.with_parens(lambda: self.expression.print(output))
#     else:
#         self.expression.print(output)
#     if op is '-':
#         output.print(")")

def print_unary_prefix(self, output):
    op = self.operator
    if op is 'delete':
        return print_delete(self.expression, output)
    if op is '!' and output.options.python_truthiness:
        output.print('!')
        output.print_truth_test(self.expression)
        return
    if (
        (op is '-' or op is '+' or op is '~')
        and not self.native_operator
    ):
        output.print(
            "ρσ_operator_neg("
            if op is '-'
            else (
                "ρσ_operator_pos("
                if op is '+'
                else "ρσ_operator_invert("
            )
        )
    else:
        output.print(op)
    if RegExp("^[a-z]", "i").test(op):
        output.space()
    if self.parenthesized:
        output.with_parens(lambda: self.expression.print(output))
    else:
        self.expression.print(output)
    if (
        (op is '-' or op is '+' or op is '~')
        and not self.native_operator
    ):
        output.print(")")

def write_instanceof(left, right, output):
    def do_many(vals):
        output.print('ρσ_instanceof.apply(null,'), output.space()
        output.print('['), left.print(output), output.comma()
        for i in range(len(vals)):
            vals[i].print(output)
            if i is not vals.length - 1:
                output.comma()
        output.print('])')

    if is_node_type(right, AST_Seq):
        do_many(right.to_array())
    elif is_node_type(right, AST_Array):
        do_many(right.elements)
    else:
        output.print('ρσ_instanceof_one(')
        left.print(output), output.comma(), right.print(output), output.print(
            ')')


def write_smart_equality(self, output):
    def is_ok(x):
        return not (
            is_node_type(x, AST_Array) or is_node_type(x, AST_Set)
            or is_node_type(x, AST_Object) or is_node_type(x, AST_Statement)
            or is_node_type(x, AST_Binary) or is_node_type(x, AST_Conditional)
            or is_node_type(x, AST_BaseCall) or is_node_type(x, AST_SymbolRef))

    if is_ok(self.left) and is_ok(self.right):
        if self.operator is '==':
            output.print('(')
            output.spaced(self.left, '===', self.right, '||', 'ρσ_equals(')
            self.left.print(output), output.print(','), output.space(
            ), self.right.print(output), output.print('))')
        else:
            output.print('(')
            output.spaced(self.left, '!==', self.right, '&&', 'ρσ_not_equals(')
            self.left.print(output), output.print(','), output.space(
            ), self.right.print(output), output.print('))')
    else:
        output.print('ρσ_' +
                     ('equals(' if self.operator is '==' else 'not_equals('))
        self.left.print(output), output.print(
            ','), output.space(), self.right.print(output), output.print(')')


def is_native_typeof(node):
    return (
        is_node_type(node, AST_Unary)
        and node.operator is 'typeof'
    )


comparators = {
    "<": True,
    ">": True,
    "<=": True,
    ">=": True,
    "==": True,
    "!=": True,
    "===": True,
    "!==": True,
    "in": True,
    "nin": True,
}

function_ops = {
    "in": "ρσ_in",
    'nin': '!ρσ_in',
}

def print_arithmetic_call(output, name):
    suffix = '_exact(' if output.options.exact_integers else '('
    output.print(name + suffix)


def print_binary_op(self, output):
    if self.native_operator:
        output.spaced(self.left, self.operator, self.right)
    elif (
        output.options.python_truthiness
        and (self.operator is '&&' or self.operator is '||')
    ):
        output.print('(ρσ_cond_temp = ')
        self.left.print(output)
        output.print(', ')
        output.print_truth_test(
            AST_SymbolRef({'name': 'ρσ_cond_temp'}))
        output.print(' ? ')
        if self.operator is '&&':
            self.right.print(output)
        else:
            output.print('ρσ_cond_temp')
        output.print(' : ')
        if self.operator is '&&':
            output.print('ρσ_cond_temp')
        else:
            self.right.print(output)
        output.print(')')
    elif comparators[self.operator] and is_node_type(
            self.left, AST_Binary) and comparators[self.left.operator]:
        # Comparisons are represented as a left-associated binary tree.  A
        # pairwise rewrite works for ``a < b < c`` but accidentally compares
        # the boolean result of an inner chain once there are four or more
        # operands.  Flatten the entire tree and emit nested functions so that
        # every operand is evaluated exactly once, from left to right, and
        # later operands remain short-circuited as in Python.
        operands = [self.right]
        operators = [self.operator]
        cursor = self.left
        while (
            is_node_type(cursor, AST_Binary)
            and comparators[cursor.operator]
        ):
            operands.insert(0, cursor.right)
            operators.insert(0, cursor.operator)
            cursor = cursor.left
        operands.insert(0, cursor)

        def value_name(index):
            return 'ρσ_compare_' + str(index)

        def print_comparison(index):
            comparison = AST_Binary({
                'left': AST_SymbolRef({'name': value_name(index)}),
                'operator': operators[index],
                'right': AST_SymbolRef({'name': value_name(index + 1)}),
            })
            comparison.print(output)
            if index + 1 >= len(operators):
                return
            output.space()
            output.print('&&')
            output.space()
            output.print('(function(' + value_name(index + 2) +
                         ') { return ')
            print_comparison(index + 1)
            output.print('; })(')
            operands[index + 2].print(output)
            output.print(')')

        output.print('(function(' + value_name(0) + ', ' + value_name(1) +
                     ') { return ')
        print_comparison(0)
        output.print('; })(')
        operands[0].print(output)
        output.comma()
        operands[1].print(output)
        output.print(')')
    elif function_ops[self.operator]:
        output.print(function_ops[self.operator])

        def f_comma():
            self.left.print(output)
            output.comma()
            self.right.print(output)

        output.with_parens(f_comma)
    elif self.operator is '**':
        left = self.left
        if is_node_type(self.left, AST_Unary) and not self.left.parenthesized:
            left = self.left.expression
            output.print(self.left.operator)
        if output.options.exact_integers:
            helper = (
                'ρσ_operator_pow_exact'
                if output.options.rational_division
                else 'ρσ_operator_pow_python_exact'
            )
            output.print(helper + '(')
        else:
            output.print('ρσ_operator_pow(')
        left.print(output)
        output.comma()
        self.right.print(output)
        output.print(')')
    elif (
        (self.operator is '==' or self.operator is '!=')
        and (
            is_native_typeof(self.left)
            or is_native_typeof(self.right)
        )
    ):
        self.left.print(output)
        output.space()
        output.print('===' if self.operator is '==' else '!==')
        output.space()
        self.right.print(output)
    elif self.operator is '==' or self.operator is '!=':
        write_smart_equality(self, output)
    elif (
        output.options.python_truthiness
        and self.operator in ('<', '<=', '>', '>=')
    ):
        output.print(
            'ρσ_operator_' + {
                '<': 'lt',
                '<=': 'le',
                '>': 'gt',
                '>=': 'ge',
            }[self.operator] + '('
        )
        self.left.print(output)
        output.comma()
        self.right.print(output)
        output.print(')')
    elif self.operator is 'instanceof':
        write_instanceof(self.left, self.right, output)
    elif (
        self.operator is '*'
        and is_node_type(self.left, AST_String)
        and is_node_type(self.right, AST_Number)
        and self.right.value >= 0
        and self.right.value % 1 == 0
    ):
        self.left.print(output), output.print('.repeat('), self.right.print(
            output), output.print(')')
    elif self.operator is '===' or self.operator is '!==':
        nan_check = None
        if is_node_type(self.right, AST_Symbol) and self.right.name is 'NaN':
            nan_check = self.left
        if is_node_type(self.left, AST_Symbol) and self.left.name is 'NaN':
            nan_check = self.right
        if nan_check is not None:
            # We use the fact that NaN is the only object that is not equal to
            # itself
            output.spaced(nan_check,
                          '!==' if self.operator is '===' else '===',
                          nan_check)
        else:
            output.spaced(self.left, self.operator, self.right)
    elif self.operator is '+':
        print_arithmetic_call(output, 'ρσ_operator_add')
        self.left.print(output), output.comma(), self.right.print(
            output), output.print(')')
    elif self.operator is '-':
        print_arithmetic_call(output, 'ρσ_operator_sub')
        self.left.print(output), output.comma(), self.right.print(
            output), output.print(')')
    elif self.operator is '*':
        print_arithmetic_call(output, 'ρσ_operator_mul')
        self.left.print(output), output.comma(), self.right.print(
            output), output.print(')')
    elif self.operator is '/':
        suffix = (
            '_exact('
            if (
                output.options.exact_integers
                and output.options.rational_division
            )
            else '('
        )
        output.print('ρσ_operator_truediv' + suffix)
        self.left.print(output), output.comma(), self.right.print(
            output), output.print(')')
    elif self.operator is '%':
        output.print('ρσ_operator_mod('), self.left.print(
            output), output.comma(), self.right.print(output), output.print(
                ')')
    elif self.operator is '@':
        output.print('ρσ_operator_matmul('), self.left.print(
            output), output.comma(), self.right.print(output), output.print(
                ')')
    elif self.operator in {
        '&': 'bitand',
        '|': 'bitor',
        '^': 'bitxor',
        '<<': 'lshift',
        '>>': 'rshift',
    }:
        output.print(
            'ρσ_operator_' + {
                '&': 'bitand',
                '|': 'bitor',
                '^': 'bitxor',
                '<<': 'lshift',
                '>>': 'rshift',
            }[self.operator] + '('
        )
        self.left.print(output), output.comma(), self.right.print(
            output), output.print(')')
    elif self.operator is '//':
        output.print('ρσ_operator_floordiv('), self.left.print(
            output), output.comma(), self.right.print(output), output.print(
                ')')
    else:
        output.spaced(self.left, self.operator, self.right)


after_map = {'.': 'd', '(': 'c', '[': 'd', 'g': 'g', 'null': 'n'}


def print_existential(self, output):
    key = after_map[self.after] if self.after is None or jstype(
        self.after) is 'string' else 'e'
    if is_node_type(self.expression, AST_SymbolRef):
        if key is 'n':
            output.spaced('(typeof', self.expression, '!==', '"undefined"',
                          '&&', self.expression, '!==', 'null)')
            return
        if key is 'c':
            output.spaced('(typeof', self.expression, '===', '"function"', '?',
                          self.expression, ':',
                          '(function(){return undefined;}))')
            return
        after = self.after
        if key is 'd':
            after = 'Object.create(null)'
        elif key is 'g':
            after = '{__getitem__:function(){return undefined;}}'
        output.spaced('(typeof', self.expression, '!==', '"undefined"', '&&',
                      self.expression, '!==', 'null', '?', self.expression,
                      ':', after)
        output.print(')')
        return
    output.print('ρσ_exists.' + key + '(')
    self.expression.print(output)
    if key is 'e':
        output.comma(), self.after.print(output)
    output.print(')')


def print_assignment(self, output):
    def print_unpack_pattern(node):
        if is_node_type(node, AST_Seq):
            node = AST_Array({'elements': node.to_array()})
        if is_node_type(node, AST_Array):
            output.print('[')
            for index, element in enumerate(node.elements):
                if index:
                    output.comma()
                print_unpack_pattern(element)
            output.print(']')
        else:
            output.print('null')

    def print_unpack_source():
        sources = None
        if is_node_type(self.right, AST_Seq):
            sources = self.right.to_array()
        elif (
            is_node_type(self.right, AST_Array)
            and self.right.is_tuple
        ):
            sources = self.right.elements
        if sources is not None:
            output.print('[')
            for source_index, source in enumerate(sources):
                if source_index:
                    output.comma()
                source.print(output)
            output.print(']')
        else:
            self.right.print(output)

    flattened = False
    left = self.left
    if (
        self.operator is '='
        and (
            is_node_type(left, AST_ItemAccess)
            or is_node_type(left, AST_Splice)
        )
    ):
        print_target_assignment(
            left, output, lambda: self.right.print(output))
        return
    if (
        output.options.python_attributes
        and self.operator is '='
        and is_node_type(left, AST_Dot)
        and not left.property.startswith('ρσ_')
        and '.' not in left.property
    ):
        output.print('ρσ_setattr(')
        left.expression.print(output)
        output.comma()
        output.print(JSON.stringify(left.property))
        output.comma()
        self.right.print(output)
        output.print(')')
        return
    if is_node_type(left, AST_Seq):
        left = AST_Array({'elements': left.to_array()})
    if is_node_type(left, AST_Array):
        flat = left.flatten()
        flattened = flat.length > left.elements.length
        star_index = -1
        for index, element in enumerate(flat):
            if (
                is_node_type(element, AST_Unary)
                and element.operator is '*'
            ):
                if star_index is not -1:
                    raise SyntaxError(
                        'multiple starred expressions in assignment')
                star_index = index
        if star_index is not -1:
            trailing_count = flat.length - star_index - 1
            output.assign("ρσ_unpack")
            output.print("ρσ_unpack_starred(")
            output.print(star_index)
            output.comma()
            output.print(trailing_count)
            output.comma()
            print_unpack_source()
            output.print(")")
            output.end_statement()
            for index, element in enumerate(flat):
                output.indent()
                target = (
                    element.expression
                    if index is star_index
                    else element
                )
                def print_value():
                    if index is star_index:
                        output.print("ρσ_list_constructor(ρσ_unpack.slice(")
                        output.print(star_index)
                        output.comma()
                        output.print(
                            "ρσ_unpack.length - " + trailing_count)
                        output.print("))")
                    else:
                        output.print("ρσ_unpack")
                        if index < star_index:
                            output.with_square(lambda: output.print(index))
                        else:
                            trailing_index = flat.length - index
                            output.with_square(
                                lambda: output.print(
                                    "ρσ_unpack.length - " + trailing_index))

                print_target_assignment(target, output, print_value)
                if index < flat.length - 1:
                    output.semicolon()
                    output.newline()
            return
        output.print("ρσ_unpack")
    else:
        left.print(output)
    output.space()
    output.print(self.operator)
    output.space()
    if flattened:
        output.print('ρσ_unpack_nested(')
        print_unpack_pattern(left)
        output.comma()
        print_unpack_source()
        output.print(')')
    else:
        if is_node_type(left, AST_Array):
            print_unpack_source()
        else:
            self.right.print(output)
    if is_node_type(left, AST_Array):
        output.end_statement()
        output.assign('ρσ_unpack')
        output.print('ρσ_unpack_asarray(' +
                     flat.length), output.comma(), output.print(
                         'ρσ_unpack)')
        output.end_statement()
        unpack_tuple(flat, output, True)


def print_assign(self, output):
    if self.native_operator:
        output.spaced(self.left, self.operator, self.right)
        return
    arithmetic_compound_functions = {
        '+=': 'ρσ_operator_iadd',
        '-=': 'ρσ_operator_isub',
        '*=': 'ρσ_operator_imul',
        '**=': 'ρσ_operator_ipow',
        '/=': (
            'ρσ_operator_idiv'
            if output.options.rational_division
            else 'ρσ_operator_idiv_python'
        ),
    }
    compound_functions = {
        '//=': 'ρσ_operator_ifloordiv',
        '%=': 'ρσ_operator_imod',
        '@=': 'ρσ_operator_imatmul',
        '&=': 'ρσ_operator_ibitand',
        '|=': 'ρσ_operator_ibitor',
        '^=': 'ρσ_operator_ibitxor',
        '<<=': 'ρσ_operator_ilshift',
        '>>=': 'ρσ_operator_irshift',
    }
    if (
        output.options.python_attributes
        and is_node_type(self.left, AST_Dot)
        and not self.left.property.startswith('ρσ_')
        and '.' not in self.left.property
        and (
            self.operator in arithmetic_compound_functions
            or self.operator in compound_functions
        )
    ):
        # Augmented attribute assignment must invoke both halves of Python's
        # descriptor protocol.  Reusing the assignment-target AST as the read
        # side emits a raw JavaScript property access, which returns the
        # descriptor object itself for properties such as ``mp.prec``.
        # Capture the receiver once to preserve Python's evaluation order.
        output.print('(function(ρσ_attr_target) { return ρσ_setattr(')
        output.print('ρσ_attr_target')
        output.comma()
        output.print(JSON.stringify(self.left.property))
        output.comma()
        if self.operator in arithmetic_compound_functions:
            function_name = arithmetic_compound_functions[self.operator]
            print_arithmetic_call(output, function_name)
        else:
            function_name = compound_functions[self.operator]
            output.print(function_name + '(')
        output.print('ρσ_getattr_internal(ρσ_attr_target, ')
        output.print(JSON.stringify(self.left.property))
        output.comma()
        output.print('ρσ_getattr_missing')
        output.print(')')
        output.comma()
        self.right.print(output)
        output.print(')); })(')
        self.left.expression.print(output)
        output.print(')')
        return
    if (
        is_node_type(self.left, AST_ItemAccess)
        and (
            self.operator in arithmetic_compound_functions
            or self.operator in compound_functions
        )
    ):
        output.print('(')
        output.assign('ρσ_expr_temp')
        self.left.expression.print(output)
        output.comma()
        output.assign('ρσ_prop_temp')
        self.left.property.print(output)
        output.comma()
        output.print('ρσ_setitem(ρσ_expr_temp, ρσ_prop_temp, ')
        if self.operator in arithmetic_compound_functions:
            function_name = arithmetic_compound_functions[self.operator]
            print_arithmetic_call(output, function_name)
        else:
            function_name = compound_functions[self.operator]
            output.print(function_name + '(')
        output.print('ρσ_getitem(ρσ_expr_temp, ρσ_prop_temp)')
        output.comma()
        self.right.print(output)
        output.print('))')
        output.print(')')
        return
    if self.operator in arithmetic_compound_functions:
        output.assign(self.left)
        print_arithmetic_call(
            output, arithmetic_compound_functions[self.operator])
        self.left.print(output)
        output.comma()
        self.right.print(output)
        output.print(')')
        return
    if self.operator in compound_functions:
        output.assign(self.left)
        output.print(compound_functions[self.operator] + '(')
        self.left.print(output)
        output.comma()
        self.right.print(output)
        output.print(')')
        return
    if self.operator is '+=':
        output.assign(self.left)
        print_arithmetic_call(output, 'ρσ_operator_iadd')
        self.left.print(output), output.comma(), self.right.print(
            output), output.print(')')
        return
    if self.operator is '-=':
        output.assign(self.left)
        print_arithmetic_call(output, 'ρσ_operator_isub')
        self.left.print(output), output.comma(), self.right.print(
            output), output.print(')')
        return
    if self.operator is '*=':
        output.assign(self.left)
        print_arithmetic_call(output, 'ρσ_operator_imul')
        self.left.print(output), output.comma(), self.right.print(
            output), output.print(')')
        return
    if self.operator is '=' and self.is_chained():
        left_hand_sides, rhs = self.traverse_chain()
        is_compound_assign = False
        for lhs in left_hand_sides:
            # Attribute and item targets are observable assignments in Python:
            # descriptors and ``__setitem__`` hooks run from left to right.
            # JavaScript's native chained assignment runs right to left and
            # would also bypass our Python runtime hooks.
            if (
                is_node_type(lhs, AST_Seq)
                or is_node_type(lhs, AST_Array)
                or is_node_type(lhs, AST_Dot)
                or is_node_type(lhs, AST_ItemAccess)
            ):
                is_compound_assign = True
                break
        if is_compound_assign:
            temp_rhs = AST_SymbolRef({'name': 'ρσ_chain_assign_temp'})
            # An IIFE parameter gives us a genuinely local temporary without
            # teaching scope analysis about a compiler-generated symbol.  It
            # also guarantees that the right-hand side is evaluated once.
            output.print('(function(ρσ_chain_assign_temp)')
            output.space()

            def print_chain_body():
                for lhs in left_hand_sides:
                    output.indent()
                    print_assignment(
                        AST_Assign({
                            'left': lhs,
                            'right': temp_rhs,
                            'operator': self.operator
                        }), output)
                    output.end_statement()
                    output.newline()

            output.with_block(print_chain_body)
            output.print(')(')
            rhs.print(output)
            output.print(')')
        else:
            for lhs in left_hand_sides:
                # A chained assignment target is a write even though it is
                # no longer the literal ``left`` child of the outer AST node.
                # Mark it explicitly so annotated-but-unbound names do not
                # acquire a read check while being initialized.
                output.assign(lhs)
            rhs.print(output)
    else:
        print_assignment(self, output)


def print_conditional(self, output, condition, consequent, alternative):
    condition, consequent, alternative = self.condition, self.consequent, self.alternative
    output.with_parens(lambda: output.print_truth_test(condition))
    output.space()
    output.print("?")
    output.space()
    consequent.print(output)
    output.space()
    output.colon()
    alternative.print(output)


def print_seq(output):
    self = this
    p = output.parent()

    def print_seq0():
        self.car.print(output)
        if self.cdr:
            output.comma()
            if output.should_break():
                output.newline()
                output.indent()
            self.cdr.print(output)

    def print_tuple_items():
        for index, item in enumerate(self.to_array()):
            if index:
                output.comma()
            if is_node_type(item, AST_Unary) and item.operator is '*':
                output.print('...Array.from(ρσ_Iterable(')
                item.expression.print(output)
                output.print('))')
            else:
                item.print(output)

    # this will effectively convert tuples to arrays
    if (is_node_type(p, AST_Binary) or is_node_type(p, AST_Return)
            or is_node_type(p, AST_Array) or is_node_type(p, AST_BaseCall)
            or is_node_type(p, AST_Object)
            or (
                is_node_type(p, AST_ItemAccess)
                and p.assignment is self
            )
            or is_node_type(p, AST_SimpleStatement)
            or (
                output.options.python_tuples
                and p
                and (
                    p.constructor.name is 'AST_If'
                    or p.constructor.name is 'AST_Conditional'
                    or p.constructor.name is 'AST_While'
                    or p.constructor.name is 'AST_Do'
                    or p.constructor.name is 'AST_UnaryPrefix'
                    or p.constructor.name is 'AST_Assert'
                    or p.constructor.name is 'AST_ListComprehension'
                    or p.constructor.name is 'AST_DictComprehension'
                    or p.constructor.name is 'AST_SetComprehension'
                    or p.constructor.name is 'AST_GeneratorComprehension'
                )
            )
            or (
                is_node_type(p, AST_ForIn)
                and p.object is self
            )):
        if output.options.python_tuples:
            output.print('ρσ_math_tuple(')
        output.with_square(
            print_tuple_items if output.options.python_tuples else print_seq0)
        if output.options.python_tuples:
            output.print(')')
    else:
        print_seq0()
