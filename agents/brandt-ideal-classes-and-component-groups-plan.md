# Integral Brandt modules and modular-Jacobian component groups

## Status

Implemented on `feature/general-brandt-modules` on 2026-08-28. The optional
quaternion ideal-class realization now covers every valid squarefree definite
discriminant $D$ and coprime Eichler conductor $N$. Exact orders, locally
principal right ideals, equivalence witnesses, unit weights, mass-certified
class enumeration, good Hecke operators, ramified Atkin--Lehner operators,
the saturated degree-zero monodromy lattice, and the full modular-Jacobian
component group are live.

The prime-discriminant oracle corpus agrees with SageMath by an explicitly
verified weighted graph isometry, and the composite cases $(30,7)$ and
$(66,5)$ agree exactly with Magma and the independent Jacquet--Langlands
backend. A source-pinned equal-contract SageMath/Magma/Sage.js benchmark
harness records construction and first-operator cost without disguising the
current pure exact-Python performance gap.

The newform-quotient constructor remains deliberately deferred exactly as
specified below: Sage.js does not yet have the audited integral modular-symbol
annihilator and modular-degree maps needed to certify every finite index. The
implemented `brandt_component_group(B)` is therefore explicitly the full
$J_0(pM)$ monodromy cokernel and never labels itself as a quotient result.

The initial prime-discriminant slice and the later composite-discriminant
phase have both landed. The existing Jacquet--Langlands realization remains
an independent exact spectral oracle throughout.

## Decision

Add an explicit realization:

```sage
B = BrandtModule(D, N, realization="ideal-classes")
```

Do not make ideal enumeration the default. The existing fast choices remain:

```sage
BrandtModule(D, N, realization="auto")
BrandtModule(D, N, realization="supersingular")
BrandtModule(D, N, realization="jacquet-langlands")
```

The intended dispatch is:

$$
\operatorname{BrandtModule}(D,N)\longrightarrow
\begin{cases}
\text{sparse supersingular graph},&D\text{ prime and }N=1,\\
\text{rational Jacquet--Langlands module},&\text{otherwise},
\end{cases}
$$

unless the caller explicitly requests `realization="ideal-classes"`.

This is a semantic choice, not merely a performance option. The ideal
realization supplies a distinguished integral class lattice and pairing that
the noncanonical rational realization cannot reconstruct.

## Mathematical objective

Let $A/\mathbf Q$ be the definite quaternion algebra ramified at infinity and
at the primes dividing the squarefree discriminant $D$. Let $\mathcal O$ be an
Eichler order of conductor $N$, with $\gcd(D,N)=1$. The integral Brandt module
is

$$
\mathcal B(D,N)=
\mathbf Z[\operatorname{Cl}(\mathcal O)],
$$

the free abelian group on the locally principal right $\mathcal O$-ideal
classes.

For $\gcd(n,DN)=1$, its Hecke action is

$$
T_n[I]=\sum_{J\subseteq I\atop I/J\text{ cyclic of norm }n}[J],
$$

with the exact left/right convention frozen in Phase 0. For a good prime
$\ell$, every class has $\ell+1$ neighbors, counted with multiplicity.

The rationalization must agree Hecke-equivariantly with the existing module

$$
\mathcal B(D,N)\otimes\mathbf Q
\simeq
\mathbf Q e_{\mathrm{Eis}}
\oplus
S_2(\Gamma_0(DN),\mathbf Q)^{D\text{-new}}.
$$

This agreement is a correctness oracle. It is not used to fabricate ideal
representatives or the integral pairing.

## Why the integral realization matters

The rational Hecke representation determines eigenvalues, rational
constituents, and Atkin--Lehner signs. It does not determine a Hecke-stable
$\mathbf Z$-lattice inside that representation. In particular, rationalizing
destroys:

- lattice indices and saturation data;
- Smith invariants and torsion cokernels;
- the integral monodromy pairing;
- automorphism weights of ideal classes;
- integral intersections with newform annihilator kernels; and
- the component groups obtained from those integral maps.

For a modular level $pM$ with $p\nmid M$, the toric character group at $p$ is
the degree-zero ideal-class lattice

$$
X_{J_0(pM),p}
\simeq
\mathcal B(p,M)^0
=
\left\{
\sum_i a_i[I_i]:\sum_i a_i=0
\right\}.
$$

The ideal-class pairing agrees, under the fixed normalization, with the
monodromy pairing. Thus

$$
\Phi_{J_0(pM),p}
\simeq
\operatorname{coker}
\left(
X_{J_0(pM),p}\longrightarrow X_{J_0(pM),p}^{\vee}
\right).
$$

