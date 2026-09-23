"""PARI 2.17.4 Flv.c Flm_lsolve_upper_pre, row-major borrowed views.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source recursive split and n=1/2 leaves are preserved by an explicit stack.
PARI word modular products/dot products become exact Integer arithmetic and
reduction, an explicit arithmetic-leaf representation substitution. The
classical matrix-product loop retains column/row/inner order; the alternate
Strassen-Winograd dispatch is a reported frontier, never silently replaced.
There is no equal-word-cost or qualified timing claim.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .relation_cache import pari_word_mod_inverse


@native
def pari_flm_lsolve_upper(
    upper: IntegerBuffer,
    upper_base: int,
    upper_stride: int,
    rhs: IntegerBuffer,
    rhs_base: int,
    rhs_stride: int,
    n: int,
    m: int,
    prime: int,
    output: IntegerBuffer,
    output_base: int,
    output_stride: int,
    scratch: IntegerBuffer,
    scratch_base: int,
    frames: IntegerBuffer,
    frames_base: int,
    state: Int64Buffer,
) -> int:
    """Solve X U = B; state[0]=0 success, -1 before unsupported product.

    U's upper triangle is n-square; B/X have m rows and n columns. Read
    entries are reduced residues; positive prime <2^63 is a caller invariant.
    Packed CUP garbage below U's diagonal is ignored, as in the source.
    Scratch uses m*n entries; frames use 3*(n.bit_length()+1) entries.
    State: status, entered frames, size1 leaves, size2 leaves, block updates,
    inversions, maximum stack depth, arithmetic-leaf substitution marker1.

    Same backing owner with disjoint regions is supported. B and X may
    exactly alias; all other overlapping views are prohibited by the caller.
    Shape/residue/triangular validation precedes writes. Strassen frontiers
    change state only; resource/inversion exceptions may leave partial work.
    Outside-view entries and input-only views are preserved.
    """
    if n < 0 or m < 0 or prime < 2 or prime >= 1 << 63:
        raise ValueError("invalid modular triangular solve dimensions/modulus")
    if (
        upper_base < 0
        or rhs_base < 0
        or output_base < 0
        or scratch_base < 0
        or frames_base < 0
        or upper_stride < n
        or rhs_stride < n
        or output_stride < n
    ):
        raise ValueError("invalid modular triangular solve view")
    upper_end = upper_base
    rhs_end = rhs_base
    output_end = output_base
    if n > 0:
        upper_end += (n - 1) * upper_stride + n
        if m > 0:
            rhs_end += (m - 1) * rhs_stride + n
            output_end += (m - 1) * output_stride + n
    if (
        len(upper) < upper_end
        or len(rhs) < rhs_end
        or len(output) < output_end
        or len(scratch) < scratch_base + m * n
        or len(frames) < frames_base + 3 * (n.bit_length() + 1)
        or len(state) < 8
    ):
        raise ValueError("short modular triangular solve owner")
    for j in range(n):
        for i in range(j + 1):
            value = upper[upper_base + i * upper_stride + j]
            if value < 0 or value >= prime:
                raise ValueError("upper entry is not a reduced residue")
            if i == j and value == 0:
                raise ValueError("zero modular triangular diagonal")
        for i in range(m):
            value = rhs[rhs_base + i * rhs_stride + j]
            if value < 0 or value >= prime:
                raise ValueError("right hand side is not a reduced residue")
    for i in range(8):
        state[i] = 0
    state[0] = -1
    state[7] = 1
    bound = 140
    if prime >= 1 << 30:
        bound = 40
    left = (n + 1) // 2
    if m >= bound and left >= bound and n - left >= bound:
        return -1
    for j in range(n):
        for i in range(m):
            output[output_base + i * output_stride + j] = rhs[
                rhs_base + i * rhs_stride + j
            ]
    frames[frames_base] = 0
    frames[frames_base + 1] = n
    frames[frames_base + 2] = 0
    depth = 1
    state[6] = 1
    while depth > 0:
        frame = frames_base + 3 * (depth - 1)
        start = frames[frame]
        width = frames[frame + 1]
        phase = frames[frame + 2]
        if phase == 0:
            state[1] += 1
            if width == 0:
                depth -= 1
                continue
            if width == 1:
                inverse = pari_word_mod_inverse(
                    upper[upper_base + start * upper_stride + start], prime
                )
                state[2] += 1
                state[5] += 1
                for i in range(m):
                    at = output_base + i * output_stride + start
                    output[at] = output[at] * inverse % prime
                depth -= 1
                continue
            if width == 2:
                a = upper[upper_base + start * upper_stride + start]
                b = upper[upper_base + start * upper_stride + start + 1]
                d = upper[upper_base + (start + 1) * upper_stride + start + 1]
                determinant = a * d % prime
                inverse = pari_word_mod_inverse(determinant, prime)
                ainv = d * inverse % prime
                dinv = a * inverse % prime
                state[3] += 1
                state[5] += 1
                for i in range(m):
                    at = output_base + i * output_stride + start
                    output[at] = output[at] * ainv % prime
                for i in range(m):
                    scratch[scratch_base + i] = (
                        output[output_base + i * output_stride + start] * b % prime
                    )
                for i in range(m):
                    scratch[scratch_base + i] = (
                        output[output_base + i * output_stride + start + 1]
                        - scratch[scratch_base + i]
                    ) % prime
                for i in range(m):
                    output[output_base + i * output_stride + start + 1] = (
                        scratch[scratch_base + i] * dinv % prime
                    )
                depth -= 1
                continue
            left = (width + 1) // 2
            frames[frame + 2] = 1
            frame += 3
            frames[frame] = start
            frames[frame + 1] = left
            frames[frame + 2] = 0
            depth += 1
            if depth > state[6]:
                state[6] = depth
            continue
        if phase == 1:
            left = (width + 1) // 2
            right = width - left
            # Flm_mul_classical(X1,U12) completes before Flm_sub(B2,...).
            for j in range(right):
                for i in range(m):
                    total = (
                        output[output_base + i * output_stride + start]
                        * upper[upper_base + start * upper_stride + start + left + j]
                    )
                    for k in range(1, left):
                        total += (
                            output[output_base + i * output_stride + start + k]
                            * upper[
                                upper_base
                                + (start + k) * upper_stride
                                + start
                                + left
                                + j
                            ]
                        )
                    scratch[scratch_base + i * right + j] = total % prime
            for j in range(right):
                for i in range(m):
                    at = output_base + i * output_stride + start + left + j
                    output[at] = (
                        output[at] - scratch[scratch_base + i * right + j]
                    ) % prime
            state[4] += 1
            frames[frame + 2] = 2
            frame += 3
            frames[frame] = start + left
            frames[frame + 1] = right
            frames[frame + 2] = 0
            depth += 1
            if depth > state[6]:
                state[6] = depth
            continue
        depth -= 1
    state[0] = 0
    return 0
