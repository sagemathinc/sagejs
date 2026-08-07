"""Small, portable subset of CPython's :mod:`ast` interface.

Sage.js does not expose CPython's internal compiler AST.  This module provides
the public node model used by source-inspection tools such as pytest.  Plain
pytest assertions only require node construction, traversal, and approximate
statement locations; assertion rewriting remains an explicitly unsupported
later milestone.
"""


class AST:
    _fields = ()
    __match_args__ = ()

    def __init__(self, *args, **kwargs):
        if len(args) > len(self._fields):
            raise TypeError(
                self.__class__.__name__ + ' constructor takes at most '
                + str(len(self._fields)) + ' positional arguments')
        for name, value in zip(self._fields, args):
            setattr(self, name, value)
        for name, value in kwargs.items():
            setattr(self, name, value)


class stmt(AST):
    pass


class expr(AST):
    pass


class operator(AST):
    pass


class unaryop(AST):
    pass


class boolop(AST):
    pass


class cmpop(AST):
    pass


class expr_context(AST):
    pass


class Module(AST):
    _fields = ('body', 'type_ignores')
    __match_args__ = _fields


class Expression(AST):
    _fields = ('body',)
    __match_args__ = _fields


class FunctionDef(stmt):
    _fields = (
        'name', 'args', 'body', 'decorator_list', 'returns',
        'type_comment', 'type_params')
    __match_args__ = _fields


class AsyncFunctionDef(FunctionDef):
    pass


class ClassDef(stmt):
    _fields = (
        'name', 'bases', 'keywords', 'body', 'decorator_list', 'type_params')
    __match_args__ = _fields


class ExceptHandler(AST):
    _fields = ('type', 'name', 'body')
    __match_args__ = _fields


class Assert(stmt):
    _fields = ('test', 'msg')
    __match_args__ = _fields


class Assign(stmt):
    _fields = ('targets', 'value', 'type_comment')
    __match_args__ = _fields


class Expr(stmt):
    _fields = ('value',)
    __match_args__ = _fields


class If(stmt):
    _fields = ('test', 'body', 'orelse')
    __match_args__ = _fields


class Import(stmt):
    _fields = ('names',)
    __match_args__ = _fields


class ImportFrom(stmt):
    _fields = ('module', 'names', 'level')
    __match_args__ = _fields


class Raise(stmt):
    _fields = ('exc', 'cause')
    __match_args__ = _fields


class BoolOp(expr):
    _fields = ('op', 'values')
    __match_args__ = _fields


class BinOp(expr):
    _fields = ('left', 'op', 'right')
    __match_args__ = _fields


class UnaryOp(expr):
    _fields = ('op', 'operand')
    __match_args__ = _fields


class NamedExpr(expr):
    _fields = ('target', 'value')
    __match_args__ = _fields


class IfExp(expr):
    _fields = ('test', 'body', 'orelse')
    __match_args__ = _fields


class Dict(expr):
    _fields = ('keys', 'values')
    __match_args__ = _fields


class List(expr):
    _fields = ('elts', 'ctx')
    __match_args__ = _fields


class Tuple(expr):
    _fields = ('elts', 'ctx')
    __match_args__ = _fields


class Constant(expr):
    _fields = ('value', 'kind')
    __match_args__ = _fields


class Name(expr):
    _fields = ('id', 'ctx')
    __match_args__ = _fields


class Attribute(expr):
    _fields = ('value', 'attr', 'ctx')
    __match_args__ = _fields


class Starred(expr):
    _fields = ('value', 'ctx')
    __match_args__ = _fields


class Call(expr):
    _fields = ('func', 'args', 'keywords')
    __match_args__ = _fields


class Compare(expr):
    _fields = ('left', 'ops', 'comparators')
    __match_args__ = _fields


class alias(AST):
    _fields = ('name', 'asname')
    __match_args__ = _fields


class keyword(AST):
    _fields = ('arg', 'value')
    __match_args__ = _fields


class Load(expr_context):
    pass


class Store(expr_context):
    pass


class And(boolop):
    pass


class Or(boolop):
    pass


class Not(unaryop):
    pass


class Invert(unaryop):
    pass


class UAdd(unaryop):
    pass


class USub(unaryop):
    pass


class Add(operator):
    pass


class Sub(operator):
    pass


class Mult(operator):
    pass


class Div(operator):
    pass


class FloorDiv(operator):
    pass


class Mod(operator):
    pass


class Pow(operator):
    pass


class MatMult(operator):
    pass


class BitOr(operator):
    pass


class BitXor(operator):
    pass


class BitAnd(operator):
    pass


class LShift(operator):
    pass


class RShift(operator):
    pass


class Eq(cmpop):
    pass


class NotEq(cmpop):
    pass


class Lt(cmpop):
    pass


class LtE(cmpop):
    pass


class Gt(cmpop):
    pass


class GtE(cmpop):
    pass


class Is(cmpop):
    pass


class IsNot(cmpop):
    pass


class In(cmpop):
    pass


class NotIn(cmpop):
    pass


def iter_fields(node):
    for name in node._fields:
        if hasattr(node, name):
            yield name, getattr(node, name)


def iter_child_nodes(node):
    for _name, field in iter_fields(node):
        if isinstance(field, AST):
            yield field
        elif isinstance(field, (list, tuple)):
            for value in field:
                if isinstance(value, AST):
                    yield value


def walk(node):
    queue = [node]
    while queue:
        current = queue.pop(0)
        yield current
        queue.extend(iter_child_nodes(current))


class NodeVisitor:
    def visit(self, node):
        visitor = getattr(
            self, 'visit_' + node.__class__.__name__, self.generic_visit)
        return visitor(node)

    def generic_visit(self, node):
        for child in iter_child_nodes(node):
            self.visit(child)


def copy_location(new_node, old_node):
    for name in ('lineno', 'col_offset', 'end_lineno', 'end_col_offset'):
        if hasattr(old_node, name):
            setattr(new_node, name, getattr(old_node, name))
    return new_node


def fix_missing_locations(node):
    def fill(current, lineno=1, col_offset=0):
        if not hasattr(current, 'lineno'):
            current.lineno = lineno
        if not hasattr(current, 'col_offset'):
            current.col_offset = col_offset
        if not hasattr(current, 'end_lineno'):
            current.end_lineno = current.lineno
        if not hasattr(current, 'end_col_offset'):
            current.end_col_offset = current.col_offset
        for child in iter_child_nodes(current):
            fill(child, current.lineno, current.col_offset)
    fill(node)
    return node


def parse(source, filename='<unknown>', mode='exec', *, type_comments=False,
          feature_version=None, optimize=-1):
    """Return a location-bearing statement tree for source inspection.

    This intentionally does not promise CPython compiler nodes.  It supplies
    the statement boundaries consumed by traceback and test-reporting tools.
    Assertion rewriting must use ``--assert=plain`` in this compatibility
    phase.
    """
    del filename, type_comments, feature_version, optimize
    if mode == 'eval':
        return Expression(Constant(source))
    if mode not in ('exec', 'single', 'func_type'):
        raise ValueError('compile() mode must be exec, eval, single or func_type')
    body = []
    for lineno, line in enumerate(source.splitlines(), 1):
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        node = Expr(Constant(stripped))
        node.lineno = lineno
        node.col_offset = len(line) - len(line.lstrip())
        node.end_lineno = lineno
        node.end_col_offset = len(line)
        body.append(node)
    module = Module(body, [])
    module.lineno = 1
    module.col_offset = 0
    return module
