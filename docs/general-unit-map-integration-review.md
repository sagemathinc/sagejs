# Unit-coordinate map integration review

Status: integration in progress; not a completed qualification receipt.

September 12 refresh: the full changed-tree run on `fe2918cf2` failed at the
remaining quartic unconditional BF expectation. Dependency `769679c77`
corrects four related fixtures without changing production mathematics; its
audit is in [the generic proof-mode fixture review](number-field-generic-proof-fixture-audit.md).
Focused positive conditional and negative unconditional controls passed in
that lane. The integration is being refreshed against main `c4c126d09` before
another full qualification run; earlier passes do not qualify this revision.
The two exact test-only fixture contracts join the reviewed validation-only
build-input list. Their edits must still invalidate validation fingerprints,
and both Git/archive partition tests cover them; no broad metadata exclusion
or safety-limit change is introduced.

The refreshed architecture run found one further provenance-only text match:
`agents/python-property-mutation-followup.md` quotes this campaign's earlier
dependency-audit failure. This is already present on main and introduces no
build/runtime import. Its exact reviewed documentation path joins the existing
historical-reference classification, with the actual file included in the
provenance regression. New runtime files and unreviewed documentation remain
rejected. The failed architecture receipt is retained.

## Architectural ownership

`sagejs.number_fields.unit_coordinates` belongs to the existing lazy
`number-field-global-arithmetic` package, alongside `class_group_maps`,
`class_unit_groups`, `class_unit_context`, `embeddings`, `factored_elements`,
and `units`. Its implementation consumes their completeness authority and
exact arithmetic; it is not a second discovery engine or a low-level local
number-field algorithm. Explicit file and module ownership replaces the
otherwise implicit `number-field-algorithms` prefix classification. There is
no new package, dependency layer, or artificial source-budget partition.

The module is included in strict Python checking. Its public entry is a lazy
import from `ClassUnitComputation.unit_coordinate_map()`. It adds no native
file, foreign export, kernel, or compiler special case. Validation must finish
before this integration is ready for review.

## Explicit source-allowance decision

The global-arithmetic source allowance changes from 1,720,000 to 1,730,000
bytes: 10,000 bytes, approximately 0.58%. The low-level number-field allowance
remains 1,200,000 bytes. Against foundation `9dd8714f4`, source accounting is:

| Source | Before | After | Added bytes |
| --- | ---: | ---: | ---: |
| `unit_coordinates.py` | 0 | 19,840 | 19,840 |
| `class_unit_groups.py` | 369,463 | 369,887 | 424 |
| `class_unit_context.py` | 152,556 | 154,315 | 1,759 |
| Complete global-arithmetic package | 1,700,595 | 1,722,618 | 22,023 |

The correctly classified package exceeds the old allowance by 2,618 bytes,
and has 7,382 bytes of headroom under the new allowance. These counts include
comments and docstrings; no source is excluded merely to pass the inventory.

This is an inventory allowance for an added mathematical API, not evidence of
performance or permission to enlarge runtime resources. The startup policy,
precision bounds, expansion policy, native arenas, production-kernel budgets,
benchmark limits, and proof requirements are unchanged. No diagnostic or
authority check is removed to fit a byte counter. Independent review found
no convincing readable factoring that eliminated the small overage, and
recommended this explicit decision rather than minification or relocation.

## Correctness and remaining work

The map relies on an already complete, authenticated fundamental system.
Integral-order membership and norm plus or minus one establish that an
ordinary input is a unit. Completeness makes its logarithmic coordinates
integers; rigorous determinant-ratio intervals isolate those integers.
Exact real-embedding signs then recover the remaining sign torsion.

Review identified a mutable persistent logarithm cache as an unacceptable
authority gap. The implementation now creates a request-local workspace;
focused mutation tests demonstrate the fix. A producer-owned field/order
fingerprint covers mutation before map construction, including the
empty-factor-base case. Constructed compact products use rechecked formal
products, not cached coordinate claims alone.

