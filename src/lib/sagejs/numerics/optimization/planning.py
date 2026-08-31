"""Inspectable method-specific planning for optimization and fitting."""

from __future__ import annotations

from typing import Any

from .._json import JSONValue
from ..diagnostics import NumericalDiagnostic
from ..model import NumericalPlan, NumericalProblem
from ._core import MAX_DENSE_DIMENSION

_PLATFORMS = [
    "browser",
    "node",
    "sea",
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
]

_METHODS: dict[str, dict[str, dict[str, JSONValue]]] = {
    "scalar_minimum": {
        "bounded-brent": {
            "classification": "translated",
            "backend": "ordinary-python",
            "constraints": ["finite_interval"],
            "derivatives": ["none"],
            "validation": ["feasibility", "projected_stationarity"],
            "platforms": _PLATFORMS,
        }
    },
    "minimize": {
        "nelder-mead": {
            "classification": "translated",
            "backend": "ordinary-python",
            "constraints": ["none"],
            "derivatives": ["none"],
            "validation": ["finite_difference_stationarity"],
            "max_dimension": 64,
            "platforms": _PLATFORMS,
        },
        "bfgs": {
            "classification": "translated",
            "backend": "ordinary-python",
            "constraints": ["none"],
            "derivatives": ["analytic", "central_finite_difference"],
            "validation": ["independent_finite_difference_stationarity"],
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        },
        "projected-bfgs": {
            "classification": "extension",
            "backend": "ordinary-python",
            "constraints": ["box_bounds"],
            "derivatives": ["analytic", "bound_aware_finite_difference"],
            "validation": ["feasibility", "projected_gradient_kkt"],
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        },
    },
    "nonlinear_system": {
        "damped-newton": {
            "classification": "extension",
            "backend": "ordinary-python",
            "derivatives": ["analytic", "central_finite_difference"],
            "validation": ["independent_residual"],
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        }
    },
    "nonlinear_least_squares": {
        "damped-gauss-newton": {
            "classification": "extension",
            "backend": "ordinary-python",
            "derivatives": ["analytic", "central_finite_difference"],
            "validation": ["residual_norm", "independent_stationarity"],
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        }
    },
    "curve_fit": {
        "damped-gauss-newton": {
            "classification": "extension",
            "backend": "ordinary-python",
            "derivatives": ["analytic", "central_finite_difference"],
            "validation": ["residual_norm", "independent_stationarity"],
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        }
    },
    "linear_fit": {
        "centered-linear-fit": {
            "classification": "extension",
            "backend": "ordinary-python",
            "derivatives": ["analytic"],
            "validation": ["normal_equations", "residual_norm"],
            "max_dimension": 2,
            "platforms": _PLATFORMS,
        }
    },
}


def capabilities(operation: str | None = None) -> dict[str, JSONValue]:
    """Return the detached package-local optimization capability record."""
    operations: dict[str, JSONValue] = {}
    for operation_name in sorted(_METHODS):
        if operation is None or operation == operation_name:
            operations[operation_name] = {
                "methods": {
                    name: dict(_METHODS[operation_name][name])
                    for name in sorted(_METHODS[operation_name])
                }
            }
    return {
        "schema_version": 1,
        "backend_policy": "exact-method ordinary-Python fallback",
        "operations": operations,
        "explicitly_unsupported": {
            "nonlinear_constraints": {
                "methods": ["cobyla"],
                "reason": "NLopt/PRIMA qualification and independent infeasibility gates are not yet integrated",
            },
            "sage_bounded_methods": {
                "methods": ["tnc", "l-bfgs-b"],
                "reason": "no exact qualified portable backend is integrated",
            },
            "sage_find_fit": {
                "methods": ["minpack-lmdif", "minpack-lmder"],
                "reason": "cminpack Wasm cross-platform qualification is still required",
            },
        },
    }


def supports(problem: NumericalProblem, method: str | None = None) -> bool:
    records = _METHODS.get(problem.operation)
    if records is None:
        return False
    selected = problem.method if method is None else str(method)
    if selected == "auto":
        return True
    return selected in records


def _automatic_method(problem: NumericalProblem) -> tuple[str, str]:
    if problem.operation == "scalar_minimum":
        return "bounded-brent", "a finite interval selects bounded Brent minimization"
    if problem.operation == "minimize":
        bound_values = problem.bounds.get("variables")
        if isinstance(bound_values, list) and any(
            item != [None, None] for item in bound_values
        ):
            return "projected-bfgs", "box bounds select projected BFGS"
        if problem.derivative is not None:
            return "bfgs", "an explicit gradient selects BFGS"
        return (
            "nelder-mead",
            "an opaque objective without derivatives selects Nelder-Mead",
        )
    if problem.operation == "nonlinear_system":
        return "damped-newton", "nonlinear systems use damped Newton iteration"
    if problem.operation in ("nonlinear_least_squares", "curve_fit"):
        return (
            "damped-gauss-newton",
            "least squares use a trust-damped Gauss-Newton step",
        )
    if problem.operation == "linear_fit":
        return "centered-linear-fit", "an affine model has a centered closed-form solve"
    raise NotImplementedError("planning is not implemented for " + problem.operation)


def plan(problem: NumericalProblem, method: str | None = None) -> NumericalPlan:
    """Resolve an optimization problem without evaluating a callback."""
    records = _METHODS.get(problem.operation)
    if records is None:
        raise NotImplementedError(
            "planning is not implemented for " + problem.operation
        )
    requested = problem.method if method is None else str(method)
    if requested == "auto":
        selected, reason = _automatic_method(problem)
    else:
        selected = requested.lower()
        reason = "the caller explicitly requested " + selected
    if selected not in records:
        raise ValueError("unsupported " + problem.operation + " method: " + selected)
    diagnostics: list[NumericalDiagnostic] = []
    if problem.derivative is None and selected in (
        "bfgs",
        "projected-bfgs",
        "damped-newton",
        "damped-gauss-newton",
    ):
        diagnostics.append(NumericalDiagnostic("finite_difference_derivative"))
    rejected: list[dict[str, Any]] = []
    for name in sorted(records):
        if name != selected:
            rejected.append(
                {"method": name, "reason": "not selected by the resolved policy"}
            )
    return NumericalPlan(
        problem,
        method=selected,
        backend="ordinary-python",
        reason=reason,
        capability=records[selected],
        fallback={
            "kind": "same-source",
            "backend": "ordinary-python",
            "method": selected,
        },
        expected_resources={
            "max_iterations": problem.resource_budget.max_iterations,
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        rejected_alternatives=rejected,
        diagnostics=diagnostics,
    )
