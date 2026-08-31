"""Independent stationarity, KKT, feasibility, and residual validation."""

from __future__ import annotations

import math
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalProblem, NumericalValidation
from ..trace import NumericalTrace, TracePolicy
from ._constraints import problem_constraints
from ._core import (
    CallbackFailure,
    Execution,
    StopExecution,
    infinity_norm,
    maximum_residual_dimension,
    normalized_bounds,
    projected_gradient,
    scalar,
    scaled_normal_equations,
    scaled_sum_of_squares,
    stable_norm,
    status_diagnostic,
    vector,
)

_MACHINE_EPSILON = 2.220446049250313e-16
_FINITE_DIFFERENCE_STEP = 6.055454452393343e-06
_SECOND_ORDER_STEP = _MACHINE_EPSILON**0.25


def _checked_validation_derivative(value: float) -> float:
    if not math.isfinite(value):
        raise StopExecution(
            "invalid_problem", "validation_derivative_outside_binary64_range"
        )
    return value


def _independent_bound_gradient(
    execution: Execution,
    function: Any,
    point: list[float],
    objective: float,
    lower: list[float | None],
    upper: list[float | None],
) -> list[float]:
    """Estimate a validation gradient independently of solver derivative code."""
    answer: list[float] = []
    for index in range(len(point)):
        step = _SECOND_ORDER_STEP * max(1.0, abs(point[index]))
        lower_value = lower[index]
        upper_value = upper[index]
        left_room = (
            float("inf") if lower_value is None else point[index] - float(lower_value)
        )
        right_room = (
            float("inf") if upper_value is None else float(upper_value) - point[index]
        )
        if left_room >= 2.0 * step and right_room >= 2.0 * step:
            left_two = list(point)
            left_one = list(point)
            right_one = list(point)
            right_two = list(point)
            left_two[index] -= 2.0 * step
            left_one[index] -= step
            right_one[index] += step
            right_two[index] += 2.0 * step
            left_two_value = scalar(execution.call("validation", function, left_two))
            left_one_value = scalar(execution.call("validation", function, left_one))
            right_one_value = scalar(execution.call("validation", function, right_one))
            right_two_value = scalar(execution.call("validation", function, right_two))
            answer.append(
                _checked_validation_derivative(
                    (
                        left_two_value
                        - 8.0 * left_one_value
                        + 8.0 * right_one_value
                        - right_two_value
                    )
                    / (12.0 * step)
                )
            )
        elif right_room > 0.0:
            actual = min(step, 0.5 * right_room)
            right_one = list(point)
            right_two = list(point)
            right_one[index] += actual
            right_two[index] += 2.0 * actual
            right_one_value = scalar(execution.call("validation", function, right_one))
            right_two_value = scalar(execution.call("validation", function, right_two))
            answer.append(
                _checked_validation_derivative(
                    (-3.0 * objective + 4.0 * right_one_value - right_two_value)
                    / (2.0 * actual)
                )
            )
        elif left_room > 0.0:
            actual = min(step, 0.5 * left_room)
            left_one = list(point)
            left_two = list(point)
            left_one[index] -= actual
            left_two[index] -= 2.0 * actual
            left_one_value = scalar(execution.call("validation", function, left_one))
            left_two_value = scalar(execution.call("validation", function, left_two))
            answer.append(
                _checked_validation_derivative(
                    (3.0 * objective - 4.0 * left_one_value + left_two_value)
                    / (2.0 * actual)
                )
            )
        else:
            answer.append(0.0)
    return answer


