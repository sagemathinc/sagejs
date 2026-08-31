"""Kaps--Rentrop Rosenbrock4 linearly implicit stepper.

The coefficients and stage organization are the published fourth-order
Rosenbrock method used by Boost.Odeint's `rosenbrock4` stepper.  One pivoted LU
factorization is reused by every stage.  This module deliberately contains no
solver policy, callbacks, or result construction.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

VectorFunction = Callable[[float, Sequence[float]], list[float]]
JacobianFunction = Callable[
    [float, Sequence[float], Sequence[float]], list[list[float]]
]
TimeDerivativeFunction = Callable[
    [float, Sequence[float], Sequence[float], float], list[float]
]

_GAMMA = 0.25
_D = (0.25, -0.1043, 0.1035, 0.03620000000000023)
_C = (0.386, 0.21, 0.63)
_A21 = 1.544
_A31 = 0.9466785280815826
_A32 = 0.2557011698983284
_A41 = 3.314825187068521
_A42 = 2.896124015972201
_A43 = 0.9986419139977817
_A51 = 1.221224509226641
_A52 = 6.019134481288629
_A53 = 12.53708332932087
_A54 = -0.687886036105895
_C21 = -5.6688
_C31 = -2.430093356833875
_C32 = -0.2063599157091915
_C41 = -0.1073529058151375
_C42 = -9.594562251023355
_C43 = -20.47028614809616
_C51 = 7.496443313967647
_C52 = -10.24680431464352
_C53 = -33.99990352819905
_C54 = 11.7089089320616
_C61 = 8.083246795921522
_C62 = -7.981132988064893
_C63 = -31.52159432874371
_C64 = 16.31930543123136
_C65 = -6.058818238834054
_PIVOT_FACTOR = 128.0 * 2.220446049250313e-16
_LINEAR_RESIDUAL_LIMIT = 1e-10


class RosenbrockLinearSolveError(ArithmeticError):
    """A singular or independently inaccurate stage linear solve."""

    def __init__(self, reason: str, residual: float | None = None) -> None:
        self.reason = reason
        self.residual = residual
        super().__init__(reason)


def rosenbrock4_workspace_bytes(dimension: int) -> int:
    """Return a conservative logical workspace bound for list-backed binary64."""
    # Jacobian and factored stage matrix plus vectors, row headers, and pivots.
    return 64 * (2 * dimension * dimension + 24 * dimension + 2)


def _matrix_norm_inf(matrix: Sequence[Sequence[float]]) -> float:
    return max([sum(abs(value) for value in row) for row in matrix] + [0.0])


def _factor(matrix: Sequence[Sequence[float]]) -> tuple[list[list[float]], list[int]]:
    size = len(matrix)
    lu = [list(row) for row in matrix]
    pivots: list[int] = []
    matrix_norm = _matrix_norm_inf(lu)
    if not math.isfinite(matrix_norm) or matrix_norm == 0.0:
        raise RosenbrockLinearSolveError("singular_linear_system")
    threshold = _PIVOT_FACTOR * matrix_norm
    for column in range(size):
        pivot = column
        pivot_abs = abs(lu[column][column])
        for row in range(column + 1, size):
            candidate = abs(lu[row][column])
            if candidate > pivot_abs:
                pivot = row
                pivot_abs = candidate
        if not math.isfinite(pivot_abs) or pivot_abs <= threshold:
            raise RosenbrockLinearSolveError("singular_linear_system")
        pivots.append(pivot)
        if pivot != column:
            lu[column], lu[pivot] = lu[pivot], lu[column]
        diagonal = lu[column][column]
        for row in range(column + 1, size):
            multiplier = lu[row][column] / diagonal
            lu[row][column] = multiplier
            for inner in range(column + 1, size):
                lu[row][inner] -= multiplier * lu[column][inner]
    return lu, pivots


def _solve(
    original: Sequence[Sequence[float]],
    lu: Sequence[Sequence[float]],
    pivots: Sequence[int],
    right_hand_side: Sequence[float],
) -> tuple[list[float], float]:
    size = len(right_hand_side)
    answer = list(right_hand_side)
    for column, pivot in enumerate(pivots):
        if pivot != column:
            answer[column], answer[pivot] = answer[pivot], answer[column]
    for row in range(size):
        answer[row] -= sum(lu[row][column] * answer[column] for column in range(row))
    for row in range(size - 1, -1, -1):
        answer[row] -= sum(
            lu[row][column] * answer[column] for column in range(row + 1, size)
        )
        diagonal = lu[row][row]
        if diagonal == 0.0 or not math.isfinite(diagonal):
            raise RosenbrockLinearSolveError("singular_linear_system")
        answer[row] /= diagonal
    if any(not math.isfinite(value) for value in answer):
        raise RosenbrockLinearSolveError("nonfinite_linear_solution")
    residual = max(
        [
            abs(
                sum(original[row][column] * answer[column] for column in range(size))
                - right_hand_side[row]
            )
            for row in range(size)
        ]
        + [0.0]
    )
    scale = max(
        1.0,
        _matrix_norm_inf(original) * max([abs(value) for value in answer] + [0.0])
        + max([abs(value) for value in right_hand_side] + [0.0]),
    )
    normalized = residual / scale
    if not math.isfinite(normalized) or normalized > _LINEAR_RESIDUAL_LIMIT:
        raise RosenbrockLinearSolveError("linear_solve_residual", normalized)
    return answer, normalized


def _combination(
    base: Sequence[float], stages: Sequence[Sequence[float]], weights: Sequence[float]
) -> list[float]:
    return [
        base[index]
        + sum(weights[stage] * stages[stage][index] for stage in range(len(weights)))
        for index in range(len(base))
    ]


def linearized_defect_correction(
    jacobian: Sequence[Sequence[float]],
    step_width: float,
    defect: Sequence[float],
) -> tuple[list[float], float]:
    """Solve `(I - hJ) delta = h * defect` with checked residual evidence."""
    size = len(defect)
    matrix = [
        [
            (1.0 if row == column else 0.0) - step_width * jacobian[row][column]
            for column in range(size)
        ]
        for row in range(size)
    ]
    lu, pivots = _factor(matrix)
    return _solve(
        matrix,
        lu,
        pivots,
        [step_width * value for value in defect],
    )


def rosenbrock4_step(
    rhs: VectorFunction,
    jacobian: JacobianFunction,
    time_derivative: TimeDerivativeFunction,
    t: float,
    y: Sequence[float],
    derivative: Sequence[float],
    h: float,
) -> tuple[
    list[float],
    list[float],
    list[float],
    list[list[float]],
    float,
]:
    """Return solution, endpoint derivative, embedded error, dense rows, residual."""
    size = len(y)
    matrix_j = jacobian(t, y, derivative)
    dfdt = time_derivative(t, y, derivative, h)
    matrix = [
        [
            (-matrix_j[row][column]) + (1.0 / (_GAMMA * h) if row == column else 0.0)
            for column in range(size)
        ]
        for row in range(size)
    ]
    lu, pivots = _factor(matrix)
    maximum_residual = 0.0

    def stage_solve(values: Sequence[float]) -> list[float]:
        nonlocal maximum_residual
        answer, residual = _solve(matrix, lu, pivots, values)
        maximum_residual = max(maximum_residual, residual)
        return answer

    g1 = stage_solve(
        [derivative[index] + h * _D[0] * dfdt[index] for index in range(size)]
    )
    temporary = _combination(y, [g1], [_A21])
    f2 = rhs(t + _C[0] * h, temporary)
    g2 = stage_solve(
        [
            f2[index] + h * _D[1] * dfdt[index] + _C21 * g1[index] / h
            for index in range(size)
        ]
    )
    temporary = _combination(y, [g1, g2], [_A31, _A32])
    f3 = rhs(t + _C[1] * h, temporary)
    g3 = stage_solve(
        [
            f3[index]
            + h * _D[2] * dfdt[index]
            + (_C31 * g1[index] + _C32 * g2[index]) / h
            for index in range(size)
        ]
    )
    temporary = _combination(y, [g1, g2, g3], [_A41, _A42, _A43])
    f4 = rhs(t + _C[2] * h, temporary)
    g4 = stage_solve(
        [
            f4[index]
            + h * _D[3] * dfdt[index]
            + (_C41 * g1[index] + _C42 * g2[index] + _C43 * g3[index]) / h
            for index in range(size)
        ]
    )
    temporary = _combination(y, [g1, g2, g3, g4], [_A51, _A52, _A53, _A54])
    f5 = rhs(t + h, temporary)
    g5 = stage_solve(
        [
            f5[index]
            + (
                _C51 * g1[index]
                + _C52 * g2[index]
                + _C53 * g3[index]
                + _C54 * g4[index]
            )
            / h
            for index in range(size)
        ]
    )
    provisional = [temporary[index] + g5[index] for index in range(size)]
    f6 = rhs(t + h, provisional)
    error = stage_solve(
        [
            f6[index]
            + (
                _C61 * g1[index]
                + _C62 * g2[index]
                + _C63 * g3[index]
                + _C64 * g4[index]
                + _C65 * g5[index]
            )
            / h
            for index in range(size)
        ]
    )
    result = [provisional[index] + error[index] for index in range(size)]
    endpoint_derivative = rhs(t + h, result)
    dense_rows: list[list[float]] = []
    for index in range(size):
        delta = (result[index] - y[index]) / h
        dense_rows.append(
            [
                derivative[index],
                3.0 * delta - 2.0 * derivative[index] - endpoint_derivative[index],
                derivative[index] + endpoint_derivative[index] - 2.0 * delta,
                0.0,
            ]
        )
    return result, endpoint_derivative, error, dense_rows, maximum_residual
