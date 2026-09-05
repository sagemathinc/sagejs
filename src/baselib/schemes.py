# Exact affine and projective schemes over supported coefficient fields.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime

_affine_space_cache = runtime.map()
_projective_space_cache = runtime.map()


def _forget_space_cache_entry(record: Any) -> None:
    cache, key, reference = record
    # A collected old parent must not remove a subsequently recreated parent.
    if cache.get(key) is reference:
        runtime.reflect.get(cache, "delete").call(cache, key)


_space_cache_registry = runtime.reflect.construct(
    runtime.finalization_registry_class, [_forget_space_cache_entry]
)


def _space_cache_key(base: Any, dimension: int, names: Any) -> str:
    return str(id(base)) + ":" + str(dimension) + ":" + repr(names)


def _cached_space(cache: Any, key: str) -> Any:
    reference = cache.get(key)
    return runtime.undefined if reference is runtime.undefined else reference.deref()


def _cache_space(cache: Any, key: str, value: Any) -> None:
    # Parent identity is mathematical state: never evict a parent while a point
    # or scheme still owns it. Weak values avoid retaining unused ambient rings.
    reference = runtime.reflect.construct(runtime.weak_ref_class, [value])
    cache.set(key, reference)
    _space_cache_registry.register(value, [cache, key, reference])


def _is_boolean(value: Any) -> bool:
    return isinstance(value, bool)


def _require_dimension(value: Any, kind: str) -> int:
    if _is_boolean(value) or not runtime.is_exact_integer(value):
        raise TypeError(kind + " dimension must be an integer")
    dimension = int(value)
    if dimension < 0:
        raise ValueError(kind + " dimension must be nonnegative")
    return dimension


def _require_supported_geometry_field(base: Any) -> Any:
    """Validate the public coefficient-field capability boundary.

    Geometry deliberately asks only public field questions. Extension-field
    representations and backend tags never enter this module.
    """
    if base is sage.QQ:
        return base
    if hasattr(base, "is_field") and not bool(base.is_field()):
        raise TypeError("the base ring of a scheme must be a field")
    if hasattr(base, "is_prime_field") and bool(base.is_prime_field()):
        return base
    raise NotImplementedError(
        "algebraic geometry currently supports QQ and prime GF(p); "
        "finite extensions and number fields are planned in "
        "agents/no-singular-extension-fields-plan.md"
    )


def _construction_arguments(
    first: Any,
    second: Any,
    kind: str,
) -> tuple[Any, int]:
    first_is_dimension = runtime.is_exact_integer(first) and not _is_boolean(first)
    second_is_dimension = runtime.is_exact_integer(second) and not _is_boolean(second)
    if first_is_dimension == second_is_dimension:
        raise TypeError(kind + " needs exactly one dimension and one coefficient field")
    if first_is_dimension:
        dimension = _require_dimension(first, kind)
        base = second
    else:
        base = first
        dimension = _require_dimension(second, kind)
    return _require_supported_geometry_field(base), dimension


def _coordinate_values(values: Any, expected: int, kind: str) -> list[Any]:
    if len(values) == 1 and isinstance(values[0], (list, tuple)):
        values = values[0]
    coordinates = list(values)
    if len(coordinates) != expected:
        raise TypeError(
            kind
            + " needs "
            + str(expected)
            + " coordinates, not "
            + str(len(coordinates))
        )
    return coordinates


def _point_product(field: Any, dimension: int) -> Iterator[Any]:
    if dimension == 0:
        yield runtime.math_tuple([])
    else:
        values = list(field)

        def walk(index: int, prefix: list[Any]) -> Iterator[Any]:
            if index == dimension:
                yield runtime.math_tuple(prefix)
            else:
                for value in values:
                    yield from walk(index + 1, prefix + [value])

        yield from walk(0, [])


