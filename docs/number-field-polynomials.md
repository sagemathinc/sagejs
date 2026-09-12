# Exact polynomials over simple number fields

N1 provides univariate and multivariate polynomials over an explicitly
presented simple absolute `NumberField`. No Singular dependency is used.
Finite-extension fields retain their existing implementation.

```sage
T = PolynomialRing(QQ, 't')
t = T.gen()
K = NumberField(t**3 - 2, 'a')
a = K.gen()
R = PolynomialRing(K, 'x')
x = R.gen()
f, g = x - a, x + 1
assert (f*g).quo_rem(f) == (g, R(0))
d, u, v = f.xgcd(g)
assert d == 1 and u*f + v*g == 1
assert f.resultant(g) == a + 1
assert (f**2*g**3).squarefree_decomposition().value() == f**2*g**3
S = PolynomialRing(K, ['x', 'y'], order='degrevlex')
x, y = S.gens()
assert ((x + a*y)**2).derivative(y) == 2*a*x + 2*a**2*y
assert (x + a*y).subs(x=y, y=x) == y + a*x
assert (x + y**2).homogenize()(1, 2, 1) == 5
```

All coefficients remain exact. `lex`, `deglex`, and `degrevlex` order only
the variable exponents. Substitution is simultaneous in the original parent;
evaluation returns a coefficient in the original field. Homogenization accepts
an existing generator, or a new name (default `h`) and extends the parent.
Polynomial variables cannot collide with the field generator's name.

`list()` and `coefficients()` return ascending dense univariate coefficients;
`coefficients(sparse=True)` omits zeros. `terms()` returns descending ordered
`(coefficient, exponent_tuple)` pairs, including in one variable. `dict()`
uses integer exponents in one variable and tuples in several variables.
Constructing a polynomial from this dictionary round-trips exactly.

`quo_rem` is exact division with remainder; `/` currently requires zero
remainder and otherwise raises `ArithmeticError`. Unlike Sage, this N1 route
does not construct rational functions. Multivariate gcd, factorization,
ideals, and geometry are not enabled by N1. Squarefree decomposition is not
irreducible factorization. All implemented operations are unconditional,
irrespective of `proof.polynomial()`; N2/N3 routing remains gated.

Explicit interchange uses `encode(f)` and `decode(R, packet)` from
`sagejs.polynomial_algorithms.generic_public`. Packets record a normalized
defining polynomial, rational power-basis coordinates, variables and order.
Decoding validates canonical terms and uses the supplied parent, never an
implicit field isomorphism. Cosmetic generator renaming is allowed only
through this explicit receiving-parent operation. Arithmetic never serializes
its intermediate values.

## Resource envelope

- Coefficient numerators and denominators: at most 4096 bits, checked on
  polynomial ingress and sparse arithmetic results, including evaluation.
- At most 4096 input/intermediate terms and 65,536 power-basis coordinate
  cells per polynomial; at most 64 variables and exponent 1,048,576.
- Dense coefficient lists and Euclidean operations: degree at most 4096,
  also subject to the coordinate-cell bound.
- Sparse operations: one million charged operations and a cooperative
  30-second deadline. Resultants use a Sylvester matrix of dimension at most
  64. Euclidean and squarefree loops check deadlines between operations.

These are rejection limits, not promised performance. They do not interrupt
an individual coefficient operation or bound the internal memory of a foreign
scalar operation. A rejected computation returns no partial mathematical result.
Number-field construction has its own existing limits. Production platform
qualification belongs to N5; local N1 tests are not N5 receipts.

Executable coverage: `test/number-field-polynomial.py`, run through its `.cjs`
wrapper, and `test/number-field-exact-coordinates.py`. They include five field
presentations, pinned independent Sage witnesses and malformed-input tests.
