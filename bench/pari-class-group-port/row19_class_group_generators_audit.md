# Row-19 class-group generators

Status: live terminal-owner Smith transformation and all nine reduced class
generator ideals complete; exact presentation-order witnesses complete;
principal-ideal order witnesses and archimedean/final assembly remain blocked
on one precisely identified owner.

[`row19_class_group_generators.py`](row19_class_group_generators.py) consumes
only:

- the content-authenticated row-19 terminal continuation owner from commit
  `be36304ba`;
- the authenticated prepared `nfinit` projection; and
- the factor base recomputed by the prepared-only row-19 prefix probe.

No W0 class number, invariant, Smith matrix, class generator, or final class
object is admitted to the worker. The checker opens those answer-bearing
events only after the worker exits.

## Exact result

The existing source-translated Smith root computes

```text
Cl(K) = Z/6Z x (Z/3Z)^8
h(K)  = 39366
```

and publishes full `D`, `U`, `Ui`, `V`, `Ur`, `Y`, `Uir`, `X`, `M1`, and
`M2`. In this field, `M2=0`, while the nine `Uir` requests are

```text
e0, e1, e2, e3, e4, e5, e0+e6, e0+e7, e8.
```

The terminal permutation maps those coordinates back to factor-base indices

```text
348, 306, 265, 234, 213, 212, (348,190), (348,11), 15
```

using zero-based source numbering. The existing cubic `genback`, ideal-HNF,
T2-candidate, and reduction machinery then computes the nine HNFs

```text
[2777,1862,505; 0,1,0; 0,0,1]
[2381,2176,2135; 0,1,0; 0,0,1]
[2027,925,1434; 0,1,0; 0,0,1]
[1787,1358,822; 0,1,0; 0,0,1]
[1607,633,70; 0,1,0; 0,0,1]
[1601,1209,354; 0,1,0; 0,0,1]
[3812821,429520,2769174; 0,1,0; 0,0,1]
[113857,68510,81038; 0,1,0; 0,0,1]
[53,27,14; 0,1,0; 0,0,1].
```

All compact principal-factor tapes are empty on this particular path: the
first six and last generator are already reduced prime ideals, and the two
two-prime products are reduced directly. After the worker exits, the checker
finds exact elementwise agreement with all nine PARI `class_group_output`
ideals. Their JSON projection has SHA-256
`b3e3f362996bd12a1a94232171107d42e60396053461fd59e9f9e0966db3146a`.

## Order witnesses

For every generator request `r_j` of Smith order `d_j`, the worker verifies
the exact integral identity

```text
d_j r_j = W M1_j.
```

It also applies `U`, reduces coordinatewise modulo `D`, obtains exactly the
`j`-th standard basis vector, and rejects every proper divisor of `d_j`.
These are complete exact order and spanning witnesses in the authenticated
presentation `Z^9/W Z^9`; they do not rely on numerical logarithms.

They are not yet explicit principal-ideal identities for `J_j^d_j`. Producing
those requires the raw-to-terminal principal-relation transform, so that the
430 retained relation generators can be aggregated with each `M1_j`. The
terminal continuation retains the raw relations and their generators, but
not that complete transform. The transaction therefore stops fail-closed and
records this as `nextMissingOwner`; it does not silently promote presentation
witnesses into principal-ideal witnesses.

Once that owner exists, the remaining source schedule is to aggregate the
principal generators, compute the corresponding `Ge/Ga`, and assemble
`GD/ga/clg2` and the final class/unit object.

## Reproduction

```sh
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-native-cache-row19-classgen/cache \
SAGEJS_NATIVE_CACHE_ROOT=/scratch/sagejs-native-cache-row19-classgen/root \
  node bench/pari-class-group-port/check_row19_class_group_generators.cjs
```

The checker authenticates the prepared and terminal owners, recomputes the
prepared factor base, rejects mutations of `W`, terminal permutation, a
factor ideal, the prepared embedding, and terminal ancestry, and only then
uses pristine W0 as a post-compute differential oracle. This is correctness
evidence, not a qualified timing result.
