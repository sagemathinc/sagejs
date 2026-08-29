---
title: "Mestre's method of graphs and sparse modular forms"
---

# Mestre's method of graphs and sparse modular forms

Sage.js implements Mestre's graph method as an operator-first exact
calculation. For prime level $p$, the basis consists of supersingular
$j$-invariants in characteristic $p$, and $T_\ell$ is the sparse weighted
adjacency operator of the supersingular $\ell$-isogeny multigraph. Every row
has sum $\ell+1$, while the exceptional vertices $j=0$ and $j=1728$ retain
their exact automorphism masses.

The same sparse operator and proof layer also drives two Hilbert modular-form
witnesses: the icosian construction over $\mathbf Q(\sqrt5)$ and a genuine
multi-ideal-class construction over $\mathbf Q(\sqrt3)$.

## Classical supersingular modules

The familiar Sage-style constructor is global in Sage mode:

```sage
sage: S = SupersingularModule(37)
sage: S.dimension()
3
sage: S.point_coordinates()
((8, 0), (20, 10), (23, 27))
sage: T2 = S.T(2)
sage: T2.is_sparse(), T2.nnz(), T2.row_sums()
(True, 7, (3, 3, 3))
sage: T2.matrix()
[1 1 1]
[1 0 2]
[1 2 0]
```

`T2` is an immutable CSR operator. Dense materialization is a bounded
compatibility operation, not its authoritative representation:

```sage
sage: T2 * vector(ZZ, [1, 2, 3])
(6, 7, 5)
sage: T2.apply_mod([1, 2, 3], 101)
(6, 7, 5)
sage: T2.apply_block([[1, 0, 0], [0, 1, 0]], 101)
[(1, 1, 1), (1, 0, 2)]
```

For a large module, request a sparse certificate rather than a dense matrix:

```sage
sage: S = SupersingularModule(10007)
sage: T2 = S.T(2)
sage: S.dimension(), T2.nnz()
(835, 2502)
sage: C = T2.wiedemann_certificate(1000003, projections=2, proof="replay")
sage: C.degree(), C.is_exact(), C.proof_method()
(835, True, 'full-degree-projection')
```

The last answer is exact, not probabilistic. A projected scalar recurrence
divides the operator minimal polynomial. Once its degree equals the full
dimension, both monic polynomials must agree. Lower-degree replay-only
certificates remain explicitly nonexact unless standard-basis annihilation is
also proved.

For exact integer characteristic polynomials, including repeated spectra, use
`characteristic_polynomial_certificate()`. It combines cyclic Wiedemann or
sparse power traces with Newton identities, then reconstructs over $\mathbf Z$
using CRT past a rigorous coefficient bound.

## Mestre reconstruction and Sturm verification

Rational simultaneous eigenpackets evaluate Mestre's identity directly in
$\operatorname{GF}(p^2)$:

```sage
sage: S = SupersingularModule(389)
sage: packet = S.rational_eigenpacket(-2)
sage: proof = packet.sturm_certificate()
sage: proof.bound(), proof.modular_symbols_dimension(), proof.is_exact()
(65, 32, True)
sage: proof.verify()
True
```

The certificate independently constructs the weight-two plus-cuspidal
modular-symbol line and checks every prime Hecke coefficient through the Sturm
bound $\lfloor(p+1)/6\rfloor$. Thus the level-$389$ expansion is checked
through $q^{65}$, not merely against a few table entries.

Higher-dimensional simple packets are reconstructed over exact number fields:

```sage
sage: S = SupersingularModule(67)
sage: R.<x> = PolynomialRing(QQ)
sage: packet = S.algebraic_eigenpacket(x^2 + 3*x + 1,
....:     check_primes=(3, 5, 7, 11), field_name="a")
sage: packet.q_expansion(12)
q + a*q^2 + (-a - 3)*q^3 + ... + (-2*a - 3)*q^11 + O(q^12)
sage: packet.sturm_certificate().verify()
True
```

At level $67$, both quadratic packets agree with pinned LMFDB newform data,
Magma's two Brandt-module algorithms, Mestre reduction at both residue roots,
and modular symbols through the Sturm bound.

## Expander graph view

The graph view preserves loops, edge multiplicities, and masses:

```sage
sage: G = SupersingularModule(389).isogeny_graph(2)
sage: G.order(), G.degree(), G.ramanujan_bound()
(33, 3, 2.8284271247461903)
sage: G.neighbors(0)
((26, 3),)
sage: G.vertex_mass(0)
1/3
```

`G.adjacency_operator()` returns the exact Brandt operator.
`G.normalized_adjacency_operator()` conjugates by the exact mass pairing for
ordinary symmetric spectral calculations. `spectrum()` and
`verify_ramanujan()` deliberately use a bounded dense oracle today; they fail
instead of implying a hidden dense computation beyond the requested entry
budget.

