# Number-field class groups and unit groups

## Objective

Implement portable, fast, and honestly certified class groups, class numbers,
unit groups, and regulators for maximal orders in absolute number fields over
`QQ`.

The implementation must run natively on Windows x64, macOS arm64, Linux x64,
and Linux arm64 without shipping PARI, Julia, Oscar, Hecke, Magma, or another
standalone computer algebra system. It should use Sage.js's existing FLINT,
Arb, exact-number-field, maximal-order, prime-ideal, ideal-arithmetic, and
Dedekind-zeta foundations.

The primary algorithmic blueprint is Hecke's BSD-licensed class-and-unit-group
implementation in `/home/user/upstream/Hecke.jl`. PARI's GPL implementation in
`/home/user/upstream/pari-2.18.1.alpha` is a performance and algorithmic oracle,
not a library to extract or embed. Sage/PARI, Hecke/Oscar, and Magma provide
independent answer corpora and performance comparisons.

This is deliberately one class-and-unit-group project. General class groups,
fundamental units, regulators, relation-lattice saturation, and analytic
validation of `h*R` are coupled parts of the same computation.

## Required outcomes

The project is complete when Sage.js can compute, for documented practical
ranges:

```python
K.class_group(proof=True)
K.class_group(proof=False)
K.class_number(proof=True)
K.class_number(proof=False)
K.unit_group(proof=True)
K.unit_group(proof=False)
K.units(proof=True)
K.regulator(prec=100, proof=True)

I.is_principal(proof=True)
I.gens_reduced()
C(I)                         # ideal-class discrete logarithm
C.gen(0).ideal()             # representative generator ideal
```

with all of the following properties:

- `proof=True` is unconditional and compatible with Sage's default semantics.
- `proof=False` may use a named GRH-conditional factor-base bound, but every
  relation and group operation remains exact.
- Conditional, incomplete, heuristic, and exact results cannot share cache
  entries or silently satisfy one another's requests.
- Every returned group generator is represented by an exact ideal.
- Every defining relation has an exact principal-ideal witness, retained in
  factored form when expansion would be unreasonable.
- Class-group maps work in both directions and support principality tests.
- Unit generators are exact and their rank and saturation/completeness status
  are explicit.
- Regulators use arbitrary-precision Arb enclosures and stable embedding
  conventions.
- The computation is cancellable, resource-bounded, deterministic by default,
  and checkpointable for expensive relation searches and proof passes.
- All supported native paths pass Windows x64, macOS arm64, Linux arm64, and
  Linux x64 tests at an exact revision.

## Non-goals

Defer these until ordinary maximal-order class and unit groups are mature:

- ray, narrow, `S`-, and Arakelov class groups, except for the ordinary/narrow
  distinction needed to implement real quadratic arithmetic correctly;
- Picard groups of arbitrary nonmaximal orders, except existing quadratic
  behavior;
- relative number fields and towers;
- subexponential algorithms intended for enormous degree or discriminant;
- class fields and explicit reciprocity maps;
- embedding PARI, Julia, Oscar, or Hecke as a runtime dependency;
- claiming rigorous analytic error from Arb arithmetic alone when truncation
  or omitted-prime bounds have not also been proved.

## Existing Sage.js foundation

At the start of this project Sage.js already has:

- exact simple number fields over `QQ`;
- certified maximal orders and integral bases;
- exact signatures and archimedean embedding infrastructure;
- exact rational-HNF integral and fractional ideals;
- ideal sum, intersection, containment, multiplication, powers, inversion,
  quotient, norm, valuations, and factorization;
- certified prime decomposition, including index-dividing primes;
- dense FLINT HNF, SNF with transforms, LLL, GMP integer arithmetic, and
  Arb/Acb arithmetic;
- exact Dedekind-zeta coefficients and a general numerical analytic zeta
  implementation;
- specialized imaginary-quadratic class groups through FLINT binary quadratic
  forms;
- a complete but bounded real-quadratic unit search;
- source-transparent native compilation and production-kernel packaging.

