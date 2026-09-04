"""Exact polynomial morphisms and elimination geometry."""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_MAX_GRAPH_VARIABLES = 32
_MAX_GRAPH_EQUATIONS = 256


def _is_projective(value: Any) -> bool:
    return hasattr(value.ambient_space(), "irrelevant_ideal")


def _translate(polynomial: Any, target: Any, offset: int, width: int) -> Any:
    terms = []
    for coefficient, source_exponents in polynomial.terms():
        exponents = [0] * target.ngens()
        for index in range(width):
            exponents[offset + index] = source_exponents[index]
        terms.append((coefficient, tuple(exponents)))
    return target._from_sparse_terms(terms)


def _fresh_block(existing: list[str], source: Any, prefix: str) -> list[str]:
    answer = []
    for name in source.variable_names():
        candidate = prefix + str(name)
        index = 0
        while candidate in existing or candidate in answer:
            index += 1
            candidate = prefix + str(name) + str(index)
        answer.append(candidate)
    return answer


def _pullback(polynomial: Any, coordinates: Any) -> Any:
    names = polynomial.parent().variable_names()
    return polynomial.subs(
        {names[index]: coordinates[index] for index in range(len(names))}
    )


def _point_subscheme(point: Any) -> Any:
    parent = point.parent()
    ambient = parent.ambient_space()
    ring = ambient.coordinate_ring()
    variables = ring.gens()
    coordinates = point.coordinates()
    if _is_projective(parent):
        equations = []
        for left in range(len(variables)):
            for right in range(left + 1, len(variables)):
                equations.append(
                    variables[left] * coordinates[right]
                    - variables[right] * coordinates[left]
                )
        return ambient.subscheme(equations)
    return ambient.subscheme(
        [variables[index] - coordinates[index] for index in range(len(variables))]
    )


