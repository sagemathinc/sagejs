"""Lazy orchestration of source-compiled arithmetic on exclusively owned data.

No library load occurs on the ordinary `describe()` path. These optional kernels
use libc/libm only. Construction allocates all buffers separately; no public API
exposes a writable alias, native pointer or Wasm memory view. Kernels never call
back into the host, and resource checks run between complete arithmetic regions.
"""

from __future__ import annotations

import math
from typing import Any

from sagejs.native import (
    is_compiled,
    kernel_float64_buffer,
    kernel_float64_sorted,
    kernel_float64_zeros,
)

from ._core import BudgetGuard, StatisticsNumericalError, binary64_ulp, quantile_sorted
from ._packed import finite_sum
from ._packed_centered import prepare_centered, prepare_summary_checks


def make_workspace(values: list[float]) -> _PackedWorkspace | None:
    for function in (finite_sum, prepare_centered, prepare_summary_checks):
        if not is_compiled(function) or not getattr(function, "nativeAvailable", False):
            return None
    return _PackedWorkspace(values)


def _check_status(status: float) -> None:
    if status != 0.0:
        raise StatisticsNumericalError(
            "the summary exceeds the finite binary64 result envelope"
        )


class _PackedWorkspace:
    def __init__(self, values: list[float]) -> None:
        self.count = len(values)
        self.values = kernel_float64_buffer(finite_sum, values)
        self.partials = kernel_float64_zeros(finite_sum, self.count)
        self.deviations = kernel_float64_zeros(finite_sum, self.count)
        self.normalized = kernel_float64_zeros(finite_sum, self.count)
        self.squares = kernel_float64_zeros(finite_sum, self.count)
        self.output = kernel_float64_zeros(finite_sum, 1)

    def _sum(self, values: Any, guard: BudgetGuard) -> float:
        guard.check()
        _check_status(finite_sum(values, self.partials, self.output, self.count))
        return float(self.output[0])

    def components(self, guard: BudgetGuard) -> tuple[Any, ...]:
        total = self._sum(self.values, guard)
        mean = total / self.count
        guard.check()
        _check_status(
            prepare_centered(
                self.values,
                self.deviations,
                self.normalized,
                self.squares,
                self.output,
                mean,
                self.count,
            )
        )
        scale = float(self.output[0])
        raw_normalized = self._sum(self.squares, guard)
        correction = self._sum(self.normalized, guard)
        corrected = raw_normalized - correction * correction / self.count
        if corrected < 0.0 and corrected > -16.0 * binary64_ulp(
            max(raw_normalized, 1.0)
        ):
            corrected = 0.0
        sum_squares = (scale * scale) * corrected
        if not math.isfinite(sum_squares):
            raise StatisticsNumericalError(
                "the centered sum of squares exceeds the binary64 result envelope"
            )
        guard.check()
        ordered = kernel_float64_sorted(finite_sum, self.values)
        median = quantile_sorted(ordered, 0.5)
        guard.check()
        # Reuse scratch only after all centered reductions have finished.
        _check_status(
            prepare_summary_checks(
                self.values, self.squares, self.deviations, median, mean, self.count
            )
        )
        residual = abs(self._sum(self.deviations, guard))
        absolute_deviations = kernel_float64_sorted(finite_sum, self.squares)
        guard.check()
        return mean, total, sum_squares, ordered, absolute_deviations, residual
