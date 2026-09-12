"""Exact integral lattices and shared matrix primitives."""

from copy import copy
from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _exact_integer(value: Any, label: str) -> int:
    value = runtime.normalize_integer(value)
    if runtime.jstype(value) != "number" or not runtime.number.isSafeInteger(value):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(value)


def _positive_integer(value: Any, label: str) -> int:
    result = _exact_integer(value, label)
    if result <= 0:
        raise ValueError(label + " must be positive")
    return result


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right != 0:
        left, right = right, left % right
    return left


def _lcm(left: int, right: int) -> int:
    if left == 0 or right == 0:
        return 0
    return abs(left // _gcd(left, right) * right)


def _denominator(value: Any) -> int:
    method = getattr(value, "denominator", None)
    return 1 if method is None else int(method())


def _zero_matrix(base_ring: Any, rows: int, columns: int) -> Any:
    return _global("matrix")(base_ring, rows, columns)


def _identity_matrix(base_ring: Any, dimension: int) -> Any:
    return _global("identity_matrix")(base_ring, dimension)


def _clear_denominators(source: Any) -> tuple[Any, int]:
    """Return an integer scalar multiple with the same rational row space."""
    # Most homology reductions already have integral entries. The exact bulk
    # conversion avoids allocating one Rational per matrix entry in that case.
    try:
        return source.change_ring(sage.ZZ), 1
    except (TypeError, ValueError):
        pass
    denominator = 1
    for value in source.list():
        denominator = _lcm(denominator, _denominator(value))
    integral = source if denominator == 1 else source * denominator
    return integral.change_ring(sage.ZZ), denominator


def _integral_matrix(source: Any, label: str) -> Any:
    r"""Coerce a rational matrix to $\mathbf Z$, rejecting denominators."""
    # The public conversion already checks every denominator, with a bulk
    # resource-to-resource path and a correct portable scalar fallback.
    try:
        return source.change_ring(sage.ZZ)
    except (TypeError, ValueError):
        raise ArithmeticError(label + " is not integral") from None


def _saturated_integer_intersection(rational_basis: Any) -> Any:
    r"""Return $\operatorname{rowspan}(B)\cap\mathbf Z^m$ exactly."""
    rational_basis = rational_basis.change_ring(sage.QQ)
    columns = rational_basis.ncols()
    if rational_basis.nrows() == 0:
        return _zero_matrix(sage.ZZ, 0, columns)
    equations = rational_basis.change_ring(sage.QQ).right_kernel_matrix()
    integer_equations, _denominator_value = _clear_denominators(equations)
    lattice = integer_equations.right_kernel_matrix()
    if lattice.nrows() != rational_basis.rank():
        raise ArithmeticError("saturated lattice rank is inconsistent")
    if lattice.change_ring(sage.QQ).row_space() != rational_basis.row_space():
        raise ArithmeticError("saturated lattice spans the wrong rational space")
    return lattice


def _integer_row_lattice_basis(source: Any) -> Any:
    """Return a canonical basis for the integer row lattice of `source`."""
    if source.nrows() == 0:
        return _zero_matrix(sage.ZZ, 0, source.ncols())
    integer_source = _integral_matrix(source, "row-lattice generator matrix")
    return integer_source.hermite_form(include_zero_rows=False)


def _is_integrally_surjective(source: Any) -> bool:
    r"""Certify $\mathbf Z^m\to\mathbf Z^n$ surjectivity by its row lattice.

    The integral image is the whole target exactly when its nonzero-row
    Hermite basis is the identity. No Smith transformation matrices are
    needed; those can suffer severe intermediate coefficient growth.
    """
    return _integer_row_lattice_basis(source) == _identity_matrix(
        sage.ZZ, source.ncols()
    )


def _rational_row_lattice_basis(source: Any) -> Any:
    r"""Return a rational basis for the $\mathbf Z$-span of rational rows."""
    if source.nrows() == 0:
        return _zero_matrix(sage.QQ, 0, source.ncols())
    integral, denominator = _clear_denominators(source)
    hermite = integral.hermite_form(include_zero_rows=False)
    return hermite.change_ring(sage.QQ) / sage.QQ(denominator)


def _stack(matrices: list[Any], columns: int, base_ring: Any = sage.QQ) -> Any:
    if len(matrices) == 0:
        return _zero_matrix(base_ring, 0, columns)
    answer = matrices[0].change_ring(base_ring)
    for item in matrices[1:]:
        answer = answer.stack(item.change_ring(base_ring))
    return answer


class IntegralHomologyLattice(sage.Parent):
    """A free integral lattice embedded in an exact rational vector space."""

    def __init__(
        self,
        basis_matrix: Any,
        model: str,
        saturated: bool,
    ) -> None:
        self._kind = "IntegralHomologyLattice"
        self._basis = copy(basis_matrix.change_ring(sage.QQ))
        self._basis.set_immutable()
        self._model = str(model)
        self._saturated = bool(saturated)
        if self._basis.rank() != self._basis.nrows():
            raise ValueError("a lattice basis must have independent rows")

    def base_ring(self) -> Any:
        return sage.ZZ

    def rank(self) -> int:
        return self._basis.nrows()

    dimension = rank

    def degree(self) -> int:
        return self._basis.ncols()

    def basis_matrix(self) -> Any:
        return self._basis

    def basis(self) -> list[Any]:
        return self._basis.rows()

    gens = basis

    def model(self) -> str:
        return self._model

    def is_saturated(self) -> bool:
        return self._saturated

    def coordinates(self, value: Any) -> Any:
        vector = _global("vector")(sage.QQ, list(value))
        coordinates = self._basis.solve_left(vector)
        return _global("vector")(
            sage.ZZ,
            _integral_matrix(coordinates, "lattice coordinates").list(),
        )

    def contains(self, value: Any) -> bool:
        try:
            self.coordinates(value)
            return True
        except (ArithmeticError, TypeError, ValueError):
            return False

    def __contains__(self, value: Any) -> bool:
        return self.contains(value)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, IntegralHomologyLattice):
            return False
        if self.degree() != other.degree() or self.rank() != other.rank():
            return False
        # This is integral equality, not equality after tensoring with QQ.
        # Rational HNF canonically records the actual Z-span even when its
        # ambient embedding has denominators.
        return _rational_row_lattice_basis(self._basis) == _rational_row_lattice_basis(
            other._basis
        )

    def __repr__(self) -> str:
        return (
            "Integral homology lattice of rank "
            + str(self.rank())
            + " in degree "
            + str(self.degree())
            + " ("
            + self._model
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


__all__ = [
    "IntegralHomologyLattice",
    "_positive_integer",
    "_saturated_integer_intersection",
    "_is_integrally_surjective",
    "_stack",
]
