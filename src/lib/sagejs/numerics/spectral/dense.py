"""Validated dense eigenvalue and singular-value computations."""

from __future__ import annotations

import cmath
import math
from collections.abc import Callable, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalResult, NumericalValidation
from ..trace import NumericalTrace
from ._common import (
    _EPSILON,
    _bounded_metric,
    _BudgetStop,
    _columns,
    _conjugate,
    _conjugate_transpose,
    _dot,
    _empty_validation,
    _Execution,
    _finish_result,
    _finite_matrix,
    _finite_vector,
    _frobenius,
    _from_columns,
    _identity,
    _json_matrix,
    _json_vector,
    _matmul,
    _matrix,
    _matrix_difference_norm,
    _matvec,
    _norm,
    _normalize,
    _orthogonality_error,
    _plan,
    _problem,
    _representation_diagnostic,
    _representation_validation,
    _RepresentationStop,
    _rescale_matrix,
    _rescale_vector,
    _scaled_matrix,
    _scaled_vector,
)


def _dense_options(
    *,
    max_iterations: int,
    max_elapsed_ms: int,
    trace: str,
    max_trace_events: int,
    max_trace_bytes: int,
) -> dict[str, Any]:
    return {
        "max_iterations": max_iterations,
        "max_evaluations": max(256, max_iterations),
        "max_elapsed_ms": max_elapsed_ms,
        "trace": trace,
        "max_trace_events": max_trace_events,
        "max_trace_bytes": max_trace_bytes,
    }


def _check_size(matrix: Sequence[Sequence[complex]], max_matrix_elements: int) -> None:
    if (
        isinstance(max_matrix_elements, bool)
        or not isinstance(max_matrix_elements, int)
        or max_matrix_elements <= 0
    ):
        raise ValueError("max_matrix_elements must be a positive integer")
    columns = len(matrix[0]) if matrix else 0
    if len(matrix) * columns > max_matrix_elements:
        raise ValueError(
            "matrix exceeds max_matrix_elements=" + str(max_matrix_elements)
        )


def _hermitian_error(matrix: Sequence[Sequence[complex]]) -> float:
    size = len(matrix)
    return _norm(
        [
            matrix[row][column] - _conjugate(matrix[column][row])
            for row in range(size)
            for column in range(size)
        ]
    )


def _apply_hermitian_rotation(
    matrix: list[list[complex]],
    vectors: list[list[complex]],
    left: int,
    right: int,
    cosine: float,
    sine: float,
    phase: complex,
) -> None:
    size = len(matrix)
    for row in range(size):
        old_left = matrix[row][left]
        old_right = matrix[row][right]
        matrix[row][left] = cosine * old_left - sine * _conjugate(phase) * old_right
        matrix[row][right] = sine * phase * old_left + cosine * old_right
    old_left_row = list(matrix[left])
    old_right_row = list(matrix[right])
    for column in range(size):
        matrix[left][column] = (
            cosine * old_left_row[column] - sine * phase * old_right_row[column]
        )
        matrix[right][column] = (
            sine * _conjugate(phase) * old_left_row[column]
            + cosine * old_right_row[column]
        )
    matrix[left][right] = 0.0 + 0.0j
    matrix[right][left] = 0.0 + 0.0j
    matrix[left][left] = complex(matrix[left][left].real, 0.0)
    matrix[right][right] = complex(matrix[right][right].real, 0.0)
    for row in range(size):
        old_left = vectors[row][left]
        old_right = vectors[row][right]
        vectors[row][left] = cosine * old_left - sine * _conjugate(phase) * old_right
        vectors[row][right] = sine * phase * old_left + cosine * old_right


