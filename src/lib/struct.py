"""Pack and unpack primitive values as Python byte strings.

The implementation is deliberately written in Python.  Integer formats are
handled with exact arithmetic, which keeps the module portable and avoids a
round trip through JavaScript ``Number`` for 64-bit values.
"""


class error(Exception):
    pass


_STANDARD_SIZES = {
    "b": 1,
    "B": 1,
    "h": 2,
    "H": 2,
    "i": 4,
    "I": 4,
    "l": 4,
    "L": 4,
    "q": 8,
    "Q": 8,
}

_SIGNED_CODES = ("b", "h", "i", "l", "q")


def _native_size(code):
    if code in ("l", "L", "q", "Q"):
        return 8
    return _STANDARD_SIZES[code]


def _parse_format(format):
    if not isinstance(format, str):
        raise TypeError("Struct() argument 1 must be a str")

    byte_order = "@"
    position = 0
    if len(format) > 0 and format[0] in "@=<>!":
        byte_order = format[0]
        position = 1

    native = byte_order == "@"
    little_endian = byte_order not in (">", "!")
    fields = []
    offset = 0
    count_text = ""

    while position < len(format):
        code = format[position]
        position += 1
        if code.isspace():
            continue
        if "0" <= code <= "9":
            count_text += code
            continue

        count = int(count_text) if count_text else 1
        count_text = ""
        if code == "x":
            size = 1
            value_count = 0
        elif code == "s":
            size = count
            value_count = 1
            count = 1
        elif code == "c":
            size = 1
            value_count = count
        elif code in _STANDARD_SIZES:
            size = _native_size(code) if native else _STANDARD_SIZES[code]
            value_count = count
        else:
            raise error("bad char in struct format")

        if native and code not in ("x", "s", "c") and count > 0:
            alignment = size
            offset = (offset + alignment - 1) // alignment * alignment

        fields.append((offset, code, size, count, value_count))
        if code == "s":
            offset += size
        else:
            offset += size * count

    if count_text:
        raise error("repeat count given without format specifier")
    return little_endian, fields, offset


def calcsize(format):
    return _parse_format(format)[2]


def _integer_bytes(value, code, size, little_endian):
    value = int(value)
    bits = size * 8
    signed = code in _SIGNED_CODES
    lower = -(1 << (bits - 1)) if signed else 0
    upper = (1 << (bits - 1)) - 1 if signed else (1 << bits) - 1
    if value < lower or value > upper:
        raise error("argument out of range")
    if value < 0:
        value += 1 << bits

    answer = bytearray(size)
    for index in range(size):
        byte = value & 255
        target = index if little_endian else size - index - 1
        answer[target] = byte
        value >>= 8
    return answer


def _write(buffer, offset, data):
    for index in range(len(data)):
        buffer[offset + index] = data[index]


def _pack(format, values):
    little_endian, fields, size = _parse_format(format)
    answer = bytearray(size)
    value_index = 0

    for offset, code, item_size, count, value_count in fields:
        if code == "x":
            continue
        if code == "s":
            if value_index >= len(values):
                raise error("pack expected more items for packing")
            data = bytes(values[value_index])
            value_index += 1
            limit = min(item_size, len(data))
            for index in range(limit):
                answer[offset + index] = data[index]
            continue

        if code == "c":
            if value_index + value_count > len(values):
                raise error("pack expected more items for packing")
            for repetition in range(count):
                data = bytes(values[value_index])
                value_index += 1
                if len(data) != 1:
                    raise error("char format requires a bytes object of length 1")
                answer[offset + repetition] = data[0]
            continue

        if value_index + value_count > len(values):
            raise error("pack expected more items for packing")
        for repetition in range(count):
            data = _integer_bytes(
                values[value_index],
                code,
                item_size,
                little_endian,
            )
            value_index += 1
            _write(answer, offset + repetition * item_size, data)

    if value_index != len(values):
        raise error("pack expected fewer items for packing")
    return answer


def pack(format, *values):
    return bytes(_pack(format, values))


def _normalize_offset(buffer, offset):
    offset = int(offset)
    if offset < 0:
        offset += len(buffer)
    return offset


def pack_into(format, buffer, offset, *values):
    data = _pack(format, values)
    offset = _normalize_offset(buffer, offset)
    if offset < 0 or offset + len(data) > len(buffer):
        raise error("pack_into requires a buffer of sufficient size")
    _write(buffer, offset, data)


def _read_integer(buffer, offset, code, size, little_endian):
    value = 0
    for index in range(size):
        source = offset + (size - index - 1 if little_endian else index)
        value = (value << 8) | buffer[source]
    if code in _SIGNED_CODES and value >= 1 << (size * 8 - 1):
        value -= 1 << (size * 8)
    return value


def _unpack_from(format, buffer, offset):
    little_endian, fields, size = _parse_format(format)
    offset = _normalize_offset(buffer, offset)
    if offset < 0 or offset + size > len(buffer):
        raise error("unpack_from requires a buffer of sufficient size")

    values = []
    for field_offset, code, item_size, count, value_count in fields:
        start = offset + field_offset
        if code == "x":
            continue
        if code == "s":
            values.append(bytes(buffer[start : start + item_size]))
            continue
        if code == "c":
            for repetition in range(count):
                values.append(
                    bytes(buffer[start + repetition : start + repetition + 1])
                )
            continue
        for repetition in range(count):
            values.append(
                _read_integer(
                    buffer,
                    start + repetition * item_size,
                    code,
                    item_size,
                    little_endian,
                )
            )
    return tuple(values)


def unpack(format, buffer):
    expected_size = calcsize(format)
    if len(buffer) != expected_size:
        raise error("unpack requires a buffer of " + str(expected_size) + " bytes")
    return _unpack_from(format, buffer, 0)


def unpack_from(format, buffer, offset=0):
    return _unpack_from(format, buffer, offset)


class Struct:
    """Compiled struct format with the standard bound-method API."""

    def __init__(self, format):
        self.format = format
        self.size = calcsize(format)

    def pack(self, *values):
        return pack(self.format, *values)

    def pack_into(self, buffer, offset, *values):
        return pack_into(self.format, buffer, offset, *values)

    def unpack(self, buffer):
        return unpack(self.format, buffer)

    def unpack_from(self, buffer, offset=0):
        return unpack_from(self.format, buffer, offset)


def iter_unpack(format, buffer):
    size = calcsize(format)
    if size == 0 or len(buffer) % size != 0:
        raise error("iterative unpacking requires a buffer of a multiple size")
    for offset in range(0, len(buffer), size):
        yield unpack_from(format, buffer, offset)
