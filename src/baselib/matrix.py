# Dense matrices and vectors over exact and approximate Sage rings.
#
# The Python-visible object model follows SageMath. Native hosts use FLINT
# matrices, including Arb/ACB for approximate real and complex arithmetic;
# browser hosts use the portable exact-matrix backend where available.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime


def _dense_prime_kernel_module() -> Any:
    """Load the source-transparent dense ``GF(p)`` kernel lazily."""
    loader = runtime.reflect.get(
        runtime.global_object, '__sagejs_load_module__')
    if loader is runtime.undefined:
        raise RuntimeError('the dense prime-field kernel loader is unavailable')
    return runtime.reflect.apply(
        loader, runtime.undefined, ['sagejs.kernels.dense_prime'])


def _native_kernel_available(kernel_function: Any) -> bool:
    return bool(getattr(kernel_function, 'nativeAvailable', False))


def _trace_dense_prime_selection(
    operation: str,
    implementation: str,
    rows: int,
    columns: int,
    modulus: int,
) -> None:
    """Report an explicitly requested production-kernel selection."""
    if runtime.reflect.get(
        runtime.global_object,
        '__sagejs_native_trace_enabled__',
    ) is True:
        print(
            f'[sagejs native] Matrix.{operation} GF({modulus}) '
            f'{rows}x{columns} -> {implementation}')


def _dense_prime_kernel_loader_available() -> bool:
    """Whether this host can resolve separately compiled kernel modules."""
    return runtime.reflect.get(
        runtime.global_object, '__sagejs_load_module__') is not runtime.undefined


# Matrix currently owns a native FLINT object, so exporting residues dominates
# the otherwise-fast packed kernels. Production operations retain the
# end-to-end FLINT winner until packed storage itself becomes canonical.


def _uses_dense_prime_kernel(base: sage.Parent) -> bool:
    """Return whether the packed compiler ABI supports this prime field."""
    return (
        _dense_prime_kernel_loader_available()
        and getattr(base, '_kind', None) == 'GF'
        and int(_untyped(base).characteristic()) <= 0xFFFFFFFF
    )


def _dense_prime_buffer(kernel_function: Any, source: Any) -> Any:
    """Return the public packed buffer expected by a compiled kernel."""
    adapter = getattr(kernel_function, 'asUInt64Buffer', None)
    if callable(adapter):
        return adapter(source)
    factory = getattr(kernel_function, 'createUInt64Buffer', None)
    if callable(factory):
        return factory(source)
    return list(source)


def _dense_prime_zeros(kernel_function: Any, length: int) -> Any:
    """Allocate caller-owned packed output or dynamic fallback storage."""
    factory = getattr(kernel_function, 'createUInt64Buffer', None)
    if callable(factory):
        return factory(length)
    return [0 for _index in range(length)]


def _untyped(value: Any) -> Any:
    return value


def _is_modular_base(value: object) -> bool:
    return getattr(value, '_kind', None) in ['GF', 'ZMOD']


def _is_extension_field_base(value: object) -> bool:
    return getattr(value, '_kind', None) == 'GF_EXTENSION'


def _is_algebraic_base(value: object) -> bool:
    return getattr(value, '_kind', None) in [
        'AA', 'QQBAR', 'CyclotomicField']


def _is_approximate_base(value: object) -> bool:
    return getattr(value, '_kind', None) in [
        'RDF',
        'RealField',
        'ComplexDoubleField',
        'ComplexField',
    ]


def _is_complex_base(value: object) -> bool:
    return getattr(value, '_kind', None) in [
        'ComplexDoubleField',
        'ComplexField',
    ]


def _is_base_ring(value: object) -> bool:
    return (
        value is sage.ZZ
        or value is sage.QQ
        or getattr(value, '_kind', None) == 'ZZ'
        or getattr(value, '_kind', None) == 'QQ'
        or _is_modular_base(value)
        or _is_extension_field_base(value)
        or _is_algebraic_base(value)
        or _is_approximate_base(value)
    )


def _cyclotomic_order(value: Any) -> Any:
    return value.zeta_order()


def _canonical_base(base: sage.Parent) -> sage.Parent:
    if base is sage.ZZ or getattr(base, '_kind', None) == 'ZZ':
        return sage.ZZ
    if base is sage.QQ or getattr(base, '_kind', None) == 'QQ':
        return sage.QQ
    return base


def _base_for_values(values: list[Any]) -> sage.Parent:
    for value in values:
        if isinstance(value, sage.Rational):
            return sage.QQ
        parent = getattr(value, '_parent', None)
        if _is_algebraic_base(parent):
            return runtime.reflect.get(value, '_parent')
        if _is_approximate_base(parent):
            return runtime.reflect.get(value, '_parent')
        if (
            _is_modular_base(parent)
            or _is_extension_field_base(parent)
        ):
            return _canonical_base(
                runtime.reflect.get(value, '_parent'))
        if (
            runtime.jstype(value) == 'number'
            and not runtime.number.isSafeInteger(value)
        ):
            return runtime.reflect.get(
                runtime.global_object, 'RDF')
    return sage.ZZ


def _approximate_precision(base: sage.Parent) -> int:
    return int(_untyped(base).precision())


def _complex_field(precision: int) -> sage.Parent:
    constructor = runtime.reflect.get(
        runtime.global_object, 'ComplexField')
    return constructor(precision)


def _complex_result_base(base: sage.Parent) -> sage.Parent:
    if getattr(base, '_kind', None) == 'RDF':
        return runtime.reflect.get(
            runtime.global_object, 'CDF')
    return _complex_field(_approximate_precision(base))


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
    if _is_algebraic_base(base):
        entries = []
        for value in values:
            entries.append(runtime.reflect.get(
                base(value), '_native'))
        return backend.qqbarMatrix(
            rows,
            cols,
            entries,
            getattr(base, '_kind', None) == 'AA',
        )
    if _is_extension_field_base(base):
        entries = []
        for value in values:
            entries.append(runtime.reflect.get(
                base(value), '_native'))
        return backend.fqMatrix(
            runtime.reflect.get(base, '_nativeContext'),
            rows,
            cols,
            entries,
        )
    if _is_modular_base(base):
        entries = []
        for value in values:
            entries.append(base(value)._value)
        if getattr(base, '_kind', None) == 'ZMOD':
            return backend.zmodMatrix(
                rows, cols, entries, base._modulus)
        return backend.nmodMatrix(
            rows, cols, entries, base._modulus)
    if _is_approximate_base(base):
        field = _complex_field(_approximate_precision(base))
        entries = []
        for value in values:
            entries.append(
                runtime.reflect.get(field(value), '_native'))
        return backend.acbMatrix(
            rows,
            cols,
            entries,
            _approximate_precision(base),
        )
    raise TypeError(
        'matrices currently require ZZ, QQ, AA, QQbar, GF, Zmod, '
        'or a real/complex field')


def _rational_result(value: Any) -> sage.Rational:
    return runtime.rational_class(
        runtime.reflect.get(value, 'numerator'),
        runtime.reflect.get(value, 'denominator'),
    )


def _entry_from_native(base: sage.Parent, value: Any) -> Any:
    if base is sage.ZZ:
        return runtime.normalize_integer(value)
    if _is_algebraic_base(base):
        return _untyped(base)._from_native(value)
    if _is_extension_field_base(base):
        return _untyped(base)._from_native(value)
    if _is_modular_base(base):
        return base(value)
    if _is_approximate_base(base):
        field = _complex_field(_approximate_precision(base))
        complex_value = _untyped(field)._fromNative(value)
        if _is_complex_base(base):
            return _untyped(base)._fromNative(value)
        if getattr(base, '_kind', None) == 'RDF':
            return float(complex_value.real())
        return complex_value.real()
    return _rational_result(value)


def _common_base(
    left: sage.Parent,
    right: sage.Parent,
) -> sage.Parent:
    if left is right:
        return left
    if _is_algebraic_base(left) or _is_algebraic_base(right):
        if left is sage.ZZ or left is sage.QQ:
            return right
        if right is sage.ZZ or right is sage.QQ:
            return left
        if _is_algebraic_base(left) and _is_algebraic_base(right):
            if getattr(left, '_kind', None) == 'QQBAR':
                return left
            if getattr(right, '_kind', None) == 'QQBAR':
                return right
            return left
    if _is_approximate_base(left) or _is_approximate_base(right):
        if left is sage.ZZ or left is sage.QQ:
            return right
        if right is sage.ZZ or right is sage.QQ:
            return left
        if (
            _is_approximate_base(left)
            and _is_approximate_base(right)
        ):
            precision = max(
                _approximate_precision(left),
                _approximate_precision(right),
            )
            if _is_complex_base(left) or _is_complex_base(right):
                if (
                    precision == 53
                    and getattr(left, '_kind', None)
                    == 'ComplexDoubleField'
                    and getattr(right, '_kind', None)
                    == 'ComplexDoubleField'
                ):
                    return left
                return _complex_field(precision)
            if (
                precision == 53
                and getattr(left, '_kind', None) == 'RDF'
                and getattr(right, '_kind', None) == 'RDF'
            ):
                return left
            real_field = runtime.reflect.get(
                runtime.global_object, 'RealField')
            return real_field(precision)
    if (
        (left is sage.ZZ and right is sage.QQ)
        or (left is sage.QQ and right is sage.ZZ)
    ):
        return sage.QQ
    if _is_modular_base(left):
        if right is sage.ZZ:
            return left
        if _is_modular_base(right) and left is right:
            return left
    if _is_modular_base(right) and left is sage.ZZ:
        return right
    if _is_extension_field_base(left):
        if right is sage.ZZ:
            return left
        if _is_extension_field_base(right) and left is right:
            return left
    if _is_extension_field_base(right) and left is sage.ZZ:
        return right
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


