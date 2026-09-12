"""Ordinary CPython oracle for prepared mappings and class-body order."""

events = []
prepared = []


class Namespace(dict):
    def __getitem__(self, key):
        if key == "seed":
            events.append("read-seed")
        return super().__getitem__(key)

    def __setitem__(self, key, value):
        events.append("store:" + key)
        super().__setitem__(key, value)

    def __delitem__(self, key):
        events.append("delete:" + key)
        super().__delitem__(key)


class Meta(type):
    def __prepare__(name, bases):
        events.append("prepare:" + name)
        namespace = Namespace(seed=17)
        prepared.append(namespace)
        return namespace

    def __new__(cls, name, bases, namespace):
        assert namespace is prepared[-1]
        events.append("new:" + name)
        return type.__new__(cls, name, bases, namespace)


def decorator_expression():
    events.append("decorator-expression")

    def decorate(cls):
        events.append("decorate:" + cls.__name__)
        return cls

    return decorate


def base_expression():
    events.append("base-expression")
    return object


def meta_expression():
    events.append("meta-expression")
    return Meta


@decorator_expression()
class Example(base_expression(), metaclass=meta_expression()):
    first = seed
    events.append("body")

    def method(self, value=first):
        return value

    @property
    def value(self):
        return self.method()

    alias = value
    del first
    namespace_identity = locals()


assert Example().method() == 17
assert Example().value == 17
assert Example().alias == 17
assert Example.namespace_identity is prepared[0]
assert not hasattr(Example, "first")
# CPython 3.13/3.14 add interpreter metadata absent from earlier CPython.
# Compare the stable source namespace operations across oracle versions.
stable_events = [
    event
    for event in events
    if event
    not in (
        "store:__firstlineno__",
        "store:__static_attributes__",
        "store:__classdictcell__",
    )
]
assert stable_events == [
    "decorator-expression",
    "base-expression",
    "meta-expression",
    "prepare:Example",
    "store:__module__",
    "store:__qualname__",
    "read-seed",
    "store:first",
    "body",
    "store:method",
    "store:value",
    "store:alias",
    "delete:first",
    "store:namespace_identity",
    "new:Example",
    "decorate:Example",
]


class Inherited(Example):
    inherited_seed = seed


assert Inherited.inherited_seed == 17
assert type(Inherited) is Meta


class BadMeta(type):
    def __prepare__(name, bases):
        return 42


try:

    class Invalid(metaclass=BadMeta):
        raise AssertionError("invalid preparation must prevent body execution")

    raise AssertionError("invalid preparation must fail")
except TypeError:
    pass


class HeaderMeta(type):
    @classmethod
    def __prepare__(mcls, name, bases):
        return {"seed": 11, "shadow": 31}


def enclosing_scope():
    closure = 5

    class Annotated(metaclass=HeaderMeta):
        first = seed
        second = closure
        value: int = 3
        shadow = shadow
        total = 0
        for item in [1, 2]:
            total += item

        def method(self):
            local: int = 9
            return local

    return Annotated


Annotated = enclosing_scope()
assert (
    Annotated.first,
    Annotated.second,
    Annotated.value,
    Annotated.shadow,
    Annotated.total,
    Annotated.item,
) == (11, 5, 3, 31, 3, 2)
assert Annotated.__annotations__ == {"value": int}
assert Annotated().method() == 9
assert Annotated.__annotations__ == {"value": int}


class Outer(metaclass=HeaderMeta):
    class Inner(metaclass=HeaderMeta):
        answer = seed

    assert Inner.answer == 11


assert Outer.Inner.answer == 11


class Deleting(metaclass=HeaderMeta):
    try:
        del absent
    except NameError as saved:
        caught = True

    assert "saved" not in locals()
    from math import sqrt

    imported_result = sqrt(81)


assert Deleting.caught
assert Deleting.imported_result == 9


seed = 99


class Comprehensions(metaclass=HeaderMeta):
    items = [1, 2]
    values = [seed for index in items]
    unique = {seed for index in items}
    mapping = {index: seed for index in items}
    generated = list(seed for index in items)
    assert "index" not in locals()


assert Comprehensions.values == [99, 99]
assert Comprehensions.unique == {99}
assert Comprehensions.mapping == {1: 99, 2: 99}
assert Comprehensions.generated == [99, 99]


class NonePrepare(type):
    __prepare__ = None


try:

    class InvalidNone(metaclass=NonePrepare):
        raise AssertionError("body must not run")

    raise AssertionError("noncallable preparation must fail")
except TypeError:
    pass

print("python-prepared-namespace-ok")
