# Plan: cubic number-field class groups to PARI parity and beyond

**Status:** active

**Date:** 2026-08-29

**Primary frontier:** PARI/GP 2.17.4

**Independent comparators:** Magma 2.18-5 and Julia 1.12.7 with Hecke 0.40.0

**Depends on:**

- [`optimization-engine-plan.md`](optimization-engine-plan.md)
- [`number-field-class-and-unit-groups-plan.md`](number-field-class-and-unit-groups-plan.md)
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- [`../test/fixtures/number-field-lmfdb-cubic-100.json`](../test/fixtures/number-field-lmfdb-cubic-100.json)

## Goal

For ordinary class groups of cubic number fields, reproduce the exact PARI,
Magma, and Hecke results on the same fields and proof settings; decompose the
complete Sage.js computation; identify the missing mathematical and
representation regime; then drive Sage.js first to PARI parity and afterward
beyond it.

The measured gap is the campaign's existence certificate. A result that is
already 10 to 100 times faster in mature software proves that the computation
can be made much faster. It does not, by itself, identify which Sage.js
intervention is correct or authorize a production change.

Class-number parity is an intermediate milestone. Completion requires the
ordinary class group, including exact invariant factors and the requested proof
strength. Coupled units and regulator data are measured because all three
competitors compute or retain them while finding the class group and because
they may dominate Sage.js's general route.

## Governing decisions

1. PARI is the primary speed frontier. Magma and Hecke provide independent
   correctness, algorithm, and implementation evidence.
2. Conditional-on-GRH and unconditional results are different contracts. They
   are never pooled, relabeled, or compared without an explicit proof-strength
   relationship.
3. External timings are frontier observations, not Sage.js promotion evidence.
   Production promotion still compares a clean Sage.js baseline and candidate
   at an inclusive public boundary.
4. We optimize the complete causal state machine, not the hottest line or a
   detached kernel.
5. We do not weaken Sage.js's exact semantics, cancellation, transactional
   publication, or independently replayable proof surface to manufacture a
   benchmark win.
6. We may make rich proof and public objects lazy views over compact exact
   state when their eager construction is not required for the requested
   result.
7. The first intervention is selected from measured phase and representation
   evidence. It is not preselected merely because PARI is written in C.

## Frozen corpus

The authority is
`test/fixtures/number-field-lmfdb-cubic-100.json`, SHA-256
`9da77a37aa98decb2fc9e4df2173dc2daa1514ca27ce3ace8ef88a49d2b8e0fe`.

| Role | Count | Use |
| --- | ---: | --- |
| Smoke | 10 | Permanent semantic guards and rapid diagnostics |
| Tune | 60 | Complete representative optimization corpus |
| Holdout | 30 | Generalization test after a candidate freeze |

The holdout rows are visible in the repository, so they are policy-held-out,
not secret. A valid holdout run binds a predecessor freeze containing the
candidate commit/tree, mechanism, parameters, source closure, artifacts, and
representative evidence. No tuning of that candidate epoch follows a holdout
failure.

The ten smoke fields are the historical discriminant ladder. The 60 tune
fields—not three favorable examples—choose crossovers and parameters. The 30
holdout fields are observed only after the intervention is frozen.

## Exact proof contracts

### Conditional class group

The requested result may assume the reviewed GRH generation theorem, but all
relations, quotient computations, units, regulators, and returned invariants
remain exact under that assumption.

- Sage.js: `proof=False`; achieved status is
  `exact-relations-conditional-grh` or the strictly stronger
  `exact-unconditional`.
- PARI: `bnfinit(nf, 0)`. This is a coupled BNF computation and is not an
  unchecked heuristic.
- Magma: `ClassGroup(O : Proof := "GRH")` in a fresh process with the default
  global class-group-bound policy.
- Hecke: the audited GRH discovery result.

An unconditional result may satisfy a conditional request but retains its
stronger label.

### Unconditional class group

- Sage.js: `proof=True`, achieved `exact-unconditional`, with detached replay
  where the route exposes a detached carrier.
- PARI: separately time `bnfinit(nf, 1)` and `bnfcertify(bnf, 0)`; the
  comparable unconditional boundary contains both. `bnfcertify(bnf, 1)` is
  not full certification and may not be used.
- Magma: `Proof := "Full"` in a fresh default process. A prior
  `SetClassGroupBounds("GRH")` would invalidate this label.
- Hecke: `GRH=false`, whose proof phase checks the required Minkowski primes.

Proof carriers are recorded independently as detached replayable, live
authenticated, internally audited, or absent. Different valid systems need
not have equal certificate bytes or equal generator ideals.

## Measurement cells

Each prepared cell constructs a separate fresh isomorphic field and completes
`maximal_order()` before the timed call. No cell reuses another cell's class or
unit cache.

