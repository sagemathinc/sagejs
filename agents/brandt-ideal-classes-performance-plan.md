# Competitive integral Brandt ideal classes

## Status

This is the performance plan for the exact integral realization

```sage
BrandtModule(D, N, realization="ideal-classes")
```

implemented on `feature/general-brandt-modules`. It does not change the
mathematical scope or make the ideal-class realization the default. The fast
Jacquet--Langlands and supersingular realizations remain the right choices for
users who need only the rational Hecke representation or the prime-level
supersingular graph.

The starting point is the source-pinned Linux x64 receipt
`bench/results/brandt-ideal-classes-competitive-linux-x64-2026-08-28.json`,
whose implementation source is commit `3d65fd23`. Sage.js, SageMath, and Magma
produce exactly the same complete Hecke characteristic polynomials on the
receipt corpus. The issue addressed here is performance, not a known
correctness defect.

The implementation program is now active on `feature/general-brandt-modules`.
Commits `0478c3e7` and `56350fad` implement Phases 0--6: the named-stage
profiler, immutable reduction plans, theta indexing, direct witness replay,
traversal reuse, exact recursive enumeration, direct projective neighbors,
the independent Brandt-series path, compiled exact rank-$4$ kernels, and the
compact detached row representation. The final source-frozen competitor and
cross-platform receipts remain the release boundary; diagnostics are not
silently promoted to acceptance evidence.

The frozen $(37,2,3)$ combined resident time has fallen from about
$64.649\,\mathrm{s}$ to $2.4$--$3.0\,\mathrm{s}$ depending on profiling and
host noise, with unchanged complete operator and pairing digests. The direct
first $T_3$ is $0.42$--$0.51\,\mathrm{s}$. The required $h\ge100$ row
$(101,11,2)$ completes exactly (100 classes, mass 100, row sum 3) in a
one-sample diagnostic of about $94.7\,\mathrm{s}$. These are substantial
algorithmic results, but the final $2\times$ Magma gate is still expected to
be an honest measured miss rather than a reason to weaken the integral
contract.

## Executive decision

Make the integral backend competitive by attacking three layers in this
order:

1. eliminate repeated proof, reduction, and publication work in the ordinary
   Python implementation;
2. replace full-box short-vector search with a rigorous quaternary-lattice
   enumerator and add both direct-neighbor and Brandt-series Hecke algorithms;
3. compile only the remaining measured exact recurrence, using the accepted
   C1--C3 native machine-model surface and mature FLINT operations.

Do not respond to the current $100\times$ gap by writing a second quaternion
algorithm in C, weakening ideal-equivalence proofs, returning only a spectral
surrogate, hiding precomputed classes in the cold benchmark, or building a
new capsule/arena/map system.

The desired final claim is deliberately narrow and strong:

> On a source-pinned equal-contract corpus, Sage.js resident construction of
> genuine Eichler right-ideal classes and the first complete good-prime Brandt
> operator is within $2\times$ Magma, with exact witnesses and detached replay.

Raw command-line startup, cached operator lookup, spectral-only construction,
and component-group postprocessing are reported separately and are not used to
manufacture that claim.

## The measured gap

The frozen receipt contains the following resident stage times.

| $(D,N,\ell)$ | Sage.js order | Sage.js classes | Sage.js first $T_\ell$ | Sage.js cached $T_\ell$ | SageMath classes | SageMath first $T_\ell$ | Magma classes | Magma first $T_\ell$ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| $(11,2,3)$ | $0.825$ s | $15.771$ s | $12.291$ s | $0.064$ ms | $0.156$ s | $0.026$ s | $0.14$ s | below $0.01$ s |
| $(37,2,3)$ | $0.649$ s | $34.980$ s | $29.669$ s | $0.062$ ms | $0.064$ s | $0.094$ s | $0.28$ s | below $0.01$ s |

Thus class construction alone is about $113\times$ and $125\times$ the
timer-resolved Magma construction time. The two-case fresh-process wall time is
$98.394$ s for Sage.js, $1.657$ s for SageMath, and $0.620$ s for Magma. Magma's
displayed zero for the operator is a timer-resolution statement, not zero
cost, so no finite first-operator ratio may be inferred from that row.

Two conclusions are already firm:

