"""PARI 2.17.4 high-precision complex AGM logarithm.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is a narrow translation of `agm1cx` and `logagmcx`.  A complex value is
represented by two packed-real triples; the public batch admits only the
reviewed 153,088-bit corridor.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .exponential import pari_real_resize
from .logarithm_constant import pari_log2_constant
from .pi_constant import pari_pi_constant
from .real_division import pari_real_division
from .real_square_root import pari_real_square_root_abs
from .short_product import (
    pari_short_product,
    pari_short_square,
    pari_signed_real_sum,
    pari_word_integer_real_product,
)


@native
def pari_complex_norm(
    rm: int, rp: int, re: int, im: int, ip: int, ie: int
) -> tuple[int, int, int]:
    """Translate `cxnorm` for two packed-real components."""
    r2m, r2p, r2e = pari_short_square(rm, rp, re)
    i2m, i2p, i2e = pari_short_square(im, ip, ie)
    return pari_signed_real_sum(r2m, r2p, r2e, i2m, i2p, i2e)


@native
def pari_complex_product(
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
    """Translate PARI's nonintegral `mulcc` four-product branch."""
    acm, acp, ace = pari_short_product(arm, arp, are, brm, brp, bre)
    bdm, bdp, bde = pari_short_product(aim, aip, aie, bim, bip, bie)
    adm, adp, ade = pari_short_product(arm, arp, are, bim, bip, bie)
    bcm, bcp, bce = pari_short_product(aim, aip, aie, brm, brp, bre)
    rm, rp, re = pari_signed_real_sum(acm, acp, ace, -bdm, bdp, bde)
    im, ip, ie = pari_signed_real_sum(adm, adp, ade, bcm, bcp, bce)
    return rm, rp, re, im, ip, ie


@native
def pari_complex_scalar_division(
    sm: int,
    sp: int,
    se: int,
    rm: int,
    rp: int,
    re: int,
    im: int,
    ip: int,
    ie: int,
) -> tuple[int, int, int, int, int, int]:
    """Translate scalar / complex using `cxnorm` and the conjugate."""
    nm, np, ne = pari_complex_norm(rm, rp, re, im, ip, ie)
    qm, qp, qe = pari_real_division(sm, sp, se, nm, np, ne)
    orm, orp, ore = pari_short_product(qm, qp, qe, rm, rp, re)
    oim, oip, oie = pari_short_product(qm, qp, qe, -im, ip, ie)
    return orm, orp, ore, oim, oip, oie


@native
def pari_complex_square_root(
    rm: int,
    rp: int,
    re: int,
    im: int,
    ip: int,
    ie: int,
) -> tuple[int, int, int, int, int, int]:
    """Translate the real-component branch of `gsqrt(t_COMPLEX)`."""
    if im == 0:
        raise ValueError("complex AGM square root requires a non-axis value")
    nm, np, ne = pari_complex_norm(rm, rp, re, im, ip, ie)
    mm, mp, me = pari_real_square_root_abs(nm, np, ne)
    if rm < 0:
        vm, vp, ve = pari_signed_real_sum(mm, mp, me, -rm, rp, re)
        ve -= 1
        vm, vp, ve = pari_real_square_root_abs(vm, vp, ve)
        if im < 0:
            vm = -vm
        dm, dp, de = pari_word_integer_real_product(2, vm, vp, ve)
        um, up, ue = pari_real_division(im, ip, ie, dm, dp, de)
    else:
        um, up, ue = pari_signed_real_sum(mm, mp, me, rm, rp, re)
        ue -= 1
        um, up, ue = pari_real_square_root_abs(um, up, ue)
        dm, dp, de = pari_word_integer_real_product(2, um, up, ue)
        vm, vp, ve = pari_real_division(im, ip, ie, dm, dp, de)
    return um, up, ue, vm, vp, ve


