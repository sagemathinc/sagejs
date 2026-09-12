# CPython 3.14 defaults to deferred evaluation. The driver explicitly switches
# this marker and prepends Sage's legacy directive for that separate contract.
LEGACY_EVALUATED = False
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


order = ["proto", "constructor", "args", "value", "kwargs", "return"]
assert events == (order if LEGACY_EVALUATED else [])
annotations = annotated.__annotations__
assert events == order
assert list(annotations) == [
    "__proto__",
    "constructor",
    "args",
    "value",
    "kwargs",
    "return",
]
assert list(annotations.values()) == order
assert isinstance(annotations, dict)
assert annotated.__annotations__ is annotations
assert events == order


class C:
    def method(self: "C", __proto__: int, *, constructor: str) -> bool:
        pass


assert list(C.method.__annotations__) == ["self", "__proto__", "constructor", "return"]
assert C().method.__annotations__ is C.method.__annotations__
print("annotation-evaluated-ok")