For an optimal newform quotient $A_f$, the induced map on the $I_f$-part of
this lattice combines with the modular degree and a finite lattice index to
give $\#\Phi_{A_f,p}$. Frobenius acts through $-W_p$. These are integral
statements; the current rational backend alone cannot prove them.

## Public API

### Shared Brandt-module operations

The ideal realization must implement the existing exact surface:

```sage
B.discriminant()
B.conductor()
B.level()
B.dimension()
B.realization()
B.basis()
B.T(n)
B.W(q)
B.eisenstein_subspace()
B.cuspidal_subspace()
B.new_subspace()
B.decomposition()
```

`B.realization()` returns `"eichler-ideal-classes"` for the new backend.

### Integral and quaternionic operations

The new realization additionally supplies:

```sage
B.quaternion_algebra()
B.maximal_order()
B.eichler_order()
B.right_ideals()
B.class_fingerprints()
B.monodromy_weights()
B.pairing_matrix()
B.inner_product(x, y)
B.degree_zero_submodule()
B.mass()
B.mass_certificate()
```

The basis element `B.i` denotes the class of the corresponding returned
right ideal. Ideal representatives themselves are deterministic but not
mathematically canonical; the integral free module on their classes is
canonical up to permutation and isometry.

### Component-group operations

Component groups should live in a separate consumer module rather than make
`BrandtModule` own modular-abelian-variety semantics. The first proposed
surface is:

```sage
X = B.degree_zero_submodule()
C = brandt_component_group(B)
C.abelian_group()
C.invariant_factors()
C.frobenius_matrix()

Q = modular_newform_component_group(level=p*M, prime=p, constituent=...)
Q.order()
Q.abelian_group()
Q.certificate()
```

The second constructor is deferred until the integral modular-symbol
annihilator, modular degree, and saturation contracts are audited. No API may
infer a quotient from a characteristic polynomial alone when several
constituents share it or an integral Hecke algebra is not monogenic.

## Representation contracts

### Quaternion algebra

An element of $A=(a,b)_{\mathbf Q}$ uses four exact rational coordinates in
the fixed basis $1,i,j,ij$. The implementation provides multiplication,
conjugation, reduced trace, and reduced norm as ordinary CPython-parseable
Python. The algebra constructor verifies its finite ramification set exactly,
including the place above $2$, and rejects a Hilbert-symbol mismatch.

### Orders

A quaternion order is a rank-four $\mathbf Z$-lattice in $A$, stored by a
normalized rational basis matrix with a positive common denominator. Every
published order verifies:

- it contains $1$;
- its basis is closed under multiplication;
- its discriminant and reduced discriminant are exact;
- its local level is the requested Eichler level; and
- its ambient quaternion algebra and orientation metadata agree.

The first slice may use explicit rational constructions specialized to prime
$D$ where they are simpler, but the public representation must not encode
prime discriminant as a permanent assumption.

### Right ideals

A right ideal is a rank-four rational lattice in the same ambient algebra,
with immutable HNF-normalized coordinates. Publication verifies

$$
I\mathcal O\subseteq I
$$

and the requested local-principality conditions. The object records its left
and right orders, norm, denominator, and a content digest. Caller mutation of
input matrices cannot alter a published ideal.

Equality of stored lattices and equivalence of ideal classes are distinct
operations. `I == J` means equal normalized lattices; `I.is_equivalent(J)`
solves the exact ideal-class problem.

## Class enumeration algorithm

### Exact mass target

For the intended normalization

$$
w_i=\#\mathcal O_L(I_i)^\times/\{\pm1\},
$$

the discovered ideal classes must satisfy the Eichler mass formula

$$
\sum_i\frac1{w_i}
=
\frac1{12}
\prod_{p\mid D}(p-1)
\cdot
N\prod_{q\mid N}\left(1+\frac1q\right).
$$

Phase 0 must confirm this normalization against the current supersingular
weights, SageMath, Magma, and the component-group papers. If a source uses
full unit groups instead of units modulo the center, adapters convert at the
oracle boundary; the public convention does not drift by a hidden factor of
$2$.

Since every missing class contributes positive mass, exact equality gives a
completion certificate. The Jacquet--Langlands dimension and the Eichler
class-number formula are independent cross-checks, but neither silently
replaces the mass proof.

### Neighbor traversal

Start with the class of $\mathcal O$. For a deterministic increasing sequence
of good primes $q\nmid DN$:

