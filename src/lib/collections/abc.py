"""Core collection ABCs used for runtime checks and type declarations."""

from abc import ABC


class Container(ABC):
    pass


class Hashable(ABC):
    pass


class Iterable(ABC):
    pass


class Iterator(Iterable):
    pass


class Reversible(Iterable):
    pass


class Sized(ABC):
    pass


class Collection(Sized, Iterable, Container):
    pass


class Sequence(Collection):
    pass


class MutableSequence(Sequence):
    pass


class Mapping(Collection):
    pass


class MutableMapping(Mapping):
    pass


class Set(Collection):
    pass


class MutableSet(Set):
    pass


class Callable(ABC):
    pass
