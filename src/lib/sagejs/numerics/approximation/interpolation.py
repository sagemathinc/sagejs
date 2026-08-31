"""Stable polynomial and piecewise-linear interpolation."""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalPlan, NumericalProblem, NumericalValidation, ResourceBudget
from ..trace import NumericalTrace, TracePolicy
from ._common import (
    MACHINE_EPSILON,
    ApproximationExecution,
    ApproximationResult,
    ApproximationStopped,
    approximation_plan,
    data_problem,
    default_budget,
    failed_result,
    make_result,
    validate_nodes_values,
)


def interpolation_problem(
    nodes: Sequence[Any],
    values: Sequence[Any],
    *,
    method: str = "auto",
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "summary",
) -> NumericalProblem:
    """Describe interpolation of finite samples at distinct real nodes.

    `method="auto"` selects the second barycentric polynomial form. Use
    `method="linear"` when local piecewise behavior is preferable to one
    global polynomial.
    """
    x, y = validate_nodes_values(nodes, values)
    if method not in ("auto", "barycentric", "linear"):
        raise ValueError("interpolation method must be auto, barycentric, or linear")
    budget = (
        default_budget(work_items=len(x) + 8)
        if resource_budget is None
        else resource_budget
    )
    return data_problem(
        "polynomial_interpolation" if method != "linear" else "piecewise_interpolation",
        x,
        y,
        method=method,
        budget=budget,
        trace=trace,
        metadata={"interpolation_dimension": 1},
    )


