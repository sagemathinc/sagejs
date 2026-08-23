"""The worker-side entry point for parallel multistart optimization.

`sagejs.optimization.schedule` decides *whether* a global search should run
across workers. This module is what a worker actually runs once it has: one
small, dependency-light callable that receives one block of start points,
solves each of them with the same `solve_from_start` the sequential path
uses, and returns plain data.

Its name is listed in `taskRuntimeImports` in
`scripts/precompiled-python-packages.json`, so it is compiled into the
worker task runtime and `multiprocessing.worker_module_available` reports it
as loadable. Everything reachable from its *module-level* imports is
compiled with it, which is why those imports are few and deliberately end at
`sagejs.optimization.random_search`: no symbolic layer, no matrices, no
native kernels. The imports are module-level rather than function-level on
purpose -- the precompiler discovers the graph by importing this module, so
a dependency hidden inside a function body would simply be missing from the
worker runtime and would fail there with `ImportError`.

## How the objective reaches a worker

This is the load-bearing design question, and the honest answer is a
restriction, not a promise.

A worker is a separate evaluator realm; nothing is shared with the parent.
The host serializes each argument of a submitted task individually
(`tools/multiprocessing-host.ts`), and its encoder has exactly two cases: a
JavaScript *function*, which travels as its compiled source plus whatever
module globals it references, and everything else, which travels through the
data serializer. The data serializer has no case for a callable. So:

* A callable passed as its own positional argument to `Pool.starmap` is
  encoded as source and rebuilt in the worker. This works.
* A callable buried inside a list or tuple reaches the data serializer, which
  rejects it. So a single packed payload handed to `Pool.map` cannot carry an
  objective at all.

That is why dispatch here is `Pool.starmap` over argument tuples and not
`Pool.map` over payload objects. (It is never `Pool.apply_async`: that entry
point sends one value per submission and the host picks the destination
worker by the index *within* a submission, so every `apply_async` task lands
on worker `0`. See `sagejs.optimization.schedule`.)

Rebuilding a callable from source restores only what could be serialized
alongside it. Measured on this runtime, an objective may use:

* arithmetic, builtins, and its own arguments;
* module-level *data* globals it references (floats, ints, strings, lists) --
  these are captured and shipped;
* other module-level functions it calls -- these are shipped the same way,
  recursively;
* any module it imports **inside its own body**, for example a `import math`
  as the first statement of the function, which the worker resolves locally.

An objective may **not** close over a local variable. A closure, a lambda
capturing an enclosing scope, or a bound method loses that capture: only
module globals are shipped alongside the source, so the worker raises on the
first evaluation with the captured name reported as undefined.

A module imported at the objective's *module* level is the uncertain case,
and it is uncertain in a way worth knowing rather than papering over. A
module object is not data, so whether it survives depends on the host: in a
kernel session an objective calling a module-level `math` was measured to
cross and evaluate correctly, while the same objective in a compiled script
raised `NameError: name 'math' is not defined` in the worker. Do not rely on
it either way. Importing inside the body always works and costs nothing.

Nothing about any of this is load-bearing for correctness. When an objective
falls outside the supported class the worker raises, the pool call raises in
the parent, `random_search` catches it, re-runs the remaining starts
in-process, and reports the fallback in `GlobalResult.flag`. The answer is
identical; only the wall clock changes. `solve_start_block` takes one
deliberate step to keep that promise true -- see its own documentation --
because a per-start error handler would otherwise turn "this objective
cannot run in a worker" into a run of infinities that the parent would
accept as the answer. This is a narrow, honest capability rather than a
broad broken one, and callers who want the parallel path can stay inside it
by writing the objective as a self-contained top-level function.

## What it costs

Reconstructing a callable from source does not give back the parent's
compiled function: it is rebuilt inside a scope proxy, and the measured
result on the reference host is that one and the same objective costs about
`10.4 ms` per evaluation in the parent and about `23 ms` in a worker, a
`2.2x` penalty that applies to the user's objective and not to the library
code around it (`solve_from_start` and the local method resolve to the real
precompiled module functions). Parallel dispatch has to overcome that
penalty before it wins anything, which is why a two-worker run of an
expensive search can be *slower* than the sequential one, while the eight
workers the default policy allows are a real gain. The measured end-to-end
numbers are in the numerics notes; `sagejs.optimization.schedule` does not
model this factor yet.

## What crosses the boundary

Down: a schema string, the objective, an optional local method, the block's
start points as lists of floats, the box as pairs of floats, a float
tolerance and an integer iteration budget. Up: one `(x, fun, calls)` triple
per start, built from floats, an int and a list of floats. No dataclass, no
result record, and no algorithm state is ever transferred.

## Determinism

Workers never draw random numbers. Every start point is generated in the
parent, up front, from `(seed, index)` alone (see
`sagejs.optimization.random_stream`), and a worker only solves the points it
is handed. Splitting the same start list differently -- or not splitting it
at all -- therefore cannot move a single bit of the answer.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

from sagejs.optimization.random_search import LocalMethod, solve_from_start

WORK_ITEM_SCHEMA = "sagejs.optimization.multistart-block.v1"
"""Wire tag carried by every work item, checked on arrival in the worker.

