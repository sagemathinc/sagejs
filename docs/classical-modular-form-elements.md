---
title: "Classical modular-form elements and parents"
---

# Classical modular-form elements and parents

Sage.js represents a classical modular form by its mathematical parent and an
exact coordinate vector.  Its $q$-expansion is a lazy realization that can be
requested at any supported precision; truncation is not part of the form's
identity.

The initial object layer covers integral-weight, trivial-character
$\Gamma_0(N)$ spaces over $\QQ$.  Cuspidal, new, and old spaces use exact
modular-symbol or certified formula bases.  Eisenstein and full ambient bases
are currently available at level $1$ and prime level.

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

This first slice intentionally stops before nebentypus and coefficient-field
elements.  Those extensions should enlarge the scalar/character metadata
without creating a second element hierarchy.

For construction engines and certificates, see
[Exact modular-form $q$-expansion bases](modular-form-q-expansions.md).  For
newform packets and exact $L$-series input, see
[A guided exact modular-forms tour](modular-forms-tour.md).
