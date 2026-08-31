"""Structured scalar root finding with independent validation."""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Mapping
from typing import Any

from .capabilities import plan as plan_problem
from .diagnostics import NumericalDiagnostic
from .model import (
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from .trace import NumericalTrace, TracePolicy

_MACHINE_EPSILON = 2.220446049250313e-16


class _StopRoot(Exception):
    def __init__(self, status: str) -> None:
        self.status = status


class _RootExecution:
    def __init__(
        self,
        problem: NumericalProblem,
        trace: NumericalTrace,
        cancel: Callable[[], bool] | None,
    ) -> None:
        self.problem = problem
        self.trace = trace
        self.cancel = cancel
        self.evaluations = 0
        self.started = time.perf_counter()

    def elapsed_ms(self) -> float:
        return 1000.0 * (time.perf_counter() - self.started)

    def check(self) -> None:
        if self.cancel is not None and self.cancel():
            raise _StopRoot("cancelled")
        if self.elapsed_ms() > self.problem.resource_budget.max_elapsed_ms:
            raise _StopRoot("maximum_evaluations")

    def evaluate(self, x: float, *, iteration: int | None = None) -> float:
        self.check()
        if self.evaluations >= self.problem.resource_budget.max_evaluations:
            raise _StopRoot("maximum_evaluations")
        function = self.problem.function
        if function is None:
            raise TypeError("root problem has no live function")
        self.evaluations += 1
        try:
            value = float(function(x))
        except Exception as error:
            self.trace.append(
                "failure",
                iteration=iteration,
                evaluation=self.evaluations,
                data={"x": x, "error_type": type(error).__name__},
                diagnostics=[NumericalDiagnostic("callback_error")],
                important=True,
                force=True,
            )
            raise
        if not math.isfinite(value):
            self.trace.append(
                "failure",
                iteration=iteration,
                evaluation=self.evaluations,
                data={"x": x},
                diagnostics=[NumericalDiagnostic("nonfinite_evaluation")],
                important=True,
                force=True,
            )
            raise _StopRoot("nonfinite_evaluation")
        self.trace.append(
            "evaluation",
            iteration=iteration,
            evaluation=self.evaluations,
            data={"x": x, "value": value},
        )
        return value


def root_problem(
    function: Callable[[float], Any],
    lower: float | None = None,
    upper: float | None = None,
    *,
    x0: float | None = None,
    x1: float | None = None,
    derivative: Callable[[float], Any] | None = None,
    method: str = "auto",
    xtol: float = 1e-12,
    rtol: float = 4.0 * _MACHINE_EPSILON,
    ftol: float = 1e-12,
    maxiter: int = 100,
    max_evaluations: int = 256,
    max_elapsed_ms: int = 30_000,
    trace: str = "iterations",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    expression: str | None = None,
    variable: str = "x",
    source_language: str = "python",
    source: Mapping[str, Any] | None = None,
) -> NumericalProblem:
    """Construct a serializable scalar-root problem around a live callback."""
    if not callable(function):
        raise TypeError("root function must be callable")
    if xtol <= 0 or rtol < 4.0 * _MACHINE_EPSILON or ftol < 0:
        raise ValueError(
            "root tolerances must be positive and rtol must be at least 4*eps"
        )
    bracket: list[float] = []
    if lower is not None or upper is not None:
        if lower is None or upper is None:
            raise ValueError("both bracket endpoints are required")
        bracket = [float(lower), float(upper)]
        if bracket[0] >= bracket[1]:
            raise ValueError("root bracket must have lower < upper")
    points: list[float] = []
    if x0 is not None:
        points.append(float(x0))
    if x1 is not None:
        points.append(float(x1))
    if not points and bracket:
        points = [bracket[0], bracket[1]]
    replayable = expression is not None
    function_record: dict[str, Any] = {
        "kind": "expression" if replayable else "opaque_callback",
        "replayable": replayable,
    }
    if expression is not None:
        function_record["expression"] = expression
        function_record["variable"] = variable
    derivative_record: dict[str, Any] = {
        "kind": "explicit_callback" if derivative is not None else "none",
        "replayable": False,
    }
    budget = ResourceBudget(
        max_iterations=maxiter,
        max_evaluations=max_evaluations,
        max_elapsed_ms=max_elapsed_ms,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )
    return NumericalProblem(
        "roots",
        "scalar_root",
        function=function,
        derivative=derivative,
        function_record=function_record,
        variables=[{"name": variable, "shape": []}],
        initial_data={"points": points},
        bounds={"bracket": bracket},
        tolerances={"xtol": float(xtol), "rtol": float(rtol), "ftol": float(ftol)},
        method=method,
        derivative_record=derivative_record,
        resource_budget=budget,
        trace_policy=TracePolicy(
            trace, max_events=max_trace_events, max_bytes=max_trace_bytes
        ),
        source_intent={
            "language": source_language,
            "source": {} if source is None else source,
        },
    )


def _root_tolerance(problem: NumericalProblem, x: float) -> float:
    return float(problem.tolerances["xtol"]) + float(problem.tolerances["rtol"]) * abs(
        x
    )


def _bisection(
    execution: _RootExecution,
) -> tuple[float, float, int, str, dict[str, Any]]:
    bracket = execution.problem.bounds["bracket"]
    if not isinstance(bracket, list) or len(bracket) != 2:
        raise ValueError("bisection requires a bracket")
    left = float(bracket[0])
    right = float(bracket[1])
    fleft = execution.evaluate(left, iteration=0)
    fright = execution.evaluate(right, iteration=0)
    if fleft == 0.0:
        return left, fleft, 0, "exact_root", {"bracket": [left, left]}
    if fright == 0.0:
        return right, fright, 0, "exact_root", {"bracket": [right, right]}
    if fleft * fright > 0.0:
        raise _StopRoot("invalid_bracket")
    for iteration in range(1, execution.problem.resource_budget.max_iterations + 1):
        execution.check()
        middle = left + 0.5 * (right - left)
        fmiddle = execution.evaluate(middle, iteration=iteration)
        if fleft * fmiddle <= 0.0:
            right = middle
            fright = fmiddle
        else:
            left = middle
            fleft = fmiddle
        execution.trace.append(
            "iteration",
            iteration=iteration,
            accepted=True,
            data={
                "candidate": middle,
                "residual": abs(fmiddle),
                "bracket": [left, right],
                "bracket_width": right - left,
            },
        )
        if fmiddle == 0.0:
            return (
                middle,
                fmiddle,
                iteration,
                "exact_root",
                {"bracket": [middle, middle]},
            )
        if right - left <= _root_tolerance(execution.problem, middle):
            candidate = left if abs(fleft) < abs(fright) else right
            residual = fleft if candidate == left else fright
            return (
                candidate,
                residual,
                iteration,
                "converged",
                {"bracket": [left, right]},
            )
    candidate = left if abs(fleft) < abs(fright) else right
    residual = fleft if candidate == left else fright
    return (
        candidate,
        residual,
        execution.problem.resource_budget.max_iterations,
        "maximum_iterations",
        {"bracket": [left, right]},
    )


def _brent(
    execution: _RootExecution,
) -> tuple[float, float, int, str, dict[str, Any]]:
    bracket = execution.problem.bounds["bracket"]
    if not isinstance(bracket, list) or len(bracket) != 2:
        raise ValueError("Brent's method requires a bracket")
    a = float(bracket[0])
    b = float(bracket[1])
    fa = execution.evaluate(a, iteration=0)
    fb = execution.evaluate(b, iteration=0)
    if fa == 0.0:
        return a, fa, 0, "exact_root", {"bracket": [a, a]}
    if fb == 0.0:
        return b, fb, 0, "exact_root", {"bracket": [b, b]}
    if fa * fb > 0.0:
        raise _StopRoot("invalid_bracket")
    c = b
    fc = fb
    d = b - a
    e = d
    for iteration in range(1, execution.problem.resource_budget.max_iterations + 1):
        execution.check()
        if (fb > 0.0 and fc > 0.0) or (fb < 0.0 and fc < 0.0):
            c = a
            fc = fa
            d = b - a
            e = d
        if abs(fc) < abs(fb):
            old_b = b
            old_fb = fb
            a = b
            fa = fb
            b = c
            fb = fc
            c = old_b
            fc = old_fb
        midpoint = 0.5 * (c - b)
        tolerance = _root_tolerance(execution.problem, b)
        if fb == 0.0:
            return b, fb, iteration - 1, "exact_root", {"bracket": sorted([b, c])}
        if abs(midpoint) <= tolerance:
            return b, fb, iteration - 1, "converged", {"bracket": sorted([b, c])}
        step_kind = "bisection"
        if abs(e) >= tolerance and abs(fa) > abs(fb):
            ratio = fb / fa
            if a == c:
                p = 2.0 * midpoint * ratio
                q = 1.0 - ratio
                step_kind = "secant"
            else:
                q_ratio = fa / fc
                r_ratio = fb / fc
                p = ratio * (
                    2.0 * midpoint * q_ratio * (q_ratio - r_ratio)
                    - (b - a) * (r_ratio - 1.0)
                )
                q = (q_ratio - 1.0) * (r_ratio - 1.0) * (ratio - 1.0)
                step_kind = "inverse_quadratic"
            if p > 0.0:
                q = -q
            else:
                p = -p
            previous_e = e
            e = d
            if 2.0 * p < min(
                3.0 * midpoint * q - abs(tolerance * q), abs(previous_e * q)
            ):
                d = p / q
            else:
                d = midpoint
                e = midpoint
                step_kind = "bisection"
        else:
            d = midpoint
            e = midpoint
        a = b
        fa = fb
        if abs(d) > tolerance:
            b += d
        else:
            b += tolerance if midpoint > 0.0 else -tolerance
        fb = execution.evaluate(b, iteration=iteration)
        execution.trace.append(
            "iteration",
            iteration=iteration,
            accepted=True,
            data={
                "candidate": b,
                "residual": abs(fb),
                "bracket": sorted([b, c]),
                "bracket_width": abs(c - b),
                "step_kind": step_kind,
            },
        )
    return (
        b,
        fb,
        execution.problem.resource_budget.max_iterations,
        "maximum_iterations",
        {"bracket": sorted([b, c])},
    )


def _secant(
    execution: _RootExecution,
) -> tuple[float, float, int, str, dict[str, Any]]:
    points = execution.problem.initial_data["points"]
    if not isinstance(points, list) or len(points) < 2:
        raise ValueError("secant method requires two initial points")
    x0 = float(points[0])
    x1 = float(points[1])
    f0 = execution.evaluate(x0, iteration=0)
    f1 = execution.evaluate(x1, iteration=0)
    if f0 == 0.0:
        return x0, f0, 0, "exact_root", {}
    if f1 == 0.0:
        return x1, f1, 0, "exact_root", {}
    for iteration in range(1, execution.problem.resource_budget.max_iterations + 1):
        denominator = f1 - f0
        if denominator == 0.0:
            return x1, f1, iteration - 1, "stagnation", {}
        x2 = x1 - f1 * (x1 - x0) / denominator
        if x2 == x1:
            return x1, f1, iteration - 1, "stagnation", {}
        f2 = execution.evaluate(x2, iteration=iteration)
        execution.trace.append(
            "iteration",
            iteration=iteration,
            accepted=True,
            data={"candidate": x2, "residual": abs(f2), "step": x2 - x1},
        )
        if f2 == 0.0:
            return x2, f2, iteration, "exact_root", {}
        if abs(x2 - x1) <= _root_tolerance(execution.problem, x2):
            return x2, f2, iteration, "converged", {}
        x0, f0 = x1, f1
        x1, f1 = x2, f2
    return (
        x1,
        f1,
        execution.problem.resource_budget.max_iterations,
        "maximum_iterations",
        {},
    )


def _newton(
    execution: _RootExecution,
) -> tuple[float, float, int, str, dict[str, Any]]:
    points = execution.problem.initial_data["points"]
    if not isinstance(points, list) or len(points) < 1:
        raise ValueError("Newton's method requires an initial point")
    x = float(points[0])
    derivative = execution.problem.derivative
    fx = execution.evaluate(x, iteration=0)
    if fx == 0.0:
        return x, fx, 0, "exact_root", {}
    for iteration in range(1, execution.problem.resource_budget.max_iterations + 1):
        if derivative is None:
            h = math.sqrt(_MACHINE_EPSILON) * max(1.0, abs(x))
            forward = execution.evaluate(x + h, iteration=iteration)
            backward = execution.evaluate(x - h, iteration=iteration)
            dfx = (forward - backward) / (2.0 * h)
            derivative_kind = "central_finite_difference"
        else:
            try:
                dfx = float(derivative(x))
            except Exception:
                raise _StopRoot("callback_error") from None
            derivative_kind = "explicit"
        if not math.isfinite(dfx):
            raise _StopRoot("nonfinite_evaluation")
        if dfx == 0.0:
            return x, fx, iteration - 1, "zero_derivative", {}
        candidate = x - fx / dfx
        if candidate == x:
            return x, fx, iteration - 1, "stagnation", {}
        fcandidate = execution.evaluate(candidate, iteration=iteration)
        execution.trace.append(
            "iteration",
            iteration=iteration,
            accepted=True,
            data={
                "candidate": candidate,
                "residual": abs(fcandidate),
                "step": candidate - x,
                "derivative": dfx,
                "derivative_kind": derivative_kind,
            },
        )
        if fcandidate == 0.0:
            return candidate, fcandidate, iteration, "exact_root", {}
        if abs(candidate - x) <= _root_tolerance(execution.problem, candidate):
            return candidate, fcandidate, iteration, "converged", {}
        x = candidate
        fx = fcandidate
    return (
        x,
        fx,
        execution.problem.resource_budget.max_iterations,
        "maximum_iterations",
        {},
    )


def _independent_validation(
    problem: NumericalProblem,
    value: float | None,
    solver_status: str,
    payload: Mapping[str, Any],
) -> tuple[NumericalValidation, list[NumericalDiagnostic]]:
    diagnostics: list[NumericalDiagnostic] = []
    if value is None or problem.function is None:
        return NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "value_available", "passed": False}],
        ), diagnostics
    try:
        residual_value = float(problem.function(value))
    except Exception:
        diagnostics.append(NumericalDiagnostic("validation_failed"))
        return NumericalValidation(
            "indeterminate", False, checks=[{"kind": "residual", "passed": False}]
        ), diagnostics
    if not math.isfinite(residual_value):
        diagnostics.append(NumericalDiagnostic("validation_failed"))
        return NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "finite_residual", "passed": False}],
        ), diagnostics
    residual = abs(residual_value)
    ftol = float(problem.tolerances["ftol"])
    residual_passed = residual <= ftol
    checks: list[dict[str, Any]] = [
        {"kind": "finite_residual", "passed": True},
        {
            "kind": "residual",
            "passed": residual_passed,
            "value": residual,
            "threshold": ftol,
        },
    ]
    bracket_passed = True
    bracket = payload.get("bracket")
    if isinstance(bracket, list) and len(bracket) == 2:
        try:
            left_value = float(problem.function(float(bracket[0])))
            right_value = float(problem.function(float(bracket[1])))
            bracket_passed = (
                math.isfinite(left_value)
                and math.isfinite(right_value)
                and (
                    left_value == 0.0
                    or right_value == 0.0
                    or left_value * right_value <= 0.0
                )
            )
        except Exception:
            bracket_passed = False
        checks.append(
            {
                "kind": "bracket_invariant",
                "passed": bracket_passed,
                "bracket": list(bracket),
            }
        )
    solver_claimed_success = solver_status in ("converged", "exact_root")
    passed = residual_passed and bracket_passed
    if solver_claimed_success and not passed:
        diagnostics.append(
            NumericalDiagnostic(
                "validation_failed", details={"solver_status": solver_status}
            )
        )
    truth = "validated_approximate" if passed else "indeterminate"
    error_estimate = None
    if isinstance(bracket, list) and len(bracket) == 2:
        error_estimate = 0.5 * abs(float(bracket[1]) - float(bracket[0]))
    return NumericalValidation(
        truth, passed, checks=checks, residual=residual, error_estimate=error_estimate
    ), diagnostics


