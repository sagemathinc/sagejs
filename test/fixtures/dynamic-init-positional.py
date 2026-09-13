"""Assigned initializer invocation and return checks; CPython oracle fixture."""


class Empty:
    pass


class EmptyCallable:
    def __call__(self):
        return 1


for cls in (Empty, EmptyCallable):
    assert isinstance(cls(), cls)
    assert isinstance(cls(**{}), cls)
    try:
        cls(unexpected=1)
    except TypeError:
        pass
    else:
        raise AssertionError("object initializer accepted unexpected keyword")


def assigned(self, value=3):
    self.value = value


class Ordinary:
    pass


class Callable:
    def __call__(self):
        return self.value


for cls in (Ordinary, Callable):
    cls.__init__ = assigned
    assert cls().value == 3
    assert cls(7).value == 7
assert Callable(11)() == 11


class Replaced:
    def __init__(self, value):
        self.value = value + 1


assert Replaced(2).value == 3
Replaced.__init__ = assigned
assert Replaced(2).value == 2


class Child(Ordinary):
    pass


class CallableChild(Callable):
    pass


assert Child(13).value == 13
assert CallableChild(17)() == 17


def replacement(self, value=19):
    self.value = value + 1


Ordinary.__init__ = replacement
Callable.__init__ = replacement
assert Child(23).value == 24
assert CallableChild(29)() == 30

events = []


class Allocated:
    def __new__(cls, value):
        events.append("new")
        return object.__new__(cls)

    def __call__(self):
        return self.value


def allocated_init(self, value):
    events.append("init")
    self.value = value


Allocated.__init__ = allocated_init
assert Allocated(31)() == 31
assert events == ["new", "init"]


class Foreign:
    def __new__(cls, value):
        return value

    def __call__(self):
        return None


def forbidden_init(self, value):
    raise AssertionError("foreign __new__ result must skip __init__")


Foreign.__init__ = forbidden_init
assert Foreign(37) == 37


def invalid_init(self, value=0):
    return 1


Ordinary.__init__ = invalid_init
Callable.__init__ = invalid_init
for cls in (Ordinary, Callable, Child, CallableChild):
    try:
        cls()
    except TypeError:
        pass
    else:
        raise AssertionError("__init__ return value was discarded")

print("dynamic-init-positional-ok")
