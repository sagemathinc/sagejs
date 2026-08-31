"""Shared storage, budget, validation, and result helpers for spectral methods."""

# Cross-module uses of these private helpers are intentional.
# pyright: reportUnusedFunction=false

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

_EPSILON = 2.220446049250313e-16
_PLATFORMS = [
    "browser",
    "node",
    "sea",
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
]


class _BudgetStop(Exception):
    """Internal structured stop at a resource or cancellation boundary."""

    def __init__(self, status: str) -> None:
        super().__init__(status)
        self.status = status


class _Execution:
    """Hard elapsed/iteration/evaluation checks shared by dynamic algorithms."""

    def __init__(
        self,
        problem: NumericalProblem,
        trace: NumericalTrace,
        cancel: Callable[[], bool] | None,
    ) -> None:
        self.problem = problem
        self.trace = trace
        self.cancel = cancel
        self.started = time.perf_counter()
        self.iterations = 0
        self.evaluations = 0

    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self.started) * 1000.0

    def check(self) -> None:
        if self.cancel is not None and self.cancel():
            raise _BudgetStop("cancelled")
        if self.elapsed_ms() > self.problem.resource_budget.max_elapsed_ms:
            raise _BudgetStop("maximum_evaluations")

    def iteration(self) -> int:
        self.check()
        if self.iterations >= self.problem.resource_budget.max_iterations:
            raise _BudgetStop("maximum_iterations")
        self.iterations += 1
        return self.iterations

    def evaluation(self) -> int:
        self.check()
        if self.evaluations >= self.problem.resource_budget.max_evaluations:
            raise _BudgetStop("maximum_evaluations")
        self.evaluations += 1
        return self.evaluations


def _number(value: Any, path: str) -> complex:
    try:
        answer = complex(value)
    except (TypeError, ValueError, OverflowError):
        raise TypeError(path + " must contain numeric scalars") from None
    if not math.isfinite(answer.real) or not math.isfinite(answer.imag):
        raise ValueError(path + " must contain only finite scalars")
    return answer


def _vector(values: Sequence[Any], path: str = "vector") -> list[complex]:
    if isinstance(values, (str, bytes, bytearray)):
        raise TypeError(path + " must be a finite numeric sequence")
    return [
        _number(values[index], path + "[" + str(index) + "]")
        for index in range(len(values))
    ]


def _matrix(
    values: Sequence[Sequence[Any]],
    *,
    square: bool = False,
    nonempty: bool = True,
    path: str = "matrix",
) -> list[list[complex]]:
    if isinstance(values, (str, bytes, bytearray)):
        raise TypeError(path + " must be a rectangular numeric sequence")
    rows = len(values)
    if nonempty and rows == 0:
        raise ValueError(path + " must not be empty")
    columns: int | None = None
    answer: list[list[complex]] = []
    for row_index in range(rows):
        row = values[row_index]
        if isinstance(row, (str, bytes, bytearray)):
            raise TypeError(path + " rows must be numeric sequences")
        if columns is None:
            columns = len(row)
            if nonempty and columns == 0:
                raise ValueError(path + " must not have empty rows")
        elif len(row) != columns:
            raise ValueError(path + " must be rectangular")
        answer.append(_vector(row, path + "[" + str(row_index) + "]"))
    if square and rows != (0 if columns is None else columns):
        raise ValueError(path + " must be square")
    return answer


def _json_number(value: complex | float | int) -> float | list[float]:
    number = complex(value)
    real = float(number.real)
    imaginary = float(number.imag)
    if abs(imaginary) <= 8.0 * _EPSILON * max(1.0, abs(real)):
        return real
    return [real, imaginary]


def _json_vector(values: Sequence[complex | float | int]) -> list[Any]:
    return [_json_number(value) for value in values]


def _json_matrix(values: Sequence[Sequence[complex | float | int]]) -> list[list[Any]]:
    return [_json_vector(row) for row in values]


