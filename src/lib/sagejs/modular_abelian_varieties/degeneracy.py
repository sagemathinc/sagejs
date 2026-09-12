"""Geometric degeneracy maps and labelled newform copies over QQ."""

from __future__ import annotations

from typing import Any

import sagejs as sage
from sagejs.modular_abelian_varieties.abelian_variety import (
    J0,
    ModularAbelianVariety,
    _global,
    _homology_decomposition,
    _integral_matrix,
    _positive_integer,
)
from sagejs.modular_abelian_varieties.lattices import _gcd
from sagejs.modular_abelian_varieties.morphisms import _create_map, _product_map


def _bezout(a: int, b: int) -> tuple[int, int]:
    x, y, u, v = 1, 0, 0, 1
    while b:
        q = a // b
        a, b = b, a - q * b
        x, u = u, x - q * u
        y, v = v, y - q * v
    if a != 1:
        raise ArithmeticError("SL2 lift requires a primitive integer pair")
    return x, y


def _lift(c: int, d: int, level: int) -> tuple[int, int, int, int]:
    # A primitive residue pair has a primitive lift with c fixed (unless c=0).
    c = c if c else level
    while _gcd(c, d) != 1:
        d += level
    a, minus_b = _bezout(d, c)
    return a, -minus_b, c, d


def _multiply(left: Any, right: Any) -> tuple[Any, ...]:
    a, b, c, d = left
    e, f, g, h = right
    return a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h


def _path(space: Any, matrix: Any) -> Any:
    a, b, c, d = matrix
    return space.p1list().reduce_path((b, d), (a, c))


_manin_coordinates: dict[int, Any] = {}


def _manin_coordinate_data(space: Any) -> Any:
    """Translate the small triple-Manin basis to the geometric E1 basis."""
    level = space.level()
    if level not in _manin_coordinates:
        line = space.p1list()
        presentation = line.higher_weight_presentation(2, 0)
        pairs = line.list()
        lifts = [
            _lift(pairs[i][0], pairs[i][1], level)
            for i in presentation.basis_generators()
        ]
        coordinates = _global("matrix")(sage.QQ, [_path(space, g) for g in lifts])
        if coordinates.rank() != space.dimension():
            raise ArithmeticError("Manin generators do not span geometric homology")
        _manin_coordinates[level] = (presentation, lifts, coordinates)
    return _manin_coordinates[level]


def _transfer(source: Any, target: Any) -> Any:
    r"""The transfer for $\Gamma_0(N)\backslash\Gamma_0(M)$, $M\mid N$.

    Cosets are exactly the target projective points reducing to (0:1) at M.
    Lift these to SL2(Z), then sum left translates of source Manin generators.
    Selecting independent source generators avoids transferring redundant rows.
    """
    M, N = source.level(), target.level()
    cosets = [_lift(c, d, N) for c, d in target.p1list().list() if c % M == 0]
    degree = len(target.p1list()) // len(source.p1list())
    if len(cosets) != degree:
        raise ArithmeticError("degeneracy coset count does not equal covering degree")
    _, lifts, reductions = _manin_coordinate_data(source)
    presentation, _, target_coordinates = _manin_coordinate_data(target)
    line = target.p1list()
    counts = [0] * (len(lifts) * len(line))
    for i, lift in enumerate(lifts):
        for h in cosets:
            _, _, c, d = _multiply(h, lift)
            j = line.index(c, d)
            counts[i * len(line) + j] += 1
    counts = _global("matrix")(sage.QQ, len(lifts), len(line), counts)
    image_matrix = counts * presentation.reduction_matrix() * target_coordinates
    image_matrix = reductions.solve_right(image_matrix)
    change = source._ambient_change_of_basis()
    if change is not None:
        image_matrix = change.transpose() * image_matrix
    change = target._ambient_change_of_basis()
    return (
        image_matrix if change is None else image_matrix * change.inverse().transpose()
    )


_ambient_maps: dict[tuple[int, int, int], Any] = {}