The present general class-group code in
`src/lib/sagejs/number_fields/class_groups.py` does not collect general
prime-ideal relations. It handles degree one, two specially recognized cubic
class-number-one fields, and imaginary quadratic fields, then returns an
explicitly incomplete result.

The present imaginary-quadratic class-number path enumerates every reduced
positive-definite form through FLINT's `qfb_reduced_forms`. It is fast for
moderate word-size discriminants and must remain as a specialized route.

## Architectural decisions

### One shared class-and-unit context

Introduce an internal `ClassUnitGroupContext`. It owns all expensive reusable
state:

- field and certified maximal order identity;
- exact signature, discriminant, embeddings, and precision history;
- proof policy and factor-base theorem;
- factor-base prime ideals and compact local metadata;
- relation rows, exact principal witnesses, and archimedean logarithms;
- modular rank state and sparse relation-matrix state;
- HNF/SNF data and transformation maps;
- tentative class group, unit lattice, regulator, and roots of unity;
- analytic `h*R` enclosure and inferred missing-index bound;
- saturation history;
- unconditional prime-ideal proof progress;
- deterministic random seed, resource limits, checkpoints, and diagnostics.

`class_group`, `class_number`, `unit_group`, `units`, `regulator`, ideal-class
discrete logarithms, and principality tests must reuse this context rather than
starting independent computations.

### Ordinary Python owns policy

Mathematical policy, orchestration, exact fallback algorithms, proof objects,
serialization, and public APIs live in ordinary CPython-parseable Python under
`src/lib/sagejs/number_fields/`.

Use source-transparent `@native` kernels only for measured hot loops. Use
declared FLINT/Arb functions for integer matrices, LLL, balls, polynomial
arithmetic, and related established primitives. Do not implement the
class-group algorithm as a handwritten N-API callback.

### Hecke is the primary blueprint

Translate algorithms selectively from:

```text
/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/Clgp.jl
/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/Clgp/
/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/FactorBaseBound.jl
/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/Zeta.jl
/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/Unit/
```

Preserve attribution and record source provenance. Adapt the design to
Sage.js representations instead of mechanically reproducing Julia/Nemo object
layers.

Use PARI's `buch1.c` as a reference for later fast quadratic algorithms and
`buch2.c` as a checklist for the general Buchmann/McCurley pipeline, precision
recovery, relation selection, factored elements, and performance tuning.

### Exact relations, conditional completeness

A GRH-conditional result is not numerically approximate. Its ideal arithmetic,
relation rows, principal witnesses, HNF/SNF, generators, and group operations
are exact. Only the assertion that the selected factor base generates the full
class group is conditional on GRH.

Use immutable proof labels such as:

```text
exact-unconditional
exact-relations-conditional-grh
incomplete-resource-limit
heuristic-diagnostic-only
```

Do not use the word `certified` without identifying whether the certificate is
unconditional or conditional on GRH.

### Factored elements are a foundational representation

Principal generators and fundamental units can become enormous when expanded.
Add an exact `FactoredNumberFieldElement` representation before public
class-group maps depend on expanded coefficient vectors.

It must support:

- signed integer exponents;
- multiplication, inversion, powers, norm, and archimedean logarithms;
- exact evaluation on explicit request;
- construction of the associated principal ideal without expansion where
  possible;
- canonical serialization and deterministic replay;
- verification that a relation's factored element generates the claimed ideal.

Compact factored witnesses are part of the public proof architecture, not a
later memory optimization.

## Public API and proof semantics

Follow Sage-compatible signatures where practical:

```python
K.class_group(proof=None, names='c', algorithm='auto', **limits)
K.class_number(proof=None, algorithm='auto', **limits)
K.unit_group(proof=None, algorithm='auto', **limits)
K.units(proof=None, algorithm='auto', **limits)
K.regulator(prec=53, proof=None, algorithm='auto', **limits)
```

`proof=None` follows the Sage.js number-field proof policy, whose default is
unconditional. `proof=False` means GRH-conditional completeness, not an
unchecked guess.

