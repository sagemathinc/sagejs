"""Packed polynomial-multiplication witness for the declarative FLINT FFI."""

from sagejs.ffi.flint import nmod_poly_mul
from sagejs.native import UInt64Buffer, native, uint64


@native
def flint_nmod_polynomial_product(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_mul(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )
