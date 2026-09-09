# Initial volume-guided cubic relation visits

Status: **source-copy experiment, not promoted**. Production source,
certificate, registry, and resource allowances remain unchanged. This follows
the [analytic-resumption experiment](cubic-analytic-resume-experiment.md).

## Structural change

The preceding experiment improved ideal ordering but still collected an old
cheap prefix before looking in larger recovery shells. This variant uses
the exact $T=478$ volume policy from the beginning, for bounded streaming
collection with the existing permutation enabled and exactly twelve factors.
Other factor counts retain their preceding policies. Eligibility depends on
the computed mathematical structure, never on a polynomial or expected answer.

Each selected ideal is planned lazily once. Its full positive-definite
ellipsoid uses the larger of the old bound and the existing exact volume
bound. Parameter preparation may overwrite that same parameter row: all
Gram entries and bounds are read before writes, and unchanged Gram entries
are copied to themselves. Coordinates remain capped at 64, candidates at 500.
This is a discovery policy, not a completeness bound or an assertion of
bit-for-bit agreement with PARI's floating-point radius.

The scheduler retains a header with the ordered ideal cursor and one six-entry
row per ideal: visit row count, phase, three cursor coordinates, and cumulative
candidate count. Four newly admitted rows end a visit and move to the next
ideal; unfinished regions remain available for later visits. Empty or
exhausted regions are skipped, and a full exhausted cycle terminates. The
same owners and cursors survive a failed certificate attempt.

Two stopping predicates are now distinct:

- **Local visit:** stop after four new rows, even before full modular rank.
- **Global checkpoint:** stop only when both the row target and full modular
  rank are reached, or the existing exact online trivial-quotient path closes.

The iterator's local row ceiling does not change its admission code. The
global target remains the target supplied to modular admission. Dependent
rows before full rank are still retained under the existing policy. Lowering
the global target alone would not implement this local quota.

Initial search and subsequent staged collection use the same full regions,
not separate outer shells with fresh candidate counts. Exact interval
insufficiency remains the only additional recovery authorization from the
preceding experiment. The existing relation presentation and Smith data are
recomputed after growth, before the unchanged certificate is invoked.

## Why this does not weaken correctness

Every admitted row still comes through the existing smooth principal-relation
checker. It computes the primitive element norm, factors it over the factor
base, lazily extends checked ideal powers as necessary, and verifies lattice
membership and weighted norm valuations. Powers beyond the existing envelope
are rejected. A larger initial radius therefore does not require exhaustive
norm preplanning to authenticate the rows it actually finds.

Search ordering, local quotas, and region size affect which witnesses are
found, not the acceptance theorem. The intended invariant is: all retained
rows remain authenticated, each live cursor identifies the next unexamined
proposal in its immutable region, and candidate counts never reset on a
pause. Fatal status, capacity overflow, invalid cursor/phase/quota, or stalled
progress fail closed. Zero budget and terminal status are no-ops. The final
class-group proof and its assumptions have not changed. These are explicit
implementation arguments and tests, not formal Lean verification.

The optional `lean` variant removes one further piece of unused work. The
old adjacent-ideal planner scores twelve four-direction proposals to choose
a fallback shell. This initial-volume scheduler never visits that shell.
Its new planner preserves the original embedding, LLL transform, and
ellipsoid preparation, then returns without direction scoring. The original
planner remains intact for other callers. Lazy admission still constructs
any required ideal powers. A source-identity test checks the exact retained
prefix and the sole call-site substitution.

## Correctness evidence

Both variants accept **963 of 1,012 development fields**, versus baseline 961,
with the same two gains and no losses or exceptions as the previous combined
candidate. All accepted class numbers and invariants agree. The entire
64-entry output buffer is identical between the two new variants on every
field. This is the frozen 1,000 tuning fields plus twelve known controls,
not the unseen holdout. It does not qualify public authenticated receipts
or independent exact replay for these source copies.

The focused scheduler test covers 808 pause splits, permutation, unselected
ideals, exhaustion, fatal/stalled cases, deficient rank, staged targets, and
invalid state. It compares an independent four-row round-robin schedule and
executes the actual pruned iterator across local-quota pauses. Tests also
verify exact in-place parameter preparation with 300-bit-scaled data and
that admission and existing certificate functions are unchanged.

