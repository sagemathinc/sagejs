# Plan: complete the PARI 2.17.4 class-and-unit path with native compiled Python

## Objective

Carry the faithful PARI 2.17.4 language experiment from its current prepared-field
class candidate through the remaining relation/retry, HNF/SNF transformation,
unit reconstruction, class-generator, and final-result stages. The result should
answer the central language question with a real computation:

> Can ordinary, readable, CPython-parseable Python, compiled by Sage.js after a
> small number of general validate-once/propagate/reuse compiler improvements,
> execute PARI's class-and-unit algorithm at competitive native speed?

This is still an **upstream-assumed language/runtime experiment**. It deliberately
inherits PARI's heuristics, undocumented bounds, floating decisions, retry limits,
and GRH-dependent factor-base policy. It does not claim a new proof of those
choices. Translation, ownership, exact arithmetic, and output correspondence must
nevertheless be correct.

Status: **plan only**. Writing this document starts no implementation campaign,
does not make an experimental PR ready for merge, and does not turn the current
candidate result into a complete class-group result.

## Exact starting point

The campaign has two authoritative inputs that must be consolidated before new
stage work begins:

1. `agent/pari-class-group-port` at `696c0bb472ec7e2aaf63ead93951f7eedcb32be7`
   contains the attributed PARI translation, source correspondence, fixtures,
   prepared cubic/quartic attempts, relation/HNF/regulator components, and the
   current end-to-end candidate driver.
2. `agent/range-increment-reproof` at
   `73c34205d` contains the compiler proof machinery that reduced the integrated
   7,081-output splitting-degree graph from the old roughly 42x gap to about
   `2.08085 ms/catalog`, versus about `2.03 ms/catalog` for PARI and a
   `1.39 ms/catalog` mechanically generated C ceiling.

Those branches diverged after `d84ad93e`; neither alone is the campaign base.
The port branch has roughly 300 unique commits and the compiler branch roughly
45. A synthetic merge shows only two textual conflicts, both generated optimizer
evidence. Do not reproduce the history by cherry-picking hundreds of commits.

The current prepared path is substantial but incomplete:

- the fixed totally real cubic reaches an accepted candidate with 73 relations,
  class number 1, and the exact PARI 192-bit regulator;
- the fixed mixed quartic exercises a resident retry and accepts 152 relations;
- initial relation collection, HNF, analytic acceptance, and many preparation
  dependencies have exact cross-backend differential evidence;
- general nonempty-`W` and rank-deficient retries, random relations, owner growth,
  precision restarts, honesty extension, fundamental units, full Smith
  transformations, generator ideals, principal data, and final BNF-like assembly
  remain unfinished;
- the implementation remains experimental under `bench/pari-class-group-port/`,
  not a production number-field module.

The pinned upstream source for all correspondence is PARI 2.17.4:

- archive SHA-256:
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

Retain PARI's copyright and GPL notices in translated files, keep a routine/block
correspondence table, and generously credit PARI and its authors.

## The boundary and the promised result

### Input boundary

The timed input is a prepared maximal-order `nfinit` state: integral basis,
embeddings, multiplication data, discriminant, signature, and the other neutral
number-field data needed by PARI are allowed.

The following are forbidden inputs:

- a chosen factor base or a successful factor-base restart;
- relation rows, logarithms, dependencies, HNF/SNF, or transformation matrices;
- a regulator, unit, class number, invariant factor, generator ideal, retry
  decision, precision schedule, or terminal status;
- any runtime intermediate, capacity, control decision, or per-stage fixture
  filled or selected from the desired answer. The already-frozen field identities
  may retain their documented answer-based mathematical strata.

Polynomial parsing, maximal-order construction, and `nfinit` preparation are not
part of the first performance boundary. Their time must be reported separately,
but closing that public polynomial-input path is a later campaign.

### Output boundary

“End-to-end” here means a replayable internal result, not just the integer class
number. A successful field returns:

- class number and normalized invariant factors;
- full Smith/HNF transformation evidence and reduced generator ideals for the
  represented class-group generators;
- an authenticated exact presentation, retained exact relation records and
  factor-base ideals, an exact principal witness for every generator order
  relation `I_i**n_i`, and the factor/reduce/combine material needed to build
  arbitrary-ideal discrete-log and principality receipts;
