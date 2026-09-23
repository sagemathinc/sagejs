# Row 19 field-neutral class/unit adapter audit

## Scope

`row19_class_unit_result_adapter.cjs` projects the authoritative immutable row-19
`buchall_end`-equivalent result into the shared
`class_unit_correspondence_result.cjs` contract. It is a data-only adapter. It
does not run class-group mathematics, discover artifacts, create its own input
authority, register a production dispatch, or claim a public certified
`ClassUnitComputation`.

The accepted source owner is pinned to
`a50e8d85416f1942c8992994112c07fb2ccc303165a25b5c66a3c74f967505c8`.
The checker receives its path and all component-owner paths explicitly. Before
adaptation, `row19_final_result_coordinator.cjs` cold-replays the fixed
first-HNF, terminal, corrected class, and unit owners. That replay verifies all
179,352 first-stage valuation cells, all 182,320 terminal valuation cells, and
the nine complete 424-coordinate generator-power/principal identities.

## Neutral projection

The payload records:

- field `3.1.1086061775432017340256300.107` and its ascending defining
  polynomial;
- class number `39366` and normalized invariant factors
  `[3,3,3,3,3,3,3,3,6]`;
- the complete presentation, nine reduced generator ideals, exact order and
  principal witnesses, class archimedean state, and raw-to-terminal transform;
- the full 424-prime factor base, 430 retained relations and principal
  generators, raw logarithms, metadata, and terminal HNF state;
- rank-one torsion/unit/regulator state, retaining PARI flag zero's exact
  `not_given(LARGE)` decision rather than inventing expanded coordinates; and
- the upstream-assumed GRH, factor-base, relation-bound, and PARI
  correspondence status.

Storage owners contain only canonical decimal integers with authenticated
logical lengths and capacities. Structured evidence is retained as canonical
JSON bytes represented by decimal byte values. The neutral terminal status is
`pari-correspondence-complete-internal`, with `public_complete=false`.

## Authority and claim boundary

The submitted owner cannot authorize itself. The adapter requires an injected
synchronous replay capability whose immutable digest and receipt identify the
cold-replayed owner. It seals the neutral envelope but returns only
`ready-for-out-of-band-publication-authority`. A separately branded detached
authority must reconstruct the projection and authenticate the exact envelope
before the transactional neutral publisher accepts it.

The adapter preserves `usedW0RuntimeData=false`, but deliberately records
`freshPreparedInput=false` and `qualifiedTiming=false`. It does not turn the
completed prepared-field experiment into a fresh-polynomial or performance
claim. The absence of an independent honesty extension is retained explicitly;
analytic bounds remain upstream assumptions.

## Negative and publication checks

The focused checker mutates the authenticated final owner, semantic class and
unit projections, valuation status, factor-base length, assumptions, retained
relations, honesty policy, materialization reason, and terminal public status.
Both ordinary and freshly resealed mutations are rejected. Identical
publication is idempotent, a different independently verified envelope causes a
transactional conflict without changing the current result, the output is
written create-exclusively and changed to mode `0444`, and the envelope remains
below the neutral contract's bounded 64 MiB limit.
