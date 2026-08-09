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

Native Kernel v13 currently accepts a deliberately narrow typed numerical
subset, including exact ``Integer``/GMP kernels and reusable dense
decompositions over prime fields. It also supports packed binary64 buffers and
bounded record views for source-transparent numerical loops. Explicit AOT compilation produces a native
implementation plus an exact fallback or reports a compile-time diagnostic.
"""

from __future__ import annotations

import builtins
from typing import Any, TypeAlias

# Annotation-only marker understood by the source-transparent prime-field
# compiler experiment.  At runtime its values are ordinary Python lists.
uint64: TypeAlias = int
UInt64Buffer = list[int]
Float64Buffer = list[float]


class Float64Record:
    """A mutable bounded view into an ordinary binary64 fallback buffer."""

    def __init__(
        self, buffer: Float64Buffer, start: int, length: int,
    ) -> None:
        if start < 0 or length < 0 or start > len(buffer) - length:
            raise IndexError('Float64Record is outside its buffer')
        self._buffer = buffer
        self._start = start
        self._length = length

    def __len__(self) -> int:
        return self._length

    def __getitem__(self, index: int) -> float:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError('Float64Record index out of range')
        return self._buffer[self._start + index]

    def __setitem__(self, index: int, value: float) -> None:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError('Float64Record index out of range')
        self._buffer[self._start + index] = float(value)


def float64_buffer(source: Any) -> Float64Buffer:
    """Copy an iterable into an ordinary binary64 fallback buffer."""
    return [float(value) for value in source]


def float64_zeros(length: int) -> Float64Buffer:
    """Allocate a zero-filled binary64 fallback buffer."""
    return [0.0 for _index in range(length)]


def float64_record(
    buffer: Float64Buffer, start: int, length: int,
) -> Float64Record:
    """Return a bounded mutable record view into ``buffer``."""
    return Float64Record(buffer, start, length)


def prime_rows(source: Any) -> int:
    """Return the row count used by a source-transparent native kernel."""
    return source.nrows()


def prime_columns(source: Any) -> int:
    """Return the column count used by a source-transparent native kernel."""
    return source.ncols()


def prime_modulus(source: Any) -> int:
    """Return the characteristic of a dense prime-field matrix."""
    return source.base_ring().characteristic()


def prime_buffer(source: Any) -> UInt64Buffer:
    """Copy canonical residues into an ordinary row-major Python buffer."""
    return [entry.lift() for entry in source.list()]


def prime_zeros(length: int) -> UInt64Buffer:
    """Allocate a zero-filled source-kernel fallback buffer."""
    return [0 for _index in range(length)]


def prime_matrix(
    model: Any,
    rows: int,
    columns: int,
    entries: UInt64Buffer,
) -> Any:
    """Construct a matrix over ``model``'s field from row-major residues."""
    return model.parent().matrix_space(rows, columns)(entries)


def prime_add(left: int, right: int, modulus: int) -> int:
    """Add two canonical machine-word residues."""
    value = left + right
    return value - modulus if value >= modulus else value


def prime_sub(left: int, right: int, modulus: int) -> int:
    """Subtract two canonical machine-word residues."""
    return left - right if left >= right else modulus - (right - left)


def prime_mul(left: int, right: int, modulus: int) -> int:
    """Multiply two residues, reducing the exact Python product."""
    return (left * right) % modulus


def prime_inverse(value: int, modulus: int) -> int:
    """Invert a nonzero residue modulo a prime."""
    if value == 0:
        raise ZeroDivisionError('inverse of zero modulo a prime')
    old_remainder = modulus
    remainder = value
    old_coefficient = 0
    coefficient = 1
    while remainder != 0:
        quotient = old_remainder // remainder
        next_remainder = old_remainder % remainder
        next_coefficient = (
            old_coefficient - quotient * coefficient) % modulus
        old_remainder = remainder
        remainder = next_remainder
        old_coefficient = coefficient
        coefficient = next_coefficient
    return old_coefficient


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


__all__ = [
    'Float64Buffer',
    'Float64Record',
    'UInt64Buffer',
    'uint64',
    'float64_buffer',
    'float64_record',
    'float64_zeros',
    'is_compiled',
    'is_native',
    'native',
    'prime_add',
    'prime_buffer',
    'prime_columns',
    'prime_inverse',
    'prime_matrix',
    'prime_modulus',
    'prime_mul',
    'prime_rows',
    'prime_sub',
    'prime_zeros',
]
