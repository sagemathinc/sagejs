"""Storage-neutral construction of canonical matrix row and column spaces.

The public matrix layer owns rings, matrix representations, and subspace
parents.  This module owns the small but performance-critical protocol between
them: compute one canonical echelon matrix, retain exactly its leading
canonical generator rows through a bulk selector, mark that matrix immutable,
and explicitly describe why its rows are already canonical.

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

The number of canonical generator rows is deliberately a callback rather than
an implicit rank.  Over `ZZ` and fields it is normally the rank.  Over a ring
with zero divisors, a Howell form can have more nonzero canonical generator
rows than either the algebraic rank or the original matrix had rows.  Such an
adapter must report the actual leading Howell-row count.
"""

from __future__ import annotations

from collections.abc import Callable
from operator import index
from typing import Any

ROW_ORIENTATION = "row"
COLUMN_ORIENTATION = "column"

Dimensions = Callable[[Any], tuple[int, int]]
MatrixOperation = Callable[[Any], Any]
BasisRowCount = Callable[[Any], int]
RowSelector = Callable[[Any, tuple[int, ...]], Any]
MutabilityOperation = Callable[[Any], None]
BaseRingEquality = Callable[[Any, Any], bool]


class CanonicalBasisMetadata:
    """Facts an adapter may trust about immutable canonical generator rows.

    `basis_rows` retains Sage.js's public `basis_matrix()` terminology. Over a
    composite residue ring those rows are a canonical Howell generating set,
    not necessarily a linearly independent basis.
    """

    def __init__(
        self,
        orientation: str,
        ambient_dimension: int,
        basis_row_count: int,
        basis_rows: int,
        basis_columns: int,
    ) -> None:
        if orientation not in [ROW_ORIENTATION, COLUMN_ORIENTATION]:
            raise ValueError("orientation must be 'row' or 'column'")
        self.orientation = orientation
        self.ambient_dimension = _checked_dimension(
            ambient_dimension, "ambient dimension"
        )
        self.basis_row_count = _checked_dimension(basis_row_count, "basis row count")
        self.basis_rows = _checked_dimension(basis_rows, "basis row count")
        self.basis_columns = _checked_dimension(basis_columns, "basis column count")
        if self.basis_rows != self.basis_row_count:
            raise ValueError("basis row count does not match the basis shape")
        if self.basis_columns != self.ambient_dimension:
            raise ValueError("basis column count does not match the ambient dimension")
        self.already_echelonized = True
        self.immutable = True


class CanonicalBasis:
    """An immutable canonical generator matrix and its public metadata."""

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


def _checked_dimension(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = index(value)
    except TypeError:
        raise TypeError(name + " must be an integer") from None
    if answer < 0:
        raise ValueError(name + " must be nonnegative")
    return answer


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
    basis_row_count: int,
) -> CanonicalBasisMetadata:
    source_rows = _checked_dimension(source_rows, "source row count")
    source_columns = _checked_dimension(source_columns, "source column count")
    basis_row_count = _checked_dimension(basis_row_count, "basis row count")
    if orientation == ROW_ORIENTATION:
        ambient_dimension = source_columns
    elif orientation == COLUMN_ORIENTATION:
        ambient_dimension = source_rows
    else:
        raise ValueError("orientation must be 'row' or 'column'")
    return CanonicalBasisMetadata(
        orientation,
        ambient_dimension,
        basis_row_count,
        basis_row_count,
        ambient_dimension,
    )


def canonical_basis_from_echelon(
    echelon: Any,
    source_rows: int,
    source_columns: int,
    orientation: str,
    dimensions: Dimensions,
    basis_row_count: BasisRowCount,
    select_rows: RowSelector,
    set_immutable: MutabilityOperation,
) -> CanonicalBasis:
    """Bulk-select a canonical basis from one already computed echelon matrix.

    For a row space, `echelon` has the source ambient dimension as its column
    count. For a column space it has the source row count as its column count.
    Its row count is intentionally unconstrained: Sage.js Howell forms over
    composite `Zmod(n)` use `max(source_rows, source_columns)` rows and can add
    canonical generator rows required by zero divisors.

    `basis_row_count(echelon)` must return the number of *leading* canonical
    generator rows.  It may use rank metadata only for a domain whose echelon
    contract proves that rank equals this count, such as `ZZ` or a field.  A
    Howell adapter must instead report its actual leading nonzero row count.

    The selector must preserve the exact shape `basis_row_count` by
    `ambient_dimension`, including `0` by `n`. This explicit check prevents a
    host list from collapsing degenerate matrix dimensions.
    """
    source_rows = _checked_dimension(source_rows, "source row count")
    source_columns = _checked_dimension(source_columns, "source column count")
    if orientation == ROW_ORIENTATION:
        expected_echelon_columns = source_columns
    elif orientation == COLUMN_ORIENTATION:
        expected_echelon_columns = source_rows
    else:
        raise ValueError("orientation must be 'row' or 'column'")
    echelon_rows, echelon_columns = _checked_shape(dimensions(echelon), "echelon")
    if echelon_columns != expected_echelon_columns:
        raise ValueError("echelon matrix column count does not match the source")

    generator_rows = _checked_dimension(basis_row_count(echelon), "basis row count")
    if generator_rows > echelon_rows:
        raise ValueError(
            "basis row count "
            + str(generator_rows)
            + " exceeds echelon row count "
            + str(echelon_rows)
        )

    metadata = _basis_metadata(
        orientation,
        source_rows,
        source_columns,
        generator_rows,
    )
    selected_rows = tuple(range(metadata.basis_row_count))
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
    basis_row_count: BasisRowCount,
    select_rows: RowSelector,
    set_immutable: MutabilityOperation,
) -> CanonicalBasis:
    """Compute one canonical row echelon form and retain its generator rows."""
    source_rows, source_columns = _checked_shape(dimensions(source), "source")
    echelon = echelon_form(source)
    return canonical_basis_from_echelon(
        echelon,
        source_rows,
        source_columns,
        ROW_ORIENTATION,
        dimensions,
        basis_row_count,
        select_rows,
        set_immutable,
    )


def canonical_column_basis(
    source: Any,
    dimensions: Dimensions,
    transpose: MatrixOperation,
    echelon_form: MatrixOperation,
    basis_row_count: BasisRowCount,
    select_rows: RowSelector,
    set_immutable: MutabilityOperation,
) -> CanonicalBasis:
    """Echelonize the transpose once and retain canonical column generators."""
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
        basis_row_count,
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
    basis_row_count: BasisRowCount,
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
        basis_row_count,
        select_rows,
        set_immutable,
    )
