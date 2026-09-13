"""Codec for the Punycode encoding, as specified in RFC 3492

Written by Martin v. Löwis.
"""

from __future__ import annotations

# Adapted from CPython v3.14.7, 823f0323ee6ec1402088b73bce1a38473cac36dc.
# Copyright Python Software Foundation and contributors; PSF-2.0.
# See licenses/CPYTHON-PUNYCODE-NOTICE.md.
from typing import Any

_Str = str
_Int = int

##################### Encoding #####################################


def segregate(str: list[_Str]) -> tuple[bytes, list[_Str]]:
    """3.1 Basic code point segregation"""
    base = bytearray()
    extended = set()
    for c in str:
        if ord(c) < 128:
            base.append(ord(c))
        else:
            extended.add(c)
    return bytes(base), sorted(extended, key=ord)


def selective_len(str: list[_Str], max: _Int) -> _Int:
    """Return the length of str, considering only characters below max."""
    res = 0
    for c in str:
        if ord(c) < max:
            res += 1
    return res


def selective_find(
    str: list[_Str], char: _Str, index: _Int, pos: _Int
) -> tuple[_Int, _Int]:
    """Return a pair (index, pos), indicating the next occurrence of
    char in str. index is the position of the character considering
    only ordinals up to and including char, and pos is the position in
    the full string. index/pos is the starting position in the full
    string."""

    length = len(str)
    while 1:
        pos += 1
        if pos == length:
            return (-1, -1)
        c = str[pos]
        if c == char:
            return index + 1, pos
        elif ord(c) < ord(char):
            index += 1


def insertion_unsort(str: list[_Str], extended: list[_Str]) -> list[_Int]:
    """3.2 Insertion unsort coding"""
    oldchar = 0x80
    result = []
    oldindex = -1
    for c in extended:
        index = pos = -1
        char = ord(c)
        curlen = selective_len(str, char)
        delta = (curlen + 1) * (char - oldchar)
        while 1:
            index, pos = selective_find(str, c, index, pos)
            if index == -1:
                break
            delta += index - oldindex
            result.append(delta - 1)
            oldindex = index
            delta = 0
        oldchar = char

    return result


def T(j: _Int, bias: _Int) -> _Int:
    # Punycode parameters: tmin = 1, tmax = 26, base = 36
    res = 36 * (j + 1) - bias
    if res < 1:
        return 1
    if res > 26:
        return 26
    return res


digits = b"abcdefghijklmnopqrstuvwxyz0123456789"


def generate_generalized_integer(number: _Int, bias: _Int) -> bytes:
    """3.3 Generalized variable-length integers"""
    result = bytearray()
    j = 0
    while 1:
        t = T(j, bias)
        if number < t:
            result.append(digits[number])
            return bytes(result)
        result.append(digits[t + ((number - t) % (36 - t))])
        number = (number - t) // (36 - t)
        j += 1


def adapt(delta: _Int, first: bool, numchars: _Int) -> _Int:
    if first:
        delta //= 700
    else:
        delta //= 2
    delta += delta // numchars
    # ((base - tmin) * tmax) // 2 == 455
    divisions = 0
    while delta > 455:
        delta = delta // 35  # base - tmin
        divisions += 36
    bias = divisions + (36 * delta // (delta + 38))
    return bias


def generate_integers(baselen: _Int, deltas: list[_Int]) -> bytes:
    """3.4 Bias adaptation"""
    # Punycode parameters: initial bias = 72, damp = 700, skew = 38
    result = bytearray()
    bias = 72
    for points, delta in enumerate(deltas):
        s = generate_generalized_integer(delta, bias)
        result.extend(s)
        bias = adapt(delta, points == 0, baselen + points + 1)
    return bytes(result)


def punycode_encode(text: _Str) -> bytes:
    # Keep RFC code-point positions independent of host UTF-16 string indexing.
    characters = [char for char in text]
    base, extended = segregate(characters)
    deltas = insertion_unsort(characters, extended)
    encoded = generate_integers(len(base), deltas)
    if base:
        return base + b"-" + encoded
    return encoded


##################### Decoding #####################################


def decode_generalized_number(
    extended: bytes, extpos: _Int, bias: _Int, errors: _Str
) -> tuple[_Int, _Int | None]:
    """3.3 Generalized variable-length integers"""
    result = 0
    w = 1
    j = 0
    while 1:
        try:
            char = extended[extpos]
        except IndexError:
            if errors == "strict":
                raise UnicodeDecodeError(  # noqa: B904 - retain upstream exception context
                    "punycode",
                    extended,
                    extpos,
                    extpos + 1,
                    "incomplete punycode string",
                )
            return extpos + 1, None
        extpos += 1
        if 0x41 <= char <= 0x5A:  # A-Z
            digit = char - 0x41
        elif 0x30 <= char <= 0x39:
            digit = char - 22  # 0x30-26
        elif errors == "strict":
            raise UnicodeDecodeError(
                "punycode",
                extended,
                extpos - 1,
                extpos,
                f"Invalid extended code point '{extended[extpos - 1]}'",
            )
        else:
            return extpos, None
        t = T(j, bias)
        result += digit * w
        if digit < t:
            return extpos, result
        w = w * (36 - t)
        j += 1


def insertion_sort(base: _Str, extended: bytes, errors: _Str) -> _Str:
    """3.2 Insertion sort coding"""
    # This function raises UnicodeDecodeError with position in the extended.
    # Caller should add the offset.
    char = 0x80
    pos = -1
    bias = 72
    extpos = 0

    characters = [c for c in base]

    while extpos < len(extended):
        newpos, delta = decode_generalized_number(extended, extpos, bias, errors)
        if delta is None:
            # There was an error in decoding. We can't continue because
            # synchronization is lost.
            return "".join(characters)
        pos += delta + 1
        char += pos // (len(characters) + 1)
        if char > 0x10FFFF:
            if errors == "strict":
                raise UnicodeDecodeError(
                    "punycode", extended, pos - 1, pos, f"Invalid character U+{char:x}"
                )
            char = ord("?")
        pos = pos % (len(characters) + 1)
        characters.insert(pos, chr(char))
        bias = adapt(delta, (extpos == 0), len(characters))
        extpos = newpos
    return "".join(characters)


def punycode_decode(text: Any, errors: _Str = "strict") -> _Str:
    # bytes.decode short-circuits empty input before looking up an error handler.
    if not text:
        return ""
    if errors not in ("strict", "replace", "ignore"):
        raise UnicodeError(f"Unsupported error handling: {errors}")
    if isinstance(text, str):
        text = text.encode("ascii")
    if isinstance(text, memoryview):
        text = bytes(text)
    pos = text.rfind(b"-")
    if pos == -1:
        base = ""
        extended = text.upper()
    else:
        try:
            base = str(text[:pos], "ascii", errors)
        except UnicodeDecodeError as exc:
            raise UnicodeDecodeError(
                "ascii", text, exc.start, exc.end, exc.reason
            ) from None
        extended = text[pos + 1 :].upper()
    try:
        return insertion_sort(base, extended, errors)
    except UnicodeDecodeError as exc:
        offset = pos + 1
        raise UnicodeDecodeError(
            "punycode", text, offset + exc.start, offset + exc.end, exc.reason
        ) from None
