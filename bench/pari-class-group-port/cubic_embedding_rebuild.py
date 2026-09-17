"""Ordered p2,240-capacity embedding rebuild for the authentic real cubic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the narrow all-real cubic leaf needed by `nfnewprec_shallow` for
`x^3 - 20018*x + 20034`.  It isolates the three ordered roots from the
neutral polynomial, refines them with exact fixed-point Newton iteration, and
evaluates the supplied integral basis in `make_M` source order.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .real_conversion import pari_integer_to_real
from .real_division import pari_real_division
from .short_product import (
    pari_short_product,
    pari_short_square,
    pari_word_integer_real_product,
    pari_word_integer_real_sum,
)


@native
def pari_cubic_integer_value(c0: int, c1: int, c2: int, x: int) -> int:
    """Evaluate the monic cubic by exact Horner arithmetic."""
    return ((x + c2) * x + c1) * x + c0


@native
def pari_cubic_ordered_seeds(c0: int, c1: int, c2: int) -> tuple[int, int, int]:
    """Find one nearest integer endpoint in each ordered sign-change interval."""
    bound = abs(c0)
    if abs(c1) > bound:
        bound = abs(c1)
    if abs(c2) > bound:
        bound = abs(c2)
    bound += 1
    if bound > 100000:
        raise ValueError("cubic isolation bound exceeds the reviewed corridor")
    left = -bound
    previous = pari_cubic_integer_value(c0, c1, c2, left)
    if previous == 0:
        raise ValueError("exact integral cubic roots are outside this corridor")
    count = 0
    first = 0
    second = 0
    third = 0
    right = left + 1
    while right <= bound:
        value = pari_cubic_integer_value(c0, c1, c2, right)
        if value == 0:
            raise ValueError("exact integral cubic roots are outside this corridor")
        if (previous < 0 and value > 0) or (previous > 0 and value < 0):
            seed = left
            if abs(value) < abs(previous):
                seed = right
            if count == 0:
                first = seed
            elif count == 1:
                second = seed
            elif count == 2:
                third = seed
            else:
                raise ValueError("cubic has more than three isolated roots")
            count += 1
        left = right
        previous = value
        right += 1
    if count != 3 or not (first < second and second < third):
        raise ValueError("cubic does not have three separated real roots")
    return first, second, third


@native
def pari_truncated_integer_division(numerator: int, denominator: int) -> int:
    """Integer division toward zero, as used by the fixed-point Newton step."""
    if denominator == 0:
        raise ZeroDivisionError("zero cubic derivative")
    quotient = abs(numerator) // abs(denominator)
    if (numerator < 0) != (denominator < 0):
        return -quotient
    return quotient


@native
def pari_cubic_fixed_root(c0: int, c1: int, c2: int, seed: int, working: int) -> int:
    """Refine one isolated cubic root as an integer divided by `2**working`."""
    scale = 1 << working
    square_scale = scale * scale
    cube_scale = square_scale * scale
    x = seed * scale
    converged = False
    for unused in range(16):
        numerator = (
            x * x * x + c2 * x * x * scale + c1 * x * square_scale + c0 * cube_scale
        )
        denominator = 3 * x * x + 2 * c2 * x * scale + c1 * square_scale
        correction = pari_truncated_integer_division(numerator, denominator)
        x -= correction
        if abs(correction) <= 1:
            converged = True
            break
    if not converged:
        raise ValueError("cubic fixed-point Newton refinement did not converge")
    return x


@native
def pari_pack_fixed_root(
    value: int, working: int, precision: int
) -> tuple[int, int, int]:
    """Round a nonzero fixed-point root to one normalized PARI real triple."""
    if value == 0:
        raise ValueError("zero cubic root is outside this corridor")
    magnitude = abs(value)
    exponent = magnitude.bit_length() - 1 - working
    shift = working - precision + 1 + exponent
    if shift > 0:
        magnitude = (magnitude + (1 << (shift - 1))) >> shift
    elif shift < 0:
        magnitude <<= -shift
    if magnitude.bit_length() > precision:
        magnitude >>= 1
        exponent += 1
    if magnitude.bit_length() != precision:
        raise ValueError("cubic root did not normalize to the requested precision")
    if value < 0:
        magnitude = -magnitude
    return magnitude, precision, exponent


@native
def pari_cubic_basis_value(
    c0: int, c1: int, c2: int, root_m: int, root_p: int, root_e: int
) -> tuple[int, int, int]:
    """Evaluate a quadratic integral-basis polynomial as `RgX_cxeval` does."""
    if root_e > 1:
        one_m, one_p, one_e = pari_integer_to_real(1, root_p)
        inverse_m, inverse_p, inverse_e = pari_real_division(
            one_m, one_p, one_e, root_m, root_p, root_e
        )
        value_m, value_p, value_e = pari_word_integer_real_product(
            c0, inverse_m, inverse_p, inverse_e
        )
        value_m, value_p, value_e = pari_word_integer_real_sum(
            c1, value_m, value_p, value_e
        )
        value_m, value_p, value_e = pari_short_product(
            inverse_m,
            inverse_p,
            inverse_e,
            value_m,
            value_p,
            value_e,
        )
        value_m, value_p, value_e = pari_word_integer_real_sum(
            c2, value_m, value_p, value_e
        )
        square_m, square_p, square_e = pari_short_square(root_m, root_p, root_e)
        return pari_short_product(
            square_m,
            square_p,
            square_e,
            value_m,
            value_p,
            value_e,
        )
    value_m, value_p, value_e = pari_word_integer_real_product(
        c2, root_m, root_p, root_e
    )
    value_m, value_p, value_e = pari_word_integer_real_sum(
        c1, value_m, value_p, value_e
    )
    value_m, value_p, value_e = pari_short_product(
        root_m, root_p, root_e, value_m, value_p, value_e
    )
    return pari_word_integer_real_sum(c0, value_m, value_p, value_e)


@native
def pari_cubic_embedding_rebuild(
    polynomial: IntegerBuffer,
    basis: IntegerBuffer,
    precision: int,
    root_m: IntegerBuffer,
    root_p: IntegerBuffer,
    root_e: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Rebuild ordered roots and `make_M` for the authentic cubic corridor.

    Polynomial coefficients and the three integral-basis columns are supplied
    in increasing-degree and column-major order.  Public outputs are committed
    only after isolation, refinement, and every basis evaluation succeeds.
    """
    if (
        len(polynomial) < 4
        or len(basis) < 9
        or len(root_m) < 3
        or len(root_p) < 3
        or len(root_e) < 3
        or len(embedding_m) < 9
        or len(embedding_p) < 9
        or len(embedding_e) < 9
        or len(state) < 4
    ):
        raise ValueError("cubic embedding buffers are too short")
    if polynomial[3] != 1 or precision != 2176:
        raise ValueError("unsupported cubic embedding corridor")
    if basis[0] != 1 or basis[1] != 0 or basis[2] != 0:
        raise ValueError("integral basis must begin with one")
    if basis[3] != 0 or basis[4] != 1 or basis[5] != 0:
        raise ValueError("authentic cubic basis must have x as its second column")
    for index in range(9):
        if abs(basis[index]).bit_length() > 31:
            raise ValueError("cubic basis coefficient exceeds the reviewed corridor")
    c0 = polynomial[0]
    c1 = polynomial[1]
    c2 = polynomial[2]
    first_seed, second_seed, third_seed = pari_cubic_ordered_seeds(c0, c1, c2)
    working = precision + 320
    first_fixed = pari_cubic_fixed_root(c0, c1, c2, first_seed, working)
    second_fixed = pari_cubic_fixed_root(c0, c1, c2, second_seed, working)
    third_fixed = pari_cubic_fixed_root(c0, c1, c2, third_seed, working)
    first_m, first_p, first_e = pari_pack_fixed_root(first_fixed, working, precision)
    second_m, second_p, second_e = pari_pack_fixed_root(
        second_fixed, working, precision
    )
    third_m, third_p, third_e = pari_pack_fixed_root(third_fixed, working, precision)
    first_b_m, first_b_p, first_b_e = pari_cubic_basis_value(
        basis[6], basis[7], basis[8], first_m, first_p, first_e
    )
    second_b_m, second_b_p, second_b_e = pari_cubic_basis_value(
        basis[6], basis[7], basis[8], second_m, second_p, second_e
    )
    third_b_m, third_b_p, third_b_e = pari_cubic_basis_value(
        basis[6], basis[7], basis[8], third_m, third_p, third_e
    )
    root_m[0] = first_m
    root_m[1] = second_m
    root_m[2] = third_m
    root_p[0] = first_p
    root_p[1] = second_p
    root_p[2] = third_p
    root_e[0] = first_e
    root_e[1] = second_e
    root_e[2] = third_e
    for index in range(3):
        embedding_m[index] = 1
        embedding_p[index] = -1
        embedding_e[index] = 0
    embedding_m[3] = first_m
    embedding_m[4] = second_m
    embedding_m[5] = third_m
    embedding_p[3] = first_p
    embedding_p[4] = second_p
    embedding_p[5] = third_p
    embedding_e[3] = first_e
    embedding_e[4] = second_e
    embedding_e[5] = third_e
    embedding_m[6] = first_b_m
    embedding_m[7] = second_b_m
    embedding_m[8] = third_b_m
    embedding_p[6] = first_b_p
    embedding_p[7] = second_b_p
    embedding_p[8] = third_b_p
    embedding_e[6] = first_b_e
    embedding_e[7] = second_b_e
    embedding_e[8] = third_b_e
    state[0] = 3
    state[1] = precision
    state[2] = working
    state[3] = 1
    return 0
