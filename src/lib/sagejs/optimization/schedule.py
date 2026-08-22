"""Serial-versus-parallel policy for global optimization runs.

This module *decides*; it never *runs*. It starts no worker, creates no pool,
imports no algorithm, performs no I/O, and holds no mutable module state. It
answers exactly one question: given a count of independent units of work and a
prediction of what one unit costs, should the caller execute the run in this
process or across a worker pool, and with how many workers?

## Parallelism is threshold-gated, never default-on

Measured on the 16-core reference host (see the numerics measurement notes):
creating a pool and tearing it down again costs `0.378 s` for two workers,
`0.449 s` for four, and `0.691 s` for eight, and eight CPU-bound jobs of about
`0.3 s` each across four workers improved only from `2.41 s` to `1.99 s`, a
`1.21x` speedup. Meanwhile a single objective evaluation lowered to the
bytecode evaluator costs microseconds, and a whole Differential Evolution run
of a few thousand evaluations can finish in milliseconds.

So parallelising per objective evaluation, or even per generation, is a large
net *slowdown* -- easily a hundredfold. Parallelism is worth its setup cost
only at the outer granularity of a global search, where each shipped unit is
itself a substantial computation:

* multistart: one complete local solve (Brent, Nelder-Mead, ...) per unit
* region subdivision: one subregion per unit, branch-and-bound style
* population methods: one contiguous block of candidates per unit
* grid or random search: one contiguous block of sample points per unit

`SchedulePolicy` encodes the thresholds that express this, and `make_schedule`
reports both the chosen worker count and the `reason` string that produced it,
mirroring `sagejs.number_fields.local_parallel.make_schedule`, the house
pattern for "parallelise automatically, but only when it actually pays".

## Never use `Pool.apply_async` with this schedule

`tools/multiprocessing-host.ts:448` selects the destination worker with the
loop index *within a single submission*:

```text
this.workers[index % this.workers.length].port.postMessage(...)
```

`Pool.apply_async` submits exactly one value per call, so that index is always
`0` and every `apply_async` task in a pool lands on worker 0 and queues behind
its predecessors. A run dispatched that way is serial no matter what this
module decides. Consumers of a parallel `Schedule` MUST therefore submit the
whole batch in one `Pool.map` or `Pool.starmap` call over pre-chunked blocks,
which does advance the index across workers. `slice_indices` exists to build
exactly those blocks. Do not reintroduce per-item `apply_async` here or in any
caller until that host defect is fixed.

## Resolution order

A reviewer flagged a circularity risk in this decision, so the order is fixed
and is implemented literally in the order stated:

1. The **caller** decides `slice_count`. How many independent units exist is a
   property of the algorithm -- the number of start points, subregions, or
   population blocks -- and is never derived from the worker count. This
   module therefore never requires the caller to materialise slices, or to
   know a worker count, before calling it.
2. `make_schedule` bounds the worker count by
   `min(max_workers, policy.max_workers, cpu_count, slice_count)`.
3. The gates below are applied in order, each one able to force serial
   execution; the first that fires supplies the `reason`.
4. Only once a worker count survives every gate does the caller partition its
   work, by calling `slice_indices(total, schedule.slice_count)`.

The gates, in order: worker capability, a single CPU, too few slices, total
predicted work, per-slice predicted work, and finally whether the predicted
saving clears pool setup.

## Failing closed

The browser and WebAssembly runtime implements no multiprocessing host
operation at all. Worker capability is therefore probed rather than assumed,
and every failure mode of that probe -- a missing module, a missing allowlist
entry, a raising query -- degrades to sequential execution. The probe never
raises.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass

PARALLEL_WORKER_MODULE = "sagejs.optimization.parallel_worker"
"""Module name whose worker-runtime availability decides capability.