def _jacobi_hermitian(
    matrix: Sequence[Sequence[complex]],
    execution: _Execution,
    *,
    tolerance: float,
) -> tuple[list[float], list[list[complex]], bool]:
    size = len(matrix)
    work = [list(row) for row in matrix]
    vectors = _identity(size)
    scale = max(_frobenius(work), 1.0)
    converged = size <= 1
    while not converged:
        sweep = execution.iteration()
        maximum = 0.0
        off_diagonal_values: list[complex] = []
        rotations = 0
        for left in range(size - 1):
            for right in range(left + 1, size):
                execution.check()
                coupling = work[left][right]
                magnitude = abs(coupling)
                maximum = max(maximum, magnitude)
                off_diagonal_values.extend((coupling, _conjugate(coupling)))
                local_scale = max(
                    math.sqrt(abs(work[left][left]))
                    * math.sqrt(abs(work[right][right])),
                    _EPSILON,
                )
                if magnitude <= tolerance * max(1.0, local_scale):
                    continue
                phase = coupling / magnitude
                tau = (work[right][right].real - work[left][left].real) / (
                    2.0 * magnitude
                )
                tangent = (1.0 if tau >= 0.0 else -1.0) / (
                    abs(tau) + math.sqrt(1.0 + tau * tau)
                )
                cosine = 1.0 / math.sqrt(1.0 + tangent * tangent)
                sine = tangent * cosine
                _apply_hermitian_rotation(
                    work, vectors, left, right, cosine, sine, phase
                )
                rotations += 1
        off_diagonal = _norm(off_diagonal_values)
        execution.trace.append(
            "iteration",
            iteration=sweep,
            accepted=True,
            data={
                "phase": "jacobi_sweep",
                "off_diagonal_norm": off_diagonal,
                "maximum_coupling": maximum,
                "rotations": rotations,
            },
        )
        converged = maximum <= tolerance * scale or rotations == 0
    eigenvalues = [float(work[index][index].real) for index in range(size)]
    columns = _columns(vectors)
    order = sorted(range(size), key=lambda index: eigenvalues[index])
    return (
        [eigenvalues[index] for index in order],
        _from_columns([columns[index] for index in order]),
        converged,
    )


def _validate_eigen(
    matrix: Sequence[Sequence[complex]],
    eigenvalues: Sequence[complex],
    eigenvectors: Sequence[Sequence[complex]],
    *,
    include_eigenvector_orthogonality: bool,
    require_independent_eigenbasis: bool = False,
    schur_form: Sequence[Sequence[complex]] | None = None,
    schur_vectors: Sequence[Sequence[complex]] | None = None,
    tolerance: float,
) -> NumericalValidation:
    columns = _columns(eigenvectors)
    matrix_norm = max(_frobenius(matrix), _EPSILON)
    residuals: list[float] = []
    for index in range(len(eigenvalues)):
        vector = columns[index]
        image = _matvec(matrix, vector)
        difference = [
            image[row] - eigenvalues[index] * vector[row] for row in range(len(vector))
        ]
        denominator = matrix_norm * _norm(vector) + abs(eigenvalues[index]) * _norm(
            vector
        )
        residuals.append(
            _bounded_metric(_norm(difference) / max(denominator, _EPSILON))
        )
    maximum_residual = max(residuals, default=0.0)
    checks: list[dict[str, Any]] = [
        {
            "kind": "eigenpair_backward_residual",
            "passed": maximum_residual <= tolerance,
            "maximum": maximum_residual,
            "values": residuals,
            "threshold": tolerance,
        }
    ]
    passed = maximum_residual <= tolerance
    if include_eigenvector_orthogonality:
        orthogonality = _orthogonality_error(columns)
        orthogonality_threshold = tolerance * max(1, len(columns))
        checks.append(
            {
                "kind": "eigenvector_orthogonality",
                "passed": orthogonality <= orthogonality_threshold,
                "value": orthogonality,
                "threshold": orthogonality_threshold,
            }
        )
        reconstructed = [
            [
                sum(
                    (
                        eigenvalues[index]
                        * columns[index][row]
                        * _conjugate(columns[index][column])
                        for index in range(len(columns))
                    ),
                    0.0 + 0.0j,
                )
                for column in range(len(matrix))
            ]
            for row in range(len(matrix))
        ]
        reconstruction = _bounded_metric(
            _matrix_difference_norm(matrix, reconstructed) / matrix_norm
        )
        reconstruction_threshold = tolerance * max(1, len(columns))
        checks.append(
            {
                "kind": "spectral_reconstruction",
                "passed": reconstruction <= reconstruction_threshold,
                "value": reconstruction,
                "threshold": reconstruction_threshold,
            }
        )
        passed = (
            passed
            and orthogonality <= orthogonality_threshold
            and reconstruction <= reconstruction_threshold
        )
    if require_independent_eigenbasis:
        basis = _from_columns(columns)
        inverse, reciprocal_condition, inverse_residual = _validated_inverse(basis)
        condition_threshold = max(
            math.sqrt(_EPSILON) * max(1, len(columns)), 10.0 * tolerance
        )
        condition_passed = reciprocal_condition >= condition_threshold
        inverse_threshold = tolerance * max(1, len(columns))
        inverse_passed = (
            inverse_residual is not None and inverse_residual <= inverse_threshold
        )
        checks.extend(
            [
                {
                    "kind": "eigenbasis_reciprocal_condition",
                    "passed": condition_passed,
                    "value": reciprocal_condition,
                    "threshold": condition_threshold,
                    "comparison": "greater_than_or_equal",
                },
                {
                    "kind": "eigenbasis_inverse_residual",
                    "passed": inverse_passed,
                    "value": inverse_residual,
                    "threshold": inverse_threshold,
                },
            ]
        )
        reconstruction_passed = False
        reconstruction: float | None = None
        if inverse is not None:
            scaled_basis = [
                [
                    basis[row][column] * eigenvalues[column]
                    for column in range(len(columns))
                ]
                for row in range(len(basis))
            ]
            reconstructed = _matmul(scaled_basis, inverse)
            reconstruction = (
                _matrix_difference_norm(matrix, reconstructed) / matrix_norm
            )
            reconstruction_passed = reconstruction <= inverse_threshold
        checks.append(
            {
                "kind": "eigenbasis_reconstruction",
                "passed": reconstruction_passed,
                "value": reconstruction,
                "threshold": inverse_threshold,
            }
        )
        passed = (
            passed and condition_passed and inverse_passed and reconstruction_passed
        )
    if schur_form is not None and schur_vectors is not None:
        schur_columns = _columns(schur_vectors)
        orthogonality = _orthogonality_error(schur_columns)
        reconstructed = _matmul(
            _matmul(schur_vectors, schur_form),
            _conjugate_transpose(schur_vectors),
        )
        reconstruction = _bounded_metric(
            _matrix_difference_norm(matrix, reconstructed) / matrix_norm
        )
        schur_threshold = tolerance * max(1, len(matrix))
        checks.extend(
            [
                {
                    "kind": "schur_vector_orthogonality",
                    "passed": orthogonality <= schur_threshold,
                    "value": orthogonality,
                    "threshold": schur_threshold,
                },
                {
                    "kind": "schur_reconstruction",
                    "passed": reconstruction <= schur_threshold,
                    "value": reconstruction,
                    "threshold": schur_threshold,
                },
            ]
        )
        passed = (
            passed
            and orthogonality <= schur_threshold
            and reconstruction <= schur_threshold
        )
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=checks,
        residual=maximum_residual,
        error_estimate=maximum_residual,
    )


