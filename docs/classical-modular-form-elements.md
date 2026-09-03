---
title: "Classical modular-form elements and parents"
---

# Classical modular-form elements and parents

Sage.js represents a classical modular form by its mathematical parent and an
exact coordinate vector.  Its $q$-expansion is a lazy realization that can be
requested at any supported precision; truncation is not part of the form's
identity.

The object layer covers integral-weight $\Gamma_0(N)$ spaces with trivial or
Dirichlet character.  Quadratic-character spaces are defined over $\QQ$;
higher-order characters use their exact cyclotomic value fields.  Cuspidal,
new, and old spaces use exact modular-symbol bases.  Character Eisenstein
spaces use exact $E_k(\chi_1,\chi_2)(q^t)$ formulas, reduced to a canonical
Sturm-certified basis.

## Construct elements in a parent

```sage
sage: M = ModularForms(11, 2, prec=10)
sage: S = M.cuspidal_subspace()
sage: E = M.eisenstein_subspace()
sage: f = S.gen()
sage: f.parent() is S
True
sage: f.vector()
(1)
sage: f.q_expansion()
q - 2*q^2 - q^3 + 2*q^4 + q^5 + 2*q^6 - 2*q^7 - 2*q^9 + O(q^10)
```

The default printed precision comes from the parent, but a later request does
not reconstruct the mathematical element:

```sage
sage: f.q_expansion(15)
q - 2*q^2 - q^3 + 2*q^4 + q^5 + 2*q^6 - 2*q^7 - 2*q^9 - 2*q^10 + q^11 - 2*q^12 + 4*q^13 + 4*q^14 + O(q^15)
sage: f[11]
1
```

Parents accept exact coordinates, compatible parented forms, and sufficiently
precise exact power series:

```sage
sage: S([3]) == 3*f
True
sage: S(f.q_expansion(S.sturm_bound() + 1)) == f
True
sage: M(f).parent() is M
True
sage: M.coordinates(M(f))
(0, 1)
```

The coefficient at the Sturm bound is included in the certificate, so an
input series needs absolute precision at least `sturm_bound() + 1`.  Extra
supplied coefficients are checked too.  A nonmember or under-precise series
raises instead of being accepted from a suggestive prefix.

## Add forms across subspaces

Addition chooses the smallest evident common parent.  A cusp form plus an
Eisenstein form lands in the ambient space:

```sage
sage: e = E.gen()
sage: g = e + f
sage: g.parent() is M
True
sage: g.is_cuspidal()
False
sage: M.coordinates(g)
(1, 1)
```

Rational scalar arithmetic preserves the parent.  Products add weights and
use the least common multiple of the levels, then recover exact coordinates
in the target ambient space through its Sturm bound:

```sage
sage: M4 = ModularForms(1, 4, prec=10)
sage: E4 = M4.gen()
sage: E4.parent() is M4
True
sage: (E4^3).parent()
Modular Forms space of dimension 2 for Modular Group SL(2,Z) of weight 12 over Rational Field
sage: (E4/2).q_expansion(5)
1/2 + 120*q + 1080*q^2 + 3360*q^3 + 8760*q^4 + O(q^5)
```

Products with character multiply their nebentypus as well as adding weights.
The target level is the least common multiple of the source levels, and each
source character is induced to that level before multiplication.

## Spaces with Dirichlet character

Pass a character directly to `ModularForms`, `CuspForms`, or
`EisensteinForms`.  The character is part of the parent identity:

```sage
sage: G = DirichletGroup(13)
sage: chi = [e for e in G if e.conrey_number() == 4][0]
sage: M = ModularForms(chi, 2, prec=7)
sage: M
Modular Forms space of dimension 3, character [zeta6] and weight 2 over Cyclotomic Field of order 6 and degree 2
sage: M.dimension(), M.cuspidal_subspace().dimension(), M.eisenstein_subspace().dimension()
(3, 1, 2)
sage: M.base_ring()
Cyclotomic Field of order 6 and degree 2
sage: M.cuspidal_subspace().hecke_matrix(2)
[-zeta6 - 1]
```

All coefficients remain exact.  In particular, character values enter the
good-prime recurrence

$$
T_{p^r}=T_pT_{p^{r-1}}-\chi(p)p^{k-1}T_{p^{r-2}}
$$

and the coefficient formula

$$
a_m(T_nf)=\sum_{d\mid(m,n)}\chi(d)d^{k-1}a_{mn/d^2}(f),
$$

