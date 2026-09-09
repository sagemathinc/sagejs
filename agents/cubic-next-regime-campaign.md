# Next complex-cubic optimization campaign

Status: active; no new PARI win claimed.

## Volume recovery and shorter checkpoints rejected, 2026-09-09

The [volume-batch experiment](../docs/cubic-volume-batch-experiment.md)
implements exact T=478 recovery regions, four-new-row visits, and retained
per-ideal cursors in a closed native source copy. Cheap production search and
final certificate checks remain unchanged. Recovery-only gains one effort-5
acceptance on the paired 1,012-field development corpus (962 vs 961, no losses
or exceptions) but slows the target from 4.26 to 4.94 ms. Moving the twelve-
factor initial target to n+6 is worse: 949 acceptances, 13 losses/one gain,
and 5.32 ms vs 4.29 ms baseline / 1.55 ms PARI. Neither variant is promoted;
both exceed the source allowance, which remains unchanged.

Untimed native checkpoint traces explain an important structural failure.
The target's early variant closes at 26 rows only after four full certificate
attempts, compared with baseline's two attempts at 26/27 rows. On the first
lost field x^3-x^2-8x-159 (3.1.78223.1), the 18-row upper group has order 12,
while baseline certifies class number 6. The analytic closure correctly returns
status 0 at phase 8; the current scheduler refuses resumption there because
it admits only phase43/reason434 missing-unit recovery. Reason435 is a stale
materialization marker, not the final cause. Next distinguish this valid
analytic-index insufficiency from fatal evidence, audit state reuse, and
test continued collection. Volume-guided search from the first ideal remains
different from the measured cheap-prefix-plus-volume-recovery variants.
PARI's source explicitly requests more relations on its relation-index check
failure, separately from precision problems. A fresh local trace on the first
lost field reaches class number 6 with 18 rows from four ideals and 32 small-
norm candidates. All thirteen new early declines end at phase 8; only the
first has the detailed checkpoint audit so far.

All 808 scheduler pause splits, 200 large/exact volume cases and boundary
tests pass, as do the existing conditional iterator's CPython/JS/GMP/fmpz
tests. Full kernels compile with zero host callbacks. Timed sources reproduce
from the builder; corpus/timing/trace digests and resource costs are recorded
in the document. No unseen holdout, authenticated public candidate receipts,
or independent full candidate replay is claimed. Production source is
unchanged and PR190 remains draft.
The complete local rebuild finished successfully in 8m24s, reusing all 42
production kernel families. All four focused tests pass again afterward;
docs reuse the completed build. Optional Wasm numerical reactors are absent,
and the inherited parallel-task-record check still fails. No runtime-consuming
job remains running from this experiment.

## Native conditional prefix measured, 2026-09-09

The [native conditional-prefix experiment](../docs/cubic-conditional-prefix-experiment.md)
implements the exact pruned traversal in the closed source-copy program.
Its ordinal cursor preserves the existing flattened proposal-budget contract;
16,044 pause splits and CPython/JavaScript/GMP/fmpz witnesses pass, including
300-bit scaling and explicit smaller-slab failure/reuse. The original
admission, cap, online/fatal, and return blocks are preserved. The compiled
closure has 110 functions and zero host callbacks. No production source or
limit changed.

On the paired 1,012-field development corpus, baseline accepts 961 and the
candidate 963 at effort 5, with no exceptions. There are three gains and one
lost first-attempt acceptance (`3.1.3005300.1`, phase 8/reason 436). Two
serialized `opt` runs with reversed load order show roughly 5–6% target
improvement (about 4.26 to 4.03 ms), but about 5% regression on the
class-number-three control; PARI remains about 1.54 ms on the target.
The candidate also exceeds the existing source allowance by 3,763 bytes.
**Do not promote this variant alone.** It tests pruning/order on the old
regions, not the larger volume-guided regions with per-ideal quotas that
produced the earlier 39-proposal forensic prefix.

