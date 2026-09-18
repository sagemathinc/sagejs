# PARI class-group end-to-end plan completion matrix

Audit date: 2026-09-18  
Audited commit: `d0ffd32bba0bbed4c3ea3fc4b9f7e96cd59256b0`  
Plan: `agents/pari-class-group-end-to-end-native-plan.md`

This is a strict read-only completion audit. A focused checker, transcript, or
terminal result proves only the boundary it actually exercises. In particular:

- a frozen PARI trace is not a Sage.js computation;
- a result assembled from accepted-relation or frozen-W0 owners is not a
  prepared-`nfinit` computation;
- `correspondence_complete=true` is not public Sage.js certification;
- one diagnostic timing is not a paired qualification series; and
- infrastructure that deliberately sets `executionEnabled=false` is not an
  executed qualification.

The audit result is **not complete**. Phase 0 was genuinely completed at its
frozen checkpoint, and at least two real prepared-input internal paths now
exist, but Phases 1--6 retain mandatory gates. The current formal campaign
outcome is **D (inconclusive)**, not A, B, or C.

## Evidence checked at this commit

The following lightweight current-tree checks passed during this audit:

```text
run_class_unit_qualification.cjs --check-manifest
  fields=24, executionEnabled=false, reserveOpeningEnabled=false

check_phase1_development_ladder.cjs
  default PARI traces=16/16
  observed performance coverage=nonempty-W, rank-deficiency
  closed correctness fixtures=random-relations, unequal-bound honesty all-failure
  missing correctness fixtures=precision-escalation, successful-full-honesty

check_compact_flag_one_row20_adapter.cjs
  rows=12, row20 Sage/PARI authority match=true
  eagerExpansionExecuted=false, qualifiedTiming=false,
  finalRunEnabled=false, reserveOpeningEnabled=false
```

The definitive Phase-0 evidence root is still present at
`/scratch/sagejs-runtime/pari-class-group-phase0-44807189a/`. Both required
starting commits are ancestors of the audited commit. The two requested HNF
changes are present as patch-equivalent integration commits `be1e26d94d` and
`e683e802a`; the original lane commits are intentionally not literal ancestors.

The shared worktree also contains uncommitted row-21/row-23 and row-14 timing
campaign files owned by active implementation lanes. They are not part of
audited commit `d0ffd32bb`, are not committed evidence, and are excluded from
this matrix.

## Top-level objective and boundary