Workers may import only modules compiled into the task runtime, that is, the
names listed under `taskRuntimeImports` in
`scripts/precompiled-python-packages.json`. Until this name appears there, the
capability probe reports `False` and every schedule is sequential, which is
the intended fail-closed behaviour rather than a defect.
"""


@dataclass(frozen=True)
class SchedulePolicy:
    """Thresholds separating a worthwhile parallel run from a wasteful one.

    All durations are microseconds of *predicted* work, so that the policy is
    exact integer data and a decision is reproducible without measuring
    anything at decision time.

    * `min_slices` -- a run split into fewer independent slices than this stays
      sequential, because too few slices cannot fill a pool.
    * `min_total_micros` -- predicted total work below this stays sequential;
      it cannot repay pool creation however it is divided.
    * `min_slice_micros` -- a slice cheaper than this is not worth shipping to
      a worker at all, whatever the totals say.
    * `max_workers` -- implementation-wide ceiling on the worker count.
    * `setup_margin_micros` -- the predicted saving must exceed this before
      parallel execution is chosen; it stands for pool startup plus teardown
      plus payload transfer.
    """

    min_slices: int
    min_total_micros: int
    min_slice_micros: int
    max_workers: int
    setup_margin_micros: int


DEFAULT_POLICY = SchedulePolicy(
    # Four independent solves is the smallest split where a pool of two or more
    # workers has anything to balance; below that the fastest worker idles for
    # most of the run.
    min_slices=4,
    # Two seconds of predicted work. The measured worst-case pool cost is
    # 0.691 s at eight workers, and the measured real-workload efficiency was
    # only 1.21x on four workers, so a run must be worth several times its own
    # setup before parallel execution can win.
    min_total_micros=2_000_000,
    # A quarter second per slice. Slices are shipped in contiguous blocks by
    # `Pool.map`, so a worker normally receives several; this bounds the
    # per-item transfer and result-marshalling overhead relative to the work.
    min_slice_micros=250_000,
    # Pool cost grows with worker count (0.378 s, 0.449 s, 0.691 s at two, four
    # and eight) and was never measured beyond eight, so eight is the ceiling
    # even on the 16-core host.
    max_workers=8,
    # One second, comfortably above the measured 0.691 s worst case, covering
    # teardown and the first payload round trip as well.
    setup_margin_micros=1_000_000,
)
"""Conservative default thresholds, calibrated on the reference host."""


@dataclass(frozen=True)
class Schedule:
    """The decision produced by `make_schedule`.

    `mode` is `"sequential"` or `"parallel"`, and is `"parallel"` exactly when
    `workers > 1`. `slice_count` echoes the caller's independent-unit count
    unchanged, so that a caller can pass the schedule straight to
    `slice_indices`. `reason` names the gate that decided the outcome and is
    one of `"parallel-threshold-met"`, `"too-few-slices"`,
    `"predicted-work-below-threshold"`,
    `"insufficient-work-to-amortize-workers"`,
    `"worker-capability-unavailable"`, or `"single-cpu"`.
    """

    mode: str
    workers: int
    slice_count: int
    reason: str


def _count(value: int, label: str, minimum: int) -> int:
    """Validate one exact non-negative count, rejecting `bool` like the house."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(label + " must be an exact integer")
    answer = int(value)
    if answer < minimum:
        raise ValueError(label + " must be at least " + str(minimum))
    return answer


