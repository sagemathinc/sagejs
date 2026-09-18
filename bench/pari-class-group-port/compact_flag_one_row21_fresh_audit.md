# Compact flag-one row-21 fresh diagnostic cut

Status: executable diagnostic, **not** a result owner, qualification run, or
prepared-`nfinit` computation.

## Fresh computation boundary

`compact_flag_one_row21_fresh.py` is the first compact-tier row in this
experiment that freshly executes the translated Sage.js unit-lattice suffix
rather than admitting a completed result owner or replaying a retained compact
matrix product. On every invocation it computes:

1. rank-three rectangular integer LLL;
2. the first exact logarithm transformation;
3. 4-by-3 real LLL;
4. composition of the 8-by-3 compact unit transform;
5. the second exact logarithm transformation and `cleanarchunit`; and
6. the private compact `getfu` factor selection.

The output transform is

```text
[0,0,0,0,0,1,0,0,
 0,0,0,0,0,1,3,1,
 0,0,0,0,0,-1,1,0]
```

and the private factor is `[1,0,0,0,1,0,1,0,1]` in column-major order.

This uses the ordinary CPython-parseable translated functions already defined
in `row21_rank3_unit_lattice.py`; this lane does not modify that file or the
adjacent live-`getfu` work owned by another lane.

## Exact no-eager-expansion boundary

The CLI authenticates frozen row-21 W0 SHA-256
`45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a`,
then constructs a reduced in-memory input containing only the field identity
and the `hnf` and `acceptance` events. The `fundamental_units` event and the
prepared multiplication tensor never cross into `compute`. Consequently the
cut cannot reconstruct, exponentiate, invert, norm, or publish an exact field
unit.

The checker strengthens that structural boundary in two ways:

- the producer source may not reference `_reference_integral_units` or
  `_exact_unit_replay`; and
- poisoned expanded-unit output and a poisoned multiplication tensor produce
  the identical compact mathematical result, while mutations of the field,
  accepted lattice, exact HNF logs, or W0 digest fail closed.

The receipt states `fundamentalUnitsEventAccessible=false`,
`eagerUnitExpansionExecuted=false`,
`exactFieldUnitMaterializationExecuted=false`, and
`pariFlagOneCallExecuted=false`.

## Honest limitation and dependency cut

This advances beyond row 20's completed-owner admission and row 6's retained
matrix replay, but it still consumes frozen exact HNF/log/acceptance inputs.
Therefore its stable claims remain:

```text
diagnosticOnly = true
publishable = false
qualifiedTiming = false
frozenW0RuntimeInput = true
freshPreparedInput = false
```

The exact upstream dependency cut is a connected row-21 relation/HNF owner,
exact raw-log owner, and accepted-regulator owner. The exact downstream cut is
the signature-`(3,1)` three-right-hand-side `getfu` reconstruction followed by
live exact unit, norm, and sign publication. Only after both cuts close can
this become a fresh compact-tier result owner.

## Validation

Run:

```sh
node bench/pari-class-group-port/check_compact_flag_one_row21_fresh.cjs
```

The checker performs two byte-identical fresh executions, the poisoned-output
control, and four fail-closed mutations. It neither enables the compact
manifest nor opens timing, final-run, or reserve switches.

The adjacent `row21_rank3_unit_lattice_audit.md` now prints the same corrected
24-entry transform.
