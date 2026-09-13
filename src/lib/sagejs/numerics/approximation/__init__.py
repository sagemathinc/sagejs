"""Validated interpolation, splines, finite differences, and approximation."""

from ._common import ApproximationResult
from .capabilities import capabilities, plan, supports
from .chebyshev import (
    chebyshev_approximation,
    evaluate_chebyshev,
    plan_polynomial_approximation,
    polynomial_approximation_problem,
    solve_polynomial_approximation_problem,
)
from .finite_difference import (
    finite_difference,
    finite_difference_problem,
    fornberg_weights,
    plan_finite_difference,
    solve_finite_difference_problem,
)
from .interpolation import (
    evaluate_interpolant,
    interpolate,
    interpolation_problem,
    plan_interpolation,
    solve_interpolation_problem,
)
from .polynomial_roots import (
    MAX_POLYNOMIAL_ROOT_DEGREE,
    PolynomialRootsResult,
    plan_polynomial_roots,
    polynomial_roots,
    polynomial_roots_problem,
    solve_polynomial_roots_problem,
)
from .splines import (
    cubic_spline,
    evaluate_spline,
    plan_spline,
    solve_spline_problem,
    spline_problem,
)

__all__ = [
    "ApproximationResult",
    "MAX_POLYNOMIAL_ROOT_DEGREE",
    "PolynomialRootsResult",
    "capabilities",
    "chebyshev_approximation",
    "cubic_spline",
    "evaluate_chebyshev",
    "evaluate_interpolant",
    "evaluate_spline",
    "finite_difference",
    "finite_difference_problem",
    "fornberg_weights",
    "interpolate",
    "interpolation_problem",
    "plan",
    "plan_finite_difference",
    "plan_interpolation",
    "plan_polynomial_approximation",
    "plan_polynomial_roots",
    "plan_spline",
    "polynomial_approximation_problem",
    "polynomial_roots",
    "polynomial_roots_problem",
    "solve_finite_difference_problem",
    "solve_interpolation_problem",
    "solve_polynomial_approximation_problem",
    "solve_polynomial_roots_problem",
    "solve_spline_problem",
    "spline_problem",
    "supports",
]
