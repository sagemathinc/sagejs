def raises(kind, function, *args):
    try:
        function(*args)
    except kind:
        return
    raise AssertionError("expected exception")


class Counter:
    def __init__(self):
        self.value = 1

    @property
    def item(self):
        """Current counter value."""
        return self.value

    @item.setter
    def item(self, value):
        self.value = value

    @item.deleter
    def item(self):
        self.value = -1


counter = Counter()
descriptor = Counter.item
assert type(descriptor) is property
assert Counter.item is descriptor
assert Counter.__dict__["item"] is descriptor
assert descriptor.__get__(None, Counter) is descriptor
assert descriptor.__doc__ == "Current counter value."
assert descriptor.fget.__doc__ == descriptor.__doc__
assert descriptor.fget(counter) == 1
descriptor.fset(counter, 3)
assert counter.item == 3
descriptor.fdel(counter)
assert counter.item == -1
counter.item = 4
assert counter.item == 4
del counter.item
assert counter.item == -1
object.__setattr__(counter, "item", 5)
assert counter.item == 5

# Exposing or replacing the instance dictionary must not redirect data slots
# into dictionary entries, even when the supplied mapping shadows their names.
namespace = counter.__dict__
namespace["item"] = 99
counter.item = 6
assert counter.item == 6 and namespace["value"] == 6
assert namespace["item"] == 99
object.__setattr__(counter, "item", 7)
assert counter.item == 7 and namespace["value"] == 7
counter.__dict__ = {"value": 8, "item": 100}
counter.item = 9
assert counter.item == 9 and counter.__dict__["item"] == 100


class Child(Counter):
    pass


assert Child.item is descriptor


class ReadOnly:
    @property
    def value(self):
        return 5


assert ReadOnly.value.fset is None
assert ReadOnly.value.fdel is None
raises(AttributeError, setattr, ReadOnly(), "value", 1)
readonly = ReadOnly()
raises(AttributeError, object.__setattr__, readonly, "value", 1)
readonly.__dict__["value"] = 99
raises(AttributeError, setattr, readonly, "value", 1)
raises(AttributeError, object.__setattr__, readonly, "value", 1)
assert readonly.value == 5 and readonly.__dict__["value"] == 99


class OptionalGetter:
    @property
    def value(self, fallback=12):
        return fallback

    @property
    def keyword(self, *, fallback=5):
        return fallback


optional = OptionalGetter()
assert optional.value == 12 and optional.keyword == 5
OptionalGetter.value.fget.__defaults__ = (13,)
OptionalGetter.keyword.fget.__kwdefaults__["fallback"] = 6
assert optional.value == 13 and optional.keyword == 6


def replacement(self):
    """Replacement getter."""
    return 9


assert descriptor.getter(replacement).__doc__ == "Replacement getter."
assert descriptor.setter(None).getter(replacement).__doc__ == "Replacement getter."
assert property(replacement, doc="explicit").getter(None).__doc__ == "explicit"
assert property().__doc__ is None
raises(TypeError, property, None, None, None, None, None)


class Missing:
    def __get__(self, instance, owner):
        raise AttributeError("descriptor missing")


class MissingData(Missing):
    def __set__(self, instance, value):
        raise ValueError("not writable")


class Fallback:
    plain = Missing()
    data = MissingData()

    @property
    def native(self):
        raise AttributeError("property missing")

    def __getattr__(self, name):
        if name == "absent":
            raise AttributeError(name)
        return "fallback " + name


fallback = Fallback()
assert fallback.plain == "fallback plain"
assert fallback.data == "fallback data"
assert fallback.native == "fallback native"
assert getattr(fallback, "absent", 42) == 42


class NoFallback:
    value = Missing()


assert getattr(NoFallback(), "value", 42) == 42
raises(AttributeError, getattr, NoFallback(), "value")
print("property-protocol-ok")
