"""Compatibility surface for Python's :mod:`gc` module.

JavaScript owns garbage collection in Sage.js, so explicit collection is only
an advisory no-op.  Keeping the function available is still important for
portable Python code and lifetime tests.
"""

_enabled = True


def collect() -> int:
    return 0


def enable() -> None:
    global _enabled
    _enabled = True
    return None


def disable() -> None:
    global _enabled
    _enabled = False
    return None


def isenabled() -> bool:
    return _enabled
