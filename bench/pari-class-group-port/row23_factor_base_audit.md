# Panel row 23: authenticated prepared factor base

This cut advances the totally real quintic
`x^5 - 2*x^4 - 141*x^3 + 772*x^2 - 970*x + 341` from authenticated
`nfinit` data to a complete initial PARI-style factor base. It does not consume
the frozen factor-base event, relation rows, class number, regulator, or units.

The sole equation-order index prime is 131. The committed
`row23_index_prime_packet.py` owner computes all three maximal-order packets
above 131 and supplies their residue-degree pattern to the live initial-base
scan. The resulting bound is 123, so 131 is correctly absent from the selected
factor base even though its exact decomposition is required to authenticate the
catalog scan past the bound.

Every selected rational prime is below 131 and unramified. The row-23 ordinary
descriptor owner enumerates the linear and quadratic Kummer factors admitted
by `p^f <= 123`, derives maximal-order generators from the authenticated inverse
integral-basis matrix, and constructs each multiplication matrix from the
prepared basis tensor. Higher-degree factors are represented in the live degree
catalog but never materialized after the norm filter rejects them.

The immutable owner has:

```text
C1 = C2 = 123
KC = KC2 = 31
KCZ = KCZ2 = 20
prodZ = 212661420005067101028135239405341
subfactor = [1, 2, 3]
```

The checker performs two fresh publications before reading the frozen
factor-base event. It then verifies the exact bounds, rational-prime list,
`(p,e,f)` multiset, permutation, subfactor, and all 31 prime-ideal HNF matrices.
The matrices are compared as sets within each rational-prime group. This is the
stable mathematical identity: equivalent Kummer or general maximal-order paths
may choose different uniformizers, and equal-degree ideals can consequently
appear in a different order. A connected relation stage must retain the live
computed order or derive an ideal-identity permutation; it must not import a
column map from the frozen event.

The coordinator accepts only the authenticated prepared-number-field projection
and an output directory. It uses a fixed public prime-catalog ceiling of 257,
writes a deterministic read-only gzip owner under the requested scratch
directory, and records hashes for the row-23 descriptor, shared degree-five,
and index-packet sources and native cores. No frozen answer is available to the
coordinator. Polynomial, inverse-basis, multiplication-tensor, authority, and
payload mutations are rejected before publication.

Reproduce with:

```sh
node bench/pari-class-group-port/check_row23_factor_base.cjs
```

The validated identities are:

```text
owner SHA256  a5565b56521a2dbcd4eb89f9698d2ce9ac386b54a1464ed6a1d699494e6ae69e
source SHA256 50e89a1a77d5380c35ae3ce7cfbf5ed7ba583e05262c70bb4df86693fb8ebd3c
core SHA256   242f98ca7dfe54de1d45dd04ac2efa5e1c226490823895695d85204adafd9a55
```

This is a correctness/dependency result, not qualified timing and not yet the
row-23 40-relation HNF, cyclic order-six class witness, or rank-four unit state.
