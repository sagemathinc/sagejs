# Mestre's method of graphs and sparse modular forms

## Status

Implementation is active. The first classical vertical slice now provides a
public, lazily loaded `SupersingularModule(p)` for primes $p \geq 5$, exact
$T_2$ discovery over $\operatorname{GF}(p^2)$, an immutable sparse operator,
the mass-weighted graph view, and bounded dense materialization. Its focused
corpus covers Sage's exact level-$37$ example, structural checks through
$p=389$, and an independent Sage.js modular-symbol characteristic-polynomial
comparison.

The second classical slice also constructs exact classical modular
polynomials from the symmetric Laurent-series relation between $j(q)$ and
$j(q^\ell)$, under an explicit relation-size bound. This supplies sparse
$T_\ell$ for good prime indices, with exact row sums, mass adjointness, and
commutativity verification. The checked $T_3$ and $T_5$ operators agree with
Magma's Gram/theta and neighboring-ideal Brandt modes and with pinned LMFDB
newform data.

The remaining classical portability gate is a uniform canonical
power-basis-coordinate export for both finite-field backends. Exact equality
currently defines point identity and no formatted representation is trusted,
but cross-platform coordinate sorting must land before the basis digest is
declared stable. Optimized large-index modular-polynomial construction,
verified Krylov algorithms, Mestre reconstruction, and the Hilbert modules
remain later implementation stages in this plan.

This document is the review gate before implementation. The recommended first
slice is the classical prime-level supersingular module and its sparse
$T_2$ operator. The longer program has two especially attractive outcomes:

1. a scalable sparse-linear-algebra route to weight-two modular forms over
   $\mathbf{Q}$; and
2. a revival and generalization of William Stein's historically
   high-performance icosian implementation of parallel weight $(2,2)$ Hilbert
   modular forms over $\mathbf{Q}(\sqrt{5})$.

The design intentionally makes sparse operator application the primary
abstraction. Constructing a graph and immediately converting it to a dense
matrix would miss the main mathematical and computational opportunity.

## Executive decision

Implement this in measured stages:

1. reproduce Sage's level-one `SupersingularModule(p)` semantics for prime
   $p$, initially with the $3$-regular supersingular $2$-isogeny multigraph;
2. store its Brandt--Hecke operator as a genuine immutable sparse operator,
   with bounded dense materialization only as a small-instance oracle;
3. add deterministic sparse Krylov facilities and use them to obtain Hecke
   factors/eigenspaces without dense elimination;
4. add further $T_\ell$ operators and Mestre reconstruction of q-expansions;
5. expose the same object as a weighted isogeny graph for expander and spectral
   experiments;
6. revive the $\mathbf{Q}(\sqrt{5})$ icosian engine with its original fast
   orbit-table architecture; and
7. generalize the finite-Hecke-set engine to other real quadratic fields,
   while treating quaternion orders, ideal classes, and compatible local
   splittings as genuine arithmetic inputs rather than hiding them behind the
   special $\mathbf{Q}(\sqrt{5})$ case.

The first implementation should not begin with a general algebraic-modular-
forms framework. It should establish one beautiful, inspectable vertical slice
whose exact output can be compared with Sage and Sage.js modular symbols, and
whose sparse behavior can be measured honestly.

## Why this is a particularly good Sage.js project

Mestre's method joins several themes that Sage.js is now positioned to handle
well:

- exact finite-field and polynomial arithmetic;
- source-transparent mathematical code;
- sparse graph traversal;
- sparse linear algebra over finite fields and the integers;
- native and WebAssembly kernels with a correct ordinary-Python fallback;
- existing weight-two modular-symbol Hecke operators as independent oracles;
- a compelling graph-theory interpretation; and
- an unusually strong body of prior code in Sage and psage.

It also offers a better scaling model than a conventional dense modular-symbol
calculation. For prime level $p$, the supersingular module has dimension about
$p/12$, but $T_\ell$ has only $\ell+1$ outgoing edges per row. Thus storage and
one matrix-vector product are linear in the dimension for fixed $\ell$.

Alex Cowan's implementation demonstrates that this is not merely an elegant
small-level construction: supersingular isogeny graphs plus Wiedemann's sparse
minimal-polynomial algorithm were used to compute q-expansions of all
weight-two prime-level cusp forms under stated degree bounds through level
$2{,}000{,}000$.

## Mathematical contract: the classical module

Let $p$ be a prime and let

$$
S_p = \mathbf{Z}\big[\{\text{supersingular }j\text{-invariants in characteristic }p\}\big].
$$

