# Rows 20, 21, and 23: Phase-6 resident timing admission

This audit records an executable **blocker**, not a performance result. Rows
20, 21, and 23 each have an authenticated fresh prepared-input correctness
transaction and a frozen common Sage/PARI result projection. None yet has the
resident prepared-kernel boundary required for a comparison with pristine PARI
2.17.4's `bnfinit0(nf,0)`.

The probe authenticates exact corpus bytes and mathematical authority, rejects
four mutations per field, executes each correctness transaction afresh, checks
its transaction-local result authority, and compares its neutral class/unit
result with the common flag-zero projection. It also rejects a changed
reference result. It deliberately takes **no timing sample**.

## Exact missing cuts

- **Row 20:** factor-base state is published to the filesystem; exact unit and
  C7 closure run in a CPython child; source/core files are read while the only
  connected prepared-to-result path is executing.
- **Row 21:** factor, HNF, acceptance, and unit stages publish immutable owners;
  final result construction and cold replay run in CPython children.
- **Row 23:** prepared and intermediate owners are serialized between stages;
  final result construction and cold replay run in CPython children.

These are valid correctness transactions, but timing them would include costs
that PARI's resident clock excludes. A qualifying implementation must compile
and allocate before the clock, retain all mathematical state in one resident
owner graph, run one prepared-to-result function without subprocess or
filesystem work, stop the clock at the final mathematical output, and only then
project, replay, hash, or publish the result.

Run the full fresh check with:

```sh
node bench/pari-class-group-port/row20_21_23_phase6_timing_blocker_check.cjs
```

For the cheap source-boundary and mutation admission check only:

```sh
node bench/pari-class-group-port/row20_21_23_phase6_timing_blocker_check.cjs \
  --admission-only
```

The output must continue to say `matchedTimingRows: []`,
`timingSamplesTaken: 0`, and `qualifiedTiming: false` until the resident cuts
above actually exist. The PARI-side clock specification is already fixed:
prepare `nfinit` outside the clock and time exactly
`bnfinit0(nf,0,NULL,nbits2prec(192))` in authenticated pristine PARI 2.17.4.