- torsion data;
- a fundamental-unit lattice in compact/factored form, exact reconstructed
  algebraic units where the selected PARI path materializes them, and exact
  norm/principality witnesses;
- regulator and the precision/acceptance evidence used to obtain it;
- retained relation, logarithm, factor-base, and transformation state sufficient
  for independent replay and later principal-ideal-map construction;
- an explicit assumption/status record identifying PARI 2.17.4 correspondence,
  conditional assumptions, omitted lazy materializations, and any matched PARI
  `not_given` result.

PARI's lazy `makeunits`, `makematal`, and `makecycgen` builders are a later public
materialization tier; they are not silently added to the first timed workload.
Conversely, `getfu`, `class_group_gen`, and the transformations needed by
`buchall_end` are not optional formatting and may not be skipped.

Keep two unit-result tiers distinct:

1. **Flag-zero correspondence:** reproduce `bnfinit(nf, 0)`, including a
   legitimate PARI `not_given` result for eagerly expanded fundamental units,
   and time it against exactly that PARI workload.
2. **Usable compact units:** first on a predeclared 12-field unit panel and then
   on every field counted toward outcome A or B, retain the flag-one/factored
   transformation state needed to reconstruct and verify fundamental units and
   maps without an additional eager expansion not performed by the matched
   reference. Time this tier separately. Source-required `getfu` materialization
   remains inside the timed flag-zero path whenever PARI performs it.

Flag-zero correspondence alone is not a generally usable unit API. The eventual
experimental result should adapt to the repository's existing
`UnitGroupComputation` and `ClassUnitComputation` contracts rather than create a
second incompatible public result hierarchy. The production adapter and default
dispatch remain outside this timed language experiment. Until the existing
contract's independent completion/certification requirements are actually met,
the faithful port remains an explicitly upstream-assumed internal state and must
not be mislabeled as a completed certified `ClassUnitComputation`.

In particular, a flag-zero `not_given`, PARI's floating regulator/acceptance
inequality, and agreement with PARI can never create
`UnitGroupComputation(complete=True)`. That promotion requires exact torsion
authority, rank-many exact factored free generators, a rigorous
`RegulatorEnclosure`, and replayable index-one/saturation completion evidence
such as `UnitSaturationIndexCertificate` or `ClassUnitSaturationRecord`.
`ClassUnitComputation(complete=True)` additionally requires the completed
witnessed class group. The standard public adapter likewise requires its full
conditional-GRH or unconditional proof payload: completed proof stage, exact
relation count, factor-base theorem/bound, saturation data, and replay evidence.
The upstream-assumed state cannot be passed through the standard
`_class_group_from_engine_result` adapter merely because it agrees with PARI. If
a later independent post-pass supplies those objects, report and time it
separately from the faithful `bnfinit(nf, 0)` boundary. An internal
`correspondence_complete` label must never be stored in or confused with
`ClassUnitComputation.complete`.

Publication is transactional. A failed precision increase, owner growth, or
retry cannot expose a partly updated result. Repeating a terminal call must be
idempotent.

## What remains in the PARI path

Use the pinned source rather than this summary as authority. The connected
remaining cuts are:

1. **General relation and retry closure** (`buch2.c:3887-4132`): `small_norm`,
   `rnd_rel`, mutable cache/permutation/subfactor state, repeated `hnfspec_i` and
   `hnfadd_i`, rank/unit-rank deficiencies, precision rebuilds, factor-base
   enlargement, and safe arena growth.
2. **Honesty extension** (`buch2.c:2800-2865`, called at `4134-4140`) when
   `KCZ2 > KCZ`, including automorphism orbits, test-mode Fincke-Pohst work,
   ideal reduction, random products, and source retry limits.
3. **Fundamental-unit lattice** (`buch2.c:4142-4177`):
   `extract_full_lattice`, integer and floating LLL transformations,
   `cleanarchunit`, regulator consistency, and `getfu` algebraic reconstruction.
4. **Class-relation archimedean cleanup** (`buch2.c:4178-4190`), whose failure
   can cause a precision retry.
5. **Transformation-producing class group** (`class_group_gen`,
   `buch2.c:3115-3156`): full `ZM_snfall`, `ZM_inv`, rounded HNF divisions,
   `genback`, ideal products/reduction, `nf_cxlog`, and construction of the
   `M1`, `M2`, `Ga`, `Ge`, `GD`, `ga`, and `clg2` state.
