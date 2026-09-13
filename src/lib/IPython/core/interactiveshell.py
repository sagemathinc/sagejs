"""Small session shell implementing the display surface used by ipywidgets."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime


def _host_function(name: str) -> Any:
    function = runtime.reflect.get(runtime.global_object, name)
    if not runtime.strict_equal(runtime.jstype(function), "function"):
        raise RuntimeError(
            "Sage.js IPython compatibility requires an interactive evaluator; "
            + name
            + " is unavailable"
        )
    return function


class EventManager:
    """Ordered callback registry compatible with IPython shell events."""

    def __init__(self) -> None:
        self.callbacks: dict[str, list[Any]] = {}

    def register(self, name: str, callback: Any) -> None:
        callbacks = self.callbacks.setdefault(name, [])
        if callback not in callbacks:
            callbacks.append(callback)

    def unregister(self, name: str, callback: Any) -> None:
        callbacks = self.callbacks.get(name, [])
        callbacks.remove(callback)

    def trigger(self, name: str, *args: Any, **kwargs: Any) -> None:
        for callback in list(self.callbacks.get(name, [])):
            callback(*args, **kwargs)


class DisplayFormatter:
    """Format Python objects into a Jupyter MIME bundle and metadata pair."""

    def format(
        self,
        obj: Any,
        include: Any = None,
        exclude: Any = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        del include, exclude
        result = runtime.reflect.apply(
            _host_function("__sagejs_format_display__"),
            runtime.undefined,
            [obj],
        )
        data = runtime.reflect.get(result, "data")
        metadata = runtime.reflect.get(result, "metadata")
        return dict(data), dict(metadata)


class InteractiveShell:
    """Session-local subset of `IPython.core.interactiveshell.InteractiveShell`."""

    _instance: Any = None

    def __init__(self) -> None:
        self.events = EventManager()
        self.display_formatter = DisplayFormatter()
        self.kernel = self
        self._parent: dict[str, Any] = {}

    @classmethod
    def instance(cls) -> InteractiveShell:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def clear_instance(cls) -> None:
        cls._instance = None

    def get_parent(self) -> dict[str, Any]:
        parent = runtime.reflect.apply(
            _host_function("__sagejs_get_parent__"), runtime.undefined, []
        )
        if len(runtime.object.keys(parent)):
            return dict(parent)
        return self._parent

    def set_parent(self, parent: dict[str, Any]) -> None:
        self._parent = parent
        runtime.reflect.apply(
            _host_function("__sagejs_set_parent__"),
            runtime.undefined,
            [parent],
        )

    def showtraceback(
        self,
        exc_tuple: Any = None,
        filename: Any = None,
        tb_offset: Any = None,
        exception_only: Any = False,
        running_compiled_code: Any = False,
    ) -> None:
        del filename, tb_offset, exception_only, running_compiled_code
        error = exc_tuple[1] if exc_tuple is not None else RuntimeError("unknown error")
        runtime.reflect.apply(
            _host_function("__sagejs_showtraceback__"),
            runtime.undefined,
            [error],
        )


__all__ = ["DisplayFormatter", "EventManager", "InteractiveShell"]
