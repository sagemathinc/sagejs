"""Allocation and initialization bind independent copies of keyword arguments."""

events = []


class Separate:
    def __new__(cls, **keywords):
        events.append(("new", sorted(keywords.items())))
        return object.__new__(cls)

    def __init__(self, value, *, scale=1):
        events.append(("init", value, scale))
        self.value = value * scale


keywords = {"value": 3, "scale": 4}
assert Separate(**keywords).value == 12
assert keywords == {"value": 3, "scale": 4}
assert events == [("new", [("scale", 4), ("value", 3)]), ("init", 3, 4)]


def replacement(self, value, *, scale=1):
    self.value = value + scale


Separate.__init__ = replacement
assert Separate(**keywords).value == 7
assert keywords == {"value": 3, "scale": 4}


class NewOnly:
    def __new__(cls, *, value):
        instance = object.__new__(cls)
        instance.value = value
        return instance


assert NewOnly(value=9).value == 9


class Foreign:
    def __new__(cls, *, value):
        return value

    def __init__(self, unrelated):
        raise AssertionError("foreign allocation must not bind or run init")


assert Foreign(value=11) == 11


class CallableSeparate:
    def __new__(cls, **keywords):
        events.append(("callable-new", sorted(keywords.items())))
        return object.__new__(cls)

    def __init__(self, value, *, scale):
        self.value = value * scale

    def __call__(self):
        return self.value


assert CallableSeparate(**keywords)() == 12
assert keywords == {"value": 3, "scale": 4}
assert events[-1] == ("callable-new", [("scale", 4), ("value", 3)])


class EmptyBase:
    pass


class AllocatingChild(EmptyBase):
    def __new__(cls, **keywords):
        instance = object.__new__(cls)
        instance.value = 19
        return instance


assert AllocatingChild(ignored=23).value == 19


def inherited_init(self, *, value):
    self.value = value


EmptyBase.__init__ = inherited_init
assert AllocatingChild(value=29).value == 29


def invalid_init(self, *, value):
    return value


CallableSeparate.__init__ = invalid_init
try:
    CallableSeparate(value=31)
except TypeError:
    pass
else:
    raise AssertionError("keyword initializer return value was discarded")

print("dynamic-init-allocation-ok")
