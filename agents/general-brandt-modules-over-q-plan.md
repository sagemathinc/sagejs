# General Brandt modules over $\mathbf Q$

## Objective

Provide

```python
B = BrandtModule(D, N)
```

for every definite rational quaternion discriminant $D$ and positive Eichler
conductor $N$ coprime to $D$, in weight two. Here $D$ is squarefree and has an
odd number of prime factors, because the quaternion algebra is also ramified
at the real place.

The implementation must separate two mathematically equivalent but
computationally different realizations:

1. the canonical basis of Eichler ideal classes, where Brandt matrices are
   sparse nonnegative neighbor matrices and the monodromy pairing is diagonal;
2. an exact Jacquet--Langlands realization, used both as an immediately useful
   general Hecke module and as an independent oracle for the ideal arithmetic.

It is never acceptable to label a modular-symbol basis as quaternion ideals.

## Exact general realization

Let $L=DN$. The rational Hecke module is realized as

$$
B(D,N)_{\mathbf Q}\simeq
\mathbf Q e_{\mathrm{Eis}}\oplus
S_2(\Gamma_0(L),\mathbf Q)^{D\text{-new}}.
$$

Sage.js already has exact weight-two modular symbols, exact degeneracy maps,
and $p$-new intersections. Starting with the positive-star cuspidal modular
symbols at level $L$, intersect the $p$-new submodules for every $p\mid D$.
For $(n,L)=1$, define

$$
T_n e_{\mathrm{Eis}}=\sigma_1(n)e_{\mathrm{Eis}}
$$

and use the restricted modular-symbol $T_n$ on the cuspidal summand. At a
ramified prime $p\mid D$, the Brandt Atkin--Lehner convention is

$$
W_p|_{\mathbf Qe_{\mathrm{Eis}}}=-1,
\qquad
W_p|_{S_2^{D\text{-new}}}=-U_p.
$$

Every $W_p$ must be proved involutive and the commuting good-Hecke actions
must agree with independent Magma characteristic polynomials.

This realization supplies immediately:

- all valid $D,N$ in weight two over $\mathbf Q$;
- exact dimensions;
- arbitrary composite good-index $T_n$;
- ramified Atkin--Lehner operators;
- Eisenstein and cuspidal subspaces;
- auxiliary-level new subspaces;
- exact Hecke/Atkin--Lehner decomposition; and
- a differential oracle for canonical ideal enumeration.

It does not supply ideal representatives, diagonal monodromy weights, or
nonnegative neighbor matrices. Those operations must fail explicitly.

## Canonical sparse realization

For prime $D=p\ge5$ and $N=1$, the supersingular module is already the
canonical ideal-class realization. Its basis consists of supersingular
$j$-classes, its $T_\ell$ are sparse isogeny-neighbor matrices, and $W_p$ is
minus Frobenius on $\operatorname{GF}(p^2)$.

The next arithmetic stage generalizes this backend:

1. construct a definite quaternion algebra over $\mathbf Q$ ramified exactly
   at the primes dividing $D$ and at infinity;
2. construct a maximal order and an Eichler order of conductor $N$;
3. enumerate locally principal right ideal classes with a proved stopping
   count supplied independently by the Jacquet--Langlands dimension;
4. test ideal equivalence by an exact reduced-norm lattice criterion;
5. enumerate the $\ell+1$ neighboring ideals for each good prime $\ell$;
6. compute unit groups of right orders and hence monodromy weights;
7. publish immutable ideal-class fingerprints and sparse Brandt matrices; and
8. compare every characteristic polynomial, decomposition, and
   Atkin--Lehner eigenspace with the general realization and Magma.

The ordinary Python source remains authoritative. A later measured kernel may
accelerate fixed-rank lattice enumeration or HNF reduction, but it must not
replace quaternion arithmetic with an opaque unrelated implementation.

## Public contract

The initial surface is:

```python
B.discriminant()
B.conductor()
B.level()
B.weight()
B.base_ring()
B.dimension()
B.realization()
B.canonical_ideal_basis_available()
B.basis()
B.T(n)
B.hecke_matrix(n)
B.W(q)
B.atkin_lehner_matrix(q)
B.eisenstein_subspace()
B.cuspidal_subspace()
B.new_subspace(p=None)
B.decomposition(bound=None, anemic=True)
```

Canonical-only operations are:

```python
B.right_ideals()
B.monodromy_weights()
B.pairing_matrix()
B.inner_product(x, y)
```

Until the ideal enumerator is active, the first method always fails for the
general realization and the pairing operations are available only for the
supersingular realization.

## Differential oracles

Magma is the primary independent general oracle:

```magma
B := BrandtModule(D, N : ComputeGrams := false);
Dimension(B);
CharacteristicPolynomial(HeckeOperator(B, ell));
CharacteristicPolynomial(AtkinLehnerOperator(B, p));
```

The fixed corpus includes prime and composite $D$, nontrivial $N$, dimensions
$1$, $2$, and larger, every ramified prime in a composite discriminant, and
both canonical and Jacquet--Langlands Sage.js realizations. SageMath is an
additional oracle where its more restricted prime-discriminant constructor
applies.

## Acceptance

- Every valid tested $D,N$ has the Magma dimension and good-Hecke
  characteristic polynomial.
- Every ramified $W_p$ has the Magma characteristic polynomial and satisfies
  $W_p^2=1$ exactly.
- Composite good indices satisfy Hecke multiplicativity and prime-power
  recurrences.
- The supersingular realization retains its sparse operator and exact mass
  invariants.
- The general realization never exposes false ideal data or a false canonical
  pairing.
- CPython parsing, strict typing, architecture checks, routine unit tests,
  native tests, and portable/Wasm tests remain green.
