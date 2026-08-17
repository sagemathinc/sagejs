"""Frank Lübeck's tables of Conway polynomials over finite fields.

Copyright 2005-2006 William Stein, 2010 Alexandru Ghitza, and 2013
R. Andrew Ohana. This adapter is distributed under GPL-2.0-or-later.
The separately packaged table and loader retain their GPL-3.0-or-later notice.
"""

from __future__ import annotations

from collections.abc import ItemsView as _ItemsView
from collections.abc import KeysView as _KeysView
from collections.abc import Mapping
from collections.abc import ValuesView as _ValuesView
from typing import Any, Callable, Iterator

_fast_view: Callable[[Any, str], list[Any]] | None
try:
    from sagejs_serialization import integer_tuple_table_view as _host_fast_view
except ImportError:
    _fast_view = None
else:
    _fast_view = _host_fast_view


class KeysView(_KeysView[Any]):
    """Sage-compatible dynamic view of mapping keys."""

    def __repr__(self) -> str:
        return "KeysView(%r)" % self._mapping

    def __iter__(self) -> Iterator[Any]:
        if _fast_view is not None and isinstance(self._mapping, ConwayPolynomials):
            return iter(_fast_view(_database(), "keys"))
        return super().__iter__()

    def __eq__(self, other: Any) -> bool:
        try:
            if len(self) != len(other):
                return False
            return all(key in other for key in self)
        except (AttributeError, TypeError):
            return False


class ItemsView(_ItemsView[Any, Any]):
    """Sage-compatible dynamic view of mapping items."""

    def __repr__(self) -> str:
        return "ItemsView(%r)" % self._mapping

    def __iter__(self) -> Iterator[tuple[Any, Any]]:
        if _fast_view is not None and isinstance(self._mapping, ConwayPolynomials):
            return iter(_fast_view(_database(), "items"))
        return super().__iter__()

    def __eq__(self, other: Any) -> bool:
        try:
            if len(self) != len(other):
                return False
            return all(any(item == candidate for candidate in other) for item in self)
        except (AttributeError, TypeError):
            return False


class ValuesView(_ValuesView[Any]):
    """Sage-compatible dynamic view of mapping values."""

    def __repr__(self) -> str:
        return "ValuesView(%r)" % self._mapping

    def __iter__(self) -> Iterator[Any]:
        if _fast_view is not None and isinstance(self._mapping, ConwayPolynomials):
            return iter(_fast_view(_database(), "values"))
        return super().__iter__()


def _database() -> dict[int, dict[int, tuple[int, ...]]]:
    import conway_polynomials

    return conway_polynomials.database()


def _mapping_equal(left: Mapping[Any, Any], right: Any) -> bool:
    if not isinstance(right, Mapping):
        return False
    if len(left) != len(right):
        return False
    for key in left:
        try:
            if left[key] != right[key]:
                return False
        except KeyError:
            return False
    return True


class DictInMapping(Mapping[Any, Any]):
    """A live non-assignable mapping view of a dictionary."""

    def __init__(self, dictionary: dict[Any, Any]) -> None:
        self._store = dictionary

    def __getitem__(self, key: Any) -> Any:
        return self._store[key]

    def __setitem__(self, key: Any, value: Any) -> None:
        raise TypeError("'DictInMapping' object does not support item assignment")

    def __len__(self) -> int:
        return len(self._store)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._store)

    def __contains__(self, key: Any) -> bool:
        return key in self._store

    def __bool__(self) -> bool:
        return len(self) != 0

    def __repr__(self) -> str:
        return repr(self._store)

    def keys(self) -> KeysView:
        return KeysView(self)

    def items(self) -> ItemsView:
        return ItemsView(self)

    def values(self) -> ValuesView:
        return ValuesView(self)

    def get(self, key: Any, default: Any = None) -> Any:
        return self._store.get(key, default)

    def __eq__(self, other: Any) -> bool:
        if type(other) is DictInMapping:
            return self._store == other._store
        return _mapping_equal(self, other)


class ConwayPolynomials(Mapping[tuple[int, int], tuple[int, ...]]):
    """The complete pinned Conway polynomial coefficient database."""

    def __init__(self) -> None:
        # Load eagerly like Sage, but keep the 47,090 records module-owned so
        # session synchronization never copies the whole table between cells.
        _database()

    def __repr__(self) -> str:
        return "Frank Lübeck's database of Conway polynomials"

    def __getitem__(self, key: Any) -> Any:
        store = _database()
        # Sage.js currently lowers a multi-index subscript such as `c[p, n]`
        # to a list at this compiled-module boundary. Normalize both sequence
        # forms before probing the outer integer dictionary; probing with the
        # pair was the quadratic hot path in the pilot implementation.
        if isinstance(key, (tuple, list)):
            if len(key) == 2:
                try:
                    return store[key[0]][key[1]]
                except KeyError:
                    pass
            raise KeyError(key)
        return DictInMapping(store[key])

    def __len__(self) -> int:
        try:
            return self._len
        except AttributeError:
            pass
        self._len = sum(len(degrees) for degrees in _database().values())
        return self._len

    def __iter__(self) -> Iterator[tuple[int, int]]:
        if _fast_view is not None:
            return iter(_fast_view(_database(), "keys"))
        return (
            (prime, degree)
            for prime, degrees in _database().items()
            for degree in degrees
        )

    def __bool__(self) -> bool:
        return len(self) != 0

    def __contains__(self, key: Any) -> bool:
        try:
            self[key]
            return True
        except KeyError:
            return False

    def keys(self) -> KeysView:
        return KeysView(self)

    def items(self) -> ItemsView:
        return ItemsView(self)

    def values(self) -> ValuesView:
        return ValuesView(self)

    def get(self, key: Any, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default

    def __eq__(self, other: Any) -> bool:
        if type(other) is ConwayPolynomials:
            return True
        return _mapping_equal(self, other)

    def polynomial(self, p: Any, n: Any) -> tuple[int, ...]:
        """Return coefficients, or raise Sage's exact missing-entry error."""
        try:
            return self[p, n]
        except KeyError:
            raise RuntimeError(
                "Conway polynomial over F_%s of degree %s not in database." % (p, n)
            ) from None

    def has_polynomial(self, p: Any, n: Any) -> bool:
        return (p, n) in self

    def primes(self) -> Any:
        return _database().keys()

    def degrees(self, p: Any) -> list[int]:
        store = _database()
        if p not in store:
            return []
        return list(store[p])

    def __reduce__(self) -> tuple[Any, tuple[()]]:
        return ConwayPolynomials, ()

    def __reduce_ex__(self, protocol: Any) -> tuple[Any, tuple[()]]:
        # Sage's result is independent of the pickle protocol. Declaring the
        # hook directly also avoids a compiled-runtime detour through the large
        # Mapping state before it reaches `__reduce__`.
        return self.__reduce__()

    def __getstate__(self) -> dict[Any, Any]:
        # Sage.js's compact pickle format uses explicit state hooks rather than
        # CPython's reduction protocol. The database is immutable package data
        # from the object's perspective, so no per-instance state is needed.
        return {}

    def __setstate__(self, state: dict[Any, Any]) -> None:
        _database()


__all__ = ["ConwayPolynomials", "DictInMapping"]