def _matrix_scalar_parts(
    base: sage.Parent,
    value: Any,
) -> tuple[sage.Parent, int, int]:
    if _is_modular_base(base):
        scalar = base(value)
        return (
            base,
            scalar._value,
            runtime.bigint(1)
        )
    if _is_extension_field_base(base):
        return (base, 0, 1)
    if _is_algebraic_base(base):
        return (base, 0, 1)
    if _is_approximate_base(base):
        return (base, 0, 1)
    parent = getattr(value, '_parent', None)
    if _is_extension_field_base(parent):
        return (
            runtime.reflect.get(value, '_parent'),
            0,
            1
        )
    if _is_algebraic_base(parent):
        return (
            runtime.reflect.get(value, '_parent'),
            0,
            1
        )
    return _scalar_parts(value)


def _normalize_index(index: int, length: int) -> int:
    if index < 0:
        index += length
    if index < 0 or index >= length:
        raise IndexError('matrix index out of range')
    return index


def _normalize_named_index(
    index: int,
    length: int,
    kind: str,
) -> int:
    if index < 0:
        index += length
    if index < 0 or index >= length:
        raise IndexError(kind + ' index out of range')
    return index


def _approximate_value_from_native(
    base: sage.Parent,
    native_value: Any,
    force_complex: bool = False,
) -> Any:
    precision = _approximate_precision(base)
    complex_field = _complex_field(precision)
    value = _untyped(complex_field)._fromNative(native_value)
    if (
        not force_complex
        and float(value.imag()) == 0
        and not _is_complex_base(base)
    ):
        if getattr(base, '_kind', None) == 'RDF':
            return float(value.real())
        return value.real()
    if _is_complex_base(base):
        return _untyped(base)._fromNative(native_value)
    return _untyped(
        _complex_result_base(base))._fromNative(native_value)


def _approximate_vector_from_native(
    base: sage.Parent,
    native_values: list[Any],
    force_complex: bool,
) -> Vector:
    values = [
        _approximate_value_from_native(
            base, value, force_complex)
        for value in native_values
    ]
    vector_base = base
    if (
        force_complex
        and not _is_complex_base(vector_base)
    ):
        vector_base = _complex_result_base(vector_base)
    return VectorSpace(vector_base, len(values))(values)


@runtime.callable_instance_class
class MatrixSpaceParent(sage.Parent):

    def __init__(
        self,
        base: sage.Parent,
        rows: int,
        cols: int,
        sparse: bool = False,
    ) -> None:
        self._base = base
        self._rows = rows
        self._cols = cols
        self._sparse = sparse
        self._name = (
            'Full MatrixSpace of ' + str(rows) + ' by ' + str(cols) +
            (' sparse matrices over ' if sparse else ' dense matrices over ') +
            str(base))
        self._construction = {
            'kind': 'matrix',
            'base': base,
            'rows': rows,
            'cols': cols,
            'sparse': sparse,
        }

    def base_ring(self) -> sage.Parent:
        return self._base

    def nrows(self) -> int:
        return self._rows

    def ncols(self) -> int:
        return self._cols

    def zero_matrix(self) -> Matrix:
        return self(0)

    zero = zero_matrix

    def _from_native(self, native_value: Any) -> Matrix:
        """Construct an element from a trusted native matrix handle."""
        return Matrix(self, native_value)

    def _from_packed_residues(
        self,
        entries: Any,
        width: int,
    ) -> Matrix:
        """Construct a modular matrix from packed little-endian residues."""
        backend = runtime.flint_backend()
        if getattr(self._base, '_kind', None) == 'ZMOD':
            native = backend.zmodMatrixPacked(
                self._rows,
                self._cols,
                entries,
                width,
                self._base._modulus,
            )
        else:
            native = backend.nmodMatrixPacked(
                self._rows,
                self._cols,
                entries,
                width,
                self._base._modulus,
            )
        return Matrix(self, native)

    def _from_uint64_residues(self, entries: Any) -> Matrix:
        """Construct ``GF(p)`` storage from canonical row-major residues."""
        if getattr(self._base, '_kind', None) != 'GF':
            raise TypeError('uint64 residues require a prime field')
        if len(entries) != self._rows * self._cols:
            raise ValueError('matrix residue count does not match dimensions')
        values = [
            _untyped(self._base(entries[index]))._value
            for index in range(len(entries))]
        native = runtime.flint_backend().nmodMatrix(
            self._rows,
            self._cols,
            values,
            self._base._modulus,
        )
        result = Matrix(self, native)
        result._prime_residues_cache = entries
        return result

    def _from_packed_integers(self, entries: Any) -> Matrix:
        """Construct an integer matrix from packed signed magnitudes."""
        return Matrix(
            self,
            runtime.flint_backend().zzMatrixPacked(
                self._rows, self._cols, entries),
        )

    def _from_packed_rationals(self, entries: Any) -> Matrix:
        """Construct a rational matrix from packed numerator/denominator data."""
        return Matrix(
            self,
            runtime.flint_backend().qqMatrixPacked(
                self._rows, self._cols, entries),
        )

    def identity_matrix(self) -> Matrix:
        if self._rows != self._cols:
            raise TypeError('identity matrix must be square')
        return identity_matrix(self._base, self._rows)

    one = identity_matrix

    def basis(self) -> MatrixBasis:
        return MatrixBasis(self)

    def random_element(
        self,
        density: float = 1.0,
        x: int = -2,
        y: int = 2,
    ) -> Matrix:
        probability = float(density)
        if probability < 0 or probability > 1:
            raise ValueError('density must be between 0 and 1')
        entries = []
        for _index in range(self._rows * self._cols):
            if _random_float() > probability:
                entries.append(0)
            elif getattr(
                self._base, '_kind', None
            ) in ['GF', 'GF_EXTENSION', 'ZMOD']:
                entries.append(
                    _random_int(
                        0, int(_untyped(self._base).order()) - 1))
            else:
                entries.append(_random_int(x, y))
        return self(entries)

    def matrix_space(
        self,
        rows: Any = None,
        cols: Any = None,
    ) -> MatrixSpaceParent:
        rows = self._rows if rows is None else int(rows)
        cols = self._cols if cols is None else int(cols)
        return MatrixSpace(self._base, rows, cols)

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
            if (
                len(values) == self._rows
                and len(values) > 0
                and isinstance(values[0], (list, tuple, Vector))
            ):
                flattened = []
                for row in values:
                    row_values = list(row)
                    if len(row_values) != self._cols:
                        raise ValueError(
                            'matrix row length does not match its dimensions')
                    flattened.extend(row_values)
                values = flattened
        if len(values) != self._rows * self._cols:
            raise ValueError(
                'matrix entry count does not match its dimensions')
        coerced = _coerce_values(self._base, values)
        result = Matrix(
            self,
            _native_matrix(
                self._base, self._rows, self._cols, coerced),
        )
        if getattr(self._base, '_kind', None) == 'GF':
            result._prime_residues_cache = [
                _untyped(value)._value for value in coerced]
        return result


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

    def subspace(self, generators: Any) -> VectorSubspaceParent:
        rows = [self(generator) for generator in generators]
        entries = []
        for row in rows:
            entries.extend(row)
        source = matrix(
            self._base,
            len(rows),
            self._degree,
            entries,
        )
        return VectorSubspaceParent(
            self,
            _canonical_row_basis(source),
        )

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
        base = _canonical_base(base)
        if base is self.base_ring():
            return self
        if (
            self.base_ring() is sage.ZZ
            and (
                base is sage.QQ
                or _is_modular_base(base)
                or _is_extension_field_base(base)
                or _is_algebraic_base(base)
                or _is_approximate_base(base)
            )
        ):
            return VectorSpace(base, len(self))(
                _coerce_values(base, self._entries))
        if base is not sage.QQ or self.base_ring() is not sage.ZZ:
            if (
                _is_algebraic_base(base)
                and (
                    self.base_ring() is sage.QQ
                    or _is_algebraic_base(self.base_ring())
                )
            ):
                return VectorSpace(base, len(self))(
                    _coerce_values(base, self._entries))
            raise TypeError('unsupported vector base-ring conversion')
        raise TypeError('unsupported vector base-ring conversion')

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
        if _is_extension_field_base(self.base_ring()):
            scalar = self.base_ring()(other)
            return VectorSpace(self.base_ring(), len(self))(
                [value * scalar for value in self])
        if _is_approximate_base(self.base_ring()):
            scalar = self.base_ring()(other)
            return VectorSpace(self.base_ring(), len(self))(
                [value * scalar for value in self])
        scalar_base, _numerator, _denominator = (
            _matrix_scalar_parts(self.base_ring(), other)
        )
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

    __sagejs_sequence_proxy__ = True

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
        self._enumeration_elements: Any = None
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

    def _finite_field_order(self) -> int:
        if getattr(self.base_ring(), '_kind', None) not in [
            'GF', 'GF_EXTENSION'
        ]:
            raise TypeError(
                'vector-space enumeration requires a finite base field')
        return int(_untyped(self.base_ring()).order())

    def _finite_field_elements(self) -> list[Any]:
        self._finite_field_order()
        if self._enumeration_elements is None:
            self._enumeration_elements = list(
                _untyped(self.base_ring()))
        return self._enumeration_elements

    def cardinality(self) -> int:
        return self._finite_field_order() ** self.dimension()

    order = cardinality

    def __len__(self) -> int:
        return self.cardinality()

    def _finite_element(self, index: int) -> Vector:
        if not runtime.is_exact_integer(index):
            raise TypeError('vector-space indices must be integers or slices')
        index = int(index)
        size = self.cardinality()
        if index < 0:
            index += size
        if index < 0 or index >= size:
            raise IndexError('vector-space index out of range')
        if self.dimension() == 0:
            return self.zero()

        coefficients = self._finite_field_elements()
        radix = len(coefficients)
        entries = [
            _untyped(self.base_ring()).zero()
            for _position in range(self.degree())
        ]
        position = index
        for basis_index in range(self.dimension()):
            coefficient = coefficients[position % radix]
            position //= radix
            if coefficient == 0:
                continue
            basis_vector = self._basis_matrix.row(basis_index)
            for entry_index in range(self.degree()):
                entries[entry_index] += (
                    basis_vector[entry_index] * coefficient)
        return self._ambient(entries)

    def __iter__(self) -> Iterator[Vector]:
        for index in range(self.cardinality()):
            yield self._finite_element(index)

    def __getitem__(self, index: Any) -> Any:
        if hasattr(index, '__sagejs_slice__'):
            start, stop, step = index.indices(self.cardinality())
            return [
                self._finite_element(position)
                for position in range(start, stop, step)
            ]
        return self._finite_element(index)

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
        extended = self._basis_matrix.stack(element)
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
        combined = self._basis_matrix.stack(right._basis_matrix)
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
        relations = self._basis_matrix.stack(
            -right._basis_matrix).left_kernel().basis_matrix()
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

    def __repr__(self) -> str:
        degree = self.degree()
        dimension = self.dimension()
        if (
            self.base_ring() is sage.ZZ
            or getattr(self.base_ring(), '_kind', None) == 'ZMOD'
        ):
            return (
                'Free module of degree ' + str(degree) +
                ' and rank ' + str(dimension) +
                ' over ' + str(self.base_ring()) +
                '\nEchelon basis matrix:\n' +
                str(self._basis_matrix))
        return (
            'Vector space of degree ' + str(degree) +
            ' and dimension ' + str(dimension) +
            ' over ' + str(self.base_ring()) +
            '\nBasis matrix:\n' + str(self._basis_matrix))

    __str__ = __repr__
    toString = __repr__


