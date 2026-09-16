"""PARI 2.17.4 `FpM_FpC_invimage`, rows<=4 and columns<=7.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Sources alglin1.c, F2v.c:F2m_F2c_invimage and Flv.c:Flm_Flc_invimage.
The augmented kernel uses F2 for p=2 and direct Flm for every odd prime,
including p=3 (not FpM_ker's ternary dispatcher). Select the last kernel
column, test its final entry, then apply the source inverse scaling.
The columns limit keeps augmented matrices within the eight-column
kernel corridor; larger inverse images are an explicit dependency frontier.
"""

from sagejs.native import IntegerBuffer, native
from .small_prime_matrix_kernel import pari_small_prime_matrix_kernel
from .small_prime_matrix_intersection import pari_small_flm_kernel
from .relation_cache import pari_word_mod_inverse


@native
def pari_small_prime_matrix_invimage_workspace_size(rows: int, columns: int) -> int:
    """Augmented matrix, full kernel output capacity, and kernel scratch."""
    if rows < 0 or rows > 4 or columns < 0 or columns > 7:
        raise ValueError("small prime inverse image dimension frontier")
    c = columns + 1
    return 2 * rows * c + c * c + rows + c


@native
def pari_small_prime_matrix_invimage(
    w: IntegerBuffer,
    a: int,
    rows: int,
    columns: int,
    p: int,
    rhs: int,
    out: int,
    scratch: int,
) -> int:
    """Return0 for a source-selected solution, -1 for no solution.

    Primehood and pairwise disjoint input/rhs/output/scratch spans are caller
    preconditions. Inputs may be signed and are reduced in private storage.
    No solution leaves output unchanged; scratch may contain partial work.
    All structural errors precede writes. Output tails remain unchanged.
    """
    required = pari_small_prime_matrix_invimage_workspace_size(rows, columns)
    if p < 2 or p > 3037000493:
        raise ValueError("small prime inverse image modulus frontier")
    if a < 0 or rhs < 0 or out < 0 or scratch < 0:
        raise ValueError("negative inverse image offset")
    if (
        a + rows * columns > len(w)
        or rhs + rows > len(w)
        or out + columns > len(w)
        or scratch + required > len(w)
    ):
        raise ValueError("short inverse image storage")
    if columns == 0:
        return -1
    c = columns + 1
    augmented = scratch
    basis = augmented + rows * c
    kernel_scratch = basis + c * c
    for i in range(rows * columns):
        w[augmented + i] = w[a + i] % p
    for i in range(rows):
        w[augmented + rows * columns + i] = w[rhs + i] % p
    if p == 2:
        count = pari_small_prime_matrix_kernel(
            w, augmented, rows, c, p, basis, kernel_scratch
        )
    else:
        count = pari_small_flm_kernel(
            w, augmented, rows, c, p, basis, kernel_scratch, kernel_scratch + rows
        )
    if count == 0:
        return -1
    last = basis + (count - 1) * c
    t = w[last + columns]
    if t == 0:
        return -1
    if p == 2:
        for i in range(columns):
            w[out + i] = w[last + i]
        return 0
    t = pari_word_mod_inverse(p - t, p)
    if t != 1:
        for i in range(columns):
            w[out + i] = w[last + i] * t % p
    else:
        for i in range(columns):
            w[out + i] = w[last + i]
    return 0
