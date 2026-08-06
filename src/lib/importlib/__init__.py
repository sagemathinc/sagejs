"""Import machinery exposed to ordinary pure-Python packages.

The actual synchronous loader lives in the Sage.js host.  This module provides
the public convenience API on top of the same ``__import__`` hook used by
compiled import statements.
"""

import sys


def import_module(name, package=None):
    if name.startswith('.'):
        if not package:
            raise TypeError(
                "the 'package' argument is required to perform a relative import")
        level = len(name) - len(name.lstrip('.'))
        tail = name[level:]
        parts = package.split('.')
        if level > len(parts):
            raise ImportError('attempted relative import beyond top-level package')
        prefix = '.'.join(parts[:len(parts) - level + 1])
        name = prefix + ('.' + tail if tail else '')
    return __import__(name, globals(), locals(), ['*'], 0)


def invalidate_caches():
    return None


def reload(module):
    name = getattr(module, '__name__', None)
    if not name or name not in sys.modules:
        raise ImportError('module must be in sys.modules')
    # Sage.js modules are live singleton namespaces.  A future loader protocol
    # can re-execute them; returning the registered identity is the safe core.
    return sys.modules[name]

