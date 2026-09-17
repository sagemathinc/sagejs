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
from .hnf_bezout import pari_hnf_bezout


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
def pari_compact_factor_square(
    exponents: IntegerBuffer, metadata: IntegerBuffer
) -> int:
    """Square an ordered factored principal without allocating or reordering."""
    if len(metadata) < 1:
        raise ValueError("missing compact factor metadata")
    count = metadata[0]
    if count < 0 or count > len(exponents):
        raise ValueError("invalid compact factor count")
    for i in range(count):
        exponents[i] *= 2
    return 0


@native
def pari_compact_factor_extend(
    source_kinds: IntegerBuffer,
    source_values: IntegerBuffer,
    source_exponents: IntegerBuffer,
    source_metadata: IntegerBuffer,
    output_kinds: IntegerBuffer,
    output_values: IntegerBuffer,
    output_exponents: IntegerBuffer,
    output_metadata: IntegerBuffer,
) -> int:
    """Append one factored principal to another in PARI shallow-concat order."""
    if len(source_metadata) < 1 or len(output_metadata) < 1:
        raise ValueError("missing compact factor metadata")
    count = source_metadata[0]
    if count < 0 or count > len(source_kinds) or count > len(source_exponents):
        raise ValueError("invalid source factor count")
    if len(source_values) < 4 * count:
        raise ValueError("invalid source factor values")
    for i in range(count):
        pari_compact_factor_append(
            output_kinds,
            output_values,
            output_exponents,
            output_metadata,
            source_kinds[i],
            source_values[4 * i],
            source_values[4 * i + 1],
            source_values[4 * i + 2],
            source_values[4 * i + 3],
            source_exponents[i],
        )
    return 0