- cached operator access and characteristic-polynomial construction are not
  the problem; and
- almost all useful work belongs in cold class enumeration and first-time
  neighbor classification. Sparse-matrix publication becomes relevant only
  at substantially larger class number.

## Source-level diagnosis to verify

The following are code-backed hypotheses, not substitutes for the Phase 0
profile.

### Repeated lattice setup

Every call to `_enumerate_lattice_by_norm` currently:

1. canonicalizes the lattice again;
2. creates rational quaternion and matrix objects;
3. computes a pure-Python Gram-LLL transform;
4. recomputes the reduced Gram matrix and its inverse;
5. visits a Cartesian product of independent coordinate bounds; and
6. constructs a quaternion object for every accepted vector.

The same ideal is enumerated for theta filters, unit weights, fingerprints,
and equivalence witnesses. Extending a theta vector from precision $8$ to $12$
and then $16$ repeats earlier enumeration instead of extending one reduction
plan.

### Classification work grows unnecessarily

`EichlerIdealClassSet._classify_in` linearly scans all known representatives.
Theta vectors are a sound negative filter, but there is no fingerprint index.
When a theta vector collides, `is_equivalent` builds the connecting lattice,
enumerates it, and constructs a complete temporary `QuaternionRightIdeal` for
each possible witness merely to compare canonical basis rows.

### Neighbor setup and traversal are discarded

`cyclic_right_subideals` rediscovers local splitting elements for each ideal,
examines a quadratic-size parameter family before retaining $\ell+1$
neighbors, repeatedly constructs checked public ideal objects, and performs
matrix inversions one object at a time.

The class-set traversal already computes and classifies many of the same
neighbors needed for the first Hecke operator. That classified graph is then
discarded. `hecke_matrix` regenerates the neighbor ideals and classifies them
again.

### Generic exact objects dominate small fixed-dimensional work

Quaternion lattices always have rank $4$, yet the hot path repeatedly moves
through general rational matrices, general vectors, public quaternion objects,
HNF, inversion, and string formatting. The public types are useful interfaces;
they should not be mandatory transient representations for every inner-loop
coordinate operation.

## Definition of equal work

The benchmark contract must be fixed before optimization.

### Cold class-set row

Starting from a resident Sage.js evaluator with no Brandt cache, construct:

- the definite rational quaternion algebra of discriminant $D$;
- a genuine Eichler order of conductor $N$;
- one verified representative of every locally principal right ideal class;
- exact unit weights;
- a mass-completion certificate; and
- detached canonical fingerprints sufficient for independent replay.

The timed function returns the complete class-set object. First observation,
full serialization, and detached certificate verification are timed and
reported separately.

### First-operator row

Given the completed class set but no cached operator, construct the complete
integral matrix of $T_\ell$. The result must include every edge multiplicity,
not only its characteristic polynomial. Observation and exact cross-system
normalization happen after the elapsed time is captured.

### Competitor timing

Magma uses `BrandtModule(D,N : ComputeGrams := true)` followed by
`HeckeOperator(B,ell)`. SageMath constructs `right_ideals()` followed by
`hecke_matrix(ell)`. For sub-$10$ ms Magma stages, the harness must repeat
fresh modules or fresh uncached operators enough times that every accepted
sample is at least $100$ ms, then divide by the exact repeat count. Separate
processes or an explicit cache audit must prove that the repetition did not
turn a cold row into a global-cache lookup. A displayed timer zero is never
assigned a speed ratio.

The primary comparison is single-core. Parallel Sage.js and parallel
competitor rows may be reported separately, with CPU and wall time both
visible.

### Results that must agree

Each row records and verifies:

- class count and exact mass;
- unit-weight multiset and pairing matrix;
- canonical class fingerprints;
- every Hecke matrix entry and row sum;
- weighted adjointness;
- characteristic polynomial;
- Atkin--Lehner data where applicable; and
- an independently replayed ideal-equivalence witness sample.

The Jacquet--Langlands backend remains an independent spectrum oracle. It is
not an equal-contract performance competitor for integral ideal classes.

## Phase 0 — measurement and direct ceilings

Add an opt-in stage profiler with counters and exclusive wall/CPU time for:

