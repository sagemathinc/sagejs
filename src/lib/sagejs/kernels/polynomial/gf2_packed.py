"""Source-transparent kernels for canonical bit-packed `GF(2)[x]` values.

Coefficients are packed low degree first into unsigned 64-bit words. Bit `j`
of word `i` is the coefficient of `x^(64*i + j)`. The logical bit length is
stored separately so zero has one canonical representation: an empty word
buffer with bit length zero. A nonzero value has no trailing zero words or
padding bits.

`BitPolynomialView` is borrowed and read-only for the duration of a kernel
call. The mathematical source never observes an address or owns cleanup.
These deliberately arithmetic implementations are ordinary CPython fallbacks
and source-transparent native-compiler inputs; a future compiler lowering may
replace the fixed-width arithmetic with target bit operations without changing
the representation or its users.
"""

from __future__ import annotations

from sagejs.native import NativeRecord, UInt64Buffer, native, uint64


class BitPolynomialView(NativeRecord):
    """A borrowed canonical bit-polynomial span."""

    words: UInt64Buffer
    bit_length: uint64


def _gf2_packed_valid(source: BitPolynomialView) -> uint64:
    expected_words = source.bit_length // 64
    if source.bit_length % 64 != 0:
        expected_words += 1
    valid = len(source.words) == expected_words
    if valid and expected_words != 0:
        top = source.words[expected_words - 1]
        top_bits = 0
        while top != 0:
            top = top // 2
            top_bits += 1
        expected_top_bits = source.bit_length % 64
        if expected_top_bits == 0:
            expected_top_bits = 64
        if top_bits != expected_top_bits:
            valid = False
    result = 0
    if valid:
        result = 1
    return result


@native
def gf2_packed_valid(source: BitPolynomialView) -> bool:
    """Return whether `source` has the canonical packed representation."""
    return _gf2_packed_valid(source) != 0


@native
def gf2_packed_bit_length(source: BitPolynomialView) -> uint64:
    """Return degree plus one, with zero returning zero."""
    return source.bit_length


@native
def gf2_packed_coefficient(
    source: BitPolynomialView,
    index: uint64,
) -> uint64:
    """Return one coefficient, with indices above the degree returning zero."""
    result = 0
    if index < source.bit_length:
        word = source.words[index // 64]
        offset = index % 64
        for step in range(offset):
            word = word // 2
        result = word % 2
    return result


@native
def gf2_packed_weight(source: BitPolynomialView) -> uint64:
    """Count nonzero coefficients by read-only traversal of packed storage."""
    weight = 0
    for index in range(len(source.words)):
        word = source.words[index]
        while word != 0:
            weight += word % 2
            word = word // 2
    return weight


@native
def gf2_packed_equal(
    left: BitPolynomialView,
    right: BitPolynomialView,
) -> bool:
    """Compare canonical logical values without unpacking coefficients."""
    equal = _gf2_packed_valid(left) != 0 and _gf2_packed_valid(right) != 0
    if left.bit_length != right.bit_length:
        equal = False
    if equal:
        for index in range(len(left.words)):
            if left.words[index] != right.words[index]:
                equal = False
    return equal


def _gf2_word_xor(
    left: uint64,
    right: uint64,
    representation_witness: BitPolynomialView,
) -> uint64:
    """Compute one word XOR using compiler-visible integer arithmetic."""
    result = 0
    place = 1
    for index in range(64):
        result += ((left % 2 + right % 2) % 2) * place
        left = left // 2
        right = right // 2
        if index != 63:
            place *= 2
    return result


@native
def gf2_packed_xor(
    output: UInt64Buffer,
    output_bit_length: UInt64Buffer,
    left: BitPolynomialView,
    right: BitPolynomialView,
) -> bool:
    """Write canonical `left + right` and its logical bit length."""
    expected_words = len(left.words)
    if len(right.words) > expected_words:
        expected_words = len(right.words)
    valid = _gf2_packed_valid(left) != 0 and _gf2_packed_valid(right) != 0
    if len(output) != expected_words:
        valid = False
    if len(output_bit_length) != 1:
        valid = False
    if valid:
        for index in range(expected_words):
            left_word = 0
            right_word = 0
            if index < len(left.words):
                left_word = left.words[index]
            if index < len(right.words):
                right_word = right.words[index]
            output[index] = _gf2_word_xor(left_word, right_word, left)
        result_words = expected_words
        while result_words != 0 and output[result_words - 1] == 0:
            result_words -= 1
        result_bit_length = 0
        if result_words != 0:
            top = output[result_words - 1]
            top_bits = 0
            while top != 0:
                top = top // 2
                top_bits += 1
            result_bit_length = (result_words - 1) * 64 + top_bits
        output_bit_length[0] = result_bit_length
    return valid


@native
def gf2_packed_shift_left(
    output: UInt64Buffer,
    output_bit_length: UInt64Buffer,
    source: BitPolynomialView,
    amount: uint64,
) -> bool:
    """Write canonical `source * x^amount` without unpacking host objects."""
    shifted_length = 0
    overflow = False
    if source.bit_length != 0:
        if amount > 18446744073709551615 - source.bit_length:
            overflow = True
        else:
            shifted_length = source.bit_length + amount
    expected_words = shifted_length // 64
    if shifted_length % 64 != 0:
        expected_words += 1
    valid = _gf2_packed_valid(source) != 0 and not overflow
    if len(output) != expected_words:
        valid = False
    if len(output_bit_length) != 1:
        valid = False
    if valid:
        for index in range(len(output)):
            output[index] = 0
        word_shift = amount // 64
        bit_shift = amount % 64
        if bit_shift == 0:
            for index in range(len(source.words)):
                output[word_shift + index] = source.words[index]
        else:
            place = 1
            for step in range(bit_shift):
                place *= 2
            carry_divisor = 1
            for step in range(64 - bit_shift):
                carry_divisor *= 2
            for index in range(len(source.words)):
                word = source.words[index]
                target = word_shift + index
                low = word % carry_divisor
                output[target] = output[target] + low * place
                carry = word // carry_divisor
                if carry != 0:
                    output[target + 1] = output[target + 1] + carry
        output_bit_length[0] = shifted_length
    return valid


@native
def gf2_packed_shift_right(
    output: UInt64Buffer,
    output_bit_length: UInt64Buffer,
    source: BitPolynomialView,
    amount: uint64,
) -> bool:
    """Write canonical floor division of `source` by `x^amount`."""
    shifted_length = 0
    if amount < source.bit_length:
        shifted_length = source.bit_length - amount
    expected_words = shifted_length // 64
    if shifted_length % 64 != 0:
        expected_words += 1
    valid = _gf2_packed_valid(source) != 0
    if len(output) != expected_words:
        valid = False
    if len(output_bit_length) != 1:
        valid = False
    if valid:
        for index in range(len(output)):
            output[index] = 0
        word_shift = amount // 64
        bit_shift = amount % 64
        if bit_shift == 0:
            for index in range(len(output)):
                output[index] = source.words[word_shift + index]
        else:
            divisor = 1
            for step in range(bit_shift):
                divisor *= 2
            place = 1
            for step in range(64 - bit_shift):
                place *= 2
            for index in range(len(output)):
                source_index = word_shift + index
                output[index] = source.words[source_index] // divisor
                if source_index + 1 < len(source.words):
                    upper = source.words[source_index + 1] % divisor
                    output[index] = output[index] + upper * place
        output_bit_length[0] = shifted_length
    return valid
