# Row 14 strict prepared-input completion audit

This closes the remaining input-boundary gap in the row-14 experiment.  The
strict transaction has exactly one mathematical runtime input: the
authenticated neutral prepared-number-field projection.  It does **not**
receive the historical W0 trace, the immutable prepared-root owner, or any
accepted-relation, post-806, class, unit, or C7 answer owner.

## Transaction

`row14_strict_prepared_complete_host.cjs` independently authenticates every
component of the projection, including the integral basis, multiplication
tensor, archimedean embeddings, exhaustive prime tables, and PARI product
table.  Inside the same capped transaction it then:

1. compiles and invokes the translated prepared-root graph exactly once;
2. computes C1=C2=5978, KC=799, KCZ=KCZ2=487, the four-element subfactor,
   all 799 ideal descriptors, PARI's terminal RNG state, and 42 initial
   relations;
3. authenticates the resulting factor metadata before Gate C observes it;
4. executes the eight-pass live collection/HNF path through 806 relations;
5. computes the post-806 analytic/class state, rank-two unit suffix, and exact
   HNF ancestry/class witnesses; and
6. independently replays and atomically publishes the C7 correspondence.

The derived prepared-root file exists only in the transaction's private
temporary directory and is deleted on either success or failure.  Its digest
is reported for diagnostics, but is not a stable mathematical identity because
the root envelope honestly records compiler provenance, runtime, and RSS.

## Validation result

The command

```sh
node bench/pari-class-group-port/check_row14_strict_prepared_complete.cjs
```

completed under a 4 GiB address-space/RSS ceiling, 600 CPU-second limit,
600-second wall timeout, and 3 GiB V8 old-space ceiling.  It reported:

- final SHA-256
  `edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2`;
- class group `[8, 24]`, class number 192, and the authentic rank-two
  `not_given(LARGE)` unit result;
- terminal relation state `[806, 8110, 0, 0, 806, 806]` after eight passes;
- 1.210 seconds in the freshly computed initial-root kernel;
- 137.870 seconds in the live Gate-C-through-C7 transaction;
- 139.080 seconds on the inclusive mathematical clock;
- 150.260 seconds for the complete transaction including root compilation,
  warmup, and serialization;
- 1,390,700 KiB maximum RSS and a 1,552,832,864-byte conservative live-owner
  bound; and
- ten rejected input/durable-result mutations.

The timing receipt keeps the initial-root kernel clock separate from its
compiler/warmup/serialization envelope.  The inclusive mathematical clock is
the root kernel plus the complete downstream mathematical transaction; the
wall transaction clock remains available so no setup cost is hidden.

Publication is content-addressed, immutable, and idempotent.  The strict final
digest is byte-for-byte identical to the earlier connected result even though
the previously committed prepared root is absent from the runtime boundary.

## Remaining boundary

This is an end-to-end internal class-and-unit *correspondence* computation.
It is not yet a public Sage-compatible completion because the authentic C6
outcome is `not_given(LARGE)`: compact exact unit ancestry is retained, but
expanded fundamental units are not materialized.  Thus
`correspondenceComplete=true` and `publicComplete=false` remain honest.