Useful explicit algorithms should include:

```text
auto
quadratic-forms
minkowski
buchmann-hecke
```

Do not preserve accidental current routing behavior through aliases. In
particular, a general degree-two `NumberField` must not unconditionally enter
the imaginary-quadratic backend.

The full group result exposes:

- invariant factors and order;
- exact generator ideals;
- the forward map from abstract group elements to ideal classes;
- the inverse/discrete-log map for arbitrary nonzero fractional ideals;
- principality and optional principal-generator recovery;
- proof status, algorithm, factor-base theorem, relation counts, saturation
  status, and replayable evidence;
- resource and timing diagnostics without making display depend on them.

`class_number()` may avoid SNF transformation matrices and explicit generator
recovery when that materially saves time, but it must reuse and remain
consistent with the shared context.

## Algorithm tracks

### Track Q — specialized quadratic arithmetic

Keep quadratic fields on specialized algorithms when they are superior.

#### Q1. Tight exact Minkowski bounds

- Replace unnecessarily coarse rounding with exact integer comparisons.
- If the exact Minkowski bound is below `2`, return an unconditional trivial
  class group without decomposing any prime.
- Generalize the empty-factor-base certificate to every degree and signature
  for which it applies.
- Ensure alternate presentations of the same quadratic field give the same
  answer and map ideals correctly.

Acceptance case:

```python
K.<a> = NumberField(x^2 + 4*x + 1)
assert K.discriminant() == 12
assert K.class_number() == 1
assert K.class_group().invariants() == ()
```

The proof records the exact inequality `sqrt(12)/2 < 2` rather than a floating
point approximation.

#### Q2. Real quadratic continued fractions

- Replace bounded linear Pell enumeration with the continued fraction of the
  quadratic irrational.
- Return the fundamental unit, its norm, and a replayable minimality proof.
- Implement reduced indefinite forms or equivalent infrastructure cycles.
- Distinguish ordinary and narrow class groups using the existence of a unit
  of norm `-1`.
- Cross-check class numbers with the analytic class-number formula.

#### Q3. Large quadratic discriminants

- Retain complete FLINT reduced-form enumeration below a benchmarked threshold.
- Add Shanks/BSGS or Buchmann--McCurley relation methods above that threshold.
- Use NUCOMP/NUDUPL for compact composition.
- Remove the signed-machine-word limit through exact integer storage.
- Never materialize all classes merely to return the class number or invariant
  factors.

### Track G — general class and unit groups

#### G1. Factor-base bounds

Implement and independently test:

- exact Minkowski bound for unconditional generation;
- Bach's GRH bound;
- Belabas--Diaz y Diaz--Friedman's improved GRH bound;
- selection of the smallest applicable proven bound;
- a streaming prime-ideal iterator by norm that does not construct irrelevant
  high-residue-degree prime ideals.

Every factor-base plan records theorem, assumptions, bound, degree filters,
estimated prime ideals, memory, and work caps before enumeration begins.

#### G2. Factor-base representation

Represent each factor-base prime ideal compactly with:

- rational prime, norm, residue degree, ramification index;
- canonical HNF identity or stable fingerprint;
- two-generator data where available;
- precomputed valuation/factorization metadata;
- conjugacy/automorphism orbit metadata when useful;
- stable index in packed relation rows.

Exact ideal objects remain available at the public boundary, but hot relation
loops must not cross JavaScript or allocate one host object per valuation.

#### G3. Exact relation insertion

Given an element `alpha` and optionally an ideal denominator `I`, attempt to
factor the principal or quotient ideal over the factor base.

On success record:

- sparse exponent vector;
- exact factored principal witness;
- source ideal and reduction witness;
- norm and complete smoothness factorization;
- archimedean log vector at the active precision;
- automorphism-derived relations, each independently replayable;
- deterministic provenance for corpus reproduction.

Before admission, independently reconstruct the ideal from the factor-base
row and compare it with the principal ideal represented by the witness.