Every supersingular $j$-invariant is defined over $\operatorname{GF}(p^2)$.
For a prime $\ell \ne p$, cyclic $\ell$-isogenies define a Brandt operator
$T_\ell$ on $S_p$. In the basis of supersingular isomorphism classes, its
entries count isogenies with multiplicity. Equivalently, it is the weighted
adjacency operator of the supersingular $\ell$-isogeny multigraph.

The essential invariants are:

- the rank of $S_p$ is $\dim M_2(\Gamma_0(p))$;
- every row of $T_\ell$ has total multiplicity $\ell+1$;
- the constant vector is the Eisenstein eigenvector with eigenvalue
  $\ell+1$;
- after removing the Eisenstein line, the Hecke action corresponds to the
  weight-two cuspidal/new part through the Brandt/Jacquet--Langlands
  correspondence; and
- the operators for distinct good primes commute.

The basis has exceptional automorphism weights at $j=0$ and $j=1728$.
Consequently, the raw Brandt matrix need not be symmetric in the ordinary
Euclidean pairing. The implementation must carry the exact mass pairing and
verify the corresponding weighted self-adjoint relation. A naive $\sum_i v_i=0$
definition of the cuspidal subspace is not acceptable unless it has been
derived from that pairing.

### Expander interpretation

For fixed $\ell$, these are Ramanujan multigraphs after the correct weighting:
the trivial eigenvalue is $\ell+1$, and the nontrivial spectrum satisfies the
optimal $2\sqrt{\ell}$ bound. The public graph view must preserve loops,
multiple edges, and vertex masses. Calling it an ordinary simple undirected
graph would discard arithmetic information and can make symmetry claims
false.

The graph interface should therefore distinguish:

- directed adjacency records with exact multiplicities;
- the underlying undirected isogeny multigraph;
- vertex automorphism/mass weights;
- the raw Brandt operator; and
- its normalized self-adjoint realization for spectral experiments.

## What SageMath currently does

Sage's public constructor is:

```sage
S = SupersingularModule(p, level=1, base_ring=ZZ)
```

Its current implementation:

- supports only auxiliary level $1$;
- constructs $\operatorname{GF}(p^2)$ and one supersingular starting $j$-invariant;
- discovers all vertices in breadth-first order;
- computes the first neighbors using the classical modular polynomial
  $\Phi_2(X,j)$;
- thereafter divides out the known predecessor edge and solves a quadratic;
- constructs $T_2$ as a sparse integer matrix as a side effect of discovery;
- uses PARI's `polmodular` for general $T_\ell$; and
- currently materializes general $T_\ell$ densely despite documenting a sparse
  result.

The standard level-$37$ example is:

```sage
sage: S = SupersingularModule(37)
sage: S.supersingular_points()[0]
[8, 27*a + 23, 10*a + 20]
sage: S.T(2).matrix()
[1 1 1]
[1 0 2]
[1 2 0]
```

This is an excellent semantic starting point. Sage.js should preserve the
recognizable constructor and common methods, but it should not copy the
dense-linear-algebra limitation.

## First vertical slice

### Scope

The initial accepted slice should support:

- prime characteristic $p \ge 5$;
- auxiliary level $1$;
- base ring $\mathbf{Z}$ for the authoritative operator;
- the $T_2$ graph;
- deterministic supersingular point discovery over $\operatorname{GF}(p^2)$;
- genuine sparse storage and application;
- a mass-weighted graph view;
- bounded dense materialization for tests and small examples; and
- exact comparison with Sage and Sage.js modular symbols.

Characteristics $2$ and $3$, auxiliary level greater than one, arbitrary
$T_\ell$, q-expansion reconstruction, and Hilbert modular forms are later
slices. They must fail explicitly rather than silently selecting a different
mathematical object.

### Vertex discovery

The proposed $T_2$ construction is:

1. construct the canonical Sage.js $\operatorname{GF}(p^2)$ parent;
2. find one supersingular $j$-invariant using the class-number-one CM values;
3. if those all split, fall back to an exact Hilbert-class-polynomial or
   trace-zero search, with the selected method reported;
4. factor $\Phi_2(X,j_0)$ to obtain the initial three neighbors;
5. traverse breadth first;
6. at a noninitial vertex, remove the already-known predecessor factor and
   solve the resulting quadratic;
7. canonicalize and look up every finite-field element by exact power-basis
   coordinates, never by object identity or formatted `repr` text;
8. sort newly discovered roots by those coordinates so the basis order is
   cross-platform deterministic; and
