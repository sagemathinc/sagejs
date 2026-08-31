"""Independent stationarity, KKT, feasibility, and residual validation."""

from __future__ import annotations

import math
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalProblem, NumericalValidation
from ..trace import NumericalTrace, TracePolicy
from ._core import (
    CallbackFailure,
    Execution,
    StopExecution,
    finite_difference_gradient,
    finite_difference_jacobian,
    infinity_norm,
    normal_equations,
    normalized_bounds,
    projected_gradient,
    scalar,
    vector,
)


def _validation_failure(
    kind: str, diagnostics: list[NumericalDiagnostic]
) -> NumericalValidation:
    diagnostics.append(NumericalDiagnostic("validation_failed"))
    return NumericalValidation(
        "indeterminate", False, checks=[{"kind": kind, "passed": False}]
    )


def _scalar_minimum_validation(
    problem: NumericalProblem, value: Any, execution: Execution
) -> NumericalValidation:
    function = problem.function
    if function is None or not isinstance(value, (int, float)):
        return NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "candidate_available", "passed": False}],
        )
    point = float(value)
    interval = problem.bounds.get("interval")
    if not isinstance(interval, list) or len(interval) != 2:
        return NumericalValidation(
            "indeterminate", False, checks=[{"kind": "bounds", "passed": False}]
        )
    lower = float(interval[0])
    upper = float(interval[1])
    objective = scalar(execution.call("validation", function, point))
    scale = max(1.0, abs(point))
    step = 6.055454452393343e-06 * scale
    at_lower = point - lower <= max(step, float(problem.tolerances["xtol"]) * 4.0)
    at_upper = upper - point <= max(step, float(problem.tolerances["xtol"]) * 4.0)
    if at_lower:
        right = min(upper, point + step)
        right_value = scalar(execution.call("validation", function, right))
        derivative = (
            (right_value - objective) / (right - point) if right > point else 0.0
        )
        kkt_residual = max(0.0, -derivative)
    elif at_upper:
        left = max(lower, point - step)
        left_value = scalar(execution.call("validation", function, left))
        derivative = (objective - left_value) / (point - left) if left < point else 0.0
        kkt_residual = max(0.0, derivative)
    else:
        left = point - step
        right = point + step
        left_value = scalar(execution.call("validation", function, left))
        right_value = scalar(execution.call("validation", function, right))
        derivative = (right_value - left_value) / (2.0 * step)
        kkt_residual = abs(derivative)
    threshold = max(1.0e-6, float(problem.tolerances["gtol"]) * 10.0)
    feasible = lower <= point <= upper
    stationary = kkt_residual <= threshold
    return NumericalValidation(
        "validated_approximate" if feasible and stationary else "indeterminate",
        feasible and stationary,
        checks=[
            {
                "kind": "bound_feasibility",
                "passed": feasible,
                "lower": lower,
                "upper": upper,
            },
            {
                "kind": "projected_stationarity",
                "passed": stationary,
                "value": kkt_residual,
                "threshold": threshold,
                "finite_difference_derivative": derivative,
            },
            {"kind": "finite_objective", "passed": math.isfinite(objective)},
        ],
        residual=kkt_residual,
    )


def _minimize_validation(
    problem: NumericalProblem, value: Any, execution: Execution
) -> NumericalValidation:
    function = problem.function
    if function is None:
        return NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "callback_available", "passed": False}],
        )
    point = vector(value)
    bounds_record = problem.bounds.get("variables")
    bound_input = bounds_record if isinstance(bounds_record, list) else None
    lower, upper = normalized_bounds(bound_input, len(point))
    objective = scalar(execution.call("validation", function, point))
    gradient = finite_difference_gradient(
        execution,
        function,
        point,
        lower,
        upper,
        callback_kind="validation",
    )
    projected = projected_gradient(point, gradient, lower, upper)
    residual = infinity_norm(projected)
    threshold = max(2.0e-6, float(problem.tolerances["gtol"]) * 20.0)
    local_decrease = 0.0
    for index in range(len(point)):
        step = 6.055454452393343e-06 * max(1.0, abs(point[index]))
        for direction in (-1.0, 1.0):
            candidate = list(point)
            candidate[index] += direction * step
            candidate = [
                max(float(lower[item]), candidate[item])
                if lower[item] is not None
                else candidate[item]
                for item in range(len(candidate))
            ]
            candidate = [
                min(float(upper[item]), candidate[item])
                if upper[item] is not None
                else candidate[item]
                for item in range(len(candidate))
            ]
            if candidate == point:
                continue
            candidate_objective = scalar(
                execution.call("validation", function, candidate)
            )
            local_decrease = max(local_decrease, objective - candidate_objective)
    local_threshold = max(
        1.0e-12 * max(1.0, abs(objective)),
        float(problem.tolerances["ftol"]) * 10.0,
    )
    locally_minimal = local_decrease <= local_threshold
    feasible = True
    for index in range(len(point)):
        if lower[index] is not None and point[index] < float(lower[index]) - 1.0e-12:
            feasible = False
        if upper[index] is not None and point[index] > float(upper[index]) + 1.0e-12:
            feasible = False
    gradient_stationary = residual <= threshold
    stationary = gradient_stationary or locally_minimal
    return NumericalValidation(
        "validated_approximate" if feasible and stationary else "indeterminate",
        feasible and stationary,
        checks=[
            {"kind": "box_feasibility", "passed": feasible},
            {
                "kind": "projected_gradient_kkt",
                "passed": gradient_stationary,
                "value": residual,
                "threshold": threshold,
                "gradient": gradient,
            },
            {
                "kind": "coordinate_local_minimum",
                "passed": locally_minimal,
                "maximum_sampled_decrease": local_decrease,
                "threshold": local_threshold,
            },
            {"kind": "finite_objective", "passed": math.isfinite(objective)},
        ],
        residual=min(residual, local_decrease / 6.055454452393343e-06),
    )


