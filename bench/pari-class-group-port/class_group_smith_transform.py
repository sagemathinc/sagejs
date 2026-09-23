"""PARI 2.17.4 class-group Smith transforms through `M1` and `M2`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The Smith loop follows `hnf_snf.c:ZM_snfall_i` on a positive square HNF.
The surrounding matrix schedule follows `buch2.c:class_group_gen`.  PARI's
general modular `ZM_inv` is replaced only at the proved-unimodular boundary
by checked fraction-free Gauss--Jordan elimination.  Inverse results are
unique; this changes the arithmetic backend, not the published matrices.

Matrices are column-major.  Every owner is caller-provided and reusable.
`M1` has only `state[1]` logical columns; its remaining capacity is left
untouched.  `M2` is square.  This module does not construct ideal generators
or claim that its input HNF is a complete class-group presentation.
"""

from math import gcd

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .hnf_bezout import pari_hnf_bezout
from .hnf_divrem import pari_hnf_divrem
from .regulator_hnf import pari_regulator_hnf_lincomb


@native
def pari_unimodular_inverse(
    source: IntegerBuffer,
    dimension: int,
    inverse: IntegerBuffer,
    augmented: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Invert a proved-unimodular square matrix with checked exact divisions.

    `state` is status, row swaps, eliminated rows, exact divisions, and
    determinant.  Shape errors precede writes.  A singular, non-unimodular,
    or inexact Bareiss state returns `-1` without publishing `inverse`;
    scratch and counters may have changed.
    """
    n = dimension
    if n < 0:
        raise ValueError("negative inverse dimension")
    size = n * n
    if (
        len(source) < size
        or len(inverse) < size
        or len(augmented) < 2 * size
        or len(state) < 5
    ):
        raise ValueError("short unimodular inverse owner")
    for i in range(5):
        state[i] = 0
    state[0] = -1
    for column in range(n):
        for row in range(n):
            augmented[column * n + row] = source[column * n + row]
            augmented[(n + column) * n + row] = 0
            if row == column:
                augmented[(n + column) * n + row] = 1
    previous_pivot = 1
    for column in range(n):
        pivot_row = column
        while pivot_row < n and augmented[column * n + pivot_row] == 0:
            pivot_row += 1
        if pivot_row == n:
            return -1
        if pivot_row != column:
            for work_column in range(2 * n):
                first = work_column * n + column
                second = work_column * n + pivot_row
                saved = augmented[first]
                augmented[first] = augmented[second]
                augmented[second] = saved
            state[1] += 1
        pivot = augmented[column * n + column]
        for row in range(n):
            if row == column:
                continue
            factor = augmented[column * n + row]
            for work_column in range(2 * n):
                if work_column == column:
                    continue
                numerator = (
                    pivot * augmented[work_column * n + row]
                    - factor * augmented[work_column * n + column]
                )
                if numerator % previous_pivot != 0:
                    return -1
                augmented[work_column * n + row] = numerator // previous_pivot
                state[3] += 1
            augmented[column * n + row] = 0
            state[2] += 1
        previous_pivot = pivot
    determinant = 1
    if n > 0:
        determinant = augmented[0]
        for i in range(n):
            if augmented[i * n + i] != determinant:
                return -1
    if determinant != 1 and determinant != -1:
        return -1
    for column in range(n):
        for row in range(n):
            inverse[column * n + row] = augmented[(n + column) * n + row] // determinant
    state[4] = determinant
    state[0] = 0
    return 0


@native
def pari_class_group_smith_transform(
    original: IntegerBuffer,
    dimension: int,
    smith: IntegerBuffer,
    left: IntegerBuffer,
    left_inverse: IntegerBuffer,
    right: IntegerBuffer,
    ur: IntegerBuffer,
    y: IntegerBuffer,
    uir: IntegerBuffer,
    x: IntegerBuffer,
    m1: IntegerBuffer,
    m2: IntegerBuffer,
    invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    column: IntegerBuffer,
    product: IntegerBuffer,
    augmented: IntegerBuffer,
    left_inverse_state: Int64Buffer,
    right_inverse_state: Int64Buffer,
    first_division_state: Int64Buffer,
    second_division_state: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Compute `D,U,Ui,V,Ur,Y,Uir,X,M1,M2` for a square HNF.

    The exact identities are `U*original*V=D`, `Ui=U^-1`,
    `Ur=U+D*Y`, and `Uir=Ui+original*X`.  `state` is status,
    non-unit invariant count, column steps, row steps, divisibility repairs,
    modular reductions, and exact product cells.  All owners must be disjoint.
    """
    n = dimension
    if n < 0:
        raise ValueError("negative Smith dimension")
    size = n * n
    if (
        len(original) < size
        or len(smith) < size
        or len(left) < size
        or len(left_inverse) < size
        or len(right) < size
        or len(ur) < size
        or len(y) < size
        or len(uir) < size
        or len(x) < size
        or len(m1) < size
        or len(m2) < size
        or len(product) < size
        or len(invariants) < n
        or len(class_number) < 1
        or len(column) < n
        or len(augmented) < 2 * size
        or len(left_inverse_state) < 5
        or len(right_inverse_state) < 5
        or len(first_division_state) < 6
        or len(second_division_state) < 6
        or len(state) < 7
    ):
        raise ValueError("short class-group transform owner")
    for i in range(n):
        diagonal = original[i * n + i]
        if diagonal <= 0:
            state[0] = -1
            return -1
        for j in range(i):
            if original[j * n + i] != 0:
                state[0] = -1
                return -1
        for j in range(i + 1, n):
            value = original[j * n + i]
            if value < 0 or value >= diagonal:
                state[0] = -1
                return -1
    for i in range(7):
        state[i] = 0
    state[0] = -1
    for i in range(size):
        smith[i] = original[i]
        left[i] = 0
    for i in range(n):
        left[i * n + i] = 1
    determinant = 1
    if n > 0:
        determinant = original[0]
        for i in range(1, n):
            determinant *= original[i * n + i]
    determinant_words = (determinant.bit_length() + 63) // 64

    # ``left`` is PARI's internal transposed U until the loop finishes.
    for i in range(n - 1, 0, -1):
        while True:
            changed = False
            for j in range(i - 1, -1, -1):
                b = smith[j * n + i]
                if b == 0:
                    continue
                a = smith[i * n + i]
                state[2] += 1
                if a == 0:
                    for k in range(n):
                        saved = smith[j * n + k]
                        smith[j * n + k] = smith[i * n + k]
                        smith[i * n + k] = saved
                else:
                    d, u, v = pari_hnf_bezout(b, a)
                    if u == 0:
                        q = -(b // a)
                        for k in range(n - 1, -1, -1):
                            smith[j * n + k] += smith[i * n + k] * q
                    elif v == 0:
                        q = -(a // b)
                        for k in range(n - 1, -1, -1):
                            smith[i * n + k] += smith[j * n + k] * q
                        for k in range(n):
                            saved = smith[j * n + k]
                            smith[j * n + k] = smith[i * n + k]
                            smith[i * n + k] = saved
                    else:
                        if d != 1 and d != -1:
                            b, a = b // d, a // d
                        b = -b
                        for k in range(n):
                            column[k] = smith[i * n + k]
                        for k in range(n):
                            smith[i * n + k] = pari_regulator_hnf_lincomb(
                                u, v, smith[j * n + k], column[k]
                            )
                        for k in range(n):
                            smith[j * n + k] = pari_regulator_hnf_lincomb(
                                b, a, column[k], smith[j * n + k]
                            )
            for j in range(i - 1, -1, -1):
                b = smith[i * n + j]
                if b == 0:
                    continue
                a = smith[i * n + i]
                if abs(a) == abs(b):
                    d = abs(a)
                    u = 1
                    if a < 0:
                        u = -1
                    v = 0
                    if a == b:
                        a, b = 1, 1
                    else:
                        a, b = u, -u
                else:
                    d, u, v = pari_hnf_bezout(a, b)
                    a, b = a // d, b // d
                for k in range(i):
                    old_i = smith[k * n + i]
                    old_j = smith[k * n + j]
                    smith[k * n + j] = a * old_j - b * old_i
                    smith[k * n + i] = u * old_i + v * old_j
                smith[i * n + j] = 0
                smith[i * n + i] = d
                # Source ``update`` on the internal columns of transposed U.
                for k in range(n):
                    old_i = left[i * n + k]
                    old_j = left[j * n + k]
                    left[i * n + k] = u * old_i + v * old_j
                    left[j * n + k] = -b * old_i + a * old_j
                state[3] += 1
                changed = True
            if not changed:
                bad_row = -1
                b = smith[i * n + i]
                if b != 1 and b != -1:
                    for k in range(i):
                        for j in range(i):
                            if smith[j * n + k] % b != 0:
                                bad_row = k
                                break
                        if bad_row >= 0:
                            break
                if bad_row < 0:
                    break
                for j in range(i + 1):
                    smith[j * n + i] += smith[j * n + bad_row]
                for k in range(n):
                    left[i * n + k] += left[bad_row * n + k]
                state[4] += 1
            for row in range(i + 1):
                for work_column in range(i + 1):
                    at = work_column * n + row
                    value = smith[at]
                    if (abs(value).bit_length() + 63) // 64 > determinant_words:
                        reduced = abs(value) % determinant
                        if value < 0:
                            reduced = -reduced
                        smith[at] = reduced
                        state[5] += 1
    remaining = determinant
    for k in range(n - 1, -1, -1):
        d = gcd(smith[k * n + k], remaining)
        smith[k * n + k] = d
        if d != 1 and d != -1:
            remaining //= d

    # PARI stored U transposed during reduction.
    for row in range(n):
        for work_column in range(row + 1, n):
            first = work_column * n + row
            second = row * n + work_column
            saved = left[first]
            left[first] = left[second]
            left[second] = saved
    if (
        pari_unimodular_inverse(left, n, left_inverse, augmented, left_inverse_state)
        != 0
    ):
        return -1

    # Reconstruct V as PARI does because ZM_redpart is not a tracked column op:
    # bridge = D^-1 * U * original, V = bridge^-1.
    for output_column in range(n):
        for row in range(n):
            value = left[row] * original[output_column * n]
            for k in range(1, n):
                value += left[k * n + row] * original[output_column * n + k]
            diagonal = smith[row * n + row]
            if value % diagonal != 0:
                return -1
            product[output_column * n + row] = value // diagonal
            state[6] += 1
    if pari_unimodular_inverse(product, n, right, augmented, right_inverse_state) != 0:
        return -1

    if pari_hnf_divrem(left, smith, n, n, ur, y, first_division_state) != 0:
        return -1
    if (
        pari_hnf_divrem(left_inverse, original, n, n, uir, x, second_division_state)
        != 0
    ):
        return -1

    # M2 is computed before PARI truncates V and D.
    for output_column in range(n):
        for row in range(n):
            value = x[row] * ur[output_column * n]
            other = right[row] * y[output_column * n]
            for k in range(1, n):
                value += x[k * n + row] * ur[output_column * n + k]
                other += right[k * n + row] * y[output_column * n + k]
            m2[output_column * n + row] = value + other
            state[6] += 2

    count = 0
    class_value = 1
    for j in range(n):
        d = smith[j * n + j]
        if d == 1 or d == -1:
            break
        invariants[count] = d
        class_value *= d
        count += 1
    # M1 = V + X*D after V,D are shortened to the non-unit columns.
    for output_column in range(count):
        d = smith[output_column * n + output_column]
        for row in range(n):
            m1[output_column * n + row] = (
                right[output_column * n + row] + x[output_column * n + row] * d
            )
    class_number[0] = class_value
    state[1] = count
    state[0] = 0
    return 0
