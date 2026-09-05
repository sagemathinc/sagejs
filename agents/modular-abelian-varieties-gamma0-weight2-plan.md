# Weight-$2$ modular abelian varieties over $\mathbf Q$

## Status and scope

This document specifies the first Sage.js modular-abelian-variety vertical
slice.  It targets weight $2$ and $\Gamma_0(N)$ over $\mathbf Q$ and uses the
existing exact modular-symbol implementation as its authoritative
computational representation.

The slice is deliberately integral.  A modular abelian variety is not just a
rational Hecke subspace: it carries a rank-$2g$ homology lattice, integral
Hecke action, and exact maps between lattices.  That distinction is necessary
for later modular-degree, congruence, component-group, and polarization
algorithms.

The public entry points are:

```sage
J = J0(37)
A = AbelianVariety(CuspForms(43, 2).newforms()[1])
B = AbelianVariety(ModularSymbols(37, 2).cuspidal_submodule()[0])
```

This is a greenfield API, but it follows the mature Sage object model where
that model expresses genuine mathematics.  Magma is an independent oracle for
dimensions and Hecke data; it does not provide an equally broad concrete
modular-abelian-variety object layer.

## Mathematical representation

Let

$$
M=M_2(\Gamma_0(N),\mathbf Q)
$$

be the sign-zero modular-symbol module in the existing Manin-symbol
coordinates, and let $S\subset M$ be its cuspidal subspace.  If $B_S$ is a
rational row basis for $S$, the ambient integral homology lattice is

$$
H_1(J_0(N),\mathbf Z)=S\cap\mathbf Z^m,
$$

where $m=\dim M$.  We compute this intersection from equations, not by merely
clearing denominators in $B_S$:

1. compute a rational basis $R$ of the right kernel of $B_S$;
2. clear denominators in $R$ without changing its rational row space;
3. compute the saturated integer right kernel of the resulting integer
   matrix.

The final kernel is exactly $S\cap\mathbf Z^m$.  FLINT supplies the canonical
integer kernel, so the result is saturated by construction.

For a rational Hecke-stable subspace $W\subset S$, its embedded integral
homology is likewise

$$
H_W=W\cap H_1(J_0(N),\mathbf Z)=W\cap\mathbf Z^m.
$$

The inclusion $H_W\hookrightarrow H_1(J_0(N),\mathbf Z)$ is recovered by an
exact solve against the ambient saturated basis and is required to be an
integer matrix.

### The connected newform quotient

For a normalized newform packet $f$, let $W_f\subset S$ be the corresponding
sign-zero rational Hecke constituent and let $K_f$ be the direct sum of the
other rational constituents.  The connected quotient is

$$
A_f=J_0(N)/I_fJ_0(N),\qquad
H_1(A_f,\mathbf Z)=H_1(J_0(N),\mathbf Z)/(H_1(J_0(N),\mathbf Z)\cap K_f).
$$

The kernel is saturated because it is the intersection of an integral lattice
with a rational subspace.  Consequently the quotient is torsion free.

Computationally, stack rational bases of $W_f$ and $K_f$, solve for the
coordinates of the ambient integral homology basis, and project onto the
$W_f$ coordinates.  Hermite normal form gives an exact basis for the image
lattice.  Expressing every projected ambient basis vector in that image basis
produces a surjective integer matrix

$$
q_f:H_1(J_0(N),\mathbf Z)\longrightarrow H_1(A_f,\mathbf Z).
$$

This records the quotient rather than silently identifying it with the
generally different lattice $W_f\cap H_1(J_0(N),\mathbf Z)$.  The latter is
available from `embedded_subvariety()` together with its integral inclusion.
The two rational Hecke modules agree, while their integral lattices can differ
by the familiar finite isogeny data.

## Public object model

### `J0(N)` and `AbelianVariety(X)`

`J0(N)` returns a cached ambient object.  Its dimension is available from the
dimension formula without constructing homology.  `AbelianVariety(X)` accepts:

- a positive integer or `Gamma0(N)`, returning `J0(N)`;
- a sign-zero, cuspidal, weight-$2$ `ModularSymbolsSpace` over $\mathbf Q$,
  returning the corresponding embedded subvariety;
- a weight-$2$ trivial-character `NormalizedNewform`, returning the connected
  quotient $A_f$.

Unsupported weights, characters, signs, base fields, and group families fail
explicitly.  Products, arbitrary quotient ideals, polarizations, period
lattices, and analytic uniformizations are later slices.

### Abelian-variety methods

Every object supplies:

- `dimension()`, `level()`, `base_field()`, `group()`;
- `lattice()` and `homology(R=ZZ)`;
- `integral_homology()` and `rational_homology()`;
- `modular_symbols(sign=0)`;
- `hecke_matrix(n)`, `T(n)`, and exact Hecke characteristic polynomials;
- `decomposition()` into exact rational Hecke constituents;
- `newform()` on a newform quotient;
- `inclusion_map()` on an embedded subvariety;
- `quotient_map()` and `embedded_subvariety()` on a newform quotient.

The homology parent reports rank $2\dim A$ and exposes its basis matrix in the
ambient Manin-symbol coordinate space.  Its Hecke matrix is computed by exact
restriction or descent and is required to be integral on integral homology.