@runtime.sequence_class
@runtime.lightweight_math_class
class Matrix(sage.Element):

    def __init__(
        self,
        parent: Any,
        native_value: Any = runtime.undefined,
        *constructor_args: Any,
    ) -> None:
        if (
            not isinstance(parent, MatrixSpaceParent)
            or native_value is runtime.undefined
            or len(constructor_args) != 0
        ):
            values = [parent]
            if native_value is not runtime.undefined:
                values.append(native_value)
            values.extend(constructor_args)
            source = matrix(*values)
            parent = source._parent
            native_value = source._native
        self._parent = parent
        self._native = native_value
        self._prime_residues_cache = runtime.undefined
        self._row_subdivisions = []
        self._col_subdivisions = []
        self._determinant_cache = runtime.undefined
        self._rank_cache = runtime.undefined
        self._inverse_cache = runtime.undefined
        self._rref_cache = runtime.undefined
        self._hermite_cache = runtime.undefined
        self._howell_cache = runtime.undefined
        self._hermite_transform_cache = runtime.undefined
        self._smith_cache = runtime.undefined
        self._right_kernel_cache = runtime.undefined
        self._left_kernel_cache = runtime.undefined
        self._charpoly_cache = runtime.map()
        self._minpoly_cache = runtime.map()

    def _new(self, native_value: Any) -> Matrix:
        return Matrix(self._parent, native_value)

    def _new_shape(
        self,
        native_value: Any,
        rows: int,
        columns: int,
    ) -> Matrix:
        """Wrap a native matrix whose dimensions differ from ``self``."""
        return Matrix(
            self._parent.matrix_space(rows, columns),
            native_value,
        )

    def _packed_residues(self, width: int) -> Any:
        """Return modular entries as packed little-endian residues."""
        return runtime.flint_backend().matrixExportPacked(
            self._native, width)

    def _prime_residues(self) -> Any:
        """Return canonical row-major residues for a small prime field."""
        if not _uses_dense_prime_kernel(self.base_ring()):
            raise TypeError('packed dense-prime storage requires GF(p)')
        if self._prime_residues_cache is runtime.undefined:
            packed = self._packed_residues(4)
            entries = []
            for index in range(self.nrows() * self.ncols()):
                offset = index * 4
                entries.append(
                    int(packed[offset])
                    + int(packed[offset + 1]) * 256
                    + int(packed[offset + 2]) * 65536
                    + int(packed[offset + 3]) * 16777216)
            self._prime_residues_cache = entries
        return self._prime_residues_cache

    def _prime_kernel_buffer(self, kernel_function: Any) -> Any:
        """Materialize canonical packed storage once per matrix."""
        packed = _dense_prime_buffer(
            kernel_function, self._prime_residues())
        self._prime_residues_cache = packed
        return packed

    def _packed_integers(self) -> Any:
        """Return ZZ entries as packed signed little-endian magnitudes."""
        return runtime.flint_backend().zzMatrixExportPacked(self._native)

    def _packed_rationals(self) -> Any:
        """Return QQ entries as packed numerator/denominator magnitudes."""
        return runtime.flint_backend().qqMatrixExportPacked(self._native)

    def base_ring(self) -> sage.Parent:
        return self._parent.base_ring()

    def nrows(self) -> int:
        return self._parent.nrows()

    def ncols(self) -> int:
        return self._parent.ncols()

    def dimensions(self) -> tuple[int, int]:
        return runtime.math_tuple([
            self.nrows(), self.ncols()])

    def is_square(self) -> bool:
        return self.nrows() == self.ncols()

    def is_zero(self) -> bool:
        return runtime.flint_backend().matrixIsZero(self._native)

    def __bool__(self) -> bool:
        return not self.is_zero()

    def is_one(self) -> bool:
        if not self.is_square():
            return False
        for row in range(self.nrows()):
            for col in range(self.ncols()):
                expected = 1 if row == col else 0
                if self._entry(row, col) != expected:
                    return False
        return True

    def __len__(self) -> int:
        return self.nrows()

    def _entry(self, row: int, col: int) -> Any:
        row = _normalize_index(row, self.nrows())
        col = _normalize_index(col, self.ncols())
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            native_value = backend.fqMatrixEntry(
                self._native, runtime.number(row), runtime.number(col))
        else:
            native_value = backend.matrixEntry(
                self._native, runtime.number(row), runtime.number(col))
        return _entry_from_native(
            self.base_ring(),
            native_value,
        )

    def __getitem__(self, index: Any) -> Any:
        # Compiler output can represent a multi-index as a native array when
        # tuple preservation is disabled for a lightweight embedding.
        if isinstance(index, tuple) or runtime.array.isArray(index):
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

    def row(
        self,
        index: int,
        from_list: bool = False,
    ) -> Any:
        index = _normalize_named_index(
            index, self.nrows(), 'row')
        answer = vector(
            self.base_ring(),
            [self._entry(index, col) for col in range(self.ncols())],
        )
        if from_list:
            return runtime.math_tuple(answer.list())
        return answer

    def rows(self) -> list[Vector]:
        return [self.row(index) for index in range(self.nrows())]

    def column(
        self,
        index: int,
        from_list: bool = False,
    ) -> Any:
        index = _normalize_named_index(
            index, self.ncols(), 'column')
        answer = vector(
            self.base_ring(),
            [self._entry(row, index) for row in range(self.nrows())],
        )
        if from_list:
            return runtime.math_tuple(answer.list())
        return answer

    def columns(self) -> list[Vector]:
        return [
            self.column(index) for index in range(self.ncols())
        ]

    def change_ring(self, base: sage.Parent) -> Matrix:
        base = _canonical_base(base)
        if base is self.base_ring():
            return self
        if base is sage.QQ and self.base_ring() is sage.ZZ:
            return Matrix(
                MatrixSpace(base, self.nrows(), self.ncols()),
                runtime.flint_backend().zzMatrixToQQ(self._native),
            )
        if (
            self.base_ring() is sage.ZZ
            and (
                _is_modular_base(base)
                or _is_extension_field_base(base)
                or _is_algebraic_base(base)
                or _is_approximate_base(base)
            )
        ):
            return matrix(
                base, self.nrows(), self.ncols(), self.list())
        if (
            _is_algebraic_base(base)
            and (
                self.base_ring() is sage.QQ
                or _is_algebraic_base(self.base_ring())
            )
        ):
            return matrix(
                base, self.nrows(), self.ncols(), self.list())
        if (
            _is_approximate_base(base)
            and (
                self.base_ring() is sage.QQ
                or _is_approximate_base(self.base_ring())
            )
        ):
            return matrix(
                base, self.nrows(), self.ncols(), self.list())
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
        backend = runtime.flint_backend()
        if _is_extension_field_base(left.base_ring()):
            native_value = backend.fqMatrixAdd(
                left._native, right._native)
        else:
            native_value = backend.matrixAdd(
                left._native, right._native)
        return Matrix(
            left._parent,
            native_value,
        )

    def __sub__(self, other: object) -> Matrix:
        left, right = self._pair(other)
        backend = runtime.flint_backend()
        if _is_extension_field_base(left.base_ring()):
            native_value = backend.fqMatrixSub(
                left._native, right._native)
        else:
            native_value = backend.matrixSub(
                left._native, right._native)
        return Matrix(
            left._parent,
            native_value,
        )

    def __neg__(self) -> Matrix:
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            native_value = backend.fqMatrixNeg(self._native)
        else:
            native_value = backend.matrixNeg(self._native)
        return Matrix(
            self._parent,
            native_value,
        )

    def _scalar_mul(self, scalar: object) -> Matrix:
        scalar_parent = getattr(scalar, '_parent', None)
        if (
            _is_algebraic_base(scalar_parent)
            and not _is_algebraic_base(self.base_ring())
        ):
            return self.change_ring(
                _untyped(scalar_parent))._scalar_mul(scalar)
        if _is_extension_field_base(self.base_ring()):
            value = self.base_ring()(scalar)
            native_value = runtime.flint_backend().fqMatrixScalarMul(
                self._native, runtime.reflect.get(value, '_native'))
            return Matrix(self._parent, native_value)
        if _is_algebraic_base(self.base_ring()):
            value = self.base_ring()(scalar)
            return Matrix(
                self._parent,
                runtime.flint_backend().qqbarMatrixScalarMul(
                    self._native,
                    runtime.reflect.get(value, '_native'),
                ),
            )
        if _is_approximate_base(self.base_ring()):
            field = _complex_field(
                _approximate_precision(self.base_ring()))
            value = field(scalar)
            return Matrix(
                self._parent,
                runtime.flint_backend().acbMatrixScalarMul(
                    self._native,
                    runtime.reflect.get(value, '_native'),
                ),
            )
        scalar_base, numerator, denominator = _matrix_scalar_parts(
            self.base_ring(), scalar)
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
            backend = runtime.flint_backend()
            if _is_extension_field_base(base):
                native_value = backend.fqMatrixMul(
                    left._native, right._native)
            else:
                native_value = backend.matrixMul(
                    left._native, right._native)
            return Matrix(
                MatrixSpace(
                    base, left.nrows(), right.ncols()),
                native_value,
            )
        return self._scalar_mul(other)

    def __matmul__(self, other: object) -> Any:
        return self * other

    def _sparse_left_multiply(self, other: Matrix) -> Matrix:
        """Multiply while skipping zero entries in the left exact matrix."""
        if not isinstance(other, Matrix):
            raise TypeError('right operand must be a matrix')
        if self.ncols() != other.nrows():
            raise ValueError('matrix and matrix dimensions are incompatible')
        base = _common_base(self.base_ring(), other.base_ring())
        if base not in [sage.ZZ, sage.QQ] and not _is_algebraic_base(base):
            return self * other
        left = self.change_ring(base)
        right = other.change_ring(base)
        native_value = runtime.flint_backend().matrixSparseLeftMul(
            left._native, right._native)
        return Matrix(
            MatrixSpace(base, left.nrows(), right.ncols()),
            native_value,
        )

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
        if (
            _is_modular_base(self.base_ring())
            or _is_extension_field_base(self.base_ring())
            or _is_algebraic_base(self.base_ring())
        ):
            value = self.base_ring()(scalar)
            if value.is_zero():
                raise ZeroDivisionError('matrix division by zero')
            return self._scalar_mul(
                value ** runtime.bigint(-1))
        if _is_approximate_base(self.base_ring()):
            value = self.base_ring()(scalar)
            if value == 0:
                raise ZeroDivisionError('matrix division by zero')
            return self._scalar_mul(
                self.base_ring()(1) / value)
        _base, numerator, denominator = _scalar_parts(scalar)
        if numerator == 0:
            raise ZeroDivisionError('matrix division by zero')
        reciprocal = runtime.rational_class(
            denominator, numerator)
        return self._scalar_mul(reciprocal)

    def __pow__(self, exponent: int) -> Matrix:
        if not runtime.is_exact_integer(exponent):
            raise NotImplementedError(
                'the given exponent is not supported')
        exponent = int(exponent)
        if not self.is_square():
            raise ArithmeticError('matrix must be square')
        if exponent < 0:
            return self.inverse() ** (-exponent)
        if exponent == 0:
            return identity_matrix(
                self.base_ring(), self.nrows())
        answer = None
        power = self
        while exponent:
            if exponent % 2:
                answer = (
                    power if answer is None else answer * power)
            exponent //= 2
            if exponent:
                power = power * power
        assert answer is not None
        return answer

    def __rpow__(self, base: Any) -> Matrix:
        if base is None:
            raise TypeError(
                'Cannot convert NoneType to '
                'sage.matrix.matrix_integer_dense.Matrix_integer_dense')
        raise NotImplementedError(
            'the given exponent is not supported')

    def transpose(self) -> Matrix:
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            native_value = backend.fqMatrixTranspose(self._native)
        else:
            native_value = backend.matrixTranspose(self._native)
        answer = Matrix(
            MatrixSpace(
                self.base_ring(), self.ncols(), self.nrows()),
            native_value,
        )
        answer._row_subdivisions = list(self._col_subdivisions)
        answer._col_subdivisions = list(self._row_subdivisions)
        return answer

    @property
    def T(self) -> Matrix:
        return self.transpose()

    def determinant(
        self,
        algorithm: Any = None,
        proof: Any = None,
    ) -> Any:
        if not self.is_square():
            raise ValueError(
                'determinant is only defined for square matrices')
        if algorithm == 'linbox' and proof is not False:
            raise RuntimeError(
                'you must pass the proof=False option to the '
                'determinant command to use LinBox\'s det algorithm')
        if algorithm not in [
            None, 'flint', 'linbox', 'ntl', 'padic', 'pari',
            'lift', 'charpoly',
        ]:
            raise ValueError('unknown determinant algorithm')
        if self._determinant_cache is not runtime.undefined:
            return self._determinant_cache
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            value = backend.fqMatrixDet(self._native)
        else:
            value = backend.matrixDet(self._native)
        self._determinant_cache = _entry_from_native(
            self.base_ring(), value)
        return self._determinant_cache

    det = determinant

    def _clear_cache(self) -> None:
        self._determinant_cache = runtime.undefined
        self._rank_cache = runtime.undefined
        self._inverse_cache = runtime.undefined
        self._rref_cache = runtime.undefined
        self._hermite_cache = runtime.undefined
        self._howell_cache = runtime.undefined
        self._hermite_transform_cache = runtime.undefined
        self._smith_cache = runtime.undefined
        self._right_kernel_cache = runtime.undefined
        self._left_kernel_cache = runtime.undefined
        self._charpoly_cache = runtime.map()
        self._minpoly_cache = runtime.map()

    def rank(self, algorithm: Any = None) -> int:
        if algorithm not in [None, 'flint', 'linbox', 'modp']:
            raise ValueError(
                "algorithm must be one of 'modp', 'flint' or 'linbox'")
        if self._rank_cache is runtime.undefined:
            backend = runtime.flint_backend()
            if _is_extension_field_base(self.base_ring()):
                self._rank_cache = backend.fqMatrixRank(
                    self._native)
            elif (
                algorithm == 'modp'
                and _uses_dense_prime_kernel(self.base_ring())
            ):
                kernel_module = _dense_prime_kernel_module()
                kernel_function = kernel_module.dense_prime_rank
                count = self.nrows() * self.ncols()
                source = self._prime_kernel_buffer(kernel_function)
                workspace = _dense_prime_zeros(kernel_function, count)
                source_record = kernel_module.DensePrimeMatrix(
                    source,
                    self.nrows(),
                    self.ncols(),
                    int(_untyped(self.base_ring()).characteristic()),
                )
                self._rank_cache = int(kernel_function(
                    source_record, workspace))
                _trace_dense_prime_selection(
                    'rank', (
                        'typed-python'
                        if _native_kernel_available(kernel_function)
                        else 'dynamic-python-explicit'
                    ),
                    self.nrows(), self.ncols(),
                    int(_untyped(self.base_ring()).characteristic()),
                )
            else:
                self._rank_cache = backend.matrixRank(
                    self._native)
                if _uses_dense_prime_kernel(self.base_ring()):
                    _trace_dense_prime_selection(
                        'rank', 'legacy-flint',
                        self.nrows(),
                        self.ncols(),
                        int(_untyped(self.base_ring()).characteristic()),
                    )
        return self._rank_cache

    def nullity(self) -> int:
        return self.nrows() - self.rank()

    def right_nullity(self) -> int:
        return self.ncols() - self.rank()

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
            base = sage.QQ
            if _is_approximate_base(self.base_ring()):
                base = self.base_ring()
            if (
                _is_algebraic_base(self.base_ring())
                or getattr(
                    self.base_ring(), '_kind', None
                ) in ['GF', 'GF_EXTENSION']
            ):
                base = self.base_ring()
            backend = runtime.flint_backend()
            if _is_extension_field_base(self.base_ring()):
                native_value = backend.fqMatrixRref(self._native)
            else:
                native_value = backend.matrixRref(self._native)
                if _uses_dense_prime_kernel(self.base_ring()):
                    _trace_dense_prime_selection(
                        'rref', 'legacy-flint',
                        self.nrows(),
                        self.ncols(),
                        int(_untyped(self.base_ring()).characteristic()),
                    )
            self._rref_cache = Matrix(
                MatrixSpace(base, self.nrows(), self.ncols()),
                native_value,
            )
        return self._rref_cache

    def hermite_form(
        self,
        algorithm: Any = None,
        include_zero_rows: bool = True,
        transformation: bool = False,
    ) -> Any:
        if self.base_ring() is not sage.ZZ:
            raise TypeError(
                'Hermite form currently requires an integer matrix')
        if algorithm not in [
            None, 'default', 'flint', 'ntl', 'padic', 'pari',
            'pari0', 'pari4',
        ]:
            raise ValueError('unknown Hermite form algorithm')
        if (
            algorithm == 'ntl'
            and (not self.is_square() or self.rank() != self.nrows())
        ):
            raise ValueError(
                'ntl only computes HNF for square matrices of full rank.')
        if transformation:
            if self._hermite_transform_cache is runtime.undefined:
                raw = runtime.flint_backend().matrixHermiteTransform(
                    self._native)
                self._hermite_cache = Matrix(self._parent, raw[0])
                self._hermite_transform_cache = Matrix(
                    MatrixSpace(
                        sage.ZZ, self.nrows(), self.nrows()),
                    raw[1],
                )
            hermite = self._hermite_cache
            transform = self._hermite_transform_cache
            if not include_zero_rows:
                indices = range(self.rank())
                hermite = hermite.matrix_from_rows(indices)
                transform = transform.matrix_from_rows(indices)
            return runtime.math_tuple([hermite, transform])
        if self._hermite_cache is runtime.undefined:
            self._hermite_cache = Matrix(
                self._parent,
                runtime.flint_backend().matrixHermite(self._native),
            )
        if not include_zero_rows:
            return self._hermite_cache.matrix_from_rows(
                range(self.rank()))
        return self._hermite_cache

    def smith_form(self) -> Any:
        if self.base_ring() is not sage.ZZ:
            raise TypeError(
                'Smith form currently requires an integer matrix')
        if self._smith_cache is runtime.undefined:
            raw = runtime.flint_backend().matrixSmith(self._native)
            self._smith_cache = runtime.math_tuple([
                Matrix(
                    MatrixSpace(
                        sage.ZZ, self.nrows(), self.ncols()),
                    raw[0],
                ),
                Matrix(
                    MatrixSpace(
                        sage.ZZ, self.nrows(), self.nrows()),
                    raw[1],
                ),
                Matrix(
                    MatrixSpace(
                        sage.ZZ, self.ncols(), self.ncols()),
                    raw[2],
                ),
            ])
        return self._smith_cache

    def howell_form(self) -> Matrix:
        if getattr(self.base_ring(), '_kind', None) != 'ZMOD':
            raise TypeError(
                'Howell form requires a residue-ring matrix')
        if self._howell_cache is runtime.undefined:
            rows = max(self.nrows(), self.ncols())
            self._howell_cache = Matrix(
                MatrixSpace(
                    self.base_ring(), rows, self.ncols()),
                runtime.flint_backend().matrixHowell(self._native),
            )
        return self._howell_cache

    def elementary_divisors(self, algorithm: Any = None) -> list[Any]:
        diagonal = self.smith_form()[0].diagonal()
        while len(diagonal) < self.nrows():
            diagonal.append(0)
        return diagonal

    def echelon_form(
        self,
        algorithm: Any = None,
        include_zero_rows: bool = True,
        transformation: bool = False,
    ) -> Any:
        if self.base_ring() is sage.ZZ:
            return self.hermite_form(
                algorithm,
                include_zero_rows,
                transformation,
            )
        if getattr(self.base_ring(), '_kind', None) == 'ZMOD':
            if transformation:
                raise NotImplementedError(
                    'Howell transformations are not available yet')
            return self.howell_form()
        if transformation:
            raise NotImplementedError(
                'rational echelon transformations are not available')
        return self.rref()

    def is_immutable(self) -> bool:
        return True

    def pivots(self) -> Any:
        echelon = self.echelon_form()
        answer = runtime.flint_backend().matrixPivots(echelon._native)
        return runtime.math_tuple([
            runtime.number(index) for index in answer
        ])

    def row_space(self) -> VectorSubspaceParent:
        return VectorSubspaceParent(
            VectorSpace(self.base_ring(), self.ncols()),
            _canonical_row_basis(self),
        )

    row_module = row_space
    image = row_space

    def column_space(self) -> VectorSubspaceParent:
        return VectorSubspaceParent(
            VectorSpace(self.base_ring(), self.nrows()),
            _canonical_row_basis(self.transpose()),
        )

    column_module = column_space

    def right_kernel(self) -> VectorSubspaceParent:
        if self._right_kernel_cache is runtime.undefined:
            backend = runtime.flint_backend()
            if _is_extension_field_base(self.base_ring()):
                nullity = self.ncols() - self.rank()
                native_value = backend.fqMatrixRightKernel(
                    self._native)
            elif getattr(
                self.base_ring(), '_kind', None
            ) == 'CyclotomicField':
                cyclotomic_order = int(
                    _cyclotomic_order(self.base_ring()))
                if cyclotomic_order in [3, 4, 6]:
                    # FLINT's direct qqbar elimination is already effective
                    # in quadratic fields and avoids translating legacy
                    # order-3 character presentations through a larger
                    # cyclotomic coordinate cache.
                    nullity = self.ncols() - self.rank()
                    native_value = backend.matrixRightKernel(
                        self._native)
                else:
                    native_result = backend.cyclotomicMatrixRightKernel(
                        self._native,
                        runtime.integer_bigint(cyclotomic_order),
                    )
                    native_value = native_result[0]
                    nullity = int(native_result[1])
                    self._rank_cache = self.ncols() - nullity
            else:
                nullity = self.ncols() - self.rank()
                native_value = backend.matrixRightKernel(
                    self._native)
                if _uses_dense_prime_kernel(self.base_ring()):
                    _trace_dense_prime_selection(
                        'right_kernel', 'legacy-flint',
                        self.nrows(),
                        self.ncols(),
                        int(_untyped(self.base_ring()).characteristic()),
                    )
            basis = Matrix(
                MatrixSpace(
                    self.base_ring(), nullity, self.ncols()),
                native_value,
            )
            # Native kernel constructors return the canonical RREF basis.
            # Recording that fact avoids recomputing an expensive echelon
            # form merely to discover its pivot columns when this basis is
            # used to define a modular-symbol subspace.
            basis._rref_cache = basis
            self._right_kernel_cache = VectorSubspaceParent(
                VectorSpace(self.base_ring(), self.ncols()),
                basis,
                self,
                False,
            )
        return self._right_kernel_cache

    def right_kernel_matrix(
        self,
        *args: Any,
        **kwds: Any,
    ) -> Matrix:
        # Over a field the computed and echelon bases are both represented by
        # our canonical RREF basis matrix. Integer matrices likewise expose
        # their canonical saturated kernel basis.
        return self.right_kernel().basis_matrix()

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

    def left_kernel_matrix(
        self,
        *args: Any,
        **kwds: Any,
    ) -> Matrix:
        return self.left_kernel().basis_matrix()

    kernel = left_kernel

    def _approximate_eigensystem(self) -> Any:
        if not self.is_square():
            raise ArithmeticError('only valid for square matrix')
        if not _is_approximate_base(self.base_ring()):
            raise TypeError(
                'approximate eigensystems require a real '
                'or complex matrix')
        return runtime.flint_backend().matrixApproxEigensystem(
            self._native)

    def eigenvalues(
        self,
        extend: bool = True,
    ) -> list[Any]:
        if not self.is_square():
            raise ArithmeticError('only valid for square matrix')
        if _is_approximate_base(self.base_ring()):
            raw = self._approximate_eigensystem()
            values = runtime.reflect.get(raw, 'values')
            answer = []
            for value in values:
                answer.append(_approximate_value_from_native(
                    self.base_ring(), value))
            return answer
        if self.base_ring() not in [sage.ZZ, sage.QQ]:
            raise NotImplementedError(
                'eigenvalues are currently implemented for '
                'integer, rational, real, and complex matrices')
        if not extend:
            raise NotImplementedError(
                'eigenvalues with extend=False are not available yet')
        native_values = runtime.flint_backend().matrixExactEigenvalues(
            self._native)
        algebraic_field = runtime.reflect.get(
            runtime.global_object, 'QQbar')
        return [
            algebraic_field._from_native(value)
            for value in native_values
        ]

    def _exact_eigenspaces_data(
        self,
        left: bool,
    ) -> list[Any]:
        values = self.eigenvalues()
        answer = []
        index = 0
        while index < len(values):
            value = values[index]
            multiplicity = 1
            while (
                index + multiplicity < len(values)
                and values[index + multiplicity] == value
            ):
                multiplicity += 1
            scalar_parent = runtime.reflect.get(value, '_parent')
            scalar = value
            if (
                _is_algebraic_base(scalar_parent)
                and runtime.flint_backend().qqbarIsRational(
                    runtime.reflect.get(value, '_native'))
            ):
                text = str(value)
                pieces = text.split('/')
                scalar_parent = sage.QQ
                scalar = runtime.rational_class(
                    int(pieces[0]),
                    int(pieces[1]) if len(pieces) == 2 else 1,
                )
                value = scalar
            elif not _is_algebraic_base(scalar_parent):
                scalar_parent = sage.QQ
                scalar = scalar_parent(value)
            source = self.change_ring(scalar_parent)
            shifted = (
                source
                - identity_matrix(
                    scalar_parent, self.nrows()) * scalar
            )
            if left:
                space = shifted.left_kernel()
            else:
                space = shifted.right_kernel()
            answer.append(runtime.math_tuple([
                value,
                space,
                multiplicity,
            ]))
            index += multiplicity
        return answer

    def _exact_eigenvectors(
        self,
        left: bool,
    ) -> list[Any]:
        answer = []
        for value, space, multiplicity in self._exact_eigenspaces_data(
            left
        ):
            answer.append(runtime.math_tuple([
                value,
                space.basis(),
                multiplicity,
            ]))
        return answer

    def _approximate_eigenvectors(
        self,
        left: bool,
    ) -> list[Any]:
        raw = self._approximate_eigensystem()
        raw_values = runtime.reflect.get(raw, 'values')
        raw_vectors = runtime.reflect.get(
            raw,
            'leftVectors' if left else 'rightVectors',
        )
        answer = []
        for index in range(len(raw_values)):
            value = _approximate_value_from_native(
                self.base_ring(), raw_values[index])
            force_complex = (
                _is_complex_base(self.base_ring())
                or _is_complex_base(
                    getattr(value, '_parent', None))
            )
            vector_value = _approximate_vector_from_native(
                self.base_ring(),
                list(raw_vectors[index]),
                force_complex,
            )
            answer.append(runtime.math_tuple([
                value,
                [vector_value],
                1,
            ]))
        return answer

    def eigenvectors_left(self) -> list[Any]:
        if _is_approximate_base(self.base_ring()):
            return self._approximate_eigenvectors(True)
        return self._exact_eigenvectors(True)

    def eigenvectors_right(self) -> list[Any]:
        if _is_approximate_base(self.base_ring()):
            return self._approximate_eigenvectors(False)
        return self._exact_eigenvectors(False)

    def _eigenspaces(self, left: bool) -> list[Any]:
        if not _is_approximate_base(self.base_ring()):
            answer = []
            for value, space, _multiplicity in (
                self._exact_eigenspaces_data(left)
            ):
                answer.append(runtime.math_tuple([value, space]))
            return answer
        if left:
            vectors = self.eigenvectors_left()
        else:
            vectors = self.eigenvectors_right()
        answer = []
        for value, basis, _multiplicity in vectors:
            base = runtime.coercion_model.parentOf(value)
            basis_matrix = matrix(
                base, 1, self.nrows(), list(basis))
            answer.append(runtime.math_tuple([
                value,
                VectorSubspaceParent(
                    VectorSpace(base, self.nrows()),
                    basis_matrix,
                ),
            ]))
        return answer

    def eigenspaces_left(self) -> list[Any]:
        return self._eigenspaces(True)

    def eigenspaces_right(self) -> list[Any]:
        return self._eigenspaces(False)

    def is_diagonalizable(
        self,
        base_field: Any = None,
    ) -> bool:
        if not self.is_square():
            return False
        if base_field is None and self.base_ring() is sage.ZZ:
            source = self.change_ring(sage.QQ)
        elif base_field is None:
            source = self
        else:
            source = self.change_ring(base_field)
        dimension = 0
        if not _is_approximate_base(source.base_ring()):
            spaces = source._exact_eigenspaces_data(False)
            for value, space, _multiplicity in spaces:
                if (
                    runtime.coercion_model.parentOf(value)
                    is not source.base_ring()
                ):
                    return False
                dimension += space.dimension()
            return dimension == source.nrows()
        for value, basis, _multiplicity in source.eigenvectors_right():
            if (
                runtime.coercion_model.parentOf(value)
                is not source.base_ring()
            ):
                return False
            dimension += len(basis)
        return dimension == source.nrows()

    def diagonalization(
        self,
        base_field: Any = None,
    ) -> Any:
        if not self.is_square():
            raise ArithmeticError('only valid for square matrix')
        if base_field is None and self.base_ring() is sage.ZZ:
            source = self.change_ring(sage.QQ)
        elif base_field is None:
            source = self
        else:
            source = self.change_ring(base_field)
        values = []
        columns = []
        if _is_approximate_base(source.base_ring()):
            raise NotImplementedError(
                'approximate matrix diagonalization is not implemented')
        for value, space, _multiplicity in (
            source._exact_eigenspaces_data(False)
        ):
            if (
                runtime.coercion_model.parentOf(value)
                is not source.base_ring()
            ):
                raise ValueError(
                    'matrix is not diagonalizable over its base field')
            basis_matrix = space.basis_matrix()
            for basis_index in range(basis_matrix.nrows()):
                values.append(value)
                columns.append([
                    basis_matrix[basis_index, coordinate]
                    for coordinate in range(basis_matrix.ncols())
                ])
        if len(columns) != source.nrows():
            raise ValueError(
                'matrix is not diagonalizable over its base field')
        entries = []
        for row in range(source.nrows()):
            for col in range(source.ncols()):
                entries.append(columns[col][row])
        change = matrix(
            source.base_ring(), source.nrows(), source.ncols(), entries)
        diagonal = diagonal_matrix(source.base_ring(), values)
        return runtime.math_tuple([diagonal, change])

    def charpoly(
        self,
        variable: str = 'x',
        algorithm: Any = None,
    ) -> Any:
        if not self.is_square():
            raise ArithmeticError('only valid for square matrix')
        if algorithm not in [
            None, 'flint', 'generic', 'linbox', 'pari',
            'crt', 'lift', 'hessenberg', 'df',
        ]:
            raise ValueError('unknown characteristic polynomial algorithm')
        cached = self._charpoly_cache.get(variable)
        if cached is not runtime.undefined:
            return cached
        ring = sage.PolynomialRing(self.base_ring(), variable)
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            answer = ring._from_native(
                backend.fqMatrixCharpoly(self._native))
            self._charpoly_cache.set(variable, answer)
            return answer
        generator = ring.gen()
        power = ring(1)
        answer = ring(0)
        coefficients = backend.matrixCharpoly(self._native)
        for raw_coefficient in coefficients:
            coefficient = _entry_from_native(
                self.base_ring(), raw_coefficient)
            answer += ring(coefficient) * power
            power *= generator
        self._charpoly_cache.set(variable, answer)
        return answer

    characteristic_polynomial = charpoly

    def minpoly(
        self,
        variable: str = 'x',
        algorithm: Any = None,
        proof: Any = None,
    ) -> Any:
        if not self.is_square():
            raise ArithmeticError('only valid for square matrix')
        cached = self._minpoly_cache.get(variable)
        if cached is not runtime.undefined:
            return cached
        size = self.nrows()
        powers = [identity_matrix(self.base_ring(), size)]
        power_entries = [powers[0].list()]
        entries_per_power = size * size
        for degree in range(size + 1):
            entries = []
            for entry_index in range(entries_per_power):
                for power_index in range(degree + 1):
                    entries.append(
                        power_entries[power_index][entry_index])
            relations = matrix(
                self.base_ring(),
                entries_per_power,
                degree + 1,
                entries,
            ).right_kernel()
            for relation in relations.basis():
                leading = relation[-1]
                if leading == 0:
                    continue
                finite_coefficients = (
                    getattr(
                        self.base_ring(), '_kind', None
                    ) in ['GF', 'GF_EXTENSION']
                )
                if finite_coefficients:
                    coefficients = [
                        coefficient / leading
                        for coefficient in relation
                    ]
                    base = self.base_ring()
                else:
                    coefficients = [
                        sage.QQ(coefficient) / sage.QQ(leading)
                        for coefficient in relation
                    ]
                    base = sage.ZZ
                integer_coefficients = []
                if not finite_coefficients:
                    for coefficient in coefficients:
                        try:
                            integer_coefficients.append(
                                sage.ZZ(coefficient))
                        except Exception:
                            base = sage.QQ
                            break
                if base is sage.ZZ:
                    coefficients = integer_coefficients
                ring = sage.PolynomialRing(base, variable)
                generator = ring.gen()
                answer = ring(0)
                power = ring(1)
                for coefficient in coefficients:
                    answer += ring(base(coefficient)) * power
                    power *= generator
                self._minpoly_cache.set(variable, answer)
                return answer
            powers.append(powers[-1] * self)
            power_entries.append(powers[-1].list())
        raise ArithmeticError(
            'could not determine the minimal polynomial')

    minimal_polynomial = minpoly

    def inverse(self) -> Matrix:
        if not self.is_square():
            raise ArithmeticError('matrix must be square')
        if self._inverse_cache is not runtime.undefined:
            return self._inverse_cache
        native_value = runtime.undefined
        try:
            backend = runtime.flint_backend()
            if _is_extension_field_base(self.base_ring()):
                native_value = backend.fqMatrixInverse(self._native)
            else:
                native_value = backend.matrixInverse(self._native)
        except Exception:
            pass
        if native_value is runtime.undefined:
            raise ZeroDivisionError('matrix must be nonsingular')
        inverse_base = sage.QQ
        if (
            _is_modular_base(self.base_ring())
            or _is_extension_field_base(self.base_ring())
            or _is_algebraic_base(self.base_ring())
            or _is_approximate_base(self.base_ring())
        ):
            inverse_base = self.base_ring()
        self._inverse_cache = Matrix(
            MatrixSpace(
                inverse_base,
                self.nrows(),
                self.ncols(),
            ),
            native_value,
        )
        return self._inverse_cache

    def inverse_of_unit(self, algorithm: Any = None) -> Matrix:
        if algorithm not in [
            None, 'flint', 'linbox', 'lift', 'crt',
        ]:
            raise ValueError('unknown matrix inverse algorithm')
        return self.inverse()

    def is_invertible(self) -> bool:
        return self.is_square() and self.rank() == self.nrows()

    is_unit = is_invertible

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
        base = _common_base(
            self.base_ring(), right_matrix.base_ring())
        left_matrix = self.change_ring(base)
        right_matrix = right_matrix.change_ring(base)
        if _uses_dense_prime_kernel(base) and left_matrix.is_square():
            _trace_dense_prime_selection(
                'solve_right', 'legacy-flint',
                left_matrix.nrows(),
                right_matrix.ncols(),
                int(_untyped(base).characteristic()),
            )
        native_value = runtime.undefined
        try:
            backend = runtime.flint_backend()
            if _is_extension_field_base(base):
                native_value = backend.fqMatrixSolve(
                    left_matrix._native, right_matrix._native)
            else:
                native_value = backend.matrixSolve(
                    left_matrix._native, right_matrix._native)
        except Exception:
            pass
        if native_value is runtime.undefined:
            solve_base = sage.QQ if base is sage.ZZ else base
            augmented = left_matrix.change_ring(
                solve_base).augment(
                    right_matrix.change_ring(solve_base))
            reduced = augmented.echelon_form()
            solution_entries = [
                solve_base(0)
                for _entry in range(
                    self.ncols() * right_matrix.ncols())
            ]
            for row in range(reduced.nrows()):
                pivot = None
                for col in range(self.ncols()):
                    if reduced[row, col] != 0:
                        pivot = col
                        break
                if pivot is None:
                    for col in range(right_matrix.ncols()):
                        if reduced[
                            row, self.ncols() + col
                        ] != 0:
                            raise ValueError(
                                'matrix equation has no solutions')
                else:
                    for col in range(right_matrix.ncols()):
                        solution_entries[
                            pivot * right_matrix.ncols() + col
                        ] = reduced[
                            row, self.ncols() + col
                        ]
            solution = matrix(
                solve_base,
                self.ncols(),
                right_matrix.ncols(),
                solution_entries,
            )
            if vector_result:
                return solution.column(0)
            return solution
        result_base = sage.QQ
        if (
            _is_modular_base(base)
            or _is_extension_field_base(base)
            or _is_algebraic_base(base)
            or _is_approximate_base(base)
        ):
            result_base = base
        result = Matrix(
            MatrixSpace(
                result_base,
                self.ncols(),
                right_matrix.ncols(),
            ),
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

    def stack(
        self,
        other: object,
        subdivide: bool = False,
    ) -> Matrix:
        if isinstance(other, Vector):
            other = other.row()
        if not isinstance(other, Matrix):
            other = matrix(other)
        if self.ncols() != other.ncols():
            raise TypeError(
                'number of columns must agree for stacking')
        base = _common_base(
            self.base_ring(), other.base_ring())
        top = self.change_ring(base)
        bottom = other.change_ring(base)
        if base is sage.ZZ or base is sage.QQ:
            answer = Matrix(
                MatrixSpace(
                    base,
                    top.nrows() + bottom.nrows(),
                    top.ncols(),
                ),
                runtime.flint_backend().matrixStack(
                    top._native, bottom._native),
            )
            if subdivide:
                answer._row_subdivisions = [top.nrows()]
            return answer
        answer = matrix(
            base,
            top.nrows() + bottom.nrows(),
            top.ncols(),
            top.list() + bottom.list(),
        )
        if subdivide:
            answer._row_subdivisions = [top.nrows()]
        return answer

    def augment(
        self,
        other: object,
        subdivide: bool = False,
    ) -> Matrix:
        if isinstance(other, Vector):
            other = other.column()
        if not isinstance(other, Matrix):
            other = matrix(other)
        if self.nrows() != other.nrows():
            raise TypeError(
                'number of rows must be the same, not ' +
                str(self.nrows()) + ' != ' + str(other.nrows()))
        base = _common_base(
            self.base_ring(), other.base_ring())
        left = self.change_ring(base)
        right = other.change_ring(base)
        if base is sage.ZZ or base is sage.QQ:
            answer = Matrix(
                MatrixSpace(
                    base,
                    left.nrows(),
                    left.ncols() + right.ncols(),
                ),
                runtime.flint_backend().matrixAugment(
                    left._native, right._native),
            )
            if subdivide:
                answer._col_subdivisions = [left.ncols()]
            return answer
        entries = []
        for row in range(left.nrows()):
            entries.extend(left.row(row))
            entries.extend(right.row(row))
        answer = matrix(
            base,
            left.nrows(),
            left.ncols() + right.ncols(),
            entries,
        )
        if subdivide:
            answer._col_subdivisions = [left.ncols()]
        return answer

    def subdivide(
        self,
        row_lines: Any = None,
        col_lines: Any = None,
    ) -> None:
        def lines(value: Any) -> list[int]:
            if value is None:
                return []
            if runtime.is_exact_integer(value):
                return [int(value)]
            return [int(index) for index in value]

        self._row_subdivisions = lines(row_lines)
        self._col_subdivisions = lines(col_lines)

    def matrix_from_rows(self, rows: Any) -> Matrix:
        indices = [int(index) for index in rows]
        native = runtime.flint_backend().matrixSelectRows(
            self._native, indices)
        return Matrix(
            MatrixSpace(
                self.base_ring(), len(indices), self.ncols()),
            native,
        )

    def matrix_from_columns(self, columns: Any) -> Matrix:
        indices = [int(index) for index in columns]
        native = runtime.flint_backend().matrixSelectColumns(
            self._native, indices)
        return Matrix(
            MatrixSpace(
                self.base_ring(), self.nrows(), len(indices)),
            native,
        )

    def diagonal(self) -> list[Any]:
        return [
            self._entry(index, index)
            for index in range(min(self.nrows(), self.ncols()))
        ]

    def trace(self) -> Any:
        if not self.is_square():
            raise ValueError('trace is only defined for square matrices')
        return sum(self.diagonal(), self.base_ring()(0))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Matrix):
            if other == 0:
                return self.is_zero()
            if not self.is_square():
                return False
            try:
                return self == (
                    identity_matrix(self.base_ring(), self.nrows())
                    * other
                )
            except Exception:
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
        backend = runtime.flint_backend()
        if _is_extension_field_base(base):
            return backend.fqMatrixEqual(
                left._native, right._native)
        return backend.matrixEqual(left._native, right._native)

    def __copy__(self) -> Matrix:
        answer = self.matrix_from_rows(range(self.nrows()))
        answer._row_subdivisions = list(self._row_subdivisions)
        answer._col_subdivisions = list(self._col_subdivisions)
        return answer

    def str(self) -> str:
        """Return the full entry-by-entry matrix representation."""
        if self.nrows() == 0:
            return '[]'
        text_rows = []
        width = 0
        for row in range(self.nrows()):
            text_row = []
            for col in range(self.ncols()):
                text = str(self._entry(row, col))
                text_row.append(text)
                width = max(width, len(text))
            text_rows.append(text_row)
        lines = []
        for row, text_row in enumerate(text_rows):
            if row in self._row_subdivisions:
                lines.append(
                    '[' + '-' * (len(lines[-1]) - 2) + ']')
            entries = []
            for col in range(self.ncols()):
                entries.append(text_row[col].rjust(width))
            inner = ''
            for col, entry in enumerate(entries):
                if col != 0:
                    inner += (
                        '|' if col in self._col_subdivisions else ' ')
                inner += entry
            lines.append('[' + inner + ']')
        return '\n'.join(lines)

    def __repr__(self) -> str:
        if self.nrows() >= 20 or self.ncols() >= 20:
            return (
                str(self.nrows()) + ' x ' + str(self.ncols()) +
                (' sparse matrix over ' if self.is_sparse()
                 else ' dense matrix over ') +
                str(self.base_ring()) +
                " (use the '.str()' method to see the entries)"
            )
        return self.str()

    __str__ = __repr__
    toString = __repr__