- lattice canonicalization, denominator clearing, HNF, inversion, and LLL;
- norm-enumerator setup, recursion nodes, exact norm tests, and returned
  vectors;
- theta requests, cache hits, extensions, and coefficients recomputed;
- class-index probes, theta-bucket sizes, equivalence attempts, and positive
  witnesses;
- public ideal construction, right-order closure checks, local-principality
  replay, and theorem-derived construction;
- left-order construction and norm-$1$ unit enumeration;
- local splitting setup, projective candidates, neighbor HNFs, and duplicate
  candidates;
- traversal edges generated, classified, retained, reused, and regenerated;
  and
- public-object publication, first observation, serialization, and detached
  replay.

Also record maximum coefficient bit length, allocated exact entries, V8 heap,
external memory, `ArrayBuffer` memory, and process RSS. Profiling is disabled by
default and must not add a counter update to the production inner loop.

Construct three ceilings for the rank-$4$ short-vector problem:

1. the current readable implementation;
2. a mature-library Gram-LLL where its exact contract matches this quadratic
   form, plus an ordinary-Python recursive enumerator; and
3. a source-transparent `@native` recurrence using `NativeIntegerVector`.

The ceiling benchmark includes setup and publication, not just the innermost
norm update. Generated C, dynamic JavaScript, native Node, and Wasm results must
have identical coordinate-vector or theta-count digests.

Exit gate: at least $90\%$ of the resident class-plus-first-operator time is
attributed to named stages, and the direct ceiling identifies whether the
remaining gap is algorithmic, representation-bound, or compiler-bound.

## Phase 1 — remove duplicated semantic work

This phase stays in ordinary Python and should land before a new native kernel.

### Cache immutable rank-$4$ plans

Give every ideal one internal immutable reduction plan containing:

- primitive integer row-HNF data and one positive denominator;
- the normalized integral Gram numerator and denominator;
- a verified unimodular LLL transform and reduced Gram matrix;
- norm and determinant data; and
- the theta coefficients already proved.

Public quaternion bases and general matrices are reconstructed lazily. The
canonical authority remains detached integer/rational data, never a native
pointer or mutable cache.

Theta extension reuses the plan and never recounts a coefficient already
published. `gram_matrix`, `reduced_basis`, `norm`, `left_order`, and
`unit_weight` cache their exact immutable results.

### Index representatives by safe filters

Maintain a dictionary from the current theta prefix and cheap exact lattice
invariants to candidate class indices. Start at a small precision and extend
only collision buckets. A filter may reject a class; it may never prove a
positive equivalence.

Positive classification still returns a connecting quaternion and replays

$$
I = \alpha J
$$

as an exact equality of canonical lattices.

### Avoid proof-object reconstruction

When an equivalence search finds $\alpha$, compute and canonicalize the four
rows $\alpha J$ directly. Do not construct a public right ideal merely to ask
for its private basis rows. The final equality and connecting quaternion are
the same certificate as before.

Similarly, add a private theorem-derived neighbor factory. The public
`QuaternionRightIdeal` constructor continues to validate arbitrary input in
full. A neighbor derived from a checked local cyclic submodule may avoid
repeating all $16$ right-closure membership tests, provided its derivation data
is retained and final representatives pass detached full replay.

### Reuse traversal edges

During mass-complete class enumeration, retain every classified edge already
computed at the traversal prime. After deterministic representative sorting,
remap those edges to final indices. Generate only missing rows when the first
$T_\ell$ requests that same prime.

Cache local splitting data by exact order fingerprint and prime. Do not search
for the same $\alpha,\beta$ basis independently for each ideal.

Exit gate: at least a $3\times$ improvement in combined class construction and
first $T_3$ for $(37,2)$, no result or certificate change, and no regression
above $5\%$ on the scaling corpus. If this phase does not move the total, stop
and use its counters to revise Phase 2 rather than adding more caches.

## Phase 2 — rigorous quaternary short-vector enumeration

The present independent-coordinate box is the wrong asymptotic algorithm for
a correlated positive definite form. Replace it with an exact recursive
Fincke--Pohst-style enumeration specialized only by dimension $4$, not by
particular Brandt parameters.

For a lattice with rational Gram matrix $G$, clear one positive denominator
and work with a primitive integral form $A$. Compute an exact LLL transform
$U$, then authenticate

