"""Products and construction-certified homology subvarieties."""

from __future__ import annotations

from typing import Any

import sagejs as sage
from sagejs.modular_abelian_varieties.abelian_variety import ModularAbelianVariety
from sagejs.modular_abelian_varieties.lattices import (
    IntegralHomologyLattice,
    _exact_integer,
    _integral_matrix,
    _lcm,
    _zero_matrix,
)
from sagejs.modular_abelian_varieties.morphisms import _create_map, _sealed


def block_diagonal(matrices: Any) -> Any:
    rows = sum(m.nrows() for m in matrices)
    cols = sum(m.ncols() for m in matrices)
    result = _zero_matrix(sage.QQ, rows, cols)
    i, j = 0, 0
    for matrix in matrices:
        for r, row in enumerate(matrix.rows()):
            for c, entry in enumerate(row):
                if entry != 0:
                    result[i + r, j + c] = entry
        i += matrix.nrows()
        j += matrix.ncols()
    return result


class HomologySymbols:
    """A rational direct-sum/subspace view, in its integral homology basis.

    This is not an ambient Manin presentation. It deliberately exposes only
    the linear structure and certified operator restriction available here.
    """

    def __init__(self, variety: Any) -> None:
        self._variety = variety

    def dimension(self) -> int:
        return 2 * self._variety.dimension()

    def basis_matrix(self) -> Any:
        return self._variety.lattice().basis_matrix()

    def base_ring(self) -> Any:
        return sage.QQ

    def sign(self) -> int:
        return 0

    def weight(self) -> int:
        return 2

    def hecke_matrix(self, n: Any) -> Any:
        return self._variety.hecke_matrix(n).change_ring(sage.QQ)

    def __repr__(self) -> str:
        return "Rational modular-symbol homology of " + str(self._variety)


class ProductAbelianVariety(ModularAbelianVariety):
    """Ordered product with block homology; repeated factors are retained."""

    def __init__(self, factors: Any) -> None:
        super().__init__(1, "J0")
        flat = []
        for factor in factors:
            if not isinstance(factor, ModularAbelianVariety):
                raise TypeError("product factors must be modular abelian varieties")
            if isinstance(factor, ProductAbelianVariety):
                flat.extend(factor.factors())
            else:
                flat.append(factor)
        self._factors = tuple(flat)
        self._construction = "product"
        self._dimension = sum(f.dimension() for f in flat)
        for factor in flat:
            self._level = _lcm(self._level, factor.level())

    def factors(self) -> Any:
        return self._factors

    def ambient_variety(self) -> Any:
        return self

    def group(self) -> Any:
        raise ValueError(
            "a product has an ordered list of groups, not one Gamma0 group"
        )

    def groups(self) -> Any:
        return tuple(f.group() for f in self._factors)

    def lattice(self) -> Any:
        if self._lattice_cache is None:
            basis = block_diagonal([f.lattice().basis_matrix() for f in self._factors])
            self._lattice_cache = IntegralHomologyLattice(
                basis, "ordered product homology", True
            )
        return self._lattice_cache

    free_module = lattice

    def modular_symbols(self, sign: Any = 0) -> Any:
        if sign != 0:
            raise NotImplementedError(
                "use individual factors for signed modular symbols"
            )
        return HomologySymbols(self)

    def _restricted_hecke_matrix(self, index: int) -> Any:
        return _integral_matrix(
            block_diagonal([f.hecke_matrix(index) for f in self._factors]),
            "product Hecke action",
        )

    def _factor_index(self, index: Any) -> int:
        index = _exact_integer(index, "factor index")
        if index < 0 or index >= len(self._factors):
            raise IndexError("product factor index out of range")
        return index

    def injection(self, index: Any) -> Any:
        index = self._factor_index(index)
        factor = self._factors[index]
        offset = sum(2 * f.dimension() for f in self._factors[:index])
        matrix = _zero_matrix(sage.ZZ, 2 * factor.dimension(), 2 * self.dimension())
        for i in range(2 * factor.dimension()):
            matrix[i, i + offset] = 1
        return _create_map(factor, self, matrix, ("injection", index))

    def projection(self, index: Any) -> Any:
        index = self._factor_index(index)
        return _create_map(
            self,
            self._factors[index],
            self.injection(index).matrix().transpose(),
            ("projection", index),
        )

    def inclusion_map(self) -> Any:
        return self.identity_morphism()

    def _verify_construction(self) -> bool:
        return all(f._verify_construction() for f in self._factors)

    def decomposition(self, simple: bool = True, bound: Any = None) -> Any:
        return [
            f for factor in self._factors for f in factor.decomposition(simple, bound)
        ]

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ProductAbelianVariety) and self._factors == other._factors
        )

    def __repr__(self) -> str:
        return (
            "Product of "
            + str(list(self._factors))
            + " of dimension "
            + str(self.dimension())
        )

    __str__ = __repr__
    toString = __repr__


