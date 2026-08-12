"""Canonical compiler-owned storage for dense polynomials over `GF(2)`.

`BitPolynomialStorage` is a small immutable mathematical value built from
ordinary Python and compiler-owned 64-bit words. It does not expose a FLINT,
NTL, Node-API, or JavaScript object as its canonical representation. Operations
borrow read-only `BitPolynomialView` records synchronously, so the same source
can run as plain CPython or through Sage.js native kernels.

The public polynomial layer is intentionally not coupled here. It can later
adopt this value as the canonical small/medium `GF(2)[x]` representation and
cross into an opaque NTL `GF2X` resource only at measured algorithmic
boundaries.
"""

from __future__ import annotations

from typing import Any, Iterable

from sagejs.kernels.polynomial.gf2_packed import (
    BitPolynomialView,
    gf2_packed_coefficient,
    gf2_packed_equal,
    gf2_packed_shift_left,
    gf2_packed_shift_right,
    gf2_packed_valid,
    gf2_packed_weight,
    gf2_packed_xor,
)
from sagejs.native import (
    UInt64Buffer,
    is_compiled,
    kernel_uint64_buffer,
    kernel_uint64_zeros,
)

_WORD_BITS = 64
_WORD_LIMIT = 1 << _WORD_BITS
_UINT64_LIMIT = _WORD_LIMIT - 1
_SERIALIZATION_MAGIC = b"SJG2P\x01\x00\x00"


def _word_count(bit_length: int) -> int:
    return (bit_length + _WORD_BITS - 1) // _WORD_BITS


def _exact_index(value: Any, description: str) -> int:
    if isinstance(value, int):
        return int(value)
    try:
        method = value.__index__
    except AttributeError:
        raise TypeError(description + " must be an integer") from None
    answer = method()
    if not isinstance(answer, int):
        raise TypeError("__index__ returned non-int")
    return int(answer)


def _storage_kernel() -> Any:
    """Return a compiled packed kernel when this module has any native ABI."""
    kernel = gf2_packed_valid
    for candidate in (
        gf2_packed_xor,
        gf2_packed_shift_left,
        gf2_packed_shift_right,
        gf2_packed_coefficient,
        gf2_packed_equal,
        gf2_packed_weight,
        gf2_packed_valid,
    ):
        if is_compiled(candidate):
            kernel = candidate
            break
    return kernel


def _canonical_word_buffer(words: Iterable[Any]) -> UInt64Buffer:
    """Return packed host storage in Sage.js and an ordinary list in CPython."""
    return kernel_uint64_buffer(_storage_kernel(), words)


def _kernel_word_zeros(kernel: Any, length: int) -> UInt64Buffer:
    """Allocate packed output storage for the active kernel implementation."""
    return kernel_uint64_zeros(kernel, length)


