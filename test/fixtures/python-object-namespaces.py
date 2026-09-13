"""CPython oracle for object slots and owned instance namespaces."""


def raises(error, function, *args):
    try:
        function(*args)
    except error:
        return
    raise AssertionError("expected exception")


class A:
    def method(self):
        return self.x


class B(A):
    pass


class D(dict):
    pass


assert object.__subclasshook__(1) is NotImplemented
a = A()
b = A()
assert a.__eq__(a) is True
assert a.__ne__(a) is False
assert a.__eq__(b) is NotImplemented
assert a.__ne__(b) is NotImplemented
assert a.__lt__(b) is NotImplemented
assert a.__le__(b) is NotImplemented
assert a.__gt__(b) is NotImplemented
assert a.__ge__(b) is NotImplemented


class Equal:
    def __eq__(self, other):
        return 7


equal = Equal()
equal.__eq__ = lambda other: False
assert object.__ne__(equal, 1) is False

assert "__dict__" in A.__dict__
assert "__dict__" not in B.__dict__
assert "__dict__" in D.__dict__


class Slotted:
    __slots__ = ()


class Mixed(Slotted, A):
    pass


assert "__dict__" not in Slotted.__dict__
assert "__dict__" in Mixed.__dict__
mixed = Mixed()
mixed.x = 16
assert mixed.__dict__ == {"x": 16}
assert A.__dict__["method"] is A.method
assert A.__dict__.get("method") is A.method
assert A.__dict__["method"] is A.__dict__["method"]
raises(KeyError, A.__dict__.__getitem__, "absent")
descriptor = A.__dict__["__dict__"]
assert descriptor.__objclass__ is A
assert descriptor.__get__(None, A) is descriptor
raises(AttributeError, setattr, descriptor, "__objclass__", B)
raises(AttributeError, delattr, descriptor, "__objclass__")
raises(AttributeError, setattr, descriptor, "__name__", "fake")
assert descriptor.__objclass__ is A
raises(TypeError, descriptor.__get__, object(), object)
raises(AttributeError, setattr, A, "__dict__", {})
raises(AttributeError, delattr, A, "__dict__")

a.x = 1
old = a.__dict__
assert type(old) is dict
assert old == {"x": 1}
assert a.__dict__ is old
assert descriptor.__get__(a, A) is old
old["x"] = 2
assert a.x == 2
assert a.method() == 2
assert "x" in dir(a)
a.y = 3
assert old == {"x": 2, "y": 3}
del a.x
assert "x" not in old
raises(AttributeError, getattr, a, "x")

replacement = {"x": 4, 17: "integer key", (1, 2): "tuple key"}
a.__dict__ = replacement
assert a.__dict__ is replacement
assert a.x == 4
assert old == {"y": 3}
replacement["x"] = 5
assert a.method() == 5
a.y = 6
assert replacement["y"] == 6
del a.__dict__
assert replacement == {"x": 5, 17: "integer key", (1, 2): "tuple key", "y": 6}
fresh = a.__dict__
assert fresh == {}
assert fresh is not replacement
assert a.__dict__ is fresh
raises(AttributeError, getattr, a, "x")
raises(TypeError, setattr, a, "__dict__", [])
assert a.__dict__ is fresh

other = B()
other.__dict__ = old
assert other.y == 3
descriptor.__delete__(other)
assert other.__dict__ == {}
assert old == {"y": 3}


class HostileDict(dict):
    def __getitem__(self, key):
        raise AssertionError("attribute lookup must use dict storage")

    def __setitem__(self, key, value):
        raise AssertionError("attribute assignment must use dict storage")

    def __delitem__(self, key):
        raise AssertionError("attribute deletion must use dict storage")

    def items(self):
        raise AssertionError("namespace replacement must not copy")


hostile = HostileDict()
dict.__setitem__(hostile, "x", 8)
a.__dict__ = hostile
assert a.__dict__ is hostile
assert a.x == 8
a.x = 9
assert dict.__getitem__(hostile, "x") == 9
del a.x
assert len(hostile) == 0


class DataDescriptor:
    def __get__(self, instance, owner):
        return instance.payload

    def __set__(self, instance, value):
        instance.payload = value

    def __delete__(self, instance):
        del instance.payload


class WithDescriptor:
    x = DataDescriptor()


instance = WithDescriptor()
instance.__dict__ = {"x": "shadow", "payload": 10}
assert instance.x == 10
instance.x = 11
assert instance.__dict__ == {"x": "shadow", "payload": 11}
del instance.x
assert instance.__dict__ == {"x": "shadow"}


class CustomNamespace(A):
    __dict__ = DataDescriptor()


custom = CustomNamespace()
custom.__dict__ = 17
assert custom.payload == 17
assert custom.__dict__ == 17
assert "__dict__" in CustomNamespace.__dict__

d = D()
assert d.__dict__ == {}
d["key"] = 12
d.x = 13
assert d.__dict__ == {"x": 13}
del d.__dict__
assert d == {"key": 12}


class Callable:
    def __call__(self):
        return self.x


callable_instance = Callable()
assert Callable.__dict__["__dict__"].__objclass__ is Callable
callable_instance.__dict__ = {"x": 14}
assert callable_instance() == 14
assert callable_instance.__dict__ == {"x": 14}


class Meta(type):
    def __new__(cls, name, bases, namespace):
        assert "__dict__" not in namespace
        return type.__new__(cls, name, bases, namespace)


class MetaInstance(metaclass=Meta):
    pass


meta_instance = MetaInstance()
meta_instance.x = 15
assert meta_instance.__dict__ == {"x": 15}
assert MetaInstance.__dict__["__dict__"].__objclass__ is MetaInstance

import copy

assert type(copy.deepcopy(object())) is object


class SlottedState:
    __slots__ = ("__value",)

    def __init__(self):
        self.__value = [1]

    def value(self):
        return self.__value


slotted_state = SlottedState()
assert copy.copy(slotted_state).value() is slotted_state.value()
slotted_copy = copy.deepcopy(slotted_state)
assert slotted_copy.value() == [1]
assert slotted_copy.value() is not slotted_state.value()

original = A()
original.x = [1]
compact_copy = copy.copy(original)
assert compact_copy.x is original.x
compact_copy.x = [2]
assert original.x == [1]
original.__dict__[3] = [4]
original.self = original
shallow = copy.copy(original)
assert shallow.__dict__ is not original.__dict__
assert shallow.__dict__[3] is original.__dict__[3]
assert shallow.self is original
deep = copy.deepcopy(original)
assert deep.self is deep
assert deep.__dict__[3] == [4]
assert deep.__dict__[3] is not original.__dict__[3]
assert deep.x is not original.x
original.__class__ = B
assert type(original) is B
assert original.method() == [1]
original.__dict__["__call__"] = lambda: 99
assert not callable(original)
original.__dict__["constructor"] = dict
assert type(original) is B
assert isinstance(original, A)

import pickle
from argparse import Namespace

record = Namespace(answer=42)
record.__dict__[3] = [4]
roundtrip = pickle.loads(pickle.dumps(record))
assert type(roundtrip) is Namespace
assert roundtrip.answer == 42
assert roundtrip.__dict__[3] == [4]
print("object-namespaces-ok")
