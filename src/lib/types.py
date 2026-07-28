"""Small Python ``types`` compatibility layer used by Sage.js."""

from __future__ import annotations

from typing import Any, Callable


def coroutine(function: Callable[..., Any]) -> Callable[..., Any]:
    """Mark a generator function as awaitable.

    Sage.js represents both generator-based coroutines and native
    ``async def`` coroutines with its generator protocol, so the marker does
    not require a wrapper.
    """
    return function
