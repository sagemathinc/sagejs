---
title: "Half-integral-weight modular forms"
---
# Half-integral-weight modular forms

Sage.js provides two exact, complementary constructions in half-integral
weight:

- unary theta series and Cohen Eisenstein series from explicit coefficient
  formulas; and
- cuspidal spaces from Basmaji's theta-kernel algorithm, with the
  integral-weight source reconstructed by modular symbols.

All public series have caller-selected absolute precision. Formula and space
constructors expose replayable certificates; a truncated series is never used
as evidence beyond its precision.

## 1. Unary theta building blocks

The two theta series used by Basmaji are

$$
\Theta_3(q)=\sum_{n\in\ZZ}q^{n^2},\qquad
\Theta_2(q)=\sum_{\substack{n>0\\n\text{ odd}}}q^{n^2}.
$$

```sage test
theta = theta_qexp(12)
theta2 = theta2_qexp(30)
print(theta)
print(theta2)
assert str(theta) == "1 + 2*q + 2*q^4 + 2*q^9 + O(q^12)"
assert str(theta2) == "q + q^9 + q^25 + O(q^30)"
assert theta_qexp_certificate(30).verify()
assert theta2_qexp_certificate(30).verify()
```

The certificates replay the square-support formulas coefficient by
coefficient and record the level, weight, normalization, and construction
family.

## 2. Cohen Eisenstein series and a Hecke oracle

For $r\geq2$, `cohen_eisenstein_series_qexp(r, prec)` constructs Cohen's
series $\mathcal H_r$ of weight $r+\tfrac12$ and level $4$. Its normalization
is

$$
[q^0]\mathcal H_r=\zeta(1-2r).
$$

For $n>0$, Sage.js decomposes $(-1)^r n=Df^2$ with $D$ a fundamental
discriminant and evaluates Cohen's exact formula

$$
H(r,n)=L(1-r,\chi_D)
\sum_{d\mid f}\mu(d)\chi_D(d)d^{r-1}
\sigma_{2r-1}(f/d).
$$

The generalized Bernoulli formula evaluates $L(1-r,\chi_D)$ over $QQ$;
there is no floating-point recognition step.

```sage test
C = cohen_eisenstein_series_certificate(2, 20)
print(C.q_expansion())
assert C.weight() == 5/2
assert C.level() == 4
assert C.has_kohnen_plus_support()
assert C.verify()
f = cohen_eisenstein_series_qexp(2, 82)
assert half_integral_weight_hecke_qexp(f, 5, 3, prec=10) == 28*f.add_bigoh(10)
```

The last identity is an independent Hecke check: Cohen's series in weight
$5/2$ has $T_{3^2}$ eigenvalue $1+3^3=28$.

## 3. Certified Basmaji cusp spaces

Let $k\geq3$ be odd, let $16\mid N$, and let $\chi$ be a Dirichlet character
modulo $N$. If $\psi$ is the nontrivial character modulo $4$, set

$$
\epsilon=\chi\psi^{(k+1)/2},\qquad
S=S_{(k+1)/2}(\Gamma_0(N),\epsilon).
$$

Basmaji identifies $S_{k/2}(\Gamma_0(N),\chi)$ with

$$
U=\{(a,b)\in S\times S:\Theta_2a=\Theta_3b\}
$$

by $(a,b)\mapsto a/\Theta_3$. Sage.js computes $S$ through the exact
character-valued modular-symbol engine, constructs the relation kernel over
its exact coefficient field, and divides formally by the unit series
$\Theta_3$.

```sage test
chi = list(DirichletGroup(16))[4]
H = HalfIntegralWeightModularForms(chi, 5, prec=20)
basis = H.q_expansion_basis(20)
print(basis)
assert H.dimension() == 1
assert H.weight() == 5/2
assert H.sturm_bound() == 5
assert H.relation_sturm_bound() == 7
assert str(basis[0]) == "q - 2*q^3 - 2*q^5 + 4*q^7 - q^9 + 6*q^11 + 2*q^13 - 12*q^15 - 4*q^17 - 6*q^19 + O(q^20)"
assert H.q_expansion_basis_certificate().verify()
```

This example agrees coefficient-for-coefficient with SageMath's
`half_integral_weight_modform_basis`. Unlike that historical routine, the
Sage.js constructor does not trust the requested display precision: it raises
the internal relation precision past a proof bound automatically.

## 4. Higher-dimensional spaces and $T_{p^2}$

The public `hecke_matrix(p^2)` method implements Shimura's coefficient
formula at odd primes $p\nmid N$. If
$f=\sum a(n)q^n$ has weight $k/2$ and character $\chi$, then

$$
[q^n](T_{p^2}f)=a(p^2n)
+\chi(p)\left(\frac{(-1)^{(k-1)/2}n}{p}\right)
p^{(k-3)/2}a(n)
+\chi(p^2)p^{k-2}a(n/p^2).
$$

The space method requests all needed input coefficients, solves for the
operator in the certified basis, and verifies the images through the Sturm
bound.

```sage test
chi = list(DirichletGroup(16))[4]
H = HalfIntegralWeightModularForms(chi, 7, prec=10)
basis = H.q_expansion_basis(10)
T9 = H.hecke_matrix(9)
print(basis)
print(T9)
assert len(basis) == 3
assert list(T9[0]) == [28, 80, 80]
assert list(T9[1]) == [-8, -28, -16]
assert list(T9[2]) == [4, 8, -4]
```

The compatibility function `half_integral_weight_modform_basis(chi,k,prec)`
returns the same power-series list as
`HalfIntegralWeightModularForms(chi,k,prec).q_expansion_basis()`.

## What the certificate proves

For weight $k/2$ the coefficient bound is

$$
B=\left\lfloor\frac{k}{24}
[\mathrm{SL}_2(\ZZ):\Gamma_0(N)]\right\rfloor.
$$

The theta relation has weight $(k+2)/2$, so it is checked through the
corresponding bound $B_{\rm rel}$. One way to see the certificate is fully
integral-weight is to square a putative nonzero relation: its square has
weight $k+2$, while vanishing through $B_{\rm rel}$ forces the square past
the ordinary integral Sturm bound. The certificate also replays the complete
modular-symbol source certificate, the exact relation kernel, and the formal
division by $\Theta_3$.

## Current boundary

- Basmaji cusp spaces require odd $k\geq3$ and a character modulus divisible
  by $16$.
- Exact Hecke matrices currently cover $T_{p^2}$ for odd $p\nmid N$.
- Cohen's construction currently covers $r\geq2$; the exceptional
  Hurwitz-class-number series of weight $3/2$ is not silently conflated with
  this domain.
- General Shimura lifts, complete Kohnen-plus space objects, bad-prime Hecke
  operators, and Petersson products remain later slices.

## References

- Z. Basmaji, *Ein Algorithmus zur Berechnung von Hecke-Operatoren und
  Anwendungen auf modulare Kurven*, Essen thesis, page 55.
- SageMath, [`half_integral.py`](https://github.com/sagemath/sage/blob/develop/src/sage/modular/modform/half_integral.py).
- H. Cohen, *Sums involving the values at negative integers of $L$-functions
  of quadratic characters*, Math. Ann. 217 (1975), 271–285.
- S. Purkait, [*Hecke operators in half-integral weight*](https://jtnb.centre-mersenne.org/item/10.5802/jtnb.865.pdf), J. Théorie des Nombres de Bordeaux 26 (2014), 233–251.
