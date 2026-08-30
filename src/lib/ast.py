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
                self.__class__.__name__
                + " constructor takes at most "
                + str(len(self._fields))
                + " positional arguments"
            )
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
    _fields = ("body", "type_ignores")
    __match_args__ = _fields


class Expression(AST):
    _fields = ("body",)
    __match_args__ = _fields


class FunctionDef(stmt):
    _fields = (
        "name",
        "args",
        "body",
        "decorator_list",
        "returns",
        "type_comment",
        "type_params",
    )
    __match_args__ = _fields


class AsyncFunctionDef(FunctionDef):
    pass


class ClassDef(stmt):
    _fields = ("name", "bases", "keywords", "body", "decorator_list", "type_params")
    __match_args__ = _fields


class ExceptHandler(AST):
    _fields = ("type", "name", "body")
    __match_args__ = _fields


class Assert(stmt):
    _fields = ("test", "msg")
    __match_args__ = _fields


class Assign(stmt):
    _fields = ("targets", "value", "type_comment")
    __match_args__ = _fields


class Expr(stmt):
    _fields = ("value",)
    __match_args__ = _fields


class If(stmt):
    _fields = ("test", "body", "orelse")
    __match_args__ = _fields


class Import(stmt):
    _fields = ("names",)
    __match_args__ = _fields


class ImportFrom(stmt):
    _fields = ("module", "names", "level")
    __match_args__ = _fields


class Raise(stmt):
    _fields = ("exc", "cause")
    __match_args__ = _fields


class BoolOp(expr):
    _fields = ("op", "values")
    __match_args__ = _fields


class BinOp(expr):
    _fields = ("left", "op", "right")
    __match_args__ = _fields


class UnaryOp(expr):
    _fields = ("op", "operand")
    __match_args__ = _fields


class NamedExpr(expr):
    _fields = ("target", "value")
    __match_args__ = _fields


class IfExp(expr):
    _fields = ("test", "body", "orelse")
    __match_args__ = _fields


class Dict(expr):
    _fields = ("keys", "values")
    __match_args__ = _fields


class List(expr):
    _fields = ("elts", "ctx")
    __match_args__ = _fields


class Set(expr):
    _fields = ("elts",)
    __match_args__ = _fields


class Tuple(expr):
    _fields = ("elts", "ctx")
    __match_args__ = _fields


class Constant(expr):
    _fields = ("value", "kind")
    __match_args__ = _fields


class Name(expr):
    _fields = ("id", "ctx")
    __match_args__ = _fields


class Attribute(expr):
    _fields = ("value", "attr", "ctx")
    __match_args__ = _fields


class Starred(expr):
    _fields = ("value", "ctx")
    __match_args__ = _fields


class Call(expr):
    _fields = ("func", "args", "keywords")
    __match_args__ = _fields


class Compare(expr):
    _fields = ("left", "ops", "comparators")
    __match_args__ = _fields


class alias(AST):
    _fields = ("name", "asname")
    __match_args__ = _fields


class keyword(AST):
    _fields = ("arg", "value")
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
        visitor = getattr(self, "visit_" + node.__class__.__name__, self.generic_visit)
        return visitor(node)

    def generic_visit(self, node):
        for child in iter_child_nodes(node):
            self.visit(child)


def copy_location(new_node, old_node):
    for name in ("lineno", "col_offset", "end_lineno", "end_col_offset"):
        if hasattr(old_node, name):
            setattr(new_node, name, getattr(old_node, name))
    return new_node


def fix_missing_locations(node):
    def fill(current, lineno=1, col_offset=0):
        if not hasattr(current, "lineno"):
            current.lineno = lineno
        if not hasattr(current, "col_offset"):
            current.col_offset = col_offset
        if not hasattr(current, "end_lineno"):
            current.end_lineno = current.lineno
        if not hasattr(current, "end_col_offset"):
            current.end_col_offset = current.col_offset
        for child in iter_child_nodes(current):
            fill(child, current.lineno, current.col_offset)

    fill(node)
    return node


