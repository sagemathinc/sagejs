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

## Supported models

The curve is written

```text
y^2 + h(x)y = f(x).
```

The public Jacobian currently supports:

- genus 2 and genus 3;
- characteristic different from 2;
- an odd-degree model with one point at infinity, meaning
  `max(deg(f), 2*deg(h)) = 2*g + 1`;
- coefficient fields supported by Sage.js polynomial arithmetic, including
  rational, prime, and finite-extension fields.

The group law itself works over `QQ`, but orders, complete enumeration, and
finite abelian group structure require a finite base field. Even-degree models
have two points at infinity and need an extended divisor representation;
characteristic 2 needs separately validated generalized arithmetic. Sage.js
rejects both cases explicitly rather than silently constructing an incomplete
group.

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
monic degree-`d` polynomial `u` and every polynomial `v` of degree below `d`,
retaining exactly the pairs for which `u | v^2+h*v-f`.

Enumeration has two useful correctness properties:

- canonical reduced representatives prevent duplicate classes;
- the number found must equal the independently computed Frobenius order.

It is nevertheless an exhaustive algorithm. Before allocating, it checks both
the known Jacobian order and the candidate bound

```text
1 + q^2 + q^4 + ... + q^(2g).
```

The defaults are at most 50,000 returned elements and 5,000,000 candidate
pairs. Exceeding either bound raises `JacobianResourceLimitError`. The complete
list is cached after a successful enumeration.

`random_element()` normally samples curve points and adds their divisor
classes. `elements_from_points()` provides a deterministic sample containing
both individual point classes and partial sums. If the base field offers no
usable random-point path, random selection may fall back to bounded complete
enumeration.

## Finite abelian group structure

`J.group_structure()` returns invariant factors

```text
(m1, ..., mr),  with m1 | ... | mr and product(mi) = #J(F_q).
```

There are currently two algorithms:

- `algorithm="smalljac"`, or `"auto"` when supported, uses smalljac's packed
  invariant-factor backend for odd-degree genus-2 curves over supported odd
  prime fields. Sage.js verifies the divisibility chain and product against
  the local polynomial, then checks that the reported exponent annihilates
  sampled Jacobian elements.
- `algorithm="exhaustive"` enumerates the entire group. For each prime power
  dividing the group order, it counts kernels of multiplication by successive
  powers of that prime. Those kernel sizes determine the elementary divisors,
  which are combined into invariant factors.

The generic algorithm checks that the invariants divide successively, multiply
to the exact order, and have rank at most `2*g`. A caller may supply a checked
factorization to avoid bounded trial division.

Sage.js does not yet expose an embedded abstract abelian group with certified
generators. `J.abelian_group()` therefore raises `NotImplementedError` rather
than returning invariant factors without the maps and generators such an
object promises.

## Efficiency and native acceleration

The public group law is correctness-first:

| Operation | Current method | Intended scale |
| --- | --- | --- |
| Addition/doubling | ordinary-Python generalized Cantor arithmetic | individual computations and correctness oracles |
| Scalar multiplication | binary double-and-add, `O(log n)` group operations | moderate exact scalars |
| Jacobian order | evaluation/resultant from cached Frobenius data | inexpensive after local Frobenius computation |
| Genus-2 structure | native smalljac when supported | production path in its declared domain |
| Complete enumeration | roughly `O(q^(2g))` candidate pairs | tiny finite fields only |
| Generic structure | full enumeration plus prime-power kernel counts | small groups only |

At fixed genus, each Cantor operation involves only low-degree polynomials, but
the current public path still creates generic Python polynomial objects and
runs generic extended-gcd operations. It is not competitive with a dedicated
packed C implementation for millions of group operations. Complete enumeration
becomes impractical particularly quickly in genus 3 because its raw candidate
space is dominated by `q^6`.

### Native genus-3 certification kernel

The certified genus-3 local-factor pipeline has a narrower high-performance C
kernel. It is not a second public Jacobian class. It accepts packed degree-7
models and packed reduced divisors over odd prime fields with `p < 2^31`, then:

- validates the generalized Mumford relation;
- maps `v` to `2*v+h` on the completed-square model;
- performs Cantor arithmetic with FLINT `nmod_poly` values;
- multiplies by bounded integers up to the rforest genus-3 order domain;
- tests explicit candidate orders;
- searches an arithmetic progression of candidate orders with a bounded
  baby-step/giant-step algorithm;
- factors and strips an annihilating multiple to produce the exact element
  order and its prime factorization.

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
- [`hyperelliptic-jacobian.cjs`](../test/hyperelliptic-jacobian.cjs) and
  [`hyperelliptic-genus3-jacobian-search-differential.cjs`](../test/hyperelliptic-genus3-jacobian-search-differential.cjs)
  for public and independent-native regression tests.
