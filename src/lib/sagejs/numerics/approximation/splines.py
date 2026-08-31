"""Cubic interpolation splines with explicit boundary conditions."""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalPlan, NumericalProblem, NumericalValidation, ResourceBudget
from ..trace import NumericalTrace, TracePolicy
from ._common import (
    MACHINE_EPSILON,
    QUALIFIED_PLATFORM_SUPPORT,
    ApproximationExecution,
    ApproximationResult,
    ApproximationStopped,
    approximation_plan,
    data_problem,
    default_budget,
    failed_result,
    finite_floats,
    make_result,
    validate_nodes_values,
)


def _normalize_boundary(boundary: Any) -> dict[str, Any]:
    if isinstance(boundary, str):
        if boundary == "not-a-knot":
            return {"kind": "not-a-knot"}
        if boundary == "natural":
            return {
                "kind": "explicit",
                "name": "natural",
                "left": {"order": 2, "value": 0.0},
                "right": {"order": 2, "value": 0.0},
            }
        if boundary == "clamped":
            return {
                "kind": "explicit",
                "name": "clamped",
                "left": {"order": 1, "value": 0.0},
                "right": {"order": 1, "value": 0.0},
            }
        if boundary == "periodic":
            return {"kind": "periodic"}
        raise ValueError(
            "boundary must be not-a-knot, natural, clamped, periodic, or an endpoint pair"
        )
    if not isinstance(boundary, Sequence) or isinstance(boundary, (str, bytes)):
        raise TypeError("spline boundary must be a name or a two-endpoint sequence")
    if len(boundary) != 2:
        raise ValueError("spline boundary requires two endpoint conditions")
    if all(
        isinstance(value, (int, float)) and not isinstance(value, bool)
        for value in boundary
    ):
        values = finite_floats(boundary, "boundary")
        return {
            "kind": "explicit",
            "name": "clamped",
            "left": {"order": 1, "value": values[0]},
            "right": {"order": 1, "value": values[1]},
        }
    endpoints: list[dict[str, Any]] = []
    for side in range(2):
        condition = boundary[side]
        if not isinstance(condition, Sequence) or isinstance(condition, (str, bytes)):
            raise TypeError("each explicit endpoint condition must be (order, value)")
        if len(condition) != 2:
            raise ValueError("each endpoint condition must be (order, value)")
        order = condition[0]
        if isinstance(order, bool) or not isinstance(order, int) or order not in (1, 2):
            raise ValueError("endpoint derivative order must be 1 or 2")
        value = float(condition[1])
        if not math.isfinite(value):
            raise ValueError("endpoint derivative values must be finite")
        endpoints.append({"order": order, "value": value})
    return {
        "kind": "explicit",
        "name": "mixed",
        "left": endpoints[0],
        "right": endpoints[1],
    }


def _validate_spline_envelope(
    nodes: Sequence[float], values: Sequence[float]
) -> list[float]:
    """Validate the finite spacing and slope arithmetic used by every solver."""
    widths = [nodes[index + 1] - nodes[index] for index in range(len(nodes) - 1)]
    if any(not math.isfinite(width) or width <= 0.0 for width in widths):
        raise ValueError(
            "spline node spacing exceeds the supported binary64 envelope; rescale nodes"
        )
    if not math.isfinite(1.0 / min(widths)):
        raise ValueError(
            "spline inverse node spacing exceeds the supported binary64 envelope; "
            "rescale nodes"
        )
    if any(
        not math.isfinite(widths[index - 1] + widths[index])
        for index in range(1, len(widths))
    ):
        raise ValueError(
            "adjacent spline spacing exceeds the supported binary64 envelope; rescale nodes"
        )
    if any(
        not math.isfinite(values[index + 1] - values[index])
        for index in range(len(values) - 1)
    ):
        raise ValueError(
            "adjacent spline value differences exceed the supported binary64 envelope"
        )
    return widths


