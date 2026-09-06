"""Default class annotation slots shared with the pinned CPython oracle."""


def missing_delete(cls):
    try:
        del cls.__annotations__
    except AttributeError:
        return
    raise AssertionError("deleting an absent annotation slot must fail")


class Empty:
    pass


assert "__annotations__" not in Empty.__dict__
missing_delete(Empty)
first = Empty.__annotations__
assert isinstance(first, dict)
assert first == {}
assert Empty.__annotations__ is first
assert "__annotations__" not in Empty.__dict__
assert not hasattr(Empty(), "__annotations__")
first["mutated"] = int
assert Empty.__annotations__ == {"mutated": int}


class Annotated:
    field: int


class Child(Annotated):
    pass


assert Annotated.__annotations__ == {"field": int}
assert Child.__annotations__ == {}
assert Child.__annotations__ is not Annotated.__annotations__
assert Child.__annotations__ is not first


class ConstructorOnly:
    def __init__(self, value: int = 0) -> None:
        self.value = value


# Function annotation evaluation is a separate compiler option in Sage.js.
# An explicit value tests class/function slot separation in either policy.
ConstructorOnly.__init__.__annotations__ = {"value": int}
assert ConstructorOnly.__annotations__ == {}
assert ConstructorOnly.__annotations__ is not ConstructorOnly.__init__.__annotations__
assert ConstructorOnly.__init__.__annotations__["value"] is int

Empty.__annotations__ = 17
assert Empty.__annotations__ == 17
assert "__annotations__" not in Empty.__dict__
assert not hasattr(Empty(), "__annotations__")
del Empty.__annotations__
missing_delete(Empty)
assert Empty.__annotations__ == {}
assert Empty.__annotations__ is not first


class AnnotationDescriptor:
    def __get__(self, instance, owner):
        assert instance is None
        return owner


descriptor = AnnotationDescriptor()
Empty.__annotations__ = descriptor
assert Empty.__annotations__ is Empty
assert "__annotations__" not in Empty.__dict__


class Explicit:
    __annotations__ = descriptor


assert Explicit.__dict__["__annotations__"] is descriptor
assert Explicit.__annotations__ is Explicit


class ExplicitChild(Explicit):
    pass


assert ExplicitChild.__annotations__ == {}
Explicit.__annotations__ = 23
assert Explicit.__annotations__ == 23
assert Explicit.__dict__["__annotations__"] == 23
assert Explicit().__annotations__ == 23
del Explicit.__annotations__
assert "__annotations__" not in Explicit.__dict__
assert Explicit.__annotations__ == {}
assert not hasattr(Explicit(), "__annotations__")


class DescriptorChild(Explicit):
    pass


Explicit.__annotations__ = descriptor
assert DescriptorChild.__annotations__ == {}


class MethodAnnotations:
    def __annotations__(self):
        return 31


class MethodAnnotationsChild(MethodAnnotations):
    pass


assert MethodAnnotationsChild.__annotations__ == {}


class MissingDescriptor:
    def __get__(self, instance, owner):
        raise AttributeError("descriptor is unavailable")


Empty.__annotations__ = MissingDescriptor()
assert getattr(Empty, "__annotations__", "fallback") == "fallback"
assert not hasattr(Empty, "__annotations__")

Dynamic = type("Dynamic", (Annotated,), {})
assert Dynamic.__annotations__ == {}
assert "__annotations__" not in Dynamic.__dict__
DynamicExplicit = type("DynamicExplicit", (), {"__annotations__": descriptor})
assert DynamicExplicit.__annotations__ is DynamicExplicit
assert DynamicExplicit.__dict__["__annotations__"] is descriptor
DynamicExplicit.__annotations__ = None
assert DynamicExplicit.__dict__["__annotations__"] is None
del DynamicExplicit.__annotations__
assert DynamicExplicit.__annotations__ == {}

callback_annotations = []


class NamespaceProbe:
    def __set_name__(self, owner, name):
        callback_annotations.append(owner.__annotations__)


class Callback:
    probe = NamespaceProbe()


assert Callback.__annotations__ is callback_annotations[-1]
DynamicCallback = type("DynamicCallback", (), {"probe": NamespaceProbe()})
assert DynamicCallback.__annotations__ is callback_annotations[-1]

captured_annotations = []


def capture(cls):
    captured_annotations.append(cls.__annotations__)
    return cls


@capture
class Callable:
    def __call__(self):
        return 7


assert Callable.__annotations__ is captured_annotations[-1]
assert Callable()() == 7
Callable.__annotations__["after_proxy"] = str
assert captured_annotations[-1] == {"after_proxy": str}


@capture
class CallableChild(Callable):
    pass


assert CallableChild.__annotations__ is captured_annotations[-1]
assert CallableChild.__annotations__ == {}
assert CallableChild()() == 7


class OrdinaryMeta(type):
    pass


class WithMeta(metaclass=OrdinaryMeta):
    pass


assert WithMeta.__annotations__ == {}
assert "__annotations__" not in WithMeta.__dict__

for builtin in (
    object,
    type,
    int,
    bool,
    float,
    str,
    list,
    tuple,
    dict,
    set,
    frozenset,
    range,
    property,
):
    assert not hasattr(builtin, "__annotations__"), builtin

print("class-annotations-lazy-ok")
