"""High-precision roots for the authentic field-3 mixed quartic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is a deliberately narrow `get_roots` cut for
`x^4 - 2000022*x - 2000042`.  It consumes the exact prepared integral-basis
owner, not the resident 192-bit roots or embedding matrix.  Two real roots are
refined by exact fixed-point Newton iteration.  The complex representative is
then derived from Vieta's identities, so all four published real components
come from the defining polynomial alone.
"""

from math import isqrt

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .real_division import pari_real_division
from .short_product import (
    pari_real_word_division,
    pari_short_product,
    pari_short_square,
    pari_signed_real_sum,
    pari_word_integer_real_product,
    pari_word_integer_real_sum,
)


@native
def pari_field3_quartic_fixed_value(value: int, scale: int) -> int:
    """Evaluate the frozen monic quartic, multiplied by `scale**4`."""
    square = value * value
    return (
        square * square
        - 2000022 * value * scale * scale * scale
        - 2000042 * (scale * scale * scale * scale)
    )


@native
def pari_field3_quartic_fixed_derivative(value: int, scale: int) -> int:
    """Evaluate the frozen derivative, multiplied by `scale**3`."""
    return 4 * value * value * value - 2000022 * scale * scale * scale


@native
def pari_field3_truncated_division(numerator: int, denominator: int) -> int:
    """Divide toward zero, matching the fixed-point Newton convention."""
    if denominator == 0:
        raise ZeroDivisionError("zero field-3 quartic derivative")
    quotient = abs(numerator) // abs(denominator)
    if (numerator < 0) != (denominator < 0):
        return -quotient
    return quotient


@native
def pari_field3_quartic_fixed_root(seed: int, working: int) -> int:
    """Refine one isolated real root at a `2**working` scale."""
    scale = 1 << working
    value = seed * scale
    converged = False
    for unused in range(24):
        correction = pari_field3_truncated_division(
            pari_field3_quartic_fixed_value(value, scale),
            pari_field3_quartic_fixed_derivative(value, scale),
        )
        value -= correction
        if abs(correction) <= 1:
            converged = True
            break
    if not converged:
        raise ValueError("field-3 quartic fixed-point Newton did not converge")
    return value


@native
def pari_field3_pack_fixed(
    value: int, working: int, precision: int
) -> tuple[int, int, int]:
    """Round a nonzero fixed-point value to one normalized PARI triple."""
    if value == 0:
        raise ValueError("zero field-3 root component")
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
        raise ValueError("field-3 root did not normalize")
    if value < 0:
        magnitude = -magnitude
    return magnitude, precision, exponent


@native
def pari_field3_pack_rational(
    numerator: int, denominator: int, precision: int
) -> tuple[int, int, int]:
    """Correctly round a nonzero rational to a normalized packed triple."""
    if numerator == 0:
        return 0, -1, 0
    if denominator <= 0 or precision < 64 or precision > 154112:
        raise ValueError("invalid field-3 rational packing request")
    magnitude = abs(numerator)
    exponent = magnitude.bit_length() - denominator.bit_length()
    if exponent >= 0:
        if magnitude < denominator << exponent:
            exponent -= 1
    elif magnitude << (-exponent) < denominator:
        exponent -= 1
    shift = precision - 1 - exponent
    scaled = magnitude << shift
    quotient = scaled // denominator
    remainder = scaled % denominator
    if 2 * remainder > denominator:
        quotient += 1
    if quotient.bit_length() > precision:
        quotient >>= 1
        exponent += 1
    if quotient.bit_length() != precision:
        raise ValueError("field-3 rational did not normalize")
    if numerator < 0:
        quotient = -quotient
    return quotient, precision, exponent


@native
def pari_field3_real_basis_value(
    root: int,
    scale: int,
    c0: int,
    c1: int,
    c2: int,
    c3: int,
    denominator: int,
    precision: int,
) -> tuple[int, int, int]:
    """Evaluate one exact basis polynomial at a fixed-point real root."""
    square = root * root
    cube = square * root
    numerator = (
        c3 * cube
        + c2 * square * scale
        + c1 * root * scale * scale
        + c0 * scale * scale * scale
    )
    return pari_field3_pack_rational(
        numerator, denominator * scale * scale * scale, precision
    )


