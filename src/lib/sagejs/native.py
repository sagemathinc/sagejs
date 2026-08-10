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

Native Kernel v21 currently accepts a deliberately narrow typed numerical
subset, including exact ``Integer``/GMP kernels and reusable dense
decompositions over prime fields. It also supports packed binary64 buffers and
mutable signed exact-integer buffers with bounded record views. Mutable
``IntegerBuffer`` values retain arbitrary precision through an explicit packed
signed-limb ABI, so source-transparent algebraic loops can exchange whole GMP
vectors without object-at-a-time host calls. Explicit AOT compilation produces
a host-independent C core, a thin host adapter, and an exact fallback, or
reports a compile-time diagnostic. After argument marshalling, the core cannot
call Python, JavaScript, Node-API, or another interpreter runtime; unsupported
source fails compilation instead of silently inserting a callback.

Explicit imports from generated ``sagejs.ffi`` modules are also declaration-
checked at compile time. Supported calls lower directly into the isolated core
using generic ABI type adapters; they never become a host callback or a
function-name-based compiler substitution.
Fixed-schema :class:`NativeRecord` subclasses group checked scalar fields and
borrowed packed buffers into compiler-owned value structs without exposing
addresses or cleanup to mathematical source.
Opaque owned FFI resources may be lexical native locals when their declaration
provides construction and cleanup; they do not become public pointer types.
"""

from __future__ import annotations

import builtins
from typing import Any, TypeAlias

# Annotation-only marker understood by the source-transparent prime-field
# compiler experiment.  At runtime its values are ordinary Python lists.
uint64: TypeAlias = int
UInt64Buffer = list[int]
IntegerBuffer = list[int]
Int64Buffer = list[int]
Float64Buffer = list[float]
# Legacy annotation-only witness for an opaque dense matrix over ``GF(p)``.
# Production kernels instead use UInt64Buffer plus PrimeFieldModulus so their
# public ABI is independent of a host matrix object.
PrimeFieldMatrix: TypeAlias = Any
# Exact public modulus value used with explicit packed prime-field storage.
PrimeFieldModulus: TypeAlias = int
_warned_fallback_sources: set[str] = set()


class NativeRecord:
    """A fixed-schema value record shared by fallback and native kernels.

    Subclasses declare fields using ordinary annotations.  The Python
    fallback stores those values as normal attributes; the native compiler
    gives the same schema a fixed C value layout with no user-visible pointer.
    Buffer fields are borrowed for the duration of a synchronous kernel call.

    Native records deliberately do not expose addresses, allocation, cleanup,
    or arbitrary attributes to compiled code.  They are a safe compiler-owned
    replacement for the common C idiom of passing a small struct containing
    dimensions and borrowed spans.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        fields = tuple(getattr(type(self), '__annotations__', ()))
        if len(args) > len(fields):
            raise TypeError(
                f'{type(self).__name__} expects {len(fields)} field(s), '
                f'got {len(args)} positional arguments')
        assigned = set()
        for index, value in enumerate(args):
            name = fields[index]
            setattr(self, name, value)
            assigned.add(name)
        for name in fields[len(args):]:
            if name not in kwargs:
                raise TypeError(
                    f'{type(self).__name__} is missing required field {name!r}')
            setattr(self, name, kwargs.pop(name))
            assigned.add(name)
        duplicate = assigned.intersection(kwargs)
        if duplicate:
            name = sorted(duplicate)[0]
            raise TypeError(
                f'{type(self).__name__} got multiple values for field {name!r}')
        if kwargs:
            name = next(iter(kwargs))
            raise TypeError(
                f'{type(self).__name__} has no field {name!r}')

    def __repr__(self) -> str:
        fields = tuple(getattr(type(self), '__annotations__', ()))
        values = ', '.join(f'{name}={getattr(self, name)!r}' for name in fields)
        return f'{type(self).__name__}({values})'


