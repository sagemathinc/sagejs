# Unit-coordinate map integration review

Status: integration in progress; not a completed qualification receipt.

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

The follow-up audit is pinned to source commit `f531a6b640`. Existing
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
