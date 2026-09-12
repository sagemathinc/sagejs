from __future__ import annotations

from inspect import getfullargspec, iscoroutinefunction, isgeneratorfunction, signature

events = []


def mark(name, value):
    events.append(name)
    return value


class Namespace(dict):
    def __setitem__(self, name, value):
        if name in ("seed", "method", "visible"):
            events.append("store-" + name)
        super().__setitem__(name, value)


class Meta(type):
    @classmethod
    def __prepare__(mcls, name, bases):
        events.append("prepare")
        return Namespace()


class PlainBase:
    def base_value(self):
        return 30


class PreparedBase(PlainBase, metaclass=Meta):
    pass


def class_decorator(cls):
    events.append("decorate-class")
    return cls


def passthrough(function):
    return function


def create(base):
    captured = 3

    @mark("class-decorator-expression", class_decorator)
    class Product(mark("base-expression", base)):
        seed = mark("seed", 5)

        def __init__(self, value=mark("init-default", seed)):
            self.value = value

        def method(
            self,
            amount: int = mark("default", seed),
            *,
            bias=mark("keyword-default", 2),
        ) -> int:
            local = self.value + amount + bias + captured
            return local

        alias = method

        def owner(self):
            return Product

        def parent_value(self):
            return super().base_value()

        def closure(self):
            def inner():
                return self.value + captured

            return inner()

        def returned_closure(self):
            def inner():
                return self.value + captured

            return inner

        async def coroutine(self, value=2):
            return self.value + captured + value

        def nested_type(self):
            class Nested(PlainBase):
                def nested_owner(self):
                    return Nested

            return Nested

        def generator(self):
            received = yield self.value
            yield received
            return 23

        def throwing_generator(self):
            try:
                yield self.value
            except ValueError as error:
                yield str(error)

        @passthrough
        def decorated(self, value=4):
            return self.value + value

        def positional(self, /, value=6):
            return self.value + value

        def alternate_receiver(receiver):
            return receiver.value

        @property
        def visible(self):
            return self.value

        @visible.setter
        def visible(self, value):
            self.value = value

        @staticmethod
        def static(value=7):
            return value

        @staticmethod
        def update_capture(value):
            nonlocal captured
            captured = value

        @classmethod
        def class_method(cls):
            return cls

    return Product


for base in (PlainBase, PreparedBase):
    events.clear()
    cls = create(base)
    expected = ["class-decorator-expression", "base-expression"]
    if base is PreparedBase:
        expected.append("prepare")
    expected.append("seed")
    if base is PreparedBase:
        expected.append("store-seed")
    expected.extend(["init-default", "default", "keyword-default"])
    if base is PreparedBase:
        expected.extend(["store-method", "store-visible", "store-visible"])
    expected.append("decorate-class")
    assert events == expected, events
    obj = cls()
    assert obj.method() == 15
    assert obj.method(4, bias=1) == 13
    assert obj.owner() is cls
    assert obj.parent_value() == 30
    assert obj.closure() == 8
    coroutine = obj.coroutine()
    try:
        coroutine.send(None)
    except StopIteration as error:
        assert error.value == 10
    else:
        assert False
    if base is PreparedBase:
        assert isgeneratorfunction(cls.generator)
        assert iscoroutinefunction(cls.coroutine)
    nested = obj.nested_type()
    assert nested().nested_owner() is nested
    assert cls.static() == 7
    assert cls.class_method() is cls
    assert obj.visible == 5
    obj.visible = 9
    assert obj.visible == 9
    assert obj.decorated() == 13
    assert obj.positional() == 15
    assert obj.alternate_receiver() == 9
    generator = obj.generator()
    assert next(generator) == 9
    assert generator.send(17) == 17
    try:
        next(generator)
    except StopIteration as error:
        assert error.value == 23
    else:
        assert False
    generator = obj.throwing_generator()
    assert next(generator) == 9
    assert generator.throw(ValueError("sent")) == "sent"
    generator.close()
    assert list(cls.generator(obj)) == [9, None]
    fn = cls.method
    assert fn is cls.method
    assert cls.alias is fn
    assert obj.alias.__func__ is fn
    assert getfullargspec(fn).args == ["self", "amount"]
    assert list(signature(fn).parameters) == ["self", "amount", "bias"]
    assert fn.__code__.co_varnames == ("self", "amount", "bias", "local")
    fn.__defaults__ = (11,)
    fn.__kwdefaults__["bias"] = 13
    assert obj.method() == 36
    assert fn(obj) == 36
    assert obj.alias() == 36
    fn.__kwdefaults__ = {"bias": 17}
    assert obj.method() == 40
    fn.__defaults__ = None
    try:
        obj.method()
    except TypeError:
        pass
    else:
        assert False
    fn.__defaults__ = (11,)
    saved = obj.method
    cls.method = lambda self: 99
    assert obj.method() == 99
    assert saved() == 40
    closure = obj.returned_closure()
    cls.update_capture(20)
    assert closure() == 29
    assert saved() == 57

first = create(PlainBase)
second = create(PreparedBase)
assert first.method is not second.method
assert first.method.__kwdefaults__ is not second.method.__kwdefaults__


class default:
    def __init__(self, value=31):
        self.value = value


assert default.__init__.__name__ == "__init__"
assert default().value == 31
print("shared-class-method-factories-ok")
