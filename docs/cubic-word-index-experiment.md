# Bounded machine-word indices in the cubic BF pipeline

Status: source-copy experiment, not promoted. This follows the
[BF lookup experiment](cubic-bf-lookup-experiment.md). No production source,
compiler, certificate, workspace layout, or resource allowance is changed.

## The representation issue

The native compiler supports both arbitrary-precision and unsigned-word
indices into an exact integer vector. In the previous source,
`_CUBIC_ANALYTIC_VALUE_OFFSET + index` promotes a `uint64` loop index to
arbitrary precision because the module constant is an ordinary integer.
Generated code builds the index with fmpz operations and then converts it
back to a checked native array position. This occurs even though the caller
has already bounded the relevant table.

The experiment introduces explicit local `uint64` aliases for four existing
nonnegative layout constants in four private helpers: BF lookup, preparation,
evaluation, and finite-sum bounds. It uses the existing unsigned-index
lowering without changing the compiler. Ordinary CPython sees the same
integer values. All vector range checks remain in generated native code.
Module-level typed constants are not used: they currently fail native
collection, as recorded in the preceding experiment.

## Why the changed arithmetic fits

The layout is fixed:

| Region | Offset | Capacity | Largest accessed index |
| --- | ---: | ---: | ---: |
| Coefficients | 0 | 1,494 | 1,493 |
| Five-word terms | 1,494 | 384 | $1494+5\cdot383+4=3413$ |
| Distinct values | 3,414 | 256 | $3414+255=3669$ |

The planner admits only thresholds 997 and 1,494. Its coefficient indices
are strictly below the chosen threshold; conditional writes for higher
prime powers also check that bound. Term and value capacity checks precede
appends. Thus every changed coefficient/term/value address lies in
$[0,3670)$, far below $2^{64}$. None of these typed additions or
multiplications can wrap in a reachable computation.

Lookup receives the planner's live value count. Its header loop and
half-open binary-search interval never read index `value_count`. Its
midpoint calculation uses $\ell+\lfloor(r-\ell)/2\rfloor$ with
$0\le\ell\le r\le256$.

Both initial and refined evaluation call sites use counts returned by a
successful planner; unsuccessful planning returns before evaluation. The
evaluator is the only caller of finite-sum bounds. Consequently the latter's
term loop has at most 384 iterations and its stored value index is checked
against a count at most 256 before access. Endpoint indices are bounded by
$4\cdot255+3=1023$; their existing arithmetic and checks are unchanged.

These are closed-program caller invariants, **not a claim of equivalence for
arbitrary `uint64` arguments supplied to an isolated private helper**. Nor
does the argument justify automatically treating every Python integer index
as a machine word. General compiler propagation must preserve non-overflow,
negative-index, and out-of-range behavior separately.

Only constant bindings and their uses change. Restoring each alias to its
original constant and erasing its declaration yields exactly the preceding
AST for every function. The same principal relations, BF terms, dyadic
operations, error returns, and final certificate are retained. This is a
source-equivalence/range argument, not a formal Lean proof.

## Tests and reproduction

The focused test checks that AST restoration is exact, then executes 400
old/new planner suffixes with identical complete read/write traces, return
values, and partial workspaces on failure. Cases include both production
thresholds, sparse/dense coefficients, 300-bit discriminants, duplicate
header values, and term/value capacity boundaries. A checked workspace
rejects any address outside the fixed layout. A frontend witness verifies
that explicit local typing selects unsigned indexing while the original
expression selects arbitrary-precision indexing.

Use a fresh project-scoped scratch directory and a nonexistent builder child:

```sh
node --test test/number-field-cubic-word-index.cjs
node bench/class-unit-groups/diagnose-cubic-word-index-build.cjs "$PWD" "$candidate"
node bench/class-unit-groups/package-cubic-conditional.cjs "$baseline_cache" "$candidate/builds.json" "$bundle"
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs "$bundle/source-builds.json" "$corpus_gz"
```

Native compilation consumes the generated compiler: **do not overlap it with
a full compiler/runtime rebuild**. An initial attempt in this campaign did
overlap and failed during dependency parsing with an unavailable
`AST_AnnotatedAssignment` constructor. That attempt is not a mathematical or
performance observation; the candidate must be rebuilt in a fresh directory
after the full build terminates.

Timing belongs exclusively on `opt`, serially and pinned to CPU 0, with the
existing seventeen-field workload and preceding BF-lookup candidate as the
direct comparator. Corpus and same-source backend checks run locally after
the build. Public receipt/replay, unseen holdout, source consolidation, peak
resource use, and cross-platform qualification remain separate requirements.

## Broader compiler opportunity

A read-only def-use walk of the preceding BF candidate's IR finds 164 of its
327 exact-index vector operations have statically constant, nonnegative
indices fitting a machine word. The walk accepts only unique definitions and
literal/copy/add/subtract/multiply chains; it does not infer loop ranges.
Coordinate multiplication accounts for 27 such sites, exact quotient
coordinates for 27, and matrix-product coordinates for another 27. These are
static operation counts, not sample frequencies or measured savings.

Literal indices already select unsigned lowering in `lowerLiveVectorIndex`.
Expressions such as a module constant plus a fixed literal currently do not.
A generic constant-expression index fold is therefore a promising next
compiler experiment: preserve ordinary source, fold only known pure values,
respect local shadowing, retain out-of-range checks, and leave negative or
oversized values on the existing exact path. It should not require callers
to add aliases for compile-time constants. Signed floor/modulo constant
semantics must also be corrected, rather than copying the existing collector's
truncation defect into a new evaluator. This compiler change is not part of
the current source-copy experiment.

