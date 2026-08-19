# Fast certified group structure for genus-2 and genus-3 Jacobians

## Status

Implemented on the `higher-genus` branch on 2026-08-19. All eight phases are
covered:

- squarefree/cyclic deductions, checked factorization, and cached witnesses;
- fast point-sum and full-support covering samplers;
- Sutherland primary-basis construction and bounded recursive vector DLP;
- certified generators, explicit forward/inverse maps, and replayable
  versioned JSON certificates;
- monic-`u` enumeration with exact factor/Hensel/CRT lifting;
- a profiled one-crossing native genus-3 batch-sum primitive, retaining the
  ordinary-Python fallback.

The deterministic SageMath/Magma oracle scripts, focused randomized/exhaustive
tests, and machine-readable benchmark receipt live under `bench/hyperelliptic`,
`bench/results`, and `test/hyperelliptic-jacobian-group-structure.cjs`.
The seeded Linux x86-64 receipt records 0.091 seconds for the order-2,160
`GF(13)` structure and 0.048 seconds for the order-6,490 `GF(19)` basis after
the exact group orders are known. Four-platform native receipts are recorded
in the implementing commit and continuous-integration handoff.

## Purpose

Replace complete Jacobian enumeration as the general implementation of
`J.group_structure()` and `J.abelian_group()` with an exact, bounded, Las Vegas
finite-abelian-group algorithm.

The immediate motivating examples are

```sage
sage: R.<z> = PolynomialRing(GF(13))
sage: J = HyperellipticCurve(z^7 + 2*z + 1).jacobian()
sage: J.order()
2160
sage: J.group_structure()
(2160,)
```

and

```sage
sage: R.<z> = PolynomialRing(GF(19))
sage: J = HyperellipticCurve(z^7 + 2*z + 1).jacobian()
sage: J.order()
6490
sage: J.group_structure()
(6490,)
```

The current exhaustive algorithm considers

\[
1+q^2+q^4+q^6
\]

raw `(u,v)` coefficient pairs before testing the Mumford relation. This is
4,855,540 candidates at `q=13` and 47,176,564 at `q=19`, even though the
groups contain only 2,160 and 6,490 elements. The second example therefore
hits the default five-million-candidate guard.

Neither group needs enumeration. The order 6,490 is squarefree, so every
abelian group of that order is cyclic. For the order 2,160, one sampled
element of exact order 2,160 proves cyclicity; the proportion of generators
in a cyclic group of that order is `phi(2160)/2160 = 4/15`.

The intended result is not a heuristic answer. Random choices affect only
runtime. Every returned structure, generator, coordinate map, and certificate
must be exactly verified. Exhausting a caller-specified budget raises a
resource exception and never becomes a mathematical answer.

## Why this is the right next step

Most required primitives now exist in Sage.js:

- exact Jacobian orders from local Frobenius polynomials;
- bounded integer factorization and caller-supplied factorizations;
- canonical reduced Mumford divisors;
- an ordinary-Python generalized Cantor law;
- native genus-3 divisor validation and scalar multiplication;
- native factor-and-strip element-order certificates;
- deterministic divisor serialization;
- complete small-group enumeration and explicit maps as a correctness oracle;
- smalljac invariant factors for supported odd-degree genus-2 curves.

The missing layer is generic finite-abelian-group basis construction. This is
substantially smaller than a new point-counting algorithm and immediately
turns the accelerated divisor arithmetic into a useful research feature.

## Existing implementations and algorithmic references

### SageMath

Current SageMath already uses the appropriate strategy for general
hyperelliptic Jacobians over finite fields. Its implementation is the primary
open-source behavioral oracle:

- `sage/schemes/hyperelliptic_curves/jacobian_homset_generic.py` implements
  `abelian_group()` by sampling Jacobian elements, constructing a subgroup
  basis, and stopping only when the subgroup order equals the independently
  known Jacobian order.
- Its fast sampler adds `2g+1` rational curve points.
- Its covering sampler chooses monic `u` polynomials and lifts solutions of
  the Mumford congruence. This gives support on every reduced divisor.
