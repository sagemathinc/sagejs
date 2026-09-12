"""Certified morphisms and integral kernel/image geometry (row action)."""

from __future__ import annotations

from copy import copy
from typing import Any

import sagejs as sage
from sagejs.modular_abelian_varieties.lattices import (
    IntegralHomologyLattice,
    _global,
    _integer_row_lattice_basis,
    _integral_matrix,
    _is_integrally_surjective,
    _saturated_integer_intersection,
    _zero_matrix,
)


def _sealed(matrix: Any) -> Any:
    answer = copy(matrix)
    answer.set_immutable()
    return answer


def _create_map(domain: Any, codomain: Any, matrix: Any, recipe: Any) -> Any:
    """Internal constructor: callers supply a geometric construction, not a flag."""
    return _ConstructedMorphism(domain, codomain, matrix, recipe)


class FiniteKernelComponents:
    r"""The abstract geometric group $\pi_0(\ker f)$, not rational points."""

    def __init__(self, morphism: Any) -> None:
        self._kind = "AbelianVarietyKernelComponents"
        self._morphism = morphism

    def invariants(self) -> tuple[Any, ...]:
        return tuple(self._morphism._smith_invariants())

    def order(self) -> Any:
        answer = sage.ZZ(1)
        for entry in self.invariants():
            answer *= entry
        return answer

    cardinality = order

    def exponent(self) -> Any:
        entries = self.invariants()
        return entries[-1] if entries else sage.ZZ(1)

    def is_trivial(self) -> bool:
        return len(self.invariants()) == 0

    def morphism(self) -> Any:
        return self._morphism

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, FiniteKernelComponents)
            and self._morphism == other._morphism
        )

    def __repr__(self) -> str:
        return "Finite geometric kernel component group with invariants " + str(
            list(self.invariants())
        )

    __str__ = __repr__
    toString = __repr__


