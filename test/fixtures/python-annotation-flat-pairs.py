from __future__ import annotations


def factory():
    def empty():
        pass

    def typed(value: int) -> str:
        pass

    return empty, typed


a, b = factory()
c, d = factory()
assert isinstance(a.__annotations__, dict)
assert isinstance(b.__annotations__, dict)
a.__annotations__["extra"] = 1
b.__annotations__["extra"] = 2
assert "extra" not in c.__annotations__
assert "extra" not in d.__annotations__
assert a.__annotations__ is a.__annotations__
assert b.__annotations__ is b.__annotations__
del b.__annotations__["extra"]
assert list(b.__annotations__) == ["value", "return"]


def special(
    __proto__: int, constructor: str, /, *args: int, value: str, **kw: int
) -> bool:
    pass


assert list(special.__annotations__) == [
    "__proto__",
    "constructor",
    "args",
    "value",
    "kw",
    "return",
]
assert list(special.__annotations__.values()) == [
    "int",
    "str",
    "int",
    "str",
    "int",
    "bool",
]


class C:
    def method(self: C, __proto__: int, *, constructor: str) -> bool:
        pass


assert list(C.method.__annotations__) == ["self", "__proto__", "constructor", "return"]
assert C().method.__annotations__ is C.method.__annotations__
print("annotation-flat-pairs-ok")
