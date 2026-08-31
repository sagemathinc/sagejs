"""Validated interpolation, splines, finite differences, and approximation."""

from ._common import ApproximationResult
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
from .splines import (
    cubic_spline,
    evaluate_spline,
    plan_spline,
    solve_spline_problem,
    spline_problem,
)

__all__ = [
    "ApproximationResult",
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
    "plan_finite_difference",
    "plan_interpolation",
    "plan_polynomial_approximation",
    "plan_spline",
    "polynomial_approximation_problem",
    "solve_finite_difference_problem",
    "solve_interpolation_problem",
    "solve_polynomial_approximation_problem",
    "solve_spline_problem",
    "spline_problem",
]
