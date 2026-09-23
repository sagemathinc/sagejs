# Process-isolated Phase-6 acquisition boundary

This increment closes the process-safety blocker identified by
`agents/pari-class-group-phase6-qualification-readiness-audit-2026-09-18.md`.
It does **not** open a reserve, approve a host, acquire the timing lock, run a
long timing series, or promote an acquisition to qualified evidence.

## Adapter contract

`qualification_arm_worker.cjs` accepts one canonical descriptor naming an
absolute CommonJS module and factory export. The factory must return an adapter
with:

- the declared `sagejs` or `pari` implementation identity;
- one common, versioned semantic-projection schema;
- an optional untimed `warmup(request)` method;
- `runFresh(request)`, returning the existing strict fresh-sample shape.

Every sample's `output` is required to be an object carrying the declared
semantic-projection schema. The existing execution core then canonicalizes and
hashes that projection, detached replay, terminal RNG state, and exact
source-work counters. Raw mathematical output does not cross the worker
boundary. Both adapter descriptors must declare the same projection schema,
and every retained cross-implementation arm must have identical projection,
replay, RNG, and work digests.

The descriptor is data, not executable source. It contains a module path,
factory name, and structured-cloneable configuration. Field-specific adapters
can therefore bind prepared owners and source provenance without adding a new
coordinator branch.

## Isolation and scheduling

`qualification_process_coordinator.cjs` launches `/usr/bin/prlimit` and a new
Node worker for every calibration probe and every retained arm. Each worker has
a 4-GiB address-space limit, a 600-second CPU limit, a 600-second wall timer,
and single-threaded BLAS/OpenMP environment variables. A timed-out worker's
entire process group receives `SIGTERM`, followed by `SIGKILL` after 250 ms.
Captured stdout and stderr are capped independently at 1 MiB. Worker responses
authenticate a random request nonce and the canonical request digest.

The production campaign API does not accept a shorter timeout. Its schedule is
re-derived from the sealed qualification runner:

- diagnostics: seven alternating `AB`, `BA` blocks;
- final flag-zero or compact flag-one acquisition: eleven alternating `ABBA`,
  `BAAB` blocks.

Calibration is excluded from retained timing and independently doubles fresh
computations until each implementation's arm exceeds one second of kernel
work. Those repetition counts are then frozen for the series. Warmup happens
inside each disposable worker but outside the adapter's reported kernel clock.

## Crash-safe journal

Before launching work, the coordinator creates an exclusive mode-0600 JSONL
journal and fsyncs a declaration containing the case, exact schedule, common
projection schema, and hard limits. It fsyncs each of these transitions:

- calibration started and completed/failed;
- block started;
- arm started and completed/failed/diverged;
- block completed;
- terminal result.

Terminal process events retain a unique worker-invocation UUID, PID, exit code,
signal, timeout state, coordinator-observed elapsed time, bounded stderr, and
capture truncation flags. Successful arms additionally retain the strict
receipt-compatible arm, exact resource counters, peak RSS reported by the
adapter, actual whole-worker peak RSS and CPU/context-switch usage from Node,
and the mutually exclusive stage partition. Thus a crash or timeout
cannot disappear into an incomplete in-memory block.

`readJournal()` rejects duplicate declarations/finals, changed schedules or
limits, missing start/terminal transitions, worker reuse, an arm differing from
its fsynced event, a complete result with a partial block, or a failed result
without its terminal failure. The acquisition result is explicitly schema
`sagejs.pari-class-group/process-isolated-campaign-v1` and always has
`qualifiedTiming=false`; the existing sealed receipt schema is unchanged.

## Focused validation

Run:

```sh
node bench/pari-class-group-port/check_qualification_process_coordinator.cjs
```

The synthetic check uses virtual clocks and is not timing evidence. It verifies
all seven diagnostic blocks and fourteen retained arms in eighteen distinct
workers (four calibration probes plus fourteen arms), checks both fixed
schedules, mutates a journaled semantic digest and observes rejection, records
a cross-implementation wrong-result divergence, records a child failure during
calibration, kills an actually hanging child with a short low-level test timer,
rejects a non-closing stage partition, and rejects differing projection
schemas. No prepared corpus or reserve input is read by this check.

The remaining Phase-6 work is field-specific: instantiate this descriptor for
each already-authenticated development row, complete the sealed reserve-opening
gate, and only then run the fixed campaign on a human-approved quiet Linux
x86-64 host under the global timing lock.
