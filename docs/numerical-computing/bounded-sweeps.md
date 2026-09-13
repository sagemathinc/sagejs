# Deterministic bounded parameter sweeps

Sage.js parameter sweeps are a control contract around independent numerical
computations. CPython concurrency requests use a built-in bounded thread pool;
Sage.js runtimes never pretend that a synchronous live closure can be moved to
an isolated worker. The contract provides:

- stable input/output ordering even when work completes out of order;
- explicit requested and effective concurrency;
- deterministic per-item seeds, including reproducible sharding;
- hard aggregate credits for evaluations, cooperative memory, retained trace,
  and serialized result values;
- a global wall-clock deadline and cooperative cancellation;
- structured success, failure, and skipped records for every input;
- `collect` and bounded `fail_fast` modes; and
- canonical finite JSON with callback, executor, seed, and scheduler provenance.

The implementation is ordinary CPython-parseable Python in
`sagejs.numerics.sweeps`. CPython imports `concurrent.futures` lazily only when
the requested concurrency exceeds one. Node, browser, and SEA execution use an
explicit sequential fallback by default and record why. Set
`concurrency_fallback="error"` when parallel execution is a requirement; an
unsupported plan then raises `SweepConcurrencyUnsupportedError` before any
callback runs.

## Basic contract

```python
from sagejs.numerics.sweeps import SweepBudget, run_parameter_sweep

def solve(parameters, context):
    # Every item receives a deterministic integer seed. Construct the domain's
    # RNG explicitly from it when the method is stochastic.
    seed = context.seed

    # Nested numerical operations charge their independently reported work.
    context.consume_evaluations(12)

    # Memory accounting is cooperative and must precede the allocation.
    context.reserve_memory(8_192)
    try:
        context.emit("phase", {"name": "solve"})
        return {"parameter": parameters, "seed": seed, "answer": 1.25}
    finally:
        context.release_memory(8_192)

result = run_parameter_sweep(
    [{"rate": 0.5}, {"rate": 1.0}, {"rate": 2.0}],
    solve,
    seed=20260831,
    concurrency=4,
    budget=SweepBudget(
        max_items=16,
        max_concurrency=4,
        max_evaluations=1_000,
        max_elapsed_ms=10_000,
    ),
    callback_record={
        "kind": "module_function",
        "module": "my_model",
        "name": "solve",
        "replayable": True,
    },
)
```

In CPython this example has `effective_concurrency == 4` and uses the built-in
bounded thread pool. In Node, browser, and SEA it has
`effective_concurrency == 1` plus an explicit fallback reason. An opaque live
callback cannot be silently sent to an isolated JavaScript worker.

Call `plan_parameter_sweep(...)` to validate the complete input and inspect
fixed per-item credits without evaluating the callback. Oversized input count,
serialized input, concurrency, or impossible evaluation allocation is rejected
before any work begins.

## Deterministic seeds and shards

Seeds use `xorshift32-pair-index-v1`: two fixed 32-bit xor/shift mixers combine
the master seed and logical seed index into a non-cryptographic 52-bit integer.
All arithmetic is exact in the supported Python and JavaScript runtimes.
Scheduling, completion order, and executor choice do not affect the seeds. The
logical seed-index range is `0 <= index < 2^32`.

`seed_offset` supports reproducible independent shards:

```python
left = run_parameter_sweep(items[:100], solve, seed=17, seed_offset=0)
right = run_parameter_sweep(items[100:], solve, seed=17, seed_offset=100)
```

The concatenated per-item seeds equal one unsharded run. This does not make an
opaque callback reproducible: the result says `replayable: false` unless the
callback and executor records both make an honest replayability claim.

## Why budgets are divided before dispatch

Mutable global counters are order-dependent under concurrency and need host
locking primitives that do not exist uniformly in browsers. Sage.js instead
partitions integer credits across all items before dispatch. The first items
receive the remainder of an equal division. The shares sum to no more than the
declared aggregate limit.

| Credit | Enforcement |
|---|---|
| evaluations | The outer evaluator costs one; nested work uses `consume_evaluations` or `evaluate` |
| memory | Callbacks reserve and release live bytes cooperatively; item peaks cannot exceed their fixed shares |
| trace events/bytes | `emit` retains only events that fit; excess events are counted and dropped without failing the computation |
| result bytes | Canonical UTF-8 JSON for each returned value must fit its fixed share |
| input bytes | The entire canonical input is measured and rejected before dispatch |
| elapsed time | Every context shares one monotonic deadline and checks before and after callback work |

Equal fixed shares are conservative for highly heterogeneous work. An agent
can group similar cases, make separate sweeps with explicit budgets, or shard
the input with `seed_offset`. Moving unused credits between concurrent items
would make results depend on timing, so this contract deliberately does not do
that.

Memory limits cannot observe arbitrary allocations made inside a foreign or
opaque callback. `reserve_memory` is therefore a cooperative contract. Input
and returned-value limits are measured directly and are not cooperative.

