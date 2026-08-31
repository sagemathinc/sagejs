"""Shared portable machinery for numerical optimization algorithms."""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import (
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from ..trace import NumericalTrace, TracePolicy

_MACHINE_EPSILON = 2.220446049250313e-16
_FINITE_DIFFERENCE_STEP = _MACHINE_EPSILON ** (1.0 / 3.0)
MAX_DENSE_DIMENSION = 128
MAX_RESIDUAL_DIMENSION = 16_384
MAX_DENSE_JACOBIAN_ELEMENTS = 262_144
MAX_FIT_OBSERVATIONS = 16_384


class StopExecution(Exception):
    """Internal resource or numerical stop with a stable public status."""

    def __init__(self, status: str, reason: str | None = None) -> None:
        self.status = status
        self.reason = status if reason is None else reason


class CallbackFailure(Exception):
    """Internal wrapper used to keep callback exceptions out of result JSON."""

    def __init__(self, error_type: str) -> None:
        self.error_type = error_type


class Execution:
    """One execution context with hard callback, time, and trace budgets."""

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
        self.counts: dict[str, int] = {
            "objective": 0,
            "gradient": 0,
            "residual": 0,
            "jacobian": 0,
            "validation": 0,
        }
        self.started = time.perf_counter()

    def elapsed_ms(self) -> float:
        return 1000.0 * (time.perf_counter() - self.started)

    def check(self) -> None:
        if self.cancel is not None:
            try:
                cancelled = bool(self.cancel())
            except Exception as error:
                raise CallbackFailure(type(error).__name__) from None
            if cancelled:
                raise StopExecution("cancelled", "explicit_cancellation")
        if self.elapsed_ms() > self.problem.resource_budget.max_elapsed_ms:
            raise StopExecution("maximum_elapsed_time", "elapsed_time_budget")

    def call(
        self,
        kind: str,
        callback: Callable[..., Any],
        argument: Any,
        *,
        iteration: int | None = None,
    ) -> Any:
        self.check()
        if self.evaluations >= self.problem.resource_budget.max_evaluations:
            raise StopExecution("maximum_evaluations")
        self.evaluations += 1
        self.counts[kind] = self.counts.get(kind, 0) + 1
        try:
            value = callback(argument)
        except Exception as error:
            self.trace.append(
                "failure",
                iteration=iteration,
                evaluation=self.evaluations,
                data={"callback_kind": kind, "error_type": type(error).__name__},
                diagnostics=[NumericalDiagnostic("callback_error")],
                important=True,
                force=True,
            )
            raise CallbackFailure(type(error).__name__) from None
        event_data: dict[str, Any] = {"callback_kind": kind}
        if isinstance(argument, (int, float)):
            event_data["argument"] = float(argument)
        elif isinstance(argument, Sequence) and len(argument) <= 16:
            event_data["argument"] = [float(item) for item in argument]
        self.trace.append(
            "evaluation",
            iteration=iteration,
            evaluation=self.evaluations,
            data=event_data,
        )
        return value


def vector(
    value: Any,
    expected: int | None = None,
    *,
    maximum: int | None = None,
) -> list[float]:
    """Convert a callback result to a finite binary64 vector."""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise StopExecution("invalid_problem", "callback_result_is_not_a_vector")
    length = len(value)
    if expected is not None and length != expected:
        raise StopExecution("invalid_problem", "callback_result_dimension")
    if maximum is not None and length > maximum:
        raise StopExecution(
            "invalid_problem", "callback_result_exceeds_dimension_limit"
        )
    try:
        answer = [float(item) for item in value]
    except (TypeError, ValueError, OverflowError):
        raise StopExecution(
            "invalid_problem", "callback_result_contains_non_numeric_value"
        ) from None
    if len(answer) == 0:
        raise StopExecution("invalid_problem", "empty_callback_result")
    for item in answer:
        if not math.isfinite(item):
            raise StopExecution("nonfinite_evaluation")
    return answer


def matrix(value: Any, rows: int, columns: int) -> list[list[float]]:
    """Convert a callback result to a finite rectangular binary64 matrix."""
    check_dense_jacobian_shape(rows, columns)
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise StopExecution("invalid_problem", "callback_result_is_not_a_matrix")
    if len(value) != rows:
        raise StopExecution("invalid_problem", "callback_result_dimension")
    answer: list[list[float]] = []
    for row in value:
        answer.append(vector(row, columns))
    return answer


def scalar(value: Any) -> float:
    """Convert a callback result to a finite binary64 scalar."""
    try:
        answer = float(value)
    except (TypeError, ValueError, OverflowError):
        raise StopExecution(
            "invalid_problem", "callback_result_is_not_a_scalar"
        ) from None
    if not math.isfinite(answer):
        raise StopExecution("nonfinite_evaluation")
    return answer


def dot(left: Sequence[float], right: Sequence[float]) -> float:
    answer = 0.0
    for index in range(len(left)):
        answer += left[index] * right[index]
    return answer


def infinity_norm(values: Sequence[float]) -> float:
    answer = 0.0
    for value in values:
        answer = max(answer, abs(value))
    return answer


def squared_norm(values: Sequence[float]) -> float:
    return dot(values, values)


def identity(size: int) -> list[list[float]]:
    return [
        [1.0 if row == column else 0.0 for column in range(size)] for row in range(size)
    ]


def maximum_residual_dimension(parameter_dimension: int) -> int:
    """Return the hard residual ceiling for a dense Jacobian workspace."""
    if parameter_dimension <= 0:
        raise ValueError("parameter dimension must be positive")
    return min(
        MAX_RESIDUAL_DIMENSION,
        MAX_DENSE_JACOBIAN_ELEMENTS // parameter_dimension,
    )


def check_dense_jacobian_shape(rows: int, columns: int) -> None:
    """Reject dense Jacobian shapes outside the portable allocation envelope."""
    if rows <= 0 or columns <= 0:
        raise StopExecution("invalid_problem", "empty_jacobian")
    if rows > MAX_RESIDUAL_DIMENSION:
        raise StopExecution("invalid_problem", "residual_dimension_limit")
    if rows > MAX_DENSE_JACOBIAN_ELEMENTS // columns:
        raise StopExecution("invalid_problem", "dense_jacobian_allocation_limit")


def solve_linear_system(
    coefficients: Sequence[Sequence[float]], right_hand_side: Sequence[float]
) -> list[float] | None:
    """Solve a dense system by scaled partial-pivot Gaussian elimination."""
    size = len(right_hand_side)
    if len(coefficients) != size:
        return None
    augmented: list[list[float]] = []
    scale: list[float] = []
    for row_index in range(size):
        if len(coefficients[row_index]) != size:
            return None
        row = [float(value) for value in coefficients[row_index]]
        row.append(float(right_hand_side[row_index]))
        augmented.append(row)
        row_scale = max([abs(value) for value in row[:-1]] + [0.0])
        scale.append(row_scale)
    for column in range(size):
        pivot = column
        pivot_ratio = -1.0
        for row in range(column, size):
            ratio = (
                abs(augmented[row][column]) / scale[row] if scale[row] > 0.0 else 0.0
            )
            if ratio > pivot_ratio:
                pivot = row
                pivot_ratio = ratio
        pivot_value = abs(augmented[pivot][column])
        if scale[pivot] == 0.0 or pivot_value <= 64.0 * _MACHINE_EPSILON * scale[pivot]:
            return None
        if pivot != column:
            augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
            scale[column], scale[pivot] = scale[pivot], scale[column]
        diagonal = augmented[column][column]
        for row in range(column + 1, size):
            factor = augmented[row][column] / diagonal
            augmented[row][column] = 0.0
            for entry in range(column + 1, size + 1):
                augmented[row][entry] -= factor * augmented[column][entry]
    answer = [0.0 for _ in range(size)]
    for row in range(size - 1, -1, -1):
        value = augmented[row][size]
        for column in range(row + 1, size):
            value -= augmented[row][column] * answer[column]
        answer[row] = value / augmented[row][row]
        if not math.isfinite(answer[row]):
            return None
    return answer


def inverse_matrix(
    coefficients: Sequence[Sequence[float]],
) -> list[list[float]] | None:
    """Invert a dense square matrix by scaled, pivoted Gauss-Jordan elimination."""
    size = len(coefficients)
    if size == 0:
        return None
    augmented: list[list[float]] = []
    scales: list[float] = []
    for row_index in range(size):
        if len(coefficients[row_index]) != size:
            return None
        row = [float(value) for value in coefficients[row_index]]
        if any(not math.isfinite(value) for value in row):
            return None
        scale = max([abs(value) for value in row] + [0.0])
        scales.append(scale)
        row.extend(1.0 if row_index == column else 0.0 for column in range(size))
        augmented.append(row)
    for column in range(size):
        pivot = column
        pivot_ratio = -1.0
        for row in range(column, size):
            scale = scales[row]
            ratio = abs(augmented[row][column]) / scale if scale > 0.0 else 0.0
            if ratio > pivot_ratio:
                pivot = row
                pivot_ratio = ratio
        pivot_value = abs(augmented[pivot][column])
        pivot_scale = scales[pivot]
        if pivot_scale == 0.0 or pivot_value <= 64.0 * _MACHINE_EPSILON * pivot_scale:
            return None
        if pivot != column:
            augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
            scales[column], scales[pivot] = scales[pivot], scales[column]
        diagonal = augmented[column][column]
        for entry in range(2 * size):
            augmented[column][entry] /= diagonal
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            if factor == 0.0:
                continue
            augmented[row][column] = 0.0
            for entry in range(column + 1, 2 * size):
                augmented[row][entry] -= factor * augmented[column][entry]
    answer = [row[size:] for row in augmented]
    if any(not math.isfinite(value) for row in answer for value in row):
        return None
    return answer


def matrix_condition_1(
    coefficients: Sequence[Sequence[float]], inverse: Sequence[Sequence[float]]
) -> float:
    """Return the induced one-norm condition estimate from an explicit inverse."""
    size = len(coefficients)
    coefficient_norm = max(
        sum(abs(float(coefficients[row][column])) for row in range(size))
        for column in range(size)
    )
    inverse_norm = max(
        sum(abs(float(inverse[row][column])) for row in range(size))
        for column in range(size)
    )
    return coefficient_norm * inverse_norm


def normal_equations(
    jacobian: Sequence[Sequence[float]], residual: Sequence[float]
) -> tuple[list[list[float]], list[float]]:
    rows = len(jacobian)
    columns = len(jacobian[0]) if rows else 0
    normal = [[0.0 for _ in range(columns)] for _ in range(columns)]
    gradient = [0.0 for _ in range(columns)]
    for row in range(rows):
        for left in range(columns):
            gradient[left] += jacobian[row][left] * residual[row]
            for right in range(left, columns):
                normal[left][right] += jacobian[row][left] * jacobian[row][right]
    for left in range(columns):
        for right in range(left):
            normal[left][right] = normal[right][left]
    return normal, gradient


def normalized_bounds(
    bounds: Sequence[Sequence[float | None] | None] | None, dimension: int
) -> tuple[list[float | None], list[float | None]]:
    if bounds is None:
        return [None for _ in range(dimension)], [None for _ in range(dimension)]
    if len(bounds) != dimension:
        raise ValueError("bounds must contain one pair per variable")
    lower: list[float | None] = []
    upper: list[float | None] = []
    for item in bounds:
        if item is None:
            low = None
            high = None
        else:
            if len(item) != 2:
                raise ValueError("each bound must contain lower and upper values")
            low = None if item[0] is None else float(item[0])
            high = None if item[1] is None else float(item[1])
        if low is not None and not math.isfinite(low):
            raise ValueError("finite lower bounds or None are required")
        if high is not None and not math.isfinite(high):
            raise ValueError("finite upper bounds or None are required")
        if low is not None and high is not None and low > high:
            raise ValueError("a lower bound exceeds its upper bound")
        lower.append(low)
        upper.append(high)
    return lower, upper


def project(
    point: Sequence[float],
    lower: Sequence[float | None],
    upper: Sequence[float | None],
) -> list[float]:
    answer: list[float] = []
    for index in range(len(point)):
        value = float(point[index])
        lower_value = lower[index]
        upper_value = upper[index]
        if lower_value is not None:
            value = max(value, float(lower_value))
        if upper_value is not None:
            value = min(value, float(upper_value))
        answer.append(value)
    return answer


def projected_gradient(
    point: Sequence[float],
    gradient: Sequence[float],
    lower: Sequence[float | None],
    upper: Sequence[float | None],
) -> list[float]:
    projected = project(
        [point[index] - gradient[index] for index in range(len(point))],
        lower,
        upper,
    )
    return [point[index] - projected[index] for index in range(len(point))]


def finite_difference_gradient(
    execution: Execution,
    function: Callable[..., Any],
    point: Sequence[float],
    lower: Sequence[float | None],
    upper: Sequence[float | None],
    *,
    iteration: int | None = None,
    callback_kind: str = "objective",
) -> list[float]:
    """Estimate a scalar gradient with bound-aware independent differences."""
    answer: list[float] = []
    for index in range(len(point)):
        step = _FINITE_DIFFERENCE_STEP * max(1.0, abs(point[index]))
        left = list(point)
        right = list(point)
        lower_value = lower[index]
        upper_value = upper[index]
        can_left = lower_value is None or point[index] - step >= float(lower_value)
        can_right = upper_value is None or point[index] + step <= float(upper_value)
        if can_left and can_right:
            left[index] -= step
            right[index] += step
            left_value = scalar(
                execution.call(callback_kind, function, left, iteration=iteration)
            )
            right_value = scalar(
                execution.call(callback_kind, function, right, iteration=iteration)
            )
            answer.append((right_value - left_value) / (2.0 * step))
        elif can_right:
            right[index] += step
            base_value = scalar(
                execution.call(
                    callback_kind, function, list(point), iteration=iteration
                )
            )
            right_value = scalar(
                execution.call(callback_kind, function, right, iteration=iteration)
            )
            answer.append((right_value - base_value) / step)
        elif can_left:
            left[index] -= step
            left_value = scalar(
                execution.call(callback_kind, function, left, iteration=iteration)
            )
            base_value = scalar(
                execution.call(
                    callback_kind, function, list(point), iteration=iteration
                )
            )
            answer.append((base_value - left_value) / step)
        else:
            answer.append(0.0)
    return answer


def finite_difference_jacobian(
    execution: Execution,
    function: Callable[..., Any],
    point: Sequence[float],
    output_dimension: int,
    *,
    iteration: int | None = None,
    callback_kind: str = "residual",
) -> list[list[float]]:
    """Estimate a dense Jacobian with central finite differences."""
    check_dense_jacobian_shape(output_dimension, len(point))
    columns: list[list[float]] = []
    for index in range(len(point)):
        step = _FINITE_DIFFERENCE_STEP * max(1.0, abs(point[index]))
        left = list(point)
        right = list(point)
        left[index] -= step
        right[index] += step
        left_value = vector(
            execution.call(callback_kind, function, left, iteration=iteration),
            output_dimension,
        )
        right_value = vector(
            execution.call(callback_kind, function, right, iteration=iteration),
            output_dimension,
        )
        columns.append(
            [
                (right_value[row] - left_value[row]) / (2.0 * step)
                for row in range(output_dimension)
            ]
        )
    return [
        [columns[column][row] for column in range(len(point))]
        for row in range(output_dimension)
    ]


def problem_record(
    domain: str,
    operation: str,
    function: Callable[..., Any],
    derivative: Callable[..., Any] | None,
    *,
    dimension: int,
    initial_data: Mapping[str, Any],
    bounds: Mapping[str, Any],
    tolerances: Mapping[str, Any],
    method: str,
    max_iterations: int,
    max_evaluations: int,
    max_elapsed_ms: int,
    trace_level: str,
    max_trace_events: int,
    max_trace_bytes: int,
    expression: str | None = None,
    source_language: str = "python",
    metadata: Mapping[str, Any] | None = None,
) -> NumericalProblem:
    if dimension <= 0 or dimension > MAX_DENSE_DIMENSION:
        raise ValueError(
            "dense numerical optimization dimension must be between 1 and "
            + str(MAX_DENSE_DIMENSION)
        )
    budget = ResourceBudget(
        max_iterations=max_iterations,
        max_evaluations=max_evaluations,
        max_elapsed_ms=max_elapsed_ms,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )
    replayable = expression is not None
    function_record: dict[str, Any] = {
        "kind": "expression" if replayable else "opaque_callback",
        "replayable": replayable,
    }
    if expression is not None:
        function_record["expression"] = expression
    return NumericalProblem(
        domain,
        operation,
        function=function,
        derivative=derivative,
        function_record=function_record,
        variables=[{"name": "x", "shape": [dimension]}],
        initial_data=initial_data,
        bounds=bounds,
        tolerances=tolerances,
        method=method,
        derivative_record={
            "kind": "explicit_callback" if derivative is not None else "none",
            "replayable": False,
        },
        resource_budget=budget,
        trace_policy=TracePolicy(
            trace_level, max_events=max_trace_events, max_bytes=max_trace_bytes
        ),
        source_intent={"language": source_language},
        metadata=metadata,
    )


class OptimizationResult(NumericalResult):
    """Numerical result with optimization-specific evidence and views."""

    def __init__(
        self,
        problem: NumericalProblem,
        plan: NumericalPlan,
        *,
        success: bool,
        status: str,
        value: Any,
        validation: NumericalValidation,
        diagnostics: Sequence[NumericalDiagnostic],
        iterations: int,
        evaluations: int,
        elapsed_ms: float,
        trace: NumericalTrace,
        measurements: Mapping[str, Any],
        domain_payload: Mapping[str, Any],
    ) -> None:
        self._optimization_payload = dict(domain_payload)
        super().__init__(
            problem,
            plan,
            success=success,
            status=status,
            value=value,
            validation=validation,
            diagnostics=diagnostics,
            iterations=iterations,
            evaluations=evaluations,
            elapsed_ms=elapsed_ms,
            trace=trace,
            measurements=measurements,
            provenance={
                "implementation": "sagejs.numerics.optimization",
                "implementation_kind": "ordinary_python",
                "source_transparent": True,
                "solver_status": status,
            },
            domain_payload=domain_payload,
        )

    @property
    def domain_payload(self) -> dict[str, Any]:
        return dict(self._optimization_payload)

    @property
    def objective(self) -> float | None:
        value = self._optimization_payload.get("objective")
        return float(value) if isinstance(value, (int, float)) else None

    def explain(self) -> str:
        validation = self.validation.to_dict()
        lines = [
            self.method + " " + self.problem.operation.replace("_", " "),
            "status: " + self.status,
            "backend: " + self.backend,
            "validation: "
            + self.validation.truth_level
            + ("; passed" if self.validation.passed else "; not passed"),
            "iterations/evaluations: "
            + str(self.iterations)
            + "/"
            + str(self.evaluations),
        ]
        if self.objective is not None:
            lines.append("objective: " + str(self.objective))
        if self.residual is not None:
            lines.append("validation residual: " + str(self.residual))
        checks = validation.get("checks", [])
        if isinstance(checks, list):
            for check in checks:
                if isinstance(check, dict) and "kind" in check:
                    lines.append(
                        "check "
                        + str(check["kind"])
                        + ": "
                        + ("passed" if check.get("passed") is True else "failed")
                    )
        if self.trace.truncated:
            lines.append("trace: truncated to its configured budget")
        return "\n".join(lines)

    def verify(self, method: str = "independent") -> Any:
        if method != "independent":
            raise ValueError("optimization verification method must be independent")
        from .validation import validate_result

        return validate_result(self)

    def plot(self) -> Any:
        from .visualization import optimization_plot

        return optimization_plot(self)

    def to_plot_spec(self) -> Any:
        return self.plot()

    def animate(self) -> Any:
        from .visualization import optimization_animation

        return optimization_animation(self)


def status_diagnostic(
    status: str, reason: str | None = None
) -> NumericalDiagnostic | None:
    code = {
        "maximum_iterations": "maximum_iterations",
        "maximum_evaluations": "maximum_evaluations",
        "maximum_elapsed_time": "maximum_elapsed_time",
        "cancelled": "cancelled",
        "callback_error": "callback_error",
        "nonfinite_evaluation": "nonfinite_evaluation",
        "stagnation": "stagnation",
        "zero_derivative": "zero_derivative",
    }.get(status)
    if code is None:
        return None
    details: dict[str, Any] = {}
    if reason is not None:
        details["reason"] = reason
    return NumericalDiagnostic(code, details=details)


def record_progress(
    execution: Execution,
    iteration: int,
    *,
    accepted: bool,
    data: Mapping[str, Any],
    important: bool = False,
) -> None:
    """Record full iteration traces or logarithmically sampled summary progress."""
    level = execution.trace.policy.level
    if level == "none":
        return
    if level == "summary":
        sampled = iteration <= 4 or (iteration > 0 and iteration & (iteration - 1) == 0)
        if not sampled and not important:
            return
        kind = "phase"
    else:
        kind = "iteration"
    execution.trace.append(
        kind,
        iteration=iteration,
        accepted=accepted,
        data=data,
        important=important,
    )