The implementation remains a bounded correctness slice. Arbitrary detached
factored membership, detached map replay, and ordinary positive-rank inputs
without a real embedding are not implemented. Eager unconditional terminal
snapshots add work even when no map is requested; this cost must remain inside
later end-to-end qualification. The expansion weight is a size-policy proxy,
not a proved CPU or memory bound. None of these limitations is waived by the
source-allowance decision.

## Generated-source inspection

The implementation-lane compiler has identity
`7ab186a04312a36c45abce43d56aa5ccb79260b2`. Its fresh Python-mode lazy artifact
for `unit_coordinates.py` has source signature
`40ca4923a1ce3da70c358670b94268fddd0adbfb`:

- Python source: 19,840 bytes; SHA-256
  `bcde0abc64c77783169f781a0a00e72f7e4311a7d1e0cd7504b970275a3b2a06`.
- Generated JavaScript: 178,903 UTF-8 bytes; SHA-256
  `adfc094bfed669e44f021e23afa68f71b93eed3c8ed63717f7c64181f6713326`.
- Local cache envelope, including encoded V8 cached data: 263,545 bytes;
  SHA-256 `04d3aaa4543544c34e751014176150c4af8c0b6e1501c7dda2483a0761ab3be0`.

The coordinator independently read and hashed that cache envelope. It is a
discardable local compilation artifact, not a proof receipt or committed
release artifact. An integration rebuild must still validate current source;
these measurements do not certify a different compiler or target. The lazy
entry is the ordinary function-local import in `unit_coordinate_map`, with
no new module-level import from the class/unit engine.

Exact unit factors use frozen number-field element shells and frozen
coefficient tuples whose rational leaves contain immutable integer values.
The focused regression attempts to alter a coefficient slot and a rational
numerator before map construction and verifies that the original exact
payload remains unchanged. Mutable field/order data are separately bound by
the producer fingerprint; this distinction avoids treating every private
object as immutable merely because its outer wrapper is frozen.

## Integration validation boundary

Source `f531a6b640ce8344a9e595ba8bc602a24678bafe` and its metadata-only
handoff `754104d8312adeabf23528b9b606388c048bd1bb` are incorporated at
`b1554f9efd6f07f1904ba75eaeb518f30da9a0af`. The implementation lane passed
the focused coordinate regressions, strict checking, native suite, and both
terminal-context reuse tests. Some receipts precede the source commit while
containing the identical source bytes: their recorded workspace fingerprints
are retained rather than relabeled as post-commit receipts.

The integration build passed in 11 minutes 37 seconds, and strict checking
includes all 383 registered modules with zero errors. Integration architecture
checking passed ownership, source inventory, native boundaries and the retired
dependency audit, then correctly rejected the stale optimizer census. The
census hashes all mathematical Python sources, so the new coordinate module
and the two changed existing modules require a fresh compiler-produced census,
not an edited digest. Regeneration passed: 636 modules, 16,573 functions and
14,529 loops, with the same compiler identity and exactly 22,023 additional
source bytes. The generated snapshot is
`sha256:6c293af9a708bc8f832c81367fcc4481eb4cd64f9196d307382591027278b51b`.
The complete architecture gate then passed. Final integration gates are still
pending and will be recorded against the committed integration workspace.

The two exact unit-map lane contracts contain only coordination and validation
receipts. They join the existing reviewed build-input exclusions, with Git and
archive regressions requiring that their edits still invalidate validation
fingerprints while preserving compiled artifacts. Unknown `.agents` files,
lane definitions, mathematical source, and generators remain build inputs.
This prevents recording a validation run from unnecessarily invalidating the
compiler build that the run just checked; it does not relax any test gate.

The first full changed-tree run passed build and architecture, then stopped at
the modular q-expansion source-freeze test. Its sole changed file binding was
the shared package graph, due to the reviewed unit-map ownership above; no
modular mathematical source or oracle changed. The existing source-freeze
generator refreshed that binding and its bundle digest, and the focused test
passed. The failed full-run receipt remains recorded; this refresh is not a
claim that previously recorded modular qualification ran at the new revision.

## Next correctness boundary: detached terminal replay

### Integrated component slice and proof-policy repair

