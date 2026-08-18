# Nearby hyperelliptic research roadmap

## Purpose

Sage.js now has an unusual combination of exact higher-genus functionality:

- exact local polynomials for genus-2 and genus-3 hyperelliptic curves;
- a portable smalljac genus-2 backend;
- a portable remainder-forest computation of genus-2/3 Hasse--Witt data;
- exact genus-3 Weil-polynomial completion using certified Jacobian and twist
  witnesses;
- generalized Cantor arithmetic for odd-degree genus-2/3 Jacobians;
- identical focused results on Linux x64, Linux arm64, macOS arm64, and native
  Windows x64.

The next opportunities do not require inventing another point-counting
algorithm. Most reuse data or kernels that already exist but are not yet
available through an efficient research-facing interface. This document orders
that nearby work by leverage, user value, and implementation risk.

Sizes describe the expected implementation surface, not elapsed wall time:

- **XS** -- a narrow API or derived invariant with focused tests;
- **S** -- one coherent public feature using existing mathematical machinery;
- **M** -- a cross-layer feature involving Python, the native boundary, and
  cross-platform validation;
- **measure** -- promising, but a benchmark or mathematical design must precede
  a product commitment.

## Recommended first project: a research-grade local-data stream

**Priority 1 / ready / M**

Turn the exact local-factor pipeline into a bounded-memory, restartable data
source. A research computation should be able to consume records resembling

```sage
sage: for row in C.local_data(2, 10^6):
....:     print(row.prime, row.lpolynomial, row.jacobian_order)
```

without retaining a million-prime result in the curve cache or depending on
internal benchmark modules.

Each record should make the useful already-computed data available:

- the prime and exact local polynomial;
- `L_p(1)`, the Jacobian order;
- `L_p(-1)`, the quadratic-twist Jacobian order;
- curve point counts over the first few extension fields on request;
- normalized Frobenius coefficients and inexpensive reduction invariants;
- selected backend, status, timings, and a compact certificate summary;
- an explicit reason for an omitted, unsupported, or fallback row.

The iterator should support:

- bounded chunks and bounded or disabled curve caching;
- progress callbacks and cancellation;
- deterministic JSONL export with schema and backend-version metadata;
- checkpoint/restart at a prime boundary;
- optional retention of full proof certificates;
- the same exact stream on all four supported native targets.

This is the highest-leverage next step because it turns the new algorithms into
a tool that researchers can immediately use for scans, databases, and
statistics. It also provides the right harness for every performance change
below.

### Acceptance gate

- A stopped scan resumes without duplicating or omitting a prime.
- Streaming through the automatic envelope has bounded resident memory.
- Export followed by import preserves every exact integer and status.
- The output digest agrees across Linux x64/arm64, macOS arm64, and Windows x64.
- The public iterator has no dependency on SageMath, PARI, Magma, or a
  standalone helper executable.

## Accelerate public Jacobian divisor operations

**Priority 2 / ready / M**

The native genus-3 certification kernel already implements exact divisor
validation, scalar multiplication, order searches, and factor-and-strip order
certificates. Public Mumford arithmetic still primarily uses the readable
ordinary-Python Cantor implementation. Connect these layers without changing
the mathematical representation or removing the Python fallback.

The first useful slice is:

- accelerated `n*D` for supported prime-field genus-3 Jacobians;
- `D.order(multiple=..., factorization=...)` using the native factor-and-strip
  kernel;
- batched scalar multiplication and annihilation tests;
- stable serialization of a reduced Mumford pair `(u,v)`;
- export and independent rechecking of element-order certificates.

The ordinary Python group law remains the semantic reference and dynamic
fallback. Native results must be tested differentially on ordinary,
supersingular, generalized `h != 0`, collision, doubling, inverse, and large
scalar cases.

### Acceptance gate

- Public and native results have identical canonical Mumford representatives.
- Large positive and negative integer scalars are exact and checked for ingress
  overflow at every fixed-width boundary.
- Certificate verification is available independently of certificate search.
- Resource limits and cancellation are deterministic and do not become false
  mathematical answers.
