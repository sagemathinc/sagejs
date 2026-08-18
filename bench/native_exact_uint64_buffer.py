"""Mixed exact/word-buffer witness for the source-transparent compiler."""

from sagejs.native import IntegerBuffer, UInt64Buffer, native, uint64


@native
def exact_uint64_buffer_witness(
    matrix: IntegerBuffer,
    words: UInt64Buffer,
    index: uint64,
    modulus: uint64,
) -> uint64:
    """Reduce one exact entry and accumulate it in borrowed word storage."""
    words[index] = matrix[index] % modulus
    words[0] = words[0] + words[index]
    return words[0]
