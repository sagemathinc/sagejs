"""Compatibility surface for Python's private marshal format.

Sage.js does not consume CPython ``.pyc`` files.  The module exists so tools
which optionally manage CPython bytecode caches can import unchanged; trying
to serialize a code object remains an explicit unsupported operation.
"""

from __future__ import annotations

from typing import Any


version = 4


def dumps(value: Any, version: int = version) -> bytes:
    del value, version
    raise NotImplementedError("CPython marshal serialization is not supported")


def loads(data: Any) -> Any:
    del data
    raise NotImplementedError("CPython marshal deserialization is not supported")


def dump(value: Any, file: Any, version: int = version) -> None:
    file.write(dumps(value, version))


def load(file: Any) -> Any:
    return loads(file.read())