9. stop only when the graph is exhausted and its vertex count equals the
   independently computed Deuring/dimension formula.

The specialized quadratic continuation is important. Repeatedly factoring a
cubic works mathematically, but it wastes exactly the local graph structure
that makes this method efficient.

### Sparse storage contract

The authoritative representation should be an immutable CSR-like record:

```text
row_offsets : length h + 1
columns     : length nnz
values      : positive exact multiplicities
```

For $T_2$, the sum of multiplicities in each row is $3$, and
$\operatorname{nnz} \le 3h$. Column indices and row offsets can use bounded
unsigned machine integers once the dimension has been checked. Multiplicities
are small nonnegative integers. Exact vectors over $\mathbf{Z}$ or finite
fields remain separate from the structural graph arrays.

The operator must provide at least:

```python
T.nrows()
T.ncols()
T.nonzero_count()
T.row(i)                       # immutable (column, multiplicity) pairs
T.neighbors(i)                 # multiplicity-preserving graph view
T.apply(vector)
T.apply_mod(vector, q)
T.apply_block(vectors, q)
T.transpose_apply(vector)
T.matrix(max_entries=..., force=False)
```

`matrix()` is a compatibility and oracle operation. It must reject an
unbounded dense materialization by default. The sparse operator must never
cache a dense matrix merely because one caller requested a single entry or
one row.

The current public Sage.js `matrix(..., sparse=True)` flag does not yet provide
an authoritative sparse storage model. This project should therefore use a
small explicit sparse-operator abstraction rather than pretend a dense matrix
is sparse. If that abstraction proves generally useful, it can later become a
shared linear-algebra type through a separate reviewed change.

### Public API

The recognizable Sage-compatible surface should be:

```sage
sage: S = SupersingularModule(37)
sage: S.dimension()
3
sage: points, point_index = S.supersingular_points()
sage: T2 = S.T(2)
sage: T2.is_sparse()
True
sage: T2 * vector(ZZ, [1, 1, 1])
(3, 3, 3)
sage: T2.matrix()
[1 1 1]
[1 0 2]
[1 2 0]
```

Proposed additions, clearly documented as Sage.js extensions, are:

```sage
S.isogeny_graph(2)
S.mass_pairing()
S.eisenstein_vector()
S.cuspidal_operator(2)
T2.apply_mod(v, q)
T2.minimal_polynomial(modulus=q, algorithm="wiedemann")
T2.spectral_data(...)
```

`S.T(ell).matrix()` should remain valid for small instances. Algorithms that
want the scalable path must operate on `S.T(ell)` itself.

The point-index object should behave like a read-only mapping from exact field
elements to basis positions. Its identity must be based on canonical field
coordinates. It must not rely on JavaScript object identity.

### Operator orientation

The implementation must choose and test one convention explicitly:

$$
(Tv)_i = \sum_j T_{ij}v_j.
$$

Rows are adjacency lists, so the constant column vector has eigenvalue
$\ell+1$. If a later algebraic-modular-forms layer naturally records the
image of a basis vector in a row and acts from the right, it must expose that
orientation rather than silently transpose one implementation. Conversion
between the conventions is cheap; ambiguity is not.

## Sparse linear algebra program

This is the heart of the project.

### Small instances: dense exact oracle

For dimensions below an explicit entry budget:

- materialize the integer matrix;
- use FLINT for characteristic polynomials, kernels, and exact decomposition;
- compare with Sage.js modular-symbol Hecke operators; and
- retain the dense result only if the caller explicitly requested it.

This path establishes correctness. It is not the performance architecture.

### Large instances: Krylov first

For a finite field $\operatorname{GF}(q)$, a sparse matrix-vector product costs
$O((\ell+1)h)$. The first scalable primitive should be a deterministic,
verifiable Wiedemann sequence:

$$
s_k = u^{\mathsf T}T^k v.
$$

Berlekamp--Massey recovers a candidate minimal polynomial. The implementation
must record the modulus, projections, deterministic seed, sequence length,
and verification replays. A candidate is not accepted merely because
Berlekamp--Massey returned a polynomial.

Required verification includes:

- applying the candidate polynomial to independent vectors gives zero;
- repeated deterministic projections stabilize the least common multiple;
- the known Eisenstein factor is present; and
- small instances match the dense exact minimal polynomial.

### Do not confuse minimal and characteristic polynomials

One scalar Wiedemann run generally recovers a minimal polynomial, not a
characteristic polynomial with multiplicities. Even though rational Hecke
operators are semisimple, eigenvalues can collide after reduction modulo $q$.
The implementation must not promote a minimal polynomial to a characteristic
polynomial by wishful thinking.

