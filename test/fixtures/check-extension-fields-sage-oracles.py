"""Compare the generic engine with frozen Sage fixtures using independent fields."""

import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2] / "src" / "lib"))

from sagejs.polynomial_algorithms.generic_groebner import (
    GenericGroebnerRing,
    basis_with_certificate,
    decode_certificate,
    encode_certificate,
    verify_certificate,
)


class ReferenceField:
    """Independent dense modular polynomial arithmetic, for tests only."""

    family = "finite-extension"

    def __init__(self, descriptor):
        self.characteristic = int(descriptor["characteristic"])
        self.degree = descriptor["degree"]
        self.modulus = tuple(int(c) for c in descriptor["modulus"])

    def descriptor(self):
        return {
            "characteristic": str(self.characteristic),
            "degree": self.degree,
            "modulus": [str(c) for c in self.modulus],
        }

    def coerce(self, value):
        if isinstance(value, int):
            return (value % self.characteristic,) + (0,) * (self.degree - 1)
        assert len(value) == self.degree
        return tuple(int(c) % self.characteristic for c in value)

    def zero(self):
        return self.coerce(0)

    def one(self):
        return self.coerce(1)

    def add(self, left, right):
        return self.coerce(tuple(a + b for a, b in zip(left, right)))

    def negate(self, value):
        return self.coerce(tuple(-c for c in value))

    def multiply(self, left, right):
        result = [0] * (2 * self.degree - 1)
        for i, a in enumerate(left):
            for j, b in enumerate(right):
                result[i + j] += a * b
        for i in range(len(result) - 1, self.degree - 1, -1):
            coefficient = result[i]
            for j in range(self.degree):
                result[i - self.degree + j] -= coefficient * self.modulus[j]
        return self.coerce(result[: self.degree])

    def inverse(self, value):
        if value == self.zero():
            raise ZeroDivisionError
        exponent = self.characteristic**self.degree - 2
        result = self.one()
        while exponent:
            if exponent % 2:
                result = self.multiply(result, value)
            value = self.multiply(value, value)
            exponent //= 2
        return result

    def encode(self, value):
        return {"field": self.descriptor(), "coordinates": [str(c) for c in value]}

    def decode(self, record):
        assert record["field"] == self.descriptor()
        return self.coerce(record["coordinates"])


with Path(__file__).with_name("extension-fields-sage-oracles-v1.json").open() as handle:
    fixture = json.load(handle)
assert fixture["oracle"]["version"] == "10.9"
assert (
    fixture["oracle"]["upstream_commit"] == "686dc1a8d420c2e0aabadd4f602d9a0aa4690c50"
)
assert len(fixture["cases"]) == 108
for case in fixture["cases"]:
    field = ReferenceField(case["field"])
    ring = GenericGroebnerRing(len(case["variables"]), field, case["order"])

    def polynomial(record):
        return tuple((field.coerce(c), tuple(e)) for c, e in record)

    source = tuple(polynomial(f) for f in case["generators"])
    expected = tuple(polynomial(f) for f in case["basis"])
    basis, transformation = basis_with_certificate(source, ring)
    assert basis == expected, (case["id"], basis, expected)
    encoded = encode_certificate(basis, transformation, ring)
    decoded = decode_certificate(encoded, ring)
    assert verify_certificate(source, *decoded, ring).valid, case["id"]

print("108 independently generated SageMath 10.9 extension-field fixtures passed")
