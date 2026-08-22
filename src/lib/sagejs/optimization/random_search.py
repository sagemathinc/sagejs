"""Multistart random search, Wolfram `NMinimize` method `"RandomSearch"`.

Wolfram's documentation states the algorithm in one sentence: "The random
search algorithm works by generating a population of random starting points
and uses a local optimization method from each of the starting points to
converge to a local minimum. The best local minimum is chosen to be the
solution." Convergence is delegated entirely to the local method: "Convergence
for RandomSearch is determined by convergence of the local method for each
starting point" — there is no separate multistart-level tolerance test, only
whatever stopping rule the local method itself applies.

Defaults (Wolfram documented, current tutorial): `"SearchPoints" -> Automatic`
is `Min[10*d, 100]` where `d` is the dimension; `"RandomSeed" -> 0`;
`"Tolerance" -> 0.001`. The documented default local method is `Automatic`,
"which uses FindMinimum with unconstrained methods applied to a system with
penalty terms added for the constraints." Sage.js has no `FindMinimum`; the
nearest already-implemented unconstrained local method is `nelder_mead`
(`sagejs.optimization.nelder_mead`), so it is the default here, with
`tolerance` threaded into both its `xatol` and `fatol` and `max_iterations`
into its `maxiter`. Full penalty-based constraint handling belongs to the
higher-level `nminimize` surface; this module treats `bounds` only as the
box the start points are sampled from (Wolfram's "initial region" — see the
tutorial's `ConstrainedOptimizationGlobalNumerical` page) and, defensively,
clips the *reported* optimum for each start back into that box, re-evaluating
`f` only when a clip actually changed a coordinate so a stale function value
is never paired with a moved point.

## Why the per-start solve is a standalone function

The repository's parallelism story is explicit: "parallelization must be
done intelligently... global optimization when working with areas, multiple
starting points, etc." Each start point here is one complete, independent
local optimization — expensive enough on its own to amortise a worker's
startup cost, unlike a single objective evaluation. `solve_from_start` is
therefore the whole unit of work: it takes only plain, serialisable
arguments (no closures, no shared state) and returns a plain tuple, so it can
be pickled and shipped to a `multiprocessing.Pool` worker unchanged. It also
never lets a single failing start take the rest of the run down with it — a
raising `local_method` or a raising `f` is caught internally and mapped to
the sentinel `(list(start), _INFINITY, 0)`, which simply cannot win the final
reduction.

## Reproducibility under parallelism

Every start point is drawn from its own `RandomStream`, one per start index
via `sagejs.optimization.random_stream.derive_stream(seed, index)`. The full
list of start points is therefore generated once, up front, in the driving
process, purely as a function of `(seed, search_points, bounds)` — never as
a function of how many workers end up running the search or in what order
they finish. Splitting the work differently changes only how fast the answer
arrives, never what it is.

## Parallel dispatch

`random_search` follows the four-step policy from `sagejs.optimization
.schedule`:

1. Generate all `n` start points deterministically (cheap, serial).
2. Time exactly one local solve — the first start point — and extrapolate
   that measurement to `make_schedule(slice_count=n,
   predicted_micros_per_slice=...)`. This *first solve is the probe*:
   measuring is honest, guessing is not, and the measurement is real work
   that is kept (see below), not thrown away.
3. On `"sequential"`, the remaining `n - 1` starts run in-process, reusing
   the probe's own result for start `0` instead of repeating it.
4. On `"parallel"`, every one of the `n` starts (the probe's start point
   included) is partitioned by `slice_indices(n, schedule.slice_count)` —
   which, because a "unit" here already *is* one complete local solve,
   yields `n` singleton blocks — and dispatched in one `multiprocessing
   .Pool(schedule.workers).map(...)` call over those blocks. `Pool.map`'s own
   internal chunking then spreads the singleton blocks across the worker
   pool; nothing here calls `apply_async`, per the defect `schedule.py`
   documents for that entry point. The probe's start point is recomputed
   inside the pool in this path rather than reused — a deterministic,
   bit-identical recomputation, traded for a uniform dispatch that always
   goes through the exact `slice_indices(total, schedule.slice_count)` shape
   `schedule.py` documents.

The whole parallel branch is wrapped in `try`/`except Exception`: a pickling
failure, a pool-creation failure, a crashed worker — anything at all — falls
back to running the remaining starts sequentially, and that fallback is
recorded in the returned `GlobalResult.flag`. Parallelism here is strictly an
optimisation; it is never load-bearing for correctness.

## Reducing to `GlobalResult`

The winner is `min(results, key=lambda item: (item[1], item[0]))` — the
function value first, the point second — so ties resolve on the point's own
coordinates and the result does not depend on completion order, worker
count, or whether the run went sequential or parallel at all.

`solve_from_start`'s return type, `tuple[list[float], float, int]`, is
deliberately minimal so that it stays a cheap, obviously serialisable worker
payload; it does not carry a per-start convergence flag. `GlobalResult`'s
fields are therefore populated at the multistart level, not copied up from
any one local run:

* `x`, `fun` — the winning point and its value.
* `iterations` — the number of local solves executed (`len(starts)`;
  Wolfram's per-start convergence check already ran *inside* each of those
  solves, via the local method's own stopping rule).
* `function_calls` — the sum of every executed local solve's own function
  call count, i.e. the total cost of the whole search.
* `converged` — whether the winning value is finite. A failing start (raised
  exception, or every simplex vertex NaN) reports `_INFINITY` and so can only
  win, and only mark the run non-converged, when *every* start failed.
* `flag` — `"converged"` or `"no-feasible-minimum"`, with the suffix
  `":parallel-fallback-sequential"` appended when the parallel path raised
  and the run fell back to sequential execution.
* `seed` — echoed back unchanged, so the caller can see which seed produced
  this exact set of start points.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Sequence
from typing import Protocol

from .global_result import GlobalResult
from .nelder_mead import nelder_mead
from .random_stream import derive_stream
from .schedule import make_schedule, slice_indices

# The Sage.js `math` module has no `math.inf` attribute.
_INFINITY = float("inf")

_SEARCH_POINTS_PER_DIMENSION = 10
"""Wolfram's documented multiplier in `"SearchPoints" -> Automatic = Min[10*d, 100]`."""

