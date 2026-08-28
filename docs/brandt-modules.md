---
title: "Brandt modules over the rational numbers"
---

# Brandt modules over the rational numbers

Sage.js implements exact weight-two Brandt Hecke modules for definite
quaternion algebras over $\mathbf Q$. The constructor

```sage
BrandtModule(D, N=1)
```

uses the quaternion algebra ramified at infinity and at the primes dividing
$D$, together with an Eichler order of conductor $N$. Thus $D$ must be a
squarefree product of an odd number of primes and $\gcd(D,N)=1$.

The public object is an operator-oriented exact Hecke module. It supports
arbitrary valid rational pairs $(D,N)$ in weight $2$, while stating explicitly
which realization supplies its basis.

## A first example

For prime $D\geq 5$ and $N=1$, Sage.js uses the canonical supersingular
ideal-class realization. Its prime Hecke operators are sparse adjacency
operators of supersingular isogeny graphs:

```sage
sage: B = BrandtModule(11)
sage: B
Brandt module of discriminant 11 and Eichler conductor 1 of dimension 2 over Rational Field (supersingular-ideal-classes)
sage: B.dimension(), B.realization()
(2, 'supersingular-ideal-classes')
sage: T2 = B.T(2)
sage: T2.is_sparse(), T2.nonzero_count()
(True, 3)
sage: T2.matrix()
[0 3]
[2 1]
sage: T2.charpoly()
x^2 - x - 6
sage: B.W(11).matrix()^2 == identity_matrix(QQ, B.dimension())
True
```

The sparse operator is authoritative. Calling `matrix()` explicitly
materializes a dense exact matrix and respects the module's
`dense_entry_limit`.

## General discriminant and Eichler conductor

For every other supported pair, Sage.js realizes the rational Brandt Hecke
module through Jacquet--Langlands:

$$
\mathbf Q e_{\mathrm{Eis}}
\oplus
S_2(\Gamma_0(DN),\mathbf Q)^{D\text{-new}}.
$$

For example:

```sage
sage: B = BrandtModule(11, 5)
sage: B.dimension(), B.realization()
(6, 'jacquet-langlands-symbols')
sage: B.T(2).charpoly()
x^6 - 2*x^5 - 10*x^4 + 14*x^3 + 29*x^2 - 20*x - 12
sage: B.T(6).matrix() == B.T(2).matrix() * B.T(3).matrix()
True
sage: B.new_subspace().dimension()
3
sage: [V.dimension() for V in B.decomposition(bound=3, anemic=False)]
[1, 1, 2, 2]
```

Composite quaternion discriminants and non-squarefree Eichler conductors use
the same interface:

```sage
sage: B = BrandtModule(30, 7)
sage: B.level(), B.dimension()
(210, 8)
sage: B.T(11).charpoly()
x^8 - 8*x^7 - 64*x^6 + 128*x^5 + 768*x^4
sage: all(B.W(q).matrix()^2 == identity_matrix(QQ, 8) for q in (2, 3, 5))
True
```

## Operators and elements

`BrandtModule(D,N)` provides the following core operations:

| Operation | Meaning |
| --- | --- |
| `B.dimension()` | exact rank of the Brandt module |
| `B.discriminant()` or `B.N()` | quaternion discriminant $D$ |
| `B.conductor()` or `B.M()` | Eichler conductor $N$ |
| `B.level()` | modular level $DN$ |
| `B.basis()` | exact coordinate basis |
| `B.T(n)` | Hecke operator $T_n$ for $\gcd(n,DN)=1$ |
| `B.W(q)` | Atkin--Lehner operator $W_q$ for $q\mid D$ |
| `B.eisenstein_subspace()` | the one-dimensional Eisenstein line |
| `B.cuspidal_subspace()` | the cuspidal subspace |
| `B.new_subspace()` | the subspace new at the Eichler conductor |
| `B.decomposition()` | exact simultaneous Hecke constituents |

Elements use exact coordinates and can be acted on from either side:

```sage
sage: B = BrandtModule(3, 5)
sage: v = B.0 + 2*B.1
sage: T2v = v.hecke(2)
sage: T2v == v * B.T(2)
True
sage: v.atkin_lehner(3)
(-1, 2)
```

The Hecke relations construct composite good-index operators exactly. In
particular, they are multiplicative at coprime indices, and for
$p\nmid DN$,

$$
T_{p^r}=T_pT_{p^{r-1}}-pT_{p^{r-2}}.
$$

