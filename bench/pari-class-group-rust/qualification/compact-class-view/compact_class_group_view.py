"""Qualification-only exact class view for a compact relation certificate.

This module deliberately stops short of constructing Sage.js public class
groups.  It records exactly which class-map operations follow from the compact
row-6 certificate and which operation still needs material from Rust.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import gcd, prod
from typing import Iterable, Sequence


SparseVector = tuple[tuple[int, int], ...]


class CompactClassViewError(ValueError):
    """Base error for malformed compact class-map evidence."""


class NonPrincipalFactorRowError(CompactClassViewError):
    """The exact class map proves that a factor-base row is nonprincipal."""


class MissingPrincipalRelationLiftError(CompactClassViewError):
    """A principal row has no certified lift to relation coefficients.

    The missing certificate is a sparse vector `c` indexed by relation rows
    such that `c * R == target`, where `R` is the authenticated sparse relation
    matrix.  A Rust per-query relation-lift oracle may return this vector; it
    needs no trust because `RelationCombinationWitness.verify` replays it.
    """


class MissingIdealReductionCertificateError(CompactClassViewError):
    """An arbitrary ideal has not been reduced to the authenticated factor base."""


def _integer(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise CompactClassViewError(label + " must be an integer")
    return value


def _sparse(
    values: Iterable[tuple[object, object]], width: int, label: str
) -> SparseVector:
    answer: list[tuple[int, int]] = []
    previous = -1
    for raw_index, raw_value in values:
        index = _integer(raw_index, label + " index")
        value = _integer(raw_value, label + " coefficient")
        if index <= previous or index < 0 or index >= width:
            raise CompactClassViewError(
                label + " indices must be strictly increasing and in range"
            )
        if value == 0:
            raise CompactClassViewError(label + " contains a zero coefficient")
        answer.append((index, value))
        previous = index
    return tuple(answer)


def _dense(values: SparseVector, width: int) -> tuple[int, ...]:
    answer = [0] * width
    for index, value in values:
        answer[index] = value
    return tuple(answer)


def _add_scaled(target: list[int], row: SparseVector, scale: int) -> None:
    for index, value in row:
        target[index] += scale * value


@dataclass(frozen=True)
class RelationCombinationWitness:
    """An exact, independently replayable lift to sparse relation rows."""

    target: tuple[int, ...]
    relation_coefficients: SparseVector

    def verify(self, relation_rows: Sequence[SparseVector]) -> bool:
        try:
            replay = [0] * len(self.target)
            for row_index, coefficient in self.relation_coefficients:
                if row_index < 0 or row_index >= len(relation_rows):
                    return False
                _add_scaled(replay, relation_rows[row_index], coefficient)
            return tuple(replay) == self.target
        except (IndexError, TypeError, ValueError):
            return False

    def factored_generator(
        self, relation_generators: Sequence[object]
    ) -> tuple[tuple[object, int], ...]:
        """Return the exact formal product of authenticated relation generators.

        The result represents `product(alpha_i ** c_i)`.  Keeping it factored
        avoids unnecessary coefficient growth; the ordinary Sage.js factored
        element machinery can materialize it when an actual ideal witness is
        required.
        """
        if len(relation_generators) == 0 and self.relation_coefficients:
            raise CompactClassViewError("relation generators are missing")
        answer: list[tuple[object, int]] = []
        for row_index, coefficient in self.relation_coefficients:
            if row_index < 0 or row_index >= len(relation_generators):
                raise CompactClassViewError(
                    "a relation generator index is out of range"
                )
            answer.append((relation_generators[row_index], coefficient))
        return tuple(answer)


class CompactExactClassGroupView:
    """Exact finite class-map view backed by authenticated sparse evidence.

    `relation_rows` are rows of the factor-base relation matrix.  Each
    `class_map_rows[j]` is the invariant-coordinate image of factor-base
    generator `j`.  Generator lifts are sparse factor-base rows mapping to the
    standard coordinate basis.  Dependencies are sparse coefficient vectors
    among relation rows; they prove unit/kernel facts but are intentionally not
    mistaken for lifts of arbitrary principal factor-base rows.
    """

    def __init__(
        self,
        *,
        invariants: Sequence[int],
        class_map_rows: Sequence[Sequence[int]],
        relation_rows: Sequence[Iterable[tuple[int, int]]],
        generator_lifts: Sequence[Iterable[tuple[int, int]]],
        generator_order_combinations: Sequence[Iterable[tuple[int, int]]],
        dependencies: Sequence[Iterable[tuple[int, int]]] = (),
    ) -> None:
        self.invariants = tuple(
            _integer(value, "invariant factor") for value in invariants
        )
        previous = 1
        for value in self.invariants:
            if value <= 1 or value % previous:
                raise CompactClassViewError(
                    "invariant factors must exceed one and divide successively"
                )
            previous = value
        self.factor_base_size = len(class_map_rows)
        if self.factor_base_size == 0:
            raise CompactClassViewError("the factor base must be nonempty")
        self.class_map_rows = tuple(
            tuple(_integer(value, "class-map residue") for value in row)
            for row in class_map_rows
        )
        for row in self.class_map_rows:
            if len(row) != len(self.invariants):
                raise CompactClassViewError("a class-map row has the wrong width")
            if any(
                value < 0 or value >= modulus
                for value, modulus in zip(row, self.invariants, strict=True)
            ):
                raise CompactClassViewError("class-map residues are not canonical")
        self.relation_rows = tuple(
            _sparse(row, self.factor_base_size, "relation row") for row in relation_rows
        )
        self.generator_lifts = tuple(
            _sparse(row, self.factor_base_size, "generator lift")
            for row in generator_lifts
        )
        self.generator_order_combinations = tuple(
            _sparse(row, len(self.relation_rows), "generator-order combination")
            for row in generator_order_combinations
        )
        self.dependencies = tuple(
            _sparse(row, len(self.relation_rows), "relation dependency")
            for row in dependencies
        )
        if len(self.generator_lifts) != len(self.invariants) or len(
            self.generator_order_combinations
        ) != len(self.invariants):
            raise CompactClassViewError(
                "each invariant needs one standard lift and order witness"
            )
        if not self.verify():
            raise CompactClassViewError("compact exact class view did not replay")

    def order(self) -> int:
        return prod(self.invariants)

    cardinality = order

    def factor_base_coordinates(self, index: int) -> tuple[int, ...]:
        position = _integer(index, "factor-base index")
        if position < 0 or position >= self.factor_base_size:
            raise IndexError("factor-base index out of range")
        return self.class_map_rows[position]

    def coordinates(self, factor_exponents: Sequence[int]) -> tuple[int, ...]:
        if len(factor_exponents) != self.factor_base_size:
            raise CompactClassViewError("factor-base row has the wrong width")
        answer = [0] * len(self.invariants)
        for exponent, image in zip(factor_exponents, self.class_map_rows, strict=True):
            coefficient = _integer(exponent, "factor-base exponent")
            for coordinate, (residue, modulus) in enumerate(
                zip(image, self.invariants, strict=True)
            ):
                answer[coordinate] = (
                    answer[coordinate] + coefficient * residue
                ) % modulus
        return tuple(answer)

    def lift_coordinates(self, coordinates: Sequence[int]) -> tuple[int, ...]:
        if len(coordinates) != len(self.invariants):
            raise CompactClassViewError("class coordinates have the wrong width")
        answer = [0] * self.factor_base_size
        for raw_value, modulus, lift in zip(
            coordinates, self.invariants, self.generator_lifts, strict=True
        ):
            value = _integer(raw_value, "class coordinate") % modulus
            _add_scaled(answer, lift, value)
        return tuple(answer)

    def generator_order(self, index: int) -> int:
        position = _integer(index, "generator index")
        if position < 0 or position >= len(self.invariants):
            raise IndexError("generator index out of range")
        return self.invariants[position]

    def is_principal(self, factor_exponents: Sequence[int]) -> bool:
        return not any(self.coordinates(factor_exponents))

    def witness_from_relation_combination(
        self, coefficients: Iterable[tuple[int, int]]
    ) -> RelationCombinationWitness:
        checked = _sparse(coefficients, len(self.relation_rows), "relation combination")
        target = [0] * self.factor_base_size
        for row_index, coefficient in checked:
            _add_scaled(target, self.relation_rows[row_index], coefficient)
        witness = RelationCombinationWitness(tuple(target), checked)
        if not witness.verify(self.relation_rows):
            raise ArithmeticError("relation combination failed exact replay")
        return witness

    def principal_witness(
        self,
        factor_exponents: Sequence[int],
        *,
        certified_relation_coefficients: Iterable[tuple[int, int]] | None = None,
    ) -> RelationCombinationWitness:
        target = tuple(
            _integer(value, "factor-base exponent") for value in factor_exponents
        )
        if len(target) != self.factor_base_size:
            raise CompactClassViewError("factor-base row has the wrong width")
        if any(self.coordinates(target)):
            raise NonPrincipalFactorRowError(
                "the exact compact class map proves this row nonprincipal"
            )
        if not any(target):
            return RelationCombinationWitness(target, ())
        if certified_relation_coefficients is not None:
            witness = self.witness_from_relation_combination(
                certified_relation_coefficients
            )
            if witness.target != target:
                raise CompactClassViewError(
                    "the certified relation lift does not replay to the target row"
                )
            return witness

        # The certificate already contains these exact combinations.  Retain
        # them as useful fast paths without pretending they solve the general
        # integer preimage problem.
        for coordinate, (modulus, lift, combination) in enumerate(
            zip(
                self.invariants,
                self.generator_lifts,
                self.generator_order_combinations,
                strict=True,
            )
        ):
            expected = [0] * self.factor_base_size
            _add_scaled(expected, lift, modulus)
            if tuple(expected) == target:
                return RelationCombinationWitness(target, combination)
        for row_index, relation in enumerate(self.relation_rows):
            dense_relation = _dense(relation, self.factor_base_size)
            scale: int | None = None
            matches = True
            for actual, base in zip(target, dense_relation, strict=True):
                if base == 0:
                    if actual != 0:
                        matches = False
                        break
                    continue
                if actual % base:
                    matches = False
                    break
                quotient = actual // base
                if scale is None:
                    scale = quotient
                elif scale != quotient:
                    matches = False
                    break
            if matches and scale not in (None, 0):
                return RelationCombinationWitness(target, ((row_index, scale),))

        raise MissingPrincipalRelationLiftError(
            "the row is provably principal, but the compact certificate has no "
            "right-inverse witness; Rust must return sparse relation coefficients "
            "c with c * R equal to this target"
        )

    def verify(self) -> bool:
        zero = (0,) * len(self.invariants)
        for relation in self.relation_rows:
            if self.coordinates(_dense(relation, self.factor_base_size)) != zero:
                return False
        for index, lift in enumerate(self.generator_lifts):
            expected = tuple(
                1 if coordinate == index else 0
                for coordinate in range(len(self.invariants))
            )
            if self.coordinates(_dense(lift, self.factor_base_size)) != expected:
                return False
        for index, (modulus, lift, combination) in enumerate(
            zip(
                self.invariants,
                self.generator_lifts,
                self.generator_order_combinations,
                strict=True,
            )
        ):
            target = [0] * self.factor_base_size
            _add_scaled(target, lift, modulus)
            witness = RelationCombinationWitness(tuple(target), combination)
            if not witness.verify(self.relation_rows):
                return False
            # Standard basis image has exact additive order `modulus`.
            image = self.coordinates(_dense(lift, self.factor_base_size))
            actual_order = 1
            for value, component_modulus in zip(image, self.invariants, strict=True):
                component_order = component_modulus // gcd(component_modulus, value)
                actual_order = (
                    actual_order * component_order // gcd(actual_order, component_order)
                )
            if actual_order != modulus or index >= len(image):
                return False
        for dependency in self.dependencies:
            witness = RelationCombinationWitness(
                (0,) * self.factor_base_size, dependency
            )
            if not witness.verify(self.relation_rows):
                return False
        return True
