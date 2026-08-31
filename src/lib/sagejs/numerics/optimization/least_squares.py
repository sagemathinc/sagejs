"""Nonlinear least squares plus linear and nonlinear curve fitting."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalProblem, NumericalValidation
from ..trace import NumericalTrace
from ._core import (
    MAX_DENSE_DIMENSION,
    MAX_FIT_OBSERVATIONS,
    CallbackFailure,
    Execution,
    OptimizationResult,
    StopExecution,
    finite_difference_jacobian,
    finite_squared_norm,
    half_squared_norm,
    infinity_norm,
    inverse_matrix,
    matrix,
    matrix_condition_1,
    maximum_residual_dimension,
    problem_record,
    record_progress,
    relative_sum_squares_decrease,
    scaled_normal_equations,
    scaled_sum_of_squares,
    solve_linear_system,
    stable_norm,
    sum_squares_less,
    squared_norm,
    status_diagnostic,
    vector,
)
from .planning import plan
from .validation import validate_with_execution


def least_squares_problem(
    residuals: Callable[[list[float]], Any],
    x0: Sequence[float],
    *,
    jacobian: Callable[[list[float]], Any] | None = None,
    method: str = "auto",
    xtol: float = 1.0e-10,
    ftol: float = 1.0e-12,
    gtol: float = 1.0e-8,
    maxiter: int = 300,
    max_evaluations: int = 20_000,
    max_elapsed_ms: int = 30_000,
    trace: str = "summary",
    max_trace_events: int = 512,
    max_trace_bytes: int = 2_000_000,
    expression: str | None = None,
    source_language: str = "python",
    _operation: str = "nonlinear_least_squares",
    _fit_data: dict[str, Any] | None = None,
) -> NumericalProblem:
    """Construct a nonlinear least-squares problem.

    The portable method is explicitly called `damped-gauss-newton`. It does
    not claim MINPACK `lmdif`/`lmder` identity or Sage `find_fit` compatibility.
    """
    if not callable(residuals):
        raise TypeError("residual function must be callable")
    if jacobian is not None and not callable(jacobian):
        raise TypeError("Jacobian must be callable")
    if len(x0) == 0 or len(x0) > MAX_DENSE_DIMENSION:
        raise ValueError(
            "parameter dimension must be between 1 and " + str(MAX_DENSE_DIMENSION)
        )
    point = [float(value) for value in x0]
    if any(not math.isfinite(value) for value in point):
        raise ValueError("the initial parameter vector must be finite")
    if xtol <= 0.0 or ftol < 0.0 or gtol <= 0.0:
        raise ValueError("least-squares tolerances must be positive")
    initial_data: dict[str, Any] = {"point": point}
    if _fit_data is not None:
        initial_data["fit_x"] = list(_fit_data["x"])
        initial_data["fit_y"] = list(_fit_data["y"])
    return problem_record(
        "fitting" if _operation == "curve_fit" else "least_squares",
        _operation,
        residuals,
        jacobian,
        dimension=len(point),
        initial_data=initial_data,
        bounds={},
        tolerances={"xtol": float(xtol), "ftol": float(ftol), "gtol": float(gtol)},
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
    execution: Execution,
    point: Sequence[float],
    expected: int | None = None,
    iteration: int | None = None,
) -> list[float]:
    function = execution.problem.function
    if function is None:
        raise StopExecution("invalid_problem", "missing_residual_callback")
    maximum = maximum_residual_dimension(len(point))
    return vector(
        execution.call("residual", function, list(point), iteration=iteration),
        expected,
        maximum=maximum,
    )


def _jacobian(
    execution: Execution,
    point: Sequence[float],
    residual_count: int,
    iteration: int | None = None,
) -> list[list[float]]:
    derivative = execution.problem.derivative
    if derivative is not None:
        return matrix(
            execution.call("jacobian", derivative, list(point), iteration=iteration),
            residual_count,
            len(point),
        )
    function = execution.problem.function
    if function is None:
        raise StopExecution("invalid_problem", "missing_residual_callback")
    return finite_difference_jacobian(
        execution,
        function,
        point,
        residual_count,
        iteration=iteration,
    )


def _parameter_diagnostics(
    jacobian: Sequence[Sequence[float]], residual: Sequence[float]
) -> dict[str, Any]:
    normal, _, scale, resolved = scaled_normal_equations(jacobian, residual)
    dimension = len(normal)
    if not resolved:
        return {
            "covariance_available": False,
            "rank_deficient_or_ill_conditioned": True,
            "standard_errors": [None for _ in range(dimension)],
            "normal_matrix_condition_estimate": None,
            "reason": "Jacobian and residual scales exceed the binary64 ratio envelope",
        }
    inverse = inverse_matrix(normal)
    if inverse is None:
        return {
            "covariance_available": False,
            "rank_deficient_or_ill_conditioned": True,
            "standard_errors": [None for _ in range(dimension)],
            "normal_matrix_condition_estimate": None,
        }
    raw_condition_estimate = matrix_condition_1(normal, inverse)
    condition_estimate = (
        raw_condition_estimate if math.isfinite(raw_condition_estimate) else None
    )
    ill_conditioned = (
        condition_estimate is None
        or condition_estimate > 1.0 / math.sqrt(2.220446049250313e-16)
    )
    degrees_of_freedom = max(1, len(residual) - dimension)
    normalized_residual = (
        list(residual) if scale == 0.0 else [float(value) / scale for value in residual]
    )
    normalized_squared_norm = finite_squared_norm(normalized_residual)
    if normalized_squared_norm is None:
        return {
            "covariance_available": False,
            "rank_deficient_or_ill_conditioned": True,
            "standard_errors": [None for _ in range(dimension)],
            "normal_matrix_condition_estimate": condition_estimate,
            "reason": "residual variance is outside the binary64 ratio envelope",
        }
    variance = normalized_squared_norm / degrees_of_freedom
    standard_errors: list[float | None] = []
    for index in range(dimension):
        diagonal = inverse[index][index] * variance
        standard_error = math.sqrt(diagonal) if diagonal >= 0.0 else None
        standard_errors.append(
            standard_error
            if standard_error is not None and math.isfinite(standard_error)
            else None
        )
    return {
        "covariance_available": True,
        "rank_deficient_or_ill_conditioned": ill_conditioned,
        "standard_errors": standard_errors,
        "normal_matrix_condition_estimate": condition_estimate,
    }


def _residual_metrics(residual: Sequence[float]) -> dict[str, Any]:
    scale, scaled_sum = scaled_sum_of_squares(residual)
    return {
        "cost": half_squared_norm(residual),
        "residual_norm": stable_norm(residual),
        "residual_scale": scale,
        "scaled_sum_of_squares": scaled_sum,
    }


def _retained_fitted_values(
    fit_y: Any, residual: Sequence[float]
) -> list[float] | None:
    if not isinstance(fit_y, list) or len(fit_y) != len(residual):
        return None
    answer: list[float] = []
    for index in range(len(residual)):
        fitted = float(fit_y[index]) + residual[index]
        if not math.isfinite(fitted):
            return None
        answer.append(fitted)
    return answer


def _damped_gauss_newton(
    execution: Execution,
) -> tuple[list[float], list[float], int, str, dict[str, Any]]:
    problem = execution.problem
    initial = problem.initial_data.get("point")
    if not isinstance(initial, list):
        raise StopExecution("invalid_problem", "missing_initial_parameters")
    point = [float(value) for value in initial]
    residual = _residual(execution, point, iteration=0)
    if len(residual) < len(point):
        raise StopExecution(
            "invalid_problem", "least_squares_requires_at_least_as_many_residuals"
        )
    cost_representation = scaled_sum_of_squares(residual)
    metrics = _residual_metrics(residual)
    initial_trace_data: dict[str, Any] = {
        "point": list(point),
        "step_kind": "initial_point",
        **metrics,
    }
    if problem.operation == "curve_fit" and len(residual) <= 256:
        fitted_values = _retained_fitted_values(
            problem.initial_data.get("fit_y"), residual
        )
        if fitted_values is not None:
            initial_trace_data["fitted_values"] = fitted_values
    record_progress(
        execution,
        0,
        accepted=True,
        data=initial_trace_data,
        important=True,
    )
    damping = 1.0e-3
    status = "maximum_iterations"
    iteration = 0
    gradient_norm = 0.0
    last_jacobian: list[list[float]] = []
    jacobian_is_current = False
    pending_cost_convergence = False
    for iteration in range(1, problem.resource_budget.max_iterations + 1):
        execution.check()
        jacobian = _jacobian(execution, point, len(residual), iteration)
        last_jacobian = jacobian
        jacobian_is_current = True
        normal, gradient, _, scale_resolved = scaled_normal_equations(
            jacobian, residual
        )
        if not scale_resolved:
            raise StopExecution(
                "invalid_problem", "least_squares_scale_ratio_outside_binary64"
            )
        gradient_norm = infinity_norm(gradient)
        if pending_cost_convergence:
            status = "converged"
            break
        if gradient_norm <= float(problem.tolerances["gtol"]):
            status = "converged"
            iteration -= 1
            break
        diagonal = [max(1.0, normal[index][index]) for index in range(len(point))]
        accepted = False
        candidate = list(point)
        candidate_residual = list(residual)
        candidate_cost_representation = cost_representation
        step = [0.0 for _ in point]
        trial_damping = damping
        for _ in range(16):
            damped = [list(row) for row in normal]
            for index in range(len(point)):
                damped[index][index] += trial_damping * diagonal[index]
            solution = solve_linear_system(damped, [-value for value in gradient])
            if solution is None:
                trial_damping *= 10.0
                continue
            step = solution
            candidate = [point[index] + step[index] for index in range(len(point))]
            if any(not math.isfinite(value) for value in candidate):
                trial_damping *= 10.0
                continue
            candidate_residual = _residual(
                execution, candidate, len(residual), iteration
            )
            candidate_cost_representation = scaled_sum_of_squares(candidate_residual)
            if sum_squares_less(candidate_cost_representation, cost_representation):
                accepted = True
                break
            trial_damping *= 10.0
        if not accepted:
            status = "stagnation"
            damping = trial_damping
            break
        relative_objective_decrease = relative_sum_squares_decrease(
            cost_representation, candidate_cost_representation
        )
        point = candidate
        residual = candidate_residual
        cost_representation = candidate_cost_representation
        jacobian_is_current = False
        damping = max(1.0e-15, trial_damping * 0.3)
        step_norm = infinity_norm(step)
        trace_data: dict[str, Any] = {
            "point": list(point),
            "linearized_gradient_norm_before_step": gradient_norm,
            "step_norm": step_norm,
            "damping": damping,
            "relative_objective_decrease": relative_objective_decrease,
            **_residual_metrics(residual),
        }
        if problem.operation == "curve_fit" and len(residual) <= 256:
            fitted_values = _retained_fitted_values(
                problem.initial_data.get("fit_y"), residual
            )
            if fitted_values is not None:
                trace_data["fitted_values"] = fitted_values
        record_progress(
            execution,
            iteration,
            accepted=True,
            data=trace_data,
        )
        cost_converged = relative_objective_decrease <= float(
            problem.tolerances["ftol"]
        )
        step_converged = step_norm <= float(problem.tolerances["xtol"]) * max(
            1.0, infinity_norm(point)
        )
        if cost_converged:
            pending_cost_convergence = True
            continue
        if step_converged:
            status = "stagnation"
            break
    parameter_diagnostics = (
        _parameter_diagnostics(last_jacobian, residual)
        if len(last_jacobian) > 0 and jacobian_is_current
        else {
            "covariance_available": False,
            "rank_deficient_or_ill_conditioned": None,
            "standard_errors": [None for _ in point],
            "normal_matrix_condition_estimate": None,
            "reason": "a Jacobian at the returned point is not available",
        }
    )
    final_metrics = _residual_metrics(residual)
    payload: dict[str, Any] = {
        "objective": final_metrics["cost"],
        **final_metrics,
        "solver_stationarity": gradient_norm if jacobian_is_current else None,
        "parameter_diagnostics": parameter_diagnostics,
    }
    return list(point), list(residual), iteration, status, payload


def _result_from_least_squares(
    problem: NumericalProblem,
    *,
    method: str | None,
    cancel: Callable[[], bool] | None,
) -> OptimizationResult:
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
        value, residual, iterations, status, payload = _damped_gauss_newton(execution)
    except StopExecution as stop:
        status = stop.status
        reason = stop.reason
    except CallbackFailure as failure:
        status = "callback_error"
        reason = failure.error_type
    status_item = status_diagnostic(status, reason)
    if status_item is not None:
        diagnostics.append(status_item)
    parameter_diagnostics = payload.get("parameter_diagnostics")
    if (
        isinstance(parameter_diagnostics, dict)
        and parameter_diagnostics.get("rank_deficient_or_ill_conditioned") is True
    ):
        diagnostics.append(NumericalDiagnostic("ill_conditioned"))
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
    if residual is not None:
        payload["residual_vector"] = residual
        if problem.operation == "curve_fit":
            fit_x = problem.initial_data.get("fit_x")
            fit_y = problem.initial_data.get("fit_y")
            if isinstance(fit_x, list) and isinstance(fit_y, list):
                payload["fit_x"] = list(fit_x)
                payload["fit_y"] = list(fit_y)
                fitted_values = _retained_fitted_values(fit_y, residual)
                if fitted_values is not None:
                    payload["fitted_values"] = fitted_values
    if reason is not None:
        payload["stop_reason"] = reason
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


def solve_least_squares_problem(
    problem: NumericalProblem,
    *,
    method: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> OptimizationResult:
    """Solve and independently validate a nonlinear least-squares problem."""
    return _result_from_least_squares(problem, method=method, cancel=cancel)


def least_squares(
    residuals: Callable[[list[float]], Any],
    x0: Sequence[float],
    **options: Any,
) -> OptimizationResult:
    """Minimize one half of the squared residual norm."""
    cancel = options.pop("cancel", None)
    problem = least_squares_problem(residuals, x0, **options)
    return solve_least_squares_problem(problem, cancel=cancel)


def curve_fit(
    model: Callable[[float, list[float]], Any],
    xdata: Sequence[float],
    ydata: Sequence[float],
    p0: Sequence[float],
    *,
    jacobian: Callable[[float, list[float]], Any] | None = None,
    **options: Any,
) -> OptimizationResult:
    """Fit a nonlinear scalar model to data with parameter diagnostics.

    `model(x, parameters)` returns one predicted value. If supplied,
    `jacobian(x, parameters)` returns derivatives with respect to all
    parameters. The solver batches a whole residual vector at its public
    callback boundary.
    """
    if not callable(model):
        raise TypeError("model must be callable")
    if jacobian is not None and not callable(jacobian):
        raise TypeError("model Jacobian must be callable")
    observation_count = len(xdata)
    if observation_count != len(ydata) or observation_count == 0:
        raise ValueError("xdata and ydata must have equal nonzero length")
    if observation_count > MAX_FIT_OBSERVATIONS:
        raise ValueError(
            "curve fitting is limited to " + str(MAX_FIT_OBSERVATIONS) + " observations"
        )
    if len(p0) == 0 or len(p0) > MAX_DENSE_DIMENSION:
        raise ValueError(
            "parameter dimension must be between 1 and " + str(MAX_DENSE_DIMENSION)
        )
    if observation_count > maximum_residual_dimension(len(p0)):
        raise ValueError("curve fit exceeds the dense Jacobian allocation limit")
    x_values = [float(value) for value in xdata]
    y_values = [float(value) for value in ydata]
    if any(not math.isfinite(value) for value in x_values + y_values):
        raise ValueError("fit data must be finite")

    def residual_function(parameters: list[float]) -> list[float]:
        return [
            float(model(x_values[index], parameters)) - y_values[index]
            for index in range(len(x_values))
        ]

    jacobian_function: Callable[[list[float]], Any] | None = None
    if jacobian is not None:

        def explicit_jacobian(parameters: list[float]) -> list[list[float]]:
            return [
                [float(value) for value in jacobian(x_value, parameters)]
                for x_value in x_values
            ]

        jacobian_function = explicit_jacobian
    cancel = options.pop("cancel", None)
    problem = least_squares_problem(
        residual_function,
        p0,
        jacobian=jacobian_function,
        _operation="curve_fit",
        _fit_data={"x": x_values, "y": y_values},
        **options,
    )
    return solve_least_squares_problem(problem, cancel=cancel)


def linear_fit_problem(
    xdata: Sequence[float],
    ydata: Sequence[float],
    *,
    max_evaluations: int = 64,
    max_elapsed_ms: int = 30_000,
    trace: str = "summary",
    max_trace_events: int = 64,
    max_trace_bytes: int = 256_000,
    source_language: str = "python",
) -> NumericalProblem:
    """Construct a centered affine least-squares fit problem."""
    observation_count = len(xdata)
    if observation_count != len(ydata) or observation_count < 2:
        raise ValueError("linear fitting requires equally sized data with two points")
    if observation_count > MAX_FIT_OBSERVATIONS:
        raise ValueError(
            "linear fitting is limited to "
            + str(MAX_FIT_OBSERVATIONS)
            + " observations"
        )
    x_values = [float(value) for value in xdata]
    y_values = [float(value) for value in ydata]
    if any(not math.isfinite(value) for value in x_values + y_values):
        raise ValueError("fit data must be finite")

    def residual_function(parameters: list[float]) -> list[float]:
        return [
            parameters[0] * x_values[index] + parameters[1] - y_values[index]
            for index in range(len(x_values))
        ]

    def jacobian_function(parameters: list[float]) -> list[list[float]]:
        return [[x_value, 1.0] for x_value in x_values]

    return problem_record(
        "fitting",
        "linear_fit",
        residual_function,
        jacobian_function,
        dimension=2,
        initial_data={"point": [0.0, 0.0], "fit_x": x_values, "fit_y": y_values},
        bounds={},
        tolerances={"xtol": 1.0e-12, "ftol": 1.0e-14, "gtol": 1.0e-9},
        method="centered-linear-fit",
        max_iterations=2,
        max_evaluations=max_evaluations,
        max_elapsed_ms=max_elapsed_ms,
        trace_level=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        source_language=source_language,
        metadata={"model": "slope*x + intercept"},
    )


def solve_linear_fit_problem(
    problem: NumericalProblem,
    *,
    cancel: Callable[[], bool] | None = None,
) -> OptimizationResult:
    """Solve an affine fit with centered sums and independent normal checks."""
    selected_plan = plan(problem)
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
    diagnostics = [NumericalDiagnostic("non_replayable_callback")]
    x_values = problem.initial_data.get("fit_x")
    y_values = problem.initial_data.get("fit_y")
    value: list[float] | None = None
    residual: list[float] | None = None
    status = "backend_failure"
    reason: str | None = None
    payload: dict[str, Any] = {}
    try:
        execution.check()
        if not isinstance(x_values, list) or not isinstance(y_values, list):
            raise StopExecution("invalid_problem", "missing_fit_data")
        count = len(x_values)
        initial_residual = [-float(value) for value in y_values]
        record_progress(
            execution,
            0,
            accepted=True,
            data={
                "point": [0.0, 0.0],
                "cost": 0.5 * squared_norm(initial_residual),
                "residual_norm": math.sqrt(squared_norm(initial_residual)),
                "fitted_values": [0.0 for _ in x_values],
                "step_kind": "initial_point",
            },
            important=True,
        )
        x_mean = sum(float(value) for value in x_values) / count
        y_mean = sum(float(value) for value in y_values) / count
        centered_square = 0.0
        centered_product = 0.0
        for index in range(count):
            x_delta = float(x_values[index]) - x_mean
            centered_square += x_delta * x_delta
            centered_product += x_delta * (float(y_values[index]) - y_mean)
        if centered_square == 0.0:
            raise StopExecution("invalid_problem", "constant_predictor")
        slope = centered_product / centered_square
        intercept = y_mean - slope * x_mean
        value = [slope, intercept]
        residual = [
            slope * float(x_values[index]) + intercept - float(y_values[index])
            for index in range(count)
        ]
        cost = 0.5 * squared_norm(residual)
        status = "converged"
        jacobian = [[float(x_value), 1.0] for x_value in x_values]
        payload = {
            "objective": cost,
            "cost": cost,
            "residual_norm": math.sqrt(2.0 * cost),
            "residual_vector": residual,
            "fit_x": list(x_values),
            "fit_y": list(y_values),
            "fitted_values": [
                slope * float(x_value) + intercept for x_value in x_values
            ],
            "parameter_diagnostics": _parameter_diagnostics(jacobian, residual),
        }
        record_progress(
            execution,
            1,
            accepted=True,
            data={
                "point": value,
                "cost": cost,
                "residual_norm": math.sqrt(2.0 * cost),
                "fitted_values": list(payload["fitted_values"]),
                "step_kind": "centered_sums",
            },
            important=True,
        )
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
    if reason is not None:
        payload["stop_reason"] = reason
    trace.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=validation_diagnostics,
        important=True,
        force=True,
    )
    trace.append(
        "finish" if success else "failure",
        iteration=1 if value is not None else 0,
        evaluation=execution.evaluations,
        data={"status": status, "success": success, "point": value},
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    return OptimizationResult(
        problem,
        selected_plan,
        success=success,
        status=status,
        value=value,
        validation=validation,
        diagnostics=diagnostics,
        iterations=1 if value is not None else 0,
        evaluations=execution.evaluations,
        elapsed_ms=execution.elapsed_ms(),
        trace=trace,
        measurements={"callback_counts": execution.counts},
        domain_payload=payload,
    )


def linear_fit(
    xdata: Sequence[float], ydata: Sequence[float], **options: Any
) -> OptimizationResult:
    """Fit `slope*x + intercept` by stable centered least squares."""
    cancel = options.pop("cancel", None)
    problem = linear_fit_problem(xdata, ydata, **options)
    return solve_linear_fit_problem(problem, cancel=cancel)
