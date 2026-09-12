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
from sagejs.modular_abelian_varieties.lattices import (
    IntegralHomologyLattice,
    _exact_integer,
    _global,
    _identity_matrix,
    _integral_matrix,
    _is_integrally_surjective,
    _positive_integer,
    _rational_row_lattice_basis,
    _saturated_integer_intersection,
    _stack,
    _zero_matrix,
)
from sagejs.modular_abelian_varieties.lattices import (
    _clear_denominators as _clear_denominators,
)
from sagejs.modular_abelian_varieties.morphisms import (
    ModularAbelianVarietyMap,
    _create_map,
)


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


def _polynomial_at_matrix(polynomial: Any, operator: Any) -> Any:
    r"""Evaluate exactly with $O(\sqrt{\deg f})$ dense matrix products.

    Write $f(x)=\sum_i b_i(x)(x^s)^i$ with $\deg b_i<s$. Build the small
    powers once, form the blocks by scalar arithmetic, and apply Horner only
    to the blocks. All matrix operations retain their ordinary public exact
    implementation and portable fallback.
    """
    degree = polynomial.degree()
    if degree <= 4:
        return polynomial(operator)
    step = 1
    while step * step < degree + 1:
        step += 1
    size = operator.nrows()
    powers = [_identity_matrix(sage.QQ, size), operator]
    for _index in range(2, step + 1):
        powers.append(powers[-1] * operator)
    result = None
    for block_index in range(degree // step, -1, -1):
        block = _zero_matrix(sage.QQ, size, size)
        for index in range(step):
            coefficient = polynomial[block_index * step + index]
            if coefficient != 0:
                block += coefficient * powers[index]
        result = block if result is None else result * powers[step] + block
    return result


def _split_good_hecke_operator(component: Any, operator: Any) -> list[Any]:
    """Split a semisimple good Hecke operator, reusing complementary images."""
    factors = sorted(operator.charpoly().factor(), key=lambda pair: pair[0].degree())
    answer = []
    for polynomial, multiplicity in factors[:-1]:
        evaluated = _polynomial_at_matrix(polynomial, operator)
        kernel = evaluated.left_kernel_matrix()
        if kernel.nrows() != polynomial.degree() * multiplicity:
            raise ArithmeticError("good Hecke operator has an unexpected primary rank")
        answer.append(
            (
                polynomial,
                multiplicity,
                component._subspace_from_local_basis(kernel, "Hecke"),
            )
        )
        # Coprimality makes f(T) invertible on all remaining primary spaces.
        # Continue on that row image, so subsequent polynomials act on smaller
        # matrices. The final (largest-degree) polynomial is never evaluated.
        image = evaluated.row_space().basis_matrix()
        if image.nrows() + kernel.nrows() != component.dimension():
            raise ArithmeticError("complementary Hecke image has the wrong rank")
        operator = image._sparse_left_multiply(
            operator.matrix_from_columns(list(image.pivots()))
        )
        component = component._subspace_from_local_basis(image, "Hecke")
    # Semisimplicity identifies the last primary component without forming
    # its identically zero annihilator matrix.
    polynomial, multiplicity = factors[-1]
    answer.append((polynomial, multiplicity, component))
    return answer


def _homology_decomposition(space: Any, bound: Any = None) -> list[Any]:
    r"""Split weight-$2$ homology using its two sign copies of each newform.

    On a simple abelian factor the good Hecke characteristic polynomial is
    $f^2$, not $f$: each of the two star eigenspaces has one copy of the
    coefficient field. An irreducible $f$ and exact sign dimensions
    $\dim V^+=\dim V^-=\deg f$ therefore certify a finished factor. Merely
    seeing a square is not enough: oldform multiplicities and coincident
    eigenvalues must remain active and be separated by further operators.

    Keep the generic full-Hecke oldspace convention, including bad-prime
    refinement. The generic modular-symbol method cannot use this stopping
    rule for arbitrary weights, signs, characters, or noncuspidal spaces.
    """
    if space.dimension() == 0:
        return []
    limit = (
        space._default_decomposition_bound()
        if bound is None
        else _positive_integer(bound, "decomposition bound")
    )
    active = [space]
    finished = []
    for prime in space._good_hecke_primes(limit):
        remaining = []
        for component in active:
            operator = component.hecke_matrix(prime)
            for polynomial, multiplicity, constituent in _split_good_hecke_operator(
                component, operator
            ):
                degree = polynomial.degree()
                if (
                    multiplicity == 2
                    and constituent.dimension() == 2 * degree
                    # Good Hecke kernels are star-stable. In characteristic
                    # zero an involution of dimension 2d has d-dimensional
                    # signs exactly when its trace is zero. This certifies
                    # the sign dimensions without constructing two kernels.
                    and constituent.star_involution_matrix().trace() == 0
                ):
                    finished.append(constituent)
                else:
                    remaining.append(constituent)
        active = remaining
        if len(active) == 0:
            break
    # A finished factor has one simple copy in each sign. Commuting bad-prime
    # operators cannot split that abelian factor further. In particular, do
    # not construct the expensive U_N at a large prime level just to rediscover
    # a scalar. Only repeated old/anemic components still require refinement.
    for prime in space._bad_hecke_primes():
        if len(active) == 0:
            break
        active = space._refine_decomposition_with_operator(active, prime)
    answer = finished + active
    if sum(component.dimension() for component in answer) != space.dimension():
        raise ArithmeticError("homology decomposition has the wrong dimension")
    return sorted(answer, key=lambda component: component.dimension())


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
        if not _is_integrally_surjective(quotient_matrix):
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
            self._inclusion_cache = _create_map(
                self,
                ambient,
                matrix,
                ("inclusion",),
            )
        return self._inclusion_cache

    def quotient_map(self) -> ModularAbelianVarietyMap:
        if not self.is_quotient():
            raise ValueError("quotient_map() is only defined for a newform quotient")
        if self._quotient_cache is None:
            _embedded_basis, matrix = self._quotient_data()
            self._quotient_cache = _create_map(
                self.ambient_variety(),
                self,
                matrix,
                ("quotient",),
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

    def identity_morphism(self) -> Any:
        return _create_map(
            self, self, _identity_matrix(sage.ZZ, 2 * self.dimension()), ("identity",)
        )

    def zero_morphism(self, codomain: Any = None) -> Any:
        if codomain is None:
            codomain = self
        return _create_map(
            self,
            codomain,
            _zero_matrix(sage.ZZ, 2 * self.dimension(), 2 * codomain.dimension()),
            ("zero",),
        )

    def multiplication_by(self, scalar: Any) -> Any:
        return self.identity_morphism() * scalar

    def hecke_morphism(self, index: Any) -> Any:
        index = _positive_integer(index, "Hecke index")
        return _create_map(self, self, self.hecke_matrix(index), ("hecke", index))

    def hom(self, matrix: Any, codomain: Any = None, generators: Any = None) -> Any:
        if codomain is None:
            codomain = self
        return ModularAbelianVarietyMap(self, codomain, matrix, generators=generators)

    def _replay_morphism(self, codomain: Any, recipe: Any) -> Any:
        from sagejs.modular_abelian_varieties.morphisms import replay_map

        return replay_map(self, codomain, recipe)

    def __mul__(self, other: Any) -> Any:
        from sagejs.modular_abelian_varieties.products import ProductAbelianVariety

        return ProductAbelianVariety([self, other])

    def __pow__(self, exponent: Any) -> Any:
        from sagejs.modular_abelian_varieties.products import ProductAbelianVariety

        exponent = _exact_integer(exponent, "product exponent")
        if exponent < 0:
            raise ValueError("product exponent must be nonnegative")
        return ProductAbelianVariety([self for _ in range(exponent)])

    def degeneracy_map(self, level: Any, index: Any = 1) -> Any:
        from sagejs.modular_abelian_varieties.degeneracy import degeneracy_map

        return degeneracy_map(self, level, index)

    def oldform_decomposition(self) -> Any:
        from sagejs.modular_abelian_varieties.degeneracy import oldform_decomposition

        return oldform_decomposition(self)

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
        factors = _homology_decomposition(self.modular_symbols(), bound)
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
    factors = [factor.modular_symbols() for factor in J0(level).decomposition()]
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
    r"""Construct a weight-$2$ $\Gamma_0(N)$ modular abelian variety.

    A level constructs its Jacobian. A normalized weight-$2$ newform instead
    constructs its connected quotient of the Jacobian.

    ```sage
    sage: AbelianVariety(11).dimension()
    1
    ```
    """
    if isinstance(defining_data, (list, tuple)):
        from sagejs.modular_abelian_varieties.products import ProductAbelianVariety

        return ProductAbelianVariety([AbelianVariety(item) for item in defining_data])
    if isinstance(defining_data, ModularAbelianVariety):
        return defining_data
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