@native
def pari_agm1_complex(
    rm: int, rp: int, re: int, im: int, ip: int, ie: int, precision: int
) -> tuple[int, int, int, int, int, int]:
    """Translate `agm1cx` for one non-axis packed complex value."""
    if precision < 64 or precision > 154112 or precision % 64 != 0:
        raise ValueError("unsupported complex AGM precision")
    one = 1 << (precision - 1)
    arm, arp, are = pari_signed_real_sum(one, precision, 0, rm, rp, re)
    are -= 1
    aim, aip, aie = pari_real_resize(im, ip, ie, precision)
    aie -= 1
    rotate = 0
    if rm < 0:
        if im < 0:
            arm, aim = -aim, arm
            arp, aip = aip, arp
            are, aie = aie, are
            rotate = -1
        else:
            arm, aim = aim, -arm
            arp, aip = aip, arp
            are, aie = aie, are
            rotate = 1
        rm = -rm
        im = -im
    brm, brp, bre, bim, bip, bie = pari_complex_square_root(rm, rp, re, im, ip, ie)
    limit = 1 - precision
    previous = 1000000000
    flat = 0
    iterations = 0
    while True:
        drm, drp, dre = pari_signed_real_sum(brm, brp, bre, -arm, arp, are)
        dim, dip, die = pari_signed_real_sum(bim, bip, bie, -aim, aip, aie)
        difference_exponent = die
        if drm != 0:
            difference_exponent = dre
        if dim != 0 and (drm == 0 or die > difference_exponent):
            difference_exponent = die
        value_exponent = bie
        if brm != 0:
            value_exponent = bre
        if bim != 0 and (brm == 0 or bie > value_exponent):
            value_exponent = bie
        if (drm == 0 and dim == 0) or difference_exponent - value_exponent < limit:
            break
        if difference_exponent < previous:
            flat = 0
        else:
            if flat != 0:
                break
            flat += 1
        previous = difference_exponent
        oldrm, oldrp, oldre = arm, arp, are
        oldim, oldip, oldie = aim, aip, aie
        arm, arp, are = pari_signed_real_sum(arm, arp, are, brm, brp, bre)
        aim, aip, aie = pari_signed_real_sum(aim, aip, aie, bim, bip, bie)
        are -= 1
        aie -= 1
        brm, brp, bre, bim, bip, bie = pari_complex_product(
            oldrm,
            oldrp,
            oldre,
            oldim,
            oldip,
            oldie,
            brm,
            brp,
            bre,
            bim,
            bip,
            bie,
        )
        brm, brp, bre, bim, bip, bie = pari_complex_square_root(
            brm, brp, bre, bim, bip, bie
        )
        iterations += 1
        if iterations > 32:
            raise ValueError("complex AGM iteration boundary exhausted")
    if rotate > 0:
        arm, aim = -aim, arm
        arp, aip = aip, arp
        are, aie = aie, are
    elif rotate < 0:
        arm, aim = aim, -arm
        arp, aip = aip, arp
        are, aie = aie, are
    return arm, arp, are, aim, aip, aie


