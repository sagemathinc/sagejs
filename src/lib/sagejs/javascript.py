r"""Explicit access to JavaScript and project-local Node modules.

This is the public interoperability boundary for trusted Node.js hosts.  It
does not expose Sage.js's internal loader: package lookup begins in the current
working directory, or in an explicitly supplied directory, and follows Node's
normal `node_modules` rules.

CommonJS and synchronously-requireable ESM packages can be loaded directly:

```sage
    sage: from sagejs.javascript import require
    sage: path = require('node:path')
    sage: path.basename('/tmp/example.txt')
    'example.txt'
```

Locally installed packages use the same API.  For example, after
`pnpm add express` in the current project:

```python
from sagejs.javascript import require

express = require("express")
app = express()
```

The package name remains a string so scoped packages, hyphenated names, and
subpath exports are unambiguous.  Ordinary `import name` continues to mean
a Python package and never silently falls back to npm.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime


def _hook(name: str) -> Any:
    hook = runtime.reflect.get(runtime.global_object, name)
    if hook is runtime.undefined:
        raise RuntimeError("JavaScript modules are not available in this Sage.js host")
    return hook


def is_available() -> bool:
    """Return whether this host permits loading JavaScript modules.

    Browser and restricted evaluation hosts may intentionally omit this
    capability; importing :mod:`sagejs.javascript` itself remains harmless.

    ```sage
        sage: from sagejs.javascript import is_available
        sage: is_available()
        True
    ```
    """
    return (
        runtime.reflect.get(
            runtime.global_object,
            "__sagejs_javascript_require__",
        )
        is not runtime.undefined
    )


def require(specifier: str, directory: str | None = None) -> Any:
    """Load a project-local CommonJS or synchronously loadable ESM module.

    `directory` defaults to the process's current working directory.  A
    relative directory is interpreted relative to that working directory.
    Node built-ins use their standard `node:` names.

    ```sage
        sage: from sagejs.javascript import require
        sage: os = require('node:os')
        sage: isinstance(os.platform(), str)
        True
    ```
    """
    if not isinstance(specifier, str) or not specifier:
        raise TypeError("JavaScript module specifier must be a non-empty string")
    return runtime.reflect.apply(
        _hook("__sagejs_javascript_require__"),
        runtime.undefined,
        [specifier, directory],
    )


def resolve(specifier: str, directory: str | None = None) -> str:
    """Return the filename or built-in name selected by Node resolution.

    ```sage
        sage: from sagejs.javascript import resolve
        sage: resolve('node:path')
        'node:path'
    ```
    """
    if not isinstance(specifier, str) or not specifier:
        raise TypeError("JavaScript module specifier must be a non-empty string")
    return runtime.reflect.apply(
        _hook("__sagejs_javascript_resolve__"),
        runtime.undefined,
        [specifier, directory],
    )


def import_module(specifier: str, directory: str | None = None) -> Any:
    """Return a native Promise for a project-local dynamic ESM import.

    The returned object is deliberately the native JavaScript Promise so it
    can be passed directly to JavaScript APIs or an embedding host.  Packages
    without top-level await are usually simpler to load synchronously with
    :func:`require` on supported Node releases.
    """
    if not isinstance(specifier, str) or not specifier:
        raise TypeError("JavaScript module specifier must be a non-empty string")
    return runtime.reflect.apply(
        _hook("__sagejs_javascript_import__"),
        runtime.undefined,
        [specifier, directory],
    )


__all__ = ["import_module", "is_available", "require", "resolve"]