@runtime.callable_instance_class
class AffinePoint:
    """A rational point of an affine space or closed affine subscheme."""

    def __init__(self, parent: Any, coordinates: Any, check: bool = True) -> None:
        self._parent = parent
        ambient = parent.ambient_space()
        values = _coordinate_values(
            runtime.math_tuple(coordinates), ambient.dimension(), "an affine point"
        )
        base = ambient.base_ring()
        self._coordinates = runtime.math_tuple([base(value) for value in values])
        if check and not parent._contains_coordinates(self._coordinates):
            raise TypeError("the coordinates do not define a point on the scheme")
        runtime.object.freeze(self)

    def parent(self) -> Any:
        return self._parent

    def codomain(self) -> Any:
        return self._parent

    def ambient_space(self) -> Any:
        return self._parent.ambient_space()

    def coordinates(self) -> Any:
        return self._coordinates

    def __iter__(self) -> Iterator[Any]:
        yield from self._coordinates

    def __len__(self) -> int:
        return len(self._coordinates)

    def __getitem__(self, index: int) -> Any:
        return self._coordinates[index]

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, AffinePoint)
            and other.ambient_space() is self.ambient_space()
            and other._coordinates == self._coordinates
        )

    def __hash__(self) -> int:
        key = str(id(self.ambient_space())) + ":" + repr(self._coordinates)
        return hash(key)

    def __repr__(self) -> str:
        return "(" + ", ".join([repr(value) for value in self._coordinates]) + ")"

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class AffineSpaceParent(sage.Parent):
    """Affine `n`-space over `QQ` or a prime finite field."""

    def __init__(self, dimension: int, base: Any, names: Any = "x") -> None:
        self._dimension = dimension
        self._base = base
        self._coordinate_ring = sage.PolynomialRing(
            base, dimension, names=names, order="degrevlex"
        )
        self._kind = "AFFINE_SPACE"
        self._construction = {
            "kind": "affine_space",
            "base_field": base,
            "dimension": dimension,
            "coordinate_names": self._coordinate_ring.variable_names(),
        }

    def ambient_space(self) -> AffineSpaceParent:
        return self

    def dimension(self, proof: Any = None) -> int:
        return self._dimension

    dim = dimension

    def codimension(self, proof: Any = None) -> int:
        return 0

    def base_ring(self) -> Any:
        return self._base

    base_field = base_ring

    def coordinate_ring(self) -> Any:
        return self._coordinate_ring

    def gens(self) -> Any:
        return self._coordinate_ring.gens()

    def gen(self, index: int = 0) -> Any:
        return self._coordinate_ring.gen(index)

    def ngens(self) -> int:
        return self._dimension

    def defining_ideal(self, proof: Any = None) -> Any:
        return self._coordinate_ring.ideal(0)

    def defining_polynomials(self) -> Any:
        return runtime.math_tuple([])

    def subscheme(self, equations: Any) -> AffineSubscheme:
        return AffineSubscheme(self, equations)

    closed_subscheme = subscheme

    def _contains_coordinates(self, coordinates: Any) -> bool:
        return len(coordinates) == self._dimension

    def __call__(self, *coordinates: Any) -> AffinePoint:
        values = _coordinate_values(coordinates, self._dimension, "an affine point")
        return AffinePoint(self, values, check=False)

    point = __call__

    def __contains__(self, value: object) -> bool:
        return isinstance(value, AffinePoint) and value.ambient_space() is self

    def rational_points(self, max_points: int = 100000) -> list[AffinePoint]:
        if not hasattr(self._base, "is_prime_field") or not bool(
            self._base.is_prime_field()
        ):
            raise NotImplementedError(
                "affine point enumeration requires a prime finite field"
            )
        count = int(self._base.cardinality()) ** self._dimension
        if count > max_points:
            raise OverflowError(
                "affine point enumeration exceeds the "
                + str(max_points)
                + "-point limit"
            )
        return [self(*values) for values in _point_product(self._base, self._dimension)]

    points = rational_points

    def hom(self, coordinates: Any, codomain: Any) -> Any:
        return _scheme_morphism_module().SchemeMorphism(self, codomain, coordinates)

    def projective_closure(self, name: str = "h", proof: Any = None) -> Any:
        return _scheme_projective_module().projective_closure(self, name, proof)

    def jacobian_matrix(self, proof: Any = None) -> Any:
        return _scheme_jacobian_module().jacobian_matrix(self, proof)

    jacobian = jacobian_matrix

    def tangent_space(self, point: Any, proof: Any = None) -> Any:
        return _scheme_jacobian_module().tangent_space(self, point, proof)

    def is_smooth(self, point: Any = None, proof: Any = None) -> bool:
        return _scheme_jacobian_module().is_smooth(self, point, proof)

    def singular_subscheme(self, proof: Any = None) -> Any:
        return _scheme_jacobian_module().singular_subscheme(self, proof)

    def is_empty(self, proof: Any = None) -> bool:
        return False

    def __repr__(self) -> str:
        return (
            "Affine Space of dimension "
            + str(self._dimension)
            + " over "
            + str(self._base)
        )

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class AffineSubscheme:
    """A closed affine subscheme retaining its full defining ideal."""

    def __init__(self, ambient: AffineSpaceParent, equations: Any) -> None:
        if not isinstance(ambient, AffineSpaceParent):
            raise TypeError("an affine subscheme needs an affine ambient space")
        self._ambient = ambient
        ring = ambient.coordinate_ring()
        if hasattr(equations, "ring") and equations.ring() is ring:
            self._ideal = equations
        else:
            if not isinstance(equations, (list, tuple)):
                equations = [equations]
            self._ideal = ring.ideal([ring(equation) for equation in equations])
        self._equations = self._ideal.gens()
        self._coordinate_ring_cache: dict[bool, Any] = {}
        self._kind = "AFFINE_SUBSCHEME"
        self._construction = {
            "kind": "affine_subscheme",
            "ambient": ambient,
            "base_field": ambient.base_ring(),
            "ideal": self._ideal,
        }

    def ambient_space(self) -> AffineSpaceParent:
        return self._ambient

    def base_ring(self) -> Any:
        return self._ambient.base_ring()

    base_field = base_ring

    def defining_polynomials(self) -> Any:
        return self._equations

    def defining_ideal(self, proof: Any = None) -> Any:
        return self._ideal

    ideal = defining_ideal

    def coordinate_ring(self, proof: Any = None) -> Any:
        resolved = _resolve_scheme_proof(proof)
        if resolved not in self._coordinate_ring_cache:
            self._coordinate_ring_cache[resolved] = self._ideal.quotient_ring(
                proof=resolved
            )
        return self._coordinate_ring_cache[resolved]

    def dimension(self, proof: Any = None) -> int:
        return self._ideal.dimension(proof=proof)

    dim = dimension

    def codimension(self, proof: Any = None) -> int:
        dimension = self.dimension(proof=proof)
        if dimension < 0:
            return self._ambient.dimension() + 1
        return self._ambient.dimension() - dimension

    def degree(self, proof: Any = None) -> int:
        return self._ideal.degree(proof=proof)

    def is_empty(self, proof: Any = None) -> bool:
        return self._ideal.is_one(proof=proof)

    def _contains_coordinates(self, coordinates: Any) -> bool:
        return all(equation(*coordinates) == 0 for equation in self._equations)

    def __contains__(self, value: object) -> bool:
        if not isinstance(value, AffinePoint):
            return False
        if value.ambient_space() is not self._ambient:
            return False
        return self._contains_coordinates(value.coordinates())

    def __call__(self, *coordinates: Any) -> AffinePoint:
        if len(coordinates) == 1 and isinstance(coordinates[0], AffinePoint):
            point = coordinates[0]
            if point.ambient_space() is not self._ambient:
                raise TypeError("the affine point has a different ambient space")
            return AffinePoint(self, point.coordinates())
        values = _coordinate_values(
            coordinates, self._ambient.dimension(), "an affine point"
        )
        return AffinePoint(self, values)

    point = __call__

    def is_subscheme(self, other: Any, proof: Any = None) -> bool:
        other = self._require_same_ambient(other)
        return other._ideal.is_subset(self._ideal, proof=proof)

    def is_equal(self, other: Any, proof: Any = None) -> bool:
        other = self._require_same_ambient(other)
        return self._ideal.is_equal(other._ideal, proof=proof)

    def _require_same_ambient(self, other: Any) -> AffineSubscheme:
        if (
            not isinstance(other, AffineSubscheme)
            or other._ambient is not self._ambient
        ):
            raise TypeError("affine subschemes must have the same ambient space")
        return other

    def __eq__(self, other: object) -> bool:
        if (
            not isinstance(other, AffineSubscheme)
            or other._ambient is not self._ambient
        ):
            return False
        return self._ideal.is_equal(other._ideal)

    def __le__(self, other: Any) -> bool:
        return self.is_subscheme(other)

    def __ge__(self, other: Any) -> bool:
        return self._require_same_ambient(other).is_subscheme(self)

    def intersection(self, other: Any) -> AffineSubscheme:
        other = self._require_same_ambient(other)
        return AffineSubscheme(self._ambient, self._ideal + other._ideal)

    __mul__ = intersection

    def union(self, other: Any, proof: Any = None) -> AffineSubscheme:
        other = self._require_same_ambient(other)
        ideal = self._ideal.intersection(other._ideal, proof=proof)
        return AffineSubscheme(self._ambient, ideal)

    __add__ = union

    def rational_points(self, max_points: int = 100000) -> list[AffinePoint]:
        answer = []
        for point in self._ambient.rational_points(max_points=max_points):
            if point in self:
                answer.append(self(point))
        return answer

    points = rational_points

    def irreducible_components(self, proof: Any = None) -> list[AffineSubscheme]:
        """Return reduced components in the supported zero-dimensional scope."""
        components = self._ideal.primary_decomposition(proof=proof)
        return [
            AffineSubscheme(self._ambient, ideal.radical(proof=proof))
            for ideal in components
        ]

    def hom(self, coordinates: Any, codomain: Any) -> Any:
        return _scheme_morphism_module().SchemeMorphism(self, codomain, coordinates)

    def projective_closure(self, name: str = "h", proof: Any = None) -> Any:
        return _scheme_projective_module().projective_closure(self, name, proof)

    def jacobian_matrix(self, proof: Any = None) -> Any:
        return _scheme_jacobian_module().jacobian_matrix(self, proof)

    jacobian = jacobian_matrix

    def tangent_space(self, point: Any, proof: Any = None) -> Any:
        return _scheme_jacobian_module().tangent_space(self, point, proof)

    def is_smooth(self, point: Any = None, proof: Any = None) -> bool:
        return _scheme_jacobian_module().is_smooth(self, point, proof)

    def singular_subscheme(self, proof: Any = None) -> Any:
        return _scheme_jacobian_module().singular_subscheme(self, proof)

    def __repr__(self) -> str:
        lines = ["Closed subscheme of " + str(self._ambient) + " defined by:"]
        equations = list(self._equations)
        if (
            len(equations) == 2
            and equations[0].total_degree() == 1
            and equations[1].total_degree() == 1
        ):
            equations.reverse()
        if len(equations) == 0:
            lines.append("  0")
        else:
            for index, equation in enumerate(equations):
                suffix = "," if index + 1 < len(equations) else ""
                lines.append("  " + repr(equation) + suffix)
        return "\n".join(lines)

    __str__ = __repr__
    toString = __repr__


