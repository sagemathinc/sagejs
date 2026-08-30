r"""Exact newforms and old/new decomposition from modular symbols.

For a simple rational Hecke constituent $A$, a primitive Hecke operator
$\theta$ identifies its commutative Hecke algebra with
$K=\QQ[\theta]$.  Writing every $T_n$ uniquely in the power basis of
$\theta$ recovers the normalized eigenvalue $a_n\in K$.  This is exact
linear algebra over $\QQ$; numerical root choices never enter.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _nonnegative(value: Any, label: str) -> int:
    value = runtime.normalize_integer(value)
    if runtime.jstype(value) != "number" or not runtime.number.isSafeInteger(value):
        raise TypeError(label + " must be an exact machine integer")
    answer = runtime.number(value)
    if answer < 0:
        raise ValueError(label + " must be nonnegative")
    return answer


def _matrix_from_rows(rows: list[list[Any]], columns: int) -> Any:
    matrix_constructor = _global("matrix")
    if len(rows) == 0:
        return matrix_constructor(sage.QQ, 0, columns)
    return matrix_constructor(sage.QQ, rows)


def _series_from_matrix(matrix: Any, variable: str) -> list[Any]:
    precision = matrix.ncols()
    ring = _global("PowerSeriesRing")(
        matrix.base_ring(), variable, default_prec=max(1, precision)
    )
    return [ring(row.list()).add_bigoh(precision) for row in matrix.rows()]


def _sturm_precision(space: Any, precision: Any = None) -> int:
    if precision is None:
        return max(2, space.sturm_bound() + 1)
    answer = _nonnegative(precision, "precision")
    if answer < 1:
        raise ValueError("precision must be at least 1")
    return answer


def _primitive_operator(constituent: Any) -> tuple[Any, Any, tuple[Any, ...]]:
    """Find a deterministic primitive element of a simple Hecke algebra."""
    dimension = constituent.dimension()
    bound = max(7, constituent.sturm_bound() + 1)
    operators = []
    for index in range(2, bound + 2):
        operator = constituent.hecke_matrix(index)
        operators.append((index, operator))
        polynomial = operator.charpoly("x")
        factors = list(polynomial.factor())
        if (
            polynomial.degree() == dimension
            and len(factors) == 1
            and factors[0][1] == 1
        ):
            return operator, polynomial, runtime.math_tuple([(index, 1)])
    for left_index in range(len(operators)):
        for right_index in range(left_index + 1, len(operators)):
            for coefficient in [1, 2, 3, 4]:
                operator = (
                    operators[left_index][1] + coefficient * operators[right_index][1]
                )
                polynomial = operator.charpoly("x")
                factors = list(polynomial.factor())
                if (
                    polynomial.degree() == dimension
                    and len(factors) == 1
                    and factors[0][1] == 1
                ):
                    return (
                        operator,
                        polynomial,
                        runtime.math_tuple(
                            [
                                (operators[left_index][0], 1),
                                (operators[right_index][0], coefficient),
                            ]
                        ),
                    )
    raise ArithmeticError("could not find a primitive Hecke operator")


@runtime.lightweight_math_class
class NormalizedNewform(sage.Element):
    """A normalized newform represented by its exact simple Hecke constituent."""

    def __init__(self, parent: Any, constituent: Any, name: str) -> None:
        self._parent = parent
        self._constituent = constituent
        self._dimension = constituent.dimension()
        primitive, polynomial, recipe = _primitive_operator(constituent)
        self._primitive_operator = primitive
        self._defining_polynomial = polynomial
        self._primitive_recipe = recipe
        if self._dimension == 1:
            self._coefficient_field = sage.QQ
        else:
            self._coefficient_field = _global("NumberField")(polynomial, name)
        identity = _global("identity_matrix")(sage.QQ, self._dimension)
        powers = [identity]
        for _index in range(1, self._dimension):
            powers.append(powers[-1] * primitive)
        self._powers = runtime.math_tuple(powers)
        self._power_rows = _global("matrix")(
            sage.QQ, [power.list() for power in powers]
        )
        if self._power_rows.rank() != self._dimension:
            raise ArithmeticError("primitive Hecke powers are linearly dependent")
        self._coefficient_cache = runtime.map()
        self._coefficient_cache.set(1, self._coefficient_field(1))
        runtime.object.freeze(self)

    def parent(self) -> Any:
        return self._parent

    ambient_space = parent

    def level(self) -> int:
        return self._parent.level()

    def weight(self) -> int:
        return self._parent.weight()

    def character(self) -> Any:
        return _global("DirichletGroup")(self.level())(1)

    def base_ring(self) -> Any:
        return self._coefficient_field

    coefficient_field = base_ring

    def defining_polynomial(self) -> Any:
        return self._defining_polynomial

    def primitive_hecke_recipe(self) -> Any:
        return self._primitive_recipe

    def hecke_constituent(self) -> Any:
        return self._constituent

    def _coordinates_for_operator(self, operator: Any) -> Any:
        solution = self._power_rows.solve_left(
            _global("vector")(sage.QQ, operator.list())
        )
        return _global("vector")(sage.QQ, solution.list())

    def hecke_eigenvalue(self, index: Any) -> Any:
        index = _nonnegative(index, "Hecke index")
        if index == 0:
            return self._coefficient_field(0)
        cached = self._coefficient_cache.get(index)
        if cached is not runtime.undefined:
            return cached
        coordinates = self._coordinates_for_operator(
            self._constituent.hecke_matrix(index)
        )
        if self._coefficient_field is sage.QQ:
            answer = coordinates[0]
        else:
            answer = self._coefficient_field._from_coefficients(coordinates.list())
        self._coefficient_cache.set(index, answer)
        return answer

    __getitem__ = hecke_eigenvalue
    an = hecke_eigenvalue

    def q_expansion(self, prec: Any = None, variable: str = "q") -> Any:
        precision = (
            self._parent.precision()
            if prec is None
            else _nonnegative(prec, "precision")
        )
        ring = _global("PowerSeriesRing")(
            self._coefficient_field,
            variable,
            default_prec=max(1, precision),
        )
        coefficients = [self.hecke_eigenvalue(index) for index in range(precision)]
        return ring(coefficients).add_bigoh(precision)

    qexp = q_expansion

    def certificate(self, prec: Any = None) -> NewformCertificate:
        return NewformCertificate(self, _sturm_precision(self._parent, prec))

    def __repr__(self) -> str:
        return (
            "q + ... (normalized newform of level "
            + str(self.level())
            + ", weight "
            + str(self.weight())
            + ", and coefficient field "
            + str(self._coefficient_field)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


class NewformCertificate:
    """Replayable exact Hecke-algebra certificate for one Galois packet."""

    def __init__(self, form: NormalizedNewform, precision: int) -> None:
        self._form = form
        self._precision = precision
        self._sturm_bound = form.parent().sturm_bound()
        if precision <= self._sturm_bound:
            raise ValueError("certificate precision must exceed the Sturm bound")
        if not self.verify():
            raise ArithmeticError("newform Hecke-algebra certificate failed")
        runtime.object.freeze(self)

    def form(self) -> NormalizedNewform:
        return self._form

    def precision(self) -> int:
        return self._precision

    def sturm_bound(self) -> int:
        return self._sturm_bound

    def is_sturm_certified(self) -> bool:
        return self._precision > self._sturm_bound

    def verify(self) -> bool:
        form = self._form
        if form.hecke_eigenvalue(1) != form.coefficient_field()(1):
            return False
        for index in range(1, self._precision):
            coordinates = form._coordinates_for_operator(
                form.hecke_constituent().hecke_matrix(index)
            )
            replay = form._powers[0] * coordinates[0]
            for exponent in range(1, form._dimension):
                replay += form._powers[exponent] * coordinates[exponent]
            if replay != form.hecke_constituent().hecke_matrix(index):
                return False
            if form.coefficient_field() is sage.QQ:
                expected = coordinates[0]
            else:
                expected = form.coefficient_field()._from_coefficients(
                    coordinates.list()
                )
            if form.hecke_eigenvalue(index) != expected:
                return False
        return self.is_sturm_certified()

    def __repr__(self) -> str:
        return "Sturm-certified normalized newform packet through q^" + str(
            self._precision - 1
        )

    __str__ = __repr__
    toString = __repr__


def _old_q_expansion_matrix(space: Any, precision: int) -> Any:
    rows: list[list[Any]] = []
    level = space.level()
    if level == 1:
        return _matrix_from_rows(rows, precision)
    for prime, _exponent in sage.factor(level):
        prime = runtime.number(prime)
        lower_level = level // prime
        lower = _global("CuspForms")(
            lower_level,
            space.weight(),
            sage.QQ,
            True,
            precision,
        )
        algorithm = "formulas" if lower_level == 1 else "modular_symbols"
        for form in lower.q_expansion_basis(precision, algorithm=algorithm):
            for factor in [1, prime]:
                inflated = form._inflate(factor, precision)
                rows.append([inflated[index] for index in range(precision)])
    matrix = _matrix_from_rows(rows, precision)
    if matrix.nrows() == 0:
        return matrix
    return matrix.row_space().basis_matrix()


class OldModularFormsSubspace(sage.Parent):
    """The exact span of all proper-level degeneracy images."""

    def __init__(self, cusp_space: Any) -> None:
        self._cusp_space = cusp_space
        self._dimension = _old_q_expansion_matrix(
            cusp_space, _sturm_precision(cusp_space)
        ).rank()
        runtime.object.freeze(self)

    def ambient_space(self) -> Any:
        return self._cusp_space.ambient_space()

    def level(self) -> int:
        return self._cusp_space.level()

    def weight(self) -> int:
        return self._cusp_space.weight()

    def group(self) -> Any:
        return self._cusp_space.group()

    def base_ring(self) -> Any:
        return sage.QQ

    def dimension(self) -> int:
        return self._dimension

    degree = dimension

    def precision(self) -> int:
        return self._cusp_space.precision()

    prec = precision

    def sturm_bound(self) -> int:
        return self._cusp_space.sturm_bound()

    def q_expansion_basis(
        self,
        prec: Any = None,
        algorithm: str = "modular_symbols",
        variable: str = "q",
        **_opts: Any,
    ) -> list[Any]:
        if algorithm not in ["default", "modular_symbols"]:
            raise ValueError("oldspace q-expansions use exact degeneracy maps")
        precision = self.precision() if prec is None else _sturm_precision(self, prec)
        return _series_from_matrix(
            _old_q_expansion_matrix(self._cusp_space, precision), variable
        )

    def q_expansion_basis_certificate(
        self, prec: Any = None
    ) -> NewOldDecompositionCertificate:
        return NewOldDecompositionCertificate(
            self._cusp_space, _sturm_precision(self, prec)
        )

    def __repr__(self) -> str:
        return (
            "Old subspace of dimension "
            + str(self._dimension)
            + " of "
            + str(self._cusp_space.ambient_space())
        )

    __str__ = __repr__
    toString = __repr__


class NewOldDecompositionCertificate:
    """Exact Sturm-bound certificate that cusp = old direct-sum new."""

    def __init__(self, cusp_space: Any, precision: int) -> None:
        self._cusp_space = cusp_space
        self._precision = precision
        self._sturm_bound = cusp_space.sturm_bound()
        if precision <= self._sturm_bound:
            raise ValueError("certificate precision must exceed the Sturm bound")
        self._old_matrix = _old_q_expansion_matrix(cusp_space, precision)
        new_space = modular_forms_new_subspace(cusp_space)
        new_basis = new_space.q_expansion_basis(precision, algorithm="modular_symbols")
        self._new_matrix = _matrix_from_rows(
            [[form[index] for index in range(precision)] for form in new_basis],
            precision,
        )
        full_basis = cusp_space.q_expansion_basis(
            precision,
            algorithm="formulas" if cusp_space.level() == 1 else "modular_symbols",
        )
        self._full_matrix = _matrix_from_rows(
            [[form[index] for index in range(precision)] for form in full_basis],
            precision,
        )
        if not self.verify():
            raise ArithmeticError("old/new Sturm decomposition certificate failed")
        runtime.object.freeze(self)

    def precision(self) -> int:
        return self._precision

    def sturm_bound(self) -> int:
        return self._sturm_bound

    def old_dimension(self) -> int:
        return self._old_matrix.rank()

    def new_dimension(self) -> int:
        return self._new_matrix.rank()

    def dimension(self) -> int:
        return self._full_matrix.rank()

    def verify(self) -> bool:
        combined_rows = [row.list() for row in self._old_matrix.rows()]
        combined_rows += [row.list() for row in self._new_matrix.rows()]
        combined = _matrix_from_rows(combined_rows, self._precision)
        return (
            self._precision > self._sturm_bound
            and self._full_matrix.rank() == self._cusp_space.dimension()
            and combined.rank() == self._full_matrix.rank()
            and self.old_dimension() + self.new_dimension() == combined.rank()
            and combined.row_space() == self._full_matrix.row_space()
        )

    def __repr__(self) -> str:
        return (
            "Sturm-certified old/new decomposition of dimensions "
            + str(self.old_dimension())
            + " + "
            + str(self.new_dimension())
            + " = "
            + str(self.dimension())
        )

    __str__ = __repr__
    toString = __repr__


def modular_forms_new_subspace(space: Any, prime: Any = None) -> Any:
    symbols = space._modular_symbols_cusp_space().new_submodule(prime)
    answer = space.__class__(space.ambient_space(), "New", symbols.dimension())
    answer._modular_symbols_cusp_space_cache = symbols
    return answer


def modular_forms_old_subspace(space: Any) -> OldModularFormsSubspace:
    return OldModularFormsSubspace(space)


def modular_forms_newforms(space: Any, names: str = "a") -> list[NormalizedNewform]:
    if not isinstance(names, str) or len(names) == 0:
        raise TypeError("newform generator name must be a nonempty string")
    new_space = modular_forms_new_subspace(space)
    constituents = new_space._modular_symbols_cusp_space().decomposition(anemic=False)
    answer = []
    for index, constituent in enumerate(constituents):
        answer.append(NormalizedNewform(new_space, constituent, names + str(index)))
    return answer


__all__ = [
    "NewOldDecompositionCertificate",
    "NewformCertificate",
    "NormalizedNewform",
    "OldModularFormsSubspace",
    "modular_forms_new_subspace",
    "modular_forms_newforms",
    "modular_forms_old_subspace",
]
