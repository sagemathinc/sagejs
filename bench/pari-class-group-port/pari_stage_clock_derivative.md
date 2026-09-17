# PARI 2.17.4 exclusive stage-clock derivative

This is a benchmark-only derivative of pinned PARI 2.17.4. It is not a Sage.js
backend, is not a mathematical authority, and is never linked into product
code. Its only purpose is to divide the complete prepared-`nfinit`
`bnfinit0(nf, 0)` interval into mutually exclusive monotonic leaves.

The pristine authority remains `/home/user/upstream/pari-2.17.4` (or the
explicitly selected equivalent), with these identities:

- archive SHA-256:
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- pristine `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

The derivative is rebuilt from that archive in `/scratch/sagejs-runtime`. Its
instrumented source, shared library, driver, compiler, configure arguments, and
executable are separately hashed in `manifest.json`. The builder refuses any
source other than the pinned pristine `buch2.c`.

## Exclusive boundaries

One thread-local active-stage latch is initialized to residual immediately
before `bnfinit0`. Every switch reads `CLOCK_MONOTONIC`, charges the elapsed
interval to the previous stage, then changes the latch. There are no nested
timers. `finish` charges the final interval. Consequently, by construction and
by the checker:

```text
inclusive root = relation/retry
               + sparse/HNF/SNF/transform
               + unit/regulator
               + honesty/generators/final
               + unattributed remainder
```

The source switches are:

1. **relation/retry** — `START`, factor-base work, `small_norm`, `rnd_rel`,
   and the relation/retry scheduler;
2. **sparse/HNF/SNF/transform** — precision-dependent embedding rebuilds,
   `get_embs`, `hnfspec_i`, `hnfadd_i`, and relation matrix state updates;
3. **unit/regulator** — `compute_multiple_of_R`, `compute_R`, lattice
   extraction and LLL, `cleanarchunit`, `getfu`, and class-log `cleanarch`;
4. **honesty/generators/final** — `be_honest`, `class_group_gen`,
   `buchall_end`, and the final result copy;
5. **unattributed remainder** — setup and teardown not assigned above.

Visits are counted only when the active stage actually changes. The H1 path
must demonstrate repeated unit, final, and residual visits; this rejects a
one-shot nested profile mislabeled as exclusive attribution. A stage with one
real contiguous interval is honestly reported with one visit.

Every active sample also emits the ordered, gap-free stage segments as
`orderedSegments`, with one `{stage, nanoseconds}` record per visit. The
checker rejects overflow, adjacent uncoalesced equal stages, unknown stages,
visit-count disagreement, per-stage reconstruction disagreement, or a segment
sum different from the inclusive root. Aggregate totals therefore cannot hide
an ordering gap or overlap.

The external driver clock brackets the reset, complete call, and finish. It is
reported separately as `kernelNanoseconds`; it is used only for measuring the
clock's perturbation. The same driver is also compiled against the separately
hashed pristine library with all hooks compiled to no-ops. Stage attribution
uses `inclusiveRootNanoseconds`, which is exactly the sum of the five leaves.

## Reproducible commands

Build and print the separately hashed scratch manifest:

```bash
node bench/pari-class-group-port/pari_stage_clock_derivative.cjs
```

Run a small shared-host diagnostic:

```bash
node bench/pari-class-group-port/pari-stage-clock/run-derivative.cjs \
  --pairs 2 --repetitions 1
```

Run the focused semantic/conservation check against the independent pristine
PARI helper:

```bash
node bench/pari-class-group-port/check_pari_stage_clock_derivative.cjs
```

All three accept `SAGEJS_PARI_ARCHIVE`; the pristine comparator additionally
accepts `SAGEJS_PARI_ROOT`. Generated files stay on scratch.

## Exactness gate

The derivative driver includes the pristine authority serializer rather than a
second implementation of it. For both clock-active and clock-inactive runs,
the checker compares the entire standardized record against a fresh process
linked to the pristine library. This comparison covers:

- class group and complete flag-zero unit-correspondence result;
- factor-base and result work counters;
- all 66 words of the terminal PARI RNG state.

The active and inactive derivative arms are also compared on every repetition.
A timing sample is rejected before analysis if any result, work counter, RNG
word, stage key, ordered segment, visit invariant, monotonic flag, or
conservation equation differs.

## At-most-2% perturbation gate

`run-derivative.cjs --enforce-perturbation-gate` implements the gate but does
not itself confer timing qualification. The timing coordinator must run it on
the designated quiet Linux x86-64 host with one pinned core, one thread, fixed
governor/toolchain, no concurrent builds, and the frozen derivative hashes.

The enforced protocol is:

- at least 11 alternating ABBA/BAAB active-derivative/pristine pairs;
- enough repetitions that *each mode in each pair* (active derivative,
  inactive derivative, and pristine) accumulates at least one second of
  externally clocked complete-kernel work;
- identical exact result/work/RNG records in every arm;
- median paired `active derivative / pristine - 1 <= 0.02`.

Each pair additionally runs an inactive derivative control. Its
`inactive derivative / pristine` ratio measures the structural hook-call cost,
while `active / inactive` can be derived to isolate the monotonic-clock reads.

For example, after determining a repetition count large enough for the one
second rule:

```bash
taskset -c PHYSICAL_CORE node \
  bench/pari-class-group-port/pari-stage-clock/run-derivative.cjs \
  --pairs 11 --repetitions REPETITIONS --enforce-perturbation-gate
```

The receipt always says `qualifiedTiming: false`: final quiet-host ownership,
host fingerprinting, raw-receipt preservation, and promotion belong to the
single campaign timing coordinator. A local pass is evidence that the clock is
usable, not a final PARI or Sage.js performance claim.

## Current evidence

The committed focused checker is the durable evidence procedure. It proves
source separation, derivative hashing, exact result/work/RNG agreement,
monotonicity, repeated visits, and exact leaf conservation. Any numerical
shared-host timing printed by that check remains explicitly unqualified and
must not be copied into the campaign's final timing table.
