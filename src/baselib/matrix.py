# Dense exact matrices and vectors over ZZ and QQ.
#
# The Python-visible object model follows SageMath. Native hosts keep matrix
# entries in FLINT fmpz_mat/fmpq_mat objects; browser hosts use the matching
# portable BigInt backend contract.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime


def _is_base_ring(value: object) -> bool:
    return value is sage.ZZ or value is sage.QQ


def _base_for_values(values: list[Any]) -> sage.Parent:
    for value in values:
        if isinstance(value, sage.Rational):
            return sage.QQ
    return sage.ZZ


def _coerce_values(
    base: sage.Parent,
    values: list[Any],
) -> list[Any]:
    answer = []
    for value in values:
        answer.append(base(value))
    return answer


def _native_matrix(
    base: sage.Parent,
    rows: int,
    cols: int,
    values: list[Any],
) -> Any:
    backend = runtime.flint_backend()
    if base is sage.ZZ:
        entries = []
        for value in values:
            entries.append(runtime.integer_bigint(value))
        return backend.zzMatrix(rows, cols, entries)
    if base is sage.QQ:
        entries = []
        for value in values:
            rational = sage.QQ(value)
            entries.append([
                rational._numerator,
                rational._denominator,
            ])
        return backend.qqMatrix(rows, cols, entries)
    raise TypeError('exact matrices currently require ZZ or QQ')


def _rational_result(value: Any) -> sage.Rational:
    return runtime.rational_class(
        runtime.reflect.get(value, 'numerator'),
        runtime.reflect.get(value, 'denominator'),
    )


def _entry_from_native(base: sage.Parent, value: Any) -> Any:
    if base is sage.ZZ:
        return runtime.normalize_integer(value)
    return _rational_result(value)


def _common_base(
    left: sage.Parent,
    right: sage.Parent,
) -> sage.Parent:
    if left is right:
        return left
    if (
        (left is sage.ZZ and right is sage.QQ)
        or (left is sage.QQ and right is sage.ZZ)
    ):
        return sage.QQ
    raise TypeError(
        'no canonical coercion between matrix base rings ' +
        str(left) + ' and ' + str(right))


def _scalar_parts(value: Any) -> tuple[sage.Parent, int, int]:
    if isinstance(value, sage.Rational):
        return (
            sage.QQ,
            value._numerator,
            value._denominator
        )
    if runtime.is_exact_integer(value):
        return (
            sage.ZZ,
            runtime.integer_bigint(value),
            runtime.bigint(1)
        )
    rational = sage.QQ(value)
    return (
        sage.QQ,
        rational._numerator,
        rational._denominator
    )


def _normalize_index(index: int, length: int) -> int:
    if index < 0:
        index += length
    if index < 0 or index >= length:
        raise IndexError('matrix index out of range')
    return index


@runtime.callable_instance_class
class MatrixSpaceParent(sage.Parent):

    def __init__(
        self,
        base: sage.Parent,
        rows: int,
        cols: int,
    ) -> None:
        self._base = base
        self._rows = rows
        self._cols = cols
        self._name = (
            'Full MatrixSpace of ' + str(rows) + ' by ' + str(cols) +
            ' dense matrices over ' + str(base))
        self._construction = {
            'kind': 'matrix',
            'base': base,
            'rows': rows,
            'cols': cols,
        }

    def base_ring(self) -> sage.Parent:
        return self._base

    def nrows(self) -> int:
        return self._rows

    def ncols(self) -> int:
        return self._cols

    def __call__(self, entries: Any = 0) -> Matrix:
        if isinstance(entries, Matrix):
            if (
                entries.nrows() != self._rows
                or entries.ncols() != self._cols
            ):
                raise ValueError('matrix dimensions do not agree')
            return entries.change_ring(self._base)
        if runtime.is_exact_integer(entries) and entries == 0:
            values = [0 for _ in range(self._rows * self._cols)]
        else:
            values = list(entries)
        if len(values) != self._rows * self._cols:
            raise ValueError(
                'matrix entry count does not match its dimensions')
        coerced = _coerce_values(self._base, values)
        return Matrix(
            self,
            _native_matrix(
                self._base, self._rows, self._cols, coerced),
        )


