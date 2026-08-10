"""Python weak-reference interfaces backed by JavaScript weak references.

V8 controls collection scheduling, so :func:`gc.collect` cannot promise the
synchronous finalization timing provided by CPython's reference counting.
The weak references themselves and explicit `finalize` operations retain
their normal Python behavior.
"""

from __future__ import annotations

from typing import Any, Callable

import sagejs.runtime as runtime


def _weakref_rejects(value: Any) -> bool:
    if value is None or value is Ellipsis:
        return True
    if isinstance(value, (bool, int, float, str, tuple, list, dict, set)):
        return True
    value_type = runtime.jstype(value)
    return value_type != "object" and value_type != "function"


def _weakref_native(value: Any) -> Any:
    if _weakref_rejects(value):
        raise TypeError("object does not support weak references")
    return runtime.reflect.construct(runtime.weak_ref_class, [value])


def _weakref_callback(native_reference: Any) -> None:
    reference = native_reference.deref()
    if reference is not runtime.undefined:
        reference._notify_collected()


def _finalize_callback(finalizer: Any) -> None:
    finalizer._run_from_gc()


_reference_registry = runtime.reflect.construct(
    runtime.finalization_registry_class, [_weakref_callback]
)
_finalize_registry = runtime.reflect.construct(
    runtime.finalization_registry_class, [_finalize_callback]
)


class ReferenceType:
    def __init__(
        self,
        value: Any,
        callback: Callable[[Any], Any] | None = None,
    ) -> None:
        self._native_reference = _weakref_native(value)
        self._callback = callback
        self._registered = callback is not None
        if self._registered:
            _reference_registry.register(
                value,
                runtime.reflect.construct(runtime.weak_ref_class, [self]),
                self,
            )

    def __call__(self) -> Any:
        value = self._native_reference.deref()
        if value is runtime.undefined:
            return None
        return value

    def _notify_collected(self) -> None:
        if not self._registered:
            return None
        self._registered = False
        if self._callback is not None:
            self._callback(self)
        return None


ref = ReferenceType


class WeakKeyDictionary(dict):
    """Mapping-compatible weak-key surface.

    Keys remain strongly reachable in this initial implementation; observable
    collection timing is already outside Sage.js's V8 weak-reference contract.
    """


class WeakValueDictionary(dict):
    """Mapping-compatible weak-value surface; see `WeakKeyDictionary`."""


class finalize:
    def __init__(
        self,
        value: Any,
        callback: Callable[..., Any],
        *args: Any,
        **kwargs: Any,
    ) -> None:
        self._native_reference = _weakref_native(value)
        self._callback = callback
        self._args = tuple(args)
        self._kwargs = kwargs
        self._active = True
        self.atexit = True
        _finalize_registry.register(value, self, self)

    @property
    def alive(self) -> bool:
        return self._active

    def peek(self) -> Any:
        if not self._active:
            return None
        value = self._native_reference.deref()
        if value is runtime.undefined:
            return None
        return (value, self._callback, self._args, self._kwargs)

    def detach(self) -> Any:
        snapshot = self.peek()
        if snapshot is None:
            self._active = False
            return None
        _finalize_registry.unregister(self)
        self._active = False
        return snapshot

    def __call__(self) -> Any:
        if not self._active:
            return None
        _finalize_registry.unregister(self)
        self._active = False
        return self._callback(*self._args, **self._kwargs)

    def _run_from_gc(self) -> None:
        if not self._active:
            return None
        self._active = False
        self._callback(*self._args, **self._kwargs)
        return None
