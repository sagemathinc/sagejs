# Native conditional-center prefix experiment

Status: **experimental, not promoted**. Pruning the existing regions gives a
repeatable but modest target improvement, regresses a control, and loses one
development-field first-attempt acceptance. No production mathematical source,
radius, certification rule, or resource allowance changed.

This implements the integer formulas from
[the exact conditional-search investigation](cubic-exact-conditional-search.md)
in a source-copy version of the closed native program. It does **not** yet
implement that investigation's volume-guided, per-ideal four-relation policy.

## Cursor and ownership contract

The existing adjacent and expanded-shell callers compute consumed proposal
budget as the difference between flattened three-coordinate cursor positions.
The experiment preserves this monotone accounting:

- The last cursor coordinate remains $z$.
- The first two coordinates encode ordinals in conditional intervals, rather
  than actual lattice coefficients.
- Each feasible interval occupies the beginning of a virtual row or plane.
  Unused slots are skipped as one block, but still charged to the proposal
  budget. A skip is clamped to the remaining budget, so a pause can occur
  inside that block without visiting a point twice or exceeding the budget.
- Conditional intervals use exact completed squares, integer square roots,
  and floor/ceiling division. Their bounds are intersected with the existing
  validated coordinate envelope. Sign-canonical representatives are selected
  before calling the unchanged primitive/scalar/membership filter.
- Prepared Gram entries are loaded once per call; the conditional intervals
  are cached locally until their preceding coordinate changes. A resumed call
  reconstructs those local caches but retains all resident ideal/relation
  owners and its cumulative candidate count.

`cubic-conditional-prefix-template.py` contains the readable source-copy
prefix. `diagnose-cubic-conditional-build.cjs` replaces its marker with the
**original production admission and return blocks**, not a second handwritten
relation or certification implementation. The regression compares their ASTs
and the entire function signature. Parameters are assumed to come from the
existing positive-definite preparation path; this is not a public arbitrary-
matrix API.

The complete candidate lowers to 110 native functions with a packed C ABI
and zero host callbacks. The previous production closure has 109 functions;
the additional helper maps interval ordinals to centered coefficients.
All certification and retry machinery remain in the original closed program.

## Correctness and resource tests

The focused suite passes three tests without skips:

- 16,044 pause splits check exact point order, virtual-budget monotonicity,
  zero-budget behavior, target changes, rejection/duplicates, cumulative
  candidate limits, fatal online updates, and trivial-quotient closure.
- The same source-copy collector is executed in CPython, dynamic JavaScript,
  GMP, and fmpz. Twenty-four scenarios include 300-bit rescaling, one-slot
  budgets, capacity failure, and staged targets. The 72 JavaScript/native
  results agree with CPython at the unchanged production temporary allowance
  of 3 MiB.
- The separate rational/integer/exhaustive ellipsoid oracle remains passing.

An initial probe used a **smaller 1 MiB temporary slab**. A deliberately
padded box already exhausted that slab for one-slot GMP calls; even the
actual prepared box exhausts it after 300-bit rescaling with one-slot pauses.
The latter failure is retained explicitly in the test, followed by successful
reuse. The normal comparison uses the existing production allowance, not a
new larger production limit. This is not a claim that the temporary footprint
is unchanged or that arbitrarily many pauses are free. The GMP checkpoint
allocator retains short-lived limb allocations until its checkpoint ends.

Two source-expression restrictions were encountered: an exact local cannot
be rebound directly to a `uint64`, and `int(uint64_value)` is currently an
unsupported native call. An explicit `remaining_budget: int` local uses the
compiler's supported exact widening. The test's indexed matrix increment
also uses an explicit read/write because augmented indexed assignment is
unsupported for that foreign resource. No compiler or memory policy was
silently weakened to compile the experiment.

## Paired frozen development corpus

The actual current production artifact and the candidate were run against all
1,012 existing development records at fixed effort 5, with the existing 1 MiB
resident / 3 MiB temporary budgets. This is a diagnostic native boundary, not
public receipt authentication or an unseen holdout.

| Implementation | First-attempt accepts | Declines | Exceptions |
| --- | ---: | ---: | ---: |
| Current production | 961 | 51 | 0 |
| Conditional prefix | 963 | 49 | 0 |

All accepted class numbers and invariants agree with the frozen corpus.
Gains are `3.1.12200856.1`, `3.1.47391719.2`, and `3.1.69305231.3`.
The lost first-attempt acceptance is `3.1.3005300.1`, defined by
$x^3-55x-4340$: the candidate declines with phase 8, reason 436. Changing the
generator order changes the retained dependency/unit information even when
the complete geometric point set is unchanged. A higher total acceptance
count is not enough to promote the policy.
Reason 436 marks entry into the exact-product materialization fallback; it
does not by itself identify the eventual failing operation. A more detailed
trace is needed before attributing this particular decline to a specific bound.

## Controlled `opt` timings