The post-parser-repair public replay is now **complete**: all 1,000 frozen tune
fields have matching class numbers/invariants/discriminants, authenticated
receipts, and independent ordinary-object exact replay. The report is
`build/cubic-next-evidence/parser-fix-public-replay/report.json`, SHA-256
`222c24c184915687b371cd18aaa36f169ff2b267342b930d5214b06275dc9d7a`.
Its runtime fingerprint is
`1d16f65daf7290c3e2f8828a6b86660b6610c41a10d7b7df43a75b6c0414bdbd`,
also checked against the current runtime after the diagnostic builds. This
qualifies the existing production candidate, **not** the conditional prototype.
The replay process terminated successfully; there is no remaining replay wait.
The broad Wasm toolchain/platform gates remain unfinished, and PR190 is draft.

Next combine conditional enumeration with retained per-ideal batches and
early exact certification, preserving cheap successful prefixes and saved
ideal cursors. Keep radius, batching, and certification policy distinct in
experiments; do not merely tune this prototype's inner loop or raise budgets.

## Exact conditional search and serialized qualification, 2026-09-09

The [conditional-center diagnostic](../docs/cubic-exact-conditional-search.md)
now separates PARI's large volume-guided search radius from its pruned,
early-stopping enumeration. An exact rational oracle and a distinct
integer-only completed-square traversal agree in point order and counters;
both agree with exhaustive boxes on 82 test matrices and all 36 captured
regions. The integer formulas require square roots/division and coordinate
cursors, not rational objects. They are not yet a native resumable iterator.

On the historical $-384587$ capture, a trace-ordered, four-relations-per-ideal
forensic search with volume parameter $T=478$ gets rank 12, index 8, and a
nontrivial unit after three ideals / 36 proposals, and reaches 18 rows after
four ideals / 39 proposals. The saved PARI trace uses 43 small-norm candidates.
The initial-radius diagnostic reaches 18 rows without a nontrivial unit.
The new unit is exactly the inverse of the earlier recovered unit. This is
exact search evidence, not the actual production admission policy, a complete
class-group certificate, a new timing result, or an unseen-field experiment.
The mathematical source and all production limits remain unchanged.

The earlier mutating `test:changed` plan is now **terminal exit 1**. Its two
Node builds completed; the Wasm stage fails because the configured v2 numerical
toolchain is absent, not because of another parser crash. No toolchain build
was started. With all build descendants gone, the six-file public/native cubic
suite was rerun serially: **14 passes, zero failures, zero skips** in
`parser-fix-public-native-serialized.log`. A complete lazy-cache preparation
then finished before starting the new 1,000-field public replay. Its first
500 fields pass authentication and independent exact replay; do not claim
the complete run until `parser-fix-public-replay/report.json` is present and
checked. Runtime-mutating builds must remain serialized until it finishes.

Next: implement a source-copy native conditional iterator, preserving exact
region membership and checkpoint/cursor semantics. Compare scheduling/radius
policies separately with unchanged final certification. Do not copy a larger
radius alone, remove the factor-count-12 safety margin without evidence, or
count a nontrivial unit as a successful certificate. PR190 remains draft.

## Parser ownership repair, 2026-09-09

Commit `d53dfb1781a27d973c6f6ba4246a5296f8e74275` installs the production
[parser-lifetime repair](../docs/cubic-parser-lifetime-diagnostic.md). Grammar
loads share a cached promise; compiler-owned trees close on every exit, while
raw syntax callers retain ownership. No mathematical source or memory limit
changed. Two 128-iteration production compiler probes each delete all 256
success/error trees with two grammar loads and 32 MiB Wasm linear memory.
The full cubic serialized IR and generated core/header/adapter remain identical,
also after a full rebuild. The previously crashing Wasm inventory test completes
with six passes and three existing toolchain skips. Full build, architecture,
strict Python, docs, 80 focused frontend tests, module cache, and the enabled
compiler suite pass. The compiler-bound optimizer snapshot is published with
all four uploaded digests verified. PR190 remains draft.

