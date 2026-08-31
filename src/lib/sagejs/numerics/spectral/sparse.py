"""Validated sparse iterative solves and a bounded dominant eigenpair method."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalResult, NumericalValidation
from ..trace import NumericalTrace
from ._common import (
    _EPSILON,
    _BudgetStop,
    _conjugate,
    _dot,
    _empty_validation,
    _Execution,
    _finish_result,
    _json_vector,
    _norm,
    _normalize,
    _number,
    _plan,
    _problem,
    _vector,
)


class CSRMatrix:
    """Portable immutable compressed-sparse-row complex binary64 matrix."""

    def __init__(
        self,
        indptr: Sequence[int],
        indices: Sequence[int],
        data: Sequence[Any],
        shape: Sequence[int],
    ) -> None:
        if len(shape) != 2:
            raise ValueError("CSR shape must contain two dimensions")
        rows = shape[0]
        columns = shape[1]
        if (
            isinstance(rows, bool)
            or isinstance(columns, bool)
            or not isinstance(rows, int)
            or not isinstance(columns, int)
            or rows <= 0
            or columns <= 0
        ):
            raise ValueError("CSR dimensions must be positive integers")
        pointer = list(indptr)
        column_indices = list(indices)
        entries = [
            _number(value, "data[" + str(index) + "]")
            for index, value in enumerate(data)
        ]
        if len(pointer) != rows + 1 or pointer[0] != 0:
            raise ValueError("CSR indptr must have rows + 1 entries and start at zero")
        if len(column_indices) != len(entries) or pointer[-1] != len(entries):
            raise ValueError("CSR indptr, indices, and data lengths disagree")
        previous_pointer = 0
        for row in range(rows):
            start = pointer[row]
            stop = pointer[row + 1]
            if (
                isinstance(start, bool)
                or isinstance(stop, bool)
                or not isinstance(start, int)
                or not isinstance(stop, int)
                or start < previous_pointer
                or stop < start
                or stop > len(entries)
            ):
                raise ValueError("CSR indptr must be nondecreasing and in range")
            previous_column = -1
            for offset in range(start, stop):
                column = column_indices[offset]
                if (
                    isinstance(column, bool)
                    or not isinstance(column, int)
                    or column <= previous_column
                    or column >= columns
                ):
                    raise ValueError(
                        "CSR column indices must be strictly increasing within each row"
                    )
                previous_column = column
            previous_pointer = stop
        self._indptr = tuple(pointer)
        self._indices = tuple(column_indices)
        self._data = tuple(entries)
        self._shape = (rows, columns)

    @property
    def shape(self) -> tuple[int, int]:
        return self._shape

    @property
    def nnz(self) -> int:
        return len(self._data)

    @property
    def indptr(self) -> tuple[int, ...]:
        return self._indptr

    @property
    def indices(self) -> tuple[int, ...]:
        return self._indices

    @property
    def data(self) -> tuple[complex, ...]:
        return self._data

    def matvec(self, vector: Sequence[Any]) -> list[complex]:
        values = _vector(vector)
        if len(values) != self._shape[1]:
            raise ValueError("matrix and vector dimensions disagree")
        return _csr_matvec(self, values)

    def to_dict(self) -> dict[str, Any]:
        return {
            "format": "csr",
            "shape": list(self._shape),
            "indptr": list(self._indptr),
            "indices": list(self._indices),
            "data": _json_vector(self._data),
        }

    @classmethod
    def from_coo(
        cls,
        rows: Sequence[int],
        columns: Sequence[int],
        data: Sequence[Any],
        shape: Sequence[int],
    ) -> "CSRMatrix":
        """Create canonical CSR storage, summing duplicate COO entries."""
        if len(rows) != len(columns) or len(rows) != len(data):
            raise ValueError("COO rows, columns, and data lengths disagree")
        if len(shape) != 2:
            raise ValueError("COO shape must contain two dimensions")
        row_count = shape[0]
        column_count = shape[1]
        combined: dict[tuple[int, int], complex] = {}
        for index in range(len(data)):
            row = rows[index]
            column = columns[index]
            if (
                isinstance(row, bool)
                or isinstance(column, bool)
                or not isinstance(row, int)
                or not isinstance(column, int)
                or row < 0
                or row >= row_count
                or column < 0
                or column >= column_count
            ):
                raise ValueError("COO coordinate is outside the matrix shape")
            key = row, column
            combined[key] = combined.get(key, 0.0 + 0.0j) + _number(
                data[index], "data[" + str(index) + "]"
            )
        ordered = sorted(
            (row, column, value)
            for (row, column), value in combined.items()
            if value != 0
        )
        indptr = [0]
        indices: list[int] = []
        entries: list[complex] = []
        position = 0
        for row in range(row_count):
            while position < len(ordered) and ordered[position][0] == row:
                indices.append(ordered[position][1])
                entries.append(ordered[position][2])
                position += 1
            indptr.append(len(entries))
        return cls(indptr, indices, entries, shape)

    @classmethod
    def from_dense(cls, matrix: Sequence[Sequence[Any]]) -> "CSRMatrix":
        if not matrix or not matrix[0]:
            raise ValueError("dense sparse input must be nonempty")
        columns = len(matrix[0])
        rows: list[int] = []
        column_indices: list[int] = []
        entries: list[complex] = []
        for row in range(len(matrix)):
            if len(matrix[row]) != columns:
                raise ValueError("dense sparse input must be rectangular")
            for column in range(columns):
                value = _number(
                    matrix[row][column],
                    "matrix[" + str(row) + "][" + str(column) + "]",
                )
                if value != 0:
                    rows.append(row)
                    column_indices.append(column)
                    entries.append(value)
        return cls.from_coo(rows, column_indices, entries, (len(matrix), columns))


def _as_csr(matrix: CSRMatrix | Sequence[Sequence[Any]]) -> CSRMatrix:
    return matrix if isinstance(matrix, CSRMatrix) else CSRMatrix.from_dense(matrix)


def _csr_matvec(matrix: CSRMatrix, vector: Sequence[complex]) -> list[complex]:
    answer = [0.0 + 0.0j for _ in range(matrix.shape[0])]
    for row in range(matrix.shape[0]):
        answer[row] = sum(
            (
                matrix.data[offset] * vector[matrix.indices[offset]]
                for offset in range(matrix.indptr[row], matrix.indptr[row + 1])
            ),
            0.0 + 0.0j,
        )
    return answer


def _evaluated_matvec(
    matrix: CSRMatrix, vector: Sequence[complex], execution: _Execution
) -> list[complex]:
    execution.evaluation()
    return _csr_matvec(matrix, vector)


def _csr_frobenius(matrix: CSRMatrix) -> float:
    return math.sqrt(sum(abs(value) ** 2 for value in matrix.data))


def _csr_hermitian_error(matrix: CSRMatrix) -> float:
    entries: dict[tuple[int, int], complex] = {}
    for row in range(matrix.shape[0]):
        for offset in range(matrix.indptr[row], matrix.indptr[row + 1]):
            entries[(row, matrix.indices[offset])] = matrix.data[offset]
    keys = set(entries)
    keys.update((column, row) for row, column in entries)
    return math.sqrt(
        sum(
            abs(
                entries.get((row, column), 0.0)
                - _conjugate(entries.get((column, row), 0.0 + 0.0j))
            )
            ** 2
            for row, column in keys
        )
    )


def _preconditioner(
    matrix: CSRMatrix, name: str
) -> Callable[[Sequence[complex]], list[complex]]:
    if name == "none":
        return lambda vector: list(vector)
    if name != "jacobi":
        raise ValueError("preconditioner must be 'none' or 'jacobi'")
    diagonal = [0.0 + 0.0j for _ in range(matrix.shape[0])]
    for row in range(matrix.shape[0]):
        for offset in range(matrix.indptr[row], matrix.indptr[row + 1]):
            if matrix.indices[offset] == row:
                diagonal[row] = matrix.data[offset]
                break
    if any(value == 0 for value in diagonal):
        raise ValueError("Jacobi preconditioning requires a nonzero diagonal")
    return lambda vector: [
        vector[index] / diagonal[index] for index in range(len(vector))
    ]


def _cg(
    matrix: CSRMatrix,
    right_hand_side: Sequence[complex],
    initial: Sequence[complex],
    precondition: Callable[[Sequence[complex]], list[complex]],
    execution: _Execution,
    *,
    relative_tolerance: float,
    absolute_tolerance: float,
) -> tuple[list[complex], str]:
    solution = list(initial)
    image = _evaluated_matvec(matrix, solution, execution)
    residual = [
        right_hand_side[index] - image[index] for index in range(len(right_hand_side))
    ]
    target = max(absolute_tolerance, relative_tolerance * _norm(right_hand_side))
    if _norm(residual) <= target:
        return solution, "converged"
    preconditioned = precondition(residual)
    direction = list(preconditioned)
    product = _dot(residual, preconditioned)
    while True:
        iteration = execution.iteration()
        image = _evaluated_matvec(matrix, direction, execution)
        curvature = _dot(direction, image)
        curvature_floor = _EPSILON * _norm(direction) * _norm(image)
        if abs(curvature.imag) > 100.0 * curvature_floor or curvature.real <= 0.0:
            return solution, "stagnation"
        step = product / curvature
        solution = [
            solution[index] + step * direction[index] for index in range(len(solution))
        ]
        residual = [
            residual[index] - step * image[index] for index in range(len(residual))
        ]
        residual_norm = _norm(residual)
        execution.trace.append(
            "iteration",
            iteration=iteration,
            evaluation=execution.evaluations,
            accepted=True,
            data={
                "phase": "conjugate_gradient",
                "residual_norm": residual_norm,
                "target": target,
                "step": [float(step.real), float(step.imag)],
            },
        )
        if residual_norm <= target:
            return solution, "converged"
        new_preconditioned = precondition(residual)
        new_product = _dot(residual, new_preconditioned)
        if product == 0.0:
            return solution, "stagnation"
        coefficient = new_product / product
        direction = [
            new_preconditioned[index] + coefficient * direction[index]
            for index in range(len(direction))
        ]
        preconditioned = new_preconditioned
        product = new_product


def _bicgstab(
    matrix: CSRMatrix,
    right_hand_side: Sequence[complex],
    initial: Sequence[complex],
    precondition: Callable[[Sequence[complex]], list[complex]],
    execution: _Execution,
    *,
    relative_tolerance: float,
    absolute_tolerance: float,
) -> tuple[list[complex], str]:
    size = len(right_hand_side)
    solution = list(initial)
    image = _evaluated_matvec(matrix, solution, execution)
    residual = [right_hand_side[index] - image[index] for index in range(size)]
    shadow = list(residual)
    target = max(absolute_tolerance, relative_tolerance * _norm(right_hand_side))
    if _norm(residual) <= target:
        return solution, "converged"
    direction = [0.0 + 0.0j for _ in range(size)]
    image_direction = [0.0 + 0.0j for _ in range(size)]
    rho_previous = 1.0 + 0.0j
    alpha = 1.0 + 0.0j
    omega = 1.0 + 0.0j
    while True:
        iteration = execution.iteration()
        rho = _dot(shadow, residual)
        floor = _EPSILON * max(_norm(shadow) * _norm(residual), 1.0)
        if abs(rho) <= floor or abs(omega) <= floor:
            return solution, "stagnation"
        coefficient = (rho / rho_previous) * (alpha / omega)
        direction = [
            residual[index]
            + coefficient * (direction[index] - omega * image_direction[index])
            for index in range(size)
        ]
        prepared_direction = precondition(direction)
        image_direction = _evaluated_matvec(matrix, prepared_direction, execution)
        denominator = _dot(shadow, image_direction)
        if abs(denominator) <= floor:
            return solution, "stagnation"
        alpha = rho / denominator
        short_residual = [
            residual[index] - alpha * image_direction[index] for index in range(size)
        ]
        if _norm(short_residual) <= target:
            solution = [
                solution[index] + alpha * prepared_direction[index]
                for index in range(size)
            ]
            execution.trace.append(
                "iteration",
                iteration=iteration,
                evaluation=execution.evaluations,
                accepted=True,
                data={
                    "phase": "bicgstab",
                    "residual_norm": _norm(short_residual),
                    "target": target,
                },
            )
            return solution, "converged"
        prepared_short = precondition(short_residual)
        image_short = _evaluated_matvec(matrix, prepared_short, execution)
        image_norm_squared = _dot(image_short, image_short).real
        if image_norm_squared <= floor:
            return solution, "stagnation"
        omega = _dot(image_short, short_residual) / image_norm_squared
        solution = [
            solution[index]
            + alpha * prepared_direction[index]
            + omega * prepared_short[index]
            for index in range(size)
        ]
        residual = [
            short_residual[index] - omega * image_short[index] for index in range(size)
        ]
        residual_norm = _norm(residual)
        execution.trace.append(
            "iteration",
            iteration=iteration,
            evaluation=execution.evaluations,
            accepted=True,
            data={
                "phase": "bicgstab",
                "residual_norm": residual_norm,
                "target": target,
            },
        )
        if residual_norm <= target:
            return solution, "converged"
        rho_previous = rho


def _validate_sparse_solve(
    matrix: CSRMatrix,
    right_hand_side: Sequence[complex],
    solution: Sequence[complex],
    *,
    relative_tolerance: float,
    absolute_tolerance: float,
    execution: _Execution,
) -> NumericalValidation:
    execution.check()
    image = _csr_matvec(matrix, solution)
    residual_vector = [
        right_hand_side[index] - image[index] for index in range(len(right_hand_side))
    ]
    residual_norm = _norm(residual_vector)
    right_norm = _norm(right_hand_side)
    target = max(absolute_tolerance, relative_tolerance * right_norm)
    backward_error = residual_norm / max(
        _csr_frobenius(matrix) * _norm(solution) + right_norm, _EPSILON
    )
    backward_threshold = max(
        relative_tolerance, absolute_tolerance / max(right_norm, _EPSILON)
    )
    passed = residual_norm <= target and backward_error <= backward_threshold
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "independent_linear_residual",
                "passed": residual_norm <= target,
                "value": residual_norm,
                "threshold": target,
            },
            {
                "kind": "normwise_backward_error",
                "passed": backward_error <= backward_threshold,
                "value": backward_error,
                "threshold": backward_threshold,
            },
            {
                "kind": "orthogonality_not_applicable",
                "passed": True,
                "applicable": False,
            },
        ],
        residual=residual_norm,
        error_estimate=backward_error,
    )


def sparse_solve(
    matrix: CSRMatrix | Sequence[Sequence[Any]],
    right_hand_side: Sequence[Any],
    *,
    method: str = "auto",
    x0: Sequence[Any] | None = None,
    preconditioner: str = "jacobi",
    rtol: float = 1e-10,
    atol: float = 0.0,
    max_iterations: int = 1_000,
    max_evaluations: int | None = None,
    max_elapsed_ms: int = 30_000,
    max_nonzeros: int = 10_000_000,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    cancel: Callable[[], bool] | None = None,
) -> NumericalResult:
    """Solve a square CSR system using CG or BiCGSTAB with validation."""
    operator = _as_csr(matrix)
    if operator.shape[0] != operator.shape[1]:
        raise ValueError("sparse_solve requires a square matrix")
    if operator.nnz > max_nonzeros:
        raise ValueError("matrix exceeds max_nonzeros=" + str(max_nonzeros))
    vector = _vector(right_hand_side, "right_hand_side")
    if len(vector) != operator.shape[0]:
        raise ValueError("matrix and right-hand-side dimensions disagree")
    initial = [0.0 + 0.0j for _ in vector] if x0 is None else _vector(x0, "x0")
    if len(initial) != len(vector):
        raise ValueError("x0 and right-hand-side dimensions disagree")
    if rtol <= 0.0 or atol < 0.0:
        raise ValueError("rtol must be positive and atol must be nonnegative")
    hermitian_error = _csr_hermitian_error(operator)
    hermitian_threshold = 100.0 * _EPSILON * max(_csr_frobenius(operator), 1.0)
    is_hermitian = hermitian_error <= hermitian_threshold
    if method == "auto":
        selected = "cg" if is_hermitian else "bicgstab"
    elif method in ("cg", "bicgstab"):
        selected = method
    else:
        raise ValueError("method must be 'auto', 'cg', or 'bicgstab'")
    if selected == "cg" and not is_hermitian:
        raise ValueError("CG requires a Hermitian matrix; use bicgstab")
    prepared = _preconditioner(operator, preconditioner)
    evaluation_budget = (
        max(4, 2 * max_iterations + 4) if max_evaluations is None else max_evaluations
    )
    problem = _problem(
        "sparse_linear_solve",
        initial_data={
            "matrix": operator.to_dict(),
            "right_hand_side": _json_vector(vector),
        },
        method=selected,
        max_iterations=max_iterations,
        max_evaluations=evaluation_budget,
        max_elapsed_ms=max_elapsed_ms,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        metadata={
            "shape": list(operator.shape),
            "nnz": operator.nnz,
            "rtol": rtol,
            "atol": atol,
            "preconditioner": preconditioner,
            "max_nonzeros": max_nonzeros,
        },
    )
    plan = _plan(
        problem,
        method=selected,
        classification="extension",
        validation=["independent_linear_residual", "normwise_backward_error"],
        reason=(
            "the explicit operator is Hermitian, selecting conjugate gradients"
            if selected == "cg"
            else "the general explicit operator selects BiCGSTAB"
        ),
        requires=(
            ["finite_square_csr", "hermitian_positive_definite"]
            if selected == "cg"
            else ["finite_square_csr", "nonsingular_operator"]
        ),
    )
    numerical_trace = NumericalTrace(problem.trace_policy)
    numerical_trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": selected,
            "shape": list(operator.shape),
            "nnz": operator.nnz,
        },
        important=True,
        force=True,
    )
    execution = _Execution(problem, numerical_trace, cancel)
    try:
        if selected == "cg":
            solution, status = _cg(
                operator,
                vector,
                initial,
                prepared,
                execution,
                relative_tolerance=rtol,
                absolute_tolerance=atol,
            )
        else:
            solution, status = _bicgstab(
                operator,
                vector,
                initial,
                prepared,
                execution,
                relative_tolerance=rtol,
                absolute_tolerance=atol,
            )
        validation = _validate_sparse_solve(
            operator,
            vector,
            solution,
            relative_tolerance=rtol,
            absolute_tolerance=atol,
            execution=execution,
        )
        diagnostics: list[NumericalDiagnostic] = []
        if status == "stagnation":
            diagnostics.append(
                NumericalDiagnostic(
                    "stagnation", details={"reason": "iterative_breakdown"}
                )
            )
        return _finish_result(
            problem,
            plan,
            execution,
            status=status,
            value=_json_vector(solution),
            validation=validation,
            trace=numerical_trace,
            diagnostics=diagnostics,
            domain_payload={
                "shape": list(operator.shape),
                "nnz": operator.nnz,
                "preconditioner": preconditioner,
                "hermitian_input_error": hermitian_error,
            },
        )
    except _BudgetStop as stop:
        return _finish_result(
            problem,
            plan,
            execution,
            status=stop.status,
            value=None,
            validation=_empty_validation(),
            trace=numerical_trace,
        )


def _validate_sparse_eigen(
    matrix: CSRMatrix,
    eigenvalue: complex,
    eigenvector: Sequence[complex],
    tolerance: float,
    execution: _Execution,
) -> NumericalValidation:
    execution.check()
    image = _csr_matvec(matrix, eigenvector)
    difference = [
        image[index] - eigenvalue * eigenvector[index]
        for index in range(len(eigenvector))
    ]
    residual = _norm(difference) / max(
        _csr_frobenius(matrix) * _norm(eigenvector)
        + abs(eigenvalue) * _norm(eigenvector),
        _EPSILON,
    )
    normalization_error = abs(_dot(eigenvector, eigenvector).real - 1.0)
    rayleigh = _dot(eigenvector, image)
    rayleigh_error = abs(rayleigh - eigenvalue) / max(abs(eigenvalue), 1.0)
    passed = (
        residual <= tolerance
        and normalization_error <= tolerance
        and rayleigh_error <= tolerance
    )
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "eigenpair_backward_residual",
                "passed": residual <= tolerance,
                "value": residual,
                "threshold": tolerance,
            },
            {
                "kind": "eigenvector_orthogonality",
                "passed": normalization_error <= tolerance,
                "value": normalization_error,
                "threshold": tolerance,
                "vector_count": 1,
            },
            {
                "kind": "rayleigh_reconstruction",
                "passed": rayleigh_error <= tolerance,
                "value": rayleigh_error,
                "threshold": tolerance,
            },
        ],
        residual=residual,
        error_estimate=max(residual, rayleigh_error),
    )


def sparse_eigen(
    matrix: CSRMatrix | Sequence[Sequence[Any]],
    *,
    k: int = 1,
    which: str = "largest_magnitude",
    x0: Sequence[Any] | None = None,
    tolerance: float = 1e-10,
    max_iterations: int = 1_000,
    max_evaluations: int | None = None,
    max_elapsed_ms: int = 30_000,
    max_nonzeros: int = 10_000_000,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    cancel: Callable[[], bool] | None = None,
) -> NumericalResult:
    """Return one dominant-magnitude eigenpair of an explicit Hermitian CSR matrix.

    Requests for multiple or interior eigenpairs are explicitly unsupported;
    those need restarted Lanczos/Arnoldi and a stronger orthogonalization policy.
    """
    if k != 1:
        raise NotImplementedError(
            "sparse_eigen supports only k=1; k>1 is classified unsupported"
        )
    if which != "largest_magnitude":
        raise NotImplementedError(
            "sparse_eigen supports only which='largest_magnitude'"
        )
    operator = _as_csr(matrix)
    if operator.shape[0] != operator.shape[1]:
        raise ValueError("sparse_eigen requires a square matrix")
    if operator.nnz > max_nonzeros:
        raise ValueError("matrix exceeds max_nonzeros=" + str(max_nonzeros))
    hermitian_error = _csr_hermitian_error(operator)
    hermitian_threshold = 100.0 * _EPSILON * max(_csr_frobenius(operator), 1.0)
    if hermitian_error > hermitian_threshold:
        raise ValueError("sparse_eigen currently requires a Hermitian matrix")
    if tolerance <= 0.0:
        raise ValueError("tolerance must be positive")
    if x0 is None:
        initial = [
            complex(1.0 + (index % 7) / 7.0, 0.0) for index in range(operator.shape[0])
        ]
    else:
        initial = _vector(x0, "x0")
    if len(initial) != operator.shape[0] or _norm(initial) == 0.0:
        raise ValueError("x0 must be a nonzero vector matching the matrix")
    evaluation_budget = (
        max(4, 2 * max_iterations + 4) if max_evaluations is None else max_evaluations
    )
    problem = _problem(
        "sparse_dominant_eigen",
        initial_data={
            "matrix": operator.to_dict(),
            "initial_vector": _json_vector(initial),
        },
        method="power_iteration",
        max_iterations=max_iterations,
        max_evaluations=evaluation_budget,
        max_elapsed_ms=max_elapsed_ms,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        metadata={
            "shape": list(operator.shape),
            "nnz": operator.nnz,
            "k": 1,
            "which": which,
            "tolerance": tolerance,
            "max_nonzeros": max_nonzeros,
        },
    )
    plan = _plan(
        problem,
        method="power_iteration",
        classification="extension",
        validation=[
            "eigenpair_backward_residual",
            "eigenvector_orthogonality",
            "rayleigh_reconstruction",
        ],
        reason="one requested dominant-magnitude Hermitian eigenpair admits bounded power iteration",
        requires=[
            "finite_hermitian_csr",
            "unique_dominant_eigenvalue_magnitude",
            "k_equals_one",
        ],
    )
    numerical_trace = NumericalTrace(problem.trace_policy)
    numerical_trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": plan.method,
            "shape": list(operator.shape),
            "nnz": operator.nnz,
        },
        important=True,
        force=True,
    )
    execution = _Execution(problem, numerical_trace, cancel)
    vector = _normalize(initial)
    eigenvalue = 0.0 + 0.0j
    try:
        status = "maximum_iterations"
        while True:
            iteration = execution.iteration()
            image = _evaluated_matvec(operator, vector, execution)
            image_norm = _norm(image)
            if image_norm == 0.0:
                status = "stagnation"
                break
            candidate = _normalize(image)
            candidate_image = _evaluated_matvec(operator, candidate, execution)
            eigenvalue = _dot(candidate, candidate_image)
            residual_vector = [
                candidate_image[index] - eigenvalue * candidate[index]
                for index in range(len(candidate))
            ]
            residual = _norm(residual_vector) / max(
                _csr_frobenius(operator) + abs(eigenvalue), _EPSILON
            )
            numerical_trace.append(
                "iteration",
                iteration=iteration,
                evaluation=execution.evaluations,
                accepted=True,
                data={
                    "phase": "power_iteration",
                    "eigenvalue": _json_vector([eigenvalue])[0],
                    "backward_residual": residual,
                    "target": tolerance,
                },
            )
            vector = candidate
            if residual <= tolerance:
                status = "converged"
                break
        validation = _validate_sparse_eigen(
            operator,
            eigenvalue,
            vector,
            max(tolerance, 200.0 * operator.shape[0] * _EPSILON),
            execution,
        )
        diagnostics: list[NumericalDiagnostic] = []
        if status == "stagnation":
            diagnostics.append(
                NumericalDiagnostic(
                    "stagnation",
                    details={"reason": "zero_image_or_nonunique_dominant_magnitude"},
                )
            )
        return _finish_result(
            problem,
            plan,
            execution,
            status=status,
            value={
                "eigenvalue": _json_vector([eigenvalue])[0],
                "eigenvector": _json_vector(vector),
            },
            validation=validation,
            trace=numerical_trace,
            diagnostics=diagnostics,
            domain_payload={
                "shape": list(operator.shape),
                "nnz": operator.nnz,
                "k": 1,
                "which": which,
                "hermitian_input_error": hermitian_error,
            },
        )
    except _BudgetStop as stop:
        return _finish_result(
            problem,
            plan,
            execution,
            status=stop.status,
            value=None,
            validation=_empty_validation(),
            trace=numerical_trace,
        )


cg = sparse_solve
eigsh = sparse_eigen
