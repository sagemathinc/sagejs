# Compact flag-one row-6 retained-owner replay

`compact_flag_one_row6_replay.cjs` is the second executable row in the frozen
twelve-field compact tier. It authenticates development-panel row 6 against
the unchanged `compact-flag-one-manifest.json` and consumes its immutable C7
owner, SHA-256
`b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73`.

This is intentionally a **retained-owner compact replay**, not a qualification
run and not a claim that a fresh PARI `bnfinit0(..., 1, ...)` call occurred.
The receipt says all of that explicitly: `diagnosticOnly=true`,
`qualifiedTiming=false`, `finalRun=false`,
`pariFlagOneCallExecuted=false`, and `measurements=[]`. The frozen manifest's
four execution switches remain false.

## What executes

The row-6 owner ends at `not_given(LARGE)` and retains, rather than expands:

- the 1,137-by-7 raw-to-unit-kernel map;
- the 7-by-2 compact unit transform, whose largest coefficient is
  `289737766830681`;
- the corresponding 1,137-by-2 factored unit transform; and
- the 1,130-by-1,137 exact relation matrix.

The executable replay recomposes every one of the 2,274 factored coefficients
from the first two owners. It then multiplies each factored unit by every
factor-base row and proves all 2,260 exact products are zero. It also retains
the exact norm signs `[-1,-1]`. The replay rejects any owner named
`exact-unit-coordinates` or `expanded-unit-coordinates`; no number-field unit
element is constructed.

Thus this adds a real compact/factored execution beyond row 20's admission
adapter and exercises a materially large coefficient. It still does **not**
open compact-tier timing, match a fresh pristine-PARI arm, authorize the final
run, or count toward the 24-field qualification result.

## Validation

With the live immutable owner retained by the row-6 transaction:

```bash
node bench/pari-class-group-port/check_compact_flag_one_row6_replay.cjs
```

The checker performs repeated in-process replay and a detached CLI replay. It
rejects a run option, mutable or byte-changed authority, a changed factored
coefficient, a changed relation coefficient, an eager-unit owner, and an
`exact_units` materialization tag.