Later exact characteristic-polynomial support should use one of:

- block Wiedemann with invariant-factor recovery;
- a proved sparse determinant/characteristic-polynomial algorithm;
- decomposition into verified invariant subspaces whose dimensions account
  for the entire module; or
- modular computations at several good primes plus an independently proved
  multiplicity bound and CRT reconstruction.

Every randomized-looking algorithm should be Las Vegas: deterministic from a
recorded seed, followed by exact verification, with retry rather than a
probabilistic mathematical answer.

### Eigenspaces and newforms

Once a factor of a Hecke polynomial is known, kernels of $f(T)$ can also be
computed through sparse application. A practical decomposition strategy is:

1. remove the exact Eisenstein line using the mass pairing;
2. factor a verified Hecke polynomial over a suitable finite field;
3. isolate candidate invariant subspaces with sparse polynomial application;
4. refine ambiguous pieces with commuting operators $T_\ell$;
5. lift exact eigenvalues/eigenpackets; and
6. verify dimensions and Hecke relations against independent operators.

For q-expansions, implement Mestre's eigenvector formula and the standard
Hecke recurrences only after simultaneous eigenvectors and normalization have
an exact contract. Every reconstructed expansion should be checked through a
Sturm bound when a matching modular-symbol space is feasible.

### Useful shared sparse primitives

The project is a strong witness for a compact exact sparse API:

- CSR construction from bounded row accumulators;
- integer and prime-field matvec;
- transposed matvec;
- block matvec;
- sparse polynomial application;
- Krylov sequences;
- Berlekamp--Massey;
- invariant-subspace restriction without dense ambient matrices; and
- deterministic structural hashes.

These should be ordinary Python first. Measured hot loops may then use
source-transparent `@native` compilation. No new pointer protocol, capsule
registry, arena, or handwritten mathematical C should be introduced merely
for this project.

## Correctness and provenance

### Structural invariants

Every constructed $T_\ell$ must verify:

- the number of vertices equals the independent dimension formula;
- all vertices are distinct exact elements of $\operatorname{GF}(p^2)$;
- each vertex is supersingular by an independent criterion on a bounded test
  corpus;
- each row has total multiplicity $\ell+1$;
- every column index is in range;
- the graph is connected for the supported good-prime cases;
- the mass-weighted adjoint relation holds;
- the constant vector has eigenvalue $\ell+1$; and
- separately constructed good Hecke operators commute.

### Differential oracles

The initial corpus should include:

- Sage's exact $p=7$, $p=11$, and $p=37$ point examples;
- Sage's exact level-$37$ $T_2$ matrix;
- Sage's level-$67$ $T_3$ matrix once general $T_\ell$ lands;
- level $389$, where the supersingular module has dimension $33$;
- a range of primes in every residue class modulo 12;
- primes with exceptional $j=0$ or $j=1728$ vertices; and
- primes that force the seed-search fallback.

Basis order is secondary to mathematical equality. Exact matrix comparisons
may first compute the unique basis permutation induced by canonical
$j$-coordinates. Characteristic polynomials, mass pairings, graph spectra, and
Hecke commutativity are basis-independent and must match directly.

The strongest independent Sage.js oracle is the existing weight-two modular
symbols implementation. For prime $p$, after removing the Eisenstein factor
$x-(\ell+1)$, the supersingular characteristic polynomial should match the
appropriate cuspidal/new Hecke polynomial, with the comparison convention
recorded explicitly.

Magma is a second, structurally independent oracle rather than merely a
competitor timer. Its general `BrandtModule(D, m)` interface constructs the
canonical left-quaternion-ideal-class basis and pairing for discriminant $D$
and Eichler conductor $m$. The default Hecke path uses theta series of reduced
Gram matrices; `ComputeGrams := false` instead enumerates neighboring ideals in
the graph style of Mestre--Oesterlé. The oracle harness should record and
compare both modes whenever both are feasible:

```magma
Bgram := BrandtModule(p, 1);
Bgraph := BrandtModule(p, 1 : ComputeGrams := false);
Tgram := HeckeOperator(Bgram, ell);
Tgraph := HeckeOperator(Bgraph, ell);
```

