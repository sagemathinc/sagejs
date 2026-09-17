"""Exact degree-four signed ideal reduction for PARI 2.17.4 `genback`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This module extends the connected cubic path to the first frozen quartic whose
real Smith column contains a power and a product.  All ideal matrices and the
integral-basis multiplication table are row-major.  The rounded T2 matrix is a
prepared-field input, exactly as in the existing cubic composition.
"""

from math import gcd

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .composite_ideal_hnf import pari_hnf_column_step, pari_signed_remainder
from .hnf_bezout import pari_hnf_bezout
from .lll_ranked_basis import pari_lll_ranked_basis


@native
def pari_multiword_inverse_generator(value: int, modulus: int) -> tuple[int, int]:
    """Return `(gcd(value, modulus), u)` with `u` a unit modulo `modulus`.

    This is the multiprecision branch of PARI's `Fp_invgen`, including the
    coprimality repair needed when a Bezout coefficient is not itself a unit.
    """
    if modulus < 2:
        raise ValueError("invalid inverse-generator modulus")
    value %= modulus
    if value == 0:
        return modulus, 0
    d, u, unused = pari_hnf_bezout(value, modulus)
    u %= modulus
    if d == 1:
        return d, u
    e = modulus // d
    d0 = d
    common = gcd(d0, e)
    while common != 1:
        d0 //= common
        common = gcd(d0, e)
    if d0 == 1:
        return d, u
    if d != d0:
        quotient = d // d0
        e = (e // gcd(e, quotient)) * quotient
    common, inverse, unused = pari_hnf_bezout(e, d0)
    if common != 1:
        raise ValueError("noncoprime inverse-generator CRT moduli")
    inverse %= d0
    multiplier = ((1 - u) * inverse) % d0
    u = (u + e * multiplier) % (e * d0)
    return d, u


@native
def pari_quartic_composite_hnf(
    original: IntegerBuffer,
    columns: int,
    modulus: int,
    work: IntegerBuffer,
    triangular: IntegerBuffer,
    moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Degree-four `ZM_hnfmodid`, retaining PARI's multiword path."""
    n = 4
    stride = 13
    triangular_stride = 5
    if columns < 1 or columns > 8 or modulus < 1:
        raise ValueError("unsupported quartic composite HNF domain")
    if (
        len(original) < n * columns
        or len(work) < n * stride
        or len(triangular) < n * triangular_stride
        or len(moduli) < n
        or len(output) < n * n
    ):
        raise ValueError("short quartic composite HNF storage")
    for i in range(n * stride):
        work[i] = 0
    for i in range(n):
        for j in range(columns):
            work[i * stride + j] = original[i * columns + j]
    count = columns
    lower = n - count
    if lower < 0:
        lower = 0
    destination = count - 1
    row = n - 1
    while row >= lower:
        add_modulus = 1
        for j in range(destination):
            a = pari_signed_remainder(work[row * stride + j], modulus)
            work[row * stride + j] = a
            if a == 0:
                continue
            k = j + 1
            b = pari_signed_remainder(work[row * stride + k], modulus)
            work[row * stride + k] = b
            if b == 0:
                pari_hnf_column_step(work, n, stride, j, k, a, b)
                continue
            if add_modulus != 0:
                add_modulus = 0
                if a != 1:
                    a, unit = pari_multiword_inverse_generator(a, modulus)
                    for t in range(row):
                        work[t * stride + j] = work[t * stride + j] * unit % modulus
                    work[row * stride + j] = a
            pari_hnf_column_step(work, n, stride, j, k, a, b)
            for t in range(row):
                if abs(work[t * stride + j]) >= 340282366920938463463374607431768211456:
                    work[t * stride + j] = pari_signed_remainder(
                        work[t * stride + j], modulus
                    )
                if abs(work[t * stride + k]) >= 340282366920938463463374607431768211456:
                    work[t * stride + k] = pari_signed_remainder(
                        work[t * stride + k], modulus
                    )
        if work[row * stride + destination] == 0:
            for j in range(count - 1, destination, -1):
                for t in range(n):
                    work[t * stride + j + 1] = work[t * stride + j]
            for t in range(n):
                work[t * stride + destination + 1] = 0
            work[row * stride + destination + 1] = modulus
            count += 1
            destination += 1
            lower -= 1
            if lower < 0:
                lower = 0
        row -= 1
        destination -= 1
    for i in range(n * triangular_stride):
        triangular[i] = 0
    if count < n:
        missing = n - count
        for i in range(missing):
            triangular[i * triangular_stride + i] = modulus
        for j in range(count):
            for i in range(n):
                triangular[i * triangular_stride + missing + j] = work[i * stride + j]
    else:
        for j in range(n):
            for i in range(n):
                triangular[i * triangular_stride + j] = work[i * stride + count - n + j]
    triangular[0] = gcd(triangular[0], modulus)
    for i in range(n):
        moduli[i] = modulus
    moduli[0] = triangular[0]
    for i in range(1, n - 1):
        candidate = abs(moduli[i - 1] * triangular[i * triangular_stride + i])
        if candidate >= modulus:
            break
        moduli[i] = candidate
    for i in range(n - 1, -1, -1):
        triangular[i * triangular_stride + n] = modulus
        for j in range(i, -1, -1):
            a = triangular[j * triangular_stride + n]
            if a == 0:
                continue
            pari_hnf_column_step(
                triangular,
                n,
                triangular_stride,
                n,
                j,
                a,
                triangular[j * triangular_stride + j],
            )
            for k in range(j):
                triangular[k * triangular_stride + n] %= modulus
                triangular[k * triangular_stride + j] %= modulus
    for i in range(n - 1, -1, -1):
        diagonal = triangular[i * triangular_stride + i]
        if diagonal < 0:
            for k in range(n):
                triangular[k * triangular_stride + i] = -triangular[
                    k * triangular_stride + i
                ]
            diagonal = -diagonal
        if i != n - 1:
            for k in range(i):
                triangular[k * triangular_stride + i] = pari_signed_remainder(
                    triangular[k * triangular_stride + i], moduli[k]
                )
        for j in range(i + 1, n):
            value = pari_signed_remainder(
                triangular[i * triangular_stride + j], moduli[i]
            )
            quotient = value // diagonal
            for k in range(i):
                triangular[k * triangular_stride + j] -= (
                    quotient * triangular[k * triangular_stride + i]
                )
            triangular[i * triangular_stride + j] = value % diagonal
    for i in range(n):
        for j in range(n):
            output[i * n + j] = triangular[i * triangular_stride + j]
    return 0


@native
def pari_quartic_ideal_hnf_multiply(
    left: IntegerBuffer,
    right: IntegerBuffer,
    table: IntegerBuffer,
    generators: IntegerBuffer,
    hnf_input: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    intermediate: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Multiply integral quartic HNF ideals through three bounded HNF passes."""
    if (
        len(left) < 16
        or len(right) < 16
        or len(table) < 64
        or len(generators) < 64
        or len(hnf_input) < 32
        or len(intermediate) < 16
        or len(output) < 16
    ):
        raise ValueError("short quartic ideal-product storage")
    modulus = left[0] * right[0]
    if modulus <= 0:
        raise ValueError("invalid quartic ideal-product modulus")
    for left_column in range(4):
        for right_column in range(4):
            column = left_column * 4 + right_column
            for coordinate in range(4):
                value = 0
                for i in range(4):
                    for j in range(4):
                        value += (
                            table[(i * 4 + j) * 4 + coordinate]
                            * left[i * 4 + left_column]
                            * right[j * 4 + right_column]
                        )
                generators[coordinate * 16 + column] = value
    for row in range(4):
        for column in range(8):
            hnf_input[row * 8 + column] = generators[row * 16 + column]
    pari_quartic_composite_hnf(
        hnf_input, 8, modulus, hnf_work, hnf_triangular, hnf_moduli, intermediate
    )
    for block in range(2):
        for row in range(4):
            for column in range(4):
                hnf_input[row * 8 + column] = intermediate[row * 4 + column]
                hnf_input[row * 8 + 4 + column] = generators[
                    row * 16 + 8 + block * 4 + column
                ]
        pari_quartic_composite_hnf(
            hnf_input,
            8,
            modulus,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            output,
        )
        if block == 0:
            for i in range(16):
                intermediate[i] = output[i]
    return 0


@native
def _pari_quartic_congruence_kernel_step(
    basis: IntegerBuffer,
    row: IntegerBuffer,
    coefficients: IntegerBuffer,
    modulus: int,
) -> int:
    """Intersect a quartic column lattice with one congruence kernel."""
    for column in range(4):
        value = 0
        for i in range(4):
            value += row[i] * basis[i * 4 + column]
        coefficients[column] = value
    pivot = 0
    while pivot < 4 and coefficients[pivot] == 0:
        pivot += 1
    if pivot == 4:
        return 0
    if pivot != 0:
        coefficients[0] = coefficients[pivot]
        coefficients[pivot] = 0
        for i in range(4):
            temporary = basis[i * 4]
            basis[i * 4] = basis[i * 4 + pivot]
            basis[i * 4 + pivot] = temporary
    for column in range(1, 4):
        b = coefficients[column]
        if b == 0:
            continue
        a = coefficients[0]
        d, u, v = pari_hnf_bezout(a, b)
        qa = a // d
        qb = b // d
        for i in range(4):
            left = basis[i * 4]
            right = basis[i * 4 + column]
            basis[i * 4] = u * left + v * right
            basis[i * 4 + column] = -qb * left + qa * right
        coefficients[0] = d
        coefficients[column] = 0
    scale = modulus // gcd(abs(coefficients[0]), modulus)
    for i in range(4):
        basis[i * 4] *= scale
    return 0


@native
def pari_quartic_ideal_hnf_inverse_scaled(
    ideal: IntegerBuffer,
    table: IntegerBuffer,
    basis: IntegerBuffer,
    congruence_row: IntegerBuffer,
    coefficients: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Compute `(I intersect Z) * I^-1` for an integral quartic HNF."""
    if (
        len(ideal) < 16
        or len(table) < 64
        or len(basis) < 16
        or len(congruence_row) < 4
        or len(coefficients) < 4
        or len(output) < 16
    ):
        raise ValueError("short quartic ideal-inverse storage")
    modulus = ideal[0]
    if modulus <= 0:
        raise ValueError("invalid quartic ideal-inverse modulus")
    for i in range(16):
        basis[i] = 0
    for i in range(4):
        basis[i * 4 + i] = 1
    for ideal_column in range(4):
        for output_coordinate in range(4):
            for left_coordinate in range(4):
                value = 0
                for right_coordinate in range(4):
                    value += (
                        table[
                            (left_coordinate * 4 + right_coordinate) * 4
                            + output_coordinate
                        ]
                        * ideal[right_coordinate * 4 + ideal_column]
                    )
                congruence_row[left_coordinate] = value
            _pari_quartic_congruence_kernel_step(
                basis, congruence_row, coefficients, modulus
            )
    pari_quartic_composite_hnf(
        basis, 4, modulus, hnf_work, hnf_triangular, hnf_moduli, output
    )
    return 0


@native
def pari_quartic_t2_candidate(
    ideal: IntegerBuffer,
    table: IntegerBuffer,
    rounded_t2: IntegerBuffer,
    inverse_basis: IntegerBuffer,
    congruence_row: IntegerBuffer,
    coefficients: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    inverse_ideal: IntegerBuffer,
    weighted_basis: IntegerBuffer,
    lll_basis: IntegerBuffer,
    lll_transform: IntegerBuffer,
    lll_selection: IntegerBuffer,
    lll_stages: IntegerBuffer,
    flatter_input: IntegerBuffer,
    flatter_current: IntegerBuffer,
    flatter_transform: IntegerBuffer,
    flatter_total_work: IntegerBuffer,
    flatter_step_t: IntegerBuffer,
    flatter_step_s: IntegerBuffer,
    flatter_product: IntegerBuffer,
    flatter_next_basis: IntegerBuffer,
    qr_input: IntegerBuffer,
    qr: IntegerBuffer,
    qr_vectors: IntegerBuffer,
    qr_betas: IntegerBuffer,
    qr_norms: IntegerBuffer,
    qr_column: IntegerBuffer,
    flatter_y: IntegerBuffer,
    flatter_diagnostic: IntegerBuffer,
    flatter_r1: IntegerBuffer,
    flatter_r2: IntegerBuffer,
    flatter_r3: IntegerBuffer,
    flatter_t1: IntegerBuffer,
    flatter_t2: IntegerBuffer,
    flatter_t3: IntegerBuffer,
    flatter_integers: IntegerBuffer,
    flatter_inverse: IntegerBuffer,
    flatter_first: IntegerBuffer,
    flatter_second: IntegerBuffer,
    flatter_final: IntegerBuffer,
    flatter_rounded: IntegerBuffer,
    lll_mu: Float64Buffer,
    lll_r: Float64Buffer,
    lll_s: Float64Buffer,
    lll_approximate: Float64Buffer,
    lll_exponents: IntegerBuffer,
    lll_float_gram: Float64Buffer,
    lll_gram: IntegerBuffer,
    lll_mu_exponents: IntegerBuffer,
    lll_r_exponents: IntegerBuffer,
    lll_s_exponents: IntegerBuffer,
    lll_alpha: IntegerBuffer,
    lll_column_exponents: IntegerBuffer,
    lll_float_scratch: Float64Buffer,
    lll_temporary: Float64Buffer,
    output: IntegerBuffer,
) -> int:
    """Return the authentic untwisted quartic T2/LLL reduction candidate."""
    if (
        len(ideal) < 16
        or len(table) < 64
        or len(rounded_t2) < 16
        or len(inverse_ideal) < 16
        or len(weighted_basis) < 16
        or len(output) < 4
    ):
        raise ValueError("short quartic T2 candidate storage")
    pari_quartic_ideal_hnf_inverse_scaled(
        ideal,
        table,
        inverse_basis,
        congruence_row,
        coefficients,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        inverse_ideal,
    )
    for row in range(4):
        for column in range(4):
            value = 0
            for inner in range(4):
                value += rounded_t2[row * 4 + inner] * inverse_ideal[inner * 4 + column]
            weighted_basis[row * 4 + column] = value
    status = pari_lll_ranked_basis(
        weighted_basis,
        4,
        4,
        lll_basis,
        lll_transform,
        lll_selection,
        lll_stages,
        flatter_input,
        flatter_current,
        flatter_transform,
        flatter_total_work,
        flatter_step_t,
        flatter_step_s,
        flatter_product,
        flatter_next_basis,
        qr_input,
        qr,
        qr_vectors,
        qr_betas,
        qr_norms,
        qr_column,
        flatter_y,
        flatter_diagnostic,
        flatter_r1,
        flatter_r2,
        flatter_r3,
        flatter_t1,
        flatter_t2,
        flatter_t3,
        flatter_integers,
        flatter_inverse,
        flatter_first,
        flatter_second,
        flatter_final,
        flatter_rounded,
        lll_mu,
        lll_r,
        lll_s,
        lll_approximate,
        lll_exponents,
        lll_float_gram,
        lll_gram,
        lll_mu_exponents,
        lll_r_exponents,
        lll_s_exponents,
        lll_alpha,
        lll_column_exponents,
        lll_float_scratch,
        lll_temporary,
    )
    if status != 0 or lll_stages[3] != 0:
        raise ValueError("quartic T2 candidate requires an unresolved LLL fallback")
    for row in range(4):
        value = 0
        for inner in range(4):
            value += inverse_ideal[row * 4 + inner] * lll_transform[inner]
        output[row] = value
    return 0


@native
def pari_quartic_mul_matrix(
    table: IntegerBuffer, element: IntegerBuffer, output: IntegerBuffer
) -> int:
    """Construct `zk_multable` for a quartic integral-basis element."""
    if len(table) < 64 or len(element) < 4 or len(output) < 16:
        raise ValueError("short quartic multiplication-matrix storage")
    for coordinate in range(4):
        for column in range(4):
            value = 0
            for i in range(4):
                value += table[(i * 4 + column) * 4 + coordinate] * element[i]
            output[coordinate * 4 + column] = value
    return 0


@native
def _pari_det3(
    a00: int,
    a01: int,
    a02: int,
    a10: int,
    a11: int,
    a12: int,
    a20: int,
    a21: int,
    a22: int,
) -> int:
    return (
        a00 * (a11 * a22 - a12 * a21)
        - a01 * (a10 * a22 - a12 * a20)
        + a02 * (a10 * a21 - a11 * a20)
    )


@native
def pari_quartic_inverse_first_column(
    matrix: IntegerBuffer,
    numerator: IntegerBuffer,
    denominator: IntegerBuffer,
) -> int:
    """Primitive numerator/denominator of `matrix^-1 * e_1`."""
    if len(matrix) < 16 or len(numerator) < 4 or len(denominator) < 1:
        raise ValueError("short quartic solve storage")
    n0 = _pari_det3(
        matrix[5],
        matrix[6],
        matrix[7],
        matrix[9],
        matrix[10],
        matrix[11],
        matrix[13],
        matrix[14],
        matrix[15],
    )
    n1 = -_pari_det3(
        matrix[4],
        matrix[6],
        matrix[7],
        matrix[8],
        matrix[10],
        matrix[11],
        matrix[12],
        matrix[14],
        matrix[15],
    )
    n2 = _pari_det3(
        matrix[4],
        matrix[5],
        matrix[7],
        matrix[8],
        matrix[9],
        matrix[11],
        matrix[12],
        matrix[13],
        matrix[15],
    )
    n3 = -_pari_det3(
        matrix[4],
        matrix[5],
        matrix[6],
        matrix[8],
        matrix[9],
        matrix[10],
        matrix[12],
        matrix[13],
        matrix[14],
    )
    determinant = matrix[0] * n0 + matrix[1] * n1 + matrix[2] * n2 + matrix[3] * n3
    if determinant == 0:
        raise ValueError("singular quartic multiplication matrix")
    if determinant < 0:
        determinant = -determinant
        n0 = -n0
        n1 = -n1
        n2 = -n2
        n3 = -n3
    common = gcd(determinant, abs(n0))
    common = gcd(common, abs(n1))
    common = gcd(common, abs(n2))
    common = gcd(common, abs(n3))
    numerator[0] = n0 // common
    numerator[1] = n1 // common
    numerator[2] = n2 // common
    numerator[3] = n3 // common
    denominator[0] = determinant // common
    return 0


@native
def pari_quartic_factor_append(
    kinds: IntegerBuffer,
    values: IntegerBuffer,
    exponents: IntegerBuffer,
    metadata: IntegerBuffer,
    kind: int,
    a: int,
    b: int,
    c: int,
    d: int,
    denominator: int,
    exponent: int,
) -> int:
    """Append a rational or quartic basis factor in source order."""
    if len(metadata) < 1 or kind < 0 or kind > 1 or denominator <= 0:
        raise ValueError("invalid quartic compact factor")
    if exponent == 0 or (kind == 0 and a == denominator):
        return 0
    count = metadata[0]
    if count < 0 or count >= len(kinds) or count >= len(exponents):
        raise ValueError("quartic factor capacity exceeded")
    if len(values) < 5 * (count + 1):
        raise ValueError("quartic factor value capacity exceeded")
    kinds[count] = kind
    values[5 * count] = a
    values[5 * count + 1] = b
    values[5 * count + 2] = c
    values[5 * count + 3] = d
    values[5 * count + 4] = denominator
    exponents[count] = exponent
    metadata[0] = count + 1
    return 0


@native
def pari_quartic_factor_extend(
    source_kinds: IntegerBuffer,
    source_values: IntegerBuffer,
    source_exponents: IntegerBuffer,
    source_metadata: IntegerBuffer,
    output_kinds: IntegerBuffer,
    output_values: IntegerBuffer,
    output_exponents: IntegerBuffer,
    output_metadata: IntegerBuffer,
) -> int:
    count = source_metadata[0]
    if count < 0 or count > len(source_kinds) or count > len(source_exponents):
        raise ValueError("invalid quartic source factor count")
    if len(source_values) < 5 * count:
        raise ValueError("short quartic source factor values")
    for i in range(count):
        pari_quartic_factor_append(
            output_kinds,
            output_values,
            output_exponents,
            output_metadata,
            source_kinds[i],
            source_values[5 * i],
            source_values[5 * i + 1],
            source_values[5 * i + 2],
            source_values[5 * i + 3],
            source_values[5 * i + 4],
            source_exponents[i],
        )
    return 0


@native
def pari_quartic_idealred_candidate(
    ideal: IntegerBuffer,
    table: IntegerBuffer,
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
    """Exact degree-four tail of `idealred0` for a computed candidate."""
    if (
        len(ideal) < 16
        or len(table) < 64
        or len(candidate) < 4
        or len(content) < 2
        or len(output) < 16
    ):
        raise ValueError("short quartic ideal-reduction storage")
    if content[1] <= 0:
        raise ValueError("invalid quartic ideal content")
    scalar = True
    for i in range(1, 4):
        if candidate[i] != 0:
            scalar = False
    if scalar:
        for i in range(16):
            output[i] = ideal[i]
        pari_quartic_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            0,
            content[0],
            0,
            0,
            0,
            content[1],
            1,
        )
        content[0] = 1
        content[1] = 1
        return 1
    pari_quartic_mul_matrix(table, candidate, multiplication_matrix)
    intersection = ideal[0]
    if intersection <= 0:
        raise ValueError("invalid primitive quartic ideal")
    for row in range(4):
        for column in range(4):
            value = 0
            for inner in range(4):
                value += (
                    multiplication_matrix[row * 4 + inner] * ideal[inner * 4 + column]
                )
            if value % intersection != 0:
                raise ValueError("quartic candidate does not map ideal integrally")
            product[row * 4 + column] = value // intersection
    pari_quartic_inverse_first_column(
        multiplication_matrix, inverse_numerator, inverse_denominator
    )
    denominator = inverse_denominator[0]
    pari_quartic_composite_hnf(
        product,
        4,
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
    inverse_scale = -1
    candidate_scale = -1
    for i in range(4):
        value = abs(inverse_numerator[i])
        scale = -1
        while value != 0:
            value //= 2
            scale += 1
        if scale > inverse_scale:
            inverse_scale = scale
        value = abs(candidate[i])
        scale = -1
        while value != 0:
            value //= 2
            scale += 1
        if scale > candidate_scale:
            candidate_scale = scale
    if inverse_scale >= candidate_scale:
        pari_quartic_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            1,
            candidate[0],
            candidate[1],
            candidate[2],
            candidate[3],
            1,
            -1,
        )
    else:
        pari_quartic_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            1,
            inverse_numerator[0],
            inverse_numerator[1],
            inverse_numerator[2],
            inverse_numerator[3],
            1,
            1,
        )
        content[1] *= denominator
        common = gcd(abs(content[0]), content[1])
        content[0] //= common
        content[1] //= common
    if content[0] != 1:
        pari_quartic_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            0,
            content[0],
            0,
            0,
            0,
            1,
            1,
        )
    if content[1] != 1:
        pari_quartic_factor_append(
            kinds,
            values,
            exponents,
            metadata,
            0,
            content[1],
            0,
            0,
            0,
            1,
            -1,
        )
    content[0] = 1
    content[1] = 1
    return 0