### Maps

A homology map stores an exact row-action matrix.  Thus a map
$H_1(A,\mathbf Z)\to H_1(B,\mathbf Z)$ of ranks $r$ and $s$ has an
$r\times s$ matrix $F$ and sends a row vector $x$ to $xF$.  It exposes
`domain()`, `codomain()`, `matrix()`, `kernel_lattice()`, `image_lattice()`,
and `verify()`.

For every tested Hecke operator, maps satisfy

$$
T_A F=F T_B.
$$

### Certificates and serialization

Durable SagePack serialization stores construction data, never mutable caches
or claimed derived matrices:

- `J0(N)` stores $N$;
- an embedded factor stores its defining modular-symbol subspace;
- $A_f$ stores its normalized newform packet.

Deserialization calls the public constructors, recomputes saturation,
constituent matching, quotient lattices, and maps, and rejects inconsistent
objects.  `serialization_certificate()` records the construction kind, exact
rank, defining Hecke signatures, and a replayable `verify()` result.  This is
mathematical authentication, not an unsafe pickle or an assertion that bytes
alone prove provenance.

## Constituent matching

A normalized newform in the current object layer is represented on one signed
modular-symbol constituent of dimension $d=[K_f:\mathbf Q]$.  Homology needs
the sign-zero isotypic constituent of dimension $2d$.  Sage.js matches it
exactly by requiring, for enough Hecke operators $T_n$, that

$$
\operatorname{charpoly}(T_n\mid W_f)
=\operatorname{charpoly}(T_n\mid M_f)^2.
$$

The candidate must lie in the full new submodule and be unique.  Matching uses
good and bad operators through a bounded Sturm-derived limit and refuses an
ambiguous result.  No numerical eigenvalue recognition or coefficient-field
embedding is used.

## Correctness invariants

Construction checks all of the following:

1. every defining modular-symbol space has weight $2$, sign $0$, trivial
   character, group $\Gamma_0(N)$, base ring $\mathbf Q$, and is cuspidal;
2. every lattice basis has rank $2\dim A$ and spans the declared rational
   modular-symbol subspace;
3. an embedded lattice is the full saturated intersection with the ambient
   integer coordinates;
4. inclusion matrices are integral and injective;
5. quotient matrices are integral and surjective, and their integer kernels
   are saturated;
6. every integral Hecke matrix really has integral entries and reproduces the
   ambient row action;
7. inclusion and quotient maps commute with representative Hecke operators;
8. decomposition dimensions sum to the parent dimension;
9. serialized objects replay these checks from construction data.

## Differential corpus

The pinned corpus covers:

- $J_0(11)$: dimension $1$ and $T_2=-2$ on homology;
- $J_0(37)$: two rational elliptic constituents;
- $J_0(43)$: dimensions $1+2$ and degree-$2$ newform coefficient field;
- $J_0(33)$: composite-level old/new behavior and nontrivial integral
  saturation;
- one level with a dimension-$3$ or larger rational newform constituent;
- zero-dimensional levels and invalid constructors.

Sage comparisons pin dimensions, saturated lattice ranks, decomposition
dimensions, and Hecke characteristic polynomials.  Magma comparisons pin
weight-$2$ cuspidal dimensions, newform packet degrees, and characteristic
polynomials.  Integral matrices are compared up to integral change of basis by
their characteristic polynomials and exact intertwining identities, not by
requiring identical implementation-dependent bases.

## Implementation layout

- `src/lib/sagejs/modular_abelian_varieties/`: lattice, homology, maps,
  constructors, quotient logic, and certificates;
- `src/baselib/modular.py`: only lazy public entry points;
- `tools/serialization-codecs/modular-forms.ts`: safe construction codecs;
- `test/modular-abelian-varieties.cjs`: public API and tamper/replay tests;
- `bench/modular/abelian-varieties/`: Sage and Magma differential scripts;
- `docs/modular-abelian-varieties.md`: guided user documentation.

All new mathematical Python remains ordinary CPython-parseable source and is
added to strict Pyright coverage.  This slice needs no new handwritten native
code: its heavy operations already cross the declared FLINT matrix boundary.

## Delivery order

1. Implement and test saturated lattice intersection independently.
2. Implement ambient `J0(N)`, homology parents, and integral Hecke action.
3. Implement embedded subvarieties and exact inclusion maps.
4. Match normalized newforms to sign-zero constituents and construct connected
   quotient lattices and quotient maps.
5. Add decomposition, certificates, and authenticated SagePack codecs.
6. Pin Sage/Magma differential fixtures, add the guided documentation, run the
   strict/build/test/architecture checks, and open the separate PR.

## Deferred work

The following are explicit later milestones rather than hidden placeholders:

- characters, $\Gamma_1(N)$, and coefficient fields other than $\mathbf Q$;
- modular abelian varieties of higher weight;
- products, intersections, sums, arbitrary Hecke ideals, and general
  morphism/Hom spaces;
- period lattices, polarizations, duals, modular degrees, congruence numbers,
  rational torsion, component groups, and Tamagawa numbers;
- optimality proofs beyond the connected saturated quotient constructed here.

The integral lattice and exact-map boundary in this slice is intentionally the
foundation on which those algorithms can be added without changing the public
representation.
