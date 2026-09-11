"""Cold implementations of the public copy and flatten conveniences."""

from __future__ import annotations

from typing import Any

_Int = int


def copy(value: Any) -> Any:
    """Return a shallow copy, matching Python's `copy.copy` convenience API."""
    copier = getattr(value, "__copy__", None)
    if callable(copier):
        return copier()
    copier = getattr(value, "copy", None)
    if callable(copier):
        return copier()
    if isinstance(value, (str, bytes, int, float, complex, tuple, frozenset)):
        return value
    try:
        return type(value)(value)
    except Exception:
        raise TypeError("object does not support shallow copying")  # noqa: B904


def flatten(
    in_list: Any,
    ltypes: Any = None,
    max_level: _Int = 1000000000,
) -> list[Any]:
    """Flatten nested values of the selected types into a new list.

    The outer input is always iterated. `max_level=0` keeps its elements
    unchanged, while larger values recursively flatten that many nested
    levels. By default only lists and tuples are flattened, matching Sage.
    """
    use_default_types = ltypes is None
    answer = []
    values = list(in_list)
    pending = []
    for index in range(len(values) - 1, -1, -1):
        pending.append((values[index], 0))
    while pending:
        value, level = pending.pop()
        flatten_value = (
            isinstance(value, (list, tuple))
            if use_default_types
            else isinstance(value, ltypes)
        )
        if level < max_level and flatten_value:
            nested = list(value)
            for index in range(len(nested) - 1, -1, -1):
                pending.append((nested[index], level + 1))
        else:
            answer.append(value)
    return answer
