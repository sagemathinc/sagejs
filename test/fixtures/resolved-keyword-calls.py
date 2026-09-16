"""Resolved attribute calls evaluate their target once before arguments."""

events = []


class Child:
    def method(self, value=0):
        events.append(("call", value))
        return value


child = Child()


class Holder:
    @property
    def child(self):
        events.append("lookup")
        return child


holder = Holder()


def argument():
    events.append("argument")
    return 7


assert holder.child.method(value=argument()) == 7
assert events == ["lookup", "argument", ("call", 7)]
events.clear()
assert holder.child.method(*[argument()]) == 7
assert events == ["lookup", "argument", ("call", 7)]
events.clear()


def receiver():
    events.append("receiver")
    return holder


assert receiver().child.method(value=argument()) == 7
assert events == ["receiver", "lookup", "argument", ("call", 7)]
events.clear()


def literal_keywords(__proto__, ordinary):
    return __proto__, ordinary


assert literal_keywords(__proto__=3, ordinary=5) == (3, 5)


def binding_probe(required, optional=2, *, keyword=3, **extras):
    return required, optional, keyword, extras


# Positional keywords use the general binder; keyword-only arguments and
# **kwargs can use the validated packet directly.
assert binding_probe(required=1) == (1, 2, 3, {})
assert binding_probe(1, optional=4) == (1, 4, 3, {})
assert binding_probe(1, keyword=5) == (1, 2, 5, {})
assert binding_probe(1, optional=4, keyword=5, extra=6) == (
    1,
    4,
    5,
    {"extra": 6},
)


def closed_binding(required, optional=2, *, keyword=3):
    return required, optional, keyword


for invalid, expected in (
    (lambda: closed_binding(1, 2, optional=5), "multiple values"),
    (lambda: closed_binding(1, bad=4), "unexpected keyword"),
    (lambda: closed_binding(1, 2, bad=4, optional=5), "unexpected keyword"),
    (lambda: closed_binding(1, 2, optional=5, bad=4), "multiple values"),
    (lambda: closed_binding(optional=4), "required"),
):
    try:
        invalid()
    except TypeError as error:
        assert expected in str(error)
    else:
        raise AssertionError("invalid function keyword binding was accepted")


def positional_packet(value, /, **extras):
    return value, extras


assert positional_packet(1, value=2) == (1, {"value": 2})


# The generated prologue reads only definition-time defaulted names from
# keyword packets. Expanding live defaults must not drop explicit keywords.
def expanded_defaults(required, optional=2, *, keyword=3, **extras):
    return required, optional, keyword, extras


expanded_defaults.__defaults__ = (10, 20)
assert expanded_defaults(required=5) == (5, 20, 3, {})
assert expanded_defaults(required=5, optional=6, keyword=7, extra=8) == (
    5,
    6,
    7,
    {"extra": 8},
)
expanded_defaults.__defaults__ = (30,)
assert expanded_defaults(required=9) == (9, 30, 3, {})


class NotCallable:
    target = 3


def invalid_receiver():
    events.append("receiver")
    return NotCallable()


def starred_arguments():
    events.append("arguments")
    return []


try:
    invalid_receiver().target(*starred_arguments())
except TypeError:
    pass
else:
    raise AssertionError("noncallable target was accepted")
assert events == ["receiver", "arguments"]
events.clear()


def replacement(value=0):
    return "replacement", value


saved = child.method


def mutate():
    child.method = replacement
    return 11


assert holder.child.method(value=mutate()) == 11
assert child.method(value=3) == ("replacement", 3)
assert saved(value=5) == 5
del child.method
assert child.method(value=3) == 3


def replacement_method(self, value=0):
    return "class-replacement", value


original_method = Child.method
Child.method = replacement_method
assert child.method(value=6) == ("class-replacement", 6)
Child.method = original_method
assert child.method(value=6) == 6
events.clear()


class Hooked:
    def __getattribute__(self, name):
        events.append(("getattribute", name))
        return object.__getattribute__(self, name)

    def method(self, value=0):
        return value


assert Hooked().method(value=8) == 8
assert events == [("getattribute", "method")]
events.clear()


class Descriptor:
    def __get__(self, instance, owner):
        return replacement


class WithDescriptor:
    method = Descriptor()


assert WithDescriptor().method(value=2) == ("replacement", 2)
assert Child.method(child, value=4) == 4
assert "a,b".split(sep=",") == ["a", "b"]
for method in ("a,b,c".split, "a,b,c".rsplit):
    assert method(sep=",") == ["a", "b", "c"]
assert "a,b,c".split(sep=",", maxsplit=1) == ["a", "b,c"]
assert "a,b,c".rsplit(sep=",", maxsplit=1) == ["a,b", "c"]
assert str.split("a,b,c", sep=",", maxsplit=1) == ["a", "b,c"]
assert str.rsplit("a,b,c", sep=",", maxsplit=1) == ["a,b", "c"]
assert "a\nb".splitlines(keepends=True) == ["a\n", "b"]
assert "hello".encode(encoding="utf-8") == b"hello"
assert "a\tb".expandtabs(tabsize=4) == "a   b"
for invalid in (
    lambda: "a,b".split(",", sep=","),
    lambda: "a,b".rsplit(",", sep=","),
    lambda: "a,b".split(separator=","),
    lambda: "a,b".rsplit(separator=","),
    lambda: "a,b".split(unknown=True),
    lambda: "ab".replace(old="a", replacement="c"),
):
    try:
        invalid()
    except TypeError:
        pass
    else:
        raise AssertionError("invalid string keyword binding was accepted")
print("resolved-keyword-calls-ok")