1. **scalar-prepared:** inclusive `K.class_number(proof=...)` through integer
   return, proof seal, cache publication, and synchronous cleanup.
2. **group-prepared:** inclusive `K.class_group(proof=...)` through a complete
   public group return.
3. **class-unit-prepared:** inclusive coupled class group, exact unit, torsion,
   and rigorous regulator result.
4. **fresh-complete:** one contiguous coefficient-to-answer timer containing
   field construction, maximal order, and exactly one selected public call.
5. **certificate-replay:** a separate fresh-field proof replay boundary, never
   silently added to or removed from another cell.

The scalar is the first parity rung, followed by the group and coupled
class-unit cells. The campaign is not complete while only the scalar is fast.

PARI's `bnfinit` produces a superset of a scalar or bare-group result. A faster
superset is decisive one-sided evidence of a Sage.js gap, but exact parity
claims require either matching coupled outputs or an explicitly reviewed
boundary/output partial order.

## External frontier protocol

All systems use the same normalized ascending integral coefficients, maximal
order, ordinary class scope, corpus row, and proof contract. Every row checks
the discriminant, class number, and invariant factors. Unit/regulator checks
are added for the coupled cell.

The dedicated `opt` VM supplies the frozen timing host:

- Ubuntu 24.04 x86-64;
- four virtual CPUs and 16 GiB RAM;
- no unrelated workload during retained samples;
- exact CPU affinity, governor/frequency, load, tool versions, executable and
  package hashes, command lines, environment, and raw samples retained.

Provisioning, builds, package installation, correctness preflights, and timing
windows are serialized. One-core results are the primary algorithmic
comparison. Four-core results are a separately labeled resource race and are
never pooled with one-core data.

PARI reports these non-overlapping meanings:

1. `nfinit(P)` field/order preparation;
2. `bnfinit(nf, 0)` conditional frontier;
3. `bnfinit(nf, 1)` alternative compact exact-unit/relation initialization;
4. `bnfcertify(bnf, 0)` unconditional certification after flag 1.

Flag 0 is never subtracted from flag 1, and phase sums are never substituted
for an inclusive public timer.

## Sage.js phase and representation ledger

Every public call has one contiguous root timer. Mutually exclusive leaves,
plus an explicit remainder, conserve that root:

1. dispatch and cache;
2. maximal-order access after timer entry;
3. factor-base planning;
4. modular factor production;
5. packed factor validation and ideal/materialized conversion;
6. relation candidate production;
7. exact relation admission;
8. HNF/SNF presentation and transforms;
9. p-line obstruction or analytic completeness;
10. unconditional proof upgrade;
11. proof/certificate sealing;
12. public publication and cleanup;
13. unattributed remainder.

Per-call counters include work units, rank progress, native/FFI crossings and
bytes, packed and public allocations, owned-resource lifetimes, cache state,
cancellation polls, process CPU time, RSS, faults, switches, and affinity.
Unavailable counters stay unavailable; they are never encoded as zero.

The critical representation transitions are:

```text
certified maximal order
  -> factor-base plan
  -> packed cubic factor records
  -> candidate/valuation buffers
  -> exact sparse relation ledger
  -> resident HNF/SNF state
  -> quotient and completeness transcript
  -> live proof authority
  -> requested public scalar/group/class-unit view
```

The decline edge into ordinary prime-ideal objects, general relation objects,
analytic real-ball state, public maps, and canonical detached payloads is
measured explicitly.

## Current causal thesis

Existing evidence rules out another isolated scalar kernel as the primary
answer:

- native cubic candidate arithmetic is already tens to hundreds of
  microseconds;
- O0 and O2 differ by only about one or two percent end to end;
- individual packed-to-rich representation, small-matrix, and certificate
  transitions cost 10 to 70 milliseconds; and
- warm PARI completes many whole cubic cases in only a few milliseconds.

The leading thesis is therefore: preserve the proof, fuse the proof state.
Sage.js currently publishes many independently rich internal objects while
PARI keeps factor base, relation search, rank/HNF, unit embeddings, and analytic
stopping state in one compact native lifecycle.

This thesis must be falsified before a large refactor. An experimental route
that avoids all known eager materialization/publication arrows must recover at
least 25% on the representative smoke/tune slice. If it does not, the inclusive
phase ledger is incomplete and must be reopened.

## Ranked interventions and falsification order

### 1. Compact native-owned cubic proof capsule

Retain packed factor descriptors, candidate buffers, exact admissions,
incremental rank/HNF state, quotient representatives, and completeness
transcripts in one coarse owner. Return only the requested result, a compact
continuation, proof status, and diagnostics. Construct ordinary ideals, public
maps, detached JSON, and dependency trees lazily.

