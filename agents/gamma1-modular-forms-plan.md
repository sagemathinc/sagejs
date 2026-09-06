# Full $\Gamma_1(N)$ modular-form spaces

## Purpose

Implement the classical spaces $M_k(\Gamma_1(N))$ and
$S_k(\Gamma_1(N))$ as exact, fully parented Sage.js objects over $\QQ$.
The implementation must include canonical $q$-expansion bases, membership,
coordinates, Hecke and diamond operators, old/new decomposition, normalized
newform packets, serialization, differential tests, and scaling benchmarks
against SageMath and Magma.

The primary algorithm is character-orbit decomposition followed by exact
Galois descent.  This reuses Sage.js's fast fixed-nebentypus engine instead of
constructing the substantially larger $\Gamma_1(N)$ modular-symbol quotient.

## Public contract

The initial complete surface is:

```sage
M = ModularForms(Gamma1(N), k, prec=prec)
S = CuspForms(Gamma1(N), k, prec=prec)
E = EisensteinForms(Gamma1(N), k, prec=prec)

M.group()
M.level()
M.weight()
M.base_ring()          # QQ
M.character()          # None
M.dimension()
M.sturm_bound()
M.basis()
M.q_expansion_basis()
M(x)
M.coordinates(x)
x in M

S.character_components()
S.old_subspace()
S.new_subspace()
S.newforms()
S.hecke_matrix(n)
S.diamond_bracket_matrix(d)
S.T(n)
S.diamond_bracket_operator(d)
```

The ambient, cuspidal, Eisenstein, old, and new spaces all use the existing
`ClassicalModularFormElement` coordinate contract.  Their coefficient ring is
$\QQ$, even though intermediate fixed-character computations take place in
cyclotomic fields.  Products of two $\Gamma_1$ forms land in the common-level
$\Gamma_1$ space of summed weight.

`character()` follows Sage and returns `None` for a $\Gamma_1$ space.  The
new `character_components()` method exposes the exact orbit representatives,
minimal coefficient fields, fixed-character spaces, and rational dimensions
used internally.

## Mathematics and basis convention

There is a decomposition over $\CC$

$$
M_k(\Gamma_1(N)) =
\bigoplus_{\chi(-1)=(-1)^k} M_k(\Gamma_0(N),\chi).
$$

Over $\QQ$, conjugate characters must be grouped together.  Choose one
representative $\chi$ from every Galois orbit with the required parity, and
let $K_\chi=\QQ(\chi)$ be its minimal cyclotomic value field.  Then

$$
M_k(\Gamma_1(N))_{\QQ}
\cong
\bigoplus_{[\chi]}
\operatorname{Res}_{K_\chi/\QQ}
M_k(\Gamma_0(N),\chi).
$$

Thus a fixed-character component of dimension $r$ over a field of degree $e$
contributes $re$ rational dimensions.

For a fixed-character basis $f_1,\ldots,f_r$ and power basis
$1,\zeta,\ldots,\zeta^{e-1}$ of $K_\chi$, write

$$
a_n(f_j)=\sum_{t=0}^{e-1} a_{j,n,t}\zeta^t,
\qquad a_{j,n,t}\in\QQ.
$$

The raw descended basis consists of the rational series

$$
f_{j,t}=\sum_{n\geq 0}a_{j,n,t}q^n.
$$

This is the convention used by Sage's character-descent implementation.  The
combined raw rows are echelonized through the full $\Gamma_1(N)$ Sturm bound.
The resulting transformation matrix is cached and then applied to expansions
at every requested precision.  Consequently the public basis is deterministic,
canonical, rational, and stable as precision increases.

## Exact operator transport

For a matrix $A=(a_{ij})$ over $K_\chi$, replace every entry by its matrix of
multiplication on the power basis.  With rows ordered first by the form index
and then by the power-basis coordinate, this gives the restriction-of-scalars
matrix

$$
\operatorname{Res}_{K_\chi/\QQ}(A).
$$

The raw $T_n$ matrix is the block sum of these matrices over character-orbit
representatives.  If $P$ sends the raw descended basis to the canonical
echelon basis, the public matrix is

$$
P\,T_n^{\mathrm{raw}}P^{-1}.
$$

The same construction applies to diamond operators.  On the $\chi$ component,
$\langle d\rangle$ is scalar multiplication by $\chi(d)$, so its rational
block is the regular representation of $\chi(d)$ repeated once per
fixed-character basis vector.  This also certifies the expected commutation
relations

$$
T_mT_n=T_nT_m,
\qquad
\langle a\rangle\langle b\rangle=\langle ab\rangle,
\qquad
T_n\langle a\rangle=\langle a\rangle T_n.
$$

## Subspaces and newforms

