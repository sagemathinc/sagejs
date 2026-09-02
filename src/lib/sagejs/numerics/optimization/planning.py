"""Inspectable method-specific planning for optimization and fitting."""

from __future__ import annotations

from typing import Any

from .._json import JSONValue
from ..diagnostics import NumericalDiagnostic
from ..model import NumericalPlan, NumericalProblem
from ._core import MAX_DENSE_DIMENSION

_PLATFORMS = ["linux-x64"]
_QUALIFIED_RUNTIMES = ["cpython", "sagejs-node"]
_CMINPACK_PLATFORMS = [
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
]
_CMINPACK_RUNTIMES = ["sagejs-node", "sagejs-browser", "sagejs-sea"]
_NLOPT_PLATFORMS = list(_CMINPACK_PLATFORMS)
_NLOPT_RUNTIMES = list(_CMINPACK_RUNTIMES)


def _cminpack_record(method: str, operation: str) -> dict[str, Any]:
    return {
        "classification": "extension",
        "backend": "cminpack-wasm",
        "selection": "explicit-only",
        "derivatives": ["analytic"]
        if method == "cminpack-lmder"
        else ["forward_finite_difference"],
        "validation": ["independent_residual", "independent_stationarity"],
        "views": _view_contract(operation, "none"),
        "max_dimension": MAX_DENSE_DIMENSION,
        "max_residual_dimension": 16_384,
        "platforms": _CMINPACK_PLATFORMS,
        "runtimes": _CMINPACK_RUNTIMES,
    }


def _nlopt_record(method: str) -> dict[str, Any]:
    if method != "nlopt-nelder-mead":
        raise ValueError("only the qualified NLopt Nelder-Mead identity is available")
    return {
        "classification": "extension",
        "backend": "nlopt-mit-wasm",
        "selection": "explicit-only",
        "constraints": ["box_bounds"],
        "derivatives": ["none"],
        "validation": [
            "independent_objective_finiteness",
            "independent_box_feasibility",
            "empirical_projected_stationarity_consistency",
            "bounded_feasible_objective_probes",
        ],
        "truth_level": "heuristic",
        "optimality": "local_and_global_not_certified",
        "max_dimension": 32,
        "validation_envelope": {
            "active_bounds": "strict_complementarity_or_indeterminate",
            "active_nonlinear_constraints": "unsupported",
            "nonlinear_equalities": "unsupported",
            "sampled_feasible_decrease": (
                "any_representably_lower_sample_vetoes_heuristic_success"
            ),
            "probe_geometry": "bounded_deterministic_coordinate_scaled",
            "black_box_limitation": "finite_probes_do_not_certify_local_optimality",
        },
        "views": _view_contract("minimize", "box_bounds"),
        "platforms": _NLOPT_PLATFORMS,
        "runtimes": _NLOPT_RUNTIMES,
    }


def _view_contract(operation: str, constraints: str) -> dict[str, Any]:
    primary = {
        "scalar_minimum": "retained_objective_and_incumbent_path",
        "minimize": "parameter_path_or_convergence_history",
        "nonlinear_system": "parameter_path_or_residual_history",
        "nonlinear_least_squares": "parameter_path_or_cost_history",
        "curve_fit": "observations_model_and_residual_sticks",
        "linear_fit": "observations_model_and_residual_sticks",
    }[operation]
    return {
        "explanation": {
            "structured": "optimization-explanation/v1",
            "text": True,
            "failure_narrative": True,
            "callback_replay": False,
            "identifiability": operation
            in ("nonlinear_least_squares", "curve_fit", "linear_fit"),
        },
        "static": {
            "kind": "plot-spec",
            "primary_view": primary,
            "accessible_description": True,
            "canonical_axes": True,
            "callback_replay": False,
        },
        "animation": {
            "kind": "plot-animation",
            "requires_retained_trace": True,
            "max_frames": 128,
            "controls": ["play", "pause", "iteration_slider"],
            "static_fallback": True,
            "callback_replay": False,
        },
        "constraints": constraints,
    }


