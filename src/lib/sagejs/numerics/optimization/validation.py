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
    solve_linear_system,
    stable_norm,
    status_diagnostic,
    vector,
)

_MACHINE_EPSILON = 2.220446049250313e-16
_FINITE_DIFFERENCE_STEP = 6.055454452393343e-06
_SECOND_ORDER_STEP = _MACHINE_EPSILON**0.25
_MAX_LOCAL_DIRECTIONS = 192
_MAX_KKT_NORMALS = 64


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


def _project_away_normals(
    vector_value: list[float], normals: list[list[float]]
) -> list[float]:
    """Project a vector onto the complement of an orthonormal normal basis."""
    answer = list(vector_value)
    for normal in normals:
        coefficient = sum(answer[index] * normal[index] for index in range(len(answer)))
        answer = [
            answer[index] - coefficient * normal[index] for index in range(len(answer))
        ]
    return answer


def _orthonormal_normals(gradients: list[list[float]]) -> list[list[float]]:
    answer: list[list[float]] = []
    for gradient in gradients:
        residual = _project_away_normals(gradient, answer)
        norm = stable_norm(residual)
        if norm is not None and norm > math.sqrt(_MACHINE_EPSILON):
            answer.append([item / norm for item in residual])
    return answer


def _validation_directions(
    dimension: int, equality_normals: list[list[float]]
) -> list[list[float]]:
    """Build a bounded deterministic coordinate, dense, and mixed poll set."""
    raw_directions: list[list[float]] = []
    if dimension > 1:
        raw_directions.append([1.0 for _ in range(dimension)])
        for phase in range(min(7, dimension)):
            raw_directions.append(
                [
                    1.0 if (index + phase) % 3 != 0 else -1.0
                    for index in range(dimension)
                ]
            )
    for coordinate in range(dimension):
        basis = [0.0 for _ in range(dimension)]
        basis[coordinate] = 1.0
        raw_directions.append(basis)
    for left in range(dimension):
        for right in range(left + 1, dimension):
            plus = [0.0 for _ in range(dimension)]
            minus = [0.0 for _ in range(dimension)]
            plus[left] = plus[right] = 1.0
            minus[left] = 1.0
            minus[right] = -1.0
            raw_directions.extend((plus, minus))

    answer: list[list[float]] = []
    seen: set[tuple[float, ...]] = set()
    for raw in raw_directions:
        tangent = _project_away_normals(raw, equality_normals)
        norm = stable_norm(tangent)
        if norm is None or norm <= 1.0e-10:
            continue
        direction = [item / norm for item in tangent]
        first = next((item for item in direction if abs(item) > 1.0e-12), 1.0)
        if first < 0.0:
            direction = [-item for item in direction]
        key = tuple(round(item, 12) for item in direction)
        if key in seen:
            continue
        seen.add(key)
        answer.append(direction)
        if len(answer) >= _MAX_LOCAL_DIRECTIONS:
            break
    return answer


