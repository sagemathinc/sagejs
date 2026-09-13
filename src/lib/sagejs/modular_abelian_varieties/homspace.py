"""Complete rationally defined Hom lattices, with geometric construction proofs.

Use the newform isogeny decomposition over QQ, not an arbitrary commutant of
homology matrices. On a simple newform factor End_Q tensor QQ is its Hecke
field; repeated copies contribute full matrix blocks over that field.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
from sagejs.modular_abelian_varieties.abelian_variety import (
    J0,
    ModularAbelianVariety,
    _split_good_hecke_operator,
)
from sagejs.modular_abelian_varieties.lattices import (
    IntegralHomologyLattice,
    _clear_denominators,
    _global,
    _identity_matrix,
    _integral_matrix,
    _saturated_integer_intersection,
    _zero_matrix,
)
from sagejs.modular_abelian_varieties.morphisms import (
    ModularAbelianVarietyMap,
    _create_map,
    _product_map,
    _sealed,
)
from sagejs.modular_abelian_varieties.products import (
    HomologySubvariety,
    ProductAbelianVariety,
    block_diagonal,
)


def complementary_isogeny(morphism: Any) -> Any:
    """Return the least positive integral scalar multiple of the inverse."""
    if not morphism.is_isogeny():
        raise ValueError("a complementary isogeny requires an isogeny")
    inverse = morphism.matrix().change_ring(sage.QQ).inverse()
    matrix, scalar = _clear_denominators(inverse)
    if matrix * morphism.matrix() != _identity_matrix(sage.ZZ, matrix.nrows()) * scalar:
        raise ArithmeticError("complementary isogeny identity failed")
    if morphism.matrix() * matrix != _identity_matrix(sage.ZZ, matrix.ncols()) * scalar:
        raise ArithmeticError("complementary isogeny identity failed")
    return _create_map(
        morphism.codomain(), morphism.domain(), matrix, ("complement", morphism)
    )


_factor_fields: dict[Any, Any] = {}
_ambient_data: dict[int, Any] = {}
_ambient_homs: dict[tuple[int, int], Any] = {}
_hom_parents: dict[tuple[int, int], Any] = {}
_refined_factors: dict[Any, Any] = {}


def _primitive_algebra_generator(operators: Any, size: int, expected: int) -> Any:
    """Primitive element of an exact commutative semisimple matrix algebra.

    Given generators A,B of a separable algebra of dimension d, at most
    d(d-1)/2 rational scalars c fail to separate its embeddings in A+cB.
    Algebra closure computes d first, making this a terminating exact search,
    not a heuristic list of random linear combinations.
    """
    identity = _identity_matrix(sage.QQ, size)
    basis = [identity]
    primitive = identity
    for operator in operators:
        if operator * primitive != primitive * operator:
            raise ArithmeticError("Hecke algebra generators do not commute")
        flat = _flatten(basis, size * size)
        cursor = 0
        while cursor < len(basis):
            product = basis[cursor] * operator
            augmented = flat.stack(_flatten([product], size * size))
            if augmented.rank() > len(basis):
                basis.append(product)
                flat = augmented
                if len(basis) > expected:
                    raise ArithmeticError("newform Hecke algebra has excessive rank")
            cursor += 1
        degree = len(basis)
        for scalar in range(degree * (degree - 1) // 2 + 1):
            candidate = primitive + scalar * operator
            polynomial = candidate.charpoly()
            distinct = polynomial // polynomial.gcd(polynomial.derivative())
            if distinct.degree() == degree:
                primitive = candidate
                break
        else:
            raise ArithmeticError("primitive-element separation bound failed")
        if degree == expected:
            return primitive
    raise ArithmeticError("Hecke operators did not generate the full newspace algebra")


def _simple_sources(source: Any, label: int) -> Any:
    """Refine rare jointly simple/coincident Hecke packets exactly."""
    key = (source.level(), label)
    if key in _refined_factors:
        old_source, result = _refined_factors[key]
        if (
            old_source.modular_symbols().basis_matrix()
            != source.modular_symbols().basis_matrix()
        ):
            raise ArithmeticError("newform constituent labels changed subspace")
        return result
    try:
        result = [(source, _field_basis(source))]
    except NotImplementedError:
        symbols = source.modular_symbols()
        primes = symbols._good_hecke_primes(symbols._default_decomposition_bound())
        primitive = _primitive_algebra_generator(
            (symbols.hecke_matrix(p) for p in primes),
            symbols.dimension(),
            source.dimension(),
        )
        result = []
        for polynomial, multiplicity, component in _split_good_hecke_operator(
            symbols, primitive
        ):
            if multiplicity != 2 or component.star_involution_matrix().trace() != 0:
                raise ArithmeticError(
                    "joint newform packet has incorrect sign multiplicity"
                ) from None
            factor = ModularAbelianVariety(
                source.level(), "modular-symbol subvariety", component
            )
            # Restrict the certified primitive element and transport it from
            # rational modular-symbol coordinates to integral factor homology.
            local = symbols.basis_matrix().solve_left(component.basis_matrix())
            restricted = local.solve_left(local * primitive)
            bridge = component.basis_matrix().solve_left(
                factor.lattice().basis_matrix()
            )
            operator = bridge * restricted * bridge.inverse()
            field = [_identity_matrix(sage.QQ, 2 * factor.dimension())]
            for _ in range(1, polynomial.degree()):
                field.append(field[-1] * operator)
            result.append((factor, field))
    _refined_factors[key] = (source, result)
    return result


def _field_basis(factor: Any) -> Any:
    """Certify a primitive Hecke field on a new, sign-balanced constituent."""
    symbols = factor.modular_symbols()
    key = id(factor)
    if key in _factor_fields:
        return _factor_fields[key][1]
    degree = factor.dimension()
    if (
        symbols.dimension() != 2 * degree
        or symbols.star_involution_matrix().trace() != 0
    ):
        raise ArithmeticError("a simple newform factor needs both homology signs")
    identity = _identity_matrix(sage.QQ, 2 * degree)
    # A single T_p usually generates the field. Accumulated operators also
    # permit primitive elements when individual T_p lie in proper subfields.
    accumulated = identity * 0
    for prime in symbols._good_hecke_primes(symbols._default_decomposition_bound()):
        operator = factor.hecke_matrix(prime).change_ring(sage.QQ)
        accumulated += operator
        for candidate in [operator, accumulated]:
            factors = list(candidate.charpoly().factor())
            if (
                len(factors) != 1
                or factors[0][1] != 2
                or factors[0][0].degree() != degree
            ):
                continue
            powers = [identity]
            for _ in range(1, degree):
                powers.append(powers[-1] * candidate)
            _factor_fields[key] = (factor, powers)
            return powers
    raise NotImplementedError(
        "could not certify a primitive newform Hecke field within the bound"
    )


def _newform_coordinates(level: int) -> Any:
    """Return a certified product-of-newform-copies isogeny to J0(level)."""
    if level in _ambient_data:
        return _ambient_data[level]
    variety = J0(level)
    copies = []
    for copy in variety.oldform_decomposition():
        for sublabel, (source, field) in enumerate(
            _simple_sources(copy.source(), copy.constituent_index())
        ):
            morphism = (
                copy.map()
                if source is copy.source()
                else source.degeneracy_map(level, copy.degeneracy_index())
            )
            copies.append(
                (
                    copy.source_level(),
                    (copy.constituent_index(), sublabel),
                    source,
                    field,
                    morphism,
                )
            )
    sources = [copy[2] for copy in copies]
    product = ProductAbelianVariety(sources)
    isogeny = _product_map(product, variety, [copy[4] for copy in copies])
    if not isogeny.is_isogeny():
        raise ArithmeticError("newform source copies do not span homology")
    labels = []
    offset = 0
    for conductor, label, source, field, _ in copies:
        labels.append((conductor, label, offset, source, field))
        offset += 2 * source.dimension()
    result = (isogeny.matrix().change_ring(sage.QQ), labels)
    _ambient_data[level] = result
    return result


def _flatten(matrices: Any, width: int) -> Any:
    return _global("matrix")(
        sage.QQ, len(matrices), width, [x for matrix in matrices for x in matrix.list()]
    )


def _ambient_hom_basis(left: int, right: int) -> Any:
    key = (left, right)
    if key in _ambient_homs:
        return _ambient_homs[key]
    A, B = J0(left), J0(right)
    rows, columns = 2 * A.dimension(), 2 * B.dimension()
    if rows == 0 or columns == 0:
        return []
    F, sources = _newform_coordinates(left)
    G, targets = _newform_coordinates(right)
    inverse = F.inverse()
    matrices = []
    expected = 0
    for conductor, label, i, source, field in sources:
        for other_conductor, other_label, j, target, _ in targets:
            if (conductor, label) != (other_conductor, other_label):
                continue
            # Labels are local to a deterministically ordered decomposition.
            # Compare the actual rational subspaces as well, not labels alone.
            if (
                source.modular_symbols().basis_matrix()
                != target.modular_symbols().basis_matrix()
            ):
                raise ArithmeticError("newform labels refer to different subspaces")
            # Source objects at the same conductor have the same saturated
            # homology basis. Retain a check rather than assuming a basis match.
            if source.lattice().basis_matrix() != target.lattice().basis_matrix():
                raise ArithmeticError("newform source homology bases disagree")
            size = 2 * source.dimension()
            left_block = inverse.matrix_from_columns(list(range(i, i + size)))
            right_block = G.matrix_from_rows(list(range(j, j + size)))
            matrices.extend(left_block * operator * right_block for operator in field)
            expected += source.dimension()
    # Powers of an irreducible degree-d operator are independent. Distinct
    # product blocks have disjoint support; invertible transport preserves
    # this rank certificate without a second wide row reduction.
    if len(matrices) != expected:
        raise ArithmeticError("newform transport lost independent Hom directions")
    _ambient_homs[key] = matrices
    return matrices


def _embedding(variety: Any) -> Any:
    """A QQ-defined homology injection into an ordered product of Jacobians."""
    if isinstance(variety, ProductAbelianVariety):
        data = [_embedding(factor) for factor in variety.factors()]
        return (
            [level for levels, _ in data for level in levels],
            block_diagonal([matrix for _, matrix in data]),
        )
    if isinstance(variety, HomologySubvariety):
        inclusion = variety.inclusion_map()
        levels, matrix = _embedding(inclusion.codomain())
        return levels, inclusion.matrix() * matrix
    if variety.is_ambient():
        return [variety.level()], _identity_matrix(sage.QQ, 2 * variety.dimension())
    if not variety.is_quotient():
        inclusion = variety.inclusion_map()
        return [variety.level()], inclusion.matrix().change_ring(sage.QQ)
    inclusion = variety.embedded_subvariety().inclusion_map()
    isogeny = variety.quotient_map() * inclusion
    complement = complementary_isogeny(isogeny)
    return [variety.level()], complement.matrix() * inclusion.matrix()


def _complete_basis(domain: Any, codomain: Any) -> Any:
    rows, columns = 2 * domain.dimension(), 2 * codomain.dimension()
    if rows == 0 or columns == 0:
        return _zero_matrix(sage.ZZ, 0, rows * columns)
    if domain.is_ambient() and codomain.is_ambient():
        return _saturated_integer_intersection(
            _flatten(
                _ambient_hom_basis(domain.level(), codomain.level()), rows * columns
            )
        )
    levels_a, injection_a = _embedding(domain)
    levels_b, injection_b = _embedding(codomain)
    # Poincare reducibility over QQ extends every rational map between these
    # subvarieties to their ambient products. Restrict the COMPLETE geometric
    # Hom space of those products, imposing image containment exactly.
    images = []
    offset_a = 0
    total_b = injection_b.ncols()
    for level_a in levels_a:
        size_a = 2 * J0(level_a).dimension()
        block_a = injection_a.matrix_from_columns(
            list(range(offset_a, offset_a + size_a))
        )
        offset_b = 0
        for level_b in levels_b:
            size_b = 2 * J0(level_b).dimension()
            for matrix in _ambient_hom_basis(level_a, level_b):
                block = block_a * matrix
                values = []
                for row in block.rows():
                    values.extend(
                        [0] * offset_b + list(row) + [0] * (total_b - offset_b - size_b)
                    )
                images.append(_global("matrix")(sage.QQ, rows, total_b, values))
            offset_b += size_b
        offset_a += size_a
    if not images:
        return _zero_matrix(sage.ZZ, 0, rows * columns)
    # Use a small pivot minor for projection and test the full residual. This
    # avoids a nearly full complementary kernel in wide ambient homology.
    pivots = list(injection_b.pivots())
    inverse_minor = injection_b.matrix_from_columns(pivots).inverse()
    restrictions = [
        image.matrix_from_columns(pivots) * inverse_minor for image in images
    ]
    if injection_b.nrows() == total_b:
        return _saturated_integer_intersection(_flatten(restrictions, rows * columns))
    residuals = [
        image - restriction * injection_b
        for image, restriction in zip(images, restrictions, strict=True)
    ]
    constraints = _flatten(residuals, rows * total_b)
    relations = constraints.transpose().right_kernel_matrix()
    rational = relations * _flatten(restrictions, rows * columns)
    return _saturated_integer_intersection(rational)


class ModularAbelianHomSpace(sage.Parent):
    """The complete lattice Hom_Q(A,B), in integral row-action homology."""

    def __init__(self, domain: Any, codomain: Any) -> None:
        if not isinstance(domain, ModularAbelianVariety) or not isinstance(
            codomain, ModularAbelianVariety
        ):
            raise TypeError("Hom requires modular abelian varieties over QQ")
        self._kind = "ModularAbelianHomSpace"
        self._domain = domain
        self._codomain = codomain
        self._basis = None
        self._generators = None
        self._integral_lattice_cache = None
        self._coordinate_plan = None

    def domain(self) -> Any:
        return self._domain

    def codomain(self) -> Any:
        return self._codomain

    def base_ring(self) -> Any:
        return sage.QQ

    def basis_matrix(self) -> Any:
        """Rows are flattened integral homology matrices, in row-major order."""
        if self._basis is None:
            self._basis = _sealed(_complete_basis(self.domain(), self.codomain()))
        return self._basis

    def rank(self) -> int:
        return self.basis_matrix().nrows()

    def is_full(self) -> bool:
        self.basis_matrix()
        return True

    def verify(self) -> bool:
        """Replay complete geometric transport and integral saturation."""
        return self.basis_matrix() == _complete_basis(self.domain(), self.codomain())

    def matrix_space(self) -> Any:
        return _global("MatrixSpace")(
            sage.ZZ, 2 * self.domain().dimension(), 2 * self.codomain().dimension()
        )

    def free_module(self) -> Any:
        if self._integral_lattice_cache is None:
            self._integral_lattice_cache = IntegralHomologyLattice(
                self.basis_matrix(), "complete integral Hom lattice", True
            )
        return self._integral_lattice_cache

    lattice = free_module

    def gens(self) -> Any:
        if self._generators is None:
            # Extract basis rows once instead of multiplying the entire wide
            # lattice by a separate unit vector for every generator.
            self._generators = tuple(
                _create_map(
                    self.domain(),
                    self.codomain(),
                    _global("matrix")(
                        sage.ZZ,
                        2 * self.domain().dimension(),
                        2 * self.codomain().dimension(),
                        row.list(),
                    ),
                    ("hom_coordinates", tuple(int(i == j) for j in range(self.rank()))),
                )
                for i, row in enumerate(self.basis_matrix().rows())
            )
        return self._generators

    basis = gens

    def gen(self, index: Any = 0) -> Any:
        return self.gens()[index]

    def ngens(self) -> int:
        return self.rank()

    def from_coordinates(self, coordinates: Any) -> Any:
        coordinates = tuple(sage.ZZ(c) for c in coordinates)
        if len(coordinates) != self.rank():
            raise ValueError("wrong number of integral Hom coordinates")
        support = [(i, c) for i, c in enumerate(coordinates) if c != 0]
        if len(support) == 1:
            i, scalar = support[0]
            vector = self.basis_matrix().row(i) * scalar
        else:
            vector = _global("vector")(sage.ZZ, list(coordinates)) * self.basis_matrix()
        matrix = _global("matrix")(
            sage.ZZ,
            2 * self.domain().dimension(),
            2 * self.codomain().dimension(),
            vector.list(),
        )
        return _create_map(
            self.domain(), self.codomain(), matrix, ("hom_coordinates", coordinates)
        )

    def coordinates(self, value: Any) -> Any:
        if isinstance(value, ModularAbelianVarietyMap):
            if value.domain() != self.domain() or value.codomain() != self.codomain():
                raise ValueError("morphism endpoints do not match Hom space")
            matrix = value.matrix()
        elif hasattr(value, "nrows"):
            matrix = _integral_matrix(value, "Hom matrix")
        elif self.domain() == self.codomain():
            matrix = self.domain().multiplication_by(value).matrix()
        elif value == 0:
            matrix = self.domain().zero_morphism(self.codomain()).matrix()
        else:
            raise TypeError("Hom membership requires a morphism or integral matrix")
        if (
            matrix.nrows() != 2 * self.domain().dimension()
            or matrix.ncols() != 2 * self.codomain().dimension()
        ):
            raise ValueError("Hom matrix has the wrong dimensions")
        # Hom lattices are wide: use only a rank-by-rank pivot minor, not
        # an ambient-width right inverse. Verify ALL flattened entries after
        # solving that small system; a matching minor alone is not membership.
        basis = self.basis_matrix()
        if self._coordinate_plan is None:
            pivots = list(basis.pivots())
            inverse = basis.matrix_from_columns(pivots).change_ring(sage.QQ).inverse()
            self._coordinate_plan = (pivots, inverse)
        pivots, inverse = self._coordinate_plan
        entries = matrix.list()
        answer = _global("vector")(sage.QQ, [entries[i] for i in pivots]) * inverse
        if answer * basis != _global("vector")(sage.QQ, entries):
            raise ValueError("matrix is outside the rational Hom space")
        try:
            return _global("vector")(sage.ZZ, answer.list())
        except (TypeError, ValueError):
            raise ValueError("matrix is not in the integral Hom lattice") from None

    def __contains__(self, value: Any) -> bool:
        try:
            self.coordinates(value)
            return True
        except (TypeError, ValueError, ArithmeticError):
            return False

    def __call__(self, value: Any = 0) -> Any:
        return self.from_coordinates(self.coordinates(value))

    def zero(self) -> Any:
        return self.from_coordinates([0] * self.rank())

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ModularAbelianHomSpace)
            and self.domain() == other.domain()
            and self.codomain() == other.codomain()
        )

    def __repr__(self) -> str:
        return (
            "Hom space over Rational Field from "
            + str(self.domain())
            + " to "
            + str(self.codomain())
        )

    __str__ = __repr__
    toString = __repr__


class ModularAbelianEndomorphismRing(ModularAbelianHomSpace):
    """The full order End_Q(A), not merely the image of the Hecke algebra.

    Ring closure follows from completeness of Hom_Q(A,A) and integrality of
    composition. Multiplication of maps uses the existing Sage convention.
    """

    def one(self) -> Any:
        return self(self.domain().identity_morphism())

    def __call__(self, value: Any = 0) -> Any:
        return super().__call__(value)

    def multiplication_table(self) -> Any:
        return tuple(
            tuple(tuple(self.coordinates(f * g)) for g in self.gens())
            for f in self.gens()
        )

    def __repr__(self) -> str:
        return "Endomorphism ring over Rational Field of " + str(self.domain())

    __str__ = __repr__
    toString = __repr__


def Hom(domain: Any, codomain: Any) -> Any:
    key = (id(domain), id(codomain))
    if key not in _hom_parents:
        parent = (
            ModularAbelianEndomorphismRing
            if domain == codomain
            else ModularAbelianHomSpace
        )
        _hom_parents[key] = parent(domain, codomain)
    return _hom_parents[key]


def End(variety: Any) -> Any:
    return Hom(variety, variety)