The exact checks include `Dimension`, `Basis`, `InnerProductMatrix`,
`CuspidalSubspace`, `HeckeOperator`, and characteristic polynomials or
decompositions. Magma matrices act on the right with respect to `Basis(B)`, so
the harness must transpose when necessary rather than silently compare two
opposite conventions. Construction time, first-$T_\ell$ time, warm-$T_\ell$
time, and peak memory are separate benchmark cells. The Gram/theta and
neighboring modes must retain their names in every receipt.

LMFDB is a third exact data oracle. For prime level $p$, weight $2$, and
trivial character, the `mf_newforms` records provide the Hecke-orbit
dimensions, coefficient fields, cutter polynomials, and traces. Their total
dimension must equal the cuspidal dimension, and their $T_\ell$ factors must
match the Brandt operator after removing the Eisenstein line. The related
elliptic-curve tables provide a particularly transparent partial check: the
number of conductor-$p$ rational isogeny classes equals the number of
degree-one rational newform orbits, and each corresponding $a_\ell$ occurs as
a rational cuspidal eigenvalue. This count does not include higher-degree
newform orbits and must never be presented as the full cuspidal factorization.

Network tests should download bounded API results into a content-addressed
fixture. Routine tests replay the checked fixture offline and verify its
source URL, retrieval timestamp, schema, and SHA-256 digest. A live LMFDB
request is an explicit refresh/integration operation, not an undeclared unit
test dependency.

### Portability

The first claimed platform envelope must state exactly how
$\operatorname{GF}(p^2)$ roots are computed. Native FLINT availability on
one Linux host is not enough. Before
claiming browser portability, the production Wasm path must support the same
extension-field polynomial root/factor operation or take a tested exact
fallback. Windows x64, Linux x64, Linux ARM64, macOS ARM64, and authenticated
Wasm should either pass the same corpus or report an explicit capability
limit.

### Cached authority

A serialized or cached sparse operator must bind at least:

- $p$, auxiliary level, and $\ell$;
- the exact finite-field modulus and generator convention;
- the modular-polynomial identity/digest;
- the point-ordering version;
- the canonical point-coordinate digest;
- the CSR digest;
- the mass weights; and
- the implementation/source schema version.

Cached rows are acceleration state, not unquestioned mathematical authority.
Loading must recheck structural hashes and the inexpensive row invariants.

## Graph-theory surface

The same data should be useful without requiring the user to know modular
forms. A proposed graph view is:

```sage
G = SupersingularModule(p).isogeny_graph(ell)
G.order()
G.degree()                       # ell + 1, with multiplicity
G.vertex(i).j_invariant()
G.vertex(i).mass()
G.edges(multiplicities=True)
G.adjacency_operator()
G.normalized_adjacency_operator()
G.spectrum(algorithm="sparse")
G.ramanujan_bound()
G.verify_ramanujan(...)
```

For a large graph, `spectrum()` must not imply dense diagonalization. It can
return certified factors, extremal eigenvalue intervals, or selected
eigenpairs depending on the requested algorithm. The result type must say
which of these was computed.

This interface creates natural examples for courses and experiments in
expanders, random walks, mixing, cryptographic isogeny graphs, and spectral
graph theory while retaining exact arithmetic provenance.

## Hilbert modular forms over $\mathbf{Q}(\sqrt{5})$

### Existing psage asset

The code in
`psage/modform/hilbert/sqrt5/` is not merely a conceptual sketch. It contains a
highly optimized implementation of parallel weight $(2,2)$ Hilbert modular
forms based on the icosian ring. The author reports that it was likely the
fastest implementation in the world for this problem at the time. That makes
it a performance and architectural oracle worth preserving.

Its central finite set is

$$
R^* \backslash \mathbf{P}^1(\mathcal{O}_F/N),
\qquad F=\mathbf{Q}(\sqrt{5}).
$$

where $R$ is the icosian order. The optimized implementation:

- reduces the $120$ icosian units modulo the level;
- enumerates projective-line points over the finite quotient ring;
- builds a dense `standard_point -> orbit_representative` lookup table once;
- stores one canonical projective representative per orbit;
- enumerates the norm-$\mathfrak p$ Hecke elements;
- acts on each representative by small local matrices;
- canonicalizes the image with one table lookup; and
- increments one sparse row entry.

Thus one Hecke row has work essentially proportional to
$\operatorname{Norm}(\mathfrak p)+1$ after the orbit table is built. The
implementation can compute a single basis image without materializing the
full matrix, exactly the operator-first design proposed above.

The existing examples provide durable mathematical fixtures. At level a prime
above $389$, the module has dimension $7$ and its $T_2$ matrix is:

