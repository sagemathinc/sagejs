# Resident staged closure for complex cubic relations

Status: resident support scratch and complete adjacent-ideal cursor implemented;
complete staged certification is not yet implemented or timed.
Inspected foundation: `2edc78a9f0537a759ca7bc387d081c91239c77e0`.

## Implemented prerequisites

The integration branch now combines these separately tested changes:

- [Fixed root-owned scratch](root-owned-staged-closure-scratch.md) qualifies
  existing logical-prefix HNF, Smith and LLL operations in borrowed-matrix
  helpers. Its dynamic/GMP/fmpz and sanitizer witnesses retain one checkpoint.
  The lattice stage therefore does not currently require a new arena API.
- `_cubic_append_reduced_ideal_ellipsoid` returns the next unexamined proposal
  and cumulative candidate count. Pause-boundary tests and compiled witnesses
  cover rejected and duplicate proposals, target changes and exhaustion. The
  production root still makes one complete call.
- `_cubic_collect_adjacent_relation_prefix` now retains the outer permutation
  position, once-only planning phase, ellipsoid cursor and cumulative candidate
  count, and four-vector shell direction. It advances after every proposal,
  including rejection and duplication; target changes never restart an ideal.
  The one-shot root supplies a complete proposal budget of $2146693n$, where
  $n$ is the factor count and $2146693=129^3+4$ bounds each ideal's ellipsoid
  plus shell. Smaller budgets are tested but not yet used for certification.
- IR39 supports `break` and `continue` to the nearest native `while` loop.
  Transfers wholly inside an existing arena preserve its lifetime. Transfers
  out of newly entered resource scopes and transfers to range loops remain
  explicitly unsupported; no unchecked cleanup bypass is emitted.
- Call-induced nested exact arenas fail at native lowering. This conservative
  guard prevents a helper from silently introducing an unqualified child
  checkpoint; it does not reject ordinary borrowed-matrix helpers.
- Reconstructed units must pass their independent regulator authentication
  before replacing the retained witness. A synthetic fault-injection test
  exposed an earlier branch that could retain stale identity coordinates when
  that authentication failed. It now declines with bad-regulator phase 44.
  This is a tested control-flow correction, not a discovered ordinary-field
  failure or a change to the mathematical acceptance theorem.
- `_cubic_prepare_proof_relation_support` now borrows attempt-local support
  and membership scratch. It copies the retained online bits for the reuse
  path and explicitly resets support and the incremental basis before a
  recomputed attempt. The collector's support history remains unchanged.
- The one-shot suffix uses separate `proof_relation_count`, `proof_unit_*`
  and `proof_regulator_*` scalars. Compaction, unit reconstruction and
  saturation no longer overwrite the raw count or cheap-unit state.
- Nontrivial factor-transcript publication now follows analytic index-one
  acceptance, alongside relation publication. A source-extracted fault test
  checks that failed analytic planning reaches neither transcript publisher.

The support witness invokes the actual helper repeatedly at logical row counts
$5,8,5,8$, covering reused online support, recomputed HNF support, and the
small-unit path. Its exact rows include zero, contained and index-reducing
relations. Dynamic/GMP/fmpz runs compare against an independent integer-lattice
argument, preserve input rows and online support, and poison unused scratch to
check reset and prefix behavior. This is a real exact-arithmetic test, not a
complete class-group schedule or a throughput claim.

The generated-core Linux sanitizer run exercises both fmpz and GMP entries,
positive/negative small and 255-bit-scaled rows, deliberate inconsistent-HNF
failures, forced checkpoint exhaustion, and successful reuse afterward. Its
maximum checkpoint high-water is 200,576 bytes for fmpz and 217,632 for GMP,
with no upstream checkpoint allocations. All-small fmpz arithmetic can report
zero GMP-limb high-water; the promoted cases explicitly require nonzero use.
These are support-stage checkpoint measurements, not total resident memory or
bounds for the complete repeated proof suffix. The state-isolation
source-matched production build and all ten focused cubic ledger/receipt/replay
regressions pass. The subsequent outer-cursor and IR39 source also passes a
fresh 39-family production build and the same ten regressions, including
authenticated fmpz receipts, independent replay and large-unit witnesses.
The complete closure has 86 functions and 201 edges, all in fmpz, with the
same 22 public entries and one root arena. The expanded source family is
422,246 bytes. The integration-owned source-size allowance is now 425,000
bytes, and package-graph validation passes for this family. Optimizer
provenance refresh and combined-dependency qualification remain pending after
the prefix-Arb and inferred-resource-indexing prerequisites were merged.
The production results above qualify the outer-cursor revision `a31e5b9b`,
not the later dependency merge. The source-size allowance is separate from
the unchanged arena/checkpoint and timing budgets.