Broad qualification is still unfinished. **Wait for the entire mutating
`test:changed` process to terminate, not merely its first build.** Its Wasm
step starts another full build. A separate public cubic suite overlapped that
nested build and failed against incomplete exports/cache entries; the failures
are retained in `build/cubic-next-evidence/parser-fix-public-native.log` and
must be replaced by a valid serialized rerun, not excused as passes. The active
plan log is `parser-fix-test-changed.log`. Do not start a second plan, public
replay, or opt deployment while that process or its descendants are live.
The prior 1,000-field replay still belongs to its recorded runtime.

Next: complete serialized qualification and current public timing. Then target
adjacent-ideal search, not the now-small recovery cost. The saved PARI trace
`pari-first-staged-retry.trace` reaches its initial regulator check on the
$-384587$ field after four searched ideals and 43 primitive nonscalar
small-norm candidates. These are not bounding-box proposal counts. Current
factor-count-12 scheduling retains its conservative initial dependency margin;
do not remove it without an out-of-sample comparison and explicit failure/
resume evidence. Investigate useful relations per searched ideal as well as
the cost of evaluating each candidate.

## Combined staged-shell integration, 2026-09-09

The [integration record](../docs/cubic-staged-shell-integration.md) tracks the
reviewed combined candidate now installed in production source on this branch.
It differs from the source-copy candidate only by removal of two diagnostic
banners. The source hash is
`93a41e20e4c7916bb00957ae0322b5378bf16491c317f5eeea2ef3f011a29e2c`;
aggregate source is 484,669/485,000 bytes, without a limit increase.

The full local build, strict Python, architecture, docs, and all 42 focused
diagnostic/native tests pass. Production collectors and scheduler tests now
exercise bundled signatures and all expansion checkpoints directly; historical
comparisons reconstruct a hash-checked baseline using a readable delta, without
depending on Git history in shallow CI. The optimizer snapshot is refreshed,
published, and hash-verified. The 1,000-field public replay completed: all class
numbers/invariants agree, all native receipts authenticate, and all independent
exact replays pass with an unchanged runtime fingerprint. The report SHA-256 is
`327d530141ea8c5a7a21abd9b886583a300f6035b8ae49d895359a108c0114cf`.
Exactly four fields move from host retry to initial effort 5; there are now
949/32/19 successes at efforts 5/1/7. All assumptions remain explicit.
This is local development-corpus correctness evidence, not controlled timing,
an unseen holdout, or a hermetic promotion receipt. Remaining broad and release
gates are outstanding. PR190 remains draft and unseen neighbors remain
untouched. Next complete broader validation and measure the integrated public
path before selecting another adjacent-search change.

The broader compiler suite passes its 21 enabled tests (28 existing skips).
Full unit validation exposed a stale reconstructed-regulator test boundary;
the repaired fixture now covers both proposal precisions and seven distinct
coordinate refinements without changing mathematics. The rerun passes 158
files before the inherited modular q-expansion/package-graph freeze mismatch;
the unrelated manifest remains untouched. The remaining unit files expose a
reproducible Tree-sitter inventory crash; the
[lifetime diagnostic](../docs/cubic-parser-lifetime-diagnostic.md) isolates
repeated grammar loads and undisposed large syntax trees. Caching grammars
alone is insufficient; both lifetime interventions permit 128 full cubic
parses at 32 MiB Wasm memory, versus failure near the existing memory ceiling.
This is not yet a production compiler fix. All 14 broader cubic public/native
regressions pass after repairing the materializer test's stale extraction
boundary and preserving its exact-product fallback comparison. The complete
replay evidence is published as the non-latest research prerelease
`cubic-staged-shell-public-replay-20260909`, with its uploaded digest verified.

## Formatted candidate fits source allowance, 2026-09-09

The [absolute-value experiment](../docs/cubic-absolute-value-experiment.md)
replaces 24 exact sign-normalization branches and folds redundant coordinate
copies using existing Python/native `abs` support. The complete formatted
scheduler/probe candidate is 438,378 bytes; with its runtime companion, the
aggregate is 484,997/485,000 bytes. No allowance, arena budget, mathematical
bound, or documentation was weakened. The unrelated LLL-sharing prototype
saved only 224 bytes and was not selected.

