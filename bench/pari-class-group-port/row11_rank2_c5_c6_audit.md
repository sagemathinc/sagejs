# Row-11 rank-two C5/C6 suffix

This cut consumes two authenticated inputs: immutable Lane A owner
`46d74e9b…8879`, which retains the 430 exact principal relations and nine
source-derived kernel columns, and pristine row-11 W0
`6444c050…165`, which supplies the original packed logarithms, accepted
rank-two lattice, regulator, and prepared number-field packet. The frozen
`fundamental_units` event is not read while producing the result.

The suffix reconstructs the nine packed kernel-log columns in source order,
checks `R * Tunit = 0`, runs the existing integer and real rank-two lattice
reductions, composes the 9-by-2 transform, runs mixed-quartic
`cleanarchunit`, derives the private real `getfu` factor, and makes exactly
one capped `getfu` call at precision 192.

## Actual terminal policy

The authentic result is `LARGE`, not `PRECI` and not success:

```text
C6 status = 2
C6 state  = [2,21,0,0,0,0,0,1]
materialization = not_given(LARGE)
```

The private `getfu` preparation reaches real exponent 21. PARI's translated
source policy admits exponents only through 20, so the exponent guard returns
`LARGE` before argument-reduction accuracy, linear solving, rounding, or unit
authentication can return `PRECI` or success. Expanded units therefore remain
poisoned and are not published. After publication only, the checker observes
that frozen W0 has `fu=null`, the same regulator, and maximum public `A` real
exponent 20. A null frozen `fu` is compatible with either `LARGE` or `PRECI`
and was not used to choose the reason.

## Exact compact units

The absence of expanded `getfu` output does not discard C5's exact unit
ancestry. Both 9-column unit vectors are composed with Lane A's authenticated
430-by-9 raw transform. The resulting two 430-entry vectors each have 330
nonzero factors. For every unit the producer independently proves

```text
R * Wraw = 0
```

over all 421 factor-base rows, binds every sparse exponent to its retained
quartic principal generator, and computes exact norm and real-place signs.
The published compact results have norms `[+1,+1]` and real-sign pairs
`[(+,+),(-,-)]`. The checker independently expands both sparse products,
matches all principal-generator factors back to Lane A, checks all 842 ideal
kernel equations, and recomputes norm signs from Lane A's exact relation
norms. No enormous algebraic generator product is materialized.

This closes the exact internal unit correspondence for the row-11 result, so
`correspondenceComplete=true`. It does not create expanded fundamental units,
a live prepared-input root, or a public result adapter; consequently
`inputBoundaryComplete=false` and `publicComplete=false` remain explicit.

## Validation

Run the focused replay under the declared cap:

```sh
timeout 600s prlimit --as=4294967296 --rss=4294967296 --cpu=600 -- \
  node bench/pari-class-group-port/check_row11_rank2_c5_c6.cjs
```

The checker regenerates the committed Lane A owner, runs two cold suffix
publications, requires atomic idempotent mode-`0444` output, rejects mutations
across ancestry, logs, transforms, sparse factors, C5, C6, completion, and
input authentication, and reports separate Lane A, first-suffix,
second-suffix, and total wall timings. The qualified run reproduced immutable
owner SHA-256 `7419b9fa…53ac` in 26.229 seconds: 19.125 seconds for Lane A,
3.410 seconds for the first suffix, and 3.309 seconds for the idempotent second
suffix. It rejected 13 mutations/authentication failures. The architecture
suite passed. `test:changed` is deliberately inapplicable to this shared
historical integration branch because its comparison base expands to roughly
1,435 unrelated files.
