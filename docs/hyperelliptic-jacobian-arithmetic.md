---
title: "Jacobian arithmetic for genus-2 and genus-3 hyperelliptic curves"
---
# Jacobian arithmetic for genus-2 and genus-3 hyperelliptic curves

Sage.js implements an exact group law for Jacobians of genus-2 and genus-3
hyperelliptic curves. The public arithmetic is a readable ordinary-Python
implementation of generalized Cantor composition and reduction. A separate
native genus-3 kernel accelerates the bounded order searches used to certify
local Frobenius polynomials.

This document describes what is implemented, the mathematical representation,
the available group operations, and where the current implementation is—or is
not—intended to be fast.

For rational torsion certificates, canonical heights, height pairings,
regulators, subgroup saturation, and analytic BSD quotients over `QQ`, see
[BSD arithmetic for genus-2 and genus-3
Jacobians](hyperelliptic-bsd-arithmetic.md).

## Supported models

The curve is written

```text
y^2 + h(x)y = f(x).
```

The public Jacobian currently supports:

- genus 2 and genus 3;
- characteristic different from 2;
- an odd-degree model with one point at infinity, meaning
  `max(deg(f), 2*deg(h)) = 2*g + 1`; or a split even-degree model over an odd
  prime field, using the separate balanced representation described in
  [Split even-degree hyperelliptic
  Jacobians](hyperelliptic-even-degree-jacobians.md);
- coefficient fields supported by Sage.js polynomial arithmetic, including
  rational, prime, and finite-extension fields.

The odd-degree group law itself works over `QQ`, but orders, complete
enumeration, and finite abelian group structure require a finite base field.
Split even-degree arithmetic initially requires an odd prime field.
Even-degree inert models and characteristic 2 need separately validated
representations. Sage.js rejects both explicitly rather than silently
constructing an incomplete group.

Exact local polynomials remain available for unsupported Jacobian models. For
example, the genus-3 rforest pipeline uses its exact fallback for an
even-degree model.

## Reduced Mumford representation

A divisor class is stored as a canonical reduced pair `(u,v)` satisfying

```text
u is monic,
deg(v) < deg(u) <= g,
u divides v^2 + h*v - f.
```

Geometrically, for distinct affine points `P_i=(x_i,y_i)`, the polynomial `u`
has roots `x_i` and `v(x_i)=y_i`; the pair represents
`sum(P_i) - deg(u)*infinity`. Reduction gives every supported divisor class a
unique representative.

The basic formulas are:

```text
zero:       (1, 0)
negative:   (u, -h-v mod u)
point P:    (x-x(P), y(P))
```

Construction makes `u` monic, reduces `v` modulo `u`, verifies the divisibility
relation, and applies Cantor reduction. Equality and hashing can therefore use
the canonical `(u,v)` pair directly.

## Cantor composition and reduction

Addition is generalized Cantor composition for `y^2+h*y=f`. The implementation
handles four cases explicitly:

1. doubling, using `gcd(u, 2*v+h)`;
2. the coprime fast path `gcd(u1,u2)=1`;
3. conjugate or colliding inputs with a nontrivial common factor;
4. the fully general extended-gcd composition.

After composition, reduction repeatedly replaces an oversized pair by

```text
u' = monic((v^2 + h*v - f) / u),
v' = -h-v mod u',
```

until `deg(u) <= g`. Exact polynomial division is checked at every step.
Negation, subtraction, doubling, and scalar multiplication all use this same
canonical law. Integer scalar multiplication is binary double-and-add and
accepts exact integers of arbitrary size.

The implementation includes small representation-independent polynomial
division and extended-gcd fallbacks. These are important over extension fields
whose optimized public polynomial backend does not yet implement every
operation.

## Basic usage

Here is a genus-2 Jacobian over `GF(5)`:

```sage
sage: R.<x> = PolynomialRing(GF(5))
sage: C = HyperellipticCurve(x^5 + x + 1)
sage: J = C.jacobian()
sage: J.order()
36
sage: J.group_structure()
(6, 6)
sage: A = J((0, 1))
sage: A
(x, 1)
sage: 2*A
(x^2, 3*x + 1)
sage: A.order()
6
sage: len(J.points())
36
```

The constructor accepts a curve point, an affine coordinate pair, or explicit
Mumford data `[u,v]`. The generalized `h != 0` law works over `QQ` as well:

```sage
sage: R.<x> = QQ[]
sage: C = HyperellipticCurve(x^5 - x^4 + x^2 - x, 1)
sage: J = C.jacobian()
sage: D1 = J([x^2 + x, x])
sage: D2 = J([x^2, x - 1])
sage: D1 + D2
(x^2 + x, -1)
sage: -D1
(x^2 + x, -x - 1)
sage: D1 - D1
(1, 0)
```