@runtime.callable_instance_class
class SchemeGraph:
    """An inspectable affine or biprojective graph elimination presentation."""

    def __init__(
        self,
        morphism: SchemeMorphism,
        ring: Any,
        ideal: Any,
        source_variables: int,
    ) -> None:
        self._morphism = morphism
        self._ring = ring
        self._ideal = ideal
        self._source_variables = source_variables

    def morphism(self) -> SchemeMorphism:
        return self._morphism

    def coordinate_ring(self) -> Any:
        return self._ring

    def defining_ideal(self) -> Any:
        return self._ideal

    ideal = defining_ideal

    def source_variable_count(self) -> int:
        return self._source_variables

    def __repr__(self) -> str:
        return "Graph of " + repr(self._morphism)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class SchemeMorphism:
    """A validated polynomial morphism between supported closed schemes."""

    def __init__(self, source: Any, target: Any, coordinates: Any) -> None:
        if source.base_ring() is not target.base_ring():
            raise TypeError("a scheme morphism needs the same base field on both sides")
        self._source = source
        self._target = target
        source_ring = source.ambient_space().coordinate_ring()
        if not isinstance(coordinates, (list, tuple)):
            raise TypeError("morphism coordinates must be a list or tuple")
        expected = target.ambient_space().coordinate_ring().ngens()
        if len(coordinates) != expected:
            raise ValueError(
                "morphism needs "
                + str(expected)
                + " target coordinates, not "
                + str(len(coordinates))
            )
        self._coordinates = runtime.math_tuple(
            [source_ring(value) for value in coordinates]
        )
        if _is_projective(self._source) and not _is_projective(self._target):
            if any(coordinate.total_degree() > 0 for coordinate in self._coordinates):
                raise NotImplementedError(
                    "nonconstant morphisms from projective to affine schemes "
                    "require a regular-function presentation"
                )
        self._validate_projective_coordinates()
        self._validate_codomain()

    def domain(self) -> Any:
        return self._source

    source = domain

    def codomain(self) -> Any:
        return self._target

    target = codomain

    def coordinate_polynomials(self) -> Any:
        return self._coordinates

    defining_polynomials = coordinate_polynomials

    def _validate_projective_coordinates(self) -> None:
        if not _is_projective(self._target):
            return
        if not _is_projective(self._source):
            source_ideal = self._source.defining_ideal()
            if not (
                source_ideal + source_ideal.ring().ideal(self._coordinates)
            ).is_one():
                raise ValueError("projective coordinate tuple has a base point")
            return
        degrees = []
        for coordinate in self._coordinates:
            if coordinate != coordinate.parent()(0):
                if not coordinate.is_homogeneous():
                    raise ValueError(
                        "projective morphism coordinates must be homogeneous"
                    )
                degrees.append(coordinate.total_degree())
        if not degrees:
            raise ValueError("projective morphism coordinates cannot all be zero")
        if any(degree != degrees[0] for degree in degrees):
            raise ValueError(
                "projective morphism coordinates must have the same degree"
            )
        source_ambient = self._source.ambient_space()
        base_ideal = (
            self._source.defining_ideal()
            + source_ambient.coordinate_ring().ideal(self._coordinates)
        )
        if _is_projective(self._source):
            base_locus = source_ambient.subscheme(base_ideal)
            if not base_locus.is_empty():
                raise ValueError("projective coordinate tuple has a base point")

    def _validate_codomain(self) -> None:
        source_ideal = self._source.defining_ideal()
        for equation in self._target.defining_ideal().gens():
            pulled = _pullback(equation, self._coordinates)
            if source_ideal.normal_form(pulled) != source_ideal.ring()(0):
                raise ValueError(
                    "morphism coordinates do not satisfy the codomain equations"
                )

    def __call__(self, point: Any) -> Any:
        if point not in self._source:
            raise TypeError("the point is not on the morphism domain")
        values = [polynomial(*point.coordinates()) for polynomial in self._coordinates]
        return self._target(*values)

    def compose(self, other: SchemeMorphism) -> SchemeMorphism:
        """Return `self` after `other`."""
        if not isinstance(other, SchemeMorphism) or other._target is not self._source:
            raise TypeError("morphism composition has incompatible source and target")
        coordinates = [
            _pullback(polynomial, other._coordinates)
            for polynomial in self._coordinates
        ]
        return SchemeMorphism(other._source, self._target, coordinates)

    def is_equal(self, other: Any) -> bool:
        if (
            not isinstance(other, SchemeMorphism)
            or other._source is not self._source
            or other._target is not self._target
        ):
            return False
        ideal = self._source.defining_ideal()
        if _is_projective(self._target):
            for left in range(len(self._coordinates)):
                for right in range(left + 1, len(self._coordinates)):
                    difference = (
                        self._coordinates[left] * other._coordinates[right]
                        - self._coordinates[right] * other._coordinates[left]
                    )
                    if ideal.normal_form(difference) != ideal.ring()(0):
                        return False
            return True
        for index in range(len(self._coordinates)):
            if ideal.normal_form(
                self._coordinates[index] - other._coordinates[index]
            ) != ideal.ring()(0):
                return False
        return True

    def __eq__(self, other: object) -> bool:
        return self.is_equal(other)

    def _graph_presentation(self, proof: Any = None) -> SchemeGraph:
        source_ambient = self._source.ambient_space()
        target_ambient = self._target.ambient_space()
        source_ring = source_ambient.coordinate_ring()
        target_ring = target_ambient.coordinate_ring()
        source_names = _fresh_block([], source_ring, "source_")
        target_names = _fresh_block(source_names, target_ring, "target_")
        variable_count = len(source_names) + len(target_names)
        if variable_count > _MAX_GRAPH_VARIABLES:
            raise OverflowError("morphism graph exceeds the 32-variable limit")
        ring = sage.PolynomialRing(
            self._source.base_ring(),
            variable_count,
            names=source_names + target_names,
            order="lex",
        )
        source_variables = ring.gens()[: len(source_names)]
        target_variables = ring.gens()[len(source_names) :]
        equations = [
            _translate(equation, ring, 0, source_ring.ngens())
            for equation in self._source.defining_ideal(proof).gens()
        ]
        translated_coordinates = [
            _translate(value, ring, 0, source_ring.ngens())
            for value in self._coordinates
        ]
        if _is_projective(self._target):
            for left in range(len(target_variables)):
                for right in range(left + 1, len(target_variables)):
                    equations.append(
                        target_variables[left] * translated_coordinates[right]
                        - target_variables[right] * translated_coordinates[left]
                    )
        else:
            for index in range(len(target_variables)):
                equations.append(
                    target_variables[index] - translated_coordinates[index]
                )
        if len(equations) > _MAX_GRAPH_EQUATIONS:
            raise OverflowError("morphism graph exceeds the 256-equation limit")
        ideal = ring.ideal(equations)
        if _is_projective(self._source):
            ideal = ideal.saturation(ring.ideal(source_variables), proof=proof)
        return SchemeGraph(self, ring, ideal, len(source_names))

    def graph(self, proof: Any = None) -> SchemeGraph:
        return self._graph_presentation(proof)

    def inverse_image(self, subscheme: Any, proof: Any = None) -> Any:
        if subscheme.ambient_space() is not self._target.ambient_space():
            raise TypeError("inverse-image scheme is not in the morphism codomain")
        equations = list(self._source.defining_ideal(proof).gens())
        equations.extend(
            _pullback(equation, self._coordinates)
            for equation in subscheme.defining_ideal(proof).gens()
        )
        return self._source.ambient_space().subscheme(equations)

    preimage = inverse_image

    def fiber(self, point: Any, proof: Any = None) -> Any:
        if point not in self._target:
            raise TypeError("fiber point is not in the morphism codomain")
        return self.inverse_image(_point_subscheme(point), proof)

    def image(self, proof: Any = None) -> Any:
        graph = self._graph_presentation(proof)
        ring = graph.coordinate_ring()
        source_count = graph.source_variable_count()
        eliminated = graph.defining_ideal().elimination_ideal(
            list(ring.gens()[:source_count]), proof=proof
        )
        target_ring = self._target.ambient_space().coordinate_ring()
        equations = []
        for polynomial in eliminated.gens():
            terms = []
            for coefficient, exponents in polynomial.terms():
                if any(exponents[index] for index in range(source_count)):
                    raise ArithmeticError(
                        "image elimination retained a source coordinate"
                    )
                terms.append((coefficient, tuple(exponents[source_count:])))
            equations.append(target_ring._from_sparse_terms(terms))
        equations.extend(self._target.defining_ideal(proof).gens())
        return self._target.ambient_space().subscheme(equations)

    image_closure = image

    def __repr__(self) -> str:
        return (
            "Scheme morphism from "
            + str(self._source)
            + " to "
            + str(self._target)
            + " defined by "
            + repr(self._coordinates)
        )

    __str__ = __repr__
    toString = __repr__
