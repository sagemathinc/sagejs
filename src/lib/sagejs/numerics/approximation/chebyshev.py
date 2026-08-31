"""Chebyshev polynomial approximation on finite intervals."""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
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
    callback_problem,
    default_budget,
    failed_result,
    make_result,
)


def polynomial_approximation_problem(
    function: Callable[[float], Any],
    interval: tuple[float, float] | list[float],
    degree: int,
    *,
    method: str = "auto",
    tolerance: float | None = None,
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "summary",
    expression: str | None = None,
) -> NumericalProblem:
    """Describe fixed-degree polynomial approximation of a callback."""
    if isinstance(degree, bool) or not isinstance(degree, int) or degree < 0:
        raise ValueError("polynomial approximation degree must be nonnegative")
    if method not in ("auto", "chebyshev"):
        raise ValueError("polynomial approximation method must be auto or chebyshev")
    if tolerance is not None and (
        not math.isfinite(float(tolerance)) or float(tolerance) <= 0.0
    ):
        raise ValueError("approximation tolerance must be positive and finite")
    count = degree + 1
    validation_count = max(17, 2 * count + 1)
    budget = (
        default_budget(
            work_items=count + 8,
            evaluations=count + validation_count,
        )
        if resource_budget is None
        else resource_budget
    )
    return callback_problem(
        "polynomial_approximation",
        function,
        interval=interval,
        initial_data={
            "degree": degree,
            "sample_count": count,
            "validation_sample_count": validation_count,
        },
        tolerances={"target": tolerance},
        method="chebyshev" if method == "auto" else method,
        budget=budget,
        trace=trace,
        expression=expression,
    )


