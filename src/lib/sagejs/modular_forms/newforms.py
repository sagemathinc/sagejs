r"""Exact newforms and old/new decomposition from modular symbols.

For a simple Hecke constituent $A$ over its exact ground field $K$, a
primitive Hecke operator $\theta$ identifies the commutative Hecke algebra
with $K[\theta]$.  Writing every $T_n$ uniquely in the power basis of
$\theta$ recovers the normalized eigenvalue $a_n$.  Over $\QQ$ this is
represented by a simple number field.  Over a cyclotomic ground field, an
exact compatible root is isolated in `QQbar` by restriction of scalars.
Numerical root recognition never enters.
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


def _matrix_from_rows(
    rows: list[list[Any]],
    columns: int,
    coefficient_ring: Any = sage.QQ,
) -> Any:
    matrix_constructor = _global("matrix")
    if len(rows) == 0:
        return matrix_constructor(coefficient_ring, 0, columns)
    return matrix_constructor(coefficient_ring, rows)


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


def _qqbar_value(value: Any) -> Any:
    """Embed one exact scalar in Sage.js's canonical algebraic closure."""
    algebraic_field = _global("QQbar")
    native = runtime.reflect.get(value, "_native")
    if native is not runtime.undefined:
        return algebraic_field._from_native(native)
    return algebraic_field(value)


def _absolute_regular_matrix(source: Any, field: Any) -> Any:
    r"""Restrict a matrix over a cyclotomic field to $\QQ$.

    Rows and columns are ordered first by the module coordinate and then by
    the power basis $1,\zeta,\ldots,\zeta^{[K:\QQ]-1}$.  The classical
    modular-form object layer uses row-vector Hecke actions, so each row is
    the image of the corresponding basis vector.
    """
    degree = runtime.number(field.degree())
    dimension = source.nrows()
    generator = field.gen()
    powers = [field(1)]
    for _index in range(1, degree):
        powers.append(powers[-1] * generator)
    rows = []
    for source_index in range(dimension):
        for field_index in range(degree):
            row = [sage.QQ(0) for _index in range(dimension * degree)]
            for target_index in range(dimension):
                coordinates = list(
                    field._serialization_coefficients(
                        powers[field_index] * source[source_index, target_index]
                    )
                )
                for coordinate_index in range(len(coordinates)):
                    row[target_index * degree + coordinate_index] = coordinates[
                        coordinate_index
                    ]
            rows.append(row)
    return _global("matrix")(sage.QQ, rows)


def _canonical_relative_root(primitive: Any, field: Any) -> Any:
    r"""Choose an exact root compatible with the declared embedding of `field`.

    Sage.js does not yet expose relative number-field parents.  We nevertheless
    retain exact eigenforms: restrict the primitive Hecke operator to $\QQ$,
    isolate all roots in `QQbar`, and keep precisely those roots for which the
    original matrix over the *declared* cyclotomic embedding is singular.  The
    presentation ordering of exact algebraic roots then makes the chosen
    embedding deterministic and serializable.
    """
    absolute = _absolute_regular_matrix(primitive, field)
    algebraic_field = _global("QQbar")
    canonical = _global("matrix")(
        algebraic_field,
        [
            [
                _qqbar_value(primitive[row, column])
                for column in range(primitive.ncols())
            ]
            for row in range(primitive.nrows())
        ],
    )
    identity = _global("identity_matrix")(algebraic_field, primitive.nrows())
    compatible = []
    for root in absolute.eigenvalues():
        if any(root == known for known in compatible):
            continue
        if (canonical - root * identity).rank() < primitive.nrows():
            compatible.append(root)
    if len(compatible) != primitive.nrows():
        raise ArithmeticError(
            "could not isolate the roots compatible with the cyclotomic "
            "coefficient-field embedding"
        )
    return compatible[0]