@native
def pari_cubic_ideal_hnf_multiply(
    left: IntegerBuffer,
    right: IntegerBuffer,
    multiplication_table: IntegerBuffer,
    generators: IntegerBuffer,
    hnf_input: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    intermediate: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Compute the HNF product of two integral cubic ideals.

    The nine pairwise column products generate the product ideal. Two bounded
    six-column `ZM_hnfmodid` passes replace PARI's allocated 3-by-9 matrix;
    `left[0]*right[0] * O` is already a sublattice of the product.
    """
    if (
        len(left) < 9
        or len(right) < 9
        or len(multiplication_table) < 27
        or len(generators) < 27
        or len(hnf_input) < 18
        or len(intermediate) < 9
        or len(output) < 9
    ):
        raise ValueError("insufficient cubic ideal-product storage")
    modulus = left[0] * right[0]
    if modulus <= 0 or modulus >= 18446744073709551616:
        raise ValueError("cubic ideal-product modulus is outside word range")
    for left_column in range(3):
        for right_column in range(3):
            column = left_column * 3 + right_column
            for output_coordinate in range(3):
                value = 0
                for left_coordinate in range(3):
                    for right_coordinate in range(3):
                        value += (
                            multiplication_table[
                                (left_coordinate * 3 + right_coordinate) * 3
                                + output_coordinate
                            ]
                            * left[left_coordinate * 3 + left_column]
                            * right[right_coordinate * 3 + right_column]
                        )
                generators[output_coordinate * 9 + column] = value
    for row in range(3):
        for column in range(6):
            hnf_input[row * 6 + column] = generators[row * 9 + column]
    pari_composite_modulus_hnf(
        hnf_input,
        3,
        6,
        modulus,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        intermediate,
    )
    for row in range(3):
        for column in range(3):
            hnf_input[row * 6 + column] = intermediate[row * 3 + column]
            hnf_input[row * 6 + 3 + column] = generators[row * 9 + 6 + column]
    pari_composite_modulus_hnf(
        hnf_input,
        3,
        6,
        modulus,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        output,
    )
    return 0


@native
def _pari_cubic_congruence_kernel_step(
    basis: IntegerBuffer,
    row: IntegerBuffer,
    modulus: int,
) -> int:
    """Intersect a cubic column lattice with one linear congruence kernel."""
    coefficient0 = 0
    coefficient1 = 0
    coefficient2 = 0
    for column in range(3):
        value = 0
        for i in range(3):
            value += row[i] * basis[i * 3 + column]
        if column == 0:
            coefficient0 = value
        elif column == 1:
            coefficient1 = value
        else:
            coefficient2 = value
    if coefficient0 == 0 and coefficient1 == 0 and coefficient2 == 0:
        return 0
    if coefficient0 == 0:
        pivot = 1
        if coefficient1 == 0:
            pivot = 2
        if pivot == 1:
            coefficient0 = coefficient1
            coefficient1 = 0
        else:
            coefficient0 = coefficient2
            coefficient2 = 0
        for i in range(3):
            temporary = basis[i * 3]
            basis[i * 3] = basis[i * 3 + pivot]
            basis[i * 3 + pivot] = temporary
    for column in range(1, 3):
        b = coefficient1
        if column == 2:
            b = coefficient2
        if b == 0:
            continue
        a = coefficient0
        d, u, v = pari_hnf_bezout(a, b)
        qa = a // d
        qb = b // d
        for i in range(3):
            left = basis[i * 3]
            right = basis[i * 3 + column]
            basis[i * 3] = u * left + v * right
            basis[i * 3 + column] = -qb * left + qa * right
        coefficient0 = d
        if column == 1:
            coefficient1 = 0
        else:
            coefficient2 = 0
    scale = modulus // gcd(abs(coefficient0), modulus)
    for i in range(3):
        basis[i * 3] *= scale
    return 0


@native
def pari_cubic_ideal_hnf_inverse_scaled(
    ideal: IntegerBuffer,
    multiplication_table: IntegerBuffer,
    basis: IntegerBuffer,
    congruence_row: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Compute `(I intersect Z) * I^-1` for an integral cubic ideal HNF.

    This exact congruence formulation is equivalent to PARI's trace-dual
    `idealHNF_inv_Z` construction: `x` belongs to the result precisely when
    every coordinate of `x*b` is divisible by `I[0,0]` for every HNF basis
    column `b` of `I`.
    """
    if (
        len(ideal) < 9
        or len(multiplication_table) < 27
        or len(basis) < 9
        or len(congruence_row) < 3
        or len(output) < 9
    ):
        raise ValueError("insufficient cubic ideal-inverse storage")
    modulus = ideal[0]
    if modulus <= 0 or modulus >= 18446744073709551616:
        raise ValueError("cubic ideal-inverse modulus is outside word range")
    for i in range(9):
        basis[i] = 0
    basis[0] = 1
    basis[4] = 1
    basis[8] = 1
    for ideal_column in range(3):
        for output_coordinate in range(3):
            for left_coordinate in range(3):
                value = 0
                for right_coordinate in range(3):
                    value += (
                        multiplication_table[
                            (left_coordinate * 3 + right_coordinate) * 3
                            + output_coordinate
                        ]
                        * ideal[right_coordinate * 3 + ideal_column]
                    )
                congruence_row[left_coordinate] = value
            _pari_cubic_congruence_kernel_step(basis, congruence_row, modulus)
    pari_composite_modulus_hnf(
        basis,
        3,
        3,
        modulus,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        output,
    )
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
    if content[0] != 1:
        pari_compact_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            0,
            content[0],
            0,
            0,
            1,
            1,
        )
    if content[1] != 1:
        pari_compact_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            0,
            content[1],
            0,
            0,
            1,
            -1,
        )
    content[0] = 1
    content[1] = 1
    return 0


