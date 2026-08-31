"""Lazy Sage-global entry points for ipywidgets-backed interacts."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

_interacts_module_cache = runtime.undefined


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