@runtime.sequence_class
class MatrixBasis:

    def __init__(self, space: MatrixSpaceParent) -> None:
        self._space = space

    def __len__(self) -> int:
        return self._space.nrows() * self._space.ncols()

    def __iter__(self) -> Iterator[Matrix]:
        return iter([self[index] for index in range(len(self))])

    def __getitem__(self, index: Any) -> Matrix:
        if isinstance(index, (list, tuple)):
            if len(index) != 2:
                raise IndexError(
                    'matrix basis index must have two entries')
            row = _normalize_named_index(
                int(index[0]), self._space.nrows(), 'row')
            col = _normalize_named_index(
                int(index[1]), self._space.ncols(), 'column')
        else:
            position = _normalize_index(int(index), len(self))
            row = position // self._space.ncols()
            col = position % self._space.ncols()
        entries = [
            0 for _entry in range(
                self._space.nrows() * self._space.ncols())
        ]
        entries[row * self._space.ncols() + col] = 1
        return self._space(entries)

    def __repr__(self) -> str:
        return 'Basis of ' + str(self._space)

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
    sparse: bool = False,
) -> MatrixSpaceParent:
    base = _canonical_base(base)
    if (
        base is not sage.ZZ
        and base is not sage.QQ
        and not _is_modular_base(base)
        and not _is_extension_field_base(base)
        and not _is_algebraic_base(base)
        and not _is_approximate_base(base)
    ):
        raise TypeError(
            'matrices currently require ZZ, QQ, AA, QQbar, GF, Zmod, '
            'or a real/complex field')
    rows = int(rows)
    cols = rows if cols is None else int(cols)
    if rows < 0 or cols < 0:
        raise ValueError('matrix dimensions must be nonnegative')
    by_dimensions = _matrix_space_cache.get(base)
    if by_dimensions is runtime.undefined:
        by_dimensions = runtime.map()
        _matrix_space_cache.set(base, by_dimensions)
    key = (
        str(rows) + 'x' + str(cols) +
        ('-sparse' if sparse else '-dense')
    )
    parent = by_dimensions.get(key)
    if parent is runtime.undefined:
        parent = MatrixSpaceParent(base, rows, cols, sparse)
        by_dimensions.set(key, parent)
    return parent


