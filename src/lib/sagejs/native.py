r"""Experimental markers for ahead-of-time native Sage.js functions.

The :func:`native` decorator keeps the original Python function as a portable
fallback and as readable input to the Native Kernel compiler.  In Sage.js it
automatically resolves a source-hash-verified compiled artifact when one is
available; CPython simply receives the original function.  This makes it
possible to compile marked functions without maintaining a separate C version
of the algorithm or changing their call sites.

```sage
    sage: from sagejs.native import native, is_native
    sage: @native
    ....: def square(value: int) -> int:
    ....:     return value * value
    sage: square(7)
    49
    sage: is_native(square)
    True
```

Native Kernel v8 currently accepts a deliberately narrow typed numerical
subset, including exact ``Integer``/GMP kernels and dense matrix kernels over
prime fields. Explicit AOT compilation produces a native implementation plus
an exact fallback or reports a compile-time diagnostic.
"""

from __future__ import annotations

import builtins
from typing import Any


def _compiled(function: Any) -> Any:
    hook = getattr(builtins, '__sagejs_native_resolve__', None)
    if hook is None:
        return None
    code = getattr(function, '__code__', None)
    filename = getattr(code, 'co_filename', '')
    name = getattr(function, '__name__', '')
    return hook(filename, name)


def _copy_metadata(source: Any, target: Any) -> None:
    for name in (
        '__name__',
        '__qualname__',
        '__module__',
        '__doc__',
        '__annotations__',
        '__defaults__',
        '__kwdefaults__',
        '__code__',
        '__globals__',
    ):
        value = getattr(source, name, None)
        try:
            setattr(target, name, value)
        except (AttributeError, TypeError):
            pass


def _set_metadata(target: Any, name: str, value: Any) -> None:
    setattr(target, name, value)


def native(function: Any) -> Any:
    """Mark ``function`` as an experimental native-compilation candidate.

    CPython and Sage.js without a matching compiled artifact receive the
    unmodified callable. Sage.js otherwise returns the verified compiled
    implementation while retaining the source function as ``__wrapped__``.
    """
    if not callable(function):
        raise TypeError('@native expects a callable')
    replacement = _compiled(function)
    if replacement is None:
        replacement = function
    else:
        _copy_metadata(function, replacement)
        _set_metadata(replacement, '__wrapped__', function)
        _set_metadata(replacement, '__sagejs_native_compiled__', True)
    _set_metadata(replacement, '__sagejs_native__', True)
    _set_metadata(replacement, '__sagejs_native_source__', function)
    return replacement


def is_native(function: Any) -> bool:
    """Return whether ``function`` carries the :func:`native` marker."""
    return bool(getattr(function, '__sagejs_native__', False))


def is_compiled(function: Any) -> bool:
    """Return whether ``function`` resolved to a compiled implementation."""
    return bool(getattr(function, '__sagejs_native_compiled__', False))


__all__ = ['is_compiled', 'is_native', 'native']