$$
UGU^{\mathsf T}=G', \qquad \det(U)=\pm1.
$$

First audit the existing FLINT LLL declaration: Euclidean row-basis LLL is not
automatically the same operation as reduction relative to an arbitrary Gram
form. Use a reviewed FLINT Gram-mode declaration if its contract matches;
otherwise retain the exact same-source reducer until a mature matching
boundary exists. Never substitute a superficially similar LLL operation.

Use an exact $LDL^{\mathsf T}$ decomposition of $G'$ to enumerate coordinates
recursively. Approximate square roots may suggest conservative integer
intervals, but pruning and acceptance use exact rational inequalities. The
enumerator has three modes sharing one recurrence:

- count all vectors by normalized norm for a theta prefix;
- yield vectors of one exact norm for unit or equivalence witnesses; and
- stop after the first verified witness.

For theta counting, increment coefficients directly from coordinate norms;
do not construct a `QuaternionElement` for each vector. Construct the single
connecting quaternion only after an equivalence vector is accepted.

All searches take explicit node, coefficient-bit, and result limits. Exhaustion
raises a stable resource error and never means “not equivalent.” Enumeration
order is deterministic so receipts and cancellation tests are reproducible.

Exit gate:

- exact vector sets agree with exhaustive enumeration on thousands of small
  forms, including automorphism-rich and badly reduced examples;
- theta vectors, unit weights, class partitions, and witnesses remain exact;
- the enumerator visits at most $20\%$ of the old Cartesian candidates on the
  receipt corpus; and
- combined $(37,2)$ construction plus first $T_3$ is below $3$ s, or the
  profile proves that short-vector search is below $20\%$ of the remaining
  time.

## Phase 3 — generate exactly $\ell+1$ neighbors

The local split algebra is isomorphic to $M_2(\mathbf F_\ell)$. Build and
verify that isomorphism once for each order and good prime, then enumerate the
$\ell+1$ points of $\mathbf P^1(\mathbf F_\ell)$ directly. Do not scan a
quadratic parameter rectangle and discard all but $\ell+1$ rank-$2$
submodules.

For one source ideal:

1. compute its two local action matrices in one batch;
2. derive the $\ell+1$ cyclic submodules from projective lines;
3. form all candidate integer generator matrices;
4. canonicalize the batch by exact HNF;
5. reject duplicate HNFs as an internal assertion; and
6. classify directly into a sparse multiplicity row.

The Hecke path should not retain $h(\ell+1)$ heavyweight public ideal objects
unless the caller explicitly asks for `neighbors(ell)`. It retains compact
canonical rows and exact derivation records; public ideals are materialized
lazily.

Exit gate: neighbor construction is $O(\ell)$ after local setup, every row has
sum $\ell+1$, all old and Magma matrices agree, and neighbor generation is
below $20\%$ of first-operator time on the receipt corpus.

## Phase 4 — support both Hecke algorithms

One method is not optimal for every class number, prime, or number of requested
operators.

### Direct graph algorithm

Use the optimized $\ell+1$ neighbors, theta index, and exact equivalence
witnesses. This is normally best for one or a few operators when the class
number $h$ is large. It also exposes the actual sparse graph.

### Brandt-series algorithm

For small $h$ or many requested operators, compute the lower-triangular family

$$
I_i\overline{I_j}, \qquad 0\le j\le i<h,
$$

enumerate their theta coefficients in batches, and recover matrix entries with
the exact unit-weight normalization. One theta prefix then supplies many
$T_n$. This mirrors the classical alternative present in SageMath and gives an
independent Sage.js differential for the direct graph.

Expose `algorithm="direct"`, `algorithm="brandt-series"`, and
`algorithm="auto"`. Automatic selection uses a checked-in, source-bound cost
model over $(h,n,\text{number of requested operators})$ and falls back safely
outside its measured envelope. It is not selected merely because native code
is available.

Exit gate: both algorithms return exactly the same complete matrices on their
overlap corpus; the faster measured strategy is chosen on at least $95\%$ of
the calibration rows; and first $T_3$ for $(37,2)$ is below $0.5$ s before
cached lookup.

## Phase 5 — evaluate the accepted native exact workspace