_MAX_DEFAULT_SEARCH_POINTS = 100
"""Wolfram's documented cap in `"SearchPoints" -> Automatic = Min[10*d, 100]`."""

_FLAG_CONVERGED = "converged"
"""`GlobalResult.flag` when the winning start produced a finite value."""

_FLAG_NO_FEASIBLE = "no-feasible-minimum"
"""`GlobalResult.flag` when every start failed or returned a non-finite value."""

_FLAG_FALLBACK_SUFFIX = ":parallel-fallback-sequential"
"""Appended to `GlobalResult.flag` when the parallel path raised and the run
fell back to running the remaining starts in-process."""


class _LocalOutcome(Protocol):
    """Structural contract a `local_method` callable must return.

    `nelder_mead`'s `NelderMeadResult` already satisfies this. A later
    bound-constrained or interior-point solver only needs to expose these
    three attributes to be dropped in as `local_method`, matching Wolfram's
    nested `Method` syntax (e.g. `Method -> {"RandomSearch", Method ->
    "InteriorPoint"}`).
    """

    @property
    def x(self) -> list[float]: ...

    @property
    def fun(self) -> float: ...

    @property
    def function_calls(self) -> int: ...


LocalMethod = Callable[
    [Callable[[Sequence[float]], float], list[float], float, int], _LocalOutcome
]
"""The injectable local-solver contract: `(f, x0, tolerance, max_iterations)
-> outcome`, one call per start point."""


def _default_local_method(
    f: Callable[[Sequence[float]], float],
    x0: list[float],
    tolerance: float,
    max_iterations: int,
) -> _LocalOutcome:
    """Wolfram's documented default local method: unconstrained `FindMinimum`.

    `nelder_mead` stands in for the (unavailable) `FindMinimum`, with
    `tolerance` threaded into both `xatol` and `fatol` and `max_iterations`
    into `maxiter`.
    """
    return nelder_mead(f, x0, xatol=tolerance, fatol=tolerance, maxiter=max_iterations)


