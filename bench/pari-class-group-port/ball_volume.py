"""PARI 2.17.4 `buch2.c` unit-ball volume and small-norm search scale.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This source translation assumes upstream policy, not a proved search bound.
"""

from sagejs.native import checked_float64, native


@native
def pari_ball_volume(degree: int) -> float:
    """Translate `ballvol`, preserving descending multiplication order.

    The literal is the binary64 value of PARI's `M_PI`. The caller supplies
    a nonnegative dimension; zero has volume one as in the source.
    """
    if degree < 0:
        raise ValueError("negative ball dimension")
    volume = 1.0
    if degree % 2 != 0:
        volume = 2.0
    while degree > 1:
        volume *= (2.0 * 3.141592653589793) / checked_float64(degree)
        degree -= 2
    return volume


@native
def pari_small_norm_scale(degree: int) -> float:
    """Translate `4 * maxtry_FACT / F->ballvol` with `maxtry_FACT = 500`.

    The integer product is evaluated before binary64 division, just as in C.
    This is the scale passed to `Fincke_Pohst_bound`, not its final bound.
    """
    return checked_float64(4 * 500) / pari_ball_volume(degree)
