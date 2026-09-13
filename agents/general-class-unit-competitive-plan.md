# A bounded campaign for competitive general class and unit groups

## Objective and authority

Build a Sage.js implementation a researcher can reasonably choose instead of
PARI or Hecke for ordinary class groups, units, regulators, and associated
maps of absolute number fields. Ordinary Python remains the mathematical
source; source-transparent native compilation supplies speed. This is not a
plan to embed either competing system.

The implementation must be degree-generic. The first competitive qualification
envelope is degrees 2 through 10, all signatures, with substantial seconds- and
minutes-scale examples as well as small fields. Higher degrees remain usable
where resources permit, but this campaign does not promise competitiveness for
arbitrary degree, discriminant, or input height.

This document proposes the next execution plan; writing or merging it does not
launch the campaign. Once adopted, it supersedes the small-cubics-first
sequencing and historical performance targets in
[the earlier strategy](competitive-class-and-unit-groups-strategy.md).
[The mathematical work-package plan](number-field-class-and-unit-groups-plan.md)
remains background, subject to a fresh implementation audit. Neither old plan
is a current completion report. `ARCHITECTURE.md`, contributor instructions,
and release requirements remain authoritative.

The campaign has a finite budget: twelve optimization campaigns, at most three
candidate approaches per campaign, and four integrated qualification points.
Each campaign gets at most five active implementation days before a mandatory
written review, excluding queued benchmark/CI time. These are effort ceilings,
not forecasts of completion. Exhausting them requires a new scope decision;
it does not make unmet acceptance criteria pass.
An active engineering day means eight agent-hours of investigation,
implementation, or review, summed across contributors rather than multiplied
by fleet size; queued execution is accounted for by the CPU-hour budgets.

M0 and M1 each get at most five active engineering days for audit, tooling, and
consolidation. M5 gets five for qualification fixes and the formalization pilot,
plus its explicit execution budget below. Work exceeding these allowances
needs a revised plan; foundational repairs do not become an unbounded side
project hidden outside the twelve optimization campaigns.

## Starting point: evidence, not extrapolation

Planning baseline: main `d654e3d45`, with the separately qualified changes below
not assumed merged. Reconcile against the actual main SHA at campaign start.

- General orchestration already exists in
  `src/lib/sagejs/number_fields/class_unit_groups.py`, together with factor-base,
  relation, presentation, factored-unit, analytic, and proof components. Audit
  and accelerate these; do not reflexively build a second general engine.
- The closed complex-cubic route has demonstrated that compiled Python and a
  resident exact arena can perform serious class-group work efficiently.
  Complex cubics nevertheless have degree three and unit rank one: this is not
  evidence of competitive higher-rank unit computation or large sparse algebra.