@runtime.lightweight_math_class
class NormalizedNewform(sage.Element):
    """A normalized newform represented by its exact simple Hecke constituent."""

    def __init__(self, parent: Any, constituent: Any, name: str) -> None:
        self._kind = "NormalizedNewform"
        self._parent = parent
        self._constituent = constituent
        self._name = name
        self._dimension = constituent.dimension()
        primitive, polynomial, recipe = _primitive_operator(constituent)
        self._primitive_operator = primitive
        self._defining_polynomial = polynomial
        self._primitive_recipe = recipe
        self._coefficient_field: Any
        ground_field = parent.base_ring()
        if self._dimension == 1:
            self._coefficient_field = ground_field
            self._primitive_root = None
        else:
            if ground_field is sage.QQ:
                self._coefficient_field = _global("NumberField")(polynomial, name)
                self._primitive_root = None
            else:
                self._coefficient_field = _global("QQbar")
                self._primitive_root = _canonical_relative_root(
                    primitive,
                    ground_field,
                )
        identity = _global("identity_matrix")(ground_field, self._dimension)
        # The primitive polynomial is irreducible of degree d, so every
        # nonzero row is cyclic. A d-by-d Krylov basis determines elements of
        # K[primitive], without storing d full d-by-d matrix powers.
        rows = [identity.row(0)]
        for _index in range(1, self._dimension):
            rows.append(rows[-1] * primitive)
        self._cyclic_basis = _global("matrix")(
            ground_field, [row.list() for row in rows]
        )
        if self._cyclic_basis.rank() != self._dimension:
            raise ArithmeticError("primitive Hecke powers are linearly dependent")
        self._coefficient_cache = runtime.map()
        self._coefficient_cache.set(1, self._coefficient_field(1))
        runtime.object.freeze(self)

    def parent(self) -> Any:
        return self._parent

    ambient_space = parent

    def level(self) -> int:
        return self._parent.level()

    def conductor(self) -> int:
        """Return the conductor of this primitive newform."""
        return self.level()

    def weight(self) -> int:
        return self._parent.weight()

    def character(self) -> Any:
        return self._parent.character()

    def base_ring(self) -> Any:
        return self._coefficient_field

    coefficient_field = base_ring

    def defining_polynomial(self) -> Any:
        return self._defining_polynomial

    def primitive_hecke_recipe(self) -> Any:
        return self._primitive_recipe

    def hecke_constituent(self) -> Any:
        return self._constituent

    def abelian_variety(self) -> Any:
        r"""Return the connected quotient $A_f$ attached to this newform."""
        return _global("AbelianVariety")(self)

    def _coordinates_for_operator(self, operator: Any) -> Any:
        ground_field = self._parent.base_ring()
        # Commutation and agreement on a cyclic row imply agreement on the
        # whole module. Preserve the old full-matrix membership check: an
        # arbitrary matrix cannot masquerade as a Hecke algebra element by
        # merely sharing its first row.
        primitive = self._primitive_operator
        if operator * primitive != primitive * operator:
            raise ArithmeticError("operator is not in the primitive Hecke algebra")
        solution = self._cyclic_basis.solve_left(operator.row(0))
        return _global("vector")(ground_field, solution.list())

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
        if self._dimension == 1:
            answer = coordinates[0]
        elif self._primitive_root is not None:
            answer = self._coefficient_field(0)
            power = self._coefficient_field(1)
            for coefficient in coordinates:
                answer += _qqbar_value(coefficient) * power
                power *= self._primitive_root
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

    def lseries_input(self, coefficient_bound: Any = None) -> ModularFormLSeriesInput:
        r"""Return exact arithmetic-normalized input for $L(f,s)$."""
        bound = (
            max(1, self._parent.sturm_bound() + 1)
            if coefficient_bound is None
            else _nonnegative(coefficient_bound, "coefficient bound")
        )
        return ModularFormLSeriesInput(self, bound)

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