$$
\begin{pmatrix}
0&3&0&1&1&0&0\\
3&0&0&0&1&0&1\\
0&0&2&1&0&1&1\\
1&0&1&0&1&0&2\\
1&1&0&1&0&1&1\\
0&0&2&0&2&1&0\\
0&1&1&2&1&0&0
\end{pmatrix}.
$$

The checked-in psage examples also record characteristic factorizations and
commutativity among $T_2$, $T_3$, $T_5$, and the two primes above $11$. These
should become the initial revival corpus.

### The crucial local-splitting lesson

The psage source contains an unusually valuable correctness warning:
degeneracy maps between levels $\mathfrak p^{n+1}$ and $\mathfrak p^n$ are
wrong if the local quaternion splitting maps are chosen independently. The
lower-level splitting must be obtained by reduction from the already fixed
higher-level map.

In Sage.js, a local splitting is therefore a versioned mathematical object,
not a disposable helper result. It must include:

- the quaternion order and basis;
- the prime ideal and exponent;
- the matrix-algebra target;
- the chosen images of basis elements;
- a compatibility/fingerprint link to adjacent exponents; and
- exact multiplication and reduction checks.

Degeneracy maps must refuse incompatible splitting families. This should be a
first-class invariant, not an assertion buried in optimized code.

### Revival strategy

The first Hilbert slice should faithfully revive $\mathbf{Q}(\sqrt{5})$ before
trying to generalize it:

1. translate the mathematical source to ordinary modern Python;
2. reproduce the orbit counts, matrices, factorizations, and commuting
   relations in the psage fixtures;
3. implement the orbit canonicalization table and row generator as the main
   performance path;
4. keep the full operator sparse and permit single-row application;
5. compare memory and time with any runnable historical build, Sage, and
   Magma, labeling unavailable competitors honestly; and
6. only then factor the reusable finite-Hecke-set interface from the proven
   special implementation.

The objective is not to replace the fast icosian structure with a beautiful
but slow tower of generic number-field objects. Generic parent objects may
construct and certify the local data; the hot action should retain compact
canonical coordinates and O(1) orbit lookup.

## Generalization to other real quadratic fields

The reusable mathematical pattern is broader than $\mathbf{Q}(\sqrt{5})$:
compute parallel weight-two Hilbert modular forms as algebraic modular forms
on a totally definite quaternion algebra, with Hecke operators acting on a
finite set of quaternionic ideal/double-coset data.

However, the icosian case has exceptional conveniences. A correct general
engine must account for:

- a general real quadratic field and its ring of integers;
- narrow class-group components;
- a totally definite quaternion algebra with the required ramification;
- maximal/Eichler orders and their right-ideal classes;
- unit groups and stabilizers that vary by component;
- projective modules over $\mathcal{O}_F/N$, not only a single convenient
  quotient;
- split, inert, and ramified rational primes;
- compatible local splittings at every prime-power level;
- bad-prime operators and degeneracy maps; and
- mass pairings and old/new subspaces across components.

The likely reusable interface is a finite Hecke set:

```python
class FiniteHeckeSet:
    def cardinality(self): ...
    def mass(self, i): ...
    def hecke_row(self, prime_ideal, i): ...
    def degeneracy_row(self, lower_level, i): ...
```

The classical supersingular module and the icosian Hilbert module can both
feed the same sparse-operator and Krylov layer while retaining different
arithmetic constructors. This is the right level of unification. Forcing both
through one premature representation of vertices or quaternion elements is
not.

### Generalization milestones

1. **$\mathbf{Q}(\sqrt{5})$ parity:** revive the icosian implementation and beat or
   match its algorithmic scaling.
2. **Second field:** choose a real quadratic field whose quaternion order has
   more than one ideal-class component. This prevents an abstraction that only
   renames the class-number-one case.
3. **Prime-level good operators:** construct and verify $T_{\mathfrak p}$ away
   from the level.
4. **Composite/prime-power levels:** introduce compatible local splitting
   families.
5. **Degeneracy and new subspaces:** verify dimensions and Hecke stability.
6. **Broader corpus:** compare with Magma or independently generated tables.

## Repository architecture

The proposed source layout, subject to review, is:

```text
src/baselib/modular.py
    very small public SupersingularModule facade

src/lib/sage/modular/ssmod/
    Sage-compatible supersingular module and graph construction

src/lib/sagejs/modular_forms/sparse_hecke.py
    immutable sparse operator, mass pairing, exact application

src/lib/sagejs/modular_forms/krylov.py
    Wiedemann/block-Krylov algorithms and verification

src/lib/sagejs/modular_forms/mestre.py
    eigensystems and q-expansion reconstruction

src/lib/sagejs/modular_forms/hilbert_sqrt5/
    revived icosian arithmetic and fixtures

src/lib/sagejs/modular_forms/algebraic/
    later general finite-Hecke-set/quaternion-order layer
```

