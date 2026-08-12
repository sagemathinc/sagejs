"""Storage-neutral construction of canonical matrix row and column spaces.

The public matrix layer owns rings, matrix representations, and subspace
parents.  This module owns the small but performance-critical protocol between
them: compute one echelon matrix, retain exactly its first `rank` rows through
a bulk selector, mark that basis immutable, and explicitly describe why the
basis is already canonical.

The callbacks are intentional.  A `ZZ` or `QQ` matrix can select rows directly
from a generated FLINT resource, while a small prime-field matrix can use its
packed selector.  The shared Python code never asks for scalar entries and
never rebuilds a matrix from host vectors.

Sage's optional `row_space(base_ring=...)` has one important exceptional
semantic: when the requested coefficient ring differs from the matrix base
ring, the original rows are generators and are *not* already echelonized for
that coefficient ring.  `prepare_row_space` therefore exposes that case as an
explicit generator-span request instead of silently changing the matrix ring
or incorrectly reusing its echelon form.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

ROW_ORIENTATION = "row"
COLUMN_ORIENTATION = "column"

Dimensions = Callable[[Any], tuple[int, int]]
MatrixOperation = Callable[[Any], Any]
MatrixRank = Callable[[Any], int]
RowSelector = Callable[[Any, tuple[int, ...]], Any]
MutabilityOperation = Callable[[Any], None]
BaseRingEquality = Callable[[Any, Any], bool]


class CanonicalBasisMetadata:
    """Facts an integration layer may trust about an immutable basis matrix."""

    def __init__(
        self,
        orientation: str,
        ambient_dimension: int,
        rank: int,
        basis_rows: int,
        basis_columns: int,
    ) -> None:
        if orientation not in [ROW_ORIENTATION, COLUMN_ORIENTATION]:
            raise ValueError("orientation must be 'row' or 'column'")
        self.orientation = orientation
        self.ambient_dimension = _checked_dimension(
            ambient_dimension, "ambient dimension"
        )
        self.rank = _checked_dimension(rank, "rank")
        self.basis_rows = _checked_dimension(basis_rows, "basis row count")
        self.basis_columns = _checked_dimension(basis_columns, "basis column count")
        self.already_echelonized = True
        self.immutable = True


class CanonicalBasis:
    """A canonical immutable basis matrix together with its public metadata."""

    def __init__(self, matrix: Any, metadata: CanonicalBasisMetadata) -> None:
        self.matrix = matrix
        self.metadata = metadata


class GeneratorSpan:
    """A noncanonical generator matrix for a requested coefficient ring.

    This is the faithful plan for Sage's cross-ring `row_space(base_ring=...)`
    behavior.  The eventual subspace-parent adapter must canonicalize the
    generators over `base_ring`; it must not claim they were echelonized by the
    source matrix's ring.
    """

    def __init__(
        self,
        matrix: Any,
        base_ring: Any,
        ambient_dimension: int,
    ) -> None:
        self.matrix = matrix
        self.base_ring = base_ring
        self.ambient_dimension = _checked_dimension(
            ambient_dimension, "ambient dimension"
        )
        self.orientation = ROW_ORIENTATION
        self.already_echelonized = False


def _checked_dimension(value: int, name: str) -> int:
    if value < 0:
        raise ValueError(name + " must be nonnegative")
    return value


def _checked_shape(shape: tuple[int, int], name: str) -> tuple[int, int]:
    rows, columns = shape
    return (
        _checked_dimension(rows, name + " row count"),
        _checked_dimension(columns, name + " column count"),
    )


def _basis_metadata(
    orientation: str,
    source_rows: int,
    source_columns: int,
    rank: int,
) -> CanonicalBasisMetadata:
    source_rows = _checked_dimension(source_rows, "source row count")
    source_columns = _checked_dimension(source_columns, "source column count")
    rank = _checked_dimension(rank, "rank")
    maximum_rank = min(source_rows, source_columns)
    if rank > maximum_rank:
        raise ValueError(
            "rank " + str(rank) + " exceeds maximum rank " + str(maximum_rank)
        )
    if orientation == ROW_ORIENTATION:
        ambient_dimension = source_columns
    elif orientation == COLUMN_ORIENTATION:
        ambient_dimension = source_rows
    else:
        raise ValueError("orientation must be 'row' or 'column'")
    return CanonicalBasisMetadata(
        orientation,
        ambient_dimension,
        rank,
        rank,
        ambient_dimension,
    )


def canonical_basis_from_echelon(
    echelon: Any,
    source_rows: int,
    source_columns: int,
    orientation: str,
    dimensions: Dimensions,
    rank: MatrixRank,
    select_rows: RowSelector,
    set_immutable: MutabilityOperation,
) -> CanonicalBasis:
    """Bulk-select a canonical basis from one already computed echelon matrix.

    For a row space, `echelon` has the source shape.  For a column space it is
    the echelon form of the transpose, so its shape is reversed.  The rank is
    queried from that result; generated resource RREF implementations retain
    this as constant-time metadata, and integer HNF implementations may use a
    declared rank query without another echelon computation.

    The selector must preserve the exact shape `rank` by `ambient_dimension`,
    including `0` by `n`.  This explicit check prevents a host list from
    collapsing degenerate matrix dimensions.
    """
    source_rows = _checked_dimension(source_rows, "source row count")
    source_columns = _checked_dimension(source_columns, "source column count")
    if orientation == ROW_ORIENTATION:
        expected_echelon_shape = (source_rows, source_columns)
    elif orientation == COLUMN_ORIENTATION:
        expected_echelon_shape = (source_columns, source_rows)
    else:
        raise ValueError("orientation must be 'row' or 'column'")
    actual_echelon_shape = _checked_shape(dimensions(echelon), "echelon")
    if actual_echelon_shape != expected_echelon_shape:
        raise ValueError("echelon matrix shape does not match the source")

    metadata = _basis_metadata(
        orientation,
        source_rows,
        source_columns,
        int(rank(echelon)),
    )
    selected_rows = tuple(range(metadata.rank))
    basis = select_rows(echelon, selected_rows)
    basis_shape = _checked_shape(dimensions(basis), "basis")
    expected_basis_shape = (metadata.basis_rows, metadata.basis_columns)
    if basis_shape != expected_basis_shape:
        raise ValueError(
            "row selector returned shape "
            + str(basis_shape)
            + ", expected "
            + str(expected_basis_shape)
        )
    set_immutable(basis)
    return CanonicalBasis(basis, metadata)


def canonical_row_basis(
    source: Any,
    dimensions: Dimensions,
    echelon_form: MatrixOperation,
    rank: MatrixRank,
    select_rows: RowSelector,
    set_immutable: MutabilityOperation,
) -> CanonicalBasis:
    """Compute one row echelon form and return its canonical nonzero rows."""
    source_rows, source_columns = _checked_shape(dimensions(source), "source")
    echelon = echelon_form(source)
    return canonical_basis_from_echelon(
        echelon,
        source_rows,
        source_columns,
        ROW_ORIENTATION,
        dimensions,
        rank,
        select_rows,
        set_immutable,
    )


def canonical_column_basis(
    source: Any,
    dimensions: Dimensions,
    transpose: MatrixOperation,
    echelon_form: MatrixOperation,
    rank: MatrixRank,
    select_rows: RowSelector,
    set_immutable: MutabilityOperation,
) -> CanonicalBasis:
    """Compute one echelon form of the transpose as a canonical column basis."""
    source_rows, source_columns = _checked_shape(dimensions(source), "source")
    transposed = transpose(source)
    transposed_shape = _checked_shape(dimensions(transposed), "transpose")
    if transposed_shape != (source_columns, source_rows):
        raise ValueError("transpose matrix shape does not match the source")
    echelon = echelon_form(transposed)
    return canonical_basis_from_echelon(
        echelon,
        source_rows,
        source_columns,
        COLUMN_ORIENTATION,
        dimensions,
        rank,
        select_rows,
        set_immutable,
    )


def prepare_row_space(
    source: Any,
    source_base_ring: Any,
    requested_base_ring: Any | None,
    same_base_ring: BaseRingEquality,
    dimensions: Dimensions,
    echelon_form: MatrixOperation,
    rank: MatrixRank,
    select_rows: RowSelector,
    set_immutable: MutabilityOperation,
) -> CanonicalBasis | GeneratorSpan:
    """Prepare Sage-compatible data for `row_space(base_ring=...)`.

    With the source coefficient ring, this returns a `CanonicalBasis`.  With a
    genuinely different requested ring, it returns a `GeneratorSpan` carrying
    the original matrix and `already_echelonized=False`.  A public adapter then
    hands that request to the ring-aware subspace constructor, matching Sage's
    semantics even when, for example, rational coordinate vectors are spanned
    as a `ZZ`-module.
    """
    _source_rows, source_columns = _checked_shape(dimensions(source), "source")
    if requested_base_ring is not None and not same_base_ring(
        source_base_ring, requested_base_ring
    ):
        return GeneratorSpan(source, requested_base_ring, source_columns)
    return canonical_row_basis(
        source,
        dimensions,
        echelon_form,
        rank,
        select_rows,
        set_immutable,
    )
