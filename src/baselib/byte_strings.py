"""Python-compatible immutable byte strings.

Sage.js stores bytes as a compact binary JavaScript string plus numeric
properties.  The latter make the compiler's fast ``value[index]`` path behave
like Python, while the methods below provide the Python data model.
"""

from __future__ import annotations

from typing import Any, Iterator

import sagejs.runtime as runtime

_Bool = bool
_Int = int
_Str = str

_BYTE_WHITESPACE = ' \t\n\r\x0b\x0c'


def _normalise_encoding(encoding: Any) -> _Str:
    return runtime.reflect.apply(
        runtime.string_class.prototype.toLowerCase,
        encoding,
        [],
    ).replace('_', '-')


def _byte_values_from_binary_string(value: _Str) -> list[_Int]:
    answer = []
    for character in value:
        answer.append(ord(character))
    return answer


def _encode_utf8(value: _Str) -> list[_Int]:
    answer = []
    for character in value:
        code = ord(character)
        if code <= 0x7F:
            answer.append(code)
        elif code <= 0x7FF:
            answer.extend([
                0xC0 | (code >> 6),
                0x80 | (code & 0x3F),
            ])
        elif code <= 0xFFFF:
            answer.extend([
                0xE0 | (code >> 12),
                0x80 | ((code >> 6) & 0x3F),
                0x80 | (code & 0x3F),
            ])
        else:
            answer.extend([
                0xF0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3F),
                0x80 | ((code >> 6) & 0x3F),
                0x80 | (code & 0x3F),
            ])
    return answer


def _decode_utf8(values: list[_Int], errors: _Str) -> _Str:
    answer = ''
    index = 0
    while index < len(values):
        first = values[index]
        if first <= 0x7F:
            answer += chr(first)
            index += 1
            continue

        width = 0
        code = 0
        minimum = 0
        if 0xC2 <= first <= 0xDF:
            width, code, minimum = 2, first & 0x1F, 0x80
        elif 0xE0 <= first <= 0xEF:
            width, code, minimum = 3, first & 0x0F, 0x800
        elif 0xF0 <= first <= 0xF4:
            width, code, minimum = 4, first & 0x07, 0x10000

        valid = width > 0 and index + width <= len(values)
        offset = 1
        while valid and offset < width:
            following = values[index + offset]
            if following < 0x80 or following > 0xBF:
                valid = False
                break
            code = (code << 6) | (following & 0x3F)
            offset += 1
        valid = (
            valid
            and code >= minimum
            and code <= 0x10FFFF
            and not 0xD800 <= code <= 0xDFFF
        )
        if valid:
            answer += chr(code)
            index += width
        elif errors == 'ignore':
            index += 1
        elif errors == 'replace':
            answer += '\uFFFD'
            index += 1
        else:
            raise ValueError('invalid UTF-8 sequence')
    return answer


def _coerce_index(value: Any) -> _Int:
    if value is True:
        return 1
    if value is False:
        return 0
    if runtime.strict_equal(runtime.jstype(value), 'bigint'):
        if value > 9007199254740991 or value < -9007199254740991:
            raise OverflowError('Python int too large to convert to C ssize_t')
        value = runtime.number(value)
    if (
        not runtime.strict_equal(runtime.jstype(value), 'number')
        or not runtime.number.isInteger(value)
    ):
        raise TypeError('an integer is required')
    return value


def _normalise_bound(
    value: Any,
    default_value: _Int,
    length: _Int,
) -> _Int:
    if value is runtime.undefined or value is None:
        return default_value
    answer = _coerce_index(value)
    if answer < 0:
        answer += length
    if answer < 0:
        return 0
    if answer > length:
        return length
    return answer


