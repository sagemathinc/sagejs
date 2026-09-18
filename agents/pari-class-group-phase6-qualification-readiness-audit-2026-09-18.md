# Phase 6 qualification readiness after the 16-row aggregate

This audit is a read-only admission result, not a timing result. It binds the
complete 16-row fresh-prepared correctness aggregate to the frozen Phase 6
population, authenticates the local pristine PARI 2.17.4 installation, and
inventories the remaining timing adapters without opening reserves or running a
long series.

## What is ready

The aggregate receipt at
`/scratch/fresh-prepared-development-aggregate-v1-20260918.json` independently
authenticates all 16 development rows. Each row starts from its raw normalized
prepared-`nfinit` input in a bounded fresh child and reaches an internally
correspondence-complete, public-incomplete neutral result. This closes the
development correctness prerequisite for Phase 6.

The pinned local PARI installation also authenticates exactly:

- archive SHA-256 `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- `buch2.c` SHA-256 `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`;
- `libpari-gmp-tls.so.2.17.4` SHA-256
  `fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f`.

The field-neutral prepared-adapter registry now admits symmetric Sage.js/PARI
pairs for development rows `0,1,3,4,8,10,11,14,16,18,20,23`. Every
registration names one
common immutable semantic projection and is rejected unless both reviewed
implementation modules and their required exports exist.  The runtime wrapper
normalizes only already-computed results; it contains no mathematical
implementation.  Rows without disjoint stage clocks report the complete root as
an explicit unattributed remainder instead of inventing leaf attribution.  Row
3's stronger compact-unit provenance projection is down-projected only by
discarding those extra retained-evidence fields. Rows 8, 10, 11, 18, and 20
use one reviewed, pristine-PARI 2.17.4 adapter and five frozen field
specifications. Their Sage projections are reduced only after exact class and
unit fields, polynomial identity, and row-specific completion evidence pass.
Row 10's private historical PARI polynomial label is explicitly checked before
the public boundary publishes the frozen corpus field id.

The registry and coordinator remain mechanically disabled for campaign use:
`executionEnabled=false` and `reserveOpeningEnabled=false`.  No long series was
run during this audit.

### Generic-PARI development smoke

The generic PARI adapter wave ran one unqualified worker-protocol sample on
each side for rows 8, 10, 11, 18, and 20. In every pair the exact output,
replay, matched-input RNG scope, and work-counter digests agree. These receipts
explicitly retain `qualifiedTiming=false`, `executionEnabled=false`, and
`reserveOpeningEnabled=false`:

- row 8: `/scratch/row8-phase6-generic-wave-smoke-v2.json`, SHA-256
  `3b0f14c633c1c0e7cee343da09cefe6597d59441644de6df46498c7a6a782437`;
- row 10: `/scratch/row10-phase6-generic-wave-smoke-v2.json`, SHA-256
  `cbc9cd8b164467270456c57fc44cfc78de213a4743a803a7bdab40d0f3f49310`;
- row 11: `/scratch/row11-phase6-generic-wave-smoke-v2.json`, SHA-256
  `db0635cfe57f7e17852534b61a115f6636cabcde3fc92019732544fb2b1e7d56`;
- row 18: `/scratch/row18-phase6-generic-wave-smoke-v1.json`, SHA-256
  `1832a15e196ef896af0fedd79566ad000db8775014840d72b31266c3aaa851ad`;
- row 20: `/scratch/row20-phase6-generic-wave-smoke-v1.json`, SHA-256
  `24ba3f0b646c0ee917a556475d7edfebdbd98847f07660034c980cc5b9657c1e`.

The diagnostic kernel clocks range from 0.325 to 5.34 seconds for Sage.js and
0.00220 to 0.591 seconds for PARI. They were collected on a busy, unapproved
host with one repetition and are protocol diagnostics only, not comparative
performance evidence. The read-only aggregate readiness receipt is
`/scratch/phase6-readiness-generic-wave-v1.json`, SHA-256
`65a12f5491b20242b1804a759dacbec50d3145faa50e1f835983af1d5ebb77f3`.

The five new Sage registrations fail closed unless their resident result
explicitly carries the number of native calls inside the clock. Row 11's v2
receipt therefore records 26 native calls rather than the earlier wrapper
default of one. Rows 18 and 20 each explicitly report one through their
respective `executionBoundary` and `boundary` objects. Pre-wave registrations
retain their historical protocol fallback pending a separate row-14/row-16
counter audit; that compatibility does not apply to this wave.

## Exact blockers

Full qualification is not ready, for four independent reasons:

1. Development rows `6,13,19,21` lack matched
   resident Sage/PARI prepared-kernel timing adapters and common semantic
   projections. Their correctness transactions are not timing adapters: they
   include subprocess, replay, publication, and filesystem work not present in
   PARI's kernel clock.
2. All eight final-reserve fields remain unopened, as required by the frozen
   protocol. They have neither aggregate correctness receipts nor timing pairs.
3. `class-unit-qualification-manifest.json` correctly retains
   `executionEnabled=false` and `reserveOpeningEnabled=false`.
4. This CoCalc process is not a human-approved quiet timing authority. Final
   measurements require a pinned physical core, fixed readable governor, timing
   lock, no agents/builds, and a clean frozen checkout on `opt` or `bench-1`.

Consequently, the 16-row aggregate establishes correctness coverage, not a
16-row performance campaign. It would be incorrect to time the existing fresh
transactions and compare those wall clocks with `bnfinit0`.

## Executable audit and next command

Re-run the admission audit without doing mathematical work:

```sh
node bench/pari-class-group-port/phase6_qualification_readiness.cjs \
  /scratch/sagejs-pari-fresh-prepared-corpus-v1 \
  /scratch/fresh-prepared-development-aggregate-v1-20260918.json
```

After a coordinator has approved a quiet host and selected `$CPU`, the existing
single-row candidate series is:

```sh
SAGEJS_TIMING_CPU=$CPU OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
MKL_NUM_THREADS=1 /usr/bin/flock --nonblock --exclusive \
/tmp/sagejs-opt-timing.lock /usr/bin/taskset -c $CPU node --expose-gc \
bench/pari-class-group-port/run_row14_matched_alternating_campaign.cjs \
/scratch/row14-qualified-candidate.json
```

That command remains a row-14 candidate measurement, not the sealed 24-field
qualification. The field-neutral interface and process-isolated 600-second
per-arm journal now exist. The next adapter work is to register the remaining
four development rows, preserving the same symmetric boundary before freezing
and opening the eight reserves.
