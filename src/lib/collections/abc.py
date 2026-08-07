"""Core collection ABCs used for runtime checks and type declarations."""

from abc import ABC, _register


class Container(ABC):
    pass


class Hashable(ABC):
    pass


class Iterable(ABC):
    pass


class Iterator(Iterable):
    pass


class Generator(Iterator):
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


class MappingView(Sized):
    def __init__(self, mapping):
        self._mapping = mapping

    def __len__(self):
        return len(self._mapping)


class KeysView(MappingView, Set):
    def __iter__(self):
        return iter(self._mapping)

    def __contains__(self, key):
        return key in self._mapping


class ItemsView(MappingView, Set):
    def __iter__(self):
        for key in self._mapping:
            yield key, self._mapping[key]

    def __contains__(self, item):
        try:
            key, value = item
        except (TypeError, ValueError):
            return False
        try:
            return self._mapping[key] == value
        except KeyError:
            return False


class ValuesView(MappingView, Collection):
    def __iter__(self):
        for key in self._mapping:
            yield self._mapping[key]

    def __contains__(self, value):
        return any(item == value for item in self)


# Match the virtual-subclass relationships installed by CPython's
# ``_collections_abc``.  Sage.js's fundamental containers are native-backed
# rather than Python subclasses, so explicit registration is the correct ABC
# boundary and keeps third-party runtime checks meaningful.
_register(MutableSequence, list)
for _sequence_type in (tuple, str, bytes, bytearray, range, memoryview):
    _register(Sequence, _sequence_type)
_register(MutableMapping, dict)
_register(MutableSet, set)
_register(Set, frozenset)