@native
def pari_field3_complex_basis_value(
    real: int,
    imaginary: int,
    scale: int,
    c0: int,
    c1: int,
    c2: int,
    c3: int,
    denominator: int,
    precision: int,
) -> tuple[int, int, int, int, int, int]:
    """Evaluate one exact basis polynomial at a fixed-point complex root."""
    real_square = real * real - imaginary * imaginary
    imaginary_square = 2 * real * imaginary
    real_cube = real * real * real - 3 * real * imaginary * imaginary
    imaginary_cube = 3 * real * real * imaginary - imaginary * imaginary * imaginary
    real_numerator = (
        c3 * real_cube
        + c2 * real_square * scale
        + c1 * real * scale * scale
        + c0 * scale * scale * scale
    )
    imaginary_numerator = (
        c3 * imaginary_cube
        + c2 * imaginary_square * scale
        + c1 * imaginary * scale * scale
    )
    rm, rp, re = pari_field3_pack_rational(
        real_numerator, denominator * scale * scale * scale, precision
    )
    im, ip, ie = pari_field3_pack_rational(
        imaginary_numerator, denominator * scale * scale * scale, precision
    )
    return rm, rp, re, im, ip, ie


@native
def pari_field3_real_horner(
    mantissa: int,
    precision: int,
    exponent: int,
    c0: int,
    c1: int,
    c2: int,
    c3: int,
    denominator: int,
    degree: int,
) -> tuple[int, int, int]:
    """Evaluate one cubic basis polynomial with `RgX_cxeval` association."""
    if degree == 1:
        vm, vp, ve = mantissa, precision, exponent
    elif exponent <= 1:
        leading = c2
        if degree == 3:
            leading = c3
        vm, vp, ve = pari_word_integer_real_product(
            leading, mantissa, precision, exponent
        )
        if degree == 3:
            vm, vp, ve = pari_word_integer_real_sum(c2, vm, vp, ve)
            vm, vp, ve = pari_short_product(mantissa, precision, exponent, vm, vp, ve)
        vm, vp, ve = pari_word_integer_real_sum(c1, vm, vp, ve)
        vm, vp, ve = pari_short_product(mantissa, precision, exponent, vm, vp, ve)
        vm, vp, ve = pari_word_integer_real_sum(c0, vm, vp, ve)
    else:
        one = 1 << (precision - 1)
        im, ip, ie = pari_real_division(
            one, precision, 0, mantissa, precision, exponent
        )
        if c0 == 0:
            # Keep PARI's exact-zero accumulator exact.  Converting it to a
            # packed real here would incorrectly cap the following product at
            # one word for the authentic `x^2-x` basis element.
            vm, vp, ve = pari_word_integer_real_product(c1, im, ip, ie)
            vm, vp, ve = pari_word_integer_real_sum(c2, vm, vp, ve)
        else:
            vm, vp, ve = pari_word_integer_real_product(c0, im, ip, ie)
            vm, vp, ve = pari_word_integer_real_sum(c1, vm, vp, ve)
            if degree >= 2:
                vm, vp, ve = pari_short_product(im, ip, ie, vm, vp, ve)
                vm, vp, ve = pari_word_integer_real_sum(c2, vm, vp, ve)
        if degree == 3:
            vm, vp, ve = pari_short_product(im, ip, ie, vm, vp, ve)
            vm, vp, ve = pari_word_integer_real_sum(c3, vm, vp, ve)
        qm, qp, qe = pari_short_square(mantissa, precision, exponent)
        if degree == 3:
            qm, qp, qe = pari_short_product(qm, qp, qe, mantissa, precision, exponent)
        vm, vp, ve = pari_short_product(qm, qp, qe, vm, vp, ve)
    if denominator != 1:
        vm, vp, ve = pari_real_word_division(denominator, vm, vp, ve)
    return vm, vp, ve


@native
def pari_field3_complex_product(
    arm: int,
    arp: int,
    are: int,
    aim: int,
    aip: int,
    aie: int,
    brm: int,
    brp: int,
    bre: int,
    bim: int,
    bip: int,
    bie: int,
) -> tuple[int, int, int, int, int, int]:
    """PARI's nonintegral `mulcc` four-product branch."""
    p1m, p1p, p1e = pari_short_product(arm, arp, are, brm, brp, bre)
    p2m, p2p, p2e = pari_short_product(aim, aip, aie, bim, bip, bie)
    p3m, p3p, p3e = pari_short_product(arm, arp, are, bim, bip, bie)
    p4m, p4p, p4e = pari_short_product(aim, aip, aie, brm, brp, bre)
    rm, rp, re = pari_signed_real_sum(p1m, p1p, p1e, -p2m, p2p, p2e)
    im, ip, ie = pari_signed_real_sum(p3m, p3p, p3e, p4m, p4p, p4e)
    return rm, rp, re, im, ip, ie


@native
def pari_field3_complex_square(
    rm: int, rp: int, re: int, im: int, ip: int, ie: int
) -> tuple[int, int, int, int, int, int]:
    """PARI's `gsqr(t_COMPLEX)` three-product association."""
    apm, app, ape = pari_signed_real_sum(rm, rp, re, im, ip, ie)
    amm, amp, ame = pari_signed_real_sum(rm, rp, re, -im, ip, ie)
    real_m, real_p, real_e = pari_short_product(apm, app, ape, amm, amp, ame)
    imag_m, imag_p, imag_e = pari_short_product(rm, rp, re, im, ip, ie)
    imag_m, imag_p, imag_e = pari_word_integer_real_product(2, imag_m, imag_p, imag_e)
    return real_m, real_p, real_e, imag_m, imag_p, imag_e