@runtime.callable_instance_class
class VectorSpaceParent(sage.Parent):

    def __init__(self, base: sage.Parent, degree: int) -> None:
        self._base = base
        self._degree = degree
        self._name = (
            'Ambient free module of rank ' + str(degree) +
            ' over ' + str(base))
        self._construction = {
            'kind': 'vector',
            'base': base,
            'degree': degree,
        }

    def base_ring(self) -> sage.Parent:
        return self._base

    def degree(self) -> int:
        return self._degree

    def dimension(self) -> int:
        return self._degree

    def __call__(self, entries: Any = 0) -> Vector:
        if isinstance(entries, Vector):
            if len(entries) != self._degree:
                raise ValueError('vector dimensions do not agree')
            return entries.change_ring(self._base)
        if runtime.is_exact_integer(entries) and entries == 0:
            values = [0 for _ in range(self._degree)]
        else:
            values = list(entries)
        if len(values) != self._degree:
            raise ValueError(
                'vector entry count does not match its dimension')
        return Vector(self, _coerce_values(self._base, values))


@runtime.sequence_class
@runtime.lightweight_math_class
class Vector(sage.Element):

    def __init__(
        self,
        parent: VectorSpaceParent,
        entries: list[Any],
    ) -> None:
        self._parent = parent
        self._entries = entries

    def base_ring(self) -> sage.Parent:
        return self._parent.base_ring()

    def __len__(self) -> int:
        return len(self._entries)

    def degree(self) -> int:
        return len(self._entries)

    def dimension(self) -> int:
        return len(self._entries)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._entries)

    def __getitem__(self, index: int) -> Any:
        return self._entries[index]

    def list(self) -> list[Any]:
        return list(self._entries)

    def change_ring(self, base: sage.Parent) -> Vector:
        if base is self.base_ring():
            return self
        if base is not sage.QQ or self.base_ring() is not sage.ZZ:
            raise TypeError(
                'unsupported vector base-ring conversion')
        return VectorSpace(base, len(self))(
            _coerce_values(base, self._entries))

    def _pair(self, other: object) -> tuple[Vector, Vector]:
        if not isinstance(other, Vector) or len(self) != len(other):
            raise TypeError('vector dimensions must agree')
        base = _common_base(self.base_ring(), other.base_ring())
        return self.change_ring(base), other.change_ring(base)

    def __add__(self, other: object) -> Vector:
        left, right = self._pair(other)
        values = []
        for index in range(len(left)):
            values.append(
                left._entries[index] + right._entries[index])
        return VectorSpace(left.base_ring(), len(left))(values)

    def __sub__(self, other: object) -> Vector:
        left, right = self._pair(other)
        values = []
        for index in range(len(left)):
            values.append(
                left._entries[index] - right._entries[index])
        return VectorSpace(left.base_ring(), len(left))(values)

    def __neg__(self) -> Vector:
        return VectorSpace(self.base_ring(), len(self))(
            [-value for value in self._entries])

    def __mul__(self, other: object) -> Any:
        if isinstance(other, Vector):
            left, right = self._pair(other)
            total = left.base_ring()(0)
            for index in range(len(left)):
                total += (
                    left._entries[index] * right._entries[index])
            return total
        if isinstance(other, Matrix):
            if len(self) != other.nrows():
                raise ValueError(
                    'vector and matrix dimensions are incompatible')
            result = self.row() * other
            return result.row(0)
        scalar_base, _numerator, _denominator = _scalar_parts(other)
        base = _common_base(self.base_ring(), scalar_base)
        source = self.change_ring(base)
        scalar = base(other)
        return VectorSpace(base, len(source))(
            [value * scalar for value in source])

    def __rmul__(self, other: object) -> Vector:
        return self * other

    def _sage_binop_(
        self,
        operator: str,
        other: object,
        reflected: bool,
    ) -> Any:
        if operator == 'add' and not reflected:
            return self.__add__(other)
        if operator == 'sub' and not reflected:
            return self.__sub__(other)
        if operator == 'mul':
            if reflected:
                return self.__rmul__(other)
            return self.__mul__(other)
        raise TypeError(
            'operation ' + operator + ' is not defined for vectors')

    def dot_product(self, other: Vector) -> Any:
        return self * other

    def column(self) -> Matrix:
        return matrix(
            self.base_ring(), len(self), 1, self._entries)

    def row(self) -> Matrix:
        return matrix(
            self.base_ring(), 1, len(self), self._entries)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Vector) or len(self) != len(other):
            return False
        try:
            left, right = self._pair(other)
        except TypeError:
            return False
        for index in range(len(left)):
            if left._entries[index] != right._entries[index]:
                return False
        return True

    def __repr__(self) -> str:
        return '(' + ', '.join(
            [str(value) for value in self._entries]) + ')'

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class VectorSubspaceParent(sage.Parent):

    def __init__(
        self,
        ambient: VectorSpaceParent,
        basis: Matrix,
        defining_matrix: Any = None,
        left_kernel: bool = True,
    ) -> None:
        self._ambient = ambient
        self._basis_matrix = basis
        self._defining_matrix = defining_matrix
        self._left_kernel = left_kernel
        degree = ambient.degree()
        dimension = self._basis_matrix.nrows()
        if ambient.base_ring() is sage.ZZ:
            self._name = (
                'Free module of degree ' + str(degree) +
                ' and rank ' + str(dimension) +
                ' over ' + str(ambient.base_ring()) +
                '\nEchelon basis matrix:\n' +
                str(self._basis_matrix))
        else:
            self._name = (
                'Vector space of degree ' + str(degree) +
                ' and dimension ' + str(dimension) +
                ' over ' + str(ambient.base_ring()) +
                '\nBasis matrix:\n' + str(self._basis_matrix))
        self._construction = {
            'kind': 'vector-subspace',
            'ambient': ambient,
            'basis': self._basis_matrix,
        }

    def base_ring(self) -> sage.Parent:
        return self._ambient.base_ring()

    def ambient_module(self) -> VectorSpaceParent:
        return self._ambient

    def ambient_vector_space(self) -> VectorSpaceParent:
        return self._ambient

    def degree(self) -> int:
        return self._ambient.degree()

    def dimension(self) -> int:
        return self._basis_matrix.nrows()

    rank = dimension

    def basis_matrix(self) -> Matrix:
        return self._basis_matrix

    def basis(self) -> list[Vector]:
        return self._basis_matrix.rows()

    gens = basis

    def gen(self, index: int = 0) -> Vector:
        return self._basis_matrix.row(index)

    def zero(self) -> Vector:
        return self._ambient(0)

    def __contains__(self, value: object) -> bool:
        try:
            element = self._ambient(value)
        except Exception:
            return False
        if self._defining_matrix is not None:
            if self._left_kernel:
                image = element * self._defining_matrix
            else:
                image = self._defining_matrix * element
            for entry in image:
                if entry != 0:
                    return False
            return True
        extended = matrix(
            self.base_ring(),
            self.dimension() + 1,
            self.degree(),
            self._basis_matrix.list() + element.list(),
        )
        return _canonical_row_basis(extended) == self._basis_matrix

    def __call__(self, entries: Any = 0) -> Vector:
        element = self._ambient(entries)
        if element not in self:
            raise ValueError('vector is not in the subspace')
        return element

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, VectorSubspaceParent)
            and self._ambient is other._ambient
            and self._basis_matrix == other._basis_matrix
        )

    def _compatible_space(
        self,
        other: object,
    ) -> VectorSubspaceParent:
        if (
            not isinstance(other, VectorSubspaceParent)
            or self._ambient is not other._ambient
        ):
            raise TypeError(
                'vector subspaces must have the same ambient space')
        return other

    def __add__(self, other: object) -> VectorSubspaceParent:
        right = self._compatible_space(other)
        combined = matrix(
            self.base_ring(),
            self.dimension() + right.dimension(),
            self.degree(),
            self._basis_matrix.list() +
            right._basis_matrix.list(),
        )
        return VectorSubspaceParent(
            self._ambient,
            _canonical_row_basis(combined),
        )

    def intersection(
        self,
        other: object,
    ) -> VectorSubspaceParent:
        right = self._compatible_space(other)
        if self.dimension() == 0 or right.dimension() == 0:
            return VectorSubspaceParent(
                self._ambient,
                zero_matrix(self.base_ring(), 0, self.degree()),
            )
        relation_entries = self._basis_matrix.list()
        relation_entries.extend(
            [-entry for entry in right._basis_matrix.list()])
        relations = matrix(
            self.base_ring(),
            self.dimension() + right.dimension(),
            self.degree(),
            relation_entries,
        ).left_kernel().basis_matrix()
        coefficient_entries = []
        for row in range(relations.nrows()):
            for col in range(self.dimension()):
                coefficient_entries.append(relations[row, col])
        left_coefficients = matrix(
            self.base_ring(),
            relations.nrows(),
            self.dimension(),
            coefficient_entries,
        )
        common_vectors = left_coefficients * self._basis_matrix
        return VectorSubspaceParent(
            self._ambient,
            _canonical_row_basis(common_vectors),
        )