| Requirement | State | Authoritative evidence | Contradiction or exact missing gate |
| --- | --- | --- | --- |
| Ordinary, attributed, CPython-parseable translated Python executes the connected PARI class-and-unit algorithm. | **Partial** | The translated modules and the genuine H1 and row-14 prepared roots are documented by `pari_unified_complete_h1_root_audit.md`, `h1_complete_real_runner.md`, and `row14_strict_prepared_complete_audit.md`. Pinned source/archive hashes are retained throughout the audits. | The implementation is still experimental under `bench/pari-class-group-port`; three development fields and multiple general source branches remain unsupported. Many other terminal results start from W0, retained factor-base, or accepted-relation owners rather than prepared `nfinit` data. |
| Timed input is only prepared maximal-order `nfinit` state; no answer-derived relation/factor-base/retry state crosses the boundary. | **Proven for H1 and row 14; not general** | `h1_complete_real_runner.md` and `row14_strict_prepared_complete_audit.md` authenticate prepared-only roots. Row 14 explicitly rejects W0, prepared-root, relation, class, unit, and C7 inputs. | `row6_prepared_complete_audit.md` explicitly admits factor-base and accepted Gate-C owners. `row13_prepared_complete_audit.md` admits an immutable prepared factor-base/initial-relation root. Rows 1, 3, 4, 8, 10, 11, 16, 18, and 20 have useful terminal evidence but not a qualified prepared-only root. Rows 19, 21, and 23 are incomplete. |
| End-to-end output includes class invariants, full transforms, generator ideals and exact order witnesses, authenticated presentation/relation state, torsion, compact/factored units, regulator/precision evidence, replay state, and assumptions. | **Proven on selected fields; not panel-wide** | H1, row 14, row 13, row 6, field 3/row 10, rows 1, 3, 4, 8, 11, 16, 18, and 20 have field-specific C7/replay evidence, summarized by `pari-class-group-remaining-development-fields-audit.md`. Row 14 proves `[8,24]`, exact generator ideals/witnesses, compact rank-two ancestry, regulator, torsion, assumptions, and atomic C7 publication. | There is no uniform prepared-boundary result for all 16 development fields, much less 24. Rows 19, 21, and 23 lack terminal outputs. Several completed artifacts retain authentic `not_given` units rather than expanded units, which is valid for flag zero but does not satisfy the separate compact tier by itself. |
| Publication is atomic, idempotent, and failed retries cannot publish partial results. | **Proven on selected roots** | H1, row 14, row 13, and row 6 transaction audits contain atomic publication and mutation controls; field-neutral C7 composers reject component/status mutations. | This has not been demonstrated for the missing general relation-growth, successful honesty, row-19, row-21, or row-23 paths. |
| No PARI class/unit routine or precomputed answer remains behind a claimed prepared-input boundary. | **Proven for the two strict roots; not a general gate** | H1 and row 14 run the Sage.js translated graph after the prepared input. Frozen PARI data is admitted only after result publication for differential checking. | Most development-field completions are retained-owner correctness cuts, not strict prepared-boundary executions. Their correspondence labels must not be counted as prepared-kernel coverage. |
| Flag-zero and usable compact flag-one tiers are distinct and separately measured. | **Flag-zero partial; flag-one infrastructure only** | Authentic flag-zero successes and `not_given(PRECI/LARGE)` results exist. `compact-flag-one-manifest.json` freezes exactly 12 additional-development rows, and row 20 has matching pristine-PARI/Sage authority in `compact_flag_one_row20_audit.md`. | The flag-one manifest sets `enabled=false`, `timingEnabled=false`, and `finalRunEnabled=false`. Row 20 is an **untimed retained-owner adapter** with `eagerExpansionExecuted=false`; the other 11 fields have no executed flag-one tier. There is no separate compact-tier timing series. |
| Internal correspondence and public Sage.js certification remain distinct. | **Proven distinction; public certification deliberately absent** | Internal schemas hard-code/reject `public_complete=true`; current C7 results publish `correspondence_complete=true, public_complete=false`. `internal_correspondence_completion_audit.md` identifies the missing index-one/saturation evidence. | No result supplies the rigorous unit-saturation/index-one payload and full public proof record required for `UnitGroupComputation(complete=True)` or `ClassUnitComputation(complete=True)`. This does not by itself block an internal A/B/C outcome, but it blocks every public-completion claim and production-adapter promotion. |

## Phase 0 — canonical integration spine

| Explicit requirement | State | Evidence and qualification |
| --- | --- | --- |
| Start from `agent/range-increment-reproof`, merge current main, then merge the port branch. | **Proven at the checkpoint** | Both pinned histories are ancestors. The integration history contains `1be5fba3` (main merge) and `85d645b5` (port merge). |
| Regenerate both optimizer artifacts rather than choosing one conflict side. | **Proven at the checkpoint** | Integration commit `42a06ea0d` regenerates the optimizer evidence from the combined tree; the clean Phase-0 replay binds the resulting tree. |
| Import only HNF commits `6e68e6e43` and `0b37c8486`. | **Proven by patch identity, not literal ancestry** | `pari-class-group-e2e-resource-ledger.md` records stable-patch equivalents `be1e26d94` and `e683e802a`. The divergent HNF history is not merged. |
| Run architecture, strict Python, changed-file, focused compiler, and complete native gates; record unrelated failures. | **Proven for frozen Phase 0** | `phase0_integration_replay.md` records the clean integration build/gate receipt and the one authorized build-only stress-tier overrun. This audit did not rerun the full expensive suite at `d0ffd32bb`. |
| Reproduce all 7,081 outputs, nine malformed controls, splitting receipt, cubic/quartic candidate/retry, and all required backends from clean builds. | **Proven for frozen Phase 0** | The definitive 25-stage clean replay at `44807189a` is bound by manifest digest `8e0c44...a91a27`; CPython, JavaScript, GMP, and tagged receipts are listed in `phase0_integration_replay.md`. The retained ~2.08 ms splitting receipt is explicitly unqualified, as required. |
| Freeze commit/toolchain/generated hashes/sizes/build/RSS/owners/outputs. | **Proven for frozen Phase 0, later accounting incomplete** | The Phase-0 manifest and corrected resource ledger are hash-bound. `pari-class-group-e2e-resource-ledger.md` also says aggregate agent hours, CPU-hours, complete archived-evidence usage, and exact owner-live high-water remain unknown. |
| Build and hash private PARI 2.17.4 on every oracle/timing host. | **Proven on the development/oracle host; final-host gate open** | All current oracle adapters pin archive, `buch2.c`, `libpari`, executable, and build identities and reject system PARI 2.15.4. | No final quiet timing authority has been selected/fingerprinted, so “every timing host” cannot yet be closed for Phase 6. |

