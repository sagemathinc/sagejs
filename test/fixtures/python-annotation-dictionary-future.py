from __future__ import annotations

events = []


def mark(label):
    events.append(label)
    return label


def annotated(
    __proto__: mark("proto"),
    constructor: mark("constructor"),
    /,
    *args: mark("args"),
    value: mark("value"),
    **kwargs: mark("kwargs"),
) -> mark("return"):
    pass


assert events == []
assert list(annotated.__annotations__) == [
    "__proto__",
    "constructor",
    "args",
    "value",
    "kwargs",
    "return",
]
assert list(annotated.__annotations__.values()) == [
    "mark('proto')",
    "mark('constructor')",
    "mark('args')",
    "mark('value')",
    "mark('kwargs')",
    "mark('return')",
]
assert isinstance(annotated.__annotations__, dict)
assert events == []


def factory():
    def empty():
        pass

    def typed(value: int) -> str:
        pass

    return empty, typed


a, b = factory()
c, d = factory()
a.__annotations__["extra"] = "one"
b.__annotations__["extra"] = "two"
assert "extra" not in c.__annotations__
assert "extra" not in d.__annotations__
assert a.__annotations__ is a.__annotations__
assert b.__annotations__ is b.__annotations__


class C:
    def method(self: C, __proto__: int, *, constructor: str) -> bool:
        pass


assert list(C.method.__annotations__) == ["self", "__proto__", "constructor", "return"]
assert C().method.__annotations__ is C.method.__annotations__
print("annotation-future-ok")
