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


class CompactRelationPresentation:
    """Exact finite relation presentation without dense transform matrices.

    The compact proof has three parts.  The class-coordinate map annihilates
    every relation row, the supplied ambient lifts map to the standard
    invariant-factor generators, and the gcd of the selected, independently
    recomputed maximal minors equals the product of the invariant factors.
    The first two facts give a surjection from the presented quotient onto the
    asserted finite group.  The minor gcd gives the opposite index bound, so
    together they prove that the relation lattice is exactly the kernel.

    This object intentionally cannot recover arbitrary combinations of the
    relation rows or pretend that dense HNF/SNF transforms exist.  Callers
    needing those witnesses must use `RelationPresentation` instead.
    """

    _BACKEND = "compact-maximal-minors"
    _CERTIFICATE_METHOD = "selected-maximal-minors-gcd"

    def __init__(
        self,
        column_count: int,
        relation_rows: Sequence[SparseRelationRow],
        invariants: Sequence[int],
        class_map_rows: Any,
        generator_transforms: Any,
        index_minors: Sequence[tuple[Sequence[int], int]],
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
        try:
            raw_minors = list(index_minors)
        except TypeError as error:
            raise RelationMatrixError(
                "maximal-minor witnesses must be a sequence"
            ) from error
        checked_minors: list[tuple[tuple[int, ...], int]] = []
        for minor_index, raw_minor in enumerate(raw_minors):
            if not isinstance(raw_minor, (list, tuple)) or len(raw_minor) != 2:
                raise RelationMatrixError(
                    "a maximal-minor witness must contain row indices and a determinant"
                )
            raw_indices, raw_determinant = raw_minor
            if not isinstance(raw_indices, (list, tuple)):
                raise RelationMatrixError(
                    "maximal-minor row indices must be a sequence"
                )
            indices = tuple(
                _nonnegative_integer(value, "minor row index") for value in raw_indices
            )
            determinant = _nonnegative_integer(
                raw_determinant, "minor absolute determinant"
            )
            if len(indices) != self.column_count:
                raise RelationMatrixError(
                    "maximal-minor row indices have the wrong length"
                )
            if any(
                left >= right for left, right in zip(indices, indices[1:], strict=False)
            ):
                raise RelationMatrixError(
                    "maximal-minor row indices must be strictly increasing"
                )
            if any(index >= self.row_count for index in indices):
                raise RelationMatrixError("maximal-minor row index is out of bounds")
            if determinant == 0:
                raise RelationMatrixError(
                    "selected maximal minors must have nonzero determinant"
                )
            checked_minors.append((indices, determinant))
            if minor_index and checked_minors[-2][0] >= indices:
                raise RelationMatrixError(
                    "selected maximal minors must be in canonical row-index order"
                )
        if not checked_minors:
            raise RelationMatrixError("at least one maximal-minor witness is required")
        self.index_minors = tuple(checked_minors)
        self.rank = self.column_count
        self.free_rank = 0
        self.order = _product(self.invariants)
        self.backend = self._BACKEND

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
        del index
        raise RelationMatrixError(
            "compact relation presentations do not contain dependency combinations"
        )

    def verify(self) -> bool:
        try:
            if (
                self.row_count != len(self.relation_rows)
                or self.rank != self.column_count
                or self.free_rank != 0
                or self.order != _product(self.invariants)
                or self.backend != self._BACKEND
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
            gcd = 0
            previous_indices: tuple[int, ...] | None = None
            for indices, claimed_determinant in self.index_minors:
                if (
                    len(indices) != self.column_count
                    or any(
                        left >= right
                        for left, right in zip(indices, indices[1:], strict=False)
                    )
                    or any(index >= self.row_count for index in indices)
                    or claimed_determinant <= 0
                    or (previous_indices is not None and previous_indices >= indices)
                ):
                    return False
                actual = abs(
                    _determinant_exact(
                        [self.relation_rows[index].dense() for index in indices]
                    )
                )
                if actual != claimed_determinant:
                    return False
                gcd = _gcd_extended(gcd, actual)[0]
                previous_indices = indices
            return bool(self.index_minors) and gcd == self.order
        except (
            ArithmeticError,
            IndexError,
            RelationMatrixError,
            TypeError,
            ValueError,
        ):
            return False

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": COMPACT_PRESENTATION_SCHEMA,
            "columns": self.column_count,
            "rows": [row.to_dict() for row in self.relation_rows],
            "invariants": list(self.invariants),
            "class_map_rows": [list(row) for row in self.class_map_rows],
            "generator_transforms": [list(row) for row in self.generator_transforms],
            "index_certificate": {
                "method": self._CERTIFICATE_METHOD,
                "minors": [
                    {
                        "row_indices": list(indices),
                        "absolute_determinant": str(determinant),
                    }
                    for indices, determinant in self.index_minors
                ],
            },
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
        if not isinstance(certificate, dict) or set(certificate) != {
            "method",
            "minors",
        }:
            raise RelationMatrixError("invalid maximal-minor certificate fields")
        if certificate["method"] != cls._CERTIFICATE_METHOD:
            raise RelationMatrixError("unsupported maximal-minor certificate method")
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
                raise RelationMatrixError("maximal-minor row indices must be a list")
            encoded = minor["absolute_determinant"]
            if (
                not isinstance(encoded, str)
                or not encoded
                or (len(encoded) > 1 and encoded[0] == "0")
                or any(character < "0" or character > "9" for character in encoded)
            ):
                raise RelationMatrixError(
                    "minor absolute determinant must be a canonical decimal string"
                )
            minors.append((minor["row_indices"], int(encoded)))
        if value["backend"] != cls._BACKEND:
            raise RelationMatrixError("unsupported compact presentation backend")
        answer = cls(
            value["columns"],
            [SparseRelationRow.from_dict(row) for row in value["rows"]],
            value["invariants"],
            value["class_map_rows"],
            value["generator_transforms"],
            minors,
        )
        if not answer.verify():
            raise RelationMatrixError("compact relation-presentation replay failed")
        if answer.to_dict() != value:
            raise RelationMatrixError(
                "compact relation-presentation payload is not canonical"
            )
        return answer
