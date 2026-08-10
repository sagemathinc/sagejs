"""Python language keyword predicates.

This mirrors the small public surface of CPython's :mod:`keyword` module.
The lists follow the Python grammar accepted by Sage.js's Tree-sitter
frontend; soft keywords remain context-sensitive.
"""

from __future__ import annotations


kwlist = [
    "False",
    "None",
    "True",
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
]

softkwlist = ["_", "case", "match", "type"]

_keywords = frozenset(kwlist)
_soft_keywords = frozenset(softkwlist)


def iskeyword(value: str) -> bool:
    """Return whether *value* is a Python keyword."""
    return value in _keywords


def issoftkeyword(value: str) -> bool:
    """Return whether *value* is a context-sensitive Python keyword."""
    return value in _soft_keywords


__all__ = ["iskeyword", "issoftkeyword", "kwlist", "softkwlist"]
