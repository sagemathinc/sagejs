# Panel row 21: live analytic acceptance and rank-three handoff

This cut advances the immutable row-21 first-HNF owner through analytic
inverse-`hR`, regulator reconstruction, and the first live execution of the
committed rank-three lattice/cleanarch suffix.  W0 regulator, accepted lattice,
analytic splitting patterns, inverse-`hR`, and units are not runtime inputs.

## Source-derived analytic catalog

`row21_analytic_catalog.py` derives all 1,230 local degree patterns from the
authenticated quintic and maximal-order multiplication table.  The equation
index primes `2`, `3`, and `47` use the existing radical/quotient decomposition.
Ordinary primes use a bounded quintic squarefree/Frobenius catalog: distinct
linear roots plus `gcd(f, x^(p^2)-x)` determine degree-one and degree-two
counts, after which the residual degree uniquely identifies the remaining
factor.  The characteristic-five inseparable polynomial is reduced to its
exact p-th root before counting.  No Kummer ordering or frozen pattern enters
the computation.

The catalog state is `[0,1230,2198,2818]`.  Existing translated analytic
normalization then selects bound 2,135, processes 321 primes, and produces

```text
inverse hR = [9713003807585430640, 64, -17]
```

## Acceptance and owner

The committed first-HNF owner contributes its exact packed 4-by-32 log matrix.
With `H=[0,0]`, `B=[0,24]`, and eight zero columns, the existing post-HNF and
regulator kernels publish:

```text
post-HNF state        [0, 8, 1]
multiple state        [0, 0, 185, 2]
acceptance state      [2, 0, 0]
reconstruction state  [0, 5, 189, 3]
tentative class index 1
regulator              [5992046333468088822741755840508858568018241354821770564346,
                        192, 16]
accepted lattice       8 columns by rank 3
```

The new immutable owner retains the complete exact HNF log matrix, the live
eight-column real-log projection, analytic authority, accepted regulator, and
24-entry relation lattice.  It is the previously missing live input boundary
for `row21_rank3_unit_lattice.py` and `row21_rank3_getfu.py`.

Before W0 is opened, the checker publishes the owner twice and drives the
committed rank-three lattice and cleanarch code directly from it.  The live
states are integer LLL `[5,5,3,0,0]`, real LLL `[0,0]`, and cleanarch
`[0,3,3,-183,-174,-1,-1]`.  The resulting 8-by-3 compact transform is

```text
[0,0,0,0,0,1,0,0,
 0,0,0,0,0,1,3,1,
 0,0,0,0,0,-1,1,0]
```

Only afterward does the checker use W0 as a postcompute oracle.  The exact
regulator and every accepted-lattice entry agree.  Prepared-field and
first-HNF mutations are rejected before publication.

Reproduce with the lane-private cache:

```sh
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-row21-acceptance-native-cache \
node bench/pari-class-group-port/check_row21_live_acceptance.cjs \
  /scratch/sagejs-row21-first-hnf-inputs/prepared.json \
  /scratch/sagejs-row21-first-hnf-owner/row21-first-hnf-a0eec806853ea37226ded40be707f95abb414b9af6e3bb0a811493147382c136.json.gz \
  /scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json
```

Deterministic identities:

```text
owner SHA256      530fbd38198464fcac1285402cdb1394bdb8ce82f876198770aaef475b2749bb
compressed SHA256 7dc607dc09245780ef953bc3d920ee703dfda79e3ff17ec0da6f0f7d4c74dd7c
```

This closes the upstream dependency named by the committed rank-three lattice
and getfu audits.  Expanded exact units, norms, and signs remain the downstream
getfu owner's responsibility; they are not claimed by this acceptance owner.
