# Generic class/unit proof-mode fixture audit

This follow-up audit starts at integration `fe2918cf2`, after the BF proof-policy
correction and the public map fixes in `54d9fe9`. It changes tests only: a
Minkowski factor base proves class generation, not the separate completeness of
the unit lattice. The generic BF analytic completion therefore remains
conditional even when generation is unconditional. See
[the projection proof-policy note](number-field-class-unit-projection-regression.md)
for the underlying distinction and the earlier fixes.

## Remaining stale expectations

Four integration test files still requested invalid unconditional BF evidence:

- `number-field-quartic-class-number-projection.cjs`: nontrivial quartic scalar
  projections and their coupled/public continuations expected both proof modes
  to complete. The generic BF path cannot supply the unconditional half.
- `number-field-quartic-minkowski-continuation.cjs`: four nontrivial quartics and
  their direct factor-base logarithms used the same invalid unconditional
  premise. Exact class generation does not remove the unit-index hypothesis.
- `number-field-class-unit-auto-preflight.cjs`: the live-prefix cubic
  `x^3+4*x-1` requested unconditional coupled completion, and the cached
  `x^3-x^2-6*x-12` terminal was expected to upgrade to unconditional BF
  completeness. Its independently certified scalar class number 3 is still
  unconditional; that does not certify the combined result.
- `number-field-class-unit-context.cjs`: a direct BF index-certificate call for
  the local saturation-obstruction fixture still requested an unconditional
  label. It now carries conditional status and explicitly rejects the former
  request. The synthetic class-quotient order 2 supplies an index-two bound for
  testing a local unit obstruction; it is not a claim that the quadratic field
  has class number 2. The exact local obstruction and mutation tests remain.

The four quartic presentations are retained, with their original signatures
and class numbers 2, 2, 2, and 4. The conditional tests retain relation counts,
one-time factor-base work, saturation and projection state, exact invariant
checks, direct logarithms, principal witnesses, hostile metadata and adapter
checks, and independent public replay. Fresh and cached unsupported
unconditional requests now require the specific missing unit-completeness
diagnostic, rather than being counted as completed computations. Rejected
requests must leave supported conditional results usable.

The cubic artifact-mode tests retain all four modes: completed seed, live
prefix, size decline, and empty base. The malformed-seed case still tests a
fresh computation with the unusable hint rejected; its result has the actual
conditional proof status. The independent exact scalar result 3 remains a
positive control. No field is replaced by a trivial one to obtain a pass.

## Systematic scan and controls deliberately retained

The audit searched `test/` CJS and Python fixtures for public class/unit calls,
`class_unit_context`, `compute_class_unit_group`, variable and explicit proof
arguments, and unconditional proof-status expectations. A public/coordinated
call-site search matched 27 files. Nearby default-proof calls, multiline
arguments, and internal engine test doubles were inspected as well; grep
matches alone were not treated as evidence that a test was wrong. A further
direct-certificate-constructor scan found the context fixture, which does not
call a public combined producer. Other constructor sites already use the
conditional status or deliberately assert rejection of forged evidence.

| Fixture family | Reviewed distinction; action |
| --- | --- |
| Quartic principal-Minkowski class-number and public-class-group tests | Their class-number-one principal witnesses provide independent exact class-only proofs. Both proof modes and unconditional payload verification remain unchanged. |
| Trivial quartic projection controls within the changed file | `x^4+2` still returns exact scalar 1, reuses its unconditional principal certificate, and exposes a verified unconditional trivial class group. These assertions remain unchanged. |
| Public class/unit, terminal-reuse, zero-base, and exact-public-projection tests | Existing generic requests are conditional or explicitly decline; existing exact scalar and independently specialized results remain. No additional change needed. |
| BF proof-policy and general unit-coordinate tests | Explicit class-character/zeta hypotheses, rejected generic upgrades, exact rank-zero controls, and the independent exact-log-fundamental-box specialization remain. |
| Engine/context/checkpoint and maps-proof tests | Apart from the corrected direct BF constructor, unconditional generation schemas, rational/specialized fields, test-double authority contracts, and failed-policy assertions are distinct from claiming generic public BF completeness. Retain them. |
| Steering and three-admission tests | Real generic producer calls already select conditional proof mode, including resumed and interrupted runs. |
| Global arithmetic, zeta-public, quadratic and basic number-field tests | Standalone bounded exact unit/class services and quadratic form algorithms are not the generic BF completion. Their unconditional expectations remain. |
| Corpus/reference/competitor metadata tests | Reference proof labels and deliberately forged payloads are not successful Sage.js generic producer claims. Do not rewrite metadata merely because it contains `exact-unconditional`. |

This static audit found no further stale generic successful-producer
expectations in that scan. It is not a claim that every integration test has
passed: focused runs and the full integration sweep are separate evidence.

## Validation boundary

The narrow lane records direct focused suites in its task contract, including
the four changed files, unchanged quartic principal-Minkowski controls, the BF
proof-policy regression, and the zero-factor-base regression. The initial
uncorrected cubic/continuation run is retained as a failed receipt: three of its
four tests failed with the specific unconditional BF diagnostic.

No mathematical source, compiler, native addon, public proof semantics, resource
cap, or source allowance changes. Existing compiler/native build artifacts from
the exact integration source baseline are reused for the test-only lane. This
does not stand in for full integration or cross-platform qualification, which
remains with the integration lane.