def _independent_jacobian(
    execution: Execution,
    function: Any,
    point: list[float],
    residual_count: int,
    maximum: int,
) -> list[list[float]]:
    """Estimate a validation Jacobian with separate step and conversion logic."""
    columns: list[list[float]] = []
    for index in range(len(point)):
        step = _SECOND_ORDER_STEP * max(1.0, abs(point[index]))
        left_two = list(point)
        left_one = list(point)
        right_one = list(point)
        right_two = list(point)
        left_two[index] -= 2.0 * step
        left_one[index] -= step
        right_one[index] += step
        right_two[index] += 2.0 * step
        left_two_value = vector(
            execution.call("validation", function, left_two),
            residual_count,
            maximum=maximum,
        )
        left_one_value = vector(
            execution.call("validation", function, left_one),
            residual_count,
            maximum=maximum,
        )
        right_one_value = vector(
            execution.call("validation", function, right_one),
            residual_count,
            maximum=maximum,
        )
        right_two_value = vector(
            execution.call("validation", function, right_two),
            residual_count,
            maximum=maximum,
        )
        columns.append(
            [
                _checked_validation_derivative(
                    (
                        left_two_value[row]
                        - 8.0 * left_one_value[row]
                        + 8.0 * right_one_value[row]
                        - right_two_value[row]
                    )
                    / (12.0 * step)
                )
                for row in range(residual_count)
            ]
        )
    return [
        [columns[column][row] for column in range(len(point))]
        for row in range(residual_count)
    ]


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
    scale = max(1.0, abs(point), abs(lower), abs(upper))
    active_tolerance = max(
        8.0 * _MACHINE_EPSILON * scale,
        float(problem.tolerances["xtol"])
        + float(problem.tolerances["rtol"]) * abs(point),
    )
    at_lower = point - lower <= active_tolerance
    at_upper = upper - point <= active_tolerance
    left_room = max(0.0, point - lower)
    right_room = max(0.0, upper - point)
    nominal_step = _FINITE_DIFFERENCE_STEP * max(1.0, abs(point))
    probe_resolved = False
    if at_lower:
        step = min(nominal_step, right_room)
        right = point + step
        right_value = scalar(execution.call("validation", function, right))
        derivative = (
            (right_value - objective) / (right - point) if right > point else 0.0
        )
        probe_resolved = right > point and right_value != objective
        kkt_residual = max(0.0, -derivative)
    elif at_upper:
        step = min(nominal_step, left_room)
        left = point - step
        left_value = scalar(execution.call("validation", function, left))
        derivative = (objective - left_value) / (point - left) if left < point else 0.0
        probe_resolved = left < point and left_value != objective
        kkt_residual = max(0.0, derivative)
    else:
        step = min(nominal_step, 0.5 * left_room, 0.5 * right_room)
        if step <= 0.0:
            return NumericalValidation(
                "indeterminate",
                False,
                checks=[{"kind": "finite_difference_probe", "passed": False}],
            )
        left = point - step
        right = point + step
        left_value = scalar(execution.call("validation", function, left))
        right_value = scalar(execution.call("validation", function, right))
        derivative = (right_value - left_value) / (2.0 * step)
        probe_resolved = left_value != objective or right_value != objective
        kkt_residual = abs(derivative)
    derivative = _checked_validation_derivative(derivative)
    threshold = max(1.0e-6, float(problem.tolerances["gtol"]) * 10.0)
    feasible = lower <= point <= upper
    stationary = kkt_residual <= threshold and probe_resolved
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
                "passed": kkt_residual <= threshold,
                "value": kkt_residual,
                "threshold": threshold,
                "finite_difference_derivative": derivative,
            },
            {"kind": "objective_probe_resolution", "passed": probe_resolved},
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
    constraints = problem_constraints(problem)
    if len(constraints) != 0:
        return _constrained_minimize_validation(problem, point, execution, lower, upper)
    objective = scalar(execution.call("validation", function, point))
    gradient = _independent_bound_gradient(
        execution, function, point, objective, lower, upper
    )
    projected = projected_gradient(point, gradient, lower, upper)
    residual = infinity_norm(projected)
    threshold = max(2.0e-6, float(problem.tolerances["gtol"]) * 20.0)
    maximum_relative_local_decrease = 0.0
    movable_probe_count = 0
    resolved_probe = False
    for index in range(len(point)):
        step = 6.055454452393343e-06 * max(1.0, abs(point[index]))
        for direction in (-1.0, 1.0):
            candidate = list(point)
            candidate[index] += direction * step
            for item in range(len(candidate)):
                lower_value = lower[item]
                upper_value = upper[item]
                if lower_value is not None:
                    candidate[item] = max(float(lower_value), candidate[item])
                if upper_value is not None:
                    candidate[item] = min(float(upper_value), candidate[item])
            if candidate == point:
                continue
            movable_probe_count += 1
            candidate_objective = scalar(
                execution.call("validation", function, candidate)
            )
            resolved_probe = resolved_probe or candidate_objective != objective
            comparison_scale = max(abs(objective), abs(candidate_objective))
            if comparison_scale > 0.0:
                relative_decrease = max(
                    0.0,
                    objective / comparison_scale
                    - candidate_objective / comparison_scale,
                )
                maximum_relative_local_decrease = max(
                    maximum_relative_local_decrease, relative_decrease
                )
    local_threshold = max(1.0e-12, float(problem.tolerances["ftol"]) * 10.0)
    locally_minimal = maximum_relative_local_decrease <= local_threshold
    numerically_resolved = movable_probe_count == 0 or resolved_probe
    feasible = True
    for index in range(len(point)):
        lower_value = lower[index]
        upper_value = upper[index]
        if lower_value is not None and point[index] < float(lower_value) - 1.0e-12:
            feasible = False
        if upper_value is not None and point[index] > float(upper_value) + 1.0e-12:
            feasible = False
    gradient_stationary = residual <= threshold
    stationary = gradient_stationary and locally_minimal and numerically_resolved
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
                "maximum_relative_sampled_decrease": maximum_relative_local_decrease,
                "threshold": local_threshold,
            },
            {
                "kind": "objective_probe_resolution",
                "passed": numerically_resolved,
                "movable_probe_count": movable_probe_count,
            },
            {"kind": "finite_objective", "passed": math.isfinite(objective)},
        ],
        residual=residual,
    )


