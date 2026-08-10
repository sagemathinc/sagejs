"""Finalize Python-facing introspection after loading the base library.

The base library is compiled into one global JavaScript scope for historical
and startup-performance reasons.  Record its private implementation names once
initialization is complete so that `dir()` and REPL completion can hide them
without hiding private names subsequently created by user code.
"""

from typing import Any

import sagejs.runtime as runtime


def _is_private_baselib_name(name: Any) -> bool:
    return (
        runtime.jstype(name) == "string"
        and runtime.string_find(name, "_") == 0
        and runtime.string_find(name, "__") != 0
    )


_private_baselib_names = []
for _global_name in runtime.object.getOwnPropertyNames(runtime.global_object):
    if _is_private_baselib_name(_global_name):
        _private_baselib_names.append(_global_name)


runtime.reflect.set(
    runtime.global_object,
    "__sagejs_baselib_private_names__",
    _private_baselib_names,
)