class Int64Record:
    """A mutable bounded view into an ordinary signed-64-bit buffer.

    The native ABI represents both buffers and records as borrowed spans.  The
    Python fallback deliberately performs the same bounds and signed-range
    checks so differential execution observes one contract.
    """

    def __init__(
        self, buffer: Int64Buffer, start: int, length: int,
    ) -> None:
        if start < 0 or length < 0 or start > len(buffer) - length:
            raise IndexError('Int64Record is outside its buffer')
        self._buffer = buffer
        self._start = start
        self._length = length

    def __len__(self) -> int:
        return self._length

    def __getitem__(self, index: int) -> int:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError('Int64Record index out of range')
        return self._buffer[self._start + index]

    def __setitem__(self, index: int, value: int) -> None:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError('Int64Record index out of range')
        exact = int(value)
        if exact < -(1 << 63) or exact >= (1 << 63):
            raise OverflowError('Int64Buffer value is outside signed 64-bit')
        self._buffer[self._start + index] = exact


def int64_buffer(source: Any) -> Int64Buffer:
    """Copy an iterable into a checked signed-64-bit fallback buffer."""
    answer = []
    for value in source:
        exact = int(value)
        if exact < -(1 << 63) or exact >= (1 << 63):
            raise OverflowError('Int64Buffer value is outside signed 64-bit')
        answer.append(exact)
    return answer


def int64_zeros(length: int) -> Int64Buffer:
    """Allocate a zero-filled signed-64-bit fallback buffer."""
    return [0 for _index in range(length)]


def int64_record(
    buffer: Int64Buffer, start: int, length: int,
) -> Int64Record:
    """Return a bounded mutable signed-64-bit record view."""
    return Int64Record(buffer, start, length)


def integer_buffer(source: Any) -> IntegerBuffer:
    """Copy an iterable into an arbitrary-precision exact buffer fallback."""
    return [int(value) for value in source]


def integer_zeros(length: int) -> IntegerBuffer:
    """Allocate a zero-filled arbitrary-precision exact buffer fallback."""
    return [0 for _index in range(length)]


def kernel_int64_buffer(kernel: Any, source: Any) -> Any:
    """Pack a signed span when ``kernel`` is compiled, else return a list."""
    factory = getattr(kernel, 'createInt64Buffer', None)
    if is_compiled(kernel) and callable(factory):
        return factory(source)
    return int64_buffer(source)


def kernel_int64_zeros(kernel: Any, length: int) -> Any:
    """Allocate caller-owned signed output for a compiled kernel."""
    factory = getattr(kernel, 'createInt64Buffer', None)
    if is_compiled(kernel) and callable(factory):
        return factory(length)
    return int64_zeros(length)


def kernel_integer_buffer(kernel: Any, source: Any) -> Any:
    """Pack arbitrary-precision input once for a compiled kernel."""
    factory = getattr(kernel, 'packIntegerBuffer', None)
    if is_compiled(kernel) and callable(factory):
        return factory(source)
    return integer_buffer(source)


def kernel_integer_zeros(
    kernel: Any, length: int, word_capacity: int = 8,
) -> Any:
    """Allocate caller-owned exact output for a compiled kernel."""
    factory = getattr(kernel, 'createIntegerBuffer', None)
    if is_compiled(kernel) and callable(factory):
        return factory(length, word_capacity)
    return integer_zeros(length)


def integer_buffer_values(buffer: Any) -> Any:
    """Materialize packed exact values after an isolated kernel returns."""
    converter = getattr(buffer, 'toArray', None)
    return converter() if callable(converter) else buffer


def uint64_buffer(source: Any) -> UInt64Buffer:
    """Copy an iterable into a checked unsigned-64-bit fallback buffer."""
    answer = []
    for value in source:
        exact = int(value)
        if exact < 0 or exact >= (1 << 64):
            raise OverflowError('UInt64Buffer value is outside unsigned 64-bit')
        answer.append(exact)
    return answer


