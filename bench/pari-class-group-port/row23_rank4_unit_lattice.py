"""PARI 2.17.4 rank-four fundamental-unit lattice dependency cut.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the bounded totally-real quintic cut needed by frozen panel row 23.
It implements the two ``extract_full_lattice`` reductions, ``cleanarchunit``,
``fixarch``, and the private ``getfu`` factor selection.  It deliberately
stops before the four-right-hand-side reconstruction: row 23 has no live
relation/log owner from which those units could honestly be published.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .integer_real_product import pari_integer_real_product
from .lll_dpe_pass import pari_lll_dpe
from .lll_fast import pari_lll_fast
from .lll_rescale import pari_lll_rescale
from .log_matrix_transform import pari_log_matrix_transform, pari_validate_log_entries
from .pi_constant import pari_pi_constant
from .real_division import pari_real_division
from .regulator_approx_zero import pari_regulator_exponent
from .regulator_scalar import pari_regulator_scalar_add, pari_regulator_scalar_multiply
from .short_product import pari_real_integer_division, pari_short_product


@native
def pari_unit_integer_lattice_rank_four(
    original: IntegerBuffer,
    columns: int,
    u1: IntegerBuffer,
    state: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    gram: IntegerBuffer,
    mu: Float64Buffer,
    mu_exponents: IntegerBuffer,
    r: Float64Buffer,
    r_exponents: IntegerBuffer,
    s: Float64Buffer,
    s_exponents: IntegerBuffer,
    approximate: Float64Buffer,
    float_gram: Float64Buffer,
    alpha: IntegerBuffer,
    column: IntegerBuffer,
    column_exponents: IntegerBuffer,
    normalized: Float64Buffer,
    temporary: Float64Buffer,
    dpe_float_scratch: Float64Buffer,
    integer_scratch: IntegerBuffer,
) -> int:
    """Return PARI's ``U1`` for a four-row, rank-four lattice."""

    rows = 4
    if columns < rows or columns >= 199:
        raise ValueError("rank-four unit lattice needs 4..198 columns")
    square = columns * columns
    if (
        len(original) < rows * columns
        or len(u1) < columns * rows
        or len(state) < 5
        or len(basis) < rows * columns
        or len(transform) < square
        or len(gram) < square
        or len(mu) < square
        or len(mu_exponents) < square
        or len(r) < square
        or len(r_exponents) < square
        or len(s) < columns
        or len(s_exponents) < columns
        or len(approximate) < rows * columns
        or len(float_gram) < square
        or len(alpha) < columns
        or len(column) < columns
        or len(column_exponents) < columns
        or len(normalized) < columns
        or len(temporary) < columns
        or len(dpe_float_scratch) < columns
        or len(integer_scratch) < columns
    ):
        raise ValueError("short rank-four integer-lattice workspace")
    for index in range(5):
        state[index] = -1
    state[4] = 0
    for j in range(columns):
        for i in range(rows):
            basis[j * rows + i] = original[j * rows + i]
        for i in range(columns):
            transform[j * columns + i] = 0
        transform[j * columns + j] = 1
    fast_zeros = pari_lll_fast(
        basis,
        transform,
        rows,
        columns,
        columns,
        0.99,
        0.51,
        False,
        mu,
        r,
        s,
        approximate,
        column_exponents,
        float_gram,
        alpha,
        column,
        integer_scratch,
        normalized,
        temporary,
    )
    state[0] = fast_zeros
    if fast_zeros < 0:
        state[3] = 1
        return 1
    dpe_zeros = pari_lll_dpe(
        gram,
        basis,
        transform,
        rows,
        columns,
        columns,
        True,
        0.99,
        0.51,
        False,
        mu,
        mu_exponents,
        r,
        r_exponents,
        s,
        s_exponents,
        alpha,
        integer_scratch,
        dpe_float_scratch,
    )
    state[1] = dpe_zeros
    if dpe_zeros != columns - rows:
        state[3] = 1
        return 1
    for j in range(rows):
        for i in range(columns):
            u1[j * columns + i] = transform[(dpe_zeros + j) * columns + i]
    state[2] = rows
    state[3] = 0
    return 0