Only after Phases 1--4 produce a new stage profile should the remaining exact
recurrence move to `@native`.

The first witness uses only the accepted C1--C3 surface:

```python
with NativeIntegerVector(capacity, memory_limit) as state:
    state[i] = value
    state.addmul(i, left, right)
    state.submul(i, quotient, pivot)
    state.swap(i, j)
```

The intended kernel is the recursive rank-$4$ norm enumerator or another
profile-proven fixed-coordinate recurrence. It receives one authenticated
primitive integral Gram form, mutates exact live coordinates without repacking
inside the search, and publishes one bounded caller-owned result at the end.

Use mature FLINT for HNF and for LLL only where the declared operation matches
the required Gram-form contract. Do not reimplement either merely to exercise
the compiler. Do not require deferred arenas, maps, sets, or owned aggregates.
If C1--C3 cannot express a safe bounded output, keep result collection outside
the kernel and accelerate only a batch whose boundary cost is measured below
$10\%$.

Required evidence:

- the same ordinary Python body runs dynamically;
- generated JavaScript, isolated C, native Node, standalone C, and Wasm agree;
- `native explain`, IR, C, and headers show one import, no host callback, and
  deterministic cleanup;
- zero, negative, large-limb, alias, overflow, capacity, cancellation, and OOM
  cases pass; and
- full setup, result publication, first observation, and detached replay are
  included in the end-to-end profile.

Retain the native path only if the replaced phase improves by at least $2\times$
and the complete representative workload improves by at least $20\%$. A fast
kernel hidden behind dominant packing is rejected.

## Phase 6 — compact exact rank-$4$ representation

If profiling still shows general-object publication as material, introduce one
mathematics-specific internal value representation:

$$
L=(d,H),
$$

where $d>0$ is a denominator and $H\in M_4(\mathbf Z)$ is primitive row-HNF.
Equality, hashing, containment setup, products, and Gram construction operate
from $(d,H)$. Public bases remain ordinary quaternion elements reconstructed
on demand.

This is not a generic arena or opaque capsule. It is immutable detached
mathematical data with a straightforward CPython representation. Any live
FLINT matrix or native vector is an acceleration cache authenticated by
$(d,H)$ and safe to discard.

Batch operations should cross each boundary once per frontier, class row, or
theta family—not once per scalar entry. Demanding one ideal or one matrix row
must be $O(1)$ in the retained batch size.

Exit gate: publication and first observation together are below $10\%$ of
resident arithmetic time, and mutation, transplant, close/recreate, hash,
serialization, and reference-replay tests all pass.

## Phase 7 — component groups and larger sparse modules

Once class construction and first Hecke matrices are competitive, rerun the
component-group pipeline without changing its exact integral contract. The
degree-zero lattice, monodromy pairing, Smith form, and Frobenius action must
consume the same canonical class order and weights.

For large $h$, keep Hecke operators sparse through restriction and only form a
dense matrix where SNF or characteristic-polynomial code truly requires it.
This phase has its own profile; the current tiny charpoly timings are not a
reason to optimize dense linear algebra prematurely.

## Benchmark corpus

### Acceptance rows

At minimum include:

- $(11,2)$ and $(37,2)$ with $T_3$, preserving the frozen baseline;
- a prime-level order with nontrivial automorphism weights;
- a theta-collision case that forces positive equivalence replay;
- composite discriminant/conductor cases $(30,7)$ and $(66,5)$;
- primes $\ell=2,3,5$ whenever coprime to $DN$;
- one medium case with $h\ge 25$ and one scaling case with $h\ge 100$; and
- a sequence of first operators followed by cached repeats.

The exact values of larger rows are frozen only after all three systems finish
and complete matrix digests agree. An input is not retained merely because it
makes Sage.js look favorable.

### Sample policy

- At least $7$ measured samples and $2$ warmups for resident stages.
- Every competitor sample is timer-resolved; use bounded repetitions when
  necessary.
- Median, minimum, maximum, MAD, wall, user CPU, system CPU, and peak RSS are
  recorded.
- The host is idle, versions and source hashes are exact, and raw outputs are
  retained.
- Cold class-set, first operator, cached operator, first observation, forced
  materialization, and detached verification remain separate rows.

