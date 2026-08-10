"""A small Python-compatible implementation of :mod:`array`.

The values remain ordinary Python/Sage.js integers and floats.  Conversion to
the binary buffer representation is explicit, which keeps this module useful
without tying the public object model to JavaScript typed-array limitations.
"""

from __future__ import annotations

from typing import Any, Iterator

import sagejs.runtime as runtime


_TYPE_INFO = {
    "b": [1, True, False],
    "B": [1, False, False],
    "h": [2, True, False],
    "H": [2, False, False],
    "i": [4, True, False],
    "I": [4, False, False],
    "l": [8, True, False],
    "L": [8, False, False],
    "q": [8, True, False],
    "Q": [8, False, False],
    "f": [4, True, True],
    "d": [8, True, True],
}


def _typed_view(name: str, constructor_values: list[Any]) -> Any:
    constructor = runtime.reflect.get(runtime.global_object, name)
    return runtime.reflect.construct(constructor, constructor_values)


def _native_little_endian() -> bool:
    words = _typed_view("Uint16Array", [[1]])
    octets = _typed_view("Uint8Array", [words.buffer])
    return octets[0] == 1


_LITTLE_ENDIAN = _native_little_endian()


def _float_to_bytes(value: Any, size: int) -> list[int]:
    buffer = runtime.reflect.construct(
        runtime.reflect.get(runtime.global_object, "ArrayBuffer"), [size]
    )
    view = _typed_view("DataView", [buffer])
    method_name = "setFloat32" if size == 4 else "setFloat64"
    runtime.reflect.apply(
        runtime.reflect.get(view, method_name),
        view,
        [
            0,
            runtime.number(
                value if runtime.jstype(value) == "number" else float(value)
            ),
            _LITTLE_ENDIAN,
        ],
    )
    octets = _typed_view("Uint8Array", [buffer])
    return [octets[index] for index in range(size)]


def _float_from_bytes(raw: Any, offset: int, size: int) -> float:
    buffer = runtime.reflect.construct(
        runtime.reflect.get(runtime.global_object, "ArrayBuffer"), [size]
    )
    octets = _typed_view("Uint8Array", [buffer])
    for index in range(size):
        runtime.reflect.set(octets, index, raw[offset + index])
    view = _typed_view("DataView", [buffer])
    method_name = "getFloat32" if size == 4 else "getFloat64"
    return float(
        runtime.reflect.apply(
            runtime.reflect.get(view, method_name),
            view,
            [0, _LITTLE_ENDIAN],
        )
    )


def _coerce_integer(value: Any, size: int, signed: bool) -> Any:
    if value is True:
        value = 1
    elif value is False:
        value = 0
    value_type = runtime.jstype(value)
    if not runtime.strict_equal(value_type, "number") and not runtime.strict_equal(
        value_type, "bigint"
    ):
        raise TypeError("an integer is required")
    if runtime.strict_equal(value_type, "number") and not runtime.number.isInteger(
        value
    ):
        raise TypeError("an integer is required")
    integer = runtime.bigint(value)
    bits = runtime.bigint(size * 8)
    limit = runtime.native_lshift(runtime.bigint(1), bits)
    if signed:
        half = runtime.native_rshift(limit, runtime.bigint(1))
        minimum = runtime.native_neg(half)
        maximum = runtime.native_sub(half, runtime.bigint(1))
    else:
        minimum = runtime.bigint(0)
        maximum = runtime.native_sub(limit, runtime.bigint(1))
    if integer < minimum or integer > maximum:
        raise OverflowError("Python int too large to convert to C value")
    return runtime.normalize_integer(integer)


def _coerce_value(
    value: Any,
    size: int,
    signed: bool,
    floating: bool,
) -> Any:
    if floating:
        number = value if runtime.jstype(value) == "number" else float(value)
        if size == 4:
            return _float_from_bytes(_float_to_bytes(number, size), 0, size)
        return number
    return _coerce_integer(value, size, signed)


