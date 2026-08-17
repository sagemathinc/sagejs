# Certified number-field maximal orders

Sage.js computes maximal orders without PARI and without requiring a complete
factorization of the equation-order discriminant. The public operation is:

```python
R.<x> = QQ[]
K.<a> = NumberField(x^3 + x^2 - 2*x + 8)
O = K.maximal_order()

O.basis()
O.discriminant()
O.is_maximal()
```

`K.ring_of_integers()` is the same operation. The default global result is
cached, so the two methods return the identical order object. A forced
algorithm, a local-prime request, or a traced run never replaces that default
cache entry.

## What “certified” means

The constructor and checker are separate. Before a global result is returned,
the checker independently verifies:

- the basis is nonsingular, contains `1`, and contains the equation order;
- multiplication is closed in the proposed lattice;
- the equation and order discriminants differ by the square of the reported
  index;
- the lazy discriminant components are exact and pairwise coprime;
- every relevant proven prime has a checked local-maximality witness; and
- every unresolved composite component has evidence that does not assume it
  is prime.

The checked JSON-safe evidence is available as
`O.maximality_certificate()`. `O.is_maximal()` is true only when that stored
global certificate succeeded; setting an internal construction flag is not a
substitute for certification.

## Local orders

Sage-compatible prime-local requests are supported:

```python
O2 = K.maximal_order(2)
O23 = K.maximal_order([2, 3])
```

These return orders maximal at the requested certified primes, but they do not
claim global maximality and do not populate the global cache. Consequently,
`O2.is_maximal()` is false. Sage.js intentionally rejects
`assume_maximal=True`: an assumption cannot promote a local order to a
certified global one.

## Algorithm diagnostics and differential runs

The default `algorithm="auto"` uses the measured batched native path when it
is available and a correct dynamic fallback otherwise. Developers can force a
path without changing the mathematical contract:

```python
K.maximal_order(algorithm="native")
K.maximal_order(algorithm="round2")
K.maximal_order(algorithm="polygon")
K.maximal_order(algorithm="round4")
K.maximal_order(algorithm="om-maxmin")
```

The polygon, modified Round-4, and OM/MaxMin implementations have explicit
bounded domains. A forced bounded path records an actionable reason and uses
the certified Round-2 fallback when its current domain is insufficient; it
never silently returns partial evidence as a maximal order.

Tracing is opt-in and does not affect the ordinary cached call:

```python
O = K.maximal_order(trace=True)
O.maximal_order_trace()
```

The trace records lazy component discovery, composite local work, selected
prime-local algorithms, basis merging, and global certification. Timings and
selector details are development evidence, not part of the mathematical
certificate.

## Reproducible oracle comparison

The checked corpus and bounded multi-system profiler are documented in
[`number-field-maximal-order-benchmarks.md`](number-field-maximal-order-benchmarks.md).
PARI/Sage, Hecke/Oscar, and Magma are offline oracle families only; Sage.js
does not load, link, or invoke them while computing a maximal order.