**Phase-0 conclusion:** the canonical spine gate is valid for its frozen
checkpoint. Current correctness work descends from it. It is not a current
Phase-6 baseline: final executable/object hashes and the eventual timing host
must be frozen again before qualification.

## Phase 1 — observability and comparison ladder

| Explicit requirement | State | Evidence and exact missing gate |
| --- | --- | --- |
| Freeze four sentinels, twelve additional development fields, and eight untouched reserves using the documented deterministic PARI-only rule. | **Proven** | `class-unit-qualification-manifest.json` contains 24 unique rows in roles 4/12/8. `phase1-development-ladder.json` and `phase1_development_ladder_audit.md` independently rederive the 16 tuning rows. The panel SHA is `7c6515...ec3a5`. |
| Trace all 16 development candidates under pristine PARI 2.17.4 before implementation. | **Proven** | `development-default-driver-manifest.json` hashes all 16 external trace payloads and terminal results; the current checker reports `16/16`. |
| Include both target degrees and at least four fresh PARI 2.17.4 reference costs over one second. | **Identity portion proven; fresh-cost portion missing** | The panel covers real cubics and mixed quartics (and additional signatures/degrees). Historical 2.15.4 discovery times include multiple >1 s fields. | The plan explicitly disallows using discovery times as qualified baselines. No frozen 24-field fresh PARI 2.17.4 timing receipt establishes the required four seconds-scale fields. |
| Keep failures/timeouts in the 24-field denominator and reserves closed until candidate freeze. | **Infrastructure proven; execution absent** | The qualification schema/runner has explicit failure statuses and denominator policy. Current manifest check reports reserves closed. | No qualification journal exists, so failure accounting has not been exercised on the panel. |
| Predeclare separate correctness fixtures for missing random, precision, honesty, and related branches. | **Partial** | Forced random-relation and unequal-bound all-failure honesty corridors are frozen and differentially checked. H1 separately has a real 192→2304 precision-retry computation. | The Phase-1 checker currently and authoritatively reports missing correctness-only `precision-escalation` coverage in the ladder contract and missing `successful-full-honesty`. `resident_honesty_root_audit.md` says success and automorphism observations terminate at explicit unsupported frontiers. The rolling checkpoint's older phrase that a successful degree-five `be_honest` path exists is contradicted by `honesty_success_audit.md`: degree-five ranked preparation rejects before the first collector probe. |
| Required bounded input/output traces exist for every changed stage and all timed runs disable tracing. | **Partial** | Extensive relation/HNF/unit/class traces and state hashes exist for completed field-specific cuts. The diagnostic timing roots disable ordinary giant traces and use source-local clocks. | No one manifest proves the complete required trace vocabulary for every general branch. Rows 19/21/23 and successful honesty lack such traces on the Sage side. |

## Phase 2 — relation collection and HNF retry corridors

| Explicit requirement | State | Evidence and exact missing gate |
| --- | --- | --- |
| Faithful `small_norm`, cache/subfactor/permutation/selected-ideal mutation schedule and RNG schedule. | **Partial, field-specific** | H1, rows 6, 13, and 14 execute authentic multi-pass schedules and reproduce retained relation/RNG state; forced random-relation arithmetic is differentially checked. | No general prepared-state machine closes this for all four sentinels and fixtures. Natural default `rnd_rel` is absent from all 16 PARI performance traces. |
| Empty/nonempty `W`, rank and unit-rank deficiency, repeated `hnfadd`, random fallback, precision rebuild, factor-base enlargement, capacity growth. | **Partial** | Nonempty `W`, deficiency, stalls, repeated append, capacity misses, and authentic schedules are covered in selected rows. Row 6 crosses the old 1,024-factor-base ceiling. H1 precision retries retain exact owners. | Generic factor-base enlargement, natural random fallback, successful unequal-bound honesty return, and general capacity retry are not closed. |
| Allocate bounded owners once, use logical prefixes, resume without refactoring accepted relations, and fail safely on capacity miss. | **Partial** | Resident field-specific paths, exact-owner authentication, and capacity controls exist; row 14 profiling identifies remaining repeated host allocation/materialization. | Row 14 still recompiles/cache-inspects graphs and rebuilds continuation owners inside the measured aggregate. This is evidence of the remaining lifetime problem, not closure of the plan's reusable resident state machine. |
| Four sentinels plus required branch fixtures exactly agree with PARI and run without callbacks or class-answer fixtures. | **Not met** | Several sentinels have strong individual evidence. | Successful honesty and the ladder's precision fixture are missing; not every sentinel is a strict prepared-only run; no consolidated gate receipt covers all required exact states and decisions. |

