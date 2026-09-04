r"""Exact $\Gamma_1(N)$ modular forms by character-orbit descent.

One representative of every parity-compatible Galois orbit of Dirichlet
characters is computed by the fixed-nebentypus engine.  Cyclotomic
coefficients are split in the declared power basis and the resulting rational
rows are echelonized beyond the $\Gamma_1$ Sturm bound.  Hecke and diamond
operators are transported through exactly the same change of basis.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    value = runtime.normalize_integer(value)
    if runtime.jstype(value) != "number" or not runtime.number.isSafeInteger(value):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(value)


def _positive(value: Any, label: str) -> int:
    answer = _integer(value, label)
    if answer < 1:
        raise ValueError(label + " must be positive")
    return answer


def _ambient(space: Any) -> Any:
    if getattr(space, "_kind", None) == "ModularForms":
        return space
    return space.ambient_space()


def is_gamma1_space(space: Any) -> bool:
    r"""Return whether `space` has a $\Gamma_1$ ambient parent."""
    try:
        return _ambient(space).group()._family == "Gamma1"
    except (AttributeError, TypeError):
        return False


def _space_kind(space: Any) -> str:
    kind = getattr(space, "_kind", None)
    if kind == "ModularForms":
        return "Ambient"
    if kind == "EisensteinSubspace":
        return "Eisenstein"
    if kind == "OldModularFormsSubspace":
        return "Old"
    subspace_kind = getattr(space, "_subspace_kind", None)
    if isinstance(subspace_kind, str):
        return subspace_kind
    raise TypeError("unsupported Gamma1 modular-form parent")


def _proof_precision(space: Any) -> int:
    return max(2, _integer(space.sturm_bound(), "Sturm bound") + 1)


def _matrix_from_rows(rows: list[list[Any]], columns: int) -> Any:
    matrix = _global("matrix")
    if len(rows) == 0:
        return matrix(sage.QQ, 0, columns)
    return matrix(sage.QQ, rows)


def _block_sum(blocks: list[Any]) -> Any:
    size = sum(block.nrows() for block in blocks)
    if size == 0:
        return _global("matrix")(sage.QQ, 0, 0)
    rows = [[sage.QQ(0) for _column in range(size)] for _row in range(size)]
    offset = 0
    for block in blocks:
        for row in range(block.nrows()):
            for column in range(block.ncols()):
                rows[offset + row][offset + column] = sage.QQ(block[row, column])
        offset += block.nrows()
    return _global("matrix")(sage.QQ, rows)


def _fixed_subspace(ambient: Any, kind: str, prime: Any = None) -> Any:
    if kind == "Ambient":
        return ambient
    cusp = ambient.cuspidal_subspace()
    if kind == "Cuspidal":
        return cusp
    if kind == "Eisenstein":
        return ambient.eisenstein_subspace()
    if kind == "Old":
        return cusp.old_subspace()
    if kind == "New":
        return cusp.new_subspace(prime)
    raise ValueError("unknown Gamma1 subspace kind " + kind)


@runtime.lightweight_math_class
class Gamma1CharacterComponent:
    """One fixed-character component used in rational Galois descent."""

    def __init__(
        self,
        character: Any,
        orbit: list[Any],
        fixed_space: Any,
    ) -> None:
        self._kind = "Gamma1CharacterComponent"
        self._character = character
        self._orbit = runtime.math_tuple(orbit)
        self._fixed_space = fixed_space
        self._field = fixed_space.base_ring()
        self._field_degree = (
            1
            if self._field is sage.QQ
            else _integer(self._field.degree(), "field degree")
        )
        runtime.object.freeze(self)

    def character(self) -> Any:
        return self._character

    def galois_orbit(self) -> Any:
        return self._orbit

    def fixed_character_space(self) -> Any:
        return self._fixed_space

    space = fixed_character_space

    def base_ring(self) -> Any:
        return self._field

    def field_degree(self) -> int:
        return self._field_degree

    def dimension(self) -> int:
        return self._fixed_space.dimension()

    def rational_dimension(self) -> int:
        return self.dimension() * self._field_degree

    def __repr__(self) -> str:
        return (
            "Gamma1 character component of rational dimension "
            + str(self.rational_dimension())
            + " from character "
            + str(self._character)
        )

    __str__ = __repr__
    toString = __repr__


_component_cache = runtime.map()
_descent_cache = runtime.map()


def _cache_for(store: Any, space: Any) -> Any:
    cache = store.get(space)
    if cache is runtime.undefined:
        cache = runtime.map()
        store.set(space, cache)
    return cache


def character_components(
    space: Any,
    kind: str | None = None,
    prime: Any = None,
) -> list[Gamma1CharacterComponent]:
    """Return the parity-compatible character-orbit components of `space`."""
    if not is_gamma1_space(space):
        raise TypeError("character_components requires a Gamma1 modular-form space")
    selected_kind = _space_kind(space) if kind is None else kind
    if selected_kind == "New" and prime is None:
        prime = getattr(space, "_new_prime", None)
    cache = _cache_for(_component_cache, _ambient(space))
    key = selected_kind + ("" if prime is None else "|" + str(prime))
    cached = cache.get(key)
    if cached is not runtime.undefined:
        return list(cached)

    # Derive subspaces from already-created ambient fixed-character parents.
    # Besides preserving mathematical parent identity, this reuses their
    # Sturm-certified q-expansion and modular-symbol caches when (for example)
    # an ambient basis is followed by a cuspidal Hecke computation.
    ambient_components = cache.get("Ambient")
    if selected_kind != "Ambient" and ambient_components is not runtime.undefined:
        components = []
        for component in ambient_components:
            fixed_space = _fixed_subspace(
                component.fixed_character_space(),
                selected_kind,
                prime,
            )
            components.append(
                Gamma1CharacterComponent(
                    component.character(),
                    list(component.galois_orbit()),
                    fixed_space,
                )
            )
        cache.set(key, runtime.math_tuple(components))
        return list(components)

    ambient = _ambient(space)
    level = ambient.level()
    weight = ambient.weight()
    precision = ambient.precision()
    group = _global("DirichletGroup")(level)
    components = []
    for orbit_value in group.galois_orbits():
        orbit = list(orbit_value)
        character = orbit[0]
        if character.is_even() != (weight % 2 == 0):
            continue
        if character.is_principal():
            defining_data = level
            field = sage.QQ
        else:
            defining_data = character
            field = (
                sage.QQ if character.order() <= 2 else character._minimal_base_ring()
            )
        fixed_ambient = _global("ModularForms")(
            defining_data,
            weight,
            field,
            True,
            precision,
        )
        if character.is_principal():
            # The public constructor intentionally canonicalizes a principal
            # character to the ordinary Gamma0 parent.  Descent nevertheless
            # needs the fixed-character basis engine here, since it supplies
            # complete composite-level Eisenstein formulas as well as the
            # matching modular-symbol convention.
            runtime.reflect.set(fixed_ambient, "_character", character)
        fixed_space = _fixed_subspace(fixed_ambient, selected_kind, prime)
        components.append(Gamma1CharacterComponent(character, orbit, fixed_space))
    cache.set(key, runtime.math_tuple(components))
    return list(components)


def descended_dimension(
    space: Any,
    kind: str | None = None,
    prime: Any = None,
) -> int:
    """Return the rational dimension obtained from character components."""
    return sum(
        component.rational_dimension()
        for component in character_components(space, kind, prime)
    )


def _fixed_basis(component: Gamma1CharacterComponent, precision: int) -> list[Any]:
    fixed_space = component.fixed_character_space()
    return list(fixed_space.q_expansion_basis(precision))


def _split_fixed_basis(
    component: Gamma1CharacterComponent,
    precision: int,
) -> list[list[Any]]:
    field = component.base_ring()
    degree = component.field_degree()
    answer = []
    for form in _fixed_basis(component, precision):
        if field is sage.QQ:
            answer.append([sage.QQ(form[index]) for index in range(precision)])
            continue
        rows = [[sage.QQ(0) for _index in range(precision)] for _row in range(degree)]
        for exponent in range(precision):
            coefficients = list(
                field._serialization_coefficients(field(form[exponent]))
            )
            for coordinate in range(len(coefficients)):
                rows[coordinate][exponent] = sage.QQ(coefficients[coordinate])
        answer.extend(rows)
    return answer


def _raw_basis_matrix(
    components: list[Gamma1CharacterComponent],
    precision: int,
) -> Any:
    rows = []
    for component in components:
        rows.extend(_split_fixed_basis(component, precision))
    return _matrix_from_rows(rows, precision)


@runtime.lightweight_math_class
class Gamma1DescentCertificate:
    r"""Replayable Sturm-bound certificate for one descended $\Gamma_1$ space."""

    def __init__(
        self,
        space: Any,
        kind: str | None = None,
        prime: Any = None,
    ) -> None:
        if not is_gamma1_space(space):
            raise TypeError("Gamma1 descent requires a Gamma1 space")
        self._kind = "Gamma1DescentCertificate"
        self._space = space
        self._subspace_kind = _space_kind(space) if kind is None else kind
        self._prime = (
            getattr(space, "_new_prime", None)
            if self._subspace_kind == "New" and prime is None
            else prime
        )
        self._precision = _proof_precision(space)
        self._components = runtime.math_tuple(
            character_components(space, self._subspace_kind, self._prime)
        )
        self._expected_dimension = sum(
            component.rational_dimension() for component in self._components
        )
        self._raw_matrix = _raw_basis_matrix(list(self._components), self._precision)
        self._basis_matrix = self._raw_matrix.row_space().basis_matrix()
        if self._basis_matrix.nrows() != self._expected_dimension:
            raise ArithmeticError(
                "Gamma1 character descent has rank "
                + str(self._basis_matrix.nrows())
                + " instead of component dimension "
                + str(self._expected_dimension)
            )
        public_dimension = _public_dimension(space, self._subspace_kind)
        if public_dimension != self._expected_dimension:
            raise ArithmeticError(
                "Gamma1 character components have dimension "
                + str(self._expected_dimension)
                + " instead of the public dimension "
                + str(public_dimension)
            )
        if self._expected_dimension == 0:
            self._transformation = _global("matrix")(sage.QQ, 0, 0)
            self._inverse_transformation = _global("matrix")(sage.QQ, 0, 0)
            self._pivot_matrix = _global("matrix")(sage.QQ, 0, 0)
        else:
            # The canonical row-space basis is in RREF, so its pivot columns
            # form the identity.  Restriction to those columns is an
            # isomorphism on the common row space.  Consequently the complete
            # change of basis is the inverse of this one small square block;
            # solving against every Sturm coefficient is mathematically
            # redundant and becomes very expensive at larger level.
            pivots = list(self._basis_matrix.pivots())
            self._pivot_matrix = self._raw_matrix.matrix_from_columns(pivots)
            self._transformation = self._pivot_matrix.inverse()
            self._inverse_transformation = self._pivot_matrix
        self._raw_matrix.set_immutable()
        self._basis_matrix.set_immutable()
        self._pivot_matrix.set_immutable()
        self._transformation.set_immutable()
        self._inverse_transformation.set_immutable()
        if not self.verify():
            raise ArithmeticError("Gamma1 descent certificate failed verification")
        runtime.object.freeze(self)

    def space(self) -> Any:
        return self._space

    def subspace_kind(self) -> str:
        return self._subspace_kind

    def precision(self) -> int:
        return self._precision

    def sturm_bound(self) -> int:
        return self._space.sturm_bound()

    def dimension(self) -> int:
        return self._expected_dimension

    def components(self) -> list[Gamma1CharacterComponent]:
        return list(self._components)

    def raw_basis_matrix(self) -> Any:
        return self._raw_matrix

    def basis_matrix(self) -> Any:
        return self._basis_matrix

    def transformation_matrix(self) -> Any:
        return self._transformation

    def inverse_transformation_matrix(self) -> Any:
        return self._inverse_transformation

    def verify(self) -> bool:
        if (
            self._precision <= self.sturm_bound()
            or self._raw_matrix.nrows() != self._expected_dimension
            or self._basis_matrix.nrows() != self._expected_dimension
        ):
            return False
        identity = _global("identity_matrix")(sage.QQ, self._expected_dimension)
        if (
            self._basis_matrix.matrix_from_columns(self._basis_matrix.pivots())
            != identity
            or self._transformation._sparse_left_multiply(self._pivot_matrix)
            != identity
            or self._inverse_transformation != self._pivot_matrix
        ):
            return False
        # Equality of exact right kernels certifies equality of the two row
        # spaces without multiplying a dense square transformation through
        # every coefficient up to the Gamma1 Sturm bound.
        return (
            self._raw_matrix.right_kernel().basis_matrix()
            == self._basis_matrix.right_kernel().basis_matrix()
        )

    def __repr__(self) -> str:
        return (
            "Sturm-certified Gamma1 character descent of dimension "
            + str(self._expected_dimension)
            + " with "
            + str(len(self._components))
            + " character-orbit components"
        )

    __str__ = __repr__
    toString = __repr__


def _public_dimension(space: Any, kind: str) -> int:
    if kind == _space_kind(space):
        return space.dimension()
    ambient = _ambient(space)
    if kind == "Ambient":
        return ambient.dimension()
    if kind == "Cuspidal":
        return ambient.cuspidal_subspace().dimension()
    if kind == "Eisenstein":
        return ambient.eisenstein_subspace().dimension()
    if kind in ["Old", "New"]:
        return descended_dimension(space, kind)
    raise ValueError("unknown Gamma1 subspace kind " + kind)


def descent_certificate(
    space: Any,
    kind: str | None = None,
    prime: Any = None,
) -> Gamma1DescentCertificate:
    """Return the cached exact descent certificate for `space`."""
    selected_kind = _space_kind(space) if kind is None else kind
    if selected_kind == "New" and prime is None:
        prime = getattr(space, "_new_prime", None)
    cache = _cache_for(_descent_cache, _ambient(space))
    key = selected_kind + ("" if prime is None else "|" + str(prime))
    cached = cache.get(key)
    if cached is runtime.undefined:
        cached = Gamma1DescentCertificate(space, selected_kind, prime)
        cache.set(key, cached)
    return cached


def q_expansion_basis(
    space: Any,
    precision: Any = None,
    variable: str = "q",
) -> list[Any]:
    """Return the canonical rational $q$-expansion basis of `space`."""
    requested = (
        space.precision() if precision is None else _integer(precision, "precision")
    )
    if requested < 0:
        raise ValueError("precision must be nonnegative")
    certificate = descent_certificate(space)
    construction_precision = max(requested, certificate.precision())
    if construction_precision == certificate.precision():
        basis = certificate.basis_matrix()
    else:
        raw = _raw_basis_matrix(certificate.components(), construction_precision)
        basis = certificate.transformation_matrix()._sparse_left_multiply(raw)
    if basis.rank() != certificate.dimension():
        raise ArithmeticError("Gamma1 descended basis lost rank at higher precision")
    ring = _global("PowerSeriesRing")(
        sage.QQ,
        variable,
        default_prec=max(1, construction_precision),
    )
    answer = [
        ring(row.list()).add_bigoh(construction_precision) for row in basis.rows()
    ]
    if requested < construction_precision:
        return [series.add_bigoh(requested) for series in answer]
    return answer


def q_expansion_basis_matrix(
    space: Any,
    precision: Any,
    kind: str | None = None,
) -> Any:
    """Return a canonical rational descended coefficient matrix."""
    selected_kind = _space_kind(space) if kind is None else kind
    requested = _positive(precision, "precision")
    certificate = descent_certificate(space, selected_kind)
    construction_precision = max(requested, certificate.precision())
    if construction_precision == certificate.precision():
        result = certificate.basis_matrix()
    else:
        raw = _raw_basis_matrix(certificate.components(), construction_precision)
        result = certificate.transformation_matrix()._sparse_left_multiply(raw)
    if requested < construction_precision:
        return result.matrix_from_columns(range(requested))
    return result


def _restricted_operator(component: Gamma1CharacterComponent, index: int) -> Any:
    source = component.fixed_character_space().hecke_matrix(index)
    if component.base_ring() is sage.QQ:
        return source
    return _absolute_coordinate_matrix(source, component.base_ring())


def _absolute_coordinate_matrix(source: Any, field: Any) -> Any:
    r"""Restrict an operator to coefficient-coordinate rational series.

    The descended $q$-series are coefficient projections on the cyclotomic
    power basis, hence each multiplication block is transposed relative to
    the usual regular representation.
    """
    degree = _integer(field.degree(), "field degree")
    dimension = source.nrows()
    generator = field.gen()
    powers = [field(1)]
    for _index in range(1, degree):
        powers.append(powers[-1] * generator)
    rows = []
    for source_index in range(dimension):
        for source_coordinate in range(degree):
            row = [sage.QQ(0) for _index in range(dimension * degree)]
            for target_index in range(dimension):
                entry = source[source_index, target_index]
                for target_coordinate in range(degree):
                    coordinates = list(
                        field._serialization_coefficients(
                            powers[target_coordinate] * entry
                        )
                    )
                    if source_coordinate < len(coordinates):
                        row[target_index * degree + target_coordinate] = sage.QQ(
                            coordinates[source_coordinate]
                        )
            rows.append(row)
    return _global("matrix")(sage.QQ, rows)


def _regular_scalar(component: Gamma1CharacterComponent, scalar: Any) -> Any:
    field = component.base_ring()
    if field is sage.QQ:
        if scalar.is_zero():
            value = field(0)
        elif scalar.is_one():
            value = field(1)
        elif (-scalar).is_one():
            value = field(-1)
        else:
            raise ArithmeticError("a rational character produced a nonrational value")
        return _global("matrix")(field, 1, 1, [value])
    source = _global("matrix")(field, 1, 1, [field(scalar)])
    return _absolute_coordinate_matrix(source, field)


def _canonical_operator(space: Any, raw_operator: Any) -> Any:
    certificate = descent_certificate(space)
    if certificate.dimension() == 0:
        return _global("matrix")(sage.QQ, 0, 0)
    answer = (
        certificate.transformation_matrix()
        * raw_operator
        * certificate.inverse_transformation_matrix()
    )
    if answer.base_ring() is not sage.QQ:
        answer = answer.change_ring(sage.QQ)
    return answer


def hecke_matrix(space: Any, index: Any) -> Any:
    r"""Return the exact rational $T_n$ matrix on a $\Gamma_1$ space."""
    hecke_index = _positive(index, "Hecke index")
    blocks = [
        _restricted_operator(component, hecke_index)
        for component in character_components(space)
    ]
    return _canonical_operator(space, _block_sum(blocks))


def diamond_bracket_matrix(space: Any, value: Any) -> Any:
    """Return the exact rational diamond-bracket matrix on `space`."""
    diamond = _integer(value, "diamond-bracket index")
    level = space.level()
    if runtime.number(_global("gcd")(diamond, level)) != 1:
        raise ValueError("diamond-bracket index must be coprime to the level")
    blocks = []
    for component in character_components(space):
        scalar = component.character()(diamond)
        scalar_block = _regular_scalar(component, scalar)
        for _index in range(component.dimension()):
            blocks.append(scalar_block)
    return _canonical_operator(space, _block_sum(blocks))


def newforms(space: Any, names: str = "a") -> list[Any]:
    """Return one normalized packet per descended character-orbit component."""
    if not isinstance(names, str) or len(names) == 0:
        raise TypeError("newform generator name must be a nonempty string")
    answer = []
    packet_index = 0
    for component in character_components(space, "New"):
        fixed = component.fixed_character_space()
        for packet in fixed.newforms(names + str(packet_index)):
            answer.append(packet)
            packet_index += 1
    return answer


__all__ = [
    "Gamma1CharacterComponent",
    "Gamma1DescentCertificate",
    "character_components",
    "descended_dimension",
    "descent_certificate",
    "diamond_bracket_matrix",
    "hecke_matrix",
    "is_gamma1_space",
    "newforms",
    "q_expansion_basis",
    "q_expansion_basis_matrix",
]
