"""Prepared embedding norm blocks translated from PARI 2.17.4 `base1.c`.

Copyright (C) The PARI group. SPDX-License-Identifier: GPL-2.0-or-later.
GPL v2 or later; without warranty. See repository LICENSE.

These are the nonempty real-only and mixed branches of `embed_norm`, not
matrix multiplication or `factorgen`. The outer caller selects by signature.
Complex values use parallel real/imaginary arrays, with uniform precision.
Tail counts exclude the first entry so no extra multiply-by-one is inserted.
"""

from __future__ import annotations

from sagejs.native import RealNumberBuffer, native, uint64


@native
def pari_real_embedding_norm(
    field: RealField, real_values: RealNumberBuffer, real_tail: uint64
) -> RealNumber:
    value = real_values[0]
    for i in range(1, real_tail + 1):
        value *= real_values[i]
    return value


@native
def pari_mixed_embedding_norm(
    field: RealField,
    real_values: RealNumberBuffer,
    complex_real: RealNumberBuffer,
    complex_imag: RealNumberBuffer,
    real_tail: uint64,
    complex_tail: uint64,
) -> RealNumber:
    real_product = real_values[0]
    for i in range(1, real_tail + 1):
        real_product *= real_values[i]
    complex_product = (
        complex_real[0] * complex_real[0] + complex_imag[0] * complex_imag[0]
    )
    for j in range(1, complex_tail + 1):
        squared = complex_real[j] * complex_real[j] + complex_imag[j] * complex_imag[j]
        complex_product *= squared
    return real_product * complex_product