class BitPolynomialStorage:
    """An immutable canonical bit-packed polynomial value over `GF(2)`."""

    __slots__ = ("_bit_length", "_words")

    def __init__(self, words: Iterable[Any], bit_length: Any) -> None:
        logical_length = _exact_index(bit_length, "bit length")
        if logical_length < 0 or logical_length > _UINT64_LIMIT:
            raise OverflowError("bit length is outside the unsigned 64-bit range")
        packed: list[int] = []
        for raw_word in words:
            word = _exact_index(raw_word, "packed word")
            if word < 0 or word >= _WORD_LIMIT:
                raise OverflowError("packed word is outside the unsigned 64-bit range")
            packed.append(word)
        canonical_words = _canonical_word_buffer(packed)
        view = BitPolynomialView(canonical_words, logical_length)
        if not gf2_packed_valid(view):
            raise ValueError("noncanonical packed GF(2) polynomial storage")
        self._words = canonical_words
        self._bit_length = logical_length

    @classmethod
    def _from_kernel_output(
        cls,
        words: UInt64Buffer,
        bit_length: int,
        kernel: Any,
    ) -> BitPolynomialStorage:
        """Adopt canonical caller-owned kernel output without repacking it."""
        if not is_compiled(kernel) and is_compiled(_storage_kernel()):
            words = _canonical_word_buffer(words)
        answer = cls.__new__(cls)
        answer._words = words
        answer._bit_length = bit_length
        return answer

    @classmethod
    def zero(cls) -> BitPolynomialStorage:
        """Return the unique packed representation of zero."""
        return cls([], 0)

    @classmethod
    def from_words(cls, words: Iterable[Any], bit_length: Any) -> BitPolynomialStorage:
        """Validate and copy canonical low-to-high packed words."""
        return cls(words, bit_length)

    @classmethod
    def from_coefficients(cls, coefficients: Iterable[Any]) -> BitPolynomialStorage:
        """Reduce low-to-high exact coefficients modulo two and pack them."""
        words: list[int] = []
        current_word = 0
        place = 1
        offset = 0
        bit_length = 0
        index = 0
        for raw_coefficient in coefficients:
            coefficient = _exact_index(raw_coefficient, "coefficient") % 2
            if coefficient != 0:
                current_word += place
                bit_length = index + 1
            offset += 1
            index += 1
            if offset == _WORD_BITS:
                words.append(current_word)
                current_word = 0
                place = 1
                offset = 0
            else:
                place *= 2
        if offset != 0:
            words.append(current_word)
        del words[_word_count(bit_length) :]
        return cls(words, bit_length)

    @classmethod
    def from_bytes(cls, source: bytes) -> BitPolynomialStorage:
        """Decode the versioned canonical packed payload."""
        if not isinstance(source, bytes):
            raise TypeError("packed GF(2) polynomial serialization must be bytes")
        header_length = len(_SERIALIZATION_MAGIC) + 8
        if len(source) < header_length or not source.startswith(_SERIALIZATION_MAGIC):
            raise ValueError("invalid packed GF(2) polynomial serialization magic")
        bit_length = int.from_bytes(
            source[len(_SERIALIZATION_MAGIC) : header_length], "little"
        )
        byte_count = (bit_length + 7) // 8
        if len(source) != header_length + byte_count:
            raise ValueError("invalid packed GF(2) polynomial payload length")
        payload = source[header_length:]
        words: list[int] = []
        for offset in range(0, len(payload), 8):
            chunk = payload[offset : offset + 8]
            words.append(int.from_bytes(chunk, "little"))
        try:
            return cls(words, bit_length)
        except (OverflowError, ValueError) as error:
            raise ValueError(
                "noncanonical packed GF(2) polynomial serialization"
            ) from error

    @property
    def bit_length(self) -> int:
        """Return degree plus one, with zero returning zero."""
        return self._bit_length

    @property
    def degree(self) -> int:
        """Return the polynomial degree, with zero returning `-1`."""
        return self._bit_length - 1

    @property
    def words(self) -> tuple[int, ...]:
        """Return an immutable snapshot of the canonical packed words."""
        return tuple(int(self._words[index]) for index in range(len(self._words)))

    def _view(self) -> BitPolynomialView:
        return BitPolynomialView(self._words, self._bit_length)

    def coefficient(self, index: Any) -> int:
        """Return one coefficient; nonnegative indices above degree give zero."""
        position = _exact_index(index, "coefficient index")
        if position < 0:
            raise IndexError("coefficient index must be nonnegative")
        if position > _UINT64_LIMIT:
            return 0
        return int(gf2_packed_coefficient(self._view(), position))

    def weight(self) -> int:
        """Return the number of nonzero coefficients."""
        return int(gf2_packed_weight(self._view()))

    def to_coefficients(self) -> list[int]:
        """Return canonical low-to-high coefficients without trailing zeros."""
        coefficients: list[int] = []
        remaining = self._bit_length
        for index in range(len(self._words)):
            word = int(self._words[index])
            count = min(_WORD_BITS, remaining)
            for _offset in range(count):
                coefficients.append(word % 2)
                word //= 2
            remaining -= count
        return coefficients

    def __bool__(self) -> bool:
        return self._bit_length != 0

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, BitPolynomialStorage):
            return False
        return bool(gf2_packed_equal(self._view(), other._view()))

    def __hash__(self) -> int:
        return hash((self._bit_length, self.words))

    def __add__(self, other: object) -> BitPolynomialStorage:
        if not isinstance(other, BitPolynomialStorage):
            return NotImplemented
        output = _kernel_word_zeros(
            gf2_packed_xor,
            max(len(self._words), len(other._words)),
        )
        output_length = _kernel_word_zeros(gf2_packed_xor, 1)
        if not gf2_packed_xor(output, output_length, self._view(), other._view()):
            raise RuntimeError("packed GF(2) addition contract failed")
        logical_length = int(output_length[0])
        logical_words = _word_count(logical_length)
        if logical_words == len(output):
            return type(self)._from_kernel_output(
                output,
                logical_length,
                gf2_packed_xor,
            )
        return type(self)(
            (int(output[index]) for index in range(logical_words)),
            logical_length,
        )

    def __xor__(self, other: object) -> BitPolynomialStorage:
        return self.__add__(other)

    def shift_left(self, amount: Any) -> BitPolynomialStorage:
        """Return multiplication by `x^amount`."""
        shift = _exact_index(amount, "shift amount")
        if shift < 0:
            raise ValueError("shift amount must be nonnegative")
        if not self:
            return type(self).zero()
        if self._bit_length != 0 and shift > _UINT64_LIMIT - self._bit_length:
            raise OverflowError("shifted bit length exceeds unsigned 64-bit range")
        output_length_value = 0 if not self else self._bit_length + shift
        output = _kernel_word_zeros(
            gf2_packed_shift_left,
            _word_count(output_length_value),
        )
        output_length = _kernel_word_zeros(gf2_packed_shift_left, 1)
        if not gf2_packed_shift_left(output, output_length, self._view(), shift):
            raise RuntimeError("packed GF(2) left-shift contract failed")
        return type(self)._from_kernel_output(
            output,
            int(output_length[0]),
            gf2_packed_shift_left,
        )

    def shift_right(self, amount: Any) -> BitPolynomialStorage:
        """Return floor division by `x^amount`."""
        shift = _exact_index(amount, "shift amount")
        if shift < 0:
            raise ValueError("shift amount must be nonnegative")
        if not self:
            return type(self).zero()
        if shift > _UINT64_LIMIT:
            return type(self).zero()
        output_length_value = max(0, self._bit_length - shift)
        output = _kernel_word_zeros(
            gf2_packed_shift_right,
            _word_count(output_length_value),
        )
        output_length = _kernel_word_zeros(gf2_packed_shift_right, 1)
        if not gf2_packed_shift_right(output, output_length, self._view(), shift):
            raise RuntimeError("packed GF(2) right-shift contract failed")
        return type(self)._from_kernel_output(
            output,
            int(output_length[0]),
            gf2_packed_shift_right,
        )

    def format(self, variable: str = "x") -> str:
        """Return Sage-style polynomial text over `GF(2)`."""
        if not isinstance(variable, str):
            raise TypeError("polynomial variable name must be a string")
        terms: list[str] = []
        for word_index in range(len(self._words) - 1, -1, -1):
            word = int(self._words[word_index])
            top_offset = _WORD_BITS - 1
            if word_index == len(self._words) - 1:
                top_offset = (self._bit_length - 1) % _WORD_BITS
            divisor = 1
            for _offset in range(top_offset):
                divisor *= 2
            for offset in range(top_offset, -1, -1):
                if word // divisor % 2 != 0:
                    exponent = word_index * _WORD_BITS + offset
                    if exponent == 0:
                        terms.append("1")
                    elif exponent == 1:
                        terms.append(variable)
                    else:
                        terms.append(variable + "^" + str(exponent))
                if divisor != 1:
                    divisor //= 2
        return " + ".join(terms) if terms else "0"

    def to_bytes(self) -> bytes:
        """Return a stable versioned encoding of logical length and packed bits."""
        payload = b"".join(
            int(self._words[index]).to_bytes(8, "little")
            for index in range(len(self._words))
        )
        payload = payload[: (self._bit_length + 7) // 8]
        return _SERIALIZATION_MAGIC + self._bit_length.to_bytes(8, "little") + payload

    def __repr__(self) -> str:
        return "BitPolynomialStorage(" + self.format() + ")"
