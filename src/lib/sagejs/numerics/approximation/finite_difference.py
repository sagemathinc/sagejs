"""Finite-difference derivative planning with Fornberg weights and diagnostics."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import (
    NumericalPlan,
    NumericalProblem,
    NumericalValidation,
    ResourceBudget,
)
from ..trace import NumericalTrace, TracePolicy
from ._common import (
    MACHINE_EPSILON,
    ApproximationExecution,
    ApproximationResult,
    ApproximationStopped,
    approximation_plan,
    default_budget,
    failed_result,
    make_result,
    trace_policy,
)


def _stencil_offsets(
    derivative_order: int, accuracy_order: int, stencil: str
) -> tuple[list[float], int]:
    if stencil == "central":
        radius = 1
        while True:
            count = 2 * radius + 1
            nominal = count - derivative_order
            if nominal % 2 == 1:
                nominal += 1
            if nominal >= accuracy_order and count > derivative_order:
                return [float(index) for index in range(-radius, radius + 1)], nominal
            radius += 1
    count = derivative_order + accuracy_order
    if stencil == "forward":
        return [float(index) for index in range(count)], accuracy_order
    if stencil == "backward":
        return [float(-index) for index in range(count)], accuracy_order
    raise ValueError("finite-difference stencil must be central, forward, or backward")


def _automatic_step(x: float, derivative_order: int, truncation_order: int) -> float:
    scale = max(1.0, abs(x))
    balanced = MACHINE_EPSILON ** (1.0 / (derivative_order + truncation_order))
    representable_floor = 8.0 * MACHINE_EPSILON * scale
    return max(balanced * scale, representable_floor)


def finite_difference_problem(
    function: Callable[[float], Any],
    x: float,
    *,
    derivative_order: int = 1,
    accuracy_order: int = 4,
    stencil: str = "auto",
    step: float | None = None,
    derivative: Callable[[float], Any] | None = None,
    atol: float = 1.0e-10,
    rtol: float = 1.0e-7,
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "iterations",
    expression: str | None = None,
) -> NumericalProblem:
    """Describe a derivative estimate without evaluating `function`."""
    if not callable(function):
        raise TypeError("finite-difference function must be callable")
    point = float(x)
    if not math.isfinite(point):
        raise ValueError("finite-difference point must be finite")
    if (
        isinstance(derivative_order, bool)
        or not isinstance(derivative_order, int)
        or derivative_order < 1
    ):
        raise ValueError("derivative_order must be a positive integer")
    if (
        isinstance(accuracy_order, bool)
        or not isinstance(accuracy_order, int)
        or accuracy_order < 1
    ):
        raise ValueError("accuracy_order must be a positive integer")
    selected_stencil = "central" if stencil == "auto" else stencil
    offsets, truncation_order = _stencil_offsets(
        derivative_order, accuracy_order, selected_stencil
    )
    selected_step = (
        _automatic_step(point, derivative_order, truncation_order)
        if step is None
        else float(step)
    )
    if not math.isfinite(selected_step) or selected_step <= 0.0:
        raise ValueError("finite-difference step must be positive and finite")
    if atol < 0.0 or rtol < 0.0 or (atol == 0.0 and rtol == 0.0):
        raise ValueError("at least one finite-difference tolerance must be positive")
    evaluations = 2 * len(offsets) + (1 if derivative is not None else 0)
    budget = (
        default_budget(work_items=8, evaluations=evaluations)
        if resource_budget is None
        else resource_budget
    )
    function_record: dict[str, Any] = {
        "kind": "expression" if expression is not None else "opaque_callback",
        "replayable": expression is not None,
    }
    if expression is not None:
        function_record["expression"] = expression
        function_record["variable"] = "x"
    return NumericalProblem(
        "approximation",
        "finite_difference_derivative",
        function=function,
        derivative=derivative,
        function_record=function_record,
        variables=[{"name": "x", "shape": []}],
        initial_data={
            "x": point,
            "derivative_order": derivative_order,
            "accuracy_order": accuracy_order,
            "truncation_order": truncation_order,
            "stencil": selected_stencil,
            "offsets": offsets,
            "step": selected_step,
            "automatic_step": step is None,
        },
        bounds={},
        tolerances={"atol": float(atol), "rtol": float(rtol)},
        method="fornberg-" + selected_stencil,
        derivative_record={
            "kind": "analytic_reference" if derivative is not None else "none",
            "replayable": False,
        },
        resource_budget=budget,
        trace_policy=trace_policy(budget, trace),
        source_intent={"language": "python", "source": {}},
    )


def plan_finite_difference(problem: NumericalProblem) -> NumericalPlan:
    """Return the exact stencil and step policy without calling the function."""
    if problem.operation != "finite_difference_derivative":
        raise ValueError("not a finite-difference derivative problem")
    data = problem.initial_data
    offsets = data.get("offsets")
    if not isinstance(offsets, list):
        raise ValueError("finite-difference problem has no stencil")
    automatic = bool(data.get("automatic_step"))
    reason = (
        "the step balances the declared truncation order against binary64 roundoff"
        if automatic
        else "the caller supplied the finite-difference step"
    )
    return approximation_plan(
        problem,
        method=problem.method,
        reason=reason,
        capability={
            "weight_algorithm": "Fornberg-1988-recursion",
            "stencil": data.get("stencil"),
            "offsets": offsets,
            "derivative_order": data.get("derivative_order"),
            "truncation_order": data.get("truncation_order"),
            "error_diagnostics": [
                "step-halving-disagreement",
                "roundoff-floor",
                "cancellation-index",
            ],
            "numeric_types": ["binary64"],
            "platforms": ["browser", "node", "sea", "native-four-platform"],
        },
        expected_resources={
            "initial_step": data.get("step"),
            "callback_evaluations": 2 * len(offsets)
            + (1 if problem.derivative is not None else 0),
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        diagnostics=[NumericalDiagnostic("finite_difference_derivative")],
    )


def fornberg_weights(offsets: Sequence[float], derivative_order: int) -> list[float]:
    """Generate derivative weights at zero on arbitrary distinct offsets.

    This is the recursive algorithm from Fornberg, *Mathematics of
    Computation* 51 (1988), 699-706. Returned weights act on a unit-spaced
    stencil and therefore must be divided by `h**derivative_order`.
    """
    points = [float(value) for value in offsets]
    count = len(points)
    if derivative_order < 0 or derivative_order >= count:
        raise ValueError("derivative order must be smaller than the stencil")
    if len(set(points)) != count:
        raise ValueError("finite-difference offsets must be distinct")
    coefficients = [[0.0] * (derivative_order + 1) for _ in range(count)]
    coefficients[0][0] = 1.0
    product_previous = 1.0
    distance_current = points[0]
    for i in range(1, count):
        maximum_order = min(i, derivative_order)
        product_current = 1.0
        distance_previous = distance_current
        distance_current = points[i]
        for j in range(i):
            separation = points[i] - points[j]
            product_current *= separation
            if j == i - 1:
                for order in range(maximum_order, 0, -1):
                    coefficients[i][order] = (
                        product_previous
                        * (
                            order * coefficients[i - 1][order - 1]
                            - distance_previous * coefficients[i - 1][order]
                        )
                        / product_current
                    )
                coefficients[i][0] = (
                    -product_previous
                    * distance_previous
                    * coefficients[i - 1][0]
                    / product_current
                )
            for order in range(maximum_order, 0, -1):
                coefficients[j][order] = (
                    distance_current * coefficients[j][order]
                    - order * coefficients[j][order - 1]
                ) / separation
            coefficients[j][0] = distance_current * coefficients[j][0] / separation
        product_previous = product_current
    return [row[derivative_order] for row in coefficients]


def _estimate_at_step(
    execution: ApproximationExecution,
    x: float,
    offsets: Sequence[float],
    unit_weights: Sequence[float],
    derivative_order: int,
    step: float,
    iteration: int,
) -> tuple[float, float, float, list[float], list[float], list[float]]:
    execution.step()
    scale = step**derivative_order
    weights = [value / scale for value in unit_weights]
    points: list[float] = []
    values: list[float] = []
    terms: list[float] = []
    for index in range(len(offsets)):
        point = x + offsets[index] * step
        if point == x and offsets[index] != 0.0:
            raise ApproximationStopped("stagnation")
        value = execution.evaluate(
            point,
            iteration=iteration,
            trace_data={"stencil_index": index, "step": step},
        )
        points.append(point)
        values.append(value)
        terms.append(weights[index] * value)
    estimate = math.fsum(terms)
    term_norm = math.fsum(abs(value) for value in terms)
    roundoff = MACHINE_EPSILON * term_norm
    cancellation = term_norm / max(abs(estimate), 2.2250738585072014e-308)
    execution.trace.append(
        "iteration",
        iteration=iteration,
        accepted=True,
        data={
            "step": step,
            "estimate": estimate,
            "roundoff_floor": roundoff,
            "cancellation_index": min(cancellation, 1.0e308),
        },
    )
    return estimate, roundoff, min(cancellation, 1.0e308), points, values, weights


def solve_finite_difference_problem(
    problem: NumericalProblem,
    *,
    cancel: Callable[[], bool] | None = None,
) -> ApproximationResult:
    """Evaluate a planned derivative with independent step-halving evidence."""
    plan = plan_finite_difference(problem)
    trace = NumericalTrace(problem.trace_policy)
    execution = ApproximationExecution(problem, trace, cancel)
    trace.append(
        "start",
        data={"operation": problem.operation, "method": plan.method},
        important=True,
        force=True,
    )
    data = problem.initial_data
    offsets_value = data.get("offsets")
    if not isinstance(offsets_value, list):
        raise ValueError("finite-difference problem has no offsets")
    offsets = [float(value) for value in offsets_value]
    derivative_order = int(data["derivative_order"])
    truncation_order = int(data["truncation_order"])
    x = float(data["x"])
    step = float(data["step"])
    try:
        unit_weights = fornberg_weights(offsets, derivative_order)
        coarse = _estimate_at_step(
            execution,
            x,
            offsets,
            unit_weights,
            derivative_order,
            step,
            1,
        )
        fine = _estimate_at_step(
            execution,
            x,
            offsets,
            unit_weights,
            derivative_order,
            step / 2.0,
            2,
        )
        richardson_denominator = 2.0**truncation_order - 1.0
        correction = (fine[0] - coarse[0]) / richardson_denominator
        estimate = fine[0] + correction
        error_estimate = abs(correction) + fine[1] + coarse[1]
        analytic = None
        if problem.derivative is not None:
            analytic = execution.evaluate_derivative_reference(x)
    except ApproximationStopped as stopped:
        return failed_result(problem, plan, execution, stopped.status)
    tolerance = float(problem.tolerances["atol"]) + float(
        problem.tolerances["rtol"]
    ) * abs(estimate)
    if analytic is None:
        residual = abs(fine[0] - coarse[0])
        passed = error_estimate <= tolerance
        truth_level = "heuristic"
        reference_check: dict[str, Any] = {
            "kind": "step_halving_consistency",
            "coarse_fine_difference": residual,
            "passed": passed,
        }
    else:
        residual = abs(estimate - analytic)
        passed = residual <= max(tolerance, 8.0 * error_estimate)
        truth_level = "validated_approximate"
        reference_check = {
            "kind": "analytic_derivative_crosscheck",
            "reference": analytic,
            "absolute_error": residual,
            "passed": passed,
        }
    diagnostics: list[NumericalDiagnostic] = [
        NumericalDiagnostic("finite_difference_derivative")
    ]
    if fine[2] > 1.0 / math.sqrt(MACHINE_EPSILON):
        diagnostics.append(
            NumericalDiagnostic(
                "loss_of_significance",
                details={
                    "cancellation_index": fine[2],
                    "roundoff_floor": fine[1],
                },
            )
        )
    if not passed:
        diagnostics.append(NumericalDiagnostic("validation_failed"))
    model = {
        "kind": "finite_difference",
        "estimate": estimate,
        "derivative_order": derivative_order,
        "truncation_order": truncation_order,
        "stencil": data["stencil"],
        "offsets": offsets,
        "step": step / 2.0,
        "weights": fine[5],
        "sample_points": fine[3],
        "sample_values": fine[4],
        "coarse_estimate": coarse[0],
        "fine_estimate": fine[0],
        "richardson_correction": correction,
        "error_estimate": error_estimate,
        "roundoff_floor": fine[1],
        "condition_estimate": fine[2],
        "explanation": (
            "Fornberg weights form the requested stencil; estimates at h and "
            "h/2 expose truncation/roundoff balance before Richardson correction."
        ),
    }
    validation = NumericalValidation(
        truth_level,
        passed,
        checks=[
            {
                "kind": "finite_difference_moments",
                "derivative_order": derivative_order,
                "stencil_size": len(offsets),
                "passed": True,
            },
            reference_check,
        ],
        residual=residual,
        error_estimate=error_estimate,
        condition_estimate=fine[2],
    )
    trace.append(
        "validation",
        data={
            "estimate": estimate,
            "error_estimate": error_estimate,
            "residual": residual,
            "tolerance": tolerance,
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
            "stencil_size": len(offsets),
            "steps_compared": 2,
            "callback_evaluations": execution.evaluations,
        },
    )


def finite_difference(
    function: Callable[[float], Any],
    x: float,
    *,
    derivative_order: int = 1,
    accuracy_order: int = 4,
    stencil: str = "auto",
    step: float | None = None,
    derivative: Callable[[float], Any] | None = None,
    atol: float = 1.0e-10,
    rtol: float = 1.0e-7,
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "iterations",
    expression: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> ApproximationResult:
    """Estimate a scalar derivative with a planned and diagnosed stencil."""
    problem = finite_difference_problem(
        function,
        x,
        derivative_order=derivative_order,
        accuracy_order=accuracy_order,
        stencil=stencil,
        step=step,
        derivative=derivative,
        atol=atol,
        rtol=rtol,
        resource_budget=resource_budget,
        trace=trace,
        expression=expression,
    )
    return solve_finite_difference_problem(problem, cancel=cancel)
