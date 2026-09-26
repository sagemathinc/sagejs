# Authentic h1 Outcome-C receipt adapter

This lane implements the coordinator and worker protocol needed to produce a
real Outcome-C stage receipt for `x^3 - 20018*x + 20034`. It does **not** run or
claim the final diagnostic, because the current prepared root stops before the
successful unit retry and final result construction.

## Sanitized prepared input

The coordinator consumes the `inputs.json` boundary already emitted by
`check_resident_generated_class_attempt.cjs`, then reparses the actual
`pari_resident_generated_class_attempt` signature. The parameter names, order,
and storage types must match exactly. The sanitizer emits only:

- the field's neutral prepared basis, multiplication table, embeddings, and
  analytic/factor-base inputs on the existing audited allowlist;
- zeroed writable work and result owners; and
- the two established negative output sentinels used to prove that analytic
  result owners are overwritten.

Any nonzero class number, invariant, relation, HNF, regulator, unit, driver, or
other result owner fails before a worker is started. Expected answers and
extra envelope fields are rejected. Exact integers become canonical decimal
strings, floating values must be finite, owner and aggregate cell limits are
checked, and the detached canonical input is SHA-256 authenticated.

## Fresh workers and authenticated evidence

Each arm starts a fresh worker process. The request binds implementation,
field, seed, pair index, repetition count, and sanitized-input digest. The
implementation adapter receives a deep fresh input for every repetition and a
single-active-stage switch callback. It must visit the four established
exclusive stages and return a standardized correspondence-complete result,
cold-replay record, terminal RNG state, source-work record, and terminal
status. The worker accepts only the audited
`pari-correspondence-complete-internal-h1` terminal status. The cold replay
record has an exact shape, carries the authenticated authority hash, and must
bind its `resultSha256` to the returned result; an asserted completion boolean
or an unrelated replay object is insufficient.

The worker computes all four digests itself. Each must be stable across fresh
repetitions, and Sage.js/PARI digests must agree inside every pair. Worker
responses have exact fields: they cannot supply a slowdown, attribution,
conclusion, or qualification flag.

The coordinator schedules at least seven alternating `AB`, `BA` pairs and
passes their arms to `h1_exclusive_stage_timing.cjs`. That existing verifier
proves interval exclusivity and exact gap partitioning. Only after all workers
have returned does the coordinator call `deriveSummary`; hence the attributed
gap fraction is derived evidence, never an assertion accepted from either
implementation or the caller.

The wrapper receipt pins the prepared input, root source, generated Sage.js
source, Sage.js object, PARI library, PARI executable, worker, and adapter
hashes. It remains a diagnostic receipt with `qualifiedTiming: false` and
`finalTimingRun: false`; the quiet-host and final ABBA/BAAB qualification are a
later boundary.

## Exact missing integration edge

At base commit `f0d3cfe24d58e46492635fd20c6a24dd5e0c0772`, the source-transparent
prepared root reaches an accepted class-number-one candidate. The internally
complete correspondence result exists, but is composed later from separately
retained artifacts. It is not one fresh call of the prepared root.

The first missing timed edge is:

```text
accepted candidate
  -> resident p2240 unit input/retry
  -> live final driver
  -> correspondence-complete standardized result
```

This is the same boundary recorded by `check_prepared_h1_root.cjs`, refined to
include the now-complete out-of-root authority composition. Until both Sage.js
and the pristine PARI worker expose those four stage switches around one fresh
prepared computation, the real adapter modules do not exist and no Outcome-C
receipt can be produced. A candidate-only adapter is rejected explicitly.

## Contract check

```bash
node bench/pari-class-group-port/check_h1_outcome_c_adapter.cjs
```

The check uses the real 351-parameter prepared-root ABI, a sanitized neutral
input, temporary deterministic protocol adapters, seven alternating worker
pairs, and injected clocks. It is not a performance run. It also proves that
answer leakage, malformed sentinels, candidate-only completion, and
worker-supplied attribution all fail closed. It also forges a cold-replay
result binding and proves that the worker rejects it.
