# Row 21 supported factor-base maps

The retained row-21 result contains more exact map material than the original
v2 projection published.  Its 32 relation columns each replay in degree-five
ideal arithmetic against the retained principal generator.  Its integral
32-by-24 right inverse proves that every exponent vector in the 24 retained
factor-base ideals is an integral combination of those principal relations.

`row21_supported_factor_base_maps.py` turns this into exact `factor`, `reduce`,
and `combine` operations on one explicit domain: bounded nonnegative products
of the 24 retained factor-base ideals.  Reduction returns the empty coordinate
vector for the trivial class group plus a signed 32-relation tape and its exact
factored algebraic generators.  The implementation independently checks the
relation-lattice identity and every retained relation's equality as an ideal
with its principal generator.  Those identities plus the integral relation
tape prove the returned product witness without eagerly expanding its often
enormous signed algebraic product.  Combine checks ideal multiplication and
addition of the factored principal witness.  Factor authenticates a supplied factor tape by
reconstructing the ideal; it does not discover a factorization from an opaque
ideal.

The focused checker runs five map round trips, a combine law, all 32 retained
principal relation equalities, deterministic serialization, and rejection of
relation, generator, ideal, right-inverse, and factor-claim mutations.

This is **not** an arbitrary-ideal class-group map.  The retained producer still
lacks an ideal-factorization/reduction owner capable of taking an arbitrary
integral or fractional ideal and deriving a factor-base tape.  Closing that gap
requires the terminal producer to retain the `SPLIT`/`idealred` factorization
path (including denominators and reduction multipliers), not merely the final
factor-base ideals and relation presentation.  Public API integration also
remains absent.  Consequently this artifact strengthens the row-specific map
evidence without changing `outputBoundaryComplete = false`.

Reproduce with:

```sh
node bench/pari-class-group-port/check_row21_supported_factor_base_maps.cjs
```