def degeneracy_map(variety: Any, level: Any, index: Any = 1) -> Any:
    target_level = _positive_integer(level, "target level")
    index = _positive_integer(index, "degeneracy index")
    source_level = variety.level()
    low, high = min(source_level, target_level), max(source_level, target_level)
    if high % low or (high // low) % index:
        raise ValueError(
            "one level must divide the other and the index must divide their quotient"
        )
    if not variety.is_ambient():
        if variety.is_quotient():
            raise ValueError(
                "a newform quotient has no canonical map to the ambient Jacobian"
            )
        inclusion = variety.inclusion_map()
        if inclusion.codomain() is variety:
            raise NotImplementedError("apply degeneracy maps factorwise to a product")
        return degeneracy_map(inclusion.codomain(), target_level, index) * inclusion
    key = (source_level, target_level, index)
    if key in _ambient_maps:
        return _ambient_maps[key]
    target = J0(target_level)
    if target_level == source_level:
        return variety.identity_morphism()
    source_symbols = variety.modular_symbols().ambient_module()
    target_symbols = target.modular_symbols().ambient_module()
    if source_level > target_level:
        ambient_matrix = source_symbols.degeneracy_map(target_symbols, index).matrix()
    else:
        if index == 1:
            ambient_matrix = _transfer(source_symbols, target_symbols)
        else:
            first = degeneracy_map(variety, target_level, 1)
            matrix = first.matrix() * target.hecke_matrix(index) / sage.QQ(index)
            answer = _create_map(variety, target, matrix, ("degeneracy", index))
            _ambient_maps[key] = answer
            return answer
    images = variety.lattice().basis_matrix() * ambient_matrix
    matrix = _integral_matrix(
        target.lattice().basis_matrix().solve_left(images), "geometric degeneracy map"
    )
    answer = _create_map(variety, target, matrix, ("degeneracy", index))
    if source_level < target_level:
        down = degeneracy_map(target, source_level, 1)
        degree = len(target_symbols.p1list()) // len(source_symbols.p1list())
        if (
            answer.matrix() * down.matrix()
            != variety.multiplication_by(degree).matrix()
        ):
            raise ArithmeticError(
                "transfer followed by pushforward is not the covering degree"
            )
    _ambient_maps[key] = answer
    return answer


class OldformCopy:
    """One labelled degeneracy image of a new constituent at a lower level."""

    def __init__(
        self, source: Any, index: int, constituent: int, morphism: Any
    ) -> None:
        self._source = source
        self._index = index
        self._constituent = constituent
        self._map = morphism
        self._variety = None

    def source_level(self) -> int:
        return self._source.level()

    def degeneracy_index(self) -> int:
        return self._index

    def constituent_index(self) -> int:
        return self._constituent

    def source(self) -> Any:
        return self._source

    def map(self) -> Any:
        return self._map

    def variety(self) -> Any:
        if self._variety is None:
            if self.source_level() == self._map.codomain().level():
                self._variety = self._source
            else:
                self._variety = self._map.image()
        return self._variety

    def dimension(self) -> int:
        return self._source.dimension()

    def __repr__(self) -> str:
        return (
            "New constituent "
            + str(self._constituent)
            + " of level "
            + str(self.source_level())
            + ", degeneracy index "
            + str(self._index)
            + ", dimension "
            + str(self.dimension())
        )

    __str__ = __repr__
    toString = __repr__


class OldformDecomposition:
    """Labelled copies with an explicit product-to-Jacobian isogeny."""

    def __init__(self, ambient: Any, copies: Any) -> None:
        self._ambient = ambient
        self._copies = tuple(copies)
        self._isogeny = None

    def copies(self) -> Any:
        return self._copies

    def isogeny(self) -> Any:
        if self._isogeny is None:
            from sagejs.modular_abelian_varieties.products import ProductAbelianVariety

            product = ProductAbelianVariety([c.variety() for c in self._copies])
            morphism = _product_map(
                product,
                self._ambient,
                [c.variety().inclusion_map() for c in self._copies],
            )
            if not morphism.is_isogeny():
                raise ArithmeticError(
                    "labelled oldform copies do not span the Jacobian"
                )
            self._isogeny = morphism
        return self._isogeny

    def __iter__(self) -> Any:
        return iter(self._copies)

    def __len__(self) -> int:
        return len(self._copies)

    def __getitem__(self, index: Any) -> Any:
        return self._copies[index]


def oldform_decomposition(variety: Any) -> OldformDecomposition:
    if not variety.is_ambient():
        raise ValueError("labelled oldform decomposition currently starts from J0(N)")
    cached = getattr(variety, "_oldform_decomposition_cache", None)
    if cached is not None:
        return cached
    copies = []
    N = variety.level()
    for divisor in sage.divisors(N):
        M = int(divisor)
        if J0(M).dimension() == 0:
            continue
        new = J0(M).modular_symbols().new_submodule()
        for label, symbols in enumerate(_homology_decomposition(new)):
            source = ModularAbelianVariety(M, "modular-symbol subvariety", symbols)
            for index in sage.divisors(N // M):
                morphism = source.degeneracy_map(N, index)
                copies.append(OldformCopy(source, int(index), label, morphism))
    if sum(c.dimension() for c in copies) != variety.dimension():
        raise ArithmeticError(
            "new/old dimension formula disagrees with labelled copies"
        )
    answer = OldformDecomposition(variety, copies)
    answer.isogeny()
    variety._oldform_decomposition_cache = answer
    return answer
