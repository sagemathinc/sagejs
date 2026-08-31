"""Structured numerical-linear-algebra operations and result contracts."""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Iterable, Sequence
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
from .diagnostics import (
    SingularValueDiagnostics,
    is_ill_conditioned,
    singular_value_diagnostics,
)
from .factorizations import (
    MACHINE_EPSILON,
    LinearAlgebraError,
    QRFactorization,
    cholesky_factorize,
    lu_factorize,
    qr_factorize,
)
from .storage import (
    DenseMatrix,
    DenseVector,
    as_matrix,
    as_right_hand_side,
    restore_right_hand_side,
)
from .validation import (
    independent_residual,
    normwise_backward_error,
    validate_cholesky,
    validate_inverse,
    validate_least_squares,
    validate_lu,
    validate_qr,
    validate_solve,
)

MatrixInput = DenseMatrix | Sequence[Sequence[Any]]
RightInput = DenseVector | DenseMatrix | Sequence[Any] | Sequence[Sequence[Any]]


class LinearAlgebraResult(NumericalResult):
    """A shared numerical result with a classified domain failure code."""

    def __init__(
        self,
        *args: Any,
        failure_code: str | None = None,
        factorization: Any = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._failure_code = failure_code
        self._factorization = factorization

    @property
    def failure_code(self) -> str | None:
        return self._failure_code

    @property
    def factorization(self) -> Any:
        if self._factorization is None:
            raise AttributeError("this result does not contain a factorization")
        return self._factorization

    def explanation(self) -> dict[str, Any]:
        """Return the domain-owned structured pedagogical explanation."""
        from .visualization import linear_algebra_explanation

        return linear_algebra_explanation(self)

    def explain(self) -> str:
        """Return an accessible natural-language linear-algebra explanation."""
        from .visualization import describe_linear_algebra

        return describe_linear_algebra(self)

    def plot(self, view: str = "auto") -> Any:
        """Return an accessible static PlotSpec of retained result evidence."""
        from .visualization import linear_algebra_plot

        return linear_algebra_plot(self, view=view)

    def animate(self, view: str = "auto", *, max_frames: int = 64) -> Any:
        """Return a bounded PlotAnimation of retained semantic trace events."""
        from .visualization import linear_algebra_animation

        return linear_algebra_animation(self, view=view, max_frames=max_frames)


class _Cancelled(Exception):
    pass


def _finite_intermediate(
    value: float,
    message: str,
    *,
    details: dict[str, Any] | None = None,
) -> float:
    if not math.isfinite(value):
        raise LinearAlgebraError("nonfinite_intermediate", message, details=details)
    return value


def _finite_sum(
    values: Iterable[float],
    message: str,
    *,
    details: dict[str, Any] | None = None,
) -> float:
    try:
        value = math.fsum(values)
    except (OverflowError, ValueError):
        raise LinearAlgebraError(
            "nonfinite_intermediate", message, details=details
        ) from None
    return _finite_intermediate(value, message, details=details)


def _problem(
    operation: str,
    matrix: DenseMatrix,
    *,
    right: DenseMatrix | None = None,
    method: str,
    trace: str,
    max_trace_events: int,
    max_trace_bytes: int,
    max_iterations: int,
    max_elapsed_ms: int,
    tolerances: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> NumericalProblem:
    variables: list[dict[str, Any]] = [
        {"name": "A", "shape": [matrix.nrows, matrix.ncols]}
    ]
    initial_data: dict[str, Any] = {"matrix": matrix.to_dict()}
    if right is not None:
        variables.append({"name": "B", "shape": [right.nrows, right.ncols]})
        initial_data["right_side"] = right.to_dict()
    return NumericalProblem(
        "linear_algebra",
        operation,
        function_record={
            "kind": "dense_binary64_data",
            "replayable": True,
        },
        numeric_type="binary64",
        variables=variables,
        initial_data=initial_data,
        tolerances={} if tolerances is None else tolerances,
        method=method,
        resource_budget=ResourceBudget(
            max_iterations=max(1, max_iterations),
            max_evaluations=1,
            max_elapsed_ms=max_elapsed_ms,
            max_trace_events=max_trace_events,
            max_trace_bytes=max_trace_bytes,
        ),
        trace_policy=TracePolicy(
            trace, max_events=max_trace_events, max_bytes=max_trace_bytes
        ),
        source_intent={"language": "python", "source": "dense_binary64_data"},
        metadata={} if metadata is None else metadata,
    )


def _plan(problem: NumericalProblem, method: str, reason: str) -> NumericalPlan:
    problem_record: Any = problem.to_dict()
    shape = problem_record["variables"][0]["shape"]
    return NumericalPlan(
        problem,
        method=method,
        backend="ordinary-python",
        reason=reason,
        capability={
            "domain": "linear_algebra",
            "numeric_type": "binary64",
            "storage": "finite_immutable_row_major",
            "shape": shape,
            "source_transparent": True,
            "validated_platforms": ["linux-x64"],
            "additional_target_platforms": [
                "browser",
                "linux-arm64",
                "macos-arm64",
                "windows-x64",
            ],
        },
        fallback={
            "backend": "ordinary-python",
            "semantics": "same-source",
        },
        expected_resources={
            "time": "O(m*n*min(m,n))",
            "memory": "O(m*n)",
        },
    )


def _start_trace(problem: NumericalProblem, method: str) -> NumericalTrace:
    trace = NumericalTrace(problem.trace_policy)
    trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": method,
            "backend": "ordinary-python",
        },
        important=True,
        force=True,
    )
    return trace


