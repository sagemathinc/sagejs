---
title: "Exact modular-form q-expansion bases"
---

# Exact modular-form q-expansion bases

Sage.js represents a level-$1$ modular form over $\QQ$ by an exact homogeneous
polynomial in $E_4$ and $E_6$:

$$
M_*(\mathrm{SL}_2(\ZZ),\QQ)=\QQ[E_4,E_6].
$$

The polynomial is the mathematical value. A truncated $q$-expansion is a
regenerable view, so increasing the displayed precision never treats missing
coefficients as zero.

## The generators $E_4$, $E_6$, and $\Delta$

The existing Sage-compatible Eisenstein-space constructor supplies $E_4$ and
$E_6$. They participate in exact graded arithmetic:

```sage
sage: E4 = EisensteinForms(1, 4, prec=8).gen()
sage: E6 = EisensteinForms(1, 6, prec=8).gen()
sage: Delta = (E4^3 - E6^2) / 1728
sage: Delta.weight(), Delta.level(), Delta.is_cuspidal()
(12, 1, True)
sage: Delta.q_expansion(8)
q - 24*q^2 + 252*q^3 - 1472*q^4 + 4830*q^5 - 6048*q^6 - 16744*q^7 + O(q^8)
```

The same form is available from its ambient space:

```sage
sage: M = ModularForms(1, 12, prec=8)
sage: M.delta() == Delta
True
```

`delta_qexp(prec)` returns the integral power series directly. Its
implementation uses Jacobi's exact identity

$$
\Delta(q)=q\left(\sum_{n\geq0}(-1)^n(2n+1)
q^{n(n+1)/2}\right)^8,
$$

which is independent of the $E_4,E_6$ formula and therefore also serves as a
differential oracle.

## Victor Miller bases

`victor_miller_basis(k, prec=10, cusp_only=False)` follows SageMath's name and
normalization. If $d=\dim M_k$, its basis $f_0,\ldots,f_{d-1}$ satisfies

$$
f_i(q)=q^i+O(q^d).
$$

The coefficients are integral:

```sage
sage: victor_miller_basis(12, 6)
[1 + 196560*q^2 + 16773120*q^3 + 398034000*q^4 + 4629381120*q^5 + O(q^6),
 q - 24*q^2 + 252*q^3 - 1472*q^4 + 4830*q^5 + O(q^6)]
sage: victor_miller_basis(24, 6, cusp_only=True)
[q + 195660*q^3 + 12080128*q^4 + 44656110*q^5 + O(q^6),
 q^2 - 48*q^3 + 1080*q^4 - 15040*q^5 + O(q^6)]
```

The construction starts from the standard basis

$$
A\Delta^iE_6^{2(n-i)},\qquad 0\leq i\leq n,
$$

where $k=12n+e$ and $A$ is the normalized level-$1$ Eisenstein form of
weight $e\in\{0,4,6,8,10,14\}$. Exact triangular elimination produces the
leading-term normalization.

## First-class bases and certificates

An ambient space returns exact modular-form elements rather than bare power
series:

```sage
sage: M = ModularForms(1, 24, prec=8)
sage: B = M.basis()
sage: B[1].parent() is M, B[1].weight(), B[1].q_expansion(20).prec()
(True, 24, 20)
```

`M.q_expansion_basis(prec)` returns the corresponding series. The cuspidal
subspace has the same API.

Every basis construction creates a replayable certificate:

```sage
sage: C = M.basis_certificate()
sage: C.dimension(), C.sturm_bound(), C.algorithm(), C.verify()
(3, 2, 'victor-miller-e4-e6-delta', True)
sage: M.cuspidal_subspace().basis_certificate().verify()
True
```

The verifier checks the independent exact dimension formula, parent metadata,
and the complete identity matrix of prescribed leading coefficients. Exact
formulas and their provenance also survive SagePack serialization.

## Cusp bases from modular symbols

For trivial-character $\Gamma_0(N)$ spaces over $\QQ$, Sage.js reconstructs
general cusp-form expansions from the exact Hecke action on modular symbols.
This supports weight $2$ and arbitrary weights $k\geq2$:

```sage
sage: S = CuspForms(37, 2)
sage: S.sturm_bound()
7
sage: S.q_expansion_basis(8)
[q + q^3 - 2*q^4 - q^7 + O(q^8),
 q^2 + 2*q^3 - 2*q^4 + q^5 - 3*q^6 + O(q^8)]
sage: CuspForms(11, 4).q_expansion_basis(8)
[q + 3*q^3 - 6*q^4 - 7*q^5 - 8*q^6 + 14*q^7 + O(q^8),
 q^2 - 4*q^3 + 2*q^4 + 8*q^5 - 5*q^6 - 4*q^7 + O(q^8)]
```

