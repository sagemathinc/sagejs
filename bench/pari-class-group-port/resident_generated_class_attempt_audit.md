# Resident generated-catalog class attempt

`resident_generated_class_attempt.py` moves the successful diagnostic phase
composition into one ordinary typed Python entry, calling the actual translated
source functions directly. No function-name substitution, host callbacks, or
new mathematical algorithm is involved.

Source SHA256 at handoff:
`be50e1b7ea5962903c235580ef92052f2fe6a2de5e14b2363d2b407963e49c3e`.
The entry has 351 explicitly typed arguments: 284 retained prepared-owner/raw
arguments and 67 new preparation arguments. It removes 18 computed or fixed
policy scalar arguments from the 302-argument analytic entry. Its final call
forwards all 302 arguments in the original declaration order; changes are the
documented computed scalars and borrowed views.

## Dataflow and boundaries

The resident entry performs:

1. Generate degree patterns from defining polynomial and the runtime prime list.
2. Derive LOGD from the discriminant, then compute initial GRH/FB selection.
3. Generate only selected Kummer descriptor prefixes using a resident PARI RNG.
4. Construct selected HNF/norm packets and gather valuation metadata.
5. Compute bad-subfactor flags, source product limit, subfactor permutation and
   initial relation policy.
6. Invoke the existing analytic-normalization/class-attempt entry.

The branch is deliberately guarded to the fixed nongalois totally real cubic
`x^3-20018*x+20034`, equation index 1, discriminant 32075641032116, two roots of
unity and 192-bit working precision. Prepared nf inputs still include integral
basis conversion, multiplication table, numerical embeddings and rounded nf
embedding. Runtime prime and trial-division product tables remain prepared.
No selected decomposition, ideal packet, relation, class number, regulator or
analytic normalization answer is an input.

The checker retains the earlier positive nf/runtime value allowlist and uses
old fixture arrays only for declared backing capacities otherwise. All states
and scratch start zero; inverse hR and LOGD outputs are deliberately poisoned.
The wrapper itself requires fresh zeroed scratch as an explicit caller contract.

This is not the full Buchall driver. Eager degree-cache filling and analytic
preparation ordering remain diagnostic scheduling differences. General
automorphism/cyclotomic-unit preparation, retries, precision restarts, honesty
verification and full unit maps remain outside scope. KCZ=KCZ2 is checked for
this initial branch, not presented as a general honesty certificate.

## Logical lengths versus allocation capacity

All storage is preallocated by the caller. The only new representation facility
is a nonresizing borrowed IntegerBuffer view; no dynamic mathematical owner
allocation is required inside the entry. Eleven exact prefixes are necessary:

| Logical length | Backing owners |
| --- | --- |
| KCZ | initial_primes, initial_offsets, initial_counts, initial_complete |
| KC | packet_ids, packet_norms, ramification, relation_primes, admission_group_f, relation, prep_bad |

Reasons are concrete, not merely cosmetic:

- `subfactor_base` takes its size from `len(norms)` and requires the bad-flag
  length to agree.
- The relation cache and connected HNF entry take KC from `len(relation)`.
- Initial rational relation insertion takes KCZ from `len(initial_primes)` and
  requires matching group-vector lengths and KC ramification length.
- The ideal scheduler requires equal ramification/residue-degree lengths.
- Smooth relation construction requires equal prime/ramification/relation
  lengths. This last transitive check motivated the eleventh view during review.
- Initial unreduced collection takes packet count from `len(packet_ids)` and
  requires the norm-vector length to agree.

Other owners use explicit active counts or minimum-capacity guards. In
particular, search_ideals uses search_count, selected packet/metadata builders
take selected_count, and HNF permutation needs only capacity >=KC. No Int64
view is required. Internal views alias their backing buffers intentionally;
other arguments remain disjoint. Mutation occurs through actual shared storage,
not copied Python slices.

The padded control adds seven unused entries to the logical backing owners,
including prep_bad, while keeping computed KC/KCZ unchanged. Thus capacity is
not an implicit supplied factor-base answer.

## Allocation caveat

The historical HNF generic work owners have 19321 entries, derived from
`(66+73)^2` in the earlier successful fixture. Zeroing them eliminates answer
values but does not turn that allocation into a worst-case bound. Acceptance
4096-entry workspaces and CUP's 160000-entry arena are also declared experimental
resource caps. Exhaustion must stay an explicit frontier, never a quieter
acceptance criterion. A broader caller should size HNF from a declared maximum
column capacity, or the source cache capacity `10*(KC+additional)+50`, with
per-owner formulas, rather than importing an observed relation-count formula.
No allocation-limit increase is part of this wrapper.

## Lifecycle and evidence

Terminal replay returns before rebuilding preparation or validating nf inputs.
Partial attempts reject reuse. Initial shape/field guards are mutation-free.
After those guards, publication is cleared and attempt phase becomes 1 before
any preparation writes. Preparation exceptions therefore cannot publish a stale
class result. Phase resets to 0 only immediately before the existing analytic
entry takes ownership of its own lifecycle. prep_state retains the preparation
phase, generated counts and final action for diagnostics.