def solve_root_problem(
    problem: NumericalProblem,
    *,
    method: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> NumericalResult:
    """Plan, execute, independently validate, and package a root problem."""
    selected_plan = plan_problem(problem, method=method)
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
    execution = _RootExecution(problem, trace, cancel)
    diagnostics: list[NumericalDiagnostic] = []
    if not problem.replayable:
        diagnostics.append(NumericalDiagnostic("non_replayable_callback"))
    value: float | None = None
    residual_value = 0.0
    iterations = 0
    status = "backend_failure"
    payload: dict[str, Any] = {}
    try:
        if selected_plan.method == "bisection":
            value, residual_value, iterations, status, payload = _bisection(execution)
        elif selected_plan.method == "brent":
            value, residual_value, iterations, status, payload = _brent(execution)
        elif selected_plan.method == "secant":
            value, residual_value, iterations, status, payload = _secant(execution)
        else:
            value, residual_value, iterations, status, payload = _newton(execution)
    except _StopRoot as stop:
        status = stop.status
    except Exception as error:
        status = "callback_error"
        diagnostics.append(
            NumericalDiagnostic(
                "callback_error", details={"error_type": type(error).__name__}
            )
        )
    status_diagnostic = {
        "invalid_bracket": "invalid_bracket",
        "maximum_iterations": "maximum_iterations",
        "maximum_evaluations": "maximum_evaluations",
        "zero_derivative": "zero_derivative",
        "nonfinite_evaluation": "nonfinite_evaluation",
        "cancelled": "cancelled",
        "stagnation": "stagnation",
    }
    if status in status_diagnostic:
        diagnostics.append(NumericalDiagnostic(status_diagnostic[status]))
    validation, validation_diagnostics = _independent_validation(
        problem, value, status, payload
    )
    diagnostics.extend(validation_diagnostics)
    success = status in ("converged", "exact_root") and validation.passed
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
        data={
            "status": status,
            "success": success,
            "candidate": value,
            "solver_residual": abs(residual_value),
        },
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    return NumericalResult(
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
        provenance={
            "implementation": "sagejs.numerics.roots",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
            "solver_status": status,
        },
        domain_payload=payload,
    )


def find_root(
    function: Callable[[float], Any],
    lower: float | None = None,
    upper: float | None = None,
    **options: Any,
) -> NumericalResult:
    """Solve a scalar root problem and return its complete evidence record."""
    cancel = options.pop("cancel", None)
    problem = root_problem(function, lower, upper, **options)
    return solve_root_problem(problem, cancel=cancel)


def refine_root_result(result: NumericalResult, tolerance: float) -> NumericalResult:
    problem = result.problem
    function = problem.function
    if function is None:
        raise ValueError("root refinement requires a live callback")
    bracket = problem.bounds.get("bracket")
    initial = problem.initial_data.get("points")
    return find_root(
        function,
        float(bracket[0]) if isinstance(bracket, list) and len(bracket) == 2 else None,
        float(bracket[1]) if isinstance(bracket, list) and len(bracket) == 2 else None,
        x0=float(initial[0])
        if isinstance(initial, list) and len(initial) >= 1
        else None,
        x1=float(initial[1])
        if isinstance(initial, list) and len(initial) >= 2
        else None,
        derivative=problem.derivative,
        method=result.method,
        xtol=float(tolerance),
        rtol=float(problem.tolerances["rtol"]),
        ftol=min(float(problem.tolerances["ftol"]), float(tolerance)),
        maxiter=problem.resource_budget.max_iterations,
        max_evaluations=problem.resource_budget.max_evaluations,
        max_elapsed_ms=problem.resource_budget.max_elapsed_ms,
        trace=problem.trace_policy.level,
        max_trace_events=problem.trace_policy.max_events,
        max_trace_bytes=problem.trace_policy.max_bytes,
        expression=str(problem.function_record.get("expression"))
        if problem.replayable
        else None,
        variable=str(problem.function_record.get("variable", "x")),
        source_language=str(problem.source_intent.get("language", "python")),
    )


def emit_root_code(problem: NumericalProblem, method: str) -> dict[str, str]:
    function_record = problem.function_record
    expression = function_record.get("expression", "f(x)")
    variable = function_record.get("variable", "x")
    bracket = problem.bounds.get("bracket")
    initial = problem.initial_data.get("points")
    if isinstance(bracket, list) and len(bracket) == 2:
        lower = str(bracket[0])
        upper = str(bracket[1])
        python_arguments = lower + ", " + upper
        matlab_initial = "[" + lower + " " + upper + "]"
        wolfram_initial = "{" + str(variable) + ", " + lower + ", " + upper + "}"
    else:
        point = str(initial[0]) if isinstance(initial, list) and initial else "0.0"
        python_arguments = "x0=" + point
        matlab_initial = point
        wolfram_initial = "{" + str(variable) + ", " + point + "}"
    expression_text = str(expression)
    return {
        "python": "from sagejs.numerics import find_root\nresult = find_root(lambda "
        + str(variable)
        + ": "
        + expression_text
        + ", "
        + python_arguments
        + ', method="'
        + method
        + '")',
        "sage": "from sagejs.numerics import find_root as numerical_find_root\nresult = numerical_find_root(lambda "
        + str(variable)
        + ": "
        + expression_text
        + ", "
        + python_arguments
        + ', method="'
        + method
        + '")',
        "matlab": "result = fzero(@("
        + str(variable)
        + ") "
        + expression_text
        + ", "
        + matlab_initial
        + ");",
        "wolfram": "result = FindRoot["
        + expression_text
        + " == 0, "
        + wolfram_initial
        + "]",
    }
