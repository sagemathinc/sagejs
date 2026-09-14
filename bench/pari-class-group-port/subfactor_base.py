"""PARI 2.17.4 subFBgen selection and its stable index mergesort.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared active-ideal norms and bad_subFB flags replace borrowed GEN fields.
Automorphism permutations and retained subFB history remain separate work.
"""

from sagejs.native import IntegerBuffer, Float64Buffer, native, checked_float64


@native
def pari_store_three(buffer: IntegerBuffer, start: int, a: int, b: int, c: int) -> int:
    """IntegerBuffer currently lacks the native-vector fixed-slice lowering."""
    buffer[start] = a
    buffer[start + 1] = b
    buffer[start + 2] = c
    return 0


@native
def pari_norm_indexsort(
    norms: IntegerBuffer,
    order: IntegerBuffer,
    scratch: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Preserve gen_sortspec's split, small cases and left-first tie rule.

    Use explicit three-slot DFS frames in place of recursive allocations.
    Array indices are zero-based, unlike the resulting one-based permutation.
    """
    size = len(norms)
    if len(order) < size or len(scratch) < size or len(stack) < 3:
        raise ValueError("insufficient indexsort workspace")
    for i in range(size):
        order[i] = i + 1
    if size == 0:
        return 0
    pari_store_three(stack, 0, 0, size, 0)
    top = 0
    while top >= 0:
        low = stack[top]
        high = stack[top + 1]
        count = high - low
        if count <= 3:
            if count == 2:
                if norms[low] > norms[low + 1]:
                    order[low] = low + 2
                    order[low + 1] = low + 1
            elif count == 3:
                if norms[low] <= norms[low + 1]:
                    if norms[low + 1] > norms[low + 2]:
                        if norms[low] <= norms[low + 2]:
                            pari_store_three(order, low, low + 1, low + 3, low + 2)
                        else:
                            pari_store_three(order, low, low + 3, low + 1, low + 2)
                else:
                    if norms[low] <= norms[low + 2]:
                        pari_store_three(order, low, low + 2, low + 1, low + 3)
                    elif norms[low + 1] <= norms[low + 2]:
                        pari_store_three(order, low, low + 2, low + 3, low + 1)
                    else:
                        pari_store_three(order, low, low + 3, low + 2, low + 1)
            top -= 3
        else:
            middle = low + count // 2
            state = stack[top + 2]
            if state < 2:
                if top + 6 > len(stack):
                    raise ValueError("indexsort stack exhausted")
                stack[top + 2] = state + 1
                if state == 0:
                    pari_store_three(stack, top + 3, low, middle, 0)
                else:
                    pari_store_three(stack, top + 3, middle, high, 0)
                top += 3
            else:
                left = low
                right = middle
                target = low
                while left < middle and right < high:
                    if norms[order[left] - 1] <= norms[order[right] - 1]:
                        scratch[target] = order[left]
                        left += 1
                    else:
                        scratch[target] = order[right]
                        right += 1
                    target += 1
                while left < middle:
                    scratch[target] = order[left]
                    left += 1
                    target += 1
                while right < high:
                    scratch[target] = order[right]
                    right += 1
                    target += 1
                for copied in range(low, high):
                    order[copied] = scratch[copied]
                top -= 3
    return size


@native
def pari_prepared_subfactor_base(
    norms: IntegerBuffer,
    bad: IntegerBuffer,
    configuration: Float64Buffer,
    minimum: int,
    order: IntegerBuffer,
    scratch: IntegerBuffer,
    stack: IntegerBuffer,
    chosen: IntegerBuffer,
    rejected: IntegerBuffer,
    permutation: IntegerBuffer,
) -> tuple[int, int, int]:
    """Select subFB and perm, returning size and dependency trial limits.

    Norms must be positive signed-machine integers as required by itos.
    Binary64 rounding is intentional, not checked exact conversion of norms.
    This first boundary restricts norms to exactly convertible values instead.
    """
    size = len(norms)
    if len(bad) != size or len(configuration) < 1:
        raise ValueError("invalid subfactor inputs")
    if (
        minimum < 0
        or len(chosen) < size
        or len(rejected) < size
        or len(permutation) < size
    ):
        raise ValueError("insufficient subfactor workspace")
    pari_norm_indexsort(norms, order, scratch, stack)
    yes = 0
    no = 0
    product = 1.0
    i = 0
    while i < size:
        t = order[i]
        if bad[t - 1] != 0:
            rejected[no] = t
            no += 1
        else:
            chosen[yes] = t
            yes += 1
            if norms[t - 1] <= 0 or norms[t - 1] > 9007199254740992:
                raise ValueError("ideal norm outside exact binary64 boundary")
            product *= checked_float64(norms[t - 1])
            if yes + 1 > minimum and product > configuration[0]:
                break
        i += 1
    for j in range(yes):
        permutation[j] = chosen[j]
    for j in range(no):
        permutation[yes + j] = rejected[j]
    for j in range(yes + no, size):
        permutation[j] = order[j]
    return yes, yes * 16, (yes * 16) // 10