- [PR #212](https://github.com/sagemathinc/sagejs/pull/212), commit `de3905c4c`,
  isolates exact residue-map linear-fiber filtering on main. Its focused
  CPython/JavaScript/GMP/FLINT controls and four public cubic regression groups
  passed. Production timing, broader corpus, and resource review remain draft
  exit criteria. Finish that bounded qualification or record why it is deferred.
- Experimental larger-cubic closures have useful measurements, but their
  incomplete outcomes, altered scheduling, and unmerged prerequisites must
  remain visible. Do not substitute these measurements for public API results.
- No fresh degree-2–10 PARI/Hecke competitive baseline has been established by
  this planning exercise. Obtaining it is the first milestone.

## The product we are qualifying

For maximal orders in absolute fields over `QQ`, deliver one shared computation
behind class number, class-group invariants and generator ideals, ideal-class
coordinates and principality witnesses, fundamental units including torsion,
unit coordinates, and regulator enclosures. Preserve the established public
API and Sage/Python semantics; use the greenfield rule to correct accidental
internal designs rather than accumulating compatibility shims.

Required user behavior:

- Class, unit, and regulator requests reuse one authenticated context. A later
  richer request computes missing work rather than restarting discovery.
- Units and principal witnesses remain factored by default. Expansion is an
  explicit, potentially expensive request, not a hidden certification step.
- `proof=False` records the precise conditional hypotheses actually used.
  `proof=True` and the current default unconditional policy never consume
  conditional evidence as unconditional proof. Discovery heuristics may guide
  search; they may not silently justify a completed result.
- Incomplete results identify the failed stage and remaining obligation. A
  tentative presentation is not exposed as a certified group.
- Long computations support progress, cancellation, resource limits, and
  restart from validated checkpoints. Checkpoints never require trusting a
  previous process's in-memory authentication token.

Not required by this campaign: relative fields/towers, general nonmaximal-order
Picard groups, ray or general S-class/S-unit groups, class fields, or a universal
best algorithm for extreme degree/discriminant. Preserve existing narrow
quadratic behavior, but do not expand the project into general ray-class work.
Full formal verification of the compiler and number-theory stack is also not
a release prerequisite.

## The experiment that governs implementation

For each selected bottleneck:

1. Freeze a representative development family and requested mathematical
   outputs. Record current failures as well as successes.
2. Measure public Sage.js, direct PARI, and Hecke under matched requests and
   assumptions. Profile phases separately from uncontaminated timing runs.
3. Reconstruct the dominant competitor path: invariants, representations,
   stopping rules, precision policy, and actual work counts. Consult both
   implementations and primary mathematical references; imitation is optional.
4. State a general mechanism, its correctness obligation, its expected
   end-to-end benefit, and the compiler capability it needs.
5. Implement the smallest reusable change in authoritative Python. Inspect
   generated code and fix demonstrated compiler obstructions when necessary.
6. Validate independently, measure before/after, and test at least twenty
   previously unexamined neighboring fields. A shared general component must
   demonstrate transfer across two degrees or two distinct unit ranks.
7. Merge, reject, or record a bounded unresolved experiment. Publish the exact
   revision, limitations, and evidence. Then choose the next dominant mechanism.

After inspecting a held-out field, it becomes development data for subsequent
optimization; it cannot be called unseen again. Never select a public dispatch
path using a field label, known answer, or benchmark membership.
Campaign-level unseen neighbors come from a separately seeded development
reserve, not the sealed final holdout. Freeze their selection rule before
evaluating the candidate, and retain them as regressions afterward.

Prioritize absolute researcher time saved, completion coverage, and component
reuse, not the largest microbenchmark ratio. Any phase accounting for less than
5% of target time needs an explicit architectural justification for a campaign.
Missing correctness, unsafe arithmetic, and missing general functionality take
priority regardless of phase share.

## M0 — freeze a representative laboratory

Build the corpus before optimizing the general engine. Selection must depend
on mathematical properties and reference costs, not on Sage.js success.

| Corpus | Size and role |
| --- | --- |
| Coverage | 1,800 distinct fields: 200 in each degree 2–10; 120 development and 80 sealed holdout per degree. |
| Performance | 360 of those fields: 40 per degree, preserving the development/holdout split. |
| Smoke | 90 coverage fields: 10 per degree, for routine integration. |
| Stress | 90 additional fields: 10 per degree, including expensive discovery, large units, and difficult order construction. |
| Unconditional | 90 coverage fields whose complete unconditional reference requests fit the frozen proof budget. |

Keep the existing frozen cubic corpus as a separate regression set, not as
thousands of extra votes in the general performance score. Identify isomorphic
fields when separating development and holdout sets. Test alternative defining
polynomials separately as presentation robustness, not independent coverage.

Stratify by signature and unit rank $r=r_1+r_2-1$, discriminant magnitude,
equation-order index, ramification, factor-base size, class-group structure,
regulator/element height, torsion, and automorphisms. Include noncyclic and
nontrivial class groups, ranks above two, nonmonogenic orders, and index primes.
Do not filter out LMFDB records with missing class numbers. Use independent
families where the database does not populate a needed stratum.

Reference timing bands for the performance panel are below 0.1 seconds,
0.1–5 seconds, and 5–60 seconds. Require at least 120 examples taking one second
or more and at least 40 taking ten seconds or more for the faster matched
reference request. Stress discovery should include reference times of
1–10 minutes. Record empty/hard-to-fill strata explicitly; substitutions must
be decided before Sage.js optimization, not silently after a disappointing run.

Pin source exports, queries, seeds, versions, coefficients, labels, provenance,
and hashes. CI consumes offline fixtures. Holdouts remain sealed until an
integrated candidate is frozen; repeat evaluations retain all earlier failures.

Measurement protocol:

- Use a single coordinator-owned lock on `opt` for controlled timings. Build,
  compile, download, profile, and run other agents elsewhere. Do not assume
  another project has released a shared benchmark host without checking.
- Pin software versions, CPU affinity, thread counts, precision, proof policy,
  artifact hashes, input preparation, and requested outputs. PARI and Hecke
  must both be present for the final competitive claim; Magma is optional.
- Report process-cold, persistent-process fresh-field, prepared-order, and
  warm-kernel boundaries separately. The headline is a fresh complete public
  request in a persistent process with precompiled code, not a cached answer.
- Include the computation of requested maps/units even when a comparator is
  lazy. Do not compare a scalar class number against a complete class-and-unit
  object. Measure 100- and 200-bit regulator requests explicitly; disclose
  any stronger enclosure/certification work that lacks a matched comparator.
- Batch tiny fresh computations to obtain at least one second of timed work;
  use at least three independent samples for seconds-scale cases. Never time
  repeated retrieval of an already computed invariant as new computation.
- Separate order/discriminant work, splitting, relation search, linear
  algebra, units/logs, certification, public materialization, and detached
  replay. Record candidates, smoothness yield, matrix sizes, coefficient bits,
  rank/dependency progress, precision escalations, and peak memory.
- Default external caps: 600 seconds and 4 GiB per coverage/performance request;
  1,800 seconds and 16 GiB per stress request. Audit suitability before freezing
  the corpus. These do not authorize raising existing internal safety limits.
  Record timeouts, crashes, declines, and infrastructure failures distinctly.

Exit: one reproducible baseline report, a component capability matrix, and
the three largest general bottlenecks by absolute time/coverage. Limit initial
reference/corpus discovery to 120 CPU-hours, preserving censored cases. If that
budget cannot establish the panel, publish the shortfall and request a revised
selection budget rather than drifting indefinitely.

## Shared architecture: one engine, several strategies

Reconcile existing context and receipt implementations before adding types.
The general engine should own these logical components, using existing names
where their contracts are already sound:

1. **Order arithmetic:** dimension-generic exact bases, multiplication,
   embeddings, discriminant/index evidence, and local splitting data.
2. **Ideal arithmetic:** compact prime records and reduced ideal accumulators,
   with principal multipliers tracked in factored form.
3. **Relation store:** sparse exponent rows, exact witnesses, partial-relation
   data, modular scheduling state, and append/checkpoint positions.
4. **Presentation state:** exact relation lattice, compact transformation
   information, class invariants, and map construction on demand.
5. **Unit state:** torsion, factored dependencies, logarithmic lattice,
   precision history, independence, and saturation obligations.
6. **Certification state:** generator theorem, rigorous analytic bounds,
   unresolved index information, proof progress, and publication state.

These are responsibilities, not a mandate for six new wrappers or one giant
class. Public objects are constructed at output boundaries. Hot work remains
in compact native representations across calls between compiled helpers.
Re-entry at a batch boundary is allowed if state remains resident and lifetime
rules are explicit. Do not turn a closed program into an uninterruptible one.

Small quadratic/cubic strategies must feed this context or return results
under its proof contract. Keep successful specializations where useful, but
require the degree-generic path to work with specializations disabled on a
representative panel. Replace hardcoded dimensions with explicit checked
dimensions only where the underlying mathematics genuinely generalizes.

## M1 — one usable context and an auditable correctness boundary

Audit public projections and implement only missing consolidation. Establish
round trips for ideal-class and unit coordinates, exact principality witnesses,
factored serialization, cancellation/resumption, and conditional-to-
unconditional upgrades. Retain sufficient transformation information for a
later map request; do not discard expensive discovery and then reconstruct it.

Document the mathematical obligations separately:

- Correct field/maximal order and exact factor-base ideals.
- A stated theorem that the factor base generates the class group.
- Exact principal witnesses for relation rows and exact presentation algebra.
- Full-rank units, correct torsion, and rigorous logarithmic conventions.
- A completeness argument for both class relations and units.

For example, if the generating-base and exact-relation obligations hold, a
full-rank relation lattice gives an order $H$ divisible by the true class number
$h$. If $U'$ has full rank and contains all torsion, its regulator satisfies
$R'=[\mathcal O_K^\times:U']R$. Thus

