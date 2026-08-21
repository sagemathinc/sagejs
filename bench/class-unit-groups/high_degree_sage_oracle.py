#!/usr/bin/env python3
"""Compact Sage/PARI oracle for the degree 6--10 Selmer family."""

from __future__ import annotations

import sys
import time

import sage.version
from sage.all import NumberField, PolynomialRing, QQ, ZZ
from sage.libs.pari import pari


BOUNDS = {6: 5, 7: 11, 8: 20, 9: 47, 10: 97}
PRIMES = [
    2,
    3,
    5,
    7,
    11,
    13,
    17,
    19,
    23,
    29,
    31,
    37,
    41,
    43,
    47,
    53,
    59,
    61,
    67,
    71,
    73,
    79,
    83,
    89,
    97,
]


def evaluate(degree: int) -> None:
    ring = PolynomialRing(QQ, "x")
    x = ring.gen()
    polynomial = x**degree - x - 1

    def fresh():
        field = NumberField(polynomial, f"a{degree}")
        return field, field.maximal_order()

    field, _order = fresh()
    equation_discriminant = ZZ(polynomial.discriminant())
    field_discriminant = ZZ(field.discriminant())
    index = ZZ((abs(equation_discriminant // field_discriminant)).isqrt())
    signature = field.signature()
    print(
        f"FIELD|{degree}|{signature[0]}|{signature[1]}|"
        f"{equation_discriminant}|{field_discriminant}|{index}|{BOUNDS[degree]}"
    )

    for label, proof in (("conditional_grh", False), ("unconditional", True)):
        mode_field, _mode_order = fresh()
        started = time.perf_counter()
        class_group = mode_field.class_group(proof=proof)
        unit_group = mode_field.unit_group(proof=proof)
        elapsed = time.perf_counter() - started
        class_invariants = ",".join(str(value) for value in class_group.invariants())
        unit_invariants = list(unit_group.invariants())
        torsion = unit_invariants[0] if unit_invariants else 1
        rank = max(0, len(unit_invariants) - 1)
        regulator = mode_field.regulator(proof=proof)
        print(
            f"MODE|{degree}|{label}|{class_invariants}|{class_group.order()}|"
            f"{','.join(str(value) for value in unit_invariants)}|{rank}|"
            f"{torsion}|{regulator}|{elapsed}"
        )

    for rational_prime in (prime for prime in PRIMES if prime <= BOUNDS[degree]):
        factors = []
        for ideal, ramification_index in field.ideal(rational_prime).factor():
            norm = ZZ(ideal.norm())
            residue_degree = 0
            while norm > 1:
                norm //= rational_prime
                residue_degree += 1
            factors.append((int(ramification_index), residue_degree))
        factors.sort()
        encoded = ";".join(f"{e},{f}" for e, f in factors)
        print(f"PRIME|{degree}|{rational_prime}|{encoded}")


def main() -> None:
    degrees = [int(value) for value in sys.argv[1:]] or list(range(6, 11))
    if any(degree not in BOUNDS for degree in degrees):
        raise ValueError("supported degrees are 6 through 10")
    print(f"META|{sage.version.version}|{pari.version()}")
    for degree in degrees:
        evaluate(degree)


if __name__ == "__main__":
    main()
