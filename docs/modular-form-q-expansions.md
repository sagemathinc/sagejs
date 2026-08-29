---
title: "Exact modular forms and Victor Miller bases"
---

# Exact modular forms and Victor Miller bases

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

## Current boundary

This slice implements exact graded arithmetic and certified bases at level
$1$ over $\QQ$. General level and character bases will combine two independent
routes: reconstruction from modular symbols and arithmetic in known
$q$-expansion generators. Those later spaces must retain the same distinction
between an exact modular form and a finite-precision series view.

## References

- SageMath, [Victor Miller basis](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/modform/vm_basis.html).
- William Stein, [*Modular Forms: A Computational Approach*](https://wstein.org/books/modform/).
- SageMath, [Computing with modular forms](https://doc.sagemath.org/html/en/thematic_tutorials/explicit_methods_in_number_theory/level_one_forms.html).