class HomologySubvariety(ModularAbelianVariety):
    """Connected subvariety constructed as the kernel or image of a morphism."""

    def __init__(self, ambient: Any, basis: Any, recipe: Any) -> None:
        super().__init__(1, "J0")
        if len(recipe) != 2 or recipe[0] not in ["kernel", "image"]:
            raise ValueError("a subvariety needs a kernel/image construction")
        morphism = recipe[1]
        if recipe[0] == "kernel":
            expected_ambient = morphism.domain()
            expected_basis = morphism.kernel_lattice().basis_matrix()
        else:
            expected_ambient = morphism.codomain()
            expected_basis = morphism.saturated_image_lattice().basis_matrix()
        if ambient != expected_ambient or basis != expected_basis:
            raise ValueError("subvariety does not match its construction")
        if basis.nrows() % 2:
            raise ArithmeticError(
                "a connected abelian subvariety has even homology rank"
            )
        self._construction = "homology subvariety"
        self._container = ambient
        self._relative_basis = _sealed(basis)
        self._recipe = recipe
        self._level = ambient.level()
        self._dimension = basis.nrows() // 2

    def ambient_variety(self) -> Any:
        return self._container

    def lattice(self) -> Any:
        if self._lattice_cache is None:
            self._lattice_cache = IntegralHomologyLattice(
                self._relative_basis * self._container.lattice().basis_matrix(),
                "connected subvariety in parent homology",
                True,
            )
        return self._lattice_cache

    free_module = lattice

    def inclusion_map(self) -> Any:
        return _create_map(self, self._container, self._relative_basis, ("inclusion",))

    def _verify_construction(self) -> bool:
        morphism = self._recipe[1]
        if not morphism.verify():
            return False
        if self._recipe[0] == "kernel":
            basis = morphism.kernel_lattice().basis_matrix()
        else:
            basis = morphism.saturated_image_lattice().basis_matrix()
        return self._relative_basis == basis

    def modular_symbols(self, sign: Any = 0) -> Any:
        if sign != 0:
            raise NotImplementedError(
                "signed symbol extraction is not implemented for this subvariety"
            )
        return HomologySymbols(self)

    def _restricted_hecke_matrix(self, index: int) -> Any:
        basis = self._relative_basis
        try:
            image = basis * self._container.hecke_matrix(index)
            return _integral_matrix(basis.solve_left(image), "subvariety Hecke action")
        except (ValueError, ArithmeticError):
            raise ValueError(
                "this subvariety is not stable under the requested Hecke operator"
            ) from None

    def decomposition(self, simple: bool = True, bound: Any = None) -> Any:
        raise NotImplementedError(
            "use the ambient labelled decomposition for this subvariety"
        )

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, HomologySubvariety)
            and self._container == other._container
            and self._relative_basis.row_space() == other._relative_basis.row_space()
        )

    def __repr__(self) -> str:
        return (
            "Connected abelian subvariety of dimension "
            + str(self.dimension())
            + " in "
            + str(self._container)
        )

    __str__ = __repr__
    toString = __repr__