### Performance gates

The cumulative gates are:

1. Phase 1: at least $3\times$ faster on combined $(37,2)$ class construction
   plus first $T_3$.
2. Phase 2/3: combined time below $3$ s and no stage above $10\times$ Magma on
   the medium corpus.
3. Phase 4/5: combined resident time within $3\times$ Magma on every accepted
   row and within $2\times$ on the median row.
4. Final: within $2\times$ Magma on every timer-resolved primary resident row,
   or an explicitly named row is published as an honest miss with complete
   attribution.

For the original cases, the target envelope is approximately $0.3$ s combined
at $(11,2)$ and $0.6$ s combined at $(37,2)$, subject to the corrected
timer-resolved Magma rerun.

Fresh-process wall time is always reported. Because Sage.js evaluator startup
is shared infrastructure rather than Brandt arithmetic, the primary arithmetic
gate is resident. A separate startup-adjusted row subtracts an empty evaluator
with the identical imports. Neither row may be described as raw command-line
parity unless it actually is.

Memory is assessed both as raw peak RSS and as incremental peak over the empty
resident evaluator. The target is no more than $2\times$ Magma's incremental
memory for the mathematical stage and no unbounded growth across $100$ fresh
class sets in one process.

## Correctness and adversarial program

Every optimization must preserve or strengthen these checks:

- arbitrary user-supplied ideals still receive full right-ideal and local-
  principality validation;
- theorem-derived fast construction is unforgeable from public state and has
  detached replay;
- canonical scaling cannot change normalized norms, class, or pairing;
- approximate interval calculations can only enlarge an enumeration range;
  exact arithmetic decides pruning and acceptance;
- theta vectors remain negative filters, never positive equivalence proofs;
- every positive equivalence has a connecting quaternion;
- mass completion cannot be satisfied by a wrong weight or duplicate class;
- direct and Brandt-series matrices agree entry by entry;
- weighted adjointness and all row sums hold;
- cache keys bind $D$, $N$, order basis, orientation convention, algorithm,
  source identity, and requested precision;
- cancellation or resource exhaustion publishes no class, edge, matrix,
  certificate, or cache entry; and
- hostile mutation of returned rows or diagnostics cannot alter internal
  authority.

Run exhaustive small-order comparisons, randomized equivalent scalings,
non-equivalent theta collisions, malformed HNFs, denominator stress, large
coefficient limbs, resource-bound failures, and repeated close/recreate cycles.

## Architecture constraints

- Mathematical source remains ordinary CPython-parseable Python.
- Source-transparent `@native` lowers the actual typed recurrence; no
  function-name replacement is allowed.
- FLINT declarations are preferred for mature HNF and LLL operations.
- Generated cores contain no Python, JavaScript, Node-API, or host callbacks.
- Canonical integer/rational payloads remain semantic authority.
- Native and Wasm paths have correct dynamic fallbacks.
- Windows x64, Linux x64, Linux arm64, macOS arm64, and browser Wasm are in the
  release matrix.
- Automatic native selection is receipt-backed and fail-closed. An explicit
  native-required developer mode remains available for receipt collection
  without silently widening public `auto`.
- No handwritten mathematical C/C++ is added without a measured compiler
  limitation, architecture exception, independent oracle, and portability
  plan.

## Likely source and test changes

The exact diff should follow profiles, but the intended ownership is:

```text
src/lib/sagejs/quaternion_algebras/
  algebra.py                 canonical rank-4 lattice operations
  ideals.py                  reduction plans, enumeration, neighbors
  class_set.py               indexed classification and graph reuse

src/lib/sagejs/modular_forms/
  brandt.py                  algorithm selection and public options
  component_groups.py        sparse downstream consumption, if measured

bench/modular/brandt-ideal-classes/
  profile.cjs                stage/counter diagnostics
  competitive.cjs            source-pinned equal-contract runner
  sage-oracle.py
  magma-oracle.m

test/
  quaternion-ideal-classes.cjs
  brandt-modules.cjs
  brandt-component-groups.cjs
  brandt-ideal-performance.cjs
```

Package budgets, native-kernel registry entries, and release receipt policy are
changed only with measured source deltas and the corresponding focused tests.

## Commit sequence