@native
def pari_complex_logarithm_agm(
    rm: int,
    rp: int,
    re: int,
    im: int,
    ip: int,
    ie: int,
    target: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int, int]:
    """Translate `logagmcx` in the reviewed 153,088-bit corridor."""
    if target != 153088 or rm == 0 or im == 0:
        raise ValueError("unsupported high-precision complex logarithm input")
    if abs(rm).bit_length() != rp or abs(im).bit_length() != ip:
        raise ValueError("unnormalized complex logarithm input")
    working = target + 64
    negative = rm < 0
    if negative:
        rm, im = -rm, -im
    rm, rp, re = pari_real_resize(rm, rp, re, working)
    im, ip, ie = pari_real_resize(im, ip, ie, working)
    half = working >> 1
    largest_exponent = ie
    if re >= ie:
        largest_exponent = re
    scale = half - largest_exponent
    re += scale
    ie += scale
    four = 1 << (working - 1)
    qrm, qrp, qre, qim, qip, qie = pari_complex_scalar_division(
        four, working, 2, rm, rp, re, im, ip, ie
    )
    arm, arp, are, aim, aip, aie = pari_agm1_complex(
        qrm, qrp, qre, qim, qip, qie, working
    )
    pim, pip, pie = pari_pi_constant(working, pi_cache, a, b, p, q, stack)
    pie -= 1
    yrm, yrp, yre, yim, yip, yie = pari_complex_scalar_division(
        pim, pip, pie, arm, arp, are, aim, aip, aie
    )
    lm, lp, le = pari_log2_constant(working, log_cache, a, b, p, q, stack)
    lm, lp, le = pari_word_integer_real_product(-scale, lm, lp, le)
    yrm, yrp, yre = pari_signed_real_sum(yrm, yrp, yre, lm, lp, le)
    if negative:
        pm, pp, pe = pari_pi_constant(working, pi_cache, a, b, p, q, stack)
        if yim <= 0:
            yim, yip, yie = pari_signed_real_sum(yim, yip, yie, pm, pp, pe)
        else:
            yim, yip, yie = pari_signed_real_sum(yim, yip, yie, -pm, pp, pe)
    if yrp > target:
        yrm, yrp, yre = pari_real_resize(yrm, yrp, yre, target)
    if yip > target:
        yim, yip, yie = pari_real_resize(yim, yip, yie, target)
    return yrm, yrp, yre, yim, yip, yie


@native
def pari_high_precision_complex_agm_log_batch(
    inputs: IntegerBuffer,
    count: int,
    target: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    scratch: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Evaluate at most four inputs and publish all output atomically."""
    if target != 153088 or count < 1 or count > 4:
        raise ValueError("unsupported high-precision complex AGM log batch")
    if (
        len(inputs) < 6 * count
        or len(pi_cache) < 3
        or len(log_cache) < 3
        or len(a) < 16385
        or len(b) < 16385
        or len(p) < 16385
        or len(q) < 16385
        or len(stack) < 105
        or len(scratch) < 6 * count
        or len(output) < 6 * count
        or len(state) < 4
    ):
        raise ValueError("high-precision complex AGM log storage exhausted")
    for index in range(count):
        offset = 6 * index
        rm, rp, re = inputs[offset], inputs[offset + 1], inputs[offset + 2]
        im, ip, ie = inputs[offset + 3], inputs[offset + 4], inputs[offset + 5]
        if (
            rm == 0
            or im == 0
            or rp < 64
            or ip < 64
            or rp > 154112
            or ip > 154112
            or rp % 64 != 0
            or ip % 64 != 0
            or abs(rm).bit_length() != rp
            or abs(im).bit_length() != ip
            or re < -1000000
            or re > 1000000
            or ie < -1000000
            or ie > 1000000
        ):
            raise ValueError("invalid high-precision complex AGM log input")
    for index in range(count):
        offset = 6 * index
        yrm, yrp, yre, yim, yip, yie = pari_complex_logarithm_agm(
            inputs[offset],
            inputs[offset + 1],
            inputs[offset + 2],
            inputs[offset + 3],
            inputs[offset + 4],
            inputs[offset + 5],
            target,
            pi_cache,
            log_cache,
            a,
            b,
            p,
            q,
            stack,
        )
        scratch[offset] = yrm
        scratch[offset + 1] = yrp
        scratch[offset + 2] = yre
        scratch[offset + 3] = yim
        scratch[offset + 4] = yip
        scratch[offset + 5] = yie
    for index in range(6 * count):
        output[index] = scratch[index]
    state[0] = 0
    state[1] = target
    state[2] = count
    state[3] = 1
    return 0


__all__ = [
    "pari_complex_norm",
    "pari_complex_product",
    "pari_complex_scalar_division",
    "pari_complex_square_root",
    "pari_agm1_complex",
    "pari_complex_logarithm_agm",
    "pari_high_precision_complex_agm_log_batch",
]
