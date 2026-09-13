"""Narrow IPython compatibility facade for Sage.js display and widgets."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

__version__ = "9.5.0-sagejs"


def _ensure_comm_backend() -> None:
    from sagejs.widgets.comm_backend import install

    install()


def get_ipython() -> Any:
    """Return the session-local Sage.js shell, or `None` outside an evaluator."""
    hook = runtime.reflect.get(runtime.global_object, "__sagejs_display_publish__")
    if not runtime.strict_equal(runtime.jstype(hook), "function"):
        return None
    _ensure_comm_backend()
    from IPython.core.interactiveshell import InteractiveShell

    return InteractiveShell.instance()


__all__ = ["get_ipython"]


# Importing the facade establishes the session-local comm backend. The package
# remains lazy because neither IPython nor comm is loaded before first use.
if runtime.strict_equal(
    runtime.jstype(
        runtime.reflect.get(runtime.global_object, "__sagejs_comm_publish__")
    ),
    "function",
):
    _ensure_comm_backend()