def _default_search_points(dimension: int) -> int:
    """Wolfram's `"SearchPoints" -> Automatic`: `min(10 * d, 100)`."""
    return min(_SEARCH_POINTS_PER_DIMENSION * dimension, _MAX_DEFAULT_SEARCH_POINTS)


def _validate_bounds(
    bounds: Sequence[tuple[float, float]],
) -> list[tuple[float, float]]:
    """Validate and normalize `bounds`, raising `ValueError` naming the offender.

    Each bound must be finite with `low <= high` (a fixed coordinate,
    `low == high`, is allowed and simply narrows that dimension's sampling
    range to a single point).
    """
    resolved: list[tuple[float, float]] = []
    for index, bound in enumerate(bounds):
        low = float(bound[0])
        high = float(bound[1])
        if not (math.isfinite(low) and math.isfinite(high)):
            raise ValueError(
                "bounds[%d] must be finite (got (%r, %r))" % (index, bound[0], bound[1])
            )
        if low > high:
            raise ValueError(
                "bounds[%d] must have low <= high (got (%r, %r))"
                % (index, bound[0], bound[1])
            )
        resolved.append((low, high))
    if not resolved:
        raise ValueError("bounds must specify at least one dimension")
    return resolved


def _resolve_search_points(search_points: int | None, dimension: int) -> int:
    """Resolve the `search_points` argument to a positive `int`."""
    if search_points is None:
        return _default_search_points(dimension)
    if isinstance(search_points, bool) or not isinstance(search_points, int):
        raise ValueError(
            "search_points must be an exact integer (got %r)" % (search_points,)
        )
    if search_points < 1:
        raise ValueError("search_points must be at least 1 (got %d)" % search_points)
    return search_points


def _generate_starts(
    bounds: Sequence[tuple[float, float]],
    count: int,
    seed: int,
    initial_points: Sequence[Sequence[float]] | None,
) -> list[list[float]]:
    """Build the `count` deterministic start points for one random search run.

    Each generated start point draws from its own `derive_stream(seed,
    index)`, so the set of start points depends only on `(seed, count,
    bounds)` and never on how the resulting work is later split or run.
    `initial_points`, when given, fill the first slots verbatim (Wolfram's
    `"InitialPoints"` sub-option) with no stream draw for those indices;
    any indices beyond `len(initial_points)` are filled by fresh streams, and
    any supplied points beyond `count` are simply unused.
    """
    supplied: list[list[float]] = []
    if initial_points is not None:
        for point in initial_points:
            values = [float(value) for value in point]
            if len(values) != len(bounds):
                raise ValueError(
                    "initial_points entries must have length %d (got %d)"
                    % (len(bounds), len(values))
                )
            supplied.append(values)

    starts: list[list[float]] = []
    for index in range(count):
        if index < len(supplied):
            starts.append(supplied[index])
        else:
            stream = derive_stream(seed, index)
            starts.append([stream.uniform_range(low, high) for low, high in bounds])
    return starts