def _conjugate(value: complex) -> complex:
    """Return a conjugate without relying on a scalar host method."""
    return complex(value.real, -value.imag)


def _conjugate_transpose(matrix: Sequence[Sequence[complex]]) -> list[list[complex]]:
    if not matrix:
        return []
    return [
        [_conjugate(matrix[row][column]) for row in range(len(matrix))]
        for column in range(len(matrix[0]))
    ]


def _identity(size: int) -> list[list[complex]]:
    return [
        [1.0 + 0.0j if row == column else 0.0 + 0.0j for column in range(size)]
        for row in range(size)
    ]


def _matmul(
    left: Sequence[Sequence[complex]], right: Sequence[Sequence[complex]]
) -> list[list[complex]]:
    rows = len(left)
    inner = len(right)
    columns = len(right[0]) if inner else 0
    answer = [[0.0 + 0.0j for _ in range(columns)] for _ in range(rows)]
    for row in range(rows):
        for index in range(inner):
            coefficient = left[row][index]
            if coefficient == 0:
                continue
            for column in range(columns):
                answer[row][column] += coefficient * right[index][column]
    return answer


def _matvec(
    matrix: Sequence[Sequence[complex]], vector: Sequence[complex]
) -> list[complex]:
    return [
        sum(
            (matrix[row][column] * vector[column] for column in range(len(vector))),
            0.0 + 0.0j,
        )
        for row in range(len(matrix))
    ]


def _dot(left: Sequence[complex], right: Sequence[complex]) -> complex:
    return sum(
        (_conjugate(left[index]) * right[index] for index in range(len(left))),
        0.0 + 0.0j,
    )


def _norm(values: Sequence[complex]) -> float:
    return math.sqrt(sum(abs(value) * abs(value) for value in values))


def _frobenius(matrix: Sequence[Sequence[complex]]) -> float:
    return math.sqrt(sum(abs(value) * abs(value) for row in matrix for value in row))


def _matrix_difference_norm(
    left: Sequence[Sequence[complex]], right: Sequence[Sequence[complex]]
) -> float:
    return math.sqrt(
        sum(
            abs(left[row][column] - right[row][column]) ** 2
            for row in range(len(left))
            for column in range(len(left[row]))
        )
    )


def _orthogonality_error(columns: Sequence[Sequence[complex]]) -> float:
    count = len(columns)
    if count == 0:
        return 0.0
    return math.sqrt(
        sum(
            abs(_dot(columns[left], columns[right]) - (1.0 if left == right else 0.0))
            ** 2
            for left in range(count)
            for right in range(count)
        )
    )


def _columns(matrix: Sequence[Sequence[complex]]) -> list[list[complex]]:
    if not matrix:
        return []
    return [
        [matrix[row][column] for row in range(len(matrix))]
        for column in range(len(matrix[0]))
    ]


def _from_columns(columns: Sequence[Sequence[complex]]) -> list[list[complex]]:
    if not columns:
        return []
    return [
        [columns[column][row] for column in range(len(columns))]
        for row in range(len(columns[0]))
    ]


def _normalize(vector: Sequence[complex]) -> list[complex]:
    length = _norm(vector)
    if length == 0.0:
        return [complex(value) for value in vector]
    answer = [value / length for value in vector]
    for value in answer:
        if abs(value) > 64.0 * _EPSILON:
            phase = value / abs(value)
            answer = [item / phase for item in answer]
            break
    return answer


