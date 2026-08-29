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

For every other supported pair, the default `"auto"` realization uses the
rational Brandt Hecke module supplied by Jacquet--Langlands:

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

## Genuine Eichler ideal classes

Request `realization="ideal-classes"` when the distinguished integral
quaternionic lattice matters:

```sage
sage: B = BrandtModule(37, 2, realization="ideal-classes")
sage: B.realization(), B.dimension(), B.mass()
('eichler-ideal-classes', 9, 9)
sage: len(B.right_ideals()), B.eichler_order().discriminant()
(9, 74)
sage: B.monodromy_weights()
(1, 1, 1, 1, 1, 1, 1, 1, 1)
sage: B.T(3).charpoly()
x^9 - 2*x^8 - 23*x^7 + 34*x^6 + 156*x^5 - 166*x^4 - 239*x^3 + 290*x^2 - 15*x - 36
sage: B.mass_certificate().verify()
True
```

This backend constructs the definite rational quaternion algebra, a certified
maximal order, its Eichler order of conductor $N$, and the locally principal
right ideal classes. Neighbor traversal stops only when the exact Eichler
mass is exhausted. Positive ideal equivalences carry a connecting quaternion
whose lattice equality is replayed; theta series are filters, not equality
proofs.

The implementation is not restricted to prime discriminants. For example,
`BrandtModule(30, 7, realization="ideal-classes")` constructs eight genuine
ideal classes in the algebra ramified at $2,3,5$ and infinity. The fast
Jacquet--Langlands backend remains the default because spectral questions do
not usually justify ideal-enumeration cost.

The integral backend additionally provides:

| Operation | Meaning |
| --- | --- |
| `B.quaternion_algebra()` | exact algebra in a fixed $1,i,j,ij$ basis |
| `B.maximal_order()` | certified maximal order |
| `B.eichler_order()` | certified order of reduced discriminant $DN$ |
| `B.right_ideals()` | deterministic representatives of every right ideal class |
| `B.class_fingerprints()` | stable representative metadata |
| `B.monodromy_weights()` | $\#O_L(I_i)^\times/\{\pm1\}$ |
| `B.pairing_matrix()` | diagonal integral Brandt pairing |
| `B.degree_zero_submodule()` | saturated augmentation kernel |
| `B.mass_certificate()` | replayable class-completeness certificate |

### Direct graphs and Brandt theta series

The ideal-class realization has two independent exact constructions of a good
Hecke operator:

```sage
sage: B = BrandtModule(37, 2, realization="ideal-classes")
sage: direct = B.hecke_matrix(3, algorithm="direct")
sage: series = B.hecke_matrix(3, algorithm="brandt-series")
sage: direct == series
True
```

The direct algorithm constructs the $\ell+1$ local neighbors in
$\mathbf P^1(\mathbf F_\ell)$ and classifies every edge with an exact
connecting-quaternion witness. It is normally preferable for one operator or
for a large class number. The Brandt-series algorithm constructs the
lower-triangular family $I_i\overline{I_j}$ once and obtains many matrix
coefficients from their theta series. Its unit-weight normalization is exact;
it is often preferable for several small operators on a modest class set.

`B.hecke_operators(indices)` and `B.hecke_matrices(indices)` expose the shared
batch operation. With `algorithm="auto"`, a checked-in cost model compares
the number of direct graph edges with the number of ideal-pair theta plans.
Explicit `"direct"` and `"brandt-series"` choices are always available:

```sage
sage: T3, T5 = B.hecke_matrices((3, 5))
sage: T3 == direct
True
sage: T5 == B.hecke_matrix(5, algorithm="direct")
True
```

Calling `B.brandt_series(P)` returns the detached exact matrix coefficient
vectors through $q^{P-1}$. Once this series is present, subsequent automatic
requests within its precision use it. Cached operators are keyed by both
index and resolved algorithm, so explicit differential checks never alias an
operator produced by the other path.

## Monodromy and component groups

For $p\nmid M$, the degree-zero Brandt lattice for discriminant $p$ and
conductor $M$ is the toric character lattice at $p$ of $J_0(pM)$. Its exact
pairing gives the full modular-Jacobian component group:

```sage
sage: from sagejs.modular_forms import brandt_component_group
sage: B = BrandtModule(37, 2, realization="ideal-classes")
sage: X = B.degree_zero_submodule()
sage: X.rank(), X.invariant_factors()
(8, (9,))
sage: C = brandt_component_group(B)
sage: C.invariant_factors(), C.order()
((9,), 9)
sage: C.character_lattice_frobenius_matrix()^2 == identity_matrix(ZZ, 8)
True
```

`C.frobenius_matrix()` is geometric Frobenius on the full Smith-coordinate
presentation of the finite cokernel. The certificate records both that
matrix and the $-W_p$ action on the character lattice. This function computes
the component group of the full modular Jacobian. It does not infer the
component group of a newform quotient from rational eigenvalues; that requires
additional integral modular-degree and annihilator maps.

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
| `B.mass()` | exact Eichler mass (ideal realization) |
| `B.degree_zero_submodule()` | integral monodromy lattice (ideal realization) |

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

