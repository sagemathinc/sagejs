"""Sparse signed-word prefix of PARI 2.17.4 `hnf_snf.c:hnfspec_i`.

Copyright (C) 2000 The PARI group. GPL-2.0-or-later, without warranty.

Stop at the END2 label, BEFORE multiprecision cleanup. This is not HNF and
does not compute class-group invariants. Subsequent matb cleanup, dense-row
updates, rank-profile extraction, hnffinal and deferred columns remain absent.
The supplied C matrix is used only through its row count at this boundary.

Matrices are column-major without PARI headers; perm contains one-based row
IDs. Mat/dense/T keep all retained columns, including the eliminated columns.
Dense snapshots precede all column operations. Only the initial live vmax
prefix is defined, as in C. Buffers must not alias. `T` is exact IntegerBuffer
storage; words and indices use Int64Buffer, pinning the upstream 64-bit model.
Scalar dimensions, loop indices and arithmetic retain Python `int` semantics:
native lowering uses exact GMP integers, including index-expression overhead.
Word buffer storage alone does not make this an unboxed word implementation.
The quadratic permutation validation is added prototype boundary overhead,
not work performed by upstream; a future context owner could validate once.

State: co (including header), lig, col, lk0, has_T, source_overflow_stop, n, s,
zero-row moves, unit-row moves, +/-1 eliminations, general eliminations,
initial_vmax_count. A zero return is ordinary prefix completion; one is the
upstream HIGHBIT guard's jump to END2. Neither return completes HNF.

LONG_MIN and actual signed-word overflows are outside the defined source
domain: reject explicitly rather than wrapping or claiming an upstream result.
Arithmetic rejection can follow partial output mutation; malformed dimensions,
buffer lengths and permutations are instead rejected before output mutation.
In particular the INITIAL vmax scan deliberately uses physical matj[i], not
matj[perm[i]]. Do not correct that indexing when porting this source prefix.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, checked_float64, native


@native
def pari_hnfspec_count(
    mat: Int64Buffer, rows: int, row: int, length: int, found: Int64Buffer
) -> int:
    """Return count or -1, updating the last encountered unit index in found."""
    if row < 1 or row > rows or length < 0 or len(mat) < rows * length:
        raise ValueError("invalid sparse count dimensions")
    if len(found) < 1:
        raise ValueError("short sparse count state")
    count = 0
    for j in range(length):
        value = mat[j * rows + row - 1]
        if value <= -9223372036854775808:
            raise ValueError("undefined upstream word absolute value")
        if value != 0:
            if value != 1 and value != -1:
                return -1
            count += 1
            found[0] = j + 1
    return count


@native
def pari_hnfspec_count2(mat: Int64Buffer, rows: int, row: int, length: int) -> int:
    """Return the last +/-1 column, scanning backwards exactly as count2."""
    if row < 1 or row > rows or length < 0 or len(mat) < rows * length:
        raise ValueError("invalid sparse count dimensions")
    j = length
    while j > 0:
        value = mat[(j - 1) * rows + row - 1]
        if value <= -9223372036854775808:
            raise ValueError("undefined upstream word absolute value")
        if value == 1 or value == -1:
            return j
        j -= 1
    return 0


@native
def pari_hnfspec_word(value: int) -> int:
    """A stored sparse word must also admit the source's subsequent labs."""
    if value <= -9223372036854775808 or value >= 9223372036854775808:
        raise ValueError("undefined upstream sparse word overflow")
    return value


@native
def pari_hnfspec_swap_words(mat: Int64Buffer, rows: int, a: int, b: int) -> int:
    for i in range(rows):
        temporary = mat[(a - 1) * rows + i]
        mat[(a - 1) * rows + i] = mat[(b - 1) * rows + i]
        mat[(b - 1) * rows + i] = temporary
    return 0


@native
def pari_hnfspec_swap_exact(mat: IntegerBuffer, rows: int, a: int, b: int) -> int:
    for i in range(rows):
        temporary = mat[(a - 1) * rows + i]
        mat[(a - 1) * rows + i] = mat[(b - 1) * rows + i]
        mat[(b - 1) * rows + i] = temporary
    return 0


