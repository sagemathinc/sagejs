"""Storage snapshots preserve independent products and cancellation points."""

import math

from sagejs.numerics.linear_algebra.storage import DenseMatrix
from sagejs.numerics.linear_algebra.validation import _independent_product


def reference(left, right, *, check=None):
    """Pre-optimization product, retained as a differential oracle."""
    if left.ncols != right.nrows:
        raise ValueError("matrix dimensions do not conform during validation")
    entries = []
    for row in range(left.nrows):
        if check is not None:
            check()
        for column in range(right.ncols):
            if check is not None:
                check()
            terms = [
                left.entry(row, index) * right.entry(index, column)
                for index in range(left.ncols)
            ]
            entries.append(math.fsum(terms))
    return DenseMatrix(left.nrows, right.ncols, entries)


for rows, inner, columns in [
    (0, 3, 2),
    (2, 0, 3),
    (2, 3, 0),
    (1, 1, 1),
    (2, 3, 4),
    (5, 2, 3),
    (8, 8, 8),
]:
    left = DenseMatrix(
        rows, inner, [float((i * 17 + 3) % 11 - 5) for i in range(rows * inner)]
    )
    right = DenseMatrix(
        inner, columns, [float((i * 13 + 7) % 19 - 9) for i in range(inner * columns)]
    )
    calls = [0]

    def check():
        calls[0] += 1

    result = _independent_product(left, right, check=check)
    assert result.shape == (rows, columns)
    assert result.entries == reference(left, right).entries
    assert calls[0] == rows * (columns + 1)

left = DenseMatrix(1, 3, [1e16, 1.0, -1e16])
right = DenseMatrix(3, 1, [1.0, 1.0, 1.0])
assert _independent_product(left, right).entries == (1.0,)
assert _independent_product(
    DenseMatrix(1, 1, [-0.0]), DenseMatrix(1, 1, [1.0])
).entries == (0.0,)

# Exact coordinate/zero rows, repeated selections, and near misses. The
# independent oracle still forms every rounded product and calls math.fsum.
right = DenseMatrix(
    3,
    4,
    [1e308, -0.0, 5e-324, -1e308, -1e308, 0.0, -5e-324, 1e308, 1.0, -0.0, 3.0, 0.0],
)
for values in (
    [0.0, 0.0, 0.0],
    [-0.0, 1.0, 0.0],
    [1.0, 0.0, 0.0],
    [0.0, 0.0, 1.0],
    [1.0, 1.0, 0.0],
    [-1.0, 0.0, 0.0],
    [1.0 + 2.0**-52, 0.0, 0.0],
    [1.0, 5e-324, 0.0],
):
    left = DenseMatrix(1, 3, values)
    actual = _independent_product(left, right)
    expected = reference(left, right)
    assert actual.entries == expected.entries
    assert [math.copysign(1.0, x) for x in actual.entries] == [
        math.copysign(1.0, x) for x in expected.entries
    ]

selection = DenseMatrix(
    4, 3, [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0]
)
for stop in range(1, 21):
    for function in (reference, _independent_product):
        calls = [0]

        def cancel_selection():
            calls[0] += 1
            if calls[0] == stop:
                raise RuntimeError("cancelled selection")

        try:
            function(selection, right, check=cancel_selection)
        except RuntimeError as error:
            assert str(error) == "cancelled selection"
        else:
            raise AssertionError("coordinate-row cancellation was ignored")
        assert calls[0] == stop

for stop in range(1, 9):
    for function in (reference, _independent_product):
        calls = [0]

        def cancel():
            calls[0] += 1
            if calls[0] == stop:
                raise RuntimeError("cancelled")

        try:
            function(DenseMatrix.identity(3), DenseMatrix.identity(3), check=cancel)
        except RuntimeError as error:
            assert str(error) == "cancelled"
        else:
            raise AssertionError("cancellation was ignored")
        assert calls[0] == stop

for left, right in [
    (DenseMatrix(1, 1, [1e308]), DenseMatrix(1, 1, [2.0])),
    (DenseMatrix(1, 2, [1.0, 2.0]), DenseMatrix.identity(3)),
]:
    for function in (reference, _independent_product):
        try:
            function(left, right)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid product was accepted")

print("validation access passed")