def AffineSpace(
    first: Any,
    second: Any,
    names: Any = "x",
) -> AffineSpaceParent:
    """Construct affine space in either Sage-compatible argument order.

    ```sage
    sage: A = AffineSpace(QQ, 2, names=("x", "y"))
    sage: A.dimension()
    2
    ```
    """
    base, dimension = _construction_arguments(first, second, "affine-space")
    if dimension == 0:
        raise NotImplementedError(
            "zero-dimensional affine ambient space awaits zero-variable "
            "polynomial-ring support"
        )
    ring = sage.PolynomialRing(base, dimension, names=names, order="degrevlex")
    coordinate_names = ring.variable_names()
    key = _space_cache_key(base, dimension, coordinate_names)
    cached = _cached_space(_affine_space_cache, key)
    if cached is not runtime.undefined:
        return cached
    answer = AffineSpaceParent(dimension, base, coordinate_names)
    _cache_space(_affine_space_cache, key, answer)
    return answer


@runtime.callable_instance_class
class ProjectivePoint:
    """A normalized rational point of a projective space or subscheme."""

    def __init__(self, parent: Any, coordinates: Any, check: bool = True) -> None:
        self._parent = parent
        ambient = parent.ambient_space()
        values = _coordinate_values(
            runtime.math_tuple(coordinates),
            ambient.dimension() + 1,
            "a projective point",
        )
        base = ambient.base_ring()
        coerced = [base(value) for value in values]
        pivot = -1
        for index, value in enumerate(coerced):
            if value != base(0):
                pivot = index
                break
        if pivot == -1:
            raise ValueError("projective coordinates cannot all be zero")
        inverse = base(1) / coerced[pivot]
        self._coordinates = runtime.math_tuple([value * inverse for value in coerced])
        if check and not parent._contains_coordinates(self._coordinates):
            raise TypeError("the coordinates do not define a point on the scheme")
        runtime.object.freeze(self)

    def parent(self) -> Any:
        return self._parent

    def codomain(self) -> Any:
        return self._parent

    def ambient_space(self) -> Any:
        return self._parent.ambient_space()

    def coordinates(self) -> Any:
        return self._coordinates

    def __iter__(self) -> Iterator[Any]:
        yield from self._coordinates

    def __len__(self) -> int:
        return len(self._coordinates)

    def __getitem__(self, index: int) -> Any:
        return self._coordinates[index]

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ProjectivePoint)
            and other.ambient_space() is self.ambient_space()
            and other._coordinates == self._coordinates
        )

    def __hash__(self) -> int:
        key = str(id(self.ambient_space())) + ":" + repr(self._coordinates)
        return hash(key)

    def __repr__(self) -> str:
        return "(" + " : ".join([repr(value) for value in self._coordinates]) + ")"

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class ProjectiveSpaceParent(sage.Parent):
    """Projective `n`-space over `QQ` or a prime finite field."""

    def __init__(self, dimension: int, base: Any, names: Any = "x") -> None:
        self._dimension = dimension
        self._base = base
        self._coordinate_ring = sage.PolynomialRing(
            base, dimension + 1, names=names, order="degrevlex"
        )
        self._kind = "PROJECTIVE_SPACE"
        self._construction = {
            "kind": "projective_space",
            "base_field": base,
            "dimension": dimension,
            "coordinate_names": self._coordinate_ring.variable_names(),
        }

    def ambient_space(self) -> ProjectiveSpaceParent:
        return self

    def dimension(self, proof: Any = None) -> int:
        return self._dimension

    dim = dimension

    def codimension(self, proof: Any = None) -> int:
        return 0

    def base_ring(self) -> Any:
        return self._base

    base_field = base_ring

    def coordinate_ring(self) -> Any:
        return self._coordinate_ring

    def gens(self) -> Any:
        return self._coordinate_ring.gens()

    def gen(self, index: int = 0) -> Any:
        return self._coordinate_ring.gen(index)

    def ngens(self) -> int:
        return self._dimension + 1

    def defining_ideal(self, proof: Any = None) -> Any:
        return self._coordinate_ring.ideal(0)

    def defining_polynomials(self) -> Any:
        return runtime.math_tuple([])

    def irrelevant_ideal(self) -> Any:
        return self._coordinate_ring.ideal(self._coordinate_ring.gens())

    def subscheme(self, equations: Any) -> ProjectiveSubscheme:
        return ProjectiveSubscheme(self, equations)

    closed_subscheme = subscheme

    def _contains_coordinates(self, coordinates: Any) -> bool:
        return len(coordinates) == self._dimension + 1

    def __call__(self, *coordinates: Any) -> ProjectivePoint:
        values = _coordinate_values(
            coordinates, self._dimension + 1, "a projective point"
        )
        return ProjectivePoint(self, values, check=False)

    point = __call__

    def __contains__(self, value: object) -> bool:
        return isinstance(value, ProjectivePoint) and value.ambient_space() is self

    def rational_points(self, max_points: int = 100000) -> list[ProjectivePoint]:
        if not hasattr(self._base, "is_prime_field") or not bool(
            self._base.is_prime_field()
        ):
            raise NotImplementedError(
                "projective point enumeration requires a prime finite field"
            )
        order = int(self._base.cardinality())
        count = (order ** (self._dimension + 1) - 1) // (order - 1)
        if count > max_points:
            raise OverflowError(
                "projective point enumeration exceeds the "
                + str(max_points)
                + "-point limit"
            )
        answer = []
        zero = self._base(0)
        one = self._base(1)
        for pivot in range(self._dimension + 1):
            tail_dimension = self._dimension - pivot
            for tail in _point_product(self._base, tail_dimension):
                coordinates = [zero] * pivot + [one] + list(tail)
                answer.append(self(*coordinates))
        return answer

    points = rational_points

    def affine_patch(self, index: int = 0, proof: Any = None) -> AffineSpaceParent:
        if not runtime.is_exact_integer(index):
            raise TypeError("projective patch index must be an integer")
        index = int(index)
        if index < 0 or index > self._dimension:
            raise IndexError("projective patch index is out of range")
        names = list(self._coordinate_ring.variable_names())
        del names[index]
        return AffineSpace(self._base, self._dimension, names=names)

    def hom(self, coordinates: Any, codomain: Any) -> Any:
        return _scheme_morphism_module().SchemeMorphism(self, codomain, coordinates)

    def jacobian_matrix(self, proof: Any = None) -> Any:
        return _scheme_jacobian_module().jacobian_matrix(self, proof)

    jacobian = jacobian_matrix

    def tangent_space(self, point: Any, proof: Any = None) -> Any:
        return _scheme_jacobian_module().tangent_space(self, point, proof)

    def is_smooth(self, point: Any = None, proof: Any = None) -> bool:
        return _scheme_jacobian_module().is_smooth(self, point, proof)

    def singular_subscheme(self, proof: Any = None) -> Any:
        return _scheme_jacobian_module().singular_subscheme(self, proof)

    def is_empty(self, proof: Any = None) -> bool:
        return False

    def __repr__(self) -> str:
        return (
            "Projective Space of dimension "
            + str(self._dimension)
            + " over "
            + str(self._base)
        )

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class ProjectiveSubscheme:
    """A homogeneous closed subscheme interpreted in `Proj`."""

    def __init__(self, ambient: ProjectiveSpaceParent, equations: Any) -> None:
        if not isinstance(ambient, ProjectiveSpaceParent):
            raise TypeError("a projective subscheme needs a projective ambient space")
        self._ambient = ambient
        ring = ambient.coordinate_ring()
        if hasattr(equations, "ring") and equations.ring() is ring:
            ideal = equations
        else:
            if not isinstance(equations, (list, tuple)):
                equations = [equations]
            ideal = ring.ideal([ring(equation) for equation in equations])
        for equation in ideal.gens():
            if not equation.is_homogeneous():
                raise ValueError("projective defining equations must be homogeneous")
        self._submitted_ideal = ideal
        self._equations = ideal.gens()
        self._saturated_ideals: dict[bool, Any] = {}
        self._coordinate_ring_cache: dict[bool, Any] = {}
        self._kind = "PROJECTIVE_SUBSCHEME"
        self._construction = {
            "kind": "projective_subscheme",
            "ambient": ambient,
            "base_field": ambient.base_ring(),
            "ideal": ideal,
        }

    def ambient_space(self) -> ProjectiveSpaceParent:
        return self._ambient

    def base_ring(self) -> Any:
        return self._ambient.base_ring()

    base_field = base_ring

    def defining_polynomials(self) -> Any:
        return self._equations

    def submitted_ideal(self) -> Any:
        return self._submitted_ideal

    def defining_ideal(self, proof: Any = None) -> Any:
        resolved = _resolve_scheme_proof(proof)
        if resolved not in self._saturated_ideals:
            self._saturated_ideals[resolved] = self._submitted_ideal.saturation(
                self._ambient.irrelevant_ideal(), proof=resolved
            )
        return self._saturated_ideals[resolved]

    ideal = defining_ideal

    def coordinate_ring(self, proof: Any = None) -> Any:
        resolved = _resolve_scheme_proof(proof)
        if resolved not in self._coordinate_ring_cache:
            self._coordinate_ring_cache[resolved] = self.defining_ideal(
                resolved
            ).quotient_ring(proof=resolved)
        return self._coordinate_ring_cache[resolved]

    def is_empty(self, proof: Any = None) -> bool:
        return self.defining_ideal(proof).is_one(proof=proof)

    def dimension(self, proof: Any = None) -> int:
        if self.is_empty(proof):
            return -1
        return self.defining_ideal(proof).dimension(proof=proof) - 1

    dim = dimension

    def codimension(self, proof: Any = None) -> int:
        dimension = self.dimension(proof)
        if dimension < 0:
            return self._ambient.dimension() + 1
        return self._ambient.dimension() - dimension

    def degree(self, proof: Any = None) -> int:
        if self.is_empty(proof):
            return 0
        return self.defining_ideal(proof).degree(proof=proof)

    def hilbert_series(self, variable: str = "t", proof: Any = None) -> Any:
        return self.defining_ideal(proof).hilbert_series(variable, proof=proof)

    def hilbert_polynomial(self, variable: str = "t", proof: Any = None) -> Any:
        return self.defining_ideal(proof).hilbert_polynomial(variable, proof=proof)

    def _contains_coordinates(self, coordinates: Any) -> bool:
        return all(equation(*coordinates) == 0 for equation in self._equations)

    def __contains__(self, value: object) -> bool:
        if not isinstance(value, ProjectivePoint):
            return False
        if value.ambient_space() is not self._ambient:
            return False
        return self._contains_coordinates(value.coordinates())

    def __call__(self, *coordinates: Any) -> ProjectivePoint:
        if len(coordinates) == 1 and isinstance(coordinates[0], ProjectivePoint):
            point = coordinates[0]
            if point.ambient_space() is not self._ambient:
                raise TypeError("the projective point has a different ambient space")
            return ProjectivePoint(self, point.coordinates())
        values = _coordinate_values(
            coordinates, self._ambient.dimension() + 1, "a projective point"
        )
        return ProjectivePoint(self, values)

    point = __call__

    def _require_same_ambient(self, other: Any) -> ProjectiveSubscheme:
        if (
            not isinstance(other, ProjectiveSubscheme)
            or other._ambient is not self._ambient
        ):
            raise TypeError("projective subschemes must have the same ambient space")
        return other

    def is_subscheme(self, other: Any, proof: Any = None) -> bool:
        other = self._require_same_ambient(other)
        return other.defining_ideal(proof).is_subset(
            self.defining_ideal(proof), proof=proof
        )

    def is_equal(self, other: Any, proof: Any = None) -> bool:
        other = self._require_same_ambient(other)
        return self.defining_ideal(proof).is_equal(
            other.defining_ideal(proof), proof=proof
        )

    def __eq__(self, other: object) -> bool:
        if (
            not isinstance(other, ProjectiveSubscheme)
            or other._ambient is not self._ambient
        ):
            return False
        return self.is_equal(other)

    def __le__(self, other: Any) -> bool:
        return self.is_subscheme(other)

    def intersection(self, other: Any, proof: Any = None) -> ProjectiveSubscheme:
        other = self._require_same_ambient(other)
        return ProjectiveSubscheme(
            self._ambient,
            self.defining_ideal(proof) + other.defining_ideal(proof),
        )

    __mul__ = intersection

    def union(self, other: Any, proof: Any = None) -> ProjectiveSubscheme:
        other = self._require_same_ambient(other)
        ideal = self.defining_ideal(proof).intersection(
            other.defining_ideal(proof), proof=proof
        )
        return ProjectiveSubscheme(self._ambient, ideal)

    __add__ = union

    def affine_patch(self, index: int = 0, proof: Any = None) -> AffineSubscheme:
        affine = self._ambient.affine_patch(index, proof)
        variable = self._ambient.coordinate_ring().gen(index)
        equations = [
            equation.dehomogenize(variable, affine.coordinate_ring())
            for equation in self.defining_ideal(proof).gens()
        ]
        return affine.subscheme(equations)

    def rational_points(self, max_points: int = 100000) -> list[ProjectivePoint]:
        answer = []
        for point in self._ambient.rational_points(max_points=max_points):
            if point in self:
                answer.append(self(point))
        return answer

    points = rational_points

    def hom(self, coordinates: Any, codomain: Any) -> Any:
        return _scheme_morphism_module().SchemeMorphism(self, codomain, coordinates)

    def jacobian_matrix(self, proof: Any = None) -> Any:
        return _scheme_jacobian_module().jacobian_matrix(self, proof)

    jacobian = jacobian_matrix

    def tangent_space(self, point: Any, proof: Any = None) -> Any:
        return _scheme_jacobian_module().tangent_space(self, point, proof)

    def is_smooth(self, point: Any = None, proof: Any = None) -> bool:
        return _scheme_jacobian_module().is_smooth(self, point, proof)

    def singular_subscheme(self, proof: Any = None) -> Any:
        return _scheme_jacobian_module().singular_subscheme(self, proof)

    def __repr__(self) -> str:
        lines = ["Closed subscheme of " + str(self._ambient) + " defined by:"]
        if len(self._equations) == 0:
            lines.append("  0")
        else:
            for index, equation in enumerate(self._equations):
                suffix = "," if index + 1 < len(self._equations) else ""
                lines.append("  " + repr(equation) + suffix)
        return "\n".join(lines)

    __str__ = __repr__
    toString = __repr__