def _micros(value: int | float, label: str) -> int:
    """Validate one finite non-negative duration and floor it to microseconds.

    Predictions are frequently computed as floats. They are floored here so
    that every comparison downstream is exact-integer, and so that `nan`, which
    compares false against every threshold and would silently select parallel
    execution, is rejected rather than propagated.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(label + " must be a real number of microseconds")
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(label + " must be finite")
        answer = int(math.floor(value))
    else:
        answer = int(value)
    if answer < 0:
        raise ValueError(label + " must not be negative")
    return answer


def probe_worker_capability(module: str = PARALLEL_WORKER_MODULE) -> bool:
    """Report whether this runtime can run `module` inside a worker.

    Ordinary CPython imports installed modules in a process worker normally,
    so the presence of a usable `Pool` is the whole question there. The
    smaller Sage.js worker runtime instead exposes a read-only query over the
    generated allowlist, `multiprocessing.worker_module_available`, and this
    follows `sagejs.number_fields.local_parallel_worker.public_worker_capability`
    in consulting it when it exists.

    This function never raises. Every failure -- no `multiprocessing` module at
    all, as in the browser and WebAssembly runtime, a missing `Pool`, a name
    absent from the allowlist, or a query that itself fails -- reports `False`
    and so degrades the run to sequential.
    """
    try:
        multiprocessing = __import__(
            "multiprocessing", fromlist=["worker_module_available"]
        )
    except Exception:
        return False
    try:
        query = getattr(multiprocessing, "worker_module_available", None)
        if query is None:
            return getattr(multiprocessing, "Pool", None) is not None
        return bool(query(module))
    except Exception:
        return False


def make_schedule(
    slice_count: int,
    predicted_micros_per_slice: int | float,
    *,
    max_workers: int | None = None,
    cpu_count: int | None = None,
    worker_capability: bool | None = None,
    policy: SchedulePolicy = DEFAULT_POLICY,
) -> Schedule:
    """Choose sequential or bounded parallel execution for one optimization run.

    `slice_count` is the number of independent units the caller's algorithm
    has, decided entirely by the caller, and `predicted_micros_per_slice` is
    its estimate of what one such unit costs. Both describe work that has not
    been built yet: nothing here needs the slices themselves, so a caller can
    ask for the decision before committing to a partition.

    `max_workers` further caps the worker count below `policy.max_workers`.
    `cpu_count` defaults to `os.cpu_count()`, treating an unknown count as one
    CPU. `worker_capability` defaults to `probe_worker_capability()`; passing
    `False` forces sequential execution and passing `True` asserts capability
    without probing, which is how tests pin a decision.

    The gates are applied in the documented order and the first to fire wins:

    ```text
    capability -> single CPU -> slice count -> total work
               -> per-slice work -> predicted saving
    ```

    The saving compares the predicted serial total against the predicted
    critical path of a balanced contiguous split, which is the largest block,
    `ceil(slice_count / workers)` slices long. That saving must exceed
    `policy.setup_margin_micros` for `"parallel-threshold-met"`.

    Raises `ValueError` for a negative slice count, a negative or non-finite
    prediction, or a `max_workers` or `cpu_count` below one.
    """
    slices = _count(slice_count, "slice count", 0)
    per_slice = _micros(predicted_micros_per_slice, "predicted work per slice")
    ceiling = _count(policy.max_workers, "policy worker ceiling", 1)
    requested = (
        ceiling if max_workers is None else _count(max_workers, "max_workers", 1)
    )
    detected = os.cpu_count() if cpu_count is None else cpu_count
    available = 1 if detected is None else _count(detected, "CPU count", 1)
    capable = (
        probe_worker_capability()
        if worker_capability is None
        else bool(worker_capability)
    )

    workers = min(requested, ceiling, available, max(1, slices))
    total = slices * per_slice
    reason = "parallel-threshold-met"
    if not capable:
        workers = 1
        reason = "worker-capability-unavailable"
    elif available < 2:
        workers = 1
        reason = "single-cpu"
    elif slices < _count(policy.min_slices, "policy minimum slice count", 1):
        workers = 1
        reason = "too-few-slices"
    elif total < _micros(policy.min_total_micros, "policy minimum total work"):
        workers = 1
        reason = "predicted-work-below-threshold"
    elif per_slice < _micros(policy.min_slice_micros, "policy minimum slice work"):
        workers = 1
        reason = "insufficient-work-to-amortize-workers"
    else:
        margin = _micros(policy.setup_margin_micros, "policy setup margin")
        critical_path = -(-slices // workers) * per_slice
        if workers < 2 or total - critical_path <= margin:
            workers = 1
            reason = "insufficient-work-to-amortize-workers"

    return Schedule(
        mode="parallel" if workers > 1 else "sequential",
        workers=workers,
        slice_count=slices,
        reason=reason,
    )


def slice_indices(total: int, slice_count: int) -> list[tuple[int, int]]:
    """Partition `range(total)` into `slice_count` contiguous half-open blocks.

    The blocks are returned in ascending order, they tile `range(total)`
    exactly with no gap and no overlap, and their lengths differ by at most
    one: the first `total % slice_count` blocks are one element longer than the
    rest. The result depends only on the two arguments, so two processes
    deciding independently produce identical blocks.

    Exactly `slice_count` blocks are always returned. When `slice_count`
    exceeds `total` the surplus blocks are empty and equal to
    `(total, total)`; callers that cannot use an empty block should filter
    them rather than assume they are absent.

    ```text
    slice_indices(10, 3) -> [(0, 4), (4, 7), (7, 10)]
    slice_indices(0, 2)  -> [(0, 0), (0, 0)]
    ```

    This is the partition a parallel `Schedule` expects: pass the blocks to
    `Pool.map` or `Pool.starmap` in a single submission, never one at a time
    through `Pool.apply_async`, for the host reason recorded in this module's
    documentation.

    Raises `ValueError` for a negative `total` or a `slice_count` below one.
    """
    length = _count(total, "total", 0)
    parts = _count(slice_count, "slice count", 1)
    base, remainder = divmod(length, parts)
    blocks: list[tuple[int, int]] = []
    start = 0
    for index in range(parts):
        stop = start + base + (1 if index < remainder else 0)
        blocks.append((start, stop))
        start = stop
    return blocks
