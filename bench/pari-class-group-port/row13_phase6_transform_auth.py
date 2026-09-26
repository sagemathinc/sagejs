"""Exact row-13 relation-transform authentication.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_row13_phase6_transform_auth(
    records: IntegerBuffer,
    rows: int,
    columns: int,
    transforms: IntegerBuffer,
    transform_count: int,
    products: IntegerBuffer,
) -> int:
    if rows <= 0 or columns <= 0 or transform_count <= 0:
        raise ValueError("invalid transform shape")
    if len(records) < rows * columns:
        raise ValueError("short relation matrix")
    if len(transforms) < transform_count * columns:
        raise ValueError("short transform matrix")
    if len(products) < transform_count * rows:
        raise ValueError("short product matrix")
    for transform in range(transform_count):
        for row in range(rows):
            total = 0
            for column in range(columns):
                total += (
                    records[column * rows + row]
                    * transforms[transform * columns + column]
                )
            products[transform * rows + row] = total
    return 0


__all__ = ["pari_row13_phase6_transform_auth"]