def ProjectiveSpace(
    first: Any,
    second: Any,
    names: Any = "x",
) -> ProjectiveSpaceParent:
    """Construct projective space in either Sage-compatible argument order.

    ```sage
    sage: P = ProjectiveSpace(QQ, 2, names=("x", "y", "z"))
    sage: P(2, 4, 6) == P(1, 2, 3)
    True
    ```
    """
    base, dimension = _construction_arguments(first, second, "projective-space")
    ring = sage.PolynomialRing(base, dimension + 1, names=names, order="degrevlex")
    coordinate_names = ring.variable_names()
    key = _space_cache_key(base, dimension, coordinate_names)
    cached = _cached_space(_projective_space_cache, key)
    if cached is not runtime.undefined:
        return cached
    answer = ProjectiveSpaceParent(dimension, base, coordinate_names)
    _cache_space(_projective_space_cache, key, answer)
    return answer


def _resolve_scheme_proof(value: Any) -> bool:
    proof_module = __import__(
        "sagejs._baselib.proof", fromlist=["resolve_polynomial_proof"]
    )
    return bool(proof_module.resolve_polynomial_proof(value))


@runtime.callable_instance_class
class AffinePlaneCurve(AffineSubscheme):
    """An affine plane hypersurface with curve conveniences."""

    def __init__(self, polynomial: Any) -> None:
        ring = polynomial.parent()
        if ring.ngens() != 2:
            raise ValueError(
                "an affine plane curve needs a polynomial in two variables"
            )
        if polynomial.total_degree() <= 0:
            raise ValueError("a plane curve needs a nonconstant defining polynomial")
        ambient = AffineSpace(ring.base_ring(), 2, names=ring.variable_names())
        self._polynomial = ambient.coordinate_ring()(polynomial)
        AffineSubscheme.__init__(self, ambient, [self._polynomial])

    def defining_polynomial(self) -> Any:
        return self._polynomial

    def degree(self, proof: Any = None) -> int:
        return self._polynomial.total_degree()

    def __add__(self, other: object) -> AffinePlaneCurve:
        if not isinstance(other, AffinePlaneCurve):
            raise TypeError("curves can only be added to curves")
        if self._ambient is not other._ambient:
            raise TypeError("curves have different ambient spaces")
        return AffinePlaneCurve(self._polynomial * other._polynomial)

    def intersection(self, other: Any) -> AffineSubscheme:
        if not isinstance(other, AffinePlaneCurve):
            raise TypeError("curve intersection needs another curve")
        if self._ambient is not other._ambient:
            raise TypeError("curves have different ambient spaces")
        return AffineSubscheme(self._ambient, [self._polynomial, other._polynomial])

    def irreducible_components(self, proof: Any = None) -> list[AffineSubscheme]:
        factors = self._polynomial.irreducible_factors()
        ordered = []
        for factor_value in factors:
            insert_at = len(ordered)
            for index in range(len(ordered)):
                if factor_value.total_degree() < ordered[index].total_degree() or (
                    factor_value.total_degree() == ordered[index].total_degree()
                    and repr(factor_value) < repr(ordered[index])
                ):
                    insert_at = index
                    break
            ordered.insert(insert_at, factor_value)
        return [AffineSubscheme(self._ambient, [factor]) for factor in ordered]

    def projective_closure(
        self, name: str = "h", proof: Any = None
    ) -> ProjectivePlaneCurve:
        closure = _scheme_projective_module().projective_closure(self, name, proof)
        basis = list(closure.defining_ideal(proof).groebner_basis(proof=proof))
        if len(basis) != 1:
            raise ArithmeticError("plane-curve closure did not remain a hypersurface")
        return ProjectivePlaneCurve(basis[0])

    def tangent_line(self, point: Any, proof: Any = None) -> Any:
        if not self.is_smooth(point, proof):
            raise ValueError("a tangent line requires a smooth rational point")
        ring = self._ambient.coordinate_ring()
        coordinates = point.coordinates()
        gradient = self._polynomial.gradient()
        equation = ring(0)
        for index, variable in enumerate(ring.gens()):
            slope = gradient[index](*coordinates)
            equation += slope * (variable - coordinates[index])
        return AffineSubscheme(self._ambient, [equation])

    def singular_points(
        self, max_points: int = 100000, proof: Any = None
    ) -> list[AffinePoint]:
        return self.singular_subscheme(proof).rational_points(max_points)

    def arithmetic_genus(self) -> int:
        raise NotImplementedError(
            "arithmetic_genus is defined here for projective plane curves; "
            "take projective_closure() first"
        )

    def geometric_genus(self) -> Any:
        raise NotImplementedError(
            "geometric genus of singular curves requires normalization and is "
            "outside the current no-Singular capability; see "
            "docs/algebraic-geometry.md"
        )

    def __repr__(self) -> str:
        return (
            "Affine Plane Curve over "
            + str(self.base_ring())
            + " defined by\n   "
            + repr(self._polynomial)
        )

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class ProjectivePlaneCurve(ProjectiveSubscheme):
    """A projective plane hypersurface with exact curve conveniences."""

    def __init__(self, polynomial: Any) -> None:
        ring = polynomial.parent()
        if ring.ngens() != 3:
            raise ValueError(
                "a projective plane curve needs a polynomial in three variables"
            )
        if not polynomial.is_homogeneous():
            raise ValueError("a projective plane curve polynomial must be homogeneous")
        if polynomial.total_degree() <= 0:
            raise ValueError("a plane curve needs a nonconstant defining polynomial")
        ambient = ProjectiveSpace(ring.base_ring(), 2, names=ring.variable_names())
        self._polynomial = ambient.coordinate_ring()(polynomial)
        ProjectiveSubscheme.__init__(self, ambient, [self._polynomial])

    def defining_polynomial(self) -> Any:
        return self._polynomial

    def degree(self, proof: Any = None) -> int:
        return self._polynomial.total_degree()

    def arithmetic_genus(self) -> int:
        degree = self.degree()
        return (degree - 1) * (degree - 2) // 2

    def projective_closure(
        self, name: str = "h", proof: Any = None
    ) -> ProjectivePlaneCurve:
        return self

    def affine_patch(self, index: int = 0, proof: Any = None) -> AffineSubscheme:
        affine = ProjectiveSubscheme.affine_patch(self, index, proof)
        if affine.is_empty(proof=proof):
            return affine
        basis = list(affine.defining_ideal().groebner_basis(proof=proof))
        if len(basis) != 1:
            raise ArithmeticError("plane-curve patch did not remain a hypersurface")
        return AffinePlaneCurve(basis[0])

    def tangent_line(self, point: Any, proof: Any = None) -> Any:
        if not self.is_smooth(point, proof):
            raise ValueError("a tangent line requires a smooth rational point")
        return self.tangent_space(point, proof).linear_subscheme()

    def singular_points(
        self, max_points: int = 100000, proof: Any = None
    ) -> list[ProjectivePoint]:
        return self.singular_subscheme(proof).rational_points(max_points)

    def geometric_genus(self) -> Any:
        raise NotImplementedError(
            "geometric genus of singular curves requires normalization and is "
            "outside the current no-Singular capability; see "
            "docs/algebraic-geometry.md"
        )

    def __add__(self, other: object) -> ProjectivePlaneCurve:
        if not isinstance(other, ProjectivePlaneCurve):
            raise TypeError("curves can only be added to curves")
        if self._ambient is not other._ambient:
            raise TypeError("curves have different ambient spaces")
        return ProjectivePlaneCurve(self._polynomial * other._polynomial)

    def __repr__(self) -> str:
        return (
            "Projective Plane Curve over "
            + str(self.base_ring())
            + " defined by\n   "
            + repr(self._polynomial)
        )

    __str__ = __repr__
    toString = __repr__