6. **Final assembly** (`buchall_end`, `buch2.c:3452-3465`, used at
   `4192-4204`): relation HNF/dependent block, unit and class logarithms,
   factor-base ideals, class group, regulator, torsion, units, and replay state.

The existing generic class/unit engine and complete complex-cubic native path
are independent mathematical/replay oracles and implementation examples. They
must not quietly replace PARI's dependency schedule, bounds, saturation policy,
or timed algorithm in a same-algorithm performance claim.

## Non-goals

This campaign does not include:

- unconditional certification of PARI's analytic or factor-base assumptions;
- a new class-group algorithm or tuning the workload to fields where the port
  already succeeds;
- polynomial-to-maximal-order preparation, general public dispatch, ray or
  S-class groups, or a finished public coordinate-map API;
- broad degree-2--10 competitiveness, Hecke optimization, or a claim that the
  selected cubic/quartic panel establishes all-degree performance;
- Windows, browser, WebAssembly, macOS, or ARM performance optimization;
- handwritten C mathematical implementations in the product. Small C controls
  are allowed only as benchmark ceilings with no product dependency.
- a parallel relation collector, another splitting-degree microcampaign absent
  a regression above 5% on its frozen gate, or a generic state/struct compiler
  project.

Keep the ordinary dynamic Python fallback correct and keep source portable even
while Linux x86-64 is the only optimized/qualified target.

## Phase 0 — build one canonical integration spine

This gate is mandatory. No later performance number is valid until it passes.

1. Create a private integration branch/worktree from
   `agent/range-increment-reproof`.
2. Merge current `origin/main`, then merge `agent/pari-class-group-port`.
3. Resolve neither generated optimizer artifact by choosing one side. Regenerate
   `architecture/optimizer-opportunities.manifest.json` and
   `docs/optimizer-opportunities.md` from the combined tree.
4. Import only the useful HNF benchmark/evidence commits `6e68e6e43` and
   `0b37c8486`; do not merge the divergent historical HNF branch.
5. Run architecture, strict-Python, changed-file, focused compiler, and complete
   native gates. Record any unrelated current-main failure precisely.
6. Reproduce, from clean builds:
   - all 7,081 active splitting outputs and nine malformed controls;
   - the about 2.08 ms integrated splitting receipt on the designated timing
     host;
   - the prepared cubic and quartic candidate/retry receipts;
   - exact CPython, JavaScript, native GMP, and tagged results required by the
     existing stage audits.
7. Freeze the combined commit, toolchain fingerprint, generated-code hashes,
   source/object sizes, build time, peak RSS, owner counts, and current output
   hashes. All implementation lanes branch from exactly this checkpoint.
8. Build and hash a private PARI 2.17.4 on every oracle/timing host. At the time
   of planning, `/usr/bin/gp` on both `opt` and `bench-1` is PARI 2.15.4 and is
   therefore forbidden for new reference receipts.

Keep existing dependency PRs and the historical port PR draft. The private spine
is manually integrated. The merge manager automatically considers non-draft
PRs, so no dependent lane becomes ready merely to merge it into another
experimental branch.

## Phase 1 — freeze observability and the comparison ladder

Before changing a stage, add a bounded untimed trace at its input and output.
The trace records exact state hashes plus the first divergent item, not giant
object dumps.

### Field ladder

Use identities already frozen in the general-frontier and port manifests; do
not acquire or cherry-pick new easy examples while tuning.

1. **Four sentinels:** the current real cubic and mixed quartic, one nontrivial
   class group, and one field that exercises retry, precision, or honesty work.
2. **Twelve additional development fields:** both rank-two degrees, nontrivial and
   noncyclic groups, index-prime behavior, large units, nonempty-`W`, rank
   deficiency, random relations, and precision escalation.
3. **Frozen 24-field panel:** 16 development fields plus eight untouched reserve
   fields. Include both target degrees, at least four PARI reference costs over
   one second, and failures/timeouts in every denominator.

The existing 1,800-field and 360-field manifests provide identities and strata,
but their discovery timings are not automatically qualified baselines. Rebuild
PARI 2.17.4 and remeasure the selected 24 before performance claims.

Before implementation, trace all 16 tuning candidates under PARI, freeze the
exact four-sentinel and 12-additional-field IDs using a documented deterministic
PARI-only rule, and publish that manifest. The frozen metadata may not contain
every source branch named above. If nonempty-`W`, random-relation, rank-deficient,
precision, or honesty coverage is missing, predeclare separate correctness-only
branch fixtures; do not add them to or replace fields in the performance
population.