## Hilbert modular forms over $\mathbf Q(\sqrt5)$

The revived icosian engine uses a compact orbit table for

$$
R^\times\backslash\mathbf P^1(\mathcal O_F/\mathfrak N).
$$

For a split prime level, specify the rational prime and one root of
$x^2-x-1$ modulo it:

```sage
sage: from sagejs.modular_forms import HilbertModularFormsQsqrt5
sage: H = HilbertModularFormsQsqrt5((389, 238))
sage: H.dimension(), H.T(2).nnz(), H.T(2).row_sums()[0]
(7, 26, 5)
sage: H.T(2).matrix().charpoly().factor()
(x - 5) * (x^2 + 5*x + 5) * (x^4 - 3*x^3 - 3*x^2 + 10*x - 4)
```

Prime-power levels retain a compatible Hensel-lifted quaternion splitting:

```sage
sage: H2 = HilbertModularFormsQsqrt5((31, 19, 2))
sage: D = H2.degeneracy_map()
sage: (D.domain().dimension(), D.codomain().dimension(), D.matrix().rank())
(18, 2, 2)
sage: D.commutes_with_hecke(2)
True
```

Independently chosen lower splittings are rejected, since they do not define
the required adjacent-level degeneracy map.

## A multi-component field: $\mathbf Q(\sqrt3)$

The second field is not an alias for the icosian special case. Its quaternion
order has two right-ideal-class components:

```sage
sage: from sagejs.modular_forms import HilbertModularFormsQsqrt3
sage: H = HilbertModularFormsQsqrt3()
sage: H.dimension(), H.cuspidal_dimension(), len(H.ideal_class_components())
(4, 2, 2)
sage: H.cuspidal_matrix(2).charpoly()
x^2 - 2
```

The exponent-two level has dimension $18$. Its two degeneracy traces define
an exact old/new decomposition of dimensions $4$ and $12$ inside the
$16$-dimensional cuspidal quotient:

```sage
sage: H2 = HilbertModularFormsQsqrt3((13, 9, 2))
sage: D = H2.old_new_decomposition()
sage: (D.old_subspace().dimension(), D.new_subspace().dimension())
(4, 12)
```

The complete ambient and new-space Hecke packets agree with independent Magma
Hilbert modular-form computations.

## Correctness, caches, and portability

Published operators are checked for constant Hecke degree, exact mass
adjointness, the Eisenstein eigenvector, and pairwise commutativity. Classical
cache records bind the finite-field modulus, canonical point ordering,
modular-polynomial source, masses, CSR arrays, and a content digest; loading
revalidates every edge before publication.

The classical basis and cache path have exact native Node and authenticated
Wasm differential tests. The prime-field CSR Krylov kernels are
source-transparent `@native` functions with the same ordinary-Python bodies as
their fallback. No mathematical result relies on a host callback or an opaque
handwritten native algorithm.

## Benchmarks and independent oracles

Run the sparse benchmark with:

```bash
pnpm bench:modular:mestre:classical -- --repeat=3 --primes=389,10007
```

When Magma is installed, compare both of its independent Brandt algorithms:

```bash
MAGMA=/path/to/magma pnpm bench:modular:mestre:competitive -- \
  --repeat=3 --primes=37,389
```

The competitive receipt checks dimensions, row sums, and full characteristic
polynomials before reporting timing. It retains Magma's `gram-theta` and
`neighboring-ideals` labels, separates first and timer-resolved cached Hecke
calls, and samples peak process-tree RSS. Pinned offline fixtures additionally
bind Magma 2.18-5, LMFDB newforms at levels $37$ and $67$, historical psage
icosian matrices, and the $\mathbf Q(\sqrt3)$ Magma packets.

## Current boundaries

- Classical auxiliary level is $1$, and $p\geq5$ must be prime.
- General $T_\ell$ construction is bounded by an explicit modular-polynomial
  relation-size budget; large-index modular polynomials are not hidden behind
  an unbounded computation.
- Dense matrices and dense spectra have explicit entry limits.
- The $\mathbf Q(\sqrt5)$ engine supports its checked split-prime and
  split-prime-power envelope.
- The $\mathbf Q(\sqrt3)$ engine is the checked levels $13\mathfrak a$ and
  $(13\mathfrak a)^2$, not yet a constructor for arbitrary real quadratic
  fields and quaternion orders.

These limits are explicit so that a successful call always denotes the stated
mathematical object and proof contract.

## References

- SageMath's `SupersingularModule` and Brandt-module documentation.
- J.-F. Mestre and J. Oesterlé, the method of graphs for modular forms.
- Magma's Brandt-module Hecke operators and Hilbert modular forms handbook.
- L. Dembélé and J. Voight, *Explicit methods for Hilbert modular forms*.
- William Stein's psage icosian implementation over $\mathbf Q(\sqrt5)$.
