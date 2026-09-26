"""Exact relation-to-HNF witnesses retained from the HNF column transform.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The connected HNF path already computes a square unimodular column transform
`V` with

```
relation * V = [0 | presentation].
```

Matrices are column-major.  If `z = columns - rows`, the final `rows`
columns of `V` are therefore a relation-to-presentation witness.  The final
`rows` rows of `V^-1` are the inverse-direction witness, since
`[0 | presentation] * V^-1 = relation`.  This is retained provenance, not a
new integer solve.

The two compact output owners must be disjoint.  As a convenience for a
caller compacting durable state in place, `relation_to_presentation` may
exactly alias `transform` and `presentation_to_relation` may exactly alias
`transform_inverse`: both slices are copied toward lower addresses only
after every validation that reads the full owners has completed.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .class_group_smith_transform import pari_unimodular_inverse


@native
def pari_relation_hnf_witness(
    relation: IntegerBuffer,
    rows: int,
    columns: int,
    full_hnf: IntegerBuffer,
    transform: IntegerBuffer,
    transform_inverse: IntegerBuffer,
    inverse_augmented: IntegerBuffer,
    inverse_state: Int64Buffer,
    relation_to_presentation: IntegerBuffer,
    presentation_to_relation: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Publish exact bidirectional witnesses from an accepted HNF transform.

    `relation` and `full_hnf` have shape `rows` by `columns`.
    `transform` has shape `columns` by `columns` and must certify
    `relation * transform == full_hnf`.  The first `columns - rows` HNF
    columns must be zero.  The trailing square block is the presentation.

    On success, the compact output shapes are `columns` by `rows` and
    `rows` by `columns`.  `state` records status, rows, columns, zero
    prefix, checked relation-transform cells, checked inverse-product cells,
    and the two published cell counts.  Algebraic rejection returns `-1`;
    malformed capacities raise before any output write.
    """
    m = rows
    n = columns
    if m < 0 or n < m:
        raise ValueError("invalid relation/HNF dimensions")
    relation_size = m * n
    transform_size = n * n
    witness_size = m * n
    if (
        len(relation) < relation_size
        or len(full_hnf) < relation_size
        or len(transform) < transform_size
        or len(transform_inverse) < transform_size
        or len(inverse_augmented) < 2 * transform_size
        or len(inverse_state) < 5
        or len(relation_to_presentation) < witness_size
        or len(presentation_to_relation) < witness_size
        or len(state) < 8
    ):
        raise ValueError("short relation/HNF witness owner")

    for i in range(8):
        state[i] = 0
    state[0] = -1
    state[1] = m
    state[2] = n
    zero_columns = n - m
    state[3] = zero_columns

    # Authenticate the provenance before computing or publishing its inverse.
    for column in range(n):
        for row in range(m):
            value = 0
            for k in range(n):
                value += relation[k * m + row] * transform[column * n + k]
            if value != full_hnf[column * m + row]:
                return -1
            state[4] += 1
            if column < zero_columns and value != 0:
                return -1

    if (
        pari_unimodular_inverse(
            transform,
            n,
            transform_inverse,
            inverse_augmented,
            inverse_state,
        )
        != 0
    ):
        return -1

    # Check both orders.  The inverse implementation is exact, but this keeps
    # witness publication independently guarded against ownership/call errors.
    for left_first in range(2):
        for column in range(n):
            for row in range(n):
                value = 0
                for k in range(n):
                    if left_first == 0:
                        value += (
                            transform[k * n + row] * transform_inverse[column * n + k]
                        )
                    else:
                        value += (
                            transform_inverse[k * n + row] * transform[column * n + k]
                        )
                expected = 0
                if row == column:
                    expected = 1
                if value != expected:
                    return -1
                state[5] += 1

    # V[:, z:] has shape n by m.
    for column in range(m):
        source_column = zero_columns + column
        for row in range(n):
            relation_to_presentation[column * n + row] = transform[
                source_column * n + row
            ]
            state[6] += 1

    # V^-1[z:, :] has shape m by n.
    for column in range(n):
        for row in range(m):
            presentation_to_relation[column * m + row] = transform_inverse[
                column * n + zero_columns + row
            ]
            state[7] += 1

    state[0] = 0
    return 0


__all__ = ["pari_relation_hnf_witness"]