- Focused tests and benchmarks pass on all four native targets.

## Certified generators and explicit abelian-group maps

**Priority 3 / ready after Priority 2 / M**

`J.group_structure()` can return invariant factors, but `J.abelian_group()`
correctly refuses to manufacture an abstract group without certified
generators and maps. Complete that contract for bounded prime-field
Jacobians.

The intended result is conceptually:

```sage
sage: G, phi = J.abelian_group()
sage: G.invariants()
(m1, m2, ...)
sage: G.gens()
(g1, g2, ...)
sage: phi(G.gen(0))
(u, v)
```

The implementation can reuse exact group orders, invariant factors, sampled
divisors, element-order stripping, and native scalar multiplication. It must
certify both that the proposed generators have the required relations and that
their generated subgroup has the full known order. Small groups should be
cross-checked by complete enumeration.

An initial bounded implementation is more useful and honest than claiming a
scalable general discrete-log implementation. Resource exhaustion should
raise a specific exception carrying the known structure and partial certified
generators.

### Acceptance gate

- The generator orders and independence establish the advertised invariant
  factors exactly.
- The product of invariant factors equals the independently computed Jacobian
  order.
- Forward maps preserve addition and scalar multiplication.
- Any inverse-coordinate map is exposed only where it is actually computed
  and certified.
- Exhaustive small-group comparisons include cyclic and noncyclic genus-2 and
  genus-3 examples.

## Extend the automatic genus-3 performance envelope

**Priority 4 / ready to measure / M**

Automatic rforest selection is currently bounded by the range for which the
complete certified workflow, rather than only the modular residue stage, has a
reproducible performance receipt. The next target is a full streaming run
through `10^5`.

Profile these stages independently:

1. remainder-forest residue production;
2. exact Weil-candidate enumeration;
3. primary-Jacobian certification;
4. twist certification;
5. fallback rows and public polynomial construction;
6. serialization and cache behavior.

Likely engineering wins include avoiding per-prime curve construction,
batching candidate completion and certificate searches, eliminating temporary
Python collections, and making the local-factor cache opt-in or bounded during
large streams.

Expand `algorithm="auto"` only after a complete exact digest, bounded-memory
receipt, and cross-platform agreement exist for the larger interval. Explicit
`algorithm="rforest"` may remain available beyond the automatic envelope.

### Acceptance gate

- A complete through-`10^5` stream has a checked-in timing, peak-memory figure,
  and exact digest.
- No stage grows memory linearly in the number of primes unless the caller asks
  to materialize the output.
- Every unresolved or resource-limited row follows the documented exact
  fallback policy.
- The automatic selector is based on measured end-to-end behavior, not raw
  remainder-forest timing alone.

## Derived local invariants and statistics

**Priority 5 / ready / S**

Once `L_p(T)` is known, many research quantities are nearly free. Provide
single-prime and streaming access to:

- `#J(F_p) = L_p(1)` and the twist order `L_p(-1)`;
- `#C(F_{p^n})` and `#J(F_{p^n})` for requested small `n`;
- ordinary and `p`-rank information;
- normalized Frobenius coefficients;
- prime filters by local behavior;
- exact accumulators for coefficient moments and Sato--Tate experiments.

These should be projections of the local-data record, not independent
recomputations. Statistical helpers must retain counts and exact integer sums;
floating normalization belongs at the presentation boundary.

### Acceptance gate

- Every derived value is checked from the local polynomial by an independent
  formula.
- Extension point counts agree with direct enumeration on the oracle corpus.
- Filtering a stream does not change the computation or certification of a
  retained row.

## Good-prime Euler products and coefficient streams

**Priority 6 / ready / S**

Generate multiplicative Dirichlet coefficients and truncated Euler products
from certified good-prime local factors. This is useful for experimentation
before Sage.js has complete global genus-2/3 conductor, bad-factor, root-number,
and gamma-factor support.

The API and documentation must label the result precisely as a good-prime or
user-supplied Euler product. It must not silently claim to be the completed
global `L`-function when bad local factors are absent.

