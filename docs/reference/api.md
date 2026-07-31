---
title: "Sage.js API reference"
docspec_version: 1
generated: true
---

# Sage.js API reference

This file is generated from the runtime DocSpec registry. Edit the
adjacent public docstring and registration metadata, then regenerate it.

## `AffineSpace`

```sage
AffineSpace(dimension, base, names='x')
```

Construct affine space with the requested coordinate names.

### Example

```sage
sage: A = AffineSpace(2, QQ, 'xy')
sage: A
Affine Space of dimension 2 over Rational Field
sage: A.gens()
(x, y)
```

The coordinate ring is a FLINT-backed multivariate polynomial ring.

### Metadata

- Kind: `function`
- Module: `sage.schemes`
- Tags: algebraic geometry, affine schemes, curves, multivariate polynomials
- Backends: FLINT, Sage.js algebraic geometry layer
- Sage compatibility: partial — Affine plane curves, hypersurface components, and rational plane-curve intersections are supported. General schemes and primary decomposition remain outside the current implementation.
- Limitations: General primary decomposition is not implemented, and complete Gröbner-fan enumeration currently covers the twisted-cubic determinantal ideal.

### Provenance

- `sage-derived` — [SageMath schemes and plane curves API](https://doc.sagemath.org/html/en/reference/curves/); license GPL-2.0-or-later
- `library-backed` — [FLINT multivariate polynomial arithmetic](https://flintlib.org/doc/)

## `Curve`

```sage
Curve(polynomial)
```

Construct an affine plane curve from a multivariate polynomial.

### Example

```sage
sage: x, y = AffineSpace(2, QQ, 'xy').gens()
sage: C = Curve((x^2 + y^2 - 1) * (x^3 + y^3 - 1))
sage: C.irreducible_components()
[Closed subscheme of Affine Space of dimension 2 over Rational Field defined by:
  x^2 + y^2 - 1, Closed subscheme of Affine Space of dimension 2 over Rational Field defined by:
  x^3 + y^3 - 1]
```

Hypersurface components use FLINT multivariate factorization. Plane-curve
intersections over `QQ` use a resultant followed by factorization and
Gröbner bases. General primary decomposition is not yet implemented.

### Metadata

- Kind: `function`
- Module: `sage.schemes`
- Tags: algebraic geometry, affine schemes, curves, multivariate polynomials
- Backends: FLINT, Sage.js algebraic geometry layer
- Sage compatibility: partial — Affine plane curves, hypersurface components, and rational plane-curve intersections are supported. General schemes and primary decomposition remain outside the current implementation.
- Limitations: General primary decomposition is not implemented, and complete Gröbner-fan enumeration currently covers the twisted-cubic determinantal ideal.

### Provenance

- `sage-derived` — [SageMath schemes and plane curves API](https://doc.sagemath.org/html/en/reference/curves/); license GPL-2.0-or-later
- `library-backed` — [FLINT multivariate polynomial arithmetic](https://flintlib.org/doc/)

## `dimension_cusp_forms`

```sage
dimension_cusp_forms(group, weight=2)
```

Return the dimension of a space of cuspidal modular forms.

`group` may be a positive level (interpreted as `Gamma0(level)`), a
`Gamma0` or `Gamma1` subgroup, or a Dirichlet character. Dimensions
for congruence subgroups use exact Riemann--Roch formulas; character
spaces use the Cohen--Oesterlé formula.

### Examples

```sage
sage: dimension_cusp_forms(Gamma0(11), 2)
1
sage: dimension_cusp_forms(Gamma0(1), 12)
1
sage: eps = DirichletGroup(13).gen(0)^2
sage: dimension_cusp_forms(eps, 2)
1
```

Weight-one cases that require the Schaeffer algorithm raise
`NotImplementedError` instead of returning an unproved value.

### Metadata

- Kind: `function`
- Module: `sage.modular.dims`
- Tags: modular forms, dimensions, cusp forms, Dirichlet characters
- Backends: Sage.js exact arithmetic, FLINT
- Sage compatibility: partial — Implemented Gamma0, Gamma1, and Dirichlet-character cases match SageMath; unresolved weight-one Schaeffer cases raise NotImplementedError.
- Algorithm: Exact Riemann--Roch and Cohen--Oesterlé dimension formulas
- Limitations: Some weight-one cusp dimensions requiring the Schaeffer algorithm are not implemented.

### Provenance

- `sage-derived` — [SageMath modular dimension API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/dims.html); license GPL-2.0-or-later
- `literature-implemented` — Riemann--Roch and Cohen--Oesterlé formulas

### References

- Henri Cohen, Joseph Oesterlé, [Dimensions des espaces de formes modulaires](https://doi.org/10.1007/BFb0065297) (1977).

## `dimension_eis`

```sage
dimension_eis(group, weight=2)
```

Return the dimension of the Eisenstein subspace.

Accepted groups and characters are the same as for
`dimension_cusp_forms`. The result is an exact integer obtained from
cusp data or the Cohen--Oesterlé character formula.

### Metadata

- Kind: `function`
- Module: `sage.modular.dims`
- Tags: modular forms, dimensions, Eisenstein series, Dirichlet characters
- Backends: Sage.js exact arithmetic, FLINT
- Sage compatibility: partial — Implemented Gamma0, Gamma1, and Dirichlet-character cases match SageMath; unresolved weight-one Schaeffer cases raise NotImplementedError.
- Algorithm: Exact Riemann--Roch and Cohen--Oesterlé dimension formulas
- Limitations: Some weight-one cusp dimensions requiring the Schaeffer algorithm are not implemented.

### Provenance

- `sage-derived` — [SageMath modular dimension API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/dims.html); license GPL-2.0-or-later
- `literature-implemented` — Riemann--Roch and Cohen--Oesterlé formulas

### References

- Henri Cohen, Joseph Oesterlé, [Dimensions des espaces de formes modulaires](https://doi.org/10.1007/BFb0065297) (1977).

## `dimension_modular_forms`

```sage
dimension_modular_forms(group, weight=2)
```

Return cusp dimension plus Eisenstein dimension for `group`.

### Metadata

- Kind: `function`
- Module: `sage.modular.dims`
- Tags: modular forms, dimensions, ambient spaces, Dirichlet characters
- Backends: Sage.js exact arithmetic, FLINT
- Sage compatibility: partial — Implemented Gamma0, Gamma1, and Dirichlet-character cases match SageMath; unresolved weight-one Schaeffer cases raise NotImplementedError.
- Algorithm: Exact Riemann--Roch and Cohen--Oesterlé dimension formulas
- Limitations: Some weight-one cusp dimensions requiring the Schaeffer algorithm are not implemented.

### Provenance

- `sage-derived` — [SageMath modular dimension API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/dims.html); license GPL-2.0-or-later
- `literature-implemented` — Riemann--Roch and Cohen--Oesterlé formulas

### References

- Henri Cohen, Joseph Oesterlé, [Dimensions des espaces de formes modulaires](https://doi.org/10.1007/BFb0065297) (1977).

## `DirichletGroup`

```sage
DirichletGroup(modulus, base_ring=None, zeta=None)
```

Return the group of Dirichlet characters modulo `modulus`.

Characters are exact, iterable, multiplicative, and valued in a
cyclotomic field.  FLINT supplies the unit-group decomposition and native
character arithmetic.

### Examples

```sage
sage: G = DirichletGroup(20)
sage: G.order(), G.modulus()
(8, 20)
sage: eps = G.gen(0)
sage: eps(3) * eps(7) == eps(21)
True
```

A custom exact value field may be supplied, optionally together with a
root of unity whose order is divisible by the exponent of the character
group.

### Metadata

- Kind: `function`
- Module: `sage.modular.dirichlet`
- Tags: number theory, Dirichlet characters, finite abelian groups, modular forms
- Backends: FLINT, Sage.js native helpers
- Sage compatibility: partial — Standard groups, generators, evaluation, parity, conductors, Galois orbits, decomposition, and exact custom value fields with a supplied root of unity are supported.
- Algorithm: FLINT unit-group decomposition and character evaluation with Sage.js exact cyclotomic values
- Limitations: Analytic sums currently return values in QQbar rather than coercing them back into a custom value field.

### Provenance

- `sage-derived` — [SageMath Dirichlet character API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/dirichlet.html); license GPL-2.0-or-later
- `library-backed` — [FLINT Dirichlet characters](https://flintlib.org/doc/dirichlet.html)
- `sagejs-original` — Sage.js parent/element and exact cyclotomic integration

### References

- The FLINT contributors, [FLINT Dirichlet characters](https://flintlib.org/doc/dirichlet.html).

## `EisensteinForms`

```sage
EisensteinForms(group=1, weight=2, base_ring=None, use_cache=True, prec=6)
```

Construct the Eisenstein subspace of `ModularForms(group, weight)`.

Basis elements retain their parent and can be expanded later to a
different precision with `q_expansion(prec)`.

### Examples

```sage
sage: E = EisensteinForms(389, 2)
sage: b = E.basis(prec=20)[0]
sage: b.q_expansion(100).precision_absolute()
100
```

### Metadata

- Kind: `function`
- Module: `sage.modular.modform.constructor`
- Tags: modular forms, spaces, Eisenstein series, q-expansions
- Backends: FLINT, Sage.js exact arithmetic
- Sage compatibility: extension — The supported exact space and q-expansion operations follow SageMath; Sage.js does not yet implement the complete Hecke-module surface.
- Algorithm: Exact dimension formulas and native Eisenstein coefficient generation
- Limitations: Only QQ is currently accepted as the ambient base ring. General Hecke operators and cusp-form bases are not implemented.

### Provenance

- `sage-derived` — [SageMath modular forms API](https://doc.sagemath.org/html/en/reference/modfrm/); license GPL-2.0-or-later
- `library-backed` — [FLINT exact arithmetic](https://flintlib.org/)
- `sagejs-original` — Lightweight parent-aware modular-form implementation

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `EisensteinSeriesElement.q_expansion`

```sage
q_expansion(prec=None)
```

Return the `q`-expansion to absolute precision `O(q^prec)`.

### Parameters

- `prec` — nonnegative integer; when omitted, use the precision
  requested when this basis element was constructed.

### Examples

The level-389 weight-2 Eisenstein form can be displayed briefly and
then expanded farther without reconstructing its parent:

```sage
sage: E = EisensteinForms(389, 2)
sage: b = E.basis(prec=8)[0]
sage: b.q_expansion(5)
1 + 6/97*q + 18/97*q^2 + 24/97*q^3 + 42/97*q^4 + O(q^5)
```

### Implementation

Level-one divisor sums are generated in one native FLINT sieve.
Prime-level oldforms use the exact degeneracy map `q -> q^N`.

### Metadata

- Kind: `method`
- Module: `sage.modular.modform.element`
- Tags: modular forms, Eisenstein series, q-expansions, power series
- Backends: FLINT, Sage.js native helpers
- Sage compatibility: compatible — Returns an exact power series with Sage-style absolute precision notation.
- Algorithm: Native exact divisor-sum sieve and degeneracy maps
- Limitations: The currently constructed Eisenstein spaces cover the implemented congruence-subgroup cases.

### Provenance

- `sage-derived` — [SageMath modular-form element API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/modform/element.html); license GPL-2.0-or-later
- `library-backed` — [FLINT exact arithmetic](https://flintlib.org/)
- `sagejs-original` — Native coefficient sieve and parent integration

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `EisensteinSubspace.basis`

```sage
basis(prec=None)
```

Return a basis of modular forms, optionally with display precision.

### Parameters

- `prec` — nonnegative integer or `None`. If specified, basis
  entries are displayed to `O(q^prec)`. They retain their parent
  and can subsequently be expanded to any supported precision with
  `q_expansion`.

This optional argument is a convenient Sage.js extension: SageMath's
`basis()` currently uses the space's default precision instead.

### Metadata

- Kind: `method`
- Module: `sage.modular.modform.eis_submodule`
- Tags: modular forms, Eisenstein series, basis, q-expansions
- Backends: FLINT, Sage.js native helpers
- Sage compatibility: extension — The basis is Sage-compatible; the optional prec keyword is a Sage.js convenience extension.
- Algorithm: Exact Eisenstein coefficient construction with lazy precision extension

### Provenance

- `sage-derived` — [SageMath Eisenstein subspace API](https://doc.sagemath.org/html/en/reference/modfrm/); license GPL-2.0-or-later
- `sagejs-original` — Precision-aware retained-parent basis elements

## `EllipticCurve`

```sage
EllipticCurve(data, coefficients=None)
```

Construct an elliptic curve in general Weierstrass form.

```sage
sage: E = EllipticCurve([0,0,1,-1,0])
sage: E
Elliptic Curve defined by y^2 + y = x^3 - x over Rational Field
sage: 10 * E([0,0])
(161/16 : -2065/64 : 1)
```

### Metadata

- Kind: `function`
- Module: `sage.schemes.elliptic_curves.constructor`
- Aliases: `EllipticCurve_from_j`
- Tags: elliptic curves, number theory, Weierstrass equations, modular forms
- Backends: Sage.js exact arithmetic
- Sage compatibility: partial — General Weierstrass construction, rational point arithmetic, basic invariants, small Cremona labels, and coefficient lists are supported.
- Limitations: General conductors, ranks, descent, and isogeny classes need additional arithmetic algorithms or databases.

### Provenance

- `sage-derived` — [SageMath elliptic curves API](https://doc.sagemath.org/html/en/reference/arithmetic_curves/); license GPL-2.0-or-later

## `factor`

```sage
factor(value)
```

Return the exact factorization of an integer or factorable element.

Integer factorization is computed by FLINT and returned as a Sage-style
factorization object, so it can be iterated over as `(prime, exponent)`
pairs.

### Examples

```sage
sage: factor(2026)
2 * 1013
sage: list(factor(-12))
[(2, 2), (3, 1)]
```

JavaScript `number` inputs must be safe integers. Sage integer literals
automatically use `BigInt` when necessary.

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, factorization
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: FLINT integer factorization

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `fast_callable`

```sage
fast_callable(expression, vars=None)
```

Compile a symbolic expression to a hot JavaScript numeric function.

### Metadata

- Kind: `function`
- Module: `sage.symbolic`
- Tags: symbolic mathematics, evaluation, performance
- Backends: Cortex Compute Engine
- Sage compatibility: partial — Compiles supported real-valued symbolic expressions directly to JavaScript numeric functions.
- Algorithm: MathJSON adapter over Cortex Compute Engine
- Limitations: The current compiler targets JavaScript numeric evaluation.

### Provenance

- `sage-derived` — [SageMath symbolic API](https://doc.sagemath.org/html/en/reference/calculus/); license GPL-2.0-or-later
- `library-backed` — [Cortex Compute Engine](https://cortexjs.io/compute-engine/)

### References

- [Cortex Compute Engine](https://cortexjs.io/compute-engine/).

## `GF`

```sage
GF(order, name=None, modulus=None, names=None)
```

Construct the finite field with `order` elements.

The order must be a prime power.  Prime fields and extension fields use
FLINT arithmetic and participate in Sage.js parent/coercion semantics.
`name` (or `names`) names an extension-field generator.

### Examples

```sage
sage: GF(7)
Finite Field of size 7
sage: K.<a> = GF(9)
sage: a^8
1
sage: K['x']
Univariate Polynomial Ring in x over Finite Field in a of size 3^2
```

Explicit user-supplied modulus polynomials are not implemented yet.
Passing `modulus='primitive'` requests a primitive generator when the
backend supports it.

### Metadata

- Kind: `function`
- Module: `sage.rings.finite_rings.finite_field_constructor`
- Tags: rings, finite fields, field construction, extension fields
- Backends: FLINT
- Sage compatibility: partial — Prime-power construction and standard generator naming are compatible; explicit modulus polynomials remain unsupported.
- Algorithm: FLINT finite-field and modular arithmetic
- Limitations: Explicit user-supplied modulus polynomials are not implemented.

### Provenance

- `sage-derived` — [SageMath finite rings API](https://doc.sagemath.org/html/en/reference/finite_rings/); license GPL-2.0-or-later
- `library-backed` — [FLINT finite-field and modular arithmetic](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `help`

```sage
help(item=None)
```

Print concise Python-style help derived from Sage.js metadata.

### Metadata

- Kind: `function`
- Module: `builtins`
- Tags: documentation, introspection
- Backends: Sage.js runtime
- Sage compatibility: compatible — Provides concise runtime help for installed APIs.

### Provenance

- `sagejs-original`

## `implicit_plot3d`

```sage
implicit_plot3d(function_value, xrange, yrange, zrange, **options)
```

Plot an implicit surface in three variables.

The first argument may be an expression interpreted as `f = 0` or a
symbolic equality, which is reduced to `left - right = 0`. Each range
has Sage form `(variable, minimum, maximum)` or a three-item list.

### Examples

```sage
sage: var('x,y,z')
(x, y, z)
sage: implicit_plot3d(x^2+y^2+z^2 == 1,
....:     (x,-2,2), (y,-2,2), (z,-2,2))
Graphics3d Object
```

The current renderer samples a deterministic rectangular grid and emits a
Plotly isosurface.  It does not yet implement Sage's adaptive marching
cubes refinements.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d.implicit_plot3d`
- Tags: graphics, 3D graphics, implicit surfaces, symbolic equations
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — Sage expressions, equalities, ranges, and common options are supported; adaptive meshing is not yet implemented.
- Algorithm: Rectangular scalar-field sampling and Plotly isosurface
- Limitations: Adaptive marching-cubes refinement is not implemented.

### Provenance

- `sage-derived` — [SageMath 3D plotting API](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js isosurface rendering](https://plotly.com/javascript/3d-isosurface-plots/)

### References

- [Plotly.js 3D Isosurface Plots](https://plotly.com/javascript/3d-isosurface-plots/).

## `is_prime`

```sage
is_prime(value)
```

Return whether `value` is prime, using FLINT's primality test.

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, primes, primality
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: FLINT primality testing

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `log2`

```sage
log2
```

The natural logarithm of `2`.

### Examples

```sage
sage: log2
log(2)
sage: float(log2)
0.6931471805599453
```

### Metadata

- Kind: `constant`
- Module: `sage.functions.constants`
- Tags: symbolic constants, logarithms
- Backends: Sage.js symbolic engine
- Sage compatibility: compatible — Sage.js displays this constant canonically as log(2).

### Provenance

- `sage-derived` — [SageMath symbolic constants API](https://doc.sagemath.org/html/en/reference/functions/sage/functions/constants.html); license GPL-2.0-or-later

## `ManinPresentation`

```sage
ManinPresentation(projective_line)
```

A minimal weight-2 `Gamma_0(N)` modular-symbol presentation.

This is built natively from a connected well-formed fundamental domain.
Paired interior and boundary paths are eliminated structurally, leaving
the `E1` paths together with order-two and order-three stabilizer paths.

### Metadata

- Kind: `class`
- Module: `sage.modular.modsym.manin_symbol_list`
- Tags: number theory, modular symbols, fundamental domains, Manin relations
- Backends: Sage.js native C
- Sage compatibility: extension — This explicit presentation-inspection object is a Sage.js API; its weight-2 dimension agrees with SageMath.
- Algorithm: Connected Farey-triangle fundamental domain with structural elimination of F, E2, and T32 paths
- Limitations: The public object exposes presentation metadata; the retained paths and reductions are consumed internally by the exact Hecke engine. Boundary maps and explicit modular-symbol elements remain future work.

### Provenance

- `literature-implemented` — [Pollack and Stevens, Overconvergent modular symbols and p-adic L-functions](https://doi.org/10.24033/asens.2139)
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Preallocated array-and-index fundamental-domain implementation

## `ManinRelations`

```sage
ManinRelations(projective_line, modulus)
```

Sparse weight-2 `Gamma_0(N)` Manin relations over `GF(p)`.

Rows use the two-term relations `x + S*x` and the three-term
relations `x + R*x + R^2*x`, stored in native compressed-row form.

### Metadata

- Kind: `class`
- Module: `sage.modular.modsym.manin_symbol_list`
- Tags: number theory, modular symbols, sparse matrices, finite fields
- Backends: Sage.js native CSR, Sage.js minimal Manin presentation, FLINT nmod_mat
- Sage compatibility: extension — This explicit relation-matrix object is a Sage.js API. Its quotient dimension agrees with weight-2 Gamma0 modular symbols away from bad reduction characteristics.
- Algorithm: Orbit representatives for x + S*x and x + R*x + R^2*x over a prime field, with rank and dimension obtained from a minimal fundamental-domain presentation in characteristic greater than 3
- Limitations: Characteristic 2 and 3 still use dense FLINT elimination below 20 million matrix cells. Boundary maps, cuspidal subspaces, Hecke actions, and rational lifting are not yet part of this object.

### Provenance

- `literature-implemented` — [William Stein, Modular Forms: A Computational Approach](https://wstein.org/books/modform/)
- `sagejs-original` — Pre-sized native compressed-row relation builder
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/) (2007).

## `matrix`

```sage
matrix(*args)
```

Construct a dense matrix, optionally over an explicit base ring.

Sage's common row-list, flat-list, dimension, and entry-function forms are
supported. Exact matrices use FLINT on native hosts; `RDF`/`CDF` and
arbitrary-precision real/complex matrices use FLINT, Arb, and ACB.

### Examples

```sage
sage: A = matrix(ZZ, 2, [1, 2, 3, 4])
sage: A.det()
-2
sage: A.rref()
[1 0]
[0 1]
```

### Metadata

- Kind: `function`
- Module: `sage.matrix.constructor`
- Tags: linear algebra, matrices, construction, exact arithmetic, numerical linear algebra
- Backends: FLINT, Arb, ACB
- Sage compatibility: partial — Common dense constructors and implemented matrix methods are Sage-compatible; sparse matrices are not yet available.
- Algorithm: Native FLINT dense matrices, including Arb/ACB approximate arithmetic
- Limitations: Sparse matrix construction is not implemented.

### Provenance

- `sage-derived` — [SageMath matrix API](https://doc.sagemath.org/html/en/reference/matrices/); license GPL-2.0-or-later
- `library-backed` — [FLINT, Arb, and ACB](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `MatrixGroup`

```sage
MatrixGroup(generators)
```

Construct the finite matrix group generated by square matrices.

```sage
sage: M = MatrixSpace(GF(7), 2)
sage: G = MatrixGroup([M([[1,0],[-1,1]]), M([[1,1],[0,1]])])
sage: G.order()
336
```

The current implementation enumerates finite groups and computes
conjugacy classes using the conjugation action of the generators.

### Metadata

- Kind: `function`
- Module: `sage.groups`
- Tags: group theory, finite groups, permutation groups, matrix groups
- Backends: FLINT matrices with Sage.js finite group closure
- Sage compatibility: partial — The guided-tour finite group operations are compatible; large groups need non-enumerative algorithms.
- Limitations: Generic permutation and matrix groups are explicitly enumerated and are therefore intended for small orders.

### Provenance

- `sage-derived` — [SageMath finite groups API](https://doc.sagemath.org/html/en/reference/groups/); license GPL-2.0-or-later

## `ModularForms`

```sage
ModularForms(group=1, weight=2, base_ring=None, use_cache=True, prec=6)
```

Construct the implemented ambient space of modular forms.

`group` is a level or congruence subgroup, `weight` is nonnegative,
and `prec` controls the default displayed q-expansion precision.
Initial ambient spaces are exact over `QQ`.

### Examples

```sage
sage: M = ModularForms(Gamma0(11), 2)
sage: M.dimension()
2
sage: M.cuspidal_subspace().dimension()
1
```

This foundation currently provides exact dimensions, cusp/Eisenstein
subspaces, and Eisenstein q-expansions.  It is not yet SageMath's complete
Hecke-module implementation.

### Metadata

- Kind: `function`
- Module: `sage.modular.modform.constructor`
- Tags: modular forms, spaces, ambient spaces
- Backends: FLINT, Sage.js exact arithmetic
- Sage compatibility: partial — The supported exact space and q-expansion operations follow SageMath; Sage.js does not yet implement the complete Hecke-module surface.
- Algorithm: Exact dimension formulas and native Eisenstein coefficient generation
- Limitations: Only QQ is currently accepted as the ambient base ring. General Hecke operators and cusp-form bases are not implemented.

### Provenance

- `sage-derived` — [SageMath modular forms API](https://doc.sagemath.org/html/en/reference/modfrm/); license GPL-2.0-or-later
- `library-backed` — [FLINT exact arithmetic](https://flintlib.org/)
- `sagejs-original` — Lightweight parent-aware modular-form implementation

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `ModularSymbols`

```sage
ModularSymbols(group=1, weight=2, sign=0, base_ring=None)
```

Construct a modular-symbol Hecke module.

Weight-2 full `Gamma_0(N)` spaces with sign zero provide exact matrices
for every Hecke operator `T_n`. Prime operators are assembled natively
from a minimal Manin presentation; general indices use multiplicativity
and the weight-2 prime-power recurrence. Additional guided-tour models
cover selected higher-weight, character, and cuspidal examples.

### Metadata

- Kind: `function`
- Module: `sage.modular.modsym.modsym`
- Tags: number theory, modular symbols, modular forms, Hecke operators, q-expansions
- Backends: FLINT, Sage.js portable C modular-symbol core, Sage.js native P1List and Manin presentation
- Sage compatibility: partial — Weight-2 Gamma0 spaces expose native P1 representatives and exact T_n matrices for arbitrary positive indices in the full sign-zero space. Selected higher-weight, Gamma1, character, and cuspidal guided-tour models provide further bases, characteristic polynomials, and q-expansions.
- Limitations: The general native engine currently covers full weight-2 Gamma0 spaces with sign zero and trivial character. General-weight and character Manin relations are not yet built. Boundary maps, star eigenspaces, and cuspidal restriction remain future work.

### Provenance

- `sage-derived` — [SageMath modular symbols API and guided tour](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP well-formed fundamental domain and path reduction strategy](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated C Hecke assembler, strict-Python Hecke algebra integration, and FLINT matrix boundary

## `ModularSymbolsSpace.hecke_matrix`

```sage
hecke_matrix(index)
```

Return the exact matrix of the Hecke operator `T_index`.

For a full weight-2 `Gamma_0(N)` space with sign zero, every positive
index is supported. Prime matrices are computed by the portable C
Manin-symbol engine. Composite indices use commuting prime factors,
`U_p` powers at bad primes, and
`T_(p^r) = T_p T_(p^(r-1)) - p T_(p^(r-2))` at good primes.

```sage
sage: M = ModularSymbols(1000, 2)
sage: M.hecke_matrix(6).trace()
60
```

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, Hecke operators, exact matrices
- Backends: Sage.js portable C modular-symbol core, FLINT integer and rational matrices
- Sage compatibility: compatible — Full weight-2 Gamma0 sign-zero spaces support exact T_n matrices for every positive index.
- Algorithm: Native prime Hecke matrices, multiplicativity, Up powers, and the weight-2 good-prime recurrence
- Limitations: The general engine currently requires full weight-2 Gamma0 spaces with sign zero and trivial character.

### Provenance

- `literature-implemented` — [William Stein, Modular Forms: A Computational Approach](https://wstein.org/books/modform/)
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later

## `next_prime`

```sage
next_prime(value)
```

Return the smallest prime strictly greater than `value` using FLINT.

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, primes
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: FLINT next-prime search

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `NumberField`

```sage
NumberField(polynomial, names=None)
```

Construct the exact simple field `QQ[a]/(polynomial)`.

### Metadata

- Kind: `function`
- Module: `sage.rings.number_field.number_field`
- Tags: number theory, number fields, algebraic numbers, exact arithmetic
- Backends: Sage.js exact quotient arithmetic, FLINT polynomials
- Sage compatibility: partial — Simple fields over QQ have exact arithmetic and Sage-style generators. Custom Dirichlet value fields are supported.
- Limitations: General integral bases, unit groups, Galois groups, and class groups await a dedicated number-field backend.

### Provenance

- `sage-derived` — [SageMath number field API](https://doc.sagemath.org/html/en/reference/number_fields/); license GPL-2.0-or-later
- `library-backed` — [FLINT polynomial arithmetic](https://flintlib.org/doc/)

## `P1List`

```sage
P1List(level)
```

The projective line `P^1(Z/NZ)` with Sage-compatible representatives.

Representative storage and indexing are native. The constructor computes
the exact cardinality first, allocates once, fills the array, sorts it in
Sage order, and builds a fixed-size open-addressed index.

```sage
sage: P = P1List(12)
sage: len(P)
24
sage: P.normalize(7, 15)
(1, 9)
sage: P.apply_S(P.apply_S(10))
10
```

### Metadata

- Kind: `class`
- Module: `sage.modular.modsym.p1list`
- Tags: number theory, modular symbols, projective line, Manin relations
- Backends: Sage.js native C, FLINT nmod_mat
- Sage compatibility: compatible — Representative ordering, normalization, I, S, and the historical order-three T action agree with SageMath. apply_R and apply_translation are explicit extensions.
- Algorithm: Exact cardinality preallocation, canonical normalization, lexicographic representatives, open-addressed indexing, a preallocated Pollack--Stevens fundamental domain, and batched exact path reduction for weight-2 Hecke matrices
- Limitations: Levels are currently limited to signed 32-bit positive integers.

### Provenance

- `sage-derived` — [SageMath P1List implementation](https://github.com/sagemath/sage/blob/develop/src/sage/modular/modsym/p1list.pyx); license GPL-2.0-or-later
- `sagejs-original` — [William Stein JSage Zig P1List](https://github.com/sagemathinc/JSage/blob/2582234b6f76f8a5e1cecae319ae1a098d9b3c50/lib/src/modular/p1list.zig); revision 2582234b6f76f8a5e1cecae319ae1a098d9b3c50

## `P1List.hecke_matrix`

```sage
hecke_matrix(prime)
```

Return the exact weight-2 `T_p` (or `U_p`) matrix in the native
minimal Manin basis.

The index must be prime. If it divides the level this constructs
`U_p`; otherwise it constructs `T_p`. Path reduction and matrix
assembly happen in one native batch, so matrix entries never cross
the JavaScript boundary individually.

```sage
sage: P1List(11).hecke_matrix(2)
[ 3  0  0]
[ 1 -2  0]
[ 1  0 -2]
```

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.p1list`
- Tags: number theory, modular symbols, Hecke operators, Manin symbols
- Backends: Sage.js portable C modular-symbol core, FLINT integer matrices
- Sage compatibility: extension — The matrix is expressed in Sage.js's minimal E1 Manin basis; traces and characteristic polynomials agree with SageMath and PARI.
- Algorithm: Pollack--Stevens fundamental domain, continued-fraction Manin reduction, and standard Tp/Up representatives
- Limitations: The low-level method accepts prime indices only. Use ModularSymbols(...).hecke_matrix(n) for composite indices.

### Provenance

- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated path reducer and batched row-major Hecke assembler

## `PermutationGroup`

```sage
PermutationGroup(generators)
```

Construct the finite permutation group generated by cycle data.

```sage
sage: G = PermutationGroup(['(1,2,3)(4,5)', '(3,4)'])
sage: G.order()
120
sage: G.is_abelian()
False
```

Small groups are represented concretely by enumerating the closure of the
generators. Centers and derived subgroups are computed from those actual
elements.

### Metadata

- Kind: `function`
- Module: `sage.groups`
- Tags: group theory, finite groups, permutation groups, matrix groups
- Backends: Sage.js finite permutation closure
- Sage compatibility: partial — The guided-tour finite group operations are compatible; large groups need non-enumerative algorithms.
- Limitations: Generic permutation and matrix groups are explicitly enumerated and are therefore intended for small orders.

### Provenance

- `sage-derived` — [SageMath finite groups API](https://doc.sagemath.org/html/en/reference/groups/); license GPL-2.0-or-later

## `plot`

```sage
plot(funcs, *range_args, **options)
```

Plot a callable, symbolic expression, or list of functions on an interval.

Both `plot(f, xmin, xmax)` and Sage's `plot(f, (x, xmin, xmax))`
forms are accepted. Adaptive sampling produces a semantic `Graphics`
object whose rich representation is portable Plotly data.

### Examples

```sage
sage: g = plot(sin(x), (x, 0, 2*pi), color='navy')
sage: len(g)
1
```

Use `show(g)` in a notebook for rich display, or `g.save(...)` on a
host with a supported Plotly export route.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, adaptive sampling
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — Core Sage call forms and common options are supported; the complete Sage plotting option and primitive catalog is larger.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `PolynomialRing`

```sage
PolynomialRing(base, variable=None, names=None, sparse=False, implementation=None, order='degrevlex')
```

Construct a univariate or multivariate polynomial ring.

Coefficient rings currently include `ZZ`, `QQ`, prime and extension
finite fields, `Zmod(n)`, and approximate real fields. Exact arithmetic
is backed by FLINT; approximate real polynomials use a small sparse
coefficient layer. A comma-separated name list constructs a multivariate
ring.

### Examples

```sage
sage: R.<x> = QQ[]
sage: (x^4 - 1).factor()
(x + 1) * (x - 1) * (x^2 + 1)
sage: S.<x,y> = GF(4, 'a')[]
sage: (x + y)^3
x^3 + x^2*y + x*y^2 + y^3
```

Supported monomial orders are `lex`, `deglex`, and `degrevlex`.
The accepted keyword surface is intentionally smaller than SageMath's
full constructor while native implementations are selected automatically.

### Metadata

- Kind: `function`
- Module: `sage.rings.polynomial.polynomial_ring_constructor`
- Aliases: `polygen`
- Tags: rings, polynomials, multivariate polynomials, exact arithmetic, approximate arithmetic
- Backends: FLINT, Sage.js sparse polynomial layer
- Sage compatibility: partial — Core univariate and multivariate construction and arithmetic are compatible over exact and approximate real coefficient rings; SageMath exposes additional constructor implementations and coefficient rings.
- Algorithm: FLINT exact polynomial arithmetic with a sparse generic layer for approximate real coefficients
- Limitations: Only lex, deglex, and degrevlex monomial orders are currently accepted. Complete Gröbner-fan enumeration currently covers the twisted-cubic determinantal ideal; arbitrary fans require a general polyhedral fan backend.

### Provenance

- `sage-derived` — [SageMath polynomial ring API](https://doc.sagemath.org/html/en/reference/polynomial_rings/); license GPL-2.0-or-later
- `library-backed` — [FLINT polynomial arithmetic](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `prime_pi`

```sage
prime_pi(value)
```

Return the number of primes less than or equal to `value`.

Results are exact.  The current implementation incrementally caches
primes supplied by FLINT, which is efficient for repeated calls over
increasing moderate bounds.

### Examples

```sage
sage: prime_pi(10)
4
sage: prime_pi(100)
25
```

For very large isolated bounds, a future direct FLINT prime-counting
backend may be preferable to enumerating all preceding primes.

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, primes, prime counting
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: Incremental prime enumeration and caching over FLINT
- Limitations: Large isolated bounds currently enumerate all preceding primes.

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `prime_range`

```sage
prime_range(start, stop=None)
```

Return the primes in the half-open interval `[start, stop)`.

With one argument, return the primes from 2 up to (but not including)
`start`.

### Examples

```sage
sage: prime_range(10)
[2, 3, 5, 7]
sage: prime_range(10, 20)
[11, 13, 17, 19]
```

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, primes, enumeration
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: Repeated FLINT next-prime search

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `Qp`

```sage
Qp(prime, prec=20)
```

Construct a capped-relative p-adic field.

### Metadata

- Kind: `function`
- Module: `sage.rings.padics.factory`
- Aliases: `Zp`
- Tags: number theory, p-adic fields, p-adic rings
- Backends: Sage.js exact rational expansion
- Sage compatibility: partial — Capped-relative parents and exact rational expansions are compatible; analytic and extension-field operations are not yet implemented.
- Algorithm: modular inversion followed by base-p digit extraction
- Limitations: Only exact rational elements are currently supported.

### Provenance

- `sage-derived` — [SageMath p-adic factory API](https://doc.sagemath.org/html/en/reference/padics/); license GPL-2.0-or-later

## `random_matrix`

```sage
random_matrix(base, nrows, ncols=None, algorithm='randomize', implementation=None, *args, **kwds)
```

Construct a random dense matrix over `base`.

The dimensions are `nrows` by `ncols`; omitting `ncols` constructs
a square matrix. The common Sage keywords `density`, `x`, `y`, and
`distribution='uniform'` are supported where meaningful.

### Examples

```sage
sage: A = random_matrix(ZZ, 3, 5, x=-10, y=11)
sage: A.nrows(), A.ncols(), A.base_ring()
(3, 5, Integer Ring)
sage: random_matrix(GF(9, 'a'), 2).base_ring() is GF(9, 'a')
True
```

Sparse matrices and alternate construction algorithms are not yet
implemented.

### Metadata

- Kind: `function`
- Module: `sage.matrix.constructor`
- Tags: linear algebra, matrices, random generation, benchmarking
- Backends: FLINT, Arb, ACB
- Sage compatibility: partial — The randomize algorithm and common density/range options are compatible; specialized SageMath algorithms are not available.
- Algorithm: Native FLINT dense matrices, including Arb/ACB approximate arithmetic
- Limitations: Only algorithm=randomize is supported. Sparse output is not implemented.

### Provenance

- `sage-derived` — [SageMath matrix API](https://doc.sagemath.org/html/en/reference/matrices/); license GPL-2.0-or-later
- `library-backed` — [FLINT, Arb, and ACB](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `search_doc`

```sage
search_doc(query)
```

Search the docstrings of public objects loaded into Sage.js.

The search is a case-insensitive literal match over public names and
runtime docstrings.  Results include top-level functions and classes as
well as documented methods of loaded Python classes.

### Examples

```sage
sage: search_doc('q-expansion')
Search results for 'q-expansion':
    EisensteinSeriesElement.q_expansion -- Return the ...
```

This intentionally searches the locally installed Sage.js API.  It does
not imply that every object documented by the full SageMath manual is
implemented.

### Metadata

- Kind: `function`
- Module: `builtins`
- Tags: documentation, search, introspection
- Backends: Sage.js runtime
- Sage compatibility: compatible — Searches the installed Sage.js corpus only.

### Provenance

- `sagejs-original`

## `show`

```sage
show(value, *others, **options)
```

Return `value` for rich display, combining graphics when requested.

Multiple graphics are added before display.  Notebook kernels render the
returned semantic object using Plotly-compatible HTML/data, without
requiring a Jupyter extension.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, rich display, Jupyter
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — Sage-style graphics composition is supported; display routing uses portable Plotly MIME/HTML rather than a Sage frontend.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `solve`

```sage
solve(equations, *variables, **options)
```

Solve supported elementary symbolic equations.

One equation or a list of equations may be supplied, followed by one or
more variables. Set `solution_dict=True` for dictionary-valued
solutions.

### Examples

```sage
sage: solve(x^2 == 4, x)
[x == -2, x == 2]
```

Sage.js delegates elementary solving to Cortex Compute Engine and applies
a few exact Sage-compatible reductions.  If the backend cannot solve an
equation, Sage.js returns an equivalent unsolved relation instead of the
mathematically misleading empty list.  Coupled nonlinear systems and many
transcendental families remain outside the current supported surface.

### Metadata

- Kind: `function`
- Module: `sage.symbolic`
- Tags: symbolic mathematics, equations, solving
- Backends: Cortex Compute Engine
- Sage compatibility: partial — Supported elementary equations follow Sage-style output; unsupported families are returned as unsolved relations.
- Algorithm: MathJSON adapter over Cortex Compute Engine
- Limitations: Coupled nonlinear systems are not generally implemented. Many transcendental solution families are not implemented.

### Provenance

- `sage-derived` — [SageMath symbolic API](https://doc.sagemath.org/html/en/reference/calculus/); license GPL-2.0-or-later
- `library-backed` — [Cortex Compute Engine](https://cortexjs.io/compute-engine/)

### References

- [Cortex Compute Engine](https://cortexjs.io/compute-engine/).

## `Sp`

```sage
Sp(degree, field)
```

Construct a finite symplectic group in its natural representation.

The order uses
`|Sp(2n,q)| = q^(n^2) product_(i=1)^n (q^(2i)-1)`.

```sage
sage: Sp(4, GF(7)).order()
276595200
```

### Metadata

- Kind: `function`
- Module: `sage.groups`
- Tags: group theory, finite groups, permutation groups, matrix groups
- Backends: Sage.js classical group formulas
- Sage compatibility: partial — The guided-tour finite group operations are compatible; large groups need non-enumerative algorithms.
- Limitations: Generic permutation and matrix groups are explicitly enumerated and are therefore intended for small orders.

### Provenance

- `sage-derived` — [SageMath finite groups API](https://doc.sagemath.org/html/en/reference/groups/); license GPL-2.0-or-later

## `sudoku`

```sage
sudoku(puzzle)
```

Solve a 9-by-9 Sudoku puzzle represented by a matrix.

Entries from 1 through 9 are fixed clues and zero denotes an empty cell.
The input matrix is not modified.  A `ValueError` is raised if the clues
are inconsistent or the puzzle has no solution.

### Examples

```sage
sage: A = matrix(ZZ, 9, [
....:     5,0,0,0,8,0,0,4,9, 0,0,0,5,0,0,0,3,0,
....:     0,6,7,3,0,0,0,0,1, 1,5,0,0,0,0,0,0,0,
....:     0,0,0,2,0,8,0,0,0, 0,0,0,0,0,0,0,1,8,
....:     7,0,0,0,0,4,1,5,0, 0,3,0,0,0,2,0,0,0,
....:     4,9,0,0,5,0,0,0,3])
sage: sudoku(A)[0]
(5, 1, 3, 6, 8, 7, 2, 4, 9)
```

### Metadata

- Kind: `function`
- Module: `sage.matrix.constructor`
- Tags: linear algebra, matrices, constraint solving, games
- Backends: FLINT, Arb, ACB
- Sage compatibility: partial — Solves Sage-compatible 9 by 9 integer Sudoku matrices.
- Algorithm: Native FLINT dense matrices, including Arb/ACB approximate arithmetic

### Provenance

- `sage-derived` — [SageMath matrix API](https://doc.sagemath.org/html/en/reference/matrices/); license GPL-2.0-or-later
- `library-backed` — [FLINT, Arb, and ACB](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `var`

```sage
var(names)
```

Create one or more symbolic variables and publish them in the session.

Names may be separated by commas, spaces, or both.  A single name returns
one symbolic expression; multiple names return a tuple.

### Examples

```sage
sage: var('x y')
(x, y)
sage: (x^2 + y).derivative(x)
2*x
```

### Metadata

- Kind: `function`
- Module: `sage.symbolic`
- Tags: symbolic mathematics, variables, expressions
- Backends: Cortex Compute Engine
- Sage compatibility: compatible — Matches Sage variable creation for supported names.
- Algorithm: MathJSON adapter over Cortex Compute Engine

### Provenance

- `sage-derived` — [SageMath symbolic API](https://doc.sagemath.org/html/en/reference/calculus/); license GPL-2.0-or-later
- `library-backed` — [Cortex Compute Engine](https://cortexjs.io/compute-engine/)

### References

- [Cortex Compute Engine](https://cortexjs.io/compute-engine/).

## `Zmod`

```sage
Zmod(order)
```

Construct the ring of integers modulo `order`.

Elements support exact arithmetic, inversion of units, iteration, and
matrices and polynomial rings over the resulting parent.

### Examples

```sage
sage: R = Zmod(15)
sage: R(17)
2
sage: R(2)^4
1
```

The current constructor requires `order >= 2`.

### Metadata

- Kind: `function`
- Module: `sage.rings.finite_rings.integer_mod_ring`
- Tags: rings, finite fields, residue rings, modular arithmetic
- Backends: FLINT
- Sage compatibility: partial — The supported arithmetic is Sage-compatible; the current constructor requires modulus at least 2.
- Algorithm: FLINT finite-field and modular arithmetic
- Limitations: Moduli 0 and 1 are not currently constructed.

### Provenance

- `sage-derived` — [SageMath finite rings API](https://doc.sagemath.org/html/en/reference/finite_rings/); license GPL-2.0-or-later
- `library-backed` — [FLINT finite-field and modular arithmetic](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).
