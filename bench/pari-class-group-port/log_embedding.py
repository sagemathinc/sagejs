"""PARI 2.17.4 buch2.c:get_log_embed from a prepared embedding matrix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
No relation logarithms or unit information are supplied by the caller.
"""

from sagejs.native import IntegerBuffer, native

from .complex_logarithm import pari_real_pair_logarithm
from .pi_constant import pari_pi_constant
from .real_conversion import pari_integer_to_real
from .real_logarithm import pari_real_logarithm_multiword
from .short_product import pari_prepared_embedding_row


@native
def pari_prepared_log_embedding(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coordinates: IntegerBuffer,
    degree: int,
    real_places: int,
    scalar_relation: bool,
    precision: int,
    output: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Compute the weighted logarithm column, preserving complex phases.

    Matrix rows are real places, complex real parts, then complex imaginary
    parts. Precision -1 marks exact integers. Output is seven scalars per
    place: result kind, real triple, imaginary triple. Kind 1 has no imaginary
    component, encoded (0, -1, 0). This boundary does not perform rel_embed's
    automorphism reuse or attach columns to the resident relation cache yet.
    """
    if (
        degree < 1
        or real_places < 0
        or real_places > degree
        or (degree - real_places) % 2 != 0
    ):
        raise ValueError("invalid embedding dimensions")
    places = (degree + real_places) // 2
    if len(output) < 7 * places or len(coordinates) < 1:
        raise ValueError("short logarithm embedding storage")
    if precision < 64 or precision > 384 or precision % 64 != 0:
        raise ValueError("unsupported logarithm embedding precision")
    if not scalar_relation:
        if (
            len(coordinates) < degree
            or len(matrix_m) < degree * degree
            or len(matrix_p) < degree * degree
            or len(matrix_e) < degree * degree
        ):
            raise ValueError("short prepared embedding matrix")
    for row in range(places):
        if scalar_relation:
            mx = coordinates[0]
            px = -1
            ex = 0
        else:
            mx, px, ex = pari_prepared_embedding_row(
                matrix_m, matrix_p, matrix_e, coordinates, row * degree, degree
            )
        my = 0
        py = -1
        ey = 0
        if row >= real_places and not scalar_relation:
            my, py, ey = pari_prepared_embedding_row(
                matrix_m,
                matrix_p,
                matrix_e,
                coordinates,
                (places + row - real_places) * degree,
                degree,
            )
        if my == 0:
            if px == -1:
                mx, px, ex = pari_integer_to_real(mx, precision)
            kind, lm, lp, le, am, ap, ae = pari_real_pair_logarithm(
                mx, px, ex, 0, 0, ey, precision, log_cache, pi_cache, a, b, p, q, stack
            )
        elif mx == 0 and px == -1:
            # glog's exact-zero real component does not contribute a real
            # error bound to precCOMPLEX. isint1 after absolute value gives
            # an exact, not approximate, zero logarithm.
            phase_precision = precision
            if py > phase_precision:
                phase_precision = py
            am, ap, ae = pari_pi_constant(phase_precision, pi_cache, a, b, p, q, stack)
            if my < 0:
                am = -am
            ae -= 1
            kind = 2
            if py == -1 and abs(my) == 1:
                lm = 0
                lp = -1
                le = 0
            else:
                if py == -1:
                    my, py, ey = pari_integer_to_real(my, precision)
                lm, lp, le = pari_real_logarithm_multiword(
                    my, py, ey, log_cache, a, b, p, q, stack
                )
        else:
            if px == -1 or py == -1:
                raise ValueError("nonzero exact complex component is not ported")
            kind, lm, lp, le, am, ap, ae = pari_real_pair_logarithm(
                mx,
                px,
                ex,
                my,
                py,
                ey,
                precision,
                log_cache,
                pi_cache,
                a,
                b,
                p,
                q,
                stack,
            )
        if row >= real_places:
            if lp != -1:
                le += 1
            else:
                lm *= 2
            if ap != -1:
                ae += 1
        offset = 7 * row
        # Fixed slice lowering currently requires NativeIntegerVector, not
        # this borrowed IntegerBuffer ABI. Keep explicit stores for now.
        output[offset] = kind
        output[offset + 1] = lm
        output[offset + 2] = lp
        output[offset + 3] = le
        output[offset + 4] = am
        output[offset + 5] = ap
        output[offset + 6] = ae
    return places
