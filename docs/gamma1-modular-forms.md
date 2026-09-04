---
title: "Full Gamma1 modular-form spaces"
---

# Full $\Gamma_1(N)$ modular-form spaces

Sage.js constructs complete exact spaces $M_k(\Gamma_1(N))$ and
$S_k(\Gamma_1(N))$ over $\QQ$.  They use the same parented modular-form
elements as the existing $\Gamma_0$ and fixed-character interfaces.

```sage
sage: M = ModularForms(Gamma1(7), 2, prec=10)
sage: M
Modular Forms space of dimension 5 for Congruence Subgroup Gamma1(7) of weight 2 over Rational Field
sage: M.character()
sage: M.dimension(), M.cuspidal_subspace().dimension(), M.eisenstein_subspace().dimension()
(5, 0, 5)
sage: M.q_expansion_basis()
[1 + 252*q^5 - 840*q^6 + 1344*q^7 - 840*q^8 - 420*q^9 + O(q^10), q + 69*q^5 - 234*q^6 + 385*q^7 - 231*q^8 - 130*q^9 + O(q^10), q^2 - 8*q^5 + 39*q^6 - 62*q^7 + 38*q^8 + 28*q^9 + O(q^10), q^3 - 15*q^5 + 55*q^6 - 88*q^7 + 54*q^8 + 34*q^9 + O(q^10), q^4 - 6*q^5 + 17*q^6 - 26*q^7 + 18*q^8 + 4*q^9 + O(q^10)]
```

`character()` returns `None`, as in SageMath: a $\Gamma_1$ space is the sum
of all nebentypus components of the correct parity, rather than a space with
one distinguished character.

## Exact character-orbit descent

The implementation uses

$$
M_k(\Gamma_1(N))_{\QQ}
\cong
\bigoplus_{[\chi],\ \chi(-1)=(-1)^k}
\operatorname{Res}_{\QQ(\chi)/\QQ}
M_k(\Gamma_0(N),\chi),
$$

with one representative from each Galois orbit.  This is visible through
`character_components()`:

```sage
sage: [(c.character().conrey_number(), c.field_degree(), c.dimension(), c.rational_dimension()) for c in M.character_components()]
[(4, 2, 2, 4), (1, 1, 1, 1)]
```

The tuple entries say that the Conrey-$4$ component has dimension $2$ over a
quadratic cyclotomic field and hence contributes $4$ rational dimensions;
the principal component contributes one more.

Cyclotomic coefficients are split in their exact power basis and the combined
rational rows are echelonized through the full $\Gamma_1$ Sturm bound.  The
same cached change of basis transports all operators.  The construction never
recognizes floating-point coefficients.

```sage
sage: certificate = M.q_expansion_basis_certificate()
sage: certificate
Sturm-certified Gamma1 character descent of dimension 5 with 2 character-orbit components
sage: certificate.verify()
True
```

## Hecke and diamond operators

Hecke operators include good primes, bad primes, and composite indices.  A
diamond bracket acts by $\chi(d)$ on the $\chi$ component before exact rational
descent.

```sage
sage: T2 = M.T(2)
sage: T2.matrix()
[  -93     0  -168  -840 -1680]
[  -26     0   -48  -234  -471]
[    4     1     8    39    76]
[    6     0    10    55   108]
[    2     0     5    17    36]
sage: D3 = M.diamond_bracket_operator(3)
sage: D3.matrix()
[  -59  -336  -840 -1260 -1680]
[  -17   -97  -240  -365  -485]
[    3    16    40    62    83]
[    4    23    57    86   115]
[    1     6    15    22    29]
sage: T2(D3(M.gen())) == D3(T2(M.gen()))
True
```

The matrices above agree entry-for-entry with SageMath.  The same operators
are available on cusp, Eisenstein, old, and new parents.

## Oldforms, newforms, and exact packets

Old/new decomposition is performed inside each fixed-character component and
then descended.  This preserves nebentypus and degeneracy-map semantics.