@runtime.sequence_class
class array:
    def __init__(
        self,
        typecode: str,
        initializer: Any = runtime.undefined,
    ) -> None:
        if (
            not runtime.strict_equal(runtime.jstype(typecode), "string")
            or len(typecode) != 1
            or typecode not in _TYPE_INFO
        ):
            raise ValueError("bad typecode")
        self.typecode = typecode
        info = _TYPE_INFO[typecode]
        self.itemsize = info[0]
        self._signed = info[1]
        self._floating = info[2]
        self._values = []
        if initializer is runtime.undefined:
            return
        if (
            isinstance(initializer, bytes)
            or isinstance(initializer, bytearray)
            or isinstance(initializer, memoryview)
        ):
            self.frombytes(initializer)
            return
        self.extend(initializer)

    def __len__(self) -> int:
        return len(self._values)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._values)

    def __getitem__(self, index: int) -> Any:
        if index < 0:
            index += len(self._values)
        if index < 0 or index >= len(self._values):
            raise IndexError("array index out of range")
        return self._values[index]

    def __setitem__(self, index: int, value: Any) -> None:
        if index < 0:
            index += len(self._values)
        if index < 0 or index >= len(self._values):
            raise IndexError("array assignment index out of range")
        self._values[index] = _coerce_value(
            value, self.itemsize, self._signed, self._floating
        )

    def slice(
        self,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> array:
        first = 0 if start is runtime.undefined else start
        last = len(self) if end is runtime.undefined else end
        return array(self.typecode, self._values[first:last])

    def __setslice__(self, start: int, end: int, values: Any) -> None:
        if not isinstance(values, array) or values.typecode != self.typecode:
            raise TypeError("can only assign array of same kind")
        self._values[start:end] = values._values[:]

    def append(self, value: Any) -> None:
        self._values.append(
            _coerce_value(value, self.itemsize, self._signed, self._floating)
        )

    def extend(self, values: Any) -> None:
        if isinstance(values, array):
            values = values._values
        next_method = runtime.reflect.get(values, "next")
        if runtime.strict_equal(runtime.jstype(next_method), "function"):
            while True:
                result = runtime.reflect.apply(next_method, values, [])
                if result.done:
                    return
                self.append(result.value)
        for value in values:
            self.append(value)

    def frombytes(self, source: Any) -> None:
        raw = bytes(source)
        if len(raw) % self.itemsize != 0:
            raise ValueError("bytes length not a multiple of item size")
        for offset in range(0, len(raw), self.itemsize):
            if self._floating:
                self._values.append(_float_from_bytes(raw, offset, self.itemsize))
                continue
            value = 0
            if _LITTLE_ENDIAN:
                indices = range(self.itemsize - 1, -1, -1)
                sign_index = offset + self.itemsize - 1
            else:
                indices = range(self.itemsize)
                sign_index = offset
            for index in indices:
                value = value * 256 + raw[offset + index]
            if self._signed and raw[sign_index] >= 128:
                value -= 2 ** (self.itemsize * 8)
            self._values.append(_coerce_integer(value, self.itemsize, self._signed))

    def tobytes(self) -> bytes:
        return bytes(self._bytes_values())

    def byteswap(self) -> None:
        if self.itemsize == 1:
            return
        raw = self._bytes_values()
        swapped = []
        for offset in range(0, len(raw), self.itemsize):
            for index in range(self.itemsize - 1, -1, -1):
                swapped.append(raw[offset + index])
        self._values = []
        self.frombytes(bytes(swapped))

    def __add__(self, other: Any) -> array:
        if not isinstance(other, array) or other.typecode != self.typecode:
            raise TypeError("can only append array to array")
        return array(self.typecode, self._values + other._values)

    def __iadd__(self, other: Any) -> array:
        if not isinstance(other, array) or other.typecode != self.typecode:
            raise TypeError("can only extend with array of same kind")
        self._values.extend(other._values)
        return self

    def __contains__(self, value: Any) -> bool:
        return value in self._values

    def __eq__(self, other: object) -> bool:
        return isinstance(other, array) and self._values == other._values

    def __lt__(self, other: Any) -> bool:
        if not isinstance(other, array):
            raise TypeError("array comparison requires another array")
        return self._values < other._values

    def __le__(self, other: Any) -> bool:
        return self == other or self < other

    def __gt__(self, other: Any) -> bool:
        if not isinstance(other, array):
            raise TypeError("array comparison requires another array")
        return other < self

    def __ge__(self, other: Any) -> bool:
        return self == other or self > other

    def _bytes_values(
        self,
        start: int = 0,
        length: Any = runtime.undefined,
    ) -> list[int]:
        if self._floating:
            if length is runtime.undefined:
                count = len(self._values) - start
            else:
                count = length
            answer = []
            for item in self._values[start : start + count]:
                answer.extend(_float_to_bytes(item, self.itemsize))
            return answer
        if length is runtime.undefined:
            count = len(self._values) - start
        else:
            count = length
        answer = []
        modulus = runtime.native_lshift(
            runtime.bigint(1), runtime.bigint(self.itemsize * 8)
        )
        for item in self._values[start : start + count]:
            value = runtime.bigint(item)
            if value < 0:
                value = runtime.native_add(value, modulus)
            encoded = []
            for _index in range(self.itemsize):
                encoded.append(
                    runtime.number(runtime.native_bitand(value, runtime.bigint(255)))
                )
                value = runtime.native_rshift(value, runtime.bigint(8))
            if not _LITTLE_ENDIAN:
                encoded.reverse()
            answer.extend(encoded)
        return answer

    def __repr__(self) -> str:
        if len(self._values) == 0:
            return "array('" + self.typecode + "')"
        return "array('" + self.typecode + "', " + repr(self._values) + ")"

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__
