# Row 19 immutable `buchall_end` result audit

This lane performs the last, deliberately small transaction for development
panel row 19. It does not rerun relation collection, HNF, Smith reduction,
class-generator reduction, or unit reconstruction. Instead it authenticates
three immutable live owners and joins their already replayable results:

- the terminal relation/HNF/acceptance owner;
- the principal class-group owner, including the raw-to-terminal relation
  transform, full factor-base projection, reduced generator ideals, exact order
  witnesses, and `Ge/Ga/GD/ga/clg2` state;
- the flag-zero unit owner, including the compact fundamental unit, exact
  principal/norm/inverse checks, regulator enclosure, product-formula check, and
  the matched `not_given(LARGE)` materialization decision.

The coordinator is
`bench/pari-class-group-port/row19_final_result_coordinator.cjs`. Its output
schema is `sagejs.pari-class-group/row19-buchall-end-result-v1`.

## Authority and failure boundary

All three inputs must be immutable gzip files with caller-supplied compressed
and uncompressed SHA-256 digests. The terminal and unit digests are pinned in
the coordinator; the class owner is additionally checked by its dedicated
replay authority. JSON parsing rejects duplicate keys. Publication fails closed
if the class owner does not supply all 424 factor-base ideals needed to
interpret its 424-coordinate principal witnesses.

The only accepted class owner is
`1a080b32e3f54e10eb9d525bc0dae139e22d3b1f63defbe332dc0e193f1632e1`
(compressed digest
`8984679d4f8451192d803fef7787235e74f541c2c86a018e0d8584aff2f016ab`).
The earlier `2c056ce...`, `f1f6e278...`, and `30f66b...` class owners are
explicitly revoked because they omitted or predated the descending
`hnffinal` quotient corrections. The superseded `b90156bb...` relation
transform and the derived `743ff927...` final owner are also explicitly revoked
and cannot be replayed.

No frozen W0 trace, PARI class-group answer, or prepared-field computation is
read during this transaction or its checker. The transaction retains the
authenticated prepared-field digest from the terminal owner and records the
field polynomial explicitly.

## Result contents

The result is self-contained and retains:

- class number `39366`, invariant factors, nine reduced ideal generators, all
  Smith/HNF matrices, exact presentation-order witnesses, and exact principal
  witnesses for each generator order;
- the complete 430-by-430 raw-to-terminal relation transform;
- the complete 424-prime factor base, relation records, raw logarithms,
  principal relation generators, terminal HNF state, and class archimedean
  state;
- torsion `[-1]`, the compact rank-one fundamental unit and inverse, regulator,
  exact norm/principality evidence, and the matched flag-zero materialization
  decision;
- upstream analytic assumptions and the explicit distinction between a
  PARI-correspondence-complete internal result and an independently certified
  public `ClassUnitComputation`.

The coordinator hashes each material component and seals the entire payload.
Publication uses create-exclusive writes, checks byte identity on repetition,
and changes the completed file to mode `0444`. The replay entry point reads the
published owner, recomposes it from the three authenticated source owners, and
requires exact canonical equality.

Detached replay additionally reads the fixed first-HNF owner and re-executes
the corrected provenance construction. This checks all 179,352 cells of the
424-by-423 first-stage valuation identity and all 182,320 cells of the
424-by-430 terminal identity. A separate JavaScript replay recomputes the
terminal identity again. For each of the nine class generators, replay derives
the sparse 424-coordinate valuation vector of `J_i**order_i` from its request
and requires exact equality with the retained principal-relation exponents.

## Negative coverage

`check_row19_final_result.cjs` first confirms that the transaction refuses to
run without the principal class owner. It then publishes twice and requires an
identical receipt. Mutations of ancestry, field identity, class invariants,
generator ideals and witnesses, unit factors, regulator evidence, torsion,
class transforms/logs, retained relations, full factor base, assumptions,
source-boundary status, completion status, material digests, and the seal are
all rejected. Finally, detached replay against the three immutable inputs must
reproduce the published bytes.

## Status

This is a completed internal `buchall_end`-equivalent row-19 result under the
same upstream GRH/relation-bound assumptions as the faithful PARI 2.17.4 path.
It is intentionally not labeled as an independently certified Sage class/unit
computation, and it does not eagerly expand the unit which PARI flag zero marks
`not_given(LARGE)`.