def solve_from_start(
    f: Callable[[Sequence[float]], float],
    bounds: Sequence[tuple[float, float]],
    start: Sequence[float],
    tolerance: float,
    max_iterations: int,
    local_method: LocalMethod | None = None,
) -> tuple[list[float], float, int]:
    """Run one independent local solve from `start`, returning `(x, fun, calls)`.

    This is the whole unit of parallel work: every argument is a plain,
    picklable value (a callable, floats, sequences of floats), so a caller
    can hand this function and a block of `start` values straight to a
    `multiprocessing.Pool` worker with nothing further to prepare.

    `local_method` defaults to `nelder_mead` (Wolfram's documented default,
    unconstrained `FindMinimum`) and otherwise must satisfy the `LocalMethod`
    contract: `(f, x0, tolerance, max_iterations) -> outcome` where `outcome`
    exposes `.x`, `.fun` and `.function_calls`.

    The local method itself is unconstrained, matching the Wolfram
    documentation quoted in the module docstring; `bounds` is used here only
    to clip the *returned* point back into the box, which keeps a wandering
    local search from reporting a point far outside the region it was asked
    to search. `f` is re-evaluated at the clipped point — one extra call —
    only when clipping actually moved a coordinate, so `fun` is always the
    true value at the returned `x`.

    Never raises: if `local_method` (or `f` underneath it) raises for this
    particular start, the failure is caught and `(list(start), _INFINITY, 0)`
    is returned instead. A sentinel like that cannot win the final
    minimum-by-`(fun, x)` reduction, so one bad start point never costs the
    run its other, working results — whether this call happened in-process
    or inside a worker.
    """
    method = local_method if local_method is not None else _default_local_method
    x0 = [float(value) for value in start]

    try:
        outcome = method(f, x0, float(tolerance), int(max_iterations))
        raw_x = [float(value) for value in outcome.x]
        calls = int(outcome.function_calls)
    except Exception:
        return list(x0), _INFINITY, 0

    clipped: list[float] = []
    moved = False
    for value, (low, high) in zip(raw_x, bounds, strict=True):
        if value < low:
            clipped.append(low)
            moved = True
        elif value > high:
            clipped.append(high)
            moved = True
        else:
            clipped.append(value)

    if moved:
        try:
            fun = float(f(clipped))
        except Exception:
            return clipped, _INFINITY, calls
        calls += 1
    else:
        fun = float(outcome.fun)

    if math.isnan(fun):
        fun = _INFINITY
    return clipped, fun, calls


def _solve_block(
    payload: tuple[
        list[list[float]],
        Callable[[Sequence[float]], float],
        Sequence[tuple[float, float]],
        float,
        int,
        LocalMethod | None,
    ],
) -> list[tuple[list[float], float, int]]:
    """The picklable top-level function `Pool.map` actually calls.

    Runs every start in its block serially inside the worker process;
    `Pool.map` already distributes the blocks themselves across the pool in
    the single call made in `_run_parallel`, so no further parallelism is
    needed within one block.
    """
    starts, f, bounds, tolerance, max_iterations, local_method = payload
    return [
        solve_from_start(f, bounds, start, tolerance, max_iterations, local_method)
        for start in starts
    ]


def _run_parallel(
    f: Callable[[Sequence[float]], float],
    bounds: Sequence[tuple[float, float]],
    starts: Sequence[list[float]],
    tolerance: float,
    max_iterations: int,
    local_method: LocalMethod | None,
    workers: int,
    slice_count: int,
) -> list[tuple[list[float], float, int]]:
    """Dispatch every start in `starts` to a worker pool in one `Pool.map` call.

    `multiprocessing` is imported here, inside the function the caller
    already wraps in `try`/`except`, rather than at module load time: a
    runtime that has no `multiprocessing` module at all (as `schedule.py`'s
    `probe_worker_capability` anticipates) then simply raises `ImportError`
    into that same fallback path instead of breaking every import of this
    module.

    `starts` is partitioned by `slice_indices(len(starts), slice_count)` —
    the exact `slice_indices(total, schedule.slice_count)` shape `schedule
    .py` documents. Because one unit of work here already is one complete
    local solve, this always yields `len(starts)` singleton blocks; `Pool
    .map`'s own internal chunking, not any chunking done here, is what
    spreads those singleton blocks across `workers` processes. The blocks
    are submitted in exactly one `.map()` call, never through
    `apply_async`, per the defect `schedule.py` documents for that entry
    point.
    """
    import multiprocessing

    blocks = slice_indices(len(starts), slice_count)
    payloads = [
        (list(starts[begin:end]), f, bounds, tolerance, max_iterations, local_method)
        for begin, end in blocks
        if end > begin
    ]
    if not payloads:
        return []

    with multiprocessing.Pool(workers) as pool:
        chunks = pool.map(_solve_block, payloads)

    combined: list[tuple[list[float], float, int]] = []
    for chunk in chunks:
        combined.extend(chunk)
    return combined


