"""Class-body initializer bindings execute in source order."""

import inspect


def assigned(self, value=3, *, scale=1):
    self.value = value * scale


variadic_events = []


def variadic(self, *args, **kwargs):
    variadic_events.append((args, sorted(kwargs.items())))


class Variadic:
    __init__ = variadic


Variadic(3, label=5)
assert variadic_events == [((3,), [("label", 5)])]


class Early:
    __init__ = assigned


class BeforeMethod:
    __init__ = assigned

    def get(self):
        return self.value


class Late:
    def get(self):
        return self.value

    __init__ = assigned


class Overwritten:
    __init__ = assigned

    def __init__(self, value=3, *, scale=1):
        self.value = value + scale


class Replacement:
    def __init__(self, obsolete):
        raise AssertionError("overwritten initializer ran")

    __init__ = assigned


class Callable:
    __init__ = assigned

    def __call__(self):
        return self.value


for cls in (Early, BeforeMethod, Late, Replacement, Callable):
    assert cls().value == 3
    assert cls(5, scale=7).value == 35
    assert cls(value=11, scale=2).value == 22
    assert list(inspect.signature(cls).parameters) == ["value", "scale"]
    try:
        cls(obsolete=1)
    except TypeError:
        pass
    else:
        raise AssertionError("stale initializer signature accepted")
    try:
        cls(1, value=2)
    except TypeError:
        pass
    else:
        raise AssertionError("duplicate initializer argument accepted")

assert BeforeMethod(7).get() == 7
assert Late(9).get() == 9
assert Callable(11)() == 11
assert Overwritten(value=5, scale=7).value == 12


class Capture:
    def __init__(self, first):
        self.value = first + 1

    saved = __init__
    __init__ = assigned


instance = Capture(13)
assert instance.value == 13
instance.saved(13)
assert instance.value == 14


class Conditional:
    if True:
        __init__ = assigned


assert Conditional(value=17).value == 17


class ConditionalElse:
    if False:
        __init__ = None
    else:
        __init__ = assigned


class ConditionalInherited(Early):
    if False:
        __init__ = None


assert ConditionalElse(value=17).value == 17
assert ConditionalInherited(value=17).value == 17


initializer_events = []


class Initializer:
    def __call__(self, value=3, *, scale=2):
        initializer_events.append(value * scale)


class CallableInitializer:
    __init__ = Initializer()


CallableInitializer()
CallableInitializer(value=5, scale=7)
assert initializer_events == [6, 35]


class Deleted(Early):
    __init__ = None
    del __init__


assert Deleted(value=17, scale=2).value == 34


class DeletedMethod(Early):
    def __init__(self):
        raise AssertionError("deleted method initializer survived")

    del __init__


assert DeletedMethod(value=17, scale=2).value == 34


class Noncallable:
    __init__ = None


class LateNoncallable:
    def __init__(self):
        raise AssertionError("replaced initializer survived")

    __init__ = None


for cls in (Noncallable, LateNoncallable):
    assert cls.__init__ is None
    try:
        cls()
    except TypeError:
        pass
    else:
        raise AssertionError("noncallable initializer was replaced")


class Child(Early):
    pass


class Override(Early):
    __init__ = assigned


assert Child(scale=3).value == 9
assert list(inspect.signature(Child).parameters) == ["value", "scale"]
assert list(inspect.signature(Child.__init__).parameters) == ["self", "value", "scale"]


def replacement(self, current, /, *, scale=2):
    self.value = current + scale


Early.__init__ = replacement
assert Child(19, scale=3).value == 22
assert Override(19, scale=3).value == 57
try:
    Child(value=19)
except TypeError:
    pass
else:
    raise AssertionError("inherited initializer signature was stale")
Child.__init__ = assigned
assert Child(value=23).value == 23
del Child.__init__
assert Child(23).value == 25


class EmptyMixin:
    pass


class Combined(EmptyMixin, Override):
    pass


assert Combined(value=29, scale=2).value == 58


class Allocated:
    __init__ = assigned

    def __new__(cls, value=3, *, scale=1):
        return object.__new__(cls)


assert Allocated(value=31, scale=2).value == 62


def invalid(self):
    return 1


class Invalid:
    __init__ = invalid


try:
    Invalid()
except TypeError:
    pass
else:
    raise AssertionError("non-None initializer return accepted")


def check_metadata_loop_name():
    ρσ_init_attr = "user-local"

    class MetadataLoop:
        pass

    assert ρσ_init_attr == "user-local"
    assert "ρσ_init_attr" not in vars(MetadataLoop)


check_metadata_loop_name()
print("dynamic-init-class-body-ok")
