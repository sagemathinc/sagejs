"""Storage-neutral plans for Sage-compatible sparse random matrices.

An explicit `density` argument to Sage's `random_matrix` does not mean
"choose exactly this fraction of positions". It switches construction to a
nonzero-entry mode whose sampling rule depends on the matrix representation:

- `ZZ`, `QQ`, and small `GF(p)` matrices with `p > 2` make
  `floor(density * ncols)` column draws in each row, with replacement;
- dense `GF(2)` matrices make one Bernoulli trial for every entry.

The first rule makes density an upper bound because repeated column draws
collide. Sage's integer implementation keeps the first value at a collided
position, while its rational and small-prime implementations replace it.
These details affect both the result distribution and the shared random
stream, so they belong in the semantic specification rather than in a storage
adapter.

A `SparseRandomSpec` is O(1): it describes the complete sampling schedule but
does not materialize positions, values, or a dense zero list. An integration
layer passes that immutable specification to exactly one domain bulk
constructor. That constructor owns the seeded random stream and value
distribution while it allocates and fills canonical FLINT, M4RI, or packed
storage behind one host boundary. Integer bounds and distributions, rational
numerator/denominator bounds, and uniform nonzero finite-field elements remain
domain concerns; this module never guesses them.

`sample_sparse_random_spec` is the ordinary-Python correctness oracle. It
materializes unique final writes through injected randomness, making exact
distribution and seeding behavior independently testable. It is not the
production execution path for large matrices.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeAlias, TypeVar

SparseRandomSpec: TypeAlias = tuple[int, int, str, float, int, str]
SparseRandomWrites: TypeAlias = tuple[
    int,
    int,
    tuple[int, ...],
    tuple[Any, ...],
]

_Result = TypeVar("_Result")


def _checked_shape(nrows: int, ncols: int) -> tuple[int, int]:
    if nrows < 0 or ncols < 0:
        raise ValueError("matrix dimensions must be nonnegative")
    return nrows, ncols


def _normalized_density(density: Any) -> float:
    value = float(density)
    if value > 1:
        return 1.0
    return value


def sage_row_sparse_random_spec(
    nrows: int,
    ncols: int,
    density: Any,
    *,
    collision: str = "replace",
) -> SparseRandomSpec:
    """Describe Sage's row-draw sparse randomization for one exact domain.

    `collision="replace"` models dense rational and small-prime matrices:
    every selected position consumes a new nonzero value, and a repeated
    selection overwrites the old value. `collision="keep-first"` models
    Sage's dense integer matrix: selecting a position that is already nonzero
    consumes no new value.

    Densities at most zero produce the zero matrix. Densities above one are
    clamped to one. At density one every position is filled once in row-major
    order without making unnecessary column draws. These are Sage's
    `randomize(nonzero=True)` edge semantics.
    """
    rows, columns = _checked_shape(nrows, ncols)
    if collision not in ("replace", "keep-first"):
        raise ValueError("collision must be 'replace' or 'keep-first'")
    normalized_density = _normalized_density(density)
    if normalized_density <= 0 or rows == 0 or columns == 0:
        draws_per_row = 0
    elif normalized_density == 1:
        draws_per_row = columns
    else:
        draws_per_row = int(normalized_density * columns)
    return (
        rows,
        columns,
        "row-with-replacement",
        normalized_density,
        draws_per_row,
        collision,
    )


def sage_binary_sparse_random_spec(
    nrows: int,
    ncols: int,
    density: Any,
) -> SparseRandomSpec:
    """Describe Sage's dense `GF(2)` Bernoulli randomization.

    For every entry Sage draws a number from the unit interval and writes one
    when it is at most `density`. Density is clamped above at one, while a
    nonpositive density returns immediately without consuming randomness.
    In particular this is not the with-replacement row sampler used by Sage's
    other dense exact matrix implementations.
    """
    rows, columns = _checked_shape(nrows, ncols)
    # Sage's M4RI implementation returns before coercing density when either
    # axis is empty.  Preserve that observable edge case while storing a
    # canonical inert density in the specification.
    if rows == 0 or columns == 0:
        return rows, columns, "entry-bernoulli", 0.0, 0, "set-one"
    normalized_density = _normalized_density(density)
    return (
        rows,
        columns,
        "entry-bernoulli",
        normalized_density,
        0,
        "set-one",
    )


def _validate_spec(spec: SparseRandomSpec) -> SparseRandomSpec:
    rows, columns, sampling, density, draws_per_row, collision = spec
    _checked_shape(rows, columns)
    if sampling == "row-with-replacement":
        if collision not in ("replace", "keep-first"):
            raise ValueError("collision must be 'replace' or 'keep-first'")
        if density <= 0 or rows == 0 or columns == 0:
            expected_draws = 0
        elif density == 1:
            expected_draws = columns
        else:
            expected_draws = int(density * columns)
        if draws_per_row != expected_draws:
            raise ValueError("row draw count does not agree with density")
    elif sampling == "entry-bernoulli":
        if collision != "set-one" or draws_per_row != 0:
            raise ValueError("invalid Bernoulli sparse random specification")
    else:
        raise ValueError("unknown sparse random sampling rule")
    if density > 1:
        raise ValueError("sparse random specification density exceeds one")
    return spec


def construct_from_sparse_random_spec(
    spec: SparseRandomSpec,
    bulk_constructor: Callable[
        [int, int, str, float, int, str],
        _Result,
    ],
) -> _Result:
    """Invoke exactly one storage-specific constructor for `spec`.

    The constructor owns random draws, nonzero value generation, allocation,
    and publication of the complete result. Its domain closure may carry
    integer/rational bounds or a finite-field modulus and must consume the
    shared seeded stream. Production constructors should use compiled Python
    or a declared mature-library operation so no entry crosses the host
    boundary individually.
    """
    rows, columns, sampling, density, draws_per_row, collision = _validate_spec(spec)
    return bulk_constructor(
        rows,
        columns,
        sampling,
        density,
        draws_per_row,
        collision,
    )


def _checked_nonzero(draw_nonzero: Callable[[], Any]) -> Any:
    value = draw_nonzero()
    if value == 0:
        raise ValueError("draw_nonzero returned zero")
    return value


def _checked_column(draw_index: Callable[[int], int], ncols: int) -> int:
    column = draw_index(ncols)
    if column < 0 or column >= ncols:
        raise ValueError("draw_index returned a column outside the matrix")
    return column


def sample_sparse_random_spec(
    spec: SparseRandomSpec,
    *,
    draw_index: Callable[[int], int] | None = None,
    draw_nonzero: Callable[[], Any] | None = None,
    draw_unit: Callable[[], float] | None = None,
    one: Any = 1,
) -> SparseRandomWrites:
    """Materialize final sparse writes as a portable correctness oracle.

    The injected callbacks must consume one shared seeded stream in their
    normal call order. A row sampler requires `draw_index` and
    `draw_nonzero`; a Bernoulli sampler requires `draw_unit`. Returned linear
    positions are unique and strictly increasing.
    """
    rows, columns, sampling, density, draws_per_row, collision = _validate_spec(spec)
    positions: list[int] = []
    values: list[Any] = []

    if density <= 0 or rows == 0 or columns == 0:
        return rows, columns, (), ()

    if sampling == "entry-bernoulli":
        if draw_unit is None:
            raise TypeError("Bernoulli sampling requires draw_unit")
        for position in range(rows * columns):
            sample = float(draw_unit())
            if sample < 0 or sample > 1:
                raise ValueError("draw_unit returned a value outside [0, 1]")
            if sample <= density:
                positions.append(position)
                values.append(one)
        return rows, columns, tuple(positions), tuple(values)

    if draw_index is None or draw_nonzero is None:
        raise TypeError("row sampling requires draw_index and draw_nonzero")
    if density == 1:
        for position in range(rows * columns):
            positions.append(position)
            values.append(_checked_nonzero(draw_nonzero))
        return rows, columns, tuple(positions), tuple(values)

    replace_collisions = collision == "replace"
    for row in range(rows):
        row_values: dict[int, Any] = {}
        for _draw in range(draws_per_row):
            column = _checked_column(draw_index, columns)
            if replace_collisions or column not in row_values:
                row_values[column] = _checked_nonzero(draw_nonzero)
        for column in sorted(row_values):
            positions.append(row * columns + column)
            values.append(row_values[column])
    return rows, columns, tuple(positions), tuple(values)


def materialize_sparse_random_writes(
    writes: SparseRandomWrites,
    zero: Any,
) -> list[Any]:
    """Materialize row-major storage from oracle sparse writes."""
    rows, columns, positions, values = writes
    output = [zero for _position in range(rows * columns)]
    for index in range(len(positions)):
        output[positions[index]] = values[index]
    return output