The Eisenstein eigenvalue is $\sigma_1(n)$. At a prime $q\mid D$, Sage.js
uses the convention $W_q=-U_q$ on the cuspidal summand and $-1$ on the
Eisenstein line.

## Sparse graph structure

The canonical $(D,1)$ realization exposes the quaternion ideal classes as
supersingular points in characteristic $D$. Its $T_\ell$ operator is the
weighted adjacency matrix of the supersingular $\ell$-isogeny multigraph.
This gives an exact sparse-linear-algebra interface for modular forms and an
expander-graph interface for graph experiments.

For graph-specific methods, normalized spectra, Wiedemann certificates, and
large sparse examples, use `SupersingularModule(D)` directly; see
[Mestre's method of graphs and sparse modular forms](mestre-method-of-graphs.md).

## Exactness and independent checks

The implementation is differential-tested against Magma V2.18-5 on a pinned
corpus of $17$ Brandt modules. The corpus includes prime and composite
quaternion discriminants, prime and prime-power Eichler conductors, and
dimensions through $12$. Exact dimensions, full Hecke characteristic
polynomials, Atkin--Lehner characteristic polynomials, and involutions are
checked rather than compared numerically.

The two realizations also provide independent internal checks:

- the supersingular path checks graph degree, automorphism masses, the
  Eisenstein vector, and exact mass-adjointness;
- the general path is built from exact modular symbols and isolates the
  $D$-new subspace before adjoining its Eisenstein line;
- Hecke decompositions use exact polynomial factorization and exact kernels.

## Performance and Magma comparison

For the canonical prime-discriminant graph, Sage.js and Magma can be compared
under an equal contract: construct the module, construct the first $T_2$, and
check the complete characteristic polynomial. The checked-in competitive
receipt records both Magma's Gram/theta and neighboring-ideal algorithms:

```bash
MAGMA=/path/to/magma pnpm bench:modular:mestre:competitive -- \
  --repeat=3 --primes=37,389
```

On the receipt's AMD EPYC 7B13 host, the median construction-plus-first-$T_2$
times were $88.104\,\mathrm{ms}$ for Sage.js versus $40\,\mathrm{ms}$ and
$80\,\mathrm{ms}$ for Magma at $D=37$. At $D=389$, they were
$204.913\,\mathrm{ms}$ for Sage.js versus $1460\,\mathrm{ms}$ and
$870\,\mathrm{ms}$ for Magma. These are source-pinned observations, not a
claim about every level or workload. See the full
[competitive receipt](../bench/results/mestre-classical-competitive-linux-x64-2026-08-28.md)
for exact gates, process-memory envelopes, and the large sparse witness.

For general $(D,N)$, timings must be labeled by realization. Magma constructs
actual Eichler ideal classes, while Sage.js currently constructs the exact
rational Jacquet--Langlands Hecke module. Their Hecke characteristic
polynomials are directly comparable, but their construction work and basis
objects are not the same contract.

## Current boundaries

The distinction between an abstract Hecke module and a canonical quaternion
ideal-class basis is important.

- The canonical sparse ideal-class basis is currently available only for
  prime $D\geq5$ with $N=1$. In this case `monodromy_weights()`,
  `pairing_matrix()`, and sparse graph operators are available.
- A general pair $(D,N)$ has an exact rational Jacquet--Langlands realization,
  but Sage.js does not yet enumerate the corresponding Eichler right ideals.
  Consequently `right_ideals()`, canonical monodromy weights, and the
  ideal-basis pairing deliberately raise `NotImplementedError`.
- `T_n` currently requires $\gcd(n,DN)=1$. At primes dividing $D$, use
  `W(q)`. Operators at primes dividing the Eichler conductor are not yet
  exposed.
- General Jacquet--Langlands modules use $\mathbf Q$. The canonical
  supersingular realization also permits $\mathbf Z$.
- Only weight $2$ is currently implemented.

These failures are intentional: a successful operation never silently
substitutes an abstract modular-symbol basis for a requested quaternion
ideal-class object.

## Related interfaces

- `SupersingularModule(p)` gives direct access to the prime-level sparse graph
  engine, certificates, eigenpackets, and expander views.
- `ModularSymbols(D*N, 2)` gives direct access to the modular-symbol
  realization used internally by the general path.
- `HilbertModularFormsQsqrt5` and `HilbertModularFormsQsqrt3` provide the
  checked Hilbert Brandt-module implementations described in the Mestre
  guide.
