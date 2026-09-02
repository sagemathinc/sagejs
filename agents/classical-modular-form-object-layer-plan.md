# Classical modular-form object layer: first $\Gamma_0/\QQ$ vertical slice

## Purpose

Sage.js already computes exact dimensions, modular-symbol $q$-expansion
bases, Victor Miller bases, Eisenstein series, old/new decompositions,
normalized eigenpackets, certified formula subspaces, and Hecke actions.  The
remaining architectural gap is that these computations return several
different element types, or bare power series, instead of elements of one
coherent classical modular-form parent.

This slice introduces the public object contract for

$$
M_k(\Gamma_0(N);\QQ),\qquad
S_k(\Gamma_0(N);\QQ),
$$

and their implemented Eisenstein, old, and new subspaces.  It deliberately
does not expand the mathematical domain to characters or new coefficient
rings.  Those are the next slices and must reuse this contract.

## Architectural decision

A classical modular form is represented by

$$
(P,c),
$$

where $P$ is a mathematical parent and $c$ is an exact coordinate vector in
the canonical basis of $P$.  Its $q$-expansion is a lazy, extendable
realization, not its identity.

The parent determines:

- the group, weight, coefficient ring, and subspace kind;
- a deterministic exact basis;
- the inclusion into its ambient modular-form space;
- a Sturm precision sufficient for coordinate recovery;
- the relevant Hecke representation.

The element determines:

- exact coordinates in its parent;
- exact ambient coordinates;
- cached $q$-expansions at requested display precisions;
- arithmetic and Hecke images obtained from exact parent maps.

Existing specialized types remain useful construction engines:

- `ExactModularForm` supplies level-one formula realizations;
- `CertifiedModularForm` supplies finite formula trees and metadata;
- `NormalizedNewform` supplies coefficient-field eigenpackets.

The previous one-off `EisensteinSeriesElement` is replaced by this common
element type.  Eisenstein coefficient formulas remain a basis engine behind
the parent boundary.

They are coercible inputs to the object layer when their exact
$q$-expansions certify membership.  They do not define a competing notion of
element identity.

## Initial supported domain

The first slice supports integral weight and trivial character over $\QQ$:

- all implemented $\Gamma_0(N)$ cuspidal modular-symbol spaces;
- implemented new and old cuspidal subspaces;
- implemented Eisenstein spaces (currently level $1$ and prime level);
- ambient spaces whenever both their cusp and Eisenstein bases are available;
- level-one Victor Miller formula arithmetic;
- exact scalar arithmetic and products whenever the target ambient basis is
  available.

Unsupported Eisenstein or ambient bases fail closed with a precise
`NotImplementedError`; a cuspidal basis at the same composite level remains
usable.

## Public API

### Parents

The existing constructors remain authoritative:

```python
M = ModularForms(11, 2)
S = M.cuspidal_subspace()
E = M.eisenstein_subspace()
O = S.old_subspace()
N = S.new_subspace()
```

Each implemented parent provides:

```python
P.basis()
P.gen(i)
P.zero()
P(value)
P.coordinates(value)
P.contains(value)
value in P
P.hecke_matrix(n)
P.T(n)
```

`P(value)` accepts:

- an element of $P$;
- a compatible element of an included subspace or the ambient space;
- a coordinate vector of length `P.dimension()`;
- a sufficiently precise exact $q$-expansion;
- an existing exact/certified modular-form realization.

A truncated series must have enough coefficients for the Sturm comparison.
All coefficients supplied beyond the recovery columns are also checked.  A
series that does not lie in the exact row span raises `ValueError`.

### Elements

The common element type provides:

```python
f.parent()
f.ambient_space()
f.vector()
f.coordinates()
f.ambient_coordinates()
f.q_expansion(prec)
f[n]
f.is_zero()
f.is_cuspidal()
f.hecke(n)
```

It also supports exact addition, subtraction, negation, rational scalar
multiplication and division, and equality.  Same-weight forms in compatible
subspaces are added in the smallest evident common parent; otherwise they are
coerced to the ambient space.  Products have common level
$\operatorname{lcm}(N_1,N_2)$, summed weight, and are reconstructed in the
target ambient space from a Sturm-certified product expansion.

The display precision affects only `repr` and cached expansions.  It is not
part of equality, membership, or hashing.

