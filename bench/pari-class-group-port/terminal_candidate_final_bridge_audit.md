# Terminal candidate to final-state bridge

This lane closes the exact boundary immediately after the authenticated
post-random LIE pass for `x^4-2000022*x-2000042`.  The preceding live replay
ends with acceptance action zero and compact resident state

- 288 original factor-base rows;
- 301 accepted relation/log columns;
- 286 eliminated `B` rows;
- square `H = diag(2,2)` of dimension 2;
- 6,321 packed logarithm words in `C`.

No HNF, invariant, Smith transform, or final-state fixture is admitted by the
new boundary.  `check_post_rnd_lie_iteration.cjs` calls the bridge while those
owners are still live in the same CPython process that performed collection,
HNF addition, and acceptance.

## Implemented edge

`pari_publish_terminal_candidate_tail` validates action zero, the logical
`H/B/C` shapes, published relation count, accepted regulator, and resident
driver generation.  It then executes the same existing invariant-only Smith
tail used by the resumable driver, copies the compact presentation and packed
logs, and atomically changes the driver from phase 3 to terminal phase 4.

The observed live result is:

- invariant factors `[2,2]` and class number 4, agreeing with pristine PARI
  2.17.4;
- terminal driver prefix `[4,0,4,301,1,2]`;
- bridge state `[0,288,301,2,286,2,6321,572]`.

The existing `pari_class_group_smith_transform` then computes exact left/right
unimodular transforms and their inverses from that live `H`.  The host adapter
constructs the existing `RelationComponentOutput` and
`TransformComponentOutput`, fingerprints their common candidate, and passes
them through `make_internal_payload` and atomic publication.  Detached replay
accepts the result with only `generators` and `units` missing.

The compact resident `H` is itself an exact class-presentation relation
matrix.  At this boundary the relation-to-presentation witnesses are therefore
identities.  This is deliberately narrower than claiming a retained transform
from all 301 collected columns or all 288 factor-base rows: that earlier
elimination is authenticated by the connected HNF/acceptance computation and
its resident `H/B/C` publication, but its full transform is not retained by
the current compact resident ABI.

## Differential and native checks

The genuine corridor starts from the existing prepared field and source trace,
recomputes every post-random and LIE relation/log/HNF value, and hands live
owners directly to the bridge.  It publishes stable candidate, transform, and
partial-result SHA-256 fingerprints.  The focused native checker executes the
same source body on JavaScript, GMP, and tagged backends, obtains `[2,2]` and
4, and checks transactional rejection of a nonterminal action.  The isolated
core contains no Python, JavaScript, V8, or Node-API callback.

## Precise remaining suffix

The existing interfaces suffice for the relation and exact HNF/SNF components,
but not yet for a complete connected final state on this field.  The remaining
source-required objects are substantive rather than adapter gaps:

1. a mixed-signature quartic `ClassGeneratorComponentOutput`, including exact
   signed ideal `genback`, the two nontrivial Smith generators, and their
   principal witnesses;
2. a rank-two `UnitComponentOutput` linked to these 6,321 live packed log words,
   with reconstructed units, exact norm/principality replay, and an independent
   regulator enclosure;
3. the corresponding `FinalDriverComponentOutput` containing authentic
   `Ur/ga/GD/Ge/M1/M2` source arrays plus terminal honesty and `cleanarch`
   decisions.

Until those three components arrive from the same run and owner generation,
`ConnectedFinalStateAssembler` correctly rejects publication.  This lane does
not manufacture empty generators, borrow unit evidence from another field, or
mark Phase 5/public completeness true.