@native
def pari_hnfspec_sparse_prefix(
    mat0: Int64Buffer,
    rows: int,
    columns: int,
    perm: Int64Buffer,
    k0: int,
    c_rows: int,
    mat: Int64Buffer,
    dense: IntegerBuffer,
    transform: IntegerBuffer,
    vmax: Int64Buffer,
    found: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Copy the retained columns, then execute all three sparse phases.

    The dense rows are perm-selected at entry, not necessarily the physical
    first k0 rows. The original matrix remains unchanged. T is absent exactly
    when k0==0 and C has no nonempty columns; its unused storage is untouched.
    """
    if rows < 0 or columns < 0 or k0 < 0 or k0 > rows or c_rows < 0:
        raise ValueError("invalid sparse prefix dimensions")
    # Keep li and CO exactly representable at their explicit binary64 ingress.
    # This is a representation boundary, not an alternative allocation policy.
    if rows >= 9007199254740992 or columns >= 9007199254740992:
        raise ValueError("unsupported sparse prefix dimensions")
    if len(mat0) < rows * columns or len(perm) < rows:
        raise ValueError("short sparse prefix input")
    if len(found) < 1 or len(state) < 13:
        raise ValueError("short sparse prefix state")
    li = rows + 1
    co = columns + 1
    if co > 300 and checked_float64(co) > 1.5 * checked_float64(li):
        co = int(1.2 * checked_float64(li))
    retained = co - 1
    has_t = 0
    if k0 != 0 or (retained > 0 and c_rows > 0):
        has_t = 1
    if len(mat) < rows * retained or len(dense) < k0 * retained:
        raise ValueError("short sparse prefix matrix workspace")
    if len(vmax) < retained or (has_t != 0 and len(transform) < retained * retained):
        raise ValueError("short sparse prefix transformation workspace")
    for i in range(rows):
        if perm[i] < 1 or perm[i] > rows:
            raise ValueError("invalid sparse row permutation")
        for j in range(i):
            if perm[i] == perm[j]:
                raise ValueError("invalid sparse row permutation")
    for i in range(rows * retained):
        pari_hnfspec_word(mat0[i])
    for j in range(retained):
        for i in range(rows):
            mat[j * rows + i] = mat0[j * rows + i]
        for i in range(k0):
            dense[j * k0 + i] = mat0[j * rows + perm[i] - 1]
    for i in range(13):
        state[i] = 0
    found[0] = 0
    if has_t != 0:
        for j in range(retained):
            for i in range(retained):
                transform[j * retained + i] = 0
            transform[j * retained + j] = 1
    i = rows
    lig = rows
    col = retained
    lk0 = k0
    n = 0
    while i > lk0 and col != 0:
        count = pari_hnfspec_count(mat, rows, perm[i - 1], col, found)
        n = found[0]
        if count == 0:
            state[8] += 1
            lk0 += 1
            temporary = perm[i - 1]
            perm[i - 1] = perm[lk0 - 1]
            perm[lk0 - 1] = temporary
            i = lig
            continue
        if count == 1:
            state[9] += 1
            temporary = perm[i - 1]
            perm[i - 1] = perm[lig - 1]
            perm[lig - 1] = temporary
            if has_t != 0:
                pari_hnfspec_swap_exact(transform, retained, n, col)
            pari_hnfspec_swap_words(mat, rows, n, col)
            if mat[(col - 1) * rows + perm[lig - 1] - 1] < 0:
                # Phase 1 EXCLUDES the pivot row: preserve its literal -1.
                for i in range(lk0 + 1, lig):
                    at = (col - 1) * rows + perm[i - 1] - 1
                    mat[at] = pari_hnfspec_word(-mat[at])
                if has_t != 0:
                    i = 0
                    while transform[(col - 1) * retained + i] == 0:
                        i += 1
                    at = (col - 1) * retained + i
                    transform[at] = -transform[at]
            lig -= 1
            col -= 1
            i = lig
            continue
        i -= 1
    s = 0
    while lig > lk0 and col != 0 and s < 4611686018427387904:
        i = lig
        while i > lk0:
            count = pari_hnfspec_count(mat, rows, perm[i - 1], col, found)
            n = found[0]
            if count > 0:
                break
            i -= 1
        if i == lk0:
            break
        temporary = perm[i - 1]
        perm[i - 1] = perm[lig - 1]
        perm[lig - 1] = temporary
        pari_hnfspec_swap_words(mat, rows, n, col)
        if has_t != 0:
            pari_hnfspec_swap_exact(transform, retained, n, col)
        if mat[(col - 1) * rows + perm[lig - 1] - 1] < 0:
            for i in range(lk0 + 1, lig + 1):
                at = (col - 1) * rows + perm[i - 1] - 1
                mat[at] = pari_hnfspec_word(-mat[at])
            if has_t != 0:
                for i in range(retained):
                    at = (col - 1) * retained + i
                    transform[at] = -transform[at]
        for j in range(1, col):
            t = mat[(j - 1) * rows + perm[lig - 1] - 1]
            if t == 0:
                continue
            for i in range(lk0 + 1, lig + 1):
                at = (j - 1) * rows + perm[i - 1] - 1
                pivot = mat[(col - 1) * rows + perm[i - 1] - 1]
                if t == 1:
                    value = pari_hnfspec_word(mat[at] - pivot)
                else:
                    value = pari_hnfspec_word(mat[at] + pivot)
                mat[at] = value
                absolute = abs(value)
                if absolute > s:
                    s = absolute
            if has_t != 0:
                for i in range(retained):
                    at = (j - 1) * retained + i
                    transform[at] -= t * transform[(col - 1) * retained + i]
        lig -= 1
        col -= 1
        state[10] += 1
    initial_vmax_count = col
    for j in range(1, col + 1):
        s = 0
        # Deliberately physical rows, exactly upstream's matj[i] scan.
        for i in range(lk0 + 1, lig + 1):
            absolute = abs(mat[(j - 1) * rows + i - 1])
            if absolute > s:
                s = absolute
        vmax[j - 1] = s
    stopped = 0
    while lig > lk0 and col != 0:
        i = lig
        while i > lk0:
            n = pari_hnfspec_count2(mat, rows, perm[i - 1], col)
            if n != 0:
                break
            i -= 1
        if i == lk0:
            break
        temporary = vmax[n - 1]
        vmax[n - 1] = vmax[col - 1]
        vmax[col - 1] = temporary
        temporary = perm[i - 1]
        perm[i - 1] = perm[lig - 1]
        perm[lig - 1] = temporary
        pari_hnfspec_swap_words(mat, rows, n, col)
        if has_t != 0:
            pari_hnfspec_swap_exact(transform, retained, n, col)
        if mat[(col - 1) * rows + perm[lig - 1] - 1] < 0:
            for i in range(lk0 + 1, lig + 1):
                at = (col - 1) * rows + perm[i - 1] - 1
                mat[at] = pari_hnfspec_word(-mat[at])
            if has_t != 0:
                for i in range(retained):
                    at = (col - 1) * retained + i
                    transform[at] = -transform[at]
        for j in range(1, col):
            t = mat[(j - 1) * rows + perm[lig - 1] - 1]
            if t == 0:
                continue
            if (
                vmax[col - 1] != 0
                and abs(t) >= (9223372036854775808 - vmax[j - 1]) // vmax[col - 1]
            ):
                stopped = 1
                break
            s = 0
            for i in range(lk0 + 1, lig + 1):
                at = (j - 1) * rows + perm[i - 1] - 1
                product = t * mat[(col - 1) * rows + perm[i - 1] - 1]
                if product < -9223372036854775808 or product >= 9223372036854775808:
                    raise ValueError("undefined upstream sparse word product overflow")
                value = pari_hnfspec_word(mat[at] - product)
                mat[at] = value
                absolute = abs(value)
                if absolute > s:
                    s = absolute
            vmax[j - 1] = s
            if has_t != 0:
                for i in range(retained):
                    at = (j - 1) * retained + i
                    transform[at] -= t * transform[(col - 1) * retained + i]
        if stopped != 0:
            break
        lig -= 1
        col -= 1
        state[11] += 1
    state[0] = co
    state[1] = lig
    state[2] = col
    state[3] = lk0
    state[4] = has_t
    state[5] = stopped
    state[6] = n
    state[7] = s
    state[12] = initial_vmax_count
    return stopped