def random_search(
    f: Callable[[Sequence[float]], float],
    bounds: Sequence[tuple[float, float]],
    *,
    search_points: int | None = None,
    max_iterations: int = 100,
    tolerance: float = 0.001,
    seed: int = 0,
    local_method: LocalMethod | None = None,
    initial_points: Sequence[Sequence[float]] | None = None,
    max_workers: int | None = None,
) -> GlobalResult:
    """Multistart random search: Wolfram `NMinimize` method `"RandomSearch"`.

    Generates `search_points` random points inside `bounds`, runs an
    independent local optimization from each one, and returns the best local
    minimum found. See the module docstring for the full algorithm, the
    parallel dispatch policy, and how the result fields are populated.

    Args:
        f: The objective, a function of one sequence of `d` coordinates.
        bounds: `d` pairs `(low, high)`; also the box new start points are
            sampled from (Wolfram's "initial region"). `low == high` fixes
            that coordinate.
        search_points: Number of start points. `None` (the default) resolves
            to Wolfram's `Automatic`, `min(10 * d, 100)`.
        max_iterations: Iteration budget passed to the local method for
            *each* start (Wolfram's default `MaxIterations`, `100`).
        tolerance: Convergence tolerance passed to the local method for each
            start (Wolfram's default `Tolerance`, `0.001`); with the default
            `local_method` this becomes both `xatol` and `fatol`.
        seed: `RandomStream` seed (Wolfram's default `RandomSeed`, `0`).
            Determines the exact set of start points, independent of how the
            search is later parallelised.
        local_method: The per-start local solver; see the `LocalMethod`
            contract. Defaults to unconstrained Nelder-Mead.
        initial_points: Optional user-supplied points (Wolfram's
            `"InitialPoints"`) that seed the first start slots verbatim.
        max_workers: Upper bound on the worker pool size passed through to
            `make_schedule`; `None` leaves the policy's own ceiling in
            effect.

    Returns:
        A `GlobalResult` for the best start point found.

    Raises:
        ValueError: If `bounds` is empty or has a non-finite or
            `low > high` entry, if `search_points` is not a positive
            integer, or if an `initial_points` entry's length does not
            match `len(bounds)`.
    """
    resolved_bounds = _validate_bounds(bounds)
    dimension = len(resolved_bounds)
    count = _resolve_search_points(search_points, dimension)

    starts = _generate_starts(resolved_bounds, count, seed, initial_points)

    # The first solve is the probe: measuring is honest, guessing is not.
    probe_began = time.perf_counter()
    probe_result = solve_from_start(
        f, resolved_bounds, starts[0], tolerance, max_iterations, local_method
    )
    probe_elapsed = time.perf_counter() - probe_began
    predicted_micros = max(probe_elapsed, 0.0) * 1_000_000.0

    schedule = make_schedule(
        slice_count=count,
        predicted_micros_per_slice=predicted_micros,
        max_workers=max_workers,
    )

    fallback_suffix = ""
    if schedule.mode == "sequential" or count == 1:
        results = [probe_result] + [
            solve_from_start(
                f, resolved_bounds, start, tolerance, max_iterations, local_method
            )
            for start in starts[1:]
        ]
    else:
        try:
            results = _run_parallel(
                f,
                resolved_bounds,
                starts,
                tolerance,
                max_iterations,
                local_method,
                schedule.workers,
                schedule.slice_count,
            )
        except Exception:
            fallback_suffix = _FLAG_FALLBACK_SUFFIX
            results = [probe_result] + [
                solve_from_start(
                    f, resolved_bounds, start, tolerance, max_iterations, local_method
                )
                for start in starts[1:]
            ]

    best_x, best_fun, _best_calls = min(results, key=lambda item: (item[1], item[0]))
    total_function_calls = sum(calls for _, _, calls in results)
    converged = math.isfinite(best_fun)
    flag = (_FLAG_CONVERGED if converged else _FLAG_NO_FEASIBLE) + fallback_suffix

    return GlobalResult(
        x=list(best_x),
        fun=float(best_fun),
        iterations=len(results),
        function_calls=total_function_calls,
        converged=converged,
        flag=flag,
        seed=seed,
    )