- `sage/groups/additive_abelian/additive_abelian_wrapper.py` implements basis
  construction from sampled generators by splitting into primary components,
  solving vector discrete logarithms in finite abelian `p`-groups, expanding
  the primary bases, and recombining them into invariant factors.

The relevant mathematical basis algorithm is Andrew Sutherland's Algorithm
9.1 and Remark 9.1 in *Order Computations in Generic Groups*, and the more
focused treatment in *Structure computation and discrete logarithms in finite
abelian p-groups*.

### Magma

Magma's `AbelianGroup(J)` and `Sylow(J,p)` provide an independent oracle for
invariant factors, generators, and maps. Magma should remain part of the
offline differential corpus, but no runtime Sage.js feature may depend on it.

### Other systems

PARI's hyperelliptic support computes characteristic polynomials, but does not
currently provide a comparable general hyperelliptic-Jacobian group-structure
interface. A source audit of the current Oscar/Hecke/Nemo ecosystem likewise
did not find a production genus-3 Jacobian group-structure implementation.
This makes SageMath, Magma, published generic-group algorithms, and exhaustive
small cases the useful independent references.

## Mathematical contract

### Exact inputs

The generic basis algorithm consumes:

- a finite abelian group represented by exact Jacobian divisor operations;
- its independently computed exact order `N`;
- a checked prime factorization of `N`;
- sampled canonical group elements;
- explicit operation, memory, factorization, and sampling budgets.

The implementation must verify that the supplied factorization consists of
distinct primes with positive exponents and has product exactly `N`. Booleans,
fractional values, silently truncated values, pseudoprimes, and overflow at a
fixed-width boundary are rejected.

### Exact outputs

`J.group_structure()` returns invariant factors

\[
n_1\mid n_2\mid\cdots\mid n_r,
\qquad \prod_i n_i=N,
\qquad r\leq 2g.
\]

`J.abelian_group()` additionally returns certified Jacobian divisors
`D_1,...,D_r` defining an isomorphism

\[
\mathbf Z/n_1\mathbf Z\times\cdots\times
\mathbf Z/n_r\mathbf Z \longrightarrow J(\mathbf F_q).
\]

It is not enough to check the order of each `D_i`: independence must also be
certified. The basis construction and verifier must establish that the
generated subgroup has order exactly `N`.

### Las Vegas semantics

Sampling may be randomized, but successful output is deterministically
verified. Failure to find a complete basis within a budget raises
`JacobianResourceLimitError` containing useful partial state:

- the known group order and its checked factorization;
- any already proved invariant-factor constraints;
- the certified order of the subgroup found so far;
- partial certified generators;
- samples and group operations consumed;
- the stage and budget that stopped progress.

No probable group structure is returned.

## Scope

### Initial supported path

- genus 2 and genus 3;
- finite odd prime fields;
- smooth odd-degree models supported by the existing Mumford arithmetic;
- generalized equations `y^2 + h(x)y = f(x)`;
- exact known Jacobian order and complete factorization;
- ordinary-Python fallback on every supported model;
- native acceleration when the existing genus-3 kernel accepts the model.

The current smalljac genus-2 path remains the preferred structure-only backend
where available. Generic basis construction supplies independently certified
generators and maps when requested.

### Deferred extensions

- characteristic two;
- even-degree models with two points at infinity;
- arbitrary finite extension fields in the native kernel;
- generic large-integer factorization beyond current bounded facilities;
- unbounded discrete logarithms;
- a claim that every feasible group admits practical inverse coordinates.

These limitations should be capability-tested, documented, and paired with a
correct fallback or an explicit `NotImplementedError`/resource exception.

## Implementation plan

### Phase 1: cheap exact deductions and the motivating cyclic cases

Add a structure-only prepass before sampling or enumeration.

1. Compute and validate `N = J.order()` and its factorization.
2. Return the empty invariant tuple for `N=1`.
3. If `N` is squarefree, return `(N,)`: a finite abelian group of squarefree
   order is necessarily cyclic.
4. Preserve smalljac's exact genus-2 invariant factors when supported.
5. Otherwise sample divisors and compute their exact orders. An element of
   order `N` proves that the group is cyclic and yields `(N,)`.