class ModularAbelianVarietyMap:
    """A genuine morphism with an exact, replayable construction certificate.

    Explicit matrices require certified generators with the same endpoints.
    Their rational span intersects the integral matrices in genuine maps;
    this does not claim to compute the entire space of homomorphisms.
    """

    def __init__(
        self,
        domain: Any,
        codomain: Any,
        defining_matrix: Any,
        name: str = "Morphism",
        generators: Any = None,
    ) -> None:
        matrix = _integral_matrix(defining_matrix, "homology map")
        if generators is None:
            generators = [domain.identity_morphism()] if domain == codomain else []
        generators = list(generators)
        for generator in generators:
            if not isinstance(generator, ModularAbelianVarietyMap):
                raise TypeError(
                    "generators must be certified abelian-variety morphisms"
                )
            if generator.domain() != domain or generator.codomain() != codomain:
                raise ValueError("generator endpoints do not match")
            if not generator.verify():
                raise ValueError("invalid generator certificate")
        if (
            matrix.nrows() != 2 * domain.dimension()
            or matrix.ncols() != 2 * codomain.dimension()
        ):
            raise ValueError("map matrix has the wrong homology dimensions")
        if not generators:
            if matrix != _zero_matrix(sage.ZZ, matrix.nrows(), matrix.ncols()):
                raise ValueError(
                    "a nonzero matrix requires certified morphism generators"
                )
            recipe = ("zero",)
        else:
            rows = _global("matrix")(
                sage.QQ,
                len(generators),
                matrix.nrows() * matrix.ncols(),
                [c for generator in generators for c in generator.matrix().list()],
            )
            try:
                coefficients = rows.solve_left(
                    _global("vector")(sage.QQ, matrix.list())
                )
            except (ValueError, ArithmeticError):
                raise ValueError(
                    "matrix is not in the certified rational morphism span"
                ) from None
            recipe = ("span", tuple(generators), tuple(coefficients.list()))
        self._initialize(domain, codomain, matrix, recipe)

    def _initialize(self, domain: Any, codomain: Any, matrix: Any, recipe: Any) -> None:
        self._kind = "ModularAbelianVarietyMap"
        self._domain = domain
        self._codomain = codomain
        self._matrix = _sealed(_integral_matrix(matrix, "homology map"))
        if (
            self._matrix.nrows() != 2 * domain.dimension()
            or self._matrix.ncols() != 2 * codomain.dimension()
        ):
            raise ValueError("map matrix has the wrong homology dimensions")
        self._recipe = recipe
        self._rank_cache = None
        self._smith_cache = None
        self._kernel_cache = None
        self._kernel_lattice_cache = None
        self._saturated_image_lattice_cache = None
        self._image_cache = None
        self._image_lattice_cache = None

    def domain(self) -> Any:
        return self._domain

    def codomain(self) -> Any:
        return self._codomain

    def matrix(self) -> Any:
        return self._matrix

    def rank(self) -> int:
        if self._rank_cache is None:
            # Rank is rational: use the exact QQ matrix path in every runtime.
            # Portable ZZ rank can fall back to division-free elimination with
            # severe coefficient growth even for modest homology matrices.
            self._rank_cache = self._matrix.change_ring(sage.QQ).rank()
        return self._rank_cache

    def kernel_lattice(self) -> Any:
        if self._kernel_lattice_cache is None:
            basis = self._matrix.transpose().right_kernel_matrix()
            self._kernel_lattice_cache = IntegralHomologyLattice(
                basis, "connected kernel in domain homology", True
            )
        return self._kernel_lattice_cache

    def image_lattice(self) -> Any:
        if self._image_lattice_cache is None:
            basis = _integer_row_lattice_basis(self._matrix)
            saturated = _saturated_integer_intersection(basis)
            self._image_lattice_cache = IntegralHomologyLattice(
                basis,
                "integral image (not automatically saturated)",
                basis == _integer_row_lattice_basis(saturated),
            )
            self._saturated_image_lattice_cache = IntegralHomologyLattice(
                saturated, "saturated image in target homology", True
            )
        return self._image_lattice_cache

    def saturated_image_lattice(self) -> Any:
        self.image_lattice()
        return self._saturated_image_lattice_cache

    def _smith_invariants(self) -> Any:
        if self._smith_cache is None:
            # Only nonunit nonzero factors contribute to the finite group.
            # Zero factors record the free cokernel, not finite torsion.
            self._smith_cache = tuple(
                abs(d) for d in self._matrix.elementary_divisors() if abs(d) > 1
            )
        return self._smith_cache

    def component_group(self) -> FiniteKernelComponents:
        return FiniteKernelComponents(self)

    def connected_kernel(self) -> Any:
        if self._kernel_cache is None:
            from sagejs.modular_abelian_varieties.products import HomologySubvariety

            self._kernel_cache = HomologySubvariety(
                self._domain, self.kernel_lattice().basis_matrix(), ("kernel", self)
            )
        return self._kernel_cache

    def kernel(self) -> tuple[Any, Any]:
        """Return finite geometric components and the connected kernel variety."""
        return self.component_group(), self.connected_kernel()

    def image(self) -> Any:
        if self._image_cache is None:
            from sagejs.modular_abelian_varieties.products import HomologySubvariety

            self._image_cache = HomologySubvariety(
                self._codomain,
                self.saturated_image_lattice().basis_matrix(),
                ("image", self),
            )
        return self._image_cache

    def is_homology_injective(self) -> bool:
        return self.rank() == self._matrix.nrows()

    def is_homology_surjective(self) -> bool:
        return _is_integrally_surjective(self._matrix)

    def is_injective(self) -> bool:
        return self.is_homology_injective() and self.component_group().is_trivial()

    def is_surjective(self) -> bool:
        return self.rank() == self._matrix.ncols()

    def is_isogeny(self) -> bool:
        return (
            self.domain().dimension() == self.codomain().dimension()
            and self.is_surjective()
        )

    def degree(self) -> Any:
        if not self.is_isogeny():
            raise ValueError("degree is defined here only for an isogeny")
        return self.component_group().order()

    def __add__(self, other: Any) -> Any:
        if not isinstance(other, ModularAbelianVarietyMap):
            if self.domain() != self.codomain():
                raise TypeError("scalar addition requires an endomorphism")
            other = self.domain().multiplication_by(other)
        if self.domain() != other.domain() or self.codomain() != other.codomain():
            raise ValueError("morphisms must have identical endpoints for addition")
        return _create_map(
            self.domain(),
            self.codomain(),
            self.matrix() + other.matrix(),
            ("sum", self, other),
        )

    __radd__ = __add__

    def __neg__(self) -> Any:
        return self * (-1)

    def __sub__(self, other: Any) -> Any:
        return self + (-other)

    def __rsub__(self, other: Any) -> Any:
        return -self + other

    def __mul__(self, other: Any) -> Any:
        if isinstance(other, ModularAbelianVarietyMap):
            # Sage convention: f*g means f after g, despite row-action matrices.
            if other.codomain() != self.domain():
                raise ValueError("composition endpoints do not match")
            return _create_map(
                other.domain(),
                self.codomain(),
                other.matrix() * self.matrix(),
                ("compose", self, other),
            )
        scalar = sage.ZZ(other)
        return _create_map(
            self.domain(),
            self.codomain(),
            self.matrix() * scalar,
            ("scale", self, scalar),
        )

    def __rmul__(self, other: Any) -> Any:
        return self * other

    def compose(self, other: Any) -> Any:
        return self * other

    def __pow__(self, exponent: Any) -> Any:
        exponent = sage.ZZ(exponent)
        if exponent < 0 or self.domain() != self.codomain():
            raise ValueError(
                "powers require an endomorphism and a nonnegative exponent"
            )
        answer = self.domain().identity_morphism()
        power = self
        while exponent:
            if exponent % 2:
                answer = answer * power
            exponent //= 2
            if exponent:
                power = power * power
        return answer

    def verify(self, hecke_bound: Any = None) -> bool:
        """Replay the construction; optional Hecke checks are supplementary."""
        if not self._verify_graph({}):
            return False
        if hecke_bound is not None:
            from sagejs.modular_abelian_varieties.lattices import (
                _gcd,
                _positive_integer,
            )

            for n in range(2, _positive_integer(hecke_bound, "Hecke bound") + 1):
                if _gcd(n, self.domain().level() * self.codomain().level()) != 1:
                    continue
                if self.domain().hecke_matrix(
                    n
                ) * self.matrix() != self.matrix() * self.codomain().hecke_matrix(n):
                    return False
        return True

    def _verify_graph(self, seen: Any) -> bool:
        key = id(self)
        if key in seen:
            if seen[key] is None:
                raise ValueError("cyclic morphism construction")
            return seen[key]
        seen[key] = None
        reconstructed = replay_map(self.domain(), self.codomain(), self._recipe, seen)
        seen[key] = reconstructed.matrix() == self.matrix()
        return seen[key]

    def construction_data(self) -> Any:
        return self._recipe

    def __call__(self, value: Any) -> Any:
        vector = _global("vector")(sage.ZZ, list(value))
        if len(vector) != self._matrix.nrows():
            raise ValueError("map input has the wrong homology rank")
        return vector * self._matrix

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ModularAbelianVarietyMap)
            and self.domain() == other.domain()
            and self.codomain() == other.codomain()
            and self.matrix() == other.matrix()
        )

    def __repr__(self) -> str:
        return (
            "Abelian variety morphism from "
            + str(self.domain())
            + " to "
            + str(self.codomain())
        )

    __str__ = __repr__
    toString = __repr__


