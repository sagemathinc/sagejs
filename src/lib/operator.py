"""Functions corresponding to Python's intrinsic operators."""

import builtins


__all__ = [
    "abs",
    "add",
    "and_",
    "attrgetter",
    "call",
    "concat",
    "contains",
    "countOf",
    "delitem",
    "eq",
    "floordiv",
    "ge",
    "getitem",
    "gt",
    "iadd",
    "iand",
    "iconcat",
    "ifloordiv",
    "ilshift",
    "imatmul",
    "imod",
    "imul",
    "index",
    "indexOf",
    "inv",
    "invert",
    "ior",
    "ipow",
    "irshift",
    "is_",
    "is_none",
    "is_not",
    "is_not_none",
    "isub",
    "itemgetter",
    "itruediv",
    "ixor",
    "le",
    "length_hint",
    "lshift",
    "lt",
    "matmul",
    "methodcaller",
    "mod",
    "mul",
    "ne",
    "neg",
    "not_",
    "or_",
    "pos",
    "pow",
    "rshift",
    "setitem",
    "sub",
    "truediv",
    "truth",
    "xor",
]


_missing = object()


def _type_name(value):
    try:
        name = type(value).__name__
    except AttributeError:
        rendered = repr(type(value))
        if rendered.startswith("<class '") and rendered.endswith("'>"):
            return rendered[8:-2].rsplit(".", 1)[-1]
        return rendered
    if name == "SageObject":
        return "object"
    if name.startswith("ρσ_"):
        return name[3:]
    return name


def lt(left, right):
    return left < right


def le(left, right):
    return left <= right


def eq(left, right):
    return left == right


def ne(left, right):
    return left != right


def ge(left, right):
    return left >= right


def gt(left, right):
    return left > right


def not_(value):
    return not value


def truth(value):
    return True if value else False


def is_(left, right):
    return left is right


def is_not(left, right):
    return left is not right


def is_none(value):
    return value is None


def is_not_none(value):
    return value is not None


def abs(value):
    return builtins.abs(value)


def add(left, right):
    return left + right


def and_(left, right):
    return left & right


def floordiv(left, right):
    return left // right


def index(value):
    if isinstance(value, int):
        return int(value)
    try:
        method = value.__index__
    except AttributeError:
        raise TypeError(
            "'" + _type_name(value) + "' object cannot be interpreted as an integer"
        )
    answer = method()
    if not isinstance(answer, int):
        raise TypeError("__index__ returned non-int (type " + _type_name(answer) + ")")
    return int(answer)


def inv(value):
    return ~value


invert = inv


def lshift(left, right):
    return left << right


def mod(left, right):
    return left % right


def mul(left, right):
    return left * right


def matmul(left, right):
    return left @ right


def neg(value):
    return -value


def or_(left, right):
    return left | right


def pos(value):
    return +value


def pow(left, right):
    return left**right


def rshift(left, right):
    return left >> right


def sub(left, right):
    return left - right


def truediv(left, right):
    return left / right


div = truediv


def xor(left, right):
    return left ^ right


def concat(left, right):
    if isinstance(left, (bool, int, float, complex)):
        raise TypeError("'" + type(left).__name__ + "' object can't be concatenated")
    return left + right


def contains(container, value):
    return value in container


def countOf(iterable, value):
    count = 0
    for item in iterable:
        if item is value or item == value:
            count += 1
    return count


def delitem(container, key):
    del container[key]


def getitem(container, key):
    return container[key]


def indexOf(iterable, value):
    for position, item in enumerate(iterable):
        if item is value or item == value:
            return position
    raise ValueError("sequence.index(x): x not in sequence")


def setitem(container, key, value):
    container[key] = value