@native
def pari_field3_complex_inverse(
    rm: int, rp: int, re: int, im: int, ip: int, ie: int
) -> tuple[int, int, int, int, int, int]:
    """Return `1/(rm+i*im)` with the packed real division graph."""
    r2m, r2p, r2e = pari_short_square(rm, rp, re)
    i2m, i2p, i2e = pari_short_square(im, ip, ie)
    nm, np, ne = pari_signed_real_sum(r2m, r2p, r2e, i2m, i2p, i2e)
    orm, orp, ore = pari_real_division(rm, rp, re, nm, np, ne)
    oim, oip, oie = pari_real_division(-im, ip, ie, nm, np, ne)
    return orm, orp, ore, oim, oip, oie


@native
def pari_field3_complex_horner(
    rm: int,
    rp: int,
    re: int,
    im: int,
    ip: int,
    ie: int,
    c0: int,
    c1: int,
    c2: int,
    c3: int,
    denominator: int,
    degree: int,
) -> tuple[int, int, int, int, int, int]:
    """Evaluate one complex basis polynomial with inverse Horner."""
    if degree == 1:
        return rm, rp, re, im, ip, ie
    irm, irp, ire, iim, iip, iie = pari_field3_complex_inverse(rm, rp, re, im, ip, ie)
    if c0 == 0:
        # As in `RgX_cxeval`, zero remains an exact accumulator until the
        # first nonzero coefficient is multiplied by the inverse root.
        vrm, vrp, vre = pari_word_integer_real_product(c1, irm, irp, ire)
        vim, vip, vie = pari_word_integer_real_product(c1, iim, iip, iie)
        vrm, vrp, vre = pari_word_integer_real_sum(c2, vrm, vrp, vre)
    else:
        vrm, vrp, vre = pari_word_integer_real_product(c0, irm, irp, ire)
        vim, vip, vie = pari_word_integer_real_product(c0, iim, iip, iie)
        vrm, vrp, vre = pari_word_integer_real_sum(c1, vrm, vrp, vre)
        if degree >= 2:
            vrm, vrp, vre, vim, vip, vie = pari_field3_complex_product(
                irm,
                irp,
                ire,
                iim,
                iip,
                iie,
                vrm,
                vrp,
                vre,
                vim,
                vip,
                vie,
            )
            vrm, vrp, vre = pari_word_integer_real_sum(c2, vrm, vrp, vre)
    if degree == 3:
        vrm, vrp, vre, vim, vip, vie = pari_field3_complex_product(
            irm,
            irp,
            ire,
            iim,
            iip,
            iie,
            vrm,
            vrp,
            vre,
            vim,
            vip,
            vie,
        )
        vrm, vrp, vre = pari_word_integer_real_sum(c3, vrm, vrp, vre)
    qrm, qrp, qre, qim, qip, qie = pari_field3_complex_square(rm, rp, re, im, ip, ie)
    if degree == 3:
        qrm, qrp, qre, qim, qip, qie = pari_field3_complex_product(
            qrm,
            qrp,
            qre,
            qim,
            qip,
            qie,
            rm,
            rp,
            re,
            im,
            ip,
            ie,
        )
    vrm, vrp, vre, vim, vip, vie = pari_field3_complex_product(
        qrm,
        qrp,
        qre,
        qim,
        qip,
        qie,
        vrm,
        vrp,
        vre,
        vim,
        vip,
        vie,
    )
    if denominator != 1:
        vrm, vrp, vre = pari_real_word_division(denominator, vrm, vrp, vre)
        vim, vip, vie = pari_real_word_division(denominator, vim, vip, vie)
    return vrm, vrp, vre, vim, vip, vie