1. compute the $q+1$ local cyclic right subideals of every frontier ideal;
2. normalize each candidate lattice;
3. reject exact duplicate lattices cheaply;
4. use theta fingerprints and local invariants only as negative filters;
5. run an exact ideal-equivalence proof against surviving representatives;
6. publish genuinely new classes and their left-order unit weights; and
7. stop only when the exact discovered mass equals the target mass.

The chosen neighbor theorem and connectivity hypotheses must be cited in the
implementation. If one fixed $q$ is not proved sufficient for a requested
order, the algorithm expands its good-prime set; it does not rely on an
empirical graph appearing connected.

### Exact ideal equivalence

For locally principal right ideals $I$ and $J$, equivalence is reduced to an
exact norm-representation problem in the appropriate connecting lattice
formed from $I$ and $\overline J$. The implementation may use truncated theta
series or reduced Gram matrices as filters, but a positive answer requires an
explicit quaternion $\alpha$ and exact replay of

$$
I=\alpha J
$$

after normalization. A negative answer requires a proven enumeration bound,
not failure to find a short vector within a heuristic search radius.

The first implementation should follow SageMath's prime-discriminant method
where applicable and the Kirschmer--Voight definite enumeration algorithm for
the general proof structure. Sage.js and SageMath are both GPL-3.0 projects;
any directly adapted code retains source-level attribution and provenance.

### Unit weights

Because $A$ is definite, the unit group of a left order is finite. Enumerate
the exact vectors of reduced norm $1$ in its positive-definite norm lattice,
replay closure and inverses, and quotient by the central units $\{\pm1\}$.
This produces $w_i$ and the diagonal pairing

$$
\langle[I_i],[I_j]\rangle=\delta_{ij}w_i.
$$

The degree-zero restriction is represented by an explicit saturated integral
basis; its Gram matrix and cokernel are computed with exact HNF/SNF.

## Brandt operators

For a good prime $\ell\nmid DN$, enumerate the $\ell+1$ cyclic neighbors of
each representative $I_i$, classify every neighbor against the completed
class set, and form a sparse nonnegative integral matrix. Before publication,
prove:

- every row sum is $\ell+1$;
- every entry is a nonnegative integer;
- the operator preserves the integral class lattice;
- mass adjointness

  $$
  (T_\ell)_{ij}w_j=w_i(T_\ell)_{ji};
  $$

- the Eisenstein vector has eigenvalue $\ell+1$;
- independently constructed good Hecke operators commute; and
- the complete characteristic polynomial equals the Jacquet--Langlands
  oracle.

Composite good indices use multiplicativity and

$$
T_{\ell^r}=T_\ell T_{\ell^{r-1}}-\ell T_{\ell^{r-2}}.
$$

Ramified $W_p$ is constructed from the appropriate two-sided ideal or order
normalizer and must be an integral permutation/isometry of the class lattice.
Its rational action must agree with $-U_p$ on the Jacquet--Langlands cusp
space. Operators at primes dividing the Eichler conductor remain a separate
phase with their own local correspondence; they are not inferred from a good
prime recurrence.

## Component-group vertical slice

The first end-to-end arithmetic witness is

```sage
B = BrandtModule(37, 2, realization="ideal-classes")
X = B.degree_zero_submodule()
```

This case has dimension $9$, is covered by SageMath and Magma, and corresponds
to the character lattice at $37$ for $J_0(74)$. Acceptance requires:

1. nine distinct, exactly verified right ideal classes;
2. exact agreement of the mass and unit-weight multiset;
3. a full $T_3$ matrix equivalent to SageMath's under an explicitly found
   permutation/isometry;
4. the existing Jacquet--Langlands $T_3$ characteristic polynomial;
5. an exact rank-eight saturated degree-zero lattice;
6. its integral monodromy Gram matrix and Smith invariants;
7. the ramified Atkin--Lehner action and the corresponding $-W_{37}$
   Frobenius action; and
8. reproduction of at least one published component-group order for a
   newform quotient of $J_0(74)$ once the modular-degree consumer is live.

Before the quotient consumer is implemented, the full $J_0(74)$ monodromy
cokernel is still a meaningful accepted deliverable. It must not be labeled as
the component group of a particular newform quotient.

## Phases

### Phase 0: Freeze conventions and oracle corpus

- Record left/right ideal, transpose, norm, mass, and $W_p$ conventions.
- Generate exact SageMath and Magma records for
  $(D,N)=(11,1),(11,2),(37,2),(11,5),(389,1)$.
- Record ideal lattices where stable, but compare class sets by invariant and
  graph isomorphism rather than assuming identical representatives.
- Pin the Kohel--Stein low-level component-group rows used later.
- Add adversarial fixtures for the factor-of-two mass convention, transpose
  convention, and a duplicated equivalent ideal.