def _system_validation(
    problem: NumericalProblem, value: Any, execution: Execution
) -> NumericalValidation:
    function = problem.function
    if function is None:
        return NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "callback_available", "passed": False}],
        )
    point = vector(value)
    residual_vector = vector(execution.call("validation", function, point), len(point))
    residual = infinity_norm(residual_vector)
    threshold = float(problem.tolerances["ftol"])
    passed = residual <= threshold
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "independent_residual",
                "passed": passed,
                "value": residual,
                "threshold": threshold,
            }
        ],
        residual=residual,
    )


def _least_squares_validation(
    problem: NumericalProblem, value: Any, execution: Execution
) -> NumericalValidation:
    function = problem.function
    if function is None:
        return NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "callback_available", "passed": False}],
        )
    point = vector(value)
    residual_vector = vector(execution.call("validation", function, point))
    jacobian = finite_difference_jacobian(
        execution,
        function,
        point,
        len(residual_vector),
        callback_kind="validation",
    )
    _, gradient = normal_equations(jacobian, residual_vector)
    stationarity = infinity_norm(gradient)
    residual_norm = math.sqrt(sum(item * item for item in residual_vector))
    threshold = max(2.0e-6, float(problem.tolerances["gtol"]) * 20.0)
    passed = stationarity <= threshold
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "independent_least_squares_stationarity",
                "passed": passed,
                "value": stationarity,
                "threshold": threshold,
            },
            {
                "kind": "residual_norm",
                "passed": math.isfinite(residual_norm),
                "value": residual_norm,
            },
        ],
        residual=stationarity,
    )


def validate_with_execution(
    problem: NumericalProblem,
    value: Any,
    execution: Execution,
    solver_status: str,
) -> tuple[NumericalValidation, list[NumericalDiagnostic]]:
    """Validate a solver candidate using separate formulas and callbacks."""
    diagnostics: list[NumericalDiagnostic] = []
    try:
        if problem.operation == "scalar_minimum":
            validation = _scalar_minimum_validation(problem, value, execution)
        elif problem.operation == "minimize":
            validation = _minimize_validation(problem, value, execution)
        elif problem.operation == "nonlinear_system":
            validation = _system_validation(problem, value, execution)
        elif problem.operation in (
            "nonlinear_least_squares",
            "curve_fit",
            "linear_fit",
        ):
            validation = _least_squares_validation(problem, value, execution)
        else:
            validation = NumericalValidation(
                "indeterminate",
                False,
                checks=[{"kind": "supported_operation", "passed": False}],
            )
    except (StopExecution, CallbackFailure):
        validation = _validation_failure("validation_execution", diagnostics)
    if solver_status == "converged" and not validation.passed:
        if not any(item.code == "validation_failed" for item in diagnostics):
            diagnostics.append(
                NumericalDiagnostic(
                    "validation_failed", details={"solver_status": solver_status}
                )
            )
    return validation, diagnostics


def validate_result(result: Any) -> NumericalValidation:
    """Repeat independent validation without mutating the original receipt."""
    problem = result.problem
    trace = NumericalTrace(
        TracePolicy(
            "none",
            max_events=max(2, problem.trace_policy.max_events),
            max_bytes=max(1024, problem.trace_policy.max_bytes),
        )
    )
    execution = Execution(problem, trace, None)
    validation, _ = validate_with_execution(
        problem, result.value, execution, result.status
    )
    return validation