@native
def pari_field3_high_precision_embeddings(
    polynomial: IntegerBuffer,
    signature: Int64Buffer,
    basis: IntegerBuffer,
    basis_denominator: int,
    multiplication_tensor: IntegerBuffer,
    target: int,
    scratch: IntegerBuffer,
    root_m: IntegerBuffer,
    root_p: IntegerBuffer,
    root_e: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Rebuild two real roots and one complex representative transactionally.

    `basis` is the common-denominator `nf_get_zkprimpart` owner.  The tensor is
    checked by the independent exact caller before this leaf; admitting only
    its authentic length here prevents confusing it with basis provenance.
    Root storage is realified as `(r0, r1, Re(r2), Im(r2))`.
    """
    if (
        len(polynomial) < 5
        or len(signature) < 2
        or len(basis) < 16
        or len(multiplication_tensor) < 64
        or len(scratch) < 48
        or len(root_m) < 4
        or len(root_p) < 4
        or len(root_e) < 4
        or len(embedding_m) < 16
        or len(embedding_p) < 16
        or len(embedding_e) < 16
        or len(state) < 6
    ):
        raise ValueError("short field-3 high-precision root owner")
    if target != 153088:
        raise ValueError("unsupported field-3 high-precision root target")
    if (
        polynomial[0] != -2000042
        or polynomial[1] != -2000022
        or polynomial[2] != 0
        or polynomial[3] != 0
        or polynomial[4] != 1
        or signature[0] != 2
        or signature[1] != 1
        or basis_denominator != 37
    ):
        raise ValueError("wrong field-3 prepared owner identity")
    if (
        basis[0] != 37
        or basis[1] != 0
        or basis[2] != 0
        or basis[3] != 0
        or basis[4] != 0
        or basis[5] != 37
        or basis[6] != 0
        or basis[7] != 0
        or basis[8] != 0
        or basis[9] != -37
        or basis[10] != 37
        or basis[11] != 0
        or basis[12] != -1499998
        or basis[13] != -63
        or basis[14] != 14
        or basis[15] != 1
    ):
        raise ValueError("wrong field-3 prepared integral basis")

    precision = target + 64
    working = precision + 512
    first = pari_field3_quartic_fixed_root(-1, working)
    second = pari_field3_quartic_fixed_root(126, working)
    if not (first < 0 and second > 0):
        raise ValueError("field-3 real-root ordering changed")
    total = first + second
    real_complex = -(total // 2)
    radicand = 3 * total * total - 4 * first * second
    if radicand <= 0:
        raise ValueError("field-3 complex-root radicand is not positive")
    imaginary_complex = isqrt(radicand) // 2

    fm, fp, fe = pari_field3_pack_fixed(first, working, precision)
    sm, sp, se = pari_field3_pack_fixed(second, working, precision)
    rm, rp, re = pari_field3_pack_fixed(real_complex, working, precision)
    im, ip, ie = pari_field3_pack_fixed(imaginary_complex, working, precision)

    # `nf_basden` cancels the common 37 from the first three columns.  The
    # fourth column retains denominator 37.  Reconstruct the realified `M`
    # directly from the exact basis owner; no 192-bit `M` is consumed.
    for row in range(4):
        offset = 4 * row
        scratch[3 * offset] = 1
        scratch[3 * offset + 1] = -1
        scratch[3 * offset + 2] = 0
        if row == 3:
            scratch[3 * offset] = 0
    for column in range(1, 4):
        denominator = 1
        c0 = basis[4 * column] // 37
        c1 = basis[4 * column + 1] // 37
        c2 = basis[4 * column + 2] // 37
        c3 = basis[4 * column + 3] // 37
        if column == 3:
            denominator = 37
            c0 = basis[12]
            c1 = basis[13]
            c2 = basis[14]
            c3 = basis[15]
        vm, vp, ve = pari_field3_real_horner(
            fm, fp, fe, c0, c1, c2, c3, denominator, column
        )
        index = column
        scratch[3 * index] = vm
        scratch[3 * index + 1] = vp
        scratch[3 * index + 2] = ve
        vm, vp, ve = pari_field3_real_horner(
            sm, sp, se, c0, c1, c2, c3, denominator, column
        )
        index = 4 + column
        scratch[3 * index] = vm
        scratch[3 * index + 1] = vp
        scratch[3 * index + 2] = ve
        vrm, vrp, vre, vim, vip, vie = pari_field3_complex_horner(
            rm,
            rp,
            re,
            im,
            ip,
            ie,
            c0,
            c1,
            c2,
            c3,
            denominator,
            column,
        )
        index = 8 + column
        scratch[3 * index] = vrm
        scratch[3 * index + 1] = vrp
        scratch[3 * index + 2] = vre
        index = 12 + column
        scratch[3 * index] = vim
        scratch[3 * index + 1] = vip
        scratch[3 * index + 2] = vie

    root_m[0] = fm
    root_m[1] = sm
    root_m[2] = rm
    root_m[3] = im
    root_p[0] = fp
    root_p[1] = sp
    root_p[2] = rp
    root_p[3] = ip
    root_e[0] = fe
    root_e[1] = se
    root_e[2] = re
    root_e[3] = ie
    for index in range(16):
        embedding_m[index] = scratch[3 * index]
        embedding_p[index] = scratch[3 * index + 1]
        embedding_e[index] = scratch[3 * index + 2]
    state[0] = 0
    state[1] = target
    state[2] = precision
    state[3] = working
    state[4] = 2
    state[5] = 1
    return 0


__all__ = ["pari_field3_high_precision_embeddings"]