#### G4. Initial relations

Seed the relation matrix with cheap exact relations:

- rational-prime decomposition relations `(p) = product(P_i^e_i)`;
- one- and two-generator relations already attached to prime ideals;
- torsion/cyclotomic unit relations where applicable;
- small elements of the maximal order;
- automorphism orbits when the automorphisms are known and useful.

Use modular rank screening before expensive exact matrix insertion.

#### G5. LLL relation search

Translate Hecke's LLL-based search:

- LLL-reduce the Minkowski lattice of the order and selected ideals;
- enumerate short vectors with explicit work bounds;
- compute norms efficiently without expanding unnecessary intermediates;
- test factor-base smoothness;
- support one-large-prime relations, then combine matching partial relations;
- randomize products of selected factor-base ideals using a deterministic seed;
- prefer pivots missing from the current modular relation span;
- retain relation-search state for checkpoint/restart.

Start with a readable exact implementation. Optimize only measured kernels.

#### G6. Sparse relation linear algebra

- Maintain rank modulo one or more word-size primes.
- Change the test prime if the tentative class number may be divisible by it.
- Store sparse rows and defer dense exact transforms.
- Incrementally reduce new relation batches.
- Compute exact HNF once full rank is plausible.
- Compute SNF and transformations only when group structure or maps require
  them.
- Verify the SNF presentation against the original exact relation rows.

FLINT's dense HNF/SNF is the first exact backend. Add specialized sparse or
modular kernels only after profiling shows the dense conversion is limiting.

#### G7. Units and regulator

The kernel/dependent relations yield units. Implement:

- exact factored unit reconstruction;
- torsion-unit computation;
- arbitrary-precision logarithmic embeddings with the frozen complex-place
  factor-two convention;
- interval-certified rank of the log-unit lattice;
- LLL reduction of the unit lattice;
- regulator as an Arb determinant enclosure;
- exact verification that every proposed generator is a unit;
- `p`-saturation of the unit lattice;
- explicit distinction between an independent unit subgroup and the complete
  unit group.

Precision escalation must recompute only archimedean data, not discard exact
ideal relations.

#### G8. Rigorous `h*R` validation

Port or adapt Hecke's rigorous `zeta_log_residue` method using Sage.js's exact
prime decomposition and Arb.

It must return an enclosure for the logarithm of the Dedekind-zeta residue
with a complete truncation/omitted-prime bound. Do not reuse the current
general-zeta `rigorous=False` midpoint as a proof.

Compare the analytic enclosure with the tentative class number and regulator
to obtain a rigorous bound on the missing finite index. If the index is not
one:

- collect additional relations;
- find additional units;
- saturate at primes dividing the index bound;
- increase precision when enclosures overlap ambiguously.

The analytic computation guides and validates the relation lattice; it does
not replace exact ideal relations.

#### G9. Conditional completion

Once the relation lattice, unit rank, regulator, and `h*R` validation agree,
return an `exact-relations-conditional-grh` result when the factor base used a
GRH bound.

The result includes:

- named factor-base theorem and bound;
- exact group presentation;
- exact generator ideals and relation witnesses;
- complete unit generators and regulator enclosure;
- saturation record;
- analytic enclosure and index-one conclusion;
- the precise GRH assumption.

#### G10. Unconditional proof pass

For `proof=True`:

- stream all required prime ideals through the exact Minkowski bound;
- express each class in the tentative factor-base group;
- find an exact relation/principal witness tying it to the factor base;
- saturate class and unit lattices at primes dividing any remaining index;
- record proof progress and allow cancellation/checkpointing;
- mark the context unconditional only after every required prime ideal and
  saturation check succeeds.

Verification should be meaningfully cheaper than recomputing the relation
search, while acknowledging that unconditional proof can be orders of
magnitude slower than the GRH-conditional computation.

## Work packages

### P0 — semantics, provenance, and corpus

- Freeze public proof, algorithm, cache, cancellation, and limit semantics.
- Define serialized schemas for factor bases, relations, factored elements,
  class/unit contexts, conditional results, and unconditional certificates.