def Curve(polynomial: Any) -> Any:
    """Construct an affine or projective plane curve from one polynomial.

    ```sage
    sage: R = PolynomialRing(QQ, names=("x", "y"))
    sage: x, y = R.gens()
    sage: C = Curve(y^2 - x^3)
    sage: C.degree()
    3
    ```
    """
    if not hasattr(polynomial, "parent"):
        raise TypeError("Curve needs a multivariate polynomial")
    variables = polynomial.parent().ngens()
    if variables == 2:
        return AffinePlaneCurve(polynomial)
    if variables == 3 and polynomial.is_homogeneous():
        return ProjectivePlaneCurve(polynomial)
    raise ValueError(
        "Curve currently supports affine two-variable or homogeneous "
        "projective three-variable polynomials"
    )


# Filled by the morphism phase. Keeping the import at the public boundary
# avoids a dependency from bootstrap-safe scheme objects into lazy algorithms.
_scheme_morphism_module_cache = runtime.undefined
_scheme_projective_module_cache = runtime.undefined
_scheme_jacobian_module_cache = runtime.undefined


def _scheme_morphism_module() -> Any:
    global _scheme_morphism_module_cache
    if _scheme_morphism_module_cache is runtime.undefined:
        _scheme_morphism_module_cache = __import__(
            "sagejs.schemes.morphism", fromlist=["SchemeMorphism"]
        )
    return _scheme_morphism_module_cache