@runtime.sequence_class
@runtime.lightweight_math_class
class Matrix(sage.Element):

    def __init__(
        self,
        parent: MatrixSpaceParent,
        native_value: Any,
    ) -> None:
        self._parent = parent
        self._native = native_value
        self._determinant_cache = runtime.undefined
        self._rank_cache = runtime.undefined
        self._inverse_cache = runtime.undefined
        self._rref_cache = runtime.undefined
        self._hermite_cache = runtime.undefined
        self._right_kernel_cache = runtime.undefined
        self._left_kernel_cache = runtime.undefined
        self._charpoly_cache = runtime.map()

    def base_ring(self) -> sage.Parent:
        return self._parent.base_ring()

    def nrows(self) -> int:
        return self._parent.nrows()

    def ncols(self) -> int:
        return self._parent.ncols()

    def dimensions(self) -> tuple[int, int]:
        return (self.nrows(), self.ncols())

    def is_square(self) -> bool:
        return self.nrows() == self.ncols()

    def __len__(self) -> int:
        return self.nrows()

    def _entry(self, row: int, col: int) -> Any:
        row = _normalize_index(row, self.nrows())
        col = _normalize_index(col, self.ncols())
        return _entry_from_native(
            self.base_ring(),
            runtime.flint_backend().matrixEntry(
                self._native, row, col),
        )

    def __getitem__(self, index: Any) -> Any:
        if isinstance(index, tuple):
            if len(index) != 2:
                raise IndexError('matrix index must have two components')
            return self._entry(index[0], index[1])
        return self.row(index)

    def list(self) -> list[Any]:
        answer = []
        for row in range(self.nrows()):
            for col in range(self.ncols()):
                answer.append(self._entry(row, col))
        return answer

    def row(self, index: int) -> Vector:
        index = _normalize_index(index, self.nrows())
        return vector(
            self.base_ring(),
            [self._entry(index, col) for col in range(self.ncols())],
        )

    def rows(self) -> list[Vector]:
        return [self.row(index) for index in range(self.nrows())]

    def column(self, index: int) -> Vector:
        index = _normalize_index(index, self.ncols())
        return vector(
            self.base_ring(),
            [self._entry(row, index) for row in range(self.nrows())],
        )

    def columns(self) -> list[Vector]:
        return [
            self.column(index) for index in range(self.ncols())
        ]

    def change_ring(self, base: sage.Parent) -> Matrix:
        if base is self.base_ring():
            return self
        if base is sage.QQ and self.base_ring() is sage.ZZ:
            return Matrix(
                MatrixSpace(base, self.nrows(), self.ncols()),
                runtime.flint_backend().zzMatrixToQQ(self._native),
            )
        raise TypeError('unsupported matrix base-ring conversion')

    def _pair(self, other: object) -> tuple[Matrix, Matrix]:
        if (
            not isinstance(other, Matrix)
            or self.dimensions() != other.dimensions()
        ):
            raise TypeError('matrix dimensions must agree')
        base = _common_base(self.base_ring(), other.base_ring())
        return self.change_ring(base), other.change_ring(base)

    def __add__(self, other: object) -> Matrix:
        left, right = self._pair(other)
        return Matrix(
            left._parent,
            runtime.flint_backend().matrixAdd(
                left._native, right._native),
        )

    def __sub__(self, other: object) -> Matrix:
        left, right = self._pair(other)
        return Matrix(
            left._parent,
            runtime.flint_backend().matrixSub(
                left._native, right._native),
        )

    def __neg__(self) -> Matrix:
        return Matrix(
            self._parent,
            runtime.flint_backend().matrixNeg(self._native),
        )

    def _scalar_mul(self, scalar: object) -> Matrix:
        scalar_base, numerator, denominator = _scalar_parts(scalar)
        base = _common_base(self.base_ring(), scalar_base)
        source = self.change_ring(base)
        return Matrix(
            source._parent,
            runtime.flint_backend().matrixScalarMul(
                source._native, numerator, denominator),
        )

    def __mul__(self, other: object) -> Any:
        if isinstance(other, Vector):
            if self.ncols() != len(other):
                raise ValueError(
                    'matrix and vector dimensions are incompatible')
            base = _common_base(
                self.base_ring(), other.base_ring())
            left = self.change_ring(base)
            right = other.change_ring(base).column()
            product = left * right
            return product.column(0)
        if isinstance(other, Matrix):
            if self.ncols() != other.nrows():
                raise ValueError(
                    'matrix dimensions are incompatible for multiplication')
            base = _common_base(
                self.base_ring(), other.base_ring())
            left = self.change_ring(base)
            right = other.change_ring(base)
            return Matrix(
                MatrixSpace(
                    base, left.nrows(), right.ncols()),
                runtime.flint_backend().matrixMul(
                    left._native, right._native),
            )
        return self._scalar_mul(other)

    def __matmul__(self, other: object) -> Any:
        return self * other

    def __rmul__(self, other: object) -> Matrix:
        return self._scalar_mul(other)

    def _sage_binop_(
        self,
        operator: str,
        other: object,
        reflected: bool,
    ) -> Any:
        if operator == 'add' and not reflected:
            return self.__add__(other)
        if operator == 'sub' and not reflected:
            return self.__sub__(other)
        if operator == 'mul':
            if reflected:
                return self.__rmul__(other)
            return self.__mul__(other)
        if operator == 'truediv' and not reflected:
            return self.__truediv__(other)
        raise TypeError(
            'operation ' + operator + ' is not defined for matrices')

    def __truediv__(self, scalar: object) -> Matrix:
        _base, numerator, denominator = _scalar_parts(scalar)
        if numerator == 0:
            raise ZeroDivisionError('matrix division by zero')
        reciprocal = runtime.rational_class(
            denominator, numerator)
        return self._scalar_mul(reciprocal)

    def __pow__(self, exponent: int) -> Matrix:
        exponent = int(exponent)
        if not self.is_square():
            raise ArithmeticError('matrix must be square')
        if exponent < 0:
            return self.inverse() ** (-exponent)
        answer = identity_matrix(
            self.base_ring(), self.nrows())
        power = self
        while exponent:
            if exponent % 2:
                answer = answer * power
            exponent //= 2
            if exponent:
                power = power * power
        return answer

    def transpose(self) -> Matrix:
        return Matrix(
            MatrixSpace(
                self.base_ring(), self.ncols(), self.nrows()),
            runtime.flint_backend().matrixTranspose(self._native),
        )

    @property
    def T(self) -> Matrix:
        return self.transpose()

    def determinant(self) -> Any:
        if not self.is_square():
            raise ValueError(
                'determinant is only defined for square matrices')
        if self._determinant_cache is not runtime.undefined:
            return self._determinant_cache
        value = runtime.flint_backend().matrixDet(self._native)
        self._determinant_cache = _entry_from_native(
            self.base_ring(), value)
        return self._determinant_cache

    det = determinant

    def rank(self) -> int:
        if self._rank_cache is runtime.undefined:
            self._rank_cache = runtime.flint_backend().matrixRank(
                self._native)
        return self._rank_cache

    def density(self) -> float:
        if self.nrows() == 0 or self.ncols() == 0:
            return 0.0
        nonzero = 0
        for value in self.list():
            if value != 0:
                nonzero += 1
        return nonzero / (self.nrows() * self.ncols())

    def is_sparse(self) -> bool:
        return False

    def rref(self) -> Matrix:
        if self._rref_cache is runtime.undefined:
            self._rref_cache = Matrix(
                MatrixSpace(sage.QQ, self.nrows(), self.ncols()),
                runtime.flint_backend().matrixRref(self._native),
            )
        return self._rref_cache

    def hermite_form(self) -> Matrix:
        if self.base_ring() is not sage.ZZ:
            raise TypeError(
                'Hermite form currently requires an integer matrix')
        if self._hermite_cache is runtime.undefined:
            self._hermite_cache = Matrix(
                self._parent,
                runtime.flint_backend().matrixHermite(self._native),
            )
        return self._hermite_cache

    def echelon_form(self) -> Matrix:
        if self.base_ring() is sage.ZZ:
            return self.hermite_form()
        return self.rref()

    def right_kernel(self) -> VectorSubspaceParent:
        if self._right_kernel_cache is runtime.undefined:
            nullity = self.ncols() - self.rank()
            basis = Matrix(
                MatrixSpace(
                    self.base_ring(), nullity, self.ncols()),
                runtime.flint_backend().matrixRightKernel(
                    self._native),
            )
            self._right_kernel_cache = VectorSubspaceParent(
                VectorSpace(self.base_ring(), self.ncols()),
                basis,
                self,
                False,
            )
        return self._right_kernel_cache

    def left_kernel(self) -> VectorSubspaceParent:
        if self._left_kernel_cache is runtime.undefined:
            basis = self.transpose().right_kernel().basis_matrix()
            self._left_kernel_cache = VectorSubspaceParent(
                VectorSpace(self.base_ring(), self.nrows()),
                basis,
                self,
                True,
            )
        return self._left_kernel_cache

    kernel = left_kernel

    def charpoly(self, variable: str = 'x') -> Any:
        if not self.is_square():
            raise ArithmeticError('matrix must be square')
        cached = self._charpoly_cache.get(variable)
        if cached is not runtime.undefined:
            return cached
        ring = sage.PolynomialRing(self.base_ring(), variable)
        generator = ring.gen()
        power = ring(1)
        answer = ring(0)
        coefficients = runtime.flint_backend().matrixCharpoly(
            self._native)
        for raw_coefficient in coefficients:
            coefficient = _entry_from_native(
                self.base_ring(), raw_coefficient)
            answer += ring(coefficient) * power
            power *= generator
        self._charpoly_cache.set(variable, answer)
        return answer

    characteristic_polynomial = charpoly

    def inverse(self) -> Matrix:
        if not self.is_square():
            raise ArithmeticError('matrix must be square')
        if self._inverse_cache is not runtime.undefined:
            return self._inverse_cache
        native_value = runtime.undefined
        try:
            native_value = runtime.flint_backend().matrixInverse(
                self._native)
        except Exception:
            pass
        if native_value is runtime.undefined:
            raise ZeroDivisionError('matrix must be nonsingular')
        self._inverse_cache = Matrix(
            MatrixSpace(sage.QQ, self.nrows(), self.ncols()),
            native_value,
        )
        return self._inverse_cache

    def __invert__(self) -> Matrix:
        return self.inverse()

    def solve_right(self, right: object) -> Any:
        if isinstance(right, Vector):
            vector_result = True
            right_matrix = right.column()
        elif isinstance(right, Matrix):
            vector_result = False
            right_matrix = matrix(right)
        else:
            right_matrix = vector(right).column()
            vector_result = True
        if right_matrix.nrows() != self.nrows():
            raise ValueError('matrix and right side dimensions disagree')
        native_value = runtime.undefined
        try:
            native_value = runtime.flint_backend().matrixSolve(
                self._native, right_matrix._native)
        except Exception:
            pass
        if native_value is runtime.undefined:
            raise ValueError('matrix equation has no solutions')
        result = Matrix(
            MatrixSpace(
                sage.QQ, self.ncols(), right_matrix.ncols()),
            native_value,
        )
        return result.column(0) if vector_result else result

    def solve_left(self, left: object) -> Any:
        if isinstance(left, Vector):
            return self.transpose().solve_right(left).row()
        if not isinstance(left, Matrix):
            left = matrix(left)
        return self.transpose().solve_right(
            left.transpose()).transpose()

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Matrix):
            return False
        if self.dimensions() != other.dimensions():
            return False
        try:
            base = _common_base(
                self.base_ring(), other.base_ring())
        except TypeError:
            return False
        left = self.change_ring(base)
        right = other.change_ring(base)
        return runtime.flint_backend().matrixEqual(
            left._native, right._native)

    def __repr__(self) -> str:
        if self.nrows() == 0:
            return '[]'
        text_rows = []
        widths = [0 for _ in range(self.ncols())]
        for row in range(self.nrows()):
            text_row = []
            for col in range(self.ncols()):
                text = str(self._entry(row, col))
                text_row.append(text)
                widths[col] = max(widths[col], len(text))
            text_rows.append(text_row)
        lines = []
        for text_row in text_rows:
            entries = []
            for col in range(self.ncols()):
                entries.append(text_row[col].rjust(widths[col]))
            lines.append('[' + ' '.join(entries) + ']')
        return '\n'.join(lines)

    __str__ = __repr__
    toString = __repr__


