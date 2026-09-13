"""Qualified ODE capability records and side-effect-free planning."""

from __future__ import annotations

from .._json import JSONValue
from ..model import NumericalPlan
from .model import OdeProblem, OdeUnsupportedError
from .rosenbrock import rosenbrock4_workspace_bytes

ODE_CAPABILITY_SCHEMA_VERSION = 1

_IMPLEMENTATION_PLATFORMS: list[JSONValue] = [
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
]
_IMPLEMENTATION_RUNTIMES: list[JSONValue] = [
    "browser",
    "node",
    "sea",
    "cpython",
]

_METHODS: dict[str, dict[str, JSONValue]] = {
    "rk4": {
        "classification": "extension",
        "status": "implemented",
        "backend": "ordinary-python",
        "family": "explicit_fixed_step_runge_kutta",
        "orders": {"solution": 4, "dense_output": 3},
        "numeric_types": ["binary64-real"],
        "error_control": "none",
        "dense_output": "cubic_hermite",
        "events": "sign_changes_on_accepted_steps",
        "stiff": False,
        "platforms": _IMPLEMENTATION_PLATFORMS,
        "runtimes": _IMPLEMENTATION_RUNTIMES,
    },
    "rk45": {
        "classification": "translated",
        "status": "implemented",
        "backend": "ordinary-python",
        "family": "dormand_prince_5_4",
        "orders": {"solution": 5, "error_estimator": 4, "dense_output": 4},
        "numeric_types": ["binary64-real"],
        "error_control": "weighted_rms_local_extrapolation",
        "dense_output": "shampine_quartic",
        "events": "sign_changes_on_accepted_steps",
        "stiff": False,
        "platforms": _IMPLEMENTATION_PLATFORMS,
        "runtimes": _IMPLEMENTATION_RUNTIMES,
    },
    "rosenbrock4": {
        "classification": "translated",
        "status": "implemented",
        "backend": "ordinary-python",
        "family": "kaps_rentrop_rosenbrock_4_3",
        "orders": {"solution": 4, "error_estimator": 3},
        "numeric_types": ["binary64-real"],
        "error_control": "weighted_rms_embedded_estimate",
        "dense_output": "endpoint_derivative_cubic_hermite",
        "events": "sign_changes_on_accepted_dense_steps",
        "jacobian": ["supplied_dense", "forward_finite_difference_dense"],
        "linear_solver": "partial_pivoting_dense_lu_with_residual_check",
        "nonlinear_solver": "not_applicable_linearly_implicit_no_newton_iterations",
        "stiff": True,
        "automatic_selection": False,
        "platforms": _IMPLEMENTATION_PLATFORMS,
        "runtimes": _IMPLEMENTATION_RUNTIMES,
    },
}

_UNSUPPORTED: dict[str, dict[str, JSONValue]] = {
    "bdf": {
        "classification": "unsupported",
        "reason": "no qualified implicit nonlinear/linear solve path is available in this dependency-free lane",
        "alternative": "SciPy BDF or SUNDIALS CVODE outside Sage.js",
    },
    "cvode": {
        "classification": "unsupported",
        "reason": "SUNDIALS has not yet passed Sage.js Wasm, payload, callback, and four-platform qualification",
        "alternative": "SUNDIALS CVODE outside Sage.js",
    },
    "dop853": {
        "classification": "unsupported",
        "reason": "the higher-order tableau and dense extension have not been implemented and qualified",
        "alternative": "rk45 or SciPy DOP853",
    },
    "lsoda": {
        "classification": "unsupported",
        "reason": "there is no qualified ODEPACK/Fortran runtime or automatic stiffness-switching path",
        "alternative": "SciPy LSODA outside Sage.js",
    },
    "radau": {
        "classification": "unsupported",
        "reason": "a collocation solve requires a qualified Jacobian, linear solve, and nonlinear iteration contract",
        "alternative": "SciPy Radau or SUNDIALS ARKStep outside Sage.js",
    },
    "rk23": {
        "classification": "unsupported",
        "reason": "only the RK4 baseline and Dormand-Prince 5(4) production path are qualified",
        "alternative": "rk45",
    },
    "sundials": {
        "classification": "unsupported",
        "reason": "the native/Wasm dependency and callback boundary have not been qualified",
        "alternative": "SUNDIALS ARKODE or CVODE outside Sage.js",
    },
}


