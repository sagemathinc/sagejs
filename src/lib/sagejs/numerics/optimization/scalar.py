"""Bounded scalar minimization with Brent's safeguarded interpolation."""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalProblem, NumericalValidation
from ..trace import NumericalTrace
from ._core import (
    CallbackFailure,
    Execution,
    OptimizationResult,
    StopExecution,
    problem_record,
    record_progress,
    scalar,
    status_diagnostic,
)
from .planning import plan
from .validation import validate_with_execution

_GOLDEN_SECTION = 0.3819660112501051
_SQRT_EPSILON = 1.4901161193847656e-08
_MACHINE_EPSILON = 2.220446049250313e-16


def scalar_minimum_problem(
    function: Callable[[float], Any],
    lower: float,
    upper: float,
    *,
    method: str = "auto",
    xtol: float = 1.0e-10,
    rtol: float = 1.0e-12,
    gtol: float = 1.0e-7,
    maxiter: int = 200,
    max_evaluations: int = 512,
    max_elapsed_ms: int = 30_000,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    expression: str | None = None,
    source_language: str = "python",
) -> NumericalProblem:
    """Construct a serializable bounded scalar-minimum problem."""
    if not callable(function):
        raise TypeError("objective must be callable")
    low = float(lower)
    high = float(upper)
    if not math.isfinite(low) or not math.isfinite(high) or low >= high:
        raise ValueError("bounded minimization requires finite lower < upper")
    if xtol <= 0.0 or rtol < 0.0 or gtol <= 0.0:
        raise ValueError("optimization tolerances must be positive")
    return problem_record(
        "optimization",
        "scalar_minimum",
        function,
        None,
        dimension=1,
        initial_data={"interval_midpoint": low + 0.5 * (high - low)},
        bounds={"interval": [low, high]},
        tolerances={"xtol": float(xtol), "rtol": float(rtol), "gtol": float(gtol)},
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


def _bounded_brent(
    execution: Execution,
) -> tuple[float, float, int, str, dict[str, Any]]:
    problem = execution.problem
    function = problem.function
    if function is None:
        raise StopExecution("invalid_problem", "missing_objective")
    interval = problem.bounds.get("interval")
    if not isinstance(interval, list) or len(interval) != 2:
        raise StopExecution("invalid_problem", "missing_interval")
    a = float(interval[0])
    b = float(interval[1])
    x = a + _GOLDEN_SECTION * (b - a)
    w = x
    v = x
    fx = scalar(execution.call("objective", function, x, iteration=0))
    fw = fx
    fv = fx
    fa = scalar(execution.call("objective", function, a, iteration=0))
    fb = scalar(execution.call("objective", function, b, iteration=0))
    record_progress(
        execution,
        0,
        accepted=True,
        data={
            "candidate": x,
            "objective": fx,
            "interval": [a, b],
            "interval_width": b - a,
            "step_kind": "initial_golden_point",
        },
        important=True,
    )
    d = 0.0
    e = 0.0
    status = "maximum_iterations"
    iteration = 0
    for iteration in range(1, problem.resource_budget.max_iterations + 1):
        execution.check()
        midpoint = 0.5 * (a + b)
        tolerance = float(problem.tolerances["xtol"]) / 3.0 + (
            float(problem.tolerances["rtol"]) + _SQRT_EPSILON
        ) * abs(x)
        tolerance = max(tolerance, _MACHINE_EPSILON * max(1.0, abs(a), abs(b)))
        twice_tolerance = 2.0 * tolerance
        if abs(x - midpoint) <= twice_tolerance - 0.5 * (b - a):
            status = "converged"
            break
        step_kind = "golden_section"
        accepted_parabola = False
        if abs(e) > tolerance:
            r = (x - w) * (fx - fv)
            q = (x - v) * (fx - fw)
            p = (x - v) * q - (x - w) * r
            q = 2.0 * (q - r)
            if q > 0.0:
                p = -p
            else:
                q = -q
            previous_e = e
            e = d
            if (
                q > 0.0
                and abs(p) < abs(0.5 * q * previous_e)
                and p > q * (a - x)
                and p < q * (b - x)
            ):
                d = p / q
                candidate = x + d
                if candidate - a < twice_tolerance or b - candidate < twice_tolerance:
                    d = tolerance if x < midpoint else -tolerance
                accepted_parabola = True
                step_kind = "parabolic_interpolation"
        if not accepted_parabola:
            e = b - x if x < midpoint else a - x
            d = _GOLDEN_SECTION * e
        if abs(d) >= tolerance:
            candidate = x + d
        else:
            candidate = x + (tolerance if d > 0.0 else -tolerance)
        candidate = min(b, max(a, candidate))
        if candidate == x:
            status = "stagnation"
            break
        fcandidate = scalar(
            execution.call("objective", function, candidate, iteration=iteration)
        )
        if fcandidate <= fx:
            if candidate < x:
                b = x
            else:
                a = x
            v, fv = w, fw
            w, fw = x, fx
            x, fx = candidate, fcandidate
            accepted = True
        else:
            if candidate < x:
                a = candidate
            else:
                b = candidate
            if fcandidate <= fw or w == x:
                v, fv = w, fw
                w, fw = candidate, fcandidate
            elif fcandidate <= fv or v == x or v == w:
                v, fv = candidate, fcandidate
            accepted = False
        record_progress(
            execution,
            iteration,
            accepted=accepted,
            data={
                "candidate": x,
                "objective": fx,
                "interval": [a, b],
                "interval_width": b - a,
                "step_kind": step_kind,
            },
        )
    choices = [(fx, x), (fa, float(interval[0])), (fb, float(interval[1]))]
    choices.sort(key=lambda item: item[0])
    objective, value = choices[0]
    return value, objective, iteration, status, {"interval": [a, b]}


def solve_scalar_minimum_problem(
    problem: NumericalProblem,
    *,
    method: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> OptimizationResult:
    """Plan, solve, independently validate, and package a scalar minimum."""
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
    value: float | None = None
    objective: float | None = None
    iterations = 0
    status = "backend_failure"
    reason: str | None = None
    payload: dict[str, Any] = {}
    try:
        value, objective, iterations, status, payload = _bounded_brent(execution)
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
        data={"status": status, "success": success, "candidate": value},
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    payload["objective"] = objective
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


def minimize_scalar(
    function: Callable[[float], Any],
    lower: float,
    upper: float,
    **options: Any,
) -> OptimizationResult:
    """Minimize a scalar function on a finite interval with bounded Brent."""
    cancel = options.pop("cancel", None)
    problem = scalar_minimum_problem(function, lower, upper, **options)
    return solve_scalar_minimum_problem(problem, cancel=cancel)
