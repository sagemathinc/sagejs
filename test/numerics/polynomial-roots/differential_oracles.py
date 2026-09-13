"""NumPy companion and mpmath high-precision polynomial-root oracles."""

from __future__ import annotations

import collections.abc  # noqa: F401
import hashlib  # noqa: F401
import json  # noqa: F401
import math
import random
import sys
import typing  # noqa: F401
from pathlib import Path

import mpmath
import numpy

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from sagejs.numerics.approximation.polynomial_roots import (  # noqa: E402
    polynomial_roots,
)


def coefficients_from_roots(roots: list[complex]) -> list[complex]:
    coefficients = [1.0 + 0.0j]
    for root in roots:
        updated = [0.0j] * (len(coefficients) + 1)
        for index in range(len(coefficients)):
            updated[index] += coefficients[index]
            updated[index + 1] -= coefficients[index] * root
        coefficients = updated
    return coefficients


def maximum_matching_error(observed: list[complex], expected: list[complex]) -> float:
    remaining = list(observed)
    maximum = 0.0
    for target in expected:
        nearest = min(
            range(len(remaining)),
            key=lambda index: abs(remaining[index] - target),
        )
        maximum = max(
            maximum,
            abs(remaining[nearest] - target) / max(1.0, abs(target)),
        )
        remaining.pop(nearest)
    assert len(remaining) == 0
    return maximum


random_generator = random.Random(20260831)

# Independent companion-matrix eigenvalues agree on well-conditioned random
# root sets. Coefficients, not known roots, are passed to both solvers.
for degree in (2, 3, 4, 8, 12, 16, 24, 32):
    expected = [
        complex(
            random_generator.uniform(-1.5, 1.5),
            random_generator.uniform(-1.5, 1.5),
        )
        for _ in range(degree)
    ]
    coefficients = coefficients_from_roots(expected)
    ours = polynomial_roots(coefficients)
    numpy_roots = [complex(value) for value in numpy.roots(coefficients)]
    assert ours.success, (degree, ours.explain())
    ours_numpy = maximum_matching_error(list(ours.roots), numpy_roots)
    ours_known = maximum_matching_error(list(ours.roots), expected)
    tolerance = 2.0e-8 if degree <= 16 else 2.0e-5
    assert ours_numpy < tolerance, (degree, ours_numpy)
    assert ours_known < tolerance, (degree, ours_known)
    assert ours.value["maximum_backward_error"] < 1.0e-10

# Real coefficient corpora exercise exact conjugate restoration.
for degree in (4, 10, 20):
    positive = [
        complex(
            random_generator.uniform(-2.0, 2.0),
            random_generator.uniform(0.2, 2.0),
        )
        for _ in range(degree // 2)
    ]
    expected = positive + [root.conjugate() for root in positive]
    coefficients = coefficients_from_roots(expected)
    real_coefficients = [float(value.real) for value in coefficients]
    ours = polynomial_roots(real_coefficients)
    assert ours.success, (degree, ours.explain())
    for root in ours.roots:
        if root.imag > 0.0:
            assert root.conjugate() in ours.roots
    assert maximum_matching_error(list(ours.roots), expected) < 2.0e-6

# High-precision Durand--Kerner provides an independent arithmetic oracle on
# modest degrees. The comparison is forward only for well-separated roots.
mpmath.mp.dps = 100
for degree in (3, 5, 8, 12):
    expected = [
        complex(
            random_generator.uniform(-1.0, 1.0),
            random_generator.uniform(-1.0, 1.0),
        )
        for _ in range(degree)
    ]
    coefficients = coefficients_from_roots(expected)
    ours = polynomial_roots(coefficients)
    reference = [
        complex(value)
        for value in mpmath.polyroots(
            [mpmath.mpc(value.real, value.imag) for value in coefficients],
            maxsteps=1000,
            error=False,
        )
    ]
    assert ours.success
    assert maximum_matching_error(list(ours.roots), reference) < 2.0e-8

# Repeated roots are compared by backward evidence, not invented forward
# digits. NumPy documents the same sensitivity of multiple roots.
for multiplicity in (2, 3, 4, 6):
    coefficients = coefficients_from_roots([1.0] * multiplicity + [-2.0])
    ours = polynomial_roots(coefficients)
    numpy_roots = [complex(value) for value in numpy.roots(coefficients)]
    assert ours.success
    assert ours.value["maximum_backward_error"] < 2.0e-10
    assert ours.value["multiplicity_certified"] is False
    assert max(ours.value["root_relative_condition_estimates"]) > 1.0e6
    # Both independent binary64 algorithms reconstruct nearly the same input
    # while legitimately disagreeing about the split root locations.
    assert len(numpy_roots) == len(ours.roots)

# Metamorphic coefficient scaling must not change roots or overflow validation.
base_coefficients = coefficients_from_roots([-3.0, 0.25, 2.0, 0.5 + 1.25j, 0.5 - 1.25j])
base = polynomial_roots(base_coefficients)
assert base.success
for multiplier in (1.0e-300, 1.0e300):
    scaled = polynomial_roots([multiplier * value for value in base_coefficients])
    assert scaled.success
    assert maximum_matching_error(list(scaled.roots), list(base.roots)) < 2.0e-11

# Stable degree-one/two paths agree with high precision at extreme root scales.
wide = polynomial_roots([1.0, -1.0e150, 1.0])
assert wide.success
assert maximum_matching_error(list(wide.roots), [1.0e-150, 1.0e150]) < 2.0e-14

# Opposite ends of the representable range exercise logarithmic term scaling,
# not merely a common coefficient multiplier. A direct relative comparison is
# used here because the generic matcher intentionally uses unit absolute scale
# near zero.
for leading, constant, expected_magnitude in (
    (1.0e-308, 1.0e308, 1.0e308),
    (1.0e308, 1.0e-308, 1.0e-308),
):
    extreme = polynomial_roots([leading, 0.0, constant])
    assert extreme.success, extreme.explain()
    assert all(root.real == 0.0 for root in extreme.roots)
    observed_magnitudes = sorted(abs(root.imag) for root in extreme.roots)
    assert len(observed_magnitudes) == 2
    for observed_magnitude in observed_magnitudes:
        assert abs(observed_magnitude / expected_magnitude - 1.0) < 3.0e-13

# Finite coefficients can imply a root beyond binary64. The API must reject
# that result structurally instead of serializing infinity or throwing.
outside_binary64 = polynomial_roots([1.0e-300, 1.0e300])
assert not outside_binary64.success
assert outside_binary64.status == "validation_failed"

print("polynomial-root differential oracles passed")