An instrumented native run audits all **78 twelve-factor development fields**.
Across **72 closure calls**, it compares retained discovery entries exactly
before/after closure, including the new visit matrix. Five fields exercise
multiple certificate attempts: `3.1.386183.1`, `3.1.714868.1`,
`3.1.1023547.1`, `3.1.1315871.3`, and `3.1.2349155.1`. All outputs agree with
the uninstrumented run and every comparison passes. The visit snapshots
start at offset 20,000 in the diagnostic buffer; the driver checks disjointness
from the earlier discovery snapshot. This is an untimed selected-regime
audit with extra external storage, not a memory-performance claim.

On $x^3-x^2-7x+122$, the new native trace reaches 18 rows after four planned
ideals and 39 recorded candidates, then certifies class group $C_2\times C_4$
on its first attempt. The previous combined variant required three attempts.
On $x^3-x^2-8x-159$, it certifies class number 6 at its first attempt, with
21 rows after five ideals and 27 recorded candidates. PARI's earlier trace
used 18 rows here: retained dependency policy and enumeration are still not
identical. Native candidate counters must not be equated automatically with
PARI's small-norm/factorization counters.

The first compile correctly rejected two arbitrary-precision integer literals
in `uint64` tuple-return positions. Returning already-typed state variables
fixes that source typing mismatch. No compiler or ABI rule was relaxed.

## Measurements and resource costs

On the dedicated `opt` host (EPYC 7B13, CPU 0, Node v26.8.1, PARI 2.17.4),
two serialized runs with reversed module load order give target medians:

| Run | Baseline | Initial volume | PARI |
| --- | ---: | ---: | ---: |
| First | 4.280 ms | 2.596 ms | 1.543 ms |
| Reverse load order | 4.258 ms | 2.600 ms | 1.543 ms |

The lean planner's two additional serialized runs give:

| Polynomial | Baseline | Lean initial volume | PARI |
| --- | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 4.260 / 4.247 | 2.535 / 2.536 | 1.543 / 1.547 |
| $x^3+9x-55$ | 1.812 / 1.803 | 1.808 / 1.807 | 1.184 / 1.188 |
| $x^3-x^2+3x-4$ | 1.307 / 1.306 | 1.310 / 1.310 | 1.016 / 1.012 |
| $x^3-x^2-11x-63$ | 2.213 / 2.208 | 2.213 / 2.206 | 1.227 / 1.219 |
| $x^3-x^2-8x-159$ | 3.487 / 3.478 | 2.729 / 2.680 | 1.406 / 1.391 |
| $x^3-x^2+22x-47$ | 3.582 / 3.580 | 2.753 / 2.730 | 1.750 / 1.746 |
| $x^3+180x-1484$ | 2.225 / 2.216 | 1.602 / 1.597 | 1.637 / 1.629 |

Entries are median milliseconds, first/reverse-load run. The lean target
improves about 40% over baseline; omitting direction scoring saves roughly
another 0.06 ms compared with the plain initial-volume variant. All thirteen
previously problematic fields improve over production baseline. One
class-number-one field is about 2% faster than PARI in both runs; that narrow
margin is not a general regime win. The target is still about 1.64 times PARI.
Small-field controls show small changes, so no universal non-regression is
claimed.

This is a roughly **39% target improvement**, but still about 1.69 times
PARI's runtime. The policy is not uniformly faster than the preceding
ordering-only experiment: for example, the class-number-six diagnostic is
about 2.78 ms here versus about 2.34 ms previously. Keep this negative result
when choosing a reusable policy rather than optimizing only the target.

Sampling uses twenty warmups, seven alternating forward/reverse rounds,
64 native calls per sample, and 256 PARI calls per sample. The boundary is
polynomial-to-native-result with preallocated external buffers and the existing
retry policy, versus fresh `bnfinit(f,0)`, not public-API timing. The seventeen
fields are the same four controls and thirteen previously problematic fields;
none is newly unseen.

This implementation deliberately remains diagnostic. Plain/lean mathematical
source sizes are 474,558 / 477,613 bytes. Including the 46,619-byte runtime
companion exceeds the unchanged 485,000-byte allowance by 36,177 / 39,232
bytes. Removing exact main source pathnames from generated cores gives
11,540,304 / 11,582,823 bytes versus baseline 10,802,229. Addons are
20,513,552 / 20,521,744 bytes versus baseline 20,411,152. Resident/temporary
limits remain 1 MiB / 3 MiB, but this does not prove equal peak use.