def spline_problem(
    nodes: Sequence[Any],
    values: Sequence[Any],
    *,
    boundary: Any = "not-a-knot",
    extrapolate: bool = True,
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "summary",
) -> NumericalProblem:
    """Describe a C2 cubic spline with inspectable endpoint conditions.

    A two-number `boundary=(left_slope, right_slope)` is clamped. For mixed
    conditions use `boundary=((order, value), (order, value))`, where `order`
    is 1 or 2.
    """
    x, y = validate_nodes_values(nodes, values)
    _validate_spline_envelope(x, y)
    normalized = _normalize_boundary(boundary)
    if normalized["kind"] == "periodic":
        if len(x) < 3:
            raise ValueError("a periodic spline requires at least three nodes")
        scale = max(1.0, max(abs(value) for value in y))
        if abs(y[0] - y[-1]) > 32.0 * MACHINE_EPSILON * scale:
            raise ValueError("periodic spline endpoint values must agree")
        y[-1] = y[0]
    budget = (
        default_budget(work_items=5 * len(x) + 16)
        if resource_budget is None
        else resource_budget
    )
    return data_problem(
        "cubic_spline",
        x,
        y,
        method=str(normalized["kind"]),
        budget=budget,
        trace=trace,
        metadata={"interpolation_dimension": 1},
        extra_initial_data={
            "boundary": normalized,
            "extrapolate": bool(extrapolate),
        },
    )


