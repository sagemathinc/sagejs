"""Rank and condition diagnostics from a one-sided Jacobi iteration."""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

from .factorizations import MACHINE_EPSILON, LinearAlgebraError
from .storage import DenseMatrix, stable_norm_two


class SingularValueDiagnostics:
    """Singular-value estimates with explicit convergence and threshold data."""

    def __init__(
        self,
        values: list[float],
        *,
        threshold: float,
        sweeps: int,
        converged: bool,
    ) -> None:
        self.values = tuple(values)
        self.threshold = threshold
        self.sweeps = sweeps
        self.converged = converged

    @property
    def rank(self) -> int:
        return sum(1 for value in self.values if value > self.threshold)

    @property
    def condition(self) -> float | None:
        if len(self.values) == 0:
            return None
        smallest = self.values[-1]
        if smallest <= self.threshold:
            return None
        return self.values[0] / smallest

    def to_dict(self) -> dict[str, Any]:
        if len(self.values) == 0:
            condition_kind = "undefined"
        elif self.condition is None:
            condition_kind = "infinite"
        else:
            condition_kind = "finite"
        return {
            "singular_values": list(self.values),
            "rank": self.rank,
            "rank_threshold": self.threshold,
            "condition_2": self.condition,
            "condition_kind": condition_kind,
            "sweeps": self.sweeps,
            "converged": self.converged,
            "algorithm": "one_sided_jacobi",
        }


def singular_value_diagnostics(
    matrix: DenseMatrix,
    *,
    tolerance: float | None = None,
    max_sweeps: int = 64,
    on_sweep: Callable[[int, float, bool], None] | None = None,
    check: Callable[[], None] | None = None,
) -> SingularValueDiagnostics:
    """Estimate all singular values using cyclic one-sided Jacobi rotations.

    Wide inputs are transposed first so the iteration orthogonalizes no more
    than `min(m, n)` columns.  The routine computes values only; it deliberately
    does not expose unstable singular-vector claims.
    """
    if isinstance(max_sweeps, bool) or not isinstance(max_sweeps, int):
        raise ValueError("max_sweeps must be a positive integer")
    if max_sweeps <= 0:
        raise ValueError("max_sweeps must be a positive integer")
    working_matrix = matrix if matrix.nrows >= matrix.ncols else matrix.transpose()
    rows = working_matrix.nrows
    columns = working_matrix.ncols
    if columns == 0:
        return SingularValueDiagnostics([], threshold=0.0, sweeps=0, converged=True)
    input_scale = working_matrix.max_abs_entry()
    if input_scale == 0.0:
        return SingularValueDiagnostics(
            [0.0] * columns, threshold=0.0, sweeps=0, converged=True
        )
    working = [value / input_scale for value in working_matrix.entries]
    rotation_tolerance = (
        16.0 * MACHINE_EPSILON if tolerance is None else float(tolerance)
    )
    if not math.isfinite(rotation_tolerance) or rotation_tolerance <= 0.0:
        raise ValueError("tolerance must be finite and positive")
    converged = columns <= 1
    sweeps = 0
    for sweep in range(1, max_sweeps + 1):
        sweeps = sweep
        changed = False
        largest_correlation = 0.0
        for left in range(columns - 1):
            for right in range(left + 1, columns):
                if check is not None:
                    check()
                left_norm_squared = math.fsum(
                    working[row * columns + left] * working[row * columns + left]
                    for row in range(rows)
                )
                right_norm_squared = math.fsum(
                    working[row * columns + right] * working[row * columns + right]
                    for row in range(rows)
                )
                if left_norm_squared == 0.0 or right_norm_squared == 0.0:
                    continue
                cross = math.fsum(
                    working[row * columns + left] * working[row * columns + right]
                    for row in range(rows)
                )
                scale = math.sqrt(left_norm_squared) * math.sqrt(right_norm_squared)
                correlation = abs(cross) / scale
                largest_correlation = max(largest_correlation, correlation)
                if abs(cross) <= rotation_tolerance * scale:
                    continue
                tau = (right_norm_squared - left_norm_squared) / (2.0 * cross)
                tangent = (1.0 if tau >= 0.0 else -1.0) / (
                    abs(tau) + math.sqrt(1.0 + tau * tau)
                )
                cosine = 1.0 / math.sqrt(1.0 + tangent * tangent)
                sine = cosine * tangent
                for row in range(rows):
                    left_location = row * columns + left
                    right_location = row * columns + right
                    left_value = working[left_location]
                    right_value = working[right_location]
                    working[left_location] = cosine * left_value - sine * right_value
                    working[right_location] = sine * left_value + cosine * right_value
                changed = True
        converged = not changed
        if on_sweep is not None:
            on_sweep(sweep, largest_correlation, converged)
        if converged:
            break
    values: list[float] = []
    for column in range(columns):
        if check is not None:
            check()
        normalized_norm = stable_norm_two(
            working[row * columns + column] for row in range(rows)
        )
        value = normalized_norm * input_scale
        if not math.isfinite(value):
            raise LinearAlgebraError(
                "nonfinite_intermediate",
                "a singular-value estimate is not representable in binary64",
                details={"column": column},
            )
        values.append(value)
    values.sort(reverse=True)
    largest = values[0] if len(values) != 0 else 0.0
    threshold = MACHINE_EPSILON * max(1, matrix.nrows, matrix.ncols) * largest
    return SingularValueDiagnostics(
        values,
        threshold=threshold,
        sweeps=sweeps,
        converged=converged,
    )


def is_ill_conditioned(condition: float | None) -> bool:
    """Return whether binary64 may lose at least about half its digits."""
    return condition is None or condition >= 1.0 / math.sqrt(MACHINE_EPSILON)
