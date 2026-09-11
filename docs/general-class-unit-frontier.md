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
and some expansion of factored saturation targets. None is yet identified as
the dominant measured bottleneck. Floating log-rank steering is not the
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