Production promotion would require consolidating these diagnostic copies into
shared typed-Python planning/enumeration machinery, not raising the source
allowance to accommodate duplication. This experiment isolates the algorithmic
effect first; it is not a proposal to maintain parallel production algorithms.

## Reproduction and provenance

From the campaign worktree, use fresh project-scoped scratch directories:

```sh
node bench/class-unit-groups/diagnose-cubic-initial-volume-build.cjs "$PWD" /scratch/PROJECT/initial plain
node bench/class-unit-groups/diagnose-cubic-initial-volume-build.cjs "$PWD" /scratch/PROJECT/lean lean
node bench/class-unit-groups/diagnose-cubic-initial-volume-build.cjs "$PWD" /scratch/PROJECT/audit lean-audit
node --test test/number-field-cubic-initial-volume.cjs
```

The existing `package-cubic-conditional.cjs` packages uninstrumented builds;
its source manifest feeds `diagnose-cubic-ablation-run.cjs` with the frozen
corpus gzip. Run `diagnose-cubic-initial-volume-backends.cjs` with the candidate
`builds.json` and its corpus report for full JavaScript/GMP/fmpz comparison.
Run `diagnose-cubic-initial-volume-audit.cjs` with the audit `builds.json` and
the matching uninstrumented corpus report. The portable timing driver accepts
the seventeen-field file used in the preceding experiment. Instrumented
builds cannot be packaged as timing evidence.

Current builder output reproduces plain, trace, lean, and lean-audit source
copies byte-for-byte. Baseline source remains SHA-256
`93a41e20e4c7916bb00957ae0322b5378bf16491c317f5eeea2ef3f011a29e2c`.
Plain source: `5dc65f0ccfa467c022bf359a8b0610fa28b9d12e1abe96f2375e040663f25ce2`.
Lean source: `d1115e646d40006022f509a88932639f1c7abd4cff7d89cb24207c46ae3a0bfe`.

Reports in `build/cubic-next-evidence/`, SHA-256:

- `initial-volume-corpus.json`: `93ed3fd4a5711f6cf0b21a37d1da5994dca41056cb7ef4fb582041eaf4e33a58`
- `initial-volume-corpus-lean.json`: `7bfa3df037ecd9ea7456fe1adaa9b6cd8ea9cf82a9966ac639944163bf9040b7`
- `initial-volume-trace.json`: `5402f4d47d0b3971daa4d4b8e67bf67cb3c5938aa20c5273c9eb91186efd139c`
- `initial-volume-all-twelve-audit.json`: `1a29ca7be5905fde85f1ae96d2a4c7aed4a2548cdc24ee65a85f0e024980a612`
- `initial-volume-opt.json`: `e1ca1d527b5845fda654ff71f0b5f5b877e875e6052a013075473a0aacf5cf66`
- `initial-volume-opt-reverse.json`: `5d43f48b194a2c89543410ab58e01622c79ca5a7a261144b33e45a26b0ae0f86`
- `initial-volume-opt-lean.json`: `5eea8e26b90a47cd7697bddfc84b78f139fcb8b3cc394d75e844ed9b71683da2`
- `initial-volume-opt-lean-reverse.json`: `4caf10b40bf2314edab600c7de0a16a926fa495520228fd431f67d37dabbaa07`
- `initial-volume-all-backends-postbuild.json`: `92b48d166730cabf0af15b2895b5c2febcb8a94bafba18bc5fb1a83510f9b740`
- `initial-volume-lean-backends-postbuild.json`: `155aa639ccc668446e5e19dd0954ef3b0558ac0466e70445f69fa90482067c1b`

After the full local build, both variants were run through JavaScript, GMP,
and fmpz on all 1,012 fields. Every acceptance/decline and complete output
buffer agrees across these backends. This is same-source differential
execution, not independent exact replay. The earlier plain backend run
overlapped the beginning of a build; the post-build rerun above is the
qualification evidence instead. No builds overlapped the controlled opt runs.

The complete local build (8m27s), documentation check, ten post-build focused
tests, Python formatting, and architecture check pass. All 42 production
kernel families were reused; no experimental candidate was installed.
Optional numerical Wasm reactors were skipped because their reproducible
toolchain is absent. The inherited parallel check still fails on 395 live
task records; these records do not imply running agents. No full platform
qualification is claimed.

Remaining work includes controlled comparison of complete pipeline costs,
regime selection that does not regress neighboring fields, source consolidation,
public receipt/replay and unseen holdout qualification, and platform/resource
qualification. No general PARI win or completed frontier goal is claimed.
