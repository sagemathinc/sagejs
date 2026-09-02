"""Validated portable optimization, nonlinear systems, and fitting."""

from ._core import (
    MAX_DENSE_DIMENSION,
    MAX_DENSE_JACOBIAN_ELEMENTS,
    MAX_FIT_OBSERVATIONS,
    MAX_RESIDUAL_DIMENSION,
    OptimizationResult,
)
from .least_squares import (
    curve_fit,
    least_squares,
    least_squares_problem,
    linear_fit,
    linear_fit_problem,
    solve_least_squares_problem,
    solve_linear_fit_problem,
)
from .multivariate import minimize, minimize_problem, solve_minimize_problem
from .planning import capabilities, plan, supports
from .scalar import (
    minimize_scalar,
    scalar_minimum_problem,
    solve_scalar_minimum_problem,
)
from .systems import (
    nonlinear_system_problem,
    solve_nonlinear_system,
    solve_nonlinear_system_problem,
)

__all__ = [
    "MAX_DENSE_DIMENSION",
    "MAX_DENSE_JACOBIAN_ELEMENTS",
    "MAX_FIT_OBSERVATIONS",
    "MAX_RESIDUAL_DIMENSION",
    "OptimizationResult",
    "capabilities",
    "curve_fit",
    "least_squares",
    "least_squares_problem",
    "linear_fit",
    "linear_fit_problem",
    "minimize",
    "minimize_problem",
    "minimize_scalar",
    "nonlinear_system_problem",
    "plan",
    "scalar_minimum_problem",
    "solve_least_squares_problem",
    "solve_linear_fit_problem",
    "solve_minimize_problem",
    "solve_nonlinear_system",
    "solve_nonlinear_system_problem",
    "solve_scalar_minimum_problem",
    "supports",
]