## Built-in and explicit concurrency executors

On CPython, no adapter is required. Each scheduler batch creates a bounded
thread pool with exactly the effective batch size, collects completion-order
results, validates their identities, and restores input order. Fixed per-item
credits and seeds therefore remain independent of thread completion order.
The executor provenance is `cpython_threads/bounded-thread-pool` and is marked
non-replayable because user callbacks may observe shared-state scheduling.

Sage.js on Node, in a browser worker, or in a SEA is single-threaded within one
live Python evaluator. The synchronous API cannot safely serialize an
arbitrary callback, its globals, and a mutable `SweepItemContext` to another
worker. These runtimes are explicitly classified unsupported for automatic
live-callable concurrency. Applications should select one of two honest
policies:

- accept the default, provenance-recorded sequential fallback; or
- pass `concurrency_fallback="error"` to require genuine parallelism and fail
  before dispatch.

A separately qualified host may still provide an explicit executor. A batch
executor receives at most `concurrency` zero-argument jobs and returns each
resulting `SweepItemResult`. It may return them in completion order; the
scheduler validates identities and restores input order.

A batch executor receives at most `concurrency` zero-argument jobs and returns
each resulting `SweepItemResult`. It may return them in completion order; the
scheduler validates identities and restores input order.

```python
def batch_executor(jobs):
    # A host adapter may submit these to an already bounded worker pool.
    return [job() for job in jobs]

result = run_parameter_sweep(
    items,
    solve,
    concurrency=4,
    batch_executor=batch_executor,
    executor_record={
        "kind": "application_worker_pool",
        "name": "my-bounded-pool",
        "replayable": False,
    },
)
```

The executor is a trusted host boundary. Returning missing, duplicate, unknown,
or non-result values converts the complete in-flight batch to structured
`executor_error` outcomes and stops dispatch. At most one batch is in flight,
which provides backpressure.

Focused tests instrument active callback counts and prove that the built-in
CPython executor overlaps work without exceeding the requested bound. They
also prove stable ordering and seeds across different completion orders,
batch-boundary fail-fast behavior, and cooperative cancellation of an in-flight
batch. A future browser adapter must use a replayable callback/module reference
and worker message protocol; it must not pretend an opaque closure is
transferable.

## Failure and cancellation semantics

`collect` runs later items after ordinary callback, validation, or item-budget
failures. `fail_fast` stops scheduling after the first failed batch. With
concurrency greater than one, other jobs in that already-dispatched batch may
complete; no later batch is started.

Cancellation and elapsed-time checks are cooperative. A synchronous callback
that never returns or calls `context.check()` cannot be preempted portably.
Hosts requiring forcible termination must enforce it at their worker boundary.
Once cancellation or the deadline is observed, unscheduled inputs receive an
explicit `skipped_cancelled` or `skipped_elapsed_time` record.

Every planned input has one output record. Common statuses include:

- `completed`;
- `callback_error` and `invalid_result`;
- `cancelled` and `maximum_elapsed_time`;
- `maximum_evaluations`, `memory_budget_exceeded`, and
  `result_budget_exceeded`;
- `executor_error`; and
- one of the explicit `skipped_*` statuses.

Error records contain a stable phase, exception type, and message, not a
host-specific traceback. Non-finite or otherwise non-JSON values become
`invalid_result`; they never leak `NaN` or `Infinity` into result JSON.

## ODE-shaped adapter

An ODE parameter evaluator should charge the nested solver's reported
evaluation count, return the solver's detached `to_dict()` record, and use its
seed for any stochastic forcing. The focused corpus includes an independent
decay-equation adapter without changing the ODE package. Integration with the
public ODE frontend should remain a thin adapter over this scheduler rather
than a second sweep implementation.

## Evidence and current limits

The focused corpus validates CPython and Sage.js/Node on Linux x64, including
partial failures, callback and cancellation exceptions, deadlines, fixed
aggregate credits, trace truncation, invalid/non-finite results, large-input
rejection, result detachment, stable reversed completion order, deterministic
sharding, malformed executors, genuine built-in threaded overlap, concurrency
bounds, deterministic concurrent output, concurrent cancellation, batch
fail-fast, explicit Sage.js fallback, and fail-closed required concurrency.

This lane does **not** claim Windows x64, Linux ARM64, macOS ARM64, browser
worker, SEA, or npm qualification. Those require receipts bound to the final
integrated candidate. The generic scheduler is now discoverable as
`sweeps.parameter_sweep`; its capability record distinguishes hard serialized
input/result/evaluation/trace/concurrency limits from cooperative memory and
cancellation accounting. It explicitly reports callback-depth and raw
allocation-byte limits as unsupported rather than implying process-wide memory
enforcement.

Run the focused overhead benchmark with:

```sh
node bench/numerical-sweeps.cjs
```

It reports warm direct-loop, sweep execution, and serialization time per item
separately for CPython and Sage.js. It is an observation tool, not a release
performance gate.