def _canonical_row_basis(source: Matrix) -> Matrix:
    echelon = source.echelon_form()
    rows = []
    for row in echelon.rows():
        if any(entry != 0 for entry in row):
            rows.append(row)
    entries = []
    for row in rows:
        entries.extend(row)
    return matrix(
        source.base_ring(),
        len(rows),
        source.ncols(),
        entries,
    )


_matrix_space_cache = runtime.map()
_vector_space_cache = runtime.map()


def MatrixSpace(
    base: sage.Parent,
    rows: int,
    cols: Any = None,
) -> MatrixSpaceParent:
    if base is not sage.ZZ and base is not sage.QQ:
        raise TypeError(
            'exact matrices currently require ZZ or QQ')
    rows = int(rows)
    cols = rows if cols is None else int(cols)
    if rows < 0 or cols < 0:
        raise ValueError('matrix dimensions must be nonnegative')
    by_dimensions = _matrix_space_cache.get(base)
    if by_dimensions is runtime.undefined:
        by_dimensions = runtime.map()
        _matrix_space_cache.set(base, by_dimensions)
    key = str(rows) + 'x' + str(cols)
    parent = by_dimensions.get(key)
    if parent is runtime.undefined:
        parent = MatrixSpaceParent(base, rows, cols)
        by_dimensions.set(key, parent)
    return parent