The complete changed-tree check at `e19a712be` passed, including 395 integration
files (55 minutes 41 seconds for that stage; 4,616.394 seconds overall). Its
receipt retains the actual revision and workspace fingerprint. It does not
qualify the subsequent changes below, and the integration remains draft.

Independent source review then confirmed a pre-existing proof-policy defect:
the generic Belabas--Friedman analytic index could be labelled unconditional
after an exact class-generation check. Minkowski generation does not discharge
the separate zeta-GRH hypothesis. Source `4d53ffb039d0df8988f69afa818466995d83d72c`
rejects that promotion at construction, decoding, replay, live-token consumption
and public publication. Genuine independently proved specialized/scalar routes
remain available. This correction removes 22,361 net mathematical source bytes;
it does not introduce an unconditional analytic theorem.

The independently reviewed detached slice at
`2436b080fbbd478888f87c6e0cef5baa80beb094` adds 21,080 bytes in
`class_unit_replay.py`. Its fresh field/order, ideal, relation, presentation,
unit-membership and torsion checks return component data only, never a live
context or map token. Successful output explicitly has `component_only=True`,
`complete=False` and `source_proof_status_verified=False`. Degree 2--4 and
arithmetic-size restrictions are not wall-clock or memory guarantees; callers
still need external resource supervision. Class generation, analytic index and
unit-lattice completeness remain pending obligations.

Both sources were initially merged at `f1c19aae850df20c42d94b9d0c842f9d8e663718`.
Strict registration then exposed an import-order failure. The narrow follow-up
`0bef58bb57f65a121ab3eacfc624867d935b6ec0`, merged at `d6caf8e075`, sorts the
local imports and combines two imports; dedicated CPython/JavaScript replay
tests passed afterward. The first strict failure remains recorded. Replay
source is now 21,044 bytes, with no mathematical check changed.
Explicit global-arithmetic ownership totals **1,721,301 bytes**, below the
existing **1,730,000-byte** allowance and 1,317 bytes below the earlier unit-map
integration. No source or runtime allowance is raised for these additions.
The replay module joins strict typing. The two exact new lane-contract paths
join the reviewed metadata-only build partition; all 14 Git/archive partition
regressions pass, including continued validation-fingerprint invalidation.
The integration contract baseline advances to the merged dependency commit for
ownership checking, while full qualification still compares against `b1740b787`
so mathematical dependencies cannot disappear from the test selection.

Before the import-order follow-up, the actual compiler regenerated the census
in 90.60 seconds: 637 compiled
modules, 16,577 functions and 14,562 function-body loops, with zero source
failures and unchanged compiler identity. Its logical snapshot is
`sha256:ad6c4cbf1622d712e6036e6cba629e43e33a5f95170a9f145366c3cd22edc564`.
The complete architecture gate passed after regeneration; its receipt retains
the actual dirty-workspace fingerprint before this documentation update rather
than claiming a post-commit run. Import reordering changes the source hash and
requires another generated census; that earlier snapshot is historical.
The import-order source was subsequently regenerated in 85.87 seconds with
the same counts and zero compilation failures, producing
`sha256:6973bc8167292113fce040dd124392db47d3773949c88ea2a97bcd9cb3dc472f`.
The modular source-freeze generator changed only its shared package-graph hash
and aggregate digest. No modular mathematics or oracle changed.

Frozen proof-policy broad engine/public validation passed 48 tests with two
existing slow tests skipped (577.40 seconds); strict checking passed all 383
modules then registered in that lane, and its documentation gate passed. The
new replay registration still requires the integrated 384-module check.

Frozen proof-policy native validation retained one dense-QQ timing failure
(11.16 ms against an unchanged 8 ms trace gate). An overlapping focused rerun
passed at 4.93 ms; this is neither an explanation nor a replacement for the
failed run. The coordinated unchanged quiet check subsequently passed at
4.91 ms; no cause is inferred from that pass. One full native rerun is in
progress. Combined-revision integration validation and final generated-code
resource measurements remain pending.

### Exact-revision validation checkpoint at `3f5edf0ab`

The integrated strict check passed all 384 modules with zero errors. The full
changed-tree run passed build (8 minutes 34 seconds), architecture, 202 unit
files, documentation and lazy-module checks, then failed the public projection
integration fixture. The overall failed receipt is retained at 1,271.38 seconds;
395 integration files were not started. This is not a passed integration gate.