## Phase 3 — exact sparse/HNF/SNF envelope

| Explicit requirement | State | Evidence and exact missing gate |
| --- | --- | --- |
| Resident relation presentation, cleanup, rank, append, log transforms, and exact owners. | **Partial** | H1 and rows 6/13/14 retain connected exact state; field 3 has a large exact relation/replay chain. | Not generalized to rows 19, 21, and 23 or all required prepared roots. |
| Full Smith form with both transformations and independent `U W V = D` replay. | **Proven on completed field-specific chains; not general** | Class witnesses and C7 composers independently replay transforms for the listed completed rows. | No row-19 rank-nine, row-21 trivial-presentation, or row-23 order-six transform/witness chain exists. |
| `ZM_inv`, rounded HNF divisions, alias/ownership contracts, and original principal provenance. | **Partial** | These operations and provenance exist in H1/row-14 and multiple C7 chains. Mutation tests reject transform/principal-witness changes. | The uniform 12-additional-development-field envelope is absent. |
| All twelve additional development fields complete the exact envelope. | **Not met: 9/12 have terminal evidence** | Rows 3, 4, 6, 10, 11, 13, 16, 18, and 20 have correspondence-complete terminal artifacts. | Rows **19, 21, and 23** are exactly missing. `pari-class-group-remaining-development-fields-audit.md` lists their first missing mathematical boundaries. |

## Phase 4 — units and precision

| Explicit requirement | State | Evidence and exact missing gate |
| --- | --- | --- |
| Source-identical lattice extraction, integer/floating LLL, `cleanarchunit`, regulator consistency, and precision decisions. | **Partial** | Rank-one/rank-two suffixes exist; H1 performs genuine 192→384→768→1536→2304 precision retries without rebuilding exact owners. Rows 6/13/14 preserve exact phase/sign information and authentic `LARGE` decisions. | Rank-three row 21, rank-four row 23, and row-19 large rank-nine class/rank-one suffix are absent. No all-sentinel/all-development consolidated gate exists. |
| `getfu` reconstruction, exact unit/inverse/norm/principality checks, and matched `not_given`. | **Partial** | H1 and row 20 publish successful exact units; multiple rows faithfully return `not_given(PRECI/LARGE)` with compact ancestry. | Several completed fields depend on W0-derived raw relation/log owners. Missing fields have no reconstruction. The compact tier has not run. |
| Large-unit case proves no accidental eager expansion. | **Proven for correspondence cuts** | Field 3 and rows 6/13/14 retain large compact transforms and faithfully avoid later eager expansion when PARI returns `not_given`. | This does not substitute for the separately timed flag-one tier. |
| Sentinels plus twelve development fields produce required units/regulators/retry decisions. | **Not met** | Thirteen of sixteen have some terminal correspondence artifact. | Rows 19/21/23 are incomplete, and not all thirteen start from the required prepared boundary. |

## Phase 5 — honesty, class generators, and final state

