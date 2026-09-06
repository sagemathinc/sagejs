# Next complex-cubic optimization campaign

Status: active; no new PARI win claimed.

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
- [Twenty fresh neighbors](../docs/cubic-rank-pending-neighbor-protocol.md)
  are selected and excluded from development execution. Freeze the candidate
  before running them; retain all outcomes. Selection alone is not validation.

Do not promote these incremental improvements into a PARI-win claim. Finish
current-source public replay, controlled public timing and the frozen neighbor
evaluation, report regressions, and keep PR190 draft until its actual gates
are satisfied.