def VectorSpace(
    base: sage.Parent,
    degree: int,
) -> VectorSpaceParent:
    base = _canonical_base(base)
    if (
        base is not sage.ZZ
        and base is not sage.QQ
        and not _is_modular_base(base)
        and not _is_extension_field_base(base)
        and not _is_algebraic_base(base)
        and not _is_approximate_base(base)
    ):
        raise TypeError(
            'vectors currently require ZZ, QQ, AA, QQbar, GF, Zmod, '
            'or a real/complex field')
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
    if len(rows) == 0:
        return 0, 0, []
    if not isinstance(rows[0], (list, tuple, Vector)):
        return 1, len(rows), rows
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
    r"""
    Construct a dense matrix, optionally over an explicit base ring.

    Sage's common row-list, flat-list, dimension, and entry-function forms are
    supported. Exact matrices use FLINT on native hosts; `RDF`/`CDF` and
    arbitrary-precision real/complex matrices use FLINT, Arb, and ACB.

    ### Examples

    ```sage
    sage: A = matrix(ZZ, 2, [1, 2, 3, 4])
    sage: A.det()
    -2
    sage: A.rref()
    [1 0]
    [0 1]
    ```
    """
    if not args:
        raise TypeError('matrix() requires entries or dimensions')
    values = list(args)
    base = None
    if _is_base_ring(values[0]):
        base = _canonical_base(values.pop(0))
    if len(values) == 1:
        if isinstance(values[0], Matrix):
            source = values[0]
            return (
                source if base is None
                else source.change_ring(base)
            )
        if base is not None and runtime.is_exact_integer(values[0]):
            rows = int(values[0])
            cols = rows
            entries = [0 for _ in range(rows * cols)]
        else:
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
        base = _canonical_base(values.pop(0))
    if len(values) == 2:
        degree = int(values[0])
        entries = list(values[1])
        if len(entries) != degree:
            raise ValueError(
                'vector entry count does not match its dimension')
    elif len(values) == 1:
        entries = list(values[0])
    else:
        raise TypeError('unsupported vector() constructor signature')
    if isinstance(values[0], Vector):
        source = values[0]
        return (
            source if base is None
            else source.change_ring(base)
        )
    if base is None:
        base = _base_for_values(entries)
    return VectorSpace(base, len(entries))(entries)


