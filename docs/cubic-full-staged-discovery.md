# Full staged complex-cubic discovery survey

This is a native diagnostic, not a new public census, independent exact replay,
unseen-neighbor qualification, or production performance claim.

## Coverage under the actual retry policy

On the dedicated `opt` VM, the frozen 1,012 records were executed with the
production effort sequence `(5, 1, 7, 8)` and its conditional retry rule.
All 1,012 native results agreed with both the frozen class numbers/invariants
and PARI 2.17.4. There were no declines, exceptions, timeouts, or mismatches.

| Final accepting effort | Fields |
| --- | ---: |
| 5 | 948 |
| 1 | 44 |
| 7 | 19 |
| 8 | 1 |

Thus the previously reported 64 fixed-effort-five declines are not failures
of the complete existing native policy. They are recovered by subsequent
native calls. Those retries remain a substantial source of work.

The native side executes once per field, with external scratch preallocated;
the PARI side averages 25 fresh `bnfinit(f,0)` calls after one warmup. Execution
is serialized and CPU-0-pinned. This asymmetric sampling locates expensive
cases; it does **not** qualify precise speed ratios. No public constructor,
receipt authentication, or replay cost is included. The twenty preregistered
unseen neighbors were not executed.

## First retry case by absolute discriminant

The first is LMFDB `3.1.384587.1`,
$f=x^3-x^2-7x+122$, with class group $C_2\times C_4$.

| Discovery observation | Time (ms) |
| --- | ---: |
| Native effort 5, declines | 5.011670 |
| Native effort 1, accepts | 4.485270 |
| PARI discovery mean | 1.680000 |

The first native attempt reports phase 43, reason 434. Source inspection shows
that it has not found the required unit witness after class-support compaction
and bounded recovery; it declines before analytic certification. The class
presentation is full rank, with index 8, but that alone does not establish
completeness. The accepted effort retains twelve factor-base ideals and twenty
proof relations.

There is also a precise implementation boundary: the current internal staged
certification guard requires at most eleven factor-base ideals. This field has
twelve, so effort five follows the one-shot route and recovery occurs in a
second host-dispatched native call. Extending the resident staged regime is a
candidate investigation, not yet a justified change to that guard or its
resource envelope.

A separate local instrumented PARI 2.17.4 trace, with `setrand(1)` and debug
level 4, reports twelve ideals, a final $12\times18$ relation matrix, and
regulator approximately $14.16281816524754$. Its small-norm summary is 15
factorizations out of 43 small-norm candidates. Its residue cutoff is 1094,
**larger** than Sage.js's initial 997. Consequently, changing the analytic cutoff
cannot repair this particular initial decline: the missing unit witness must
be understood first. These are trace observations, not proof that the two
implementations collected the same eighteen relations, nor timings of the
instrumented binary.

The next experiment should identify the different relation/unit information
retained by PARI, then test a general native mechanism on repeated controlled
timings. Merely reversing the effort order for this polynomial is not an
algorithmic explanation or an out-of-sample improvement.

## Provenance and metadata caution

Follow-up [raw-relation and radius forensics](cubic-missing-unit-search-forensics.md)
rules out simply raising the eleven-ideal guards and identifies a missing
generator outside the native search ellipsoid. A broader search fixes the
example but introduces corpus regressions; it is not promoted.

- Runtime checkout: `8fa8314380bfd36d14498264160d7733f8cbe7b0`.
- Mathematical source SHA-256:
  `678630a3a68b436e71a34966576baa71a1fe6b645ec5f845cabb4f94cdef2447`.
- Decompressed frozen corpus SHA-256:
  `81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd`.
- Raw survey JSON SHA-256:
  `355c4e1d5bc166777c9229378ae6d64a4b00414e930160f70e5d743f92b22196`.
- Exact executed survey driver SHA-256:
  `b1e2f13ce3614e7b60e9d886ec311f1ca016b9b1fe5f1b2ea2601c5951fcc387`.
- Raw archive, including that driver, output, progress log, and the separate
  local PARI trace: `build/cubic-next-evidence/staged-survey-raw.tar.gz`, SHA-256
  `4cf5ad49aae479cf2ee9deac11f37148a958967235538a589388e2c52af96da8`.

The archive is published in the
[diagnostic evidence release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-staged-discovery-8fa831438-20260908),
marked as a non-latest prerelease rather than a product release.

The recorded v1 survey copied the frozen `equation_order_index` field. That
field is actually LMFDB's field index, not necessarily the index of the supplied
polynomial. The existing `cubic-equation-index.cjs` helper already explains and
corrects this distinction using $\operatorname{disc}(f)=i^2\operatorname{disc}(K)$.
The retained v1 data are unchanged. The checked-in v2 driver reports both the
raw `lmfdb_field_index` and the derived `equation_order_index`; it also rejects
non-64-word retry records. Neither change alters the executed v1 native calls,
whose outputs all had 64 words. Do not use the raw v1 index to classify regimes.

`test/cubic-staged-survey-policy.cjs` compares the diagnostic retry rule against
the actual Python runtime policy on 792 length/phase/reason combinations.

```sh
node bench/class-unit-groups/diagnose-cubic-staged-survey.cjs BUILT_ROOT FROZEN_CORPUS.jsonl.gz GP_EXECUTABLE
```

The output contains identities, every attempted effort and detached output,
and explicit `public_census: false`, `independent_exact_replay: false`, and
`promotion: false` markers. Always retain failures when summarizing new runs.