_METHODS: dict[str, dict[str, dict[str, Any]]] = {
    "scalar_minimum": {
        "bounded-brent": {
            "classification": "translated",
            "backend": "ordinary-python",
            "constraints": ["finite_interval"],
            "derivatives": ["none"],
            "validation": ["feasibility", "projected_stationarity"],
            "views": _view_contract("scalar_minimum", "finite_interval"),
            "platforms": _PLATFORMS,
        }
    },
    "minimize": {
        "nlopt-nelder-mead": _nlopt_record("nlopt-nelder-mead"),
        "nelder-mead": {
            "classification": "translated",
            "backend": "ordinary-python",
            "constraints": ["none"],
            "derivatives": ["none"],
            "validation": ["finite_difference_stationarity"],
            "views": _view_contract("minimize", "none"),
            "max_dimension": 64,
            "platforms": _PLATFORMS,
        },
        "bfgs": {
            "classification": "translated",
            "backend": "ordinary-python",
            "constraints": ["none"],
            "derivatives": ["analytic", "central_finite_difference"],
            "validation": ["independent_finite_difference_stationarity"],
            "views": _view_contract("minimize", "none"),
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        },
        "projected-bfgs": {
            "classification": "extension",
            "backend": "ordinary-python",
            "constraints": ["box_bounds"],
            "derivatives": ["analytic", "bound_aware_finite_difference"],
            "validation": ["feasibility", "projected_gradient_kkt"],
            "views": _view_contract("minimize", "two_dimensional_box_projection"),
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
            "views": _view_contract("nonlinear_system", "none"),
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        }
    },
    "nonlinear_least_squares": {
        "cminpack-lmdif": _cminpack_record("cminpack-lmdif", "nonlinear_least_squares"),
        "cminpack-lmder": _cminpack_record("cminpack-lmder", "nonlinear_least_squares"),
        "damped-gauss-newton": {
            "classification": "extension",
            "backend": "ordinary-python",
            "derivatives": ["analytic", "central_finite_difference"],
            "validation": ["residual_norm", "independent_stationarity"],
            "views": _view_contract("nonlinear_least_squares", "none"),
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        },
    },
    "curve_fit": {
        "cminpack-lmdif": _cminpack_record("cminpack-lmdif", "curve_fit"),
        "cminpack-lmder": _cminpack_record("cminpack-lmder", "curve_fit"),
        "damped-gauss-newton": {
            "classification": "extension",
            "backend": "ordinary-python",
            "derivatives": ["analytic", "central_finite_difference"],
            "validation": ["residual_norm", "independent_stationarity"],
            "views": _view_contract("curve_fit", "none"),
            "max_dimension": MAX_DENSE_DIMENSION,
            "platforms": _PLATFORMS,
        },
    },
    "linear_fit": {
        "centered-linear-fit": {
            "classification": "extension",
            "backend": "ordinary-python",
            "derivatives": ["analytic"],
            "validation": ["normal_equations", "residual_norm"],
            "views": _view_contract("linear_fit", "none"),
            "max_dimension": 2,
            "platforms": _PLATFORMS,
        }
    },
}


def _detached(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _detached(value[key]) for key in value}
    if isinstance(value, list):
        return [_detached(item) for item in value]
    return value


def capabilities(operation: str | None = None) -> dict[str, JSONValue]:
    """Return the detached package-local optimization capability record."""
    operations: dict[str, JSONValue] = {}
    for operation_name in sorted(_METHODS):
        if operation is None or operation == operation_name:
            operations[operation_name] = {
                "methods": {
                    name: _detached(_METHODS[operation_name][name])
                    for name in sorted(_METHODS[operation_name])
                }
            }
    return {
        "schema_version": 1,
        "backend_policy": "exact-method ordinary-Python fallback",
        "qualification": {
            "platforms": list(_PLATFORMS),
            "runtimes": list(_QUALIFIED_RUNTIMES),
            "browser": False,
            "sea": False,
            "four_platform_release": False,
            "cminpack": {
                "platforms": list(_CMINPACK_PLATFORMS),
                "runtimes": list(_CMINPACK_RUNTIMES),
                "selection": "explicit-only",
                "automatic_selection": False,
            },
            "nlopt": {
                "platforms": list(_NLOPT_PLATFORMS),
                "runtimes": list(_NLOPT_RUNTIMES),
                "selection": "explicit-only",
                "automatic_selection": False,
            },
        },
        "operations": operations,
        "explicitly_unsupported": {
            "nonlinear_constraints": {
                "methods": ["cobyla", "nlopt-cobyla"],
                "reason": "COBYLA is deferred because the selected upstream f2c implementation has unresolved formal pointer-provenance undefined behavior; a modern PRIMA integration is planned",
            },
            "automatic_nonlinear_constraints": {
                "methods": ["auto"],
                "reason": "no sanitizer-clean portable nonlinear-constraint backend is qualified",
            },
            "sage_bounded_methods": {
                "methods": ["tnc", "l-bfgs-b"],
                "reason": "no exact qualified portable backend is integrated",
            },
        },
    }