@native
def pari_unit_real_lattice_rank_four(
    matrix_triples: IntegerBuffer,
    rows: int,
    integers: IntegerBuffer,
    u2: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    gram: IntegerBuffer,
    mu: Float64Buffer,
    mu_exponents: IntegerBuffer,
    r: Float64Buffer,
    r_exponents: IntegerBuffer,
    s: Float64Buffer,
    s_exponents: IntegerBuffer,
    approximate: Float64Buffer,
    float_gram: Float64Buffer,
    alpha: IntegerBuffer,
    column: IntegerBuffer,
    column_exponents: IntegerBuffer,
    normalized: Float64Buffer,
    temporary: Float64Buffer,
    dpe_float_scratch: Float64Buffer,
    integer_scratch: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Run PARI's real LLL for a full-rank ``rows``-by-four matrix."""

    columns = 4
    square = 16
    if rows < columns or len(matrix_triples) != rows * columns * 3:
        raise ValueError("invalid rank-four real unit lattice shape")
    if (
        len(integers) < rows * columns
        or len(u2) < square
        or len(basis) < rows * columns
        or len(transform) < square
        or len(gram) < square
        or len(mu) < square
        or len(mu_exponents) < square
        or len(r) < square
        or len(r_exponents) < square
        or len(s) < columns
        or len(s_exponents) < columns
        or len(approximate) < rows * columns
        or len(float_gram) < square
        or len(alpha) < columns
        or len(column) < rows
        or len(column_exponents) < rows
        or len(normalized) < rows
        or len(temporary) < rows
        or len(dpe_float_scratch) < rows
        or len(integer_scratch) < rows
        or len(state) < 2
    ):
        raise ValueError("short rank-four real-lattice workspace")
    pari_lll_rescale(matrix_triples, integers)
    for j in range(columns):
        for i in range(rows):
            basis[j * rows + i] = integers[i * columns + j]
        for i in range(columns):
            transform[j * columns + i] = 0
        transform[j * columns + j] = 1
    state[0] = pari_lll_fast(
        basis,
        transform,
        rows,
        columns,
        columns,
        0.75,
        0.51,
        False,
        mu,
        r,
        s,
        approximate,
        column_exponents,
        float_gram,
        alpha,
        column,
        integer_scratch,
        normalized,
        temporary,
    )
    if state[0] < 0:
        return 1
    state[1] = pari_lll_dpe(
        gram,
        basis,
        transform,
        rows,
        columns,
        columns,
        True,
        0.75,
        0.51,
        False,
        mu,
        mu_exponents,
        r,
        r_exponents,
        s,
        s_exponents,
        alpha,
        integer_scratch,
        dpe_float_scratch,
    )
    if state[1] != 0:
        return 1
    for i in range(columns):
        for j in range(columns):
            u2[i * columns + j] = transform[j * columns + i]
    return 0


@native
def pari_unit_compose_rank_four(
    u1: IntegerBuffer, rows: int, u2: IntegerBuffer, output: IntegerBuffer
) -> int:
    """Compute column-major ``U1 * U2``."""

    columns = 4
    if rows < 1 or len(u1) < rows * 4 or len(u2) < 16 or len(output) < rows * 4:
        raise ValueError("short rank-four unit transform storage")
    for i in range(rows):
        for j in range(columns):
            value = 0
            for k in range(columns):
                value += u1[k * rows + i] * u2[k * columns + j]
            output[j * rows + i] = value
    return 0


@native
def _pari_real_product_four(
    a0: int,
    a1: int,
    a2: int,
    b0: int,
    b1: int,
    b2: int,
    c0: int,
    c1: int,
    c2: int,
    d0: int,
    d1: int,
    d2: int,
) -> tuple[int, int, int]:
    x0, x1, x2 = pari_regulator_scalar_multiply(a0, a1, a2, b0, b1, b2)
    y0, y1, y2 = pari_regulator_scalar_multiply(c0, c1, c2, d0, d1, d2)
    return pari_regulator_scalar_multiply(x0, x1, x2, y0, y1, y2)


@native
def _pari_real_det_three(
    a0: int,
    a1: int,
    a2: int,
    b0: int,
    b1: int,
    b2: int,
    c0: int,
    c1: int,
    c2: int,
    d0: int,
    d1: int,
    d2: int,
    e0: int,
    e1: int,
    e2: int,
    f0: int,
    f1: int,
    f2: int,
    g0: int,
    g1: int,
    g2: int,
    h0: int,
    h1: int,
    h2: int,
    i0: int,
    i1: int,
    i2: int,
) -> tuple[int, int, int]:
    ei0, ei1, ei2 = pari_regulator_scalar_multiply(e0, e1, e2, i0, i1, i2)
    fh0, fh1, fh2 = pari_regulator_scalar_multiply(f0, f1, f2, h0, h1, h2)
    m00, m01, m02 = pari_regulator_scalar_add(ei0, ei1, ei2, -fh0, fh1, fh2)
    di0, di1, di2 = pari_regulator_scalar_multiply(d0, d1, d2, i0, i1, i2)
    fg0, fg1, fg2 = pari_regulator_scalar_multiply(f0, f1, f2, g0, g1, g2)
    m10, m11, m12 = pari_regulator_scalar_add(di0, di1, di2, -fg0, fg1, fg2)
    dh0, dh1, dh2 = pari_regulator_scalar_multiply(d0, d1, d2, h0, h1, h2)
    eg0, eg1, eg2 = pari_regulator_scalar_multiply(e0, e1, e2, g0, g1, g2)
    m20, m21, m22 = pari_regulator_scalar_add(dh0, dh1, dh2, -eg0, eg1, eg2)
    x0, x1, x2 = pari_regulator_scalar_multiply(a0, a1, a2, m00, m01, m02)
    y0, y1, y2 = pari_regulator_scalar_multiply(b0, b1, b2, m10, m11, m12)
    z0, z1, z2 = pari_regulator_scalar_multiply(c0, c1, c2, m20, m21, m22)
    x0, x1, x2 = pari_regulator_scalar_add(x0, x1, x2, -y0, y1, y2)
    return pari_regulator_scalar_add(x0, x1, x2, z0, z1, z2)


@native
def _pari_integer_det_three(
    a: int, b: int, c: int, d: int, e: int, f: int, g: int, h: int, i: int
) -> int:
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


@native
def pari_cleanarchunit_50_quintic(
    source: IntegerBuffer,
    expected_regulator: IntegerBuffer,
    precision: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    scratch: IntegerBuffer,
    output: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Apply the totally-real quintic ``cleanarchunit`` checks."""

    rows = 5
    columns = 4
    entries = 20
    if precision != 256:
        raise ValueError("row-23 cleanarchunit requires 256-bit precision")
    if (
        len(source) < entries * 7
        or len(expected_regulator) < 3
        or len(scratch) < entries * 7
        or len(output) < entries * 7
        or len(state) < 7
    ):
        raise ValueError("short signature-(5,0) cleanarchunit storage")
    pari_validate_log_entries(source, entries)
    for index in range(7):
        state[index] = -1
    state[1] = 0
    state[2] = columns
    state[3] = -(1 << 61)
    state[4] = -(1 << 61)
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    one = 1 << (pp - 1)
    im, ip, ie = pari_real_division(one, pp, 0, pm, pp, pe)
    for column_index in range(columns):
        base = rows * 7 * column_index
        sm, sp, se = source[base + 1], source[base + 2], source[base + 3]
        for row in range(1, rows):
            at = base + 7 * row
            sm, sp, se = pari_regulator_scalar_add(
                sm, sp, se, source[at + 1], source[at + 2], source[at + 3]
            )
        norm_exponent = pari_regulator_exponent(sm, sp, se)
        if norm_exponent > state[3]:
            state[3] = norm_exponent
        if norm_exponent > -10:
            state[0] = 1
            return 1
        for row in range(rows):
            at = base + 7 * row
            for cell in range(7):
                scratch[at + cell] = source[at + cell]
            xm, xp, xe = source[at + 4], source[at + 5], source[at + 6]
            if xm != 0:
                qm, qp, qe = pari_short_product(xm, xp, xe, im, ip, -3)
                if qe >= 0 and ((qe + 64) // 64) * 64 > qp:
                    state[0] = 1
                    state[5] = row
                    return 1
                shift = qp - qe - 1
                if shift >= 0:
                    quotient = qm // (1 << shift)
                else:
                    quotient = qm << -shift
                if quotient != 0:
                    tm, tp, te = pari_integer_real_product(quotient, pm, pp, pe + 1)
                    xm, xp, xe = pari_regulator_scalar_add(xm, xp, xe, -tm, tp, te)
                scratch[at + 4] = xm
                scratch[at + 5] = xp
                scratch[at + 6] = xe
                if xm == 0:
                    scratch[at] = 1
                    scratch[at + 4] = 0
                    scratch[at + 5] = -1
                    scratch[at + 6] = 0
        state[1] = column_index + 1

    # Expand the determinant of the first four real rows along its first row.
    m00, m01, m02 = _pari_real_det_three(
        scratch[43],
        scratch[44],
        scratch[45],
        scratch[78],
        scratch[79],
        scratch[80],
        scratch[113],
        scratch[114],
        scratch[115],
        scratch[50],
        scratch[51],
        scratch[52],
        scratch[85],
        scratch[86],
        scratch[87],
        scratch[120],
        scratch[121],
        scratch[122],
        scratch[57],
        scratch[58],
        scratch[59],
        scratch[92],
        scratch[93],
        scratch[94],
        scratch[127],
        scratch[128],
        scratch[129],
    )
    m10, m11, m12 = _pari_real_det_three(
        scratch[8],
        scratch[9],
        scratch[10],
        scratch[78],
        scratch[79],
        scratch[80],
        scratch[113],
        scratch[114],
        scratch[115],
        scratch[15],
        scratch[16],
        scratch[17],
        scratch[85],
        scratch[86],
        scratch[87],
        scratch[120],
        scratch[121],
        scratch[122],
        scratch[22],
        scratch[23],
        scratch[24],
        scratch[92],
        scratch[93],
        scratch[94],
        scratch[127],
        scratch[128],
        scratch[129],
    )
    m20, m21, m22 = _pari_real_det_three(
        scratch[8],
        scratch[9],
        scratch[10],
        scratch[43],
        scratch[44],
        scratch[45],
        scratch[113],
        scratch[114],
        scratch[115],
        scratch[15],
        scratch[16],
        scratch[17],
        scratch[50],
        scratch[51],
        scratch[52],
        scratch[120],
        scratch[121],
        scratch[122],
        scratch[22],
        scratch[23],
        scratch[24],
        scratch[57],
        scratch[58],
        scratch[59],
        scratch[127],
        scratch[128],
        scratch[129],
    )
    m30, m31, m32 = _pari_real_det_three(
        scratch[8],
        scratch[9],
        scratch[10],
        scratch[43],
        scratch[44],
        scratch[45],
        scratch[78],
        scratch[79],
        scratch[80],
        scratch[15],
        scratch[16],
        scratch[17],
        scratch[50],
        scratch[51],
        scratch[52],
        scratch[85],
        scratch[86],
        scratch[87],
        scratch[22],
        scratch[23],
        scratch[24],
        scratch[57],
        scratch[58],
        scratch[59],
        scratch[92],
        scratch[93],
        scratch[94],
    )
    x0, x1, x2 = pari_regulator_scalar_multiply(
        scratch[1], scratch[2], scratch[3], m00, m01, m02
    )
    y0, y1, y2 = pari_regulator_scalar_multiply(
        scratch[36], scratch[37], scratch[38], m10, m11, m12
    )
    z0, z1, z2 = pari_regulator_scalar_multiply(
        scratch[71], scratch[72], scratch[73], m20, m21, m22
    )
    w0, w1, w2 = pari_regulator_scalar_multiply(
        scratch[106], scratch[107], scratch[108], m30, m31, m32
    )
    dm, dp, de = pari_regulator_scalar_add(x0, x1, x2, -y0, y1, y2)
    dm, dp, de = pari_regulator_scalar_add(dm, dp, de, z0, z1, z2)
    dm, dp, de = pari_regulator_scalar_add(dm, dp, de, -w0, w1, w2)
    state[6] = 1
    if dm < 0:
        state[6] = -1
        dm = -dm
    dm, dp, de = pari_regulator_scalar_add(
        dm, dp, de, -expected_regulator[0], expected_regulator[1], expected_regulator[2]
    )
    state[4] = pari_regulator_exponent(dm, dp, de)
    if state[4] > -1:
        state[0] = 2
        return 2
    for index in range(entries * 7):
        output[index] = scratch[index]
    state[0] = 0
    return 0


@native
def pari_prepare_getfu_50_quintic(
    clean: IntegerBuffer,
    factor: IntegerBuffer,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    factored_clean: IntegerBuffer,
    arch_real: IntegerBuffer,
    clean_real: IntegerBuffer,
) -> int:
    """Build totally-real ``fixarch(A)`` and apply a rank-four factor."""

    rows = 5
    columns = 4
    entries = 20
    if (
        len(clean) < entries * 7
        or len(factor) < 16
        or len(matep) < entries * 7
        or len(arch) < entries * 7
        or len(factored_clean) < entries * 7
        or len(arch_real) < entries * 3
        or len(clean_real) < entries * 3
    ):
        raise ValueError("short signature-(5,0) getfu preparation storage")
    pari_validate_log_entries(clean, entries)
    determinant = (
        factor[0]
        * _pari_integer_det_three(
            factor[5],
            factor[9],
            factor[13],
            factor[6],
            factor[10],
            factor[14],
            factor[7],
            factor[11],
            factor[15],
        )
        - factor[4]
        * _pari_integer_det_three(
            factor[1],
            factor[9],
            factor[13],
            factor[2],
            factor[10],
            factor[14],
            factor[3],
            factor[11],
            factor[15],
        )
        + factor[8]
        * _pari_integer_det_three(
            factor[1],
            factor[5],
            factor[13],
            factor[2],
            factor[6],
            factor[14],
            factor[3],
            factor[7],
            factor[15],
        )
        - factor[12]
        * _pari_integer_det_three(
            factor[1],
            factor[5],
            factor[9],
            factor[2],
            factor[6],
            factor[10],
            factor[3],
            factor[7],
            factor[11],
        )
    )
    if determinant != 1 and determinant != -1:
        raise ValueError("signature-(5,0) getfu factor must be unimodular")
    for column_index in range(columns):
        base = rows * 7 * column_index
        sm, sp, se = clean[base + 1], clean[base + 2], clean[base + 3]
        for row in range(1, rows):
            at = base + 7 * row
            sm, sp, se = pari_regulator_scalar_add(
                sm, sp, se, clean[at + 1], clean[at + 2], clean[at + 3]
            )
        sm, sp, se = pari_real_integer_division(-5, sm, sp, se)
        for row in range(rows):
            at = base + 7 * row
            rm, rp, re = pari_regulator_scalar_add(
                clean[at + 1], clean[at + 2], clean[at + 3], sm, sp, se
            )
            matep[at] = clean[at]
            matep[at + 1] = rm
            matep[at + 2] = rp
            matep[at + 3] = re
            matep[at + 4] = clean[at + 4]
            matep[at + 5] = clean[at + 5]
            matep[at + 6] = clean[at + 6]
    pari_log_matrix_transform(matep, factor, rows, columns, columns, False, arch)
    pari_log_matrix_transform(
        clean, factor, rows, columns, columns, False, factored_clean
    )
    for index in range(entries):
        packed = 7 * index
        triple = 3 * index
        arch_real[triple] = arch[packed + 1]
        arch_real[triple + 1] = arch[packed + 2]
        arch_real[triple + 2] = arch[packed + 3]
        clean_real[triple] = factored_clean[packed + 1]
        clean_real[triple + 1] = factored_clean[packed + 2]
        clean_real[triple + 2] = factored_clean[packed + 3]
    return 0


__all__ = [
    "pari_cleanarchunit_50_quintic",
    "pari_prepare_getfu_50_quintic",
    "pari_unit_compose_rank_four",
    "pari_unit_integer_lattice_rank_four",
    "pari_unit_real_lattice_rank_four",
    "probe_row23_rank4_unit_lattice",
]


def _event(bundle: dict, name: str) -> dict:
    matches = [
        entry for entry in bundle.get("events", []) if entry.get("event") == name
    ]
    if len(matches) != 1:
        raise ValueError("row-23 trace has the wrong " + name + " event count")
    return matches[0]


def _integer_matrix(value: dict) -> list[int]:
    if value.get("kind") != "matrix":
        raise ValueError("row-23 integer matrix has the wrong kind")
    return [
        int(entry["value"]) for column in value["values"] for entry in column["values"]
    ]


def _packed_real(value: dict) -> list[int]:
    if value.get("kind") == "integer":
        return [int(value["value"]), -1, 0]
    if value.get("kind") != "real":
        raise ValueError("row-23 expected a real scalar")
    return [int(value["mantissa"]), int(value["precision"]), int(value["exponent"])]


def _packed_scalar(value: dict) -> list[int]:
    if value.get("kind") == "complex":
        return [2, *_packed_real(value["real"]), *_packed_real(value["imag"])]
    if value.get("kind") != "real" and value.get("kind") != "integer":
        raise ValueError("row-23 logarithm has the wrong kind")
    return [1, *_packed_real(value), 0, -1, 0]


def _packed_matrix(value: dict) -> list[int]:
    if value.get("kind") != "matrix":
        raise ValueError("row-23 logarithm matrix has the wrong kind")
    return [
        cell
        for column in value["values"]
        for entry in column["values"]
        for cell in _packed_scalar(entry)
    ]


def _reference_integral_units(reference: dict, prepared: dict) -> list[list[int]]:
    from fractions import Fraction

    inverse_basis = [int(entry["value"]) for entry in prepared["invzk"]]
    vector = reference.get("fu", {})
    if vector.get("kind") != "vector" or len(vector.get("values", [])) != 4:
        raise ValueError("row-23 reference has the wrong fundamental-unit shape")
    result = []
    for polynomial in vector["values"]:
        coefficients = []
        for coefficient in polynomial.get("coefficients", []):
            if coefficient.get("kind") == "integer":
                coefficients.append((int(coefficient["value"]), 1))
            elif coefficient.get("kind") == "pair-4":
                coefficients.append(
                    (
                        int(coefficient["left"]["value"]),
                        int(coefficient["right"]["value"]),
                    )
                )
            else:
                raise ValueError("unsupported row-23 reference unit coefficient")
        while len(coefficients) < 5:
            coefficients.append((0, 1))
        if len(coefficients) != 5:
            raise ValueError("row-23 reference unit has the wrong degree")
        unit = []
        for row in range(5):
            value = sum(
                Fraction(
                    inverse_basis[5 * column + row] * coefficients[column][0],
                    coefficients[column][1],
                )
                for column in range(5)
            )
            if value.denominator != 1:
                raise ValueError("row-23 reference unit is not integral")
            unit.append(value.numerator)
        result.append(unit)
    return result


def _exact_real_sign(unit: list[int], prepared: dict, row: int) -> int:
    summands = []
    for column, coefficient in enumerate(unit):
        entry = prepared["embeddingM"][5 * row + column]
        if entry.get("kind") == "integer":
            mantissa, exponent = int(entry["value"]), 0
        elif entry.get("kind") == "real":
            mantissa = int(entry["mantissa"])
            exponent = int(entry["exponent"]) + 1 - int(entry["precision"])
        else:
            raise ValueError("row-23 real embedding is not real")
        if coefficient != 0 and mantissa != 0:
            summands.append((coefficient * mantissa, exponent))
    minimum = min(exponent for _, exponent in summands)
    numerator = sum(mantissa << (exponent - minimum) for mantissa, exponent in summands)
    if numerator == 0:
        raise ValueError("row-23 sign interval contains zero")
    return 1 if numerator > 0 else -1


def probe_row23_rank4_unit_lattice(bundle: dict, w0_sha256: str) -> dict:
    """Run the bounded row-23 cut, then open W0 only as a differential oracle."""

    import hashlib
    import json
    from .row20_successful_c6 import _exact_unit_replay

    canonical = json.dumps(bundle, sort_keys=True, separators=(",", ":")).encode()
    field = bundle.get("field", {})
    if (
        len(w0_sha256) != 64
        or hashlib.sha256(bytes.fromhex(w0_sha256)).digest_size != 32
    ):
        raise ValueError("invalid row-23 W0 digest")
    if (
        field.get("panelIndex"),
        field.get("id"),
        field.get("degree"),
        field.get("signature"),
        field.get("unitRank"),
    ) != (23, "5.5.1002836007889.1", 5, [5, 0], 4):
        raise ValueError("wrong row-23 field identity")
    hnf = _event(bundle, "hnf")
    acceptance = _event(bundle, "acceptance")
    if (
        hnf.get("relations") != 40
        or hnf.get("C") != [5, 40]
        or hnf.get("B") != [1, 30]
        or acceptance.get("code") != 0
        or acceptance.get("h") != "6"
    ):
        raise ValueError("row-23 source unit boundary changed")
    lattice = _integer_matrix(acceptance["lattice"])
    if len(lattice) != 36:
        raise ValueError("row-23 accepted lattice has the wrong shape")
    columns, square = 9, 81

    def zeros(length: int) -> list[int]:
        return [0] * length

    def floats(length: int) -> list[float]:
        return [0.0] * length

    u1, integer_state = zeros(36), zeros(5)
    status = pari_unit_integer_lattice_rank_four(
        lattice,
        columns,
        u1,
        integer_state,
        zeros(36),
        zeros(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(columns),
        zeros(columns),
        floats(36),
        floats(square),
        zeros(columns),
        zeros(columns),
        zeros(columns),
        floats(columns),
        floats(columns),
        floats(columns),
        zeros(columns),
    )
    if status != 0:
        raise ValueError("row-23 integer lattice reduction failed")
    packed_logs = _packed_matrix(hnf["exactC"])
    if len(packed_logs) != 40 * 5 * 7:
        raise ValueError("row-23 exact logarithms have the wrong shape")
    packed_logs = packed_logs[: columns * 5 * 7]
    first_logs = zeros(5 * 4 * 7)
    pari_log_matrix_transform(packed_logs, u1, 5, columns, 4, False, first_logs)
    triples = zeros(5 * 4 * 3)
    for row in range(5):
        for column in range(4):
            source, target = 7 * (column * 5 + row) + 1, 3 * (row * 4 + column)
            for cell in range(3):
                triples[target + cell] = first_logs[source + cell]

    def real_reduce(data):
        output, state = zeros(16), zeros(2)
        code = pari_unit_real_lattice_rank_four(
            data,
            5,
            zeros(20),
            output,
            zeros(20),
            zeros(16),
            zeros(16),
            floats(16),
            zeros(16),
            floats(16),
            zeros(16),
            floats(4),
            zeros(4),
            floats(20),
            floats(16),
            zeros(4),
            zeros(5),
            zeros(5),
            floats(5),
            floats(5),
            floats(5),
            zeros(5),
            state,
        )
        if code != 0:
            raise ValueError("row-23 real lattice reduction failed")
        return output, state

    u2, real_state = real_reduce(triples)
    composed = zeros(36)
    pari_unit_compose_rank_four(u1, columns, u2, composed)
    unit_logs = zeros(140)
    pari_log_matrix_transform(packed_logs, composed, 5, columns, 4, False, unit_logs)
    expected_regulator = _packed_real(acceptance["exactR"])
    clean, clean_state = zeros(140), zeros(7)
    if (
        pari_cleanarchunit_50_quintic(
            unit_logs,
            expected_regulator,
            256,
            zeros(3),
            zeros(1024),
            zeros(1024),
            zeros(1024),
            zeros(1024),
            zeros(2048),
            zeros(140),
            clean,
            clean_state,
        )
        != 0
    ):
        raise ValueError("row-23 cleanarchunit failed")
    identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    matep, arch, candidate_a = zeros(140), zeros(140), zeros(140)
    arch_real, clean_real = zeros(60), zeros(60)
    pari_prepare_getfu_50_quintic(
        clean, identity, matep, arch, candidate_a, arch_real, clean_real
    )
    getfu_triples = zeros(60)
    for row in range(5):
        for column in range(4):
            source, target = 7 * (column * 5 + row) + 1, 3 * (row * 4 + column)
            for cell in range(3):
                getfu_triples[target + cell] = matep[source + cell]
    getfu_u2, getfu_state = real_reduce(getfu_triples)
    getfu_factor = [
        getfu_u2[4 * row + column] for column in range(4) for row in range(4)
    ]
    pari_prepare_getfu_50_quintic(
        clean, getfu_factor, matep, arch, candidate_a, arch_real, clean_real
    )

    # W0 is opened only after the translated cut has computed its output.
    reference = _event(bundle, "fundamental_units")
    expected = _integer_matrix(reference["U"])
    if composed != expected:
        raise ValueError("row-23 computed rank-four transform differs from PARI")
    prepared = bundle.get("prepared", {})
    tensor = [int(value) for value in prepared.get("multiplicationTensor", [])]
    units = _reference_integral_units(reference, prepared)
    proofs = []
    for unit in units:
        proof = _exact_unit_replay(unit, tensor)
        proof["integralBasis"] = [str(value) for value in unit]
        proof["realSigns"] = [_exact_real_sign(unit, prepared, row) for row in range(5)]
        proofs.append(proof)
    return {
        "schema": "sagejs.pari-class-group/row23-rank4-unit-lattice-probe-v1",
        "field": dict(field),
        "publishable": False,
        "correspondenceComplete": False,
        "frozenW0RuntimeInput": True,
        "w0Role": "postcompute differential oracle; not an owner",
        "providedW0Sha256": w0_sha256,
        "canonicalJsonSha256": hashlib.sha256(canonical).hexdigest(),
        "integerState": integer_state,
        "realState": real_state,
        "cleanarchState": clean_state,
        "privateGetfuRealState": getfu_state,
        "u1": list(map(str, u1)),
        "acceptedLattice": list(map(str, lattice)),
        "realInputTriples": list(map(str, triples)),
        "u2": list(map(str, u2)),
        "unitTransform": list(map(str, composed)),
        "unitLogs": list(map(str, unit_logs)),
        "expectedRegulator": list(map(str, expected_regulator)),
        "cleanLogs": list(map(str, clean)),
        "privateGetfuFactor": list(map(str, getfu_factor)),
        "candidateA": list(map(str, candidate_a)),
        "postcomputeDifferential": {
            "unitTransformMatches": True,
            "referenceUnitProofs": proofs,
        },
        "closedCut": "extract_full_lattice rank-four integer/real LLL through cleanarchunit and private getfu-factor selection",
        "nextRequiredLiveInputs": [
            "authenticated row-23 relation/HNF owner",
            "authenticated row-23 exact raw logarithm owner",
            "accepted regulator owner",
        ],
        "remainingSuffix": [
            "signature-(5,0) four-RHS getfu reconstruction",
            "live exact unit/norm/sign publication",
        ],
    }