with terms having $(d,N)>1$ omitted.  A higher-order character cannot be
silently placed over $\QQ$:

```sage
sage: ModularForms(chi, 2, QQ)
Traceback (most recent call last):
...
ValueError: the character values do not lie in Rational Field
```

Quadratic characters automatically use $\QQ$:

```sage
sage: chi = [e for e in DirichletGroup(12) if e.conrey_number() == 7][0]
sage: S = CuspForms(chi, 3, prec=10)
sage: S.base_ring(), S.dimension()
(Rational Field, 2)
sage: S.hecke_matrix(2)
[ 0 -4]
[ 1 -2]
```

## Exact coordinates and membership

Every public basis consists of elements of the requested parent:

```sage
sage: [b.parent() is M for b in M.basis()]
[True, True]
sage: M.zero().is_zero()
True
sage: f in S, f in M, e in S
(True, True, False)
sage: f.ambient_coordinates()
(0, 1)
```

Coordinates are recovered by exact row-span solving, never by floating-point
recognition.  Display precision affects only representation and cached series;
it does not affect equality or membership.

## Hecke action, including bad primes

Parents expose both matrices and callable operators:

```sage
sage: T2 = S.T(2)
sage: T2.domain() is S, T2.codomain() is S
(True, True)
sage: T2.matrix()
[-2]
sage: T2(f) == -2*f
True
sage: f.hecke(11) == f
True
```

For $(n,N)=1$, Sage.js uses the exact coefficient identity

$$
a_m(T_n f)=\sum_{d\mid(m,n)}d^{k-1}a_{mn/d^2}(f).
$$

For general $n$, terms with $(d,N)>1$ are omitted.  This gives the usual
$U_p$ action at bad primes $p\mid N$.  The resulting expansion is solved back
into the requested parent through the Sturm bound.  If the parent is not
stable under that operator, the operation raises rather than manufacturing a
restriction.

## Old and new parents

Old and new spaces use the same element contract:

```sage
sage: S = CuspForms(33, 2, prec=10)
sage: O, N = S.old_subspace(), S.new_subspace()
sage: O.dimension(), N.dimension()
(2, 1)
sage: o, n = O.gen(), N.gen()
sage: o.parent() is O, n.parent() is N
(True, True)
sage: S(o).parent() is S, S(n).parent() is S
(True, True)
```

Imprimitive characters use exact degeneracy images from every proper source
level to construct the oldspace.  A full-Hecke decomposition selects the
complementary new constituents, and an exact row-space certificate verifies
the direct sum through the Sturm bound:

```sage
sage: chi = [e for e in DirichletGroup(20) if e.conrey_number() == 9][0]
sage: S = CuspForms(chi, 4, prec=10)
sage: O, N = S.old_subspace(), S.new_subspace()
sage: S.dimension(), O.dimension(), N.dimension()
(6, 4, 2)
sage: O.q_expansion_basis_certificate()
Sturm-certified old/new decomposition of dimensions 4 + 2 = 6
sage: N.hecke_matrix(3)
[  0 -76]
[  1   0]
```

Normalized eigenforms are reconstructed from simple exact Hecke
constituents.  If the Hecke field is already the cyclotomic character field,
that field is returned directly.  When a constituent is a nontrivial
extension of a cyclotomic field, Sage.js currently represents the chosen
exact embedding in `QQbar`; the relative defining polynomial over the
cyclotomic field remains available:

```sage
sage: chi = [e for e in DirichletGroup(9) if e.conrey_number() == 4][0]
sage: f = CuspForms(chi, 4).newforms()[0]
sage: f.defining_polynomial()
x^2 + 3*zeta6*x - (6*zeta6 - 6)
sage: f.coefficient_field()
Algebraic Field
sage: f.certificate().verify()
True
```

Parents, subspaces, elements, Hecke operators, and normalized newforms all
round-trip through SagePack.  Deserialization reconstructs the exact
character, base ring, canonical coordinates, and Hecke constituent; no
floating-point recognition is involved.

The current character slice requires integral weight at least $2$.  Weight
$1$ needs a separate Schaeffer-style dimension and construction algorithm.
General $\Gamma_1(N)$/$\Gamma_H(N)$ parents, arbitrary number-field base
change, and public relative-number-field parents remain later object-layer
slices.

For construction engines and certificates, see
[Exact modular-form $q$-expansion bases](modular-form-q-expansions.md).  For
newform packets and exact $L$-series input, see
[A guided exact modular-forms tour](modular-forms-tour.md).