def supports(problem: NumericalProblem, method: str | None = None) -> bool:
    records = _METHODS.get(problem.operation)
    if records is None:
        return False
    selected = problem.method if method is None else str(method)
    if selected == "auto":
        try:
            selected, _ = _automatic_method(problem)
        except (NotImplementedError, ValueError):
            return False
    return (
        selected.lower() in records
        and _method_envelope_error(problem, selected.lower()) is None
    )


def _has_box_bounds(problem: NumericalProblem) -> bool:
    values = problem.bounds.get("variables")
    return isinstance(values, list) and any(item != [None, None] for item in values)


def _problem_dimension(problem: NumericalProblem) -> int | None:
    point = problem.initial_data.get("point")
    if isinstance(point, list):
        return len(point)
    if problem.operation == "scalar_minimum":
        return 1
    return None


def _method_envelope_error(problem: NumericalProblem, selected: str) -> str | None:
    record = _METHODS.get(problem.operation, {}).get(selected)
    if record is None:
        return "unsupported " + problem.operation + " method: " + selected
    dimension = _problem_dimension(problem)
    maximum = record.get("max_dimension")
    if isinstance(dimension, int) and isinstance(maximum, int) and dimension > maximum:
        return selected + " exceeds its validated dimension envelope"
    maximum_constraints = record.get("max_constraints")
    if (
        isinstance(maximum_constraints, int)
        and len(problem.constraints) > maximum_constraints
    ):
        return selected + " exceeds its validated constraint envelope"
    bounded = _has_box_bounds(problem)
    constrained = len(problem.constraints) != 0
    if problem.operation == "minimize":
        if selected in ("nelder-mead", "bfgs") and bounded:
            return selected + " does not support box bounds"
        if selected == "projected-bfgs" and not bounded:
            return "projected-bfgs requires at least one finite box bound"
        if selected == "nlopt-nelder-mead" and constrained:
            return "nlopt-nelder-mead does not support nonlinear constraints"
        if constrained:
            return selected + " does not support nonlinear constraints"
    if selected == "cminpack-lmder" and problem.derivative is None:
        return "cminpack-lmder requires an explicit Jacobian callback"
    return None


def _automatic_method(problem: NumericalProblem) -> tuple[str, str]:
    if problem.operation == "scalar_minimum":
        return "bounded-brent", "a finite interval selects bounded Brent minimization"
    if problem.operation == "minimize":
        if len(problem.constraints) != 0:
            raise ValueError(
                "nonlinear constraints are unsupported until a sanitizer-clean portable backend is qualified"
            )
        bound_values = problem.bounds.get("variables")
        if isinstance(bound_values, list) and any(
            item != [None, None] for item in bound_values
        ):
            return "projected-bfgs", "box bounds select projected BFGS"
        if problem.derivative is not None:
            return "bfgs", "an explicit gradient selects BFGS"
        dimension = _problem_dimension(problem)
        if isinstance(dimension, int) and dimension > 64:
            return (
                "bfgs",
                "the dimension exceeds the validated Nelder-Mead envelope",
            )
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
    envelope_error = _method_envelope_error(problem, selected)
    if envelope_error is not None:
        raise ValueError(envelope_error)
    diagnostics: list[NumericalDiagnostic] = []
    if selected == "cminpack-lmdif" or (
        problem.derivative is None
        and selected
        in (
            "bfgs",
            "projected-bfgs",
            "damped-newton",
            "damped-gauss-newton",
        )
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
        backend=str(records[selected]["backend"]),
        reason=reason,
        capability=records[selected],
        fallback=(
            {
                "kind": "none",
                "reason": "an explicit external-library method cannot be substituted",
            }
            if selected.startswith("cminpack-") or selected.startswith("nlopt-")
            else {
                "kind": "same-source",
                "backend": "ordinary-python",
                "method": selected,
            }
        ),
        expected_resources={
            "max_iterations": problem.resource_budget.max_iterations,
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        rejected_alternatives=rejected,
        diagnostics=diagnostics,
    )