def _validated_inverse(
    matrix: Sequence[Sequence[complex]],
) -> tuple[list[list[complex]] | None, float, float | None]:
    """Invert a candidate eigenbasis and expose an independent condition witness."""
    size = len(matrix)
    if size == 0:
        return [], 1.0, 0.0
    scale = max(_frobenius(matrix), _EPSILON)
    identity = _identity(size)
    augmented = [list(matrix[row]) + identity[row] for row in range(size)]
    pivot_floor = _EPSILON * max(1, size) * scale
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) <= pivot_floor:
            return None, 0.0, None
        if pivot != column:
            augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [value / divisor for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            coefficient = augmented[row][column]
            if coefficient == 0.0:
                continue
            augmented[row] = [
                augmented[row][index] - coefficient * augmented[column][index]
                for index in range(2 * size)
            ]
    inverse = [row[size:] for row in augmented]
    inverse_norm = _frobenius(inverse)
    reciprocal_condition = min(1.0, size / max(scale * inverse_norm, _EPSILON))
    identity_residual = _bounded_metric(
        _matrix_difference_norm(_matmul(matrix, inverse), identity) / math.sqrt(size)
    )
    return inverse, reciprocal_condition, identity_residual


def symmetric_eigen(
    matrix: Sequence[Sequence[Any]],
    *,
    tolerance: float = 1e-12,
    symmetry_tolerance: float = 1e-13,
    max_iterations: int = 80,
    max_elapsed_ms: int = 30_000,
    max_matrix_elements: int = 65_536,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    cancel: Callable[[], bool] | None = None,
) -> NumericalResult:
    """Return a validated eigensystem for a finite Hermitian matrix.

    A cyclic Jacobi method is used because its convergence events, unitary
    transformations, and same-source fallback are directly inspectable.
    """
    values = _matrix(matrix, square=True)
    _check_size(values, max_matrix_elements)
    if tolerance <= 0.0 or symmetry_tolerance < 0.0:
        raise ValueError("tolerances must be positive")
    scaled_values, input_scale = _scaled_matrix(values)
    hermitian_error = _hermitian_error(scaled_values)
    matrix_norm = max(_frobenius(scaled_values), 1.0)
    if hermitian_error > symmetry_tolerance * matrix_norm:
        raise ValueError("symmetric_eigen requires a Hermitian matrix")
    options = _dense_options(
        max_iterations=max_iterations,
        max_elapsed_ms=max_elapsed_ms,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )
    problem = _problem(
        "symmetric_eigen",
        initial_data={"matrix": _json_matrix(values)},
        method="cyclic_jacobi",
        metadata={
            "shape": [len(values), len(values)],
            "tolerance": tolerance,
            "symmetry_tolerance": symmetry_tolerance,
            "max_matrix_elements": max_matrix_elements,
            "input_scale": input_scale,
        },
        **options,
    )
    plan = _plan(
        problem,
        method="cyclic_jacobi",
        classification="translated",
        validation=[
            "eigenpair_backward_residual",
            "eigenvector_orthogonality",
            "spectral_reconstruction",
        ],
        reason="a finite Hermitian matrix admits a traceable unitary Jacobi iteration",
        requires=["finite_hermitian_matrix"],
    )
    numerical_trace = NumericalTrace(problem.trace_policy)
    numerical_trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": plan.method,
            "size": len(values),
        },
        important=True,
        force=True,
    )
    execution = _Execution(problem, numerical_trace, cancel)
    try:
        eigenvalues, eigenvectors, _ = _jacobi_hermitian(
            scaled_values, execution, tolerance=tolerance
        )
        if not _finite_vector(eigenvalues) or not _finite_matrix(eigenvectors):
            raise _RepresentationStop("Hermitian iteration produced non-finite factors")
        validation = _validate_eigen(
            scaled_values,
            [complex(value) for value in eigenvalues],
            eigenvectors,
            include_eigenvector_orthogonality=True,
            tolerance=max(50.0 * len(values) * _EPSILON, 10.0 * tolerance),
        )
        output_eigenvalues = [
            value.real
            for value in _rescale_vector(
                [complex(value) for value in eigenvalues], [input_scale]
            )
        ]
        value = {
            "eigenvalues": output_eigenvalues,
            "eigenvectors": _json_matrix(eigenvectors),
        }
        return _finish_result(
            problem,
            plan,
            execution,
            status="converged",
            value=value,
            validation=validation,
            trace=numerical_trace,
            domain_payload={
                "structure": "hermitian",
                "hermitian_input_error": hermitian_error,
                "input_scale": input_scale,
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
    except _RepresentationStop as stop:
        reason = str(stop)
        return _finish_result(
            problem,
            plan,
            execution,
            status="validation_failed",
            value=None,
            validation=_representation_validation(reason),
            trace=numerical_trace,
            diagnostics=[_representation_diagnostic(reason)],
            domain_payload={"structure": "hermitian", "input_scale": input_scale},
        )


def _householder_qr(
    matrix: Sequence[Sequence[complex]],
) -> tuple[list[list[complex]], list[list[complex]]]:
    rows = len(matrix)
    columns = len(matrix[0]) if rows else 0
    work = [list(row) for row in matrix]
    unitary = _identity(rows)
    for column in range(min(rows, columns)):
        vector = [work[row][column] for row in range(column, rows)]
        vector, _ = _scaled_vector(vector)
        length = _norm(vector)
        if length <= _EPSILON:
            continue
        phase = vector[0] / abs(vector[0]) if vector[0] != 0 else 1.0 + 0.0j
        vector[0] += phase * length
        vector_norm_squared = _dot(vector, vector).real
        if vector_norm_squared <= _EPSILON:
            continue
        beta = 2.0 / vector_norm_squared
        for target_column in range(column, columns):
            projection = sum(
                (
                    _conjugate(vector[index]) * work[column + index][target_column]
                    for index in range(len(vector))
                ),
                0.0 + 0.0j,
            )
            for index in range(len(vector)):
                work[column + index][target_column] -= beta * vector[index] * projection
        for row in range(rows):
            projection = sum(
                (
                    unitary[row][column + index] * vector[index]
                    for index in range(len(vector))
                ),
                0.0 + 0.0j,
            )
            for index in range(len(vector)):
                unitary[row][column + index] -= (
                    beta * projection * _conjugate(vector[index])
                )
    return unitary, work


def _wilkinson_shift(matrix: Sequence[Sequence[complex]], active: int) -> complex:
    if active <= 1:
        return matrix[0][0]
    upper = matrix[active - 2][active - 2]
    right = matrix[active - 2][active - 1]
    left = matrix[active - 1][active - 2]
    lower = matrix[active - 1][active - 1]
    discriminant = cmath.sqrt((upper - lower) * (upper - lower) + 4.0 * right * left)
    first = 0.5 * (upper + lower + discriminant)
    second = 0.5 * (upper + lower - discriminant)
    return first if abs(first - lower) <= abs(second - lower) else second


def _general_schur(
    matrix: Sequence[Sequence[complex]],
    execution: _Execution,
    *,
    tolerance: float,
) -> tuple[list[list[complex]], list[list[complex]]]:
    size = len(matrix)
    schur = [list(row) for row in matrix]
    vectors = _identity(size)
    scale = max(_frobenius(matrix), 1.0)
    active = size
    while active > 1:
        execution.check()
        coupling = _norm(schur[active - 1][: active - 1])
        if coupling <= tolerance * scale:
            for column in range(active - 1):
                schur[active - 1][column] = 0.0 + 0.0j
            execution.trace.append(
                "phase",
                iteration=execution.iterations,
                data={
                    "phase": "deflation",
                    "active_size": active,
                    "coupling_norm": coupling,
                },
                important=True,
            )
            active -= 1
            continue
        iteration = execution.iteration()
        shift = _wilkinson_shift(schur, active)
        block = [
            [
                schur[row][column] - (shift if row == column else 0.0)
                for column in range(active)
            ]
            for row in range(active)
        ]
        unitary, upper = _householder_qr(block)
        updated = _matmul(upper, unitary)
        for index in range(active):
            updated[index][index] += shift
        if active < size:
            upper_right = [row[active:size] for row in schur[:active]]
            upper_right = _matmul(_conjugate_transpose(unitary), upper_right)
            for row in range(active):
                for column in range(active, size):
                    schur[row][column] = upper_right[row][column - active]
        for row in range(active):
            for column in range(active):
                schur[row][column] = updated[row][column]
        leading_vectors = [row[:active] for row in vectors]
        leading_vectors = _matmul(leading_vectors, unitary)
        for row in range(size):
            for column in range(active):
                vectors[row][column] = leading_vectors[row][column]
        lower_norm = _norm(
            [schur[row][column] for row in range(1, active) for column in range(row)]
        )
        execution.trace.append(
            "iteration",
            iteration=iteration,
            accepted=True,
            data={
                "phase": "shifted_qr",
                "active_size": active,
                "lower_triangle_norm": lower_norm,
                "shift": _json_vector([shift])[0],
            },
        )
    return schur, vectors


def _triangular_eigenvectors(
    triangular: Sequence[Sequence[complex]],
    schur_vectors: Sequence[Sequence[complex]],
    tolerance: float,
) -> tuple[list[complex], list[list[complex]], bool]:
    size = len(triangular)
    scale = max(_frobenius(triangular), 1.0)
    eigenvalues = [triangular[index][index] for index in range(size)]
    columns: list[list[complex]] = []
    ill_conditioned = False
    for eigen_index in range(size):
        value = eigenvalues[eigen_index]
        vector = [0.0 + 0.0j for _ in range(size)]
        vector[eigen_index] = 1.0 + 0.0j
        for row in range(eigen_index - 1, -1, -1):
            numerator = -sum(
                (
                    triangular[row][column] * vector[column]
                    for column in range(row + 1, eigen_index + 1)
                ),
                0.0 + 0.0j,
            )
            denominator = triangular[row][row] - value
            floor = tolerance * scale
            if abs(denominator) <= floor:
                if abs(numerator) <= floor:
                    vector[row] = 0.0 + 0.0j
                    continue
                ill_conditioned = True
                phase = (
                    denominator / abs(denominator) if denominator != 0 else 1.0 + 0.0j
                )
                denominator = floor * phase
            vector[row] = numerator / denominator
            largest = max(abs(item) for item in vector)
            if largest > 1.0e100:
                vector = [item / largest for item in vector]
        columns.append(_normalize(_matvec(schur_vectors, vector)))
    return eigenvalues, _from_columns(columns), ill_conditioned


def general_eigen(
    matrix: Sequence[Sequence[Any]],
    *,
    tolerance: float = 1e-12,
    max_iterations: int = 512,
    max_elapsed_ms: int = 30_000,
    max_matrix_elements: int = 4_096,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    cancel: Callable[[], bool] | None = None,
) -> NumericalResult:
    """Return right eigenvectors and a complex Schur form for a square matrix.

    The production envelope is finite complex binary64 matrices up to the
    explicit allocation cap. Defective or tightly clustered problems may be
    returned only with failed/indeterminate validation.
    """
    values = _matrix(matrix, square=True)
    _check_size(values, max_matrix_elements)
    if tolerance <= 0.0:
        raise ValueError("tolerance must be positive")
    scaled_values, input_scale = _scaled_matrix(values)
    options = _dense_options(
        max_iterations=max_iterations,
        max_elapsed_ms=max_elapsed_ms,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )
    problem = _problem(
        "general_eigen",
        initial_data={"matrix": _json_matrix(values)},
        method="complex_shifted_qr",
        metadata={
            "shape": [len(values), len(values)],
            "tolerance": tolerance,
            "max_matrix_elements": max_matrix_elements,
            "input_scale": input_scale,
        },
        **options,
    )
    plan = _plan(
        problem,
        method="complex_shifted_qr",
        classification="extension",
        validation=[
            "eigenpair_backward_residual",
            "eigenbasis_reciprocal_condition",
            "eigenbasis_inverse_residual",
            "eigenbasis_reconstruction",
            "schur_vector_orthogonality",
            "schur_reconstruction",
        ],
        reason="a complex shifted QR iteration exposes bounded deflation and Schur evidence",
        requires=["finite_square_matrix", "validated_diagonalizable_eigenbasis"],
    )
    numerical_trace = NumericalTrace(problem.trace_policy)
    numerical_trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": plan.method,
            "size": len(values),
        },
        important=True,
        force=True,
    )
    execution = _Execution(problem, numerical_trace, cancel)
    diagnostics: list[NumericalDiagnostic] = []
    try:
        schur, schur_vectors = _general_schur(
            scaled_values, execution, tolerance=tolerance
        )
        eigenvalues, eigenvectors, ill_conditioned = _triangular_eigenvectors(
            schur, schur_vectors, tolerance
        )
        if (
            not _finite_matrix(schur)
            or not _finite_matrix(schur_vectors)
            or not _finite_vector(eigenvalues)
            or not _finite_matrix(eigenvectors)
        ):
            raise _RepresentationStop(
                "general eigen iteration produced non-finite factors"
            )
        if ill_conditioned:
            diagnostics.append(
                NumericalDiagnostic(
                    "ill_conditioned",
                    details={"reason": "clustered_or_defective_eigenvectors"},
                )
            )
        validation = _validate_eigen(
            scaled_values,
            eigenvalues,
            eigenvectors,
            include_eigenvector_orthogonality=False,
            require_independent_eigenbasis=True,
            schur_form=schur,
            schur_vectors=schur_vectors,
            tolerance=max(500.0 * len(values) * _EPSILON, 50.0 * tolerance),
        )
        if not validation.passed and all(
            diagnostic.code != "ill_conditioned" for diagnostic in diagnostics
        ):
            diagnostics.append(
                NumericalDiagnostic(
                    "ill_conditioned",
                    details={"reason": "general_eigenbasis_or_schur_validation_failed"},
                )
            )
        value = None
        if validation.passed:
            output_eigenvalues = _rescale_vector(eigenvalues, [input_scale])
            output_schur = _rescale_matrix(schur, [input_scale])
            value = {
                "eigenvalues": _json_vector(output_eigenvalues),
                "eigenvectors": _json_matrix(eigenvectors),
                "schur_form": _json_matrix(output_schur),
                "schur_vectors": _json_matrix(schur_vectors),
            }
        return _finish_result(
            problem,
            plan,
            execution,
            status="converged" if validation.passed else "validation_failed",
            value=value,
            validation=validation,
            trace=numerical_trace,
            diagnostics=diagnostics,
            domain_payload={
                "structure": "general",
                "eigenvector_orthogonality_applicable": False,
                "input_scale": input_scale,
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
            diagnostics=diagnostics,
        )
    except _RepresentationStop as stop:
        reason = str(stop)
        return _finish_result(
            problem,
            plan,
            execution,
            status="validation_failed",
            value=None,
            validation=_representation_validation(reason),
            trace=numerical_trace,
            diagnostics=diagnostics + [_representation_diagnostic(reason)],
            domain_payload={"structure": "general", "input_scale": input_scale},
        )


def _orthogonal_completion(columns: list[list[complex]], size: int) -> list[complex]:
    for candidate_index in range(size):
        candidate = [
            1.0 + 0.0j if row == candidate_index else 0.0 + 0.0j for row in range(size)
        ]
        for _ in range(2):
            for column in columns:
                projection = _dot(column, candidate)
                candidate = [
                    candidate[row] - projection * column[row] for row in range(size)
                ]
        if _norm(candidate) > 128.0 * _EPSILON:
            return _normalize(candidate)
    return [0.0 + 0.0j for _ in range(size)]


def _jacobi_svd_tall(
    matrix: Sequence[Sequence[complex]],
    execution: _Execution,
    *,
    tolerance: float,
) -> tuple[list[list[complex]], list[float], list[list[complex]]]:
    rows = len(matrix)
    columns_count = len(matrix[0]) if rows else 0
    columns = _columns(matrix)
    right_columns = _columns(_identity(columns_count))
    converged = columns_count <= 1
    while not converged:
        sweep = execution.iteration()
        maximum_correlation = 0.0
        rotations = 0
        for left in range(columns_count - 1):
            for right in range(left + 1, columns_count):
                execution.check()
                left_norm = _norm(columns[left])
                right_norm = _norm(columns[right])
                if left_norm == 0.0 or right_norm == 0.0:
                    continue
                normalized_coupling = _dot(
                    [value / left_norm for value in columns[left]],
                    [value / right_norm for value in columns[right]],
                )
                correlation = abs(normalized_coupling)
                maximum_correlation = max(maximum_correlation, correlation)
                if correlation <= tolerance:
                    continue
                pair_scale = max(left_norm, right_norm)
                scaled_left_norm = left_norm / pair_scale
                scaled_right_norm = right_norm / pair_scale
                alpha = scaled_left_norm * scaled_left_norm
                beta = scaled_right_norm * scaled_right_norm
                coupling = normalized_coupling * scaled_left_norm * scaled_right_norm
                magnitude = abs(coupling)
                if magnitude == 0.0:
                    continue
                phase = coupling / magnitude
                tau = (beta - alpha) / (2.0 * magnitude)
                tangent = (1.0 if tau >= 0.0 else -1.0) / (
                    abs(tau) + math.sqrt(1.0 + tau * tau)
                )
                cosine = 1.0 / math.sqrt(1.0 + tangent * tangent)
                sine = tangent * cosine
                old_left = columns[left]
                old_right = columns[right]
                columns[left] = [
                    cosine * old_left[row] - sine * _conjugate(phase) * old_right[row]
                    for row in range(rows)
                ]
                columns[right] = [
                    sine * phase * old_left[row] + cosine * old_right[row]
                    for row in range(rows)
                ]
                old_left_v = right_columns[left]
                old_right_v = right_columns[right]
                right_columns[left] = [
                    cosine * old_left_v[row]
                    - sine * _conjugate(phase) * old_right_v[row]
                    for row in range(columns_count)
                ]
                right_columns[right] = [
                    sine * phase * old_left_v[row] + cosine * old_right_v[row]
                    for row in range(columns_count)
                ]
                rotations += 1
        execution.trace.append(
            "iteration",
            iteration=sweep,
            accepted=True,
            data={
                "phase": "one_sided_jacobi_sweep",
                "maximum_column_correlation": maximum_correlation,
                "rotations": rotations,
            },
        )
        converged = maximum_correlation <= tolerance or rotations == 0
    singular_values = [_norm(column) for column in columns]
    order = sorted(
        range(columns_count), key=lambda index: singular_values[index], reverse=True
    )
    singular_values = [singular_values[index] for index in order]
    columns = [columns[index] for index in order]
    right_columns = [right_columns[index] for index in order]
    left_columns: list[list[complex]] = []
    largest = singular_values[0] if singular_values else 0.0
    zero_threshold = max(rows, columns_count) * _EPSILON * max(largest, 1.0)
    for index in range(columns_count):
        if singular_values[index] > zero_threshold:
            left_columns.append(
                [value / singular_values[index] for value in columns[index]]
            )
        else:
            left_columns.append(_orthogonal_completion(left_columns, rows))
            singular_values[index] = 0.0
    left_matrix = _from_columns(left_columns)
    right_matrix = _from_columns(right_columns)
    return left_matrix, singular_values, _conjugate_transpose(right_matrix)


def _validate_svd(
    matrix: Sequence[Sequence[complex]],
    left: Sequence[Sequence[complex]],
    singular_values: Sequence[float],
    right_transpose: Sequence[Sequence[complex]],
    tolerance: float,
) -> NumericalValidation:
    rank = len(singular_values)
    scaled_left = [
        [left[row][column] * singular_values[column] for column in range(rank)]
        for row in range(len(left))
    ]
    reconstructed = _matmul(scaled_left, right_transpose)
    matrix_norm = max(_frobenius(matrix), _EPSILON)
    reconstruction = _bounded_metric(
        _matrix_difference_norm(matrix, reconstructed) / matrix_norm
    )
    left_orthogonality = _orthogonality_error(_columns(left))
    right_orthogonality = _orthogonality_error(
        _columns(_conjugate_transpose(right_transpose))
    )
    passed = (
        reconstruction <= tolerance
        and left_orthogonality <= tolerance
        and right_orthogonality <= tolerance
    )
    checks = [
        {
            "kind": "svd_reconstruction",
            "passed": reconstruction <= tolerance,
            "value": reconstruction,
            "threshold": tolerance,
        },
        {
            "kind": "left_singular_vector_orthogonality",
            "passed": left_orthogonality <= tolerance,
            "value": left_orthogonality,
            "threshold": tolerance,
        },
        {
            "kind": "right_singular_vector_orthogonality",
            "passed": right_orthogonality <= tolerance,
            "value": right_orthogonality,
            "threshold": tolerance,
        },
    ]
    condition = None
    if singular_values:
        largest = singular_values[0]
        smallest = singular_values[-1]
        if smallest > 0.0:
            condition = _bounded_metric(largest / smallest)
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=checks,
        residual=reconstruction,
        error_estimate=reconstruction,
        condition_estimate=condition,
    )