The ordinary CPython-parseable algorithm and dynamic fallback remain the
semantic authority. Source-transparent native compilation is preferred; a
foreign library or handwritten boundary requires a separately reviewed reason.

First experiment: skip eager rich-object and detached-payload work without
changing the theorem. Demote this intervention if the inclusive gain is below
25% or known transitions account for less than 15% of the call.

### 2. Small discovery base plus exact Minkowski post-verification

Use a small BDF/GRH discovery base to obtain a tentative quotient, then express
every exact Minkowski-required prime in it and add only missing information.
This remains unconditional because generation is proved at the end. The
general Sage.js engine, PARI honesty pass, Hecke proof pass, and Magma strategy
already use this separation.

Demote it if cost does not grow with current Minkowski-base size or exact
post-verification is not faster once the base exceeds the measured crossover.

### 3. Mature packed adaptive relation engine

For producer-decline fields, add adaptive Fincke--Pohst/reduction, smoothness
prefilters, randomized subfactor-base walks, a two-large-prime graph, rank and
unit-dependency feedback, and deterministic worker merge. Accepted relations
still pass one exact verifier with a factored principal witness.

Demote it if relation search is below 20% of decline-field wall time or better
candidate/rank yield fails to improve the complete call.

### 4. Proof-aware route cost model

Replace empirical cutoffs with deterministic features: discovery/proof base
sizes, early split density and smoothness yield, modular rank gain, provisional
quotient p-ranks and p-lines, conversion costs, proof request, and reusable
state. Retain hard limits as safety caps.

### 5. Packed scalar-only unconditional continuation

Complete Minkowski post-verification and saturation over packed presentation
state, returning a sealed scalar continuation before public group maps and
per-prime proof objects are built.

### 6. Coarse deterministic parallel batches

Only after relation and proof work is coarse and packed, measure 1/2/4 workers
for relation walks and independent proof-prime checks. Do not parallelize
today's fine-grained Python/JavaScript object work.

### Control: optional mature PARI route

An explicit PARI adapter with exact flags and a correct portable fallback is a
valuable parity control and possibly a production capability. It is not the
pure-framework breakthrough, so it cannot substitute for the central parity
experiment.

## Candidate and promotion protocol

Before production implementation, select one intervention using the complete
representative evidence and mature-capability audit. The selected candidate
must retain exact semantics, an untouched or reviewed rollback fallback,
cancellation, no partial publication, balanced resources, and Windows x64
support or a capability-tested fallback.

Sage.js baseline/candidate promotion uses exactly 11 alternating
`ABBA/BAAB` pairs. Every representative and later heldout pair must improve;
the worst paired improvement must be at least 10%. Raw letter results,
per-field results, counters, proof carriers, and all losing candidates remain
in the evidence store.

This production gate is distinct from frontier parity:

- **production promotion:** candidate improves the current Sage.js public
  route with exact semantics and complete platform/resource evidence;
- **PARI parity:** frozen Sage.js and PARI comparable cells are at parity under
  the same proof/resource contract;
- **beyond PARI:** Sage.js improves by at least 10% in every frozen paired
  frontier observation while preserving the same result/proof contract.

Unavailable Magma or Hecke coverage produces `coverage-incomplete`, not a
fabricated pass or failure.

## Parity ladder

1. Reproduce every system's exact class groups and proof labels.
2. Reach less than 10× PARI on every smoke/tune policy.
3. Reach less than 3× PARI geometrically, with no case worse than 10×.
4. Reach scalar parity.
5. Reach full public class-group parity.
6. Reach coupled class/unit parity where outputs are comparable.
7. Freeze the parity implementation and begin a separate beyond-PARI epoch.
8. Beat PARI by at least 10% across the frozen comparable corpus; retain Magma
   and Hecke as independent correctness and resource controls.

## Completion criteria

This campaign is complete only when:

1. PARI, Magma, Hecke, and Sage.js exact group results agree on the frozen
   corpus for every supported proof contract, or an unavailable comparator is
   durably and honestly recorded;
2. every reported timing has exact semantics, tool/source/artifact identity,
   raw samples, and an inclusive boundary;
3. the Sage.js phase and representation ledger conserves the complete public
   call and identifies the causal regime;
4. one intervention is selected by evidence and implemented with exact
   fallback, replay, cancellation, resource, and platform behavior;
5. the frozen candidate passes representative and predecessor-sealed heldout
   promotion evidence;
6. full cubic class-group parity with PARI is demonstrated, not merely one fast
   class-number example; and
7. the parity outcome, negative evidence, frontier observations, and remaining
   beyond-PARI obligations are content-addressed in durable optimization
   memory.
