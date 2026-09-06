# Algebraic geometry without Singular

Sage.js has an exact, portable core for embedded affine and projective
schemes over `QQ` and prime fields `GF(p)`. It uses Sage.js polynomial rings,
Gröbner bases, quotient algebras, elimination, and exact linear algebra. It
does not install, start, or ship Singular (or another external computer
algebra system), so the same public computations run in the command-line
program, the npm package, Node WebAssembly, and a browser.

This is an intentionally focused first layer. It preserves nilpotents and
scheme structure, and it rejects computations whose hypotheses are not yet
implemented instead of silently treating every scheme as a reduced variety.

## Five-minute tour

Both common Sage constructor orders work:

```python
A = AffineSpace(QQ, 2, names=("x", "y"))
assert A is AffineSpace(2, QQ, names=("x", "y"))
x, y = A.gens()

X = A.subscheme([y - x**2])
P = X(2, 4)
assert P in X
assert X.dimension() == 1
assert X.codimension() == 1

Q = X.coordinate_ring()
qx, qy = Q.gens()
assert qy == qx**2
```

The coordinate ring is a genuine quotient parent. Its elements are reduced
to canonical Gröbner normal form, so arithmetic and equality do not depend on
the representative that happened to be entered.

Scheme intersection uses ideal sum and scheme union uses ideal intersection;
neither operation radicalizes:

```python
Lx = A.subscheme([x])
Ly = A.subscheme([y])
cross = Lx.union(Ly)
origin = Lx.intersection(Ly)

assert cross.defining_ideal().is_equal(A.coordinate_ring().ideal(x*y))
assert origin.defining_ideal().is_equal(A.coordinate_ring().ideal(x, y))
assert A.subscheme([x]) != A.subscheme([x**2])
```

Projective schemes use homogeneous equations and compare their saturated
`Proj` ideals:

```python
P2 = ProjectiveSpace(QQ, 2, names=("x", "y", "z"))
x, y, z = P2.gens()
C = Curve(y**2*z - x**3 - x*z**2)

assert C.dimension() == 1
assert C.degree() == 3
assert C.arithmetic_genus() == 1
assert P2(2, 4, 6) == P2(1, 2, 3)

patch = C.affine_patch(2)
assert patch.dimension() == 1
```

An affine scheme can be closed projectively without the incorrect shortcut
of merely homogenizing arbitrary submitted generators. Sage.js homogenizes
and then saturates by the homogenizing coordinate:

```python
A2 = AffineSpace(QQ, 2, names=("u", "v"))
u, v = A2.gens()
parabola = A2.subscheme([v - u**2])
closure = parabola.projective_closure("w")
assert closure.degree() == 2
```

Polynomial maps support evaluation, composition, graphs, fibers, inverse
images, and scheme-theoretic image closure:

```python
A1 = AffineSpace(QQ, 1, names=("t",))
t = A1.gen()
param = A1.hom([t, t**2], A2)

assert param(A1(3)) == A2(3, 9)
assert param.image().defining_ideal().is_equal(
    A2.coordinate_ring().ideal(v - u**2)
)
assert param.graph().defining_ideal().dimension() == 1
```

Standard-graded homogeneous ideals expose exact Hilbert data:

```python
R = PolynomialRing(QQ, names=("a", "b", "c"))
a, b, c = R.gens()
I = R.ideal(a**2, b**3)

assert I.h_vector() == (1, 2, 2, 1)
assert I.hilbert_polynomial() == 6
assert I.degree() == 6
```

Finally, zero-dimensional ideals have exact radicals, associated primes, and
primary decompositions. Components are ordered deterministically and checked
by exact recomposition:

```python
R = PolynomialRing(QQ, names=("x", "y"))
x, y = R.gens()
I1 = R.ideal((x - 1)**2, y)
I2 = R.ideal(x + 1, y**3)
I = I1.intersection(I2)

components = I.primary_decomposition()
assert len(components) == 2
assert components[0].intersection(components[1]).is_equal(I)
assert I.radical().is_equal(R.ideal(x**2 - 1, y))
```

## Tangents, smoothness, and plane curves

Formal derivatives retain their characteristic, including the mathematically
correct zero derivative of a `p`-th power in characteristic `p`.

```python
A = AffineSpace(QQ, 2, names=("x", "y"))
x, y = A.gens()
cusp = Curve(y**2 - x**3)
O = cusp(0, 0)

assert cusp.tangent_space(O).dimension() == 2
assert not cusp.is_smooth(O)
assert O in cusp.singular_subscheme()

P2 = ProjectiveSpace(QQ, 2, names=("r", "s", "t"))
r, s, t = P2.gens()
conic = Curve(r*t - s**2)
line = conic.tangent_line(conic(1, 0, 0))
assert line.defining_ideal().is_equal(P2.coordinate_ring().ideal(t))
```

Global singular subschemes are currently returned for hypersurfaces and
presentations certified as complete intersections. A reducible or
mixed-dimensional presentation for which one convenient size of Jacobian
minor is not justified raises `NotImplementedError`.

`arithmetic_genus()` is the projective plane-hypersurface value
`(d-1)(d-2)/2`, including for nonreduced hypersurfaces. Sage.js deliberately
does not call this the geometric genus of a singular curve; that needs
normalization and is outside this layer.

## Proof policy