All 1,012 development observations and output slots agree. Whole-module AST
checks modulo the integer absolute-value identity, single-evaluation tests,
and a 595-value JavaScript/GMP/fmpz arena witness pass. Two controlled opt
timing orders show essentially flat performance with small mixed changes;
the target is still roughly three times PARI. No public timing, independent
replay of the candidate, or strict non-regression is claimed.

Next review/integrate the complete formatted candidate and regenerate its
production evidence, including authenticated public receipts and independent
exact replay. Existing prototype tests require a pinned baseline strategy at
integration. Production is unchanged, PR190 stays draft, and no unseen
holdout fields were executed.

## Borrowed search-workspace checkpoint, 2026-09-09

The [search-bundle experiment](../docs/cubic-search-workspace-experiment.md)
passes thirteen resident owners through adjacent/expanded collection and
ellipsoid admission. Active expanded parameters remain separate. The entire
original mathematical AST is recoverable by unbundling; executable native IR
matches across the full graph modulo borrow names/order and two unused
parameters. All 1,012 observations and output slots match; thirteen compiler
workspace tests and the new AST/IR checks pass.

The change saves 2,028 raw Python bytes, or 2,522 under pinned formatting.
Another 1,660 bytes must be removed from the formatted candidate to fit the
unchanged aggregate allowance. Generated addon and text-section sizes match
but binary hashes differ. A first apparent timing gain did not reproduce
under reversed module-load/measurement order; no speedup is claimed. Reversed
results show small mixed changes, including roughly 1% slower target timing.
Production remains unchanged and PR190 stays draft. No unseen fields were run.

## Recovery-discovery sharing checkpoint, 2026-09-09

The [shared recovery experiment](../docs/cubic-recovery-sharing-experiment.md)
reuses the existing interval/Euclidean discovery helper, removing 5,992 Python
bytes without changing mathematical checks. All 1,012 development observations
and every output slot match the torsion-probe baseline. Exact differential
write-trace tests and recovery fault injection pass, including a genuine
1,024-step reduction-limit case. Controlled opt timings are essentially flat
with small mixed changes; no new PARI win or public qualification is claimed.

Raw generated C grows because the experimental source path is longer;
normalizing just that path reveals 109,913 fewer bytes. The addon shrinks
8,192 bytes. Peak-memory equivalence is not established by file-size evidence.
Another 3,645 Python bytes must be removed to fit the unchanged aggregate
allowance. Next consider borrowed adjacent/expanded search bundles, then
qualify the combined candidate. Production is unchanged; PR190 stays draft.
No unseen holdout fields were executed.

## Exact torsion-probe checkpoint, 2026-09-09

The [torsion-probe experiment](../docs/cubic-torsion-probe-experiment.md)
implements the elementary norm-based log gap as an isolated pre-LLL test.
Authenticated outward log intervals for an exact kernel basis certify that
all dependencies of the current relation set produce only torsion units.
Only a successful certificate returns the existing insufficient-unit status;
otherwise the original LLL and certification tail runs unchanged.

Every observation and all output slots match the resumable-plus-log baseline
on all 1,012 development fields, including the 51 declines: 961 acceptances,
no losses, gains, or exceptions. CPython interval/control-flow tests and a
185-case JavaScript/GMP/fmpz witness with poisoned inactive tails pass.
This is not public authentication or independent replay of the new source.

Controlled opt target time is 5.084 -> 4.276 ms, versus PARI 1.543 ms. The
other three recovery-heavy fields improve 7.5--10%; controls show small paired
regressions. Instrumentation confirms zero recovery LLL calls on the target
and the class-number-six field. Target recovery falls to 0.202 ms; the exact
predicate itself costs 0.021 ms. The proof, rather than a global removal of
conditioning, explains which work is avoided.

