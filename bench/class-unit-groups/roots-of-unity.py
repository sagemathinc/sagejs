"""Profile exact roots-of-unity fast and exhaustive proof paths."""

from __future__ import annotations

import time
from typing import Any

from sagejs.number_fields.units import roots_of_unity


def _measure(field: Any, *, max_primes: int) -> dict[str, Any]:
    started = time.time()
    result = roots_of_unity(field, max_primes=max_primes)
    produced = time.time()
    if not result.complete or not result.verify():
        raise ArithmeticError("the roots-of-unity benchmark did not certify torsion")
    verified = time.time()
    return {
        "order": result.order,
        "certificate": result.certificate.kind,
        "produce_seconds": produced - started,
        "replay_seconds": verified - produced,
        "payload": result.certificate.to_dict(),
    }


ring = PolynomialRing(QQ, "x")
x = ring.gen()
for label, polynomial in (
    ("cyclotomic-8", x**4 + 1),
    ("translated-cyclotomic-8", (x - 1) ** 4 + 1),
    ("noncyclotomic-totally-imaginary", x**4 - x + 1),
):
    number_field = NumberField(polynomial, "a")
    print(
        {
            "field": label,
            "fast": _measure(number_field, max_primes=8),
            "fallback": _measure(number_field, max_primes=0),
        }
    )