- Document Hecke and PARI source provenance and licenses.
- Create persistent Sage/PARI, Magma, and Hecke/Oscar oracle harnesses.
- Record cold/warm and proof/nonproof baselines before implementation.
- Add corruption tests for every serialized certificate component.

Exit criterion: schemas, fixtures, proof labels, and oracle commands are
reviewed before producer code depends on them.

### P1 — quadratic completion and immediate exact wins

- Tighten exact Minkowski rounding.
- Generalize empty-factor-base class-number-one certificates.
- Fix degree-two routing.
- Implement continued-fraction real-quadratic units.
- Implement ordinary and narrow real-quadratic class groups.
- Preserve and benchmark the existing imaginary-quadratic route.

Exit criterion: real and imaginary quadratic corpus cases pass exact Sage and
Magma comparisons, including norm `+1` and `-1` fundamental units.

### P2 — shared context and exact relations

- Add `FactoredNumberFieldElement`.
- Add `ClassUnitGroupContext` and immutable proof states.
- Add factor-base bounds and streaming construction.
- Add exact relation insertion/replay.
- Add modular rank screening and initial rational-prime relations.
- Add context serialization, cancellation, and checkpoints.

Exit criterion: hand-supplied relations produce verified HNF/SNF class-group
presentations and replay after serialization on all release platforms.

### P3 — small-field deterministic vertical slice

- Implement bounded Minkowski/LLL enumeration for small fields.
- Compute class and unit groups without a GRH assumption inside explicit caps.
- Complete ideal-class maps and principality witnesses.
- Target the motivating quintic and several cubic/quartic fields.

Required acceptance case:

```python
K.<a> = NumberField(x^5 + x^3 - x^2 + 4*x + 1)
C = K.class_group(proof=True)
assert C.invariants() == (4,)
assert K.class_number(proof=True) == 4
assert C.gen(0).ideal() == K.maximal_order().ideal(2, a + 1)
assert C(C.gen(0).ideal()) == C.gen(0)
```

The exact generator may be normalized differently, so tests may compare ideal
classes rather than textual generators.

Exit criterion: the complete small-field corpus has unconditional,
replayable presentations and units.

### P4 — Hecke-style production relation engine

- Add LLL short-vector relation search.
- Add deterministic randomized ideal products.
- Add large-prime partial relations.
- Add incremental sparse/modular relation processing.
- Add automorphism orbit acceleration.
- Add adaptive relation-selection and precision policies.
- Add progress, cancellation, restart, and resource diagnostics.

Exit criterion: the GRH-conditional route is reliable across the degree 2--10
oracle corpus and materially faster than the deterministic baseline.

### P5 — rigorous analytic validation and saturation

- Implement rigorous Arb `zeta_log_residue` bounds.
- Extract unit lattices from dependent relations.
- Add regulator enclosures and precision escalation.
- Add class and unit `p`-saturation.
- Prove the `h*R` index is one.
- Keep numerical/general-zeta diagnostics independent as an oracle.

Exit criterion: conditional class and unit groups have exact relations,
complete unit rank, rigorous index validation, and stable 100/200-bit
regulators.

### P6 — unconditional proof

- Implement the Minkowski prime-ideal proof stream.
- Add exact discrete logs and principal witnesses for proof primes.
- Add resumable parallel proof partitions.
- Ensure `proof=True` upgrades but never overwrites conditional cache entries.
- Compare proof costs and results with Sage/PARI `bnfcertify` and Hecke
  `GRH=false`.

Exit criterion: unconditional results agree across the corpus and certificate
replay detects every mutated prime, relation, generator, and saturation claim.

### P7 — competitive profiling and native acceleration

P7 starts as soon as the P3 vertical slice runs and remains active throughout
P4--P6; it is not a cleanup phase deferred until the algorithms are otherwise
declared finished.  Every supported acceptance family gets a matched same-host
Sage/PARI comparison before and after optimization.  The harness must use the
same polynomial, prepared-field boundary, proof policy, and requested output,
and must report library/process initialization separately from mathematical
work.