The same descent is performed independently for ambient, cuspidal,
Eisenstein, old, and new fixed-character components.  The construction must
verify that the sum of descended component dimensions equals the independent
$\Gamma_1$ dimension formula and that every basis has full rank beyond the
Sturm bound.

For each orbit representative, fixed-character old/new decomposition is
computed before descent.  This preserves nebentypus and the integral meaning
of degeneracy maps.  The descended rational old and new spaces must satisfy

$$
S_k(\Gamma_1(N)) = S_k(\Gamma_1(N))^{\mathrm{old}}
\oplus S_k(\Gamma_1(N))^{\mathrm{new}}.
$$

`newforms()` returns one exact normalized packet for every fixed-character
packet attached to a selected Galois-orbit representative.  Character and
coefficient-field metadata remain visible on each packet; no conjugate packet
is duplicated.

## Certificates and failure policy

The descent layer records a replayable certificate containing:

- level, weight, subspace kind, Sturm bound, and proof precision;
- selected character orbit representatives and field degrees;
- fixed-character dimensions and their rational contributions;
- the raw rational coefficient matrix;
- the canonical echelon matrix and change-of-basis matrix;
- exact rank and dimension checks.

Construction fails loudly if any fixed-character basis is unavailable, the
parity/orbit accounting is inconsistent, the proof precision has insufficient
rank, an operator does not preserve the descended space, or an old/new direct
sum cannot be certified.  There is no dimension-only placeholder.

## Implementation layout

- `src/lib/sagejs/modular_forms/gamma1.py`: orbit selection, rational descent,
  certificates, basis construction, operator transport, and component API.
- `src/baselib/modular.py`: permit `Gamma1`, expose `character() is None`, and
  route basis/operator/subspace calls through the lazy descent module.
- `src/lib/sagejs/modular_forms/object_layer.py`: support character-free
  $\Gamma_1$ signatures, products, hashing, and specialized operator routing.
- `src/lib/sagejs/modular_forms/newforms.py`: route $\Gamma_1$ old/new spaces
  and packets through componentwise descent.
- `tools/serialization-codecs/modular-forms.ts`: serialize any new diamond
  operator and descent certificate types; existing space/element codecs retain
  the `Gamma1` group descriptor.
- `test/gamma1-modular-forms.cjs`: bounded public-API sweep and exact oracle
  corpus.
- `bench/modular/gamma1-spaces/`: matched Sage.js, SageMath, and Magma drivers.
- `docs/gamma1-modular-forms.md`: guided examples, mathematical model,
  performance notes, and current bounds.

No new public native representation is introduced.  The fixed-character
modular-symbol and exact cyclotomic matrix primitives gain batched Hecke-image,
stacking, inversion, and multiplication paths so the rational descent does not
round-trip high-degree coefficients through Python objects.

## Differential corpus

Pin exact comparisons with SageMath and Magma for:

- levels $5,7,8,11,13,16$ and weights $2,3,4$;
- odd weights, ensuring only odd characters occur;
- prime, prime-square, and composite levels;
- dimensions of ambient/cusp/Eisenstein/old/new spaces;
- echelon $q$-expansion bases through the Sturm bound;
- $T_n$ at good and bad primes;
- diamond brackets for generators of $(\ZZ/N\ZZ)^\times$;
- characteristic polynomials and normalized newform coefficients;
- membership, coordinates, arithmetic, and SagePack round trips.

Beyond-Sturm coefficients are checked independently after the basis is fixed.
Operator tests include multiplicativity, commutation, and preservation of all
implemented subspaces.

## Benchmark contract

Separate cold construction, warm construction, first basis, first $T_2$, warm
$T_2$, a bad-prime operator, diamond action, newspace, and newforms.  Record
dimension, precision, peak memory, and wall time.  Use identical mathematical
tasks in Sage.js, SageMath, and Magma at representative larger levels such as

$$
N\in\{101,211,401,601,1009\}
$$

at weights $2$ and $3$, subject to bounded runtime.  Scaling behavior and
timeouts are part of the result; tiny levels are correctness fixtures, not the
performance claim.

The target is to beat SageMath's full-$\Gamma_1$ modular-symbol construction
on first basis and first Hecke action for the larger cases, while remaining
within the same order of magnitude as Magma.  Warm operator calls should be
cache-level operations.

## Completion gates

- All documented public methods work on ambient, cusp, Eisenstein, old, and
  new $\Gamma_1$ spaces.
- Character-orbit dimension accounting and Sturm certificates pass.
- SageMath and Magma differential corpora agree exactly wherever both expose
  the relevant object.
- Larger-level benchmark receipts are committed with commands and environment.
- Strict typing, formatting, focused tests, full changed-file validation, and
  architecture checks pass.
- Linux x64, Linux arm64, macOS arm64, Windows x64, Chromium, and WebKit CI are
  green before merge.