6. Cache certified element orders and the full-order generator for later use
   by `J.abelian_group()`.

This phase alone should make both motivating examples essentially immediate:
the `q=19` structure requires no divisor operation, and the `q=13` structure
should normally require only a few exact element-order computations.

Structure-only deductions must not pretend to provide generators. For
example, squarefreeness proves `(6490,)`, but `J.abelian_group()` must still
find and verify an element of exact order 6,490.

### Phase 2: two exact sampling modes

Implement the same useful distinction as SageMath.

#### Fast point-sum sampler

Construct a divisor by summing the Abel--Jacobi images of `2g+1` independently
sampled rational curve points. Retain the existing readable implementation as
the semantic reference and add a batched/native route only after measuring the
boundary cost.

This sampler is cheap and empirically useful, but it need not be surjective.
It is therefore suitable for the first pass, never as the reason a basis is
complete.

#### Covering Mumford sampler

Choose a degree `0 <= d <= g`, choose a monic `u` of degree `d`, and solve

\[
v^2+h v-f\equiv0\pmod u,
\qquad \deg v<d.
\]

Choose among all lifts so that every reduced Mumford divisor has nonzero
sampling probability. This makes eventual completion a genuine Las Vegas
algorithm instead of relying on an undocumented distribution of rational
point sums.

Over odd characteristic, complete the square and solve

\[
(2v+h)^2\equiv h^2+4f\pmod u.
\]

The reference implementation should factor `u`, solve roots modulo its prime
powers, handle repeated factors explicitly, and combine roots by polynomial
CRT. It must not silently assume squarefree `u`.

Run a fast-sampling pass first, then a covering-sampling pass. Expose an
optional deterministic seed for reproducible benchmarks and debugging, while
making clear that a seed is not part of the proof.

### Phase 3: generic primary-basis construction

Implement the Sutherland finite-abelian-group strategy in ordinary,
CPython-parseable Python first.

For each `p^e || N`:

1. Project each sampled divisor `D` to the `p`-primary component using
   `(N/p^e)D`.
2. Compute its exact order using factor-and-strip, reusing cached scalar
   multiples and certificates.
3. Maintain a certified basis for the generated `p`-subgroup.
4. Test membership and compute coordinates with a bounded vector discrete
   logarithm in the current `p`-group basis.
5. If the new element is outside the subgroup, expand and normalize the
   primary basis as in Sutherland's basis algorithm.
6. Track the exact generated-subgroup order after every expansion.
7. Stop work on that primary component once its basis order is `p^e`.

After every primary component is complete, combine the primary bases into
global invariant factors, right-aligning cyclic factors so that
`n_i | n_{i+1}`. Verify the combined generators, relations, independence, rank
bound `r <= 2g`, and product `N` from scratch before returning.

The first implementation should favor inspectability and differential tests.
Potential native compilation of the vector-DLP inner loop is a later measured
optimization, not a prerequisite for correctness.

### Phase 4: bounded vector discrete logarithms

Provide one internal interface used by basis construction and inverse maps:

```python
coordinates = vector_discrete_log(
    target,
    basis,
    orders,
    max_group_operations=...,
    max_baby_steps=...,
    max_memory_bytes=...,
)
```

The first exact implementation should use the primary-group algorithms from
Sutherland's work rather than flattening the entire subgroup. Important
special cases should be dispatched cheaply:

- a cyclic component: ordinary bounded baby-step--giant-step or
  Pohlig--Hellman;
- very small subgroups: direct tables;
- elementary abelian components: linear-algebra-like incremental basis logic;
- large prime-power components: recursive/strided `p`-group decomposition;
- already cached coordinates: exact lookup.

Budgets apply before allocating tables. Table keys use canonical serialized
Mumford divisors, not object identity or display strings. Hash collisions must
be resolved by exact equality.

### Phase 5: certified generators and explicit maps

Replace the current exhaustive-only `J.abelian_group()` construction with the
generic certified basis.

The forward map is always available:

```sage
sage: G, phi = J.abelian_group()
sage: G.invariants()
(n1, ..., nr)
sage: phi(G.gen(0))
(u, v)
```

It evaluates invariant coordinates by exact scalar multiplication and
addition of the certified Jacobian basis.