Production is unchanged. This prototype adds 2,139 source bytes to the still
isolated scheduler; do not increase the source allowance to land it. Next
refactor shared orchestration and qualify inconclusive-probe/resource behavior.
The next large measured component is adjacent relation collection, not the
now-small recovery or presentation refresh. No unseen neighbors were run.

## Recovery-conditioning checkpoint, 2026-09-09

The small root-enclosure reuse is integrated and rebuilt; Python source
shrinks 393 bytes, with no allowance or arena-limit change. Its proof and
generated-resource evidence are in
[the recovery-conditioning record](../docs/cubic-recovery-conditioning.md).
The larger resumable scheduler remains isolated.

All 1,000 tune-field public receipts authenticate and pass independent exact
replay on the integrated root-reuse runtime, with stable runtime fingerprints.
Seven native/public regression groups, three focused diagnostics, architecture,
docs, and strict Python pass. Parallel metadata still reports 395 live tasks;
the other broad/holdout/platform gates remain outstanding. PR190 stays draft.

Detailed opt profiling attributes about 0.812 ms of target recovery to LLL,
versus 0.066 ms to HNF. Presentation refresh is only about 0.010 ms. An isolated
source-copy experiment uses the exact HNF kernel basis directly while retaining
all coefficient, interval, reconstruction, and analytic certification checks.
It preserves all 961 first-effort acceptances on the frozen 1,012-field survey,
with no losses or exceptions. Three transcripts differ only by negating the
unit. No unseen holdout fields were used.

Paired controlled opt timings reduce the target from 5.125 to 4.313 ms; PARI is
1.539 ms. The other three recovery-heavy fields improve 7--9%, while controls
show small regressions (0.3--1.4% paired). This is diagnostic native timing,
not a public performance claim or permission to remove LLL universally.
Next: staged conditioning with explicit resource/failure behavior, then the
remaining adjacent-search cost. Do not optimize presentation refresh merely
because it is easier to retain.

## Resumable-shell diagnostic checkpoint, 2026-09-09

The [resumable experiment](../docs/cubic-resumable-shell-experiment.md) reuses
the existing ellipsoid/admission loop, with a separate persistent plan/cursor
and one/four/eight additional-row targets. It preserves all 957 baseline
acceptances and recovers the same four fields as the four-row experiment on
the frozen 1,012 development fields, with zero exceptions and exact final
output-slot agreement. Production mathematics remains unchanged.

Controlled opt timings retain the target speedup (9.23 to 5.63 ms, PARI 1.54).
On all four recovered fields, resumable staging improves on the baseline, but
the two needing more relations cost 0.65/0.81 ms more than a direct four-row
batch. Failed certification and subsequent presentation preparation now need
separate cost attribution and carefully validated intermediate-state reuse.
Do not universally select one or four rows from these four observations.

The source-copy still adds 8,211 bytes and is not within the aggregate source
allowance. Shared orchestration needs refactoring before production integration;
no allowance was raised. Focused tests, architecture and formatting pass;
parallel metadata still reports 395 live tasks. Public replay, holdout and
platform qualification remain pending. No unseen neighbors were run.

A follow-up source inspection found repeated identical real-root isolation
inside recovery logarithms. Reusing the existing batch-log helper removes
393 Python bytes. On both baseline and resumable variants, every output slot
and decline agrees across all 1,012 development fields. Controlled opt timings
show a further 9–15% reduction on the four gains for the resumable version:
the target is 5.12 ms versus baseline 9.16 and PARI 1.55 in the same run.
Controls show small mixed changes. This is still isolated source-copy evidence,
not production/public qualification. The small root-reuse change is a candidate
for separate integration; the larger scheduler still needs source compression.
Missing-unit failure occurs before the analytic BF stage, so the next detailed
cost attribution belongs to support/HNF/dependencies/logs/recovery and the
subsequent presentation refresh, not BF work on that failed path.

## Resident-shell diagnostic checkpoint, 2026-09-08

