# Row 14 connected prepared-input completion audit

This lane connects the authenticated row-14 prepared input to the existing C7
class-and-unit correspondence result in one capped transaction.  The runtime
inputs are only:

- the authenticated neutral prepared-number-field projection; and
- the immutable prepared-root owner.

In particular, the frozen W0 trace and the previously published accepted,
post-806, class-witness, compact-unit, and C7 owners are not runtime inputs.
Their identities remain useful as fail-closed differential expectations, but
the transaction recomputes their mathematical content.

## Connected computation

`row14_prepared_complete_host.cjs` performs these stages in order:

1. reconstruct and authenticate the factor metadata from the prepared
   projection and prepared-root factor-base data;
2. execute the eight-pass live Gate C relation/HNF schedule through 806
   relations;
3. construct the accepted relation owner from those live buffers;
4. compute the analytic inverse residue, class number, Smith invariants,
   regulator enclosure, and rank-two unit relation lattice;
5. execute the C5/C6 mixed-quartic unit suffix;
6. replay the source HNF operations backwards to obtain exact raw-relation
   ancestry, principal-relation certificates, and order witnesses;
7. compose and independently replay the C7 class-and-unit correspondence
   envelope; and
8. publish the final content-addressed owner atomically with immutable mode.

All intermediate owners live in a private temporary directory and are removed
whether the transaction succeeds or fails.  The durable C7 owner is written
only after every stage and detached replay has succeeded.  Repeating the full
check produces the same digest and accepts the existing immutable file.

## Result and resources

The validated command was:

```sh
node bench/pari-class-group-port/check_row14_prepared_complete.cjs
```

Its second complete run reported:

- final SHA-256
  `edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2`;
- class group invariant factors `[8, 24]` and class number `192`;
- eight collection passes and terminal relation state
  `[806, 8110, 0, 0, 806, 806]`;
- 138.617 seconds total elapsed time;
- 85.442 seconds in Gate C, 14.674 seconds post-806, 0.194 seconds in
  C5/C6, and 29.231 seconds reconstructing exact class witnesses;
- 1,384,772 KiB maximum resident set size;
- a 1,552,832,864-byte conservative live-owner bound; and
- 11 rejected boundary or durable-owner mutations.

The worker is limited to 4 GiB address space, 4 GiB RSS, 600 CPU seconds, a
600-second wall timeout, and a 3 GiB V8 old-space ceiling.

## Honest completion boundary

This is a complete internal class-and-unit *correspondence* result, but it is
not yet a complete public Sage-compatible result.  The authentic C6 outcome is
`not_given(LARGE)`: the compact C5 arithmetic and rank-two unit ancestry are
retained, while expanded fundamental units are deliberately not published.
Consequently `correspondenceComplete` is true and `publicComplete` is false.
No frozen W0 data is used to conceal that remaining materialization boundary.
