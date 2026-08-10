"""Bounded object representations compatible with :mod:`reprlib`."""

from __future__ import annotations

import builtins


_builtin_repr = builtins.repr


def recursive_repr(fillvalue="..."):
    def decorate(function):
        running = set()

        def wrapper(self):
            key = id(self)
            if key in running:
                return fillvalue
            running.add(key)
            try:
                return function(self)
            finally:
                running.remove(key)

        return wrapper

    return decorate


class Repr:
    def __init__(self):
        self.maxlevel = 6
        self.maxtuple = 6
        self.maxlist = 6
        self.maxarray = 5
        self.maxdict = 4
        self.maxset = 6
        self.maxfrozenset = 6
        self.maxdeque = 6
        self.maxstring = 30
        self.maxlong = 40
        self.maxother = 30
        self.fillvalue = "..."

    def _truncate(self, value, limit):
        if len(value) <= limit:
            return value
        left = max(0, (limit - 3) // 2)
        right = max(0, limit - 3 - left)
        return value[:left] + self.fillvalue + value[len(value) - right :]

    def repr(self, value):
        return self.repr1(value, self.maxlevel)

    def repr1(self, value, level):
        method = getattr(self, "repr_" + type(value).__name__, None)
        if method is None:
            return self.repr_instance(value, level)
        return method(value, level)

    def _repr_sequence(self, value, level, limit, opening, closing):
        if len(value) == 0:
            return opening + closing
        if level <= 0:
            return opening + self.fillvalue + closing
        pieces = [self.repr1(item, level - 1) for item in value[:limit]]
        if len(value) > limit:
            pieces.append(self.fillvalue)
        if opening == "(" and len(value) == 1:
            return "(" + pieces[0] + ",)"
        return opening + ", ".join(pieces) + closing

    def repr_tuple(self, value, level):
        return self._repr_sequence(value, level, self.maxtuple, "(", ")")

    def repr_list(self, value, level):
        return self._repr_sequence(value, level, self.maxlist, "[", "]")

    def repr_set(self, value, level):
        if len(value) == 0:
            return "set()"
        return self._repr_sequence(list(value), level, self.maxset, "{", "}")

    def repr_frozenset(self, value, level):
        return (
            "frozenset("
            + self._repr_sequence(list(value), level, self.maxfrozenset, "{", "}")
            + ")"
        )

    def repr_dict(self, value, level):
        if len(value) == 0:
            return "{}"
        if level <= 0:
            return "{" + self.fillvalue + "}"
        pieces = []
        for index, key in enumerate(value):
            if index >= self.maxdict:
                pieces.append(self.fillvalue)
                break
            pieces.append(
                self.repr1(key, level - 1) + ": " + self.repr1(value[key], level - 1)
            )
        return "{" + ", ".join(pieces) + "}"

    def repr_str(self, value, _level):
        return self._truncate(_builtin_repr(value), self.maxstring)

    repr_bytes = repr_str

    def repr_int(self, value, _level):
        return self._truncate(_builtin_repr(value), self.maxlong)

    def repr_instance(self, value, _level):
        return self._truncate(_builtin_repr(value), self.maxother)


aRepr = Repr()
repr = aRepr.repr
