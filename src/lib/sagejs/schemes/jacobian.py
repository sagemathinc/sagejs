"""Jacobian matrices, tangent spaces, and certified singular subschemes."""

from __future__ import annotations

from typing import Any, Iterator

import sagejs.runtime as runtime

_MAX_MINOR_ORDER = 8
_MAX_MINORS = 4096


def _matrix_api() -> Any:
    return __import__("sagejs._baselib.matrix", fromlist=["matrix"])


def _combinations(
    size: int,
    choose: int,
    start: int = 0,
    prefix: Any = None,
) -> Iterator[Any]:
    if prefix is None:
        prefix = []
    if choose == 0:
        yield runtime.math_tuple(prefix)
        return
    for value in range(start, size - choose + 1):
        yield from _combinations(size, choose - 1, value + 1, prefix + [value])


def _determinant(rows: list[list[Any]]) -> Any:
    """Evaluate a small minor in `O(n * 2**n)` ring operations, without division.

    Each subset stores the determinant of the first `len(subset)` rows on
    those columns. Expanding its last row reuses all smaller minors instead
    of rebuilding the factorial-size Laplace recursion tree.
    """
    size = len(rows)
    if size == 0:
        raise ValueError("zero-order Jacobian minors are not materialized")
    if size > _MAX_MINOR_ORDER:
        raise OverflowError("Jacobian minor order exceeds the limit of 8")
    if size == 1:
        return rows[0][0]
    ring = rows[0][0].parent()
    count = 1 << size
    minors = [ring(0)] * count
    widths = [0] * count
    minors[0] = ring(1)
    for mask in range(1, count):
        widths[mask] = widths[mask >> 1] + (mask & 1)
        row = widths[mask] - 1
        position = 0
        answer = ring(0)
        for column in range(size):
            bit = 1 << column
            if mask & bit:
                term = minors[mask ^ bit] * rows[row][column]
                answer = answer - term if (row + position) % 2 else answer + term
                position += 1
        minors[mask] = answer
    return minors[-1]


@runtime.callable_instance_class
class JacobianMatrix:
    """A small polynomial matrix with exact point evaluation and minors."""

    def __init__(self, ring: Any, rows: Any) -> None:
        self._ring = ring
        self._rows = runtime.math_tuple(
            [runtime.math_tuple([ring(value) for value in row]) for row in rows]
        )

    def base_ring(self) -> Any:
        return self._ring

    def nrows(self) -> int:
        return len(self._rows)

    def ncols(self) -> int:
        return self._ring.ngens()

    def rows(self) -> Any:
        return self._rows

    def list(self) -> list[Any]:
        return [value for row in self._rows for value in row]

    def __getitem__(self, index: Any) -> Any:
        if isinstance(index, tuple):
            return self._rows[index[0]][index[1]]
        return self._rows[index]

    def evaluate(self, point: Any) -> Any:
        base = point.ambient_space().base_ring()
        entries = [value(*point.coordinates()) for value in self.list()]
        return _matrix_api().matrix(base, self.nrows(), self.ncols(), entries)

    def minors(self, order: int) -> list[Any]:
        if not runtime.is_exact_integer(order):
            raise TypeError("Jacobian minor order must be an integer")
        order = int(order)
        if order <= 0 or order > min(self.nrows(), self.ncols()):
            raise ValueError("Jacobian minor order is out of range")
        if order > _MAX_MINOR_ORDER:
            raise OverflowError("Jacobian minor order exceeds the limit of 8")
        answer = []
        for rows in _combinations(self.nrows(), order):
            for columns in _combinations(self.ncols(), order):
                if len(answer) >= _MAX_MINORS:
                    raise OverflowError("Jacobian calculation exceeds 4096 minors")
                square = [
                    [self._rows[row][column] for column in columns] for row in rows
                ]
                answer.append(_determinant(square))
        return answer

    def __repr__(self) -> str:
        return "Jacobian matrix " + repr(self._rows)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class TangentSpace:
    """The exact linearized tangent space at a rational point."""

    def __init__(self, scheme: Any, point: Any, jacobian: JacobianMatrix) -> None:
        self._scheme = scheme
        self._point = point
        self._jacobian = jacobian
        self._evaluated = jacobian.evaluate(point)
        self._linear_subscheme = self._make_linear_subscheme()

    def scheme(self) -> Any:
        return self._scheme

    def point(self) -> Any:
        return self._point

    def jacobian_matrix(self) -> JacobianMatrix:
        return self._jacobian

    def evaluated_jacobian(self) -> Any:
        return self._evaluated

    def dimension(self) -> int:
        ambient_dimension = self._scheme.ambient_space().dimension()
        return ambient_dimension - self._evaluated.rank()

    dim = dimension

    def _make_linear_subscheme(self) -> Any:
        ambient = self._scheme.ambient_space()
        ring = ambient.coordinate_ring()
        variables = ring.gens()
        equations = []
        for row in self._evaluated.rows():
            equation = ring(0)
            for index in range(len(variables)):
                equation += row[index] * variables[index]
            equations.append(equation)
        return ambient.subscheme(equations)

    def linear_subscheme(self) -> Any:
        return self._linear_subscheme

    def equations(self) -> Any:
        return self._linear_subscheme.defining_polynomials()

    def basis(self) -> Any:
        """Return a basis of the affine-cone kernel of the Jacobian."""
        return self._evaluated.right_kernel().basis()

    def __repr__(self) -> str:
        return (
            "Tangent space of dimension "
            + str(self.dimension())
            + " at "
            + repr(self._point)
        )

    __str__ = __repr__
    toString = __repr__


def jacobian_matrix(scheme: Any, proof: Any = None) -> JacobianMatrix:
    ring = scheme.ambient_space().coordinate_ring()
    variables = ring.gens()
    rows = [
        [equation.derivative(variable) for variable in variables]
        for equation in scheme.defining_ideal(proof).gens()
        if equation != ring(0)
    ]
    return JacobianMatrix(ring, rows)


def tangent_space(scheme: Any, point: Any, proof: Any = None) -> TangentSpace:
    if point not in scheme:
        raise TypeError("the tangent-space point is not on the scheme")
    return TangentSpace(scheme, point, jacobian_matrix(scheme, proof))


def _certified_codimension(scheme: Any, proof: Any = None) -> int:
    ideal = scheme.defining_ideal(proof)
    ring = ideal.ring()
    equations = [value for value in ideal.gens() if value != ring(0)]
    codimension = scheme.codimension(proof)
    if codimension == 0 and len(equations) == 0:
        return 0
    if codimension > 0 and len(equations) == codimension:
        return codimension
    raise NotImplementedError(
        "smoothness and global singular schemes currently require a "
        "hypersurface or certified complete intersection; mixed-dimensional "
        "and redundant presentations are unsupported"
    )


def is_smooth(scheme: Any, point: Any = None, proof: Any = None) -> bool:
    codimension = _certified_codimension(scheme, proof)
    if point is not None:
        return (
            tangent_space(scheme, point, proof).evaluated_jacobian().rank()
            == codimension
        )
    return singular_subscheme(scheme, proof).is_empty(proof)


def singular_subscheme(scheme: Any, proof: Any = None) -> Any:
    codimension = _certified_codimension(scheme, proof)
    ambient = scheme.ambient_space()
    ring = ambient.coordinate_ring()
    if codimension == 0:
        return ambient.subscheme([ring(1)])
    jacobian = jacobian_matrix(scheme, proof)
    minors = jacobian.minors(codimension)
    equations = list(scheme.defining_ideal(proof).gens()) + minors
    return ambient.subscheme(equations)
