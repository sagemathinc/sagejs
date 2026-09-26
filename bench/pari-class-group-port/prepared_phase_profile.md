# Prepared cubic native phase attribution

The copied-artifact tagged diagnostic passes all original exact output and
491/54/12 work-count assertions. Canonical generated artifacts are unchanged.
Raw provenance, transformation coverage and counts are retained in
`prepared-phase-profile-20260915.json`. This profiles the pinned compiled graph,
not an independently rebuilt graph after arbitrary transitive source changes.

Two complete calls are included: one warmup and one measured probe call. The
following are averages of the instrumented C timers, **not qualified timings**.
Timers can perturb code generation; the independent uninstrumented paired
comparison remains the performance evidence.

| Phase | Average milliseconds per call |
| --- | ---: |
| Relation initialization | 0.135 |
| Relation collection | 38.093 |
| Relation logarithms | 38.893 |
| Initial HNF | 33.259 |
| Regulator acceptance | 1.638 |
| Smith invariant output | 0.006 |
| Other native core | 0.094 |
| Entire native core | 112.118 |
| Additional C/N-API adapter time | 0.707 |

Every instrumented tagged phase ran twice, and every corresponding GMP phase
ran zero times. There is no phase-level dispatch back to GMP bodies. This does
not mean individual large tagged integers avoid GMP arithmetic.

The adapter difference excludes JavaScript-side validation/coercion. The
ordinary probe still measures the full public invocation and agrees closely
with the core timer. Thus host entry overhead is not the dominant gap here.
Owner reset and initial packing are outside both core and adapter timers and
remain separately reported in the paired evidence.

Three phases account for almost all core time. The subsequent predeclared
eight-word diagnostic (`resident_word_capacity_audit.md`) reduced owner storage
from 271,240,904 to 42,312,456 bytes, but core computation remained approximately
100–107 ms. Those unpaired measurements do not establish a speedup. Shared
packed integer/real storage and scalar operations remain the next targets;
neither a single regulator check nor fixed-slot capacity explains the gap.

Reproduce from the matching prepared-attempt cache with
`profile_prepared_attempt.cjs INPUT --backend tagged --samples 1
--reference-fixtures REFERENCE --cache-key CACHE`, under the existing 4 GiB
address-space cap. Only the copied generated artifact receives timers and a
diagnostic getter. No production compiler option or backend default changes.

## Validation boundary

The exact-result profiler and both capacity probes passed. Parallel ownership
and Python formatting checks passed. Broader qualification remains incomplete:
`test:changed -- --base 17ac1e5435b4c93ad1bd7b100f3249e3e434b1bc`
passed merge checks and four test files, then failed in algebraic geometry
because this worktree lacks `packages/flint/build/Release/sagejs_flint.node`;
234 test files remained unscheduled. `architecture:check` passed preceding
inventories but failed at the already-stale optimizer opportunity manifest.
Neither failure was hidden by regenerating unrelated artifacts. These
diagnostics do not qualify a release or the full changed-file suite.