The canonical executable gate for the pinned LMFDB cubic ladder is:

```bash
pnpm bench:number-field-class-number-lmfdb -- --samples 5 --proof both \
  --require-sage --output /tmp/lmfdb-class-number-timings.json
```

Its receipt is the source of the per-case ratios and geometric-mean, median,
p90, p95, and worst-case figures below.  A timing claim made without this
matched prepared-field receipt is profiling evidence only, not P7 acceptance.

For every material gap, optimize in this order:

1. compare the mathematical algorithm and stopping criterion with PARI/Hecke;
2. remove redundant exact reconstruction, replay, and object conversion;
3. improve data layout and batching across runtime/native/Wasm boundaries;
4. compile only measured source-transparent kernels with exact fallbacks;
5. move unavoidable module compilation into release precompilation rather than
   charging the first mathematical request.

Any result slower than the matched Sage/PARI computation by more than one order
of magnitude needs a phase-level explanation and a tracked closure item.  An
unexplained gap of two orders of magnitude or more is a P7 blocker, even when
the answer and certificate are correct.

Profile complete computations before selecting kernels. Candidate packed,
host-independent kernels include:

- batches of element norms and divisibility/smoothness tests;
- factor-base valuations of a principal ideal;
- Minkowski lattice construction and short-vector scoring;
- modular sparse-row rank and pivot selection;
- large-prime relation matching;
- batched archimedean logarithms;
- proof-prime work planning.

Each compiled function retains a correct dynamic fallback, inspectable source
provenance, differential tests, and a representative benchmark. Native ABIs
pass packed arrays and matrices, never per-ideal host callbacks.

Exit criterion: optimized computations preserve exact serialized results and
show measured wins on bench-1 without worsening cold startup or the SEA size
budget materially.  On the pinned small-field corpus, warm class-number-only
requests have a same-host geometric-mean slowdown of at most 10x versus
Sage/PARI, no supported case exceeds 50x without a documented capability
boundary, and the two motivating cubics
`x^3 + 2*x + 1` and `x^3 - x^2 - 6*x - 12` are both within 10x in matched
`proof=False` mode.  Their matched `proof=True` paths are benchmarked against
`bnfcertify` and must also be within one order of magnitude before P7 is marked
complete.  These ratios exclude process and field construction on both sides;
cold process and cold field costs are reported separately and must not hide
behind the warm comparison.

### P8 — integration, documentation, and release gates

- Add user documentation explaining proof and GRH semantics.
- Add progress examples for long unconditional computations.
- Document resource limits and checkpoint files.
- Add API examples for generators, discrete logs, principality, units, and
  regulators.
- Add benchmark reports with exact revisions and result equivalence.
- Run strict Python formatting/typing and architecture gates.
- Validate exact commits on Linux x64/arm64, macOS arm64, and Windows x64.

Exit criterion: public documentation never describes a conditional group as
proved, and supported examples work from both source and release SEA builds.

## Oracle corpus

Maintain a versioned offline corpus containing at least:

- `QQ`;
- imaginary quadratic fields with cyclic and noncyclic groups;
- real quadratic fields with fundamental unit norm `+1` and `-1`;
- the discriminant-12 real quadratic motivating field;
- cubic fields of signatures `(3,0)` and `(1,1)`;
- quartic fields of signatures `(4,0)`, `(2,1)`, and `(0,2)`;
- the discriminant-380452 quintic of class group `C4`;
- class-number-one and nontrivial class groups;
- cyclic and noncyclic groups, including repeated invariant factors;
- unit ranks zero through at least four;
- large fundamental units;
- monogenic and nonmonogenic maximal orders;
- alternate defining polynomials for isomorphic fields;
- index-dividing, tamely ramified, and wildly ramified factor-base primes;
- fields where the GRH factor-base bound is much smaller than Minkowski;
- cases whose tentative relation lattice requires nontrivial saturation;
- controlled resource-limit and precision-escalation cases.

