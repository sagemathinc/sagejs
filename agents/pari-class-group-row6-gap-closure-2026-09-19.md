# Row-6 end-to-end gap-closure result (2026-09-19)

## Outcome

For the prepared cubic field

```text
x^3 - 2000000000010*x + 2000000000018
```

the final GMP-only Sage.js artifact computes the complete class-and-unit result
in a median **13,046.130473 ms** over five fresh-process executions. The frozen
pristine PARI 2.17.4 control is **3,886.499614 ms**, so the remaining complete
prepared-field gap is **3.3568x**.

The campaign began from the qualified Sage.js artifact at **62,904.424963 ms**,
or **16.185x** PARI. The retained implementation is therefore **4.8217x** faster
than that artifact and removes **79.26%** of its wall time. It does not yet
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
12,990.641916 ms
13,033.042756 ms
13,046.130473 ms
13,055.012792 ms
13,115.294507 ms
```

The matched ratios are:

| reference | time | Sage.js/reference |
| --- | ---: | ---: |
| pristine PARI 2.17.4 | 3,886.499614 ms | 3.3568x |
| instrumented PARI 2.17.4 | 3,900.733214 ms | 3.3440x |
| original Sage.js artifact | 62,904.424963 ms | 0.2074x (4.8217x speedup) |

The final non-diagnostic artifact is content-addressed by cache key
`658f694a38ad3c7caf8c8652ec953a05431733d82aca6b7ea32fca9896464074`:

| artifact | bytes | SHA-256 |
| --- | ---: | --- |
| generated core C | 28,962,264 | `6a14ce1f9954e1aebf3d0c526703321375171af9d9654324a127f8190374e8ac` |
| manifest | 86,774,166 | `131ab9171b37b61f25776520428b9ebd74c48826b8adba0f88a5a134866e5c86` |
| native addon | 2,923,336 | `f21c042bb99bab9f3181e69f60afefc2be72aeb6fe1d95a6d6420b8cd773fba8` |

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

The retained micro-optimizations split checked bounded-real products and sums
from their private trusted cores. The trusted product saved repeated
normalization checks in matrix norms. The trusted signed sum removed repeated
large-integer `bit_length()` validation from internally produced normalized
values, and forcing only that private helper inline avoided its generated
status/output ABI. A follow-up isolated these scalar cores from the
buffer-heavy short-product module, allowing the log-matrix transform to call
the already-proved signed-sum core without expanding an unrelated
representation graph. That change removed another **101.487327 ms** from the
five-run median (**0.77%**) while reducing generated core C by 35,581 bytes.

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

A fresh follow-up profile localized candidate work further: enumeration took
about 0.893 s and admission 2.481 s. Within admission, numerical norm work took
about 1.668 s and factor/division work 0.794 s. The numerical component split
into about 1.189 s for the cubic matrix norm, 0.306 s for ideal division, and
0.138 s for final rounding. Within the norm, embedding rows accounted for
about 0.975 s and real products about 0.258 s. Diagnostic stage-clock overhead
and boundaries mean these are attribution measurements, not qualified timing.

The next credible route from 3.36x to parity is therefore targeted rather than
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
- hoisting signed-coordinate width validation from embedding products;
- caching HNF pivot rows in otherwise unused `lam` diagonal cells;
- selectively forcing only HNF normalization inline;
- selectively forcing the isolated word-real product inline;
- bypassing the checked word-real product at the log-transform boundary;
- direct packed range updates for the sparse HNF `A` row and `lam` scalar.

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
