---
title: "Hyperelliptic curves and local Frobenius data"
---

# Hyperelliptic curves and local Frobenius data

Sage.js supports smooth genus-2 and genus-3 curves written

```text
y^2 + h(x)y = f(x)
```

over `QQ` and finite fields. The public results are exact. Sage, Magma, PARI,
smalljac command-line programs, and rforest executables are not runtime
dependencies.

## Local polynomials and point counts

For a curve over `GF(q)`, `frobenius_polynomial()` returns
`det(X - Frob_q)`. The point-count and zeta methods reuse that one cached
polynomial:

```python
R = PolynomialRing(GF(101), "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)

C.frobenius_polynomial()
C.cardinality()
C.cardinality(extension_degree=5)
C.count_points(5)
C.zeta_function()
```

`algorithm="auto"` uses the native full-polynomial smalljac backend for its
validated genus-2 prime-field models. `algorithm="exhaustive"` counts over
the first `g` extensions and reconstructs the exact polynomial with Newton
identities. The exhaustive implementation is also the fallback for genus 3,
finite extension fields, and characteristic 2.

For a curve over `QQ`, `local_lpolynomial(p)` returns the good Euler numerator
`det(1 - T*Frob_p)`. The plural API traverses a closed prime interval in
deterministic order and omits bad or model-excluded primes:

```python
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)

C.local_lpolynomial(101)
C.local_lpolynomials(2, 10**6)
for chunk in C.local_lpolynomial_chunks(2, 10**6, chunk_size=4096):
    consume(chunk)
```

The chunk iterator bounds Python result storage while retaining one batched
smalljac workflow. A singular call at a bad prime raises `ArithmeticError`;
Sage.js never substitutes a good-reduction polynomial. These methods compute
local data only: global bad Euler factors, conductors, root numbers, and
complex L-series are outside this API.

## Jacobians

See [Jacobian arithmetic for genus-2 and genus-3 hyperelliptic
curves](hyperelliptic-jacobian-arithmetic.md) for the representation, Cantor
formulas, enumeration and structure algorithms, native certification kernel,
examples, and performance boundaries.

Odd-degree genus-2 and genus-3 models over odd-characteristic finite fields
have canonical reduced Mumford divisors `(u,v)`, generalized Cantor
arithmetic, exact scalar multiplication, element orders, bounded enumeration,
and basic group structure:

```python
J = C.change_ring(GF(101)).jacobian()
J.order()
J.zero()
D = J([u, v])
2 * D
J.group_structure()
```

`J.order()` is derived from the cached local polynomial. Exact invariant
factors are verified to divide successively and multiply to the Jacobian
order. The native smalljac group backend is available only for its documented
odd-degree genus-2 domain; bounded ordinary-Python structure computation is
the fallback for small groups. Sage.js does not return an embedded abelian
group until generators and relations are certified.

Even-degree models still have exact local polynomials and point counts, but
their two-points-at-infinity Jacobian representation is not yet implemented.
Characteristic-2 Jacobian arithmetic is also an explicit capability boundary.
Calls to `jacobian()` on those models fail clearly instead of constructing an
incomplete group.

## Genus 3

The explicit `algorithm="rforest"` backend combines exact Hasse--Witt
residues, exact Weil-constrained lift enumeration, and certified
Jacobian/twist order filters. A modular residue is never reported as a full
local polynomial: completion must leave exactly one exhaustive candidate or
use the exact reference fallback.

The pinned rforest backend accelerates dense Hasse--Witt batches for integral
curves, and one traversal serves a requested prime interval. Its timing
diagnostics keep the remainder forest, candidate enumeration, primary
Jacobian certification, twist certification, and fallback costs separate.
`algorithm="auto"` does not yet select this path because complete dense-range
certification, rather than the modular stage alone, must pass the documented
performance gate.
