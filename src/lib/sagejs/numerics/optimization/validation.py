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
_MAX_HESSIAN_DIMENSION = 32


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
        norm = math.sqrt(sum(item * item for item in residual))
        if norm > math.sqrt(_MACHINE_EPSILON):
            answer.append([item / norm for item in residual])
    return answer


def _orthonormal_tangents(
    dimension: int, normals: list[list[float]]
) -> list[list[float]]:
    """Build a deterministic orthonormal basis for a normal-space complement."""
    answer: list[list[float]] = []
    for coordinate in range(dimension):
        basis = [0.0 for _ in range(dimension)]
        basis[coordinate] = 1.0
        residual = _project_away_normals(basis, normals + answer)
        norm = math.sqrt(sum(item * item for item in residual))
        if norm > math.sqrt(_MACHINE_EPSILON):
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
        norm = math.sqrt(sum(item * item for item in tangent))
        if norm <= 1.0e-10:
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
    target_scale = max(1.0, math.sqrt(sum(item * item for item in target)))
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


def _minimum_symmetric_eigenvalue(
    matrix_value: list[list[float]],
) -> tuple[float, bool, int]:
    """Return the minimum eigenvalue using deterministic cyclic Jacobi sweeps."""
    dimension = len(matrix_value)
    matrix = [list(row) for row in matrix_value]
    if dimension == 0:
        return 0.0, False, 0
    scale = max(
        1.0,
        max(sum(abs(item) for item in row) for row in matrix),
    )
    tolerance = 256.0 * _MACHINE_EPSILON * dimension * scale
    for sweep in range(32):
        maximum_off_diagonal = 0.0
        for left in range(dimension):
            for right in range(left + 1, dimension):
                off_diagonal = matrix[left][right]
                maximum_off_diagonal = max(maximum_off_diagonal, abs(off_diagonal))
                if abs(off_diagonal) <= tolerance:
                    continue
                diagonal_difference = matrix[right][right] - matrix[left][left]
                tau = diagonal_difference / (2.0 * off_diagonal)
                sign = 1.0 if tau >= 0.0 else -1.0
                tangent = sign / (abs(tau) + math.sqrt(1.0 + tau * tau))
                cosine = 1.0 / math.sqrt(1.0 + tangent * tangent)
                sine = tangent * cosine
                left_diagonal = matrix[left][left]
                right_diagonal = matrix[right][right]
                matrix[left][left] = left_diagonal - tangent * off_diagonal
                matrix[right][right] = right_diagonal + tangent * off_diagonal
                matrix[left][right] = 0.0
                matrix[right][left] = 0.0
                for index in range(dimension):
                    if index in (left, right):
                        continue
                    left_value = matrix[index][left]
                    right_value = matrix[index][right]
                    rotated_left = cosine * left_value - sine * right_value
                    rotated_right = sine * left_value + cosine * right_value
                    matrix[index][left] = matrix[left][index] = rotated_left
                    matrix[index][right] = matrix[right][index] = rotated_right
        if maximum_off_diagonal <= tolerance:
            return (
                min(matrix[index][index] for index in range(dimension)),
                True,
                sweep + 1,
            )
    return min(matrix[index][index] for index in range(dimension)), False, 32