The inverse map must no longer require a dictionary containing every Jacobian
element. It should invoke the bounded vector discrete logarithm. The map may
therefore be fully defined but resource-limited on hard inverse queries. Its
forward direction and group isomorphism remain certified independently.

Preserve the small exhaustive inverse table for tiny groups because it is
simple, fast, and an excellent differential oracle. Select it from measured
size and memory bounds, not as the generic algorithm.

### Phase 6: independently verifiable certificates

Define a versioned, exact certificate representation containing:

- the curve/model fingerprint, base-field data, and genus;
- the exact Jacobian order and checked factorization;
- invariant factors;
- canonical serialized basis divisors;
- exact element-order certificates;
- primary-basis construction data sufficient to recheck independence;
- generated subgroup orders by primary component;
- algorithm/backend versions and resource accounting.

`J.verify_group_structure_certificate(cert)` must independently validate the
model binding, factorization, divisors, relations, orders, independence, and
full order. It must not trust cached answers produced during certificate
search.

Certificates should use the repository's existing decimal-string integer and
versioned serialization conventions so they can be placed in JSONL/SQLite
research datasets. Mutated, incomplete, cross-curve, or unsupported-version
certificates must fail explicitly.

### Phase 7: improve complete enumeration as a fallback

Complete enumeration remains valuable for small groups, tests, and explicit
inverse tables, but it should enumerate valid lifts per monic `u`, not every
possible `(u,v)` coefficient pair.

The number of monic `u` candidates through degree `g=3` is

\[
1+q+q^2+q^3,
\]

which is 2,380 at `q=13` and 7,240 at `q=19`. This is dramatically smaller
than the current raw bounds, although one `u` can have multiple lifts and the
actual output still contains `#J(F_q)` elements.

Reuse the exact `lift_u` implementation from the covering sampler. Assert that
the output has no duplicates, every divisor is canonical, and its cardinality
equals `J.order()`. Keep explicit `max_elements`, `max_u_candidates`,
`max_lifts`, memory, and cancellation guards.

This fallback is not the main group-structure algorithm. It is a correctness
oracle and a practical option when the group itself is small.

### Phase 8: native acceleration after profiling

Use the ordinary-Python algorithm to identify actual hot loops. Likely native
targets are:

- batches of scalar multiples and annihilation tests;
- factor-and-strip orders for multiple samples;
- baby-step table generation and giant-step walks;
- repeated equality/hash serialization in vector DLP;
- `lift_u` root computations for covering samples.

Prefer source-transparent native compilation for mathematical bodies. Extend
the existing handwritten C boundary only where it reuses the established
fixed-width Mumford representation or avoids a measured high-volume language
crossing. Every compiled path requires a correct dynamic fallback,
differential tests, inspectable generated code, resource guards, and all four
native-platform receipts.

Never send one group operation at a time through the Node boundary. Native
work should be batched or contain the entire bounded search loop.

## Proposed public API

The exact spelling may be adjusted during implementation, but the semantics
should be frozen before native work begins.

```python
J.group_structure(
    algorithm="auto",
    factorization=None,
    max_random_elements=..., 
    max_group_operations=...,
    max_baby_steps=...,
    max_memory_bytes=...,
    max_trial_divisions=...,
    seed=None,
    certificate=False,
)
```

Algorithms:

- `"auto"`: smalljac where supported; cheap exact deductions; generic
  certified basis; exhaustive enumeration only below a measured small bound;
- `"basis"`: generic sampled primary-basis algorithm;
- `"smalljac"`: supported odd-degree genus-2 structure backend;
- `"exhaustive"`: complete reduced-divisor enumeration.

`J.abelian_group()` accepts the same search budgets and a separate inverse-DLP
budget. It returns the abstract group and an explicit certified forward map.
Requesting the certificate should return it alongside the normal mathematical
result or through a clearly documented diagnostics method; avoid changing the
ordinary Sage-compatible return value merely to expose diagnostics.

Add inspectable diagnostics such as:

- selected algorithm and backend;
- factorization source;
- fast and covering samples consumed;
- group operations and scalar multiplications;
- completed primary components;
- generated subgroup order;
- peak baby-step table size;
- elapsed time by sampling, order, DLP, and verification stages;
- whether an exhaustive oracle cross-check was performed.

