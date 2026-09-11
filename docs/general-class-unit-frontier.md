# General class-and-unit frontier: campaign record

## Scope and current status

The user adopted M0–M2 of `agents/general-class-unit-competitive-plan.md`
(plan revision `09e9d3532`, PR #215). This campaign starts from main
`d654e3d45d8c066b979566338a53647a37ab8d00`. It authorizes baseline/context
work and **at most two optimization campaigns**, not the plan's twelve-campaign
release program. The executable selection/budget settings live in
[`campaign.json`](../bench/class-unit-groups/general-frontier/campaign.json).

Status: M0 audit and laboratory construction. No corpus is frozen, no new
competitive result is claimed, and neither optimization slot has been used.
PR #212 remains separately draft and explicitly deferred; its cubic filter is
not part of this baseline. Existing experimental cubic timings are not general
class-and-unit qualification evidence.

## Measurement boundary

The headline request starts with polynomial coefficients in a persistent
process and fresh field state. It includes maximal order, complete class and
factored unit groups, the requested maps, and regulator work. Precompilation
is separate. Repeat retrieval from an already computed context is not a fresh
computation. Scalar class-number timing is a separate request, never a
substitute for complete class-and-unit timing.

Existing runners are useful source material, not automatically accepted
adapters: `high_degree_hecke_oracle.jl` times class/unit discovery after order
construction and stops before regulator materialization. The older cubic
runner's declared output is class invariants, unit summary and regulator;
that does not establish the richer map/witness contract here. Regulator
approximations and rigorous enclosures must remain distinguished.

Corpus selection must retain records with unknown class numbers. Existing
legacy LMFDB validators and quartic selectors are not suitable unchanged.
Reference-cost discovery precedes final selection: freezing 1,800 easy fields
first and later quietly replacing them to meet the seconds-scale quotas is
not an acceptable protocol.

## Initial host inventory (2026-09-11)

Read-only inspection of `opt` found Linux x86-64, four AMD EPYC 7B13 virtual
cores, Node v26.7.0, system GP 2.15.4, and a Julia 1.12.7 installation. The
Hecke source checkout reports `66af28e52682620edb302931fce3f9ac87fc4eb7`.
These are inventory observations, not yet authenticated runtime/version
receipts. The timing lock was available when checked; every timing run must
acquire it again. Builds, downloads, and profiles run elsewhere.

## Acceptance remains unchanged

The bridge requires at least 60 predeclared fields across totally real cubics
and mixed-signature quartics, including 20 unseen development-reserve
neighbors and 20 fields costing more than one second in the faster matched
reference. Complete results, detached replay, maps, fundamental units,
regulator enclosures, rank-three controls and cubic regression evidence are
required. A geometric-mean slowdown of at most 10× is a target, not a current
claim. Missing capabilities or exhausted budgets trigger reassessment rather
than reduced acceptance criteria.

## Source audit at the baseline revision

This is a source/test inventory, not a timing result. Paths below are under
`src/lib/sagejs/number_fields/`.

| Responsibility | Existing implementation | Qualification still needed |
| --- | --- | --- |
| Shared state | `class_unit_groups.py` authenticated result reuse and proof upgrades; `class_unit_context.py` checkpoint loading/publication | Richer-request sequences across the new panel |
| Order/ideals | `maximal_order_engine.py`; packed ideal products, power chains and batched valuations in `ideal_arithmetic.py` | Phase costs and complete resident integration; packed primitives already exist |
| Relations | LLL search and reduction in `class_group_relations.py`; partial-relation merging and unit-log-rank steering in the engine | Completion/scaling beyond existing examples |
| Presentation | Sparse input, modular screening, deferred updates and exact witness transforms in `class_group_matrix.py` | Dense HNF/SNF transforms remain a possible scaling limit |
| Units | `factored_elements.py`; dependency/log caches and higher-rank recovery in the engine | Dependency selection and hidden expansion costs |
| Certification | Rigorous weighted regulators, precision escalation, exact root/saturation and analytic index bounds in `class_unit_analytic.py` | Bridge coverage, resource behavior and detached evidence |
| Class maps | `class_group_maps.py` witnesses, coordinates and detached replay | Live cross-degree map probes, not only invariant agreement |
| Unit maps | `UnitGroupComputation` has generators and completion replay | **Public unit-coordinate maps are missing**; archimedean logs are not coordinates |

Source-confirmed mechanisms to investigate include rank-sized subset selection
(a 50,000-subset cap), bounded prime-root searches, dense exact transforms,
and some expansion of factored saturation targets. At that initial audit stage,
none had yet been identified as the dominant measured bottleneck. Floating log-rank steering is not the
rigorous certification step and must not be described as one.

Existing tests include rank-two real-cubic recovery, slow-gated mixed-quartic
completion, regulator interval checks, and checkpoint/replay mutation tests.
The rank-three quartic in the offline oracle fixture is expected data, not
evidence that the current Sage.js public request completes on that field.

### Initial diagnostics and reference acquisition

Subsequent local instrumented probes returned engine completion for
$x^3-x^2-2x+1$, $x^4-x-1$, and $x^4-x^3-3x^2+x+1$, covering ranks two and
three. Explicit-source-launcher context times were about 2.50, 2.08 and
2.97 seconds. These exclude import and later projection/serialization work,
do not exercise unit-coordinate maps or detached replay, and are **not
controlled performance evidence**. The build/source binding is still marked
unauthenticated in the diagnostic receipts. Earlier ordinary-launcher probes
are retained separately because that launcher can select an installed binary.

On `opt`, six deterministic rank-two/rank-three reference pilots with
discriminants near $10^{12}$ completed compact PARI screening in roughly
0.02–0.04 seconds of process wall time each. This is a cost-discovery signal,
not a microbenchmark claim: single tiny samples do not meet the required
batch/sample protocol, and their regulator outputs are approximations.
The screen ran with CPU affinity `{2}`, an enforced 4 GiB cgroup memory cap,
zero swap, and the exclusive timing lock. A durable M0 ledger reserves work
before launch and charges failed attempts too. A conservative initial
600-second allowance covers local reference diagnostics before that ledger.

The first two candidate bands produced 2,086 distinct degree-3–10 candidates,
not a qualified corpus. A source audit proved a v1 sampling ceiling of only
160 quadratics: all available quadratic discriminants are below $10^{12}$,
there are no missing-class-number quadratic records, and only four windows
contribute. Candidate-policy v2 therefore selects 64 rather than 40 records
per 128-row window, giving capacity for 256 quadratics. This is an explicit
acquisition-policy revision before optimization, not a reduction of the
200-per-degree target. V1 exports remain immutable; v2 uses a new directory.

Current focused tooling checks: 18 candidate-export tests, five screening
contract tests, five diagnostic/PARI/selection tests, and 160 Hecke worker/transport checks pass.
The shared Python strict check passed on 382 modules. These checks validate
tooling and existing smoke behavior, not the M0/M1/M2 exit criteria.

The v2 candidate pool now contains 3,913 records, with at least 200 in every
degree. A deterministic 134-request PARI cost screen spans all 34 signatures.
All requests produced complete screening records, but only one exceeded one
second: the real cubic `3.3.19627909893848232377256843521369709.1`, at about
16.3 seconds. These are single PARI-only cost probes, not the faster-of-two
reference classification or final performance samples. Consequently the
seconds-scale selection quotas remain unmet; the corpus is still **unfrozen**.

Larger pilot receipts originally marked PARI stack-growth warnings as errors.
The validator now allows only the exact stack-growth warning form, rejects
other diagnostics and malformed terminal payloads, and retains all stderr.
`summarize-screen.py` records explicit reclassification and original receipt
hashes without changing the raw evidence. This is tooling correction, not
mathematical verification of the outputs.

Read-only database probes found a mixed-quartic maximum absolute discriminant
of `34060633877926656000`, and only one real cubic above $10^{24}$. Separately
declared polynomial families are therefore needed to explore the missing
large rank-two range. Their irreducibility/signature proofs do not establish
pairwise nonisomorphism; distinctness reconciliation remains a freeze gate.

Effort checkpoint, 2026-09-11 07:40 UTC: conservatively charge **three aggregate
active agent-hours to M0**, including parallel audit/tooling contributions.
This is an accounting allowance, not elapsed benchmark CPU time. M0 retains
its 40-hour ceiling; M1 and both optimization campaigns are unstarted. The
separate durable reference ledger charges single-core screening wall time,
including failed attempts and reservation bookkeeping allowances.

The existing 201-file unit suite and documentation/build check passed during
integration. The build took 11 minutes and is not benchmark work. These
developer tools have not changed the mathematical engine or its safety caps.

## First measured cross-degree bottleneck (diagnostic, not optimization)

The general engine timed out at 120 seconds on both real cubic
`3.3.1179905564504915820.14` and mixed quartic
`4.2.1261504958441728000.28`. Both were still collecting relations, before
unit recovery. Shorter reruns with diagnostic wrappers gave these inclusive
completed-call totals at their last progress events:

| Diagnostic snapshot | Real cubic | Mixed quartic |
| --- | --- | --- |
| Engine elapsed | 55.0 s | 55.1 s |
| One-large-prime partial handling | 43.6 s | 45.6 s |
| Full ideal factorization within it | 39.7 s | 43.4 s |
| Prime-ideal valuations | 26.3 s | 13.7 s |
| Rational-prime splitting | 10.7 s | 28.9 s |
| Minkowski/LLL candidate generation | 0.50 s | 0.16 s |

These are nested, instrumented local timings; **do not sum the rows** or use
them as competitive ratios. They identify work to investigate: the existing
partial path fully factors a quotient ideal before rejecting unsuitable
outside primes. The current `rank` event field describes the last exact
presentation, not the modular rank including pending rows; the apparent
unchanged rank is not evidence of a broken exact-refresh policy.

A sound prospective filter has a short conditional argument. For integral
nonzero $J$, let $S$ be the rational primes below factor-base ideals and strip
all their powers from $N=\operatorname{Norm}(J)$, leaving $R$. If $J$ has just
one outside prime $Q$ with exponent one and norm at most $L$, then either
$R=1$ (the prime below $Q$ is in $S$), or $R=\operatorname{Norm}(Q)\le L$.
Thus $R>L$ safely rejects that existing one-large-prime opportunity before
full factorization. Passing the test proves nothing about admissibility;
the exact ideal checks remain necessary. Do not reject $R=1$, strip each
prime only once, or confuse prime-ideal norm with its rational prime.
An integral scalar norm does not itself prove that an ideal is integral.

This filter is **not implemented**. Corpus freeze and campaign selection still
precede optimization. The profile establishes a shared target, not that this
particular filter alone will meet the bridge goal.

Hecke 0.40.0 on `opt` completed six pilot requests, with class numbers and
invariants matching PARI. Cold-process times include JIT and are not qualified
persistent-process comparisons; internal round trips are not detached replay.
The larger PARI supplement exposed its default 8 MB worker-stack overflow.
Subsequent configuration explicitly pins `nbthreads=1` and allows worker-stack
growth within the unchanged 4 GiB cgroup cap. Earlier attempts remain retained
with their original configuration/failures; do not pool them as one baseline.

The first 28 supplemental requests completed with 17 successful screening
records, ten 60-second timeouts, and one worker-stack error. Nine completed
PARI requests exceeded one second and three exceeded ten seconds. Generated
polynomial identity is not field distinctness, and these costs are not yet
matched against persistent Hecke. The subsequent 21-request high-discriminant
LMFDB screen uses the explicitly single-threaded configuration above.

Reference-only expansion policy `general-frontier-reference-cost-expansion-v1`
selects twelve previously unscreened candidates per signature/discriminant
cell where an earlier PARI request took at least one second or timed out.
Selection uses seeded hashes, preserves censored strata, and records the pool
and review hashes. It has a 200-request batch ceiling and 60-second request
caps. It neither declares the chosen fields expensive for the faster reference
nor freezes the performance panel. Cells with only infrastructure errors are
not promoted as mathematical cost evidence.

The M0 ledger additionally reserves a conservative 2,000 seconds for the
fourteen local Sage.js diagnostic attempts through `profile-large-v1`, including
failed starts and timeouts. This is separate from the initial reference-only
allowance and is not a controlled timing claim. As of this adjustment, charged
discovery time was 3,706.15 seconds of the 432,000-second M0 ceiling, before the
running high-discriminant screen. Optimization campaigns remain **0 of 2**.

Reviewed build-input partition changes now exclude this developer-only
benchmark tree and five exact coordination contracts from artifact inputs.
Full workspace validation still fingerprints them; unknown paths and runtime,
compiler, native, and production-manifest inputs remain conservative. Fourteen
focused partition tests pass after integration. Old build receipts are not
relabeled or migrated: a fresh local build is required before baseline staging.

## M1 design obligation: compact unit maps

The shared engine already owns the expensive arithmetic and publication state;
the public unit-coordinate interface is a separate missing capability. Reuse
the existing context rather than launch another class/unit computation. Before
implementation, settle the Sage-facing convention: coordinates include the
torsion component, whereas the current computation object's generator list is
free-only. Any compact-by-default difference from Sage's expanded `exp` needs
an explicit name or documented, tested contract.

For an authenticated complete fundamental system, a proposed logarithm map
first proves the input is a unit. Solve the rank-dimensional logarithmic system
using rigorous intervals, increasing precision until every coefficient is
uniquely determined as an integer. Completeness and membership justify that
integer solution; being numerically close to integers does not. The remaining
factor is then known to be torsion. In fields with a real embedding its sign
distinguishes the two possibilities. For totally complex controls, reduction
at a suitable prime can distinguish all torsion images, provided every factor
and denominator is invertible and those images are proved distinct.

Do not expand huge factored elements to verify this interface. Constructed
coordinates may carry context-bound evidence. Arbitrary factored inputs still
need exact membership evidence, for example cancellation of their signed
prime-valuation ledgers; a scalar norm of one is insufficient. Syntactic equality
of factored products is not equality of field elements. Neither a caller's
`complete` flag nor an unkeyed mutable payload is proof authority.

Required controls include rank zero, rank three, complex fields with torsion
beyond $\{\pm1\}$, wrong fields/dimensions, counterfeit basis evidence,
nonintegral norm-one elements, cancellation between nonunit factors, and large
exponents without expansion. Detached replay must bind the basis-completeness
argument, membership evidence, log enclosures, and torsion determination under
its own resource limits. This section is an implementation obligation, not a
claim that these maps or their replay verifier already exist.

## Persistent references and relocated baseline

The controlled six-field persistent pilots completed in both engines, with
matching exact summary values for class number, canonical class invariants,
field discriminant, signature and torsion order. PARI worker times were 8–12 ms;
Hecke worker times were about 33–539 ms. These single samples are **not** the
required batched/repeated competitive measurements. Three Hecke samples still
reported residual JIT. Julia's outer compile-time diagnostic may include
dispatch compilation before the worker's internal timer starts; never subtract
it mechanically from the reported worker time. Compact identities and basis
completeness have not been independently replayed by these comparisons.

The fresh local build passed in 8m44s, reusing all 41 production kernel families.
Strict baselib validation passed on 382 modules. `architecture:check` passed its
FFI/package/native/Wasm stages but failed at an unchanged `cowasm` mention in
`agents/python-compiler-runtime-value-and-performance-plan.md:124`; this failure
is retained, not reported as a passing full architecture check.

A standalone baseline, including independent root/submodule Git metadata,
dependencies and shipped artifacts, passed unchanged-receipt verification on
`opt`. Its full transfer inventory has 24,436 entries and 991,267,539 bytes;
receipt SHA-256 is
`d10d3776499fb032b1836cf9263615a0cbd1cec1cf1c588bc573b5dcbb62ab9f`.
This authenticates build/transfer correspondence, **not equal first-use preparation**.
An initial local relocated smoke timed out while compiling lazy Python modules:
the working tree had warm absolute-path-keyed caches that the normal build does
not ship. The second staged attempt advanced as that cache accumulated.

The correction uses the existing portable lazy-module precompiler in a separate
stage, with `SAGEJS_USE_SOURCE=1`, without changing mathematical source. Preserve
the original receipt, bind supplemental templates and compiler hashes in a new
transfer inventory, and test with an empty `XDG_CACHE_HOME`. Portable JavaScript
templates still do not prove that V8/JIT work is absent. The failed first-stage
receipts remain part of the preparation record.

The four additional local diagnostics (30 s relocated, 10 s native-required,
10 s rebuilt-root, 30 s portable-stage caps) require a further conservative 150-second ledger charge
after the in-flight reference batch releases its pending reservation. Do not
edit the coordinator's live ledger underneath a running batch.

The portable stage completed: 422 lazy modules, eight dynamic programs and 44
multiprocessing modules were prepared in 298 seconds (compilation, not benchmark
CPU). All lazy resource hashes and the task compiler hash were checked. A fresh
empty-cache real-cubic diagnostic completed in 2.556 seconds inside the context
request, 3.681 seconds process-to-result. This is a preparation smoke, not a warm
competitive measurement. The supplemental inventory has 24,868 entries and
1,159,849,217 bytes. A post-seal Git index refresh changed exactly seven index
files; preserve the failed original manifest and explicitly reseal after review.
Verification now disables optional Git locks to avoid refreshing those indexes.

The 78-field PARI expansion finished with 69 completions and nine 60-second
timeouts. Sixty completed requests exceeded one second and ten exceeded ten
seconds. All 78 raw receipts normalize with no missing requests. These are
single-sample discovery costs; matched Hecke costs are still required before
claiming membership in faster-reference timing strata. The coordinator ledger
stood at 5,293.054 conservatively charged seconds with no pending reservation.

Persistent review now binds request IDs, 100/200-bit precision, whole-batch
iteration counts and individual sample ordinals. Missing planned samples remain
explicit, and batch duration is never silently presented as per-iteration time.
The mathematical engine remains unchanged; no optimization campaign is consumed.

Follow-up verification passed on `opt` against the explicitly resealed portable
stage. The original mismatching manifest remains retained. Matched Hecke
screening of the same 78 fields is now in progress. The ledger was raised to
5,543.054 seconds by an explicit 250-second local-check allowance (150 for stage
diagnostics, 100 for reference precision/batch smoke checks), before launching
that batch under the exclusive lock.

Independent review required the normalizer to bind receipt provenance to its
run, include the imported terminal-validator hash, reject mixed legacy/explicit
request identities, and retain interrupted samples as missing with their pending
reservations. These checks prevent foreign receipts or partial batches from
quietly filling planned sample slots; they do not constitute mathematical replay.

Effort checkpoint, 2026-09-11 08:57 UTC: conservatively charge **six aggregate
active agent-hours to M0** so far. M1 and both optimization campaigns remain
unstarted; the 40-hour M0 ceiling and frozen-population requirements are unchanged.

The unchanged reference-cost selection rule, now accepting explicitly identified
single-field 200-bit persistent PARI reviews, selected a further 72 unscreened
fields from ten promising cells. Their maximum request-only wall allowance is
4,320 seconds per engine at the 60-second discovery cap. This is a declared next
discovery batch, not an executed result or frozen panel. Selection still excludes
all previously screened labels and never consults Sage.js outcomes.

The integrated exposure reconciliation reproduces 39 conservative exclusions
from 4,436 candidates after including the five actual Sage.js diagnostic
presentations. It leaves 4,397 candidates, with per-degree counts
245, 249, 300, 384, 455, 281, 772, 751 and 960. Reference-only pilots are not
reclassified as Sage.js exposure. Sixteen pinned oracle metadata joins resolve
the otherwise missing historical bucket information; zero unresolved metadata
records remain in this input set. Equal-discriminant candidates are not merged
or asserted isomorphic, and unquarantined candidates still have null eligibility
pending the final source-coverage and split-policy review.

The matched discovery join revalidates both raw run directories, checks host,
affinity, memory, threads, fixed seed, precision and exact summary invariants,
and binds its own source hash. Missing samples on both sides remain explicit.
All six persistent pilot pairs pass those checks. This does not establish
independent witness replay or equivalence of the regulator guarantees.

### Retained-source coverage follow-up

Independent read-only checks discharged the five omitted Buchmann–Lenstra,
factor-base, relation, quadratic-narrow and quadratic-composition fixtures:
their field presentations are already inventoried, explicitly outside the
current pool's discriminant ranges, or an exact variable-sign presentation of
an inventoried field. The huge quadratic-form arithmetic test is not evidence
of a maximal-order field computation; its order discriminant must not be used
as a lower bound on a field discriminant.

The retained `complex-cubic-f344` candidate/predecessor censuses (1,000 labels
each), 400-field holdout corpus and 20-label holdout census are subsets of the
historical 3,259-label quarantine. The alternate scratch survey is byte-identical
to the inventoried 1,012-record survey. These are explicit subset checks, not
inferences from directory names.

One remaining fixed scratch polynomial is $f=x^3-1009$. It is irreducible over
$\mathbb Q$: a rational root would be an integer, but $10^3<1009<11^3$.
Its polynomial discriminant is $-27\cdot1009^2=-27488187$. Since
$\operatorname{disc}(\mathbb Z[\alpha])=[\mathcal O_K:\mathbb Z[\alpha]]^2D_K$,
we have $|D_K|\le27488187<10^{12}$, outside this pool's cubic range. This
discharges the presentation without computing its maximal order or class group.

A bounded review of constructor-bearing test/benchmark sources remains in
progress. Generic environment-variable input overrides do not establish actual
past input choices; retained invocation bindings and the scope of the coverage
claim must be explicit before approving eligibility. The audit does not claim
to reconstruct arbitrary deleted experiments.

### First expensive matched discovery batch

Both 78-field runs finished: PARI completed 69 and timed out on nine; Hecke
completed 71 and timed out on seven. The join retains all 78 fields, with 63
paired successes and 15 censored pairs. All 63 paired exact summaries agree.
The observed faster worker exceeds one second on 54 fields and ten seconds
on only five. There is no exact-summary disagreement, but no detached replay
has been performed and regulator guarantees still differ.

The small ten-second count matters: PARI-only expensive counts overstated how
many cases satisfy the faster-reference stratum. The next predeclared 72-field
PARI batch is running; additional acquisition must target genuinely harder
reference strata if repeated sampling of the current windows remains inadequate.
The required 120 one-second and 40 ten-second panel counts are not lowered.

Budget reconciliation pending the current lock release: retained acquisition
receipts contain 68 v1 and 112 v2 database-window attempts. Charge their full
30-second client ceilings (5,400 seconds), plus a conservative 600-second
allowance for bounded source metadata probes, as an explicit additional
6,000-second discovery allowance. This is a conservative operational proxy,
not a measurement of CPU consumed by the shared database server. It is separate
from the earlier local-reference allowances; do not mutate the live timing
ledger while its coordinator owns a pending reservation.

The next explicit cap-extension batch contains eight PARI and five Hecke
requests: each timed out at 60 seconds while the other engine completed in
at least ten worker seconds. Retry only that timed-out side at the already
authorized 600-second coverage cap, still with 4 GiB and one CPU. The fixed
selector admits at most 32 requests, rejects implicit repeated-sample selection,
and never selects from Sage.js results. This 13-request batch reserves at most
7,800 request-wall seconds plus startup/warmups. Original censored results remain
immutable; a successful retry is additional evidence, not an erased failure.

The source audit has also identified five additional small quadratic candidates
requiring quarantine, including an indirect number-field order computation that
a constructor-only scan would miss. Their pinned-source supplement is being
implemented; the earlier 39-exclusion result must not be treated as final
eligibility approval. The hard-window acquisition work separately targets eight
explicit higher-discriminant windows, not silent changes to the v2 exports.

The 72-field PARI expansion completed with 62 successes and ten timeouts;
eight successful worker requests exceeded ten seconds. These are not yet
matched counts. Persistent Hecke screening of the 28-field rank-two supplement
is next, prioritizing the bridge rather than only higher-degree expensive cases.
After lock release, the explicit 6,000-second acquisition allowance was applied
once: the ledger stood at 14,825.670 of 432,000 seconds before that Hecke run.
The checked-in adjustment helper refuses pending reservations and duplicate
charges.

Independent review found and repaired two fail-closed gaps in cap-rescue
admission: equal but invalid measurement controls are no longer accepted, and
both source runs must explicitly declare one sample. Every actual selected
receipt already satisfied the required controls. The revised selector requires
conditional GRH, the persistent fresh-field boundary, 4 GiB, zero swap,
CPU affinity two, and matching hosts independently of completion status.

The finite source-coverage supplement is integrated and its exact
Sylvester–Hadamard bounds independently reviewed. It adds five conservative
quadratic quarantines, giving 44 exclusions and 4,392 remaining candidates.
Remaining TEST-family dispositions and preservation of the original source
inventory are still under review; this is not a holdout-eligibility approval.

The discovery-readiness projection now revalidates raw paired runs and applies
the performance panel's forty-per-degree ceiling before reporting necessary
cost-stratum shortfalls. The first six plus 78 pairs still leave at least 66
one-second and 35 ten-second slots unfilled. Repeated attempts require explicit
reconciliation; generated-family identities are not silently counted as
distinct fields. Passing these cost counts alone will not establish corpus
eligibility or the development/holdout split.

### M1 implementation boundary prepared during reference screening

A focused read-only review confirms that unit coordinates should reuse the
terminal context rather than start another discovery or saturation engine.
The proposed `UnitGroupComputation.coordinate_map()` returns a map whose
`gens()` includes torsion first, `log(u)` returns torsion/free integer
coordinates, `factored_exp(coords)` reconstructs compactly, and `exp(coords)`
explicitly expands. This avoids changing the computation's existing free-only
generator convention by accident. This API is a proposal, not implemented.

Authentication must bind field, maximal order, ordered basis, torsion,
completion evidence and proof status through the existing terminal semantic
snapshot (`class_unit_context._terminal_source_matches`). The current
`UnitGroupComputation.verify_completion()` alone is not that authority: it can
call duck-typed evidence and expand generators. Detached map evidence needs
recognized completion replay under verifier-owned limits, not a caller hook.

For arbitrary input, establish unit membership through its principal ideal,
then use rigorous weighted logs and an invertible minor to isolate the unique
integer free coordinates. Authenticated completeness supplies the integrality
premise; precision alone does not. Existing factored-log workspaces and ball
determinants provide the initial small-rank implementation. The residual is
torsion: factorwise real signs suffice when a real embedding exists; otherwise
use bounded reduction with invertible factors/denominators and distinct images
of all certified torsion elements. Neither norm one nor syntactic product
equality proves the needed identity.

Even compact `norm()` or `principal_ideal()` can produce huge integers or ideal
powers. Bounded arbitrary-input membership and detached replay are therefore
real implementation obligations, not assumed cheap helper calls. Exhaustion
must be an explicit incomplete operation, never a false nonunit answer. Tests
must include rank zero/torsion four and six, ranks two and three, huge signed
exponents, cancellation between nonunit factors, nonintegral norm-one inputs,
mutated completion evidence, wrong fields, and precision exhaustion.

Effort checkpoint, 2026-09-11 10:03 UTC: conservatively account for **ten
aggregate active M0 engineering hours** of the forty-hour allowance. No M1
mathematical implementation or optimization campaign has started.

### Bounded harder-window acquisition

The eight predeclared windows produced seven successful responses and one empty
response, selecting 56 records. No retry or altered window followed the empty
result. The plan pinned all seven previous/current screening input files,
excluding 346 distinct labels before seeded selection. The output has its own
`hard-window-v1` identity; it is not a relabeled v2 cell export. Its canonical
pool digest is `11e48acffc39a9fc2c2020620174625b08eaff7e2aaf560d44344f6d0cbbd970`.
Matched reference costs and exposure reconciliation remain pending.

Charge a further conservative **300 seconds** at the next timing-lock release:
eight 30-second query ceilings plus 60 seconds of local bookkeeping. The
one-shot allowance is implemented but not yet applied while the Hecke supplement
owns the ledger. It is separate from the earlier 6,000-second allowance.

Readiness reporting now requires an actual validated source-pool binding for
each counted label, exact coefficients, discriminant and signature; a numeric
label shape alone does not establish field identity. The earlier report's
54/5 counts are unchanged after this repair. Its shortfalls describe the
currently confirmed successful subset only: censored costs are unknown and
predeclared cap retries may close gaps without acquiring new fields.

The reviewed offline source union reconstructed 4,492 distinct labels with no
cross-export duplicates. It replays both acquisitions, checks the stored v2
projection and raw hard-window receipts, and retains explicit provenance for
each source kind. Canonical union digest:
`89da73c2eb521bff0335e73aae65d679f5c99aede765e820675f057c530e7efc`.
Union-aware exposure reconciliation remains in progress; old v2 eligibility
cannot simply be copied onto these new records.

The persistent Hecke rank-two supplement finished with 13 successes and 15
60-second timeouts. Ten successful workers exceeded one second. The corresponding
persistent PARI run is in progress; the earlier differently configured
fresh-process screen is not substituted for it. After the Hecke run, the
300-second hard-window allowance was applied exactly once, bringing the ledger
to 16,615.771 seconds before the new PARI run.

Broad validation at `d4b954c4a` passed `pnpm test:changed --base d654e3d45`:
merge invariants, an 8m23s full build, all 201 unit-test files, and documentation
checks. All 41 production kernel families were reused, none rebuilt. The later
source-union companion has its own seven focused tests and independent review;
these developer-tool results do not constitute mathematical or performance
qualification of the still-unmodified shared engine.
