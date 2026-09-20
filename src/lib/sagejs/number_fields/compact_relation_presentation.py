"""Compact exact finite relation presentations."""

from __future__ import annotations

from typing import Any, Sequence

from sagejs.number_fields.class_group_matrix import (
    RelationMatrixError,
    SparseRelationRow,
    _checked_matrix,
    _determinant_exact,
    _gcd_extended,
    _integer,
    _nonnegative_integer,
    _product,
    _row_vector_multiply,
)

COMPACT_PRESENTATION_SCHEMA = "sagejs.number-fields/compact-relation-presentation-v1"

__all__ = ["COMPACT_PRESENTATION_SCHEMA", "CompactRelationPresentation"]


def _canonical_positive_decimal(value: Any, label: str) -> int:
    if (
        not isinstance(value, str)
        or not value
        or value[0] == "0"
        or any(character < "0" or character > "9" for character in value)
    ):
        raise RelationMatrixError(label + " must be a canonical positive decimal")
    return int(value)


def _checked_minors(
    raw_minors: Any, width: int, limit: int, label: str
) -> tuple[tuple[tuple[int, ...], int], ...]:
    if not isinstance(raw_minors, (list, tuple)):
        raise RelationMatrixError(label + " witnesses must be a sequence")
    answer: list[tuple[tuple[int, ...], int]] = []
    for raw_minor in raw_minors:
        if not isinstance(raw_minor, (list, tuple)) or len(raw_minor) != 2:
            raise RelationMatrixError(
                label + " witness must contain indices and a determinant"
            )
        raw_indices, raw_determinant = raw_minor
        if not isinstance(raw_indices, (list, tuple)):
            raise RelationMatrixError(label + " indices must be a sequence")
        indices = tuple(
            _nonnegative_integer(value, label + " index") for value in raw_indices
        )
        determinant = _nonnegative_integer(
            raw_determinant, label + " absolute determinant"
        )
        if len(indices) != width:
            raise RelationMatrixError(label + " indices have the wrong length")
        if any(
            left >= right for left, right in zip(indices, indices[1:], strict=False)
        ):
            raise RelationMatrixError(label + " indices must be strictly increasing")
        if any(index >= limit for index in indices):
            raise RelationMatrixError(label + " index is out of bounds")
        if determinant == 0:
            raise RelationMatrixError(label + " determinant must be nonzero")
        if answer and answer[-1][0] >= indices:
            raise RelationMatrixError(label + " witnesses are not canonical")
        answer.append((indices, determinant))
    if not answer:
        raise RelationMatrixError("at least one " + label + " witness is required")
    return tuple(answer)


