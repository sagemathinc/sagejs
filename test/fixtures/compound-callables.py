"""Compound callable values preserve Python argument evaluation order."""

events = []


class A:
    def __call__(self, x=0):
        events.append("call")
        return x + 1

    def __add__(self, other):
        events.append("add")
        return type(self)()

    def __neg__(self):
        events.append("neg")
        return self

    def __pos__(self):
        return self

    def __invert__(self):
        return self


class B(A):
    pass


class Own(A):
    def __call__(self, x=0):
        events.append("call")
        return x + 1


for value in (B(), Own()):
    assert value(3) == 4
    saved = value + value
    assert saved(3) == 4
    assert (value + value)(3) == 4
    assert (value + value)() == 1
    assert (value + value)(*[3]) == 4
    assert (value + value)(x=3) == 4  # Existing keyword path remains unchanged.
    assert (value if True else None)(3) == 4
    assert (None if False else value)(*[3]) == 4
    assert (False or value)(3) == 4
    assert (value and value)(3) == 4
    assert (-value)(3) == 4
    assert (+value)(3) == 4
    assert (~value)(3) == 4
    selected = None
    assert (selected := value)(3) == 4
    assert selected is value


value = B()


def operand(label):
    events.append(label)
    return value


def argument():
    events.append("argument")
    return 3


def condition():
    events.append("condition")
    return True


def expanded():
    events.append("expand")
    yield argument()


def unselected():
    raise AssertionError("unselected conditional operand was evaluated")


events.clear()
assert (operand("left") + operand("right"))(argument()) == 4
assert events == ["left", "right", "add", "argument", "call"]
events.clear()
assert (-operand("operand"))(*expanded()) == 4
assert events == ["operand", "neg", "expand", "argument", "call"]
events.clear()
assert (operand("chosen") if condition() else unselected())(argument()) == 4
assert events == ["condition", "chosen", "argument", "call"]


def replace_call():
    events.append("replace")
    B.__call__ = lambda self, x: x + 10
    return 3


events.clear()
assert (value + value)(replace_call()) == 13
assert events == ["add", "replace"]

number = 1
for invalid in (
    lambda: (number + number)(argument()),
    lambda: (-number)(argument()),
    lambda: (None if True else value)(argument()),
    lambda: (number + number)(*expanded()),
):
    events.clear()
    try:
        invalid()
    except TypeError:
        pass
    else:
        raise AssertionError("noncallable expression was accepted")
    assert events in (["argument"], ["expand", "argument"])


def bad_argument():
    events.append("bad-argument")
    raise ValueError("argument wins")


events.clear()
try:
    (number + number)(bad_argument())
except ValueError as error:
    assert str(error) == "argument wins"
else:
    raise AssertionError("target validation suppressed the argument exception")
assert events == ["bad-argument"]
print("compound-callables-ok")
