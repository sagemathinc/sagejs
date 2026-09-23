# Exact relation authority for the real-cubic units

## Conclusion

The two reconstructed units are exact algebraic units and exactly match the
pristine PARI 2.17.4 `getfu` outputs. The unit lane alone does **not** yet
demonstrate that they are the exact products of the relation generators
retained by the Sage.js collector, because it does not retain the intervening
raw-to-accepted map.

The unit-lane boundary needs a column-major integer matrix of shape
`73 x 7`, hence 511 entries, mapping the 73 raw principal-relation generators
to the seven accepted kernel/log columns. The current unit provenance has
shape `2 x 7`; it maps those seven accepted columns to the two reconstructed
units but cannot be composed backward to the raw generators without the
intervening matrix.

The independent presentation-authority lane has identified how to reconstruct
this matrix without trusting unit answers. Its replayed 73-by-73 sparse
cleanup transform `T` maps the raw relations to 15 active columns; composing
`T[:,0:15]` with the first seven kernel columns of the existing 15-by-15 HNF
transform `U` gives the required map. That lane reports zero factor-base sums
and exact products of retained alphas equal to both published units. Once its
detached output is passed to the verifier below, the correspondence is
demonstrable even though the unit lane did not preserve a direct owner.

## Where the mapping was lost

PARI's flag-one path starts `C` with `matbotid(&cache)`. Its lower identity
rows travel through `hnfspec`, `hnffinal`, unit-lattice reduction, and `getfu`.
The resulting `CU` is therefore an exact exponent map back to the cached
principal-relation elements.

The translated resident path propagates the archimedean rows of `C` and keeps
each raw relation's exact integral-basis generator, but it does not propagate
the lower identity rows or an equivalent transform owner. The surviving
`hnf_transform` is only the local final HNF transform; earlier sparse,
assembly, column-removal, and trailing-column operations have already changed
the columns. It is not by itself the missing 73-by-7 map.

The existing compact-unit fixture is admirably explicit about this: its
replay factor pool is derived from the final answers, solely to validate the
compact ABI. It is not evidence for correspondence with the original relation
generators.

## Verifier delivered here

`unit_relation_authority_cubic.py` supplies the exact cold verifier needed
once that mapping is retained. It:

1. multiplies raw cubic generators with signed integer exponents using exact
   rational field arithmetic, so negative powers of nonunit relation
   generators are valid;
2. requires every accepted relation product to normalize to an integral unit
   of norm `+/-1`;
3. applies the retained `2 x 7` unit exponent map; and
4. requires coordinate-for-coordinate equality with both reconstructed units.

The checker confirms that the isolated unit boundary currently lacks exactly
511 entries. It exercises the verifier against the separately labeled replay-
only factor pool and rejects malformed shape, map, target, and multiplication-
table mutations. This is an interface proof, not a false claim that the
answer-derived pool is genuine relation authority. The genuine evidence comes
from composing the presentation transforms described above.

## Required implementation follow-up

Integrate the presentation authority's detached 73-by-7 transform with the
unit component and run this verifier over its retained 73 exact generators.
Bind the resulting map, exact coordinates, and authority hashes into final
state. If future fields bypass that replay, propagate an identity provenance
owner beside `C` through sparse preparation, HNF assembly/finalization,
column removal, later `hnfadd`, lattice selection, and the normalized `getfu`
factor instead.