def VectorSpace(
    base: sage.Parent,
    degree: int,
) -> VectorSpaceParent:
    if base is not sage.ZZ and base is not sage.QQ:
        raise TypeError(
            'exact vectors currently require ZZ or QQ')
    degree = int(degree)
    if degree < 0:
        raise ValueError('vector dimension must be nonnegative')
    by_degree = _vector_space_cache.get(base)
    if by_degree is runtime.undefined:
        by_degree = runtime.map()
        _vector_space_cache.set(base, by_degree)
    parent = by_degree.get(degree)
    if parent is runtime.undefined:
        parent = VectorSpaceParent(base, degree)
        by_degree.set(degree, parent)
    return parent


def _matrix_data(value: Any) -> tuple[int, int, list[Any]]:
    rows = list(value)
    if not rows:
        return 0, 0, []
    if not isinstance(rows[0], (list, tuple, Vector)):
        raise TypeError('matrix rows must be sequences')
    first = list(rows[0])
    cols = len(first)
    values = []
    for row in rows:
        entries = list(row)
        if len(entries) != cols:
            raise ValueError('matrix rows must all have the same length')
        values.extend(entries)
    return len(rows), cols, values


def matrix(*args: Any) -> Matrix:
    if not args:
        raise TypeError('matrix() requires entries or dimensions')
    values = list(args)
    base = None
    if _is_base_ring(values[0]):
        base = values.pop(0)
    if len(values) == 1:
        if isinstance(values[0], Matrix):
            source = values[0]
            return (
                source if base is None
                else source.change_ring(base)
            )
        rows, cols, entries = _matrix_data(values[0])
    elif len(values) == 2:
        rows = int(values[0])
        if runtime.is_exact_integer(values[1]):
            cols = int(values[1])
            entries = [0 for _ in range(rows * cols)]
        else:
            entries = list(values[1])
            if rows == 0:
                cols = 0
            elif len(entries) % rows != 0:
                raise ValueError(
                    'matrix entry count is not divisible by row count')
            else:
                cols = len(entries) // rows
    elif len(values) == 3:
        rows = int(values[0])
        cols = int(values[1])
        source = values[2]
        if callable(source):
            entries = []
            entry_function = source
            for row in range(rows):
                for col in range(cols):
                    entries.append(entry_function(row, col))
        elif runtime.is_exact_integer(source) and source == 0:
            entries = [0 for _ in range(rows * cols)]
        else:
            entries = list(source)
    else:
        raise TypeError('unsupported matrix() constructor signature')
    if rows < 0 or cols < 0:
        raise ValueError('matrix dimensions must be nonnegative')
    if len(entries) != rows * cols:
        raise ValueError(
            'matrix entry count does not match its dimensions')
    if base is None:
        base = _base_for_values(entries)
    return MatrixSpace(base, rows, cols)(entries)