Exit: a written schema and reproducible oracle generators; no arithmetic code
is accepted before the conventions are executable tests.

### Phase 1: Rational quaternion algebras and orders

- Implement ordinary exact quaternion elements over $\mathbf Q$.
- Construct and certify the required maximal and Eichler orders.
- Add exact local ramification and level checks, including $2$.
- Differential-test multiplication, trace, norm, discriminants, and order
  bases against SageMath and Magma.

Exit: the $(37,2)$ Eichler order is independently certified and portable.

### Phase 2: Ideals, equivalence, and unit groups

- Implement immutable normalized right ideals.
- Implement product, conjugate, inverse/colon operations required by the
  equivalence criterion.
- Implement exact norm-lattice enumeration with proof bounds.
- Return explicit witnesses for positive ideal equivalence.
- Enumerate and certify left-order unit groups and weights.

Exit: all oracle ideals replay, equivalent rescalings are recognized, and
near-miss lattices fail closed.

### Phase 3: Prime-discriminant class enumeration

- Implement deterministic good-prime neighbor traversal.
- Certify completeness through the Eichler mass formula.
- Publish stable class fingerprints and enumeration receipts.
- Close the $(37,2)$ nine-class witness and a prime-power conductor witness.

Exit: class count, mass, weights, and class graph agree with both external
systems throughout the prime-discriminant corpus.

### Phase 4: Integral Hecke and pairing

- Publish sparse good-prime Brandt matrices through the existing
  `FiniteHeckeSet` contract where it fits without losing ideal metadata.
- Implement ramified Atkin--Lehner permutations.
- Implement the saturated degree-zero lattice and restricted pairing.
- Differential-test complete matrices up to basis permutation and complete
  characteristic polynomials exactly.

Exit: the ideal backend satisfies the shared `BrandtModule` API and all
integral invariants.

### Phase 5: Component groups

- Audit the integral modular-symbol lattice and newform-annihilator API.
- Compute the modular degree through an independent exact lattice map.
- Construct $X[I_f]$, the induced monodromy map $\alpha_f$, and every finite
  index in the component-group formula.
- Use SNF to return the full finite abelian group, not just its order.
- Attach the $-W_p$ Frobenius action.
- Reproduce published low-level tables and selected large-prime examples.

Exit: one $J_0(74)$ quotient and a varied small-level corpus agree with the
published component-group orders, with replayable certificates.

### Phase 6: Composite discriminants

- Generalize maximal/Eichler order construction and class enumeration to
  squarefree $D$ with any odd number of prime factors.
- Use the Kirschmer--Voight mass-certified algorithm rather than extending a
  prime-only formula by pattern matching.
- Close the existing Magma corpus at $(30,7)$ and $(66,5)$ with genuine ideal
  classes and pairings.

Exit: every valid checked $(D,N)$ supports both the fast rational realization
and the genuine integral ideal realization.

### Phase 7: Performance and portability

- Profile class enumeration, ideal equivalence, norm-vector enumeration, HNF,
  and operator assembly separately.
- Keep ordinary Python authoritative and use the accepted exact native
  workspace only for measured fixed-rank coordinate recurrence or bounded
  lattice enumeration.
- Do not introduce a new capsule registry, arena, or hidden handwritten
  quaternion algorithm.
- Add authenticated caches keyed by $D,N$, order basis, convention version,
  ideal fingerprints, weights, and source/toolchain identity.
- Exercise native Windows x64 and portable Wasm or declare an explicit
  capability boundary with a tested dynamic fallback.

Exit: a reproducible SageMath/Magma/Sage.js receipt reports equal mathematical
work and labels lazy construction, first operator, cached operator, memory,
and class-enumeration costs separately.

## Correctness and adversarial tests

Every phase includes ordinary CPython, generated JavaScript, and available
native/Wasm differentials. The adversarial corpus must include:

- invalid or indefinite discriminants;
- noncoprime conductor;
- a wrong maximal-order or Eichler-level basis;
- an order not closed under multiplication;
- a lattice that is a right module but not locally principal;
- equal lattices represented with different denominators and bases;
- equivalent but unequal ideals;
- ideals with matching short theta prefixes that are inequivalent;
- an equivalence candidate without a replayable connecting quaternion;
- duplicated classes that would falsely satisfy a class-number count;
- a mass sum off by a factor of $2$;
- a transposed Brandt matrix with the correct characteristic polynomial;
- a wrong unit weight that breaks mass adjointness;
- incomplete neighbor traversal;
- caller mutation after publication;
- cache records with changed order, convention, or source identity; and
- a rationally correct but integrally unsaturated newform kernel.

