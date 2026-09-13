"""Experimental PARI 2.17.4 small-relation enumeration, not a class-group engine.

Translated from `src/basemath/buch2.c`, `step` and the enumeration block of
`Fincke_Pohst_ideal`. Copyright (C) 2000 The PARI group.
SPDX-License-Identifier: GPL-2.0-or-later

This translation is free software under GNU GPL version 2 or, at your option,
any later version; distributed without any warranty, including MERCHANTABILITY
or FITNESS FOR A PARTICULAR PURPOSE. See the repository LICENSE file and
https://www.gnu.org/licenses/old-licenses/gpl-2.0.html.

One-based indexing deliberately follows upstream. The caller supplies upstream
QR coefficients and bound. Returning a candidate is an explicit scaffolding
boundary: ideal multiplication, norm rounding, smoothness and relation admission
are NOT implemented here. This helper cannot establish whole-engine parity.
"""

from __future__ import annotations

from sagejs.native import Float64Buffer, Int64Buffer, native, uint64


@native
def pari_fp_step(x: Int64Buffer, y: Float64Buffer, inc: Int64Buffer, k: uint64) -> int:
    """Advance one coordinate in exactly PARI's alternating order."""
    if y[k] == 0.0:
        x[k] += 1
    else:
        i = inc[k]
        x[k] += i
        if i > 0:
            inc[k] = -1 - i
        else:
            inc[k] = 1 - i
    return 0


@native
def pari_fp_next(
    q: Float64Buffer,
    v: Float64Buffer,
    x: Int64Buffer,
    y: Float64Buffer,
    z: Float64Buffer,
    inc: Int64Buffer,
    state: Int64Buffer,
    degree: uint64,
    bound: float,
    skipfirst: uint64,
) -> int:
    """Yield the next complete lattice vector; zero means upstream exhaustion.

    `q` is row-major with stride `degree + 1`; all vectors have that length.
    `state` has four entries: k, try_elt, initialized, exhausted. Initially all
    zero. Each invocation resumes at the upstream outer-loop increment after
    the previously returned candidate. The fixed million-trial limit is PARI's
    `4 * maxtry_FACT * maxtry_FACT`, not a new search bound.

    Buffers must be distinct. The caller validates finite QR data, positive
    diagonals and representable coordinates; this is a private prepared-state
    interface. Primitive/scalar rejection remains the caller's responsibility.
    """
    if degree < 2 or len(state) < 4:
        raise ValueError("invalid PARI enumeration state")
    if state[3] != 0:
        return 0
    stride = degree + 1
    if len(q) < stride * stride or len(v) < stride or len(x) < stride:
        raise ValueError("short PARI enumeration input")
    if len(y) < stride or len(z) < stride or len(inc) < stride:
        raise ValueError("short PARI enumeration workspace")
    k = int(degree)
    if state[2] == 0:
        for j in range(1, stride):
            inc[j] = 1
        y[degree] = 0.0
        z[degree] = 0.0
        x[degree] = 0
        state[2] = 1
    else:
        k = state[0]
        pari_fp_step(x, y, inc, k)
    while True:
        fl = 0
        if k > 1:
            l = k - 1
            z[l] = 0.0
            for j in range(k, stride):
                z[l] += q[l * stride + j] * float(x[j])
            p = float(x[k]) + z[k]
            y[l] = y[k] + p * p * v[k]
            if l <= skipfirst and y[1] == 0.0:
                fl = 1
            nearest = -z[l] + 0.5
            rounded = int(nearest)
            if float(rounded) > nearest:
                rounded -= 1
            x[l] = rounded
            k = l
        while True:
            if fl == 0:
                state[1] += 1
                if state[1] > 1000000:
                    state[0] = k
                    state[3] = 1
                    return 0
                p = float(x[k]) + z[k]
                if y[k] + p * p * v[k] <= bound:
                    break
                pari_fp_step(x, y, inc, k)
                p = float(x[k]) + z[k]
                if y[k] + p * p * v[k] <= bound:
                    break
            fl = 0
            inc[k] = 1
            k += 1
            if k > degree:
                state[0] = k
                state[3] = 1
                return 0
            pari_fp_step(x, y, inc, k)
        if k == 1:
            state[0] = k
            return 1