def _factor_step_recorder(
    trace: NumericalTrace,
) -> Callable[[dict[str, Any]], None]:
    def record(data: dict[str, Any]) -> None:
        step = data.get("step")
        iteration = (
            step if isinstance(step, int) and not isinstance(step, bool) else None
        )
        accepted = bool(
            data.get(
                "usable_pivot",
                data.get("reflector_applied", data.get("positive_pivot", True)),
            )
        )
        trace.append(
            "iteration",
            iteration=iteration,
            accepted=accepted,
            data=data,
            important=iteration == 1,
        )

    return record


def _check_execution(
    problem: NumericalProblem,
    started: float,
    cancel: Callable[[], bool] | None,
) -> None:
    if cancel is not None:
        try:
            cancelled = bool(cancel())
        except Exception as error:
            raise LinearAlgebraError(
                "cancellation_callback_error",
                "the cancellation callback raised an exception",
                details={"exception_type": type(error).__name__},
            ) from None
        if cancelled:
            raise _Cancelled
    elapsed_ms = (time.monotonic() - started) * 1000.0
    if elapsed_ms > problem.resource_budget.max_elapsed_ms:
        raise LinearAlgebraError(
            "maximum_elapsed_time", "the elapsed-time resource budget was exhausted"
        )


def _failure_diagnostics(code: str) -> list[NumericalDiagnostic]:
    diagnostics: list[NumericalDiagnostic] = []
    if code == "maximum_elapsed_time":
        return [NumericalDiagnostic("maximum_elapsed_time")]
    if code == "rank_deficient":
        diagnostics.append(NumericalDiagnostic("ill_conditioned"))
    diagnostics.append(
        NumericalDiagnostic("validation_failed", details={"failure_code": code})
    )
    return diagnostics


