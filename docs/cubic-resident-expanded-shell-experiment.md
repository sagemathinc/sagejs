# Resident outer-shell experiment

This is a source-copy diagnostic, not a production change. The baseline is
the primitive-content integration at `87fd1a83c`. Existing certificate checks
remain authoritative; none of these measurements is public-API or holdout
qualification.

## Intervention

The existing staged collector may resume only with its original ideal plans
and cursor semantics. This experiment does not mutate either. Instead, after
the closure helper returns status zero with missing-unit diagnostics 43/434,
a separate phase visits the already-prepared ideal bases. Its search region is

$$
B_{\rm old}<v^T Gv\leq\max(8g_{00},2g_{11}).
$$

This is the earlier diagnostic enlargement, **not PARI's volume formula**.
Unprepared ideals are skipped; the phase does not claim to finish any
unexamined part of the original inner search. It keeps field data, ideal-power
tables, relation rows, generators, modular admission state, and online exact
HNF resident. Normal admission can already extend ideal powers lazily.

The existing staged regime is extended experimentally to factor-count twelve,
while retaining that regime's original initial target of $n+22$. Earlier
regimes keep their original two closure attempts before trying the added phase.
No polynomial or expected-answer dispatch is introduced. The original closure,
principal-relation authentication, and fixed-plan collector bodies remain
byte-identical in the source copy.

One additional $1\times11$ integer matrix holds the new plan. The old plans
and cursors are unchanged. Coordinate bounds remain at most 64, the candidate
guard remains 500 per new ellipsoid, and the existing presentation capacity
and arena limits are retained. Total search work can increase because this is
an additional phase; unchanged limit constants do not mean unchanged resource
consumption. Failures never authorize a successful result.

For positive-definite $G$, Cauchy–Schwarz in the $G$ inner product gives

$$
v_i^2\leq (v^T Gv)(G^{-1})_{ii}
          = (v^T Gv)\frac{\operatorname{cofactor}_{ii}(G)}{\det G}.
$$

The integer ceiling and ceiling-square-root bounds therefore enclose every
point of the new ellipsoid. The strict lower test excludes the entire original
ellipsoid. These are search-coverage facts, not class-group completeness:
only unchanged exact closure can establish the answer. CPython tests cover
135 integral Gram cases, the shell partition, unchanged input plans, and
target/candidate-limit behavior. They are tests, not a Lean proof.

## Full-shell measurements

The source-copy SHA-256 is
`980b61d10f6b162393079d040643d661d7ae09f6b6e7382439ef69c71b583eaf`;
native cache key:
`5ea52597d493743bcc9c1c1d75a0fbba6ba257ef02bb7175dda98c78ca86b66b`.

Across the frozen 1,012 development fields, first-effort acceptances rise
**957 to 961**, with no lost baseline acceptances and no exceptions. Every
accepted class number and invariant list agrees with the frozen corpus.
The four gains are `3.1.384587.1`, `3.1.761319.2`, `3.1.1063351.3`, and
`3.1.3276404.1`. Survey SHA-256:
`4da89ea07fd31067fe742ae6181c96012edadfce9eb36f61fc4da2c848b6bd33`.

Controlled opt timings use the existing seven alternating-order rounds,
64 native calls per sample and 256 fresh PARI calls per sample, with
preallocated native buffers and the unchanged host retry policy:

| Polynomial | Baseline ms | Expanded shell ms | PARI ms | Paired ratio |
| --- | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 9.1862 | 10.0085 | 1.5313 | 1.0906 |
| $x^3+9x-55$ | 1.7922 | 1.8040 | 1.1875 | 1.0038 |
| $x^3-x^2+3x-4$ | 1.2926 | 1.2999 | 1.0078 | 0.9976 |
| $x^3-x^2-11x-63$ | 2.1944 | 2.2061 | 1.2188 | 1.0080 |

**Avoiding the restart did not make the target faster.** It is about 9% slower
in this paired experiment. The four acceptance gains do not justify promoting
the full-shell schedule. Public receipt/replay, unseen-neighbor and platform
qualification have not been performed for it.

## Exact stopping-point forensics

A separate diagnostic capture records 26 rows before expansion and 43 after
it on $x^3-x^2-7x+122$. PARI checks every principal-ideal equality, then computes
the integer kernel for each prefix and multiplies its generators exactly.
The first 26 rows yield only units $\pm1$; prefix 27 first yields a nontrivial
unit. Its new generator is $a+9$. This is an observed witness, never a
production lookup or polynomial-specific rule.

