"""Source-sampling entry for the public bounded modular fold."""

from sagejs.polynomial_algorithms.arbitrary_prime_contract import (
    polynomial_evaluate_mod,
)


MODULUS = 65_537
COEFFICIENTS = tuple(
    (index * index + 3 * index - 7) % MODULUS for index in range(20_000)
)
POINT = 12_345
EXPECTED = 37_713


def __profile_run__() -> int:
    answer = 0
    for _repeat in range(50):
        answer = polynomial_evaluate_mod(COEFFICIENTS, POINT, MODULUS)
    assert answer == EXPECTED
    return answer
