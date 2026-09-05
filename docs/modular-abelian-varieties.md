---
title: "Modular abelian varieties"
---

# Modular abelian varieties over $\mathbf Q$

Sage.js represents the first modular-abelian-variety slice using exact
weight-$2$ modular symbols and saturated integral homology.  The initial scope
is $J_0(N)$ and its rational Hecke constituents over $\mathbf Q$.

The [benchmark notes](../bench/modular/abelian-varieties/README.md#larger-level-performance)
explain the sign-aware decomposition algorithm and give reproducible
larger-level comparisons with Sage. These force the factor lattices and
connected quotient maps, not just their lazy constructors.

## Start with $J_0(N)$

```sage
sage: J = J0(37)
sage: J
Abelian variety J0(37) of dimension 2
sage: (J.level(), J.dimension())
(37, 2)
sage: J.integral_homology().rank()
4
```

The dimension is cheap: Sage.js uses the modular-form dimension formula and
does not construct a Manin presentation until modular symbols, a lattice, or a
Hecke operator is requested.

The equivalent Sage-style entry points are available as well:

```sage
sage: Gamma0(37).jacobian() is J0(37)
True
```

`lattice()` is the saturated intersection

$$
H_1(J_0(N),\mathbf Z)
=S_2(\Gamma_0(N),\mathbf Q)_{\rm symb}\cap\mathbf Z^m
$$

inside the ambient Manin-symbol coordinates.

```sage
sage: H = J.lattice()
sage: (H.rank(), H.degree(), H.is_saturated())
(4, 5, True)
sage: H.basis_matrix()
[0 1 0 0 0]
[0 0 1 0 0]
[0 0 0 1 0]
[0 0 0 0 1]
```

The basis matrix lives in ambient rational coordinates even though the
abstract lattice has coefficient ring $\mathbf Z$.  This matters for quotient
lattices, whose natural embeddings can contain denominators.

## Integral Hecke action

Hecke operators are restricted from the ambient modular-symbol module and
then certified to preserve the full saturated lattice.

```sage
sage: T2 = J.T(2)
sage: T2.matrix().base_ring()
Integer Ring
sage: J.hecke_polynomial(2)
x^2 + 2*x
sage: J.integral_homology().T(2).charpoly().factor()
x^2 * (x + 2)^2
```

`J.hecke_polynomial(n)` has degree $\dim J$.  The characteristic polynomial on
$H_1(J,\mathbf Z)$ is its square.

## Exact decomposition

```sage
sage: D = J0(43).decomposition()
sage: D
[Modular abelian subvariety of dimension 1 of J0(43),
 Modular abelian subvariety of dimension 2 of J0(43)]
sage: [A.hecke_polynomial(2) for A in D]
[x + 2, x^2 - 2]
```

Each returned factor carries the full intersection lattice $W\cap\mathbf Z^m$
and an exact integral inclusion into the ambient Jacobian:

```sage
sage: A = D[1]
sage: i = A.inclusion_map()
sage: (i.is_injective(), i.verify())
(True, True)
sage: i.matrix().base_ring()
Integer Ring
```

At composite level, `decomposition()` currently means rational full-Hecke
isotypic decomposition.  Repeated oldform copies that do not split over
$\mathbf Q$ under the available $U_p$ action can remain together.  This is an
honest Hecke decomposition, not yet Sage's finer degeneracy-labelled
isogeny decomposition.

## The connected quotient $A_f$

Construct a quotient directly from an exact normalized newform packet:

```sage
sage: f = CuspForms(43, 2).newforms()[1]
sage: f.coefficient_field()
Number Field in a1 with defining polynomial x^2 - 2
sage: A = AbelianVariety(f)
sage: A
Newform quotient of dimension 2 of J0(43)
sage: A.newform() is f
True
sage: A.hecke_polynomial(2)
x^2 - 2
```

Sage.js identifies the sign-zero constituent using exact Hecke characteristic
polynomials.  If the signed newform constituent has dimension $d$, the
sign-zero constituent must have dimension $2d$ and satisfy

$$
\operatorname{charpoly}(T_n\mid H_1(A_f,\mathbf Q))
=\operatorname{charpoly}(T_n\mid f)^2.
$$

No floating-point eigenvalue recognition is involved.

The quotient map is a surjective map of integral homology lattices:

```sage
sage: q = A.quotient_map()
sage: (q.domain(), q.codomain())
(Abelian variety J0(43) of dimension 3,
 Newform quotient of dimension 2 of J0(43))
sage: (q.is_surjective(), q.verify())
(True, True)
sage: q.matrix().base_ring()
Integer Ring
```

Its kernel is saturated, so the target is the connected torsion-free quotient.

## Quotient versus embedded subvariety

The connected quotient lattice and the embedded constituent lattice should
not be silently identified.  They are rationally isomorphic but can differ by
finite isogeny data.

```sage
sage: Q = AbelianVariety(CuspForms(37, 2).newforms()[0])
sage: Q.lattice().basis_matrix()
[  0 1/2   0 1/2   0]
[  0   0 1/2 -1/2 1/2]
sage: B = Q.embedded_subvariety()
sage: B.lattice().basis_matrix()
[ 0  1  0  1  0]
[ 0  0  1 -1  1]
sage: B.inclusion_map().verify()
True
```

Accordingly, `Q.inclusion_map()` is intentionally rejected.  Use
`Q.embedded_subvariety().inclusion_map()` for the integral embedded model and
`Q.quotient_map()` for the quotient.

## Constructing from modular symbols

An exact sign-zero cuspidal modular-symbol subspace constructs its saturated
embedded subvariety:

```sage
sage: C = ModularSymbols(37, 2).cuspidal_submodule().decomposition()[0]
sage: A = AbelianVariety(C)
sage: (A.dimension(), A.modular_symbols() == C)
(1, True)
sage: A.inclusion_map().verify()
True
```

The constructor rejects noncuspidal spaces, nonzero sign, weights other than
$2$, nontrivial characters, non-$\Gamma_0$ groups, and coefficient rings other
than $\mathbf Q$ in this slice.

## Homology and exact maps

```sage
sage: A = J0(33)[0]
sage: HI = A.homology(ZZ)
sage: HQ = A.homology(QQ)
sage: (HI.rank(), HI.base_ring(), HQ.base_ring())
(2, Integer Ring, Rational Field)
sage: HI.hecke_matrix(2)
[1 0]
[0 1]
```

Map matrices use row action.  If $F:H_1(A)\to H_1(B)$, then a row vector $x$
maps to $xF$, and Hecke equivariance is the exact identity

$$
T_A F=F T_B.
$$

`kernel_lattice()` and `image_lattice()` expose the exact integral kernel and
image of a map.

## Safe serialization

```sage
sage: A = AbelianVariety(CuspForms(43, 2).newforms()[1])
sage: B = loads(dumps(A))
sage: A == B
True
sage: B.serialization_certificate().verify()
True
sage: loads(dumps(A.quotient_map())).verify()
True
```

SagePack stores construction data rather than derived lattice or Hecke caches.
Loading reruns the public constructor, canonical-newform validation,
constituent matching, saturation, and quotient construction.  This is a safe,
data-only, mathematically authenticated format; it never executes serialized
source code.

## Current boundary

This initial layer does not yet implement $J_1(N)$, nontrivial character
quotients, products, arbitrary Hecke ideals, periods, polarizations, modular
degrees, rational torsion, or component groups.  The saturated lattice and
exact-map representation is designed as the foundation for those features.

The implementation follows Sage's modular-abelian-variety semantics where
applicable, with the quotient/embedded-lattice distinction made explicit.
See SageMath's [modular abelian variety reference](https://doc.sagemath.org/html/en/reference/modabvar/)
and William Stein's papers on
[component groups](https://wstein.org/papers/compgrp/) and
[modular abelian varieties](https://wstein.org/papers/ants/).
