# Row-6 end-to-end gap-closure result (2026-09-19)

## Outcome

For the prepared cubic field

```text
x^3 - 2000000000010*x + 2000000000018
```

the final GMP-only Sage.js artifact computes the complete class-and-unit result
in a median **13,147.617800 ms** over five fresh-process executions. The frozen
pristine PARI 2.17.4 control is **3,886.499614 ms**, so the remaining complete
prepared-field gap is **3.3829x**.

The campaign began from the qualified Sage.js artifact at **62,904.424963 ms**,
or **16.185x** PARI. The retained implementation is therefore **4.7845x** faster
than that artifact and removes **79.10%** of its wall time. It does not yet
claim parity with PARI.

All five final executions reproduced the class number `4`, invariant factors
`[2, 2]`, the rank-two unit state, and all six frozen replay hashes:

| retained state | SHA-256 |
| --- | --- |
| relations | `2e3b35e24e74052a74c07ef69ae880ae5851225f87a31b7c97f32ea102d944df` |
| logarithms | `7621bb00dbec3637ca1fd64aa07a82a604a95292e9e04e96fed9ef2a7b5bf03a` |
| class H | `8eceed23fcee317f80fa7ab35446e7729865c88de6e99653edfc54f8c5ed4737` |
| class C | `7e5425fd516a7cf7f4d8c8cb0704ad1a674c07be40cad482d25a0167134727a2` |
| raw-to-unit-kernel | `80c6f56bbd1b46bd99efa54bd438229571d40295e9c1493c1545f338c12ff0f4` |
| raw-to-presentation | `bb82abc1ef9212e640c019b3ef9106b332881d89cff88b5ad599029522da7014` |

## Final timing sample

The final source and compiler state was rebuilt after formatting and all
compiler validation changes. The five fresh-process times, in ascending order,
were:

```text
13,140.832791 ms
13,144.852351 ms
13,147.617800 ms
13,172.495726 ms
13,189.241693 ms
```

The matched ratios are:

| reference | time | Sage.js/reference |
| --- | ---: | ---: |
| pristine PARI 2.17.4 | 3,886.499614 ms | 3.3829x |
| instrumented PARI 2.17.4 | 3,900.733214 ms | 3.3706x |
| original Sage.js artifact | 62,904.424963 ms | 0.2090x (4.7845x speedup) |

The final non-diagnostic artifact is content-addressed by cache key
`33755208adec3bcc745b03af59ece98753a447f29bf31b3014bedb82f3d621c7`:

| artifact | bytes | SHA-256 |
| --- | ---: | --- |
| generated core C | 28,997,845 | `057f8171b9b99ce01a942d9989073179e107fdbefd0637a729af65fce12a0946` |
| manifest | 86,968,258 | `3abf2db6c8e02e9803be4ae3b3cdd6cb61fecd78a3d2ab6e1173068544a70afd` |
| native addon | 2,902,824 | `576822ab02d561dc4a9e0e4b95a77097d2f42bd1fb00a4455433bf57fce53d66` |

The generated whole-root source SHA-256 is
`0439de6bd39a198323753c25790211b17f102473f6bde07cb737a075d6d2355c`.

## What closed the gap

The decisive change was not a different class-group algorithm. It was making
the existing PARI-derived Python call graph expose and preserve the same
machine facts that its C implementation relies on:

- signed control values remain `int64` through private calls and buffer access;
- exact packed-buffer updates use checked range primitives instead of repeated
  import/temporary/export cycles;
- HNF and reverse-ancestry loops reuse resident storage and perform direct
  slot/range operations;
- the all-real cubic norm path keeps bounded precision/exponent metadata and
  avoids tagged/native duplication;
- log transformations use bounded metadata and direct modular range updates;
- small private helpers can opt into source-transparent `@native_inline`, while
  public functions retain their checked ABI and dynamic fallback;
- checked public real arithmetic delegates to private trusted helpers only
  after shape, precision, ownership, and normalization facts are established.

The final two retained micro-optimizations split checked bounded-real products
and sums from their private trusted cores. The trusted product saved repeated
normalization checks in matrix norms. The trusted signed sum removed repeated
large-integer `bit_length()` validation from internally produced normalized
values, and forcing only that private helper inline avoided its generated
status/output ABI.

This supports the central language experiment: readable, CPython-parseable
Python can express the relevant number-theoretic kernel without an inherent
50x penalty. The compiler must retain boundedness, ownership, representation,
and call-graph facts across the complete private graph.

## Profile and remaining gap

A diagnostic build immediately preceding the final micro-optimizations took
about 13.52 seconds and attributed the root approximately as follows:

| Sage.js region | time | share of profiled root |
| --- | ---: | ---: |
| preparation, factor base, initial relations | 0.857 s | 6.3% |
| relation collection | 4.876 s | 36.1% |
| initial HNF | 5.690 s | 42.1% |
| relation/HNF continuations | 0.169 s | 1.2% |
| reverse ancestry | 1.147 s | 8.5% |
| terminal class and units | 0.680 s | 5.0% |

The boundaries and diagnostic overhead are not identical to the final artifact,
so these values are optimization attribution rather than a second qualified
timing result. Deeper probes found:

- the first `hnffinal` call spent about 2.321 s in HNF/LLL and 0.677 s in
  propagation, across 648,983 reductions and 620,475 Euclidean quotient cases;
- the initial ideal-relation collector spent about 4.585 s in candidate search
  and 0.267 s constructing log embeddings;
- candidate admission dominated enumeration; numerical norm construction was
  the largest measured subregion of prepared `factorgen`.

The next credible route from 3.38x to parity is therefore targeted rather than
architectural: reduce Euclidean/HNF packed-buffer traffic, specialize the
bounded numerical norm/admission cone without growing code, and then reduce
the remaining reverse-ancestry transformation traffic. The campaign gives a
measured strategy for those steps, but does not assert that their sum must
reach parity.

## Rejected experiments

The following exact-output candidates were timed and reverted because their
medians regressed or failed to beat the retained artifact:

- forcing five HNF helpers inline;
- a one-check first-nonzero sign scan primitive;
- resident HNF replacement;
- direct packed views for HNF floor division;
- forced inlining of the entire bounded numerical cone, the fused norm, the
  short product, or the embedding row;
- carrying more `int64` controls through the factorgen ABI;
- hoisting signed-coordinate width validation from embedding products.

This is important negative evidence: broad inlining and larger fused regions
increase code size and instruction-cache pressure. The winning compiler policy
is selective proof propagation plus narrowly chosen private inlining.

## Validation

- five authenticated final row-6 executions, each with all replay hashes and
  the final class/unit projection checked;
- generated gate and whole-root sources are byte-for-byte fresh;
- focused native-inline and signed-word compiler tests pass across native,
  JavaScript, dynamic Sage.js, and CPython execution;
- `pnpm architecture:check` passes, including native, Wasm, resource-lifetime,
  package-graph, and optimizer-opportunity gates;
- `pnpm format:python` passes for the changed mathematical Python;
- `git diff --check` passes.

`pnpm test:changed` cannot reach test selection because the unchanged baseline
file `test/pari-class-group-generic-pari-prepared-adapter.cjs` lacks its
required co-located `sagejs-test-tier` declaration. This is a pre-existing
repository metadata blocker, not a failure in the row-6 changes.

