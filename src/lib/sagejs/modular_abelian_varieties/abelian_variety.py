r"""Integral homology models for weight-$2$ modular abelian varieties.

The authoritative representation is a saturated lattice in the sign-zero
cuspidal modular-symbol module.  Newform objects additionally construct the
connected integral quotient, retaining its exact quotient map and the
corresponding embedded subvariety.
"""

from __future__ import annotations

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
    return 1 if method is None else runtime.number(method())


def _matrix_from_entries(
    base_ring: Any,
    rows: int,
    columns: int,
    entries: list[Any],
) -> Any:
    return _global("matrix")(base_ring, rows, columns, entries)


def _zero_matrix(base_ring: Any, rows: int, columns: int) -> Any:
    return _global("matrix")(base_ring, rows, columns)


def _identity_matrix(base_ring: Any, dimension: int) -> Any:
    return _global("identity_matrix")(base_ring, dimension)


def _clear_denominators(source: Any) -> tuple[Any, int]:
    """Return an integer scalar multiple with the same rational row space."""
    denominator = 1
    for value in source.list():
        denominator = _lcm(denominator, _denominator(value))
    entries = [sage.ZZ(denominator * value) for value in source.list()]
    return (
        _matrix_from_entries(
            sage.ZZ,
            source.nrows(),
            source.ncols(),
            entries,
        ),
        denominator,
    )


def _integral_matrix(source: Any, label: str) -> Any:
    r"""Coerce a rational matrix to $\mathbf Z$, rejecting denominators."""
    entries = []
    for value in source.list():
        if _denominator(value) != 1:
            raise ArithmeticError(label + " is not integral")
        entries.append(sage.ZZ(value))
    return _matrix_from_entries(
        sage.ZZ,
        source.nrows(),
        source.ncols(),
        entries,
    )


def _saturated_integer_intersection(rational_basis: Any) -> Any:
    r"""Return $\operatorname{rowspan}(B)\cap\mathbf Z^m$ exactly."""
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


def _validate_modular_symbols(space: Any) -> None:
    if getattr(space, "_kind", None) != "ModularSymbols":
        raise TypeError("expected a modular-symbol space")
    if space.weight() != 2:
        raise TypeError("modular abelian varieties currently require weight 2")
    if space.sign() != 0:
        raise TypeError("the defining modular-symbol space must have sign 0")
    if space.base_ring() is not sage.QQ:
        raise TypeError("modular abelian varieties currently require Rational Field")
    if not space.is_cuspidal():
        raise ValueError("the defining modular-symbol space must be cuspidal")
    group = getattr(space, "_group", None)
    if getattr(group, "_family", None) != "Gamma0":
        raise NotImplementedError("only Gamma0 modular abelian varieties are supported")
    if getattr(space, "_character", None) is not None:
        raise NotImplementedError(
            "nontrivial-character abelian varieties are not yet supported"
        )
    if space.dimension() % 2 != 0:
        raise ArithmeticError("sign-zero cuspidal dimension must be even")
    basis = space.basis_matrix()
    ambient = space.ambient_module()
    for index in [2, 3]:
        restricted = space.hecke_matrix(index)
        if restricted * basis != basis * ambient.hecke_matrix(index):
            raise ArithmeticError(
                "the defining modular-symbol space is not Hecke stable"
            )


class IntegralHomologyLattice(sage.Parent):
    """A free integral lattice embedded in an exact rational vector space."""

    def __init__(
        self,
        basis_matrix: Any,
        model: str,
        saturated: bool,
    ) -> None:
        self._kind = "IntegralHomologyLattice"
        self._basis = basis_matrix.change_ring(sage.QQ)
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
            _integral_matrix(coordinates.row(), "lattice coordinates").list(),
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


