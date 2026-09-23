# Row 0 raw-relation Smith proof

The row-0 native root retains enough ancestry to prove the Smith form of the
actual 73-by-66 relation matrix.  A generic rectangular Smith reduction is not
needed.

`row0_raw_relation_smith_proof.cjs` consumes only same-run numeric owners:

- the column-major 66-by-73 raw relation matrix;
- the 73-by-73 sparse-cleanup transform;
- the 8-by-15 active relation matrix;
- the 15-by-15 active HNF transform; and
- the 8-by-15 full HNF result.

The raw matrix times the cleanup transform has a 15-column hard block and 58
explicit unit pivots.  Matching complete row vectors binds the hard block to
eight original factor-base rows.  The active HNF transform changes those first
15 columns into seven zero columns and eight further unit pivots.  Elementary
column clearing then produces all 66 unit pivots.  Transposing and reordering
this composed transform yields a 73-by-73 unimodular `U`; a factor permutation
is the 66-by-66 unimodular `V`; and the exact identity is

```text
U * R * V = D,
```

where `D` is the 73-by-66 rectangular identity and `R` is the actual raw
73-by-66 relation matrix.  Thus every Smith factor is one and the presented
class group is trivial.

`check_row0_raw_relation_smith_proof.cjs` independently multiplies the three
matrices with exact `BigInt` arithmetic and computes fraction-free Bareiss
determinants of both transforms.  It also rejects mutations of either the
published transform or the retained HNF ancestry.  No class number, invariant
factor, PARI answer, or terminal 8-by-8 Smith matrix is an input to the proof
producer.

This is correctness evidence only.  It makes no timing, qualification, unit
saturation, class-map, factor-bound, or public-completeness claim.