class CompactRelationPresentation:
    """Exact finite relation presentation without dense transform matrices.

    Both compact proofs check that the class-coordinate map annihilates every
    relation and that the supplied ambient lifts map to the standard
    invariant-factor generators.  The selected-maximal-minors variant proves
    the index directly.  The small-surplus variant instead replays a primitive
    exact left kernel, a square subdeterminant, and the determinant of the
    projected dependency lattice.  Either certificate proves that the
    relation lattice is exactly the kernel without storing dense Smith
    transforms.

    This object intentionally cannot recover arbitrary combinations of the
    relation rows or pretend that dense HNF/SNF transforms exist.  Callers
    needing those witnesses must use `RelationPresentation` instead.
    """

    _BACKEND = "compact-maximal-minors"
    _CERTIFICATE_METHOD = "selected-maximal-minors-gcd"
    _SMALL_SURPLUS_BACKEND = "compact-small-surplus"
    _SMALL_SURPLUS_METHOD = "small-surplus-kernel-gcd"

    def __init__(
        self,
        column_count: int,
        relation_rows: Sequence[SparseRelationRow],
        invariants: Sequence[int],
        class_map_rows: Any,
        generator_transforms: Any,
        index_minors: Sequence[tuple[Sequence[int], int]],
        *,
        dependency_transforms: Any | None = None,
        square_row_indices: Sequence[int] = (),
        surplus_row_indices: Sequence[int] = (),
        square_determinant: int = 0,
        projected_dependency_determinant: int = 0,
        dependency_minors: Sequence[tuple[Sequence[int], int]] = (),
    ) -> None:
        self.column_count = _nonnegative_integer(column_count, "column_count")
        self.relation_rows = tuple(
            SparseRelationRow(self.column_count, row) for row in relation_rows
        )
        self.row_count = len(self.relation_rows)
        self.invariants = tuple(
            _integer(value, "invariant factor") for value in invariants
        )
        previous = 1
        for value in self.invariants:
            if value <= 1 or value % previous:
                raise RelationMatrixError(
                    "invariant factors must be greater than one and divide successively"
                )
            previous = value
        coordinate_count = len(self.invariants)
        self.class_map_rows = _checked_matrix(
            class_map_rows,
            self.column_count,
            coordinate_count,
            "class map",
        )
        for row in self.class_map_rows:
            for value, modulus in zip(row, self.invariants, strict=True):
                if value < 0 or value >= modulus:
                    raise RelationMatrixError(
                        "class-map entries must be canonical invariant-factor residues"
                    )
        self.generator_transforms = _checked_matrix(
            generator_transforms,
            coordinate_count,
            self.column_count,
            "generator transform",
        )
        self.dependency_transforms: tuple[tuple[int, ...], ...] = ()
        self.square_row_indices: tuple[int, ...] = ()
        self.surplus_row_indices: tuple[int, ...] = ()
        self.square_determinant = 0
        self.projected_dependency_determinant = 0
        self.dependency_minors: tuple[tuple[tuple[int, ...], int], ...] = ()
        if dependency_transforms is None:
            self.certificate_method = self._CERTIFICATE_METHOD
            self.backend = self._BACKEND
            self.index_minors = _checked_minors(
                index_minors,
                self.column_count,
                self.row_count,
                "maximal-minor",
            )
        else:
            surplus = self.row_count - self.column_count
            if surplus <= 0:
                raise RelationMatrixError(
                    "small-surplus certificates require more rows than columns"
                )
            self.certificate_method = self._SMALL_SURPLUS_METHOD
            self.backend = self._SMALL_SURPLUS_BACKEND
            self.index_minors = ()
            self.dependency_transforms = _checked_matrix(
                dependency_transforms,
                surplus,
                self.row_count,
                "dependency transform",
            )
            self.square_row_indices = tuple(
                _nonnegative_integer(value, "square row index")
                for value in square_row_indices
            )
            self.surplus_row_indices = tuple(
                _nonnegative_integer(value, "surplus row index")
                for value in surplus_row_indices
            )
            if any(
                left >= right
                for left, right in zip(
                    self.square_row_indices,
                    self.square_row_indices[1:],
                    strict=False,
                )
            ):
                raise RelationMatrixError(
                    "square row indices must be strictly increasing"
                )
            if any(
                left >= right
                for left, right in zip(
                    self.surplus_row_indices,
                    self.surplus_row_indices[1:],
                    strict=False,
                )
            ):
                raise RelationMatrixError(
                    "surplus row indices must be strictly increasing"
                )
            self.square_determinant = _nonnegative_integer(
                square_determinant, "square determinant"
            )
            self.projected_dependency_determinant = _nonnegative_integer(
                projected_dependency_determinant,
                "projected dependency determinant",
            )
            self.dependency_minors = _checked_minors(
                dependency_minors,
                surplus,
                self.row_count,
                "dependency-minor",
            )
        self.rank = self.column_count
        self.free_rank = 0
        self.order = _product(self.invariants)

    @classmethod
    def from_small_surplus(
        cls,
        column_count: int,
        relation_rows: Sequence[SparseRelationRow],
        invariants: Sequence[int],
        class_map_rows: Any,
        generator_transforms: Any,
        dependency_transforms: Any,
        square_row_indices: Sequence[int],
        surplus_row_indices: Sequence[int],
        square_determinant: int,
        projected_dependency_determinant: int,
        dependency_minors: Sequence[tuple[Sequence[int], int]],
    ) -> CompactRelationPresentation:
        return cls(
            column_count,
            relation_rows,
            invariants,
            class_map_rows,
            generator_transforms,
            (),
            dependency_transforms=dependency_transforms,
            square_row_indices=square_row_indices,
            surplus_row_indices=surplus_row_indices,
            square_determinant=square_determinant,
            projected_dependency_determinant=projected_dependency_determinant,
            dependency_minors=dependency_minors,
        )

    def class_coordinates(self, vector: Sequence[int]) -> tuple[int, ...]:
        checked = tuple(_integer(value, "ambient coordinate") for value in vector)
        if len(checked) != self.column_count:
            raise RelationMatrixError("ambient coordinate vector has the wrong length")
        answer = [0] * len(self.invariants)
        for coefficient, row in zip(checked, self.class_map_rows, strict=True):
            if coefficient:
                for index, (value, modulus) in enumerate(
                    zip(row, self.invariants, strict=True)
                ):
                    answer[index] = (answer[index] + coefficient * value) % modulus
        return tuple(answer)

    def lift_class_coordinates(self, coordinates: Sequence[int]) -> tuple[int, ...]:
        checked = tuple(_integer(value, "class coordinate") for value in coordinates)
        if len(checked) != len(self.invariants):
            raise RelationMatrixError("class coordinate vector has the wrong length")
        normalized = tuple(
            value % modulus
            for value, modulus in zip(checked, self.invariants, strict=True)
        )
        return tuple(_row_vector_multiply(normalized, self.generator_transforms))

    def reduce_ambient(self, vector: Sequence[int]) -> tuple[int, ...]:
        return self.lift_class_coordinates(self.class_coordinates(vector))

    def smith_coordinates(self, vector: Sequence[int]) -> tuple[int, ...]:
        del vector
        raise RelationMatrixError(
            "compact relation presentations do not contain a Smith transform"
        )

    def relation_combination(self, smith_row: int) -> tuple[int, ...]:
        del smith_row
        raise RelationMatrixError(
            "compact relation presentations do not contain relation combinations"
        )

    def dependency_combination(self, index: int) -> tuple[int, ...]:
        if self.certificate_method != self._SMALL_SURPLUS_METHOD:
            raise RelationMatrixError(
                "this compact presentation does not contain dependency combinations"
            )
        position = _nonnegative_integer(index, "dependency index")
        if position >= len(self.dependency_transforms):
            raise RelationMatrixError("dependency index is out of bounds")
        return self.dependency_transforms[position]

    def verify(self) -> bool:
        try:
            if (
                self.row_count != len(self.relation_rows)
                or self.rank != self.column_count
                or self.free_rank != 0
                or self.order != _product(self.invariants)
                or len(self.class_map_rows) != self.column_count
                or len(self.generator_transforms) != len(self.invariants)
            ):
                return False
            previous = 1
            for value in self.invariants:
                if value <= 1 or value % previous:
                    return False
                previous = value
            for row in self.class_map_rows:
                if len(row) != len(self.invariants):
                    return False
                for value, modulus in zip(row, self.invariants, strict=True):
                    if value < 0 or value >= modulus:
                        return False
            zero = (0,) * len(self.invariants)
            for row in self.relation_rows:
                if row.column_count != self.column_count:
                    return False
                coordinates = [0] * len(self.invariants)
                for column, coefficient in row.entries:
                    for index, (value, modulus) in enumerate(
                        zip(
                            self.class_map_rows[column],
                            self.invariants,
                            strict=True,
                        )
                    ):
                        coordinates[index] = (
                            coordinates[index] + coefficient * value
                        ) % modulus
                if tuple(coordinates) != zero:
                    return False
            for generator, transform in enumerate(self.generator_transforms):
                if len(transform) != self.column_count:
                    return False
                expected = tuple(
                    1 if index == generator else 0
                    for index in range(len(self.invariants))
                )
                if self.class_coordinates(transform) != expected:
                    return False
            if self.certificate_method == self._CERTIFICATE_METHOD:
                if self.backend != self._BACKEND:
                    return False
                gcd = 0
                for indices, claimed in self.index_minors:
                    actual = abs(
                        _determinant_exact(
                            [self.relation_rows[index].dense() for index in indices]
                        )
                    )
                    if actual != claimed:
                        return False
                    gcd = _gcd_extended(gcd, actual)[0]
                return bool(self.index_minors) and gcd == self.order
            if (
                self.certificate_method != self._SMALL_SURPLUS_METHOD
                or self.backend != self._SMALL_SURPLUS_BACKEND
            ):
                return False
            surplus = self.row_count - self.column_count
            if (
                surplus <= 0
                or len(self.dependency_transforms) != surplus
                or len(self.square_row_indices) != self.column_count
                or len(self.surplus_row_indices) != surplus
                or any(
                    left >= right
                    for left, right in zip(
                        self.square_row_indices,
                        self.square_row_indices[1:],
                        strict=False,
                    )
                )
                or any(
                    left >= right
                    for left, right in zip(
                        self.surplus_row_indices,
                        self.surplus_row_indices[1:],
                        strict=False,
                    )
                )
                or sorted(self.square_row_indices + self.surplus_row_indices)
                != list(range(self.row_count))
            ):
                return False
            for dependency in self.dependency_transforms:
                if len(dependency) != self.row_count:
                    return False
                accumulated = [0] * self.column_count
                for coefficient, relation in zip(
                    dependency, self.relation_rows, strict=True
                ):
                    if coefficient:
                        for column, value in relation.entries:
                            accumulated[column] += coefficient * value
                if any(accumulated):
                    return False
            projected = [
                [dependency[index] for index in self.surplus_row_indices]
                for dependency in self.dependency_transforms
            ]
            projected_determinant = abs(_determinant_exact(projected))
            if (
                projected_determinant == 0
                or projected_determinant != self.projected_dependency_determinant
            ):
                return False
            gcd = 0
            for indices, claimed in self.dependency_minors:
                actual = abs(
                    _determinant_exact(
                        [
                            [dependency[index] for index in indices]
                            for dependency in self.dependency_transforms
                        ]
                    )
                )
                if actual != claimed:
                    return False
                gcd = _gcd_extended(gcd, actual)[0]
            if gcd != 1:
                return False
            square_determinant = abs(
                _determinant_exact(
                    [
                        self.relation_rows[index].dense()
                        for index in self.square_row_indices
                    ]
                )
            )
            return (
                square_determinant != 0
                and square_determinant == self.square_determinant
                and square_determinant % projected_determinant == 0
                and square_determinant // projected_determinant == self.order
            )
        except (
            ArithmeticError,
            IndexError,
            RelationMatrixError,
            TypeError,
            ValueError,
        ):
            return False

    def to_dict(self) -> dict[str, Any]:
        if self.certificate_method == self._CERTIFICATE_METHOD:
            certificate = {
                "method": self._CERTIFICATE_METHOD,
                "minors": [
                    {
                        "row_indices": list(indices),
                        "absolute_determinant": str(determinant),
                    }
                    for indices, determinant in self.index_minors
                ],
            }
        else:
            certificate = {
                "method": self._SMALL_SURPLUS_METHOD,
                "dependency_transforms": [
                    list(row) for row in self.dependency_transforms
                ],
                "square_row_indices": list(self.square_row_indices),
                "surplus_row_indices": list(self.surplus_row_indices),
                "square_determinant": str(self.square_determinant),
                "projected_dependency_determinant": str(
                    self.projected_dependency_determinant
                ),
                "dependency_minors": [
                    {
                        "relation_row_indices": list(indices),
                        "absolute_determinant": str(determinant),
                    }
                    for indices, determinant in self.dependency_minors
                ],
            }
        return {
            "schema": COMPACT_PRESENTATION_SCHEMA,
            "columns": self.column_count,
            "rows": [row.to_dict() for row in self.relation_rows],
            "invariants": list(self.invariants),
            "class_map_rows": [list(row) for row in self.class_map_rows],
            "generator_transforms": [list(row) for row in self.generator_transforms],
            "index_certificate": certificate,
            "backend": self.backend,
        }

    @classmethod
    def from_dict(cls, value: Any) -> CompactRelationPresentation:
        if (
            not isinstance(value, dict)
            or value.get("schema") != COMPACT_PRESENTATION_SCHEMA
        ):
            raise RelationMatrixError(
                "unsupported compact relation-presentation schema"
            )
        expected = {
            "schema",
            "columns",
            "rows",
            "invariants",
            "class_map_rows",
            "generator_transforms",
            "index_certificate",
            "backend",
        }
        if set(value) != expected:
            raise RelationMatrixError(
                "compact relation-presentation payload has unknown fields"
            )
        for label in (
            "rows",
            "invariants",
            "class_map_rows",
            "generator_transforms",
        ):
            if not isinstance(value[label], list):
                raise RelationMatrixError(
                    "compact relation-presentation " + label + " must be a list"
                )
        certificate = value["index_certificate"]
        if not isinstance(certificate, dict):
            raise RelationMatrixError("index certificate must be a dictionary")
        method = certificate.get("method")
        rows = [SparseRelationRow.from_dict(row) for row in value["rows"]]
        if method == cls._CERTIFICATE_METHOD:
            if set(certificate) != {"method", "minors"}:
                raise RelationMatrixError("invalid maximal-minor certificate fields")
            if not isinstance(certificate["minors"], list):
                raise RelationMatrixError("maximal-minor certificate must be a list")
            minors: list[tuple[Sequence[int], int]] = []
            for minor in certificate["minors"]:
                if not isinstance(minor, dict) or set(minor) != {
                    "row_indices",
                    "absolute_determinant",
                }:
                    raise RelationMatrixError("invalid maximal-minor witness fields")
                if not isinstance(minor["row_indices"], list):
                    raise RelationMatrixError(
                        "maximal-minor row indices must be a list"
                    )
                minors.append(
                    (
                        minor["row_indices"],
                        _canonical_positive_decimal(
                            minor["absolute_determinant"],
                            "minor absolute determinant",
                        ),
                    )
                )
            if value["backend"] != cls._BACKEND:
                raise RelationMatrixError("unsupported compact presentation backend")
            answer = cls(
                value["columns"],
                rows,
                value["invariants"],
                value["class_map_rows"],
                value["generator_transforms"],
                minors,
            )
        elif method == cls._SMALL_SURPLUS_METHOD:
            fields = {
                "method",
                "dependency_transforms",
                "square_row_indices",
                "surplus_row_indices",
                "square_determinant",
                "projected_dependency_determinant",
                "dependency_minors",
            }
            if set(certificate) != fields:
                raise RelationMatrixError("invalid small-surplus certificate fields")
            for label in (
                "dependency_transforms",
                "square_row_indices",
                "surplus_row_indices",
                "dependency_minors",
            ):
                if not isinstance(certificate[label], list):
                    raise RelationMatrixError(label + " must be a list")
            dependency_minors: list[tuple[Sequence[int], int]] = []
            for minor in certificate["dependency_minors"]:
                if not isinstance(minor, dict) or set(minor) != {
                    "relation_row_indices",
                    "absolute_determinant",
                }:
                    raise RelationMatrixError("invalid dependency-minor fields")
                if not isinstance(minor["relation_row_indices"], list):
                    raise RelationMatrixError("dependency-minor indices must be a list")
                dependency_minors.append(
                    (
                        minor["relation_row_indices"],
                        _canonical_positive_decimal(
                            minor["absolute_determinant"],
                            "dependency-minor determinant",
                        ),
                    )
                )
            if value["backend"] != cls._SMALL_SURPLUS_BACKEND:
                raise RelationMatrixError("unsupported compact presentation backend")
            answer = cls.from_small_surplus(
                value["columns"],
                rows,
                value["invariants"],
                value["class_map_rows"],
                value["generator_transforms"],
                certificate["dependency_transforms"],
                certificate["square_row_indices"],
                certificate["surplus_row_indices"],
                _canonical_positive_decimal(
                    certificate["square_determinant"], "square determinant"
                ),
                _canonical_positive_decimal(
                    certificate["projected_dependency_determinant"],
                    "projected dependency determinant",
                ),
                dependency_minors,
            )
        else:
            raise RelationMatrixError("unsupported compact certificate method")
        if not answer.verify():
            raise RelationMatrixError("compact relation-presentation replay failed")
        if answer.to_dict() != value:
            raise RelationMatrixError(
                "compact relation-presentation payload is not canonical"
            )
        return answer
