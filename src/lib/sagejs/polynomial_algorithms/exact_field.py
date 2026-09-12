"""Exact coefficient boundary for storage-neutral polynomial algorithms.

This module is the domain adapter, not an additional polynomial parent. It
keeps actual field elements inside algorithms and uses canonical decimal
coordinates only at a serialization boundary. Descriptors distinguish the
defining polynomial from the generator's display name; decoding always binds
the result to the explicitly supplied receiving parent.
"""

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage

COEFFICIENT_ABI = "sagejs.exact-field.coefficient/v1"
FIELD_ABI = "sagejs.exact-field/v1"
COMMON_FQ_CHARACTERISTIC_MAX = 4294967295
MAX_COORDINATES = 1024
MAX_INTEGER_DIGITS = 4096
MAX_COEFFICIENT_BYTES = 1048576


def _decimal(value: Any) -> int:
    """Reject noncanonical and oversized integer strings before conversion."""
    if not isinstance(value, str) or len(value) == 0:
        raise ValueError("exact-field coordinates must be decimal strings")
    if len(value) > MAX_INTEGER_DIGITS:
        raise ValueError("exact-field coordinate exceeds the integer digit limit")
    digits = value[1:] if value[0] == "-" else value
    if not digits or any(character not in "0123456789" for character in digits):
        raise ValueError("invalid exact-field integer coordinate")
    if (len(digits) > 1 and digits[0] == "0") or value == "-0":
        raise ValueError("noncanonical exact-field integer coordinate")
    return int(value)


