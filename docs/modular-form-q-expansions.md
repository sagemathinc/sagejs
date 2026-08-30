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

`algorithm="auto"` is an inspectable policy, not a hidden heuristic. At
level $1$ it selects the complete Victor Miller construction. At higher level
it first builds the deterministic bounded formula span through Sturm
precision. It selects formulas exactly when that certificate proves the full
ambient dimension; otherwise it retains the honest proper subspace in the
receipt and selects modular symbols:

```sage
sage: S = CuspForms(1, 24)
sage: R = S.q_expansion_algorithm_receipt("auto")
sage: R.selected_algorithm(), R.receipt_id(), R.verify()
('formulas', 'qexp-auto-level-one-victor-miller-v1', True)
sage: CuspForms(37, 2).q_expansion_algorithm_receipt("auto").selected_algorithm()
'modular_symbols'
sage: A = CuspForms(2, 12).q_expansion_algorithm_receipt("auto", prec=8)
sage: A.selected_algorithm(), A.formula_subspace().is_full_ambient()
('formulas', True)
sage: B = CuspForms(2, 24).q_expansion_algorithm_receipt("auto", prec=8)
sage: B.selected_algorithm(), B.formula_subspace().is_proper_subspace()
('modular_symbols', True)
```

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

## Newforms and coefficient fields

`new_subspace()`, `old_subspace()`, and `newforms()` are available from an
ambient modular-form space or its cuspidal subspace. The top-level
`Newforms(N, k, names="a")` constructor is equivalent:

```sage
sage: f = Newforms(23, 2, names="a")[0]
sage: f.coefficient_field()
Number Field in a0 with defining polynomial x^2 + x - 1
sage: f.q_expansion(8)
q + a0*q^2 + (-2*a0 - 1)*q^3 + (-a0 - 1)*q^4 + 2*a0*q^5 + (a0 - 2)*q^6 + (2*a0 + 2)*q^7 + O(q^8)
sage: f.certificate(8).verify()
True
```

For each simple new modular-symbol constituent, Sage.js finds a primitive
Hecke operator $\theta$. If the constituent has dimension $d$, its
characteristic polynomial defines

$$
K=\QQ[\theta].
$$