Keep review and bisection boundaries small:

1. stage profiler, corrected timer-resolved competitor harness, and frozen
   expanded corpus;
2. immutable reduction plans, theta/index caches, and direct witness replay;
3. traversal-edge and local-splitting reuse;
4. exact recursive quaternary enumerator with exhaustive differential tests;
5. direct $\mathbf P^1(\mathbf F_\ell)$ neighbor generation;
6. Brandt-series operator and measured algorithm selector;
7. the narrow `NativeIntegerVector` witness, only if retained by its gates;
8. compact rank-$4$ internals, only if publication remains material;
9. component-group scaling and sparse downstream work;
10. source-frozen Linux competitor receipt and cross-platform release receipts.

After every retained mathematical step, run focused dynamic/native/Wasm
differentials, strict Python, architecture checks, and the representative
benchmark subset. A performance commit that changes an exact digest is a
correctness failure, not a promising optimization.

## Stop and rollback conditions

Reject or revert a change when:

- it improves only a kernel while making the complete semantic pipeline
  slower;
- it moves observation or proof work outside only the Sage.js timer;
- it depends on a hidden process cache or precomputed class table;
- it weakens positive equivalence, local-principality, mass, or pairing proof;
- it introduces floating-point authority at an exact boundary;
- it needs deferred C4/C5 ownership or map machinery without a new measured
  justification;
- it regresses any accepted case by more than $5\%$ without a larger justified
  win; or
- its memory use, cancellation latency, or cleanup cannot be bounded.

## Definition of done

This performance program is complete when:

- the source-current profiler attributes at least $90\%$ of every primary row;
- genuine ideal classes, weights, matrices, witnesses, and certificates agree
  across Sage.js paths and with SageMath/Magma oracles;
- direct and Brandt-series algorithms are both public, documented, and exact;
- the retained native recurrence uses only accepted machine-model features and
  has dynamic/native/standalone/Wasm evidence;
- resident construction plus first operator meets the final $2\times$ Magma
  gate, with any exception labeled as an honest measured miss;
- process-cold and memory results remain visible without being conflated with
  resident arithmetic;
- component-group consumers reproduce their exact previous results;
- focused, strict, architecture, unit, native, portable, cancellation,
  sanitizer, and cross-platform checks pass; and
- a durable source-pinned JSON receipt plus readable report supersedes the
  2026-08-28 baseline without rewriting it.

## Immediate next experiment

Implement only Phase 0 and the smallest part of Phase 1 first. On $(37,2,3)$,
measure the independent effects of:

1. caching one reduction plan per ideal;
2. theta-prefix indexing;
3. direct canonical replay of $\alpha J$ without temporary ideal construction;
4. caching order/prime local splitting data; and
5. retaining traversal classifications for the first $T_3$.

Keep a change only when exact matrix, pairing, mass, class fingerprints, and
witness replays remain identical. That experiment will tell us how much of the
$100\times$ gap is avoidable host work before the new exact workspace is asked
to solve the genuinely arithmetic remainder.

## References and implementation oracles

- SageMath's `sage.modular.quatalg.brandt` provides independent direct-neighbor
  and Brandt-series algorithms, theta indexing, and prime-discriminant ideal
  classes. Sage.js should learn from those algorithmic divisions while
  retaining its own exact certificates and general squarefree $D$ support.
- Markus Kirschmer and John Voight,
  [*Algorithmic enumeration of ideal classes for quaternion orders*](https://arxiv.org/abs/0808.3833),
  including the published corrigendum, is the primary class-enumeration
  reference.
- John Voight, *Quaternion Algebras*, supplies the order, ideal, mass,
  equivalence, local-neighbor, and Brandt-matrix contracts.
- [Magma's Brandt-module handbook](https://docs.magma-maths.org/ModularArithmeticGeometry/BrandtModules/ModBrdt:brandt-modules.html)
  defines the independent executable oracle and competitor surface.
- `agents/brandt-ideal-classes-and-component-groups-plan.md` records the
  completed mathematical implementation and proof contract.
- `/home/user/sagejs-class-group/agents/native-mathematical-machine-model-sprint-plan.md`
  records the accepted C1--C3 exact-workspace surface and the deferred C4/C5
  machinery.