def vector(*args: Any) -> Vector:
    if not args:
        raise TypeError('vector() requires entries')
    values = list(args)
    base = None
    if _is_base_ring(values[0]):
        base = values.pop(0)
    if len(values) != 1:
        raise TypeError('unsupported vector() constructor signature')
    if isinstance(values[0], Vector):
        source = values[0]
        return (
            source if base is None
            else source.change_ring(base)
        )
    entries = list(values[0])
    if base is None:
        base = _base_for_values(entries)
    return VectorSpace(base, len(entries))(entries)


def zero_matrix(
    base: sage.Parent,
    rows: int,
    cols: Any = None,
) -> Matrix:
    cols = rows if cols is None else cols
    return MatrixSpace(base, rows, cols)(0)


def identity_matrix(base: sage.Parent, size: int) -> Matrix:
    entries = []
    for row in range(size):
        for col in range(size):
            entries.append(1 if row == col else 0)
    return matrix(base, size, size, entries)


def diagonal_matrix(
    base: Any,
    diagonal: Any = None,
) -> Matrix:
    if diagonal is None:
        diagonal = base
        values = list(diagonal)
        base = _base_for_values(values)
    else:
        values = list(diagonal)
    size = len(values)
    entries = []
    for row in range(size):
        for col in range(size):
            entries.append(values[row] if row == col else 0)
    return matrix(base, size, size, entries)