Useful outputs include:

- the local Euler-factor stream;
- multiplicative coefficients `a_n` through a caller-supplied bound;
- truncated Euler products at a complex argument;
- exact files suitable for another `L`-function package;
- consistency checks between local factors, point counts, and coefficient
  recurrences.

## Smaller supporting improvements

These can be folded into the projects above or completed independently.

### Stable divisor and certificate serialization

**ready / XS** -- Define versioned exact serialization for Mumford divisors,
curve identity, element-order witnesses, and local-factor certificates. Include
field/modulus information and reject a divisor serialized for a different
Jacobian. This enables checkpointing and distributed certificate checking.

### Lazy bounded Jacobian enumeration

**ready / S** -- Add a lazy element iterator so small-group exploration need
not first retain every reduced class. Keep the same candidate and result-size
resource limits. This improves memory behavior but does not make enumeration
of a large Jacobian feasible.

### Capability and provenance reports

**ready / XS** -- Expose one structured report containing backend versions,
supported genera/models, prime bounds, native availability, and certificate
normalization. Store it with exported research data.

### Reproducible researcher command

**ready / XS** -- Add a documented command or Sage-mode script that streams
local data to a file, prints progress, resumes safely, and verifies the final
digest. This should exercise the public API rather than call benchmark
internals.

### Documentation reconciliation

**ready / XS** -- Remove stale statements that automatic rforest selection is
disabled, document the measured automatic envelope, and distinguish the
diagnostic Hasse--Witt API from the certified local-factor API consistently.

## Important adjacent projects that are not low-hanging

The following are natural continuations, but each needs a separate design and
validation project rather than being absorbed into the work above.

### Even-degree Jacobian arithmetic

Even-degree hyperelliptic models have two points at infinity. Supporting their
Jacobian group law requires an extended divisor representation, canonical
reduction rules, conversion tests, and new certification vectors. Exact local
polynomials already work through fallback, so this is valuable but not an API
cleanup.

### Characteristic-two Jacobian arithmetic

Characteristic two needs separately derived and validated generalized Cantor
formulas. Existing exact point-count fallbacks do not make the current
odd-characteristic divisor law valid there.

### Fast Frobenius over extension fields

The readable reference code works over finite extensions, but the native
smalljac and rforest paths target prime fields and rational-curve local primes.
A fast `GF(p^n)` Frobenius implementation requires its own field-context,
algorithm, oracle, and portability work.

### Complete global genus-2/3 `L`-functions

Good local factors are now available, but a completed global `L`-function also
needs correct bad factors, conductor, archimedean factors, functional-equation
sign, and normalization. This is a major and worthwhile successor to the
elliptic analytic-rank project, not a small extension of the local-factor
stream.

### Stronger Frobenius congruences or a one-off p-adic backend

Computing coefficients modulo `p^2` or embedding a Kedlaya/Harvey-style
one-prime backend could reduce certification work and improve one-off latency.
Either route introduces substantial new mathematics or dependencies and
should begin with a measured backend audit.

## Suggested execution order

The most coherent sequence is:

1. build the streaming local-data/export/checkpoint API;
2. validate and optimize a complete stream through `10^5`;
3. expose native scalar multiplication and exact divisor orders;
4. use those operations to provide certified Jacobian generators and maps;
5. add derived statistics and good-prime Euler-product tools.

The first two steps create an immediately usable research product. The next
two turn the existing Jacobian implementation into a substantially stronger
computational group package. The fifth connects the local computations to
broader arithmetic-statistics and `L`-function experiments.

## Completion rule

An item is complete only when:

- its mathematical result is exact or its probabilistic role is explicitly
  limited to runtime rather than correctness;
- the ordinary Python implementation or an independent formula remains a
  differential oracle for native acceleration;
- resource limits, cancellation, unsupported models, and fallback behavior
  are tested;
- representative SageMath, PARI, or Magma oracle data is checked during
  development without becoming a runtime dependency;
- relevant strict, architecture, native, and Windows checks pass;
- user-facing behavior and performance envelopes are documented with current
  reproducible receipts.
