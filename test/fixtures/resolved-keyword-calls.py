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