@native
def _pari_cubic_reduce_from_tape(
    ideal: IntegerBuffer,
    multiplication_table: IntegerBuffer,
    candidates: IntegerBuffer,
    candidate_cursor: IntegerBuffer,
    content: IntegerBuffer,
    kinds: IntegerBuffer,
    values: IntegerBuffer,
    exponents: IntegerBuffer,
    metadata: IntegerBuffer,
    candidate: IntegerBuffer,
    multiplication_matrix: IntegerBuffer,
    product: IntegerBuffer,
    inverse_numerator: IntegerBuffer,
    inverse_denominator: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Consume one source-derived T2 candidate and run the exact reduction tail."""
    if len(candidate_cursor) < 1 or len(candidate) < 3:
        raise ValueError("missing cubic reduction-tape state")
    cursor = candidate_cursor[0]
    if cursor < 0 or 3 * (cursor + 1) > len(candidates):
        raise ValueError("cubic reduction candidate tape exhausted")
    for i in range(3):
        candidate[i] = candidates[3 * cursor + i]
    candidate_cursor[0] = cursor + 1
    return pari_cubic_idealred_candidate(
        ideal,
        multiplication_table,
        candidate,
        content,
        kinds,
        values,
        exponents,
        metadata,
        multiplication_matrix,
        product,
        inverse_numerator,
        inverse_denominator,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        output,
    )


@native
def pari_cubic_idealpowred_tape(
    base: IntegerBuffer,
    exponent: int,
    multiplication_table: IntegerBuffer,
    candidates: IntegerBuffer,
    candidate_cursor: IntegerBuffer,
    kinds: IntegerBuffer,
    values: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    metadata: IntegerBuffer,
    current: IntegerBuffer,
    matrix_scratch: IntegerBuffer,
    generators: IntegerBuffer,
    hnf_input: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    hnf_intermediate: IntegerBuffer,
    inverse_basis: IntegerBuffer,
    congruence_row: IntegerBuffer,
    candidate: IntegerBuffer,
    content: IntegerBuffer,
    multiplication_matrix: IntegerBuffer,
    product: IntegerBuffer,
    inverse_numerator: IntegerBuffer,
    inverse_denominator: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """PARI `idealpowred` schedule for a cubic HNF and `-3 <= e <= 3`.

    The candidate tape is the explicit `idealpseudomin` dependency. Every
    square/multiply is reduced in `gen_pow_i` order; negative powers invert the
    already reduced positive result and perform PARI's final reduction.
    Factors are reset on entry and returned in compact source order.
    """
    if exponent == 0 or exponent < -3 or exponent > 3:
        raise ValueError("restricted signed cubic exponent must be in -3..-1 or 1..3")
    if len(base) < 9 or len(current) < 9 or len(matrix_scratch) < 9 or len(output) < 9:
        raise ValueError("insufficient signed cubic power storage")
    metadata[0] = 0
    for i in range(9):
        current[i] = base[i]
    absolute_exponent = abs(exponent)
    if absolute_exponent >= 2:
        pari_cubic_ideal_hnf_multiply(
            current,
            current,
            multiplication_table,
            generators,
            hnf_input,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            hnf_intermediate,
            matrix_scratch,
        )
        pari_compact_factor_square(factor_exponents, metadata)
        content[0] = 1
        content[1] = 1
        _pari_cubic_reduce_from_tape(
            matrix_scratch,
            multiplication_table,
            candidates,
            candidate_cursor,
            content,
            kinds,
            values,
            factor_exponents,
            metadata,
            candidate,
            multiplication_matrix,
            product,
            inverse_numerator,
            inverse_denominator,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            current,
        )
    if absolute_exponent == 3:
        pari_cubic_ideal_hnf_multiply(
            current,
            base,
            multiplication_table,
            generators,
            hnf_input,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            hnf_intermediate,
            matrix_scratch,
        )
        content[0] = 1
        content[1] = 1
        _pari_cubic_reduce_from_tape(
            matrix_scratch,
            multiplication_table,
            candidates,
            candidate_cursor,
            content,
            kinds,
            values,
            factor_exponents,
            metadata,
            candidate,
            multiplication_matrix,
            product,
            inverse_numerator,
            inverse_denominator,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            current,
        )
    if exponent < 0:
        pari_cubic_ideal_hnf_inverse_scaled(
            current,
            multiplication_table,
            inverse_basis,
            congruence_row,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            matrix_scratch,
        )
        content[0] = 1
        content[1] = current[0]
        pari_compact_factor_invert(factor_exponents, metadata)
        _pari_cubic_reduce_from_tape(
            matrix_scratch,
            multiplication_table,
            candidates,
            candidate_cursor,
            content,
            kinds,
            values,
            factor_exponents,
            metadata,
            candidate,
            multiplication_matrix,
            product,
            inverse_numerator,
            inverse_denominator,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            current,
        )
    elif absolute_exponent == 1:
        content[0] = 1
        content[1] = 1
        _pari_cubic_reduce_from_tape(
            current,
            multiplication_table,
            candidates,
            candidate_cursor,
            content,
            kinds,
            values,
            factor_exponents,
            metadata,
            candidate,
            multiplication_matrix,
            product,
            inverse_numerator,
            inverse_denominator,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            matrix_scratch,
        )
        for i in range(9):
            current[i] = matrix_scratch[i]
    for i in range(9):
        output[i] = current[i]
    return 0


@native
def pari_cubic_genback_tape(
    prime_ideals: IntegerBuffer,
    relation_exponents: IntegerBuffer,
    prime_count: int,
    multiplication_table: IntegerBuffer,
    candidates: IntegerBuffer,
    candidate_cursor: IntegerBuffer,
    output_kinds: IntegerBuffer,
    output_values: IntegerBuffer,
    output_exponents: IntegerBuffer,
    output_metadata: IntegerBuffer,
    term_kinds: IntegerBuffer,
    term_values: IntegerBuffer,
    term_exponents: IntegerBuffer,
    term_metadata: IntegerBuffer,
    base: IntegerBuffer,
    term: IntegerBuffer,
    current: IntegerBuffer,
    matrix_scratch: IntegerBuffer,
    generators: IntegerBuffer,
    hnf_input: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    hnf_intermediate: IntegerBuffer,
    inverse_basis: IntegerBuffer,
    congruence_row: IntegerBuffer,
    candidate: IntegerBuffer,
    content: IntegerBuffer,
    multiplication_matrix: IntegerBuffer,
    product: IntegerBuffer,
    inverse_numerator: IntegerBuffer,
    inverse_denominator: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Bounded cubic translation of `buch2.c:genback`.

    Nonzero prime exponents are visited in input order. Each signed prime power
    uses `idealpowred`; subsequent terms use `idealHNF_mulred`. Return the
    number of nonzero relation entries. Candidate selection remains an
    explicit ordered tape shared by all reductions.
    """
    if prime_count < 1 or len(prime_ideals) < 9 * prime_count:
        raise ValueError("invalid cubic genback prime storage")
    if len(relation_exponents) < prime_count or len(output) < 9:
        raise ValueError("invalid cubic genback relation storage")
    output_metadata[0] = 0
    used = 0
    for prime_index in range(prime_count):
        exponent = relation_exponents[prime_index]
        if exponent == 0:
            continue
        for i in range(9):
            base[i] = prime_ideals[9 * prime_index + i]
        pari_cubic_idealpowred_tape(
            base,
            exponent,
            multiplication_table,
            candidates,
            candidate_cursor,
            term_kinds,
            term_values,
            term_exponents,
            term_metadata,
            current,
            matrix_scratch,
            generators,
            hnf_input,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            hnf_intermediate,
            inverse_basis,
            congruence_row,
            candidate,
            content,
            multiplication_matrix,
            product,
            inverse_numerator,
            inverse_denominator,
            term,
        )
        if used == 0:
            for i in range(9):
                output[i] = term[i]
            pari_compact_factor_extend(
                term_kinds,
                term_values,
                term_exponents,
                term_metadata,
                output_kinds,
                output_values,
                output_exponents,
                output_metadata,
            )
        else:
            pari_cubic_ideal_hnf_multiply(
                output,
                term,
                multiplication_table,
                generators,
                hnf_input,
                hnf_work,
                hnf_triangular,
                hnf_moduli,
                hnf_intermediate,
                matrix_scratch,
            )
            pari_compact_factor_extend(
                term_kinds,
                term_values,
                term_exponents,
                term_metadata,
                output_kinds,
                output_values,
                output_exponents,
                output_metadata,
            )
            content[0] = 1
            content[1] = 1
            _pari_cubic_reduce_from_tape(
                matrix_scratch,
                multiplication_table,
                candidates,
                candidate_cursor,
                content,
                output_kinds,
                output_values,
                output_exponents,
                output_metadata,
                candidate,
                multiplication_matrix,
                product,
                inverse_numerator,
                inverse_denominator,
                hnf_work,
                hnf_triangular,
                hnf_moduli,
                output,
            )
        used += 1
    if used == 0:
        raise ValueError("cubic genback requires a nonzero relation")
    return used
