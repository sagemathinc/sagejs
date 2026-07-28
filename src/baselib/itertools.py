# Iterator-oriented builtins implemented as ordinary Python generators.
#
# Copyright (C) 2015 Kovid Goyal
# Copyright (C) 2026 Sage.js contributors
# License: BSD-3-Clause

from __future__ import annotations

from typing import Any, Callable, Iterable, Iterator

import sagejs.runtime as runtime


def sum(iterable: Iterable[Any], start: Any = 0) -> Any:
    result = start
    for value in iterable:
        result = runtime.operator_add_exact(result, value)
    return result


def map(
    func: Any,
    *iterables: Iterable[Any],
) -> Iterator[Any]:
    iterators = [iter(iterable) for iterable in iterables]
    done = False
    while not done:
        values = []
        for iterator in iterators:
            try:
                values.append(next(iterator))
            except StopIteration:
                done = True
                break
        if not done:
            yield func(*values)


def filter(
    func: Callable[[Any], Any] | None,
    iterable: Iterable[Any],
) -> Iterator[Any]:
    for value in iterable:
        if value if func is None else func(value):
            yield value


def zip(*iterables: Iterable[Any]) -> Iterator[list[Any]]:
    iterators = [iter(iterable) for iterable in iterables]
    done = False
    while not done:
        values = []
        for iterator in iterators:
            try:
                values.append(next(iterator))
            except StopIteration:
                done = True
                break
        if not done:
            yield values


def any(iterable: Iterable[Any]) -> bool:
    for value in iterable:
        if value:
            return True
    return False


def all(iterable: Iterable[Any]) -> bool:
    for value in iterable:
        if not value:
            return False
    return True
