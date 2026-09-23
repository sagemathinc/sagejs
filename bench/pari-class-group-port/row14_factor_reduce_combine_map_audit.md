# Row 14 bounded factor/reduce/combine map audit

## Result

The genuine fresh-prepared row-14 result contains enough exact resident material
to exercise all three ideal-map operations on one honest bounded domain.  The
implementation is
[`row14_factor_reduce_combine_map.py`](row14_factor_reduce_combine_map.py), and
the detached gate is
[`check_row14_factor_reduce_combine_map.cjs`](check_row14_factor_reduce_combine_map.cjs).

Against immutable fresh envelope
`edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2`, the
gate produces receipt
`436bd05ebaa5f1f1d33f0b1a615b0167eec0cfe903153df83b8b287fb702a9c5`.
It first independently replays all 806 retained principal equations (4,962
exact quartic ideal multiplications), then checks:

1. **Factor.** Exact HNF lookup of active factor-base prime 692 returns the
   799-entry unit row and reconstructs the identical ideal.
2. **Reduce.** A genuinely different ideal `I = P_692 * (beta)`, with
   `beta = (0,0,0,1)`, is recovered uniquely by deterministic enumeration of
   the three active class primes and canonical coefficient vectors in
   `[-2,2]^4`.  In the `_EngineClassGroup` convention the result is
   `Q = P_692^-1`, hence `(beta) = I*Q`; the checked integral-HNF equality
   `I = P_692*(beta)` is the exact cancellation witness.
3. **Combine.** Relation coefficients `(1,1,0,...,0)` produce ambient support
   `4*P_0 + 2*P_1 + P_2`.  Exact ideal arithmetic proves that this is the
   principal ideal generated in factored form by the retained generators `2`
   and `5` (equivalently `(10)`).
4. **Round trip.** Direct factor and reduced inputs both map to normalized
   class coordinates `(0,1)` in `C_8 x C_24`; multiplying the retained
   representative by the reduction witness reconstructs the input ideal.

Six payload mutations (factor ideal, relation, principal generator,
multiplication table, factor map, and presentation), six receipt mutations,
and out-of-domain factor/reduce inputs are rejected.  This is untimed evidence.

## Relationship to the production contracts

`_EngineClassGroup` in
`src/lib/sagejs/number_fields/class_unit_groups.py` needs four live operations:

- `factor_over_base(I, factor_base) -> row`;
- `reduce_over_base(I, factor_base) -> (quotient_row, principal_witness)`;
- `combine_relations(coefficients) -> principal_witness`;
- presentation methods providing class coordinates, a class-coordinate lift,
  and relation coefficients for every principal correction.

The bounded receipt has the same sign convention and exact identities, so it
is a genuine integration prototype rather than a differently defined map.  It
is intentionally **not** adapted to `ClassUnitComputation`: that contract may
expose a class group only after the complete witnessed maps and independent
completion evidence exist.

## Exact remaining gap

The existing row-14 `factorMap` is only the 799-by-3 embedding of the three
terminal presentation columns.  It is not an arbitrary-ideal factorization
routine.  The retained `rawToPresentation` owner gives three selected relation
combinations, not the transformations needed to express every one of the 799
factor-base rows modulo the relation lattice.  The second published class
generator also has negative factor exponents; its retained result lacks the
signed ideal inverse, denominator, and principal-scaling witness needed for an
independent reconstruction.  These are why the detached rich-quartic replay
already reports `signed-class-generator-reduction-witness` for that generator.

Consequently the bounded receipt correctly publishes
`generalArbitraryIdealMapReady: false`.  The missing mathematical owners are:

1. an exact valuation/factorization owner for an arbitrary quartic ideal HNF;
2. an unbounded or resumable deterministic reduction owner that finds
   `(alpha) = I*Q`, rather than recognizing only the declared bounded domain;
3. signed factor-base inverse and denominator/scaling replay material;
4. full Smith coordinate/lift/relation-combination transforms for every
   factor-base row, not only the three terminal presentation columns.

## Smallest implementation cut to a usable row-14 map

The smallest honest next cut is not another result wrapper.  It is one retained
`row14-class-map-owner` derived in the fresh transaction, containing:

- the 799-by-2 normalized class-coordinate image of every factor-base basis
  vector;
- two canonical 799-entry lifts for the `C_8` and `C_24` generators;
- for each factor-base basis vector, an exact sparse combination of the 806 raw
  relations proving `e_i - lift(class(e_i))` principal;
- signed reconstruction data for those two lifts; and
- a resumable quartic ideal-reduction cursor plus exact inverse/scaling receipt.

That owner is sufficient to implement `_relation_coefficients`, class-coordinate
lifting, and arbitrary reduction without retaining a dense 799-square Smith
matrix.  The existing 806 principal generators then already provide the
`combine_relations` factored witness.  A matrix-HNF factorization routine (or
an exact adapter to the repository's general ideal valuation implementation)
closes the remaining factor callback.  Only after these pieces replay for
arbitrary predeclared ideals should the v2 `factor_map`, `reduce_map`, and
`combine_map` evidence be marked ready.

## Reproduction

```sh
node bench/pari-class-group-port/check_row14_factor_reduce_combine_map.cjs \
  /scratch/sagejs-row14-fresh-registry-7wM3U3/\
row14-prepared-complete-edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2.json
```

The gate is deliberately pinned to that immutable fresh envelope.  It makes no
qualified timing or general public-map claim.