## Correctness and oracle corpus

### Required motivating cases

- genus 3, `y^2 = z^7 + 2z + 1` over `GF(13)`: order 2,160 and structure
  `(2160,)`;
- the same model over `GF(19)`: order 6,490 and structure `(6490,)`;
- the second structure-only result must exercise the squarefree-order proof;
- both `J.abelian_group()` calls must produce a full-order generator and an
  independently verified map.

### Structural diversity

Add deterministic genus-2 and genus-3 fixtures covering:

- trivial and prime-order groups;
- cyclic groups with nonsquarefree order;
- squarefree cyclic groups;
- noncyclic rank-two groups, including the existing `(6,6)` fixture;
- repeated `p`-primary invariant factors;
- at least one group of rank greater than two when an oracle fixture is
  available;
- ordinary, supersingular, and intermediate `p`-rank curves;
- generalized nonzero-`h` models;
- collision, doubling, inverse, identity, and large-scalar Cantor cases;
- factors 2 and odd primes;
- hard budget exits at every stage.

For small groups, compare every generated element and inverse coordinate with
complete enumeration. For larger groups, compare structures and generator
images with both SageMath and Magma. The offline corpus should record tool
versions, source scripts, full invariant factors, canonical generator data
where representations can be translated, and exact hashes.

### Certificate tests

- search then verify in a fresh Jacobian object;
- JSON round trip without integer loss;
- wrong curve, field, model, order, factorization, generator, relation, and
  primary-basis mutation rejection;
- certificate search under one backend and verification under the ordinary
  Python backend;
- identical mathematical certificate payloads across supported platforms,
  excluding explicitly nondeterministic timing fields.

### Randomized differential tests

For many small prime fields and genus-2/3 models:

1. enumerate the complete Jacobian;
2. compute its structure independently from all elements;
3. run the sampled basis algorithm with several deterministic seeds;
4. compare invariant factors;
5. verify every returned generator and coordinate map;
6. assert that deliberately tiny budgets produce resource errors, not partial
   answers.

## Performance plan

Record the current exhaustive baseline before changing it. Benchmarks should
separate:

- exact order/factorization;
- element sampling;
- element-order computation;
- primary-basis/DLP work;
- final verification;
- optional inverse-coordinate queries;
- complete enumeration fallback.

Initial acceptance targets on an unloaded Linux x64 benchmark host:

- both motivating `group_structure()` calls complete warm in under two
  seconds, with the squarefree case far below that ceiling;
- both motivating `abelian_group()` calls complete warm in under five seconds
  or produce a documented profile identifying one bounded next optimization;
- the `q=19` computation never allocates a table proportional to 47 million
  raw Mumford candidates;
- peak memory is bounded by the caller's declared limit;
- the new path is at least 100 times faster than the present `q=13`
  exhaustive structure computation on the same host;
- ordinary-Python fallback remains practical on the small oracle corpus.

Also benchmark noncyclic groups. Cyclic examples are the first milestone, not
evidence that the full primary-basis implementation is fast.

Performance receipts must include group-operation counts and sample counts in
addition to wall time. This makes regressions meaningful across machines.

## Cross-platform requirements

The final focused suite and benchmark smoke must run on:

- Linux x86_64;
- Linux aarch64;
- macOS Apple Silicon;
- native Windows x64 using the supported MSVC/clang-cl path.

No WSL, MSYS2, MinGW, Magma, SageMath, PARI, standalone helper process, or
network service may be required at runtime. Fixed-width native inputs must
have explicit checked bounds; arbitrary Python integers remain exact through
the dynamic fallback.

## Suggested delivery sequence

### Milestone A: fast cyclic structures

- checked factorization normalization;
- squarefree structure deduction;
- sampled exact-order cyclicity witness;
- motivating GF(13) and GF(19) tests and benchmarks;
- no public claim of generators unless a full-order element is verified.

This is the smallest coherent, immediately useful deliverable.

### Milestone B: covering sampler and generic primary bases