def plan_interpolation(problem: NumericalProblem) -> NumericalPlan:
    """Resolve an interpolation problem without constructing its weights."""
    if problem.operation not in (
        "polynomial_interpolation",
        "piecewise_interpolation",
    ):
        raise ValueError("not an interpolation problem")
    requested = problem.method
    method = "barycentric" if requested == "auto" else requested
    nodes = problem.initial_data.get("nodes")
    count = len(nodes) if isinstance(nodes, list) else 0
    if method == "barycentric":
        reason = (
            "the second barycentric form evaluates the Lagrange polynomial "
            "without expanding ill-scaled monomial coefficients"
        )
        capability: dict[str, Any] = {
            "representation": "second-barycentric-form",
            "weight_scaling": "signed-log-normalized",
            "construction_complexity": "O(n^2)",
            "evaluation_complexity": "O(n)",
            "validation": ["node_reproduction", "newton_form_crosscheck"],
            "numeric_types": ["binary64"],
            "platforms": ["browser", "node", "sea", "native-four-platform"],
        }
        rejected = [
            {
                "method": "expanded-monomial",
                "reason": "Vandermonde expansion is less stable and unnecessary",
            },
            {
                "method": "linear",
                "reason": "the requested operation is global polynomial interpolation",
            },
        ]
    elif method == "linear":
        reason = "piecewise linear interpolation is local and avoids global oscillation"
        capability = {
            "representation": "piecewise-linear",
            "construction_complexity": "O(n)",
            "evaluation_complexity": "O(log n)",
            "validation": ["node_reproduction"],
            "numeric_types": ["binary64"],
            "platforms": ["browser", "node", "sea", "native-four-platform"],
        }
        rejected = [
            {
                "method": "barycentric",
                "reason": "the caller explicitly requested local linear pieces",
            }
        ]
    else:
        raise ValueError("unsupported interpolation method: " + method)
    return approximation_plan(
        problem,
        method=method,
        reason=reason,
        capability=capability,
        expected_resources={
            "sample_count": count,
            "coefficient_scalars": count if method == "barycentric" else 2 * count,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        rejected=rejected,
    )


def _scaled_barycentric_weights(
    nodes: Sequence[float], execution: ApproximationExecution
) -> list[float]:
    """Compute relative Lagrange weights without product overflow."""
    count = len(nodes)
    span = nodes[-1] - nodes[0]
    logs: list[float] = []
    signs: list[float] = []
    for i in range(count):
        execution.step()
        log_magnitude = 0.0
        sign = 1.0
        xi = nodes[i]
        for j in range(count):
            if i == j:
                continue
            difference = (xi - nodes[j]) / span
            if difference < 0.0:
                sign = -sign
            log_magnitude -= math.log(abs(difference))
        logs.append(log_magnitude)
        signs.append(sign)
        execution.trace.append(
            "iteration",
            iteration=i + 1,
            accepted=True,
            data={"phase": "weight_construction", "node_index": i},
        )
    normalizer = max(logs)
    weights = [signs[i] * math.exp(logs[i] - normalizer) for i in range(count)]
    if min(abs(value) for value in weights) == 0.0:
        raise ValueError(
            "barycentric weights underflowed; use fewer or Chebyshev-clustered "
            "nodes, or choose method='linear'"
        )
    return weights


def _linear_model(nodes: list[float], values: list[float]) -> dict[str, Any]:
    slopes = [
        (values[index + 1] - values[index]) / (nodes[index + 1] - nodes[index])
        for index in range(len(nodes) - 1)
    ]
    return {
        "kind": "piecewise_linear",
        "nodes": nodes,
        "values": values,
        "slopes": slopes,
        "extrapolation": "end-segment",
        "condition_estimate": 1.0,
        "explanation": "Each query uses only its enclosing segment.",
    }


def _newton_coefficients(
    nodes: Sequence[float], values: Sequence[float]
) -> list[float]:
    coefficients = list(values)
    count = len(nodes)
    for order in range(1, count):
        for index in range(count - 1, order - 1, -1):
            coefficients[index] = (coefficients[index] - coefficients[index - 1]) / (
                nodes[index] - nodes[index - order]
            )
    return coefficients


def _newton_evaluate(
    nodes: Sequence[float], coefficients: Sequence[float], x: float
) -> float:
    answer = coefficients[-1]
    for index in range(len(coefficients) - 2, -1, -1):
        answer = coefficients[index] + (x - nodes[index]) * answer
    return answer


def _interval_index(nodes: Sequence[float], x: float) -> int:
    if x <= nodes[0]:
        return 0
    if x >= nodes[-1]:
        return len(nodes) - 2
    lower = 0
    upper = len(nodes) - 1
    while upper - lower > 1:
        middle = (lower + upper) // 2
        if x < nodes[middle]:
            upper = middle
        else:
            lower = middle
    return lower


def _barycentric_value(model: Mapping[str, Any], x: float, derivative: int) -> float:
    nodes = model["nodes"]
    values = model["values"]
    weights = model["weights"]
    if (
        not isinstance(nodes, list)
        or not isinstance(values, list)
        or not isinstance(weights, list)
    ):
        raise TypeError("invalid barycentric model")
    for index in range(len(nodes)):
        if x == float(nodes[index]):
            if derivative == 0:
                return float(values[index])
            terms = []
            wi = float(weights[index])
            xi = float(nodes[index])
            yi = float(values[index])
            for other in range(len(nodes)):
                if other != index:
                    terms.append(
                        (float(weights[other]) / wi)
                        * (float(values[other]) - yi)
                        / (xi - float(nodes[other]))
                    )
            return math.fsum(terms)
    terms = [
        float(weights[index]) / (x - float(nodes[index])) for index in range(len(nodes))
    ]
    denominator = math.fsum(terms)
    if denominator == 0.0 or not math.isfinite(denominator):
        raise ArithmeticError("barycentric denominator lost significance")
    numerator = math.fsum(
        terms[index] * float(values[index]) for index in range(len(nodes))
    )
    value = numerator / denominator
    if derivative == 0:
        return value
    squared = [terms[index] / (x - float(nodes[index])) for index in range(len(nodes))]
    return (
        value * math.fsum(squared)
        - math.fsum(
            squared[index] * float(values[index]) for index in range(len(nodes))
        )
    ) / denominator


def evaluate_interpolant(
    model: Mapping[str, Any], x: float, derivative: int = 0
) -> float:
    """Evaluate a detached interpolation model."""
    point = float(x)
    if not math.isfinite(point):
        raise ValueError("interpolation query must be finite")
    if derivative not in (0, 1):
        raise ValueError("interpolation derivative order must be 0 or 1")
    kind = model.get("kind")
    if kind == "barycentric_polynomial":
        return _barycentric_value(model, point, derivative)
    if kind == "piecewise_linear":
        nodes = model["nodes"]
        values = model["values"]
        slopes = model["slopes"]
        if (
            not isinstance(nodes, list)
            or not isinstance(values, list)
            or not isinstance(slopes, list)
        ):
            raise TypeError("invalid piecewise-linear model")
        index = _interval_index(nodes, point)
        if derivative == 1:
            return float(slopes[index])
        return float(values[index]) + float(slopes[index]) * (
            point - float(nodes[index])
        )
    raise ValueError("unknown interpolation model")


def _lebesgue_estimate(model: Mapping[str, Any]) -> float:
    nodes = model["nodes"]
    weights = model["weights"]
    if not isinstance(nodes, list) or not isinstance(weights, list):
        return 1.0
    count = min(257, max(33, 4 * len(nodes) + 1))
    lower = float(nodes[0])
    upper = float(nodes[-1])
    maximum = 1.0
    for sample in range(count):
        x = lower + (upper - lower) * (sample + 0.5) / count
        if any(x == float(node) for node in nodes):
            continue
        terms = [
            float(weights[index]) / (x - float(nodes[index]))
            for index in range(len(nodes))
        ]
        denominator = abs(math.fsum(terms))
        if denominator == 0.0:
            return 1.0e308
        maximum = max(maximum, math.fsum(abs(value) for value in terms) / denominator)
    return min(maximum, 1.0e308)


def solve_interpolation_problem(
    problem: NumericalProblem,
    *,
    cancel: Callable[[], bool] | None = None,
) -> ApproximationResult:
    """Construct and independently validate an interpolation model."""
    plan = plan_interpolation(problem)
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
    if not isinstance(nodes_value, list) or not isinstance(values_value, list):
        raise ValueError("interpolation problem is missing sampled data")
    nodes = [float(value) for value in nodes_value]
    values = [float(value) for value in values_value]
    diagnostics: list[NumericalDiagnostic] = []
    try:
        if plan.method == "linear":
            model = _linear_model(nodes, values)
            execution.step()
            crosscheck = 0.0
            condition = 1.0
        else:
            weights = _scaled_barycentric_weights(nodes, execution)
            model: dict[str, Any] = {
                "kind": "barycentric_polynomial",
                "nodes": nodes,
                "values": values,
                "weights": weights,
                "weight_normalization": "max-absolute-one",
                "explanation": (
                    "The second barycentric formula is used directly; no "
                    "Vandermonde system or monomial expansion is formed."
                ),
            }
            condition = _lebesgue_estimate(model)
            model["condition_estimate"] = condition
            crosscheck = 0.0
            if len(nodes) <= 32:
                coefficients = _newton_coefficients(nodes, values)
                for index in range(len(nodes) - 1):
                    point = nodes[index] + 0.3819660112501051 * (
                        nodes[index + 1] - nodes[index]
                    )
                    left = evaluate_interpolant(model, point)
                    right = _newton_evaluate(nodes, coefficients, point)
                    crosscheck = max(crosscheck, abs(left - right))
        node_residual = max(
            abs(evaluate_interpolant(model, nodes[index]) - values[index])
            for index in range(len(nodes))
        )
    except ApproximationStopped as stopped:
        return failed_result(problem, plan, execution, stopped.status)
    scale = max(1.0, max(abs(value) for value in values))
    tolerance = 256.0 * MACHINE_EPSILON * scale * max(1.0, min(condition, 1.0e8))
    passed = node_residual <= tolerance and crosscheck <= tolerance
    if condition > 1.0e6:
        diagnostics.append(
            NumericalDiagnostic(
                "ill_conditioned", details={"lebesgue_estimate": condition}
            )
        )
    if crosscheck > tolerance:
        diagnostics.append(
            NumericalDiagnostic(
                "loss_of_significance",
                details={"independent_form_disagreement": crosscheck},
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
                "kind": "newton_form_crosscheck",
                "maximum_disagreement": crosscheck,
                "performed": len(nodes) <= 32 and plan.method == "barycentric",
                "passed": crosscheck <= tolerance,
            },
        ],
        residual=node_residual,
        error_estimate=crosscheck,
        condition_estimate=condition,
    )
    trace.append(
        "validation",
        data={
            "node_residual": node_residual,
            "crosscheck": crosscheck,
            "condition_estimate": condition,
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
        measurements={"sample_count": len(nodes), "construction_passes": 1},
    )


def interpolate(
    nodes: Sequence[Any],
    values: Sequence[Any],
    *,
    method: str = "auto",
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "summary",
    cancel: Callable[[], bool] | None = None,
) -> ApproximationResult:
    """Interpolate sampled data and return an inspectable structured result."""
    problem = interpolation_problem(
        nodes,
        values,
        method=method,
        resource_budget=resource_budget,
        trace=trace,
    )
    return solve_interpolation_problem(problem, cancel=cancel)
