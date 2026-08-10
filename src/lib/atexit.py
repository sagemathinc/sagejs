"""Exit-handler registration compatible with Python's :mod:`atexit`."""

from __future__ import annotations

from typing import Any, Callable

import sagejs.runtime as runtime


_callbacks: list[Any] = []


def register(func: Callable[..., Any], *args: Any, **kwargs: Any) -> Callable[..., Any]:
    if not callable(func):
        raise TypeError("the first argument must be callable")
    _callbacks.append((func, args, kwargs))
    return func


def unregister(func: Callable[..., Any]) -> None:
    retained = []
    for callback, args, kwargs in _callbacks:
        if callback != func:
            retained.append((callback, args, kwargs))
    _callbacks[:] = retained


def _clear() -> None:
    _callbacks.clear()


def _ncallbacks() -> int:
    return len(_callbacks)


def _run_exitfuncs() -> None:
    last_error = None
    while _callbacks:
        callback, args, kwargs = _callbacks.pop()
        try:
            callback(*args, **kwargs)
        except BaseException as error:
            last_error = error
    if last_error is not None:
        raise last_error


_process = runtime.reflect.get(runtime.global_object, "process")
if _process is not runtime.undefined:
    _once = runtime.reflect.get(_process, "once")
    if _once is not runtime.undefined:

        def _process_exit(*_args: Any) -> None:
            _run_exitfuncs()

        runtime.reflect.apply(_once, _process, ["exit", _process_exit])


__all__ = ["register", "unregister"]
