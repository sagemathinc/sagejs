# Row-6 end-to-end gap-closure result (2026-09-19)

## Outcome

For the prepared cubic field

```text
x^3 - 2000000000010*x + 2000000000018
```

the final GMP-only Sage.js artifact computes the complete class-and-unit result
in a median **9,602.219511 ms** over five fresh-process executions. The frozen
pristine PARI 2.17.4 control is **3,886.499614 ms**, so the remaining complete
prepared-field gap is **2.4707x**.

The campaign began from the qualified Sage.js artifact at **62,904.424963 ms**,
or **16.185x** PARI. The retained implementation is therefore **6.5510x** faster
than that artifact and removes **84.74%** of its wall time. It does not yet
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
9,554.376304 ms
9,597.346233 ms
9,602.219511 ms
9,614.327607 ms
9,635.811903 ms
```

The matched ratios are:

| reference | time | Sage.js/reference |
| --- | ---: | ---: |
| pristine PARI 2.17.4 | 3,886.499614 ms | 2.4707x |
| instrumented PARI 2.17.4 | 3,900.728954 ms | 2.4616x |
| original Sage.js artifact | 62,904.424963 ms | 0.1526x (6.5510x speedup) |

The final non-diagnostic artifact is content-addressed by cache key
`79918812be454ffd91889445916b07e4672fd1b7a4868464a0902808a280582e`:

| artifact | bytes | SHA-256 |
| --- | ---: | --- |
| generated core C | 29,351,003 | `916989591f5f2092f19de5210e3efa080e2a1b5697895105d7433c55f7d089f5` |
| manifest | 87,939,387 | `e97099f178ee72e7b9c262b0d64f3e1a00778b6df202c1de48f96db68ddec45f` |
| native addon | 2,960,200 | `64bb7f056c3b99afe66d459a663eff377eabdaf571db5732e47aaa78c72009f0` |

The generated whole-root source SHA-256 is
`ac2297536f8a0dcfd07517bfc3236fc28668e032a177d93208896c7b50c371f7`.

## What closed the gap

The decisive change was not a different class-group algorithm. It was making
the existing PARI-derived Python call graph expose and preserve the same
machine facts that its C implementation relies on:

- signed control values remain `int64` through private calls and buffer access;
- exact packed-buffer updates use checked range primitives instead of repeated
  import/temporary/export cycles;
- HNF and reverse-ancestry loops reuse resident storage and perform direct
  slot/range operations;
- the sparse HNF prefix and bounded cleanup retain their transformation in a
  reused signed-word owner, avoiding an intermediate 1,137-by-1,137 GMP
  transformation and its copy;
- the all-real cubic norm path keeps bounded precision/exponent metadata and
  avoids tagged/native duplication;
- the row-6 monic cubic collector recovers the exact homogeneous norm form once
  from nine guarded embedding probes, then evaluates that exact polynomial for
  each candidate instead of reconstructing its norm numerically;
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

The cubic specialization is deliberately proof-gated rather than a row-6
answer table. It is enabled only for a degree-three, all-real embedding basis
whose first column is exactly `[1, 1, 1]`; all nine nontrivial recovery probes
must satisfy PARI's `error <= -32` guard. The dynamic implementation and every
unproved case retain the ordinary numerical path.

## Profile and remaining gap

A diagnostic build of the final source took **9,597.464043 ms** at the external
boundary and **9,509.784185 ms** inside the instrumented root. It attributed
the root as follows:

| Sage.js region | time | share of profiled root |
| --- | ---: | ---: |
| preparation, factor base, initial relations | 0.881398 s | 9.3% |
| relation collection | 3.192800 s | 33.6% |
| initial HNF | 5.070329 s | 53.3% |
| relation/HNF continuations | 0.083151 s | 0.9% |
| reverse ancestry | 0.222566 s | 2.3% |
| terminal class and units | 0.059528 s | 0.6% |
| completion | 0.000013 s | <0.1% |

The boundaries and diagnostic overhead are not identical to the final artifact,
so these values are optimization attribution rather than a second qualified
timing result.

PARI's instrumented boundaries are coarser and not isomorphic to the Sage.js
ones. The closest honest stage aggregation is:

| matched region | Sage.js diagnostic | PARI 2.17.4 instrumented | ratio |
| --- | ---: | ---: | ---: |
| relation side (preparation + initial + collection) | 4.074198 s | 1.100174 s | 3.7033x |
| matrix side (initial HNF + continuations + ancestry) | 5.376046 s | 2.791358 s | 1.9259x |
| remaining terminal/control work | 0.059541 s | 0.009196 s | 6.4743x |
| complete measured computation | 9.602220 s | 3.886500 s | 2.4707x |

The first two rows are the useful comparison. “Terminal/control” is a residual
of differently placed clocks and is too small and structurally different to
interpret as an algorithmic 6.47x result. Deeper probes found:

- the first `hnffinal` call spent about 2.321 s in HNF/LLL and 0.677 s in
  propagation, across 648,983 reductions and 620,475 Euclidean quotient cases;
- the initial ideal-relation collector spent about 4.585 s in candidate search
  and 0.267 s constructing log embeddings;
- candidate admission dominated enumeration; numerical norm construction was
  the largest measured subregion of prepared `factorgen`.

An earlier profile localized candidate work further: enumeration took about
0.893 s and admission 2.481 s. Within admission, repeated numerical norm work
took about 1.668 s and factor/division work 0.794 s. The retained exact cubic
form removes almost all of that repeated numerical norm work; the final root
profile measures relation collection at 3.193 s rather than the earlier 4.876 s.
Diagnostic stage-clock overhead and boundaries mean these are attribution
measurements, not qualified timing.

The next credible route from 2.47x to parity is now sharply concentrated:
reduce the initial HNF's exact packed-buffer traffic and close the remaining
relation-side factor/division gap. A width probe found that the authentic HNF
transformation reaches **612 bits** internally even though its final matrix fits
signed 64-bit words. Thus final boundedness cannot simply be propagated
backward: a competitive fixed-width HNF path needs roughly ten 64-bit limbs
plus wider temporaries, or checked promotion, rather than an `int64`/`int128`
annotation. The campaign gives a measured strategy for those steps, but does
not assert that their sum must reach parity.

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
- replacing the whole HNF transformation by `int64` storage (checked overflow
  was reached; the exact trace subsequently measured a 612-bit peak);
- forcing the private `factorgen` wrapper inline;
- retaining extra square/monomial temporaries in the exact cubic-form
  evaluation, which slightly regressed the fresh-process median.

This is important negative evidence: broad inlining and larger fused regions
increase code size and instruction-cache pressure. The winning compiler policy
is selective proof propagation plus narrowly chosen private inlining.

## Validation

- five authenticated final row-6 executions, each with all replay hashes and
  the final class/unit projection checked;
- a separate authenticated public-host execution against the pinned local
  content-addressed cache;
- one exact final-source diagnostic execution with root and gate markers,
  producing the stage table above while reproducing every replay hash;
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

The older standalone `check_hnfspec_sparse.cjs`/cleanup fixture also rejects a
large synthetic signed-word case before reaching the changed cleanup path. The
same CPython result is produced by the pre-change `HEAD` implementation, so it
is a pre-existing oracle/translation mismatch rather than a regression from
the retained word-transform storage. The authentic row-6 HNF path is covered
by the six exact replay digests in every final and diagnostic execution.