The three realizations also provide independent internal checks:

- the supersingular path checks graph degree, automorphism masses, the
  Eisenstein vector, and exact mass-adjointness;
- the general path is built from exact modular symbols and isolates the
  $D$-new subspace before adjoining its Eisenstein line;
- the genuine ideal path checks order closure and discriminants, local
  principality, explicit ideal equivalence, unit weights, exact mass,
  row sums, pairing adjointness, and complete Hecke characteristic
  polynomials against the Jacquet--Langlands path;
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

For general $(D,N)$, timings must be labeled by realization. Magma and
`realization="ideal-classes"` both construct actual Eichler ideal classes and
are an equal-work comparison. The default Jacquet--Langlands realization is a
same-spectrum baseline with a different construction contract.

The frozen _before_ integral-backend receipt at source commit `3d65fd23` compares
Sage.js, SageMath 10.9, and Magma V2.18-5 on $(D,N,\ell)=(11,2,3)$ and
$(37,2,3)$. All three systems return the same dimensions and complete Hecke
characteristic polynomials. On the receipt's AMD EPYC 7B13 host, the combined
fresh-process wall times for both cases were $98.394\,\mathrm{s}$ for Sage.js,
$1.657\,\mathrm{s}$ for SageMath, and $0.620\,\mathrm{s}$ for Magma. Peak
process-tree RSS was $413.0$, $255.5$, and $26.9\,\mathrm{MB}$, respectively.
Sage.js's resident construction/first-$T_3$ stages were
$15.771/12.291\,\mathrm{s}$ at $(11,2)$ and
$34.980/29.669\,\mathrm{s}$ at $(37,2)$; cached operator access was below
$0.1\,\mathrm{ms}$ in both cases.

The final optimized receipt is pinned to source commit `07bc15f6`. It uses two
warmups and seven fresh-process samples, and repeats Magma work until every
operator timing contains at least $100\,\mathrm{ms}$ of aggregate CPU. The
median resident construction-plus-first-operator results are:

| $(D,N,\ell)$ | before Sage.js | final Sage.js | Magma | final ratio |
| --- | ---: | ---: | ---: | ---: |
| $(11,2,3)$ | $28.063$ s | $1.654$ s | $0.0752$ s | $21.37\times$ |
| $(37,2,3)$ | $64.649$ s | $3.503$ s | $0.2702$ s | $12.96\times$ |

Thus the retained implementation is $16.97\times$ and $18.45\times$ faster
than the original Sage.js backend, with unchanged complete matrices, pairings,
masses, and competitor characteristic polynomials. It remains an honest miss
against Magma, not a $2\times$ competitiveness claim. Descriptive larger rows
also agree exactly: dimension $36$ takes $14.723$ seconds versus Magma's
$1.7156$ seconds, and dimension $100$ takes $209.906$ seconds versus
$12.2528$ seconds.

The optimized implementation uses cached immutable rank-$4$ reduction plans,
direct $\mathbf P^1$ neighbor generation, traversal-edge reuse, exact recursive
Gram pruning, compiled GMP theta/vector recurrences, FLINT Gram-LLL and HNF
boundaries, an independent Brandt-series path, and lazy public quaternion
materialization. Dynamic, native Node, standalone GMP, and public Wasm paths
have exact differential coverage.

Use the integral realization when its certified quaternion ideal lattice,
pairing, or component-group data is required. Spectral-only work should
continue to use the much faster automatic realization. See the
[final performance report](../bench/results/brandt-ideal-classes-competitive-linux-x64-2026-08-29.md),
[final JSON receipt](../bench/results/brandt-ideal-classes-competitive-linux-x64-2026-08-29.json),
and [frozen before receipt](../bench/results/brandt-ideal-classes-competitive-linux-x64-2026-08-28.json)
for the complete contracts, source hashes, exact results, and named remaining
gaps.

## Current boundaries

The distinction between an abstract Hecke module and a canonical quaternion
ideal-class basis is important.

- The sparse supersingular ideal-class basis remains the automatic choice only
  for prime $D\geq5$ and $N=1$. The general ideal basis is available
  explicitly for every valid squarefree $D$ and coprime $N$.
- Ideal representatives are deterministic but canonical only up to class
  permutation and isometry. Code should use the published integral lattice,
  not compare representatives from different systems byte-for-byte.
- `T_n` currently requires $\gcd(n,DN)=1$. At primes dividing $D$, use
  `W(q)`. Operators at primes dividing the Eichler conductor are not yet
  exposed.
- General Jacquet--Langlands modules use $\mathbf Q$. The canonical
  supersingular and general Eichler ideal realizations also permit $\mathbf Z$.
- Only weight $2$ is currently implemented.
- The component-group API currently covers the full $J_0(pM)$ group at the
  prime quaternion discriminant $p$. Newform-quotient groups are deliberately
  deferred until integral modular-symbol annihilator and modular-degree maps
  can certify every finite index.

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