def parse(
    source,
    filename="<unknown>",
    mode="exec",
    *,
    type_comments=False,
    feature_version=None,
    optimize=-1,
):
    """Return a location-bearing statement tree for source inspection.

    This intentionally does not promise CPython compiler nodes.  It supplies
    the statement boundaries consumed by traceback and test-reporting tools.
    Assertion rewriting must use `--assert=plain` in this compatibility
    phase.
    """
    del filename, type_comments, feature_version, optimize
    if mode == "eval":
        return Expression(Constant(source))
    if mode not in ("exec", "single", "func_type"):
        raise ValueError("compile() mode must be exec, eval, single or func_type")
    body = []
    for lineno, line in enumerate(source.splitlines(), 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
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


class _LiteralParser:
    """Parse the deliberately small expression grammar accepted by `literal_eval`."""

    def __init__(self, source):
        self.source = source
        self.index = 0
        self.length = len(source)

    def malformed(self):
        raise ValueError("malformed node or string: " + repr(self.source))

    def skip_space(self):
        while self.index < self.length:
            current = self.source[self.index]
            if current.isspace():
                self.index += 1
                continue
            if current == "#":
                newline = self.source.find("\n", self.index)
                self.index = self.length if newline < 0 else newline + 1
                continue
            break

    def consume(self, token):
        self.skip_space()
        if self.source.startswith(token, self.index):
            self.index += len(token)
            return True
        return False

    def expect(self, token):
        if not self.consume(token):
            self.malformed()

    def identifier(self):
        self.skip_space()
        start = self.index
        if start >= self.length:
            return None
        first = self.source[start]
        if not (first.isalpha() or first == "_"):
            return None
        self.index += 1
        while self.index < self.length:
            current = self.source[self.index]
            if not (current.isalpha() or current.isdigit() or current == "_"):
                break
            self.index += 1
        return self.source[start : self.index]

    def starts_string(self):
        self.skip_space()
        position = self.index
        while position < self.length and self.source[position].isalpha():
            position += 1
            if position - self.index > 2:
                return False
        prefix = self.source[self.index : position].lower()
        return (
            prefix in ("", "r", "u", "b", "br", "rb")
            and position < self.length
            and self.source[position] in ("'", '"')
        )

    def string(self):
        self.skip_space()
        start = self.index
        while self.index < self.length and self.source[self.index].isalpha():
            self.index += 1
        prefix = self.source[start : self.index].lower()
        if prefix not in ("", "r", "u", "b", "br", "rb"):
            self.malformed()
        if self.index >= self.length or self.source[self.index] not in ("'", '"'):
            self.malformed()
        quote = self.source[self.index]
        triple = self.source.startswith(quote * 3, self.index)
        delimiter = quote * (3 if triple else 1)
        self.index += len(delimiter)
        content_start = self.index
        while self.index < self.length:
            if self.source.startswith(delimiter, self.index):
                content = self.source[content_start : self.index]
                self.index += len(delimiter)
                return self.decode_string(content, prefix)
            if self.source[self.index] == "\\":
                self.index += 2
            else:
                self.index += 1
        self.malformed()

    def decode_string(self, content, prefix):
        raw = "r" in prefix
        binary = "b" in prefix
        if raw:
            if binary:
                return bytes(ord(current) for current in content)
            return content
        simple = {
            "\\": "\\",
            "'": "'",
            '"': '"',
            "a": "\a",
            "b": "\b",
            "f": "\f",
            "n": "\n",
            "r": "\r",
            "t": "\t",
            "v": "\v",
        }
        answer = []
        position = 0
        while position < len(content):
            current = content[position]
            if current != "\\":
                answer.append(ord(current) if binary else current)
                position += 1
                continue
            if position + 1 >= len(content):
                self.malformed()
            escaped = content[position + 1]
            if escaped in ("\n", "\r"):
                position += 2
                if (
                    escaped == "\r"
                    and position < len(content)
                    and content[position] == "\n"
                ):
                    position += 1
                continue
            if escaped in simple:
                value = simple[escaped]
                answer.append(ord(value) if binary else value)
                position += 2
                continue
            if escaped in "01234567":
                end = position + 2
                while (
                    end < min(position + 4, len(content)) and content[end] in "01234567"
                ):
                    end += 1
                value = int(content[position + 1 : end], 8)
                answer.append(value if binary else chr(value))
                position = end
                continue
            if escaped == "x":
                digits = content[position + 2 : position + 4]
                if len(digits) != 2 or any(
                    digit not in "0123456789abcdefABCDEF" for digit in digits
                ):
                    self.malformed()
                value = int(digits, 16)
                answer.append(value if binary else chr(value))
                position += 4
                continue
            if not binary and escaped in ("u", "U"):
                count = 4 if escaped == "u" else 8
                digits = content[position + 2 : position + 2 + count]
                if len(digits) != count or any(
                    digit not in "0123456789abcdefABCDEF" for digit in digits
                ):
                    self.malformed()
                answer.append(chr(int(digits, 16)))
                position += 2 + count
                continue
            if not binary and escaped == "N" and content.startswith("{", position + 2):
                closing = content.find("}", position + 3)
                if closing < 0:
                    self.malformed()
                from unicodedata import lookup

                answer.append(lookup(content[position + 3 : closing]))
                position = closing + 1
                continue
            answer.append(ord("\\") if binary else "\\")
            answer.append(ord(escaped) if binary else escaped)
            position += 2
        return bytes(answer) if binary else "".join(answer)

    def number(self):
        self.skip_space()
        start = self.index
        if start >= self.length:
            return None
        current = self.source[start]
        if not (
            current.isdigit()
            or (
                current == "."
                and start + 1 < self.length
                and self.source[start + 1].isdigit()
            )
        ):
            return None
        self.index += 1
        while self.index < self.length:
            current = self.source[self.index]
            previous = self.source[self.index - 1]
            if current.isalpha() or current.isdigit() or current in ("_", "."):
                self.index += 1
            elif current in ("+", "-") and previous in ("e", "E"):
                self.index += 1
            else:
                break
        token = self.source[start : self.index].replace("_", "")
        imaginary = token[-1:] in ("j", "J")
        if imaginary:
            token = token[:-1]
        try:
            if token.lower().startswith(("0x", "0o", "0b")):
                value = int(token, 0)
            elif any(marker in token for marker in (".", "e", "E")):
                value = float(token)
            else:
                value = int(token, 10)
        except Exception:
            self.malformed()
        return complex(0, value) if imaginary else value

    def sequence(self, closing, factory):
        values = []
        self.skip_space()
        if self.consume(closing):
            return factory(values)
        while True:
            values.append(self.value())
            if self.consume(closing):
                return factory(values)
            self.expect(",")
            if self.consume(closing):
                return factory(values)

    def parenthesized(self):
        self.expect("(")
        self.skip_space()
        if self.consume(")"):
            return ()
        first = self.value()
        if self.consume(")"):
            return first
        self.expect(",")
        values = [first]
        if self.consume(")"):
            return tuple(values)
        while True:
            values.append(self.value())
            if self.consume(")"):
                return tuple(values)
            self.expect(",")
            if self.consume(")"):
                return tuple(values)

    def mapping_or_set(self):
        self.expect("{")
        if self.consume("}"):
            return {}
        first = self.value()
        if self.consume(":"):
            answer = {first: self.value()}
            while not self.consume("}"):
                self.expect(",")
                if self.consume("}"):
                    return answer
                key = self.value()
                self.expect(":")
                answer[key] = self.value()
            return answer
        answer = {first}
        while not self.consume("}"):
            self.expect(",")
            if self.consume("}"):
                return answer
            answer.add(self.value())
        return answer

    def atom(self):
        self.skip_space()
        if self.starts_string():
            result = self.string()
            while self.starts_string():
                result += self.string()
            return result
        if self.source.startswith("...", self.index):
            self.index += 3
            return Ellipsis
        if self.consume("["):
            return self.sequence("]", list)
        if self.source.startswith("(", self.index):
            return self.parenthesized()
        if self.source.startswith("{", self.index):
            return self.mapping_or_set()
        number = self.number()
        if number is not None:
            return number
        name = self.identifier()
        if name == "None":
            return None
        if name == "True":
            return True
        if name == "False":
            return False
        if name == "set":
            self.expect("(")
            self.expect(")")
            return set()
        self.malformed()

    def value(self):
        self.skip_space()
        sign = None
        if self.consume("+"):
            sign = 1
        elif self.consume("-"):
            sign = -1
        left = self.atom()
        if sign is not None:
            if type(left) not in (int, float, complex):
                self.malformed()
            left = +left if sign > 0 else -left
        self.skip_space()
        if self.index < self.length and self.source[self.index] in ("+", "-"):
            operation = self.source[self.index]
            self.index += 1
            right = self.number()
            if type(left) not in (int, float) or type(right) is not complex:
                self.malformed()
            return left + right if operation == "+" else left - right
        return left

    def parse(self):
        result = self.value()
        self.skip_space()
        if self.index != self.length:
            self.malformed()
        return result


def _literal_eval_node(node):
    def malformed(value):
        message = "malformed node or string"
        if getattr(value, "lineno", None):
            message += " on line " + str(value.lineno)
        raise ValueError(message + ": " + repr(value))

    def number(value):
        if not isinstance(value, Constant) or type(value.value) not in (
            int,
            float,
            complex,
        ):
            malformed(value)
        return value.value

    def signed_number(value):
        if isinstance(value, UnaryOp) and isinstance(value.op, (UAdd, USub)):
            operand = number(value.operand)
            return +operand if isinstance(value.op, UAdd) else -operand
        return number(value)

    def convert(value):
        if isinstance(value, Constant):
            return value.value
        if isinstance(value, Tuple):
            return tuple(convert(item) for item in value.elts)
        if isinstance(value, List):
            return [convert(item) for item in value.elts]
        if isinstance(value, Set):
            return {convert(item) for item in value.elts}
        if (
            isinstance(value, Call)
            and isinstance(value.func, Name)
            and value.func.id == "set"
            and value.args == value.keywords == []
        ):
            return set()
        if isinstance(value, Dict):
            if len(value.keys) != len(value.values):
                malformed(value)
            return dict(
                zip(
                    (convert(key) for key in value.keys),
                    (convert(item) for item in value.values),
                )
            )
        if isinstance(value, BinOp) and isinstance(value.op, (Add, Sub)):
            left = signed_number(value.left)
            right = number(value.right)
            if type(left) in (int, float) and type(right) is complex:
                return left + right if isinstance(value.op, Add) else left - right
        return signed_number(value)

    return convert(node)


def literal_eval(node_or_string):
    """Safely evaluate a Python literal expression.

    Accepted input matches CPython's literal structures: strings, bytes,
    numbers, tuples, lists, dictionaries, sets, booleans, `None`, and
    `Ellipsis`. Arbitrary names, calls, attributes and comprehensions are
    rejected without executing them.
    """
    if isinstance(node_or_string, str):
        source = node_or_string.lstrip(" \t")
        compile(source, "<unknown>", "eval")
        return _LiteralParser(source).parse()
    if isinstance(node_or_string, Expression):
        node_or_string = node_or_string.body
    if isinstance(node_or_string, AST):
        return _literal_eval_node(node_or_string)
    raise ValueError("malformed node or string: " + repr(node_or_string))
