# Row 21 signature-(3,1) rank-three getfu cut

Status: executable arithmetic suffix, **not** a live row-21 result owner.

`row21_rank3_getfu.py` closes the arithmetic dependency after
`row21_rank3_unit_lattice.py`.  Its ordinary CPython-parseable source follows
PARI 2.17.4 `buch2.c:getfu`: exponentiate the factored 4-by-3 mixed
archimedean matrix, split three real embeddings and one complex embedding into
a real 5-by-5 system, solve all three right-hand sides in source order, round
the fifteen integral-basis coordinates, and select the smaller exact inverse.

The CPython state is `[0,5,-185,0,-130,2,3,1]`: maximum real exponent 5,
phase accuracy -185, successful solve, worst rounding exponent -130, inverse
mask 2, three authenticated units, and determinant 1.  Generated targets take
a neighboring binary64 exponential schedule on this field and report rounding
exponent -2.  Their second candidate differs in one coordinate by four; a
bounded one-coordinate search of radius eight recovers it only through the
same exact unit/inverse predicate, giving native state
`[0,5,-185,0,-2,2,3,1]`. This is an intentional exact-reconstruction extension
at a precision boundary, not acceptance of an approximate unit. The exact output units
are a permutation of PARI's frozen reference vector.  All three have norm -1,
an explicitly reconstructed integral-basis inverse, product `[1,0,0,0,0]`,
and exact real-embedding signs `[-1,1,1]`, `[1,-1,1]`, `[1,-1,1]`.

Run:

```bash
node bench/pari-class-group-port/check_row21_rank3_getfu.cjs
```

The checker reruns the CPython dependency cut deterministically, compiles the
same source, and checks the full suffix on JavaScript, GMP, and tagged native
backends.  It also poisons the frozen reference unit event and requires the
postcompute differential to reject it.  Reference units never enter the
arithmetic call or exact replay.

The predecessor still obtains its relation lattice, HNF logarithms, and
regulator from frozen W0.  Consequently this cut reports `publishable=false`
and `correspondenceComplete=false`.  Its only remaining dependency is the
replacement of that predecessor input by a live authenticated row-21
HNF/log/regulator owner; no arithmetic work remains in the rank-three getfu
suffix.