def _random_float() -> float:
    state = runtime.reflect.get(
        runtime.global_object, '__sagejs_random_state__')
    if state is runtime.undefined:
        state = runtime.math.floor(
            runtime.math.random() * 4294967296)
    state = runtime.native_mod(
        runtime.native_add(
            runtime.native_mul(1664525, state),
            1013904223,
        ),
        4294967296,
    )
    runtime.reflect.set(
        runtime.global_object, '__sagejs_random_state__', state)
    return runtime.native_div(state, 4294967296)


def _random_int(start: int, stop: int) -> int:
    return int(
        runtime.math.floor(
            _random_float() * (stop - start + 1)
        )
        + start
    )


def _random_integer(
    distribution: Any,
    lower: Any,
    upper: Any,
    nonzero: bool,
) -> int:
    while True:
        if lower is not None:
            if upper is None:
                value = _random_int(0, int(lower) - 1)
            else:
                value = _random_int(
                    int(lower), int(upper) - 1)
        elif distribution == 'uniform':
            value = _random_int(-2, 2)
        else:
            first = float(_random_float())
            if first < 0.2:
                value = 0
            else:
                tail = float(_random_float())
                while tail == 0:
                    tail = float(_random_float())
                magnitude = int(1 / tail)
                value = (
                    magnitude
                    if float(_random_float()) < 0.5
                    else -magnitude
                )
        if not nonzero or value != 0:
            return value