Thus the normalized baseline's missing unit is genuinely absent from its raw
relation prefix; it is not merely lost in compaction. But once expansion
starts, the first newly admitted row already supplies the needed unit evidence.
Continuing to 43 rows is unnecessary for *existence* of that witness. Whether
a smaller batch passes the complete class-group certificate still requires
running the unchanged closure; existence alone does not establish index one.

The four-row batch passes the same 961 fields, including the same four gains,
with no lost baseline acceptances and no exceptions. It is a separately
compiled experiment, not an inferred performance improvement.

The one-row batch passes 959 fields, gaining `3.1.384587.1` and
`3.1.3276404.1` without losing a baseline acceptance or raising an exception.
Its target result passes the complete unchanged native certificate, not just
the unit-existence test. The other two four-row gains still decline at this
first effort; there is no general claim that one new row is enough.

A second controlled opt run compares all three schedules with the same
baseline and PARI in alternating order:

| Polynomial | Baseline ms | Full shell ms | One row ms | Four rows ms | PARI ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 9.2323 | 10.0547 | 5.6788 | 6.3639 | 1.5391 |
| $x^3+9x-55$ | 1.8052 | 1.8043 | 1.8246 | 1.8051 | 1.1875 |
| $x^3-x^2+3x-4$ | 1.3095 | 1.3099 | 1.3038 | 1.3120 | 1.0117 |
| $x^3-x^2-11x-63$ | 2.2003 | 2.1976 | 2.2024 | 2.2085 | 1.2266 |

On the target, paired median candidate/baseline ratios are 0.6157 for one row
and 0.6918 for four rows: roughly 38% and 31% reductions. PARI remains about
3.7 times faster than the one-row candidate. Control changes are small and
mixed; no universal no-regression claim follows. All timing samples check the
class number and invariants, but exclude public construction and replay.

The one-row source SHA-256 is
`58adf4144f54f424f2027b1c1a90c74afb2edde8071b22efa4960e6c15e1c8c6`;
the four-row source SHA-256 is
`0e92cb86b6ee799a00fa0583bb90f24ea14ba972b468fc59ce622569f308db9b`.
The counted raw capture is a third, deliberately unsuccessful artifact with
SHA-256 `1bf762be5f8d799b0eae79c31d9d7f4865d42ce812431b28bee432d63df3a041`.
Its output slot 55 records the pre-expansion row count, rather than inferring
that count from the scheduler target or a compacted presentation.

## Consequence for the next implementation

The evidence supports **separate resident search phases with resumable small
certification checkpoints**, not a globally larger radius or a universally
fixed one-row budget. Preserve the expansion cursor, current prepared shell,
and per-ellipsoid candidate count across checkpoints. After an insufficient
one-row certificate, continue that same shell toward the next checkpoint;
do not replay its first proposal or rebuild the field.

The present prototype intentionally does not implement that multi-checkpoint
expansion cursor. Its one-shot helper stops after one chosen batch. The next
implementation should reuse the existing resumable ellipsoid/admission code
and avoid this prototype's duplicated loops. Reusing proof intermediates
across those checkpoints is another possible saving: the current closure
helper retains owners but still recomputes its proof from each entire prefix.
The timings do not yet isolate how much of the remaining gap comes from that
recomputation versus search and analytic certification.

## Compiler and integration costs

The native compiler rejects `max(...)` in this path. Equivalent comparisons
are used in the isolated experiment. Supporting ordinary scalar `min`/`max`
with exact evaluation and comparison semantics is a compiler opportunity;
this diagnostic does not implement that compiler feature.

The source-copy program is 446,265 bytes, versus 438,061 for the production
mathematical source. Directly copying this prototype into the package would
exceed its current aggregate 485,000-byte allowance. That is another reason
not to promote it verbatim. A production implementation should reuse the
existing enumeration/admission machinery and express the separate search
phase without duplicating its loops; moving files would not reduce the
aggregate source cost.

## Reproduction

On a built checkout, use a nonexistent destination for each build:

```sh
node bench/class-unit-groups/diagnose-cubic-expansion-build.cjs ROOT NEW_DIRECTORY
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs NEW_DIRECTORY/builds.json CORPUS_GZ
node --test test/cubic-expanded-shell-ablation.cjs
```

The optional `capture` build mode exits unsuccessfully after collection and
exports exact raw relations; it cannot certify a class group or supply a
production timing. The `batch1` and `batch4` modes instead attempt closure after
at most one or four additional admitted rows. These are diagnostic variants,
not defaults.
`diagnose-cubic-unit-prefix.cjs` checks all principal equalities with PARI
and tests the image of each prefix's integer relation kernel exactly. This
forensic oracle is separate from independent Sage.js certificate replay.