| Explicit requirement | State | Evidence and exact missing gate |
| --- | --- | --- |
| Successful conditional resident `be_honest` on a predeclared unequal-bound case. | **Not met** | Equal-bound skips are authenticated; the unequal-bound all-failure scheduler replays 51 failures and 50 retry draws. | `resident_honesty_root_audit.md` explicitly labels success continuation, automorphism orbits, primitive-part work, and ideal reduction unsupported. `honesty_success_audit.md` confirms the degree-five success observations are still PARI answers because Sage.js rejects degree five before probing. |
| `class_group_gen` with full transforms, `genback`, reduced generators, exact powers/products, `nf_cxlog`, and `M1/M2/Ga/Ge/GD/ga/clg2`. | **Proven on selected roots; not general** | H1 and row 14 construct exact generator ideals/order witnesses and archimedean/class state; several field-specific C7 chains replay equivalent evidence. | The remaining development fields have no such suffix; retained-owner rows do not prove one general prepared-input implementation. |
| `cleanarch` retry and `buchall_end`-equivalent immutable final assembly. | **Partial** | H1 has live precision retry and atomic publication; row 14 has strict prepared-to-C7 assembly; rows 6/13 and field-specific composers have transactional outputs. | No general successful honesty/restart transaction and no rows 19/21/23 final assembly. |
| One immutable internal result and replay verifier; mutate every material family. | **Partial, strong field-specific evidence** | Neutral C7/result helpers and focused composers reject relation, transform, generator, unit, log, regulator, torsion, invariant, owner/status mutations across several fields. | There is no single panel-wide root/verifier or mutation receipt covering the missing branches. |
| Gate: every required output, every generator-order witness, unit/regulator replay, atomic/idempotent final construction, and no hidden PARI/answers. | **Met only for individual strict fields** | H1 and row 14 are the strongest instances. | It is not met for the 16-field development ladder or 24-field population. |

## Development-field coverage

“Terminal evidence” below means an internally replayed correspondence result,
not necessarily a prepared-input computation or a qualified timing sample.

| Frozen row | Terminal evidence | Prepared-only connected root | Qualification eligibility now | Principal limitation |
| ---: | --- | --- | --- | --- |
| 0 | yes | **yes** | no | only unqualified development timing; compact tier not run |
| 8 | yes | no | no | accepted/W0 owner chain, not prepared-only |
| 1 | yes | no | no | retained presentation/unit owners |
| 14 | yes | **yes** | no | one matched single-run diagnostic; no alternating qualification |
| 3 | yes | no | no | frozen-W0 ancestry |
| 4 | yes | no | no | frozen-W0 raw-log ancestry |
| 6 | yes | no | no | transaction begins with factor-base and accepted Gate-C owners |
| 10 | yes | no | no | large frozen owner chain; not one prepared-only root |
| 11 | yes | no | no | frozen-W0 ancestry |
| 13 | yes | no | no | prepared field plus retained prepared factor-base/initial-relation owner |
| 16 | yes | no | no | frozen mixed-cubic owner chain |
| 18 | yes | no | no | frozen mixed-cubic owner chain |
| 19 | **no** | no | no | no live factor base/relation/HNF/class/unit/C7 producer |
| 20 | yes | no | no | successful exact units/C7, plus untimed retained-owner flag-one seed |
| 21 | **no** | no | no | degree-five factor base/LLL/FLATTER and rank-three unit suffix missing |
| 23 | **no** | no | no | index-prime 131, collector, order-six witness, rank-four units missing |

Thus the defensible counts are:

- terminal correspondence evidence: **13/16 development fields**;
- additional-development terminal evidence: **9/12**;
- strict prepared-only connected fields among the 16: **2/16** (rows 0 and
  14);
- frozen reserves executed: **0/8**;
- qualified completed matched pairs: **0/24**.

## Phase 6 — qualification and A/B/C/D decision