def random_matrix(
    base: sage.Parent,
    nrows: int,
    ncols: Any = None,
    algorithm: str = 'randomize',
    implementation: Any = None,
    *args: Any,
    **kwds: Any,
) -> Matrix:
    def keyword(name: str, fallback: Any) -> Any:
        value = runtime.reflect.get(kwds, name)
        return fallback if value is runtime.undefined else value

    if base is not sage.ZZ and base is not sage.QQ:
        raise TypeError(
            'random_matrix currently requires ZZ or QQ')
    if algorithm != 'randomize':
        raise NotImplementedError(
            "random_matrix algorithm '" + algorithm +
            "' is not implemented yet")
    if implementation is not None:
        raise NotImplementedError(
            'alternate matrix implementations are not available')
    if len(args) != 0:
        raise TypeError('unexpected positional random_matrix arguments')
    if keyword('sparse', False):
        raise NotImplementedError('sparse matrices are not available')
    rows = int(nrows)
    cols = rows if ncols is None else int(ncols)
    if rows < 0 or cols < 0:
        raise ValueError('matrix dimensions must be nonnegative')
    density = float(keyword('density', 1.0))
    if density < 0 or density > 1:
        raise ValueError('density must be between 0 and 1')
    distribution = keyword('distribution', None)
    if (
        distribution is not None
        and distribution != 'uniform'
    ):
        raise ValueError('unknown random integer distribution')
    lower = keyword('x', None)
    upper = keyword('y', None)
    if upper is not None and lower is None:
        raise TypeError('y requires x')
    if base is sage.QQ and (
        lower is not None or distribution is not None
    ):
        raise TypeError(
            'QQ random matrices do not accept x, y, or distribution')
    if lower is not None:
        lower = int(lower)
        if upper is not None:
            upper = int(upper)
            if upper <= lower:
                raise ValueError('y must be greater than x')
        elif lower <= 0:
            raise ValueError('x must be positive when y is omitted')

    values = [0 for _ in range(rows * cols)]
    if density == 1:
        for index in range(len(values)):
            value = _random_integer(
                distribution, lower, upper, False)
            values[index] = base(value)
    else:
        choices_per_row = int(density * cols)
        for row in range(rows):
            for _ in range(choices_per_row):
                column = _random_int(0, cols - 1)
                value = _random_integer(
                    distribution, lower, upper, True)
                values[row * cols + column] = base(value)
    return matrix(base, rows, cols, values)


runtime.set_class_repr(Matrix, "<class 'Matrix'>")
runtime.set_class_repr(Vector, "<class 'Vector'>")
runtime.set_class_repr(
    MatrixSpaceParent, "<class 'MatrixSpace'>")
runtime.set_class_repr(
    VectorSpaceParent, "<class 'VectorSpace'>")
runtime.set_class_repr(
    VectorSubspaceParent, "<class 'VectorSubspace'>")
runtime.reflect.set(matrix, 'random', random_matrix)