### Required trace state

- relation candidates, factorization vectors, accepted rows, logarithms, RNG
  state/draw schedule, cache basis/missing count, `last/chk/end/need`, selected
  ideal schedule, permutation, and subfactor state;
- exact `W`, `dep`, `B`, transformed `C`, dimensions, determinant, rank, and
  transformations after each HNF append/cleanup;
- regulator column choices, pivots, `kR`, `lambda`, accuracy bits,
  best-approximation denominator, reconstruction HNF, precision, and status;
- honesty primes/orbits, Fincke-Pohst decisions, ideal reductions, retry counts,
  restored bounds, and RNG state;
- unit-column choices, both LLL transformations, cleaned logs, compact unit
  factors, reconstructed algebraic vectors, inverse choice, exact norm, and
  regulator comparison;
- `U W V = D`, invariant factors, `Ui`, `Ur/Y`, `Uir/X`, every `genback`
  output, `Ga/Ge`, `M1/M2`, and their defining exact/archimedean identities;
- final state fields, ownership, logical lengths, assumptions, and terminal
  publication status.

Every timed run disables tracing. Every stage has PARI 2.17.4, dynamic Python,
and compiled same-source modes; use a small same-storage C ceiling only when a
compiler/backend distinction remains ambiguous.

## Phase 2 — close relation collection and HNF-side retry corridors

Build one resident, resumable state machine around the existing collector and
HNF append path.

1. Port the exact source mutation schedule for `small_norm`, `rnd_rel`, cache
   replacement, subfactor rotation, permutations, and selected ideals.
2. Support empty and nonempty `W`, relation-rank and unit-rank deficiency,
   repeated `hnfadd_i`, random-relation fallback, collection/HNF-driven rebuild,
   factor-base enlargement, and capacity growth. Establish the transactional
   precision-owner lifecycle here, but close regulator-, `getfu`-, and
   `cleanarch`-triggered returns to the driver in Phases 4--5.
3. Allocate typed bounded metadata/residue storage and exact coefficient owners
   once per authenticated run; use logical prefixes rather than host slices.
4. Resume from retained state without refactoring/relogging accepted relations.
   On a capacity miss, return the required capacity and retry safely; never rely
   on a benchmark-known maximum.
5. Preserve PARI candidate order, floating decisions, RNG schedule, quotas, and
   first terminal branch. A common seed without the same draw schedule is not
   correspondence.
6. Prove entry guards and mutation revocation before private unchecked calls or
   fixed-width lowering become authoritative.

Gate: all four sentinels and the required branch fixtures agree with PARI in
exact relation state, decisions, RNG state, and terminal candidate. The native
path contains no Python/JS callbacks and no class-answer fixture.

## Phase 3 — retain the exact sparse/HNF/SNF envelope

Do not begin by micro-optimizing the small `HNFLLL` kernel. On the authentic
8-by-15 operand it costs about 3.4 ms and destination reuse saved only about
3--4%; the old roughly 61.7 ms HNF phase was mainly sparse cleanup, rank,
assembly, log transforms, and state propagation. Profile this envelope first.

1. Keep relation presentation, sparse cleanup, rank state, HNF appends,
   logarithm transformations, and exact owners inside one resident graph.
2. Implement/qualify full Smith form with both transformations, not merely
   invariant factors. Check `U W V = D` independently.
3. Port `ZM_inv` and rounded HNF divisions with exact coefficients and explicit
   alias/ownership contracts.
4. Preserve original principal relation witnesses; an HNF row without its
   provenance is insufficient for unit reconstruction.
5. Compare existing mature exact backends only on identical operands. A backend
   difference is not a compiler defect, and changing the algorithm invalidates
   a same-algorithm timing claim.
6. Transfer the validated resident-workflow lesson from the authentic 128-by-64
   control, where one native call and three reused buffers replaced 32 calls and
   96 buffers and improved about 6.55x.

Gate: exact matrices, transformations, dependencies, provenance, and logical
lengths agree across dynamic and compiled execution and independently replay.
The 12 development fields complete this envelope without stale aliases or
partial publication.

## Phase 4 — reconstruct units and survive precision changes

Port the retained PARI suffix rather than inventing new unit theory.

