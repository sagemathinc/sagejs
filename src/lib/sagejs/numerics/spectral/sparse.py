"""Validated sparse iterative solves and a bounded dominant eigenpair method."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalResult, NumericalValidation
from ..trace import NumericalTrace
from ._common import (
    _EPSILON,
    _bounded_metric,
    _bounded_positive_ratio,
    _BudgetStop,
    _conjugate,
    _dot,
    _empty_validation,
    _Execution,
    _finish_result,
    _finite_number,
    _finite_vector,
    _json_vector,
    _norm,
    _normalize,
    _number,
    _plan,
    _problem,
    _representation_diagnostic,
    _representation_validation,
    _RepresentationStop,
    _rescale_number,
    _rescale_vector,
    _scaled_vector,
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
        try:
            return _csr_matvec(self, values)
        except _RepresentationStop as stop:
            raise ValueError(str(stop)) from None

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
            combined_value = combined.get(key, 0.0 + 0.0j) + _number(
                data[index], "data[" + str(index) + "]"
            )
            if not _finite_number(combined_value):
                raise ValueError("summed COO entry is not representable in binary64")
            combined[key] = combined_value
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
        total = 0.0 + 0.0j
        for offset in range(matrix.indptr[row], matrix.indptr[row + 1]):
            product = matrix.data[offset] * vector[matrix.indices[offset]]
            total += product
            if not _finite_number(product) or not _finite_number(total):
                raise _RepresentationStop(
                    "sparse matrix-vector product exceeds binary64"
                )
        answer[row] = total
    return answer


def _evaluated_matvec(
    matrix: CSRMatrix, vector: Sequence[complex], execution: _Execution
) -> list[complex]:
    execution.evaluation()
    return _csr_matvec(matrix, vector)


def _csr_frobenius(matrix: CSRMatrix) -> float:
    return _norm(matrix.data)


def _csr_hermitian_error(matrix: CSRMatrix) -> float:
    entries: dict[tuple[int, int], complex] = {}
    for row in range(matrix.shape[0]):
        for offset in range(matrix.indptr[row], matrix.indptr[row + 1]):
            entries[(row, matrix.indices[offset])] = matrix.data[offset]
    keys = set(entries)
    keys.update((column, row) for row, column in entries)
    return _norm(
        [
            entries.get((row, column), 0.0)
            - _conjugate(entries.get((column, row), 0.0 + 0.0j))
            for row, column in keys
        ]
    )


def _scaled_csr(matrix: CSRMatrix) -> tuple[CSRMatrix, float]:
    data, scale = _scaled_vector(matrix.data)
    return CSRMatrix(matrix.indptr, matrix.indices, data, matrix.shape), scale


def _csr_row_data(matrix: CSRMatrix, row: int) -> tuple[complex, float]:
    diagonal = 0.0 + 0.0j
    radius = 0.0
    for offset in range(matrix.indptr[row], matrix.indptr[row + 1]):
        column = matrix.indices[offset]
        value = matrix.data[offset]
        if column == row:
            diagonal = value
        else:
            radius += abs(value)
    return diagonal, radius


def _csr_positive_definite_certificate(
    matrix: CSRMatrix, hermitian_tolerance: float
) -> tuple[bool, float]:
    """Certify SPD by strict Hermitian diagonal dominance and positive diagonal."""
    smallest_margin = float("inf")
    for row in range(matrix.shape[0]):
        diagonal, radius = _csr_row_data(matrix, row)
        local_tolerance = hermitian_tolerance * max(1.0, abs(diagonal.real), radius)
        if abs(diagonal.imag) > local_tolerance:
            return False, 0.0
        margin = diagonal.real - radius
        if margin <= local_tolerance:
            return False, max(0.0, margin)
        smallest_margin = min(smallest_margin, margin)
    return True, smallest_margin


def _interval_minimum_absolute(lower: float, upper: float) -> float:
    if lower <= 0.0 <= upper:
        return 0.0
    return min(abs(lower), abs(upper))


def _csr_dominant_magnitude_certificate(
    matrix: CSRMatrix, tolerance: float
) -> tuple[bool, int | None, float]:
    """Certify a unique dominant magnitude using separated Gershgorin intervals."""
    intervals: list[tuple[float, float]] = []
    for row in range(matrix.shape[0]):
        diagonal, radius = _csr_row_data(matrix, row)
        if abs(diagonal.imag) > tolerance * max(1.0, abs(diagonal.real), radius):
            return False, None, 0.0
        lower = diagonal.real - radius
        upper = diagonal.real + radius
        intervals.append(
            (_interval_minimum_absolute(lower, upper), max(abs(lower), abs(upper)))
        )
    for candidate, (candidate_minimum, _) in enumerate(intervals):
        competing_maximum = max(
            (upper for index, (_, upper) in enumerate(intervals) if index != candidate),
            default=0.0,
        )
        gap = candidate_minimum - competing_maximum
        if gap > tolerance * max(1.0, candidate_minimum, competing_maximum):
            return True, candidate, gap
    return False, None, 0.0


def _checked_vector(values: Sequence[complex], reason: str) -> list[complex]:
    answer = list(values)
    if not _finite_vector(answer) or not _norm(answer) < float("inf"):
        raise _RepresentationStop(reason)
    return answer


def _checked_number(value: complex, reason: str) -> complex:
    if not _finite_number(value):
        raise _RepresentationStop(reason)
    return value


def _relative_inner_magnitude(
    left: Sequence[complex], right: Sequence[complex]
) -> tuple[complex, float]:
    scaled_left, _ = _scaled_vector(left)
    scaled_right, _ = _scaled_vector(right)
    inner = _checked_number(
        _dot(scaled_left, scaled_right), "inner product exceeds binary64"
    )
    bound = _norm(scaled_left) * _norm(scaled_right)
    return inner, bound


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
    residual = _checked_vector(
        [
            right_hand_side[index] - image[index]
            for index in range(len(right_hand_side))
        ],
        "conjugate-gradient residual exceeds binary64",
    )
    target = max(absolute_tolerance, relative_tolerance * _norm(right_hand_side))
    if _norm(residual) <= target:
        return solution, "converged"
    preconditioned = _checked_vector(
        precondition(residual), "preconditioned residual exceeds binary64"
    )
    direction = list(preconditioned)
    product = _checked_number(
        _dot(residual, preconditioned), "conjugate-gradient product exceeds binary64"
    )
    while True:
        iteration = execution.iteration()
        image = _evaluated_matvec(matrix, direction, execution)
        curvature = _checked_number(
            _dot(direction, image), "conjugate-gradient curvature exceeds binary64"
        )
        relative_curvature, curvature_bound = _relative_inner_magnitude(
            direction, image
        )
        curvature_floor = _EPSILON * curvature_bound
        if (
            abs(relative_curvature.imag) > 100.0 * curvature_floor
            or relative_curvature.real <= curvature_floor
        ):
            return solution, "stagnation"
        step = _checked_number(
            product / curvature, "conjugate-gradient step exceeds binary64"
        )
        solution = _checked_vector(
            [
                solution[index] + step * direction[index]
                for index in range(len(solution))
            ],
            "conjugate-gradient iterate exceeds binary64",
        )
        residual = _checked_vector(
            [residual[index] - step * image[index] for index in range(len(residual))],
            "conjugate-gradient residual exceeds binary64",
        )
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
                "step": _json_vector([step])[0],
            },
        )
        if residual_norm <= target:
            return solution, "converged"
        new_preconditioned = _checked_vector(
            precondition(residual), "preconditioned residual exceeds binary64"
        )
        new_product = _checked_number(
            _dot(residual, new_preconditioned),
            "conjugate-gradient product exceeds binary64",
        )
        if product == 0.0:
            return solution, "stagnation"
        coefficient = _checked_number(
            new_product / product, "conjugate-gradient coefficient exceeds binary64"
        )
        direction = _checked_vector(
            [
                new_preconditioned[index] + coefficient * direction[index]
                for index in range(len(direction))
            ],
            "conjugate-gradient direction exceeds binary64",
        )
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
    residual = _checked_vector(
        [right_hand_side[index] - image[index] for index in range(size)],
        "BiCGSTAB residual exceeds binary64",
    )
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
        rho = _checked_number(
            _dot(shadow, residual), "BiCGSTAB inner product exceeds binary64"
        )
        relative_rho, rho_bound = _relative_inner_magnitude(shadow, residual)
        if abs(relative_rho) <= _EPSILON * rho_bound or abs(omega) <= _EPSILON:
            return solution, "stagnation"
        coefficient = _checked_number(
            (rho / rho_previous) * (alpha / omega),
            "BiCGSTAB coefficient exceeds binary64",
        )
        direction = _checked_vector(
            [
                residual[index]
                + coefficient * (direction[index] - omega * image_direction[index])
                for index in range(size)
            ],
            "BiCGSTAB direction exceeds binary64",
        )
        prepared_direction = _checked_vector(
            precondition(direction), "preconditioned direction exceeds binary64"
        )
        image_direction = _evaluated_matvec(matrix, prepared_direction, execution)
        denominator = _checked_number(
            _dot(shadow, image_direction), "BiCGSTAB denominator exceeds binary64"
        )
        relative_denominator, denominator_bound = _relative_inner_magnitude(
            shadow, image_direction
        )
        if abs(relative_denominator) <= _EPSILON * denominator_bound:
            return solution, "stagnation"
        alpha = _checked_number(rho / denominator, "BiCGSTAB step exceeds binary64")
        short_residual = _checked_vector(
            [residual[index] - alpha * image_direction[index] for index in range(size)],
            "BiCGSTAB residual exceeds binary64",
        )
        if _norm(short_residual) <= target:
            solution = _checked_vector(
                [
                    solution[index] + alpha * prepared_direction[index]
                    for index in range(size)
                ],
                "BiCGSTAB iterate exceeds binary64",
            )
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
        prepared_short = _checked_vector(
            precondition(short_residual), "preconditioned residual exceeds binary64"
        )
        image_short = _evaluated_matvec(matrix, prepared_short, execution)
        image_norm_squared = _checked_number(
            _dot(image_short, image_short), "BiCGSTAB norm exceeds binary64"
        ).real
        relative_image_norm, image_norm_bound = _relative_inner_magnitude(
            image_short, image_short
        )
        if relative_image_norm.real <= _EPSILON * image_norm_bound:
            return solution, "stagnation"
        omega = _checked_number(
            _dot(image_short, short_residual) / image_norm_squared,
            "BiCGSTAB stabilization step exceeds binary64",
        )
        solution = _checked_vector(
            [
                solution[index]
                + alpha * prepared_direction[index]
                + omega * prepared_short[index]
                for index in range(size)
            ],
            "BiCGSTAB iterate exceeds binary64",
        )
        residual = _checked_vector(
            [
                short_residual[index] - omega * image_short[index]
                for index in range(size)
            ],
            "BiCGSTAB residual exceeds binary64",
        )
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
    _checked_vector(residual_vector, "sparse solve validation exceeds binary64")
    residual_norm = _norm(residual_vector)
    right_norm = _norm(right_hand_side)
    target = max(absolute_tolerance, relative_tolerance * right_norm)
    solution_norm = _norm(solution)
    denominator_scale = max(solution_norm, right_norm, _EPSILON)
    scaled_denominator = (
        _csr_frobenius(matrix) * (solution_norm / denominator_scale)
        + right_norm / denominator_scale
    )
    backward_error = (residual_norm / denominator_scale) / max(
        scaled_denominator, _EPSILON
    )
    backward_threshold = max(
        relative_tolerance,
        _bounded_positive_ratio(absolute_tolerance, max(right_norm, _EPSILON)),
    )
    residual_norm = _bounded_metric(residual_norm)
    target = _bounded_metric(target)
    backward_error = _bounded_metric(backward_error)
    backward_threshold = _bounded_metric(backward_threshold)
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
    input_operator = _as_csr(matrix)
    if input_operator.shape[0] != input_operator.shape[1]:
        raise ValueError("sparse_solve requires a square matrix")
    if input_operator.nnz > max_nonzeros:
        raise ValueError("matrix exceeds max_nonzeros=" + str(max_nonzeros))
    input_vector = _vector(right_hand_side, "right_hand_side")
    if len(input_vector) != input_operator.shape[0]:
        raise ValueError("matrix and right-hand-side dimensions disagree")
    initial = [0.0 + 0.0j for _ in input_vector] if x0 is None else _vector(x0, "x0")
    if len(initial) != len(input_vector):
        raise ValueError("x0 and right-hand-side dimensions disagree")
    if rtol <= 0.0 or atol < 0.0:
        raise ValueError("rtol must be positive and atol must be nonnegative")
    operator, matrix_scale = _scaled_csr(input_operator)
    vector, right_hand_side_scale = _scaled_vector(input_vector)
    hermitian_error = _csr_hermitian_error(operator)
    hermitian_threshold = 100.0 * _EPSILON * max(_csr_frobenius(operator), 1.0)
    is_hermitian = hermitian_error <= hermitian_threshold
    spd_certified, spd_margin = (
        _csr_positive_definite_certificate(operator, hermitian_threshold)
        if is_hermitian
        else (False, 0.0)
    )
    if method == "auto":
        selected = "cg" if spd_certified else "bicgstab"
    elif method in ("cg", "bicgstab"):
        selected = method
    else:
        raise ValueError("method must be 'auto', 'cg', or 'bicgstab'")
    if selected == "cg" and not spd_certified:
        raise ValueError(
            "CG requires a certified strictly diagonally dominant Hermitian "
            "positive-definite matrix; use bicgstab"
        )
    prepared = _preconditioner(operator, preconditioner)
    evaluation_budget = (
        max(4, 2 * max_iterations + 4) if max_evaluations is None else max_evaluations
    )
    problem = _problem(
        "sparse_linear_solve",
        initial_data={
            "matrix": input_operator.to_dict(),
            "right_hand_side": _json_vector(input_vector),
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
            "matrix_scale": matrix_scale,
            "right_hand_side_scale": right_hand_side_scale,
            "spd_certified": spd_certified,
        },
    )
    plan = _plan(
        problem,
        method=selected,
        classification="extension",
        validation=["independent_linear_residual", "normwise_backward_error"],
        reason=(
            "strict Hermitian diagonal dominance with positive diagonal "
            "certifies positive definiteness for conjugate gradients"
            if selected == "cg"
            else "the operator has no sufficient SPD certificate, selecting BiCGSTAB"
        ),
        requires=(
            [
                "finite_square_csr",
                "strictly_diagonally_dominant_hermitian_positive_definite",
            ]
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
        scaled_initial = _rescale_vector(
            initial, [matrix_scale], [right_hand_side_scale]
        )
        normalized_atol = _bounded_positive_ratio(atol, right_hand_side_scale)
        if selected == "cg":
            solution, status = _cg(
                operator,
                vector,
                scaled_initial,
                prepared,
                execution,
                relative_tolerance=rtol,
                absolute_tolerance=normalized_atol,
            )
        else:
            solution, status = _bicgstab(
                operator,
                vector,
                scaled_initial,
                prepared,
                execution,
                relative_tolerance=rtol,
                absolute_tolerance=normalized_atol,
            )
        validation = _validate_sparse_solve(
            operator,
            vector,
            solution,
            relative_tolerance=rtol,
            absolute_tolerance=normalized_atol,
            execution=execution,
        )
        output_solution = _rescale_vector(
            solution, [right_hand_side_scale], [matrix_scale]
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
            value=_json_vector(output_solution),
            validation=validation,
            trace=numerical_trace,
            diagnostics=diagnostics,
            domain_payload={
                "shape": list(operator.shape),
                "nnz": operator.nnz,
                "preconditioner": preconditioner,
                "normalized_hermitian_error": hermitian_error,
                "matrix_scale": matrix_scale,
                "right_hand_side_scale": right_hand_side_scale,
                "spd_certified": spd_certified,
                "normalized_spd_margin": spd_margin,
            },
        )
    except _RepresentationStop as stop:
        return _finish_result(
            problem,
            plan,
            execution,
            status="validation_failed",
            value=None,
            validation=_representation_validation(str(stop)),
            trace=numerical_trace,
            diagnostics=[_representation_diagnostic(str(stop))],
            domain_payload={
                "shape": list(operator.shape),
                "nnz": operator.nnz,
                "matrix_scale": matrix_scale,
                "right_hand_side_scale": right_hand_side_scale,
                "spd_certified": spd_certified,
            },
        )
    except (OverflowError, ZeroDivisionError) as stop:
        reason = "sparse iteration is not representable in binary64: " + str(stop)
        return _finish_result(
            problem,
            plan,
            execution,
            status="validation_failed",
            value=None,
            validation=_representation_validation(reason),
            trace=numerical_trace,
            diagnostics=[_representation_diagnostic(reason)],
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
    _checked_vector(difference, "sparse eigen validation exceeds binary64")
    vector_norm = _norm(eigenvector)
    spectral_scale = max(_csr_frobenius(matrix), abs(eigenvalue), _EPSILON)
    denominator = vector_norm * (
        _csr_frobenius(matrix) / spectral_scale + abs(eigenvalue) / spectral_scale
    )
    residual = (_norm(difference) / spectral_scale) / max(denominator, _EPSILON)
    normalization_error = abs(_dot(eigenvector, eigenvector).real - 1.0)
    rayleigh = _checked_number(
        _dot(eigenvector, image), "sparse eigen validation exceeds binary64"
    )
    rayleigh_error = abs(rayleigh - eigenvalue) / max(abs(eigenvalue), 1.0)
    residual = _bounded_metric(residual)
    normalization_error = _bounded_metric(normalization_error)
    rayleigh_error = _bounded_metric(rayleigh_error)
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
            {
                "kind": "dominant_magnitude_uniqueness_certificate",
                "passed": True,
                "method": "separated_hermitian_gershgorin_intervals",
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
    input_operator = _as_csr(matrix)
    if input_operator.shape[0] != input_operator.shape[1]:
        raise ValueError("sparse_eigen requires a square matrix")
    if input_operator.nnz > max_nonzeros:
        raise ValueError("matrix exceeds max_nonzeros=" + str(max_nonzeros))
    operator, matrix_scale = _scaled_csr(input_operator)
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
    if len(initial) != operator.shape[0] or not any(value != 0.0 for value in initial):
        raise ValueError("x0 must be a nonzero vector matching the matrix")
    dominance_tolerance = max(tolerance, hermitian_threshold)
    dominance_certified, dominant_row, dominance_gap = (
        _csr_dominant_magnitude_certificate(operator, dominance_tolerance)
    )
    evaluation_budget = (
        max(4, 2 * max_iterations + 4) if max_evaluations is None else max_evaluations
    )
    problem = _problem(
        "sparse_dominant_eigen",
        initial_data={
            "matrix": input_operator.to_dict(),
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
            "matrix_scale": matrix_scale,
            "dominant_magnitude_certified": dominance_certified,
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
            "dominant_magnitude_uniqueness_certificate",
        ],
        reason=(
            "separated Hermitian Gershgorin intervals certify a unique "
            "dominant eigenvalue magnitude for bounded power iteration"
        ),
        requires=[
            "finite_hermitian_csr",
            "gershgorin_certified_unique_dominant_eigenvalue_magnitude",
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
    scaled_initial, _ = _scaled_vector(initial)
    vector = _normalize(scaled_initial)
    eigenvalue = 0.0 + 0.0j
    try:
        execution.check()
        if not dominance_certified:
            validation = NumericalValidation(
                "indeterminate",
                False,
                checks=[
                    {
                        "kind": "dominant_magnitude_uniqueness_certificate",
                        "passed": False,
                        "method": "separated_hermitian_gershgorin_intervals",
                    }
                ],
            )
            return _finish_result(
                problem,
                plan,
                execution,
                status="validation_failed",
                value=None,
                validation=validation,
                trace=numerical_trace,
                diagnostics=[
                    NumericalDiagnostic(
                        "ill_conditioned",
                        details={
                            "reason": (
                                "unique dominant eigenvalue magnitude is not "
                                "independently certified"
                            )
                        },
                    )
                ],
                domain_payload={
                    "shape": list(operator.shape),
                    "nnz": operator.nnz,
                    "k": 1,
                    "which": which,
                    "matrix_scale": matrix_scale,
                    "dominant_magnitude_certified": False,
                },
            )
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
            eigenvalue = _checked_number(
                _dot(candidate, candidate_image),
                "power-iteration Rayleigh quotient exceeds binary64",
            )
            residual_vector = _checked_vector(
                [
                    candidate_image[index] - eigenvalue * candidate[index]
                    for index in range(len(candidate))
                ],
                "power-iteration residual exceeds binary64",
            )
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
        output_eigenvalue = _rescale_number(eigenvalue, [matrix_scale])
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
                "eigenvalue": _json_vector([output_eigenvalue])[0],
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
                "normalized_hermitian_error": hermitian_error,
                "matrix_scale": matrix_scale,
                "dominant_magnitude_certified": dominance_certified,
                "dominant_gershgorin_row": dominant_row,
                "normalized_dominance_gap": dominance_gap,
            },
        )
    except _RepresentationStop as stop:
        return _finish_result(
            problem,
            plan,
            execution,
            status="validation_failed",
            value=None,
            validation=_representation_validation(str(stop)),
            trace=numerical_trace,
            diagnostics=[_representation_diagnostic(str(stop))],
            domain_payload={
                "shape": list(operator.shape),
                "nnz": operator.nnz,
                "matrix_scale": matrix_scale,
                "dominant_magnitude_certified": dominance_certified,
            },
        )
    except (OverflowError, ZeroDivisionError) as stop:
        reason = "power iteration is not representable in binary64: " + str(stop)
        return _finish_result(
            problem,
            plan,
            execution,
            status="validation_failed",
            value=None,
            validation=_representation_validation(reason),
            trace=numerical_trace,
            diagnostics=[_representation_diagnostic(reason)],
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
