"""Portable exact Hecke action on character-valued Manin symbols.

The quotient presentation and coefficient field belong to the caller. Only
transport of the chosen generators is needed here: accumulate the Heilbronn
images before applying the exact reduction matrix once. The native bulk
adapter is an optional accelerator, not a prerequisite for this algorithm.

See SageMath's `ManinSymbolList_character.apply` and the corresponding native
Sage.js implementation in `packages/flint/src/p1.c` for the same convention.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime
from sagejs.kernels.p1 import p1_monomial_matrix_coefficient


def character_hecke_matrix(
    projective_line: Any,
    weight: int,
    character: Any,
    base_ring: Any,
    prime: int,
    presentation: Any,
) -> Any:
    r"""Compute $T_p$ (including $U_p$ for $p\mid N$) in quotient coordinates.

    Rows act on the right. For $g=(i,u,v)$ and a Heilbronn matrix
    $h=(a,b;c,d)$, expand $(aX+bY)^i(cX+dY)^{k-2-i}$ and normalize
    $(ua+vc,ub+vd)=s(u',v')$ modulo $N$. Multiply by $\chi(s)$, then
    reduce the resulting generators. Nonprimitive images contribute zero.

    Polynomial coefficients and character values are cached before quotient
    reduction. Compacting the used generator columns avoids a dense square
    matrix on the unreduced presentation. All arithmetic remains exact.
    """
    matrix = runtime.reflect.get(runtime.global_object, "matrix")
    dimension = presentation.dimension()
    if dimension == 0:
        return matrix(base_ring, 0, 0, [])
    level = projective_line.N()
    pairs = projective_line.list()
    coset_count = len(pairs)
    count, packed = projective_line._native_kernel_heilbronn(prime)
    generators = presentation.basis_generators()
    source_degrees = sorted({g // coset_count for g in generators})
    actions = {}
    for degree in source_degrees:
        blocks = []
        for h in range(count):
            a, b, c, d = [packed[4 * h + j] for j in range(4)]
            terms = []
            for target in range(weight - 1):
                coefficient = p1_monomial_matrix_coefficient(
                    degree, weight - 2, target, a, b, c, d
                )
                if coefficient:
                    terms.append((target * coset_count, coefficient))
            blocks.append(terms)
        actions[degree] = blocks

    zero = base_ring(0)
    character_values = {}
    transports = {}
    rows = []
    used = set()
    for generator in generators:
        degree, coset = divmod(generator, coset_count)
        if coset not in transports:
            u, v = pairs[coset]
            images = []
            for h in range(count):
                a, b, c, d = [packed[4 * h + j] for j in range(4)]
                image_u, image_v, scalar = projective_line.normalize_with_scalar(
                    (u * a + v * c) % level, (u * b + v * d) % level
                )
                if scalar == 0:
                    images.append((-1, zero))
                    continue
                target_coset = projective_line.index(image_u, image_v)
                if target_coset < 0 or target_coset >= coset_count:
                    raise ArithmeticError("normalized Hecke image is absent from P1")
                if scalar not in character_values:
                    value = character(scalar)
                    # Dirichlet values are cyclotomic objects even for a
                    # quadratic character whose coefficient field is QQ.
                    if value == 1:
                        value = 1
                    elif value == -1:
                        value = -1
                    elif value == 0:
                        value = 0
                    character_values[scalar] = base_ring(value)
                images.append((target_coset, character_values[scalar]))
            transports[coset] = images
        row = {}
        for h, (target_coset, value) in enumerate(transports[coset]):
            if value == zero:
                continue
            for offset, coefficient in actions[degree][h]:
                target = offset + target_coset
                row[target] = row.get(target, zero) + coefficient * value
        rows.append(row)
        used.update(target for target, value in row.items() if value != zero)

    columns = sorted(used)
    if not columns:
        return matrix(base_ring, dimension, dimension, [zero] * dimension**2)
    transport = matrix(
        base_ring,
        dimension,
        len(columns),
        [row.get(column, zero) for row in rows for column in columns],
    )
    reduction = presentation.reduction_matrix().matrix_from_rows(columns)
    return transport * reduction
