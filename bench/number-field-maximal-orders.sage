"""Regression-oriented maximal-order benchmark corpus.

The quick cases include the motivating field, Sage's essential-discriminant
example, and two LMFDB defining polynomials of index 2. The stress cases are
historical PARI Round-4 regressions #2510 and #1710. Expected discriminants are
frozen so this benchmark never needs PARI or SageMath at runtime.
"""

import time


R.<x> = QQ[]

CASES = [
    ("motivating-degree-7", x^7 - 2*x + 3, -594390879),
    ("sage-essential-discriminant", x^3 + x^2 - 2*x + 8, -503),
    ("lmfdb-3.1.431.1", x^3 - x - 8, -431),
    (
        "lmfdb-5.1.17161.1",
        x^5 - x^4 + 2*x^3 - x^2 + x + 2,
        17161,
    ),
    (
        "pari-round4-2510",
        x^8 - 56*x^6 + 840*x^4 - 3136*x^2 + 3136,
        2084850211225600,
    ),
    (
        "pari-round4-1710",
        x^10 - 29080*x^5 - 25772600,
        551496736222216254722000000000000000000,
    ),
]

for label, polynomial, expected_discriminant in CASES:
    field = NumberField(polynomial, "a")
    started = time.perf_counter()
    order = field.maximal_order()
    elapsed = time.perf_counter() - started
    assert order.discriminant() == expected_discriminant
    print(label, round(elapsed, 6), "seconds", "disc", order.discriminant())
