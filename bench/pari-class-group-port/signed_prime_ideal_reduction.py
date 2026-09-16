"""Restricted PARI 2.17.4 signed cubic ideal-reduction primitives.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the deliberately narrow Phase-5 cut through `idealred0`: integral
degree-three ideals, an already selected T2/LLL candidate, and ordered compact
factored-principal output. Candidate selection and generic `genback` remain
separate dependencies. All matrices are row-major in the integral basis.
"""

from math import gcd

from sagejs.native import IntegerBuffer, native

from .composite_ideal_hnf import pari_composite_modulus_hnf


@native
def pari_cubic_mul_table(
    table: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Multiply two cubic integral-basis vectors using a 3-by-9 table.

    `table[(i*3+j)*3+k]` is the coefficient of basis vector `k` in
    `basis[i]*basis[j]`. This is the flattened orientation emitted by the
    existing PARI basis-multiplication-table boundary.
    """
    if len(table) < 27 or len(left) < 3 or len(right) < 3 or len(output) < 3:
        raise ValueError("insufficient cubic multiplication storage")
    for k in range(3):
        value = 0
        for i in range(3):
            for j in range(3):
                value += table[(i * 3 + j) * 3 + k] * left[i] * right[j]
        output[k] = value
    return 0


@native
def pari_cubic_mul_matrix(
    table: IntegerBuffer,
    element: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Construct PARI's `zk_multable` matrix for one cubic element."""
    if len(table) < 27 or len(element) < 3 or len(output) < 9:
        raise ValueError("insufficient cubic multiplication-matrix storage")
    for k in range(3):
        for j in range(3):
            value = 0
            for i in range(3):
                value += table[(i * 3 + j) * 3 + k] * element[i]
            output[k * 3 + j] = value
    return 0


@native
def pari_cubic_inverse_first_column(
    matrix: IntegerBuffer,
    numerator: IntegerBuffer,
    denominator: IntegerBuffer,
) -> int:
    """Recover the primitive numerator and denominator of `matrix^-1 e_1`.

    This is the degree-three specialization of `ZM_gauss(my,col_ei(N,1))`
    followed by `Q_denom` and `Q_muli_to_int`. The denominator is positive;
    the four integers are divided by their common gcd.
    """
    if len(matrix) < 9 or len(numerator) < 3 or len(denominator) < 1:
        raise ValueError("insufficient cubic solve storage")
    n0 = matrix[4] * matrix[8] - matrix[5] * matrix[7]
    n1 = matrix[5] * matrix[6] - matrix[3] * matrix[8]
    n2 = matrix[3] * matrix[7] - matrix[4] * matrix[6]
    d = matrix[0] * n0 + matrix[1] * n1 + matrix[2] * n2
    if d == 0:
        raise ValueError("singular cubic multiplication matrix")
    if d < 0:
        d = -d
        n0 = -n0
        n1 = -n1
        n2 = -n2
    common = gcd(d, abs(n0))
    common = gcd(common, abs(n1))
    common = gcd(common, abs(n2))
    numerator[0] = n0 // common
    numerator[1] = n1 // common
    numerator[2] = n2 // common
    denominator[0] = d // common
    return 0


@native
def pari_cubic_inverse_prime_init(
    prime_tau: IntegerBuffer,
    prime: int,
    rational: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    inverse_hnf: IntegerBuffer,
) -> int:
    """Initialize the negative-power branch with `p*P^-1` and content `1/p`.

    The restricted input is the cubic prime descriptor's integral `tau`
    multiplication matrix and its rational prime `p`. This is exactly
    `pr_inv_p = ZM_hnfmodid(tau,p)`. `rational` receives `(1,p)`. This is the
    compact ownership boundary used before a subsequent `idealred0` step.
    """
    if len(prime_tau) < 9 or len(rational) < 2 or len(inverse_hnf) < 9:
        raise ValueError("insufficient inverse-prime storage")
    p = prime
    if p <= 1:
        raise ValueError("invalid rational prime")
    pari_composite_modulus_hnf(
        prime_tau,
        3,
        3,
        p,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        inverse_hnf,
    )
    rational[0] = 1
    rational[1] = p
    return 0


@native
def pari_compact_factor_append(
    kinds: IntegerBuffer,
    values: IntegerBuffer,
    exponents: IntegerBuffer,
    metadata: IntegerBuffer,
    kind: int,
    a: int,
    b: int,
    c: int,
    denominator: int,
    exponent: int,
) -> int:
    """Append one ordered principal factor without allocating.

    Kind 0 stores the rational `a/denominator` (`b=c=0`); kind 1 stores the
    integral element `(a,b,c)` (`denominator=1`). `metadata[0]` is the active
    count. Zero exponents and rational one are omitted, exactly at this compact
    adapter boundary rather than by reordering earlier factors.
    """
    if len(metadata) < 1 or kind < 0 or kind > 1 or denominator <= 0:
        raise ValueError("invalid compact factor")
    if exponent == 0 or (kind == 0 and a == denominator):
        return 0
    count = metadata[0]
    if count < 0 or count >= len(kinds) or count >= len(exponents):
        raise ValueError("compact factor capacity exceeded")
    if len(values) < 4 * (count + 1):
        raise ValueError("compact factor value capacity exceeded")
    kinds[count] = kind
    values[4 * count] = a
    values[4 * count + 1] = b
    values[4 * count + 2] = c
    values[4 * count + 3] = denominator
    exponents[count] = exponent
    metadata[0] = count + 1
    return 0


@native
def pari_compact_factor_invert(
    exponents: IntegerBuffer, metadata: IntegerBuffer
) -> int:
    """Invert an ordered factored principal without changing factor order."""
    if len(metadata) < 1:
        raise ValueError("missing compact factor metadata")
    count = metadata[0]
    if count < 0 or count > len(exponents):
        raise ValueError("invalid compact factor count")
    for i in range(count):
        exponents[i] = -exponents[i]
    return 0


@native
def _pari_binary_exponent(value: int) -> int:
    """Return PARI's integer `gexpo` scale, with zero below every nonzero."""
    value = abs(value)
    if value == 0:
        return -1
    exponent = -1
    while value != 0:
        value //= 2
        exponent += 1
    return exponent


@native
def pari_cubic_idealred_candidate(
    ideal: IntegerBuffer,
    multiplication_table: IntegerBuffer,
    candidate: IntegerBuffer,
    content: IntegerBuffer,
    kinds: IntegerBuffer,
    values: IntegerBuffer,
    exponents: IntegerBuffer,
    metadata: IntegerBuffer,
    multiplication_matrix: IntegerBuffer,
    product: IntegerBuffer,
    inverse_numerator: IntegerBuffer,
    inverse_denominator: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Run the exact cubic tail of `idealred0` for a supplied T2 candidate.

    `ideal` is primitive integral cubic HNF and `candidate` is the already
    selected first vector of `I^-1*I[0,0]` after PARI's T2/LLL step. `content`
    is a reduced rational pair owned by the extended ideal. The output matrix
    and ordered factor storage reproduce the source branches: retain `y^-1`
    when its inverse has at least as large a binary exponent, otherwise retain
    the primitive numerator of `y^-1` and divide content by its denominator.
    Return 0 for a non-scalar reduction and 1 for PARI's already-reduced path.
    """
    if (
        len(ideal) < 9
        or len(multiplication_table) < 27
        or len(candidate) < 3
        or len(content) < 2
        or len(output) < 9
    ):
        raise ValueError("insufficient cubic ideal-reduction storage")
    if content[1] <= 0:
        raise ValueError("invalid ideal content denominator")
    if candidate[1] == 0 and candidate[2] == 0:
        for i in range(9):
            output[i] = ideal[i]
        pari_compact_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            0,
            content[0],
            0,
            0,
            content[1],
            1,
        )
        content[0] = 1
        content[1] = 1
        return 1
    pari_cubic_mul_matrix(multiplication_table, candidate, multiplication_matrix)
    intersection = ideal[0]
    if intersection <= 0:
        raise ValueError("invalid primitive integral ideal")
    for row in range(3):
        for column in range(3):
            value = 0
            for k in range(3):
                value += multiplication_matrix[row * 3 + k] * ideal[k * 3 + column]
            if value % intersection != 0:
                raise ValueError("candidate does not map ideal integrally")
            product[row * 3 + column] = value // intersection
    pari_cubic_inverse_first_column(
        multiplication_matrix, inverse_numerator, inverse_denominator
    )
    denominator = inverse_denominator[0]
    pari_composite_modulus_hnf(
        product,
        3,
        3,
        denominator,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        output,
    )
    content[0] *= intersection
    common = gcd(abs(content[0]), content[1])
    content[0] //= common
    content[1] //= common
    inverse_scale = _pari_binary_exponent(inverse_numerator[0])
    for i in range(1, 3):
        scale = _pari_binary_exponent(inverse_numerator[i])
        if scale > inverse_scale:
            inverse_scale = scale
    candidate_scale = _pari_binary_exponent(candidate[0])
    for i in range(1, 3):
        scale = _pari_binary_exponent(candidate[i])
        if scale > candidate_scale:
            candidate_scale = scale
    if inverse_scale >= candidate_scale:
        pari_compact_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            1,
            candidate[0],
            candidate[1],
            candidate[2],
            1,
            -1,
        )
    else:
        pari_compact_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            1,
            inverse_numerator[0],
            inverse_numerator[1],
            inverse_numerator[2],
            1,
            1,
        )
        content[1] *= denominator
        common = gcd(abs(content[0]), content[1])
        content[0] //= common
        content[1] //= common
    pari_compact_factor_append(
        kinds,
        values,
        exponents,
        metadata,
        0,
        content[0],
        0,
        0,
        content[1],
        1,
    )
    content[0] = 1
    content[1] = 1
    return 0
