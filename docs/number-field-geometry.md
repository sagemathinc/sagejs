# Exact geometry over number fields

Simple absolute number fields use exact power-basis coefficients throughout.
They do not require Singular or a host Sage installation. Relative fields and
implicit embeddings between different presentations are not supported.

```sage test
T = PolynomialRing(QQ, "t")
t = T.gen()
K = NumberField(t**2 - 2, "a")
a = K.gen()
R = PolynomialRing(K, ["x", "y"])
x, y = R.gens()
I = R.ideal(x**2 - a, y - x)
assert I.vector_space_dimension() == 2
assert I.normal_form(x**3) == a * I.normal_form(x)
Q = I.quotient_ring()
assert Q(x)**2 == Q(a)
```

The exact Buchberger path supports lex, degree-lex, and degree-reverse-lex
orders, with deterministic certificates. `proof.polynomial()` controls the
default request; this implementation is exact even when proof is disabled.
Explicit packed FLINT/msolve requests are rejected for these coefficients.
Elimination, intersection, colon, saturation, FGLM, quotient multiplication
matrices, dimension, homogeneous Hilbert data, and the documented scheme and
plane-curve operations reuse the generic ideal algorithms.

```sage test
A = AffineSpace(K, 2, names=("u", "v"))
u, v = A.gens()
C = A.subscheme([v - a*u**2])
assert C.is_smooth()
assert C(1, a) in C
assert C.projective_closure("z").degree() == 2
```

## Factorization and solutions

```sage test
U = PolynomialRing(K, "z")
z = U.gen()
f = (z - a)**3 * (z**2 - 3)
assert f.factor().value() == f
assert (z**2 - 3).is_irreducible()
assert len(R.ideal(x**2 - 2, y).variety()) == 2
assert len(R.ideal(x**2 - 3, y).variety()) == 0
```

`variety()` reports **K-rational points**, not all points in an algebraic
closure. Zero-dimensional radical and primary decomposition retain nonsplit
residue extensions and verify intersection reconstruction.

Factorization uses an independent implementation of
[Trager's norm method (1976), Theorem 2.2](https://www.cecm.sfu.ca/~monaganm/teaching/TopicsinCA09/TragerFactor.pdf).
For each squarefree part, a deterministic primitive-element shift is sought
whose norm is squarefree. Complete exact factorization of that norm over QQ,
followed by nonconstant gcd recovery, justifies irreducibility and completeness;
the product alone would not. All shifts and rational norm factors are retained
by the internal `factor_with_evidence` diagnostic.

## Limits and qualification

The initial implementation prioritizes correctness, not fast large systems.
Polynomial coefficient coordinates are limited to 4096 bits, 4096 sparse terms,
and 65536 coordinate cells; generic Gröbner and quotient budgets also apply.
Number-field matrices use portable exact storage, limited to 65536 coordinate
cells. Norm factorization is limited to field degree 16, norm degree 64, 32
deterministic shifts, and 65536-bit rational determinant intermediates.
Its 120-second deadline is checked between operations: an individual foreign
library call is not interruptible by this check. Limits raise errors, never
partial factorizations or conjectural answers.

Production qualification is recorded separately in
[the completion audit](../agents/no-singular-number-fields-completion-audit.md).
Availability in source is not a cross-platform qualification receipt.