def _scheme_projective_module() -> Any:
    global _scheme_projective_module_cache
    if _scheme_projective_module_cache is runtime.undefined:
        _scheme_projective_module_cache = __import__(
            "sagejs.schemes.projective", fromlist=["projective_closure"]
        )
    return _scheme_projective_module_cache


def _scheme_jacobian_module() -> Any:
    global _scheme_jacobian_module_cache
    if _scheme_jacobian_module_cache is runtime.undefined:
        _scheme_jacobian_module_cache = __import__(
            "sagejs.schemes.jacobian", fromlist=["jacobian_matrix"]
        )
    return _scheme_jacobian_module_cache


for _geometry_name, _geometry_value in [
    ("AffineSpace", AffineSpace),
    ("ProjectiveSpace", ProjectiveSpace),
    ("Curve", Curve),
]:
    runtime.register_doc(
        _geometry_name,
        _geometry_value,
        {
            "kind": "function",
            "module": "sage.schemes",
            "tags": [
                "algebraic geometry",
                "affine schemes",
                "projective schemes",
                "curves",
            ],
            "backends": ["Sage.js exact polynomial and ideal layers"],
            "sage_compatibility": {
                "status": "partial",
                "notes": (
                    "Exact embedded affine/projective geometry over QQ and "
                    "prime GF(p), without a Singular runtime dependency. See "
                    "docs/algebraic-geometry.md for the capability boundary."
                ),
            },
            "provenance": [
                {
                    "kind": "sage-derived",
                    "source": "SageMath schemes public API",
                    "url": ("https://doc.sagemath.org/html/en/reference/schemes/"),
                    "license": "GPL-2.0-or-later",
                },
                {
                    "kind": "sagejs-original",
                    "source": "Sage.js no-Singular algebraic geometry",
                    "url": (
                        "https://github.com/sagemathinc/sagejs/blob/main/"
                        "docs/algebraic-geometry.md"
                    ),
                    "license": "GPL-3.0-only",
                },
            ],
        },
    )
