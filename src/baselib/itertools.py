# Iterator-oriented builtins implemented as ordinary Python generators.
#
# Copyright (C) 2015 Kovid Goyal
# Copyright (C) 2026 Sage.js contributors
# License: BSD-3-Clause

from __future__ import annotations

from typing import Any, Callable, Iterable, Iterator

import sagejs.runtime as runtime


def _sum_exact_integer_range(iterable: Any, start: Any) -> Any:
    """Sum an integer range exactly without materializing or iterating it."""
    length = iterable._length
    if length == 0:
        return start
    first = iterable.start
    step = iterable.step
    last = runtime.operator_add_exact(
        first,
        runtime.operator_mul_exact(length - 1, step),
    )
    pair = runtime.operator_add_exact(first, last)
    if length % 2 == 0:
        total = runtime.operator_mul_exact(pair, length // 2)
    else:
        total = runtime.operator_mul_exact(pair // 2, length)
    return runtime.operator_add_exact(start, total)


def sum(iterable: Iterable[Any], start: Any = 0) -> Any:
    start_type = runtime.jstype(start)
    if (
        getattr(iterable, '__sagejs_range__', False)
        and (
            start_type == 'bigint'
            or (
                start_type == 'number'
                and runtime.number.isSafeInteger(start)
            )
        )
    ):
        return _sum_exact_integer_range(iterable, start)
    result = start
    for value in iterable:
        result = runtime.operator_add_exact(result, value)
    return result


@runtime.native_method
def _map_next(self: Any) -> Any:
    try:
        return runtime.reflect.apply(
            self.__map_native_next__, self, [])
    except StopIteration as error:
        result = runtime.object.create(None)
        runtime.reflect.set(result, 'value', error.value)
        runtime.reflect.set(result, 'done', True)
        return result


def _map_generator(
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
            except StopIteration as error:
                if len(error.args) == 0:
                    done = True
                    break
                else:
                    raise error  # noqa: B904
        if not done:
            try:
                yield func(*values)
            except StopIteration as error:
                raise error  # noqa: B904


def map(
    func: Any,
    *iterables: Iterable[Any],
) -> Iterator[Any]:
    iterator = _map_generator(func, *iterables)
    runtime.reflect.set(
        iterator,
        '__map_native_next__',
        runtime.reflect.get(iterator, 'next'),
    )
    runtime.reflect.set(iterator, 'next', _map_next)
    return iterator


def filter(
    func: Callable[[Any], Any] | None,
    iterable: Iterable[Any],
) -> Iterator[Any]:
    for value in iterable:
        if value if func is None else func(value):
            yield value


def zip(*iterables: Iterable[Any]) -> Iterator[Any]:
    iterators = [iter(iterable) for iterable in iterables]
    done = len(iterators) == 0
    while not done:
        values = []
        for iterator in iterators:
            try:
                values.append(next(iterator))
            except StopIteration as error:
                if len(error.args) == 0:
                    done = True
                    break
                else:
                    raise error  # noqa: B904
        if not done:
            yield runtime.math_tuple(values)


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