class AbelianVarietyHomology(sage.Parent):
    """Integral or rational homology of a modular abelian variety."""

    def __init__(self, abelian_variety: ModularAbelianVariety, base_ring: Any) -> None:
        if base_ring is not sage.ZZ and base_ring is not sage.QQ:
            raise NotImplementedError("homology currently supports only ZZ and QQ")
        self._kind = "AbelianVarietyHomology"
        self._abelian_variety = abelian_variety
        self._base_ring = base_ring

    def abelian_variety(self) -> ModularAbelianVariety:
        return self._abelian_variety

    def base_ring(self) -> Any:
        return self._base_ring

    def rank(self) -> int:
        return 2 * self._abelian_variety.dimension()

    dimension = rank

    def basis_matrix(self) -> Any:
        # An integral lattice may have a rational embedding in ambient Manin
        # coordinates. `base_ring()` describes its abstract coefficients;
        # coercing this display matrix to ZZ would destroy quotient lattices.
        return self._abelian_variety.lattice().basis_matrix()

    def hecke_matrix(self, index: Any) -> Any:
        result = self._abelian_variety.hecke_matrix(index)
        return result.change_ring(self._base_ring)

    def T(self, index: Any) -> AbelianVarietyHeckeOperator:
        return AbelianVarietyHeckeOperator(
            self, _positive_integer(index, "Hecke index")
        )

    hecke_operator = T

    def __repr__(self) -> str:
        adjective = "Integral" if self._base_ring is sage.ZZ else "Rational"
        return adjective + " Homology of " + str(self._abelian_variety)

    __str__ = __repr__
    toString = __repr__


class AbelianVarietyHeckeOperator:
    """An exact Hecke operator on an abelian variety or its homology."""

    def __init__(self, parent: Any, index: int) -> None:
        self._kind = "AbelianVarietyHeckeOperator"
        self._parent = parent
        self._index = index

    def parent(self) -> Any:
        return self._parent

    def index(self) -> int:
        return self._index

    def matrix(self) -> Any:
        return self._parent.hecke_matrix(self._index)

    def charpoly(self, variable: str = "x") -> Any:
        return self.matrix().charpoly(variable)

    characteristic_polynomial = charpoly

    def __call__(self, value: Any) -> Any:
        vector = _global("vector")(self.matrix().base_ring(), list(value))
        return vector * self.matrix()

    def __repr__(self) -> str:
        return "Hecke operator T_" + str(self._index) + " on " + str(self._parent)

    __str__ = __repr__
    toString = __repr__


class ModularAbelianVarietyMap:
    """An exact map represented on integral homology using row action."""

    def __init__(
        self,
        domain: ModularAbelianVariety,
        codomain: ModularAbelianVariety,
        defining_matrix: Any,
        name: str,
    ) -> None:
        self._kind = "ModularAbelianVarietyMap"
        self._domain = domain
        self._codomain = codomain
        self._matrix = _integral_matrix(defining_matrix, "homology map")
        self._name = str(name)
        if self._matrix.nrows() != 2 * domain.dimension():
            raise ValueError("map matrix has the wrong domain rank")
        if self._matrix.ncols() != 2 * codomain.dimension():
            raise ValueError("map matrix has the wrong codomain rank")

    def domain(self) -> ModularAbelianVariety:
        return self._domain

    def codomain(self) -> ModularAbelianVariety:
        return self._codomain

    def matrix(self) -> Any:
        return self._matrix

    def kernel_lattice(self) -> IntegralHomologyLattice:
        basis = self._matrix.transpose().right_kernel_matrix()
        return IntegralHomologyLattice(basis, "map kernel", True)

    def image_lattice(self) -> IntegralHomologyLattice:
        basis = _integer_row_lattice_basis(self._matrix)
        return IntegralHomologyLattice(basis, "map image", False)

    def is_injective(self) -> bool:
        return self._matrix.rank() == self._matrix.nrows()

    def is_surjective(self) -> bool:
        if self._matrix.rank() != self._matrix.ncols():
            return False
        smith = self._matrix.smith_form()[0]
        return all(abs(runtime.number(value)) == 1 for value in smith.diagonal())

    def verify(self, hecke_bound: Any = 3) -> bool:
        bound = _positive_integer(hecke_bound, "Hecke verification bound")
        for index in range(2, bound + 1):
            if self._domain.hecke_matrix(
                index
            ) * self._matrix != self._matrix * self._codomain.hecke_matrix(index):
                return False
        return True

    def __call__(self, value: Any) -> Any:
        vector = _global("vector")(sage.ZZ, list(value))
        if len(vector) != self._matrix.nrows():
            raise ValueError("map input has the wrong rank")
        return vector * self._matrix

    def __repr__(self) -> str:
        return self._name + " from " + str(self._domain) + " to " + str(self._codomain)

    __str__ = __repr__
    toString = __repr__