It exists so that a stale parent and a freshly compiled worker runtime fail
loudly with a `ValueError` naming both schemas, instead of silently
misreading a payload whose positions have moved.
"""

Objective = Callable[[Sequence[float]], float]
"""The objective's contract: one sequence of coordinates in, one float out."""

WorkItem = tuple[
    str,
    Objective,
    "LocalMethod | None",
    list[list[float]],
    list[list[float]],
    float,
    int,
]
"""One `Pool.starmap` argument tuple, in `solve_start_block`'s order."""


def make_work_items(
    objective: Objective,
    bounds: Sequence[tuple[float, float]],
    starts: Sequence[Sequence[float]],
    blocks: Sequence[tuple[int, int]],
    tolerance: float,
    max_iterations: int,
    local_method: LocalMethod | None = None,
) -> list[WorkItem]:
    """Build the argument tuples for one `Pool.starmap` submission.

    `blocks` are the half-open index ranges produced by
    `sagejs.optimization.schedule.slice_indices`, so the caller's partition
    is what decides the split; empty blocks are dropped rather than sent.
    Each item is fully self-contained: it carries its own copy of the
    objective, the box and the budgets, so a worker needs nothing from the
    parent beyond the tuple itself and the order in which the items are
    submitted has no effect on any of them.

    Coordinates and bounds are converted to plain `float` here, in the
    parent, rather than in the worker: a `RealLiteral` or an exact rational
    that reached the objective would either fail to serialize or change the
    arithmetic, and it is better to find that out on this side of the
    boundary.
    """
    box = [[float(low), float(high)] for low, high in bounds]
    items: list[WorkItem] = []
    for begin, end in blocks:
        if end <= begin:
            continue
        block = [
            [float(value) for value in starts[index]] for index in range(begin, end)
        ]
        items.append(
            (
                WORK_ITEM_SCHEMA,
                objective,
                local_method,
                block,
                [list(pair) for pair in box],
                float(tolerance),
                int(max_iterations),
            )
        )
    return items


def solve_start_block(
    schema: str,
    objective: Objective,
    local_method: LocalMethod | None,
    starts: Sequence[Sequence[float]],
    bounds: Sequence[Sequence[float]],
    tolerance: float,
    max_iterations: int,
) -> list[tuple[list[float], float, int]]:
    """Solve one block of start points and return `(x, fun, calls)` for each.

    This is the module-level callable a worker runs, and the only entry point
    this module exposes to the pool. It is a thin adapter: the mathematics is
    `sagejs.optimization.random_search.solve_from_start`, exactly the
    function the sequential path calls, so a start point solved in a worker
    and the same start point solved in-process return the identical triple.

    Each start is solved in turn; `Pool.starmap` distributes the *items*
    across the pool, so there is no further parallelism to find inside one
    block. `solve_from_start` never raises -- a failing start becomes an
    infinite sentinel value that cannot win the parent's reduction -- so one
    hostile start point cannot cost a worker its whole block.

    That swallowing is exactly right for one wild start point and exactly
    wrong for an objective that cannot run in a worker at all: an unbound
    closure variable raises on *every* evaluation, so every start would come
    back as a sentinel, the pool call would succeed, and the parent would
    accept a run of infinities as the answer instead of falling back. So when
    a block produces no finite value whatsoever, the objective is evaluated
    once more, outside that protection, and whatever it raises escapes to the
    parent -- which catches it, re-runs sequentially, and records the
    fallback. An objective that is merely hopeless here (every simplex vertex
    NaN, say) does not raise, and its block of sentinels is returned
    unchanged, one extra evaluation later.

    Raises `ValueError` if `schema` is not `WORK_ITEM_SCHEMA`.
    """
    if schema != WORK_ITEM_SCHEMA:
        raise ValueError(
            "work item schema " + str(schema) + " is not " + WORK_ITEM_SCHEMA
        )
    box = [(float(pair[0]), float(pair[1])) for pair in bounds]
    budget = int(max_iterations)
    limit = float(tolerance)
    solved = [
        solve_from_start(objective, box, start, limit, budget, local_method)
        for start in starts
    ]
    if solved and not any(math.isfinite(outcome[1]) for outcome in solved):
        objective([float(value) for value in starts[0]])
    return solved


__all__ = [
    "WORK_ITEM_SCHEMA",
    "Objective",
    "WorkItem",
    "make_work_items",
    "solve_start_block",
]
