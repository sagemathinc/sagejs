# Field 3 C5 unit-lattice/cleanarch cut

This cut implements the PARI 2.17.4 `buchall` suffix between analytically
accepted regulator reconstruction and `getfu`.  It is deliberately not a
class-group answer fixture and does not publish a unit.

## Authenticated inputs

The coordinator requires three independent immutable, mode-0444 owners:

- the complete `301 x 15` terminal ancestry (`[A13 | Ce2]`), including the
  exact relation-image certificate;
- the eventual C3 high-precision `3 x 13` packed logarithm owner; and
- an analytically accepted C4 candidate which binds both preceding owners by
  SHA-256, carries terminal analytic-acceptance semantics, and records a field-derived
  successful `bad_check` decision.

C5 verifies that the C3 `301 x 13` transform is exactly the unit prefix of the
full terminal transform.  It recomputes C3's two modular latches over packed
`A`, rather than trusting the copied latch values.  Consequently a candidate
relation lattice cannot be paired with a different logarithm matrix or raw
relation ancestry.

The accepted-C4 schema is
`sagejs.pari-class-group/field3-accepted-c4-v1`.  Its analytic promotion is a
separate owner because C4 itself intentionally stops with
`analyticPending=1`.  C5 requires `candidatePublished=true`,
`analyticPending=false`, `badCheckStatus=0`, `fieldDerived=true`, and a
completed acceptance state.  This lane does not invent the analytic
class-number authority.

## Arithmetic and publication

The native source-transparent root runs, in order:

1. rectangular integer LLL on the exact `2 x 13` relation lattice (`U1`);
2. packed-log multiplication `A*U1`;
3. real rank-two LLL (`U2`) and `det(U2)=+-1`;
4. `U=U1*U2`, followed by `cleanarchunit(A*U,R)`;
5. `prepare_getfu(clean,I)`, getfu's second real LLL factor `F`, and
   `det(F)=+-1`;
6. `prepare_getfu(clean,F)` and exact compositions
   `Ufinal=U*F`, `Wraw=Tunit*Ufinal`.

`cleanPacked` is the pre-`F` cleanarch matrix.  The four 18-cell prepared
arrays are the result of applying `prepare_getfu(clean,F)`.  This boundary is
intentional: C6 can independently replay preparation before reconstructing
exact algebraic units.

All public buffers remain untouched until every arithmetic gate succeeds.
The outer coordinator repeats the exact raw-transform product, then publishes
a content-addressed JSON owner atomically and idempotently at mode 0444.

The general mixed-quartic cleanarch precision admission was extended from the
old experimental ceiling through the 153088-bit field target; it changes no
arithmetic.  The internal 153152-bit embedding guard is not a `compute_R` or
cleanarch retry target.  A genuine `compute_R` precision retry would target
229632 bits and is outside this C5 cut; `getfu` PRECI remains terminal here.

## Focused evidence and deferred gates

`check_field3_c5_unit_lattice_cleanarch.cjs` uses a synthetic rank-two packed
logarithm lattice.  It is generated from dyadic values and identities, not
from the field-3 answer or any retired suffix fixture.  The check exercises
the complete CPython C5 arithmetic, both determinant gates, raw transform
composition, immutable/idempotent publication, and mutations of analytic
acceptance, owner binding, latches, and regulator.  It also compiles the
81-argument native root and exercises its JavaScript short-owner preflight.

An authentic 153088-bit run, C6 `getfu`, broad repository tests, and a
matched PARI performance measurement are explicitly deferred to integration.
The lane neither imports the old field-3 suffix authority nor embeds a
regulator, relation lattice, unit, class generator, or final answer.