def _nonnegative_kkt_residual(
    target: list[float], normals: list[list[float]]
) -> tuple[list[float], list[float], bool, int]:
    """Solve the small active-normal nonnegative least-squares problem."""
    multipliers = [0.0 for _ in normals]
    residual = list(target)
    converged = len(normals) == 0
    iterations = 0
    for iteration in range(256):
        maximum_change = 0.0
        for index, normal in enumerate(normals):
            squared_norm = sum(item * item for item in normal)
            if squared_norm <= 1.0e-24:
                continue
            correlation = sum(
                normal[item] * residual[item] for item in range(len(target))
            )
            updated = max(0.0, multipliers[index] + correlation / squared_norm)
            change = updated - multipliers[index]
            if change != 0.0:
                residual = [
                    residual[item] - change * normal[item]
                    for item in range(len(target))
                ]
                multipliers[index] = updated
                maximum_change = max(maximum_change, abs(change))
        iterations = iteration + 1
        multiplier_scale = max([1.0] + multipliers)
        if maximum_change <= 1.0e-12 * multiplier_scale:
            converged = True
            break
    target_norm = stable_norm(target)
    if target_norm is None:
        return residual, multipliers, False, iterations
    target_scale = max(1.0, target_norm)
    dual_tolerance = (
        max(
            256.0 * _MACHINE_EPSILON * (len(target) + len(normals)),
            1.0e-12,
        )
        * target_scale
    )
    dual_certified = True
    for multiplier, normal in zip(multipliers, normals, strict=True):
        correlation = sum(
            normal[index] * residual[index] for index in range(len(target))
        )
        if multiplier > dual_tolerance:
            dual_certified = dual_certified and abs(correlation) <= dual_tolerance
        else:
            dual_certified = dual_certified and correlation <= dual_tolerance
    return residual, multipliers, converged and dual_certified, iterations


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
    problem: NumericalProblem,
    value: Any,
    execution: Execution,
    executed_method: str | None,
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
    nlopt_heuristic = executed_method == "nlopt-nelder-mead"
    maximum_local_decrease = 0.0
    sample_magnitude = max(2.2250738585072014e-308, abs(objective))
    movable_probe_count = 0
    resolved_probe = False
    directions = _validation_directions(len(point), [])
    coordinate_scales = [max(1.0, abs(item)) for item in point]
    step = _FINITE_DIFFERENCE_STEP
    for direction_vector in directions:
        for sign in (-1.0, 1.0):
            candidate = [
                point[index]
                + sign * step * coordinate_scales[index] * direction_vector[index]
                for index in range(len(point))
            ]
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
            sample_magnitude = max(sample_magnitude, abs(candidate_objective))
            resolved_probe = resolved_probe or candidate_objective != objective
            maximum_local_decrease = max(
                maximum_local_decrease, max(0.0, objective - candidate_objective)
            )
    local_threshold = (
        0.0 if nlopt_heuristic else 128.0 * _MACHINE_EPSILON * sample_magnitude
    )
    no_sampled_decrease = maximum_local_decrease <= local_threshold
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
    second_order_required = False
    curvature = (
        {
            "resolved": False,
            "completed": True,
            "reason": "opaque_black_box_local_curvature_not_certified",
            "positive": False,
            "negative": False,
            "sampled_descent": False,
        }
        if nlopt_heuristic
        else {
            "resolved": True,
            "completed": True,
            "reason": "not_required",
            "positive": True,
            "negative": False,
            "sampled_descent": False,
        }
    )
    curvature_passed = (
        bool(curvature.get("resolved"))
        and bool(curvature.get("positive"))
        and not bool(curvature.get("sampled_descent"))
    )
    stationary = (
        gradient_stationary
        and no_sampled_decrease
        and numerically_resolved
        and curvature_passed
    )
    curvature_completed = bool(curvature.get("completed"))
    curvature_contradiction = bool(curvature.get("negative")) or bool(
        curvature.get("sampled_descent")
    )
    heuristic_consistent = (
        feasible
        and gradient_stationary
        and no_sampled_decrease
        and curvature_completed
        and not curvature_contradiction
    )
    curvature_residual = max(0.0, -float(curvature.get("minimum_curvature", 0.0)))
    if nlopt_heuristic:
        return NumericalValidation(
            "heuristic" if heuristic_consistent else "indeterminate",
            heuristic_consistent,
            checks=[
                {"kind": "independent_box_feasibility", "passed": feasible},
                {
                    "kind": "empirical_projected_stationarity_consistency",
                    "passed": gradient_stationary,
                    "value": residual,
                    "threshold": threshold,
                    "gradient": gradient,
                },
                {
                    "kind": "bounded_feasible_objective_probes",
                    "passed": no_sampled_decrease,
                    "direction_count": len(directions),
                    "movable_probe_count": movable_probe_count,
                    "probe_values_resolved": numerically_resolved,
                    "maximum_sampled_decrease": maximum_local_decrease,
                    "decrease_threshold": 0.0,
                    "coordinate_scaled": True,
                    "conclusion": "no_representably_lower_sample_observed",
                },
                {
                    "kind": "empirical_curvature_limitation",
                    "passed": curvature_completed and not curvature_contradiction,
                    "completed": curvature_completed,
                    "contradiction_observed": curvature_contradiction,
                    **curvature,
                },
                {
                    "kind": "optimality_limitation",
                    "passed": True,
                    "local_optimum_certified": False,
                    "global_optimum_certified": False,
                    "conclusion": "heuristic_only",
                },
                {"kind": "finite_objective", "passed": math.isfinite(objective)},
            ],
            residual=max(residual, curvature_residual),
        )
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
                "kind": "deterministic_directional_local_minimum",
                "passed": no_sampled_decrease,
                "direction_count": len(directions),
                "maximum_sampled_decrease": maximum_local_decrease,
                "threshold": local_threshold,
            },
            {
                "kind": "objective_probe_resolution",
                "passed": numerically_resolved,
                "movable_probe_count": movable_probe_count,
            },
            {
                "kind": "independent_minimum_curvature",
                "passed": curvature_passed,
                "required": second_order_required,
                **curvature,
            },
            {"kind": "finite_objective", "passed": math.isfinite(objective)},
        ],
        residual=max(residual, curvature_residual),
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
    for item in constraints:
        constraint_value = scalar(execution.call("validation", item.function, point))
        values.append(constraint_value)
        violation = (
            max(0.0, -item.tolerance - constraint_value)
            if item.kind == "inequality"
            else max(0.0, abs(constraint_value) - item.tolerance)
        )
        adjusted_violations.append(violation)

    coordinate_scales = [max(1.0, abs(item)) for item in point]
    bound_tolerances = [
        max(64.0 * _MACHINE_EPSILON * scale, 1.0e-12 * scale)
        for scale in coordinate_scales
    ]
    bound_violation = 0.0
    for index in range(len(point)):
        lower_value = lower[index]
        upper_value = upper[index]
        if lower_value is not None:
            bound_violation = max(
                bound_violation,
                float(lower_value) - point[index] - bound_tolerances[index],
            )
        if upper_value is not None:
            bound_violation = max(
                bound_violation,
                point[index] - float(upper_value) - bound_tolerances[index],
            )
    bound_violation = max(0.0, bound_violation)
    maximum_violation = max([bound_violation] + adjusted_violations)
    feasible = maximum_violation == 0.0

    equality_records = [
        (item, constraint_value)
        for item, constraint_value in zip(constraints, values, strict=True)
        if item.kind == "equality"
    ]
    active_inequality_records = [
        (item, constraint_value)
        for item, constraint_value in zip(constraints, values, strict=True)
        if item.kind == "inequality"
        and constraint_value
        <= 256.0 * _MACHINE_EPSILON * max(1.0, abs(constraint_value))
    ]
    active_bound_tolerances = [
        256.0 * _MACHINE_EPSILON * scale for scale in coordinate_scales
    ]
    active_lower = [
        index
        for index, lower_value in enumerate(lower)
        if lower_value is not None
        and point[index] - float(lower_value) <= active_bound_tolerances[index]
    ]
    active_upper = [
        index
        for index, upper_value in enumerate(upper)
        if upper_value is not None
        and float(upper_value) - point[index] <= active_bound_tolerances[index]
    ]
    normal_count = (
        len(equality_records)
        + len(active_inequality_records)
        + len(active_lower)
        + len(active_upper)
    )
    required_kkt_evaluations = (
        4 * len(point) * (1 + len(equality_records) + len(active_inequality_records))
    )
    remaining_kkt_evaluations = (
        problem.resource_budget.max_evaluations - execution.evaluations
    )
    within_kkt_budget = (
        normal_count <= _MAX_KKT_NORMALS
        and required_kkt_evaluations <= remaining_kkt_evaluations
    )

    objective_gradient: list[float] = []
    equality_normals: list[list[float]] = []
    equality_gradients: list[list[float]] = []
    active_normals: list[list[float]] = []
    active_independent_basis: list[list[float]] = []
    active_manifold_gradients: list[list[float]] = []
    active_manifold_records: list[tuple[str, Any]] = []
    active_slacks: list[float] = []
    kkt_residual = 0.0
    kkt_threshold = max(2.0e-6, float(problem.tolerances["gtol"]) * 20.0)
    kkt_converged = False
    kkt_iterations = 0
    multipliers: list[float] = []
    complementarity_residual = 0.0
    complementarity_threshold = 512.0 * _MACHINE_EPSILON
    strict_complementarity = False
    strict_multiplier_threshold = 0.0
    constraint_qualification = within_kkt_budget
    descent_direction: list[float] = []
    descent_direction_feasible = False
    descent_derivative = 0.0
    if within_kkt_budget:
        objective_gradient = _independent_bound_gradient(
            execution, function, point, objective, lower, upper
        )
        equality_gradients = [
            _independent_bound_gradient(
                execution,
                item.function,
                point,
                constraint_value,
                lower,
                upper,
            )
            for item, constraint_value in equality_records
        ]
        equality_gradient_norms = [
            stable_norm(gradient) for gradient in equality_gradients
        ]
        constraint_qualification = constraint_qualification and all(
            norm is not None and norm > 1.0e-12 for norm in equality_gradient_norms
        )
        equality_normals = _orthonormal_normals(equality_gradients)
        constraint_qualification = constraint_qualification and len(
            equality_normals
        ) == len(equality_gradients)
        for item, constraint_value in active_inequality_records:
            raw_gradient = _independent_bound_gradient(
                execution,
                item.function,
                point,
                constraint_value,
                lower,
                upper,
            )
            gradient_norm = stable_norm(raw_gradient)
            if gradient_norm is None or gradient_norm <= 1.0e-12:
                constraint_qualification = False
                continue
            gradient = [value / gradient_norm for value in raw_gradient]
            projected_normal = _project_away_normals(gradient, equality_normals)
            projected_norm = stable_norm(projected_normal)
            independence_residual = _project_away_normals(
                projected_normal, active_independent_basis
            )
            independence_norm = stable_norm(independence_residual)
            if (
                projected_norm is not None
                and independence_norm is not None
                and projected_norm > 1.0e-12
                and independence_norm > 1.0e-10
            ):
                active_normals.append(
                    [item / projected_norm for item in projected_normal]
                )
                active_independent_basis.append(
                    [item / independence_norm for item in independence_residual]
                )
                active_manifold_gradients.append(raw_gradient)
                active_manifold_records.append(("inequality", item))
                active_slacks.append(max(0.0, constraint_value))
        for index in active_lower:
            lower_value = lower[index]
            if lower_value is None:
                continue
            normal = [0.0 for _ in point]
            normal[index] = 1.0
            projected_normal = _project_away_normals(normal, equality_normals)
            projected_norm = stable_norm(projected_normal)
            independence_residual = _project_away_normals(
                projected_normal, active_independent_basis
            )
            independence_norm = stable_norm(independence_residual)
            if (
                projected_norm is not None
                and independence_norm is not None
                and projected_norm > 1.0e-12
                and independence_norm > 1.0e-10
            ):
                active_normals.append(
                    [item / projected_norm for item in projected_normal]
                )
                active_independent_basis.append(
                    [item / independence_norm for item in independence_residual]
                )
                active_manifold_gradients.append(normal)
                active_manifold_records.append(("lower", index))
                active_slacks.append(max(0.0, point[index] - float(lower_value)))
        for index in active_upper:
            upper_value = upper[index]
            if upper_value is None:
                continue
            normal = [0.0 for _ in point]
            normal[index] = -1.0
            projected_normal = _project_away_normals(normal, equality_normals)
            projected_norm = stable_norm(projected_normal)
            independence_residual = _project_away_normals(
                projected_normal, active_independent_basis
            )
            independence_norm = stable_norm(independence_residual)
            if (
                projected_norm is not None
                and independence_norm is not None
                and projected_norm > 1.0e-12
                and independence_norm > 1.0e-10
            ):
                active_normals.append(
                    [item / projected_norm for item in projected_normal]
                )
                active_independent_basis.append(
                    [item / independence_norm for item in independence_residual]
                )
                active_manifold_gradients.append(normal)
                active_manifold_records.append(("upper", index))
                active_slacks.append(max(0.0, float(upper_value) - point[index]))
        tangent_gradient = _project_away_normals(objective_gradient, equality_normals)
        residual_vector, multipliers, kkt_converged, kkt_iterations = (
            _nonnegative_kkt_residual(tangent_gradient, active_normals)
        )
        gradient_scale = max(1.0, infinity_norm(objective_gradient))
        raw_kkt_residual = infinity_norm(residual_vector)
        kkt_residual = raw_kkt_residual / gradient_scale
        complementarity_residual = (
            max(
                [0.0]
                + [
                    multipliers[index] * active_slacks[index]
                    for index in range(len(multipliers))
                ]
            )
            / gradient_scale
        )
        complementarity_threshold = 512.0 * _MACHINE_EPSILON
        strict_multiplier_threshold = 1.0e-10 * gradient_scale
        strict_complementarity = all(
            multiplier > strict_multiplier_threshold for multiplier in multipliers
        )
        descent_direction = [-item for item in residual_vector]
        descent_derivative = sum(
            objective_gradient[index] * descent_direction[index]
            for index in range(len(point))
        )
        directional_tolerance = (
            10.0 * _MACHINE_EPSILON * max(1.0, infinity_norm(descent_direction))
        )
        descent_direction_feasible = all(
            sum(normal[index] * descent_direction[index] for index in range(len(point)))
            >= -directional_tolerance
            for normal in active_normals
        )

    kkt_stationary = (
        within_kkt_budget
        and constraint_qualification
        and kkt_converged
        and kkt_residual <= kkt_threshold
        and complementarity_residual <= complementarity_threshold
    )
    scaled_equality_gradients = [
        [gradient[index] * coordinate_scales[index] for index in range(len(point))]
        for gradient in equality_gradients
    ]
    scaled_equality_normals = _orthonormal_normals(scaled_equality_gradients)
    directions = _validation_directions(len(point), scaled_equality_normals)
    if (
        within_kkt_budget
        and kkt_residual > kkt_threshold
        and descent_direction_feasible
    ):
        scaled_descent_direction = [
            descent_direction[index] / coordinate_scales[index]
            for index in range(len(point))
        ]
        norm = stable_norm(scaled_descent_direction)
        if norm is not None and norm > 1.0e-12:
            directions.insert(0, [item / norm for item in scaled_descent_direction])

    equality_manifold_records: list[tuple[str, Any]] = [
        ("equality", item) for item, _ in equality_records
    ]

    def manifold_residual(
        record: tuple[str, Any], candidate: list[float]
    ) -> tuple[float, float]:
        kind, payload = record
        if kind in ("equality", "inequality"):
            value = scalar(execution.call("validation", payload.function, candidate))
            if kind == "equality":
                tolerance = max(
                    512.0 * _MACHINE_EPSILON,
                    min(payload.tolerance, 1.0e-12),
                )
            else:
                tolerance = 512.0 * _MACHINE_EPSILON * max(1.0, abs(value))
            return value, tolerance
        index = int(payload)
        if kind == "lower":
            lower_value = lower[index]
            if lower_value is None:
                return float("inf"), 0.0
            return (
                candidate[index] - float(lower_value),
                active_bound_tolerances[index],
            )
        upper_value = upper[index]
        if upper_value is None:
            return float("inf"), 0.0
        return (
            float(upper_value) - candidate[index],
            active_bound_tolerances[index],
        )

    def retract_to_manifold(
        candidate: list[float],
        records: list[tuple[str, Any]],
        gradients: list[list[float]],
    ) -> list[float] | None:
        if len(records) == 0:
            return candidate
        normals = _orthonormal_normals(gradients)
        if len(normals) != len(gradients) or len(records) != len(gradients):
            return None
        answer = list(candidate)
        gram = [
            [
                sum(
                    gradients[row][index] * gradients[column][index]
                    for index in range(len(point))
                )
                for column in range(len(gradients))
            ]
            for row in range(len(gradients))
        ]
        for _ in range(5):
            residual_records = [manifold_residual(record, answer) for record in records]
            residuals = [item[0] for item in residual_records]
            if all(
                abs(value) <= residual_records[index][1]
                for index, value in enumerate(residuals)
            ):
                return answer
            coefficients = solve_linear_system(gram, [-item for item in residuals])
            if coefficients is None:
                return None
            for index in range(len(answer)):
                answer[index] += sum(
                    coefficients[row] * gradients[row][index]
                    for row in range(len(coefficients))
                )
                lower_value = lower[index]
                upper_value = upper[index]
                if lower_value is not None:
                    answer[index] = max(float(lower_value), answer[index])
                if upper_value is not None:
                    answer[index] = min(float(upper_value), answer[index])
        return None

    def retract_equalities(candidate: list[float]) -> list[float] | None:
        return retract_to_manifold(
            candidate, equality_manifold_records, equality_gradients
        )

    step = _SECOND_ORDER_STEP
    feasible_probe_count = 0
    resolved_probe = False
    maximum_local_decrease = 0.0
    maximum_local_variation = 0.0
    for direction in directions:
        for sign in (-1.0, 1.0):
            candidate: list[float] | None = None
            candidate_feasible = False
            trial_step = step
            for _ in range(64):
                trial = [
                    point[index]
                    + sign * trial_step * coordinate_scales[index] * direction[index]
                    for index in range(len(point))
                ]
                for index in range(len(trial)):
                    lower_value = lower[index]
                    upper_value = upper[index]
                    if lower_value is not None:
                        trial[index] = max(float(lower_value), trial[index])
                    if upper_value is not None:
                        trial[index] = min(float(upper_value), trial[index])
                trial = retract_equalities(trial)
                if trial is not None and trial != point:
                    candidate_feasible = True
                    for item in constraints:
                        candidate_value = scalar(
                            execution.call("validation", item.function, trial)
                        )
                        if item.kind == "inequality":
                            candidate_feasible = (
                                candidate_feasible and candidate_value >= 0.0
                            )
                        else:
                            candidate_feasible = candidate_feasible and abs(
                                candidate_value
                            ) <= max(
                                512.0 * _MACHINE_EPSILON,
                                min(item.tolerance, 1.0e-12),
                            )
                    if candidate_feasible:
                        candidate = trial
                        break
                trial_step *= 0.5
            if not candidate_feasible:
                continue
            if candidate is None:
                continue
            feasible_probe_count += 1
            candidate_objective = scalar(
                execution.call("validation", function, candidate)
            )
            resolved_probe = resolved_probe or candidate_objective != objective
            maximum_local_variation = max(
                maximum_local_variation, abs(candidate_objective - objective)
            )
            maximum_local_decrease = max(
                maximum_local_decrease, max(0.0, objective - candidate_objective)
            )

    manifold_records = equality_manifold_records + active_manifold_records
    manifold_gradients = equality_gradients + active_manifold_gradients
    manifold_normals = _orthonormal_normals(manifold_gradients)
    tangent_dimension = len(point) - len(manifold_normals)

    def independently_feasible(candidate: list[float]) -> bool:
        for index, coordinate in enumerate(candidate):
            lower_value = lower[index]
            upper_value = upper[index]
            tolerance = active_bound_tolerances[index]
            if lower_value is not None and coordinate < float(lower_value) - tolerance:
                return False
            if upper_value is not None and coordinate > float(upper_value) + tolerance:
                return False
        for item in constraints:
            value = scalar(execution.call("validation", item.function, candidate))
            if item.kind == "inequality":
                if value < 0.0:
                    return False
            elif abs(value) > max(
                512.0 * _MACHINE_EPSILON,
                min(item.tolerance, 1.0e-12),
            ):
                return False
        return True

    manifold_rank_resolved = len(manifold_normals) == len(manifold_gradients)
    strict_active_resolved = len(active_normals) == 0 or strict_complementarity
    retracted_center: list[float] | None = list(point)
    retracted_center_feasible = True
    retracted_center_decrease = 0.0
    if len(manifold_records) != 0:
        retracted_center = retract_to_manifold(
            list(point), manifold_records, manifold_gradients
        )
        retracted_center_feasible = (
            retracted_center is not None and independently_feasible(retracted_center)
        )
        if retracted_center_feasible and retracted_center is not None:
            center_objective = scalar(
                execution.call("validation", function, retracted_center)
            )
            retracted_center_decrease = max(0.0, objective - center_objective)
            maximum_local_decrease = max(
                maximum_local_decrease, retracted_center_decrease
            )

    no_sampled_decrease = maximum_local_decrease <= 0.0
    probe_completed = feasible_probe_count > 0 or tangent_dimension == 0
    passed = (
        feasible
        and kkt_stationary
        and manifold_rank_resolved
        and strict_active_resolved
        and retracted_center_feasible
        and probe_completed
        and no_sampled_decrease
        and math.isfinite(objective)
    )
    return NumericalValidation(
        "heuristic" if passed else "indeterminate",
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
                "kind": "empirical_active_constraint_kkt_consistency",
                "passed": kkt_stationary,
                "within_budget": within_kkt_budget,
                "required_evaluations": required_kkt_evaluations,
                "remaining_evaluations": remaining_kkt_evaluations,
                "active_normal_count": normal_count,
                "equality_rank": len(equality_normals),
                "residual": kkt_residual,
                "threshold": kkt_threshold,
                "solver_converged": kkt_converged,
                "solver_iterations": kkt_iterations,
                "constraint_qualification": constraint_qualification,
                "multipliers": multipliers,
                "strict_complementarity": strict_complementarity,
                "strict_multiplier_threshold": strict_multiplier_threshold,
                "complementarity_residual": complementarity_residual,
                "complementarity_threshold": complementarity_threshold,
                "objective_gradient": objective_gradient,
                "descent_direction_feasible": descent_direction_feasible,
                "descent_directional_derivative": descent_derivative,
            },
            {
                "kind": "bounded_feasible_objective_probes",
                "passed": no_sampled_decrease and probe_completed,
                "feasible_probe_count": feasible_probe_count,
                "direction_count": len(directions),
                "equality_rank": len(equality_normals),
                "maximum_sampled_decrease": maximum_local_decrease,
                "decrease_threshold": 0.0,
                "retracted_center_decrease": retracted_center_decrease,
                "retracted_center_feasible": retracted_center_feasible,
                "coordinate_scaled": True,
                "conclusion": "no_representably_lower_sample_observed",
            },
            {
                "kind": "empirical_active_manifold_geometry",
                "passed": manifold_rank_resolved and strict_active_resolved,
                "manifold_rank": len(manifold_normals),
                "manifold_constraint_count": len(manifold_gradients),
                "tangent_dimension": tangent_dimension,
                "strict_complementarity": strict_complementarity,
                "strict_multiplier_threshold": strict_multiplier_threshold,
                "second_order_optimality_certified": False,
            },
            {
                "kind": "optimality_limitation",
                "passed": True,
                "local_optimum_certified": False,
                "global_optimum_certified": False,
                "conclusion": "heuristic_only",
            },
            {"kind": "finite_objective", "passed": math.isfinite(objective)},
        ],
        residual=max(
            maximum_violation,
            kkt_residual,
            complementarity_residual,
            maximum_local_decrease,
        ),
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
    *,
    executed_method: str | None = None,
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
            validation = _minimize_validation(
                problem, value, execution, executed_method or problem.method.lower()
            )
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
        problem,
        result.value,
        execution,
        result.status,
        executed_method=result.method,
    )
    return validation
