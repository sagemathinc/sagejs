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

Native Kernel v33 currently accepts a deliberately narrow typed numerical
subset, including exact `Integer`/GMP kernels and reusable dense
decompositions over prime fields. Typed `uint64` kernels support full-word
`&`, `|`, `^`, `<<`, and `>>`, including augmented scalar and buffer forms.
Left shift wraps modulo `2^64`; right shift is logical. Shift counts must be in
`0..63`: counts of `64` or more raise `OverflowError`, while negative counts
fail `uint64` validation. The `# sagejs: native-bitwise` marker preserves xor
in Sage mode and gives dynamic Sage.js the same checked exact `Number`/`BigInt`
behavior. In CPython, `uint64` remains the annotation-only alias `int`, so
overflowing shifts and out-of-range counts retain ordinary Python behavior.
The compiler also supports packed binary64 buffers and mutable signed
exact-integer buffers with bounded record views. Mutable
`IntegerBuffer` values retain arbitrary precision through an explicit packed
signed-limb ABI, so source-transparent algebraic loops can exchange whole GMP
vectors without object-at-a-time host calls. Explicit AOT compilation produces
a host-independent C core, a thin host adapter, and an exact fallback, or
reports a compile-time diagnostic. After argument marshalling, the core cannot
call Python, JavaScript, Node-API, or another interpreter runtime; unsupported
source fails compilation instead of silently inserting a callback.

Explicit imports from generated `sagejs.ffi` modules are also declaration-
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
PrimeFieldMatrix: TypeAlias = object
# Exact public modulus value used with explicit packed prime-field storage.
PrimeFieldModulus: TypeAlias = int
_warned_fallback_sources: set[str] = set()


def checked_uint64(value: int) -> uint64:
    """Return `value` as an unsigned 64-bit integer.

    This explicit conversion is useful in source-transparent native programs
    when an exact computation determines a resident shape or loop bound.  The
    dynamic fallback and compiled program both raise `OverflowError` unless
    `value` is in `0 <= value < 2^64`.
    """
    exact = int(value)
    if exact < 0 or exact >= (1 << 64):
        raise OverflowError("integer is outside unsigned 64-bit")
    return exact


class _NativeExactBudget:
    """Shared deterministic semantic-memory budget for portable exact owners."""

    def __init__(self, memory_limit: int, message: str) -> None:
        self.limit = memory_limit
        self.used = 0
        self.message = message
        self.open = True

    def reserve(self, old_charge: int, new_charge: int) -> None:
        if not self.open:
            raise ValueError("NativeExactArena is closed")
        retained = self.used - old_charge
        if new_charge > self.limit - retained:
            raise MemoryError(self.message)
        self.used = retained + new_charge

    def release(self, charge: int) -> None:
        if charge > self.used:
            raise RuntimeError("NativeExactArena semantic charge underflow")
        self.used -= charge

    def close(self) -> None:
        if self.used != 0:
            raise RuntimeError("NativeExactArena closed with live exact children")
        self.open = False


class NativeIntegerVector:
    """Lexical bounded exact-integer workspace for native kernels.

    This ordinary-Python implementation defines the portable contract. Native
    compilation replaces it with an initialized GMP vector owned by the
    surrounding `with` statement. The vector has a fixed capacity and a
    deterministic semantic memory charge; that charge deliberately does not
    claim to equal Python's, GMP's, or the process allocator's physical RSS.

    A vector is invalid after leaving its context. Negative indices are not
    accepted, so the same checked-index contract is available in C and Wasm.
    """

    _ENTRY_CHARGE = 32
    _UINT64_MAX = (1 << 64) - 1

    def __init__(
        self,
        capacity: int,
        memory_limit: int,
        _budget: _NativeExactBudget | None = None,
        _maximum_bits: int = 0,
    ) -> None:
        exact_capacity = int(capacity)
        exact_limit = int(memory_limit)
        exact_maximum_bits = int(_maximum_bits)
        if (
            exact_capacity < 0
            or exact_capacity > self._UINT64_MAX
            or exact_limit < 0
            or exact_limit > self._UINT64_MAX
            or exact_maximum_bits < 0
            or exact_maximum_bits > self._UINT64_MAX
        ):
            raise OverflowError("NativeIntegerVector dimensions are outside uint64")
        self._budget = _budget or _NativeExactBudget(
            exact_limit,
            "NativeIntegerVector memory limit exceeded",
        )
        if self._budget.limit != exact_limit:
            raise ValueError("NativeIntegerVector budget limit mismatch")
        self._maximum_payload = (exact_maximum_bits + 7) // 8
        charged_entries = exact_capacity + (
            1 if self._maximum_payload != 0 and exact_capacity != 0 else 0
        )
        base_charge = charged_entries * (self._ENTRY_CHARGE + self._maximum_payload)
        self._budget.reserve(0, base_charge)
        try:
            self._values = [0 for _index in range(exact_capacity)]
            self._payload_charges = [0 for _index in range(exact_capacity)]
        except BaseException:
            self._budget.release(base_charge)
            raise
        self._charged_bytes = base_charge
        self._open = True
        self._entered = False

    @staticmethod
    def _payload_charge(value: int) -> int:
        return (abs(value).bit_length() + 7) // 8

    def _require_open(self) -> list[int]:
        if not self._open:
            raise ValueError("NativeIntegerVector is closed")
        return self._values

    def _position(self, index: int) -> int:
        exact = int(index)
        values = self._require_open()
        if exact < 0 or exact >= len(values):
            raise IndexError("NativeIntegerVector index out of range")
        return exact

    def _replace(self, index: int, value: int) -> None:
        values = self._require_open()
        exact = int(value)
        payload = self._payload_charge(exact)
        if self._maximum_payload != 0:
            if payload > self._maximum_payload:
                raise MemoryError(self._budget.message)
            values[index] = exact
            return
        old_payload = self._payload_charges[index]
        self._budget.reserve(old_payload, payload)
        values[index] = exact
        self._payload_charges[index] = payload
        self._charged_bytes = self._charged_bytes - old_payload + payload

    def __enter__(self) -> NativeIntegerVector:
        if self._entered or not self._open:
            raise ValueError("NativeIntegerVector cannot be re-entered")
        self._entered = True
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> bool:
        self.close()
        return False

    def close(self) -> None:
        """Release the fallback workspace; repeated close is harmless."""
        if not self._open:
            return
        self._values.clear()
        self._payload_charges.clear()
        self._budget.release(self._charged_bytes)
        self._charged_bytes = 0
        self._open = False

    def __len__(self) -> int:
        return len(self._require_open())

    def __getitem__(self, index: int) -> int:
        return self._require_open()[self._position(index)]

    def __setitem__(self, index: int | slice, value: int | tuple[int, ...]) -> None:
        if isinstance(index, slice):
            if index.step not in (None, 1):
                raise ValueError("NativeIntegerVector slices require unit stride")
            if index.start is None or index.stop is None:
                raise ValueError("NativeIntegerVector slices require explicit bounds")
            if not isinstance(value, tuple):
                raise TypeError("NativeIntegerVector slice values must be a tuple")
            self.__setslice__(index.start, index.stop, value)
            return
        if isinstance(value, tuple):
            raise TypeError("NativeIntegerVector scalar value must be an integer")
        self._replace(self._position(index), value)

    def __setslice__(self, start: int, stop: int, values: tuple[int, ...]) -> None:
        """Replace a fixed contiguous range without resizing the vector.

        Bounds and values are validated before stores. Allocation exhaustion
        during a store has the same partial-write semantics as scalar stores.
        """
        current = self._require_open()
        if not isinstance(start, int) or not isinstance(stop, int):
            raise TypeError("NativeIntegerVector slice bounds must be integers")
        if start < 0 or stop < start or stop > len(current):
            raise IndexError("NativeIntegerVector slice out of range")
        if not isinstance(values, tuple):
            raise TypeError("NativeIntegerVector slice values must be a tuple")
        if stop - start != len(values):
            raise ValueError("NativeIntegerVector slice cannot resize storage")
        exact_values = tuple(int(value) for value in values)
        for offset, value in enumerate(exact_values):
            self._replace(start + offset, value)

    def _reserve_addmul(self, index: int, left: int, right: int) -> None:
        values = self._require_open()
        current = values[index]
        left_bits = abs(left).bit_length()
        right_bits = abs(right).bit_length()
        product_bits = (
            0 if left_bits == 0 or right_bits == 0 else left_bits + right_bits
        )
        result_bits = max(abs(current).bit_length(), product_bits) + 1
        conservative_payload = (result_bits + 7) // 8
        if self._maximum_payload != 0:
            if conservative_payload > self._maximum_payload:
                raise MemoryError(self._budget.message)
            return
        old_payload = self._payload_charges[index]
        self._budget.reserve(old_payload, conservative_payload)
        self._charged_bytes = self._charged_bytes - old_payload + conservative_payload
        self._payload_charges[index] = conservative_payload

    def addmul(self, index: int, left: int, right: int) -> None:
        """Set entry `index` to itself plus `left * right` in place."""
        position = self._position(index)
        exact_left = int(left)
        exact_right = int(right)
        self._reserve_addmul(position, exact_left, exact_right)
        self._values[position] += exact_left * exact_right

    def submul(self, index: int, left: int, right: int) -> None:
        """Set entry `index` to itself minus `left * right` in place."""
        position = self._position(index)
        exact_left = int(left)
        exact_right = int(right)
        self._reserve_addmul(position, exact_left, exact_right)
        self._values[position] -= exact_left * exact_right

    def swap(self, left_index: int, right_index: int) -> None:
        """Swap two entries without changing the semantic memory charge."""
        left = self._position(left_index)
        right = self._position(right_index)
        values = self._require_open()
        values[left], values[right] = values[right], values[left]
        self._payload_charges[left], self._payload_charges[right] = (
            self._payload_charges[right],
            self._payload_charges[left],
        )


