"""Small, deterministic subset of Python's :mod:`pprint`."""

from __future__ import annotations

import sys


def pformat(
    value,
    indent=1,
    width=80,
    depth=None,
    *,
    compact=False,
    sort_dicts=True,
    underscore_numbers=False,
):
    return repr(value)


def pprint(
    value,
    stream=None,
    indent=1,
    width=80,
    depth=None,
    *,
    compact=False,
    sort_dicts=True,
    underscore_numbers=False,
):
    target = sys.stdout if stream is None else stream
    target.write(
        pformat(
            value,
            indent=indent,
            width=width,
            depth=depth,
            compact=compact,
            sort_dicts=sort_dicts,
            underscore_numbers=underscore_numbers,
        )
        + "\n"
    )


def isreadable(value):
    try:
        repr(value)
        return True
    except Exception:
        return False


def isrecursive(_value):
    return False


saferepr = repr


class PrettyPrinter:
    def __init__(
        self,
        indent=1,
        width=80,
        depth=None,
        stream=None,
        *,
        compact=False,
        sort_dicts=True,
        underscore_numbers=False,
    ):
        self._stream = stream
        self._indent = indent
        self._width = width
        self._depth = depth

    def pformat(self, value):
        return pformat(value, self._indent, self._width, self._depth)

    def pprint(self, value):
        pprint(value, self._stream, self._indent, self._width, self._depth)

    def isreadable(self, value):
        return isreadable(value)

    def isrecursive(self, value):
        return isrecursive(value)

    def format(self, value, context, maxlevels, level):
        return (repr(value), True, False)