class AbelianVarietySerializationCertificate:
    """Replayable exact construction certificate for SagePack persistence."""

    def __init__(self, variety: ModularAbelianVariety) -> None:
        self._variety = variety
        self._kind = "AbelianVarietySerializationCertificate"

    def variety(self) -> ModularAbelianVariety:
        return self._variety

    def construction(self) -> str:
        return self._variety.construction()

    def level(self) -> int:
        return self._variety.level()

    def homology_rank(self) -> int:
        return 2 * self._variety.dimension()

    def hecke_signatures(self) -> tuple[Any, ...]:
        return runtime.math_tuple(
            [self._variety.hecke_matrix(index).charpoly("x") for index in [2, 3]]
        )

    def verify(self) -> bool:
        return self._variety._verify_construction()

    def __repr__(self) -> str:
        return "Verified SagePack construction certificate for " + str(self._variety)

    __str__ = __repr__
    toString = __repr__


class ModularAbelianVariety(sage.Parent):
    r"""A weight-$2$ $\Gamma_0(N)$ modular abelian variety over $\mathbf Q$."""

    def __init__(
        self,
        level: int,
        construction: str,
        modular_symbols: Any = None,
        newform: Any = None,
        target_factor: Any = None,
        complement: Any = None,
    ) -> None:
        self._kind = "ModularAbelianVariety"
        self._level = level
        self._construction = construction
        self._modular_symbols_cache = modular_symbols
        self._newform = newform
        self._target_factor = target_factor
        self._complement = complement
        self._lattice_cache = None
        self._homology_cache = runtime.map()
        self._hecke_cache = runtime.map()
        self._decomposition_cache = None
        self._inclusion_cache = None
        self._quotient_cache = None
        self._embedded_cache = None
        self._quotient_data_cache = None
        if construction == "J0":
            self._dimension = runtime.number(_global("dimension_cusp_forms")(level, 2))
        else:
            if modular_symbols is None:
                raise ValueError("a nonambient variety needs modular symbols")
            _validate_modular_symbols(modular_symbols)
            self._dimension = modular_symbols.dimension() // 2

    def construction(self) -> str:
        return self._construction

    def is_ambient(self) -> bool:
        return self._construction == "J0"

    def is_quotient(self) -> bool:
        return self._construction == "newform quotient"

    def dimension(self) -> int:
        return self._dimension

    relative_dimension = dimension

    def level(self) -> int:
        return self._level

    def base_field(self) -> Any:
        return sage.QQ

    base_ring = base_field

    def group(self) -> Any:
        return _global("Gamma0")(self._level)

    def ambient_variety(self) -> ModularAbelianVariety:
        return self if self.is_ambient() else J0(self._level)

    def modular_symbols(self, sign: Any = 0) -> Any:
        selected_sign = _exact_integer(sign, "sign")
        if selected_sign not in [-1, 0, 1]:
            raise ValueError("sign must be -1, 0, or 1")
        if self._modular_symbols_cache is None:
            self._modular_symbols_cache = _global("ModularSymbols")(
                self._level, 2, 0, sage.QQ
            ).cuspidal_submodule()
        sign_zero = self._modular_symbols_cache
        if selected_sign == 0:
            return sign_zero
        if selected_sign == 1:
            return sign_zero.plus_submodule()
        return sign_zero.minus_submodule()

    def _embedded_lattice(self) -> IntegralHomologyLattice:
        basis = _saturated_integer_intersection(self.modular_symbols().basis_matrix())
        return IntegralHomologyLattice(
            basis,
            "saturated cuspidal modular-symbol intersection",
            True,
        )

    def _quotient_data(self) -> tuple[Any, Any]:
        if not self.is_quotient():
            raise ValueError("quotient data is only defined for a newform quotient")
        if self._quotient_data_cache is not None:
            return self._quotient_data_cache
        ambient = self.ambient_variety()
        ambient_basis = ambient.lattice().basis_matrix()
        target_basis = _saturated_integer_intersection(
            self.modular_symbols().basis_matrix()
        )
        columns = ambient_basis.ncols()
        complement_basis = _saturated_integer_intersection(
            self._complement.basis_matrix()
        )
        combined = _stack([target_basis, complement_basis], columns)
        if (
            combined.nrows() != ambient_basis.nrows()
            or combined.rank() != combined.nrows()
        ):
            raise ArithmeticError(
                "newform constituent and complement are not a direct sum"
            )
        ambient_coordinates = combined.solve_left(ambient_basis)
        projected = ambient_coordinates.matrix_from_columns(range(target_basis.nrows()))
        image_basis = _rational_row_lattice_basis(projected)
        quotient_matrix = _integral_matrix(
            image_basis.solve_left(projected),
            "connected quotient map",
        )
        embedded_basis = image_basis * target_basis
        if projected * target_basis != quotient_matrix * embedded_basis:
            raise ArithmeticError("connected quotient lattice reconstruction failed")
        if quotient_matrix.rank() != target_basis.nrows():
            raise ArithmeticError("connected quotient map is not rationally surjective")
        smith = quotient_matrix.smith_form()[0]
        if any(abs(runtime.number(value)) != 1 for value in smith.diagonal()):
            raise ArithmeticError("connected quotient map is not integrally surjective")
        self._quotient_data_cache = runtime.math_tuple(
            [embedded_basis, quotient_matrix]
        )
        return self._quotient_data_cache

    def lattice(self) -> IntegralHomologyLattice:
        if self._lattice_cache is None:
            if self.is_quotient():
                embedded_basis, _quotient_matrix = self._quotient_data()
                self._lattice_cache = IntegralHomologyLattice(
                    embedded_basis,
                    "connected newform quotient",
                    True,
                )
            else:
                self._lattice_cache = self._embedded_lattice()
        return self._lattice_cache

    free_module = lattice

    def homology(self, base_ring: Any = None) -> AbelianVarietyHomology:
        if base_ring is None:
            base_ring = sage.ZZ
        cached = self._homology_cache.get(base_ring)
        if cached is not runtime.undefined:
            return cached
        answer = AbelianVarietyHomology(self, base_ring)
        self._homology_cache.set(base_ring, answer)
        return answer

    def integral_homology(self) -> AbelianVarietyHomology:
        return self.homology(sage.ZZ)

    def rational_homology(self) -> AbelianVarietyHomology:
        return self.homology(sage.QQ)

    def _restricted_hecke_matrix(self, index: int) -> Any:
        lattice_basis = self.lattice().basis_matrix()
        ambient_symbols = self.modular_symbols().ambient_module()
        ambient_operator = ambient_symbols.hecke_matrix(index)
        images = lattice_basis * ambient_operator
        coordinates = lattice_basis.solve_left(images)
        if coordinates * lattice_basis != images:
            raise ArithmeticError("the homology lattice is not Hecke stable")
        return _integral_matrix(coordinates, "integral homology Hecke matrix")

    def hecke_matrix(self, index: Any) -> Any:
        selected_index = _positive_integer(index, "Hecke index")
        cached = self._hecke_cache.get(selected_index)
        if cached is not runtime.undefined:
            return cached
        answer = self._restricted_hecke_matrix(selected_index)
        if self.is_quotient():
            quotient = self.quotient_map().matrix()
            ambient_hecke = self.ambient_variety().hecke_matrix(selected_index)
            if ambient_hecke * quotient != quotient * answer:
                raise ArithmeticError(
                    "Hecke action does not descend through the quotient"
                )
        self._hecke_cache.set(selected_index, answer)
        return answer

    def T(self, index: Any) -> AbelianVarietyHeckeOperator:
        return AbelianVarietyHeckeOperator(
            self, _positive_integer(index, "Hecke index")
        )

    hecke_operator = T

    def hecke_polynomial(self, index: Any, variable: str = "x") -> Any:
        homology_polynomial = self.hecke_matrix(index).charpoly(variable)
        result = homology_polynomial.parent()(1)
        for factor, multiplicity in homology_polynomial.factor():
            exponent = runtime.number(multiplicity)
            if exponent % 2 != 0:
                raise ArithmeticError(
                    "the homology Hecke polynomial is not a perfect square"
                )
            result *= factor ** (exponent // 2)
        if result**2 != homology_polynomial:
            raise ArithmeticError("could not recover the abelian Hecke polynomial")
        return result

    def inclusion_map(self) -> ModularAbelianVarietyMap:
        if self.is_quotient():
            raise ValueError(
                "a quotient has no canonical integral inclusion; use "
                "embedded_subvariety().inclusion_map()"
            )
        if self._inclusion_cache is None:
            ambient = self.ambient_variety()
            if self.is_ambient():
                matrix = _identity_matrix(sage.ZZ, 2 * self.dimension())
            else:
                matrix = _integral_matrix(
                    ambient.lattice()
                    .basis_matrix()
                    .solve_left(self.lattice().basis_matrix()),
                    "subvariety inclusion",
                )
            self._inclusion_cache = ModularAbelianVarietyMap(
                self,
                ambient,
                matrix,
                "Integral homology inclusion",
            )
        return self._inclusion_cache

    def quotient_map(self) -> ModularAbelianVarietyMap:
        if not self.is_quotient():
            raise ValueError("quotient_map() is only defined for a newform quotient")
        if self._quotient_cache is None:
            _embedded_basis, matrix = self._quotient_data()
            self._quotient_cache = ModularAbelianVarietyMap(
                self.ambient_variety(),
                self,
                matrix,
                "Connected newform quotient",
            )
        return self._quotient_cache

    def embedded_subvariety(self) -> ModularAbelianVariety:
        if not self.is_quotient():
            return self
        if self._embedded_cache is None:
            self._embedded_cache = ModularAbelianVariety(
                self._level,
                "modular-symbol subvariety",
                self.modular_symbols(),
                self._newform,
            )
        return self._embedded_cache

    def newform(self) -> Any:
        if self._newform is None:
            raise ValueError("this abelian variety is not attached to one newform")
        return self._newform

    def decomposition(
        self,
        simple: bool = True,
        bound: Any = None,
    ) -> list[ModularAbelianVariety]:
        if not simple:
            raise NotImplementedError(
                "only rational Hecke-simple decomposition is supported"
            )
        if self.is_quotient():
            return [self]
        if bound is None and self._decomposition_cache is not None:
            return self._decomposition_cache
        factors = self.modular_symbols().decomposition(
            bound=bound,
            anemic=False,
        )
        answer = [
            ModularAbelianVariety(
                self._level,
                "modular-symbol subvariety",
                factor,
            )
            for factor in factors
        ]
        if sum(factor.dimension() for factor in answer) != self.dimension():
            raise ArithmeticError(
                "abelian-variety decomposition has the wrong dimension"
            )
        if bound is None:
            self._decomposition_cache = answer
        return answer

    def serialization_certificate(self) -> AbelianVarietySerializationCertificate:
        return AbelianVarietySerializationCertificate(self)

    def _verify_construction(self) -> bool:
        try:
            if self.lattice().rank() != 2 * self.dimension():
                return False
            for index in [2, 3]:
                matrix = self.hecke_matrix(index)
                if matrix.nrows() != 2 * self.dimension():
                    return False
                if matrix.base_ring() is not sage.ZZ:
                    return False
            if self.is_quotient():
                quotient = self.quotient_map()
                if not quotient.is_surjective() or not quotient.verify():
                    return False
            elif not self.inclusion_map().verify():
                return False
            return True
        except (ArithmeticError, TypeError, ValueError):
            return False

    def __getitem__(self, index: Any) -> ModularAbelianVariety:
        return self.decomposition()[_exact_integer(index, "factor index")]

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ModularAbelianVariety):
            return False
        if (
            self._level != other._level
            or self._construction != other._construction
            or self.dimension() != other.dimension()
        ):
            return False
        if self.is_ambient():
            return True
        return (
            self.modular_symbols().basis_matrix().row_space()
            == other.modular_symbols().basis_matrix().row_space()
        )

    def __repr__(self) -> str:
        if self.is_ambient():
            return (
                "Abelian variety J0("
                + str(self._level)
                + ") of dimension "
                + str(self._dimension)
            )
        if self.is_quotient():
            return (
                "Newform quotient of dimension "
                + str(self._dimension)
                + " of J0("
                + str(self._level)
                + ")"
            )
        return (
            "Modular abelian subvariety of dimension "
            + str(self._dimension)
            + " of J0("
            + str(self._level)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


_j0_cache: dict[int, ModularAbelianVariety] = {}


def J0(level: Any) -> ModularAbelianVariety:
    r"""Return the Jacobian $J_0(N)$ of $X_0(N)$."""
    selected_level = _positive_integer(level, "level")
    cached = _j0_cache.get(selected_level)
    if cached is not None:
        return cached
    answer = ModularAbelianVariety(selected_level, "J0")
    _j0_cache[selected_level] = answer
    return answer


def _validated_newform(value: Any) -> Any:
    if getattr(value, "_kind", None) != "NormalizedNewform":
        raise TypeError("expected a normalized newform")
    if value.weight() != 2:
        raise TypeError("the newform must have weight 2")
    parent = value.parent().ambient_space()
    if getattr(parent, "_character", None) is not None:
        raise NotImplementedError(
            "newforms with nontrivial character are not yet supported"
        )
    level = runtime.number(value.level())
    canonical = _global("CuspForms")(level, 2).newforms("a")
    source_space = value.hecke_constituent().basis_matrix().row_space()
    matches = [
        form
        for form in canonical
        if form.hecke_constituent().dimension() == value.hecke_constituent().dimension()
        and form.hecke_constituent().basis_matrix().row_space() == source_space
    ]
    if len(matches) != 1:
        raise ArithmeticError(
            "the supplied newform is not a unique canonical newform constituent"
        )
    return value


def _matching_sign_zero_factor(newform: Any) -> tuple[Any, Any]:
    level = runtime.number(newform.level())
    cusp = J0(level).modular_symbols()
    factors = cusp.decomposition(anemic=False)
    target = newform.hecke_constituent()
    candidates = [
        factor for factor in factors if factor.dimension() == 2 * target.dimension()
    ]
    verification_bound = max(7, min(32, cusp.sturm_bound() + 1))
    for index in range(2, verification_bound + 1):
        expected = target.hecke_matrix(index).charpoly("x") ** 2
        candidates = [
            factor
            for factor in candidates
            if factor.hecke_matrix(index).charpoly("x") == expected
        ]
        if len(candidates) == 1 and index >= 3:
            break
    if len(candidates) != 1:
        raise ArithmeticError(
            "could not identify a unique sign-zero constituent for the newform"
        )
    selected = candidates[0]
    complement_factors = [factor for factor in factors if factor is not selected]
    complement_basis = _stack(
        [factor.basis_matrix() for factor in complement_factors],
        cusp.ambient_module().dimension(),
    )
    complement = cusp._new_coordinate_subspace(
        complement_basis,
        "Newform quotient kernel",
        0,
        True,
    )
    if selected.dimension() + complement.dimension() != cusp.dimension():
        raise ArithmeticError(
            "newform factor and quotient kernel have wrong dimensions"
        )
    return selected, complement


def AbelianVariety(defining_data: Any) -> ModularAbelianVariety:
    r"""Construct a weight-$2$ $\Gamma_0(N)$ modular abelian variety."""
    if runtime.is_exact_integer(defining_data):
        return J0(defining_data)
    if getattr(defining_data, "_kind", None) == "CongruenceSubgroup":
        if getattr(defining_data, "_family", None) != "Gamma0":
            raise NotImplementedError("only Gamma0 Jacobians are supported")
        return J0(defining_data.level())
    if getattr(defining_data, "_kind", None) == "ModularSymbols":
        _validate_modular_symbols(defining_data)
        if (
            defining_data.basis_matrix().row_space()
            == J0(defining_data.level()).modular_symbols().basis_matrix().row_space()
        ):
            return J0(defining_data.level())
        return ModularAbelianVariety(
            runtime.number(defining_data.level()),
            "modular-symbol subvariety",
            defining_data,
        )
    if getattr(defining_data, "_kind", None) == "NormalizedNewform":
        newform = _validated_newform(defining_data)
        target, complement = _matching_sign_zero_factor(newform)
        return ModularAbelianVariety(
            runtime.number(newform.level()),
            "newform quotient",
            target,
            newform,
            target,
            complement,
        )
    raise TypeError(
        "AbelianVariety() needs a level, Gamma0 group, cuspidal sign-zero "
        "modular-symbol space, or weight-2 normalized newform"
    )


__all__ = [
    "AbelianVariety",
    "AbelianVarietyHeckeOperator",
    "AbelianVarietyHomology",
    "AbelianVarietySerializationCertificate",
    "IntegralHomologyLattice",
    "J0",
    "ModularAbelianVariety",
    "ModularAbelianVarietyMap",
]