### Hecke operators

`P.T(n)` is an exact linear operator with `domain()`, `codomain()`,
`matrix()`, and element application.  Cuspidal and new-space matrices use the
existing modular-symbol action.  Other implemented parents reconstruct the
action from exact $q$-expansions through the Sturm bound and verify that every
basis image remains in the parent.

For trivial character the good-prime coefficient formula is

$$
a_m(T_n f)=\sum_{d\mid(m,n)}d^{k-1}a_{mn/d^2}(f).
$$

For general $n$, divisors with $(d,N)>1$ are omitted; this specializes to the
usual $U_p$ action when $p\mid N$.  A subspace that is not stable under the
requested operator fails rather than silently returning an ambient matrix.

## Parent identity and coercion

For this slice, two parents are structurally compatible when group family,
level, weight, base ring, and subspace kind agree.  Parent caches are an
optimization, not a prerequisite for correct coercion.

An inclusion is allowed only when it is mathematically evident and checked by
the canonical ambient-coordinate maps.  In particular:

- cusp, Eisenstein, old, and new elements coerce to the ambient space;
- old and new elements coerce to the cusp space;
- ambient elements coerce down only after exact membership succeeds;
- unrelated same-dimensional spaces never coerce by dimension alone.

## Canonical bases and certificates

For a parent $P$, let $B_P$ be the row matrix of its canonical basis through
the Sturm precision.  Coordinate recovery solves

$$
cB_P=v.
$$

The result is accepted only if the equality is exact.  For a supplied series
of greater precision, the reconstructed form is expanded to that full
precision and every coefficient is compared.

The ambient inclusion matrix $I_P$ is defined by

$$
B_P=I_PB_M.
$$

It is computed exactly and cached.  These matrices provide the common
language for subspace coercion, equality, addition, and Hecke restriction.

## Implementation boundaries

- `src/baselib/modular.py` keeps only the small public-parent facade and lazy
  delegation methods.
- `src/lib/sagejs/modular_forms/object_layer.py` contains the ordinary
  CPython-parseable coordinate, membership, arithmetic, and operator logic.
- The object layer is its own lazy package in
  `architecture/package-graph.json`; it does not consume the nearly full
  bootstrap or existing $q$-expansion package budgets.
- No new native code is needed.  Exact matrix and power-series operations use
  existing Sage.js representations and backends.

## Non-goals

This slice does not implement:

- nebentypus parents or $\Gamma_1(N)$/$\Gamma_H(N)$ spaces;
- base change away from $\QQ$;
- general Eisenstein bases at composite level;
- holomorphic quotients, derivatives, Rankin--Cohen brackets, or graded rings;
- coefficient-field newforms as elements of a rational parent;
- analytic evaluation or analytic $L$-functions.

## Acceptance examples

The following is the primary vertical witness:

```sage
sage: M = ModularForms(11, 2, prec=8)
sage: S = M.cuspidal_subspace()
sage: E = M.eisenstein_subspace()
sage: f = S.gen()
sage: (f.parent() is S, f.coordinates(), f.q_expansion())
(True, (1), q - 2*q^2 - q^3 + 2*q^4 + q^5 + 2*q^6 - 2*q^7 + O(q^8))
sage: S(f.q_expansion(S.sturm_bound() + 1)) == f
True
sage: M(f).parent() is M
True
sage: f.hecke(2) == -2*f
True
sage: (E.gen() + f).parent() is M
True
```

Additional gates cover:

- level $1$, prime, prime-square, and $pq$ cusp spaces;
- zero-dimensional spaces;
- old/new inclusion and rejection of the opposite subspace when appropriate;
- coordinate reconstruction at and beyond the Sturm precision;
- bad-prime $U_p$ and good-prime $T_p$ actions;
- arithmetic landing in the correct parent;
- equality across independently constructed but structurally equal parents;
- insufficient precision and nonmember failures;
- unchanged existing P0 differential and source-freeze suites;
- strict Python, package architecture, Linux, macOS, Windows, and browser CI.

## Follow-on character slice

After this contract is stable, `ModularForms(chi, k)` will replace the trivial
character with an exact nebentypus and its coefficient field.  Then
$\Gamma_1(N)$ and $\Gamma_H(N)$ spaces can be assembled from character
isotypic components without creating another element hierarchy.