All mathematical `.py` files remain CPython-parseable and strict. The first
slice should use existing finite-field/FLINT capabilities. Any `@native`
kernel must lower the actual source body, retain a dynamic oracle, and be
motivated by a measured bottleneck. Handwritten C is not proposed.

The lazy package graph should keep the supersingular and Hilbert machinery out
of startup. The small global constructor may live in the modular bootstrap
only if it fits the measured package budget; otherwise users can initially
import it from `sage.modular.ssmod.ssmod` until a cleaner lazy global export is
available.

## Tests and acceptance

### First-slice correctness gates

- exact Sage fixtures for points and matrices;
- exact Magma Brandt-module fixtures from both Gram/theta and neighboring
  modes, including the canonical pairing and matrix-orientation conversion;
- content-addressed LMFDB newform and elliptic-isogeny-class fixtures;
- exact modular-symbol characteristic-polynomial comparison;
- structural graph invariants on a broad prime corpus;
- exceptional-automorphism mass tests;
- deterministic vertex/CSR digests across repeated processes;
- native/dynamic differential runs;
- Windows x64, Linux x64, Linux ARM64, macOS ARM64, and Wasm capability
  receipts for every claimed path;
- strict CPython/Ruff/Pyright checks;
- architecture validation; and
- focused mutation/cache/adversarial tests.

### Sparse acceptance gates

At a minimum, benchmark:

- graph construction wall time and peak RSS;
- bytes per vertex and nonzero;
- one integer matvec;
- one prime-field matvec;
- block matvec;
- a verified Wiedemann minimal polynomial; and
- the corresponding bounded dense oracle where feasible;
- Magma construction and first/warm Hecke timings with `ComputeGrams` both
  true and false; and
- Sage construction and first/warm Hecke timings under the same output
  contract.

Recommended corpus:

- $p=37$ for the human-readable exact matrix;
- $p=389$ for Sage's dimension-$33$ decomposition example;
- the next primes above $10^4$, $10^5$, and $10^6$, subject to resource
  envelopes; and
- levels used in Cowan's published computations when comparable data is
  available.

The sparse path should show linear storage in $h$ and no hidden dense
allocation. A benchmark that completes only because the process materializes
$h^2$ entries is a failure even if the wall time looks good.

### Hilbert acceptance gates

- exact psage orbit counts and matrices at levels above $31$, $389$, $809$,
  and $2011$ where fixtures are available;
- characteristic-polynomial factorizations from the psage examples;
- commutativity of good Hecke operators;
- orbit disjointness and unit-orbit-size divisibility checks;
- compatible and deliberately incompatible local-splitting tests;
- degeneracy-map and old/new-dimension checks;
- single-row/full-operator consistency; and
- honest same-host performance comparisons.

The historical claim that the $\mathbf{Q}(\sqrt{5})$ code was world-leading
should motivate a demanding benchmark, but a new release should report only
current, reproducible measurements.

## Staged implementation plan

### Phase 0: freeze fixtures and conventions

- capture Sage point/matrix outputs and modular-symbol comparisons;
- capture the psage $\mathbf{Q}(\sqrt{5})$ matrices and factorizations;
- specify operator orientation, field-coordinate order, mass convention, and
  cache schema;
- decide exact dense-materialization limits; and
- add a benchmark contract before optimization.

Exit: reviewed fixture document and no ambiguous matrix convention.

### Phase 1: classical $T_2$ graph

- implement `SupersingularModule(p)` at level one;
- implement deterministic CM seed selection and exact fallback;
- traverse with $\Phi_2$ and the quadratic continuation;
- publish an immutable sparse operator and graph view;
- validate dimensions, masses, row sums, connectivity, and Sage fixtures; and
- expose bounded dense materialization.

Exit: exact level-$37$ parity and broad structural corpus, with storage linear in
the module dimension.

### Phase 2: sparse Krylov engine

- prime-field CSR/block matvec;
- deterministic scalar Wiedemann;
- Berlekamp--Massey and exact annihilation verification;
- modular-symbol/dense-oracle differentials; and
- source-transparent native acceleration only after profiling.

Exit: a verified minimal polynomial at a level where dense materialization is
outside the accepted memory budget.

### Phase 3: further Hecke operators and q-expansions

