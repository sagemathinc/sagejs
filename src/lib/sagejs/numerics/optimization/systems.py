"""Damped Newton solving for finite-dimensional nonlinear systems."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalProblem, NumericalValidation
from ..trace import NumericalTrace
from ._core import (
    CallbackFailure,
    Execution,
    MAX_DENSE_DIMENSION,
    OptimizationResult,
    StopExecution,
    finite_difference_jacobian,
    infinity_norm,
    matrix,
    normal_equations,
    problem_record,
    record_progress,
    solve_linear_system,
    status_diagnostic,
    vector,
)
from .planning import plan
from .validation import validate_with_execution


def nonlinear_system_problem(
    function: Callable[[list[float]], Any],
    x0: Sequence[float],
    *,
    jacobian: Callable[[list[float]], Any] | None = None,
    method: str = "auto",
    xtol: float = 1.0e-10,
    ftol: float = 1.0e-9,
    maxiter: int = 200,
    max_evaluations: int = 10_000,
    max_elapsed_ms: int = 30_000,
    trace: str = "summary",
    max_trace_events: int = 512,
    max_trace_bytes: int = 2_000_000,
    expression: str | None = None,
    source_language: str = "python",
) -> NumericalProblem:
    """Construct a nonlinear-system problem with optional exact Jacobian."""
    if not callable(function):
        raise TypeError("system function must be callable")
    if jacobian is not None and not callable(jacobian):
        raise TypeError("Jacobian must be callable")
    if len(x0) == 0 or len(x0) > MAX_DENSE_DIMENSION:
        raise ValueError(
            "initial point dimension must be between 1 and " + str(MAX_DENSE_DIMENSION)
        )
    point = [float(value) for value in x0]
    if any(not math.isfinite(value) for value in point):
        raise ValueError("the initial point must be finite")
    if xtol <= 0.0 or ftol <= 0.0:
        raise ValueError("system tolerances must be positive")
    return problem_record(
        "nonlinear_systems",
        "nonlinear_system",
        function,
        jacobian,
        dimension=len(point),
        initial_data={"point": point},
        bounds={},
        tolerances={"xtol": float(xtol), "ftol": float(ftol)},
        method=method,
        max_iterations=maxiter,
        max_evaluations=max_evaluations,
        max_elapsed_ms=max_elapsed_ms,
        trace_level=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        expression=expression,
        source_language=source_language,
    )


def _residual(
    execution: Execution, point: Sequence[float], iteration: int | None = None
) -> list[float]:
    function = execution.problem.function
    if function is None:
        raise StopExecution("invalid_problem", "missing_system_callback")
    return vector(
        execution.call("residual", function, list(point), iteration=iteration),
        len(point),
    )


def _jacobian(
    execution: Execution,
    point: Sequence[float],
    iteration: int | None = None,
) -> list[list[float]]:
    derivative = execution.problem.derivative
    if derivative is not None:
        return matrix(
            execution.call("jacobian", derivative, list(point), iteration=iteration),
            len(point),
            len(point),
        )
    function = execution.problem.function
    if function is None:
        raise StopExecution("invalid_problem", "missing_system_callback")
    return finite_difference_jacobian(
        execution,
        function,
        point,
        len(point),
        iteration=iteration,
    )


def _damped_newton(
    execution: Execution,
) -> tuple[list[float], list[float], int, str, dict[str, Any]]:
    problem = execution.problem
    initial = problem.initial_data.get("point")
    if not isinstance(initial, list):
        raise StopExecution("invalid_problem", "missing_initial_point")
    point = [float(value) for value in initial]
    residual = _residual(execution, point, 0)
    residual_norm = infinity_norm(residual)
    record_progress(
        execution,
        0,
        accepted=True,
        data={
            "point": list(point),
            "residual": list(residual),
            "residual_norm": residual_norm,
            "step_kind": "initial_point",
        },
        important=True,
    )
    status = "maximum_iterations"
    iteration = 0
    for iteration in range(1, problem.resource_budget.max_iterations + 1):
        execution.check()
        if residual_norm <= float(problem.tolerances["ftol"]):
            status = "converged"
            iteration -= 1
            break
        jacobian = _jacobian(execution, point, iteration)
        step = solve_linear_system(jacobian, [-value for value in residual])
        step_kind = "newton"
        if step is None:
            normal, gradient = normal_equations(jacobian, residual)
            diagonal_scale = max(
                [normal[index][index] for index in range(len(point))] + [1.0]
            )
            damping = 1.0e-8 * diagonal_scale
            for index in range(len(point)):
                normal[index][index] += damping
            step = solve_linear_system(normal, [-value for value in gradient])
            step_kind = "damped_normal_equations"
        if step is None:
            status = "zero_derivative"
            break
        scale = 1.0
        accepted = False
        candidate = list(point)
        candidate_residual = list(residual)
        candidate_norm = residual_norm
        for _ in range(32):
            candidate = [
                point[index] + scale * step[index] for index in range(len(point))
            ]
            candidate_residual = _residual(execution, candidate, iteration)
            candidate_norm = infinity_norm(candidate_residual)
            if candidate_norm < residual_norm:
                accepted = True
                break
            scale *= 0.5
        if not accepted:
            status = "stagnation"
            break
        displacement = [candidate[index] - point[index] for index in range(len(point))]
        point = candidate
        residual = candidate_residual
        residual_norm = candidate_norm
        record_progress(
            execution,
            iteration,
            accepted=True,
            data={
                "point": list(point),
                "residual": list(residual),
                "residual_norm": residual_norm,
                "step_norm": infinity_norm(displacement),
                "step_scale": scale,
                "step_kind": step_kind,
            },
        )
        if residual_norm <= float(problem.tolerances["ftol"]):
            status = "converged"
            break
        if infinity_norm(displacement) <= float(problem.tolerances["xtol"]) * max(
            1.0, infinity_norm(point)
        ):
            status = "stagnation"
            break
    return (
        list(point),
        list(residual),
        iteration,
        status,
        {"solver_residual_norm": residual_norm},
    )


def solve_nonlinear_system_problem(
    problem: NumericalProblem,
    *,
    method: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> OptimizationResult:
    """Plan, solve, independently validate, and package a nonlinear system."""
    selected_plan = plan(problem, method=method)
    trace = NumericalTrace(problem.trace_policy)
    trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": selected_plan.method,
            "backend": selected_plan.backend,
        },
        important=True,
        force=True,
    )
    execution = Execution(problem, trace, cancel)
    diagnostics: list[NumericalDiagnostic] = []
    if not problem.replayable:
        diagnostics.append(NumericalDiagnostic("non_replayable_callback"))
    if problem.derivative is None:
        diagnostics.append(NumericalDiagnostic("finite_difference_derivative"))
    value: list[float] | None = None
    residual: list[float] | None = None
    iterations = 0
    status = "backend_failure"
    reason: str | None = None
    payload: dict[str, Any] = {}
    try:
        value, residual, iterations, status, payload = _damped_newton(execution)
    except StopExecution as stop:
        status = stop.status
        reason = stop.reason
    except CallbackFailure as failure:
        status = "callback_error"
        reason = failure.error_type
    status_item = status_diagnostic(status, reason)
    if status_item is not None:
        diagnostics.append(status_item)
    validation: NumericalValidation
    validation, validation_diagnostics, validation_failure = validate_with_execution(
        problem, value, execution, status
    )
    if status == "converged" and validation_failure is not None:
        status, reason = validation_failure
        validation_status_item = status_diagnostic(status, reason)
        if validation_status_item is not None and not any(
            item.code == validation_status_item.code for item in validation_diagnostics
        ):
            diagnostics.append(validation_status_item)
    diagnostics.extend(validation_diagnostics)
    success = status == "converged" and validation.passed
    trace.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=validation_diagnostics,
        important=True,
        force=True,
    )
    trace.append(
        "finish" if success else "failure",
        iteration=iterations,
        evaluation=execution.evaluations,
        data={"status": status, "success": success, "point": value},
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    payload["residual_vector"] = residual
    if reason is not None:
        payload["stop_reason"] = reason
    return OptimizationResult(
        problem,
        selected_plan,
        success=success,
        status=status,
        value=value,
        validation=validation,
        diagnostics=diagnostics,
        iterations=iterations,
        evaluations=execution.evaluations,
        elapsed_ms=execution.elapsed_ms(),
        trace=trace,
        measurements={"callback_counts": execution.counts},
        domain_payload=payload,
    )


def solve_nonlinear_system(
    function: Callable[[list[float]], Any],
    x0: Sequence[float],
    **options: Any,
) -> OptimizationResult:
    """Solve a square nonlinear system by safeguarded damped Newton steps."""
    cancel = options.pop("cancel", None)
    problem = nonlinear_system_problem(function, x0, **options)
    return solve_nonlinear_system_problem(problem, cancel=cancel)