Every $T_n$ is solved exactly and uniquely in
$1,\theta,\ldots,\theta^{d-1}$; the same coordinates give $a_n\in K$. The
certificate replays each matrix identity through the Sturm bound and verifies
$a_1=1$. Thus a non-rational packet is represented once over its exact
coefficient field, without choosing a complex root. The level-$11$ and
level-$23$ fixtures are checked independently against SageMath and the
[LMFDB newform records](https://www.lmfdb.org/ModularForm/GL2/Q/holomorphic/).

Power series over exact number and cyclotomic fields use an ordinary exact
coefficient-list implementation when no FLINT polynomial ABI exists. They
retain the same absolute-precision arithmetic and SagePack representation as
the FLINT-backed $\ZZ$, $\QQ$, and finite-ring cases.

## Old/new decomposition

The oldspace is the exact span of all degeneracy images from levels $N/p$:

$$
f(q)\longmapsto f(q),\qquad f(q)\longmapsto f(q^p),
$$

for every prime $p\mid N$. Exact row reduction removes repeated images. The
newspace is computed independently as the intersection of the two
level-lowering degeneracy kernels for each $p\mid N$. A Sturm certificate
then checks

$$
S_k(\Gamma_0(N))=S_k(\Gamma_0(N))^{\mathrm{old}}
\mathbin{\oplus}S_k(\Gamma_0(N))^{\mathrm{new}}.
$$

```sage
sage: S = CuspForms(22, 2)
sage: S.old_subspace().dimension(), S.new_subspace().dimension()
(2, 0)
sage: S.old_subspace().q_expansion_basis_certificate().verify()
True
```

## Eisenstein series with characters

The first general-character formula slice accepts primitive Dirichlet
characters $\chi,\psi$ satisfying
$\chi(-1)\psi(-1)=(-1)^k$:

$$
E_k(\chi,\psi)(q)
=c_0+\sum_{n\geq1}
\left(\sum_{d\mid n}\psi(d)\chi(n/d)d^{k-1}\right)q^n.
$$

The constant is $c_0=-B_{k,\psi}/(2k)$ when $\chi$ has modulus $1$, and
zero otherwise. Generalized Bernoulli numbers are evaluated exactly in a
common cyclotomic field. `t=` applies the degeneracy $q\mapsto q^t$:

```sage
sage: G = DirichletGroup(5)
sage: chi = G.gen(0)
sage: one = DirichletGroup(1)(1)
sage: eisenstein_series_qexp(3, 6, chi=chi, psi=one)
q + (zeta4 + 4)*q^2 + (-zeta4 + 9)*q^3 + (4*zeta4 + 15)*q^4 + 25*q^5 + O(q^6)
```

Imprimitive-character reduction and complete character-valued modular-form
spaces remain later work; this API fails closed rather than assigning an
incorrect conductor or level.

## Certified exact $q$-expansion algebra

`certified_modular_form(form, prec)` turns a recognized exact modular-form
element into a finite expansion with replayable provenance. This is distinct
from asserting metadata about an arbitrary power series. Products compute the
common level and product nebentypus, add the weights, and retain the exact
valuation-aware precision of power-series multiplication:

```sage
sage: D = certified_modular_form(ModularForms(1, 12).delta(), 10)
sage: E4 = certified_modular_form(EisensteinForms(1, 4).gen(), 10)
sage: F = D * E4
sage: F.weight(), F.level(), F.character().is_trivial()
(16, 1, True)
sage: F.certificate().verify()
True
```

The degeneracy map $V_d$ is first class:

$$
V_d f(q)=f(q^d).
$$

It certifies level $dN$, precision $dP$ from input precision $P$, and an
`OldformMetadata` record:

```sage
sage: G = D.V(3)
sage: G.level(), G.precision(), G.oldform_metadata().factor()
(3, 30, 3)
sage: G.q_expansion(10)
q^3 - 24*q^6 + 252*q^9 + O(q^10)
```

The initial twist domain consists of primitive real Dirichlet characters of
conductor at most $4096$. Coefficients are multiplied by exact values in
$\{0,\pm1\}$, so no numerical embedding or coefficient-ring extension is
needed. If $\psi$ has conductor $r$, the certified target uses the safe
standard level bound

$$
\operatorname{lcm}\bigl(N,\operatorname{cond}(\chi)r,r^2\bigr)
$$

and nebentypus $\chi\psi^2$:

```sage
sage: psi = DirichletGroup(5).gen()^2
sage: T = D.twist(psi)
sage: T.level(), T.character().is_trivial(), T.certificate().verify()
(25, True, True)
```

`character_eisenstein_series(chi, psi, k, prec, t=1)` supplies the same
certified algebra interface for the general exact Eisenstein formula.

### Honest formula-generated subspaces

For a cusp space, `formula_subspace()` constructs level-one formula forms and
all $V_d$ images with $d\mid N$, then proves their rank beyond the Sturm bound.
The result is an explicit contained subspace. It claims to be the ambient
space only when its certified rank equals the independently computed ambient
dimension:

```sage
sage: F = CuspForms(2, 24).formula_subspace(prec=8)
sage: F
Certified formula-generated proper subspace of dimension 4 of Cuspidal subspace of dimension 5 of Modular Forms space of dimension 7 for Congruence Subgroup Gamma0(2) of weight 24 over Rational Field
sage: F.dimension(), F.ambient_dimension(), F.is_proper_subspace(), F.verify()
(4, 5, True, True)
```

Consequently, forcing `algorithm="formulas"` on this example raises an
explicit proper-subspace error. The same call at level $2$, weight $12$
returns the full two-dimensional formula basis. Callers may also pass their
own certified candidate list to `formula_subspace(candidates, prec)`.

The reproducible resident benchmark is
`pnpm bench:modular:qexp-algebra`. It times product, $V_2$, and bounded
quadratic-twist construction followed by the same eight-coefficient tail
checksum in Sage.js and SageMath; the committed receipt records the exact
machine, versions, medians, and ratios rather than treating startup as
arithmetic time.

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
$2$, including old/new spaces and normalized Galois packets. Formula spans at
higher level are certified honestly but currently draw their automatic
candidates only from level $1$ and degeneracy maps. Complete
character-valued cusp bases, arbitrary-character twists, and richer formula
registries remain future slices. They must retain the same distinction between
an exact modular form and a finite-precision series view.

## References

- SageMath, [Victor Miller basis](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/modform/vm_basis.html).
- William Stein, [*Modular Forms: A Computational Approach*](https://wstein.org/books/modform/).
- SageMath, [Computing with modular forms](https://doc.sagemath.org/html/en/thematic_tutorials/explicit_methods_in_number_theory/level_one_forms.html).
- SageMath, [Modular symbols spaces](https://doc.sagemath.org/html/en/reference/modsym/sage/modular/modsym/space.html).