1. Implement `extract_full_lattice`, integer LLL, floating LLL,
   `cleanarchunit`, and regulator consistency with source-identical column and
   precision decisions.
2. Implement `getfu`: log normalization, exponentiation, real/complex solve,
   integer reconstruction, exact unit/inverse tests, norm-based inverse choice,
   and matched `not_given` behavior.
3. Keep units factored/compact through relation arithmetic and logarithms.
   Preserve source-required `getfu` exponentiation, solving, integer
   reconstruction, and exact unit checks inside the timed flag-zero core. For
   matched `not_given` cases and the separately timed compact flag-one tier,
   avoid only later eager expansion that the reference workload does not do;
   report any independent exact expansion/replay outside that boundary.
4. Keep exact relations and transformations resident when floating precision
   increases. Rebuild only precision-dependent owners, revoke old borrowed
   views, and reproduce PARI's return-to-driver branch.
5. Check lattice equivalence rather than textual equality when bases legitimately
   differ. Independently verify every published unit has norm `+/-1`, principal
   ideal 1, correct logarithm vector, and the expected regulator lattice.

The current generic class/unit engine, rigorous regulator enclosure, factored
element support, and complete complex-cubic replay path are independent oracles.
They may validate the result but are not substituted into the timed faithful
PARI graph.

Gate: the sentinels and 12 development fields produce the expected rank,
factored units, exact reconstructed units where required, regulator, and matched
precision/retry decisions. At least one deliberately large-unit case proves no
accidental eager expansion.

## Phase 5 — honesty, generator ideals, and final state

1. Port `be_honest` as a conditional resident branch and exercise it with a
   predeclared unequal-bound case. Equal-bound examples that legitimately skip
   it do not qualify this branch.
2. Port `class_group_gen`, including full Smith transformations, inverse and HNF
   divisions, `genback`, reduced ideal generators, ideal power/product/reduction,
   `nf_cxlog`, and the `M1/M2` and `Ga/Ge/GD/ga/clg2` state.
3. Port `cleanarch` retry behavior and final `buchall_end`-equivalent assembly.
4. Define one internal immutable result type and one replay verifier. Authority
   remains with live authenticated owners; detached replay is a cold independent
   check, not repeated work inside the timing boundary.
5. Mutate every material result component in focused negative tests: a relation,
   transformation, ideal generator, unit factor, log cell, regulator evidence,
   torsion entry, invariant factor, owner length, assumption flag, and terminal
   status must each cause replay failure.

Gate: all required output fields exist, every generator order relation replays
with an exact principal witness, units and regulator replay, final construction
is atomic/idempotent, and no PARI class/unit routine or precomputed answer
remains behind the prepared input boundary.

## Phase 6 — frozen qualification and decision

Run paired alternating measurements on one quiet Linux x86-64 host, one pinned
physical core, one thread, fixed governor/toolchain, fresh state, and no other
agents or builds. Compile and warm outside timing. Use at least seven alternating
pairs for stage diagnostics and 11 alternating ABBA/BAAB pairs for final
promotion; use enough fresh computations to exceed one second per sample. Report
median, spread, all raw paired values, peak RSS, generated-source
and object size, compilation time, owner/allocation/copy counts, precision and
retry counts, and exact work counters.

Report these boundaries separately:

1. relation/retry stage;
2. sparse/HNF/SNF/transform stage;
3. unit/regulator stage;
4. honesty/class-generator/final assembly stage;
5. complete prepared-`nfinit` kernel;
6. untimed/out-of-scope `nfinit` preparation cost for context.

The headline parity boundary materializes the standard matched PARI/Sage result
state. Extra Sage.js transformations and witnesses may remain resident and be
checked outside timing without serialization. If a claim requires serializing
extra replay evidence, instrument PARI to materialize the same evidence and time
that symmetric workload as a separate series. Never compare a stronger
serialized Sage.js request with stock PARI and call it matched.

Diagnostic leaf timers must be mutually exclusive and sum to one inclusive root
timer, with any residual reported as an explicit unattributed remainder. Do not
sum older nested/monkey-patched timers as though they were disjoint phases.

### Predeclared outcomes

- **A — campaign success:** 24/24 frozen fields return a
  PARI-correspondence-complete internal class-and-unit state with exact
  correspondence and replay; flag-zero prepared-kernel geometric-mean time over
  those 24 completed matched pairs is at most 2x PARI and p95 at most 5x. Report
  compact flag-one performance separately.