For each field store:

- polynomial, signature, maximal-order basis, and discriminant;
- Minkowski, Bach, and BDF bounds;
- factor-base prime-ideal fingerprints;
- class-group invariant factors and generator ideals;
- principal relation witnesses or their stable hashes;
- roots of unity, factored fundamental units, and regulator balls at 100 and
  200 bits;
- class-group discrete logs for selected ideals;
- conditional and unconditional proof metadata;
- Sage/PARI, Magma, and Hecke/Oscar versions and commands.

Committed tests consume the offline corpus and do not require external systems.

## Performance methodology

Measure separately:

- maximal-order preparation;
- factor-base planning and construction;
- initial relation generation;
- LLL/enumeration relation search;
- norm and smoothness testing;
- sparse modular rank work;
- exact HNF/SNF;
- unit extraction and regulator computation;
- saturation;
- unconditional proof;
- generator/map materialization;
- serialization and replay.

Report:

- exact polynomial, signature, discriminant, proof mode, and answer;
- relation and partial-relation counts;
- factor-base size and theorem;
- precision escalation history;
- cold and warm times;
- peak resident memory and checkpoint size;
- dynamic Sage.js, compiled Sage.js, Sage/PARI, Hecke/Oscar, and Magma where
  available;
- whether each comparison is unconditional, GRH-conditional, or heuristic.

The persistent comparison suite includes a versioned LMFDB sample stratified
by degree, signature, discriminant size, class number, class-group structure,
and unit rank.  It records per-case Sage.js, Sage/PARI, Hecke/Oscar, and Magma
answers where available, but performance ratios use same-host Sage/PARI so
machine differences cannot masquerade as algorithmic wins.  Report median,
geometric mean, p90, p95, and worst-case ratios, along with the dominant Sage.js
phase for every case above the 10x threshold.

Use `bench-1` for stable Linux x64 timings. Cross-platform machines validate
correctness and gross regressions rather than being combined into one speed
ranking.

Initial performance targets are directional, not release promises:

- the discriminant-12 real quadratic class number should be effectively
  immediate after field initialization;
- the motivating quintic should complete warm in well under one second in
  conditional mode and should have a practical unconditional proof;
- existing imaginary-quadratic timings through discriminant magnitude `10^9`
  should not regress materially;
- requesting only a class number should avoid expensive generator expansion;
- certificate replay should be substantially cheaper than relation discovery.

The P7 competitive ratios above are completion gates rather than directional
targets.  A correct but thousand-times-slower small-field implementation is an
important correctness milestone, not a completed production algorithm.

## Correctness and certificate tests

Every relation certificate verifier independently checks:

- field and maximal-order identity;
- factor-base prime ideals and indices;
- sparse exponents;
- the factored principal element;
- equality of the reconstructed ideal and principal ideal;
- archimedean data only when relevant to the claimed regulator result.

Every class-group verifier checks:

- exact relation matrix and its rank;
- HNF/SNF and transformation identities;
- invariant-factor divisibility;
- generator orders and spanning;
- forward/inverse map consistency;
- selected random and adversarial ideal discrete logs;
- proof theorem, bound, and every required proof-prime record.

Every unit-group verifier checks:

- exact norm `+/-1` and integrality;
- torsion order;
- logarithmic rank;
- regulator determinant enclosure;
- saturation evidence;
- compatibility with dependent relation rows.

Mutation tests change one item at a time: polynomial, order basis,
discriminant, prime ideal, exponent, witness factor, relation row, HNF/SNF
entry, generator, unit, regulator enclosure, factor-base bound, proof label,
or checked-prime range. Each mutation must be rejected.

## Important risks and mitigations

### Class groups and units are accidentally separated

Risk: duplicate relation searches, inability to prove completeness, or circular
regulator logic.

Mitigation: one shared `ClassUnitGroupContext` is a non-negotiable foundation.

### Expanded principal generators explode