## Whole-program and resource evidence

The frozen development corpus has 1,000 tuning fields and twelve known
controls, not an unseen holdout. The new candidate and preceding BF lookup
both accept 963/1,012, versus 961 for production baseline, with zero exceptions.
All complete output buffers and acceptance flags agree between candidates,
including declined fields. Accepted class numbers and invariants agree with
the corpus oracle. The two gains over production predate this typing change.

Post-build fmpz, GMP, and JavaScript execution also agree on all 1,012 complete
output buffers and acceptance flags. These are same-source differential
comparisons, not independent exact certificate replay.

The candidate IR changes 24 vector accesses from exact to unsigned indices:
overall exact/unsigned counts become 303/130 instead of 327/106. The BF
planner changes from 31 exact / two unsigned accesses to eleven exact /
22 unsigned; lookup changes three exact accesses to unsigned, and evaluation
changes one. Finite-sum term-base construction changes, but its vector-access
counts do not: additions of small literals still promote some indices.
All original range checks remain. The compiler records zero host callbacks
for the isolated packed-C core.

Mathematical source is 478,487 bytes, only 140 more than BF lookup. Including
the unchanged 46,619-byte runtime companion exceeds the unchanged 485,000-byte
allowance by 40,106 bytes. Removing each exact main source pathname from the
generated C gives 11,603,051 bytes versus 11,597,811. The addon shrinks from
20,525,840 to 20,517,648 bytes. Unchanged 1 MiB resident / 3 MiB temporary
limits do not establish equal peak allocation. No release or platform
qualification follows from these diagnostic size measurements.

## Controlled timing and decision

Two serial `opt` runs use opposite module load orders on the AMD EPYC 7B13
host, Node 26.8.1, and PARI 2.17.4, pinned to CPU 0. Each uses twenty warmups,
seven alternating-order rounds, 64 native calls per sample, and 256 fresh
PARI `bnfinit(f,0)` calls per sample. The boundary is polynomial-to-native
result with preallocated external scratch and the existing retry policy,
not the public receipt API. Results and invariant factors are checked.
Both bundles were transferred before timing began; no builds, corpus work,
or transfers overlapped either timed run on the VM.

Selected medians in milliseconds, first / second run:

| Polynomial | BF lookup | Word indices | PARI |
| --- | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 2.504 / 2.521 | 2.489 / 2.533 | 1.547 / 1.547 |
| $x^3+9x-55$ | 1.796 / 1.772 | 1.753 / 1.728 | 1.184 / 1.199 |
| $x^3-x^2+3x-4$ | 1.277 / 1.274 | 1.269 / 1.259 | 1.016 / 1.020 |
| $x^3-x^2-8x-159$ | 2.683 / 2.693 | 2.651 / 2.683 | 1.398 / 1.398 |
| $x^3-x^2+28x-447$ | 1.732 / 1.727 | 1.768 / 1.745 | 1.602 / 1.551 |
| $x^3+180x-1484$ | 1.609 / 1.613 | 1.607 / 1.645 | 1.648 / 1.652 |

Geometric means of the seventeen per-field word/BF median ratios are 0.98997
and 0.99219: about **1.00% and 0.78% less runtime**. The target changes by
0.56% faster and 0.48% slower. The $-447$ field is 2.09% and 1.05% slower;
the class-number-five control improves by 2.41% and 2.48%. Small differences
are not proof of statistical significance or uniform non-regression.

**Decision:** retain this as a diagnostic, not a preferred successor to BF
lookup. It supplies evidence that the representation change works and has a
small aggregate effect, but does not establish a repeatable target gain or
beat PARI there. Do not spread local aliases throughout the library on this
evidence. The next broader experiment should use source-transparent compiler
folding of fixed index expressions and address constant-folding semantics.
The preceding BF-lookup candidate remains the direct performance comparator.

## Provenance and validation

Candidate source SHA-256:
`afc66575a68501b54f3a0321d3fe52879e79c56017af069e457d21f747d00527`.
Native cache key:
`55007546726a63e8ef8e32b891b6508334fbe795336f649b693f11f6fde5fe4c`.
Generated reports under `build/cubic-next-evidence/` are not committed:

| Report | SHA-256 |
| --- | --- |
| `word-index-corpus-postpackage.json` | `ed22af250fb4903b9dafd32d98f7b5529356a7a78b99adfcecec6e4121ab56cf` |
| `word-index-backends.json` | `8509ad8bdd4971b033abc26ec863c6352b5552c65d9bac31901548e09d97e875` |
| `word-index-forward-timing.json` | `0fdedd4a45d6d98100ad16ac89ac1937c17b91e6137705fd1d360063037b6f60` |
| `word-index-reverse-timing.json` | `2cee9975410e6d568ffb772f0b1192bae05f1b24ede6af9c139f13834abc5c2f` |

Formatting, architecture, merge inventories, full local build/docs, and
fourteen post-build focused tests pass. The build takes 8m 28s and reuses
all 42 production kernel families. Optional numerical Wasm reactors remain
absent. The initial corpus-driver launch preceded package creation and failed
with a missing-manifest error; only the successful post-package report above
is corpus evidence.

The prior full changed-file CLI gate stopped at unavailable optional FFLAS
RREF after 99 file passes. This turn rechecks that test in isolation after
the build and reproduces its same two failures; `packages/fflas/.native` is
still absent. The broad 575-file suite was not rerun or claimed green.
`test:changed -- --base HEAD --list` still selects merge/docs/CLI checks.
`parallel:check` still reports 395 inherited live task records; no unrelated
metadata was changed. PR190 remains draft and the overall PARI goal is open.
