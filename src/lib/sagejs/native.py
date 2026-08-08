r"""Experimental markers for ahead-of-time native Sage.js functions.

The :func:`native` decorator deliberately preserves the original Python
function.  It is both the ordinary Sage.js/CPython fallback and the readable
source consumed by the Native Kernel compiler.  A build can compile every
marked function in a module and load the generated implementation without
maintaining a separate C version of the algorithm.

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

Native Kernel v1 currently accepts a deliberately narrow typed numerical
subset.  Decorating a function never changes its behavior by itself: explicit
AOT compilation either produces a native implementation plus JavaScript
fallback or reports a compile-time diagnostic.
"""

from __future__ import annotations

from typing import Any, cast


def native(function: Any) -> Any:
    """Mark ``function`` as an experimental native-compilation candidate.

    The unmodified callable is returned, matching the graceful-fallback model
    used by Cython annotations and allowing the same file to run in CPython.
    """
    if not callable(function):
        raise TypeError('@native expects a callable')
    cast(Any, function).__sagejs_native__ = True
    return function


def is_native(function: Any) -> bool:
    """Return whether ``function`` carries the :func:`native` marker."""
    return bool(getattr(function, '__sagejs_native__', False))


__all__ = ['is_native', 'native']
