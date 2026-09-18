# Row 19 resident reverse-HNF and compact-unit cut

This cut removes the `cypari2.matrix(...).matkerint()` boundary from row 19.
It consumes only native owners retained by the same first-HNF and terminal
append execution.  No relation matrix is serialized, copied through CPython,
or reduced by a second HNF.

`row19_phase6_resident_kernel_private.py` reverses the terminal append through
its retained 16-by-16 transform, full HNF, diagonal markers, trailing block,
and terminal permutation.  It then reverses the first `hnffinal` through the
authentic 78 genuine rows, seven dependent rows, 84 active columns, and 339
trailing columns, before applying the retained 423-by-423 sparse-cleanup
transform.  Exact replay checks all 424 rows of all six output columns.

The resulting saturated raw kernel has shape 430-by-6, 2,112 nonzero
coefficients, and maximum coefficient size 20 bits.  Its canonical resident
SHA-256 is
`5f81c98cc8390401c9ec319b320a218141a959833b71ff8055d879633000207f`.

`row19_phase6_resident_unit_private.py` consumes that kernel together with the
same raw packed-log, accepted-regulator, and principal-generator owners.  It
computes exact dyadic regulator multiples `[0, 0, 1, -1, 0, 1]`, certifies all
six residuals strictly below `2^-120`, performs deterministic Bezout cleanup,
and publishes an exact factored unit and its negated factored inverse.  The
unit has 352 nonzero exponents, maximum size 20 bits, and exact norm `+1`.
Its exponent SHA-256 is
`cc218d210f2a9e5400afa92c90365bfd528c9c14bb8e5e5255fa1b4807041343`.

The basis differs unimodularly from the earlier `matkerint()` basis, whose
regulator multiples were `[0, 0, 1, 1, -1, 1]`; both produce a primitive
rank-one unit.  The new result is authoritative because it is derived from
and replayed against the live relation owner rather than compared by basis
coordinates.

The bounded check ran under 4 GiB address/RSS and 600 CPU seconds.  Receipt:
`/scratch/row19-phase6-resident-unit-check-v2.json`, SHA-256
`df2b9f6ade9abf95516d1034a5848c74c90ffe4737da572a655398d40f964fdb`.
The measured resident root was 90.331 seconds with maximum RSS 1,030,024 KiB.
This remains diagnostic, not qualified timing.

## Exact remaining obstruction

The class invariants and exact compact fundamental unit are now resident, but
the nine class-generator principal witnesses are not.  Producing them requires
reversing terminal presentation columns 6 through 14 (not merely the six
kernel columns), composing those raw relation exponents with the retained
Smith transforms, and publishing the corresponding factored principal
generators.  Expansion to integral-basis unit elements is intentionally not
required for an exact compact unit, but the final public result constructor
must preserve the factored witnesses and maps without host serialization.
