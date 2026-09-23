# Authentic PARI h1 Outcome-C adapter

This adapter gives `h1_outcome_c_worker.cjs` a real PARI 2.17.4 arm for

```text
x^3 - 20018*x + 20034.
```

It is a benchmark-only foreign-library boundary, not a Sage.js mathematical
implementation. The source links to the pinned GPL-licensed PARI library and
is intentionally kept separate and attributed accordingly.

## Exact timing boundary

Every arm uses a fresh helper process. Before the worker starts its monotonic
clock, the helper:

1. initializes PARI's stack;
2. constructs the fixed polynomial; and
3. runs `nfinit` at 192-bit precision.

Only after the helper emits its authenticated `READY` record does
`h1_outcome_c_worker` start the root clock. Each timed repetition resets the
RNG to the requested seed, calls

```c
bnfinit0(prepared_nf, 0, NULL, nbits2prec(192))
```

and serializes the standardized result, source-work record, and complete
66-word terminal PARI RNG state. Thus polynomial parsing, compilation, process
startup, `pari_init`, and `nfinit` are outside the root. `bnfinit(flag=0)`,
result extraction, serialization, and pipe transfer are inside it. PARI stack
teardown is after the root.

An independent fresh process performs the same prepared computation before the
timed helper is created. The timed record must agree exactly with that cold
replay; the replay authority hashes the result, RNG, and work records. This
extra authority computation cannot warm the timed helper.

## Standard result

The result is deliberately limited to data genuinely produced by flag zero:

- class number, invariant factors, and generator ideals;
- unit rank, the column-major packed logarithmic unit matrix, and packed
  regulator;
- torsion order and torsion generator in the power basis;
- explicit internal-correspondence assumptions and terminal status.

`expandedFundamentalUnits` is `null`. PARI flag zero retains compact/logarithmic
unit data but does not materialize `bnf.fu`; pretending otherwise would change
the measured algorithm. A Sage.js arm can match this contract without eager
unit expansion.

The implementation-neutral work record contains the field degree, factor-base
size, retained class-row count, and logarithmic matrix shape. It contains no
PARI path, binary hash, or implementation label, so a mechanically equivalent
Sage.js computation can produce the same work digest. Source, library, and
executable hashes remain checker provenance rather than mathematical output.

## Stage coverage and qualification

PARI's public `bnfinit0` entry point does not expose mutually exclusive
relation/HNF/unit/final callbacks. This adapter therefore declares
`stageMode = "whole-root-only"`. The complete duration is placed in
`unattributed-remainder`; all four named stages remain exactly zero. The worker
accepts that arm as a whole-root diagnostic, but the existing exclusive-stage
paired coordinator rejects it because named-stage coverage is incomplete.

Consequently this lane never sets `finalTimingRun`. A final paired receipt
requires either audited PARI-internal stage hooks or an explicitly reviewed
whole-root paired schema, plus the matching authentic Sage.js adapter and at
least seven alternating pairs.

## Pinned authority

The adapter requires the pristine PARI 2.17.4 archive SHA-256

```text
02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53
```

and the pinned `src/basemath/buch2.c` SHA-256

```text
904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac
```

The live library must report version `2.17.4`. Override the default locations
with `SAGEJS_PARI_ROOT` and `SAGEJS_PARI_ARCHIVE`.

## Check

```bash
node bench/pari-class-group-port/check_pari_h1_outcome_c_adapter.cjs
```

The check uses the actual 351-parameter sanitizer, executes independent replay
and authentic timed calls, runs two repetitions through
`h1_outcome_c_worker` with `process.hrtime.bigint`, authenticates all four
digests, and rejects a changed prepared polynomial. Its reported root duration
is diagnostic only and `finalTimingRun` remains false.