- **B — strong feasibility result:** at least 16/24, including both rank-two
  degrees and at least four fields whose PARI cost exceeds one second, reach the
  required PARI-correspondence-complete internal state; flag-zero geometric mean
  over those completed matched pairs is at most 3x and every other frozen field
  has a precise diagnosis. This supports the language strategy but is not a
  completed general port.
- **C — localized feasibility result:** at least one genuinely
  PARI-correspondence-complete internal path exists and stage controls explain
  at least 80% of the remaining gap. This is
  scientifically useful but not general parity.
- **D — inconclusive:** work remains unmatched, class/unit fixtures leak through
  the boundary, or the gap cannot be assigned to a measured stage.

Do not weaken an outcome after seeing the data. Wrong answers have zero
tolerance. Incomplete cases fail the coverage threshold and remain listed in the
frozen population. Compute timing GM/p95 only over completed matched pairs, with
no favorable imputation for failures, and always publish completion rate beside
the timing distribution.

## Compiler policy: two evidence-driven campaigns, maximum

The splitting result already establishes the reusable compiler principle:
validate ownership, shape, scalar intervals, and bounds once; clone the reachable
private call graph; propagate authority; use typed fixed views and direct private
calls/results; reuse storage; and retain the checked dynamic path for all public
or unproved cases.

Apply that machinery to the new roots before adding language features. Permit at
most two general compiler campaigns in this plan:

1. **Resident exact lifetime:** use one root exact arena/workspace for relation
   collection through incremental HNF; propagate authenticated owners, typed
   metadata/residue views, scalar ranges, logical lengths, and direct result ABI;
   coalesce interprocedural `fmpz` scratch lifetimes; and use arena-free borrowing
   helpers below the root. Gate on identical state at every frozen prefix,
   malformed/capacity/alias controls, clean ASan/UBSan/leak runs, at least 3x
   improvement over the fresh-boundary baseline, and at most 2x the matched PARI
   segment. Stop if same-work profiles show arithmetic rather than lifecycle is
   dominant.
2. **Precision-resource graph:** first compose the existing declared FLINT/Arb
   log/sqrt ball resources and existing checked Real/Complex inputs with the
   exact resident graph; add compiler ownership/precision machinery only where a
   minimal probe proves it missing. Precision escalation must safely recreate or
   update float/ball owners while retaining exact transforms. Gate on forced
   escalation in predeclared cubic and quartic cases, identical accepted
   relations/invariants/unit identities and independent regulator enclosures,
   no callback/leak/escaped owner, at least 2x improvement over the current
   multi-call port, and at most 3x the matched PARI segment.

The new checked-private graph machinery currently feeds the tagged backend; it
has no arbitrary-precision `fmpz` backend consumer. Applying the principle to
HNF/unit work is therefore a measured transfer, not an existing exact feature.
The exact analogue is a root scratch frame/resident-owner authentication pass
for the `fmpz` backend, preserving its current per-function liveness-colored
scratch and generated init/clear fallback whenever root authority is absent.
Activate it only if profiles show repeated init/clear, conversion, or boundary
cost.

The current private proof pass authenticates bounded machine scalars and packed
views; it does not automatically prove arbitrary-precision values or capacity,
matrix growth, MPFR/Arb error bounds, or mathematical termination. Current exact
vectors still have initialization/payload checks and many functions initialize
and clear their own `fmpz_t` scratch. `NativeExactArena` also forbids nested or
transitive checkpoints. Current Real/Complex ingress and resident ball resources
exist, but do not yet prove that one private graph can safely compose them with
exact relation/HNF owners and precision retries. These are the measured
frontiers, not authority to bypass checks.

Every compiler change requires a minimal reproducer, dynamic fallback,
inspectable IR/target C, mutation/rejection tests, architecture classification,
and before/after measurement on the real stage. Retain a candidate only if it
unlocks a required branch/correctness contract or improves that phase by at
least 10%. Stop micro-optimizing a phase when it is under 10% of total runtime or
within 1.25x of its same-algorithm C control.

Fixed-width lowering applies only where ranges are proved. Polynomial residues,
indices, counters, and metadata can become `uint64`/`int64`; unbounded relation,
HNF/SNF, transformation, and unit coefficients remain exact integers. Overflow
must revoke the fast path and safely retry, never wrap.

