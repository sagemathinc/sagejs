"""CPython oracle for class calls and most-derived metaclass selection."""


class CountingMeta(type):
    count = 0

    def __call__(cls):
        CountingMeta.count += 1
        return type.__call__(cls, CountingMeta.count)


class Counted(metaclass=CountingMeta):
    def __new__(cls, count):
        result = object.__new__(cls)
        result.count = count
        return result


assert Counted().count == 1
assert Counted().count == 2
assert type.__call__(Counted, 9).count == 9
assert CountingMeta.count == 2


class DerivedMeta(CountingMeta):
    pass


class Derived(metaclass=DerivedMeta):
    pass


class Explicit(Counted, Derived, metaclass=CountingMeta):
    pass


class Implicit(Counted, Derived):
    pass


assert type(Explicit) is DerivedMeta
assert type(Implicit) is DerivedMeta
assert Explicit().count == 3
assert Implicit().count == 4
dynamic = type("Dynamic", (Counted, Derived), {})
assert type(dynamic) is DerivedMeta
assert dynamic().count == 5


class UnrelatedMeta(type):
    pass


class Unrelated(metaclass=UnrelatedMeta):
    pass


try:

    class Conflict(Counted, Unrelated):
        pass

    raise AssertionError("metaclass conflict must fail")
except TypeError:
    pass

print("python-metaclass-dispatch-ok")