The [outer-shell experiment](../docs/cubic-resident-expanded-shell-experiment.md)
preserves initial plans and adds a separate search phase after exact unit
insufficiency. No production math was changed. Full-shell expansion improves
first-effort acceptance 957 to 961 on the frozen 1,012 fields without losses
or exceptions, but makes the target slower (9.23 to 10.05 ms in paired opt
measurements). Exact raw-prefix forensics shows the normalized initial 26 rows
have only trivial units; the first new row, generated by `a+9`, supplies a
nontrivial unit. It is an observed witness, not a production special case.

Limiting expansion to one new row gives 5.68 ms; four rows give 6.36 ms, versus
PARI 1.54 ms. One row gains two fields; four rows retain all four gains. These
are native diagnostic boundaries, not public/holdout qualification. The
prototype also exceeds the aggregate source allowance if copied directly into
production; do not raise the allowance to land duplicated enumeration loops.

Next: a genuinely resumable outer-shell cursor, using the existing admission
machinery, with one-row then larger checkpoints and unchanged fatal exits.
Do not adopt a universal fixed batch merely because it wins this target.
Investigate retaining proof intermediates as well as their owners. The
compiler rejected scalar `max`; this experiment uses comparisons, and the
ordinary builtin remains an explicit compiler improvement opportunity.

## Content-integration checkpoint, 2026-09-08

The content-only production candidate reproduces all output slots of the
isolated 1,012-field experiment: 957 first-attempt acceptances, nine gains,
no lost baseline acceptance, and no exception. Controlled opt measurements
on those nine selected gain fields show 2.0–3.4 times improvement under the
existing retry sequence, but PARI remains faster. Four familiar fields show
small mixed changes (roughly -1.1% to +1.5% paired median time). See the
[complete qualification record](../docs/cubic-content-and-search-order-ablation.md).
Do not conflate these native measurements with public API timing.

Only primitive generator-content normalization is integrated. Larger radius
and origin-centered ordering remain isolated because their corpus experiments
lost existing first-attempt acceptances. Source and arena allowances are
unchanged. The stable rebuilt runtime now passes all 1,000 tune-field public
authenticated receipts and independent exact replays, with no runtime-content
drift. The earlier interrupted local run is not that evidence. This is local
correctness qualification, not controlled public timing or a holdout result.
Run `pnpm test:changed -- --list` before scheduling it: the selected plan can
include an unconditional `pnpm build`. Never overlap it with public replay or
other consumers of `dist`. The local replay driver now checks the canonical
runtime-content closure before and after every batch, not merely source hashes.

The next structural experiment should preserve the cheap prefix and expand
the search only after the exact checker reports insufficient unit evidence.
The existing adjacent collector explicitly permits changing only target and
budget during resumption; changing an ellipsoid in place would violate that
contract. Introduce a separately specified expansion phase, retaining original
plans and relation information, with tests for cursor coverage, duplicate
handling, and unchanged fatal/resource exits. Do not silently reinterpret the
current cursor or enlarge every successful field's initial search.

## Starting point

Start from integrated main `ea2027439`, including staged certification and
source-transparent fixed slices and borrowed workspaces. The retained
`f7f00552` survey predates staging: its timings cannot describe this baseline.
Preserve its frozen 1,000-field population and proof/boundary contracts.

The provisional target remains `3.1.12716.2`, defined by
$x^3-x^2-11x-63$, with discriminant $-12716$ and class group $C_3$.
The displayed generator's equation-order index is 3. Select a different
target only from recorded current-source evidence, not from convenient timings.

## Execution and acceptance

1. Build and authenticate the integrated baseline. Reproduce the target and
   headline examples with exact receipts and independent ordinary-object replay.
2. On the dedicated `opt` VM, compare prepared and fresh public calls with
   PARI under the existing conditional-GRH contract. Native-core diagnostics
   are separate observations, never substitutes for public-call timings.
3. Profile the remaining cost and inspect PARI's actual computation. State a
   falsifiable structural hypothesis before modifying the mathematics.
4. Implement one general mechanism in ordinary Python compiled as a closed
   native program. Preserve the shared arena, correctness authority, failure
   classification and resource limits. Use compiler improvements where they
   remove a demonstrated representational obstruction; do not add an opaque
   mathematical C implementation.