def _problem(
    operation: str,
    *,
    initial_data: Mapping[str, Any],
    method: str,
    max_iterations: int,
    max_evaluations: int,
    max_elapsed_ms: int,
    trace: str,
    max_trace_events: int,
    max_trace_bytes: int,
    metadata: Mapping[str, Any] | None = None,
) -> NumericalProblem:
    budget = ResourceBudget(
        max_iterations=max_iterations,
        max_evaluations=max_evaluations,
        max_elapsed_ms=max_elapsed_ms,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )
    return NumericalProblem(
        "spectral",
        operation,
        numeric_type="complex_binary64",
        initial_data=initial_data,
        method=method,
        resource_budget=budget,
        trace_policy=TracePolicy(
            trace, max_events=max_trace_events, max_bytes=max_trace_bytes
        ),
        source_intent={"language": "python", "classification": "extension"},
        metadata=metadata,
    )


def _plan(
    problem: NumericalProblem,
    *,
    method: str,
    classification: str,
    validation: Sequence[str],
    reason: str,
    requires: Sequence[str] = (),
) -> NumericalPlan:
    capability = {
        "classification": classification,
        "backend": "ordinary-python",
        "numeric_types": ["binary64", "complex_binary64"],
        "requires": list(requires),
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": list(validation),
        "platforms": list(_PLATFORMS),
    }
    return NumericalPlan(
        problem,
        method=method,
        backend="ordinary-python",
        reason=reason,
        capability=capability,
        fallback={"kind": "same-source", "backend": "ordinary-python"},
        expected_resources={
            "max_iterations": problem.resource_budget.max_iterations,
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
    )


def _diagnostic_for_status(status: str) -> NumericalDiagnostic | None:
    if status in (
        "cancelled",
        "maximum_iterations",
        "maximum_evaluations",
        "stagnation",
        "validation_failed",
    ):
        return NumericalDiagnostic(status)
    if status == "backend_failure":
        return NumericalDiagnostic(
            "validation_failed",
            details={"solver_status": "backend_failure"},
        )
    return None


def _finish_result(
    problem: NumericalProblem,
    plan: NumericalPlan,
    execution: _Execution,
    *,
    status: str,
    value: Any,
    validation: NumericalValidation,
    trace: NumericalTrace,
    diagnostics: Sequence[NumericalDiagnostic] = (),
    domain_payload: Mapping[str, Any] | None = None,
    measurements: Mapping[str, Any] | None = None,
) -> NumericalResult:
    all_diagnostics = list(diagnostics)
    status_diagnostic = _diagnostic_for_status(status)
    if status_diagnostic is not None and all(
        diagnostic.code != status_diagnostic.code for diagnostic in all_diagnostics
    ):
        all_diagnostics.append(status_diagnostic)
    if status == "converged" and not validation.passed:
        status = "validation_failed"
        all_diagnostics.append(NumericalDiagnostic("validation_failed"))
    success = status == "converged" and validation.passed
    trace.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=[
            diagnostic
            for diagnostic in all_diagnostics
            if diagnostic.to_dict()["phase"] == "validation"
        ],
        important=True,
        force=True,
    )
    trace.append(
        "finish" if success else "failure",
        iteration=execution.iterations,
        evaluation=execution.evaluations,
        data={"status": status, "success": success},
        diagnostics=all_diagnostics,
        important=True,
        force=True,
    )
    payload = {} if domain_payload is None else dict(domain_payload)
    capability = plan.to_dict()["capability"]
    if not isinstance(capability, dict) or not isinstance(
        capability.get("classification"), str
    ):
        raise TypeError("spectral plan has no classification")
    payload["classification"] = capability["classification"]
    return NumericalResult(
        problem,
        plan,
        success=success,
        status=status,
        value=value,
        validation=validation,
        diagnostics=all_diagnostics,
        iterations=execution.iterations,
        evaluations=execution.evaluations,
        elapsed_ms=execution.elapsed_ms(),
        trace=trace,
        measurements=measurements,
        provenance={
            "implementation": "sagejs.numerics.spectral",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
            "solver_status": status,
            "classification": payload["classification"],
        },
        domain_payload=payload,
    )


def _empty_validation(check: str = "result_available") -> NumericalValidation:
    return NumericalValidation(
        "indeterminate", False, checks=[{"kind": check, "passed": False}]
    )
