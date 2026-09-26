"""PARI 2.17.4 `Buchall_param` small-discriminant subfactor product policy.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The upstream policy is assumed for this experiment, not independently proved.
"""

from math import exp, log, sqrt

from sagejs.native import checked_float64, native


@native
def pari_subfactor_product(
    degree: int, complex_pairs: int, log_discriminant: float, bound: int
) -> float:
    """Translate the `lim` calculation and `subFBgen` product argument.

    Preserve the strict `LOGD < 20` branch, the lower clamp at three,
    the final minimum with `LIMC2`, and binary64 operation ordering.
    Inputs are finite nf-derived data with a positive factor-base bound.
    """
    if degree < 1 or complex_pairs < 0 or 2 * complex_pairs > degree or bound < 1:
        raise ValueError("invalid subfactor product inputs")
    limit = -1.0
    if log_discriminant < 20.0:
        limit = exp(
            -checked_float64(degree)
            + checked_float64(complex_pairs) * log(4.0 / 3.141592653589793)
            + log_discriminant / 2.0
        ) * sqrt(2.0 * 3.141592653589793 * checked_float64(degree))
        if limit < 3.0:
            limit = 3.0
    cap = checked_float64(bound)
    if limit < 0.0 or limit >= cap:
        return cap
    return limit
