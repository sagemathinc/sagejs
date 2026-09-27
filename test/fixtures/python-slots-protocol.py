from copy import copy, deepcopy


class Slotted:
    __slots__ = ("x",)


def describe(thunk):
    try:
        return ("value", thunk())
    except Exception as error:
        return ("error", type(error).__name__)


slot = Slotted.__dict__["x"]
instance = Slotted()
print("descriptor", type(slot).__name__, slot.__name__, slot.__objclass__ is Slotted)
print("empty", describe(lambda: instance.x))
instance.x = 7
print("assigned", instance.x, describe(lambda: instance.__dict__))
print("copied", copy(instance).x, deepcopy(instance).x)
print("undeclared", describe(lambda: setattr(instance, "y", 2)))
print("undeclared absent", describe(lambda: instance.y))

Slotted.x = 42
print("class replacement", instance.x, slot.__get__(instance, Slotted))
del Slotted.x
print("class deletion", describe(lambda: instance.x), slot.__get__(instance, Slotted))
slot.__set__(instance, 9)
print("saved descriptor", describe(lambda: instance.x), slot.__get__(instance, Slotted))
slot.__delete__(instance)
print("slot deletion", describe(lambda: slot.__get__(instance, Slotted)))


class WithDict:
    __slots__ = ("x", "__dict__")


with_dict = WithDict()
with_dict.x = 3
with_dict.extra = 4
print("with dict", with_dict.x, with_dict.__dict__)
with_dict.__dict__["x"] = 99
print("descriptor precedence", with_dict.x, with_dict.__dict__["x"])


class Child(WithDict):
    __slots__ = ("y",)


child = Child()
child.x = 5
child.y = 6
child.extra = 7
print("inherited", child.x, child.y, child.__dict__)


class Private:
    __slots__ = ("__secret",)

    def __init__(self):
        self.__secret = 8


private = Private()
print(
    "private", private._Private__secret, Private.__dict__["_Private__secret"].__name__
)


class Hooked:
    __slots__ = ("x",)

    def __getattribute__(self, name):
        value = object.__getattribute__(self, name)
        return value + 1 if name == "x" else value

    def __setattr__(self, name, value):
        object.__setattr__(self, name, value + 1 if name == "x" else value)


hooked = Hooked()
hooked.x = 3
print("custom hooks", hooked.x, Hooked.__dict__["x"].__get__(hooked, Hooked))


class MissingFallback:
    __slots__ = ("x",)

    def __getattr__(self, name):
        if name == "x":
            return 11
        raise AttributeError(name)


fallback = MissingFallback()
fallback.x = 4
print("fallback assigned", fallback.x)
del fallback.x
print("fallback missing", fallback.x)


class SlottedBase:
    __slots__ = ()


Dynamic = type("Dynamic", (SlottedBase,), {})
Dynamic.context = [1]
print("dynamic class metadata", Dynamic.context, Dynamic().context)


class EqualityBase:
    __slots__ = ("x",)

    def __eq__(self, other):
        raise AssertionError("instance equality must not compare MRO classes")


EqualityChild = type("EqualityChild", (EqualityBase,), {})
equality_child = EqualityChild()
equality_child.x = 6
print("inherited slot owner", equality_child.x)


class ListSlot(list):
    __slots__ = ("x",)


list_slot = ListSlot()
list_slot.x = 5
print("builtin base layout", list_slot.x, describe(lambda: list_slot.__dict__))
