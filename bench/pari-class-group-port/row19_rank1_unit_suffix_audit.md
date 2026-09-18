# Row-19 rank-one unit suffix audit

Status: executable dependency cut over the frozen accepted relation/log owner;
not a live relation owner and not qualification evidence.

## Result

The scratch probe authenticates W0 SHA-256
`0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9`,
projects the prepared field, 430 retained principal relations, retained raw
logs, factor descriptors, and accepted regulator into a child process, and
does not expose the frozen `fundamental_units` event to that child.

The child independently recomputes every logarithm from the 430 principal
generators and checks the result against the retained 2-by-430 packed log
matrix. PARI `matkerint`, through the already installed `cypari2`, computes the
saturated integer kernel of the 424-by-430 relation matrix in about five
seconds.

The resulting kernel has rank six and regulator multiples

```text
[0, 0, 1, 1, -1, 1]
```

with all dyadic residuals below `2^-120`. Their gcd is one. The deterministic
Bezout choice is the sixth kernel column. Its exact raw dependency has 352
nonzero coefficients, range `[-431146, 571332]`, 20-bit maximum magnitude, and
L1 norm `28287286`. Direct multiplication of the relation matrix by this vector
is exactly zero.

Every principal-generator norm is recomputed from the prepared multiplication
tensor and checked against its exact factor-base norm product. This proves the
factored unit has exact algebraic norm `+1`. Negating all 430 exponents gives
its exact factored inverse, also of norm `+1`, and their formal product is the
identity. The output intentionally does not claim an expanded integral-basis
element: W0 itself has `fu = null`, and a source-transparent expansion trial
continued building huge factorback products until it was stopped. The factored
representation is exact and compact.

Only after the child exits does the parent inspect frozen unit data. It sees a
primitive 6-by-1 transform and no expanded frozen fundamental element. The
postcompute oracle does not supply the child dependency or its inverse.

## Production dependency cut

The native mixed-cubic two-pass connector is close but not row-19-ready:

1. Its fixed 160,000-entry CUP arena is too small. The row-19 first-pass
   cleanup reports `col=84` and `lnz=79`; the 84-by-78 rank matrix requires
   1,153,152 entries under the existing capacity formula.
2. The first HNF has seven dependent rows (`W 9x9`, `dep 7x9`, `B 16x408`).
   The generic initial reverse-selection path currently hardcodes zero
   dependent rows.
3. Pure-Python reverse selection at this size is a substantial dense loop. The
   exact `matkerint` dependency cut is deterministic and finishes the unit
   suffix in 6.27 seconds end to end.
4. The generic retry adapter expects acceptance codes `[1, 0]`; row 19 has two
   HNF events but only the terminal acceptance event `[0]`.

A future live relation owner need only replace the frozen projection with the
same neutral data contract: multiplication tensor and embeddings, ordered
factor descriptors, 430 principal relation vectors/generators, raw log matrix,
and the accepted regulator. No frozen fundamental unit or transform is needed.

## Reproduction record

The temporary executable was retained outside the repository at
`/scratch/sagejs-row19-rank1-unit-suffix/row19_rank1_unit_suffix.py`, with
SHA-256 `82fdec563ef1a9c848897ff89fe75e19e93e65657861bc9e7680058d71c7a6d3`.
Two clean executions were byte-identical. The 15,844-byte result has SHA-256
`061abe66c4f3471edc3c4324c1117e6914bd5264856339f7b09652450dc22d13`.
Scratch is unbacked and these paths are evidence locations, not repository
dependencies.
