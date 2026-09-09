# Resumable outer-shell experiment, 2026-09-09

This is an isolated source-copy diagnostic following the
[one-shot shell experiment](cubic-resident-expanded-shell-experiment.md).
Production mathematical source and its acceptance/resource allowances are
unchanged. This is not public-API, independent-replay, holdout, or platform
qualification, and no new PARI win is claimed.

Immutable [research evidence archive](https://github.com/sagemathinc/sagejs/releases/tag/cubic-resumable-shell-experiment-20260909),
bound to source commit `0bab0d2df7489d8d1a0b4e525380d29345c0e4f3`:
`cubic-resumable-shell-experiment-20260909.tar.gz`, SHA-256
`2af6c14f2bb6b39b390831051eb22bb5956d72626fdf6665311d9b06b361812f`.
The published asset digest was checked against the local archive. It includes
raw surveys/timings, portable diagnostic modules, source/IR/generated C, and
validation logs. This prerelease is not the product's Latest release.

## Mechanism and correctness boundary

The additional search region is still

$$
B_{\mathrm{old}} < v^T Gv \leq \max(8g_{00},2g_{11}).
$$

It is an experimental search policy, not PARI's volume formula or an additional
completeness assumption. Only the existing exact closure may accept a result.
Expansion is entered or resumed only after closure returns zero with the
explicit missing-unit diagnostics 43/434. Other failures do not authorize it.

The candidate removes the prototype's duplicated enumeration/admission loop.
The existing ellipsoid candidate test gains a lower-bound argument: zero for
original searches, the original ellipsoid bound for expansion. The original
planning and ordinary collection calls explicitly pass zero. The exact closure
function body remains byte-identical. A separate $1\times11$ plan and
$1\times6$ cursor persist across expansion calls; all discovery owners remain
resident. Expansion targets are one, four, then eight additional relations,
subject to the existing capacity and proposal budgets. A budget can stop a
batch before its target; these are target checkpoints, not guaranteed counts.

The cursor records ideal position, active-plan flag, next $x,y,z$, and cumulative
candidate count for that ideal. Once active, its plan and coordinate limits
$L_0,L_1,L_2$ are fixed until that ellipsoid is exhausted. For the existing
$x$-fastest traversal, define

$$
P(x,y,z)=((z+L_2)(2L_1+1)+y+L_1)(2L_0+1)+x+L_0.
$$

The difference between returned and initial $P$ counts visited box proposals,
including rejected proposals. The enclosing loop checks this difference is
nonnegative and no larger than the call's budget. Saving the returned next
coordinate prevents replaying the last point at a checkpoint. Candidate count
is retained, not reset on each call; it resets only for a newly prepared ideal.
An exhausted ideal advances the ideal cursor. Original plans and permutation
remain unchanged. Zero budget is a no-op; negative status is fatal and cannot
be resumed. The scheduler may decline without exhausting every proposal.

These invariants concern traversal and accounting, not class-group
completeness. Finding a nontrivial unit is not by itself a completeness proof.
The existing authenticated-relation and exact-closure obligations still apply.
No statement here is Lean-formalized.

## Executed checks

Focused tests execute the actual original/transformed candidate and admission
loops in CPython, with explicitly stubbed ideal arithmetic/admission. They
compare one long call with budgets 1, 2, 7, 31, and 100 through successive
targets, including rejected proposals, duplicate generators, both ideal orders,
zero budget, fatal status, and cumulative candidate exhaustion. Original
lower-bound-zero traversal agrees exactly. These are scheduler tests, not an
independent mathematical implementation.

The compiled source SHA-256 is
`dcbed0da564d90b5f1bc5aae26e1b6d2b0d967ee94796a2fea59b5d398dc133e`;
native cache key:
`8666aee28497d18029404b0a0f393b38d990d9ae4b07bd555c218afa92c1b81d`.

On the frozen 1,012 development fields (logical corpus SHA-256
`81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd`),
first-effort acceptance is **961 versus baseline 957**, with zero exceptions
and no lost baseline acceptance. All 957 previously accepted outputs agree
in every output slot. The four gained fields are exactly the four-row
experiment's gains; their final output slots also agree with that experiment.
Every accepted class number and invariant list matches the frozen corpus.
The other 51 fields still decline at this fixed effort. No reserved unseen
neighbors were executed.

Survey SHA-256:
`b9b3c50ee22fdd080c7b256b85fe17e3e8ee6cb8ac253a30339b3cd25471495e`.

## Controlled timing

The existing diagnostic boundary is retained: polynomial-to-native-result
with preallocated external scratch and the unchanged host retry sequence,
versus fresh PARI 2.17.4 `bnfinit(f,0)`. Both computations run serially on opt,
pinned to CPU 0. Seven alternating forward/reverse rounds use 64 native calls
and 256 PARI calls per sample, after 20 warmups. Every sample checks class
number and invariants. These are not public-call or certificate-replay timings.

An initial target/control run gives:

| Polynomial | Baseline ms | Resumable ms | PARI ms | Paired resumable/baseline |
| --- | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 9.2326 | 5.6286 | 1.5352 | 0.6130 |
| $x^3+9x-55$ | 1.7965 | 1.8088 | 1.1875 | 1.0064 |
| $x^3-x^2+3x-4$ | 1.3109 | 1.3141 | 1.0117 | 1.0058 |
| $x^3-x^2-11x-63$ | 2.2153 | 2.2156 | 1.2227 | 1.0025 |

The target retains the one-row speedup. The controls show small increases,
not evidence of universal zero regression. Timing report SHA-256:
`12656728a575e48e8f687546ece755668a7457704022b53551163fb1e4c67880`.

A second serialized run includes **all four** newly accepted fields, selected
from the survey before this run, not chosen from their timing outcomes:

| Polynomial | Baseline ms | One row ms | Four rows ms | Resumable ms | PARI ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 9.2534 | 5.6940 | 6.4097 | 5.6968 | 1.5430 |
| $x^3+27x-159$ | 13.8002 | 14.7648 | 4.6086 | 5.2612 | 1.5039 |
| $x^3-x^2+56x+99$ | 6.7665 | 7.8131 | 4.7753 | 5.5862 | 1.5117 |
| $x^3+146x-156$ | 8.1966 | 6.0579 | 6.7492 | 5.9181 | 1.6953 |

Resumable paired median ratios are 0.6162, 0.3849, 0.8214, and 0.7172.
PARI remains faster on every field. The one-row-only experiment incurs retries
and regresses on the middle two fields. Resumption recovers them, but costs
about 0.65 and 0.81 ms more than going directly to four rows. This comparison
does not isolate failed closure, presentation preparation, and scheduler costs.
It supports investigating those costs, not claiming all the difference is HNF.

The all-gains timing report SHA-256 is
`b9c7293014ece5dbdb06a6bc0a85c56f8b3f93619f67bbeb44e4e84af586fdd3`.

## What the failed attempt actually repeats

Inspection of `_cubic_try_bounded_exact_closure` narrows the attribution:
the 43/434 missing-unit return occurs **before** `_cubic_prepare_bf_plan`.
Thus that unsuccessful attempt does not itself evaluate a Belabas--Friedman
analytic certificate. Before returning it has prepared class support and the
compact presentation, checked its index, computed an HNF transformation,
reduced dependency relations, filled logarithm intervals, and tried unit
discovery. Failure of that compact search additionally builds a recovery
support/tail and calls `_cubic_relation_prefix_has_archimedean_unit`, which
performs another unit search. After new relations, the scheduler also calls
`_cubic_prepare_full_relation_presentation` before re-entering closure.

These are source-level control-flow facts, not per-stage timings. They direct
the next measurement toward presentation preparation, dependency reduction,
logarithms, and recovery, rather than repeated analytic certificates on the
failed path. A useful reuse contract must distinguish field data (unchanged),
generator logarithms (keyed by exact element and precision/scale), and compact
support/dependency bases (potentially changed by a new row). Reusing a buffer
by row position alone would be unsound when compaction changes its contents.

## Engineering cost and next experiment

Despite reusing the enumeration loop, the generated Python source is 446,272
bytes versus production 438,061: another 8,211 bytes. Its generated core C is
15,938,704 bytes. Moving this diagnostic into production verbatim would exceed
the aggregate source allowance. No source allowance or arena limit was raised;
extra scratch and extra calls can still increase actual resource use.

The remaining target gap is about 3.7 times PARI. Before another scheduling
change, instrument the failed one-row closure and subsequent presentation
preparation separately, then identify which validated proof intermediates can
survive the added relations. Retaining owners alone does not avoid rebuilding
their contents. Any reuse needs explicit invalidation and a cold-recompute
oracle. Generalize shared phase orchestration to reduce source redundancy
before production integration, without weakening exact closure.

Focused tests (six, including the recovery-log experiment below), architecture
checks, documentation generation, and strict Python checks pass (382 strict
modules; zero errors). The documentation check triggered a complete local
rebuild, which passed with all 42 production kernel families reused and
optional numerical reactors explicitly skipped because their toolchain is not
prepared. This does not qualify those optional reactors.
`parallel:check` still fails on the inherited 395-live-task metadata condition.
`test:changed -- --list` selects a much broader historical branch diff,
including a rebuild; that aggregate was not run for these diagnostics.
Full public replay, holdout, cross-platform, and release gates remain pending.

## Smaller follow-up: batch the recovery logarithms

Source inspection found that `_cubic_fill_dependency_logs` already shares a
real-root interval across its batch, but the recovery helper calls
`_cubic_real_log_bounds` separately for each relation. That wrapper recomputes
the same root interval each time. The follow-up source-copy replaces that
recovery loop with the existing batch helper, not a second implementation.

The root interval depends only on the unchanged polynomial coefficients and
the batch's fixed scale. The wrapper and batch helper pass the same root
endpoints, exact generator, basis, denominator, scale, and precision to
`_cubic_real_log_bounds_from_root_interval`. They check the same invalid
interval conditions and write the same active log rows in the same order.
Recovery reaches this loop only when relation count exceeds full rank, so
the batch is nonempty. Reuse is confined to this call; no cross-checkpoint
cache or precision-invalidation rule is introduced.

Focused CPython tests exercise the actual two log helpers with stubbed root
and log arithmetic. They check success, invalid root, invalid log, and
partial-write parity for batch lengths 1, 2, 17, and 64. A valid batch computes
one root interval instead of one per relation. Native surveys then reproduce
**every observation and output slot**, including declines, across all 1,012
fields both with and without resumable staging. Acceptance remains 957 and
961 respectively; there are no exceptions. This is native differential
evidence, not independent exact replay.

The transformation removes 393 Python source bytes. Baseline-plus-batch-logs
has source SHA-256
`905b57635a478db2252d9e4f139a6f66bb5cad767b0e2377759e870aa7ae868e`
and generated core size 15,522,483 bytes. Resumable-plus-batch-logs has source
SHA-256
`64aa44ef9fb7628a74bf34038d92b6031d8411e3f36bdec729bc058a5954ba79`
and generated core size 15,920,584 bytes. The latter is still not within the
production aggregate source allowance. Production source is unchanged.

The two survey SHA-256 values, in that order, are
`0d53d3874644e416f06b770c5406cbf66fef09e72cf6a98b4c2eb5592b71de84`
and `ee02b4a18a8ab10c322b26ba92fca7124f3240d1932e71e70ca4b0e7f3a78d6f`.

A third serialized opt run uses the same protocol on all four gained fields
and the three non-target controls:

| Polynomial | Baseline ms | Baseline + batch logs ms | Resumable ms | Resumable + batch logs ms | PARI ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 9.1578 | 8.6587 | 5.6309 | 5.1248 | 1.5469 |
| $x^3+27x-159$ | 13.6795 | 12.8288 | 5.2598 | 4.4901 | 1.5039 |
| $x^3-x^2+56x+99$ | 6.7092 | 6.2718 | 5.5729 | 4.7910 | 1.5078 |
| $x^3+146x-156$ | 8.1176 | 7.6047 | 5.8880 | 5.2809 | 1.6875 |
| $x^3+9x-55$ | 1.7690 | 1.7818 | 1.7896 | 1.7993 | 1.1836 |
| $x^3-x^2+3x-4$ | 1.2728 | 1.2760 | 1.2754 | 1.2679 | 1.0039 |
| $x^3-x^2-11x-63$ | 2.1758 | 2.1853 | 2.1916 | 2.1844 | 1.2227 |

For the four gained fields, batch-log/original paired median ratios are
0.9481, 0.9338, 0.9339, 0.9362 on the baseline and 0.9104, 0.8529, 0.8597,
0.8975 on the resumable version. Thus the small refactoring removes about
5–7% of baseline time and 9–15% of resumable time on these selected fields.
Controls show small mixed changes (absolute paired change below 0.7% for
this refactoring), not a universal no-regression guarantee. The target remains
about 3.3 times slower than PARI. Four-row scheduling with batched logs was
not timed, so this does not establish an optimal checkpoint schedule.

To build this additional experiment against either source:

```sh
node bench/class-unit-groups/diagnose-cubic-recovery-log-build.cjs ROOT SOURCE_PY NEW_DIRECTORY
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs NEW_DIRECTORY/builds.json CORPUS_GZ
node --test test/cubic-recovery-batch-logs.cjs
```

## Reproduction

From a built worktree, using a nonexistent build destination:

```sh
node bench/class-unit-groups/diagnose-cubic-resumable-expansion-build.cjs ROOT NEW_DIRECTORY
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs NEW_DIRECTORY/builds.json CORPUS_GZ
node --test test/cubic-resumable-shell-ablation.cjs test/cubic-expanded-shell-ablation.cjs test/cubic-ablation-fields.cjs
```

For a portable bundle containing the source/module/addon hashes and files:

```sh
taskset -c 0 node bench/class-unit-groups/diagnose-cubic-ablation-timing.cjs BUNDLE GP [FIELDS_JSON]
```

The optional field list contains coefficient strings in ascending degree,
the expected class-number string `h`, and PARI's descending invariant-factor
list encoded as the string `cyc`. The harness validates these expectations,
records them in its report, and never supplies expected answers to the native
kernel. Omitting the list retains the four familiar controls.