def singular_value_decomposition(
    matrix: Sequence[Sequence[Any]],
    *,
    tolerance: float = 1e-12,
    max_iterations: int = 100,
    max_elapsed_ms: int = 30_000,
    max_matrix_elements: int = 65_536,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    cancel: Callable[[], bool] | None = None,
) -> NumericalResult:
    """Return the reduced SVD `A = U diag(s) Vh` with validation evidence."""
    values = _matrix(matrix)
    _check_size(values, max_matrix_elements)
    if tolerance <= 0.0:
        raise ValueError("tolerance must be positive")
    scaled_values, input_scale = _scaled_matrix(values)
    rows = len(values)
    columns_count = len(values[0])
    options = _dense_options(
        max_iterations=max_iterations,
        max_elapsed_ms=max_elapsed_ms,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )
    problem = _problem(
        "singular_value_decomposition",
        initial_data={"matrix": _json_matrix(values)},
        method="one_sided_jacobi",
        metadata={
            "shape": [rows, columns_count],
            "tolerance": tolerance,
            "max_matrix_elements": max_matrix_elements,
            "full_matrices": False,
            "input_scale": input_scale,
        },
        **options,
    )
    plan = _plan(
        problem,
        method="one_sided_jacobi",
        classification="translated",
        validation=[
            "svd_reconstruction",
            "left_singular_vector_orthogonality",
            "right_singular_vector_orthogonality",
        ],
        reason="one-sided Jacobi preserves a readable same-source path and relative column tests",
        requires=["finite_rectangular_matrix", "reduced_svd"],
    )
    numerical_trace = NumericalTrace(problem.trace_policy)
    numerical_trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": plan.method,
            "shape": [rows, columns_count],
        },
        important=True,
        force=True,
    )
    execution = _Execution(problem, numerical_trace, cancel)
    try:
        if rows >= columns_count:
            left, singular_values, right_transpose = _jacobi_svd_tall(
                scaled_values, execution, tolerance=tolerance
            )
        else:
            transposed = _conjugate_transpose(scaled_values)
            transposed_left, singular_values, transposed_right = _jacobi_svd_tall(
                transposed, execution, tolerance=tolerance
            )
            left = _conjugate_transpose(transposed_right)
            right_transpose = _conjugate_transpose(transposed_left)
        if (
            not _finite_matrix(left)
            or not _finite_vector(singular_values)
            or not _finite_matrix(right_transpose)
        ):
            raise _RepresentationStop("SVD iteration produced non-finite factors")
        validation_tolerance = max(
            500.0 * max(rows, columns_count) * _EPSILON,
            50.0 * tolerance,
        )
        validation = _validate_svd(
            scaled_values,
            left,
            singular_values,
            right_transpose,
            validation_tolerance,
        )
        diagnostics: list[NumericalDiagnostic] = []
        if singular_values and singular_values[-1] <= (
            max(rows, columns_count) * _EPSILON * max(singular_values[0], 1.0)
        ):
            diagnostics.append(
                NumericalDiagnostic(
                    "ill_conditioned", details={"reason": "numerically_rank_deficient"}
                )
            )
        output_singular_values = [
            value.real
            for value in _rescale_vector(
                [complex(value) for value in singular_values], [input_scale]
            )
        ]
        value = {
            "u": _json_matrix(left),
            "singular_values": output_singular_values,
            "vh": _json_matrix(right_transpose),
        }
        return _finish_result(
            problem,
            plan,
            execution,
            status="converged",
            value=value,
            validation=validation,
            trace=numerical_trace,
            diagnostics=diagnostics,
            domain_payload={
                "shape": [rows, columns_count],
                "full_matrices": False,
                "input_scale": input_scale,
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
    except _RepresentationStop as stop:
        reason = str(stop)
        return _finish_result(
            problem,
            plan,
            execution,
            status="validation_failed",
            value=None,
            validation=_representation_validation(reason),
            trace=numerical_trace,
            diagnostics=[_representation_diagnostic(reason)],
            domain_payload={
                "shape": [rows, columns_count],
                "full_matrices": False,
                "input_scale": input_scale,
            },
        )


eigh = symmetric_eigen
eig = general_eigen
svd = singular_value_decomposition