class _ConstructedMorphism(ModularAbelianVarietyMap):
    """Private geometric constructor, retaining normal callable-class allocation."""

    def __init__(self, domain: Any, codomain: Any, matrix: Any, recipe: Any) -> None:
        self._initialize(domain, codomain, matrix, recipe)

    def __call__(self, value: Any) -> Any:
        return super().__call__(value)


def replay_map(domain: Any, codomain: Any, recipe: Any, seen: Any = None) -> Any:
    """Reconstruct from data-only mathematical operations, never executable source."""
    if seen is None:
        seen = {}
    tag = recipe[0]
    if tag == "identity" and len(recipe) == 1:
        result = domain.identity_morphism()
    elif tag == "zero" and len(recipe) == 1:
        result = domain.zero_morphism(codomain)
    elif tag == "hecke" and len(recipe) == 2:
        result = domain.hecke_morphism(recipe[1])
    elif tag == "inclusion" and len(recipe) == 1:
        result = domain.inclusion_map()
    elif tag == "quotient" and len(recipe) == 1:
        result = codomain.quotient_map()
    elif tag == "injection" and len(recipe) == 2:
        result = codomain.injection(recipe[1])
    elif tag == "projection" and len(recipe) == 2:
        result = domain.projection(recipe[1])
    elif tag == "degeneracy" and len(recipe) == 2:
        result = domain.degeneracy_map(codomain.level(), recipe[1])
    elif tag in ["sum", "compose", "scale"] and len(recipe) == 3:
        left, right = recipe[1:]
        if not left._verify_graph(seen) or (
            tag != "scale" and not right._verify_graph(seen)
        ):
            raise ValueError("invalid constituent morphism certificate")
        result = left + right if tag == "sum" else left * right
    elif tag == "span" and len(recipe) == 3:
        generators, coefficients = recipe[1:]
        if len(generators) != len(coefficients) or not generators:
            raise ValueError("invalid rational-span certificate")
        matrix = _zero_matrix(sage.QQ, 2 * domain.dimension(), 2 * codomain.dimension())
        for generator, coefficient in zip(generators, coefficients, strict=True):
            if not generator._verify_graph(seen):
                raise ValueError("invalid generator certificate")
            if generator.domain() != domain or generator.codomain() != codomain:
                raise ValueError("generator endpoints do not match")
            matrix += generator.matrix() * coefficient
        result = _create_map(domain, codomain, matrix, recipe)
    else:
        raise ValueError("unknown morphism construction")
    if result.domain() != domain or result.codomain() != codomain:
        raise ValueError("morphism construction has different endpoints")
    return result