The equivalent modular-symbol API is useful when the Hecke module is already
in hand:

```sage
sage: M = ModularSymbols(37, 2).cuspidal_submodule()
sage: M.q_expansion_basis(8) == S.q_expansion_basis(8)
True
```

The ordinary cusp-space API exposes the two independent engines explicitly.
At level $1$, `default` selects formulas; at higher level it selects modular
symbols:

```sage
sage: S = CuspForms(1, 24)
sage: F = S.q_expansion_basis(4, algorithm="formulas")
sage: H = S.q_expansion_basis(4, algorithm="modular_symbols")
sage: matrix(QQ, [[f[n] for n in range(4)] for f in F]).row_space() == \
....: matrix(QQ, [[f[n] for n in range(4)] for f in H]).row_space()
True
```

This equality is checked exactly through the Sturm precision for level-$1$
weights $12$, $24$, $36$, and $48$. The formula engine uses the
$E_4,E_6,\Delta$ construction; its proof does not call modular symbols. The
modular-symbol engine reconstructs coefficient functionals from Hecke
operators; its proof does not call the formula basis.

If $T_n$ is the matrix of the $n$-th Hecke operator on a signed cuspidal
modular-symbol space and $\lambda$ is a coordinate functional, then the
associated coefficient row is

$$
\bigl(0,\lambda(T_1),\lambda(T_2),\ldots,
\lambda(T_{r-1})\bigr).
$$

Exact row reduction over $\QQ$ selects a deterministic echelon basis. All
Hecke matrices and the returned power series remain FLINT-backed resources;
the implementation does not publish one JavaScript object per coefficient.
The sign-$0$ modular-symbol space is projected to either signed realization,
whose common Hecke module gives the same holomorphic cusp forms.
Composite levels and repeated prime factors use the exact $U_p$ operators at
bad primes; the regression corpus includes levels $12$ and $36$.

### Integral lattices

`q_expansion_module(prec, R)` returns the coefficient module over $R=\QQ$ or
the saturated lattice over $R=\ZZ$. The latter is

$$
\operatorname{rowspan}_{\QQ}(B)\cap\ZZ^{\mathrm{prec}},
$$

computed exactly by Smith normal form followed by Hermite normal form. This
is not the lattice generated merely by clearing denominators of each row:

```sage
sage: M = ModularSymbols(43, 2).cuspidal_submodule()
sage: M.q_expansion_module(9, ZZ).basis_matrix()
[ 0  1  0  0  0  2 -2 -2  0]
[ 0  0  1  1 -1  3 -3 -1  0]
[ 0  0  0  2 -1  4 -3 -2  2]
```

### Sturm certificates and precision

`q_expansion_basis_certificate()` chooses a precision strictly exceeding

$$
B=\left\lfloor\frac{k}{12}
[\mathrm{SL}_2(\ZZ):\Gamma_0(N)]\right\rfloor,
$$

replays the Hecke-dual construction, and verifies both full rank and the
expected cusp dimension. Passing an explicit precision that does not expose
the whole space or does not exceed $B$ raises an exception; the API never
silently treats an uncertified truncation as a certified basis.
Here `ModularSymbols.sturm_bound()` returns the usual coefficient bound $B$,
whereas `CuspForms.sturm_bound()` returns the required series precision
$B+1$, matching Sage's two public conventions.

```sage
sage: C = M.q_expansion_basis_certificate()
sage: C.sturm_bound(), C.is_sturm_certified(), C.verify()
(7, True, True)
```

## Current boundary

The implemented general modular-symbol route currently covers cuspidal
$\Gamma_0(N)$ spaces with trivial character over $\QQ$ in weights at least
$2$. Exact character-valued bases, newform coefficient fields, and general
formula-generated higher-level bases remain future slices. They must retain
the same distinction between an exact modular form and a finite-precision
series view.

## References

- SageMath, [Victor Miller basis](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/modform/vm_basis.html).
- William Stein, [*Modular Forms: A Computational Approach*](https://wstein.org/books/modform/).
- SageMath, [Computing with modular forms](https://doc.sagemath.org/html/en/thematic_tutorials/explicit_methods_in_number_theory/level_one_forms.html).
- SageMath, [Modular symbols spaces](https://doc.sagemath.org/html/en/reference/modsym/sage/modular/modsym/space.html).
