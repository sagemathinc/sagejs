# Next complex-cubic optimization campaign

Status: active; no new PARI win claimed.

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
