# Row-13 prepared initial-root audit

## Result

Gates A and B of the prepared-input root are complete for the authenticated
row-13 mixed quartic. A single native invocation reconstructed the PARI 2.17.4
factor base and initial rational-relation state from prepared maximal-order
data and neutral runtime prime/product tables. The frozen W0 trace was used as
an answer oracle only after the worker exited. The immutable owner is ready for
Gate C; this lane did not run relation collection or terminal class-group work.

```text
C1 = C2                         8,305
KC                                999
KCZ = KCZ2                        624
selected descriptors              999
subfactor indices  [2, 4, 5, 7, 8, 10]
initial rational relations         54
target / need              1,006 / 952
Nrelid / missing               4 / 945
automorphism count                    0
relation state       [54, 10110, 945, 7, 0, 1006]
```

The qualifying native call took `1,275,918,503 ns` (1.27592 seconds). The worker's
maximum resident-set high-water mark was `634,900 KiB`, including compilation
and runtime infrastructure. The worker was launched with a 4 GiB address-space
limit, 600-second CPU limit, and 600-second wall timeout.

## Prepared boundary

[`row13_prepared_initial_root.py`](row13_prepared_initial_root.py) accepts the
authenticated polynomial, maximal-order data, embedding data, and exhaustive
runtime prime/product tables. It does not accept W0's successful bounds,
factor-base descriptors, permutation, subfactor choice, relation records,
relation basis, counters, target/need values, RNG snapshots, or answer-derived
capacities.

The root is fail-closed for the row-13 polynomial
`x^4 - 20000000006*x - 20000000010`, discriminant
`-4320000007232000005404800002002560000290992`, signature `(2, 1)`, precision
256, equation index 1, two roots of unity, basis denominator 1, and the public
factor/prime limits 1,048,576 and 65,537. It rejects reused publication state,
short owners, unequal bounds, a factor base beyond the public 1,024-ideal
ceiling, and the untranslated automorphism/minimum-index corridor.

The neutral backing allocation permits 1,024 ideals and 16 additional
relations; logical views are created only after the live `KC=999` and target
are known. Runtime-product limb capacity is computed from authenticated input
and rejected above the public 2,048-word ceiling.

## Differential evidence

After the one-shot worker exited, the checker compared the immutable owner
with frozen authority
`50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589`.
It matched:

- the complete frontier and initial relation state;
- all 999 selected descriptors, including prime, generator, ramification,
  residue degree, and every tau entry;
- the 624 rational-prime groups, permutation, six subfactor indices, derived
  group offsets/counts/completeness, and bad flags;
- all 54 sparse and dense rational relations, hashes, metadata, generators;
  and
- the complete 999-by-999 initial relation basis.

The translated decomposition consumes a different random stream on this field
than pristine PARI, while producing the identical descriptor owner. The live
terminal RNG state is preserved instead of importing W0's answer-bearing
snapshot; its digest is recorded below. This difference does not affect the
factor base or initial rational relations.

Three mutations of authenticated prepared fields were rejected. Mutations of
W0-only descriptors, relations, bounds, and RNG state left the positive
prepared payload digest unchanged, proving that they do not cross the worker
boundary.

```text
plain owner       9cf71f92330b0477388a4d7d5676d53fc02b352015dcf9cc8d0f422e5863378b
gzip owner        f3c33401b8d98069c0c75299a08088c6cc7d42bcdb3b329524bd135236a92404
descriptors       f58cce1075d01a1c51782106c6a43ed5a377e5782435d7d7bea9e868d33cdb5d
packets           a7efd1aa5f89aa61870492a560013fa231588c5a9ca221cc7b5e20de74824c42
relation owner    4fc8c4f1996c18f49b06c91c286979f0f9872409aa7bdf0fc118346493a7cbd4
live RNG state    1e32ae779b615a2dd311ed24e1950122c3157e10b7178019fabf37ab7048b950
```

The read-only content-addressed owner contains 4,829,712 uncompressed bytes
and 183,465 gzip-compressed bytes. Validation-only mode re-read this owner and
performed all cold comparisons without invoking the root a second time.

## Qualification boundary

This establishes live prepared-data factor-base construction, initial rational
relations, and Gate-C readiness. It does not claim collection, HNF, unit,
regulator, or final class-group execution. Prime decomposition remains eager,
and the general automorphism/minimum-index path remains deliberately absent.
