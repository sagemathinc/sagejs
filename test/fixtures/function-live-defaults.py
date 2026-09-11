import inspect


def raises(error, function, *args, **kwargs):
    try:
        function(*args, **kwargs)
    except error:
        return
    raise AssertionError("expected exception")


def required(a):
    return a


assert required.__defaults__ is None
assert required.__kwdefaults__ is None
assert required.__dict__ == {}
raises(TypeError, required)
required.__defaults__ = (1,)
assert required() == 1
required.__kwdefaults__ = {"a": 99}
assert required() == 1
assert inspect.signature(required).parameters["a"].default == 1
required.__defaults__ = (2, 3)
assert required() == 3
assert inspect.signature(required).parameters["a"].default == 2
del required.__defaults__
assert required.__defaults__ is None
raises(TypeError, required)
raises(TypeError, setattr, required, "__defaults__", [1])
raises(TypeError, setattr, required, "__kwdefaults__", (1,))


def unrelated(a=12):
    return a


required.__func__ = unrelated
required.__defaults__ = (11,)
assert required.__defaults__ == (11,)
assert unrelated.__defaults__ == (12,)
assert required() == 11
required.__func__ = None
assert required.__defaults__ == (11,)
required.__defaults__ = (13,)
assert required() == 13
del required.__func__


def required_keyword(*, x):
    return x


required_keyword.__kwdefaults__ = {"x": 7}
assert required_keyword() == 7
required_keyword.__kwdefaults__ = None
raises(TypeError, required_keyword)

events = []


def once(label):
    events.append(label)
    return []


def optional(a=once("positional"), *, x=once("keyword")):
    return a, x


assert events == ["positional", "keyword"]
assert isinstance(optional.__defaults__, tuple)
assert len(optional.__defaults__) == 1
assert isinstance(optional.__kwdefaults__, dict)
a, x = optional()
assert a is optional.__defaults__[0]
assert x is optional.__kwdefaults__["x"]
a.append(42)
assert optional()[0] == [42]
optional.__kwdefaults__["x"] = 2
assert optional()[1] == 2
assigned = {"x": 3, 1: "not a keyword"}
optional.__kwdefaults__ = assigned
assert optional.__kwdefaults__ is assigned
assigned["x"] = 4
assert optional()[1] == 4
del assigned["x"]
raises(TypeError, optional)
assigned["x"] = 5
assert optional()[1] == 5
del optional.__kwdefaults__
assert optional.__kwdefaults__ is None
raises(TypeError, optional)
assert optional(x=6)[1] == 6


class DefaultDict(dict):
    def get(self, *args):
        raise AssertionError("binding must bypass dict.get overrides")

    def __missing__(self, key):
        raise AssertionError("binding must bypass dict.__missing__")


required_keyword.__kwdefaults__ = DefaultDict(x=8)
assert required_keyword() == 8
required_keyword.__kwdefaults__.clear()
raises(TypeError, required_keyword)


class Namespace:
    pass


namespace = Namespace()
required_keyword.__kwdefaults__ = namespace.__dict__
raises(TypeError, required_keyword)
namespace.x = 9
assert required_keyword() == 9
namespace.x = 10
assert required_keyword() == 10


class Example:
    def method(self, a=1, *, x=2):
        return a, x


obj = Example()
saved = obj.method
defaults = saved.__kwdefaults__
assert defaults is Example.method.__kwdefaults__
defaults["x"] = 3
assert obj.method() == (1, 3)
Example.method.__defaults__ = (4,)
assert obj.method() == (4, 3)
assert saved.__defaults__ == (4,)
replacement = {"x": 5}
Example.method.__kwdefaults__ = replacement
assert saved.__kwdefaults__ is replacement
assert saved() == (4, 5)
raises(AttributeError, setattr, saved, "__defaults__", (9,))


class argmap:
    def make(self):
        def wrapped(*args, __wrapper=None, **kwargs):
            return __wrapper

        wrapped.__kwdefaults__["_argmap__wrapper"] = wrapped
        return wrapped


wrapped = argmap().make()
assert "_argmap__wrapper" in wrapped.__code__.co_varnames
assert "__wrapper" not in wrapped.__code__.co_varnames
assert wrapped() is wrapped


def named(a, /, b=2, *, c=3):
    return a, b, c


assert named(1, c=4) == (1, 2, 4)
raises(TypeError, named, 1, 2, 3, c=4)
named.__defaults__ = None
raises(TypeError, named, 1, c=4)
assert named(1, b=2, c=4) == (1, 2, 4)
raises(SyntaxError, exec, "named(a=1, a=2)")


def duplicate_mapping():
    return required(**{"a": 1}, **{"a": 2})


raises(TypeError, duplicate_mapping)


def tuples(a=(1, 2), *, b=(3, 4)):
    return a, b


assert tuples.__defaults__ == ((1, 2),)
assert tuples.__kwdefaults__ == {"b": (3, 4)}
assert tuples() == ((1, 2), (3, 4))

print("live-function-defaults-ok")