Readable Python remains an acceptance criterion. The current experimental root
has hundreds of positional buffer/scalar parameters and generates tens of
megabytes of C; that is useful scaffolding, not the intended interface. Define
one named, versioned, inspectable state-layout manifest (or one equivalent typed
internal resource) from which any retained generated signature is derived and
checked. Measure its ABI and code-size effect before adding language machinery,
and do not turn this bounded need into a general struct compiler project.

Track phase liveness as well as speed: generated C/object/text size, compile
time/RSS, live arena high-water mark, logical/physical capacities, copies,
allocations, and process RSS. The current tiny prepared cases have used roughly
1.46 GiB of runtime owners and about 61 MiB of generated C. Report two distinct
metrics: compiler-owner logical/live high-water bytes, and whole-process peak
RSS. The practical sentinel RSS target is
`max(512 MiB, 5 * matched PARI peak RSS)`, while preserving the hard 4 GiB cap;
set and report a separate owner-live-byte target after Phase 0 measures PARI's
corresponding live mathematical state. A speed result that misses either target
is a language-feasibility result, not a practical engine, unless its excess is
explicitly explained and bounded.

## Failure taxonomy

Assign every failure or performance gap to one of these before changing code:

1. translation/work divergence;
2. unsupported source branch or coverage gap;
3. RNG, floating-decision, or precision divergence;
4. compiler proof/lowering defect, demonstrated against the same graph/storage
   C ceiling;
5. arithmetic-backend gap on identical operands;
6. representation, ownership, lifetime, copy, allocation, or boundary gap;
7. changed scheduling or algorithm;
8. missing certification/output work;
9. resource, code-size, compile-time, or memory-cap failure;
10. infrastructure or measurement noise.

At most three measured optimization hypotheses may be attempted per phase before
the phase is reassessed. Preserve rejected results in a concise ledger. Never
make an input more prepared, omit an output, or reduce work to improve a ratio.

## Sixteen-agent execution topology

Sixteen available agents do not mean sixteen simultaneous writers or builds.
Use one frozen spine, narrow file claims, task receipts, and waves. Run six to
eight agents concurrently only when most are doing read-only oracle/review work;
at most four implementation lanes modify code at once, at most three heavy local
builds run at once, and exactly one coordinator owns timings.

| Role | Exclusive responsibility |
| --- | --- |
| 1. Integration lead | Spine, shared driver, manifests, merge conflicts, final assembly |
| 2. PARI correspondence | Source map, trace oracle, licensing, upstream decision audit |
| 3. Compiler integration | Import/reprove private-call-graph and fixed-view machinery |
| 4. Relation driver | Resident retry state machine and owner growth |
| 5. Relation arithmetic | `small_norm`, `rnd_rel`, cache/subfactor/RNG details |
| 6. HNF front end | Sparse cleanup, rank, append schedule, logical prefixes |
| 7. Exact transforms | Full Smith transforms, inverse, HNF divisions, provenance |
| 8. Unit lattice | Dependency selection, integer/floating LLL, `cleanarchunit` |
| 9. Unit reconstruction | `getfu`, factored units, exact solve/norm/inverse checks |
| 10. Precision/logs | Log owners, precision rebuild, regulator and `cleanarch` |
| 11. Honesty/ideals | `be_honest`, ideal reduction, `genback`, class generators |
| 12. Final result/replay | Immutable result, assumptions, atomic publication, mutation tests |
| 13. Differential oracle | Independent exact/lattice/ideal/unit replay across backends |
| 14. Benchmark/profile | Frozen panel, counters, C ceilings, paired analysis |
| 15. Adversarial review | Bounds, aliasing, overflow, stale authority, hidden fixtures |
| 16. Infrastructure/release | Reproducible toolchains, scratch, CI receipts, draft PR train |

The integration lead alone edits shared entry points, generated manifests, task
registry, and final report. Mathematical lanes expose reviewed narrow interfaces;
they do not independently reshape the driver. Oracle, benchmark, and adversarial
agents are read-only with respect to implementation unless explicitly handed a
small fix.

Use `pnpm parallel:new`, narrow path claims, `pnpm parallel:check`,
`pnpm test:changed`, and recorded `pnpm parallel:run` receipts. Lane PRs, if any,
remain draft with the private spine as base. The product merge train promotes
compiler dependencies one at a time only after their base lands and CI is green.