| Explicit requirement | State | Evidence and exact missing gate |
| --- | --- | --- |
| One quiet Linux x86-64 timing authority, pinned physical core, fixed governor/toolchain, one thread, no concurrent work. | **Missing** | Development-host fingerprints exist. | No final host has been selected, locked, freshly fingerprinted, and certified quiet. |
| At least seven alternating pairs for stage diagnostics. | **Unqualified diagnostic only** | H1 has real alternating development-host diagnostics; row 14 has a single exact matched boundary and a separate one-run profile. | H1 is explicitly `qualifiedTiming=false`; row 14 has no alternating series. |
| At least eleven alternating ABBA/BAAB blocks for promotion, with fresh computation and >1 s per arm. | **Missing** | Scheduler/schema enforce the intended protocol when enabled. | No final journal/receipt exists. `executionEnabled=false`; no raw 24-field blocks exist. |
| Six separately reported boundaries and mutually exclusive leaf clocks summing to the inclusive root. | **Partial diagnostic** | H1 source-local clocks conserve the Sage root; row-14 relation/HNF profiling conserves its diagnostic root and reports explicit remainder. | PARI/Sage source cuts are not proved identical; no six-boundary final receipt exists. The row-14 profile cannot be combined with its separate single matched observation as if one paired run. |
| Report all raw pairs, spread, RSS, source/object/build metrics, owners/allocations/copies, precision/retry/work counters. | **Missing for qualification** | Individual audits report useful subsets. | There is no final materialized receipt containing the complete required ledger. Aggregate active-agent/CPU-hour and owner-live-byte accounting is also unknown. |
| Prepared-kernel comparison is symmetric; preparation separately reported. | **Proven for one row-14 single observation, not a campaign** | `row14_matched_kernel_clock_audit.md` gives a resident prepared boundary with exact class generators, regulator, torsion, work shape, RNG, and >=110 common log bits: Sage 91.1097 s versus PARI 2.0238 s. | It is a single development-host observation. No ratio is formally promoted. The follow-up profile is separate, and the final standard-result timing protocol has not run. |
| Practical RSS target `max(512 MiB, 5*PARI RSS)` while staying under 4 GiB. | **Missed on row 14 diagnostic** | Row 14 observed Sage 1,537,452 KiB and PARI 227,372 KiB. | Five times PARI is 1,136,860 KiB, so Sage exceeds the practical target by about 400,592 KiB, although it remains below 4 GiB. Compiler-owner logical/live high-water is not fully reported. |
| Run and report the 24-field frozen qualification with failures in the denominator. | **Missing** | The exact population and fail-closed runner exist. | Reserves remain closed and execution is disabled. |

### Outcome adjudication

| Outcome | Current decision | Reason |
| --- | --- | --- |
| **A** | **Not achieved** | There are 0/24 qualified pairs, not 24/24; no GM/p95 exists; compact flag one has not run. |
| **B** | **Not achieved** | There are not 16 prepared-boundary qualified fields; rows 19/21/23 are incomplete; no fresh proof of four >1 s PARI fields; no GM <=3x. |
| **C** | **Not yet admissibly achieved** | Genuine prepared correspondence-complete paths exist. Row-14 profiling assigns most Sage time to compiler graph-cache lookup, owner materialization, and three native roots, and is valuable localization evidence. But it is a separate single diagnostic, not the required controlled paired stage evidence, and does not prove a cross-implementation >=80% gap partition. |
| **D** | **Current formal outcome** | Qualification is disabled and work remains unmatched/general-incomplete. This is the plan's prescribed outcome until an admissible C or stronger receipt exists. |

## Compiler-campaign and resource gates

| Requirement | State | Evidence and exact missing gate |
| --- | --- | --- |
| At most two evidence-driven compiler campaigns. | **Respected so far** | Resident exact/storage experiments and the precision-resource composition probe are documented; no third general language campaign is claimed. |
| Campaign 1 gate: exact prefix identity, malformed controls, clean sanitizers, >=3x fresh-boundary gain, <=2x PARI segment. | **Failed honestly** | Root-lifetime GMP scratch removed 99.52% of allocation events but achieved only 1.26x--1.69x stage gains; the checkpoint says the campaign stopped. Later private-buffer work reduces one H1 sample further but is not a paired gate receipt. | Do not count allocation-count reduction as campaign success. The real row-14 profile instead identifies cache/lowering and host owner materialization as dominant. |
| Campaign 2 gate: forced cubic/quartic escalation, identical outputs/enclosures, no callback/leak, >=2x multi-call gain, <=3x PARI. | **Mechanism probe proven; campaign gate not met** | `precision_resource_graph_bridge_audit.md` proves retained exact owners plus retryable Arb resources without a new compiler feature, and H1 proves one real precision schedule. | No paired cubic-and-quartic campaign receipt proves all speed and <=3x gates. |
| Readable Python and one named/versioned state layout; no handwritten product-math C. | **Partial** | Mathematical leaves are ordinary Python; C files are benchmark/PARI adapters. Several versioned manifests and result schemas exist. | The active roots still have hundreds of positional owners (351/564 arguments), tens of MB of generated C, and no single retained state-layout manifest replacing that ABI. |
| Resource/code-size/build-time ledger and budget checkpoints. | **Partial and stale** | `pari-class-group-e2e-resource-ledger.md` binds Phase-0 and early owner/resource evidence. | It predates major row-6/13/14 work, cannot account active-agent or CPU hours, does not prove the 512 MiB archived-evidence cap, and does not give the required current owner-live-byte target/high-water. |

