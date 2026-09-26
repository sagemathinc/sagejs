# Row-19 production-contract probe

Status: executable adapter proposal; diagnostic only, not a live relation/HNF
continuation and not class-group qualification evidence.

## Result

`row19_production_contracts.py` makes the four blockers recorded by the
rank-one unit-suffix audit explicit at one narrow native boundary.

1. **CUP capacity is shape-derived.** The translated `pari_flm_cup` contract
   requires `8*s*d` entries, where
   `s=max(1, rows*columns, rows, columns)` and `d=rows//4+1`. For row 19's
   84-by-78 first modular rank matrix this is
   `8 * 6552 * 22 = 1,153,152` entries. The probe rejects the old 160,000
   capacity and accepts 1,153,152.
2. **Dependent rows are first-class output.** The authentic first HNF state
   `[9,15,408,7,6,65,0,423,0]` binds `W` 9-by-9, `dep` 7-by-9, and `B`
   16-by-408. The adapter requires a 63-entry dependent-row owner and copies
   every entry. A zero-dependent-row state is rejected before publication.
3. **Acceptance is keyed by HNF ordinal.** Two HNF events are represented by
   terminal markers `[0,1]`; the sole acceptance event is `(ordinal=1,
   code=0)`. There is no fabricated first acceptance code. Attaching an event
   to ordinal zero or omitting the terminal event is rejected atomically.
4. **Dense reverse selection is one native bulk call.** The exact operation
   `output[t,source] = sum(transform[column,source] * selected[t,column])`
   runs over the real first-HNF width 423 and six dense selected vectors. The
   checker independently recomputes all 2,538 output coefficients in
   JavaScript and requires exact equality. This removes per-cell Python
   dispatch without changing coefficient semantics or using a bounded word
   type.

The functions validate every shape before writing outputs. The checker also
verifies representative malformed inputs leave published owners unchanged.

## Proposed integration cut

The production connector should allocate CUP owners from the shape formula,
not a field-independent literal; publish `dep_rows` and the dependent owner
from the first `hnfspec`; record acceptance as `(hnf_ordinal, code)` events;
and invoke dense reverse selection through a private native call graph. No
change to the mathematical HNF, retry, or unit algorithms is required for
these four contracts.

This probe intentionally does not claim that the 423-to-430 collection and
second HNF are live, that reverse selection has been connected to authentic
row-19 transforms, or that a complete class/unit result is available.

## Reproduction

```sh
node bench/pari-class-group-port/check_row19_production_contracts.cjs
```

The emitted JSON is explicitly `diagnosticOnly: true` and
`qualifiedTiming: false`; its one-call reverse-selection duration is a smoke
measurement, not a PARI comparison.
