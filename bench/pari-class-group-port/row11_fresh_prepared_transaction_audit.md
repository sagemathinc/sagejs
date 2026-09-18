# Row 11 fresh-prepared class-and-unit transaction audit

## Scope

This lane implements the development-panel row 11 transaction from one
authenticated normalized prepared number field.  The transaction does not
accept a W0 transcript, factor base, relation owner, HNF owner, acceptance
owner, class-group answer, unit answer, timing claim, or reserve claim.

The reviewed prepared authority is
`8402de0c28b648eb190a26fd87283b43239c2eef6d684699dfcc2d50ace3798b`
for the mixed-signature quartic
`x^4 - 2000010*x - 2000018`.

## Same-invocation ownership chain

`row11_fresh_prepared_transaction.cjs` authenticates the prepared data and
then, without publishing an intermediate mutable owner:

1. runs the row-11 prepared initial root once;
2. constructs the 421-prime-ideal factor base and 24 initial relations;
3. performs relation collection and resident HNF updates at 427, 428, and 430
   columns;
4. runs post-HNF acceptance on the 428- and 430-column checkpoints, obtaining
   actions `[5, 0]`;
5. reverses those actual HNF calls to the compact `430 x 11` source transform;
6. replays all 430 principal relations and proves the nine relation-kernel
   columns and the embedded `diag(2,2)` class presentation;
7. constructs two explicit order-two ideal-class witnesses;
8. reconstructs the rank-two unit lattice and exact compact factored units;
9. seals a field-neutral immutable result under a detached replay authority.

The mutable owners remain private to one call.  Both the internal handoff and
the public receipt are branded by module-local `WeakSet` instances.  A copied
or fabricated receipt cannot publish.  The verified result is non-enumerable
on the frozen public receipt.

## Mathematical evidence

The genuine execution proves:

- HNF states with column counts `[427, 428, 430]`;
- acceptance schedule `[5, 0]`;
- class presentation `diag(2,2)`, class number `4`, and invariant factors
  `[2,2]`;
- replay of all 430 principal relations, including exact ideal and norm
  identities (2,538 ideal multiplications in the exact replay);
- two order-two class witnesses using respectively 333 and 330 signed
  retained principal factors;
- two exact compact factored units using 330 nonzero relation factors each;
- exact accepted regulator
  `[3312459349406852470715008030762890377736385282279907980094,192,38]`;
- unit norms `[1,1]` and real signs `[1,1,-1,-1]`.

The final expanded-unit materializer returns PARI policy status `LARGE`.
Consequently the neutral boundary correctly publishes `not_given(LARGE)`
rather than pretending that four integral coordinates were materialized.  The
private mathematical authority nevertheless retains exact compact signed
relation products for both fundamental units and checks their regulator.

The fresh continuation need not choose the identical terminal relation/log
basis as the historical differential transcript.  Its terminal presentation,
acceptance, regulator, exact class witnesses, and exact unit relations are
validated from its own owners.  The frozen transcript is used only by the
`--real` checker, after the transaction has completed, to recover the prepared
projection and compare final invariants.

## Forgery and injection checks

`check_row11_fresh_prepared_transaction.cjs` checks by default that:

- a fabricated internal receipt cannot publish;
- an answer-bearing extra field cannot cross either public request boundary;
- the row-11 runtime source graph contains no scratch-panel path or retained
  answer reader;
- the transaction contains no timing or reserve claim;
- a fresh receipt uses a module-local weak brand.

With `--real`, it additionally runs the genuine prepared-only computation,
checks immutable publication and detached-copy isolation, checks all counts and
exact invariants above, and uses the frozen trace only as a post-publication
differential oracle.

## Shared dependencies for integration

This lane deliberately does not edit a registry or shared integration file.
It depends on the existing neutral-result/authentication boundary, native
compiler, arithmetic kernels, and the already reviewed exact row-11 class
closure mathematics in `row11_terminal_class_closure.py`.  The continuation
control kernel is still named `row14_next_pass.py`; it is a generic reviewed
control primitive used locally by the row-11 host.  Registry admission and any
renaming/generalization of that shared primitive belong to the integration
lane.