## Deliverables matrix

| Required deliverable | State | Evidence / missing item |
| --- | --- | --- |
| Frozen integration-spine manifest and reproducible toolchain | **Proven for Phase 0** | Definitive clean replay and private PARI pins exist. A new final candidate/toolchain freeze is still required for Phase 6. |
| Updated PARI routine/block correspondence and dependency frontier | **Partial** | Numerous source-specific audits and the exact remaining-field audit exist. There is no single current consolidated correspondence table proving every `buch2.c` cut complete. |
| Attributed ordinary Python for every completed connected stage | **Partial** | Present for the implemented mathematical leaves. Rows 19/21/23 and successful honesty remain untranslated/unconnected. |
| Dynamic/JS/GMP/tagged differentials and independent exact/lattice/ideal/unit replay | **Partial, strong for completed cuts** | Phase 0 and focused checks provide broad backend evidence; C7 chains provide independent replay. No uniform panel-wide evidence exists. |
| Bounded traces and negative mutation tests | **Partial, strong for completed cuts** | Many result families are mutation-tested. Missing branches have no equivalent trace/mutation closure. |
| Same-work stage controls and end-to-end paired measurements | **Not delivered** | Only unqualified H1 paired diagnostics, one row-14 matched observation, and a separate profile exist. |
| Resource/code-size/build-time ledger | **Partial** | Existing ledger is authoritative only through its snapshot and explicitly reports unknown accounting gates. |
| Reviewed draft PRs and safe ordered merge train | **Missing as a final deliverable** | The active integration branch is an experimental worktree; no current plan-wide reviewed PR/ordered merge-train artifact is cited by the checkpoint or current audits. |
| Final A/B/C/D result and unsupported-branch list | **Unsupported list partial; final result not delivered** | The exact remaining development rows and several branch frontiers are documented. The only honest current outcome is D; no final qualification report has been produced. |

## Exact remaining gates, in dependency order

1. **Finish the three missing development fields.** Row 21 is the narrowest:
   complete degree-five factor-base ideal identity, ranked preparation/LLL/
   FLATTER, its `5 -> 32` relation/HNF closure, rank-three units, and C7. Reuse
   that machinery for row 23, adding index prime 131, rank-four units, and the
   order-six witness. Finish row 19's 424-ideal, 430-relation, rank-nine class
   presentation and rank-one unit suffix.
2. **Close successful honesty and the Phase-1 precision fixture contract.** A
   genuine unequal-bound success must be computed by Sage.js, including
   collector probes, KCZ increments/restoration, primitive part, conditional
   ideal reduction, and any automorphism orbit—not injected from PARI.
3. **Replace retained-answer boundaries with prepared-only connected roots**
   for every field that will count toward A or B. Thirteen terminal artifacts
   do not imply thirteen eligible prepared computations.
4. **Execute the compact flag-one tier.** Connect both real implementations on
   the frozen 12 rows, preserve compact/factored reconstruction state, run its
   separate timing protocol, and keep it out of flag-zero headline timing.
5. **Freeze a final candidate and host.** Select one exclusive Linux timing
   authority, pin the core/governor/thread/toolchain/PARI 2.17.4/native objects,
   regenerate current source/object/resource hashes, and keep reserves closed
   until this freeze is complete.
6. **Run admissible timing.** First run >=7 alternating diagnostic pairs with
   one conserved exclusive root. Then run >=11 alternating ABBA/BAAB blocks for
   all 24 frozen rows, with >1 s fresh work per arm, failures/timeouts retained,
   preparation separate, and all raw/resource/work counters published.
7. **Adjudicate A/B/C/D without weakening thresholds.** A C claim needs an
   actual measured >=80% partition of the remaining matched gap, not a sum of
   separate one-off observations. A or B additionally needs its exact coverage,
   seconds-scale, GM, and p95 gates.
8. **Refresh the campaign ledger and deliverables.** Record aggregate resource
   accounting, owner-live high-water, archived evidence, compiler campaigns,
   current source correspondence, unsupported branches, and the reviewed draft
   PR/merge train.

Public Sage.js completion remains a distinct later certification task unless a
separately timed independent post-pass produces exact unit saturation,
regulator enclosure, class completion, and the standard public proof payload.
It must never be inferred from PARI agreement or from this internal campaign.
