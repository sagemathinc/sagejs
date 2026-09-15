"""PARI 2.17.4 buchall inverse-hR normalization at DEFAULTPREC.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The inverse residue is a prepared input, not a certified zeta enclosure.
The existing integer square-root leaf is an explicit backend substitution.
"""

from sagejs.native import IntegerBuffer, native
from .pi_constant import pari_pi_constant
from .real_conversion import pari_integer_to_real
from .real_square_root import pari_real_square_root_abs
from .integer_real_product import pari_integer_real_product
from .real_division import pari_real_division
from .short_product import pari_short_product, pari_short_square
from .regulator_scalar import pari_validate_regulator_values


@native
def pari_regulator_normalization(
    discriminant: int,
    real_places: int,
    complex_places: int,
    roots_of_unity: int,
    inverse_residue: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Translate the buchall invhr expression, for degrees 2–10.

    Input discriminant is its positive absolute value. All scratch owners are
    disjoint. Cache and coefficients have the same contract as `pari_pi_constant`.
    PARI evaluates mppi even when complex_places is zero; retain that call.
    """
    degree = real_places + 2 * complex_places
    if (
        discriminant <= 0
        or discriminant.bit_length() > 1856
        or real_places < 0
        or complex_places < 0
        or degree < 2
        or degree > 10
        or roots_of_unity <= 0
        or roots_of_unity.bit_length() > 64
    ):
        raise ValueError("unsupported inverse-hR normalization inputs")
    pari_validate_regulator_values(inverse_residue, 1)
    if inverse_residue[0] <= 0 or inverse_residue[1] < 64:
        raise ValueError("inverse residue must be positive real")
    pm, pp, pe = pari_pi_constant(64, pi_cache, a, b, p, q, stack)
    nm, np, ne = pm, pp, pe
    if complex_places == 0:
        nm, np, ne = 1 << 63, 64, 0
    else:
        # gen_powu_i's left-right binary loop; no window branch for r2 <= 5.
        bit = complex_places.bit_length() - 2
        while bit >= 0:
            nm, np, ne = pari_short_square(nm, np, ne)
            if (complex_places >> bit) & 1:
                nm, np, ne = pari_short_product(nm, np, ne, pm, pp, pe)
            bit -= 1
    ne += real_places + complex_places
    dm, dp, de = pari_integer_to_real(discriminant, 64)
    dm, dp, de = pari_real_square_root_abs(dm, dp, de)
    dm, dp, de = pari_integer_real_product(roots_of_unity, dm, dp, de)
    nm, np, ne = pari_real_division(nm, np, ne, dm, dp, de)
    return pari_short_product(
        nm, np, ne, inverse_residue[0], inverse_residue[1], inverse_residue[2]
    )