class NativeIntegerMatrix:
    """Lexical bounded dense exact-integer matrix for native kernels.

    The portable implementation deliberately shares the exact entry and
    semantic-memory contract of `NativeIntegerVector`, while exposing
    a checked rectangular shape. Native compilation keeps the GMP entries
    resident and lowers `(row, column)` accesses without constructing Python
    tuples or flattening indices in mathematical source.

    Both dimensions are fixed. Negative indices and Python-style wrapping are
    intentionally unsupported so the dynamic, C, and Wasm implementations
    have one checked contract. A matrix is invalid after its `with` scope.
    """

    _UINT64_MAX = (1 << 64) - 1

    def __init__(
        self,
        rows: int,
        columns: int,
        memory_limit: int,
        _budget: _NativeExactBudget | None = None,
        _maximum_bits: int = 0,
    ) -> None:
        exact_rows = int(rows)
        exact_columns = int(columns)
        exact_limit = int(memory_limit)
        if (
            exact_rows < 0
            or exact_rows > self._UINT64_MAX
            or exact_columns < 0
            or exact_columns > self._UINT64_MAX
            or exact_limit < 0
            or exact_limit > self._UINT64_MAX
            or (exact_rows != 0 and exact_columns > self._UINT64_MAX // exact_rows)
        ):
            raise OverflowError("NativeIntegerMatrix dimensions are outside uint64")
        budget = _budget or _NativeExactBudget(
            exact_limit,
            "NativeIntegerMatrix memory limit exceeded",
        )
        if budget.limit != exact_limit:
            raise ValueError("NativeIntegerMatrix budget limit mismatch")
        try:
            self._storage = NativeIntegerVector(
                exact_rows * exact_columns,
                exact_limit,
                _budget=budget,
                _maximum_bits=_maximum_bits,
            )
        except OverflowError as error:
            raise OverflowError(
                "NativeIntegerMatrix dimensions are outside uint64"
            ) from error
        except MemoryError:
            raise
        self._rows = exact_rows
        self._columns = exact_columns
        self._open = True
        self._entered = False

    def _require_open(self) -> None:
        if not self._open:
            raise ValueError("NativeIntegerMatrix is closed")

    def _position(self, row: int, column: int) -> int:
        self._require_open()
        exact_row = int(row)
        exact_column = int(column)
        if (
            exact_row < 0
            or exact_row >= self._rows
            or exact_column < 0
            or exact_column >= self._columns
        ):
            raise IndexError("NativeIntegerMatrix index out of range")
        return exact_row * self._columns + exact_column

    def __enter__(self) -> NativeIntegerMatrix:
        if self._entered or not self._open:
            raise ValueError("NativeIntegerMatrix cannot be re-entered")
        self._entered = True
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> bool:
        self.close()
        return False

    def close(self) -> None:
        """Release the fallback matrix; repeated close is harmless."""
        if not self._open:
            return
        self._storage.close()
        self._rows = 0
        self._columns = 0
        self._open = False

    def __getitem__(self, index: tuple[int, int]) -> int:
        row, column = index
        return self._storage[self._position(row, column)]

    def __len__(self) -> int:
        self._require_open()
        return self._rows

    def __setitem__(self, index: tuple[int, int], value: int) -> None:
        row, column = index
        self._storage[self._position(row, column)] = value

    def addmul(self, row: int, column: int, left: int, right: int) -> None:
        """Add `left * right` to one checked entry in place."""
        self._storage.addmul(
            self._position(row, column),
            left,
            right,
        )

    def submul(self, row: int, column: int, left: int, right: int) -> None:
        """Subtract `left * right` from one checked entry in place."""
        self._storage.submul(
            self._position(row, column),
            left,
            right,
        )

    def swap_rows(self, left_row: int, right_row: int) -> None:
        """Swap two complete rows without allocating exact integers."""
        self._require_open()
        left = int(left_row)
        right = int(right_row)
        if left < 0 or left >= self._rows or right < 0 or right >= self._rows:
            raise IndexError("NativeIntegerMatrix row index out of range")
        for column in range(self._columns):
            self._storage.swap(
                left * self._columns + column,
                right * self._columns + column,
            )


class NativeRecordVector:
    """Fixed-capacity scalar records owned by a `NativeExactArena`.

    The first resident-record contract intentionally accepts only nonempty
    `NativeRecord` schemas whose fields are `uint64` values. Reads and
    writes copy complete records, so an entry cannot be aliased or mutated
    behind the arena's ownership graph. Native compilation represents the
    same values as fixed-layout C structs and never publishes their addresses.

    A deterministic semantic charge of sixteen bytes plus eight bytes per
    field is reserved for every entry. This is an architecture contract, not
    a claim about CPython object sizes or a host allocator's physical RSS.
    """

    _ENTRY_CHARGE = 16
    _FIELD_CHARGE = 8
    _UINT64_MAX = (1 << 64) - 1

    def __init__(
        self,
        record_type: type[NativeRecord],
        capacity: int,
        memory_limit: int,
        _budget: _NativeExactBudget | None = None,
    ) -> None:
        if not isinstance(record_type, type) or not issubclass(
            record_type, NativeRecord
        ):
            raise TypeError("NativeRecordVector requires a NativeRecord subclass")
        annotations = getattr(record_type, "__annotations__", {})
        fields = tuple(annotations)
        if not fields:
            raise TypeError("NativeRecordVector record schema has no fields")
        for name, annotation in annotations.items():
            if annotation is not int and annotation not in (
                "uint64",
                "PrimeFieldModulus",
            ):
                raise TypeError(
                    "NativeRecordVector currently requires scalar uint64 fields; "
                    f"{record_type.__name__}.{name} is unsupported"
                )
        exact_capacity = int(capacity)
        exact_limit = int(memory_limit)
        if (
            exact_capacity < 0
            or exact_capacity > self._UINT64_MAX
            or exact_limit < 0
            or exact_limit > self._UINT64_MAX
        ):
            raise OverflowError("NativeRecordVector capacity is outside uint64")
        entry_charge = self._ENTRY_CHARGE + self._FIELD_CHARGE * len(fields)
        if exact_capacity != 0 and entry_charge > self._UINT64_MAX // exact_capacity:
            raise OverflowError("NativeRecordVector capacity is outside uint64")
        self._budget = _budget or _NativeExactBudget(
            exact_limit,
            "NativeRecordVector memory limit exceeded",
        )
        if self._budget.limit != exact_limit:
            raise ValueError("NativeRecordVector budget limit mismatch")
        charge = exact_capacity * entry_charge
        self._budget.reserve(0, charge)
        try:
            zero = {name: 0 for name in fields}
            self._values = [record_type(**zero) for _index in range(exact_capacity)]
        except BaseException:
            self._budget.release(charge)
            raise
        self._record_type = record_type
        self._fields = fields
        self._charged_bytes = charge
        self._open = True

    def _require_open(self) -> list[NativeRecord]:
        if not self._open:
            raise ValueError("NativeRecordVector is closed")
        return self._values

    def _position(self, index: int) -> int:
        exact = int(index)
        values = self._require_open()
        if exact < 0 or exact >= len(values):
            raise IndexError("NativeRecordVector index out of range")
        return exact

    def _copy(self, value: NativeRecord) -> NativeRecord:
        if type(value) is not self._record_type:
            raise TypeError(
                f"NativeRecordVector requires {self._record_type.__name__} values"
            )
        copied: dict[str, int] = {}
        for name in self._fields:
            exact = int(getattr(value, name))
            if exact < 0 or exact > self._UINT64_MAX:
                raise OverflowError(
                    f"{self._record_type.__name__}.{name} is outside uint64"
                )
            copied[name] = exact
        return self._record_type(**copied)

    def close(self) -> None:
        """Release every record and its arena charge; repeated close is harmless."""
        if not self._open:
            return
        self._values.clear()
        self._budget.release(self._charged_bytes)
        self._charged_bytes = 0
        self._open = False

    def __len__(self) -> int:
        return len(self._require_open())

    def __getitem__(self, index: int) -> NativeRecord:
        return self._copy(self._require_open()[self._position(index)])

    def __setitem__(self, index: int, value: NativeRecord) -> None:
        self._require_open()[self._position(index)] = self._copy(value)


class NativeBoundedMap:
    """Deterministic fixed-capacity map from scalar records to `uint64`.

    The fallback uses the same FNV-style hash and linear probing as generated
    JavaScript and C. There is no deletion or resizing: inserting a new key
    into a full table raises `MemoryError`, while reinserting an existing key
    replaces its value and returns `False`.
    """

    _ENTRY_CHARGE = 32
    _FIELD_CHARGE = 8
    _HASH_OFFSET = 1469598103934665603
    _HASH_PRIME = 1099511628211
    _UINT64_MAX = (1 << 64) - 1

    def __init__(
        self,
        key_type: type[NativeRecord],
        capacity: int,
        memory_limit: int,
        _budget: _NativeExactBudget | None = None,
    ) -> None:
        if not isinstance(key_type, type) or not issubclass(key_type, NativeRecord):
            raise TypeError("NativeBoundedMap requires a NativeRecord key type")
        annotations = getattr(key_type, "__annotations__", {})
        fields = tuple(annotations)
        if not fields:
            raise TypeError("NativeBoundedMap key schema has no fields")
        for name, annotation in annotations.items():
            if annotation is not int and annotation != "uint64":
                raise TypeError(
                    "NativeBoundedMap currently requires scalar uint64 keys; "
                    f"{key_type.__name__}.{name} is unsupported"
                )
        exact_capacity = int(capacity)
        exact_limit = int(memory_limit)
        if (
            exact_capacity < 0
            or exact_capacity > self._UINT64_MAX
            or exact_limit < 0
            or exact_limit > self._UINT64_MAX
        ):
            raise OverflowError("NativeBoundedMap capacity is outside uint64")
        entry_charge = self._ENTRY_CHARGE + self._FIELD_CHARGE * len(fields)
        if exact_capacity != 0 and entry_charge > self._UINT64_MAX // exact_capacity:
            raise OverflowError("NativeBoundedMap capacity is outside uint64")
        self._budget = _budget or _NativeExactBudget(
            exact_limit,
            "NativeBoundedMap memory limit exceeded",
        )
        if self._budget.limit != exact_limit:
            raise ValueError("NativeBoundedMap budget limit mismatch")
        charge = exact_capacity * entry_charge
        self._budget.reserve(0, charge)
        try:
            self._keys: list[tuple[int, ...] | None] = [
                None for _index in range(exact_capacity)
            ]
            self._values = [0 for _index in range(exact_capacity)]
        except BaseException:
            self._budget.release(charge)
            raise
        self._key_type = key_type
        self._fields = fields
        self._size = 0
        self._charged_bytes = charge
        self._open = True

    def _require_open(self) -> None:
        if not self._open:
            raise ValueError("NativeBoundedMap is closed")

    def _key(self, key: NativeRecord) -> tuple[int, ...]:
        if type(key) is not self._key_type:
            raise TypeError(f"NativeBoundedMap requires {self._key_type.__name__} keys")
        values = []
        for name in self._fields:
            value = int(getattr(key, name))
            if value < 0 or value > self._UINT64_MAX:
                raise OverflowError(
                    f"{self._key_type.__name__}.{name} is outside uint64"
                )
            values.append(value)
        return tuple(values)

    def _hash(self, key: tuple[int, ...]) -> int:
        result = self._HASH_OFFSET
        for value in key:
            result ^= value
            result = (result * self._HASH_PRIME) & self._UINT64_MAX
        return result

    def _slot(self, key: tuple[int, ...]) -> tuple[int, bool]:
        self._require_open()
        capacity = len(self._keys)
        if capacity == 0:
            return 0, False
        start = self._hash(key) % capacity
        for probe in range(capacity):
            position = (start + probe) % capacity
            current = self._keys[position]
            if current is None:
                return position, False
            if current == key:
                return position, True
        return capacity, False

    def insert(self, key: NativeRecord, value: int) -> bool:
        """Insert or replace one key, returning whether a new slot was used."""
        exact_key = self._key(key)
        exact_value = int(value)
        if exact_value < 0 or exact_value > self._UINT64_MAX:
            raise OverflowError("NativeBoundedMap value is outside uint64")
        position, found = self._slot(exact_key)
        if found:
            self._values[position] = exact_value
            return False
        if position == len(self._keys):
            raise MemoryError("NativeBoundedMap capacity exceeded")
        self._keys[position] = exact_key
        self._values[position] = exact_value
        self._size += 1
        return True

    def contains(self, key: NativeRecord) -> bool:
        """Return whether `key` is present without mutating the table."""
        _position, found = self._slot(self._key(key))
        return found

    def get(self, key: NativeRecord, default: int) -> int:
        """Return the mapped value or the checked `uint64` default."""
        exact_default = int(default)
        if exact_default < 0 or exact_default > self._UINT64_MAX:
            raise OverflowError("NativeBoundedMap default is outside uint64")
        position, found = self._slot(self._key(key))
        return self._values[position] if found else exact_default

    def close(self) -> None:
        """Release the complete table and shared charge."""
        if not self._open:
            return
        self._keys.clear()
        self._values.clear()
        self._size = 0
        self._budget.release(self._charged_bytes)
        self._charged_bytes = 0
        self._open = False

    def __len__(self) -> int:
        self._require_open()
        return self._size


class NativeBoundedSet:
    """Deterministic fixed-capacity scalar-record set without resizing."""

    _ENTRY_CHARGE = 24
    _FIELD_CHARGE = 8
    _UINT64_MAX = (1 << 64) - 1

    def __init__(
        self,
        key_type: type[NativeRecord],
        capacity: int,
        memory_limit: int,
        _budget: _NativeExactBudget | None = None,
    ) -> None:
        # Reuse the map's exact schema and probing implementation, but replace
        # its deterministic charge with the smaller no-value table contract.
        entry_charge = self._ENTRY_CHARGE + self._FIELD_CHARGE * len(
            getattr(key_type, "__annotations__", {})
        )
        exact_capacity = int(capacity)
        exact_limit = int(memory_limit)
        if (
            exact_capacity < 0
            or exact_capacity > self._UINT64_MAX
            or exact_limit < 0
            or exact_limit > self._UINT64_MAX
        ):
            raise OverflowError("NativeBoundedSet capacity is outside uint64")
        if exact_capacity != 0 and entry_charge > self._UINT64_MAX // exact_capacity:
            raise OverflowError("NativeBoundedSet capacity is outside uint64")
        budget = _budget or _NativeExactBudget(
            exact_limit,
            "NativeBoundedSet memory limit exceeded",
        )
        if budget.limit != exact_limit:
            raise ValueError("NativeBoundedSet budget limit mismatch")
        charge = exact_capacity * entry_charge
        budget.reserve(0, charge)
        try:
            map_budget = _NativeExactBudget(self._UINT64_MAX, budget.message)
            self._map = NativeBoundedMap(
                key_type,
                exact_capacity,
                self._UINT64_MAX,
                _budget=map_budget,
            )
        except BaseException:
            budget.release(charge)
            raise
        self._budget = budget
        self._charged_bytes = charge
        self._open = True

    def _require_open(self) -> None:
        if not self._open:
            raise ValueError("NativeBoundedSet is closed")

    def add(self, key: NativeRecord) -> bool:
        """Insert `key`, returning `False` when it was already present."""
        self._require_open()
        try:
            return self._map.insert(key, 0)
        except MemoryError as error:
            raise MemoryError("NativeBoundedSet capacity exceeded") from error

    def contains(self, key: NativeRecord) -> bool:
        """Return whether `key` is present."""
        self._require_open()
        return self._map.contains(key)

    def close(self) -> None:
        """Release the complete set and shared charge."""
        if not self._open:
            return
        self._map.close()
        self._budget.release(self._charged_bytes)
        self._charged_bytes = 0
        self._open = False

    def __len__(self) -> int:
        self._require_open()
        return len(self._map)


class NativeSparseIntegerRows:
    """Append-only row-major sparse exact integers with fixed shape/capacity.

    Entries must be appended in strictly increasing `(row, column)` order.
    Missing lookup returns the caller-provided exact default. The values use
    the same predeclared maximum-bit contract as `NativeIntegerVector`.
    """

    _UINT64_MAX = (1 << 64) - 1

    def __init__(
        self,
        rows: int,
        columns: int,
        entry_capacity: int,
        maximum_bits: int,
        memory_limit: int,
        _budget: _NativeExactBudget | None = None,
    ) -> None:
        exact_rows = int(rows)
        exact_columns = int(columns)
        exact_capacity = int(entry_capacity)
        exact_bits = int(maximum_bits)
        exact_limit = int(memory_limit)
        if any(
            value < 0 or value > self._UINT64_MAX
            for value in (
                exact_rows,
                exact_columns,
                exact_capacity,
                exact_bits,
                exact_limit,
            )
        ):
            raise OverflowError("NativeSparseIntegerRows shape is outside uint64")
        if exact_rows > self._UINT64_MAX // 8:
            raise OverflowError("NativeSparseIntegerRows shape is outside uint64")
        metadata_charge = 32 + exact_rows * 8
        if exact_capacity > (self._UINT64_MAX - metadata_charge) // 16:
            raise OverflowError("NativeSparseIntegerRows capacity is outside uint64")
        metadata_charge += exact_capacity * 16
        budget = _budget or _NativeExactBudget(
            exact_limit,
            "NativeSparseIntegerRows memory limit exceeded",
        )
        if budget.limit != exact_limit:
            raise ValueError("NativeSparseIntegerRows budget limit mismatch")
        budget.reserve(0, metadata_charge)
        values: NativeIntegerVector | None = None
        try:
            values = NativeIntegerVector(
                exact_capacity,
                exact_limit,
                _budget=budget,
                _maximum_bits=exact_bits,
            )
            self._entry_rows = [0 for _index in range(exact_capacity)]
            self._columns = [0 for _index in range(exact_capacity)]
            self._row_lengths = [0 for _index in range(exact_rows)]
        except BaseException:
            if values is not None:
                values.close()
            budget.release(metadata_charge)
            raise
        self._values = values
        self._rows = exact_rows
        self._column_count = exact_columns
        self._capacity = exact_capacity
        self._length = 0
        self._last_row = 0
        self._last_column = 0
        self._has_last = False
        self._budget = budget
        self._metadata_charge = metadata_charge
        self._open = True

    def _require_open(self) -> None:
        if not self._open:
            raise ValueError("NativeSparseIntegerRows is closed")

    def _index(self, row: int, column: int) -> tuple[int, int]:
        exact_row = int(row)
        exact_column = int(column)
        if (
            exact_row < 0
            or exact_row >= self._rows
            or exact_column < 0
            or exact_column >= self._column_count
        ):
            raise IndexError("NativeSparseIntegerRows index out of range")
        return exact_row, exact_column

    def append(self, row: int, column: int, value: int) -> None:
        """Append one nonzero entry in strict row-major order."""
        self._require_open()
        exact_row, exact_column = self._index(row, column)
        if self._has_last and (
            exact_row < self._last_row
            or (exact_row == self._last_row and exact_column <= self._last_column)
        ):
            raise ValueError(
                "NativeSparseIntegerRows entries must be strictly row-major"
            )
        if self._length == self._capacity:
            raise MemoryError("NativeSparseIntegerRows capacity exceeded")
        self._values[self._length] = int(value)
        self._entry_rows[self._length] = exact_row
        self._columns[self._length] = exact_column
        self._row_lengths[exact_row] += 1
        self._length += 1
        self._last_row = exact_row
        self._last_column = exact_column
        self._has_last = True

    def get(self, row: int, column: int, default: int) -> int:
        """Return an exact value or `default` without inserting."""
        self._require_open()
        exact_row, exact_column = self._index(row, column)
        for position in range(self._length):
            stored_row = self._entry_rows[position]
            stored_column = self._columns[position]
            if stored_row == exact_row and stored_column == exact_column:
                return self._values[position]
            if stored_row > exact_row or (
                stored_row == exact_row and stored_column > exact_column
            ):
                break
        return int(default)

    def row_length(self, row: int) -> int:
        """Return the number of admitted entries in one checked row."""
        self._require_open()
        exact_row = int(row)
        if exact_row < 0 or exact_row >= self._rows:
            raise IndexError("NativeSparseIntegerRows row out of range")
        return self._row_lengths[exact_row]

    def close(self) -> None:
        """Release values and sparse metadata exactly once."""
        if not self._open:
            return
        self._values.close()
        self._entry_rows.clear()
        self._columns.clear()
        self._row_lengths.clear()
        self._budget.release(self._metadata_charge)
        self._metadata_charge = 0
        self._length = 0
        self._open = False

    def __len__(self) -> int:
        self._require_open()
        return self._length


class NativeExactArena:
    """One lexical semantic-memory budget for several resident exact owners.

    Children are created only through `integer_vector`, `integer_matrix`,
    `records`, `bounded_map`, `bounded_set`, `sparse_integer_rows`, and
    `foreign_resource`. They
    share one deterministic byte limit, remain private to the arena, and close
    in reverse creation order on every exit. Native compilation lowers the
    complete ownership graph without materializing child Python objects.
    A declared foreign child's size protocol remains physical-memory telemetry
    until its library operation schedule has a separate allocation proof.
    `temporary_limit` reserves the native checkpoint slab used by short-lived
    GMP allocations; it does not change the ordinary Python computation.
    """

    _UINT64_MAX = (1 << 64) - 1

    def __init__(self, memory_limit: int, temporary_limit: int) -> None:
        exact_limit = int(memory_limit)
        exact_temporary_limit = int(temporary_limit)
        if (
            exact_limit < 0
            or exact_limit > self._UINT64_MAX
            or exact_temporary_limit < 0
            or exact_temporary_limit > self._UINT64_MAX
        ):
            raise OverflowError("NativeExactArena memory limit is outside uint64")
        self._budget = _NativeExactBudget(
            exact_limit,
            "NativeExactArena memory limit exceeded",
        )
        self._temporary_limit = exact_temporary_limit
        # Exact containers and declared foreign resources share the same
        # reverse-order lexical ownership protocol.
        self._children: list[Any] = []
        self._open = True
        self._entered = False

    def _require_open(self) -> None:
        if not self._open:
            raise ValueError("NativeExactArena is closed")

    def __enter__(self) -> NativeExactArena:
        if self._entered or not self._open:
            raise ValueError("NativeExactArena cannot be re-entered")
        self._entered = True
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> bool:
        self.close()
        return False

    def integer_vector(
        self,
        capacity: int,
        maximum_bits: int,
    ) -> NativeIntegerVector:
        """Create one fixed-capacity vector charged to this arena."""
        self._require_open()
        child = NativeIntegerVector(
            capacity,
            self._budget.limit,
            _budget=self._budget,
            _maximum_bits=maximum_bits,
        )
        self._children.append(child)
        return child

    def integer_matrix(
        self,
        rows: int,
        columns: int,
        maximum_bits: int,
    ) -> NativeIntegerMatrix:
        """Create one fixed-shape row-major matrix charged to this arena."""
        self._require_open()
        child = NativeIntegerMatrix(
            rows,
            columns,
            self._budget.limit,
            _budget=self._budget,
            _maximum_bits=maximum_bits,
        )
        self._children.append(child)
        return child

    def records(
        self,
        record_type: type[NativeRecord],
        capacity: int,
    ) -> NativeRecordVector:
        """Create one fixed-capacity scalar record vector in this arena."""
        self._require_open()
        child = NativeRecordVector(
            record_type,
            capacity,
            self._budget.limit,
            _budget=self._budget,
        )
        self._children.append(child)
        return child

    def bounded_map(
        self,
        key_type: type[NativeRecord],
        value_type: type[uint64],
        capacity: int,
    ) -> NativeBoundedMap:
        """Create a deterministic `NativeRecord` to `uint64` map."""
        self._require_open()
        if value_type is not int:
            raise TypeError("NativeExactArena.bounded_map value type must be uint64")
        child = NativeBoundedMap(
            key_type,
            capacity,
            self._budget.limit,
            _budget=self._budget,
        )
        self._children.append(child)
        return child

    def bounded_set(
        self,
        key_type: type[NativeRecord],
        capacity: int,
    ) -> NativeBoundedSet:
        """Create a deterministic bounded set of scalar records."""
        self._require_open()
        child = NativeBoundedSet(
            key_type,
            capacity,
            self._budget.limit,
            _budget=self._budget,
        )
        self._children.append(child)
        return child

    def sparse_integer_rows(
        self,
        rows: int,
        columns: int,
        entry_capacity: int,
        maximum_bits: int,
    ) -> NativeSparseIntegerRows:
        """Create append-only row-major sparse exact storage."""
        self._require_open()
        child = NativeSparseIntegerRows(
            rows,
            columns,
            entry_capacity,
            maximum_bits,
            self._budget.limit,
            _budget=self._budget,
        )
        self._children.append(child)
        return child

    def foreign_resource(self, factory: Any, *arguments: Any) -> Any:
        """Own one declared foreign resource for the arena's lexical lifetime.

        CPython executes `factory` normally and requires an idempotent `close`
        method. Native compilation accepts only a statically imported declared
        resource constructor with an owned result and generated clear/size
        metadata; arbitrary callables fail lowering.
        """
        self._require_open()
        child = factory(*arguments)
        if not callable(getattr(child, "close", None)):
            raise TypeError("NativeExactArena foreign resource must be closeable")
        self._children.append(child)
        return child

    def close(self) -> None:
        """Close every child in reverse creation order, then the arena."""
        if not self._open:
            return
        while self._children:
            self._children.pop().close()
        self._budget.close()
        self._open = False


class RationalBuffer:
    """Owned normalized exact-rational storage for fallback execution.

    Native hosts replace each component with the compiler's packed
    `IntegerBuffer` representation.  Keeping the two spans explicit makes
    the ownership and standalone ABI independent of Python, JavaScript, and
    Node-API object layouts.  Every entry is reduced and has a positive
    denominator; zero is represented as `0/1`.

    Source-transparent kernels currently receive the two component buffers
    as ordinary `IntegerBuffer` parameters.  This makes every arithmetic
    operation visible in their Python bodies while this class provides the
    canonical aggregate at mathematical object boundaries.
    """

    def __init__(
        self,
        numerators: IntegerBuffer,
        denominators: IntegerBuffer,
    ) -> None:
        if len(numerators) != len(denominators):
            raise ValueError("rational buffer component lengths differ")
        self.numerators = []
        self.denominators = []
        for index in range(len(numerators)):
            numerator = int(numerators[index])
            denominator = int(denominators[index])
            if denominator == 0:
                raise ZeroDivisionError("rational buffer denominator is zero")
            if numerator == 0:
                self.numerators.append(0)
                self.denominators.append(1)
                continue
            if denominator < 0:
                numerator = -numerator
                denominator = -denominator
            left = abs(numerator)
            right = denominator
            while right:
                left, right = right, left % right
            self.numerators.append(numerator // left)
            self.denominators.append(denominator // left)

    def __len__(self) -> int:
        return len(self.numerators)

    def __getitem__(self, index: int) -> tuple[int, int]:
        return self.numerators[index], self.denominators[index]


class NativeWorkspace:
    """Immutable bindings to existing live exact workspaces.

    Declare owner fields as annotations in a subclass and supply them
    positionally. Native compilation erases the bundle into borrowed helper
    parameters: construction does not allocate or copy resident storage.
    Bundles cannot escape native code or extend an owner's lexical lifetime.
    The fallback retains the same owners and checks liveness on field access.
    """

    def __init__(self, *owners: Any) -> None:
        fields = getattr(type(self), "__annotations__", {})
        if len(fields) != len(owners):
            raise TypeError("workspace requires all positional fields")
        members = {}
        for (name, annotation), owner in zip(fields.items(), owners, strict=True):
            expected = (
                annotation if isinstance(annotation, str) else annotation.__name__
            )
            if type(owner).__name__ != expected:
                raise TypeError(f"workspace field {name} requires {expected}")
            self._check_owner(owner)
            members[name] = owner
        object.__setattr__(self, "_workspace_members", members)

    @staticmethod
    def _check_owner(owner: Any) -> None:
        if isinstance(owner, NativeIntegerVector):
            owner._require_open()
        elif callable(getattr(owner, "_ffi_borrow", None)):
            owner._ffi_borrow()
        else:
            raise TypeError("workspace member must be a live exact owner")

    def __getattr__(self, name: str) -> Any:
        members = self._workspace_members
        if name not in members:
            raise AttributeError(name)
        owner = members[name]
        self._check_owner(owner)
        return owner

    def __setattr__(self, name: str, value: Any) -> None:
        raise AttributeError("workspace fields are immutable bindings")


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
        fields = tuple(getattr(type(self), "__annotations__", ()))
        if len(args) > len(fields):
            raise TypeError(
                f"{type(self).__name__} expects {len(fields)} field(s), "
                f"got {len(args)} positional arguments"
            )
        assigned = set()
        for index, value in enumerate(args):
            name = fields[index]
            setattr(self, name, value)
            assigned.add(name)
        for name in fields[len(args) :]:
            if name not in kwargs:
                raise TypeError(
                    f"{type(self).__name__} is missing required field {name!r}"
                )
            setattr(self, name, kwargs.pop(name))
            assigned.add(name)
        duplicate = assigned.intersection(kwargs)
        if duplicate:
            name = sorted(duplicate)[0]
            raise TypeError(
                f"{type(self).__name__} got multiple values for field {name!r}"
            )
        if kwargs:
            name = next(iter(kwargs))
            raise TypeError(f"{type(self).__name__} has no field {name!r}")

    def __repr__(self) -> str:
        fields = tuple(getattr(type(self), "__annotations__", ()))
        values = ", ".join(f"{name}={getattr(self, name)!r}" for name in fields)
        return f"{type(self).__name__}({values})"


class Int64Record:
    """A mutable bounded view into an ordinary signed-64-bit buffer.

    The native ABI represents both buffers and records as borrowed spans.  The
    Python fallback deliberately performs the same bounds and signed-range
    checks so differential execution observes one contract.
    """

    def __init__(
        self,
        buffer: Int64Buffer,
        start: int,
        length: int,
    ) -> None:
        if start < 0 or length < 0 or start > len(buffer) - length:
            raise IndexError("Int64Record is outside its buffer")
        self._buffer = buffer
        self._start = start
        self._length = length

    def __len__(self) -> int:
        return self._length

    def __getitem__(self, index: int) -> int:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError("Int64Record index out of range")
        return self._buffer[self._start + index]

    def __setitem__(self, index: int, value: int) -> None:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError("Int64Record index out of range")
        exact = int(value)
        if exact < -(1 << 63) or exact >= (1 << 63):
            raise OverflowError("Int64Buffer value is outside signed 64-bit")
        self._buffer[self._start + index] = exact


def int64_buffer(source: Any) -> Int64Buffer:
    """Copy an iterable into a checked signed-64-bit fallback buffer."""
    answer = []
    for value in source:
        exact = int(value)
        if exact < -(1 << 63) or exact >= (1 << 63):
            raise OverflowError("Int64Buffer value is outside signed 64-bit")
        answer.append(exact)
    return answer


def int64_zeros(length: int) -> Int64Buffer:
    """Allocate a zero-filled signed-64-bit fallback buffer."""
    return [0 for _index in range(length)]


def int64_record(
    buffer: Int64Buffer,
    start: int,
    length: int,
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
    """Pack a signed span when `kernel` is compiled, else return a list."""
    factory = getattr(kernel, "createInt64Buffer", None)
    if is_compiled(kernel) and callable(factory):
        return factory(source)
    return int64_buffer(source)


def kernel_int64_zeros(kernel: Any, length: int) -> Any:
    """Allocate caller-owned signed output for a compiled kernel."""
    factory = getattr(kernel, "createInt64Buffer", None)
    if is_compiled(kernel) and callable(factory):
        return factory(length)
    return int64_zeros(length)


def kernel_integer_buffer(kernel: Any, source: Any) -> Any:
    """Pack arbitrary-precision input once for a compiled kernel."""
    factory = getattr(kernel, "packIntegerBuffer", None)
    if is_compiled(kernel) and callable(factory):
        return factory(source)
    return integer_buffer(source)


def kernel_integer_zeros(
    kernel: Any,
    length: int,
    word_capacity: int = 8,
) -> Any:
    """Allocate caller-owned exact output for a compiled kernel."""
    factory = getattr(kernel, "createIntegerBuffer", None)
    if is_compiled(kernel) and callable(factory):
        return factory(length, word_capacity)
    return integer_zeros(length)


def integer_buffer_values(buffer: Any) -> Any:
    """Materialize packed exact values after an isolated kernel returns."""
    converter = getattr(buffer, "toArray", None)
    return converter() if callable(converter) else buffer


def uint64_buffer(source: Any) -> UInt64Buffer:
    """Copy an iterable into a checked unsigned-64-bit fallback buffer."""
    answer = []
    for value in source:
        exact = int(value)
        if exact < 0 or exact >= (1 << 64):
            raise OverflowError("UInt64Buffer value is outside unsigned 64-bit")
        answer.append(exact)
    return answer


def uint64_zeros(length: int) -> UInt64Buffer:
    """Allocate a zero-filled unsigned-64-bit fallback buffer."""
    return [0 for _index in range(length)]


def kernel_uint64_buffer(kernel: Any, source: Any) -> Any:
    """Pack an unsigned span when `kernel` is compiled, else return a list."""
    factory = getattr(kernel, "createUInt64Buffer", None)
    if is_compiled(kernel) and callable(factory):
        return factory(source)
    return uint64_buffer(source)


def kernel_uint64_zeros(kernel: Any, length: int) -> Any:
    """Allocate caller-owned unsigned output for a compiled kernel."""
    factory = getattr(kernel, "createUInt64Buffer", None)
    if is_compiled(kernel) and callable(factory):
        return factory(length)
    return uint64_zeros(length)


class Float64Record:
    """A mutable bounded view into an ordinary binary64 fallback buffer."""

    def __init__(
        self,
        buffer: Float64Buffer,
        start: int,
        length: int,
    ) -> None:
        if start < 0 or length < 0 or start > len(buffer) - length:
            raise IndexError("Float64Record is outside its buffer")
        self._buffer = buffer
        self._start = start
        self._length = length

    def __len__(self) -> int:
        return self._length

    def __getitem__(self, index: int) -> float:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError("Float64Record index out of range")
        return self._buffer[self._start + index]

    def __setitem__(self, index: int, value: float) -> None:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError("Float64Record index out of range")
        self._buffer[self._start + index] = float(value)


def float64_buffer(source: Any) -> Float64Buffer:
    """Copy an iterable into an ordinary binary64 fallback buffer."""
    return [float(value) for value in source]


def float64_zeros(length: int) -> Float64Buffer:
    """Allocate a zero-filled binary64 fallback buffer."""
    return [0.0 for _index in range(length)]


def float64_record(
    buffer: Float64Buffer,
    start: int,
    length: int,
) -> Float64Record:
    """Return a bounded mutable record view into `buffer`."""
    return Float64Record(buffer, start, length)


def kernel_float64_buffer(kernel: Any, source: Any) -> Any:
    """Pack binary64 input once when `kernel` is compiled."""
    factory = getattr(kernel, "createFloat64Buffer", None)
    if is_compiled(kernel) and callable(factory):
        return factory(source)
    return float64_buffer(source)


def kernel_float64_zeros(kernel: Any, length: int) -> Any:
    """Allocate caller-owned binary64 output for a compiled kernel."""
    factory = getattr(kernel, "createFloat64Buffer", None)
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
    """Construct a matrix over `model`'s field from row-major residues."""
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
        raise ZeroDivisionError("inverse of zero modulo a prime")
    old_remainder = modulus
    remainder = value
    old_coefficient = 0
    coefficient = 1
    while remainder != 0:
        quotient = old_remainder // remainder
        next_remainder = old_remainder % remainder
        next_coefficient = (old_coefficient - quotient * coefficient) % modulus
        old_remainder = remainder
        remainder = next_remainder
        old_coefficient = coefficient
        coefficient = next_coefficient
    return old_coefficient


def _compiled(function: Any) -> Any:
    hook = getattr(builtins, "__sagejs_native_resolve__", None)
    if hook is None:
        return None
    code = getattr(function, "__code__", None)
    filename = getattr(code, "co_filename", "")
    name = getattr(function, "__name__", "")
    return hook(filename, name)


def _copy_metadata(source: Any, target: Any) -> None:
    for name in (
        "__name__",
        "__qualname__",
        "__module__",
        "__doc__",
        "__annotations__",
        "__defaults__",
        "__kwdefaults__",
        "__code__",
        "__globals__",
    ):
        value = getattr(source, name, None)
        try:
            setattr(target, name, value)
        except (AttributeError, TypeError):
            pass


def _set_metadata(target: Any, name: str, value: Any) -> None:
    setattr(target, name, value)


def _bind_source_defaults(source: Any, compiled: Any) -> Any:
    # Keep the explicit host boundary lazy so importing this marker module
    # under CPython never requires a JavaScript runtime.
    from sagejs._native_defaults import bind_source_defaults

    return bind_source_defaults(source, compiled)


def native(function: Any) -> Any:
    """Mark `function` as an experimental native-compilation candidate.

    CPython and Sage.js without a matching compiled artifact receive the
    unmodified callable. Sage.js otherwise returns the verified compiled
    implementation while retaining the source function as `__wrapped__`.
    """
    if not callable(function):
        raise TypeError("@native expects a callable")
    replacement = _compiled(function)
    private_fallback = getattr(builtins, "__sagejs_native_private_fallback__", None)
    if private_fallback is not None and replacement is private_fallback:
        # This function is an authenticated same-source private member of a
        # compiled dependency graph.  It deliberately has no public host ABI:
        # compiled callers invoke its native body directly, while an external
        # Python call retains this ordinary source implementation even when
        # strict native loading is requested.
        replacement = function
    elif replacement is None:
        policy = getattr(builtins, "__sagejs_native_fallback_policy__", "allow")
        code = getattr(function, "__code__", None)
        filename = getattr(code, "co_filename", "<unknown>")
        name = getattr(function, "__name__", "<anonymous>")
        if policy == "required":
            raise RuntimeError(
                f"native kernel {name} from {filename} has no matching "
                "compiled artifact; run `sagejs native compile "
                f"{filename}`"
            )
        if policy == "warn":
            if filename not in _warned_fallback_sources:
                _warned_fallback_sources.add(filename)
                print(
                    f"warning: native kernels from {filename} are using "
                    "dynamic fallbacks (first function: "
                    f"{name}); run `sagejs native compile {filename}`"
                )
        replacement = function
    else:
        bind_fallback = getattr(replacement, "__sagejs_native_bind_fallback__", None)
        if callable(bind_fallback):
            replacement = bind_fallback(function)
        replacement = _bind_source_defaults(function, replacement)
        _copy_metadata(function, replacement)
        _set_metadata(replacement, "__wrapped__", function)
        _set_metadata(replacement, "__sagejs_native_compiled__", True)
    _set_metadata(replacement, "__sagejs_native__", True)
    _set_metadata(replacement, "__sagejs_native_source__", function)
    return replacement


def is_native(function: Any) -> bool:
    """Return whether `function` carries the :func:`native` marker."""
    return bool(getattr(function, "__sagejs_native__", False))


def is_compiled(function: Any) -> bool:
    """Return whether `function` resolved to a compiled implementation."""
    return bool(getattr(function, "__sagejs_native_compiled__", False))


def execution_mode(function: Any, *args: Any) -> str:
    """Return the execution tier selected for a callable and optional inputs.

    The result is `'dynamic'` for the original Python/Sage.js function,
    `'javascript'` for the portable typed-IR kernel, `'native'` when the
    supplied arguments select an available machine-code backend, or
    `'native-capable'` when a compiled artifact has machine code but the
    argument-dependent backend has not been queried.
    """
    if not is_compiled(function):
        return "dynamic"
    source = getattr(function, "__sagejs_native_source__", None)
    if args and source is not None:
        if len(args) != len(getattr(source, "__argnames__", ())):
            return "dynamic"
        if getattr(source, "__kwonly__", ()):
            return "dynamic"
    backend_for = getattr(function, "backendFor", None)
    if args and callable(backend_for):
        backend = backend_for(*args)
        return "javascript" if backend in ("bigint", "javascript-number") else "native"
    return getattr(
        function,
        "__sagejs_native_execution_mode__",
        "native-capable"
        if getattr(function, "nativeAvailable", False)
        else "javascript",
    )


__all__ = [
    "Float64Buffer",
    "Float64Record",
    "IntegerBuffer",
    "Int64Buffer",
    "Int64Record",
    "NativeExactArena",
    "NativeBoundedMap",
    "NativeBoundedSet",
    "NativeSparseIntegerRows",
    "NativeIntegerMatrix",
    "NativeIntegerVector",
    "NativeRecord",
    "NativeWorkspace",
    "NativeRecordVector",
    "PrimeFieldMatrix",
    "PrimeFieldModulus",
    "RationalBuffer",
    "UInt64Buffer",
    "uint64",
    "checked_uint64",
    "float64_buffer",
    "float64_record",
    "float64_zeros",
    "int64_buffer",
    "int64_record",
    "int64_zeros",
    "integer_buffer",
    "integer_buffer_values",
    "integer_zeros",
    "execution_mode",
    "is_compiled",
    "is_native",
    "kernel_int64_buffer",
    "kernel_int64_zeros",
    "kernel_integer_buffer",
    "kernel_integer_zeros",
    "kernel_float64_buffer",
    "kernel_float64_zeros",
    "kernel_uint64_buffer",
    "kernel_uint64_zeros",
    "native",
    "prime_add",
    "prime_buffer",
    "prime_columns",
    "prime_inverse",
    "prime_matrix",
    "prime_modulus",
    "prime_mul",
    "prime_rows",
    "prime_sub",
    "prime_zeros",
    "uint64_buffer",
    "uint64_zeros",
]
