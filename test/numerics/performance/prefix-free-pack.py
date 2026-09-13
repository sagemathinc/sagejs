"""Source-transparent witnesses for numerical-only and mixed native packs."""

from sagejs.native import native


@native
def float_twice(value: float) -> float:
    return value * 2.0


@native
def exact_twice(value: int) -> int:
    return value * 2
