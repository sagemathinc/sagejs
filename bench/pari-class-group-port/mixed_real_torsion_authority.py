"""Exact roots-of-unity authority for the field3 mixed-real quartic.

The authority is derived only from the prepared monic polynomial and its
signature. Irreducibility is certified by reduction modulo 23. Because the
field has real embeddings, every root of unity injects into `R` and is
therefore exactly `+1` or `-1`.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native


@native
def pari_exact_mixed_real_torsion(
    polynomial: IntegerBuffer,
    real_places: int,
    complex_places: int,
    order: IntegerBuffer,
    generator: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Publish the exact `{+1,-1}` authority transactionally.

    The degree-four polynomial must be monic and irreducible modulo 23. The
    latter proves irreducibility over the rationals without accepting class,
    unit, regulator, or torsion answer data as input. `state` records status,
    degree, signature, witness prime, tested roots, tested monic quadratics,
    and the exact norm of `-1`.
    """

    if len(polynomial) < 5 or len(order) < 1 or len(generator) < 4 or len(state) < 8:
        raise ValueError("short mixed torsion storage")
    if real_places != 2 or complex_places != 1 or polynomial[4] != 1:
        raise ValueError("unsupported mixed-real quartic boundary")
    state[0] = -1
    state[1] = 4
    state[2] = real_places
    state[3] = complex_places
    state[4] = 23
    state[5] = 0
    state[6] = 0
    state[7] = 0
    p = 23
    c0 = polynomial[0] % p
    c1 = polynomial[1] % p
    c2 = polynomial[2] % p
    c3 = polynomial[3] % p
    # No linear factor modulo 23.
    for value in range(p):
        evaluated = 1
        evaluated = (evaluated * value + c3) % p
        evaluated = (evaluated * value + c2) % p
        evaluated = (evaluated * value + c1) % p
        evaluated = (evaluated * value + c0) % p
        state[5] += 1
        if evaluated == 0:
            state[0] = 1
            return 1
    # A reducible quartic without a linear factor is a product of two monic
    # quadratics. Exhaust all x^2 + u*x + v and reject an exact divisor.
    for u in range(p):
        for v in range(p):
            r0 = c0
            r1 = c1
            r2 = (c2 - v) % p
            r3 = (c3 - u) % p
            r2 = (r2 - r3 * u) % p
            r1 = (r1 - r3 * v) % p
            r1 = (r1 - r2 * u) % p
            r0 = (r0 - r2 * v) % p
            state[6] += 1
            if r0 == 0 and r1 == 0:
                state[0] = 2
                return 2
    # Multiplication by -1 is -I_4, hence has determinant/norm +1 and square
    # exactly one. A real embedding proves no larger root-of-unity group exists.
    order[0] = 2
    generator[0] = -1
    generator[1] = 0
    generator[2] = 0
    generator[3] = 0
    state[7] = 1
    state[0] = 0
    return 0