Independent source review and a direct reproduction locate the failure at the
first combined `proof=True` request for `3.1.588.1`. The three fixture fields
have class numbers 3, 8 and 6, but their generic fundamental-unit completeness
used the conditional BF index argument. The old
test therefore relied on the corrected false unconditional promotion. A narrow
test correction must retain nontrivial conditional class maps and mutation
checks, separately exercise the public scalar route, and explicitly test
the unsupported unconditional combined request's decline. Restoring the false
label, or replacing the cases with only trivial class groups, is unacceptable.
The public class-only adapter currently shares the combined route; providing
an independent class-only proof/map route remains a separate product gap.
The first test correction incorrectly expected all three public scalar calls
to complete unconditionally. Direct execution instead returned 3 for the first
field and declined for the other two through the generic combined proof guard.
The failed 247.17-second fixture receipt is retained. The corrected expectations
record those two scalar capability gaps rather than infer an implemented public
route from the existence of scalar certificate machinery. This does not count
the two declines as successful unconditional computations.

Current generated UTF-8 `javascriptTemplate` measurements, using the same
boundary as the earlier integration baseline, are:

| Module | Template bytes | Change from earlier baseline |
| --- | ---: | ---: |
| `class_unit_groups` | 2,112,307 | -112,783 |
| `class_unit_analytic` | 1,760,431 | +1,209 |

Their SHA-256 digests are respectively
`ae37c0edc6cce756e5a6cccea37a80562af608b2c5faf25a6f94b07666ff9c70`
and `6d1b4afd91f46a9be88fd61002a4f2ac5e6d0a7066be3847d04d8a4c9b514a17`.
These two artifacts do not account for the new lazy replay and coordinate
modules, nor establish runtime or memory competitiveness. The proof-policy
lane's single quiet full-native retry separately passed in 802.55 seconds,
including the unchanged dense-QQ gate at 5.04 ms. The original timing failure
remains retained; a later pass does not establish its cause.

### Remaining completeness implementation

The original follow-up audit was pinned to source commit `f531a6b640`. Existing
`RelationRecord.verify`, `RelationPresentation.verify`, class-map witnesses,
torsion/unit verifiers and `UnitSaturationIndexCertificate.verify` provide
substantive mathematical checks. In contrast, checkpoint decoding accepts
optional component-verifier hooks, defaulting to none: canonical integrity
and matching field identifiers alone are not a complete mathematical replay.

The narrow follow-up is a terminal receipt adapter that mandates those
existing checks in a fresh context without producer callbacks or caches.
It must verify decoded relations before granting their live admission
authority, verify the presentation and maps, replay unit/torsion evidence and
the analytic index-one argument, and additionally replay unconditional
generation coverage when claimed. Only then may it publish a context that
can supply unit-coordinate authority. Rehashed mathematical mutations must
fail; successful JSON round trips are not sufficient.

Initially, detached compact-coordinate witnesses can be checked by exact
formal equality to a product of the certified generators. This is narrower
than deciding arbitrary factored-element membership, and must be described
as such. This follow-up is not implemented by the present changes and is not
part of their passing test claims.

### Current-main qualification at `9688e75e0`

The full changed-tree run against `b1740b787` passed its current build,
all 222 unit-test files and strict checking of 389 modules. It then failed
`compiler/algebra.py` at the unchanged 60-second subprocess limit; the failed
1,146.43-second receipt remains in the task contract. An isolated unchanged
fixture reproduced the timeout. A separately supervised assertion-lookup
trace completed the first 160 assertions in under one second and stalled on
assertion 161, `test/algebra.py:255`: the large generic Pohlig–Hellman
`discrete_log(book_target, book_generator)` example. This identifies the
operation, not its root cause. No class/unit computation had started there,
and no timeout or assertion was removed. The trace's own 60-second timeout
is retained; it is diagnostic evidence, not a passing qualification.

PR #219 remains draft until the complete gate succeeds. Earlier passing
revisions and current focused tests do not substitute for that result.
