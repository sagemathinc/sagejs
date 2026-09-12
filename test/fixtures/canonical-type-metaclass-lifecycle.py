"""Exact instance ownership during and after metaclass construction."""


class OwnerProbe:
    def __set_name__(self, owner, name):
        assert type(object.__new__(owner)) is owner


class Meta(type):
    def __new__(mcls, name, bases, namespace):
        cls = super().__new__(mcls, name, bases, namespace)
        assert type(object.__new__(cls)) is cls
        return cls

    def __init__(cls, name, bases, namespace):
        assert type(cls) is Meta
        assert type(object.__new__(cls)) is cls


class Owned(metaclass=Meta):
    constructor = 17
    __python_type__ = str
    probe = OwnerProbe()


assert type(Owned) is Meta
assert type(Owned()) is Owned


class Existing:
    constructor = 19


class ReplacingMeta(type):
    def __new__(mcls, name, bases, namespace):
        return Existing


class Replaced(metaclass=ReplacingMeta):
    pass


assert Replaced is Existing
assert type(Replaced()) is Existing

sentinel = object()


class ReturnsObject(type):
    def __new__(mcls, name, bases, namespace):
        return sentinel


class NotAClass(metaclass=ReturnsObject):
    pass


assert NotAClass is sentinel
assert type(NotAClass) is object
print("metaclass lifecycle passed")