def ode_capabilities() -> dict[str, JSONValue]:
    """Return the detached implemented and explicitly unsupported ODE surface."""
    return {
        "schema_version": ODE_CAPABILITY_SCHEMA_VERSION,
        "operation": "initial_value_problem",
        "implemented_methods": {
            name: dict(record) for name, record in sorted(_METHODS.items())
        },
        "unsupported_methods": {
            name: dict(record) for name, record in sorted(_UNSUPPORTED.items())
        },
        "supported_state": {
            "kind": "real_binary64_vector",
            "minimum_dimension": 1,
            "complex": False,
            "mass_matrix": False,
            "differential_algebraic": False,
        },
        "implementation_targets": {
            "platforms": list(_IMPLEMENTATION_PLATFORMS),
            "runtimes": list(_IMPLEMENTATION_RUNTIMES),
            "qualification": "declared targets only; exact receipts are owned by P8",
        },
        "parameter_sweeps": {
            "classification": "extension",
            "status": "implemented",
            "scheduler": "bounded-batch-v1",
            "ordering": "stable_input_order",
            "seeds": "deterministic_per_item",
            "default_executor": "portable_sequential",
            "concurrency": "explicit_host_batch_executor",
            "nested_accounting": "ode_result_evaluations_logical_memory_and_serialized_result",
        },
        "limitations": [
            "auto selects explicit RK45 and performs no stiffness detection",
            "rosenbrock4 uses dense Jacobians and cubic workspace",
            "events without a sampled sign change can be missed",
            "local error control is not a global error bound",
            "browser worker concurrency requires a separately qualified host executor",
        ],
    }


def supports_ode(problem: OdeProblem, method: str | None = None) -> bool:
    """Return whether a problem requests a currently qualified method."""
    requested = problem.method if method is None else str(method).lower()
    return requested == "auto" or requested in _METHODS


def plan_ode(problem: OdeProblem, method: str | None = None) -> NumericalPlan:
    """Resolve an ODE problem without evaluating any callback."""
    if problem.operation != "initial_value_problem":
        raise TypeError("plan_ode requires an ODE initial-value problem")
    requested = problem.method if method is None else str(method).lower()
    if requested == "auto":
        selected = "rk45"
        reason = "automatic planning selects the adaptive Dormand-Prince 5(4) nonstiff baseline"
    else:
        selected = requested
        reason = "the caller explicitly requested " + selected
    if selected in _UNSUPPORTED:
        record = _UNSUPPORTED[selected]
        raise OdeUnsupportedError(
            selected,
            str(record["reason"]),
            [str(record["alternative"])],
        )
    if selected not in _METHODS:
        raise OdeUnsupportedError(
            selected,
            "the method is not classified in the ODE capability surface",
            ["rk45", "rk4", "rosenbrock4"],
        )
    rejected: list[dict[str, JSONValue]] = []
    for name in sorted(_METHODS):
        if name != selected:
            rejected.append(
                {"method": name, "reason": "not selected by the resolved policy"}
            )
    for name, record in sorted(_UNSUPPORTED.items()):
        rejected.append({"method": name, "reason": str(record["reason"])})
    budget = problem.ode_budget
    return NumericalPlan(
        problem,
        method=selected,
        backend="ordinary-python",
        reason=reason,
        capability=_METHODS[selected],
        fallback={
            "method": "rk4" if selected == "rk45" else "none",
            "automatic": False,
            "reason": "falling back silently would change the error-control contract",
        },
        expected_resources={
            "max_steps": budget.max_steps,
            "max_evaluations": budget.max_evaluations,
            "max_elapsed_ms": budget.max_elapsed_ms,
            "max_output_points": budget.max_output_points,
            "state_dimension": len(problem.y0),
            "estimated_workspace_bytes": rosenbrock4_workspace_bytes(len(problem.y0))
            if selected == "rosenbrock4"
            else 0,
        },
        rejected_alternatives=rejected,
    )