Every operation that can invoke Gröbner bases, elimination, factorization, or
zero-dimensional splitting accepts `proof=None`. The default resolves through
the shared Sage-compatible preference:

```python
proof.polynomial()       # initially True
proof.polynomial(False)  # permit probabilistic polynomial backends
proof.polynomial(True)

I.radical(proof=True)
X.dimension(proof=False)
```

With proof required, rational Gröbner work uses an exact backend. With proof
disabled, compatible rational degree-reverse-lexicographic work may use the
faster modular msolve backend. Decompositions still undergo exact containment,
radical, and recomposition checks. A local `proof=` argument overrides the
global preference only for that call.

## Capability matrix

| Area | Available now | Exact scope |
| --- | --- | --- |
| Polynomial calculus | simultaneous substitution, evaluation, derivatives, gradients, homogenization, dehomogenization | multivariate rings supported by the polynomial layer |
| Quotients | canonical arithmetic, basis, coordinates, multiplication matrices, minimal polynomials, FGLM | finite-basis methods require dimension zero |
| Ideals | sum, membership, containment/equality, elimination, intersection, colon, saturation | `QQ` and prime `GF(p)` for this geometry milestone |
| Graded invariants | Hilbert numerator/series/polynomial, h-vector, dimension, degree | homogeneous ideals in a standard grading |
| Affine schemes | spaces, points, subschemes, coordinate rings, union/intersection, bounded finite-field points | `QQ`, prime `GF(p)` |
| Projective schemes | normalized points, saturated equality/emptiness, patches, closure, Hilbert data, degree | homogeneous ideals over `QQ`, prime `GF(p)` |
| Morphisms | polynomial maps, composition, graph, fiber, inverse image, image closure | everywhere-defined supported affine/projective maps |
| Jacobian geometry | Jacobian matrix, tangent space, point smoothness, supported singular subscheme | hypersurfaces and certified complete intersections |
| Plane curves | affine/projective constructors, degree, closure/patch, tangents, singular points, arithmetic genus | plane hypersurfaces over `QQ`, prime `GF(p)` |
| Decomposition | radical, associated primes, primary decomposition | zero-dimensional ideals over `QQ`, prime `GF(p)` |

The complete machine-readable routing and limitation table is
[`architecture/algebraic-geometry-capabilities.json`](../architecture/algebraic-geometry-capabilities.json).

## Intentional limitations

The following calls fail explicitly rather than selecting a semantically
different algorithm:

- finite extensions `GF(p^d)` with `d > 1` and number fields as scheme base
  fields; their separate implementation plan is
  [`agents/no-singular-extension-fields-plan.md`](../agents/no-singular-extension-fields-plan.md);
- the degenerate affine ambient space `AffineSpace(K, 0)`, pending a genuine
  zero-variable polynomial-ring parent (projective dimension zero is
  supported);
- general positive-dimensional radical or primary decomposition;
- mixed-dimensional global singular loci without a certified component
  decomposition;
- rational maps with a base locus, local monomial orders, local rings,
  blowups, and glued or covered schemes;
- modules, syzygies, free resolutions, Betti tables, and coherent sheaves;
- normalization, general curve function fields, divisors, Riemann--Roch,
  Jacobians of general plane curves, and geometric genus of singular curves;
  and
- inexact, relative, towered, transcendental, or mixed coefficient domains.

Resource envelopes also bound auxiliary variables, ideal generators,
saturation iterations, Jacobian minors, graph size, quotient dimension, and
deterministic separator search. Exceeding one raises `OverflowError` naming
the operation and limit; it never returns an empty or partial scheme.

Hilbert numerators admit at most 200000 collapsed LCM states and 200000
dense coefficients; the coefficient limit is checked before allocating the
dense list, even for a sparse input with enormous exponents. Jacobian minors
through order eight reuse subset minors in `O(n * 2**n)` ring operations,
without division or factorial-size recursive expansion. Separator candidates
are generated lazily, stopping as soon as an exact certificate is found.
Ambient-space caches retain weak values: constructing unrelated spaces does
not change the identity of a parent still owned by a point or scheme.

## Browser and npm use

All examples above are ordinary Sage.js source and can be pasted into
[app.sagejs.org](https://app.sagejs.org/). The browser's examples menu also
contains an algebraic-geometry tour. Capability failures are displayed as a
short exception name and mathematical limitation, without exposing an
internal evaluator stack.

For an embedded Node application, create a Sage session from
`@sagemath/sagejs/kernel` and evaluate the same source. For browser embedding,
follow [EMBEDDING.md](../EMBEDDING.md); computations remain local in the
user's browser.

## Design and provenance

The public scheme layer depends only on polynomial, ideal, quotient, and
field interfaces. It contains no FLINT/msolve handles and never inspects a
private coefficient representation. Backend selection includes operation,
exact base-field identity, monomial order, proof policy, platform, and the
resource envelope. An extension-field backend can therefore add a private
coefficient codec without adding a fake ambient coordinate or changing the
scheme API.

The algorithms are independent ordinary-Python implementations of classical
constructions, informed and differentially checked against SageMath, CoCoA,
Singular, Macaulay2, and Oscar. Exact revisions and source locations are in
[`architecture/upstream-algebra-provenance.json`](../architecture/upstream-algebra-provenance.json).
None of those systems is a Sage.js production dependency.
