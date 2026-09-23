# Compact exact class-group view qualification

This isolated qualification module exercises the map contract that the compact
row-6 presentation can honestly support without constructing a public Sage.js
`IdealClassGroup`.

It supports exact:

- invariant factors, order, and generator orders;
- factor-base generator images and arbitrary factored-ideal coordinates;
- standard-coordinate lifts back to factor-base exponent rows;
- principality decisions for ideals already factored over the authenticated
  factor base; and
- principal witnesses when their sparse relation combination is already in the
  certificate (standard-generator order relations and individual source
  relations), or when a per-query combination is supplied and replayed.

## Remaining arbitrary-witness gap

The class map proves that a factor-base row `x` is principal exactly when its
invariant coordinates vanish.  The current compact certificate does **not**
provide a right inverse that writes every such `x` as `c R`, where `R` is the
sparse relation matrix.  Its `m-n` dependency vectors instead satisfy `d R=0`;
they describe ambiguity among relation coefficients and cannot construct `c`.

The minimal additional Rust boundary is therefore a per-query exact relation
lift:

```text
principal_relation_lift(target_factor_exponents) ->
    sparse [(relation_index, coefficient)]
```

Sage.js need not trust this operation.  It independently checks that the
returned sparse vector `c` satisfies `c R == target_factor_exponents`, then
combines the authenticated algebraic-element witness attached to each relation
as `product(alpha_i ** c_i)`.  A nonprincipal row needs no lift because the
already-certified class map is decisive.  This keeps the static certificate
compact and makes arbitrary principality witnesses exact and fail closed.

There is one earlier boundary for an ideal that is not already represented by
a factor-base exponent row.  Rust must also return an exact reduction receipt

```text
I = (beta) * product(P_j ** x_j)
```

(or the same equality with a documented quotient orientation).  Sage.js must
reconstruct both sides as ideals before accepting `x` as the class-map input.
For a principal `x`, the relation lift above then supplies `alpha`, and
`beta*alpha` is the arbitrary ideal's principal generator.  Thus a complete
arbitrary-ideal map needs two independently replayed per-query objects:

1. ideal-to-factor-base reduction plus its principal multiplier; and
2. principal factor-row-to-relation-coefficients lifting.

The current Rust evidence has neither general per-query boundary.  Relation
dependencies do not replace either one.

This is also the precise incompatibility with the existing production map
contracts.  `_EngineClassGroup._relation_coefficients` obtains a Smith row and
then calls `relation_combination`; `CompactRelationPresentation` intentionally
implements neither operation.  The public `IdealClassGroup` goes further and
requires every `ideal_log` call to return both coordinates and an exactly
replayable quotient-principality witness.  Installing the compact presentation
directly would therefore weaken the current public semantics, so this
qualification view remains isolated until the two receipts above exist.

Run the focused test with:

```sh
python3 test_compact_class_group_view.py
```