A small genus-3 example exercises the same public representation and group
law:

```sage
sage: R.<z> = PolynomialRing(GF(3))
sage: C = HyperellipticCurve(z^7 + 2*z + 1)
sage: J = C.jacobian()
sage: J.order()
94
sage: J.group_structure()
(94,)
sage: A = J((0, 1))
sage: 2*A
(z^2, z + 1)
sage: A.order()
94
sage: J.count_points(3)
[94, 940, 26038]
```

For a Jacobian, `count_points(n)` is Sage-compatible shorthand for the
Jacobian orders over the first `n` extension fields; it does not count points
on the original curve. The curve's own `C.count_points(n)` has the latter
meaning.

## Orders and extension fields

The Jacobian order comes from the curve's exact Frobenius polynomial. If
`P(T)=det(T-Frob_q)`, then

```text
#J(F_q) = P(1).
```

For extension degree `n`, Sage.js computes the absolute resultant of `P(T)`
and `T^n-1`. The curve caches its Frobenius polynomial, and the Jacobian caches
each requested extension order. Consequently `J.order()` is cheap once local
Frobenius data has been computed; the local-polynomial algorithm usually
dominates the first call.

Given an annihilating multiple and its factorization, `D.order()` strips prime
powers by exact scalar multiplication. Without a supplied factorization, the
fallback uses bounded trial division. Large production orders should be
factored separately and passed in explicitly rather than relying on that small
fallback.

## Complete enumeration

`J.points()` (also available as `J.list()` and iteration over `J`) enumerates
all reduced Mumford pairs. For every degree `0 <= d <= g`, it tries every
monic degree-`d` polynomial `u` and calls `J.lift_u(u, all=True)`. The lifting
algorithm factors `u`, solves the completed-square congruence in each residue field,
Hensel-lifts repeated factors, and combines the roots by polynomial CRT.

Enumeration has two useful correctness properties:

- canonical reduced representatives prevent duplicate classes;
- the number found must equal the independently computed Frobenius order.

It is nevertheless an exhaustive algorithm. Before allocating, it checks both
the known Jacobian order and the monic-`u` candidate bound

```text
1 + q + q^2 + ... + q^g.
```

The defaults are at most 50,000 returned elements and 5,000,000 monic
polynomials. Exceeding either bound raises `JacobianResourceLimitError`. The
complete list is cached after a successful enumeration.

`random_element(fast=True)` samples `2*g+1` curve points and adds their divisor
classes. This is fast but need not cover the entire Jacobian.
`random_element(fast=False)` instead chooses `v`, factors
`v^2+h*v-f`, and selects a valid divisor `u`; every reduced Mumford divisor has
nonzero probability. The group-structure algorithm uses the fast sampler
first and the covering sampler before declaring resource exhaustion.

## Finite abelian group structure

`J.group_structure()` returns invariant factors

```text
(m1, ..., mr),  with m1 | ... | mr and product(mi) = #J(F_q).
```

The available algorithms are:

- `algorithm="smalljac"`, or `"auto"` when supported, uses smalljac's packed
  invariant-factor backend for odd-degree genus-2 curves over supported odd
  prime fields. Sage.js verifies the divisibility chain and product against
  the local polynomial, then checks that the reported exponent annihilates
  sampled Jacobian elements.
- `algorithm="basis"` samples exact Jacobian elements, splits them into Sylow
  components, and applies Sutherland's recursive vector-discrete-log and
  primary-basis algorithms. It stops only when the certified sampled subgroup
  has the full independently known Jacobian order.
- `algorithm="exhaustive"` enumerates the entire group. For each prime power
  dividing the group order, it counts kernels of multiplication by successive
  powers of that prime. Those kernel sizes determine the elementary divisors,
  which are combined into invariant factors.

`"auto"` also applies exact cheap deductions before sampling. In particular,
a finite abelian group of squarefree order is cyclic, and an element of exact
order `#J(F_q)` proves cyclicity immediately. The generic algorithm checks
that the invariants divide successively, multiply to the exact order, and have
rank at most `2*g`. A caller may supply a checked factorization to avoid
bounded trial division.

`J.abelian_group()` goes further and returns a certified
abstract group together with an explicit isomorphism:

```python
G, phi = J.abelian_group()
G.invariants()                 # for example, (6, 6)
G.gens()                       # coordinate generators
phi.images()                   # their reduced Mumford divisors
phi(G.gen(0) + 2*G.gen(1))    # forward map
phi.preimage(D)                # bounded exact vector discrete logarithm
phi.verify()
```

