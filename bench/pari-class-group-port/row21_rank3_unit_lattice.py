"""PARI 2.17.4 rank-three fundamental-unit lattice suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the bounded signature `(3, 1)` cut needed by frozen panel row 21.
It preserves `extract_full_lattice`'s two transformations: rectangular
integer LLL on the rank-three relation lattice, followed by LLL on the real
logarithm matrix. It continues through `cleanarchunit`, `fixarch`, and the private `getfu`
factor selection. It stops before the three-right-hand-side `getfu` solve,
which requires a live relation/log owner that row 21 does not yet have.
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
from .regulator_scalar import (
    pari_regulator_scalar_add,
    pari_regulator_scalar_multiply,
)
from .short_product import pari_real_integer_division, pari_short_product


@native
def pari_unit_integer_lattice_rank_three(
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
    """Return PARI's `U1` for a three-row, rank-three lattice.

    Matrices are column-major. `state` is `(fast zeros, DPE zeros,
    output columns, status, selector status)`.  Selector status zero records
    the source `columns < 199` direct-LLL route used by row 21.
    """

    rows = 3
    if columns < rows or columns >= 199:
        raise ValueError("rank-three unit lattice needs 3..198 columns")
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
        raise ValueError("short rank-three integer-lattice workspace")
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
def pari_unit_real_lattice_rank_three(
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
    """Run `lll(P)` for a full-rank `rows`-by-three real matrix."""

    columns = 3
    square = columns * columns
    if rows < columns or len(matrix_triples) != rows * columns * 3:
        raise ValueError("invalid rank-three real unit lattice shape")
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
        raise ValueError("short rank-three real-lattice workspace")
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
def pari_unit_compose_rank_three(
    u1: IntegerBuffer,
    rows: int,
    u2: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Compute `U1 * U2` with column-major `U1` and output."""

    columns = 3
    if (
        rows < 1
        or len(u1) < rows * columns
        or len(u2) < columns * columns
        or len(output) < rows * columns
    ):
        raise ValueError("short rank-three unit transform storage")
    for i in range(rows):
        for j in range(columns):
            value = 0
            for k in range(columns):
                value += u1[k * rows + i] * u2[k * columns + j]
            output[j * rows + i] = value
    return 0


