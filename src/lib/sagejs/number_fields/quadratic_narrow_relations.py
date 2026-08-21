"""Exact narrow class groups from authenticated quadratic relations.

For a real quadratic field, quotient the free group on a proved ordinary
factor base together with one orientation symbol by

```
(valuation_vector(alpha), sign(Norm(alpha)))
```

for every authenticated principal relation.  The orientation symbol has
order two, and disappears exactly when the complete unit group contains a
unit of negative norm.  Smith reduction of this augmented presentation keeps
the extension data that distinguishes, for example, `C4` from `C2 x C2`.

The construction is bounded and never enumerates ideal classes.  Its dynamic
fallback is this same ordinary Python source on every supported platform.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from sagejs.number_fields.class_group_matrix import (
    RelationPresentation,
    extract_relation_presentation,
)
from sagejs.number_fields.class_group_relations import (
    FactoredPrincipalWitness,
    RelationNotSmoothError,
    factor_ideal_over_base,
    reconstruct_factor_base_ideal,
    reduce_ideal_over_base,
)

NARROW_RELATION_SCHEMA = "sagejs.number-fields/quadratic-narrow-relations-v1"


class NarrowRelationResourceLimit(RuntimeError):
    """An explicit narrow-presentation or ideal-map resource cap was exceeded."""


@dataclass(frozen=True)
class NarrowRelationLimits:
    """Deterministic caps for the augmented SNF and inverse ideal map."""

    max_relations: int = 4096
    max_columns: int = 2048
    max_matrix_entries: int = 40_000_000
    max_integer_bits: int = 16_384
    max_list_size: int = 100_000
    max_reduction_candidates: int = 4096

    def __post_init__(self) -> None:
        for name in (
            "max_relations",
            "max_columns",
            "max_matrix_entries",
            "max_integer_bits",
            "max_list_size",
            "max_reduction_candidates",
        ):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int):
                raise TypeError(name + " must be an integer")
            if value < 1:
                raise ValueError(name + " must be positive")

    def to_dict(self) -> dict[str, int]:
        return {
            "max_relations": self.max_relations,
            "max_columns": self.max_columns,
            "max_matrix_entries": self.max_matrix_entries,
            "max_integer_bits": self.max_integer_bits,
            "max_list_size": self.max_list_size,
            "max_reduction_candidates": self.max_reduction_candidates,
        }


def _product(values: Iterable[int]) -> int:
    answer = 1
    for value in values:
        answer *= int(value)
    return answer


def _gcd(left: int, right: int) -> int:
    left, right = abs(left), abs(right)
    while right:
        left, right = right, left % right
    return left


def _lcm(left: int, right: int) -> int:
    return abs(left // _gcd(left, right) * right) if left and right else 0


def _norm_parity(witness: Any) -> int:
    norm = witness.norm()
    if norm == 0:
        raise ArithmeticError("a principal relation has a zero witness")
    return 1 if norm < 0 else 0


def _relation_witness(field: Any, record: Any) -> Any:
    return FactoredPrincipalWitness.from_dict(field, record.witness)


def _orientation_element(field: Any) -> Any:
    coefficients = field.defining_polynomial().list()
    if len(coefficients) != 3 or coefficients[2] != 1:
        raise ValueError("quadratic narrow relations require a monic polynomial")
    beta = 2 * field.gen() + field(coefficients[1])
    if beta.norm() >= 0:
        raise ArithmeticError("the canonical quadratic orientation has wrong norm")
    return beta


def _element_payload(value: Any) -> list[list[int]]:
    answer = []
    for coefficient in value.list():
        rational = coefficient.parent()(coefficient)
        answer.append([int(rational._numerator), int(rational._denominator)])
    return answer


def _matrix_storage_entries(rows: int, columns: int) -> int:
    # Source, HNF, Smith, two left transforms and two right transforms.
    return 3 * rows * columns + 2 * rows * rows + 2 * columns * columns


def _check_integer_bits(value: Any, maximum: int) -> None:
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, bool):
            continue
        if isinstance(item, int):
            if abs(item).bit_length() > maximum:
                raise NarrowRelationResourceLimit(
                    "the narrow presentation exceeds max_integer_bits"
                )
        elif isinstance(item, (list, tuple)):
            stack.extend(item)
        elif isinstance(item, dict):
            stack.extend(item.values())


class NarrowQuadraticRelationCertificate:
    """Live certificate whose payload consists only of exact replay evidence."""

    def __init__(
        self,
        result: Any,
        presentation: RelationPresentation,
        relation_parities: Sequence[int],
        unit_parities: Sequence[int],
        limits: NarrowRelationLimits,
    ) -> None:
        self.result = result
        self.field = result.field
        self.order = self.field.maximal_order()
        self.factor_base = tuple(result.conditional_factor_base)
        self.relations = tuple(result.conditional_relation_records)
        self.ordinary_presentation = result.conditional_presentation_evidence
        self.presentation = presentation
        self.relation_parities = tuple(int(value) for value in relation_parities)
        self.unit_parities = tuple(int(value) for value in unit_parities)
        self.limits = limits
        self.orientation_element = _orientation_element(self.field)

    @property
    def has_negative_norm_unit(self) -> bool:
        return any(self.unit_parities)

    def _expected_rows(self) -> tuple[tuple[int, ...], ...]:
        rows = [
            tuple(int(value) for value in record.row) + (parity,)
            for record, parity in zip(
                self.relations, self.relation_parities, strict=True
            )
        ]
        width = len(self.factor_base)
        rows.append((0,) * width + (2,))
        if self.has_negative_norm_unit:
            rows.append((0,) * width + (1,))
        return tuple(rows)

    def to_dict(self) -> dict[str, Any]:
        ordinary_order = self.ordinary_presentation.order
        narrow_order = self.presentation.order
        if ordinary_order is None or narrow_order is None:
            raise ArithmeticError("a narrow certificate must present a finite group")
        saturation = self.result.saturation_record
        saturation_payload = None
        if saturation is not None:
            encode = getattr(saturation, "to_dict", None)
            if callable(encode):
                saturation_payload = encode()
        return {
            "schema": NARROW_RELATION_SCHEMA,
            "proof_status": self.result.proof_status,
            "ordinary_order": int(ordinary_order),
            "narrow_order": int(narrow_order),
            "orientation_element": _element_payload(self.orientation_element),
            "factor_base": [prime.to_dict() for prime in self.factor_base],
            "relations": [record.to_dict() for record in self.relations],
            "relation_norm_parities": list(self.relation_parities),
            "unit_norm_parities": list(self.unit_parities),
            "saturation": saturation_payload,
            "presentation": self.presentation.to_dict(),
            "limits": self.limits.to_dict(),
        }

    def verify(self) -> bool:
        try:
            if (
                not self.result.complete
                or self.field.degree() != 2
                or tuple(self.field.signature()) != (2, 0)
                or self.ordinary_presentation is None
                or not self.ordinary_presentation.verify()
                or not self.presentation.verify()
            ):
                return False
            if len(self.relations) != len(self.relation_parities):
                return False
            replayed_parities = []
            for record in self.relations:
                if record.verify(self.order, self.factor_base)["certified"] is not True:
                    return False
                replayed_parities.append(
                    _norm_parity(_relation_witness(self.field, record))
                )
            if tuple(replayed_parities) != self.relation_parities:
                return False
            units = tuple(self.result.units())
            if not self.result.unit_group().complete:
                return False
            if tuple(_norm_parity(unit) for unit in units) != self.unit_parities:
                return False
            saturation = self.result.saturation_record
            if saturation is not None:
                encode = getattr(saturation, "to_dict", None)
                if not callable(encode) or not self.result.verify_saturation_record(
                    encode()
                ):
                    return False
            expected_rows = self._expected_rows()
            actual_rows = tuple(
                tuple(row.dense()) for row in self.presentation.relation_rows
            )
            if actual_rows != expected_rows:
                return False
            rebuilt = extract_relation_presentation(
                expected_rows, len(self.factor_base) + 1, require_full_rank=True
            )
            if rebuilt.invariants != self.presentation.invariants:
                return False
            ordinary_presentation_order = self.ordinary_presentation.order
            narrow_presentation_order = self.presentation.order
            if ordinary_presentation_order is None or narrow_presentation_order is None:
                return False
            ordinary_order = int(ordinary_presentation_order)
            expected_order = ordinary_order * (1 if self.has_negative_norm_unit else 2)
            return int(narrow_presentation_order) == expected_order
        except (KeyError, AttributeError, TypeError, ValueError, ArithmeticError):
            return False


class NarrowQuadraticClassElement:
    """One element of an exact narrow quadratic relation group."""

    def __init__(
        self, parent: NarrowQuadraticRelationGroup, coordinates: Iterable[int]
    ) -> None:
        self._parent = parent
        values = tuple(int(value) for value in coordinates)
        if len(values) != len(parent._invariants):
            raise ValueError("narrow class coordinates have the wrong length")
        self._coordinates = tuple(
            value % modulus
            for value, modulus in zip(values, parent._invariants, strict=True)
        )

    def parent(self) -> NarrowQuadraticRelationGroup:
        return self._parent

    def coordinates(self) -> tuple[int, ...]:
        return self._coordinates

    def ideal(self) -> Any:
        return self._parent.representative_ideal(self._coordinates)

    def is_one(self) -> bool:
        return not any(self._coordinates)

    def order(self) -> int:
        answer = 1
        for coordinate, modulus in zip(
            self._coordinates, self._parent._invariants, strict=True
        ):
            if coordinate:
                answer = _lcm(answer, modulus // _gcd(coordinate, modulus))
        return answer

    def __mul__(self, other: Any) -> Any:
        if not isinstance(other, NarrowQuadraticClassElement):
            return NotImplemented
        if other._parent is not self._parent:
            raise TypeError("narrow classes belong to different groups")
        return NarrowQuadraticClassElement(
            self._parent,
            [
                left + right
                for left, right in zip(
                    self._coordinates, other._coordinates, strict=True
                )
            ],
        )

    def __pow__(self, exponent: Any) -> NarrowQuadraticClassElement:
        if isinstance(exponent, bool) or not isinstance(exponent, int):
            raise TypeError("class-group exponent must be an integer")
        return NarrowQuadraticClassElement(
            self._parent, [exponent * value for value in self._coordinates]
        )

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, NarrowQuadraticClassElement)
            and other._parent is self._parent
            and other._coordinates == self._coordinates
        )

    def __repr__(self) -> str:
        return "Narrow ideal class with coordinates " + str(self._coordinates)


class NarrowQuadraticRelationGroup:
    """A finite non-materializing narrow ideal class group."""

    Element = NarrowQuadraticClassElement

    def __init__(
        self,
        result: Any,
        presentation: RelationPresentation,
        certificate: NarrowQuadraticRelationCertificate,
    ) -> None:
        self.result = result
        self.field = result.field
        self._order = self.field.maximal_order()
        self._presentation = presentation
        self._certificate = certificate
        self._factor_base = certificate.factor_base
        self._orientation_element = certificate.orientation_element
        self._limits = certificate.limits
        self._invariants = tuple(int(value) for value in presentation.invariants)
        self.proof_status = result.proof_status
        self.algorithm = "buchmann-hecke-narrow"
        self._gens = tuple(
            NarrowQuadraticClassElement(
                self,
                [
                    1 if index == position else 0
                    for index in range(len(self._invariants))
                ],
            )
            for position in range(len(self._invariants))
        )

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def order(self) -> int:
        return _product(self._invariants)

    cardinality = order

    def ngens(self) -> int:
        return len(self._gens)

    def gens(self) -> tuple[NarrowQuadraticClassElement, ...]:
        return self._gens

    def gen(self, index: int = 0) -> NarrowQuadraticClassElement:
        return self._gens[index]

    def one(self) -> NarrowQuadraticClassElement:
        return NarrowQuadraticClassElement(self, [0] * len(self._invariants))

    def certificate(self) -> NarrowQuadraticRelationCertificate:
        return self._certificate

    def ambient_row(self, coordinates: Iterable[int]) -> tuple[int, ...]:
        return tuple(self._presentation.lift_class_coordinates(tuple(coordinates)))

    def _ideal_from_ambient(self, ambient: Sequence[int]) -> Any:
        finite = reconstruct_factor_base_ideal(
            self._order, self._factor_base, ambient[:-1]
        )
        orientation = int(ambient[-1])
        if orientation:
            finite *= self._order.ideal(self._orientation_element) ** (-orientation)
        return finite

    def representative_ideal(self, coordinates: Iterable[int]) -> Any:
        element = NarrowQuadraticClassElement(self, coordinates)
        return self._ideal_from_ambient(self.ambient_row(element.coordinates()))

    def discrete_log(self, ideal: Any) -> tuple[int, ...]:
        ring = getattr(ideal, "ring", None)
        if callable(ring):
            if ring() is not self._order:
                raise TypeError("the ideal belongs to another maximal order")
        else:
            ideal = self._order.ideal(ideal)
        try:
            row = tuple(factor_ideal_over_base(ideal, self._factor_base))
            parity = 0
        except RelationNotSmoothError:
            quotient, witness = reduce_ideal_over_base(
                ideal,
                self._factor_base,
                max_candidates=self._limits.max_reduction_candidates,
            )
            row = tuple(-int(value) for value in quotient)
            parity = _norm_parity(witness)
        return tuple(self._presentation.class_coordinates(row + (parity,)))

    def __call__(self, ideal: Any) -> NarrowQuadraticClassElement:
        if isinstance(ideal, NarrowQuadraticClassElement):
            if ideal.parent() is not self:
                raise TypeError("the narrow class belongs to another group")
            return ideal
        return NarrowQuadraticClassElement(self, self.discrete_log(ideal))

    def is_principal(self, ideal: Any, proof: bool = True) -> bool:
        if proof and self.proof_status != "exact-unconditional":
            raise ValueError(
                "proof=True requires an unconditionally complete narrow class group"
            )
        return self(ideal).is_one()

    def list(self) -> list[NarrowQuadraticClassElement]:
        if self.order() > self._limits.max_list_size:
            raise NarrowRelationResourceLimit(
                "narrow class-group enumeration exceeds max_list_size"
            )
        coordinates = [0] * len(self._invariants)
        answer = []
        for _index in range(self.order()):
            answer.append(NarrowQuadraticClassElement(self, coordinates))
            for position in range(len(coordinates) - 1, -1, -1):
                coordinates[position] += 1
                if coordinates[position] < self._invariants[position]:
                    break
                coordinates[position] = 0
        return answer

    def verify(self) -> bool:
        return self._certificate.verify()

    def __repr__(self) -> str:
        if not self._invariants:
            return "Trivial narrow ideal class group"
        return "Narrow ideal class group with invariants " + str(self._invariants)


def narrow_class_group_from_result(
    result: Any, *, limits: NarrowRelationLimits | None = None, **overrides: Any
) -> NarrowQuadraticRelationGroup:
    """Build the exact augmented narrow presentation of a complete result."""
    if limits is not None and overrides:
        raise ValueError("pass either limits or narrow limit overrides, not both")
    if limits is None:
        limits = NarrowRelationLimits(**overrides)
    if not result.complete:
        raise ValueError("a narrow class group requires a complete class/unit result")
    field = result.field
    if field.degree() != 2 or tuple(field.signature()) != (2, 0):
        raise ValueError("narrow relation groups require a real quadratic field")
    factor_base = tuple(result.conditional_factor_base)
    relations = tuple(result.conditional_relation_records)
    ordinary = result.conditional_presentation_evidence
    if ordinary is None or ordinary.order is None:
        raise ValueError("the result has no complete ordinary relation presentation")
    if len(factor_base) > limits.max_columns:
        raise NarrowRelationResourceLimit("factor base exceeds max_columns")
    if len(relations) > limits.max_relations:
        raise NarrowRelationResourceLimit("relation set exceeds max_relations")
    width = len(factor_base)
    for record in relations:
        if len(record.row) != width:
            raise ArithmeticError("an ordinary relation has the wrong width")
    relation_parities = tuple(
        _norm_parity(_relation_witness(field, record)) for record in relations
    )
    units = tuple(result.units())
    if not result.unit_group().complete:
        raise ValueError("the narrow presentation requires a complete unit group")
    unit_parities = tuple(_norm_parity(unit) for unit in units)
    rows = [
        tuple(int(value) for value in record.row) + (parity,)
        for record, parity in zip(relations, relation_parities, strict=True)
    ]
    rows.append((0,) * width + (2,))
    if any(unit_parities):
        rows.append((0,) * width + (1,))
    row_count = len(rows)
    columns = width + 1
    if row_count > limits.max_relations + 2:
        raise NarrowRelationResourceLimit("augmented relation set exceeds its cap")
    if _matrix_storage_entries(row_count, columns) > limits.max_matrix_entries:
        raise NarrowRelationResourceLimit(
            "augmented presentation exceeds max_matrix_entries"
        )
    _check_integer_bits(rows, limits.max_integer_bits)
    presentation = extract_relation_presentation(rows, columns, require_full_rank=True)
    _check_integer_bits(presentation.to_dict(), limits.max_integer_bits)
    expected_order = int(ordinary.order) * (1 if any(unit_parities) else 2)
    if presentation.order != expected_order:
        raise ArithmeticError(
            "the narrow relation presentation has inconsistent exact order"
        )
    certificate = NarrowQuadraticRelationCertificate(
        result, presentation, relation_parities, unit_parities, limits
    )
    return NarrowQuadraticRelationGroup(result, presentation, certificate)


__all__ = [
    "NARROW_RELATION_SCHEMA",
    "NarrowQuadraticClassElement",
    "NarrowQuadraticRelationCertificate",
    "NarrowQuadraticRelationGroup",
    "NarrowRelationLimits",
    "NarrowRelationResourceLimit",
    "narrow_class_group_from_result",
]
