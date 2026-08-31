"""Live SciPy/NumPy/mpmath differential corpus for approximation algorithms."""

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
from scipy.interpolate import BarycentricInterpolator, CubicSpline

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from sagejs.numerics.approximation import (  # noqa: E402
    chebyshev_approximation,
    cubic_spline,
    finite_difference,
    interpolate,
)


def maximum_error(left: list[float], right: list[float]) -> float:
    return max(abs(left[index] - right[index]) for index in range(len(left)))


random_generator = random.Random(20260831)

# Barycentric values on well-conditioned Chebyshev nodes.
for count in (4, 9, 17, 33):
    nodes = [math.cos(math.pi * index / (count - 1)) for index in range(count)]
    nodes.sort()
    values = [math.exp(value) - value for value in nodes]
    ours = interpolate(nodes, values)
    scipy_result = BarycentricInterpolator(nodes, values, rng=12345)
    points = numpy.linspace(-1.0, 1.0, 101)
    disagreement = maximum_error(
        [ours.evaluate(float(point)) for point in points],
        [float(scipy_result(float(point))) for point in points],
    )
    assert ours.success and disagreement < 2.0e-10, (count, disagreement)

# All supported spline boundary families on deterministic nonuniform grids.
for count in range(2, 15):
    nodes: list[float] = []
    current = 0.0
    for _ in range(count):
        current += 0.1 + random_generator.random()
        nodes.append(current)
    values = [math.sin(value) + 0.2 * value for value in nodes]
    conditions = [
        ("not-a-knot", "not-a-knot"),
        ("natural", "natural"),
        ((0.3, -0.2), ((1, 0.3), (1, -0.2))),
        (((2, 0.4), (1, -0.2)), ((2, 0.4), (1, -0.2))),
    ]
    points = numpy.linspace(nodes[0], nodes[-1], 67)
    for ours_boundary, scipy_boundary in conditions:
        ours = cubic_spline(nodes, values, boundary=ours_boundary)
        scipy_result = CubicSpline(nodes, values, bc_type=scipy_boundary)
        for derivative_order in (0, 1, 2):
            disagreement = maximum_error(
                [ours.evaluate(float(point), derivative_order) for point in points],
                [
                    float(scipy_result(float(point), derivative_order))
                    for point in points
                ],
            )
            assert ours.success and disagreement < 2.0e-9, (
                count,
                ours_boundary,
                derivative_order,
                disagreement,
            )

for count in range(3, 15):
    nodes = [2.0 * math.pi * index / (count - 1) for index in range(count)]
    values = [math.sin(value) + 0.1 * math.sin(2.0 * value) for value in nodes]
    values[-1] = values[0]
    ours = cubic_spline(nodes, values, boundary="periodic")
    scipy_result = CubicSpline(nodes, values, bc_type="periodic")
    points = numpy.linspace(0.0, 2.0 * math.pi, 67)
    for derivative_order in (0, 1, 2):
        disagreement = maximum_error(
            [ours.evaluate(float(point), derivative_order) for point in points],
            [float(scipy_result(float(point), derivative_order)) for point in points],
        )
        assert ours.success and disagreement < 2.0e-9, (
            count,
            derivative_order,
            disagreement,
        )

# NumPy uses the same first-kind roots and coefficient convention on [-1, 1].
for degree in (0, 1, 4, 12, 24):
    ours = chebyshev_approximation(math.exp, [-1, 1], degree)
    numpy_coefficients = numpy.polynomial.chebyshev.chebinterpolate(numpy.exp, degree)
    disagreement = maximum_error(
        [float(value) for value in ours.value["coefficients"]],
        [float(value) for value in numpy_coefficients],
    )
    assert ours.success and disagreement < 5.0e-13, (degree, disagreement)

# High-precision mpmath analytic derivatives are independent of both paths.
mpmath.mp.dps = 80
for derivative_order in (1, 2, 3, 4):
    point = 0.375
    reference = float(mpmath.diff(mpmath.exp, mpmath.mpf(str(point)), derivative_order))
    ours = finite_difference(
        math.exp,
        point,
        derivative_order=derivative_order,
        accuracy_order=6,
        derivative=lambda _x, value=reference: value,
        rtol=2.0e-4,
    )
    assert ours.success
    assert abs(ours.evaluate(0) - reference) < 2.0e-4

print("approximation differential oracles passed")
