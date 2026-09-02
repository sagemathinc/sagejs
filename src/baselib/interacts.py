"""Lazy Sage-global entry points for ipywidgets-backed interacts."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

_interacts_module_cache = runtime.undefined
_display_module_cache = runtime.undefined


def _display_module() -> Any:
    global _display_module_cache
    if _display_module_cache is runtime.undefined:
        _display_module_cache = __import__(
            "sagejs.interacts.display",
            fromlist=["html"],
        )
    return _display_module_cache


class _LazyHTMLFactory:
    """Load HTML support only when a rich fragment is requested."""

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return _display_module().html(*args, **kwargs)

    def iframe(self, *args: Any, **kwargs: Any) -> Any:
        return _display_module().html.iframe(*args, **kwargs)

    def __repr__(self) -> str:
        return "Create HTML output (see html? for details)"


html = _LazyHTMLFactory()


def pretty_print(*args: Any, **options: Any) -> None:
    """Publish arguments through the active rich-display backend."""
    _display_module().pretty_print(*args, **options)


def _interacts_module() -> Any:
    global _interacts_module_cache
    if _interacts_module_cache is runtime.undefined:
        _interacts_module_cache = __import__(
            "sagejs.interacts",
            fromlist=["interact"],
        )
    return _interacts_module_cache


def interact(__interact_f: Any = None, **kwargs: Any) -> Any:
    """Create a Sage interact using standard ipywidgets models."""
    return _interacts_module().interact(__interact_f, **kwargs)


def _interact_options(**kwargs: Any) -> Any:
    return _interacts_module().interact.options(**kwargs)


runtime.reflect.set(interact, "options", _interact_options)


def input_box(*args: Any, **kwargs: Any) -> Any:
    return _interacts_module().input_box(*args, **kwargs)


def slider(*args: Any, **kwargs: Any) -> Any:
    return _interacts_module().slider(*args, **kwargs)


def range_slider(*args: Any, **kwargs: Any) -> Any:
    return _interacts_module().range_slider(*args, **kwargs)


def checkbox(*args: Any, **kwargs: Any) -> Any:
    return _interacts_module().checkbox(*args, **kwargs)


def selector(*args: Any, **kwargs: Any) -> Any:
    return _interacts_module().selector(*args, **kwargs)


def color_selector(*args: Any, **kwargs: Any) -> Any:
    return _interacts_module().color_selector(*args, **kwargs)


def input_grid(*args: Any, **kwargs: Any) -> Any:
    return _interacts_module().input_grid(*args, **kwargs)


def text_control(*args: Any, **kwargs: Any) -> Any:
    return _interacts_module().text_control(*args, **kwargs)


class _InteractsNamespace:
    """Lazy compatibility namespace for Sage's bundled teaching interacts."""

    def __getattr__(self, name: str) -> Any:
        module = __import__("sage.interacts.all", fromlist=[name])
        try:
            return getattr(module, name)
        except AttributeError:
            raise AttributeError("unknown bundled interact {!r}".format(name))  # noqa: B904

    def __dir__(self) -> list[str]:
        return ["calculus", "demo", "statistics"]

    def __repr__(self) -> str:
        return "<lazy module 'sage.interacts.all'>"


interacts = _InteractsNamespace()