The forward map never needs a complete element table. Its generators are the
certified primary basis. Inverse coordinates use the same bounded vector-DLP
algorithm; groups of order at most 512 retain a complete table as an
independent small-case oracle. Generic discrete logarithms can still be hard,
so operation, baby-step, and memory limits are explicit. On exhaustion,
`JacobianResourceLimitError` carries the known/partial structure, partial
generators, generated subgroup order, sample counts, and operation diagnostics.

Group certificates are versioned, integer-safe, bound to the exact curve
model, and independently recheck orders and basis independence:

```python
certificate = J.group_structure_certificate(seed=1)
assert J.verify_group_structure_certificate(certificate)
```

Supplying `seed` makes sampling and benchmark transcripts reproducible. It is
not part of the proof: successful output is verified exactly, and an unlucky
sample sequence can only cause a resource exception.

The two motivating genus-3 examples no longer enumerate millions of raw
Mumford pairs:

```sage
sage: R.<z> = PolynomialRing(GF(13))
sage: J = HyperellipticCurve(z^7 + 2*z + 1).jacobian()
sage: J.order()
2160
sage: J.group_structure(seed=1)
(2160,)
sage: G, phi = J.abelian_group(seed=1)
sage: G.invariants()
(2160,)
sage: phi.preimage(phi(777*G.gen(0)))
(777,)

sage: R.<z> = PolynomialRing(GF(19))
sage: J = HyperellipticCurve(z^7 + 2*z + 1).jacobian()
sage: J.order()
6490
sage: J.group_structure()
(6490,)
sage: J.group_structure_diagnostics()["algorithm"]
'squarefree-order'
```

The order 6,490 is squarefree, so the structure-only answer requires no
sampling. Constructing `J.abelian_group()` still samples and verifies a divisor
of exact order 6,490 because an explicit map needs an actual generator.

Reduced divisors and element-order proofs also have exact, versioned data
representations:

```python
payload = D.to_data()
assert J.divisor_from_data(payload) == D

certificate = D.order_certificate()
assert J.verify_order_certificate(certificate)
```

The payload records the prime, exact curve model, and ascending coefficients
of `(u,v)`, so it cannot accidentally be loaded into a different Jacobian.
Certificate verification uses the ordinary Python group law independently of
the native certificate search. A group certificate additionally records the
Sutherland basis/group-law versions, the scalar backend used during search,
exact sample and generic-group resource counters, and the completed order of
every primary component. Timing measurements are deliberately excluded from
the proof payload, so seeded certificates remain suitable for JSONL and
SQLite research datasets.

## Efficiency and native acceleration

The public group law is correctness-first, but supported odd-degree genus-2/3
models now reuse a prepared exact arithmetic context:

| Operation | Current method | Intended scale |
| --- | --- | --- |
| Addition/doubling | source-transparent packed Cantor kernels over odd prime fields; retained FLINT Mumford results over `QQ`; ordinary Python reference fallback | individual calls and prepared batches |
| Negation/subtraction/sum | packed retained batches over odd prime fields; exact public fallback | batch pipelines without polynomial intermediates |
| Scalar multiplication | packed source-transparent genus-2/3 kernels or retained FLINT rational results; ordinary Python fallback | exact scalars with explicit batch and memory bounds |
| Element order | native factor-and-strip when supported; independently readable Python fallback | an annihilating multiple and its factorization |
| Jacobian order | evaluation/resultant from cached Frobenius data | inexpensive after local Frobenius computation |
| Genus-2 structure | native smalljac when supported | production path in its declared domain |
| Complete enumeration | `1+q+...+q^g` monic `u` values plus exact lifts | small finite groups and correctness oracles |
| Generic structure | sampled Sylow bases and bounded vector DLP | groups whose order is factored and primary DLPs fit the declared budget |

At fixed genus, each Cantor operation involves only low-degree polynomials, but
the ordinary fallback still creates generic Python polynomial objects and runs
generic extended-gcd operations. `J.prepared_arithmetic()` therefore owns the
immutable model identity and bounded scratch state used by `prepare_batch`,
`add_batch`, `negate_batch`, `subtract_batch`, `scalar_batch`, and `sum`.
Prepared finite-field batches retain one authenticated immutable packed buffer;
generated native adapters may borrow it only at inputs proved read-only. The
dynamic fallback receives an explicit copy. Public result wrappers remain
ordinary `MumfordDivisor` values and materialize `u,v` only when requested.

Over `QQ`, the same public operators use a sealed FLINT Mumford-result resource
whose indivisible reduced `(u,v)` value remains private. The first operation
that needs polynomial, hashing, packing, or serialization data extracts and
validates one canonical primitive row; `algorithm="reference"` always replays
the ordinary polynomial law. Owner, parent, model fingerprint, lifecycle, and
memory checks reject resource transplantation or stale contexts.