def _failure_result(
    problem: NumericalProblem,
    plan: NumericalPlan,
    trace: NumericalTrace,
    started: float,
    code: str,
    *,
    details: dict[str, Any] | None = None,
    cancelled: bool = False,
) -> LinearAlgebraResult:
    diagnostics = (
        [NumericalDiagnostic("cancelled")] if cancelled else _failure_diagnostics(code)
    )
    validation = NumericalValidation(
        "indeterminate",
        False,
        checks=[
            {
                "kind": "operation_completed",
                "passed": False,
                "failure_code": code,
                "details": {} if details is None else details,
            }
        ],
    )
    trace.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    trace.append(
        "failure",
        data={"status": "cancelled" if cancelled else code, "success": False},
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    if cancelled:
        status = "cancelled"
    elif code == "maximum_elapsed_time":
        status = "maximum_elapsed_time"
    elif code in (
        "matrix_not_square",
        "dimension_mismatch",
        "not_symmetric",
        "not_positive_definite",
        "unsupported_method",
    ):
        status = "invalid_problem"
    else:
        status = "validation_failed"
    payload: dict[str, Any] = {"failure_code": code}
    if details is not None:
        payload["failure_details"] = details
    return LinearAlgebraResult(
        problem,
        plan,
        success=False,
        status=status,
        value=None,
        validation=validation,
        diagnostics=diagnostics,
        elapsed_ms=(time.monotonic() - started) * 1000.0,
        trace=trace,
        provenance={
            "implementation": "sagejs.numerics.linear_algebra",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
            "domain_failure_code": code,
        },
        domain_payload=payload,
        failure_code=code,
    )


def _factorization_result(
    problem: NumericalProblem,
    plan: NumericalPlan,
    trace: NumericalTrace,
    started: float,
    factorization: Any,
    validation: NumericalValidation,
    *,
    diagnostics: list[NumericalDiagnostic] | None = None,
) -> LinearAlgebraResult:
    result_diagnostics = [] if diagnostics is None else diagnostics
    if not validation.passed:
        result_diagnostics.append(NumericalDiagnostic("validation_failed"))
    success = validation.passed
    trace.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    trace.append(
        "finish" if success else "failure",
        data={"status": "converged" if success else "validation_failed"},
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    return LinearAlgebraResult(
        problem,
        plan,
        success=success,
        status="converged" if success else "validation_failed",
        value=factorization.to_dict(),
        validation=validation,
        diagnostics=result_diagnostics,
        elapsed_ms=(time.monotonic() - started) * 1000.0,
        trace=trace,
        provenance={
            "implementation": "sagejs.numerics.linear_algebra.factorizations",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
        },
        domain_payload={"factorization": factorization.to_dict()},
        factorization=factorization,
    )


def lu(
    matrix: MatrixInput,
    *,
    pivot_threshold: float | None = None,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    max_elapsed_ms: int = 30_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Compute and independently validate partial-pivot LU."""
    dense = as_matrix(matrix)
    problem = _problem(
        "lu_factorization",
        dense,
        method="partial_pivot_lu",
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_iterations=max(1, min(dense.shape)),
        max_elapsed_ms=max_elapsed_ms,
    )
    plan = _plan(problem, "partial_pivot_lu", "stable general dense factorization")
    record = _start_trace(problem, plan.method)
    started = time.monotonic()
    check = lambda: _check_execution(problem, started, cancel)
    try:
        factorization = lu_factorize(
            dense,
            pivot_threshold=pivot_threshold,
            check=check,
            on_step=_factor_step_recorder(record),
        )
        validation = validate_lu(dense, factorization, check=check)
    except _Cancelled:
        return _failure_result(
            problem, plan, record, started, "cancelled", cancelled=True
        )
    except LinearAlgebraError as error:
        return _failure_result(
            problem, plan, record, started, error.code, details=error.details
        )
    record.append(
        "phase",
        data={
            "kind": "factorization",
            "row_swaps": factorization.swaps,
            "diagonal_pivots": factorization.diagonal_pivots,
        },
        important=True,
    )
    return _factorization_result(
        problem, plan, record, started, factorization, validation
    )


def qr(
    matrix: MatrixInput,
    *,
    pivoted: bool = False,
    rank_tolerance: float | None = None,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    max_elapsed_ms: int = 30_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Compute and independently validate Householder QR."""
    dense = as_matrix(matrix)
    method = "column_pivoted_householder_qr" if pivoted else "householder_qr"
    problem = _problem(
        "qr_factorization",
        dense,
        method=method,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_iterations=max(1, min(dense.shape)),
        max_elapsed_ms=max_elapsed_ms,
        metadata={"pivoted": pivoted},
    )
    plan = _plan(problem, method, "stable orthogonal dense factorization")
    record = _start_trace(problem, plan.method)
    started = time.monotonic()
    check = lambda: _check_execution(problem, started, cancel)
    try:
        factorization = qr_factorize(
            dense,
            pivoted=pivoted,
            rank_tolerance=rank_tolerance,
            check=check,
            on_step=_factor_step_recorder(record),
        )
        validation = validate_qr(dense, factorization, check=check)
    except _Cancelled:
        return _failure_result(
            problem, plan, record, started, "cancelled", cancelled=True
        )
    except LinearAlgebraError as error:
        return _failure_result(
            problem, plan, record, started, error.code, details=error.details
        )
    record.append(
        "phase",
        data={
            "kind": "factorization",
            "pivoted": pivoted,
            "rank_estimate": factorization.rank_estimate,
        },
        important=True,
    )
    return _factorization_result(
        problem, plan, record, started, factorization, validation
    )


def cholesky(
    matrix: MatrixInput,
    *,
    symmetry_tolerance: float | None = None,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    max_elapsed_ms: int = 30_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Compute checked lower Cholesky or return a classified failure."""
    dense = as_matrix(matrix)
    problem = _problem(
        "cholesky_factorization",
        dense,
        method="cholesky",
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_iterations=max(1, dense.nrows),
        max_elapsed_ms=max_elapsed_ms,
    )
    plan = _plan(problem, "cholesky", "requested symmetric positive-definite path")
    record = _start_trace(problem, plan.method)
    started = time.monotonic()
    check = lambda: _check_execution(problem, started, cancel)
    try:
        factorization = cholesky_factorize(
            dense,
            symmetry_tolerance=symmetry_tolerance,
            check=check,
            on_step=_factor_step_recorder(record),
        )
        validation = validate_cholesky(dense, factorization, check=check)
    except _Cancelled:
        return _failure_result(
            problem, plan, record, started, "cancelled", cancelled=True
        )
    except LinearAlgebraError as error:
        return _failure_result(
            problem, plan, record, started, error.code, details=error.details
        )
    record.append(
        "phase", data={"kind": "factorization", "triangle": "lower"}, important=True
    )
    return _factorization_result(
        problem,
        plan,
        record,
        started,
        factorization,
        validation,
    )


def _spectral_diagnostics(
    matrix: DenseMatrix,
    trace: NumericalTrace,
    *,
    max_sweeps: int,
    check: Callable[[], None] | None = None,
) -> SingularValueDiagnostics:
    def on_sweep(sweep: int, correlation: float, converged: bool) -> None:
        if check is not None:
            check()
        trace.append(
            "iteration",
            iteration=sweep,
            accepted=True,
            data={
                "phase": "jacobi_singular_values",
                "largest_column_correlation": correlation,
                "converged": converged,
            },
        )

    return singular_value_diagnostics(
        matrix,
        max_sweeps=max_sweeps,
        on_sweep=on_sweep,
        check=check,
    )


def _condition_diagnostics(
    diagnostics: SingularValueDiagnostics,
    dimension: int,
) -> list[NumericalDiagnostic]:
    answer: list[NumericalDiagnostic] = []
    if dimension != 0 and is_ill_conditioned(diagnostics.condition):
        details: dict[str, Any] = {
            "rank": diagnostics.rank,
            "rank_threshold": diagnostics.threshold,
        }
        if diagnostics.condition is not None:
            details["condition_estimate"] = diagnostics.condition
        else:
            details["condition_kind"] = "infinite"
        answer.append(NumericalDiagnostic("ill_conditioned", details=details))
    return answer


def _select_solver(
    matrix: DenseMatrix,
    method: str,
    check: Callable[[], None],
    on_step: Callable[[dict[str, Any]], None],
) -> tuple[Any, Callable[[DenseMatrix], DenseMatrix]]:
    if method == "partial_pivot_lu":
        factorization = lu_factorize(matrix, check=check, on_step=on_step)
        return factorization, lambda right: factorization.solve(right, check=check)
    if method == "column_pivoted_householder_qr":
        factorization = qr_factorize(matrix, pivoted=True, check=check, on_step=on_step)
        return factorization, lambda right: factorization.solve_square(
            right, check=check
        )
    if method == "cholesky":
        factorization = cholesky_factorize(matrix, check=check, on_step=on_step)
        return factorization, lambda right: factorization.solve(right, check=check)
    raise LinearAlgebraError("unsupported_method", "unsupported direct-solve method")


def _refine_solution(
    matrix: DenseMatrix,
    right: DenseMatrix,
    solution: DenseMatrix,
    solve_correction: Callable[[DenseMatrix], DenseMatrix],
    trace: NumericalTrace,
    *,
    tolerance: float,
    max_refinement: int,
    check: Callable[[], None],
) -> tuple[DenseMatrix, int, float, float]:
    residual = independent_residual(matrix, solution, right, check=check)
    _, initial_error = normwise_backward_error(
        matrix, solution, right, residual=residual, check=check
    )
    current_error = initial_error
    attempts = 0
    for iteration in range(1, max_refinement + 1):
        if current_error <= tolerance:
            break
        check()
        correction = solve_correction(residual)
        candidate_entries: list[float] = []
        for index in range(len(solution.entries)):
            candidate_entries.append(
                _finite_intermediate(
                    solution.entries[index] + correction.entries[index],
                    "the refined solution is not representable in binary64",
                    details={"entry": index},
                )
            )
        candidate = DenseMatrix(solution.nrows, solution.ncols, candidate_entries)
        candidate_residual = independent_residual(matrix, candidate, right, check=check)
        _, candidate_error = normwise_backward_error(
            matrix, candidate, right, residual=candidate_residual, check=check
        )
        accepted = candidate_error < current_error
        attempts = iteration
        trace.append(
            "iteration",
            iteration=iteration,
            accepted=accepted,
            data={
                "phase": "iterative_refinement",
                "backward_error_before": current_error,
                "backward_error_after": candidate_error,
                "correction_infinity": correction.norm_infinity(),
            },
            important=not accepted,
        )
        if not accepted:
            break
        solution = candidate
        residual = candidate_residual
        current_error = candidate_error
    return solution, attempts, initial_error, current_error


def solve(
    matrix: MatrixInput,
    right: RightInput,
    *,
    method: str = "auto",
    assume: str = "general",
    tolerance: float | None = None,
    max_refinement: int = 3,
    max_sweeps: int = 64,
    max_elapsed_ms: int = 30_000,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Solve `A X = B`, refine it, and independently check backward error."""
    dense = as_matrix(matrix)
    dense_right, was_vector = as_right_hand_side(right)
    if assume not in ("general", "positive_definite"):
        raise ValueError("assume must be 'general' or 'positive_definite'")
    methods = {
        "lu": "partial_pivot_lu",
        "qr": "column_pivoted_householder_qr",
        "cholesky": "cholesky",
    }
    if method == "auto":
        selected = "cholesky" if assume == "positive_definite" else "partial_pivot_lu"
        reason = (
            "caller supplied a positive-definite structural contract"
            if assume == "positive_definite"
            else "general square binary64 system"
        )
    elif method in methods:
        selected = methods[method]
        reason = "explicit method request"
    else:
        raise ValueError("method must be auto, lu, qr, or cholesky")
    validation_tolerance = (
        64.0 * MACHINE_EPSILON * max(1, dense.nrows)
        if tolerance is None
        else float(tolerance)
    )
    if not math.isfinite(validation_tolerance) or validation_tolerance <= 0.0:
        raise ValueError("tolerance must be finite and positive")
    if (
        isinstance(max_refinement, bool)
        or not isinstance(max_refinement, int)
        or max_refinement < 0
    ):
        raise ValueError("max_refinement must be a nonnegative integer")
    problem = _problem(
        "linear_solve",
        dense,
        right=dense_right,
        method=method,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_iterations=max(1, max(max_refinement, max_sweeps)),
        max_elapsed_ms=max_elapsed_ms,
        tolerances={"backward_error": validation_tolerance},
        metadata={"assume": assume},
    )
    plan = _plan(problem, selected, reason)
    record = _start_trace(problem, plan.method)
    started = time.monotonic()
    if dense.nrows != dense.ncols:
        return _failure_result(problem, plan, record, started, "matrix_not_square")
    if dense_right.nrows != dense.nrows:
        return _failure_result(
            problem,
            plan,
            record,
            started,
            "dimension_mismatch",
            details={
                "matrix_rows": dense.nrows,
                "right_side_rows": dense_right.nrows,
            },
        )
    check = lambda: _check_execution(problem, started, cancel)
    try:
        check()
        factorization, solve_correction = _select_solver(
            dense, selected, check, _factor_step_recorder(record)
        )
        record.append(
            "phase", data={"kind": "factorization", "method": selected}, important=True
        )
        spectral = _spectral_diagnostics(
            dense,
            record,
            max_sweeps=max_sweeps,
            check=check,
        )
        result_diagnostics = _condition_diagnostics(spectral, dense.nrows)
        if not spectral.converged:
            result_diagnostics.append(NumericalDiagnostic("maximum_iterations"))
        if spectral.converged and spectral.rank != dense.nrows:
            return _failure_result(
                problem,
                plan,
                record,
                started,
                "rank_deficient",
                details={
                    "rank": spectral.rank,
                    "dimension": dense.nrows,
                    "rank_threshold": spectral.threshold,
                },
            )
        check()
        solution = solve_correction(dense_right)
        solution, iterations, initial_error, final_error = _refine_solution(
            dense,
            dense_right,
            solution,
            solve_correction,
            record,
            tolerance=validation_tolerance,
            max_refinement=max_refinement,
            check=check,
        )
        validation = validate_solve(
            dense,
            solution,
            dense_right,
            tolerance=validation_tolerance,
            condition_estimate=spectral.condition if spectral.converged else None,
            check=check,
        )
        factorization_record = factorization.to_dict(check=check)
    except _Cancelled:
        return _failure_result(
            problem, plan, record, started, "cancelled", cancelled=True
        )
    except LinearAlgebraError as error:
        return _failure_result(
            problem, plan, record, started, error.code, details=error.details
        )
    if not validation.passed:
        result_diagnostics.append(NumericalDiagnostic("validation_failed"))
    success = validation.passed
    record.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    record.append(
        "finish" if success else "failure",
        iteration=iterations,
        data={
            "status": "converged" if success else "validation_failed",
            "initial_backward_error": initial_error,
            "final_backward_error": final_error,
        },
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    return LinearAlgebraResult(
        problem,
        plan,
        success=success,
        status="converged" if success else "validation_failed",
        value=restore_right_hand_side(solution, was_vector),
        validation=validation,
        diagnostics=result_diagnostics,
        iterations=iterations,
        elapsed_ms=(time.monotonic() - started) * 1000.0,
        trace=record,
        measurements={
            "initial_backward_error": initial_error,
            "final_backward_error": final_error,
            "refinement_attempts": iterations,
        },
        provenance={
            "implementation": "sagejs.numerics.linear_algebra.solve",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
            "validation_path": "independent_compensated_residual",
        },
        domain_payload={
            "solution_shape": [solution.nrows, solution.ncols],
            "factorization": factorization_record,
            "rank_diagnostics": spectral.to_dict(),
            "iterative_refinement": {
                "attempts": iterations,
                "initial_backward_error": initial_error,
                "final_backward_error": final_error,
            },
        },
    )


def _overdetermined_solution(
    factorization: QRFactorization,
    right: DenseMatrix,
    *,
    check: Callable[[], None],
) -> DenseMatrix:
    columns = factorization.original.ncols
    transformed = factorization.apply_q_transpose(right, check=check)
    solution_columns = right.ncols
    permuted = [0.0] * (columns * solution_columns)
    upper = factorization.r()
    for row in range(columns - 1, -1, -1):
        check()
        pivot = upper.entry(row, row)
        for column in range(solution_columns):
            value = transformed.entry(row, column)
            details = {"row": row, "right_side_column": column}
            value = _finite_intermediate(
                value
                - _finite_sum(
                    (
                        upper.entry(row, index)
                        * permuted[index * solution_columns + column]
                        for index in range(row + 1, columns)
                    ),
                    "the least-squares back solve is not representable in binary64",
                    details=details,
                ),
                "the least-squares back solve is not representable in binary64",
                details=details,
            )
            permuted[row * solution_columns + column] = _finite_intermediate(
                value / pivot,
                "the least-squares solution is not representable in binary64",
                details=details,
            )
    output = [0.0] * (columns * solution_columns)
    for permuted_column, original_column in enumerate(factorization.column_permutation):
        for column in range(solution_columns):
            output[original_column * solution_columns + column] = permuted[
                permuted_column * solution_columns + column
            ]
    return DenseMatrix(columns, solution_columns, output)


def _underdetermined_solution(
    matrix: DenseMatrix,
    factorization: QRFactorization,
    right: DenseMatrix,
    *,
    check: Callable[[], None],
) -> DenseMatrix:
    rows = matrix.nrows
    right_columns = right.ncols
    permuted_right = [0.0] * (rows * right_columns)
    for permuted_row, original_row in enumerate(factorization.column_permutation):
        check()
        for column in range(right_columns):
            permuted_right[permuted_row * right_columns + column] = right.entry(
                original_row, column
            )
    upper = factorization.r()
    y = [0.0] * (rows * right_columns)
    for row in range(rows):
        check()
        pivot = upper.entry(row, row)
        for column in range(right_columns):
            value = permuted_right[row * right_columns + column]
            details = {"row": row, "right_side_column": column}
            value = _finite_intermediate(
                value
                - _finite_sum(
                    (
                        upper.entry(index, row) * y[index * right_columns + column]
                        for index in range(row)
                    ),
                    "the minimum-norm forward solve is not representable in binary64",
                    details=details,
                ),
                "the minimum-norm forward solve is not representable in binary64",
                details=details,
            )
            y[row * right_columns + column] = _finite_intermediate(
                value / pivot,
                "the minimum-norm solution is not representable in binary64",
                details=details,
            )
    q = factorization.q(check=check)
    try:
        return q.multiply(DenseMatrix(rows, right_columns, y), check=check)
    except (OverflowError, ValueError):
        raise LinearAlgebraError(
            "nonfinite_intermediate",
            "the minimum-norm solution is not representable in binary64",
        ) from None


def least_squares(
    matrix: MatrixInput,
    right: RightInput,
    *,
    tolerance: float | None = None,
    max_sweeps: int = 64,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    max_elapsed_ms: int = 30_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Solve full-rank least squares, returning the minimum-norm wide solution."""
    dense = as_matrix(matrix)
    dense_right, was_vector = as_right_hand_side(right)
    validation_tolerance = (
        256.0 * MACHINE_EPSILON * max(1, dense.nrows, dense.ncols)
        if tolerance is None
        else float(tolerance)
    )
    if not math.isfinite(validation_tolerance) or validation_tolerance <= 0.0:
        raise ValueError("tolerance must be finite and positive")
    selected_method = (
        "column_pivoted_householder_qr"
        if dense.nrows >= dense.ncols
        else "column_pivoted_householder_qr_of_transpose"
    )
    problem = _problem(
        "least_squares",
        dense,
        right=dense_right,
        method=selected_method,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_iterations=max_sweeps,
        max_elapsed_ms=max_elapsed_ms,
        tolerances={"stationarity": validation_tolerance},
    )
    plan = _plan(
        problem,
        selected_method,
        (
            "stable least-squares path without normal equations"
            if dense.nrows >= dense.ncols
            else "minimum-norm path via column-pivoted QR of the transpose"
        ),
    )
    record = _start_trace(problem, plan.method)
    started = time.monotonic()
    if dense_right.nrows != dense.nrows:
        return _failure_result(
            problem,
            plan,
            record,
            started,
            "dimension_mismatch",
            details={
                "matrix_rows": dense.nrows,
                "right_side_rows": dense_right.nrows,
            },
        )
    check = lambda: _check_execution(problem, started, cancel)
    try:
        spectral = _spectral_diagnostics(
            dense, record, max_sweeps=max_sweeps, check=check
        )
        if not spectral.converged:
            return _failure_result(
                problem,
                plan,
                record,
                started,
                "rank_diagnostic_indeterminate",
                details={"sweeps": spectral.sweeps, "maximum_sweeps": max_sweeps},
            )
        expected_rank = min(dense.nrows, dense.ncols)
        if spectral.rank != expected_rank:
            return _failure_result(
                problem,
                plan,
                record,
                started,
                "rank_deficient",
                details={
                    "rank": spectral.rank,
                    "required_rank": expected_rank,
                    "rank_threshold": spectral.threshold,
                },
            )
        if dense.nrows >= dense.ncols:
            factorization = qr_factorize(
                dense,
                pivoted=True,
                check=check,
                on_step=_factor_step_recorder(record),
            )
            solution = _overdetermined_solution(factorization, dense_right, check=check)
            solution_kind = "full_column_rank_least_squares"
            factorized_operand = "A"
        else:
            factorization = qr_factorize(
                dense.transpose(),
                pivoted=True,
                check=check,
                source_expression="A.T",
                on_step=_factor_step_recorder(record),
            )
            solution = _underdetermined_solution(
                dense, factorization, dense_right, check=check
            )
            solution_kind = "minimum_norm_full_row_rank"
            factorized_operand = "A.T"
        validation = validate_least_squares(
            dense,
            solution,
            dense_right,
            tolerance=validation_tolerance,
            condition_estimate=spectral.condition,
            check=check,
        )
        factorization_record = factorization.to_dict(check=check)
    except _Cancelled:
        return _failure_result(
            problem, plan, record, started, "cancelled", cancelled=True
        )
    except LinearAlgebraError as error:
        return _failure_result(
            problem, plan, record, started, error.code, details=error.details
        )
    result_diagnostics = _condition_diagnostics(spectral, expected_rank)
    if not validation.passed:
        result_diagnostics.append(NumericalDiagnostic("validation_failed"))
    success = validation.passed
    record.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    record.append(
        "finish" if success else "failure",
        data={"status": "converged" if success else "validation_failed"},
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    return LinearAlgebraResult(
        problem,
        plan,
        success=success,
        status="converged" if success else "validation_failed",
        value=restore_right_hand_side(solution, was_vector),
        validation=validation,
        diagnostics=result_diagnostics,
        elapsed_ms=(time.monotonic() - started) * 1000.0,
        trace=record,
        provenance={
            "implementation": "sagejs.numerics.linear_algebra.least_squares",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
            "normal_equations_formed": False,
        },
        domain_payload={
            "solution_kind": solution_kind,
            "factorized_operand": factorized_operand,
            "rank_diagnostics": spectral.to_dict(),
            "factorization": factorization_record,
        },
    )


def _rank_or_condition(
    matrix: MatrixInput,
    operation: str,
    *,
    max_sweeps: int,
    trace: str,
    max_trace_events: int,
    max_trace_bytes: int,
    max_elapsed_ms: int,
    cancel: Callable[[], bool] | None,
) -> LinearAlgebraResult:
    dense = as_matrix(matrix)
    problem = _problem(
        operation,
        dense,
        method="one_sided_jacobi",
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_iterations=max_sweeps,
        max_elapsed_ms=max_elapsed_ms,
    )
    plan = _plan(
        problem,
        "one_sided_jacobi",
        "singular values support scale-aware rank and 2-norm conditioning",
    )
    record = _start_trace(problem, plan.method)
    started = time.monotonic()
    check = lambda: _check_execution(problem, started, cancel)
    try:
        spectral = _spectral_diagnostics(
            dense, record, max_sweeps=max_sweeps, check=check
        )
    except _Cancelled:
        return _failure_result(
            problem, plan, record, started, "cancelled", cancelled=True
        )
    except LinearAlgebraError as error:
        return _failure_result(
            problem, plan, record, started, error.code, details=error.details
        )
    validation = NumericalValidation(
        "heuristic" if spectral.converged else "indeterminate",
        spectral.converged,
        checks=[
            {
                "kind": "jacobi_column_orthogonalization",
                "passed": spectral.converged,
                "sweeps": spectral.sweeps,
                "maximum_sweeps": max_sweeps,
            },
            {
                "kind": "rank_threshold",
                "passed": True,
                "threshold": spectral.threshold,
                "rule": "sigma_max * max(m,n) * binary64_epsilon",
            },
        ],
        condition_estimate=spectral.condition,
    )
    result_diagnostics = _condition_diagnostics(spectral, min(dense.nrows, dense.ncols))
    if not spectral.converged:
        result_diagnostics.append(NumericalDiagnostic("maximum_iterations"))
    if operation == "matrix_rank":
        value: Any = spectral.rank
    else:
        value = spectral.condition
    success = spectral.converged
    record.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    record.append(
        "finish" if success else "failure",
        data={"status": "converged" if success else "maximum_iterations"},
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    return LinearAlgebraResult(
        problem,
        plan,
        success=success,
        status="converged" if success else "maximum_iterations",
        value=value,
        validation=validation,
        diagnostics=result_diagnostics,
        iterations=spectral.sweeps,
        elapsed_ms=(time.monotonic() - started) * 1000.0,
        trace=record,
        provenance={
            "implementation": "sagejs.numerics.linear_algebra.diagnostics",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
        },
        domain_payload=spectral.to_dict(),
    )


def matrix_rank(
    matrix: MatrixInput,
    *,
    max_sweeps: int = 64,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    max_elapsed_ms: int = 30_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Return a scale-aware numerical rank result."""
    return _rank_or_condition(
        matrix,
        "matrix_rank",
        max_sweeps=max_sweeps,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_elapsed_ms=max_elapsed_ms,
        cancel=cancel,
    )


def condition_number(
    matrix: MatrixInput,
    *,
    max_sweeps: int = 64,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    max_elapsed_ms: int = 30_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Return the estimated 2-norm condition, or `None` when numerically infinite."""
    return _rank_or_condition(
        matrix,
        "condition_number",
        max_sweeps=max_sweeps,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_elapsed_ms=max_elapsed_ms,
        cancel=cancel,
    )


def determinant(
    matrix: MatrixInput,
    *,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    max_elapsed_ms: int = 30_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Explicitly compute a determinant with stable sign/log-magnitude evidence."""
    dense = as_matrix(matrix)
    problem = _problem(
        "determinant",
        dense,
        method="partial_pivot_lu",
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_iterations=max(1, dense.nrows),
        max_elapsed_ms=max_elapsed_ms,
    )
    plan = _plan(problem, "partial_pivot_lu", "determinant explicitly requested")
    record = _start_trace(problem, plan.method)
    started = time.monotonic()
    if dense.nrows != dense.ncols:
        return _failure_result(problem, plan, record, started, "matrix_not_square")
    check = lambda: _check_execution(problem, started, cancel)
    try:
        factorization = lu_factorize(
            dense, check=check, on_step=_factor_step_recorder(record)
        )
        validation = validate_lu(dense, factorization, check=check)
        sign, log_absolute = factorization.slogdet()
        factorization_record = factorization.to_dict(check=check)
    except _Cancelled:
        return _failure_result(
            problem, plan, record, started, "cancelled", cancelled=True
        )
    except LinearAlgebraError as error:
        return _failure_result(
            problem, plan, record, started, error.code, details=error.details
        )
    diagnostics: list[NumericalDiagnostic] = []
    representable = True
    if sign == 0:
        value: float | None = 0.0
    else:
        try:
            magnitude = math.exp(log_absolute)  # type: ignore[arg-type]
            if not math.isfinite(magnitude):
                value = None
                representable = False
                diagnostics.append(NumericalDiagnostic("loss_of_significance"))
            else:
                value = float(sign) * magnitude
                if value == 0.0:
                    representable = False
                    diagnostics.append(NumericalDiagnostic("loss_of_significance"))
        except OverflowError:
            value = None
            representable = False
            diagnostics.append(NumericalDiagnostic("loss_of_significance"))
    if not validation.passed:
        diagnostics.append(NumericalDiagnostic("validation_failed"))
    success = validation.passed
    record.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    record.append(
        "finish" if success else "failure",
        data={"status": "converged" if success else "validation_failed"},
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    return LinearAlgebraResult(
        problem,
        plan,
        success=success,
        status="converged" if success else "validation_failed",
        value=value,
        validation=validation,
        diagnostics=diagnostics,
        elapsed_ms=(time.monotonic() - started) * 1000.0,
        trace=record,
        provenance={
            "implementation": "sagejs.numerics.linear_algebra.determinant",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
        },
        domain_payload={
            "sign": sign,
            "log_abs_determinant": log_absolute,
            "ordinary_value_representable": representable,
            "factorization": factorization_record,
        },
    )


def inverse(
    matrix: MatrixInput,
    *,
    tolerance: float | None = None,
    max_refinement: int = 3,
    max_sweeps: int = 64,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    max_elapsed_ms: int = 30_000,
    cancel: Callable[[], bool] | None = None,
) -> LinearAlgebraResult:
    """Explicitly compute and independently validate a square matrix inverse."""
    dense = as_matrix(matrix)
    identity = DenseMatrix.identity(dense.nrows)
    validation_tolerance = (
        128.0 * MACHINE_EPSILON * max(1, dense.nrows)
        if tolerance is None
        else float(tolerance)
    )
    if not math.isfinite(validation_tolerance) or validation_tolerance <= 0.0:
        raise ValueError("tolerance must be finite and positive")
    if (
        isinstance(max_refinement, bool)
        or not isinstance(max_refinement, int)
        or max_refinement < 0
    ):
        raise ValueError("max_refinement must be a nonnegative integer")
    problem = _problem(
        "matrix_inverse",
        dense,
        method="partial_pivot_lu",
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        max_iterations=max(max_refinement, max_sweeps, 1),
        max_elapsed_ms=max_elapsed_ms,
        tolerances={"inverse_residual": validation_tolerance},
    )
    plan = _plan(problem, "partial_pivot_lu", "inverse explicitly requested")
    record = _start_trace(problem, plan.method)
    started = time.monotonic()
    if dense.nrows != dense.ncols:
        return _failure_result(problem, plan, record, started, "matrix_not_square")
    check = lambda: _check_execution(problem, started, cancel)
    try:
        factorization = lu_factorize(
            dense, check=check, on_step=_factor_step_recorder(record)
        )
        spectral = _spectral_diagnostics(
            dense, record, max_sweeps=max_sweeps, check=check
        )
        if spectral.converged and spectral.rank != dense.nrows:
            return _failure_result(
                problem,
                plan,
                record,
                started,
                "rank_deficient",
                details={"rank": spectral.rank, "dimension": dense.nrows},
            )
        inverse_matrix = factorization.solve(identity, check=check)

        def solve_correction(right_matrix: DenseMatrix) -> DenseMatrix:
            return factorization.solve(right_matrix, check=check)

        inverse_matrix, iterations, initial_error, final_error = _refine_solution(
            dense,
            identity,
            inverse_matrix,
            solve_correction,
            record,
            tolerance=validation_tolerance,
            max_refinement=max_refinement,
            check=check,
        )
        validation = validate_inverse(
            dense,
            inverse_matrix,
            tolerance=validation_tolerance,
            condition_estimate=spectral.condition if spectral.converged else None,
            check=check,
        )
        factorization_record = factorization.to_dict(check=check)
    except _Cancelled:
        return _failure_result(
            problem, plan, record, started, "cancelled", cancelled=True
        )
    except LinearAlgebraError as error:
        return _failure_result(
            problem, plan, record, started, error.code, details=error.details
        )
    result_diagnostics = _condition_diagnostics(spectral, dense.nrows)
    if not spectral.converged:
        result_diagnostics.append(NumericalDiagnostic("maximum_iterations"))
    if not validation.passed:
        result_diagnostics.append(NumericalDiagnostic("validation_failed"))
    success = validation.passed
    record.append(
        "validation",
        data=validation.to_dict(),
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    record.append(
        "finish" if success else "failure",
        iteration=iterations,
        data={"status": "converged" if success else "validation_failed"},
        diagnostics=result_diagnostics,
        important=True,
        force=True,
    )
    return LinearAlgebraResult(
        problem,
        plan,
        success=success,
        status="converged" if success else "validation_failed",
        value=inverse_matrix.to_rows(),
        validation=validation,
        diagnostics=result_diagnostics,
        iterations=iterations,
        elapsed_ms=(time.monotonic() - started) * 1000.0,
        trace=record,
        measurements={
            "initial_backward_error": initial_error,
            "final_backward_error": final_error,
        },
        provenance={
            "implementation": "sagejs.numerics.linear_algebra.inverse",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
            "explicit_only": True,
        },
        domain_payload={
            "rank_diagnostics": spectral.to_dict(),
            "factorization": factorization_record,
        },
    )