- authenticated modular-polynomial provider;
- sparse $T_\ell$ construction;
- commuting-operator refinement;
- exact cuspidal/eigenpacket normalization;
- Mestre q-expansion reconstruction; and
- Sturm-bound verification.

Exit: exact newform q-expansions at a level that materially benefits from the
sparse method.

### Phase 4: expander graph product

- weighted multigraph API;
- normalized sparse operator;
- selected spectral computations;
- Ramanujan-bound verification; and
- reproducible examples/documentation.

Exit: graph users can study the family without importing the modular-forms
decomposition machinery.

### Phase 5: $\mathbf{Q}(\sqrt{5})$ icosian revival

- modern exact arithmetic and local splitting objects;
- orbit table and compact projective coordinates;
- sparse row/operator generation;
- degeneracy maps with compatibility proofs;
- psage differential corpus; and
- competitive benchmarks.

Exit: exact fixture parity and a demonstrated high-performance sparse path.

### Phase 6: general real quadratic fields

- quaternion ideal-class components;
- general finite Hecke sets;
- good-prime operators;
- a second-field witness that defeats class-number-one assumptions;
- prime-power local compatibility; and
- old/new subspaces.

Exit: the public abstraction is justified by two genuinely different fields,
not extrapolated from $\mathbf{Q}(\sqrt{5})$ alone.

## Explicit non-goals for the first slice

- general auxiliary level;
- every modular polynomial $\Phi_\ell$;
- a complete Hecke-module hierarchy;
- dense eigensystem computation at large level;
- probabilistic results without exact replay;
- a generic graph that discards masses or multiplicities;
- a new handwritten native representation;
- browser claims without extension-field root support;
- Hilbert modular forms hidden inside the classical supersingular API; or
- a generic real-quadratic implementation before $\mathbf{Q}(\sqrt{5})$ is
  revived and measured.

## Review questions

The recommended answers are included so review can focus on genuine choices.

1. **Should the first slice be $T_2$ only?** Yes. It exercises the complete
   graph/operator contract and has a particularly efficient quadratic
   traversal.
2. **Should the public object be a matrix?** No. It should be a sparse Hecke
   operator with bounded matrix materialization.
3. **Should the implementation match Sage's discovery order exactly?** Match
   it when deterministic, but make exact field coordinates and an explicit
   ordering version authoritative. Compare matrices up to the induced basis
   permutation.
4. **Should Wiedemann return a characteristic polynomial?** Not without the
   additional multiplicity proof described above.
5. **Should graph-theory users see a simple graph?** No. Preserve the weighted
   multigraph and offer a normalized spectral view.
6. **Should $\mathbf{Q}(\sqrt{5})$ be rewritten generically at once?** No.
   First revive the fast icosian algorithm faithfully, then extract the
   reusable finite Hecke-set layer.
7. **Should the first slice use new low-level native machinery?** No. Use
   ordinary Python and existing exact boundaries, profile, then compile the
   narrow sparse hot loops if the evidence warrants it.

## Primary references and source oracles

- SageMath,
  [`sage.modular.ssmod.ssmod`](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/ssmod/ssmod.html),
  including source by William Stein, David Kohel, and Iftikhar Burhanuddin.
- SageMath source,
  [`ssmod.py`](https://github.com/sagemath/sage/blob/develop/src/sage/modular/ssmod/ssmod.py).
- Magma Handbook,
  [Brandt module creation](https://docs.magma-maths.org/ModularArithmeticGeometry/BrandtModules/ModBrdt:brandt-modules.html)
  and
  [Hecke operators](https://docs.magma-maths.org/ModularArithmeticGeometry/BrandtModules/hecke-operators.html).
- LMFDB,
  [database access options](https://www.lmfdb.org/api/options) and the
  `mf_newforms` HTTP API table.
- Alex Cowan,
  [*Computing newforms using supersingular isogeny graphs*](https://arxiv.org/abs/2010.10745).
- Jean-François Mestre, English translation of the method-of-graphs note,
  [`mestre-en.pdf`](https://wstein.org/rank4/mestre-en.pdf).
- William Stein's psage source,
  [`psage/modform/hilbert`](https://github.com/williamstein/psage/tree/master/psage/modform/hilbert),
  with the local checkout at
  `/home/user/upstream/psage/psage/modform/hilbert/`.

The Sage and psage sources are GPL-compatible implementation references.
Sage.js should preserve attribution in module documentation and identify which
parts are Sage-derived, psage-derived, or Sage.js-original sparse-linear-
algebra work.