def uint64_zeros(length: int) -> UInt64Buffer:
    """Allocate a zero-filled unsigned-64-bit fallback buffer."""
    return [0 for _index in range(length)]


def kernel_uint64_buffer(kernel: Any, source: Any) -> Any:
    """Pack an unsigned span when ``kernel`` is compiled, else return a list."""
    factory = getattr(kernel, 'createUInt64Buffer', None)
    if is_compiled(kernel) and callable(factory):
        return factory(source)
    return uint64_buffer(source)


def kernel_uint64_zeros(kernel: Any, length: int) -> Any:
    """Allocate caller-owned unsigned output for a compiled kernel."""
    factory = getattr(kernel, 'createUInt64Buffer', None)
    if is_compiled(kernel) and callable(factory):
        return factory(length)
    return uint64_zeros(length)


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


def kernel_float64_buffer(kernel: Any, source: Any) -> Any:
    """Pack binary64 input once when ``kernel`` is compiled."""
    factory = getattr(kernel, 'createFloat64Buffer', None)
    if is_compiled(kernel) and callable(factory):
        return factory(source)
    return float64_buffer(source)


def kernel_float64_zeros(kernel: Any, length: int) -> Any:
    """Allocate caller-owned binary64 output for a compiled kernel."""
    factory = getattr(kernel, 'createFloat64Buffer', None)
    if is_compiled(kernel) and callable(factory):
        return factory(length)
    return float64_zeros(length)


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
        policy = getattr(
            builtins, '__sagejs_native_fallback_policy__', 'allow')
        code = getattr(function, '__code__', None)
        filename = getattr(code, 'co_filename', '<unknown>')
        name = getattr(function, '__name__', '<anonymous>')
        if policy == 'required':
            raise RuntimeError(
                f'native kernel {name} from {filename} has no matching '
                'compiled artifact; run `sagejs native compile '
                f'{filename}`')
        if policy == 'warn':
            if filename not in _warned_fallback_sources:
                _warned_fallback_sources.add(filename)
                print(
                    f'warning: native kernels from {filename} are using '
                    'dynamic fallbacks (first function: '
                    f'{name}); run `sagejs native compile {filename}`')
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


def execution_mode(function: Any, *args: Any) -> str:
    """Return the execution tier selected for a callable and optional inputs.

    The result is ``'dynamic'`` for the original Python/Sage.js function,
    ``'javascript'`` for the portable typed-IR kernel, ``'native'`` when the
    supplied arguments select an available machine-code backend, or
    ``'native-capable'`` when a compiled artifact has machine code but the
    argument-dependent backend has not been queried.
    """
    if not is_compiled(function):
        return 'dynamic'
    backend_for = getattr(function, 'backendFor', None)
    if args and callable(backend_for):
        backend = backend_for(*args)
        return (
            'javascript'
            if backend in ('bigint', 'javascript-number')
            else 'native'
        )
    return getattr(
        function, '__sagejs_native_execution_mode__',
        'native-capable' if getattr(function, 'nativeAvailable', False)
        else 'javascript')


__all__ = [
    'Float64Buffer',
    'Float64Record',
    'IntegerBuffer',
    'Int64Buffer',
    'Int64Record',
    'NativeRecord',
    'PrimeFieldMatrix',
    'PrimeFieldModulus',
    'UInt64Buffer',
    'uint64',
    'float64_buffer',
    'float64_record',
    'float64_zeros',
    'int64_buffer',
    'int64_record',
    'int64_zeros',
    'integer_buffer',
    'integer_buffer_values',
    'integer_zeros',
    'execution_mode',
    'is_compiled',
    'is_native',
    'kernel_int64_buffer',
    'kernel_int64_zeros',
    'kernel_integer_buffer',
    'kernel_integer_zeros',
    'kernel_float64_buffer',
    'kernel_float64_zeros',
    'kernel_uint64_buffer',
    'kernel_uint64_zeros',
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
    'uint64_buffer',
    'uint64_zeros',
]
