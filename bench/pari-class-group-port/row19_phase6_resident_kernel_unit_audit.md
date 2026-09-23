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

## Final factored class witnesses

The final cut reverses terminal presentation columns 6 through 14 alongside
the six kernel columns. It composes the resulting 430-by-9 raw relation map
with the retained Smith `M1` transform and replays all 3,816 factor-base
valuations against `order * Uir`. The nine witnesses are byte-identical to the
previous independently constructed principal owner: combined coefficient hash
`029449eb24fbf5654c4b3bb2dcec77aa012082674183fb244bf02e1a7fbf3c1c`
and factor-base exponent hash
`0f371fe920dfea58dee17f439eef453acd9c3c671284b62a9a36dfb2b5509d7c`.

The root retains those owners together with `M1`, `Uir`, the compact unit and
inverse, and the raw presentation map in its private live-owner table. Its
public projection is a compact receipt for a capability-backed exact
**factored** class-and-unit result: class group, nine complete principal
witnesses, rank-one unit and inverse, and the GRH assumption.
`materializeFinalFactored(result)` copies every retained transform, factor, and
logical replay prefix only after timing. No owner is serialized inside the
resident boundary. Expanded integral-basis unit coordinates remain
intentionally absent, and public API integration remains outside this
diagnostic root.

The bounded capability check is
`/scratch/row19-phase6-resident-final-capability-check-v2.json`, SHA-256
`cf037b2b6f0d4aacb7d16fda7463eb152188f5333bb135b93ce1ce078f233d9c`.
It records a 92.660-second diagnostic resident computation and 1,023,296 KiB
maximum RSS; these are not qualification timings.