5. Compare baseline/candidate on development inputs with exact replay,
   adversarial regressions, resource checks and controlled alternating samples.
   Document the mathematical argument and explicit assumptions.
6. Freeze the candidate and exposure ledger before executing at least twenty
   previously unseen neighboring fields. The older registered staged cohort
   may be used only after checking whether it has already been exposed.
7. Rerun the frozen 1,000-field correctness census and retained timing protocol.
   Publish all declines, disagreements and regressions along with gains.
   Keep large raw evidence outside Git, with immutable content digests.

The performance acceptance rules remain those of
[the frontier plan](cubic-number-field-class-group-pari-frontier-plan.md).
Success on one native microbenchmark does not establish corpus parity, public
class-group parity, or cross-platform qualification. No resource/source-budget
increase is authorized by this campaign plan alone.

## Operational boundaries

Work in branch `agent/cubic-frontier-next`, in its separate worktree. Root
checkout scratch and previous campaign artifacts are not modified. Use `opt`
only for this campaign; serialize builds, profiling and retained timing there.
Do not use shared release hosts or alter release recovery artifacts.

Independent comparator agreement supplements, but never replaces, the
mathematical proof and exact replay. Changes are committed and submitted for
review only with accurately scoped validation claims.

## Current checkpoint, 2026-09-06

- The `bbe1d2ca3` opt public census passes all 1,000 fields. Its retained timing
  run is separate and must not be relabeled as a later source revision.
- `67c3b3084` adds cheap unit proposals with unchanged exact certification.
  Its additional local public replay passes all 1,000 fields; see
  [the proof/evidence record](../docs/cubic-unit-proposal-precision.md).
- The next intervention retains dependent relations while modular rank is
  incomplete and attempts the existing staged certificate at $n+2$ rows.
  [The argument](../docs/cubic-rank-pending-certification.md) identifies the
  exact discarded row that caused the earlier smaller-prefix experiment to
  lose a class-number-$40$ field. Fixed-effort prototype coverage improves from
  940/1012 to 948/1012 without lost acceptances; this is not a public census.
  The integrated `0ad63e092` additionally passes all 1,000 local public
  authenticated receipts and independent exact replays; immutable evidence is
  linked from that argument. Controlled `opt` timing remains separate.
- [Direct interval division](../docs/cubic-direct-interval-division.md) removes
  reciprocal rounding while giving sharper exact bounds. Its diagnostic
  survey preserves 948/1012 fixed-effort coverage. Commit `47a7db451` also
  passes all 1,000 additional local public authenticated receipts and exact
  replays. Controlled performance qualification remains outstanding.
- [Discriminant-character splitting](../docs/cubic-discriminant-splitting.md)
  bypasses polynomial Frobenius when the cubic discriminant is a nonsquare.
  The prototype preserves every output slot on the 1,012-field survey and
  passes 58,397 standalone oracle cases per backend and CPython. Integration
  is into the reusable polynomial module, not duplicated class-group source.
  No current-source PARI win is established.
- [Twenty fresh neighbors](../docs/cubic-rank-pending-neighbor-protocol.md)
  are selected and excluded from development execution. Freeze the candidate
  before running them; retain all outcomes. Selection alone is not validation.

Do not promote these incremental improvements into a PARI-win claim. Finish
current-source public replay, controlled public timing and the frozen neighbor
evaluation, report regressions, and keep PR190 draft until its actual gates
are satisfied.

## Diagnostic map, 2026-09-08

Read these before repeating a proposed optimization:

- [PARI-sized cutoff](../docs/cubic-pari-cutoff-experiment.md): 997 to 768
  improves the target's native median by 5.32%, but sends 276 of the frozen
  1,012 fixed-effort fields through extra refinement. Exact acceptance is
  unchanged; there is no need for a speculative mathematical assumption.
  Production defaults are unchanged.