def plan_spline(problem: NumericalProblem) -> NumericalPlan:
    """Resolve a spline problem without solving its coefficient system."""
    if problem.operation != "cubic_spline":
        raise ValueError("not a cubic spline problem")
    boundary = problem.initial_data.get("boundary")
    if not isinstance(boundary, dict):
        raise ValueError("spline problem has no boundary record")
    kind = str(boundary.get("kind", ""))
    name = str(boundary.get("name", kind))
    count_value = problem.initial_data.get("nodes")
    count = len(count_value) if isinstance(count_value, list) else 0
    reason = (
        "the caller's explicit "
        + name
        + " endpoint condition closes the C2 cubic system"
    )
    return approximation_plan(
        problem,
        method=kind,
        reason=reason,
        capability={
            "representation": "piecewise-power-basis",
            "continuity": "C2",
            "boundary_condition": boundary,
            "construction_complexity": "O(n)",
            "evaluation_complexity": "O(log n)",
            "validation": [
                "node_reproduction",
                "C1_continuity",
                "C2_continuity",
                "boundary_residual",
            ],
            "numeric_types": ["binary64"],
            "platform_support": QUALIFIED_PLATFORM_SUPPORT,
        },
        expected_resources={
            "sample_count": count,
            "coefficient_scalars": max(0, 4 * (count - 1)),
            "linear_system": "tridiagonal"
            if kind != "periodic"
            else "cyclic-tridiagonal",
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
    )


def _solve_tridiagonal(
    lower: Sequence[float],
    diagonal: Sequence[float],
    upper: Sequence[float],
    right: Sequence[float],
    execution: ApproximationExecution,
) -> tuple[list[float], float]:
    count = len(diagonal)
    if len(right) != count or len(lower) != count - 1 or len(upper) != count - 1:
        raise ValueError("invalid tridiagonal system shape")
    b = list(diagonal)
    d = list(right)
    c = list(upper)
    scale = max([abs(value) for value in b] + [1.0])
    minimum_pivot = scale
    for index in range(1, count):
        execution.step()
        pivot = b[index - 1]
        minimum_pivot = min(minimum_pivot, abs(pivot))
        if abs(pivot) <= MACHINE_EPSILON * scale:
            raise ArithmeticError("spline system has a zero numerical pivot")
        factor = float(lower[index - 1]) / pivot
        b[index] -= factor * c[index - 1]
        d[index] -= factor * d[index - 1]
    minimum_pivot = min(minimum_pivot, abs(b[-1]))
    if abs(b[-1]) <= MACHINE_EPSILON * scale:
        raise ArithmeticError("spline system has a zero numerical pivot")
    answer = [0.0] * count
    answer[-1] = d[-1] / b[-1]
    for index in range(count - 2, -1, -1):
        execution.check()
        answer[index] = (d[index] - c[index] * answer[index + 1]) / b[index]
    return answer, scale / max(minimum_pivot, MACHINE_EPSILON * scale)


def _solve_explicit_second_derivatives(
    nodes: Sequence[float],
    values: Sequence[float],
    boundary: Mapping[str, Any],
    execution: ApproximationExecution,
) -> tuple[list[float], float]:
    count = len(nodes)
    h, delta = _spline_spacing_and_slopes(nodes, values, execution)
    lower = [0.0] * (count - 1)
    diagonal = [0.0] * count
    upper = [0.0] * (count - 1)
    right = [0.0] * count
    for index in range(1, count - 1):
        lower[index - 1] = h[index - 1]
        diagonal[index] = 2.0 * (h[index - 1] + h[index])
        upper[index] = h[index]
        right[index] = 6.0 * (delta[index] - delta[index - 1])
    left = boundary["left"]
    right_boundary = boundary["right"]
    if not isinstance(left, dict) or not isinstance(right_boundary, dict):
        raise ValueError("invalid explicit spline boundary")
    if int(left["order"]) == 1:
        diagonal[0] = 2.0 * h[0]
        upper[0] = h[0]
        right[0] = 6.0 * (delta[0] - float(left["value"]))
    else:
        diagonal[0] = 1.0
        upper[0] = 0.0
        right[0] = float(left["value"])
    if int(right_boundary["order"]) == 1:
        lower[-1] = h[-1]
        diagonal[-1] = 2.0 * h[-1]
        right[-1] = 6.0 * (float(right_boundary["value"]) - delta[-1])
    else:
        lower[-1] = 0.0
        diagonal[-1] = 1.0
        right[-1] = float(right_boundary["value"])
    return _solve_tridiagonal(lower, diagonal, upper, right, execution)


def _solve_not_a_knot(
    nodes: Sequence[float],
    values: Sequence[float],
    execution: ApproximationExecution,
) -> tuple[list[float], float]:
    count = len(nodes)
    h, delta = _spline_spacing_and_slopes(nodes, values, execution)
    if count == 2:
        return [0.0, 0.0], 1.0
    if count == 3:
        second = 2.0 * (delta[1] - delta[0]) / (h[0] + h[1])
        return [second, second, second], 1.0
    interior = count - 2
    lower = [0.0] * (interior - 1)
    diagonal = [0.0] * interior
    upper = [0.0] * (interior - 1)
    right = [0.0] * interior
    h0 = h[0]
    h1 = h[1]
    diagonal[0] = 2.0 * (h0 + h1) + h0 * (h0 + h1) / h1
    upper[0] = h1 - h0 * h0 / h1
    right[0] = 6.0 * (delta[1] - delta[0])
    for variable in range(1, interior - 1):
        node = variable + 1
        lower[variable - 1] = h[node - 1]
        diagonal[variable] = 2.0 * (h[node - 1] + h[node])
        upper[variable] = h[node]
        right[variable] = 6.0 * (delta[node] - delta[node - 1])
    previous = h[-2]
    last = h[-1]
    lower[-1] = previous - last * last / previous
    diagonal[-1] = 2.0 * (previous + last) + last * (previous + last) / previous
    right[-1] = 6.0 * (delta[-1] - delta[-2])
    middle, condition = _solve_tridiagonal(lower, diagonal, upper, right, execution)
    first = ((h0 + h1) * middle[0] - h0 * middle[1]) / h1
    endpoint = (-last * middle[-2] + (previous + last) * middle[-1]) / previous
    return [first] + middle + [endpoint], condition


def _solve_periodic(
    nodes: Sequence[float],
    values: Sequence[float],
    execution: ApproximationExecution,
) -> tuple[list[float], float]:
    count = len(nodes)
    h, delta = _spline_spacing_and_slopes(nodes, values, execution)
    size = count - 1
    diagonal = [0.0] * size
    lower = [0.0] * (size - 1)
    upper = [0.0] * (size - 1)
    right = [0.0] * size
    diagonal[0] = 2.0 * (h[-1] + h[0])
    right[0] = 6.0 * (delta[0] - delta[-1])
    for index in range(1, size):
        diagonal[index] = 2.0 * (h[index - 1] + h[index])
        right[index] = 6.0 * (delta[index] - delta[index - 1])
    for index in range(size - 1):
        upper[index] = h[index]
        lower[index] = h[index]
    alpha = h[-1]
    beta = h[-1]
    if size == 2:
        off_diagonal = h[0] + h[1]
        determinant = diagonal[0] * diagonal[1] - off_diagonal * off_diagonal
        if determinant == 0.0:
            raise ArithmeticError("periodic spline system is singular")
        answer = [
            (right[0] * diagonal[1] - off_diagonal * right[1]) / determinant,
            (diagonal[0] * right[1] - off_diagonal * right[0]) / determinant,
        ]
        execution.step()
        return answer + [answer[0]], max(diagonal) / min(diagonal)
    gamma = -diagonal[0]
    modified = list(diagonal)
    modified[0] -= gamma
    modified[-1] -= alpha * beta / gamma
    solution, condition_x = _solve_tridiagonal(lower, modified, upper, right, execution)
    update = [0.0] * size
    update[0] = gamma
    update[-1] = alpha
    correction, condition_z = _solve_tridiagonal(
        lower, modified, upper, update, execution
    )
    factor = (solution[0] + beta * solution[-1] / gamma) / (
        1.0 + correction[0] + beta * correction[-1] / gamma
    )
    answer = [solution[index] - factor * correction[index] for index in range(size)]
    return answer + [answer[0]], max(condition_x, condition_z)


def _spline_spacing_and_slopes(
    nodes: Sequence[float],
    values: Sequence[float],
    execution: ApproximationExecution,
) -> tuple[list[float], list[float]]:
    """Materialize spline geometry with bounded cancellation/time latency."""
    widths: list[float] = []
    slopes: list[float] = []
    for index in range(len(nodes) - 1):
        if index % 32 == 0:
            execution.check()
        width = nodes[index + 1] - nodes[index]
        slope = (values[index + 1] - values[index]) / width
        if not math.isfinite(width) or width <= 0.0 or not math.isfinite(slope):
            raise ArithmeticError("spline spacing or divided difference is not finite")
        widths.append(width)
        slopes.append(slope)
    return widths, slopes


def _spline_model(
    nodes: list[float],
    values: list[float],
    second: list[float],
    boundary: Mapping[str, Any],
    extrapolate: bool,
    condition: float,
    execution: ApproximationExecution,
) -> dict[str, Any]:
    coefficients: list[list[float]] = []
    for index in range(len(nodes) - 1):
        execution.step()
        width = nodes[index + 1] - nodes[index]
        slope = (values[index + 1] - values[index]) / width
        row = [
            values[index],
            slope - width * (2.0 * second[index] + second[index + 1]) / 6.0,
            second[index] / 2.0,
            (second[index + 1] - second[index]) / (6.0 * width),
        ]
        if any(not math.isfinite(value) for value in row):
            raise ArithmeticError("spline coefficients exceed the binary64 envelope")
        coefficients.append(row)
        execution.trace.append(
            "iteration",
            iteration=index + 1,
            accepted=True,
            data={"phase": "segment_construction", "segment": index},
        )
    return {
        "kind": "cubic_spline",
        "nodes": nodes,
        "values": values,
        "coefficients": coefficients,
        "second_derivatives": second,
        "boundary_condition": boundary,
        "extrapolate": extrapolate,
        "periodic": boundary.get("kind") == "periodic",
        "condition_estimate": min(condition, 1.0e308),
        "explanation": (
            "Each interval stores a + b*dx + c*dx^2 + d*dx^3; the "
            "coefficient solve enforces value, first-derivative, and "
            "second-derivative continuity."
        ),
    }


def _spline_interval(model: Mapping[str, Any], point: float) -> tuple[int, float]:
    nodes = model["nodes"]
    if not isinstance(nodes, list):
        raise TypeError("invalid spline model")
    lower_endpoint = float(nodes[0])
    upper_endpoint = float(nodes[-1])
    x = point
    if bool(model.get("periodic")):
        period = upper_endpoint - lower_endpoint
        x = lower_endpoint + ((x - lower_endpoint) % period)
    elif not bool(model.get("extrapolate", True)) and not (
        lower_endpoint <= x <= upper_endpoint
    ):
        raise ValueError("spline query is outside the interpolation interval")
    if x <= lower_endpoint:
        return 0, x
    if x >= upper_endpoint:
        return len(nodes) - 2, x
    lower = 0
    upper = len(nodes) - 1
    while upper - lower > 1:
        middle = (lower + upper) // 2
        if x < float(nodes[middle]):
            upper = middle
        else:
            lower = middle
    return lower, x


def evaluate_spline(model: Mapping[str, Any], x: float, derivative: int = 0) -> float:
    """Evaluate a detached cubic spline and derivatives through order three."""
    point = float(x)
    if not math.isfinite(point):
        raise ValueError("spline query must be finite")
    if isinstance(derivative, bool) or derivative not in (0, 1, 2, 3):
        raise ValueError("spline derivative order must be between 0 and 3")
    index, adjusted = _spline_interval(model, point)
    if derivative == 3:
        nodes_value = model.get("nodes")
        coefficients_value = model.get("coefficients")
        if not isinstance(nodes_value, list) or not isinstance(
            coefficients_value, list
        ):
            raise TypeError("invalid spline model")
        knot_index: int | None = None
        for candidate in range(1, len(nodes_value) - 1):
            if adjusted == float(nodes_value[candidate]):
                knot_index = candidate
                break
        if bool(model.get("periodic")) and adjusted == float(nodes_value[0]):
            left_third = 6.0 * float(coefficients_value[-1][3])
            right_third = 6.0 * float(coefficients_value[0][3])
            if left_third != right_third:
                raise ValueError(
                    "periodic spline third derivative is undefined at the period boundary"
                )
        elif knot_index is not None:
            left_third = 6.0 * float(coefficients_value[knot_index - 1][3])
            right_third = 6.0 * float(coefficients_value[knot_index][3])
            if left_third != right_third:
                raise ValueError(
                    "spline third derivative is undefined at an interior knot"
                )
    return _evaluate_spline_segment(model, index, adjusted, derivative)


def _evaluate_spline_segment(
    model: Mapping[str, Any], index: int, point: float, derivative: int
) -> float:
    """Evaluate one explicitly selected segment without periodic wrapping."""
    nodes = model["nodes"]
    coefficients = model["coefficients"]
    if not isinstance(nodes, list) or not isinstance(coefficients, list):
        raise TypeError("invalid spline model")
    row = coefficients[index]
    if not isinstance(row, list) or len(row) != 4:
        raise TypeError("invalid spline coefficient row")
    a, b, c, d = (float(value) for value in row)
    dx = point - float(nodes[index])
    if derivative == 0:
        answer = a + dx * (b + dx * (c + dx * d))
    elif derivative == 1:
        answer = b + dx * (2.0 * c + dx * 3.0 * d)
    elif derivative == 2:
        answer = 2.0 * c + 6.0 * d * dx
    else:
        answer = 6.0 * d
    if not math.isfinite(answer):
        raise ArithmeticError("spline evaluation overflowed binary64")
    return answer


def _validation_metrics(
    model: Mapping[str, Any], execution: ApproximationExecution | None = None
) -> tuple[float, float, float, float]:
    nodes = model["nodes"]
    values = model["values"]
    coefficients = model["coefficients"]
    boundary = model["boundary_condition"]
    if (
        not isinstance(nodes, list)
        or not isinstance(values, list)
        or not isinstance(coefficients, list)
        or not isinstance(boundary, dict)
    ):
        raise TypeError("invalid spline model")
    node_residual = 0.0
    for index in range(len(nodes)):
        if execution is not None:
            execution.check()
        segment = min(index, len(coefficients) - 1)
        node_residual = max(
            node_residual,
            abs(
                _evaluate_spline_segment(model, segment, float(nodes[index]), 0)
                - float(values[index])
            ),
        )
    c1_jump = 0.0
    c2_jump = 0.0
    for index in range(1, len(nodes) - 1):
        if execution is not None:
            execution.check()
        width = float(nodes[index]) - float(nodes[index - 1])
        left = coefficients[index - 1]
        right = coefficients[index]
        if not isinstance(left, list) or not isinstance(right, list):
            raise TypeError("invalid spline coefficients")
        left_d1 = (
            float(left[1])
            + 2.0 * float(left[2]) * width
            + 3.0 * float(left[3]) * width * width
        )
        left_d2 = 2.0 * float(left[2]) + 6.0 * float(left[3]) * width
        c1_jump = max(c1_jump, abs(left_d1 - float(right[1])))
        c2_jump = max(c2_jump, abs(left_d2 - 2.0 * float(right[2])))
    kind = boundary.get("kind")
    if kind == "not-a-knot":
        if len(coefficients) == 1:
            boundary_residual = 0.0
        else:
            boundary_residual = max(
                abs(float(coefficients[0][3]) - float(coefficients[1][3])),
                abs(float(coefficients[-2][3]) - float(coefficients[-1][3])),
            )
    elif kind == "periodic":
        boundary_residual = max(
            abs(
                _evaluate_spline_segment(model, 0, float(nodes[0]), 1)
                - _evaluate_spline_segment(
                    model, len(coefficients) - 1, float(nodes[-1]), 1
                )
            ),
            abs(
                _evaluate_spline_segment(model, 0, float(nodes[0]), 2)
                - _evaluate_spline_segment(
                    model, len(coefficients) - 1, float(nodes[-1]), 2
                )
            ),
        )
    else:
        left_condition = boundary["left"]
        right_condition = boundary["right"]
        if not isinstance(left_condition, dict) or not isinstance(
            right_condition, dict
        ):
            raise TypeError("invalid spline boundary")
        boundary_residual = max(
            abs(
                evaluate_spline(model, float(nodes[0]), int(left_condition["order"]))
                - float(left_condition["value"])
            ),
            abs(
                evaluate_spline(model, float(nodes[-1]), int(right_condition["order"]))
                - float(right_condition["value"])
            ),
        )
    metrics = (node_residual, c1_jump, c2_jump, boundary_residual)
    if any(not math.isfinite(value) for value in metrics):
        raise ArithmeticError("spline validation residual exceeds binary64")
    return metrics


def solve_spline_problem(
    problem: NumericalProblem,
    *,
    cancel: Callable[[], bool] | None = None,
) -> ApproximationResult:
    """Construct a cubic spline and independently check its defining equations."""
    plan = plan_spline(problem)
    trace = NumericalTrace(problem.trace_policy)
    execution = ApproximationExecution(problem, trace, cancel)
    trace.append(
        "start",
        data={"operation": problem.operation, "method": plan.method},
        important=True,
        force=True,
    )
    nodes_value = problem.initial_data.get("nodes")
    values_value = problem.initial_data.get("values")
    boundary_value = problem.initial_data.get("boundary")
    if (
        not isinstance(nodes_value, list)
        or not isinstance(values_value, list)
        or not isinstance(boundary_value, dict)
    ):
        raise ValueError("spline problem is missing construction data")
    boundary = boundary_value
    try:
        nodes, values = validate_nodes_values(nodes_value, values_value)
        widths = _validate_spline_envelope(nodes, values)
        if boundary.get("kind") == "periodic":
            scale = max(1.0, max(abs(value) for value in values))
            if abs(values[0] - values[-1]) > 32.0 * MACHINE_EPSILON * scale:
                raise ValueError("periodic spline endpoint values must agree")
            values[-1] = values[0]
        if boundary.get("kind") == "not-a-knot":
            second, condition = _solve_not_a_knot(nodes, values, execution)
        elif boundary.get("kind") == "periodic":
            second, condition = _solve_periodic(nodes, values, execution)
        else:
            second, condition = _solve_explicit_second_derivatives(
                nodes, values, boundary, execution
            )
        model = _spline_model(
            nodes,
            values,
            second,
            boundary,
            bool(problem.initial_data.get("extrapolate", True)),
            min(condition, 1.0e308),
            execution,
        )
        condition = min(condition, 1.0e308)
        node_residual, c1_jump, c2_jump, boundary_residual = _validation_metrics(
            model, execution
        )
    except ApproximationStopped as stopped:
        return failed_result(problem, plan, execution, stopped.status)
    except ValueError:
        return failed_result(problem, plan, execution, "invalid_problem")
    except ArithmeticError:
        return failed_result(problem, plan, execution, "validation_failed")
    scale = max(1.0, max(abs(value) for value in values))
    spacing = min(widths)
    tolerance = 4096.0 * MACHINE_EPSILON * scale * max(1.0, 1.0 / spacing)
    if not math.isfinite(tolerance):
        return failed_result(problem, plan, execution, "validation_failed")
    maximum_residual = max(node_residual, c1_jump, c2_jump, boundary_residual)
    passed = maximum_residual <= tolerance
    diagnostics: list[NumericalDiagnostic] = []
    if condition > 1.0e6:
        diagnostics.append(
            NumericalDiagnostic(
                "ill_conditioned", details={"pivot_ratio_indicator": condition}
            )
        )
    if not passed:
        diagnostics.append(NumericalDiagnostic("validation_failed"))
    validation = NumericalValidation(
        "validated_approximate",
        passed,
        checks=[
            {
                "kind": "node_reproduction",
                "maximum_residual": node_residual,
                "passed": node_residual <= tolerance,
            },
            {
                "kind": "C1_continuity",
                "maximum_jump": c1_jump,
                "passed": c1_jump <= tolerance,
            },
            {
                "kind": "C2_continuity",
                "maximum_jump": c2_jump,
                "passed": c2_jump <= tolerance,
            },
            {
                "kind": "boundary_condition",
                "maximum_residual": boundary_residual,
                "passed": boundary_residual <= tolerance,
            },
        ],
        residual=maximum_residual,
        error_estimate=None,
        condition_estimate=condition,
    )
    trace.append(
        "validation",
        data={
            "node_residual": node_residual,
            "C1_jump": c1_jump,
            "C2_jump": c2_jump,
            "boundary_residual": boundary_residual,
            "passed": passed,
        },
        important=True,
        force=True,
    )
    status = "converged" if passed else "validation_failed"
    trace.append(
        "finish",
        data={"status": status, "success": passed},
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    return make_result(
        problem,
        plan,
        execution,
        model=model,
        success=passed,
        status=status,
        validation=validation,
        diagnostics=diagnostics,
        measurements={
            "sample_count": len(nodes),
            "segment_count": len(nodes) - 1,
            "linear_system": "cyclic-tridiagonal"
            if boundary.get("kind") == "periodic"
            else "tridiagonal",
        },
    )


def cubic_spline(
    nodes: Sequence[Any],
    values: Sequence[Any],
    *,
    boundary: Any = "not-a-knot",
    extrapolate: bool = True,
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "summary",
    cancel: Callable[[], bool] | None = None,
) -> ApproximationResult:
    """Construct a validated C2 cubic spline."""
    problem = spline_problem(
        nodes,
        values,
        boundary=boundary,
        extrapolate=extrapolate,
        resource_budget=resource_budget,
        trace=trace,
    )
    return solve_spline_problem(problem, cancel=cancel)
