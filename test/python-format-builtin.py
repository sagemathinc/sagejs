"""Ordinary Python oracle for the bounded builtin formatting contract."""


def raises(exception, callback):
    try:
        callback()
    except exception:
        return
    raise AssertionError("expected exception")


assert format(42) == "42"
assert format(True) == "True"
assert format(None) == "None"
assert format("hello", ".3s") == "hel"
assert format("hi", "*^6") == "**hi**"
assert format("hi", "05s") == "hi000"
assert format(-42, "08d") == "-0000042"
assert format(255, "#06x") == "0x00ff"
assert format(1234567, ",d") == "1,234,567"
assert format(42.5, ".1f") == "42.5"
assert format(42.5, "g") == "42.5"
assert format(0.25, ".0%") == "25%"
assert format(True, "d") == "1"


class PolymorphInt(int):
    def __float__(self):
        return 42.5


assert format(PolymorphInt(2), "g") == "42.5"
assert format(PolymorphInt(2), "04d") == "0002"
assert "{:g}".format(PolymorphInt(2)) == "42.5"


class Formattable:
    def __init__(self):
        self.prefix = "type:"

    def __format__(self, spec):
        return self.prefix + spec


value = Formattable()
value.__format__ = lambda spec: "instance"
value.constructor = int
assert format(value) == "type:"
assert format(value, "xyz") == "type:xyz"
assert "{} {:xyz}".format(value, value) == "type: type:xyz"


class FormatDescriptor:
    def __get__(self, instance, owner):
        return lambda spec: instance.prefix + spec


class DescriptorOwner:
    __format__ = FormatDescriptor()


descriptor_value = DescriptorOwner()
descriptor_value.prefix = "descriptor:"
descriptor_value.__format__ = lambda spec: "shadow"
assert format(descriptor_value, "ok") == "descriptor:ok"


class Plain:
    def __str__(self):
        return "plain"


class BadResult:
    def __format__(self, spec):
        return 42


class Noncallable:
    __format__ = None


class StringSubclass(str):
    pass


class StringResult:
    def __format__(self, spec):
        assert isinstance(spec, StringSubclass)
        return StringSubclass("subclass")


class StaticFormat:
    @staticmethod
    def __format__(spec):
        return "static:" + spec


class ClassFormat:
    @classmethod
    def __format__(cls, spec):
        return cls.__name__ + ":" + spec


assert isinstance(format(StringResult(), StringSubclass("x")), StringSubclass)
assert format(StaticFormat(), "x") == "static:x"
assert format(ClassFormat(), "x") == "ClassFormat:x"
assert format(Plain()) == "plain"
raises(TypeError, lambda: format(Plain(), "x"))
raises(TypeError, lambda: format(BadResult()))
raises(TypeError, lambda: format(Noncallable()))
raises(TypeError, lambda: format(value, 1))
raises(ValueError, lambda: format("12", "f"))
raises(ValueError, lambda: format("12", "+"))
raises(ValueError, lambda: format(12, ".2d"))
raises(ValueError, lambda: format(12, "bad"))

print("python-format-builtin-ok")
