# Panel row 21: authenticated prepared factor base

This cut advances the frozen mixed-signature quintic
`x^5 - 90*x^3 - 305*x^2 + 930*x + 36` from authenticated `nfinit` data to a
complete initial PARI-style factor base.  It does not consume the frozen
factor-base event, relation rows, class number, regulator, or units.

`row21_factor_base.py` closes two bounded degree-five gaps.  Its ordinary-prime
factorizer strips all distinct monic linear and irreducible quadratic factors;
the remainder of a quintic is then irreducible.  The native degree-five
`pr_hnf` path constructs every selected ideal directly from its computed
uniformizer and the authenticated maximal-order multiplication tensor.

The existing maximal-order radical/quotient machinery computes the index-prime
decompositions at `2`, `3`, and `47`.  The same path computes norm-eligible
ordinary-prime descriptors.  It deliberately does not materialize a discarded
residue-degree-four descriptor: the quotient decomposition is complete, but
the unsupported uniformizer is never requested after FBgen's norm filter has
excluded it.

The resulting immutable owner has:

```text
C1 = C2 = 57
KC = KC2 = 24
KCZ = KCZ2 = 15
prodZ = 614889782588491410
subfactor = [1, 4, 2, 8]
```

All 24 `(p,e,f)` records and all 24 prime-ideal HNF matrices agree with the
frozen PARI 2.17.4 oracle when compared as ideals above each rational prime.
PARI's Kummer path and the general maximal-order path can choose different
uniformizers.  At `p=29` this also changes the ordering of the three equivalent
residue-degree-one records, so the cut claims exact factor-base ideal sets, not
byte-identical `LP` representatives or relation-column order.  A connected
initial-relation stage must either retain the computed order throughout or add
an independently derived Kummer-order map; it must not import that map from W0.

The coordinator accepts only the authenticated prepared-number-field projection
and an output directory.  It uses a fixed, public prime-catalog ceiling of 257,
well above the derived bound, and writes a read-only deterministic gzip owner.
The checker runs two fresh publications, independently reconstructs the frozen
oracle ideals from its uniformizers, compares bounds, ideal sets, permutation,
and subfactor, and rejects polynomial, multiplication-tensor, authority, and
payload mutations before publication.

Reproduce with:

```sh
node bench/pari-class-group-port/check_row21_factor_base.cjs
```

The current deterministic identities are:

```text
owner SHA256   7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533
source SHA256  f0ee973b3ef0cde58e73c6986101e778d6c91260ad14bdd7b4e21bba89093713
core SHA256    6117cc5a609e9faf58bcbcf197a360ed28799d534caf6225171703bcfbfbf9fd
```

This is a connected correctness/dependency result, not qualified timing and
not yet the row-21 32-relation HNF state.
