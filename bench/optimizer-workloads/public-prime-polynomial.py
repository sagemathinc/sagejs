"""Authenticated source-sampling entry for public prime-field evaluation."""

from sagejs.kernels.polynomial.packed_prime_field import (
    packed_prime_field_polynomial_evaluate,
)


FIELD = GF(65_537)
POLYNOMIAL_RING = PolynomialRing(FIELD, "x")
POLYNOMIAL = POLYNOMIAL_RING([index % 65_537 for index in range(20_000)])
POINT = FIELD(12_345)


def __profile_run__():
    answer = FIELD(0)
    for _repeat in range(50):
        answer = POLYNOMIAL(POINT)
    assert packed_prime_field_polynomial_evaluate is not None
    return int(answer.lift())