```sage
sage: S = CuspForms(Gamma1(22), 2, prec=8)
sage: O, N = S.old_subspace(), S.new_subspace()
sage: S.dimension(), O.dimension(), N.dimension()
(6, 2, 4)
sage: O.q_expansion_basis()
[q - q^3 - 2*q^4 + q^5 - 2*q^7 + O(q^8), q^2 - 2*q^4 - q^6 + O(q^8)]
sage: O.q_expansion_basis_certificate().verify()
True
```

`Newforms(Gamma1(N), k)` returns one normalized exact packet for every
fixed-character packet attached to a selected character orbit:

```sage
sage: forms = Newforms(Gamma1(22), 2)
sage: len(forms)
1
sage: f = forms[0]
sage: f.character().conrey_number(), f.coefficient_field()
(9, Cyclotomic Field of order 10 and degree 4)
sage: f.q_expansion(6)
q - zeta10^3*q^2 + (2*zeta10^3 - zeta10^2 + zeta10 - 2)*q^3 - zeta10*q^4 + (-2*zeta10^3 + 2*zeta10^2 - 2*zeta10)*q^5 + O(q^6)
```

## Elements, products, and serialization

Membership and coordinates use exact Sturm-prefix linear algebra:

```sage
sage: M = ModularForms(Gamma1(5), 2, prec=8)
sage: b = M.basis()
sage: f = b[0] + 2*b[1] - 3*b[2]
sage: M.coordinates(f)
(1, 2, -3)
sage: M(f.q_expansion(M.sturm_bound() + 1)) == f
True
sage: (b[1]*b[2]).parent()
Modular Forms space of dimension 5 for Congruence Subgroup Gamma1(5) of weight 4 over Rational Field
```

SagePack round trips preserve $\Gamma_1$ parents, subspaces, elements, Hecke
operators, diamond operators, and normalized packets.

## Supported range and performance

The complete constructive range is integral weight $k\geq2$.  Exact dimension
formulas themselves remain available more broadly.  General $\Gamma_H$ spaces,
weight-$1$ basis construction, and coefficient-ring base change are separate
future slices.

The implementation deliberately decomposes into fixed-character work rather
than building the much larger full $\Gamma_1$ modular-symbol quotient.  The
benchmark in `bench/modular/gamma1-spaces` compares complete Sturm-precision
bases and first cuspidal Hecke operators with SageMath and Magma.  Its pinned
$N=27$, $k=3$ receipt includes nontrivial character components of degrees $1$,
$2$, and $6$:
Sage.js constructs the complete basis in $3.67$ seconds and the first $T_2$ in
$0.87$ seconds, versus $9.30$ and $1.83$ seconds in SageMath.  Magma constructs
the basis in $0.63$ seconds.

The larger $N=53$, $k=2$ receipt includes two degree-$12$ character
components.  Sage.js constructs the complete $143$-dimensional rational basis
in $46.29$ seconds, versus $152.46$ seconds in SageMath and $2.80$ seconds in
Magma.  Its first $T_2$ takes $14.07$ seconds in Sage.js versus $151.73$ seconds
in SageMath.  Exact cyclotomic divisor sieves, selected-row Hecke traversal,
and coordinate-preserving matrix arithmetic make Sage.js $3.29\times$ faster
than SageMath for the basis and $10.8\times$ faster for first Hecke action at
this level.

At $N=73$, $k=2$, Sage.js constructs the complete $258$-dimensional basis
through Sturm precision $890$ and its first cuspidal $T_2$ in $330.50$
seconds.  The matched SageMath computation exceeded the $1800$-second bound,
giving a conservative end-to-end speedup greater than $5.45\times$.  The
dispatcher uses direct reduction for the few rows over quadratic coefficient
fields and native double-kernel reconstruction for higher-degree fields,
avoiding a large artificial kernel at this scale.  Magma remains the
performance target.  See the committed receipt for exact commands, host
details, and operator timings.