The dedicated host was idle before timing. Portable bundles authenticate both
sources, generated modules, and native addons. Each run pins CPU 0, uses Node
v26.8.1 and PARI 2.17.4, twenty warmups, seven alternating implementation-order
rounds, 64 native calls per sample, and 256 fresh `bnfinit(f,0)` calls per PARI
sample. Native calls include the existing retry sequence $(5,1,7,8)$ and
preallocated external buffers. Public construction and independent replay
are excluded. The second run also reverses module load order.

Median milliseconds:

| Polynomial | Baseline, run 1 | Candidate, run 1 | PARI, run 1 | Baseline, run 2 | Candidate, run 2 | PARI, run 2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 4.2554 | 4.0121 | 1.5430 | 4.2659 | 4.0452 | 1.5391 |
| $x^3+9x-55$ | 1.8090 | 1.8100 | 1.1875 | 1.7956 | 1.8051 | 1.1914 |
| $x^3-x^2+3x-4$ | 1.3091 | 1.3331 | 1.0117 | 1.2982 | 1.3160 | 1.0117 |
| $x^3-x^2-11x-63$ | 2.1994 | 2.3158 | 1.2227 | 2.2086 | 2.3251 | 1.2227 |

The median paired candidate/baseline target ratios are 0.9422 and 0.9439.
The class-number-three control ratios are 1.0522 and 1.0540. This is evidence
of roughly 5–6% target improvement and a roughly 5% control regression, not
general non-regression or a PARI win. The target remains about 2.6 times PARI.

## Source and generated-code accounting

Candidate mathematical source is 442,144 bytes. With the unchanged 46,619-byte
runtime companion, the package would total 488,763 bytes: **3,763 over the
485,000 allowance**. The experiment is not installed in the production package
and does not raise that allowance.

Raw generated core C is smaller because the scratch source pathname is
shorter and repeated in generated provenance. After replacing each main
source pathname with the same `SOURCE.py` token, core sizes are 11,398,794
bytes for baseline and 11,576,778 for candidate: **177,984 bytes larger**.
The standalone addon grows from 20,411,152 to 20,427,536 bytes. Path shortening
must not be presented as generated-code compression. These are artifact
sizes, not peak-memory measurements.

## Reproduction and identities

```sh
node --test test/number-field-cubic-conditional-prefix.cjs \
  test/number-field-cubic-exact-fp-oracle.cjs
node bench/class-unit-groups/diagnose-cubic-conditional-build.cjs ROOT FRESH_DIRECTORY
node bench/class-unit-groups/package-cubic-conditional.cjs \
  BASELINE_CACHE CANDIDATE_BUILDS_JSON FRESH_PORTABLE_DIRECTORY
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs \
  FRESH_PORTABLE_DIRECTORY/source-builds.json FROZEN_CORPUS_GZ
# Copy the portable directory to opt; do not compile there.
taskset -c 0 NODE PORTABLE/diagnose-cubic-ablation-timing.cjs PORTABLE GP
# The packager's final optional argument "reverse" reverses module load order.
```

The local successful build is
`/scratch/sagejs-runtime/cubic-conditional-6hkF6m/candidate-v3/builds.json`.
Production source SHA-256 is
`93a41e20e4c7916bb00957ae0322b5378bf16491c317f5eeea2ef3f011a29e2c`;
candidate source SHA-256 is
`8766227098e376a05ff3fa52186de2b5f8decee154a80d8b9b31d48148c24001`.
The native keys are respectively
`f0e09f53ed38550e6293db4bf6f33a07bc5e4a31ce0c8ee113e0668c68a7819a` and
`65a8b5607c5f3a074f66f3dcb19bd66187a5b293c4e00514f460a729d9e7396b`.

Reports under `build/cubic-next-evidence/`:

- `conditional-paired-development-v2.json`:
  `130e8c71d4e90a81d77f32dd124d5fedea5db58b856ddb974fc608ddeef7ebf0`.
- `conditional-opt-timing.json`:
  `9f07d7886fc3afb495058a48d7053751139fde970eb60527cd8e4b652379aa02`.
- `conditional-opt-reverse.json`:
  `a436151e08d41e93c337b6240e1a8b6c395f11af3e0be50961d4bd4b9aeb1a2f`.

Earlier compile/probe logs retain the unsupported expressions and smaller-slab
failures. An initial paired-run launch failed because the packager retained a
relative module path; the corrected packager resolves it absolutely. None of
those failed attempts is counted as passing evidence.

## Decision

Keep this as a tested experimental building block. Do not promote it alone.
The prior exact forensics obtained a useful unit-bearing prefix from a larger
volume-guided region with per-ideal quotas; this experiment still exhausts the
old regions and uses the existing global targets. It therefore does not test
the full mathematical strategy that produced the 39-proposal diagnostic.

Next combine conditional enumeration with resumable per-ideal batches and
early exact certification. Preserve successful cheap prefixes, resume saved
ideal cursors rather than restarting them, retain all fatal/resource guards,
and compare the acceptance set and controls before promotion. Reuse the
existing collector/admission machinery and reduce duplication rather than
increasing the production source allowance.
