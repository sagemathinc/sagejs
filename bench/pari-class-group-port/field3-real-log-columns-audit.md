# Field-3 real logarithm columns

## Claim

For the authentic mixed quartic

```text
x^4 - 2000022*x - 2000042
```

the source-transparent native graph regenerates both real-place logarithms
for a deterministic 28-column source prefix at PARI's 153,088-bit retry. The
prefix contains all 26 scalar relations and the first two nonscalar algebraic
generators. All 56 packed triples agree bit-for-bit with pristine PARI 2.17.4.

This is the largest prefix admitted by the ten-minute experiment budget. It
is not a complete 301-column replay, and it contains no complex component,
accepted-column transform, HNF work, regulator, unit, or answer-derived data.

## Precision fidelity

The logical retry target does not imply that every `get_log_embed` input has
153,088 physical bits. The first 26 relations are source-recorded scalar
integers, so `glog` converts each at 153,088 bits. Later relations are
integral-basis columns. `RgM_RgC_mul` preserves `make_M` guard words, producing
real inputs and logarithms with 153,152 or 153,216 bits in this prefix.

The implementation therefore admits exactly the three observed precisions
and translates `logr_abs`/`logagmr_abs` across that corridor. It never rounds a
nonscalar value down to the nominal retry target. Negative real embeddings
enter the same branch by magnitude, exactly reproducing `log(abs(x))`.

## Provenance and independent checks

The checker authenticates the immutable 301-column owner and initial
multiplication-basis owner by complete byte hashes. It independently:

- rebuilds the 16 prepared embedding entries from the exact polynomial and
  integral basis, matching pristine PARI packed triples;
- checks all 64 multiplication-tensor cells and all 16 basis products;
- checks the embedding homomorphism residual at high precision; and
- constructs every principal generator's exact 4-by-4 multiplication matrix,
  computes its determinant with fraction-free elimination, and proves that
  its absolute norm equals the product of the 288 packet norms raised to that
  relation column's exact exponents.

All 301 exact norm identities pass. Their signed determinant digest is
`65e1bbd5c05b89b63d08d91e137c2ac68116db3df66073080d89ca4a55275f53`.
Hashes identify artifacts; the tensor, determinant, relation, root, and
embedding identities provide the mathematical provenance.

## Bounded owner and join layout

The translated output is retained as a read-only, hash-named capsule:

```text
/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority/real-log-columns-09b0a20f1f059757ee3ed347f693fed92fb6749c2d46aac872abcffdd244fde8.json
```

It is 2,582,301 bytes, mode `0444`, and its complete SHA-256 is the hash in
its filename. Its layout is source-column-major:

```text
[real-place-0 packed triple, real-place-1 packed triple]
```

A later weighted-complex triple can be appended per source column to form the
authentic 3-by-301 raw log order. Only after that complete raw owner exists may
the independently retained 301-by-13 transform form the accepted 3-by-13
matrix. This lane performs neither join nor transform.

## Fail atomicity and dynamic paths

All source-column metadata and the scalar-prefix shape are validated before
the embedding rebuild. The complete selected prefix is computed in caller
scratch and copied to public output only after success. Wrong precision,
mutated source order, and undersized output each reject while the public output
and state remain unchanged. The ordinary CPython and JavaScript paths both
replay the same cached `log(2)` source body against the exact PARI triple.

## Resource stopping cut

The qualified run reported:

| item | result |
|---|---:|
| source columns | 28 of 301 |
| packed triples | 56 |
| AGM/series outputs | 54 / 2 |
| native elapsed | 354,374.85 ms |
| total wall | 381,479 ms |
| peak aggregate RSS | 2,322,260 KiB |
| full-run linear estimate | 63.49 minutes |

The run stayed under the 3.5 GiB abort boundary, 4 GiB address-space limit,
and ten-minute deadline. Since the measured full replay is far outside that
deadline, the remaining 273 columns are explicitly uncomputed rather than
silently weakening the budget or importing PARI answers.

## Reproduction

```bash
node bench/pari-class-group-port/check_field3_real_log_columns.cjs
```