Risk: memory and serialization become dominated by huge coefficients.

Mitigation: implement factored elements before public maps and preserve them
through ideal reduction and exponentiation.

### A conditional result poisons an unconditional cache

Risk: later `proof=True` returns a GRH-conditional answer.

Mitigation: proof status and factor-base theorem are immutable cache keys;
upgrading produces a separately recorded proof state.

### Arb arithmetic is mistaken for a complete proof

Risk: finite arithmetic balls omit zeta truncation or prime-tail errors.

Mitigation: `zeta_log_residue` must include analytic tail bounds and exposes
them separately in diagnostics.

### Exact ideal arithmetic is correct but too slow

Risk: colon-ideal inversion, repeated HNF, or host object creation dominates.

Mitigation: profile complete computations; add compact two-generator ideals,
reduction, and packed batch kernels only where measurements justify them.

### Dense relation matrices exhaust memory

Risk: converting sparse relations to dense FLINT matrices too early dominates
time and space.

Mitigation: modular sparse screening and incremental reduction precede exact
HNF/SNF; resource plans reject impossible workloads before allocation.

### Unconditional proof is unexpectedly expensive

Risk: Sage-compatible default proof mode appears hung.

Mitigation: visible progress, cancellation, resumable checkpoints, preflight
estimates, and documentation comparing `proof=True` with `proof=False`.

### A direct Hecke translation inherits Julia-specific assumptions

Risk: object-heavy code performs poorly or relies on Nemo behavior Sage.js
does not share.

Mitigation: translate mathematical stages and invariants, not the Julia object
model; retain independent exact Sage.js tests for every boundary.

### Cross-platform native drift

Risk: integer widths, compiler behavior, or a new dependency breaks Windows.

Mitigation: add no new native dependency unless unavoidable; use existing
FLINT/GMP/Arb, fixed-width packed ABIs, and exact-SHA four-platform receipts.

## Completion criteria

This project is complete when:

- real and imaginary quadratic fields have complete specialized class and unit
  algorithms;
- the motivating real quadratic and quintic examples return `1` and `4`
  unconditionally;
- general maximal orders in the documented domain return exact class-group
  presentations, ideal maps, fundamental units, and regulator enclosures;
- GRH-conditional and unconditional modes are both implemented and cannot be
  confused;
- all generator ideals, relation witnesses, and unit generators replay
  exactly;
- principality and discrete-log maps work for arbitrary supported fractional
  ideals;
- rigorous `h*R` validation and saturation establish completeness;
- benchmarks identify the dominant costs and optimized kernels preserve the
  readable dynamic implementation;
- Sage/PARI, Hecke/Oscar, and Magma agree throughout the offline corpus;
- strict Python, architecture, native, release, and exact-SHA cross-platform
  gates pass;
- implementation, documentation, corpus, and benchmark changes are committed
  and pushed with a clean worktree.

## Primary references

- Hecke class/unit implementation:
  `/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/Clgp.jl` and
  `/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/Clgp/`
- Hecke factor-base bounds:
  `/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/FactorBaseBound.jl`
- Hecke rigorous zeta residue:
  `/home/user/upstream/Hecke.jl/src/NumFieldOrd/NfOrd/Zeta.jl`
- PARI general Buchmann engine:
  `/home/user/upstream/pari-2.18.1.alpha/src/basemath/buch2.c`
- PARI quadratic class/unit engine:
  `/home/user/upstream/pari-2.18.1.alpha/src/basemath/buch1.c`
- Sage compatibility layer:
  `/home/user/sagelite/src/sage/rings/number_field/number_field.py`
- Sage.js existing global arithmetic plan:
  `agents/algebraic-number-field-computational-foundations-plan.md`
- Henri Cohen, *A Course in Computational Algebraic Number Theory*.
- Eric Bach, *Explicit bounds for primality testing and related problems*.
- Belabas, Diaz y Diaz, and Friedman, *Small generators of the ideal class
  group*.
- Buchmann and McCurley on subexponential class-group and regulator
  computation.