def _independent_minimum_curvature(
    problem: NumericalProblem,
    point: list[float],
    objective: float,
    execution: Execution,
    lower: list[float | None],
    upper: list[float | None],
    gradient: list[float],
) -> dict[str, Any]:
    """Build a two-scale dense Hessian model independently of the solver."""
    function = problem.function
    dimension = len(point)
    active_tolerance = float(problem.tolerances["xtol"])
    strict_gradient_threshold = max(2.0e-6, float(problem.tolerances["gtol"]) * 20.0)
    free_indices: list[int] = []
    strict_active_bounds = 0
    for index in range(dimension):
        coordinate_tolerance = max(
            active_tolerance * max(1.0, abs(point[index])),
            64.0 * _MACHINE_EPSILON * max(1.0, abs(point[index])),
        )
        lower_value = lower[index]
        upper_value = upper[index]
        at_lower = lower_value is not None and (
            point[index] - float(lower_value) <= coordinate_tolerance
        )
        at_upper = upper_value is not None and (
            float(upper_value) - point[index] <= coordinate_tolerance
        )
        if at_lower and gradient[index] > strict_gradient_threshold:
            strict_active_bounds += 1
        elif at_upper and gradient[index] < -strict_gradient_threshold:
            strict_active_bounds += 1
        elif at_lower or at_upper:
            return {
                "resolved": False,
                "reason": "non_strict_active_bound",
                "active_bound_index": index,
            }
        else:
            free_indices.append(index)
    effective_dimension = len(free_indices)
    required_evaluations = 4 * effective_dimension * effective_dimension
    remaining_evaluations = (
        problem.resource_budget.max_evaluations - execution.evaluations
    )
    if function is None or effective_dimension > _MAX_HESSIAN_DIMENSION:
        return {
            "resolved": False,
            "reason": "dimension_envelope",
            "required_evaluations": required_evaluations,
            "effective_dimension": effective_dimension,
        }
    if remaining_evaluations < required_evaluations:
        return {
            "resolved": False,
            "reason": "evaluation_budget",
            "required_evaluations": required_evaluations,
            "remaining_evaluations": remaining_evaluations,
            "effective_dimension": effective_dimension,
        }
    if effective_dimension == 0:
        return {
            "resolved": strict_active_bounds == dimension,
            "reason": "strict_first_order_active_bounds",
            "positive": strict_active_bounds == dimension,
            "negative": False,
            "sampled_descent": False,
            "required_evaluations": 0,
            "effective_dimension": 0,
            "strict_active_bound_count": strict_active_bounds,
        }
    scales = [max(1.0, abs(item)) for item in point]
    radius = _SECOND_ORDER_STEP
    for index in free_indices:
        displacement = radius * scales[index]
        lower_value = lower[index]
        upper_value = upper[index]
        if lower_value is not None and point[index] - displacement < float(lower_value):
            return {"resolved": False, "reason": "active_bound"}
        if upper_value is not None and point[index] + displacement > float(upper_value):
            return {"resolved": False, "reason": "active_bound"}

    sample_scale = max(2.2250738585072014e-308, abs(objective))
    maximum_sampled_decrease = 0.0

    def sampled(candidate: list[float]) -> float:
        nonlocal sample_scale, maximum_sampled_decrease
        value = scalar(execution.call("validation", function, candidate))
        sample_scale = max(sample_scale, abs(value))
        maximum_sampled_decrease = max(
            maximum_sampled_decrease,
            max(0.0, objective - value),
        )
        return value

    def hessian_at(current_radius: float) -> list[list[float]]:
        matrix = [
            [0.0 for _ in range(effective_dimension)]
            for _ in range(effective_dimension)
        ]
        denominator = current_radius * current_radius
        for local_index, index in enumerate(free_indices):
            left = list(point)
            right = list(point)
            displacement = current_radius * scales[index]
            left[index] -= displacement
            right[index] += displacement
            matrix[local_index][local_index] = (
                sampled(left) - 2.0 * objective + sampled(right)
            ) / denominator
        for local_left, left_index in enumerate(free_indices):
            for local_right in range(local_left + 1, effective_dimension):
                right_index = free_indices[local_right]
                values: list[float] = []
                for left_sign, right_sign in (
                    (1.0, 1.0),
                    (1.0, -1.0),
                    (-1.0, 1.0),
                    (-1.0, -1.0),
                ):
                    candidate = list(point)
                    candidate[left_index] += (
                        left_sign * current_radius * scales[left_index]
                    )
                    candidate[right_index] += (
                        right_sign * current_radius * scales[right_index]
                    )
                    values.append(sampled(candidate))
                mixed = (values[0] - values[1] - values[2] + values[3]) / (
                    4.0 * denominator
                )
                matrix[local_left][local_right] = mixed
                matrix[local_right][local_left] = mixed
        return matrix

    coarse = hessian_at(radius)
    fine = hessian_at(0.5 * radius)
    richardson = [
        [
            (4.0 * fine[row][column] - coarse[row][column]) / 3.0
            for column in range(effective_dimension)
        ]
        for row in range(effective_dimension)
    ]
    discretization = max(
        sum(
            abs(fine[row][column] - coarse[row][column]) / 3.0
            for column in range(effective_dimension)
        )
        for row in range(effective_dimension)
    )
    matrix_scale = max(
        1.0,
        max(sum(abs(item) for item in row) for row in richardson),
    )
    roundoff = 256.0 * _MACHINE_EPSILON * sample_scale / ((0.5 * radius) ** 2)
    curvature_threshold = (
        roundoff
        + discretization
        + max(
            float(problem.tolerances["gtol"]) * 20.0,
            128.0 * math.sqrt(_MACHINE_EPSILON) * matrix_scale,
        )
    )
    minimum_curvature, eigensolver_converged, eigensolver_sweeps = (
        _minimum_symmetric_eigenvalue(richardson)
    )
    # A representably lower independently sampled objective is evidence against
    # local minimality irrespective of an arbitrary additive objective offset.
    descent_threshold = 0.0
    resolved = eigensolver_converged and abs(minimum_curvature) > curvature_threshold
    return {
        "resolved": resolved,
        "reason": "resolved" if resolved else "curvature_indeterminate",
        "minimum_curvature": minimum_curvature,
        "threshold": curvature_threshold,
        "positive": minimum_curvature > curvature_threshold,
        "negative": minimum_curvature < -curvature_threshold,
        "maximum_sampled_decrease": maximum_sampled_decrease,
        "descent_threshold": descent_threshold,
        "sampled_descent": maximum_sampled_decrease > descent_threshold,
        "required_evaluations": required_evaluations,
        "effective_dimension": effective_dimension,
        "strict_active_bound_count": strict_active_bounds,
        "eigensolver_converged": eigensolver_converged,
        "eigensolver_sweeps": eigensolver_sweeps,
        "discretization_bound": discretization,
        "roundoff_bound": roundoff,
    }


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
    maximum_local_decrease = 0.0
    sample_magnitude = max(2.2250738585072014e-308, abs(objective))
    movable_probe_count = 0
    resolved_probe = False
    directions = _validation_directions(len(point), [])
    step = _FINITE_DIFFERENCE_STEP * max(1.0, infinity_norm(point))
    for direction_vector in directions:
        for sign in (-1.0, 1.0):
            candidate = [
                point[index] + sign * step * direction_vector[index]
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
    local_threshold = 128.0 * _MACHINE_EPSILON * sample_magnitude
    locally_minimal = maximum_local_decrease <= local_threshold
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
    second_order_required = executed_method == "nlopt-nelder-mead"
    curvature = (
        _independent_minimum_curvature(
            problem, point, objective, execution, lower, upper, gradient
        )
        if second_order_required
        else {"resolved": True, "positive": True, "sampled_descent": False}
    )
    curvature_passed = (
        bool(curvature.get("resolved"))
        and bool(curvature.get("positive"))
        and not bool(curvature.get("sampled_descent"))
    )
    stationary = (
        gradient_stationary
        and locally_minimal
        and numerically_resolved
        and curvature_passed
    )
    curvature_residual = max(0.0, -float(curvature.get("minimum_curvature", 0.0)))
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
                "passed": locally_minimal,
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
        constraint_qualification = constraint_qualification and all(
            math.sqrt(sum(item * item for item in gradient)) > 1.0e-12
            for gradient in equality_gradients
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
            gradient_norm = math.sqrt(sum(value * value for value in raw_gradient))
            if gradient_norm <= 1.0e-12:
                constraint_qualification = False
                continue
            gradient = [value / gradient_norm for value in raw_gradient]
            projected_normal = _project_away_normals(gradient, equality_normals)
            projected_norm = math.sqrt(sum(item * item for item in projected_normal))
            independence_residual = _project_away_normals(
                projected_normal, active_independent_basis
            )
            independence_norm = math.sqrt(
                sum(value * value for value in independence_residual)
            )
            if projected_norm > 1.0e-12 and independence_norm > 1.0e-10:
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
            projected_norm = math.sqrt(sum(item * item for item in projected_normal))
            independence_residual = _project_away_normals(
                projected_normal, active_independent_basis
            )
            independence_norm = math.sqrt(
                sum(value * value for value in independence_residual)
            )
            if projected_norm > 1.0e-12 and independence_norm > 1.0e-10:
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
            projected_norm = math.sqrt(sum(item * item for item in projected_normal))
            independence_residual = _project_away_normals(
                projected_normal, active_independent_basis
            )
            independence_norm = math.sqrt(
                sum(value * value for value in independence_residual)
            )
            if projected_norm > 1.0e-12 and independence_norm > 1.0e-10:
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
    directions = _validation_directions(len(point), equality_normals)
    if (
        within_kkt_budget
        and kkt_residual > kkt_threshold
        and descent_direction_feasible
    ):
        norm = math.sqrt(sum(item * item for item in descent_direction))
        if norm > 1.0e-12:
            directions.insert(0, [item / norm for item in descent_direction])

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

    step = _SECOND_ORDER_STEP * max(1.0, infinity_norm(point))
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
                    point[index] + sign * trial_step * direction[index]
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

    isolated_by_equalities = len(equality_normals) >= len(point)
    probe_resolved = isolated_by_equalities or (
        feasible_probe_count > 0 and resolved_probe
    )
    # The roundoff allowance is tied only to observed local variation, never
    # to the arbitrary absolute objective level. This remains invariant under
    # adding a constant while rejecting every reliably resolved decrease.
    local_threshold = 1024.0 * _MACHINE_EPSILON * maximum_local_variation
    locally_minimal = maximum_local_decrease <= local_threshold and probe_resolved
    manifold_records = equality_manifold_records + active_manifold_records
    manifold_gradients = equality_gradients + active_manifold_gradients
    manifold_normals = _orthonormal_normals(manifold_gradients)
    tangent_basis = _orthonormal_tangents(len(point), manifold_normals)
    tangent_dimension = len(tangent_basis)
    curvature: dict[str, Any] = {
        "resolved": False,
        "reason": "first_order_or_poll_failure",
        "positive": False,
        "negative": False,
        "sampled_descent": False,
        "effective_dimension": tangent_dimension,
    }

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

    if feasible and kkt_stationary and locally_minimal:
        if len(manifold_normals) != len(manifold_gradients):
            curvature = {
                **curvature,
                "reason": "rank_deficient_active_manifold",
                "manifold_rank": len(manifold_normals),
                "manifold_constraint_count": len(manifold_gradients),
            }
        elif len(active_normals) != 0 and not strict_complementarity:
            curvature = {
                **curvature,
                "reason": "non_strict_active_constraint",
                "strict_multiplier_threshold": strict_multiplier_threshold,
                "multipliers": multipliers,
            }
        elif tangent_dimension > _MAX_HESSIAN_DIMENSION:
            curvature = {
                **curvature,
                "reason": "dimension_envelope",
            }
        elif tangent_dimension == 0:
            curvature = {
                **curvature,
                "resolved": True,
                "reason": "strict_first_order_isolated_manifold",
                "positive": True,
                "minimum_curvature": 0.0,
                "threshold": 0.0,
                "required_evaluations": 0,
                "manifold_rank": len(manifold_normals),
            }
        else:
            sample_count = 4 * tangent_dimension * tangent_dimension
            callbacks_per_sample = 1 + len(constraints) + 5 * len(manifold_records)
            required_curvature_evaluations = (
                sample_count * callbacks_per_sample
                + 1
                + len(constraints)
                + 5 * len(manifold_records)
            )
            remaining_curvature_evaluations = (
                problem.resource_budget.max_evaluations - execution.evaluations
            )
            if required_curvature_evaluations > remaining_curvature_evaluations:
                curvature = {
                    **curvature,
                    "reason": "evaluation_budget",
                    "required_evaluations": required_curvature_evaluations,
                    "remaining_evaluations": remaining_curvature_evaluations,
                }
            else:
                center = retract_to_manifold(
                    list(point), manifold_records, manifold_gradients
                )
                if center is None or not independently_feasible(center):
                    curvature = {
                        **curvature,
                        "reason": "manifold_retraction_failed",
                    }
                else:
                    center_objective = scalar(
                        execution.call("validation", function, center)
                    )
                    curvature_sample_scale = max(
                        2.2250738585072014e-308,
                        abs(objective),
                        abs(center_objective),
                    )
                    maximum_curvature_decrease = max(0.0, objective - center_objective)
                    maximum_curvature_variation = abs(objective - center_objective)
                    curvature_sample_failed = False

                    def sampled_on_manifold(candidate: list[float]) -> float | None:
                        nonlocal curvature_sample_scale
                        nonlocal maximum_curvature_decrease
                        nonlocal maximum_curvature_variation
                        nonlocal curvature_sample_failed
                        retracted = retract_to_manifold(
                            candidate, manifold_records, manifold_gradients
                        )
                        if retracted is None or not independently_feasible(retracted):
                            curvature_sample_failed = True
                            return None
                        value = scalar(
                            execution.call("validation", function, retracted)
                        )
                        curvature_sample_scale = max(curvature_sample_scale, abs(value))
                        maximum_curvature_decrease = max(
                            maximum_curvature_decrease,
                            max(0.0, objective - value),
                        )
                        maximum_curvature_variation = max(
                            maximum_curvature_variation,
                            abs(objective - value),
                        )
                        return value

                    def tangent_hessian(
                        radius: float,
                    ) -> list[list[float]] | None:
                        matrix = [
                            [0.0 for _ in range(tangent_dimension)]
                            for _ in range(tangent_dimension)
                        ]
                        denominator = radius * radius
                        for row, direction in enumerate(tangent_basis):
                            left = [
                                center[index] - radius * direction[index]
                                for index in range(len(point))
                            ]
                            right = [
                                center[index] + radius * direction[index]
                                for index in range(len(point))
                            ]
                            left_value = sampled_on_manifold(left)
                            right_value = sampled_on_manifold(right)
                            if left_value is None or right_value is None:
                                return None
                            matrix[row][row] = (
                                left_value - 2.0 * center_objective + right_value
                            ) / denominator
                        for row in range(tangent_dimension):
                            for column in range(row + 1, tangent_dimension):
                                values: list[float] = []
                                for row_sign, column_sign in (
                                    (1.0, 1.0),
                                    (1.0, -1.0),
                                    (-1.0, 1.0),
                                    (-1.0, -1.0),
                                ):
                                    candidate = [
                                        center[index]
                                        + radius
                                        * (
                                            row_sign * tangent_basis[row][index]
                                            + column_sign * tangent_basis[column][index]
                                        )
                                        for index in range(len(point))
                                    ]
                                    value = sampled_on_manifold(candidate)
                                    if value is None:
                                        return None
                                    values.append(value)
                                mixed = (
                                    values[0] - values[1] - values[2] + values[3]
                                ) / (4.0 * denominator)
                                matrix[row][column] = mixed
                                matrix[column][row] = mixed
                        return matrix

                    radius = _SECOND_ORDER_STEP * max(1.0, infinity_norm(point))
                    coarse = tangent_hessian(radius)
                    fine = tangent_hessian(0.5 * radius)
                    if coarse is None or fine is None or curvature_sample_failed:
                        curvature = {
                            **curvature,
                            "reason": "feasible_curvature_probe_failed",
                            "required_evaluations": required_curvature_evaluations,
                            "remaining_evaluations": remaining_curvature_evaluations,
                        }
                    else:
                        richardson = [
                            [
                                (4.0 * fine[row][column] - coarse[row][column]) / 3.0
                                for column in range(tangent_dimension)
                            ]
                            for row in range(tangent_dimension)
                        ]
                        discretization = max(
                            sum(
                                abs(fine[row][column] - coarse[row][column]) / 3.0
                                for column in range(tangent_dimension)
                            )
                            for row in range(tangent_dimension)
                        )
                        matrix_scale = max(
                            1.0,
                            max(sum(abs(item) for item in row) for row in richardson),
                        )
                        roundoff = (
                            256.0
                            * _MACHINE_EPSILON
                            * curvature_sample_scale
                            / ((0.5 * radius) ** 2)
                        )
                        curvature_threshold = (
                            roundoff
                            + discretization
                            + max(
                                float(problem.tolerances["gtol"]) * 20.0,
                                128.0 * math.sqrt(_MACHINE_EPSILON) * matrix_scale,
                            )
                        )
                        minimum_curvature, eigensolver_converged, sweeps = (
                            _minimum_symmetric_eigenvalue(richardson)
                        )
                        curvature_resolved = (
                            eigensolver_converged
                            and abs(minimum_curvature) > curvature_threshold
                        )
                        curvature_descent_threshold = (
                            1024.0 * _MACHINE_EPSILON * maximum_curvature_variation
                        )
                        curvature = {
                            **curvature,
                            "resolved": curvature_resolved,
                            "reason": (
                                "resolved"
                                if curvature_resolved
                                else "curvature_indeterminate"
                            ),
                            "positive": minimum_curvature > curvature_threshold,
                            "negative": minimum_curvature < -curvature_threshold,
                            "sampled_descent": (
                                maximum_curvature_decrease > curvature_descent_threshold
                            ),
                            "maximum_sampled_decrease": maximum_curvature_decrease,
                            "descent_threshold": curvature_descent_threshold,
                            "minimum_curvature": minimum_curvature,
                            "threshold": curvature_threshold,
                            "required_evaluations": required_curvature_evaluations,
                            "remaining_evaluations": remaining_curvature_evaluations,
                            "eigensolver_converged": eigensolver_converged,
                            "eigensolver_sweeps": sweeps,
                            "discretization_bound": discretization,
                            "roundoff_bound": roundoff,
                            "manifold_rank": len(manifold_normals),
                        }

    curvature_passed = (
        bool(curvature.get("resolved"))
        and bool(curvature.get("positive"))
        and not bool(curvature.get("sampled_descent"))
    )
    passed = (
        feasible
        and kkt_stationary
        and locally_minimal
        and curvature_passed
        and math.isfinite(objective)
    )
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
                "kind": "independent_active_constraint_kkt",
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
                "kind": "independent_feasible_direction_local_minimum",
                "passed": locally_minimal,
                "feasible_probe_count": feasible_probe_count,
                "direction_count": len(directions),
                "equality_rank": len(equality_normals),
                "maximum_sampled_decrease": maximum_local_decrease,
                "threshold": local_threshold,
            },
            {
                "kind": "independent_tangent_space_second_order",
                "passed": curvature_passed,
                **curvature,
            },
            {"kind": "finite_objective", "passed": math.isfinite(objective)},
        ],
        residual=max(
            maximum_violation,
            kkt_residual,
            complementarity_residual,
            max(0.0, -float(curvature.get("minimum_curvature", 0.0))),
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