The outer-cursor witness compares every pause boundary against an independent
proposal sequence over skipped, shell-only, ellipsoid-only and combined ideals.
It covers permutation order, changing relation targets, rejected/duplicate
proposals, malformed cursors, and the cumulative 500-candidate cap. The actual
outer and inner source bodies also execute in dynamic/GMP/fmpz with matching
sequence digests. Arithmetic admission doubles make these control-flow tests;
they do not replace exact class-group replay. Failure injected at every online
row exposed and now guards an inner-collector bug: a negative lattice-update
status must return immediately, before its processed-row count advances or a
later proposal can overwrite the failure. Failed cursors cannot be resumed.

None of these changes establishes that the full proof suffix fits the current
memory budget across repeated attempts. In particular, foreign temporary
allocations consume checkpoint space even when their mathematical owners are
later cleared. Full schedule accounting and end-to-end measurements remain
required. The frozen `f7f00552` census/timing candidate predates these changes.

The BF evaluator now passes its live value count to the logical-prefix Arb
binding. An actual-source test rebuilds the plan while changing both the
threshold and the candidate class bound, reusing 256 value slots and 1024
endpoint slots. The live counts grow and shrink as $91,127,90,91$; negative
200-bit poison in inactive slots remains untouched. Dynamic/GMP/fmpz results
match the previous exact-sized, whole-batch evaluation entry for entry,
including the finite-sum value indices. In particular, changing the class
bound can change deduplication against seed slot four; the test verifies that
the plan is rebuilt rather than reusing stale indices. This qualifies prefix
semantics, not the full attempt schedule or its no-retry memory bound.

## Measured motivation

The campaign's supplied forensic measurements for LMFDB `3.1.12716.2`,
$x^3-x^2-11x-63$, report an effort-3 proof with 14 rows at approximately
3.67 ms. Effort 5 gathers 30 rows before publishing a compact 15-row proof at
approximately 4.07 ms. PARI collects 14 rows. These are prior forensic
measurements, not new controlled timings produced by this design lane.

The general intervention is to attempt exact closure after an initial relation
prefix, then continue discovery in the same native invocation only if that
prefix does not yet prove the result. The field, checked maximal order, factor
base, prime powers, admitted relations, witnesses, online HNF and allocation
domain remain resident. A host effort sequence `(3, 5)` would recompute this
state and does not implement the intervention.

No polynomial, discriminant, label, class number or precomputed answer selects
the route. Initial thresholds depend on factor-base dimension and a bounded
general stage schedule. Timing includes unsuccessful closure attempts.

## Why the current suffix cannot simply be called twice

The post-collection part of `certified_complex_cubic_class_group_v1` initially
performs compaction, dependency recovery, regulator certification, saturation,
BF certification and publication in one lexical scope. In particular:

- It replaces `relation_count` with the compact count. Continuation needs the
  original admitted count and original row/element matrices. The scalar-count
  separation and outer enumeration cursor are now implemented.
- `unit_found` first records the cheap search result and later becomes true
  after dependency recovery. The collector and compactor use its initial
  meaning to choose their algorithms. A failed proof attempt must not change
  that scheduling fact. Separate proof-unit scalars now preserve it.
- Numerous dimension-dependent HNF, LLL, logarithm and unit resources are
  created as root-arena children. Repeating the suffix would retain resources
  from unsuccessful attempts until the outer return.
- Collection can stop inside an ellipsoid or four-vector shell. The new outer
  cursor now preserves those local variables. The proof scheduler must reuse
  that cursor: merely advancing the ideal index skips unvisited candidates;
  restarting it repeats candidates and may change admission or duplicate-unit
  behavior.
- A `False` return can mean insufficient rank or unit evidence, but also bad
  exact arithmetic, malformed intervals, capacity exhaustion, or failed
  publication. Current private phase numbers do not distinguish these causes
  sufficiently to authorize continuation.

The BF workspace has already been separated from field/prime-power state, so
that earlier obstacle is resolved. The mathematical acceptance argument in
`docs/complex-cubic-native-class-group-proof.md` applies unchanged to any
prefix that passes all its checks.

## State and helper boundary

Keep the following state owned by the root invocation:

| State | Mutation during a proof attempt |
| --- | --- |
| Checked polynomial, integral basis, multiplication table and factor base | None |
| Exact prime powers and retained ideal/embedding plans | None |
| Raw principal rows and corresponding exact elements | None |
| Online canonical HNF, support bits, modular admission state | None |
| Discovery cursor and raw relation count | None |
| Cheap-unit search result and its exact witness | None |
| Proof scratch matrices, exact units, interval endpoints | Scratch only |
| Detached publication buffers | Commit only after proof acceptance |

Use separate names such as `raw_relation_count`, `proof_relation_count`,
`small_unit_found` and `proof_unit_found`; do not overload them. A candidate
unit learned by an unsuccessful attempt may be retained as an optimization
only through a later explicit exact-witness transfer rule.

The conceptual private helper is:

```python
def _cubic_try_exact_closure(arena, field_state, relation_prefix,
                             initial_unit, proof_result) -> int:
    ...
```

These aggregate names describe ownership, not a request to add opaque
mathematical types or a claim that the current compiler accepts this API.
Implementation can initially pass the existing typed scalars, vectors and
borrowed FLINT matrices explicitly. The helper lowers its ordinary Python body
and stays in the root's closed native call graph.

Suggested private results are `ACCEPTED`, `NEED_RELATIONS`,
`NEED_UNIT_EVIDENCE`, `NEED_TIGHTER_INDEX_EVIDENCE`, and `INVALID`.
`INVALID` includes resource or arithmetic failures and causes the complete
native attempt to decline. Each recoverable result needs its own precise
exit site. The final BF inequality alone cannot identify whether relation
index or unit index caused insufficiency; the schedule may seek both.

An accepted result contains the compact original rows and their original
principal elements, exact unit, invariant factors, rigorous endpoints, and
the proof mode/assumptions. HNF basis rows cannot replace original relations
without corresponding exact principal witnesses.

## Resume cursor

The persistent cursor denotes the next unprocessed proposal, never the last
accepted row. It records ideal position in the fixed permutation, shell versus
ellipsoid phase, shell direction or ellipsoid coordinate triple, and bounded
candidate accounting. Advance it after every evaluated proposal, including
rejected or duplicate proposals, and before yielding to the closure helper.

The first independently testable collection change should compare one-shot
enumeration with pauses at every possible proposal boundary. Their proposal
sequence, admitted rows, principal elements, support bits, modular state,
candidate counts and final cursor must agree. A stage boundary is not a new
ideal, so the candidate cap stays cumulative for that ideal.

## Concrete compiler prerequisite and allocation semantics

At the inspected foundation, the compiler rejects a helper parameter
annotated `NativeExactArena` with:

```text
staged_proof: unsupported argument annotation NativeExactArena
```

`test/number-field-cubic-staged-exact-closure.cjs` reproduces the exact rejected
signature without running mathematical code. Removing `@native` from the
helper does not provide an escape: the root call is unsupported instead.

A suitable compiler extension permits a synchronous private borrow of the
root arena and a lexical child-resource scope. The borrow is nonescaping;
children cannot outlive the scope; every exit destroys children in reverse
order; children are charged to the same applicable root budgets. A nested
scope must not silently install an independent full-size checkpoint budget.

Rewinding allocation storage is permitted only after every scratch owner and
borrow has ended. In particular, writing a persistent parent's integer or
FLINT resource can allocate new limbs after the scratch mark. Those limbs
must not then be reclaimed by rewind. Keep the parent inputs read-only during
the attempt and give publication an explicit copy/promotion rule into storage
whose lifetime survives the scratch scope. On failure, clear only scratch.

An alternative is helper-local declared foreign resources under the existing
active checkpoint, or fixed-capacity root scratch borrowed by the helper.
Neither is rejected a priori. However, their complete accounting and cleanup
must be demonstrated before choosing them to evade the missing arena borrow.
The available HNF/SNF/LLL prefix primitives can help fixed-capacity scratch
respect logical dimensions, but an oversized padded matrix must never change
dependency transforms or introduce artificial unit relations.

The smallest compiler qualification covers successful helper return, each
recoverable result, explicit failure, memory exhaustion, and repeated calls
that continue using persistent parent resources afterward. It should exercise
both newly allocated scratch and growth of already allocated integers, then
run under the native lifetime sanitizers. The existing 3 MiB public checkpoint
cap remains a resource contract; do not raise it merely to retain failed
attempts' scratch.

## Integration sequence and acceptance

The next extraction uses two thin allocation/scheduling paths and the same
borrowed mathematical helpers. The bounded staged path reserves capacity once;
the general one-shot path keeps its existing lazy exact-sized allocations.
Do not copy the mathematical suffix to obtain a second implementation, and do
not allocate every optional recovery matrix for trivial class groups.

The actual shape-discovery boundaries are:

