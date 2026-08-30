"""Warm-profile entry for a public large prime-field polynomial integral."""

MODULUS = 65_537
DEGREE = 69_999
ZERO_SOURCE_INDEX = MODULUS - 1
EXPECTED_OUTPUT = (70_000, True, (0, 65_530, 32_767, 9, 0, 65_530, 52_453))

_POLYNOMIAL = None


def __profile_prepare__():
    """Construct the actual public polynomial outside the sampled region."""
    global _POLYNOMIAL
    field = GF(MODULUS)
    ring = PolynomialRing(field, "x")
    coefficients = [
        (index * index + 3 * index - 7) % MODULUS for index in range(DEGREE + 1)
    ]
    coefficients[ZERO_SOURCE_INDEX] = 0
    _POLYNOMIAL = ring(coefficients)
    assert _POLYNOMIAL.degree() == DEGREE
    return (MODULUS, DEGREE, len(coefficients), coefficients[ZERO_SOURCE_INDEX])


def _production_once():
    if _POLYNOMIAL is None:
        raise RuntimeError("call __profile_prepare__ before the production entry")
    return _POLYNOMIAL.integral()


def _exact_output(antiderivative):
    derivative_replay = antiderivative.derivative() == _POLYNOMIAL
    sample_indices = (0, 1, 2, 65_536, 65_537, 65_538, 70_000)
    samples = tuple(int(antiderivative[index].lift()) for index in sample_indices)
    output = (antiderivative.degree(), derivative_replay, samples)
    assert output == EXPECTED_OUTPUT
    return output


def __profile_run__():
    """Run the public operation and return an exact, stable oracle projection."""
    return _exact_output(_production_once())
