"""Portable unconstrained and box-bounded multivariate minimization."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalProblem, NumericalValidation
from ..trace import NumericalTrace
from ._constraints import (
    constraint_records,
    normalize_constraints,
    problem_constraints,
)
from ._core import (
    MAX_DENSE_DIMENSION,
    CallbackFailure,
    Execution,
    OptimizationResult,
    StopExecution,
    dot,
    finite_difference_gradient,
    identity,
    infinity_norm,
    normalized_bounds,
    problem_record,
    project,
    projected_gradient,
    record_progress,
    scalar,
    status_diagnostic,
    vector,
)
from .planning import plan
from .validation import validate_with_execution


def minimize_problem(
    function: Callable[[list[float]], Any],
    x0: Sequence[float],
    *,
    gradient: Callable[[list[float]], Any] | None = None,
    bounds: Sequence[Sequence[float | None] | None] | None = None,
    constraints: Sequence[Any] = (),
    method: str = "auto",
    xtol: float = 1.0e-9,
    ftol: float = 1.0e-10,
    gtol: float = 1.0e-7,
    initial_step: float | Sequence[float] = 0.05,
    maxiter: int = 1000,
    max_evaluations: int = 20_000,
    max_elapsed_ms: int = 30_000,
    trace: str = "summary",
    max_trace_events: int = 512,
    max_trace_bytes: int = 2_000_000,
    expression: str | None = None,
    source_language: str = "python",
) -> NumericalProblem:
    """Construct an inspectable local-minimization problem.

    Nonlinear constraints use SciPy-shaped scalar mappings with `type` equal
    to `ineq` (meaning `fun(x) >= 0`) or `eq` (meaning `fun(x) == 0`). They
    are available only through the explicitly requested `nlopt-cobyla`
    identity. Box bounds use the explicitly named `projected-bfgs` extension
    for the ordinary-Python automatic route.
    """
    if not callable(function):
        raise TypeError("objective must be callable")
    if gradient is not None and not callable(gradient):
        raise TypeError("gradient must be callable")
    constraint_specs = normalize_constraints(constraints)
    if len(x0) == 0 or len(x0) > MAX_DENSE_DIMENSION:
        raise ValueError(
            "initial point dimension must be between 1 and " + str(MAX_DENSE_DIMENSION)
        )
    point = [float(value) for value in x0]
    for value in point:
        if not math.isfinite(value):
            raise ValueError("the initial point must be finite")
    lower, upper = normalized_bounds(bounds, len(point))
    point = project(point, lower, upper)
    if xtol <= 0.0 or ftol < 0.0 or gtol <= 0.0:
        raise ValueError("optimization tolerances must be positive")
    if isinstance(initial_step, Sequence) and not isinstance(
        initial_step, (str, bytes, bytearray)
    ):
        if len(initial_step) != len(point):
            raise ValueError("initial_step must have the same dimension as x0")
        step_record = [float(value) for value in initial_step]
    else:
        step = float(initial_step)
        step_record = [step * max(1.0, abs(value)) for value in point]
    if any(not math.isfinite(value) or value <= 0.0 for value in step_record):
        raise ValueError("initial_step entries must be finite and positive")
    bound_record = [[lower[index], upper[index]] for index in range(len(point))]
    requested = method.lower()
    if len(constraint_specs) != 0 and requested != "nlopt-cobyla":
        raise ValueError(
            "nonlinear constraints require the explicit nlopt-cobyla method"
        )
    if requested in ("nelder-mead", "bfgs") and any(
        item != [None, None] for item in bound_record
    ):
        raise ValueError(
            requested + " is unbounded; request projected-bfgs for box bounds"
        )
    if requested == "projected-bfgs" and not any(
        item != [None, None] for item in bound_record
    ):
        raise ValueError("projected-bfgs requires at least one finite box bound")
    if requested == "nelder-mead" and len(point) > 64:
        raise ValueError("Nelder-Mead is limited to dimension 64")
    if requested.startswith("nlopt-") and gradient is not None:
        raise ValueError("qualified NLopt methods are derivative-free; omit gradient")
    return problem_record(
        "optimization",
        "minimize",
        function,
        gradient,
        dimension=len(point),
        initial_data={"point": point, "initial_step": step_record},
        bounds={
            "variables": bound_record,
            "constraints": constraint_records(constraint_specs),
        },
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
        constraints=constraint_specs,
    )


def _objective(
    execution: Execution, point: Sequence[float], iteration: int | None = None
) -> float:
    function = execution.problem.function
    if function is None:
        raise StopExecution("invalid_problem", "missing_objective")
    return scalar(
        execution.call("objective", function, list(point), iteration=iteration)
    )


def _gradient(
    execution: Execution,
    point: Sequence[float],
    lower: Sequence[float | None],
    upper: Sequence[float | None],
    iteration: int | None = None,
) -> list[float]:
    derivative = execution.problem.derivative
    if derivative is not None:
        return vector(
            execution.call("gradient", derivative, list(point), iteration=iteration),
            len(point),
        )
    function = execution.problem.function
    if function is None:
        raise StopExecution("invalid_problem", "missing_objective")
    return finite_difference_gradient(
        execution,
        function,
        point,
        lower,
        upper,
        iteration=iteration,
    )


def _nelder_mead(
    execution: Execution,
) -> tuple[list[float], float, int, str, dict[str, Any]]:
    problem = execution.problem
    initial = problem.initial_data.get("point")
    if not isinstance(initial, list):
        raise StopExecution("invalid_problem", "missing_initial_point")
    point = [float(value) for value in initial]
    dimension = len(point)
    raw_step = problem.initial_data["initial_step"]
    if not isinstance(raw_step, list) or len(raw_step) != dimension:
        raise StopExecution("invalid_problem", "invalid_initial_step")
    step = [float(value) for value in raw_step]
    simplex = [list(point)]
    for index in range(dimension):
        vertex = list(point)
        vertex[index] += step[index]
        simplex.append(vertex)
    values: list[float] = [
        float(_objective(execution, vertex, 0)) for vertex in simplex
    ]
    initial_order = sorted(range(dimension + 1), key=lambda index: values[index])
    initial_best = initial_order[0]
    initial_data: dict[str, Any] = {
        "point": list(simplex[initial_best]),
        "objective": values[initial_best],
        "step_kind": "initial_simplex",
    }
    if dimension <= 8:
        initial_data["simplex"] = [list(simplex[index]) for index in initial_order]
    record_progress(
        execution,
        0,
        accepted=True,
        data=initial_data,
        important=True,
    )
    status = "maximum_iterations"
    iteration = 0
    diameter = 0.0
    for iteration in range(1, problem.resource_budget.max_iterations + 1):
        execution.check()
        order = sorted(range(dimension + 1), key=lambda index: values[index])
        simplex = [simplex[index] for index in order]
        values = [values[index] for index in order]
        best = simplex[0]
        best_value = values[0]
        diameter = 0.0
        for vertex in simplex[1:]:
            diameter = max(
                diameter,
                max(abs(vertex[index] - best[index]) for index in range(dimension)),
            )
        spread = max(abs(value - best_value) for value in values)
        if diameter <= float(problem.tolerances["xtol"]) * max(
            1.0, infinity_norm(best)
        ) and spread <= float(problem.tolerances["ftol"]) * max(1.0, abs(best_value)):
            status = "converged"
            break
        centroid = [0.0 for _ in range(dimension)]
        for vertex in simplex[:-1]:
            for index in range(dimension):
                centroid[index] += vertex[index] / dimension
        worst = simplex[-1]
        reflected = [
            centroid[index] + (centroid[index] - worst[index])
            for index in range(dimension)
        ]
        reflected_value = _objective(execution, reflected, iteration)
        step_kind = "reflection"
        if reflected_value < values[0]:
            expanded = [
                centroid[index] + 2.0 * (reflected[index] - centroid[index])
                for index in range(dimension)
            ]
            expanded_value = _objective(execution, expanded, iteration)
            if expanded_value < reflected_value:
                simplex[-1], values[-1] = expanded, expanded_value
                step_kind = "expansion"
            else:
                simplex[-1], values[-1] = reflected, reflected_value
        elif reflected_value < values[-2]:
            simplex[-1], values[-1] = reflected, reflected_value
        else:
            if reflected_value < values[-1]:
                contracted = [
                    centroid[index] + 0.5 * (reflected[index] - centroid[index])
                    for index in range(dimension)
                ]
                comparison = reflected_value
            else:
                contracted = [
                    centroid[index] + 0.5 * (worst[index] - centroid[index])
                    for index in range(dimension)
                ]
                comparison = values[-1]
            contracted_value = _objective(execution, contracted, iteration)
            if contracted_value <= comparison:
                simplex[-1], values[-1] = contracted, contracted_value
                step_kind = "contraction"
            else:
                step_kind = "shrink"
                for vertex_index in range(1, dimension + 1):
                    simplex[vertex_index] = [
                        best[index] + 0.5 * (simplex[vertex_index][index] - best[index])
                        for index in range(dimension)
                    ]
                    values[vertex_index] = _objective(
                        execution, simplex[vertex_index], iteration
                    )
        order = sorted(range(dimension + 1), key=lambda index: values[index])
        simplex = [simplex[index] for index in order]
        values = [values[index] for index in order]
        trace_data: dict[str, Any] = {
            "point": list(simplex[0]),
            "objective": values[0],
            "simplex_diameter": diameter,
            "objective_spread": spread,
            "step_kind": step_kind,
        }
        if dimension <= 8:
            trace_data["simplex"] = [list(vertex) for vertex in simplex]
        record_progress(
            execution,
            iteration,
            accepted=True,
            data=trace_data,
        )
    order = sorted(range(dimension + 1), key=lambda index: values[index])
    best_index = order[0]
    return (
        list(simplex[best_index]),
        values[best_index],
        iteration,
        status,
        {"final_simplex_diameter": diameter if iteration > 0 else 0.0},
    )


def _inverse_bfgs_update(
    inverse: Sequence[Sequence[float]],
    step: Sequence[float],
    gradient_change: Sequence[float],
) -> list[list[float]]:
    dimension = len(step)
    curvature = dot(step, gradient_change)
    if curvature <= 1.0e-12 * max(1.0, infinity_norm(step)) * max(
        1.0, infinity_norm(gradient_change)
    ):
        return [list(row) for row in inverse]
    inverse_gradient = [dot(inverse[row], gradient_change) for row in range(dimension)]
    gradient_inverse_gradient = dot(gradient_change, inverse_gradient)
    coefficient = (curvature + gradient_inverse_gradient) / (curvature * curvature)
    answer = [[0.0 for _ in range(dimension)] for _ in range(dimension)]
    for row in range(dimension):
        for column in range(dimension):
            answer[row][column] = (
                inverse[row][column]
                + coefficient * step[row] * step[column]
                - (
                    inverse_gradient[row] * step[column]
                    + step[row] * inverse_gradient[column]
                )
                / curvature
            )
    return answer


def _bfgs(
    execution: Execution, bounded: bool
) -> tuple[list[float], float, int, str, dict[str, Any]]:
    problem = execution.problem
    initial = problem.initial_data.get("point")
    if not isinstance(initial, list):
        raise StopExecution("invalid_problem", "missing_initial_point")
    point = [float(value) for value in initial]
    bounds_record = problem.bounds.get("variables")
    bound_input = bounds_record if isinstance(bounds_record, list) else None
    lower, upper = normalized_bounds(bound_input, len(point))
    if not bounded:
        lower, upper = normalized_bounds(None, len(point))
    point = project(point, lower, upper)
    objective = _objective(execution, point, 0)
    gradient = _gradient(execution, point, lower, upper, 0)
    inverse = identity(len(point))
    status = "maximum_iterations"
    iteration = 0
    gradient_residual = infinity_norm(projected_gradient(point, gradient, lower, upper))
    record_progress(
        execution,
        0,
        accepted=True,
        data={
            "point": list(point),
            "objective": objective,
            "projected_gradient_norm": gradient_residual,
            "step_kind": "initial_point",
        },
        important=True,
    )
    for iteration in range(1, problem.resource_budget.max_iterations + 1):
        execution.check()
        projected = projected_gradient(point, gradient, lower, upper)
        gradient_residual = infinity_norm(projected)
        if gradient_residual <= float(problem.tolerances["gtol"]):
            status = "converged"
            break
        direction = [-dot(inverse[row], gradient) for row in range(len(point))]
        unit_candidate = project(
            [point[index] + direction[index] for index in range(len(point))],
            lower,
            upper,
        )
        unit_step = [
            unit_candidate[index] - point[index] for index in range(len(point))
        ]
        if dot(gradient, unit_step) >= -1.0e-14 * max(
            1.0, infinity_norm(gradient) * infinity_norm(unit_step)
        ):
            direction = [-value for value in projected]
            inverse = identity(len(point))
        step_scale = 1.0
        accepted = False
        candidate = list(point)
        candidate_objective = objective
        displacement = [0.0 for _ in point]
        for _ in range(32):
            candidate = project(
                [
                    point[index] + step_scale * direction[index]
                    for index in range(len(point))
                ],
                lower,
                upper,
            )
            displacement = [
                candidate[index] - point[index] for index in range(len(point))
            ]
            if infinity_norm(displacement) == 0.0:
                step_scale *= 0.5
                continue
            candidate_objective = _objective(execution, candidate, iteration)
            if candidate_objective <= objective + 1.0e-4 * dot(gradient, displacement):
                accepted = True
                break
            step_scale *= 0.5
        if not accepted:
            status = (
                "converged"
                if gradient_residual
                <= max(1.0e-6, float(problem.tolerances["gtol"]) * 10.0)
                else "stagnation"
            )
            break
        candidate_gradient = _gradient(execution, candidate, lower, upper, iteration)
        gradient_change = [
            candidate_gradient[index] - gradient[index] for index in range(len(point))
        ]
        inverse = _inverse_bfgs_update(inverse, displacement, gradient_change)
        objective_change = abs(candidate_objective - objective)
        point = candidate
        objective = candidate_objective
        gradient = candidate_gradient
        gradient_residual = infinity_norm(
            projected_gradient(point, gradient, lower, upper)
        )
        record_progress(
            execution,
            iteration,
            accepted=True,
            data={
                "point": list(point),
                "objective": objective,
                "projected_gradient_norm": gradient_residual,
                "step_norm": infinity_norm(displacement),
                "step_scale": step_scale,
                "objective_change": objective_change,
            },
        )
        if gradient_residual <= float(problem.tolerances["gtol"]):
            status = "converged"
            break
        if infinity_norm(displacement) <= float(problem.tolerances["xtol"]) * max(
            1.0, infinity_norm(point)
        ):
            status = (
                "converged"
                if gradient_residual
                <= max(1.0e-6, float(problem.tolerances["gtol"]) * 10.0)
                else "stagnation"
            )
            break
    return (
        list(point),
        objective,
        iteration,
        status,
        {
            "solver_projected_gradient_norm": gradient_residual,
            "bounds_applied": bounded,
        },
    )


def _nlopt_minimize(
    execution: Execution,
    method: str,
    execution_payload: dict[str, Any],
) -> tuple[list[float] | None, float | None, int, str, dict[str, Any]]:
    """Execute one exact NLopt identity through the lazy runtime boundary."""
    try:
        import sagejs.runtime as runtime
    except (ImportError, NameError):
        raise StopExecution("backend_failure", "nlopt_backend_unavailable") from None

    problem = execution.problem
    initial = problem.initial_data.get("point")
    raw_step = problem.initial_data.get("initial_step")
    if not isinstance(initial, list):
        raise StopExecution("invalid_problem", "missing_initial_point")
    if not isinstance(raw_step, list) or len(raw_step) != len(initial):
        raise StopExecution("invalid_problem", "invalid_initial_step")
    point = [float(value) for value in initial]
    step = [float(value) for value in raw_step]
    constraints = problem_constraints(problem)
    inequality = [item for item in constraints if item.kind == "inequality"]
    equality = [item for item in constraints if item.kind == "equality"]
    if method == "nlopt-nelder-mead" and len(constraints) != 0:
        raise StopExecution(
            "invalid_problem", "nlopt_nelder_mead_nonlinear_constraints"
        )

    try:
        backend = runtime.numerical_backend("nlopt")
        solve = runtime.reflect.get(backend, "solve")
        if runtime.jstype(solve) != "function":
            raise StopExecution("backend_failure", "invalid_nlopt_runtime_contract")
    except StopExecution:
        raise
    except Exception:
        raise StopExecution("backend_failure", "nlopt_backend_unavailable") from None

    options = runtime.object.create(None)

    def set_option(name: str, value: Any) -> None:
        runtime.reflect.set(options, name, value)

    def objective_callback(candidate: list[float]) -> float:
        return _objective(execution, candidate)

    def inequality_callback(candidate: list[float]) -> list[float]:
        # Public `ineq` follows SciPy (`fun(x) >= 0`); NLopt consumes `g(x) <= 0`.
        return [
            -scalar(execution.call("inequality", item.function, candidate))
            for item in inequality
        ]

    def equality_callback(candidate: list[float]) -> list[float]:
        return [
            scalar(execution.call("equality", item.function, candidate))
            for item in equality
        ]

    bounds_record = problem.bounds.get("variables")
    bound_input = bounds_record if isinstance(bounds_record, list) else None
    lower, upper = normalized_bounds(bound_input, len(point))
    remaining_evaluations = (
        problem.resource_budget.max_evaluations - execution.evaluations
    )
    if remaining_evaluations <= 0:
        raise StopExecution("maximum_evaluations")
    remaining_elapsed = problem.resource_budget.max_elapsed_ms - execution.elapsed_ms()
    if remaining_elapsed <= 0.0:
        raise StopExecution("maximum_elapsed_time", "elapsed_time_budget")
    set_option("method", method)
    set_option("initial", point)
    set_option("initialStep", step)
    set_option(
        "lower",
        [float("-inf") if value is None else float(value) for value in lower],
    )
    set_option(
        "upper",
        [float("inf") if value is None else float(value) for value in upper],
    )
    set_option("objective", objective_callback)
    set_option("inequalityCount", len(inequality))
    set_option("equalityCount", len(equality))
    if len(inequality) != 0:
        set_option("inequality", inequality_callback)
        set_option("inequalityTolerance", [item.tolerance for item in inequality])
    if len(equality) != 0:
        set_option("equality", equality_callback)
        set_option("equalityTolerance", [item.tolerance for item in equality])
    # NLopt combines its stopping criteria with OR. In one dimension, equal
    # objective values at opposite simplex vertices can therefore satisfy a
    # relative function test while the simplex is still far from stationary
    # (for example, the two sides of a quadratic minimizer). Keep function
    # tolerance in the independent public validation contract, and use the
    # parameter tolerance as the backend convergence stop.
    # Omitting NLopt's optional function-tolerance field selects its documented
    # disabled value. Do not pass a Python float wrapper across this low-level
    # JavaScript option boundary merely to spell that default explicitly.
    set_option("relativeParameterTolerance", float(problem.tolerances["xtol"]))
    set_option(
        "absoluteParameterTolerance",
        [
            float(problem.tolerances["xtol"])
            * max(1.0, abs(point[index]), abs(step[index]))
            for index in range(len(point))
        ],
    )
    # NLopt's derivative-free algorithms expose an evaluation stop, not a
    # portable iteration counter. Use the stricter of the caller's iteration
    # and evaluation budgets rather than silently ignoring either contract.
    backend_evaluation_budget = min(
        remaining_evaluations, problem.resource_budget.max_iterations
    )
    set_option("maximumEvaluations", backend_evaluation_budget)
    set_option("maximumCallbacks", backend_evaluation_budget)
    set_option("maximumElapsedMs", remaining_elapsed)

    # Any exceptional exit from this point occurred while the authenticated
    # external backend was executing, so stamp provenance before entering it.
    execution_payload.update(
        {"method_identity": method, "backend_identity": "nlopt-mit-wasm"}
    )
    try:
        result = runtime.reflect.apply(solve, backend, [options])
    except (StopExecution, CallbackFailure):
        raise
    except Exception:
        raise StopExecution("backend_failure", "nlopt_backend_error") from None

    try:
        returned_method = str(runtime.reflect.get(result, "method"))
        returned_backend = str(runtime.reflect.get(result, "backend"))
        if returned_method != method or returned_backend != "nlopt-mit-wasm":
            raise StopExecution("backend_failure", "nlopt_method_identity_mismatch")
        if not bool(runtime.reflect.get(result, "independentValidationRequired")):
            raise StopExecution("backend_failure", "nlopt_validation_contract_missing")
        raw_value = runtime.reflect.get(result, "value")
        value: list[float] | None = None
        if runtime.jstype(raw_value) != "undefined":
            value = [float(item) for item in raw_value]
            if len(value) != len(point) or any(
                not math.isfinite(item) for item in value
            ):
                raise StopExecution("backend_failure", "invalid_nlopt_parameter_vector")
        backend_status = str(runtime.reflect.get(result, "status"))
        backend_status_code = int(runtime.reflect.get(result, "backendStatus"))
        backend_converged = bool(runtime.reflect.get(result, "backendConverged"))
        backend_evaluations = int(runtime.reflect.get(result, "evaluations"))
        objective_callbacks = int(runtime.reflect.get(result, "objectiveCallbacks"))
        inequality_callbacks = int(runtime.reflect.get(result, "inequalityCallbacks"))
        equality_callbacks = int(runtime.reflect.get(result, "equalityCallbacks"))
        callback_count = int(runtime.reflect.get(result, "callbackCount"))
        gradient_callbacks = int(runtime.reflect.get(result, "gradientCallbacks"))
        jacobian_callbacks = int(runtime.reflect.get(result, "jacobianCallbacks"))
        if (
            any(
                count < 0
                for count in (
                    backend_evaluations,
                    objective_callbacks,
                    inequality_callbacks,
                    equality_callbacks,
                    callback_count,
                    gradient_callbacks,
                    jacobian_callbacks,
                )
            )
            or gradient_callbacks != 0
            or jacobian_callbacks != 0
        ):
            raise StopExecution("backend_failure", "invalid_nlopt_counters")
    except StopExecution:
        raise
    except Exception:
        raise StopExecution("backend_failure", "invalid_nlopt_runtime_result") from None

    if backend_converged:
        status = "converged"
    elif backend_status in ("maximum_evaluations", "maximum_callbacks"):
        status = "maximum_evaluations"
    elif backend_status in ("maximum_time", "maximum_elapsed_time"):
        status = "maximum_elapsed_time"
    elif backend_status == "cancelled":
        status = "cancelled"
    elif backend_status == "roundoff_limited":
        status = "stagnation"
    else:
        status = "backend_failure"

    objective: float | None = None
    if value is not None:
        # Recompute at the public boundary. The backend objective and positive
        # termination status are execution evidence, never validation.
        objective = _objective(execution, value)
    payload: dict[str, Any] = {
        "backend_status": backend_status,
        "backend_status_code": backend_status_code,
        "backend_evaluations": backend_evaluations,
        "backend_objective_callbacks": objective_callbacks,
        "backend_inequality_callbacks": inequality_callbacks,
        "backend_equality_callbacks": equality_callbacks,
        "backend_callback_count": callback_count,
        "backend_derivative_callbacks": 0,
        "backend_iterations_available": False,
        "backend_evaluation_budget": backend_evaluation_budget,
        "method_identity": returned_method,
        "backend_identity": returned_backend,
    }
    return value, objective, 0, status, payload


def solve_minimize_problem(
    problem: NumericalProblem,
    *,
    method: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> OptimizationResult:
    """Plan, minimize, independently validate, and package the computation."""
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
    if problem.derivative is None and selected_plan.method in (
        "bfgs",
        "projected-bfgs",
    ):
        diagnostics.append(NumericalDiagnostic("finite_difference_derivative"))
    value: list[float] | None = None
    objective: float | None = None
    iterations = 0
    status = "backend_failure"
    reason: str | None = None
    payload: dict[str, Any] = {}
    try:
        if selected_plan.method in ("nlopt-nelder-mead", "nlopt-cobyla"):
            value, objective, iterations, status, result_payload = _nlopt_minimize(
                execution, selected_plan.method, payload
            )
            payload.update(result_payload)
        elif selected_plan.method == "nelder-mead":
            value, objective, iterations, status, payload = _nelder_mead(execution)
        else:
            value, objective, iterations, status, payload = _bfgs(
                execution, selected_plan.method == "projected-bfgs"
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
        problem, value, execution, status, executed_method=selected_plan.method
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


def minimize(
    function: Callable[[list[float]], Any],
    x0: Sequence[float],
    **options: Any,
) -> OptimizationResult:
    """Minimize a multivariate objective with an exactly named local method."""
    cancel = options.pop("cancel", None)
    problem = minimize_problem(function, x0, **options)
    return solve_minimize_problem(problem, cancel=cancel)
