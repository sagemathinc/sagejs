"""Implicit calls select the type slot, never an instance attribute."""

events = []


class Base:
    def __call__(self, x=1):
        return x + 1


class Child(Base):
    pass


value = Child()
saved = value.__call__
value.__call__ = lambda x=1: -1
assert value.__call__(3) == -1
assert value(3) == 4
assert value(*[3]) == 4
assert value(x=3) == 4
assert saved(3) == 4


class Holder:
    @property
    def item(self):
        events.append("lookup")
        return value


holder = Holder()
assert holder.item(3) == 4
assert events == ["lookup"]


def replacement(self, x=1):
    return x + 10


Base.__call__ = replacement
assert value(3) == 13
assert saved(3) == 4
Base.__call__ = staticmethod(lambda x: x + 20)
assert value(3) == 23
Base.__call__ = classmethod(lambda cls, x: (cls.__name__, x))
value.constructor = Base
value.__python_type__ = Base
assert value(3) == ("Child", 3)


class CallDescriptor:
    def __get__(self, instance, owner):
        events.append(("descriptor", instance is value, owner.__name__))
        return lambda x: x + 30


Base.__call__ = CallDescriptor()
events.clear()
assert value(3) == 33
assert events == [("descriptor", True, "Child")]


class DescriptorError:
    def __get__(self, instance, owner):
        raise ValueError("call descriptor error")


Base.__call__ = DescriptorError()
try:
    value(3)
except ValueError as error:
    assert str(error) == "call descriptor error"
else:
    raise AssertionError("call descriptor error was swallowed")

Base.__call__ = None
try:
    value(3)
except TypeError:
    pass
else:
    raise AssertionError("noncallable type slot was accepted")


class Plain:
    pass


plain = Plain()
plain.__call__ = lambda x: 99
assert not callable(plain)
try:
    plain(3)
except TypeError:
    pass
else:
    raise AssertionError("instance-only call attribute made object callable")


class Fallback:
    def __getattr__(self, name):
        events.append(name)
        return lambda x: 99


fallback = Fallback()
events.clear()
try:
    fallback(3)
except TypeError:
    pass
else:
    raise AssertionError("implicit call consulted __getattr__")
assert events == []


class Own:
    def __call__(self, x):
        return x * 2


own = Own()
own.__call__ = lambda x: -1
assert own(3) == 6
assert own.__call__(3) == -1
assert len([1, 2]) == 2
assert (lambda x: x + 1)(3) == 4
print("callable-type-slots-ok")