def plan_polynomial_approximation(problem: NumericalProblem) -> NumericalPlan:
    """Resolve Chebyshev sampling without evaluating the callback."""
    if problem.operation != "polynomial_approximation":
        raise ValueError("not a polynomial approximation problem")
    degree = int(problem.initial_data["degree"])
    count = degree + 1
    return approximation_plan(
        problem,
        method="chebyshev",
        reason=(
            "first-kind Chebyshev points reduce endpoint amplification and "
            "make the coefficient transform orthogonal on the sample grid"
        ),
        capability={
            "sample_grid": "Chebyshev-roots-first-kind",
            "coefficient_transform": "direct-DCT-II",
            "evaluation": "Clenshaw-recurrence",
            "construction_complexity": "O(n^2)",
            "evaluation_complexity": "O(n)",
            "validation": ["independent-holdout-residual", "coefficient-tail"],
            "numeric_types": ["binary64"],
            "platforms": ["browser", "node", "sea", "native-four-platform"],
        },
        expected_resources={
            "degree": degree,
            "construction_callback_evaluations": count,
            "validation_callback_evaluations": problem.initial_data.get(
                "validation_sample_count"
            ),
            "coefficient_scalars": count,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        rejected=[
            {
                "method": "equispaced-Vandermonde",
                "reason": "endpoint amplification and the Vandermonde solve are avoidable",
            }
        ],
    )


def _chebyshev_value(coefficients: list[float], t: float) -> float:
    if len(coefficients) == 0:
        return 0.0
    first = 0.0
    second = 0.0
    for index in range(len(coefficients) - 1, 0, -1):
        current = 2.0 * t * first - second + coefficients[index]
        second = first
        first = current
    return coefficients[0] + t * first - second


def _differentiate_coefficients(coefficients: list[float]) -> list[float]:
    degree = len(coefficients) - 1
    if degree <= 0:
        return [0.0]
    derivative = [0.0] * degree
    derivative[-1] = 2.0 * degree * coefficients[-1]
    if degree > 1:
        derivative[-2] = 2.0 * (degree - 1) * coefficients[-2]
        for index in range(degree - 3, -1, -1):
            derivative[index] = (
                derivative[index + 2] + 2.0 * (index + 1) * coefficients[index + 1]
            )
    derivative[0] *= 0.5
    return derivative


def evaluate_chebyshev(
    model: Mapping[str, Any], x: float, derivative: int = 0
) -> float:
    """Evaluate a detached Chebyshev series with Clenshaw recurrence."""
    point = float(x)
    if not math.isfinite(point):
        raise ValueError("Chebyshev query must be finite")
    if (
        isinstance(derivative, bool)
        or not isinstance(derivative, int)
        or derivative < 0
    ):
        raise ValueError("Chebyshev derivative order must be nonnegative")
    interval = model["interval"]
    coefficients_value = model["coefficients"]
    if (
        not isinstance(interval, list)
        or len(interval) != 2
        or not isinstance(coefficients_value, list)
    ):
        raise TypeError("invalid Chebyshev model")
    lower = float(interval[0])
    upper = float(interval[1])
    coefficients = [float(value) for value in coefficients_value]
    scale = 2.0 / (upper - lower)
    for _ in range(derivative):
        coefficients = _differentiate_coefficients(coefficients)
    t = (2.0 * point - lower - upper) / (upper - lower)
    return (scale**derivative) * _chebyshev_value(coefficients, t)


def solve_polynomial_approximation_problem(
    problem: NumericalProblem,
    *,
    cancel: Callable[[], bool] | None = None,
) -> ApproximationResult:
    """Sample, transform, and honestly validate a Chebyshev approximant."""
    plan = plan_polynomial_approximation(problem)
    trace = NumericalTrace(problem.trace_policy)
    execution = ApproximationExecution(problem, trace, cancel)
    trace.append(
        "start",
        data={"operation": problem.operation, "method": plan.method},
        important=True,
        force=True,
    )
    interval = problem.bounds.get("interval")
    if not isinstance(interval, list) or len(interval) != 2:
        raise ValueError("polynomial approximation requires an interval")
    lower = float(interval[0])
    upper = float(interval[1])
    degree = int(problem.initial_data["degree"])
    count = degree + 1
    midpoint = 0.5 * (lower + upper)
    radius = 0.5 * (upper - lower)
    nodes: list[float] = []
    values: list[float] = []
    try:
        for index in range(count):
            theta = math.pi * (index + 0.5) / count
            node = midpoint + radius * math.cos(theta)
            nodes.append(node)
            values.append(
                execution.evaluate(
                    node,
                    iteration=0,
                    trace_data={"phase": "Chebyshev_sampling", "sample_index": index},
                )
            )
        coefficients: list[float] = []
        for order in range(count):
            execution.step()
            factor = 1.0 / count if order == 0 else 2.0 / count
            coefficient = factor * math.fsum(
                values[index] * math.cos(order * math.pi * (index + 0.5) / count)
                for index in range(count)
            )
            coefficients.append(coefficient)
            trace.append(
                "iteration",
                iteration=order + 1,
                accepted=True,
                data={
                    "phase": "coefficient_transform",
                    "coefficient_index": order,
                    "magnitude": abs(coefficient),
                },
            )
        model: dict[str, Any] = {
            "kind": "chebyshev_series",
            "interval": [lower, upper],
            "degree": degree,
            "coefficients": coefficients,
            "nodes": nodes,
            "values": values,
            "basis": "T_k on [-1,1] after affine interval mapping",
            "explanation": (
                "The function is sampled at first-kind Chebyshev roots, "
                "transformed to T_k coefficients, and evaluated by Clenshaw recurrence."
            ),
        }
        validation_count = int(problem.initial_data["validation_sample_count"])
        maximum_error = 0.0
        for index in range(validation_count):
            point = lower + (upper - lower) * index / (validation_count - 1)
            observed = execution.evaluate(
                point,
                iteration=degree + 1,
                trace_data={"phase": "holdout_validation", "sample_index": index},
            )
            maximum_error = max(
                maximum_error, abs(evaluate_chebyshev(model, point) - observed)
            )
    except ApproximationStopped as stopped:
        return failed_result(problem, plan, execution, stopped.status)
    tail_count = min(4, len(coefficients))
    tail = math.fsum(abs(value) for value in coefficients[-tail_count:])
    coefficient_norm = max(1.0, math.fsum(abs(value) for value in coefficients))
    roundoff_floor = 8.0 * MACHINE_EPSILON * coefficient_norm
    error_estimate = max(maximum_error, tail, roundoff_floor)
    model["holdout_maximum_error"] = maximum_error
    model["coefficient_tail"] = tail
    model["roundoff_floor"] = roundoff_floor
    model["error_estimate"] = error_estimate
    model["condition_estimate"] = coefficient_norm / max(
        max(abs(value) for value in values), 2.2250738585072014e-308
    )
    target_value = problem.tolerances.get("target")
    target = None if target_value is None else float(target_value)
    passed = target is None or maximum_error <= target
    diagnostics: list[NumericalDiagnostic] = []
    if tail <= roundoff_floor and degree > 0:
        diagnostics.append(
            NumericalDiagnostic(
                "loss_of_significance",
                severity="info",
                details={
                    "coefficient_tail": tail,
                    "roundoff_floor": roundoff_floor,
                },
            )
        )
    if not passed:
        diagnostics.append(NumericalDiagnostic("validation_failed"))
    validation = NumericalValidation(
        "heuristic",
        passed,
        checks=[
            {
                "kind": "independent_holdout_samples",
                "sample_count": int(problem.initial_data["validation_sample_count"]),
                "maximum_observed_error": maximum_error,
                "passed": target is None or maximum_error <= target,
            },
            {
                "kind": "coefficient_tail_indicator",
                "tail_l1": tail,
                "note": "indicator, not a rigorous uniform error bound",
                "passed": True,
            },
        ],
        residual=maximum_error,
        error_estimate=error_estimate,
        condition_estimate=float(model["condition_estimate"]),
    )
    trace.append(
        "validation",
        data={
            "holdout_maximum_error": maximum_error,
            "coefficient_tail": tail,
            "target": target,
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
            "degree": degree,
            "construction_samples": count,
            "validation_samples": int(problem.initial_data["validation_sample_count"]),
            "coefficient_transform": "direct-DCT-II",
        },
    )


def chebyshev_approximation(
    function: Callable[[float], Any],
    interval: tuple[float, float] | list[float],
    degree: int,
    *,
    tolerance: float | None = None,
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "summary",
    expression: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> ApproximationResult:
    """Approximate a callback by a fixed-degree Chebyshev series."""
    problem = polynomial_approximation_problem(
        function,
        interval,
        degree,
        tolerance=tolerance,
        resource_budget=resource_budget,
        trace=trace,
        expression=expression,
    )
    return solve_polynomial_approximation_problem(problem, cancel=cancel)