class ExactField:
    """Reviewed adapter for rational, finite, and simple absolute number fields.

    private family tag is consumed only here, never in generic algorithms.
    This object does not assert that a polynomial operation is implemented;
    operation-level capability routing remains a separate decision.
    """

    def __init__(self, parent: Any) -> None:
        kind = getattr(parent, "_kind", None)
        if parent is sage.QQ:
            self.family = "rational"
            self.characteristic = 0
            self.degree = 1
            self.cardinality = None
        elif kind == "GF":
            self.family = "prime"
            self.characteristic = int(parent.characteristic())
            self.degree = 1
            self.cardinality = int(parent.cardinality())
        elif kind == "GF_EXTENSION":
            self.family = "finite-extension"
            self.characteristic = int(parent.characteristic())
            self.degree = int(parent.degree())
            self.cardinality = int(parent.cardinality())
        elif kind == "NumberField":
            if parent.defining_polynomial().parent().base_ring() is not sage.QQ:
                raise NotImplementedError(
                    "exact-field adapter requires a simple absolute number field over QQ"
                )
            self.family = "number-field"
            self.characteristic = 0
            self.degree = int(parent.degree())
            self.cardinality = None
        else:
            raise NotImplementedError(
                "exact polynomial coefficient adapter supports QQ, prime GF(p), "
                "simple finite extensions, and simple absolute number fields; received "
                + str(parent)
            )
        if self.degree > MAX_COORDINATES:
            raise NotImplementedError(
                "exact-field adapter supports degree at most 1024"
            )
        self.parent = parent
        # Field elements are immutable. Avoid allocating foreign resources for
        # every zero comparison or rebuilding the defining polynomial for
        # every coefficient in a transformation certificate.
        self._zero_value = parent(0)
        self._one_value = parent(1)
        self._modulus_descriptor: tuple[Any, ...] = (
            tuple(str(int(c)) for c in parent.modulus().coefficients())
            if self.family == "finite-extension"
            else tuple()
        )
        if self.family == "number-field":
            coefficients = parent.defining_polynomial().coefficients()
            leading = coefficients[-1]
            self._modulus_descriptor = tuple(
                (
                    str(int((c / leading).numerator())),
                    str(int((c / leading).denominator())),
                )
                for c in coefficients
            )
            if (
                any(
                    len(component) > MAX_INTEGER_DIGITS
                    for pair in self._modulus_descriptor
                    for component in pair
                )
                or sum(
                    len(component)
                    for pair in self._modulus_descriptor
                    for component in pair
                )
                > MAX_COEFFICIENT_BYTES
            ):
                raise ValueError(
                    "number-field defining polynomial exceeds codec limits"
                )

    def descriptor(self) -> dict[str, Any]:
        """Mathematical identity, without cosmetic generator names or handles."""
        return {
            "abi": FIELD_ABI,
            "family": self.family,
            "characteristic": str(self.characteristic),
            "degree": self.degree,
            "modulus": [list(pair) for pair in self._modulus_descriptor]
            if self.family == "number-field"
            else list(self._modulus_descriptor),
            "basis": "power",
        }

    def presentation(self) -> dict[str, Any]:
        """Public presentation metadata, separate from mathematical identity."""
        return {
            "field": self.descriptor(),
            "generator": self.parent.variable_name()
            if self.family in ("finite-extension", "number-field")
            else None,
        }

    def zero(self) -> Any:
        return self._zero_value

    def one(self) -> Any:
        return self._one_value

    def coerce(self, value: Any) -> Any:
        return self.parent(value)

    def is_zero(self, value: Any) -> bool:
        return self.coerce(value) == self.zero()

    def equal(self, left: Any, right: Any) -> bool:
        return self.coerce(left) == self.coerce(right)

    def add(self, left: Any, right: Any) -> Any:
        return self.coerce(left) + self.coerce(right)

    def subtract(self, left: Any, right: Any) -> Any:
        return self.coerce(left) - self.coerce(right)

    def multiply(self, left: Any, right: Any) -> Any:
        return self.coerce(left) * self.coerce(right)

    def negate(self, value: Any) -> Any:
        return -self.coerce(value)

    def inverse(self, value: Any) -> Any:
        return self.one() / self.coerce(value)

    def divide(self, left: Any, right: Any) -> Any:
        return self.coerce(left) / self.coerce(right)

    def polynomial_ring(self, variable: str = "t") -> Any:
        return sage.PolynomialRing(self.parent, variable)

    def coordinates(self, value: Any) -> list[Any]:
        value = self.coerce(value)
        if self.family == "rational":
            return [int(value.numerator()), int(value.denominator())]
        if self.family == "prime":
            return [int(value)]
        if self.family == "number-field":
            # Flatten canonical numerator/denominator pairs. Unlike a finite
            # field, rational coordinates must never be truncated to integers.
            result = []
            for coefficient in value.list():
                result.extend(
                    [int(coefficient.numerator()), int(coefficient.denominator())]
                )
            return result
        coefficients = value.polynomial().coefficients()
        return [
            int(coefficients[i]) if i < len(coefficients) else 0
            for i in range(self.degree)
        ]

    def from_coordinates(self, coordinates: list[Any]) -> Any:
        if any(not isinstance(c, int) or isinstance(c, bool) for c in coordinates):
            raise ValueError("exact-field coordinates must be exact integers")
        expected = self._coordinate_width()
        if len(coordinates) != expected:
            raise ValueError(
                "exact-field coordinate width does not match its descriptor"
            )
        if self.family == "rational":
            if coordinates[1] <= 0:
                raise ValueError("rational denominator must be positive")
            value = self.parent(coordinates[0]) / self.parent(coordinates[1])
            if self.coordinates(value) != coordinates:
                raise ValueError("rational coordinates must be relatively prime")
            return value
        if self.family == "number-field":
            rational = ExactField(sage.QQ)
            coefficients = [
                rational.from_coordinates(coordinates[i : i + 2])
                for i in range(0, len(coordinates), 2)
            ]
            result = self.zero()
            generator = self.parent.gen()
            for coefficient in reversed(coefficients):
                result = result * generator + self.parent(coefficient)
            return result
        if any(c < 0 or c >= self.characteristic for c in coordinates):
            raise ValueError(
                "finite-field coordinates must be canonical prime residues"
            )
        if self.family == "prime":
            return self.parent(coordinates[0])
        result = self.zero()
        generator = self.parent.gen()
        for coefficient in reversed(coordinates):
            result = result * generator + self.parent(coefficient)
        return result

    def encode(self, value: Any) -> dict[str, Any]:
        coordinates = [str(c) for c in self.coordinates(value)]
        if (
            any(len(c) > MAX_INTEGER_DIGITS for c in coordinates)
            or sum(len(c) for c in coordinates) > MAX_COEFFICIENT_BYTES
        ):
            raise ValueError("exact-field coefficient exceeds the codec resource limit")
        return {
            "abi": COEFFICIENT_ABI,
            "field": self.descriptor(),
            "coordinates": coordinates,
        }

    def decode(self, record: Any) -> Any:
        if not isinstance(record, dict) or set(record) != {
            "abi",
            "field",
            "coordinates",
        }:
            raise ValueError("invalid exact-field coefficient record")
        if record["abi"] != COEFFICIENT_ABI or record["field"] != self.descriptor():
            raise ValueError("exact-field coefficient descriptor mismatch")
        coordinates = record["coordinates"]
        expected = self._coordinate_width()
        if not isinstance(coordinates, list) or len(coordinates) != expected:
            raise ValueError("invalid exact-field coordinate vector")
        if any(not isinstance(c, str) for c in coordinates):
            raise ValueError("exact-field coordinates must be decimal strings")
        if sum(len(c) for c in coordinates) > MAX_COEFFICIENT_BYTES:
            raise ValueError("exact-field coefficient exceeds the codec byte limit")
        return self.from_coordinates([_decimal(c) for c in coordinates])

    def _coordinate_width(self) -> int:
        if self.family == "rational":
            return 2
        if self.family == "number-field":
            return 2 * self.degree
        return self.degree

    def elements(self, limit: int) -> Iterator[Any]:
        """Enumerate a finite field only after checking its full cardinality."""
        if self.cardinality is None:
            raise NotImplementedError("cannot exhaustively enumerate an infinite field")
        if limit < 0 or self.cardinality > limit:
            raise ValueError("finite-field enumeration exceeds its cardinality limit")
        return iter(self.parent)