Characteristic-polynomial agreement alone never certifies an integral
realization.

## Performance contract

The competitive harness reports, for each $(D,N,\ell)$:

- quaternion/order construction;
- ideal-class enumeration;
- first $T_\ell$ construction;
- repeated cached $T_\ell$ access;
- exact characteristic polynomial outside and inside timing as separate rows;
- class count, mass, weight multiset, row sums, pairing digest, and operator
  digest;
- process-cold and resident timings;
- peak RSS; and
- source, runtime, SageMath, and Magma versions.

SageMath is equal-contract for prime $D$ because it constructs the same kind
of right ideals. Magma is the general equal-contract oracle. The current
Jacquet--Langlands backend is a same-spectrum internal baseline, not an
equal-cost ideal-enumeration competitor.

No result is called faster merely because it omits ideal enumeration,
pairing, or exact class-completion proof.

## Architecture and likely source layout

The implementation should keep reusable quaternion arithmetic separate from
modular-form consumers. A likely layout is:

```text
src/lib/sagejs/quaternion_algebras/
  algebra.py
  orders.py
  ideals.py
  class_set.py

src/lib/sagejs/modular_forms/
  brandt.py
  brandt_ideal.py
  component_groups.py
```

Reuse the exact matrix HNF/SNF layer and the existing sparse Hecke publisher.
Do not put general quaternion types inside the Brandt module or encode them as
opaque JavaScript objects. Mathematical `.py` files remain ordinary
CPython-parseable source and enter strict typing as they are completed.

Any native acceleration follows `ARCHITECTURE.md`: readable Python first,
source-transparent `@native` second, mature libraries third, and handwritten
native code only for a measured documented representation limitation.

## Acceptance criteria

The prime-discriminant ideal backend is accepted only when all of the
following hold:

- `realization="ideal-classes"` returns genuine, exactly verified right ideal
  representatives.
- The class enumeration has a replayable exact mass-completion certificate.
- Unit weights and pairing conventions match SageMath, Magma, and the
  supersingular specialization.
- Good-prime Brandt matrices agree with SageMath up to an explicitly verified
  class permutation, not merely by characteristic polynomial.
- Full characteristic polynomials and Atkin--Lehner eigenspaces agree with
  the independent Jacquet--Langlands backend.
- The $(37,2)$ degree-zero lattice and monodromy cokernel are exact and
  saturated.
- Unsupported bad-prime or newform-quotient operations fail with precise
  capability errors; composite discriminants are fully supported.
- Focused tests, strict Python, architecture checks, unit, native, portable,
  documentation, and cross-platform gates pass.
- A durable equal-contract competitive receipt is checked in.

The component-group consumer is accepted only when it reproduces published
orders and full group structures from independently constructed integral
maps. It must record when a paper supplies only an order and therefore cannot
serve as an oracle for invariant factors.

## Non-goals for the first slice

- arbitrary totally real base fields;
- indefinite quaternion algebras;
- noninvertible ideals of arbitrary orders;
- higher-weight coefficient modules;
- bad-prime operators at primes dividing the Eichler conductor;
- claiming canonical ideal representatives rather than a canonical class
  lattice up to permutation;
- automatically paying ideal-enumeration cost for spectral-only calls; and
- replacing the current sparse supersingular graph where it is already the
  best realization.

## References and provenance

- [SageMath, `sage.modular.quatalg.brandt`](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/quatalg/brandt.html):
  prime-discriminant Eichler orders, right ideal classes, direct neighbors,
  theta filters, and Brandt matrices.
- Markus Kirschmer and John Voight,
  [*Algorithmic enumeration of ideal classes for quaternion orders*](https://arxiv.org/abs/0808.3833),
  including its published corrigendum.
- John Voight, *Quaternion Algebras*, especially ideal classes, Eichler mass,
  neighbors, and Brandt matrices.
- David Kohel and William Stein,
  [*Component Groups of Quotients of $J_0(N)$*](https://wstein.org/papers/ants/kohel_stein.pdf).
- Brian Conrad and William Stein,
  [*Component Groups of Purely Toric Quotients of Semistable Jacobians*](https://wstein.org/papers/compgrp/).
- [Magma's Brandt-module handbook](https://docs.magma-maths.org/ModularArithmeticGeometry/BrandtModules/ModBrdt:brandt-modules.html)
  and quaternion ideal-class entries, used as an independent executable
  oracle rather than an implementation source.
- The existing Sage.js plans
  `agents/general-brandt-modules-over-q-plan.md` and
  `agents/mestre-method-of-graphs-sparse-modular-forms-plan.md`.
