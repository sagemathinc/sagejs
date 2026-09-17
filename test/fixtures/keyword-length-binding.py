"""Keyword packet sizing preserves binding, defaults and evaluation order."""


def selected(a=11, b=13, *, scale=17):
    return a, b, scale


assert selected(scale=3) == (11, 13, 3)
assert selected(2, scale=3) == (2, 13, 3)
assert selected(2, 5, scale=3) == (2, 5, 3)


def mixed(required, optional=23):
    return required, optional


assert mixed(required=19) == (19, 23)
assert mixed(required=19, optional=29) == (19, 29)
assert mixed(19, optional=29) == (19, 29)


def variadic(a, *rest, scale=7, **extra):
    return a, rest, scale, extra


packet = {"scale": 19, "other": 23}
assert variadic(1, 2, 3, 4, **packet) == (1, (2, 3, 4), 19, {"other": 23})
assert packet == {"scale": 19, "other": 23}


def positional(a, /, b=5, *, scale=7):
    return a, b, scale


assert positional(2, scale=11) == (2, 5, 11)


def positional_capture(a=29, /, **extra):
    return a, extra


assert positional_capture(a=31) == (29, {"a": 31})


class Receiver:
    def method(self, a=11, b=13, *, scale=17):
        return a, b, scale


receiver = Receiver()
saved = receiver.method
assert receiver.method(scale=3) == (11, 13, 3)
assert saved(2, b=5, scale=3) == (2, 5, 3)
assert Receiver.method(receiver, a=2, b=5, scale=3) == (2, 5, 3)
receiver.callback = selected
assert receiver.callback(scale=3) == (11, 13, 3)

events = []


def mark(label, value):
    events.append(label)
    return value


class Lookup:
    @property
    def target(self):
        events.append("lookup")
        return selected


assert Lookup().target(mark("positional", 2), scale=mark("keyword", 3)) == (
    2,
    13,
    3,
)
assert events == ["lookup", "positional", "keyword"]

for invalid in (
    lambda: selected(1, 2, 3, scale=4),
    lambda: selected(1, a=2),
    lambda: positional(a=2, scale=3),
    lambda: selected(unknown=2),
    lambda: variadic(scale=3),
):
    try:
        invalid()
    except TypeError:
        pass
    else:
        raise AssertionError("invalid keyword binding was accepted")

print("keyword-length-binding-ok")