class ModularFormLSeriesInput(sage.Parent):
    r"""A finite exact prefix for the arithmetic Dirichlet series.

    This records

    $$
    L(f,s)=\sum_{n\geq1}a_n n^{-s}
    $$

    without choosing a numerical embedding of the coefficient field.  It is
    intentionally an exact input object, not a claim that a complex analytic
    continuation has already been initialized.
    """

    def __init__(self, form: Any, coefficient_bound: Any) -> None:
        self._form = form
        self._coefficient_bound = _nonnegative(coefficient_bound, "coefficient bound")
        if self._coefficient_bound < 1:
            raise ValueError("coefficient bound must be at least 1")
        self._coefficients = runtime.math_tuple(
            [
                form.hecke_eigenvalue(index)
                for index in range(1, self._coefficient_bound + 1)
            ]
        )
        self._verified = self._verify()
        if not self._verified:
            raise ArithmeticError("modular-form L-series input verification failed")
        runtime.object.freeze(self)

    def modular_form(self) -> Any:
        return self._form

    def conductor(self) -> int:
        if not hasattr(self._form, "conductor"):
            raise NotImplementedError(
                "the primitive conductor is not certified for this modular form"
            )
        return self._form.conductor()

    def level(self) -> int:
        return self._form.level()

    def weight(self) -> int:
        return self._form.weight()

    def character(self) -> Any:
        return self._form.character()

    def coefficient_field(self) -> Any:
        return self._form.coefficient_field()

    base_ring = coefficient_field

    def coefficient_bound(self) -> int:
        return self._coefficient_bound

    def coefficient(self, index: Any) -> Any:
        coefficient_index = _nonnegative(index, "Dirichlet coefficient index")
        if coefficient_index < 1 or coefficient_index > self._coefficient_bound:
            raise IndexError("coefficient lies outside the exact L-series prefix")
        return self._coefficients[coefficient_index - 1]

    __getitem__ = coefficient

    def coefficients(self) -> tuple[Any, ...]:
        return self._coefficients

    def normalization(self) -> str:
        return "arithmetic: L(f,s)=sum(a_n*n^(-s), n>=1)"

    def functional_equation_center(self) -> Any:
        return sage.QQ(self.weight()) / 2

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def _verify(self) -> bool:
        if len(self._coefficients) != self._coefficient_bound:
            return False
        if self._coefficients[0] != self._form.coefficient_field()(1):
            return False
        for index in range(1, self._coefficient_bound + 1):
            if self._coefficients[index - 1] != self._form.hecke_eigenvalue(index):
                return False
        return True

    def __repr__(self) -> str:
        return (
            "Exact L-series input with "
            + str(self._coefficient_bound)
            + " coefficients for a weight "
            + str(self.weight())
            + " modular form of level "
            + str(self.level())
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
            # _coordinates_for_operator verifies commutation; equality on
            # this cyclic row then certifies equality of the full matrices.
            replay = coordinates * form._cyclic_basis
            if replay != form.hecke_constituent().hecke_matrix(index).row(0):
                return False
            if form._dimension == 1:
                expected = coordinates[0]
            elif form._primitive_root is not None:
                expected = form.coefficient_field()(0)
                power = form.coefficient_field()(1)
                for coefficient in coordinates:
                    expected += _qqbar_value(coefficient) * power
                    power *= form._primitive_root
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


def _descended_character(character: Any, lower_level: int) -> Any:
    """Return the unique character at `lower_level` inducing `character`."""
    level = runtime.number(character.modulus())
    if level % lower_level != 0:
        raise ValueError("lower character level must divide the source level")
    if lower_level % runtime.number(character.conductor()) != 0:
        raise ValueError("the character does not descend to the requested level")
    group = _global("DirichletGroup")(lower_level)
    for candidate in group:
        agrees = True
        for residue in range(1, level + 1):
            if runtime.number(_global("gcd")(residue, level)) == 1 and (
                not runtime.flint_backend().qqbarEqual(
                    candidate(residue)._native,
                    character(residue)._native,
                )
            ):
                agrees = False
                break
        if agrees:
            return candidate
    raise ArithmeticError("could not descend the Dirichlet character")


def _old_q_expansion_matrix(space: Any, precision: int) -> Any:
    rows: list[list[Any]] = []
    level = space.level()
    coefficient_ring = space.base_ring()
    if level == 1:
        return _matrix_from_rows(rows, precision, coefficient_ring)
    ambient = space.ambient_space()
    character = ambient.character()
    has_character = runtime.reflect.get(ambient, "_character") is not None
    conductor = runtime.number(character.conductor()) if has_character else 1
    for prime, _exponent in sage.factor(level):
        prime = runtime.number(prime)
        lower_level = level // prime
        if lower_level % conductor != 0:
            continue
        defining_data = (
            _descended_character(character, lower_level)
            if has_character
            else lower_level
        )
        lower = _global("CuspForms")(
            defining_data,
            space.weight(),
            coefficient_ring,
            True,
            precision,
        )
        algorithm = "formulas" if lower_level == 1 else "modular_symbols"
        for form in lower.q_expansion_basis(precision, algorithm=algorithm):
            for factor in [1, prime]:
                inflated = form._inflate(factor, precision)
                rows.append(
                    [coefficient_ring(inflated[index]) for index in range(precision)]
                )
    matrix = _matrix_from_rows(rows, precision, coefficient_ring)
    if matrix.nrows() == 0:
        return matrix
    return matrix.row_space().basis_matrix()


class OldModularFormsSubspace(sage.Parent):
    """The exact span of all proper-level degeneracy images."""

    def __init__(self, cusp_space: Any) -> None:
        self._kind = "OldModularFormsSubspace"
        self._subspace_kind = "Old"
        self._cusp_space = cusp_space
        self._dimension = _old_q_expansion_matrix(
            cusp_space, _sturm_precision(cusp_space)
        ).rank()
        self._classical_qexp_basis_cache = runtime.map()
        self._classical_hecke_cache = runtime.map()
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
        return self._cusp_space.base_ring()

    def character(self) -> Any:
        return self._cusp_space.character()

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
        requested_precision = (
            self.precision() if prec is None else _sturm_precision(self, prec)
        )
        proof_precision = _sturm_precision(self)
        construction_precision = max(requested_precision, proof_precision)
        result = _series_from_matrix(
            _old_q_expansion_matrix(self._cusp_space, construction_precision),
            variable,
        )
        if requested_precision < construction_precision:
            return [series.add_bigoh(requested_precision) for series in result]
        return result

    def q_expansion_basis_certificate(
        self, prec: Any = None
    ) -> NewOldDecompositionCertificate:
        return NewOldDecompositionCertificate(
            self._cusp_space, _sturm_precision(self, prec)
        )

    def basis(self, prec: Any = None) -> list[Any]:
        """Return the canonical exact parented oldspace basis."""
        from . import object_layer

        return object_layer.basis(self, prec)

    gens = basis

    def gen(self, index: Any = 0) -> Any:
        return self.basis()[_nonnegative(index, "basis index")]

    def __call__(self, value: Any = 0) -> Any:
        from . import object_layer

        return object_layer.construct_element(self, value)

    def coordinates(self, value: Any) -> Any:
        from . import object_layer

        return object_layer.coordinates(self, value)

    def contains(self, value: Any) -> bool:
        from . import object_layer

        return object_layer.contains(self, value)

    def __contains__(self, value: Any) -> bool:
        return self.contains(value)

    def zero(self) -> Any:
        from . import object_layer

        return object_layer.zero(self)

    def hecke_matrix(self, index: Any) -> Any:
        from . import object_layer

        return object_layer.hecke_matrix(self, index)

    def T(self, index: Any) -> Any:
        from . import object_layer

        return object_layer.hecke_operator(self, index)

    hecke_operator = T

    def _from_serialized_classical_element(
        self,
        coordinates: Any,
        display_precision: Any,
    ) -> Any:
        from . import object_layer

        return object_layer.construct_element(self, coordinates, display_precision)

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
            cusp_space.base_ring(),
        )
        full_basis = cusp_space.q_expansion_basis(
            precision,
            algorithm="formulas" if cusp_space.level() == 1 else "modular_symbols",
        )
        self._full_matrix = _matrix_from_rows(
            [[form[index] for index in range(precision)] for form in full_basis],
            precision,
            cusp_space.base_ring(),
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
        combined = _matrix_from_rows(
            combined_rows,
            self._precision,
            self._cusp_space.base_ring(),
        )
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
    if getattr(space, "_subspace_kind", None) == "New" and prime is None:
        return space
    source_symbols = space._modular_symbols_cusp_space()
    try:
        symbols = source_symbols.new_submodule(prime)
    except NotImplementedError:
        if prime is not None:
            raise
        precision = _sturm_precision(space)
        old_matrix = _old_q_expansion_matrix(space, precision)
        selected = []
        for constituent in source_symbols.decomposition(anemic=False):
            expansions = constituent.q_expansion_basis(precision)
            rows = [[form[index] for index in range(precision)] for form in expansions]
            constituent_matrix = _matrix_from_rows(
                rows,
                precision,
                space.base_ring(),
            )
            combined_rows = [row.list() for row in old_matrix.rows()]
            combined_rows += [row.list() for row in constituent_matrix.rows()]
            combined = _matrix_from_rows(
                combined_rows,
                precision,
                space.base_ring(),
            )
            if combined.rank() > old_matrix.rank():
                selected.extend(constituent.basis_matrix().rows())
        symbol_rows = [row.list() for row in selected]
        symbol_basis = _matrix_from_rows(
            symbol_rows,
            source_symbols.ambient_module().dimension(),
            space.base_ring(),
        )
        symbols = source_symbols._new_coordinate_subspace(symbol_basis, "New")
        new_expansions = symbols.q_expansion_basis(precision)
        new_matrix = _matrix_from_rows(
            [[form[index] for index in range(precision)] for form in new_expansions],
            precision,
            space.base_ring(),
        )
        combined_rows = [row.list() for row in old_matrix.rows()]
        combined_rows += [row.list() for row in new_matrix.rows()]
        combined = _matrix_from_rows(
            combined_rows,
            precision,
            space.base_ring(),
        )
        if (
            old_matrix.rank() + new_matrix.rank() != space.dimension()
            or combined.rank() != space.dimension()
        ):
            raise ArithmeticError(
                "the full-Hecke decomposition did not certify the imprimitive "
                "character old/new direct sum"
            ) from None
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


def normalized_newform_from_data(
    parent: Any,
    constituent: Any,
    name: Any,
) -> NormalizedNewform:
    """Trusted deterministic constructor used by SagePack deserialization."""
    if not isinstance(name, str) or len(name) == 0:
        raise TypeError("newform generator name must be a nonempty string")
    return NormalizedNewform(parent, constituent, name)


__all__ = [
    "ModularFormLSeriesInput",
    "NewOldDecompositionCertificate",
    "NewformCertificate",
    "NormalizedNewform",
    "OldModularFormsSubspace",
    "modular_forms_new_subspace",
    "modular_forms_newforms",
    "modular_forms_old_subspace",
    "normalized_newform_from_data",
]