def sudoku(puzzle: Matrix) -> Matrix:
    r"""
    Solve a 9-by-9 Sudoku puzzle represented by a matrix.

    Entries from 1 through 9 are fixed clues and zero denotes an empty cell.
    The input matrix is not modified.  A `ValueError` is raised if the clues
    are inconsistent or the puzzle has no solution.

    ### Examples

    ```sage
    sage: A = matrix(ZZ, 9, [
    ....:     5,0,0,0,8,0,0,4,9, 0,0,0,5,0,0,0,3,0,
    ....:     0,6,7,3,0,0,0,0,1, 1,5,0,0,0,0,0,0,0,
    ....:     0,0,0,2,0,8,0,0,0, 0,0,0,0,0,0,0,1,8,
    ....:     7,0,0,0,0,4,1,5,0, 0,3,0,0,0,2,0,0,0,
    ....:     4,9,0,0,5,0,0,0,3])
    sage: sudoku(A)[0]
    (5, 1, 3, 6, 8, 7, 2, 4, 9)
    ```
    """
    if not isinstance(puzzle, Matrix):
        raise TypeError('sudoku puzzle must be a matrix')
    if puzzle.nrows() != 9 or puzzle.ncols() != 9:
        raise ValueError('sudoku puzzle must be a 9 by 9 matrix')
    values = []
    for row in range(9):
        for column in range(9):
            value = int(puzzle[row, column])
            if value < 0 or value > 9:
                raise ValueError('sudoku entries must be between 0 and 9')
            values.append(value)

    def allowed(position: int, digit: int) -> bool:
        row = position // 9
        column = position % 9
        for index in range(9):
            if values[row * 9 + index] == digit:
                return False
            if values[index * 9 + column] == digit:
                return False
        row_start = (row // 3) * 3
        column_start = (column // 3) * 3
        for row_offset in range(3):
            for column_offset in range(3):
                index = (
                    (row_start + row_offset) * 9
                    + column_start + column_offset
                )
                if values[index] == digit:
                    return False
        return True

    def fill(position: int) -> bool:
        while position < 81 and values[position] != 0:
            position += 1
        if position == 81:
            return True
        for digit in range(1, 10):
            if allowed(position, digit):
                values[position] = digit
                if fill(position + 1):
                    return True
                values[position] = 0
        return False

    if not fill(0):
        raise ValueError('sudoku puzzle has no solution')
    return matrix(sage.ZZ, 9, 9, values)


def kernel(value: Any) -> Any:
    return value.kernel()


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
    start = runtime.integer_bigint(start)
    stop = runtime.integer_bigint(stop)
    width = stop - start + runtime.bigint(1)
    if width <= 0:
        raise ValueError('empty random integer range')
    word_base = runtime.bigint(4294967296)
    span = runtime.bigint(1)
    words = 0
    while span < width:
        span *= word_base
        words += 1
    while True:
        value = runtime.bigint(0)
        for _index in range(words):
            word = runtime.integer_bigint(
                runtime.math.floor(
                    _random_float() * 4294967296))
            value = value * word_base + word
        limit = span - span % width
        if value < limit:
            return start + value % width


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


def _random_extension_field_element(
    base: sage.Parent,
    nonzero: bool,
) -> Any:
    while True:
        value = base(0)
        power = base(1)
        degree = _untyped(base).degree()
        characteristic = _untyped(base).characteristic()
        generator = _untyped(base).gen()
        for _index in range(degree):
            coefficient = _random_int(
                0, characteristic - 1)
            value += base(coefficient) * power
            power *= generator
        if not nonzero or not value.is_zero():
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
    r"""
    Construct a random dense matrix over `base`.

    The dimensions are `nrows` by `ncols`; omitting `ncols` constructs
    a square matrix. The common Sage keywords `density`, `x`, `y`, and
    `distribution='uniform'` are supported where meaningful.

    ### Examples

    ```sage
    sage: A = random_matrix(ZZ, 3, 5, x=-10, y=11)
    sage: A.nrows(), A.ncols(), A.base_ring()
    (3, 5, Integer Ring)
    sage: random_matrix(GF(9, 'a'), 2).base_ring() is GF(9, 'a')
    True
    ```

    Sparse matrices and alternate construction algorithms are not yet
    implemented.
    """
    def keyword(name: str, fallback: Any) -> Any:
        value = runtime.reflect.get(kwds, name)
        return fallback if value is runtime.undefined else value

    base = _canonical_base(base)
    modular_ring = _is_modular_base(base)
    extension_field = _is_extension_field_base(base)
    approximate_field = _is_approximate_base(base)
    if (
        base is not sage.ZZ
        and base is not sage.QQ
        and not modular_ring
        and not extension_field
        and not approximate_field
    ):
        raise TypeError(
            'random_matrix currently requires ZZ, QQ, GF, Zmod, '
            'or a real/complex field')
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

    if (
        modular_ring
        and lower is None
        and density == 1
        and distribution in (None, 'uniform')
    ):
        backend = runtime.flint_backend()
        method_name = (
            'zmodMatrixRandom'
            if getattr(base, '_kind', None) == 'ZMOD'
            else 'nmodMatrixRandom'
        )
        random_method = runtime.reflect.get(backend, method_name)
        if runtime.jstype(random_method) == 'function':
            seed1 = _random_int(0, 4294967295)
            seed2 = _random_int(0, 4294967295)
            native_value = runtime.reflect.apply(
                random_method,
                backend,
                [rows, cols, base._modulus, seed1, seed2],
            )
            return Matrix(
                MatrixSpace(base, rows, cols), native_value)

    values = [0 for _ in range(rows * cols)]
    if density == 1:
        for index in range(len(values)):
            if extension_field and lower is None:
                values[index] = _random_extension_field_element(
                    base, False)
                continue
            if modular_ring and lower is None:
                value = _random_int(
                    0,
                    runtime.normalize_integer(
                        runtime.reflect.get(base, '_modulus')) - 1,
                )
            else:
                value = _random_integer(
                    distribution, lower, upper, False)
            values[index] = base(value)
    else:
        choices_per_row = int(density * cols)
        for row in range(rows):
            for _ in range(choices_per_row):
                column = _random_int(0, cols - 1)
                if modular_ring and lower is None:
                    value = _random_int(
                        1,
                        runtime.normalize_integer(
                        runtime.reflect.get(
                                base, '_modulus')) - 1,
                    )
                elif extension_field and lower is None:
                    values[row * cols + column] = (
                        _random_extension_field_element(
                            base, True))
                    continue
                else:
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
Mat = MatrixSpace


def _matrix_doc(
    tags: list[str],
    compatibility_notes: str,
    limitations: Any = None,
) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ['linear algebra', 'matrices'],
        [tags],
    )
    return {
        'kind': 'function',
        'module': 'sage.matrix.constructor',
        'tags': all_tags,
        'backends': ['FLINT', 'Arb', 'ACB'],
        'sage_compatibility': {
            'status': 'partial',
            'notes': compatibility_notes,
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath matrix API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'matrices/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'library-backed',
                'source': 'FLINT, Arb, and ACB',
                'url': 'https://flintlib.org/doc/',
            },
        ],
        'references': [
            {
                'id': 'flint',
                'type': 'software',
                'title': 'FLINT: Fast Library for Number Theory',
                'authors': ['The FLINT contributors'],
                'url': 'https://flintlib.org/',
            },
        ],
        'implementation': {
            'algorithm': (
                'Native FLINT dense matrices, including Arb/ACB '
                'approximate arithmetic'
            ),
        },
        'limitations': [] if limitations is None else limitations,
    }


runtime.register_doc(
    'matrix',
    matrix,
    _matrix_doc(
        ['construction', 'exact arithmetic', 'numerical linear algebra'],
        (
            'Common dense constructors and implemented matrix methods are '
            'Sage-compatible; sparse matrices are not yet available.'
        ),
        ['Sparse matrix construction is not implemented.'],
    ),
)
runtime.register_doc(
    'random_matrix',
    random_matrix,
    _matrix_doc(
        ['random generation', 'benchmarking'],
        (
            'The randomize algorithm and common density/range options are '
            'compatible; specialized SageMath algorithms are not available.'
        ),
        [
            'Only algorithm=randomize is supported.',
            'Sparse output is not implemented.',
        ],
    ),
)
runtime.register_doc(
    'sudoku',
    sudoku,
    _matrix_doc(
        ['constraint solving', 'games'],
        'Solves Sage-compatible 9 by 9 integer Sudoku matrices.',
    ),
)
