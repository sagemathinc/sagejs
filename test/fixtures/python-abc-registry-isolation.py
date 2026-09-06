"""Virtual subclass registration flows upward, never into unrelated children."""

from abc import ABC
from collections.abc import Iterable, Mapping, Sequence


class Parser(ABC):
    pass


class ParserChild(Parser):
    pass


class Unrelated(ABC):
    pass


for cls in (Parser, ParserChild, Unrelated):
    for value in ([], {}, (), "text", set()):
        assert not isinstance(value, cls)
        assert not issubclass(type(value), cls)

assert isinstance([], Iterable)
assert isinstance([], Sequence)
assert isinstance({}, Mapping)
assert not isinstance([], Mapping)
assert not isinstance({}, Sequence)


class Concrete:
    pass


assert Parser.register(Concrete) is Concrete
assert isinstance(Concrete(), Parser)
assert issubclass(Concrete, Parser)
assert not isinstance(Concrete(), ParserChild)
assert not issubclass(Concrete, ParserChild)
assert not isinstance(Concrete(), Unrelated)


class LaterChild(Parser):
    pass


assert not isinstance(Concrete(), LaterChild)
assert not issubclass(Concrete, LaterChild)


class ChildConcrete:
    pass


ParserChild.register(ChildConcrete)


class DerivedConcrete(ChildConcrete):
    pass


for cls in (ChildConcrete, DerivedConcrete):
    for expected in (ParserChild, Parser):
        assert isinstance(cls(), expected)
        assert issubclass(cls, expected)
    for unexpected in (LaterChild, Unrelated):
        assert not isinstance(cls(), unexpected)
        assert not issubclass(cls, unexpected)

# Unrelated virtual registrations must not contaminate earlier ABCs.
Unrelated.register(list)
assert isinstance([], Unrelated)
assert issubclass(list, Unrelated)
assert not isinstance([], Parser)
assert not isinstance([], ParserChild)

print("abc-registry-isolation-ok")
