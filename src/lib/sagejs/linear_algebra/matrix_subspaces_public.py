"""Representation-aware execution for public exact matrix subspaces.

The storage-neutral planning lives in `matrix_subspaces`.  This module is the
small public adapter: it asks a `Matrix` for its canonical echelon form, obtains
bounded pivot metadata, and bulk-selects the leading generator rows.  Exact
entries never cross into host scalar objects on the equal-ring path.
"""

from __future__ import annotations

from typing import Any

from sagejs.linear_algebra.matrix_subspaces import (
    CanonicalBasis,
    GeneratorSpan,
    canonical_column_basis,
    prepare_row_space,
)


def _dimensions(value: Any) -> tuple[int, int]:
    return value.nrows(), value.ncols()


def _same_base_ring(left: Any, right: Any) -> bool:
    return left == right


def _basis_row_count(echelon: Any) -> int:
    """Return the number of leading canonical generator rows.

    Fields and `ZZ` expose an exact bulk rank operation on the canonical matrix.
    Composite residue rings use Howell form, whose generator count can differ
    from rank, and retain the deliberately general leading-row scan.
    """
    if getattr(echelon.base_ring(), "_kind", None) == "ZMOD":
        count = 0
        found_zero = False
        for row in echelon.rows():
            nonzero = any(entry != 0 for entry in row)
            if nonzero:
                if found_zero:
                    raise ValueError("canonical generator rows are not leading")
                count += 1
            else:
                found_zero = True
        return count
    return echelon.rank()


def _select_prefix_rows(echelon: Any, count: int) -> Any:
    if hasattr(echelon, "matrix_from_prefix_rows"):
        return echelon.matrix_from_prefix_rows(count)
    return echelon.matrix_from_rows(range(count))


def _set_immutable(value: Any) -> None:
    value.set_immutable()


def prepare_public_row_space(
    source: Any,
    requested_base_ring: Any | None = None,
) -> CanonicalBasis | GeneratorSpan:
    """Return a canonical equal-ring basis or an explicit generator span."""
    return prepare_row_space(
        source,
        source.base_ring(),
        requested_base_ring,
        _same_base_ring,
        _dimensions,
        lambda value: value.echelon_form(),
        _basis_row_count,
        _select_prefix_rows,
        _set_immutable,
    )


def public_column_basis(source: Any) -> CanonicalBasis:
    """Return an immutable canonical basis for the source column space."""
    return canonical_column_basis(
        source,
        _dimensions,
        lambda value: value.transpose(),
        lambda value: value.echelon_form(),
        _basis_row_count,
        _select_prefix_rows,
        _set_immutable,
    )


__all__ = ["prepare_public_row_space", "public_column_basis"]
