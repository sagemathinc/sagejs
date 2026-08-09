"""Typed binary64 adaptations of two unchanged CoWasm microbenchmarks.

The six integer values and five floating values are explicit parameters so an
optimizing compiler cannot replace the fixed benchmark with a constant. The
timed arithmetic and conversion counts remain identical to the source corpus.
"""

from sagejs.native import native


@native
def int_to_float(
    iterations: uint64,
    a: uint64,
    b: uint64,
    c: uint64,
    d: uint64,
    e: uint64,
    f: uint64,
) -> float:
    total = 0.0
    for iteration in range(iterations):
        total += float(a)
        total += float(b)
        total += float(c)
        total += float(d)
        total += float(e)
        total += float(f)
    return total


@native
def float_abs(
    iterations: uint64,
    a: float,
    b: float,
    c: float,
    d: float,
    e: float,
) -> float:
    total = 0.0
    for iteration in range(iterations):
        total += abs(a)
        total += abs(b)
        total += abs(c)
        total += abs(d)
        total += abs(e)
    return total
