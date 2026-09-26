# Row-10 fresh prepared transaction audit

## Boundary

`row10_fresh_prepared_transaction.cjs` accepts exactly the authenticated,
normalized prepared maximal-order number-field record with authority
`935f8bcc…cc403`.  The transaction does not read the development-panel W0
record, a retained factor/relation/HNF owner, an acceptance result, a retry
schedule, a reserve size derived from the answer, or a terminal answer.

The differential checker reads W0 only to obtain the prepared input.  That
checker object is outside the transaction and is never passed through its
positive prepared-data projection.

## Same-invocation ownership

One invocation constructs and consumes, in order:

1. the row-10 factor base, including the equation-index prime `37`, and 26
   initial relations;
2. the live relation/log owners and first HNF at 293 columns;
3. five continuation passes, including the source's genuine empty pass, with
   HNF checkpoints at 295, 299, 300, and 303 columns;
4. analytic inverse-`hR`, four acceptance attempts, regulator reconstruction,
   the compact rank-two unit lattice, and invariant-only Smith replay;
5. a field-neutral immutable correspondence envelope.

The observed acceptance actions are `[5,5,5,0]`, with tentative class numbers
`96,8,8,4`.  The accepted 2-by-2 presentation has normalized invariants
`[2,2]`; their product agrees with class number `4`.  The accepted regulator is
the exact packed triple
`[3618404972711092908566761403126723494180372471278477576742,192,33]`.

The receipt and detached authority are branded in transaction-local `WeakSet`
and `WeakMap` instances.  A copied receipt is rejected.  Publication uses
exclusive creation followed by read-only permissions and returns a frozen
receipt whose verified result is non-enumerable.

## Unit result and completeness

The exact 2-by-15 compact unit-relation lattice is retained as provenance.  The
matched flag-zero PARI path reports `not_given(PRECI)` for eagerly expanded
fundamental units, so this transaction reports exactly that rather than
inventing expanded units.  It is an upstream-assumed, internally
correspondence-complete result with `public_complete=false`; it is not an
independently certified `ClassUnitComputation`.

## Genuine-run receipt

`node bench/pari-class-group-port/check_row10_fresh_prepared_transaction.cjs --real`
completed with:

- immutable envelope SHA-256
  `6ad503376c2cd6a033b129bbb0b41f734459c526b6a4232c19a14bd35f12d400`;
- mathematical authority SHA-256
  `e6110f0640db959b5133cbddb0668fd1d2f30592cf21a97c6be182eb428e92e5`;
- 303 accepted relation columns;
- class group `C2 x C2` and class number `4`;
- anti-forgery, injected-answer rejection, source audit, and immutable replay
  checks all passing.

## Local duplication and integration follow-up

This lane intentionally duplicates the prepared-root host and Gate-C wrapper
instead of editing row-14 shared files.  The ordinary mathematical sources
remain source-transparent; the wrapper still compiles the shared collector,
HNF, HNF-add, and next-pass Python bodies.  Integration should generalize the
row-8/row-10/row-14 host envelope and the full-rank RELAT retry latch after the
row-local genuine receipts are reviewed.  No shared registry or campaign-plan
file was changed here.