1. Full relation presentation: prefix copy, HNF/rank, Smith invariants and
   trivial-quotient exit.
2. Support and compact-size selection, using the existing support helper.
3. Compact presentation, dependency reduction and precision planning.
4. Unit attempt, optional recovery, and independent unit authentication.
5. Analytic index checking, optional BF refinement, and final publication.

`NEED_RECOVERY` and `NEED_REFINED_BF` are internal phase requests, not permission
to collect more relations. Preserve this distinction from mathematically
justified insufficiency. The first implementation should retain independent
compact and recovery owners rather than introduce another aliasing argument.

For an initial two-attempt route with $1\leq n\leq11$, no cheap-unit witness
and synchronized online HNF, use targets $n+6$ and $n+22$. A target is **not**
a capacity: rank-increasing rows remain admissible after it is reached. The
conservative raw bounds are $2n+6$ and $M=2n+22\leq44$, with at most
$M-n\leq33$ dependency rows. Compact and recovery logical counts cannot exceed
the raw count. Skip a second certification attempt if collection added no rows.

At $n=11$, retaining all independent suffix families at these final capacities
and sharing a 256-row BF value owner with its 1024-row endpoint owner uses at
most 17,810 `fmpz` entry slots (142,480 entry bytes on a 64-bit target). This
counts neither headers nor promoted limbs, scalar/FLINT/Arb temporaries, or
the existing collector state. It is a sizing aid, **not a memory proof**.
Every reduction must receive its actual logical shape, including the HNF and
LLL calls inside the recovery helper. The BF plan must be rebuilt because the
class-number upper bound participates in value deduplication; an unchanged
field and threshold do not imply an unchanged value-index plan.

The compiler rejects arena-child construction inside a deeper loop even under
an `if not allocated` flag. It also does not merge foreign-resource aliases
across branches. Keep staged owners outside the retry loop, use distinct
branch-local owner names, and keep their uses within the allocating branch.
No new ownership feature is required for this two-path orchestration.

Qualification must call the generated core without the public wrapper's
automatic checkpoint-growth retry. Require one core invocation across both
attempts, checkpoint capacity exactly 3 MiB, `retry_shift=0`, zero soft-limit
exhaustions and upstream allocations, and high-water no larger than capacity.
A successful public call alone does not establish any of these properties.

Implementation order:

1. Apply the qualified fixed-root scratch mechanism to the suffix. The
   expected arena-parameter rejection witness remains valid: that API was not
   added. Demonstrate the complete attempt schedule's memory accounting, not
   merely the smaller lattice witness's bounds.
2. Qualify the implemented outer ideal/shell cursor and its pause/resume
   equivalence tests in the production build.
3. Extract the current exact suffix without changing one-shot outputs. Keep
   failure categories explicit and preserve the small-unit branch.
4. Attempt closure at the initial general threshold and continue from the
   saved cursor only for classified insufficiency. Bound both stages and
   total attempts. Publish once.
5. Compare the target and at least 20 unseen neighboring fields, with exact
   authenticated receipt replay, stage diagnostics and complete public-call
   timing. Include failures of the first stage and compare their total cost.
6. Re-run the frozen 1,000-field corpus, native and Wasm portability gates,
   checkpoint exhaustion tests, and controlled measurements on `opt` before
   promoting a performance claim.

## Recoverable versus fatal proof exits

The initial suffix audit identifies these narrow recovery candidates:

| Condition | Meaning |
| --- | --- |
| Raw row count or exact raw HNF rank below the factor count | Need more relations. |
| Full class rank but no cheap unit and no dependency dimension | Need unit evidence. |
| Well-formed final index enclosure still reaches $\log 2$ after the existing saturation/refinement steps | Need stronger joint relation/unit/analytic evidence; not necessarily more numerical precision alone. |

Keep malformed intervals, FFI failures, capacity/exponent limits, impossible
rank or index changes, and publication failures fatal. In particular,
insufficient support or compact rank **after full raw rank was established**
is an internal inconsistency, not permission to collect more relations.

`_cubic_relation_prefix_has_archimedean_unit` currently collapses genuine
absence of a candidate, reconstruction failures and bad regulator intervals
into its zero result. That ambiguous result must remain fatal in the first
extraction unless its reasons are separated. Do not infer recoverability from
phase 43 alone: that phase also covers some resource limits.

Proof attempts must not overwrite the collector's raw count, online support
bits or cheap-unit state. Use separate scratch for compaction, dependency and
analytic state, and defer factor/row publication until acceptance. These are
the remaining extraction obligations, not properties established by the
smaller prerequisite witnesses.