## Resource budget and checkpoints

Proposed campaign ceiling: **224 aggregate active-agent hours**, not 224 per
agent, divided as follows:

- Phase 0 integration/baseline: 24 hours;
- Phases 1--2 relation/log closure: 48 hours;
- Phase 3 HNF/SNF envelope: 36 hours;
- Phase 4 units/precision: 56 hours;
- Phase 5 honesty/final driver/maps: 36 hours;
- Phase 6 qualification/review/report: 24 hours.

Separate compute ceilings:

- 240 aggregate local build/validation CPU-hours;
- 48 controlled timing-host CPU-hours;
- optional 24 CPU-hours on a high-memory stress host;
- normal request cap 600 seconds and 4 GiB/no swap;
- predeclared stress-only cap 1,800 seconds and 16 GiB;
- one project-scoped `/scratch` directory capped at 100 GiB;
- at most 512 MiB of committed/archived evidence, excluding reproducible build
  products and comparator installations.

Checkpoint at aggregate active hours 24, 72, 108, 164, 200, and 224. At each
checkpoint publish exact stage coverage, output agreement, remaining source
cuts, performance attribution, resource use, and the next falsifiable hypothesis.
If Phase 0 cannot reproduce both input branches, stop. If there is no genuinely
PARI-correspondence-complete internal sentinel by hour 164, stop broadening the
panel and deliver the exact obstruction. A budget limit never authorizes weaker
outputs or hidden work.

## VM and host requirements

**No new VM is required to start.** The current Linux x86-64 project host has
enough cores/RAM for development, differential tests, sanitizer runs, generated
code inspection, and PARI oracles. Put rebuildable generated C, compiler caches,
profiles, comparator builds, and bulky corpus checkpoints under a dedicated
project directory on `/scratch`; keep source/worktrees and compact evidence in
backed-up storage.

The campaign needs exactly one quiet Linux x86-64 timing authority for final
paired measurements:

- an existing `opt` host is suitable for continuity if it is released by its
  coordinator and can provide an exclusive pinned core;
- `bench-1` is suitable if freshly fingerprinted and made exclusive, especially
  for higher-memory acceptance;
- choose one before freezing baselines and do not pool absolute timing numbers
  from different hosts.

The timing host needs PARI 2.17.4 and the exact Sage.js/Node/compiler/FLINT/GMP
stack, one isolated physical core, fixed frequency policy, no concurrent builds
or agents, and enough RAM for the normal 4 GiB cap. Compilation and profiling
remain on the project host. A separate 16-vCPU/64-GiB Linux profiling VM with
hardware performance counters is useful only if lack of `perf` blocks a concrete
diagnosis; it is optional, not a prerequisite.

No Windows, ARM, macOS, browser, Hecke, Magma, `m1`, or per-agent VM is needed
for this Linux feasibility campaign. Those become qualification work only after
a complete integrated candidate exists.

## Validation and deliverables

Each executable change runs focused differential tests plus the relevant strict
Python, formatter, architecture, compiler, changed-file, native, sanitizer, and
build gates. The final candidate also runs the frozen panel from a clean build.

Deliver:

1. the frozen integration-spine manifest and reproducible toolchain;
2. an updated PARI routine/block correspondence and dependency frontier;
3. ordinary attributed Python for every completed connected stage;
4. dynamic, JavaScript, native GMP, and tagged differential evidence as
   applicable, plus independent exact/lattice/ideal/unit replay;
5. bounded state traces and negative mutation tests;
6. same-work stage controls, end-to-end paired measurements, raw samples, and
   compiler/backend attribution;
7. a resource/code-size/build-time ledger;
8. reviewed draft PRs and a safe ordered merge train;
9. a final A/B/C/D outcome and precise list of every unsupported branch.

The final report must answer, without substituting a smaller question:

1. Does a PARI-correspondence-complete internal prepared-field class-and-unit
   computation now run without PARI behind the boundary?
2. Does it perform the same mathematical work and produce equivalent complete
   PARI internal state?
3. How close is compiled ordinary Python to PARI on the frozen panel?
4. Which remaining gap belongs to the compiler, arithmetic backend,
   representation/lifetime model, untranslated algorithm, or output contract?
5. Which compiler mechanisms generalized cleanly beyond splitting degrees, and
   what—if anything—must be added to the language?