class SageBytes:

    def __init__(self, values: list[_Int]) -> None:
        if isinstance(values, SageBytes):
            values = values._values[:]
        self._values = values
        for index, value in enumerate(values):
            runtime.object.defineProperty(
                self,
                str(index),
                {
                    'value': value,
                    'enumerable': True,
                },
            )

    @property
    def length(self) -> _Int:
        return len(self._values)

    def __len__(self) -> _Int:
        return len(self._values)

    def __iter__(self) -> Iterator[_Int]:
        return iter(self._values)

    def __getitem__(self, index: Any) -> Any:
        if hasattr(index, '__sagejs_slice__'):
            start, stop, step = index.indices(len(self._values))
            values = [
                self._values[position]
                for position in range(start, stop, step)
            ]
            return runtime.reflect.construct(type(self), [values])
        index = _coerce_index(index)
        if index < 0:
            index += len(self._values)
        if index < 0 or index >= len(self._values):
            raise IndexError('index out of range')
        return self._values[index]

    def __setitem__(self, _index: Any, _value: Any) -> None:
        raise TypeError("'bytes' object does not support item assignment")

    def __delitem__(self, _index: Any) -> None:
        raise TypeError("'bytes' object doesn't support item deletion")

    def slice(
        self,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> SageBytes:
        first = _normalise_bound(start, 0, len(self._values))
        last = _normalise_bound(end, len(self._values), len(self._values))
        return SageBytes(self._values[first:last])

    def __contains__(self, needle: Any) -> _Bool:
        if hasattr(needle, '_bytes_values'):
            needle = SageBytes(needle._bytes_values())
        if isinstance(needle, SageBytes):
            return self.find(needle) >= 0
        return _coerce_index(needle) in self._values

    def __add__(self, other: Any) -> SageBytes:
        if hasattr(other, '_bytes_values'):
            other = SageBytes(other._bytes_values())
        if not isinstance(other, SageBytes):
            raise TypeError("can't concat bytes to this value")
        return SageBytes(self._values + other._values)

    def __mul__(self, count: Any) -> SageBytes:
        count = _coerce_index(count)
        if count <= 0:
            return SageBytes([])
        answer = []
        for _unused in range(count):
            answer.extend(self._values)
        return SageBytes(answer)

    __rmul__ = __mul__

    def __mod__(self, operands: Any) -> SageBytes:
        if runtime.array.isArray(operands):
            values = operands
        else:
            values = [operands]
        value_index = 0
        answer = []
        index = 0
        while index < len(self._values):
            byte = self._values[index]
            if byte != 37:
                answer.append(byte)
                index += 1
                continue
            if index + 1 >= len(self._values):
                raise ValueError('incomplete format')
            conversion = self._values[index + 1]
            index += 2
            if conversion == 37:
                answer.append(37)
                continue
            if value_index >= len(values):
                raise TypeError('not enough arguments for format string')
            value = values[value_index]
            value_index += 1
            if conversion == 100:
                replacement = str(value)
            elif conversion == 115:
                if not isinstance(value, SageBytes):
                    raise TypeError('%s requires a bytes-like object')
                replacement = value._binary_string()
            elif conversion == 114:
                replacement = runtime.repr(value)
            else:
                raise ValueError('unsupported format character')
            answer.extend(_byte_values_from_binary_string(replacement))
        if value_index != len(values):
            raise TypeError('not all arguments converted during bytes formatting')
        return SageBytes(answer)

    def __eq__(self, other: object) -> _Bool:
        if isinstance(other, SageMemoryView):
            return self._values == other._values()
        if not isinstance(other, SageBytes):
            return False
        return self._values == other._values

    def _compare(self, other: Any) -> _Int:
        if isinstance(other, SageMemoryView):
            other_values = other._values()
        elif isinstance(other, SageBytes):
            other_values = other._values
        else:
            raise TypeError('bytes values are only orderable with bytes')
        common = min(len(self._values), len(other_values))
        for index in range(common):
            if self._values[index] < other_values[index]:
                return -1
            if self._values[index] > other_values[index]:
                return 1
        if len(self._values) < len(other_values):
            return -1
        if len(self._values) > len(other_values):
            return 1
        return 0

    def __lt__(self, other: Any) -> _Bool:
        return self._compare(other) < 0

    def __le__(self, other: Any) -> _Bool:
        return self._compare(other) <= 0

    def __gt__(self, other: Any) -> _Bool:
        return self._compare(other) > 0

    def __ge__(self, other: Any) -> _Bool:
        return self._compare(other) >= 0

    def valueOf(self) -> _Str:
        return self._binary_string()

    def _binary_string(self) -> _Str:
        answer = ''
        for value in self._values:
            answer += chr(value)
        return answer

    def hex(
        self,
        separator: Any = runtime.undefined,
        bytes_per_separator: Any = 1,
    ) -> _Str:
        digits = '0123456789abcdef'
        groups = []
        for value in self._values:
            groups.append(digits[value >> 4] + digits[value & 15])
        if separator is runtime.undefined:
            return str.join('', groups)
        if (
            not runtime.strict_equal(runtime.jstype(separator), 'string')
            or len(separator) != 1
        ):
            raise TypeError('sep must be length 1')
        width = _coerce_index(bytes_per_separator)
        if width == 0:
            raise ValueError('bytes_per_sep must not be zero')
        if width < 0:
            width = -width
            answer = []
            for index in range(0, len(groups), width):
                answer.append(str.join('', groups[index:index + width]))
            return str.join(separator, answer)
        first_width = len(groups) % width
        if first_width == 0:
            first_width = width
        answer = [str.join('', groups[:first_width])]
        for index in range(first_width, len(groups), width):
            answer.append(str.join('', groups[index:index + width]))
        return str.join(separator, answer)

    def __repr__(self) -> _Str:
        quote = 34 if 39 in self._values and 34 not in self._values else 39
        answer = 'b' + chr(quote)
        for value in self._values:
            if value == 9:
                answer += r'\t'
            elif value == 10:
                answer += r'\n'
            elif value == 13:
                answer += r'\r'
            elif value == quote:
                answer += '\\' + chr(quote)
            elif value == 92:
                answer += r'\\'
            elif 32 <= value <= 126:
                answer += chr(value)
            else:
                digits = '0123456789abcdef'
                answer += (
                    r'\x'
                    + digits[(value >> 4) & 15]
                    + digits[value & 15]
                )
        return answer + chr(quote)

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__

    def decode(
        self,
        encoding: Any = runtime.undefined,
        errors: Any = runtime.undefined,
    ) -> _Str:
        if encoding is runtime.undefined or encoding is None:
            encoding = 'utf-8'
        if errors is runtime.undefined or errors is None:
            errors = 'strict'
        normalised = _normalise_encoding(encoding)
        if normalised in ('utf-8', 'utf8'):
            return _decode_utf8(self._values, errors)
        if normalised in ('ascii', 'us-ascii'):
            answer = ''
            for value in self._values:
                if value <= 127:
                    answer += chr(value)
                elif errors == 'ignore':
                    continue
                elif errors == 'replace':
                    answer += '\uFFFD'
                else:
                    raise ValueError('ordinal not in range(128)')
            return answer
        if normalised in ('latin-1', 'latin1', 'iso-8859-1'):
            return self._binary_string()
        raise ValueError('unknown encoding: ' + encoding)

    def find(
        self,
        needle: Any,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> _Int:
        first = _normalise_bound(start, 0, len(self._values))
        last = _normalise_bound(end, len(self._values), len(self._values))
        if isinstance(needle, SageBytes):
            target = needle._values
        else:
            byte = _coerce_index(needle)
            if byte < 0 or byte > 255:
                raise ValueError('byte must be in range(0, 256)')
            target = [byte]
        if len(target) == 0:
            return first if first <= last else -1
        stop = last - len(target)
        for index in range(first, stop + 1):
            if self._values[index:index + len(target)] == target:
                return index
        return -1

    def index(
        self,
        needle: Any,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> _Int:
        answer = self.find(needle, start, end)
        if answer < 0:
            raise ValueError('subsection not found')
        return answer

    def rfind(
        self,
        needle: Any,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> _Int:
        first = _normalise_bound(start, 0, len(self._values))
        last = _normalise_bound(end, len(self._values), len(self._values))
        if isinstance(needle, SageBytes):
            target = needle._values
        else:
            byte = _coerce_index(needle)
            if byte < 0 or byte > 255:
                raise ValueError('byte must be in range(0, 256)')
            target = [byte]
        if len(target) == 0:
            return last
        for index in range(last - len(target), first - 1, -1):
            if self._values[index:index + len(target)] == target:
                return index
        return -1

    def rindex(
        self,
        needle: Any,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> _Int:
        answer = self.rfind(needle, start, end)
        if answer < 0:
            raise ValueError('subsection not found')
        return answer

    def count(
        self,
        needle: Any,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> _Int:
        first = _normalise_bound(start, 0, len(self._values))
        last = _normalise_bound(end, len(self._values), len(self._values))
        if not isinstance(needle, SageBytes):
            byte = _coerce_index(needle)
            if byte < 0 or byte > 255:
                raise ValueError('byte must be in range(0, 256)')
            target = [byte]
        else:
            target = needle._values
        if len(target) == 0:
            return max(last - first + 1, 0)
        answer = 0
        index = first
        while index + len(target) <= last:
            if self._values[index:index + len(target)] == target:
                answer += 1
                index += len(target)
            else:
                index += 1
        return answer

    def center(self, width: Any, fillbyte: Any = runtime.undefined) -> SageBytes:
        width = _coerce_index(width)
        fill = SageBytes([32]) if fillbyte is runtime.undefined else fillbyte
        if not isinstance(fill, SageBytes) or len(fill) != 1:
            raise TypeError('center() argument 2 must be a byte string of length 1')
        padding = max(width - len(self), 0)
        left = padding // 2
        right = padding - left
        return fill * left + self + fill * right

    def partition(self, separator: Any) -> Any:
        if not isinstance(separator, SageBytes):
            raise TypeError('a bytes-like object is required')
        if len(separator) == 0:
            raise ValueError('empty separator')
        index = self.find(separator)
        if index < 0:
            return runtime.math_tuple(
                [self, SageBytes([]), SageBytes([])])
        return runtime.math_tuple([
            self.slice(0, index),
            separator,
            self.slice(index + len(separator)),
        ])

    def rpartition(self, separator: Any) -> Any:
        if not isinstance(separator, SageBytes):
            raise TypeError('a bytes-like object is required')
        if len(separator) == 0:
            raise ValueError('empty separator')
        index = self.rfind(separator)
        if index < 0:
            return runtime.math_tuple([
                _new_bytes_like(self, []),
                _new_bytes_like(self, []),
                self,
            ])
        return runtime.math_tuple([
            self.slice(0, index),
            _new_bytes_like(self, separator._values),
            self.slice(index + len(separator)),
        ])

    def replace(
        self,
        old: Any,
        replacement: Any,
        count: Any = -1,
    ) -> SageBytes:
        if (
            not isinstance(old, SageBytes)
            or not isinstance(replacement, SageBytes)
        ):
            raise TypeError('a bytes-like object is required')
        if count is runtime.undefined:
            count = -1
        count = _coerce_index(count)
        if count == 0:
            return self
        limit = len(self._values) + 1 if count < 0 else count
        answer = []
        index = 0
        replacements = 0
        if len(old) == 0:
            while index <= len(self._values):
                if replacements < limit:
                    answer.extend(replacement._values)
                    replacements += 1
                if index < len(self._values):
                    answer.append(self._values[index])
                index += 1
            return SageBytes(answer)
        while index < len(self._values):
            if (
                replacements < limit
                and self._values[index:index + len(old)] == old._values
            ):
                answer.extend(replacement._values)
                replacements += 1
                index += len(old)
            else:
                answer.append(self._values[index])
                index += 1
        return SageBytes(answer)

    def split(
        self,
        separator: Any = runtime.undefined,
        maxsplit: Any = runtime.undefined,
    ) -> list[SageBytes]:
        if maxsplit is runtime.undefined:
            maxsplit = -1
        maxsplit = _coerce_index(maxsplit)
        if separator is runtime.undefined or separator is None:
            parts = []
            index = 0
            splits = 0
            while index < len(self):
                while (
                    index < len(self)
                    and chr(self._values[index]) in _BYTE_WHITESPACE
                ):
                    index += 1
                if index >= len(self):
                    break
                if maxsplit >= 0 and splits >= maxsplit:
                    parts.append(self.slice(index))
                    break
                end = index
                while (
                    end < len(self)
                    and chr(self._values[end]) not in _BYTE_WHITESPACE
                ):
                    end += 1
                parts.append(self.slice(index, end))
                splits += 1
                index = end
            return parts
        if not isinstance(separator, SageBytes):
            raise TypeError('a bytes-like object is required')
        if len(separator) == 0:
            raise ValueError('empty separator')
        parts = []
        index = 0
        splits = 0
        while maxsplit < 0 or splits < maxsplit:
            found = self.find(separator, index)
            if found < 0:
                break
            parts.append(self.slice(index, found))
            index = found + len(separator)
            splits += 1
        parts.append(self.slice(index))
        return parts

    def splitlines(self, keepends: Any = False) -> list[SageBytes]:
        answer = []
        start = 0
        position = 0
        while position < len(self._values):
            value = self._values[position]
            if value != 10 and value != 13:
                position += 1
                continue
            newline_end = position + 1
            if (
                value == 13
                and newline_end < len(self._values)
                and self._values[newline_end] == 10
            ):
                newline_end += 1
            end = newline_end if keepends else position
            answer.append(_new_bytes_like(
                self, self._values[start:end]))
            start = newline_end
            position = newline_end
        if start < len(self._values):
            answer.append(_new_bytes_like(
                self, self._values[start:]))
        return answer

    def rsplit(
        self,
        separator: Any = runtime.undefined,
        maxsplit: Any = runtime.undefined,
    ) -> list[SageBytes]:
        if separator is runtime.undefined or separator is None:
            # Reversing both the data and pieces gives Python's right split
            # semantics while retaining the ordinary whitespace machinery.
            reversed_values = self._values[:]
            reversed_values.reverse()
            reversed_source = _new_bytes_like(self, reversed_values)
            reversed_parts = reversed_source.split(None, maxsplit)
            answer = []
            reversed_parts.reverse()
            for part in reversed_parts:
                values = part._values[:]
                values.reverse()
                answer.append(_new_bytes_like(self, values))
            return answer
        if not isinstance(separator, SageBytes):
            raise TypeError('a bytes-like object is required')
        if len(separator) == 0:
            raise ValueError('empty separator')
        if maxsplit is runtime.undefined:
            maxsplit = -1
        maxsplit = _coerce_index(maxsplit)
        parts = []
        last = len(self)
        splits = 0
        while maxsplit < 0 or splits < maxsplit:
            found = self.rfind(separator, 0, last)
            if found < 0:
                break
            parts.append(self.slice(found + len(separator), last))
            last = found
            splits += 1
        parts.append(self.slice(0, last))
        parts.reverse()
        return parts

    def startswith(
        self,
        prefix: Any,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> _Bool:
        if not isinstance(prefix, SageBytes):
            raise TypeError('a bytes-like object is required')
        first = _normalise_bound(start, 0, len(self))
        last = _normalise_bound(end, len(self), len(self))
        return self._values[first:first + len(prefix)] == prefix._values and (
            first + len(prefix) <= last)

    def endswith(
        self,
        suffix: Any,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> _Bool:
        if not isinstance(suffix, SageBytes):
            raise TypeError('a bytes-like object is required')
        first = _normalise_bound(start, 0, len(self))
        last = _normalise_bound(end, len(self), len(self))
        return (
            last - len(suffix) >= first
            and self._values[last - len(suffix):last] == suffix._values
        )

    def lower(self) -> SageBytes:
        values = []
        for value in self._values:
            values.append(value + 32 if 65 <= value <= 90 else value)
        return _new_bytes_like(self, values)

    def upper(self) -> SageBytes:
        values = []
        for value in self._values:
            values.append(value - 32 if 97 <= value <= 122 else value)
        return _new_bytes_like(self, values)

    def isspace(self) -> _Bool:
        return (
            len(self) > 0
            and all(chr(value) in _BYTE_WHITESPACE for value in self._values)
        )

    def isalpha(self) -> _Bool:
        return (
            len(self) > 0
            and all(
                65 <= value <= 90 or 97 <= value <= 122
                for value in self._values
            )
        )

    def isdigit(self) -> _Bool:
        return (
            len(self) > 0
            and all(48 <= value <= 57 for value in self._values)
        )

    def isupper(self) -> _Bool:
        saw_cased = False
        for value in self._values:
            if 97 <= value <= 122:
                return False
            if 65 <= value <= 90:
                saw_cased = True
        return saw_cased

    def islower(self) -> _Bool:
        saw_cased = False
        for value in self._values:
            if 65 <= value <= 90:
                return False
            if 97 <= value <= 122:
                saw_cased = True
        return saw_cased

    def join(self, iterable: Any) -> SageBytes:
        answer = []
        first = True
        for part in iterable:
            if not isinstance(part, SageBytes):
                raise TypeError('sequence item is not a bytes-like object')
            if not first:
                answer.extend(self._values)
            answer.extend(part._values)
            first = False
        return _new_bytes_like(self, answer)

    def _strip(self, characters: Any, left: _Bool, right: _Bool) -> SageBytes:
        if characters is runtime.undefined or characters is None:
            strip_values = _byte_values_from_binary_string(_BYTE_WHITESPACE)
        elif isinstance(characters, SageBytes):
            strip_values = characters._values
        else:
            raise TypeError('a bytes-like object is required')
        first = 0
        last = len(self)
        if left:
            while first < last and self._values[first] in strip_values:
                first += 1
        if right:
            while last > first and self._values[last - 1] in strip_values:
                last -= 1
        if first == 0 and last == len(self):
            return self
        return self.slice(first, last)

    def strip(self, characters: Any = runtime.undefined) -> SageBytes:
        return self._strip(characters, True, True)

    def lstrip(self, characters: Any = runtime.undefined) -> SageBytes:
        return self._strip(characters, True, False)

    def rstrip(self, characters: Any = runtime.undefined) -> SageBytes:
        return self._strip(characters, False, True)


@runtime.sequence_class
class SageByteArray(SageBytes):

    def __init__(self, values: list[_Int]) -> None:
        self._values = values

    def __repr__(self) -> _Str:
        return 'bytearray(' + SageBytes(self._values).__repr__() + ')'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__

    def slice(
        self,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> SageByteArray:
        first = _normalise_bound(start, 0, len(self._values))
        last = _normalise_bound(end, len(self._values), len(self._values))
        return SageByteArray(self._values[first:last])

    def __setitem__(self, index: Any, value: Any) -> None:
        if hasattr(index, '__sagejs_slice__'):
            start, stop, step = index.indices(len(self._values))
            if step == 1:
                self.__setslice__(start, stop, value)
                return
            if not isinstance(value, SageBytes):
                value = ρσ_bytes(value)
            positions = [
                position
                for position in range(start, stop, step)
            ]
            if len(positions) != len(value):
                raise ValueError(
                    'attempt to assign bytes of size '
                    + str(len(value))
                    + ' to extended slice of size '
                    + str(len(positions))
                )
            for position_index in range(len(positions)):
                self._values[positions[position_index]] = (
                    value._values[position_index]
                )
            return
        index = _coerce_index(index)
        value = _coerce_index(value)
        if value < 0 or value > 255:
            raise ValueError('byte must be in range(0, 256)')
        if index < 0:
            index += len(self._values)
        if index < 0 or index >= len(self._values):
            raise IndexError('index out of range')
        self._values[index] = value

    def __delitem__(self, index: Any) -> None:
        if hasattr(index, '__sagejs_slice__'):
            start, stop, step = index.indices(len(self._values))
            positions = [
                position
                for position in range(start, stop, step)
            ]
            positions.sort()
            positions.reverse()
            for position in positions:
                runtime.reflect.apply(
                    runtime.array.prototype.splice,
                    self._values,
                    [position, 1],
                )
            return
        index = _coerce_index(index)
        if index < 0:
            index += len(self._values)
        if index < 0 or index >= len(self._values):
            raise IndexError('index out of range')
        runtime.reflect.apply(
            runtime.array.prototype.splice,
            self._values,
            [index, 1],
        )

    def __setslice__(self, start: Any, end: Any, values: Any) -> None:
        first = _normalise_bound(start, 0, len(self._values))
        last = _normalise_bound(end, len(self._values), len(self._values))
        if not isinstance(values, SageBytes):
            values = ρσ_bytes(values)
        call_args = [first, last - first]
        for value in values:
            call_args.append(value)
        runtime.reflect.apply(
            runtime.array.prototype.splice,
            self._values,
            call_args,
        )

    def __add__(self, other: Any) -> SageByteArray:
        if not isinstance(other, SageBytes):
            raise TypeError("can't concat bytearray to this value")
        return SageByteArray(self._values + other._values)

    def __mul__(self, count: Any) -> SageByteArray:
        return SageByteArray(
            SageBytes.__mul__(self, count)._values)

    __rmul__ = __mul__

    def __iadd__(self, other: Any) -> SageByteArray:
        self.extend(other)
        return self

    def __imul__(self, count: Any) -> SageByteArray:
        self._values = SageBytes.__mul__(self, count)._values
        return self

    def append(self, value: Any) -> None:
        byte = _coerce_index(value)
        if byte < 0 or byte > 255:
            raise ValueError('byte must be in range(0, 256)')
        self._values.append(byte)

    def extend(self, values: Any) -> None:
        if isinstance(values, SageBytes):
            copied = values._values[:]
        else:
            copied = ρσ_bytes(values)._values
        self._values.extend(copied)

    def center(
        self,
        width: Any,
        fillbyte: Any = runtime.undefined,
    ) -> SageByteArray:
        return SageByteArray(
            SageBytes.center(self, width, fillbyte)._values)

    def replace(
        self,
        old: Any,
        replacement: Any,
        count: Any = runtime.undefined,
    ) -> SageByteArray:
        return SageByteArray(
            SageBytes.replace(self, old, replacement, count)._values)

    def strip(self, characters: Any = runtime.undefined) -> SageByteArray:
        return SageByteArray(
            SageBytes.strip(self, characters)._values)

    def lstrip(self, characters: Any = runtime.undefined) -> SageByteArray:
        return SageByteArray(
            SageBytes.lstrip(self, characters)._values)

    def rstrip(self, characters: Any = runtime.undefined) -> SageByteArray:
        return SageByteArray(
            SageBytes.rstrip(self, characters)._values)

    def split(
        self,
        separator: Any = runtime.undefined,
        maxsplit: Any = runtime.undefined,
    ) -> list[SageBytes]:
        answer = []
        for part in SageBytes.split(self, separator, maxsplit):
            answer.append(SageByteArray(part._values))
        return answer

    def partition(self, separator: Any) -> Any:
        answer = []
        for part in SageBytes.partition(self, separator):
            answer.append(SageByteArray(part._values))
        return runtime.math_tuple(answer)


def _memoryview_index_getter(
    view: SageMemoryView,
    index: _Int,
) -> Any:
    def get_value() -> _Int:
        return view.__getitem__(index)

    return get_value


def _memoryview_index_setter(
    view: SageMemoryView,
    index: _Int,
) -> Any:
    def set_value(value: Any) -> None:
        view.__setitem__(index, value)

    return set_value


@runtime.sequence_class
class SageMemoryView:

    def __init__(
        self,
        source: Any,
        start: _Int = 0,
        length: Any = runtime.undefined,
    ) -> None:
        self._source: Any = source
        if isinstance(source, SageMemoryView):
            self._source = source._source
            self._offset = source._offset + start
            available = source._length - start
            self._readonly = source._readonly
        elif isinstance(source, SageBytes):
            self._source = source
            self._offset = start
            available = len(source) - start
            self._readonly = not isinstance(source, SageByteArray)
            self._itemsize = 1
            self._format = 'B'
        elif (
            hasattr(source, '_values')
            and hasattr(source, 'itemsize')
            and hasattr(source, 'typecode')
        ):
            self._source = source
            self._offset = start
            available = len(source) - start
            self._readonly = False
            self._itemsize = source.itemsize
            self._format = source.typecode
        else:
            raise TypeError(
                'memoryview: a bytes-like object is required, not '
                + runtime.jstype(source)
            )
        if isinstance(source, SageMemoryView):
            self._itemsize = source._itemsize
            self._format = source._format
        self._length = (
            available if length is runtime.undefined else _coerce_index(length)
        )
        if self._length < 0 or self._length > available:
            raise ValueError('memoryview length is out of range')
        for index in range(self._length):
            runtime.object.defineProperty(
                self,
                str(index),
                {
                    'get': _memoryview_index_getter(self, index),
                    'set': _memoryview_index_setter(self, index),
                    'enumerable': True,
                },
            )

    @property
    def length(self) -> _Int:
        return self._length

    @property
    def itemsize(self) -> _Int:
        return self._itemsize

    @property
    def readonly(self) -> _Bool:
        return self._readonly

    @property
    def format(self) -> _Str:
        return self._format

    def _values(self) -> list[_Int]:
        return self._source._values[
            self._offset:self._offset + self._length
        ]

    def _binary_string(self) -> _Str:
        answer = ''
        for value in self:
            answer += chr(value)
        return answer

    def __len__(self) -> _Int:
        return self._length

    def __iter__(self) -> Iterator[_Int]:
        return iter(self._values())

    def __getitem__(self, index: Any) -> Any:
        if hasattr(index, '__sagejs_slice__'):
            start, stop, step = index.indices(self._length)
            if step == 1:
                return SageMemoryView(self, start, stop - start)
            return SageMemoryView(
                SageByteArray([
                    self.__getitem__(position)
                    for position in range(start, stop, step)
                ])
            )
        index = _coerce_index(index)
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError('index out of bounds on dimension 1')
        return self._source._values[self._offset + index]

    def __setitem__(self, index: Any, value: Any) -> None:
        if self._readonly:
            raise TypeError('cannot modify read-only memory')
        if hasattr(index, '__sagejs_slice__'):
            start, stop, step = index.indices(self._length)
            if step == 1:
                self.__setslice__(start, stop, value)
                return
            replacement = [item for item in value]
            positions = [
                position for position in range(start, stop, step)
            ]
            if len(replacement) != len(positions):
                raise ValueError(
                    'memoryview assignment: lvalue and rvalue have '
                    'different structures'
                )
            for position_index in range(len(positions)):
                self.__setitem__(
                    positions[position_index],
                    replacement[position_index],
                )
            return
        index = _coerce_index(index)
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError('index out of bounds on dimension 1')
        if isinstance(self._source, SageByteArray):
            value = _coerce_index(value)
            if value < 0 or value > 255:
                raise ValueError('memoryview: invalid value for format B')
        self._source.__setitem__(self._offset + index, value)

    def __setslice__(self, start: Any, end: Any, values: Any) -> None:
        if self._readonly:
            raise TypeError('cannot modify read-only memory')
        first = _normalise_bound(start, 0, self._length)
        last = _normalise_bound(end, self._length, self._length)
        replacement = []
        if (
            isinstance(values, SageMemoryView)
            and (
                values.itemsize != self.itemsize
                or values.format != self.format
            )
        ):
            raise ValueError(
                'memoryview assignment: lvalue and rvalue have different '
                'structures'
            )
        for value in values:
            if isinstance(self._source, SageByteArray):
                byte = _coerce_index(value)
                if byte < 0 or byte > 255:
                    raise ValueError(
                        'memoryview: invalid value for format B')
                replacement.append(byte)
            else:
                replacement.append(value)
        if len(replacement) != last - first:
            raise ValueError(
                'memoryview assignment: lvalue and rvalue have different '
                'structures'
            )
        replacement = replacement[:]
        for index, value in enumerate(replacement):
            self._source.__setitem__(
                self._offset + first + index, value)

    def slice(
        self,
        start: Any = runtime.undefined,
        end: Any = runtime.undefined,
    ) -> SageMemoryView:
        first = _normalise_bound(start, 0, self._length)
        last = _normalise_bound(end, self._length, self._length)
        if last < first:
            last = first
        return SageMemoryView(self, first, last - first)

    def __eq__(self, other: object) -> _Bool:
        if isinstance(other, SageMemoryView):
            return self._values() == other._values()
        if isinstance(other, SageBytes):
            return self._values() == other._values
        return False

    def __add__(self, _other: Any) -> Any:
        raise TypeError(
            "unsupported operand type(s) for +: 'memoryview'")

    def __iadd__(self, _other: Any) -> Any:
        raise TypeError(
            "unsupported operand type(s) for +=: 'memoryview'")

    def decode(
        self,
        encoding: Any = runtime.undefined,
        errors: Any = runtime.undefined,
    ) -> _Str:
        return SageBytes(self._values()).decode(encoding, errors)

    def hex(
        self,
        separator: Any = runtime.undefined,
        bytes_per_separator: Any = 1,
    ) -> _Str:
        return SageBytes(self._bytes_values()).hex(
            separator, bytes_per_separator)

    def _bytes_values(self) -> list[_Int]:
        if hasattr(self._source, '_bytes_values'):
            return self._source._bytes_values(
                self._offset, self._length)
        return self._values()

    def __repr__(self) -> _Str:
        return '<memory at 0x0>'

    def __getattr__(self, name: _Str) -> Any:
        raise AttributeError(
            "'memoryview' object has no attribute '" + name + "'")

    toString = __repr__
    inspect = __repr__


def _new_bytes_like(source: SageBytes, values: list[_Int]) -> SageBytes:
    if isinstance(source, SageByteArray):
        return SageByteArray(values)
    return SageBytes(values)


def _construct_bytes(
    source: Any = runtime.undefined,
    encoding: Any = runtime.undefined,
    errors: Any = runtime.undefined,
) -> SageBytes:
    if source is runtime.undefined:
        if encoding is not runtime.undefined or errors is not runtime.undefined:
            raise TypeError('encoding without a string argument')
        return SageBytes([])
    if isinstance(source, SageByteArray):
        if encoding is not runtime.undefined or errors is not runtime.undefined:
            raise TypeError('encoding without a string argument')
        return SageBytes(source._values[:])
    if isinstance(source, SageMemoryView):
        if encoding is not runtime.undefined or errors is not runtime.undefined:
            raise TypeError('encoding without a string argument')
        return SageBytes(source._values())
    if hasattr(source, '_bytes_values'):
        if encoding is not runtime.undefined or errors is not runtime.undefined:
            raise TypeError('encoding without a string argument')
        return SageBytes(source._bytes_values())
    if isinstance(source, SageBytes):
        if encoding is not runtime.undefined or errors is not runtime.undefined:
            raise TypeError('encoding without a string argument')
        return source
    if runtime.strict_equal(runtime.jstype(source), 'string'):
        if encoding is runtime.undefined:
            raise TypeError('string argument without an encoding')
        normalised = _normalise_encoding(encoding)
        if normalised not in ('utf-8', 'utf8', 'ascii', 'latin-1', 'latin1'):
            raise ValueError('unknown encoding: ' + encoding)
        if normalised in ('utf-8', 'utf8'):
            values = _encode_utf8(source)
        else:
            values = _byte_values_from_binary_string(source)
        return SageBytes(values)
    if (
        runtime.strict_equal(runtime.jstype(source), 'number')
        or runtime.strict_equal(runtime.jstype(source), 'bigint')
    ):
        count = _coerce_index(source)
        if count < 0:
            raise ValueError('negative count')
        return SageBytes([0 for _unused in range(count)])
    if encoding is not runtime.undefined or errors is not runtime.undefined:
        raise TypeError('encoding without a string argument')
    values = []
    for value in iter(source):
        byte = _coerce_index(value)
        if byte < 0 or byte > 255:
            raise ValueError('bytes must be in range(0, 256)')
        values.append(byte)
    return SageBytes(values)


def ρσ_bytes(
    source: Any = runtime.undefined,
    encoding: Any = runtime.undefined,
    errors: Any = runtime.undefined,
    *extra: Any,
) -> SageBytes:
    if len(extra):
        raise TypeError('bytes() takes at most 3 arguments')
    return _construct_bytes(source, encoding, errors)


def ρσ_bytes_literal(value: _Str) -> SageBytes:
    return SageBytes(_byte_values_from_binary_string(value))


def ρσ_bytearray(
    source: Any = runtime.undefined,
    encoding: Any = runtime.undefined,
    errors: Any = runtime.undefined,
    *extra: Any,
) -> SageByteArray:
    if len(extra):
        raise TypeError('bytearray() takes at most 3 arguments')
    immutable = _construct_bytes(source, encoding, errors)
    return SageByteArray(immutable._values[:])


def ρσ_memoryview(source: Any, *extra: Any) -> SageMemoryView:
    if len(extra):
        raise TypeError('memoryview() takes exactly one argument')
    return SageMemoryView(source)


def _hex_digit_value(character: _Str) -> _Int:
    code = ord(character)
    if 48 <= code <= 57:
        return code - 48
    if 65 <= code <= 70:
        return code - 55
    if 97 <= code <= 102:
        return code - 87
    return -1


def _bytes_fromhex(text: Any) -> SageBytes:
    if not runtime.strict_equal(runtime.jstype(text), 'string'):
        raise TypeError('fromhex() argument must be str')
    whitespace = ' \t\n\r\x0b\x0c'
    values = []
    index = 0
    while index < len(text):
        while index < len(text) and text[index] in whitespace:
            index += 1
        if index >= len(text):
            break
        if index + 1 >= len(text):
            raise ValueError('non-hexadecimal number found in fromhex()')
        high = _hex_digit_value(text[index])
        low = _hex_digit_value(text[index + 1])
        if high < 0 or low < 0:
            raise ValueError('non-hexadecimal number found in fromhex()')
        values.append(high * 16 + low)
        index += 2
        if index < len(text) and text[index] not in whitespace:
            high = _hex_digit_value(text[index])
            if high >= 0:
                continue
            raise ValueError('non-hexadecimal number found in fromhex()')
    return SageBytes(values)


def _bytearray_fromhex(text: Any) -> SageByteArray:
    return SageByteArray(_bytes_fromhex(text)._values)


def _int_to_bytes(
    self: Any,
    length: Any = 1,
    byteorder: _Str = 'big',
    signed: _Bool = False,
) -> SageBytes:
    byte_count = _coerce_index(length)
    if byte_count < 0:
        raise ValueError('length argument must be non-negative')
    if byteorder != 'little' and byteorder != 'big':
        raise ValueError("byteorder must be either 'little' or 'big'")

    value = runtime.bigint(self)
    bit_count = runtime.bigint(byte_count * 8)
    modulus = runtime.native_lshift(runtime.bigint(1), bit_count)
    if signed:
        if byte_count == 0:
            minimum = runtime.bigint(0)
            maximum = runtime.bigint(0)
        else:
            sign_limit = runtime.native_lshift(
                runtime.bigint(1),
                runtime.native_sub(bit_count, runtime.bigint(1)),
            )
            minimum = runtime.native_neg(sign_limit)
            maximum = runtime.native_sub(sign_limit, runtime.bigint(1))
    else:
        minimum = runtime.bigint(0)
        maximum = runtime.native_sub(modulus, runtime.bigint(1))
    if value < minimum or value > maximum:
        raise OverflowError('int too big to convert')
    if value < 0:
        value = runtime.native_add(value, modulus)

    values = []
    for _unused in range(byte_count):
        values.append(runtime.number(
            runtime.native_bitand(value, runtime.bigint(255))))
        value = runtime.native_rshift(value, runtime.bigint(8))
    if byteorder == 'big':
        values.reverse()
    return SageBytes(values)


def _int_from_bytes(
    source: Any,
    byteorder: _Str = 'big',
    signed: _Bool = False,
) -> Any:
    if byteorder != 'little' and byteorder != 'big':
        raise ValueError("byteorder must be either 'little' or 'big'")
    if (
        isinstance(source, SageBytes)
        or isinstance(source, SageByteArray)
        or isinstance(source, SageMemoryView)
        or hasattr(source, '_bytes_values')
    ):
        source = _construct_bytes(source)
        values = source._values[:]
    else:
        values = []
        for item in source:
            byte = _coerce_index(item)
            if byte < 0 or byte > 255:
                raise ValueError('bytes must be in range(0, 256)')
            values.append(byte)
    ordered = values[:] if byteorder == 'big' else values[::-1]
    answer = runtime.bigint(0)
    for byte in ordered:
        answer = runtime.native_add(
            runtime.native_lshift(answer, runtime.bigint(8)),
            runtime.bigint(byte),
        )
    if (
        signed
        and len(ordered) > 0
        and ordered[0] & 128
    ):
        answer = runtime.native_sub(
            answer,
            runtime.native_lshift(
                runtime.bigint(1),
                runtime.bigint(len(ordered) * 8),
            ),
        )
    return runtime.normalize_integer(answer)


runtime.reflect.set(
    ρσ_bytes,
    'prototype',
    runtime.reflect.get(SageBytes, 'prototype'),
)
for _method_name in [
    'center', 'count', 'decode', 'endswith', 'find', 'index',
    'isalpha', 'isdigit', 'islower', 'isspace', 'isupper', 'join',
    'lower', 'lstrip', 'partition', 'replace', 'rfind', 'rindex',
    'rpartition', 'rsplit', 'rstrip', 'split', 'startswith',
    'strip', 'upper',
]:
    runtime.reflect.set(
        ρσ_bytes,
        _method_name,
        runtime.reflect.get(SageBytes, _method_name),
    )

bytes = ρσ_bytes
bytearray = ρσ_bytearray
memoryview = ρσ_memoryview

_int_to_bytes_native = runtime.native_method(_int_to_bytes)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, 'prototype'),
    'to_bytes',
    _int_to_bytes_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, 'prototype'),
    'to_bytes',
    _int_to_bytes_native,
)
runtime.reflect.set(runtime.int_builtin, 'from_bytes', _int_from_bytes)

runtime.set_class_repr(SageBytes, "<class 'bytes'>")
runtime.set_class_repr(SageByteArray, "<class 'bytearray'>")
runtime.set_class_repr(SageMemoryView, "<class 'memoryview'>")

runtime.reflect.set(
    ρσ_bytearray,
    'prototype',
    runtime.reflect.get(SageByteArray, 'prototype'),
)
for _bytearray_method_name in [
    'append', 'center', 'count', 'decode', 'endswith', 'extend',
    'find', 'index', 'isalpha', 'isdigit', 'islower', 'isspace',
    'isupper', 'join', 'lower', 'lstrip', 'partition', 'replace',
    'rfind', 'rindex', 'rpartition', 'rsplit', 'rstrip', 'split',
    'startswith', 'strip', 'upper',
]:
    runtime.reflect.set(
        ρσ_bytearray,
        _bytearray_method_name,
        runtime.reflect.get(SageByteArray, _bytearray_method_name),
    )

runtime.reflect.set(ρσ_bytes, 'fromhex', _bytes_fromhex)
runtime.reflect.set(ρσ_bytearray, 'fromhex', _bytearray_fromhex)
runtime.reflect.set(
    ρσ_memoryview,
    'prototype',
    runtime.reflect.get(SageMemoryView, 'prototype'),
)
