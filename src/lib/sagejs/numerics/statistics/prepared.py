"""Explicit owned observations and workspace for repeated statistics queries.

Preparation copies and validates observations once; it does not precompute a
summary or hide that work in a warm query. No caller-provided buffer is borrowed.
`backend="native"` is an experimental opt-in to source-verified AOT arithmetic;
missing artifacts retain the ordinary Python implementation. The default stays
dynamic until public native/Wasm/package qualification is complete.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator
from typing import Any

from ..model import ResourceBudget
from ._core import BudgetGuard, finite_values


class StatisticsData:
    """A copied finite binary64 sample with explicitly bounded owned workspace.

    Pass the object to `describe()` for repeated queries, or use `data.describe()`.
    Query budgets charge the sample count atomically before arithmetic; subsequent
    time/cancellation checks occur at coarse phase boundaries. This is distinct
    from generic iterables, whose per-item conversion and callback order is
    unchanged. Concurrent or reentrant queries on the same workspace are rejected.

    `max_buffer_bytes` limits logical binary64 input, scratch, sorting and copy
    capacity, conservatively charged at 80 bytes per observation plus 16 bytes.
    It is not a claim about Python object overhead, allocator RSS, or rendering.
    Results and detached exports have their own lifetimes. `close()` releases the
    retained sample and workspace, is idempotent, and invalidates future queries.
    """

    def __init__(
        self,
        data: Iterable[Any],
        *,
        nan_policy: str = "raise",
        budget: ResourceBudget | None = None,
        cancel: Callable[[], bool] | None = None,
        max_buffer_bytes: int = 64 * 1024 * 1024,
        backend: str = "dynamic",
    ) -> None:
        if (
            isinstance(max_buffer_bytes, bool)
            or not isinstance(max_buffer_bytes, int)
            or max_buffer_bytes < 96
        ):
            raise ValueError("max_buffer_bytes must be an integer at least 96")
        if backend not in ("dynamic", "native"):
            raise ValueError("backend must be 'dynamic' or 'native'")
        self._closed = True
        self._busy = False
        self._workspace: Any = None
        self._values: Any = ()
        self._backend = "ordinary-python"
        self._requested_backend = backend
        guard = BudgetGuard(budget=budget, cancel=cancel, trace="none")
        values = finite_values(
            data,
            nan_policy=nan_policy,
            guard=guard,
            maximum=(max_buffer_bytes - 16) // 80,
        )
        # No arbitrary conversion hooks remain beyond this owned boundary.
        self._values = tuple(values)
        self._count = len(values)
        self._buffer_bytes = 80 * len(values) + 16
        if backend == "native":
            from ._prepared_native import make_workspace

            workspace = make_workspace(values)
            if workspace is not None:
                self._workspace = workspace
                self._values = ()
                self._backend = "source-native"
        guard.check()
        self._preparation_evaluations = guard.evaluations
        self._preparation_ms = guard.elapsed_ms()
        self._closed = False

    @property
    def closed(self) -> bool:
        return self._closed

    @property
    def backend(self) -> str:
        return self._backend

    def _require_open(self) -> None:
        if self._closed:
            raise ValueError("StatisticsData is closed")

    def preparation(self) -> dict[str, Any]:
        """Return detached setup measurements, not query performance claims."""
        self._require_open()
        return {
            "count": self._count,
            "evaluations": self._preparation_evaluations,
            "elapsed_ms": self._preparation_ms,
            "logical_buffer_bytes": self._buffer_bytes,
            "requested_backend": self._requested_backend,
            "selected_backend": self._backend,
            "summary_precomputed": False,
        }

    def __len__(self) -> int:
        self._require_open()
        return self._count

    def to_list(self) -> list[float]:
        """Export a detached copy; mutations cannot invalidate retained data."""
        self._require_open()
        if self._busy:
            raise RuntimeError("StatisticsData workspace is in use")
        source = self._values if self._workspace is None else self._workspace.values
        return [float(value) for value in source]

    def __iter__(self) -> Iterator[float]:
        return iter(self.to_list())

    def close(self) -> None:
        if self._busy:
            raise RuntimeError("StatisticsData workspace is in use")
        self._values = ()
        self._workspace = None
        self._closed = True

    def __enter__(self) -> StatisticsData:
        self._require_open()
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> bool:
        self.close()
        return False

    def describe(self, **options: Any) -> Any:
        """Compute a fresh structured summary, including independent checks."""
        from .descriptive import describe

        return describe(self, **options)

    def _components(self, guard: BudgetGuard) -> Any:
        self._require_open()
        if self._busy:
            raise RuntimeError("StatisticsData workspace is in use")
        self._busy = True
        try:
            guard.check(self._count)
            if self._workspace is not None:
                return self._workspace.components(guard)
            from .descriptive import _ordinary_components

            result = _ordinary_components(self._values)
            guard.check()
            return result
        finally:
            self._busy = False