- exact `lift_u`;
- fast and covering samplers;
- generic `p`-primary basis construction;
- noncyclic oracle corpus;
- exact stopping at subgroup order `N`.

### Milestone C: generators, maps, and certificates

- certified global generators;
- forward invariant-coordinate map;
- bounded vector-DLP inverse;
- independently verifiable serialized certificates;
- research-data serialization examples.

### Milestone D: enumeration repair and acceleration

- monic-`u`/lift enumeration fallback;
- native batching based on profiles;
- four-platform receipts;
- public docs, limitations, and reproducible benchmarks.

Each milestone should be committed independently and keep all earlier dynamic
fallbacks operational.

## Risks and mitigations

### Biased or incomplete sampling

The rational-point-sum sampler may miss a subgroup. Use it only as the fast
pass. The monic-`u` covering sampler gives every reduced divisor nonzero
probability. Completeness is always proved by subgroup order, never inferred
from the number of unsuccessful samples.

### Vector-DLP memory growth

Baby-step tables can dominate memory. Apply memory limits before allocation,
use the `p`-group decomposition rather than a flat search, serialize keys
compactly, and return partial certified progress on exhaustion.

### Large prime factors

Generic discrete logarithms can remain expensive even when scalar arithmetic
is fast. A full-order witness can settle cyclicity without a general DLP;
otherwise use Sylow decomposition, bounded BSGS/Pohlig--Hellman, and honest
resource limits. Do not advertise polynomial-time behavior in `log N`.

### Factorization cost

Structure computation requires the exact factorization of `N`. Accept and
verify caller-supplied factorizations, reuse cached factorizations, and expose
factorization limits separately from group-operation limits.

### Model coverage

Odd-degree prime-field arithmetic is the initial proven contract. Keep the
ordinary implementation authoritative, capability-gate native code, and add
even-degree, characteristic-two, and extension-field support as separate
projects rather than weakening correctness.

### Certificate overclaim

Individual generator orders do not by themselves prove independence. The
certificate and its verifier must include/replay the primary-basis argument
that proves the generated subgroup has full order.

## Definition of done

The project is complete when:

1. `J.group_structure()` no longer enumerates the whole Jacobian by default
   for supported genus-2/3 prime-field curves.
2. The GF(13) and GF(19) examples return `(2160,)` and `(6490,)` within the
   measured acceptance targets.
3. Cyclic and noncyclic structures agree exactly with exhaustive small cases,
   SageMath, and Magma.
4. `J.abelian_group()` returns certified generators and a forward explicit
   isomorphism without requiring a full element table.
5. Inverse coordinates use a bounded vector DLP and fail honestly when their
   budget is insufficient.
6. Every successful sampled result is independently verified from the exact
   group order; randomized failure can only cause a resource exception.
7. Complete enumeration uses monic `u` plus exact lifts and remains available
   as a small-case oracle.
8. Versioned certificates survive serialization and reject corruption or
   cross-curve reuse.
9. The ordinary CPython-parseable fallback, strict type checks, architecture
   checks, focused tests, and all four native-platform receipts pass.
10. Documentation states the supported models, exactness guarantee,
    randomized-runtime semantics, resource behavior, and realistic complexity.

## References

- Andrew V. Sutherland, *Order Computations in Generic Groups*, Ph.D. thesis,
  MIT, 2007, especially Chapter 9 and Algorithm 9.1:
  <https://math.mit.edu/~drew/sutherland-phd.pdf>
- Andrew V. Sutherland, *Structure computation and discrete logarithms in
  finite abelian p-groups*: <https://arxiv.org/abs/0809.3413>
- Johannes Buchmann, Michael J. Jacobson Jr., and Edlyn Teske, *On Some
  Computational Problems in Finite Abelian Groups*.
- SageMath additive abelian wrapper documentation:
  <https://doc.sagemath.org/html/en/reference/groups/sage/groups/additive_abelian/additive_abelian_wrapper.html>
- SageMath hyperelliptic Jacobian implementation:
  `sage/schemes/hyperelliptic_curves/jacobian_homset_generic.py`
- SageMath generic abelian basis implementation:
  `sage/groups/additive_abelian/additive_abelian_wrapper.py`