$$
\frac{HR'}{hR}
=\frac{H}{h}[\mathcal O_K^\times:U']
$$

is a positive integer. A justified enclosure isolating it to one proves both
indices are one. The implementation must establish every premise and the
analytic error/tail theorem; interval arithmetic or agreement with PARI alone
does not establish those premises. An interval unable to isolate the index is
an unresolved obligation, not permission to accept.

Producer search can be heuristic while publication remains exact or explicitly
conditional. Independent replay must reconstruct evidence without producer
caches and impose verifier-owned resource bounds. Matching class invariants
does not validate class maps; independent unit generators need not match those
of another system. Compare their exact subgroup/index evidence and certified
regulators, not printed generators or midpoint strings.

Exit / integration point 1: the smoke corpus has coherent public results or
explicit diagnosed incompleteness; request-sequence and replay-mutation tests
pass. Report all remaining missing mathematical obligations, not just timings.

## M2 — make higher-rank units the first generality test

Begin with totally real cubics $(3,0)$ and mixed quartics $(2,1)$, both of unit
rank two. Add totally real quartics $(4,0)$ of rank three. Keep complex cubics
and totally complex quartics as rank-one controls. This separates increasing
degree from increasing unit rank.

Use two optimization campaigns for:

- Selecting useful relation dependencies and retaining units as products.
- Batched log embeddings, rigorous rank decisions, lattice reduction, adaptive
  precision, and justified saturation. Distinguish inadequate precision from
  genuinely missing independent units; do not answer both by blind resampling.

Use the same implementation on rank-two fields of different degrees, then on
rank three. Degree-specific shortcuts may be comparators but cannot satisfy
the shared-component exit criterion.

Exit: complete class-and-unit results, exact replay and map tests, and a
geometric-mean slowdown at most 10x against the faster matched PARI/Hecke request
on a predeclared bridge panel of at least 60 fields. At least twenty must be
unseen neighboring fields and twenty must have reference costs above one
second. Preserve any faster cubic routes; investigate regressions, not averages
alone.

## M3 — scale the common degree-2–6 engine

Spend six campaigns according to M0 profiles, with initial allocation:

- **Three relation/order campaigns:** efficient maximal-order/local splitting
  when dominant; reduced ideal products and enumeration; smoothness and
  large-prime partial relations. Reuse existing implementations when adequate.
  A partial-relation merge must cancel every extra prime exactly and preserve
  its factored principal witness. Increasing search radius alone is not an
  accepted scaling explanation.
- **Two linear-algebra campaigns:** sparse preprocessing, incremental modular
  scheduling, exact lattice updates, and compact witness transformations. Full
  modular rank is scheduling information, not a completeness certificate.
  Avoid repeated dense transforms; preserve original rows for exact replay.
- **One certification campaign:** stage exact certification, share analytic
  work, and route failure to missing relations, missing units/saturation,
  inadequate precision, or an insufficient generator theorem. Resume the
  relevant resident state rather than restarting everything.

Reallocate these six slots after evidence review if the actual bottlenecks
differ; preserve the total bound and written reason. Every retained mechanism
must improve a whole requested computation or remove a documented capability
gap, not merely move work out of the timed boundary.

Exit / integration point 2: reliable complete coverage on the development
degree-2–6 corpus, bridge goals met, and no unexplained slowdown above 30x on
the development performance panel. All slower cases have phase-level evidence.
This is a practical intermediate gate, not the final competitive claim.

## M4 — quadratics and degree-7–10 scaling

Allocate two campaigns to quadratic specialization and two to higher-degree
scaling, bringing the total to twelve.

Quadratics: measure real and imaginary families over a wide discriminant range.
Retain efficient reduced-form/continued-fraction routes, and identify their
measured crossover to a scalable relation strategy. Do not enumerate every
class merely to return a scalar. Preserve ordinary/narrow distinctions,
fundamental-unit correctness, and exact map behavior. A specialized route is
legitimate; forcing every degree into one algorithm is not a goal.

Higher degrees: start with ranks and lattice sizes that stress the shared
components. Keep multiplication, ideal reduction, dependency storage, and unit
verification dimension-generic. Add automorphism/norm-relation techniques only
when a predeclared family demonstrates their value and the required hypotheses
are established. Do not make specialized Galois families the entire test set.

Parallel relation collection is conditional work, not an automatic deliverable:
implement it only if efficient single-worker collection remains dominant.
Workers use private scratch, share immutable field data, return independently
checked batches, and merge through bounded coordinator state. Report parallel
throughput separately from single-thread competitiveness; worker count must
not invalidate proof semantics or reproducibility metadata.

Exit / integration point 3: the complete development corpus meets the final
functional contract, the stress set has stage-level outcomes, and all degree
bands have production evidence. Freeze a candidate before opening holdouts.

## M5 — exact-revision qualification and a useful research release

The following are targets, not statements about current performance.

For each matched request, define the reference as the faster valid PARI or
Hecke measurement on that host. Publish separate ratios to both. Do not
silently remove a competitor or a failed Sage.js case from the denominator.

| Required gate | Final acceptance |
| --- | --- |
| Mathematical coverage | All 1,800 coverage fields complete under their frozen conditional policy/caps; zero unexplained disagreements; detached replay passes. |
| Degree 2–6 performance | Geometric-mean slowdown at most 3x and p95 at most 10x, separately for scalar class number and complete class-and-unit requests. |
| Degree 7–10 performance | Geometric-mean slowdown at most 5x and p95 at most 15x for the same request families. |
| Hidden-tail protection | Publish every degree and timing-band breakdown; none has geometric mean above 10x, and no performance-panel request exceeds 30x. |
| Units/maps | Complete torsion/free units, verified class and unit coordinates, principality witnesses, and 100/200-bit regulator workloads; no forced huge-element expansion. |
| Unconditional mode | All 90 frozen proof cases complete and independently replay; median slowdown at most 10x against the faster matched unconditional reference. |
| Stress | At least 80% of the fixed 90 fields complete within stress caps; every remaining case has a reproducible stage diagnosis. No timeout may masquerade as completion. |
| Memory | Stay within frozen absolute caps; report phase peaks and any use above 3x the faster reference's peak rather than hiding it in aggregate totals. |
| Cold use | For a predeclared 20-field small panel, installed precompiled process-to-answer latency at most 1 second; report startup and mathematical work separately. |
| Replay | Report live validation and detached replay separately; median detached replay no slower than discovery, with every larger outlier explained. |

Compute aggregate timing scores with equal weight per degree, not per available
database row. Publish ratios both for all completed matched cases and the
frozen population; an incomplete case fails its completion gate, never receives
a favorable imputed time. Report confidence/noise and rerun apparent regressions
above 5% on unaffected families before accepting them.

Full native correctness qualification uses Linux x64/arm64, macOS arm64, and
Windows x64 at the exact candidate SHA. Performance claims are host-specific;
do not imply that x64 ratios establish ARM or Windows speed. Exercise the full
smoke set on each target, plus every changed kernel and known boundary case.
Browser/Wasm and ordinary dynamic execution must have correct results or
documented tested capability declines/fallbacks; browser parity on the full
stress range is not required in this campaign. Missing target access is a
qualification blocker, not a passed platform gate.

Complete a bounded Lean pilot: formalize one reusable presentation/index
soundness lemma used by certificate checking, with explicit hypotheses, a
statement-to-implementation mapping, pinned dependencies, and an axiom audit.
No `sorry` or unexplained custom axiom may support the claimed theorem. Do not
market the full computation as formally verified: the pilot does not prove
maximal-order arithmetic, analytic estimates, the compiler, or generated code.
Further formalization is a separately scoped project.
Limit this pilot to two of M5's active engineering days. If it does not finish,
report that gate as unmet rather than expanding into a full formalization of
algebraic number theory or weakening the theorem to claim success.

Exit / integration point 4: publish a reviewed release candidate, reproducible
corpus/results, proof-contract documentation, performance frontier, installation
and checkpoint examples, and an explicit list of remaining failures. Follow
`RELEASE.md`; this plan does not authorize bypassing release validation.

## Compiler and engineering requirements throughout

Compiler improvements are a first-class outcome, but must be workload-driven.
In particular inspect machine-sized indexing, exact temporary lifetimes,
borrowed bundles, fixed-size assignments, loops with dynamic dimensions,
compact sparse containers, and batched interval arithmetic when profiles point
there. Add small independent semantic regressions and a non-class-group witness
for reusable compiler features.

No hand-written native mathematics hidden behind a function-name dispatch.
Use mature arithmetic libraries through declared boundaries. Preserve source
provenance, ordinary Python parsing, dynamic fallback, and inspectable IR/core.
Separate compiler fixes from algorithm policy PRs whenever possible.

Every material change records source bytes, generated core/object bytes, build
time, memory/arena high-water marks, allocation counts where available, and
before/after runtime. A manifest refresh is not resource review. Keep existing
caps unless separate evidence and review justify a change. Refactor repeated
source patterns instead of growing a single degree-specific mega-function.

Correctness tests include alternate field presentations, index primes,
ramification, high coefficient growth, high-rank/large units, rank-deficient
relations, torsion, precision exhaustion, cancellation, stale checkpoints,
forged certificates, and malformed dimensions. Maintain separate exact-source,
generated-target, and independent mathematical oracles.

## Execution discipline and stopping rules

When parallel agent work is explicitly authorized, use at most four concurrent
roles: coordinator/integrator, measurement/forensics, one implementation lane,
and correctness/replay reviewer. A second nonoverlapping implementation lane
may replace an idle role. Benchmark ownership is exclusive; more agents never
means simultaneous controlled timings. Without delegation authorization, run
the same work packages sequentially.

Use narrow task contracts, short branches, and small PRs. Review shared APIs
before parallel implementation. Post milestones to Discussion #104, but keep
proofs, receipts, failed experiments, and decisions in versioned repository
artifacts. Keep unfinished PRs draft; mark a genuinely qualified PR ready so
the merge manager can consider it. Do not stack months of unqualified results.

At each campaign review record: question, hypotheses, exact input family,
profile, upstream correspondence, proof obligations, candidate approaches,
generated-code/resource evidence, held-out results, regressions, and disposition.
Stop investigating a candidate after its allocated approaches/effort; retain
the negative result and choose the next mechanism. Do not keep an agent in an
unbounded turn chasing one field.

Allocate at most 120 controlled CPU-hours to M0, 24 to each optimization
campaign, and 240 to final corpus/target qualification. These ceilings exclude
ordinary local compilation but include failed timing attempts. Track usage;
exhaustion triggers a report and a budget decision, not silent continuation or
truncated acceptance statistics. Preserve inputs, source, manifests, and proof
evidence in backed-up storage. Rebuildable binaries, Julia/Hecke installations,
browser downloads, and temporary profiles may use a project-scoped `/scratch`
directory; do not store the only copy of irreplaceable evidence there.

If the twelve-campaign budget ends before M5 passes, ship only independently
qualified changes and publish the measured frontier. State precisely which
gates remain unmet and propose a bounded follow-on. Do not shrink the frozen
corpus, loosen thresholds, or call the general goal achieved by retrospective
selection.

## First actions after adoption

1. Reconcile main, open PRs, source limits, and current receipts; finish or
   explicitly defer #212 without making all new work wait for the cubic stack.
2. Audit the existing general engine against the six shared responsibilities
   and five mathematical obligations above; classify each as implemented,
   tested, performance-qualified, or missing.
3. Establish the matched PARI/Hecke runners and freeze corpus selection and
   budgets. Produce an initial degree/signature/phase report before tuning.
4. Select the first rank-two cubic/quartic family from that report, write a
   component-level campaign contract, and begin M1/M2.

## Reference entry points

- [PARI general-number-field manual](https://pari.math.u-bordeaux.fr/dochtml/ref-stable/General_number_fields.html):
  coupled `bnf` state, factored elements, class/unit maps, and conditional versus
  unconditional interfaces. Pin the source version used for actual forensics.
- [Hecke order/ideal manual](https://docs.hecke.thofma.com/v0.28/orders/ideals/):
  class-group maps, units in factored form, and GRH options. This is a versioned
  reference, not a requirement to benchmark that historical release.
- [LMFDB number fields](https://www.lmfdb.org/NumberField/): corpus discovery,
  not the sole correctness authority or the definition of relevant difficulty.
- [Current public class/unit documentation](../docs/number-field-class-unit-groups.md)
  and [cubic proof argument](../docs/complex-cubic-native-class-group-proof.md):
  existing semantics and proof obligations to preserve or explicitly correct.

The measure of progress is a reusable capability across a mathematical family,
with exact outputs and an honest cost model. Winning one more cubic timing is
welcome; building a generally useful class-and-unit system is the objective.