@native
def pari_cleanarchunit_31_quintic(
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
    """Apply `cleanarchunit` for degree five and signature `(3, 1)`."""

    rows = 4
    columns = 3
    if precision != 192:
        raise ValueError("row-21 cleanarchunit requires 192-bit precision")
    if (
        len(source) < rows * columns * 7
        or len(expected_regulator) < 3
        or len(scratch) < rows * columns * 7
        or len(output) < rows * columns * 7
        or len(state) < 7
    ):
        raise ValueError("short signature-(3,1) cleanarchunit storage")
    pari_validate_log_entries(source, rows * columns)
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
                scale = -3
                period_exponent = pe + 1
                if row == 3:
                    scale = -4
                    period_exponent = pe + 2
                qm, qp, qe = pari_short_product(xm, xp, xe, im, ip, scale)
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
                    tm, tp, te = pari_integer_real_product(
                        quotient, pm, pp, period_exponent
                    )
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

    # Determinant of the first three real rows, in source accumulation order.
    a0, a1, a2 = scratch[1], scratch[2], scratch[3]
    b0, b1, b2 = scratch[29], scratch[30], scratch[31]
    c0, c1, c2 = scratch[57], scratch[58], scratch[59]
    d0, d1, d2 = scratch[8], scratch[9], scratch[10]
    e0, e1, e2 = scratch[36], scratch[37], scratch[38]
    f0, f1, f2 = scratch[64], scratch[65], scratch[66]
    g0, g1, g2 = scratch[15], scratch[16], scratch[17]
    h0, h1, h2 = scratch[43], scratch[44], scratch[45]
    i0, i1, i2 = scratch[71], scratch[72], scratch[73]
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
    dm, dp, de = pari_regulator_scalar_add(x0, x1, x2, -y0, y1, y2)
    dm, dp, de = pari_regulator_scalar_add(dm, dp, de, z0, z1, z2)
    state[6] = 1
    if dm < 0:
        state[6] = -1
        dm = -dm
    dm, dp, de = pari_regulator_scalar_add(
        dm,
        dp,
        de,
        -expected_regulator[0],
        expected_regulator[1],
        expected_regulator[2],
    )
    state[4] = pari_regulator_exponent(dm, dp, de)
    if state[4] > -1:
        state[0] = 2
        return 2
    for index in range(rows * columns * 7):
        output[index] = scratch[index]
    state[0] = 0
    return 0


@native
def pari_prepare_getfu_31_quintic(
    clean: IntegerBuffer,
    factor: IntegerBuffer,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    factored_clean: IntegerBuffer,
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
) -> int:
    """Build `fixarch(A)` and apply a rank-three unimodular factor."""

    rows = 4
    columns = 3
    entries = rows * columns
    if (
        len(clean) < entries * 7
        or len(factor) < 9
        or len(matep) < entries * 7
        or len(arch) < entries * 7
        or len(factored_clean) < entries * 7
        or len(arch_real) < entries * 3
        or len(arch_imag) < entries * 3
        or len(clean_real) < entries * 3
        or len(clean_imag) < entries * 3
    ):
        raise ValueError("short signature-(3,1) getfu preparation storage")
    pari_validate_log_entries(clean, entries)
    determinant = (
        factor[0] * (factor[4] * factor[8] - factor[5] * factor[7])
        - factor[1] * (factor[3] * factor[8] - factor[5] * factor[6])
        + factor[2] * (factor[3] * factor[7] - factor[4] * factor[6])
    )
    if determinant != 1 and determinant != -1:
        raise ValueError("signature-(3,1) getfu factor must be unimodular")
    for column in range(columns):
        base = rows * 7 * column
        sm, sp, se = clean[base + 1], clean[base + 2], clean[base + 3]
        for row in range(1, rows):
            at = base + 7 * row
            sm, sp, se = pari_regulator_scalar_add(
                sm, sp, se, clean[at + 1], clean[at + 2], clean[at + 3]
            )
        sm, sp, se = pari_real_integer_division(-5, sm, sp, se)
        for row in range(rows):
            at = base + 7 * row
            xm, xp, xe = clean[at + 1], clean[at + 2], clean[at + 3]
            im, ip, ie = clean[at + 4], clean[at + 5], clean[at + 6]
            if row == 3:
                xm, xp, xe = pari_real_integer_division(2, xm, xp, xe)
                im, ip, ie = pari_real_integer_division(2, im, ip, ie)
            rm, rp, re = pari_regulator_scalar_add(xm, xp, xe, sm, sp, se)
            matep[at] = clean[at]
            matep[at + 1] = rm
            matep[at + 2] = rp
            matep[at + 3] = re
            matep[at + 4] = im
            matep[at + 5] = ip
            matep[at + 6] = ie
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
        arch_imag[triple] = arch[packed + 4]
        arch_imag[triple + 1] = arch[packed + 5]
        arch_imag[triple + 2] = arch[packed + 6]
        clean_real[triple] = factored_clean[packed + 1]
        clean_real[triple + 1] = factored_clean[packed + 2]
        clean_real[triple + 2] = factored_clean[packed + 3]
        clean_imag[triple] = factored_clean[packed + 4]
        clean_imag[triple + 1] = factored_clean[packed + 5]
        clean_imag[triple + 2] = factored_clean[packed + 6]
    return 0


__all__ = [
    "probe_row21_rank3_unit_lattice",
    "pari_cleanarchunit_31_quintic",
    "pari_prepare_getfu_31_quintic",
    "pari_unit_compose_rank_three",
    "pari_unit_integer_lattice_rank_three",
    "pari_unit_real_lattice_rank_three",
]


def _event(bundle: dict, name: str) -> dict:
    matches = [
        entry
        for entry in bundle.get("events", [])
        if isinstance(entry, dict) and entry.get("event") == name
    ]
    if len(matches) != 1:
        raise ValueError("row-21 trace has the wrong " + name + " event count")
    return matches[0]


def _integer_matrix(value: dict) -> list[int]:
    if value.get("kind") != "matrix":
        raise ValueError("row-21 integer matrix has the wrong kind")
    return [
        int(entry["value"])
        for column in value.get("values", [])
        for entry in column.get("values", [])
    ]


def _packed_real(value: dict) -> list[int]:
    if value.get("kind") == "integer":
        return [int(value["value"]), -1, 0]
    if value.get("kind") != "real":
        raise ValueError("row-21 expected a real scalar")
    return [int(value["mantissa"]), int(value["precision"]), int(value["exponent"])]


def _packed_scalar(value: dict) -> list[int]:
    if value.get("kind") == "complex":
        return [2, *_packed_real(value["real"]), *_packed_real(value["imag"])]
    return [1, *_packed_real(value), 0, -1, 0]


def _packed_matrix(value: dict) -> list[int]:
    if value.get("kind") != "matrix":
        raise ValueError("row-21 logarithm matrix has the wrong kind")
    return [
        cell
        for column in value.get("values", [])
        for entry in column.get("values", [])
        for cell in _packed_scalar(entry)
    ]


def _reference_integral_units(reference: dict, prepared: dict) -> list[list[int]]:
    """Convert comparison-only PARI units to the prepared integral basis."""

    from fractions import Fraction

    inverse_basis = [int(entry["value"]) for entry in prepared["invzk"]]
    vector = reference.get("fu", {})
    if vector.get("kind") != "vector" or len(vector.get("values", [])) != 3:
        raise ValueError("row-21 reference has the wrong fundamental-unit shape")
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
                raise ValueError("unsupported row-21 reference unit coefficient")
        if len(coefficients) != 5:
            raise ValueError("row-21 reference unit has the wrong degree")
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
                raise ValueError("row-21 reference unit is not integral")
            unit.append(value.numerator)
        result.append(unit)
    return result


def _exact_real_sign(unit: list[int], prepared: dict, row: int) -> int:
    """Determine a real-embedding sign by exact dyadic accumulation."""

    summands = []
    for column, coefficient in enumerate(unit):
        entry = prepared["embeddingM"][5 * row + column]
        if entry.get("kind") == "integer":
            mantissa, exponent = int(entry["value"]), 0
        elif entry.get("kind") == "real":
            mantissa = int(entry["mantissa"])
            exponent = int(entry["exponent"]) + 1 - int(entry["precision"])
        else:
            raise ValueError("row-21 real embedding is not real")
        if coefficient != 0 and mantissa != 0:
            summands.append((coefficient * mantissa, exponent))
    if not summands:
        raise ValueError("row-21 unit vanished at a real embedding")
    minimum = min(exponent for _, exponent in summands)
    numerator = sum(mantissa << (exponent - minimum) for mantissa, exponent in summands)
    if numerator == 0:
        raise ValueError("row-21 sign interval contains zero")
    return 1 if numerator > 0 else -1


def probe_row21_rank3_unit_lattice(bundle: dict, w0_sha256: str) -> dict:
    """Execute the row-21 rank-three lattice cut as an oracle probe.

    This is intentionally not a result owner: the HNF/log and accepted-lattice
    inputs still come from frozen W0 because the connected row-21 collector has
    not published them. The `fundamental_units` event is opened only after
    both source transformations have completed, and is then used solely for a
    differential and for defining the exact C6 verifier that a later live
    owner must satisfy.
    """

    import hashlib
    import json

    from .log_matrix_transform import pari_log_matrix_transform
    from .row20_successful_c6 import _exact_unit_replay

    canonical = json.dumps(bundle, sort_keys=True, separators=(",", ":")).encode()
    canonical_sha256 = hashlib.sha256(canonical).hexdigest()
    if len(w0_sha256) != 64 or any(c not in "0123456789abcdef" for c in w0_sha256):
        raise ValueError("invalid row-21 W0 digest")
    field = bundle.get("field", {})
    if (
        field.get("panelIndex") != 21
        or field.get("id") != "5.3.1009349859375.3"
        or field.get("degree") != 5
        or field.get("signature") != [3, 1]
        or field.get("unitRank") != 3
    ):
        raise ValueError("wrong row-21 field identity")
    hnf = _event(bundle, "hnf")
    acceptance = _event(bundle, "acceptance")
    if (
        hnf.get("relations") != 32
        or hnf.get("C") != [4, 32]
        or hnf.get("B") != [0, 24]
        or acceptance.get("code") != 0
        or acceptance.get("h") != "1"
    ):
        raise ValueError("row-21 source unit boundary changed")
    relation_lattice = _integer_matrix(acceptance["lattice"])
    if len(relation_lattice) != 24:
        raise ValueError("row-21 accepted lattice has the wrong shape")
    columns = 8
    square = columns * columns

    def zeros(length: int) -> list[int]:
        return [0] * length

    def floats(length: int) -> list[float]:
        return [0.0] * length

    u1 = zeros(24)
    integer_state = zeros(5)
    status = pari_unit_integer_lattice_rank_three(
        relation_lattice,
        columns,
        u1,
        integer_state,
        zeros(24),
        zeros(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(columns),
        zeros(columns),
        floats(24),
        floats(square),
        zeros(columns),
        zeros(columns),
        zeros(columns),
        floats(columns),
        floats(columns),
        floats(columns),
        zeros(columns),
    )
    if status != 0 or integer_state != [5, 5, 3, 0, 0]:
        raise ValueError("row-21 integer lattice reduction failed")
    packed_logs = _packed_matrix(hnf["exactC"])
    if len(packed_logs) != 32 * 4 * 7:
        raise ValueError("row-21 exact logarithms have the wrong shape")
    packed_logs = packed_logs[: columns * 4 * 7]
    first_logs = zeros(4 * 3 * 7)
    pari_log_matrix_transform(packed_logs, u1, 4, columns, 3, False, first_logs)
    triples = zeros(4 * 3 * 3)
    for row in range(4):
        for column in range(3):
            source = 7 * (column * 4 + row) + 1
            target = 3 * (row * 3 + column)
            for cell in range(3):
                triples[target + cell] = first_logs[source + cell]
    u2 = zeros(9)
    real_state = zeros(2)
    status = pari_unit_real_lattice_rank_three(
        triples,
        4,
        zeros(12),
        u2,
        zeros(12),
        zeros(9),
        zeros(9),
        floats(9),
        zeros(9),
        floats(9),
        zeros(9),
        floats(3),
        zeros(3),
        floats(12),
        floats(9),
        zeros(3),
        zeros(4),
        zeros(4),
        floats(4),
        floats(4),
        floats(4),
        zeros(4),
        real_state,
    )
    if status != 0 or real_state != [0, 0]:
        raise ValueError("row-21 real lattice reduction failed")
    composed = zeros(24)
    pari_unit_compose_rank_three(u1, columns, u2, composed)

    unit_logs = zeros(4 * 3 * 7)
    pari_log_matrix_transform(packed_logs, composed, 4, columns, 3, False, unit_logs)
    expected_regulator = _packed_real(acceptance["exactR"])
    clean = zeros(4 * 3 * 7)
    clean_state = zeros(7)
    status = pari_cleanarchunit_31_quintic(
        unit_logs,
        expected_regulator,
        192,
        zeros(3),
        zeros(1024),
        zeros(1024),
        zeros(1024),
        zeros(1024),
        zeros(2048),
        zeros(84),
        clean,
        clean_state,
    )
    if status != 0:
        raise ValueError("row-21 cleanarchunit failed")
    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    matep = zeros(84)
    arch = zeros(84)
    candidate_a = zeros(84)
    arch_real = zeros(36)
    arch_imag = zeros(36)
    clean_real = zeros(36)
    clean_imag = zeros(36)
    pari_prepare_getfu_31_quintic(
        clean,
        identity,
        matep,
        arch,
        candidate_a,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    getfu_triples = zeros(36)
    for row in range(4):
        for column in range(3):
            source = 7 * (column * 4 + row) + 1
            target = 3 * (row * 3 + column)
            for cell in range(3):
                getfu_triples[target + cell] = matep[source + cell]
    getfu_u2 = zeros(9)
    getfu_real_state = zeros(2)
    status = pari_unit_real_lattice_rank_three(
        getfu_triples,
        4,
        zeros(12),
        getfu_u2,
        zeros(12),
        zeros(9),
        zeros(9),
        floats(9),
        zeros(9),
        floats(9),
        zeros(9),
        floats(3),
        zeros(3),
        floats(12),
        floats(9),
        zeros(3),
        zeros(4),
        zeros(4),
        floats(4),
        floats(4),
        floats(4),
        zeros(4),
        getfu_real_state,
    )
    if status != 0 or getfu_real_state != [0, 0]:
        raise ValueError("row-21 private getfu lattice reduction failed")
    getfu_factor = [
        getfu_u2[3 * row + column] for column in range(3) for row in range(3)
    ]
    pari_prepare_getfu_31_quintic(
        clean,
        getfu_factor,
        matep,
        arch,
        candidate_a,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )

    # Comparison-only boundary: no reference output was read above.
    reference = _event(bundle, "fundamental_units")
    expected = _integer_matrix(reference["U"])
    if composed != expected:
        raise ValueError("row-21 computed rank-three transform differs from PARI")
    prepared = bundle.get("prepared", {})
    tensor = [int(value) for value in prepared.get("multiplicationTensor", [])]
    if len(tensor) != 125:
        raise ValueError("row-21 multiplication tensor has the wrong shape")
    units = _reference_integral_units(reference, prepared)
    reference_proofs = []
    for unit in units:
        proof = _exact_unit_replay(unit, tensor)
        proof["integralBasis"] = [str(value) for value in unit]
        proof["realSigns"] = [_exact_real_sign(unit, prepared, row) for row in range(3)]
        reference_proofs.append(proof)
    return {
        "schema": "sagejs.pari-class-group/row21-rank3-unit-lattice-probe-v1",
        "field": dict(field),
        "publishable": False,
        "correspondenceComplete": False,
        "frozenW0RuntimeInput": True,
        "providedW0Sha256": w0_sha256,
        "canonicalJsonSha256": canonical_sha256,
        "integerState": integer_state,
        "realState": real_state,
        "cleanarchState": clean_state,
        "privateGetfuRealState": getfu_real_state,
        "u1": [str(value) for value in u1],
        "realInputTriples": [str(value) for value in triples],
        "u2": [str(value) for value in u2],
        "unitTransform": [str(value) for value in composed],
        "unitLogs": [str(value) for value in unit_logs],
        "expectedRegulator": [str(value) for value in expected_regulator],
        "cleanLogs": [str(value) for value in clean],
        "privateGetfuFactor": [str(value) for value in getfu_factor],
        "candidateA": [str(value) for value in candidate_a],
        "postcomputeDifferential": {
            "unitTransformMatches": True,
            "referenceUnitProofs": reference_proofs,
        },
        "closedCut": (
            "extract_full_lattice rank-three integer/real LLL through "
            "cleanarchunit and private getfu-factor selection"
        ),
        "nextRequiredLiveInputs": [
            "authenticated row-21 relation/HNF owner",
            "authenticated row-21 exact raw logarithm owner",
            "accepted regulator owner",
        ],
        "remainingSuffix": [
            "signature-(3,1) getfu reconstruction",
            "live exact unit/norm/sign publication",
        ],
    }