def length_hint(value, fallback=_missing, **keywords):
    if keywords:
        name = next(iter(keywords))
        raise TypeError(
            "length_hint() got an unexpected keyword argument '" + name + "'"
        )
    if fallback is _missing:
        fallback = 0
    if not isinstance(fallback, int):
        raise TypeError(
            "'"
            + type(fallback).__name__
            + "' object cannot be interpreted as an integer"
        )
    if hasattr(value, "__len__"):
        return len(value)
    try:
        hint = getattr(value, "__length_hint__")
    except AttributeError:
        return fallback
    try:
        answer = hint()
    except TypeError:
        return fallback
    if answer is NotImplemented:
        return fallback
    if not isinstance(answer, int):
        raise TypeError("__length_hint__ must be integer, not " + type(answer).__name__)
    if answer < 0:
        raise ValueError("__length_hint__() should return >= 0")
    return answer


def call(function, *args, **keywords):
    return function(*args, **keywords)


class attrgetter:
    def __init__(self, attribute, *attributes):
        self._attributes = (attribute,) + attributes
        for name in self._attributes:
            if not isinstance(name, str):
                raise TypeError("attribute name must be a string")

    def _get(self, value, path):
        for name in path.split("."):
            value = getattr(value, name)
        return value

    def __call__(self, value):
        if len(self._attributes) == 1:
            return self._get(value, self._attributes[0])
        return tuple(self._get(value, path) for path in self._attributes)

    def __repr__(self):
        arguments = ", ".join(repr(value) for value in self._attributes)
        return "operator.attrgetter(" + arguments + ")"


class itemgetter:
    def __init__(self, item, *items):
        self._items = (item,) + items

    def __call__(self, value):
        if len(self._items) == 1:
            return value[self._items[0]]
        return tuple(value[item] for item in self._items)

    def __repr__(self):
        arguments = ", ".join(repr(value) for value in self._items)
        return "operator.itemgetter(" + arguments + ")"


class methodcaller:
    def __init__(self, name, *args, **keywords):
        if not isinstance(name, str):
            raise TypeError("method name must be a string")
        self._name = name
        self._args = args
        self._keywords = keywords

    def __call__(self, value):
        return getattr(value, self._name)(*self._args, **self._keywords)

    def __repr__(self):
        arguments = [repr(self._name)]
        arguments.extend(repr(value) for value in self._args)
        arguments.extend(
            name + "=" + repr(value) for name, value in self._keywords.items()
        )
        return "operator.methodcaller(" + ", ".join(arguments) + ")"


def iadd(left, right):
    left += right
    return left


def iand(left, right):
    left &= right
    return left


def iconcat(left, right):
    if isinstance(left, (bool, int, float, complex)):
        raise TypeError("'" + type(left).__name__ + "' object can't be concatenated")
    left += right
    return left


def ifloordiv(left, right):
    left //= right
    return left


def ilshift(left, right):
    left <<= right
    return left


def imatmul(left, right):
    left @= right
    return left


def imod(left, right):
    left %= right
    return left


def imul(left, right):
    left *= right
    return left


def ior(left, right):
    left |= right
    return left


def ipow(left, right):
    left **= right
    return left


def irshift(left, right):
    left >>= right
    return left


def isub(left, right):
    left -= right
    return left


def itruediv(left, right):
    left /= right
    return left


def ixor(left, right):
    left ^= right
    return left


__lt__ = lt
__le__ = le
__eq__ = eq
__ne__ = ne
__ge__ = ge
__gt__ = gt
__not__ = not_
__abs__ = abs
__add__ = add
__and__ = and_
__call__ = call
__floordiv__ = floordiv
__index__ = index
__inv__ = inv
__invert__ = invert
__lshift__ = lshift
__matmul__ = matmul
__mod__ = mod
__mul__ = mul
__neg__ = neg
__or__ = or_
__pos__ = pos
__pow__ = pow
__rshift__ = rshift
__sub__ = sub
__truediv__ = truediv
__div__ = div
__xor__ = xor
__concat__ = concat
__contains__ = contains
__delitem__ = delitem
__getitem__ = getitem
__setitem__ = setitem
__iadd__ = iadd
__iand__ = iand
__iconcat__ = iconcat
__ifloordiv__ = ifloordiv
__ilshift__ = ilshift
__imatmul__ = imatmul
__imod__ = imod
__imul__ = imul
__ior__ = ior
__ipow__ = ipow
__irshift__ = irshift
__isub__ = isub
__itruediv__ = itruediv
__ixor__ = ixor
