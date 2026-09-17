"""Neutral prepared-field data for the authentic real-cubic `getfu` retry.

This module removes one answer-shaped input from the successful retry: the
three `zk_multable(nf, e_i)` matrices.  They are derived exactly from the
monic defining polynomial and the integral basis, both of which are ordinary
prepared-number-field data available before relation collection.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_monic_cubic_basis_tensor(
    polynomial: IntegerBuffer,
    basis: IntegerBuffer,
    work: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Construct the three cubic integral-basis multiplication matrices.

    `polynomial` is `(c0,c1,c2,1)`. `basis` contains, column by column, the
    power-basis coordinates of the three integral-basis vectors. `output`
    has PARI's `zk_multable` order: basis multiplier, matrix column, matrix
    row.  The first five work entries hold a degree-four power-basis product;
    the remaining 27 stage the result so failure never publishes a prefix.

    The basis may have determinant other than one, but every reduced product
    must have integral coordinates in it.  This is an exact algebraic
    calculation: no embedding, logarithm, relation, or unit is an input.
    """
    if len(polynomial) < 4 or len(basis) < 9 or len(work) < 32 or len(output) < 27:
        raise ValueError("short cubic prepared-field storage")
    if polynomial[3] != 1:
        raise ValueError("cubic prepared-field polynomial must be monic")

    # det(B), with B stored column-major.
    determinant = (
        basis[0] * (basis[4] * basis[8] - basis[7] * basis[5])
        - basis[3] * (basis[1] * basis[8] - basis[7] * basis[2])
        + basis[6] * (basis[1] * basis[5] - basis[4] * basis[2])
    )
    if determinant == 0:
        raise ValueError("singular cubic integral basis")

    # adj(B), row-major.  Multiplication by a power-coordinate column and
    # exact division by det(B) converts back to integral-basis coordinates.
    a00 = basis[4] * basis[8] - basis[7] * basis[5]
    a01 = basis[6] * basis[5] - basis[3] * basis[8]
    a02 = basis[3] * basis[7] - basis[6] * basis[4]
    a10 = basis[7] * basis[2] - basis[1] * basis[8]
    a11 = basis[0] * basis[8] - basis[6] * basis[2]
    a12 = basis[6] * basis[1] - basis[0] * basis[7]
    a20 = basis[1] * basis[5] - basis[4] * basis[2]
    a21 = basis[3] * basis[2] - basis[0] * basis[5]
    a22 = basis[0] * basis[4] - basis[3] * basis[1]

    for multiplier in range(3):
        for column in range(3):
            for i in range(5):
                work[i] = 0
            for left in range(3):
                for right in range(3):
                    work[left + right] += (
                        basis[3 * multiplier + left] * basis[3 * column + right]
                    )
            # Reduce x^4 and x^3, in this order, modulo
            # x^3 + c2*x^2 + c1*x + c0.
            for degree in range(4, 2, -1):
                leading = work[degree]
                if leading != 0:
                    for lower in range(3):
                        work[degree - 3 + lower] -= leading * polynomial[lower]
                    work[degree] = 0
            q0 = a00 * work[0] + a01 * work[1] + a02 * work[2]
            q1 = a10 * work[0] + a11 * work[1] + a12 * work[2]
            q2 = a20 * work[0] + a21 * work[1] + a22 * work[2]
            if q0 % determinant != 0 or q1 % determinant != 0 or q2 % determinant != 0:
                raise ValueError("cubic basis is not closed under multiplication")
            offset = 5 + 9 * multiplier + 3 * column
            work[offset] = q0 // determinant
            work[offset + 1] = q1 // determinant
            work[offset + 2] = q2 // determinant
    for i in range(27):
        output[i] = work[5 + i]
    return 0


__all__ = ["pari_monic_cubic_basis_tensor"]