def _constrained_minimize_validation(
    problem: NumericalProblem,
    point: list[float],
    execution: Execution,
    lower: list[float | None],
    upper: list[float | None],
) -> NumericalValidation:
    """Independently check feasibility and feasible local objective probes."""
    function = problem.function
    if function is None:
        return NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "callback_available", "passed": False}],
        )
    constraints = problem_constraints(problem)
    objective = scalar(execution.call("validation", function, point))
    values: list[float] = []
    adjusted_violations: list[float] = []
    equality_gradients: list[list[float]] = []
    for item in constraints:
        constraint_value = scalar(execution.call("validation", item.function, point))
        values.append(constraint_value)
        violation = (
            max(0.0, -item.tolerance - constraint_value)
            if item.kind == "inequality"
            else max(0.0, abs(constraint_value) - item.tolerance)
        )
        adjusted_violations.append(violation)
        if item.kind == "equality":
            equality_gradients.append(
                _independent_bound_gradient(
                    execution,
                    item.function,
                    point,
                    constraint_value,
                    lower,
                    upper,
                )
            )

    bound_tolerance = max(1.0e-10, float(problem.tolerances["xtol"]) * 10.0)
    bound_violation = 0.0
    for index in range(len(point)):
        lower_value = lower[index]
        upper_value = upper[index]
        if lower_value is not None:
            bound_violation = max(
                bound_violation,
                float(lower_value) - point[index] - bound_tolerance,
            )
        if upper_value is not None:
            bound_violation = max(
                bound_violation,
                point[index] - float(upper_value) - bound_tolerance,
            )
    bound_violation = max(0.0, bound_violation)
    maximum_violation = max([bound_violation] + adjusted_violations)
    feasible = maximum_violation == 0.0

    # Build an independent orthonormal equality-normal basis, then poll both
    # coordinate and equality-tangent directions. Only independently feasible
    # candidates are allowed to support the local-minimum conclusion.
    equality_normals: list[list[float]] = []
    for gradient in equality_gradients:
        residual_gradient = list(gradient)
        for normal in equality_normals:
            coefficient = sum(
                residual_gradient[index] * normal[index] for index in range(len(point))
            )
            residual_gradient = [
                residual_gradient[index] - coefficient * normal[index]
                for index in range(len(point))
            ]
        norm = math.sqrt(sum(item * item for item in residual_gradient))
        if norm > 1.0e-10:
            equality_normals.append([item / norm for item in residual_gradient])

    directions: list[list[float]] = []
    for coordinate in range(len(point)):
        basis = [0.0 for _ in point]
        basis[coordinate] = 1.0
        directions.append(basis)
        tangent = list(basis)
        for normal in equality_normals:
            coefficient = sum(
                tangent[index] * normal[index] for index in range(len(point))
            )
            tangent = [
                tangent[index] - coefficient * normal[index]
                for index in range(len(point))
            ]
        norm = math.sqrt(sum(item * item for item in tangent))
        if norm > 1.0e-10:
            directions.append([item / norm for item in tangent])

    step = _SECOND_ORDER_STEP * max(1.0, infinity_norm(point))
    feasible_probe_count = 0
    resolved_probe = False
    maximum_relative_local_decrease = 0.0
    for direction in directions:
        for sign in (-1.0, 1.0):
            candidate = [
                point[index] + sign * step * direction[index]
                for index in range(len(point))
            ]
            for index in range(len(candidate)):
                lower_value = lower[index]
                upper_value = upper[index]
                if lower_value is not None:
                    candidate[index] = max(float(lower_value), candidate[index])
                if upper_value is not None:
                    candidate[index] = min(float(upper_value), candidate[index])
            if candidate == point:
                continue
            candidate_feasible = True
            for item in constraints:
                candidate_value = scalar(
                    execution.call("validation", item.function, candidate)
                )
                if item.kind == "inequality":
                    candidate_feasible = (
                        candidate_feasible and candidate_value >= -item.tolerance
                    )
                else:
                    candidate_feasible = (
                        candidate_feasible and abs(candidate_value) <= item.tolerance
                    )
            if not candidate_feasible:
                continue
            feasible_probe_count += 1
            candidate_objective = scalar(
                execution.call("validation", function, candidate)
            )
            resolved_probe = resolved_probe or candidate_objective != objective
            comparison_scale = max(abs(objective), abs(candidate_objective))
            if comparison_scale > 0.0:
                maximum_relative_local_decrease = max(
                    maximum_relative_local_decrease,
                    max(
                        0.0,
                        objective / comparison_scale
                        - candidate_objective / comparison_scale,
                    ),
                )

    isolated_by_equalities = len(equality_normals) >= len(point)
    probe_resolved = isolated_by_equalities or (
        feasible_probe_count > 0 and resolved_probe
    )
    local_threshold = max(1.0e-10, float(problem.tolerances["ftol"]) * 20.0)
    locally_minimal = (
        maximum_relative_local_decrease <= local_threshold and probe_resolved
    )
    passed = feasible and locally_minimal and math.isfinite(objective)
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "independent_constraint_feasibility",
                "passed": feasible,
                "values": values,
                "adjusted_violations": adjusted_violations,
                "bound_violation": bound_violation,
                "maximum_violation": maximum_violation,
            },
            {
                "kind": "independent_feasible_direction_local_minimum",
                "passed": locally_minimal,
                "feasible_probe_count": feasible_probe_count,
                "equality_rank": len(equality_normals),
                "maximum_relative_sampled_decrease": maximum_relative_local_decrease,
                "threshold": local_threshold,
            },
            {"kind": "finite_objective", "passed": math.isfinite(objective)},
        ],
        residual=maximum_violation,
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
    maximum = maximum_residual_dimension(len(point))
    residual_vector = vector(
        execution.call("validation", function, point), maximum=maximum
    )
    jacobian = _independent_jacobian(
        execution, function, point, len(residual_vector), maximum
    )
    _, gradient, normalization_scale, scale_resolved = scaled_normal_equations(
        jacobian, residual_vector
    )
    stationarity = infinity_norm(gradient)
    residual_norm = stable_norm(residual_vector)
    threshold = max(2.0e-6, float(problem.tolerances["gtol"]) * 20.0)
    maximum_relative_local_decrease = 0.0
    minimum_coordinate_curvature = float("inf")
    objective_probe_resolved = False
    for index in range(len(point)):
        step = _SECOND_ORDER_STEP * max(1.0, abs(point[index]))
        left = list(point)
        right = list(point)
        left[index] -= step
        right[index] += step
        left_residual = vector(
            execution.call("validation", function, left),
            len(residual_vector),
            maximum=maximum,
        )
        right_residual = vector(
            execution.call("validation", function, right),
            len(residual_vector),
            maximum=maximum,
        )
        base_scale, base_sum = scaled_sum_of_squares(residual_vector)
        left_scale, left_sum = scaled_sum_of_squares(left_residual)
        right_scale, right_sum = scaled_sum_of_squares(right_residual)
        comparison_scale = max(base_scale, left_scale, right_scale)
        if comparison_scale == 0.0:
            base_cost = 0.0
            left_cost = 0.0
            right_cost = 0.0
        else:
            base_ratio = base_scale / comparison_scale
            left_ratio = left_scale / comparison_scale
            right_ratio = right_scale / comparison_scale
            base_cost = 0.5 * base_ratio * base_ratio * base_sum
            left_cost = 0.5 * left_ratio * left_ratio * left_sum
            right_cost = 0.5 * right_ratio * right_ratio * right_sum
        objective_probe_resolved = objective_probe_resolved or (
            left_cost != base_cost or right_cost != base_cost
        )
        if base_cost > 0.0:
            maximum_relative_local_decrease = max(
                maximum_relative_local_decrease,
                max(0.0, (base_cost - left_cost) / base_cost),
                max(0.0, (base_cost - right_cost) / base_cost),
            )
        curvature = (left_cost - 2.0 * base_cost + right_cost) / (step * step)
        minimum_coordinate_curvature = min(minimum_coordinate_curvature, curvature)
    relative_value_tolerance = 128.0 * _MACHINE_EPSILON
    stationary = scale_resolved and stationarity <= threshold
    locally_minimal = maximum_relative_local_decrease <= relative_value_tolerance
    norm_representable = residual_norm is not None
    passed = (
        stationary
        and locally_minimal
        and objective_probe_resolved
        and norm_representable
    )
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "independent_least_squares_stationarity",
                "passed": stationary,
                "value": stationarity,
                "threshold": threshold,
                "normalization_scale": normalization_scale,
                "scale_resolved": scale_resolved,
            },
            {
                "kind": "coordinate_second_order_minimum",
                "passed": locally_minimal,
                "maximum_relative_sampled_decrease": maximum_relative_local_decrease,
                "relative_value_tolerance": relative_value_tolerance,
                "minimum_sampled_curvature": minimum_coordinate_curvature,
            },
            {
                "kind": "objective_probe_resolution",
                "passed": objective_probe_resolved,
            },
            {
                "kind": "residual_norm",
                "passed": norm_representable,
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
) -> tuple[
    NumericalValidation,
    list[NumericalDiagnostic],
    tuple[str, str | None] | None,
]:
    """Validate a solver candidate using separate formulas and callbacks."""
    diagnostics: list[NumericalDiagnostic] = []
    execution_failure: tuple[str, str | None] | None = None
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
    except StopExecution as stop:
        execution_failure = (stop.status, stop.reason)
        item = status_diagnostic(stop.status, stop.reason)
        if item is not None:
            diagnostics.append(item)
        validation = _validation_failure("validation_execution", diagnostics)
    except CallbackFailure as failure:
        execution_failure = ("callback_error", failure.error_type)
        diagnostics.append(
            NumericalDiagnostic(
                "callback_error",
                details={"phase": "validation", "error_type": failure.error_type},
            )
        )
        validation = _validation_failure("validation_execution", diagnostics)
    if solver_status == "converged" and not validation.passed:
        if not any(item.code == "validation_failed" for item in diagnostics):
            diagnostics.append(
                NumericalDiagnostic(
                    "validation_failed", details={"solver_status": solver_status}
                )
            )
    return validation, diagnostics, execution_failure


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
    validation, _, _ = validate_with_execution(
        problem, result.value, execution, result.status
    )
    return validation