Profiling also showed that adding the `2*g+1` point divisors used by each fast
sample was a repeated high-volume language crossing, so those divisors are
now packed and summed in one bounded native call. Factor-and-strip, ordered
multi-progression search, structure maps, genus-3 certification, rational
torsion, and saturation reuse the same prepared operations rather than
repacking a curve for every Sylow component.

### Native genus-3 certification kernel

The certified genus-3 local-factor pipeline has a high-performance C kernel,
now also used opportunistically by the public Jacobian class. It accepts
packed degree-7 models and packed reduced divisors over odd prime fields with
`p < 2^31`, then:

- validates the generalized Mumford relation;
- maps `v` to `2*v+h` on the completed-square model;
- performs Cantor arithmetic with FLINT `nmod_poly` values;
- sums a packed divisor batch with one Node/native crossing;
- multiplies by bounded integers up to the rforest genus-3 order domain;
- tests explicit candidate orders;
- searches an arithmetic progression of candidate orders with a bounded
  baby-step/giant-step algorithm;
- factors and strips an annihilating multiple to produce the exact element
  order and its prime factorization.

Thus `n*D`, `D.scalar_multiple(n, algorithm="native")`, and
`D.order(algorithm="native")` avoid generic Python polynomial objects in the
supported domain. `J.scalar_multiples(...)` and `J.annihilation_tests(...)`
provide bounded batch-facing APIs. Scalars outside the native 128-bit ingress
domain fall back automatically and remain arbitrary-precision exact; asking
explicitly for `algorithm="native"` instead raises a capability error.

The progression search costs approximately the square root of the progression
length in group operations instead of testing every candidate independently.
All entry points have explicit operation and baby-step budgets, cancellation,
allocation checks, and diagnostic counters. The kernel returns a certificate,
not a trusted conclusion: ordinary Python independently verifies the prime
factorization, `e*D=0`, and `(e/q)*D != 0` for every prime `q` dividing the
claimed element order `e`.

On the development Linux x86-64 host, one recorded benchmark tested 1,000
explicit candidate orders in about 0.42 seconds, while a progression containing
one billion possible orders was searched in about 0.36 seconds using roughly
31,700 group operations. These are implementation receipts, not portable
performance guarantees; the important distinction is that the progression
search scales with its square root.

The reproducible seeded public-structure benchmark on the same shared host
computed the `GF(13)` order-2,160 structure in 0.091 seconds after the order
was known, using two samples and 36 accounted generic operations. The
order-6,490 `GF(19)` basis took 0.048 seconds. Their certified explicit maps
took 1.082 and 1.635 seconds respectively. The noncyclic generalized genus-2
group `(2,2,8)` is intentionally also recorded: its ordinary-Python basis took
3.465 seconds and map construction 8.103 seconds, identifying primary-basis
arithmetic as the next optimization target rather than hiding it behind the
easy cyclic cases. See the machine-readable receipt in
[`bench/results`](../bench/results/hyperelliptic-jacobian-group-structure-linux-x64-2026-08-19.json).

## Validation

The group law is tested independently of the local-factor pipeline:

- fixed genus-2 and genus-3 sums, doubles, and element orders match Sage
  vectors;
- exhaustive small groups test zero, inverse, closure, commutativity, and
  associativity;
- cyclic and noncyclic structures include `(94,)`, `(10,)`, and `(6,6)`;
- generalized nonzero-`h` collision cases are covered;
- finite-extension arithmetic is exercised over `GF(9)`;
- 256-bit scalar multiplication is reduced against a known element order;
- native genus-3 certificates are differentially rechecked with the ordinary
  Python Cantor law, including cancellation and resource-limit paths;
- the native kernel has matching focused receipts on Linux x86-64, Linux
  aarch64, macOS arm64, and native Windows x86-64.

The principal implementation files are:

- [`jacobian.py`](../src/lib/sagejs/hyperelliptic_curves/jacobian.py) for the
  public Mumford representation and Cantor law;
- [`group_structure.py`](../src/lib/sagejs/hyperelliptic_curves/group_structure.py)
  for bounded element-order and invariant-factor algorithms;
- [`genus3_jacobian.c`](../packages/flint/src/hyperelliptic/genus3_jacobian.c)
  for the packed certification kernel;
- [`hyperelliptic-jacobian.cjs`](../test/hyperelliptic-jacobian.cjs),
  [`hyperelliptic-jacobian-group-structure.cjs`](../test/hyperelliptic-jacobian-group-structure.cjs),
  [`genus3-jacobian-sum.cjs`](../packages/flint/test/hyperelliptic/genus3-jacobian-sum.cjs),
  and
  [`hyperelliptic-genus3-jacobian-search-differential.cjs`](../test/hyperelliptic-genus3-jacobian-search-differential.cjs)
  for public, structure/certificate, and independent-native regression tests.