Root's padded CPython test passed:
`/tmp/sagejs-resident-generated-class-Rn0ysu`.
It reproduces KC66, KCZ48, subfactor count4, 73 relations, accepted class number1
and the exact prior 192-bit regulator. At this handoff generated JS and native
qualification are pending; do not infer those results from the earlier
multi-call RPC diagnostic.

Suggested additional lifecycle control: deliberately shorten the degree scratch
after valid initial guards, check phase1/publication0, and verify partial reentry
is rejected. Root owns the checker and subsequent receipts.

## Frozen connected backend qualification

The final checker (`970e2aa029c7e05f0d4fe05b85811d30b668ed92d0f58428089854e25d6d04f7`)
also exercises that late-failure/partial-reentry control and five atomic early
guards. Padded CPython, generated JavaScript and native GMP pass. Unpadded
CPython passes separately. Final artifacts:

- CPython padded: `/tmp/sagejs-resident-generated-class-TVVwE7/result.json`.
- CPython unpadded: `/tmp/sagejs-resident-generated-class-7Cz7Df/result.json`.
- JavaScript padded: `/tmp/sagejs-resident-generated-class-KYoKF4/result.json`.
- GMP padded: `/tmp/sagejs-resident-generated-class-McctKf/result.json`.

All GMP output owners match CPython exactly, aggregate output hash
`a705f625bf6f47a25b62dd3ff8485abf1c8af5ec0f12d15ee5cbb89cf6195e0b`.
JavaScript differs only in 28 cached binary64 logarithm cells (nine analytic,
nine base-constant, ten factor-log cells); exact owners and final candidate
agree. These small libm differences are retained, not relabeled bitwise parity.

The isolated GMP core has 80,327,627 bytes, SHA256
`d304a7a7ab0f7ffa24dea119b0b6d7e8bc9929ce81417bd9851cacac537be534`;
loaded addon SHA256
`733b6f405e3ace5cf6fd8b33dbed2385c11a13d1386b2f61afd701162251fb87`.
Build plus replay cost 379.0 CPU seconds, peak child RSS 2,007,872 KiB under the
unchanged 4 GiB address-space cap. This is resource evidence, not a kernel time.

Compiler dependencies `af079adf3` and `0c600a514` provide checked exact spans and
their explicit local annotations. The first integrated JS lowering rejected
the annotation despite accepting the inferred view; the follow-up fixes that
language gap with focused regressions. Initial checker failures (missing
analytic-state capacity and loss of Python integer precision in diagnostic JSON)
are retained in the CPU ledger; the latter is fixed by string serialization,
not a change to mathematical arithmetic.

Audit/implementation started 2026-09-15 17:20:16 UTC. Approximately ten active
agent minutes were used through this handoff; no heavy builds or mathematical
test runs were performed by this lane. Root's test costs are separate. Initial
parallel-check warnings concerned incoming shared compiler changes, not these
owned files; root advanced the contract during integration.

## Review correction: failure at the analytic handoff

Independent review found that resetting attempt_state to zero before the
analytic call exposed a lifecycle hole: an initial guard in that callee could
raise after preparation had changed buffers, yet allow preparation to run again.
The resident entry now also requires prep_state[0] to be zero on admission.
Terminal replay still returns earlier, so it remains mutation-free. A failed
handoff retains preparation phase 6 and rejects reentry even when attempt_state
is zero. This guards future downstream initial checks as well as current ones.

The corrected source SHA256 is
`8bfdb3f7685b88f0cbc44c4e4cef11062f2c96962fb8d79dcf5ee8a90ef6cf1e`;
checker SHA256 is
`a4ba8f06bc816f0c1e1e16b5c8a2a782772697d7df2a8518d8b7fa508ea0dfbb`.
Two additional controls shorten accept_inverse_hr and analytic_state after
fresh preparation admission. Both fail at handoff and reject repeat entry.
CPython (`/tmp/sagejs-resident-generated-class-pxdA2Y`) and JavaScript
(`/tmp/sagejs-resident-generated-class-ZycT6M`) pass, retaining exactly their
earlier successful output hashes. Corrected native GMP replay also passes
(`/tmp/sagejs-resident-generated-class-3qtnS5`), including both new handoff
controls, with the same complete output hash as CPython. The corrected core
is 80,333,582 bytes, SHA256
`2b5bd02ac3dfe6eab32af9b4c48ba975bd42ccb279a408a6182cf85850d0ee9d`;
addon SHA256
`ffb9fe45977be1ea04cc46032c916b4b3e60e71c2bc9460f7f57afde6c68d090`.
Build/replay cost 367.859460 CPU seconds and peaked at 2,007,696 KiB RSS.
Corrected tagged native replay also passes
(`/tmp/sagejs-resident-generated-class-PxN7eT`), including the new handoff
controls, with that same complete output hash. It uses the same isolated
artifact and cost 78.514218 CPU seconds including cache lookup/lowering.

The checker now reports the complete prepared value allowlist, including
polynomial, integral-basis data and explicit scalar metadata. Inherited fixture
workspace capacities are labeled as such. The packed probe calls its assertions
checker replay, not CPython replay: its adjacent receipt can come from any
qualified checker backend. Cross-backend output comparisons are separate.