- [Native cost ledger](../docs/cubic-cutoff768-cost-ledger.md): analytic
  planning/evaluation is about 20% of the instrumented root, not the whole
  gap. The apparent 284 versus 13 candidate mismatch was a counter-boundary
  mistake: only 11 Sage.js candidates pass the corresponding primitive
  nonscalar ellipsoid filter. Do not infer a twentyfold search-space failure.
- [Current public boundaries](../docs/cubic-public-target-boundaries.md):
  the pinned `ca2e588b5` target takes 3.24 ms prepared versus PARI's 0.77 ms;
  coefficient-vector polynomial plus field construction raises Sage.js to
  8.26 ms versus PARI's fresh 1.21 ms. Expression-based construction adds
  substantially more. These are separately defined diagnostics, not a new
  frozen-corpus performance gate.
- [Checked analytic indices](../docs/cubic-bf-index-reuse.md): this revisits
  the earlier approximately 1% experiment, not a new mechanism. Current
  tests compare the previous search against indexed evaluation on all three
  exact backends, reject malformed indices, and match all 64 output slots on
  all 1,012 fixed-effort fields. Current target gain is 0.84%; thirteen of
  fourteen familiar-field medians improve, with the small loss also reported.
- [Native bit length](../docs/cubic-native-bit-length.md): IR 40 removes the
  compiler obstruction on all exact backends, replacing only the square-root
  bit-count loop. The target native median improves 2.315%; all 1,012
  fixed-effort outputs agree. Two familiar-field timing runs improve 13/14
  medians but lose 3–7 microseconds on the smallest field. The remaining
  seed loop cannot safely use current fixed-width shift lowering. Newton
  iteration was already present; this is not a new square-root algorithm.

Continue to distinguish a small native improvement from a public PARI win.
The [constructor profile](../docs/cubic-constructor-costs.md) now measures
factorization at 0.765 ms, irreducibility at 2.995 ms and field construction
at 3.711 ms on opt. Local sampling attributes 84% of constructor samples to
irreducibility, with substantial reconstruction and resource-cache costs.
The [metadata-only rational predicate](../docs/rational-irreducibility-metadata.md)
is now implemented in `8fa831438`, with scoped factor ownership and the
resource-unavailable fallback retained. On opt, the same constructor driver
measures irreducibility at 0.088 ms and field construction at 0.661 ms.
These are separate-run medians, not a paired experiment or a native-kernel
speedup. Public order-5, order-2 and order-3 receipts independently replay;
current-source whole-public-path timing and same-runtime controls are recorded
in that document. Fresh computation improves about 40–42% in paired controls,
but the prepared path loses 3–4%, including after equal additional warmup.
Profile that remaining regression before claiming no speed loss. Resource-cache,
allocation and runtime-optimization state are hypotheses, not established causes.
Investigate identity-indexed resource-cache LRU separately if current profiling
supports it, preserving eviction and exception semantics and the existing
64-resource bound. Owned
FFI `with` lowering is an explicit compiler limitation, not a feature of the
current ordinary-Python predicate. The twenty preregistered neighbors remain
outside these development experiments.

The [prepared-path follow-up](../docs/cubic-prepared-regression-investigation.md)
repeats the warmed loss at 2.5% in all eleven uninstrumented pairs, but does
not reliably localize it with instrumentation. The host square-root loop is
only about 0.5% of prepared samples. Native time remains about 2.24 ms for the
known target, so host cleanup alone cannot match its roughly 1.21 ms PARI
fresh boundary. Keep the small regression open, and return the main campaign
to current-source frozen-corpus structural slowdowns and multi-stage declines.

The [full staged diagnostic](../docs/cubic-full-staged-discovery.md) now accepts
all 1,012 frozen records with correct class numbers and invariants. All 64
fixed-effort-five declines recover under the existing retry policy. The first
retry by discriminant, $x^3-x^2-7x+122$, lacks a unit witness in its initial
native attempt; PARI finds one and actually uses a larger residue cutoff. Focus
next on the retained relation/unit information, not on reducing an analytic
bound that the failing attempt has not yet reached. Repeat controlled timings
before quoting a speed ratio. This diagnostic is not a new public replay gate.
