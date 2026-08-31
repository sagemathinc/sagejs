# Modular forms roadmap and completion checklist

![Abstract landscape of modular-form algorithms and spaces](assets/modular-forms-landscape.png)

## Purpose

This file is the durable capability checklist for modular forms in Sage.js.
It compares the current implementation with functionality available in
SageMath, psage, Magma, and PARI/GP, and gives each missing area an explicit
definition of done.

The next foundation milestone is **general exact $q$-expansion bases by two
independent routes**:

1. reconstruction from exact modular symbols and their Hecke action; and
2. constructive formulas for known modular forms, followed by exact
   $q$-expansion arithmetic and certified spanning.

These routes overlap for many classical integral-weight spaces and should be
differential oracles there. They are not interchangeable: the constructive
route also opens half-integral weights and other spaces for which classical
modular symbols are not the natural engine. The selected
supersingular/Brandt eigenpacket reconstruction already in Sage.js is another
valuable oracle and prototype, but it is not a substitute for either general
classical API.

### Checklist convention

- `[x]` means the capability is implemented and has focused regression tests.
- `[ ]` means work remains. A heading is checked only after all of its required
  acceptance items are checked.
- A capability described as partial retains separate checked foundation items
  and unchecked completion items; partial support is never counted as complete.
- Performance claims require an equal-contract receipt against the named
  comparison system. Correctness alone does not imply competitiveness.
- The checklist describes mathematical capabilities, not parity with every
  incidental method name in another system.

## Current Sage.js foundation

- [x] Exact dimension formulas for implemented classical congruence-subgroup
  cases.
- [x] Public `ModularForms(Gamma0(N), k)` ambient spaces over $\QQ$ with
  dimension and cusp/Eisenstein subspace dimensions.
- [x] Eisenstein $q$-expansions at level $1$ and prime $\Gamma_0$ level.
- [x] Exact modular-symbol presentations for broad $\Gamma_0$, $\Gamma_1$,
  and Dirichlet-character cases in weights at least $2$.
- [x] Signs, boundary maps, cuspidal submodules, rational paths, diamond
  operators in supported character spaces, and exact Hecke matrices.
- [x] Composite-index Hecke operators, bad-prime $U_p$ operators in supported
  modular-symbol spaces, simple decomposition, and trivial-character new
  submodules.
- [x] Weight-$2$ rational Brandt modules for definite squarefree discriminant
  and coprime Eichler conductor.
- [x] Jacquet--Langlands, supersingular, and integral quaternion-ideal-class
  realizations in their documented domains.
- [x] Sparse Hecke operators, certified Wiedemann/minimal-polynomial methods,
  and exact sparse characteristic-polynomial reconstruction.
- [x] Selected rational and algebraic supersingular eigenpacket
  $q$-expansions with independent Sturm verification.
- [x] Full modular-Jacobian component groups in the implemented Brandt domain.
- [x] Specialized Hilbert modular-form slices over $\QQ(\sqrt5)$ and
  $\QQ(\sqrt3)$.
- [x] Exact Newman--Ligozat-certified eta products and holomorphic eta
  quotients, including cusp orders, Kronecker characters, and bounded formula
  registry enumeration.

## P0: general $q$-expansion bases by two engines

### Recommended execution order

- [x] Slice 1: exact modular-form expansion metadata and arithmetic, followed
  by $E_4$, $E_6$, $\Delta$, and certified level-$1$ bases.
- [x] Slice 2: general $\Gamma_0$ trivial-character cusp bases from modular
  symbols, beginning with weight $2$ and then arbitrary $k\geq2$.
- [x] Slice 3: one shared public `q_expansion_basis(..., algorithm=...)` API and
  exact P0A/P0B span comparison on their overlap.
- [x] Slice 4: coefficient fields, normalized newforms, and composite-level
  old/new spaces.
- [x] Slice 5: general Eisenstein-character formulas and character-valued
  modular-symbol reconstruction.
- [x] Slice 6: theta/Cohen constructions and the first certified
  half-integral-weight spaces.
- [x] Slice 7: exact Kohnen-plus coefficient kernels and certified cuspidal
  Shimura lifts in the initial trivial-character target domain.
- [x] Slice 8: certified eta products and eta quotients with a bounded
  constructive-formula registry.

### Outcome

- [x] For every modular-symbol space in the declared P0A domain, construct an
  exact basis of cusp-form $q$-expansions to caller-selected precision.
- [x] For every formula-generated space in the declared P0B domain, construct
  an exact basis or certified subspace using known forms and $q$-expansion
  arithmetic.
- [x] Reconstruct normalized newforms and their coefficient fields from exact
  simple Hecke constituents.
- [x] Expose the result through the ordinary Sage-compatible `ModularForms`
  and `ModularSymbols` APIs rather than only through Brandt-specific packet
  objects.
- [x] Expose explicit `modular_symbols`, `formulas`, and receipt-backed `auto`
  algorithm choices where both routes make sense.
- [x] Prove each returned basis or subspace correct
  through an appropriate dimension theorem, Sturm bound, or equally explicit
  certificate. Normalized eigenform reconstruction remains Slice 4.

### Initial mathematical domain

- [x] $\Gamma_0(N)$ with trivial character, $k\geq2$, over $\QQ$.
- [x] All signs of the corresponding modular-symbol spaces, with documented
  handling of the common modular-form image of the sign spaces.
- [x] Ambient cuspidal, new, old, and simple Hecke subspaces.
- [x] Composite levels, including repeated prime factors and bad-prime
  operators.
- [x] Dirichlet-character cusp spaces over their exact cyclotomic value
  fields, including full sign-zero and directly constructed signed spaces;
  arbitrary proper sign-zero subspaces remain excluded.
- [ ] $\Gamma_1(N)$ via its exact character decomposition or an equally
  audited direct construction.
- [ ] A declared bounded domain for weight $1$, or an explicit fail-closed
  exclusion until the weight-$1$ project is complete.

### P0A: reconstruction from modular symbols

- [x] Specify the exact modular-symbol/form duality and row/column conventions
  used to turn Hecke actions into coefficient functionals.
- [x] Construct $a_n$ as exact linear functionals for every
  $1\leq n\leq B$, where $B$ is the relevant Sturm bound.
- [x] Produce a canonical row-reduced cusp basis with deterministic ordering
  and normalization.
- [x] Extend coefficients beyond the Sturm bound using exact Hecke actions,
  multiplicativity, and prime-power recurrences where valid.
- [x] Handle $U_p$ coefficients at primes dividing the level without applying
  a good-prime recurrence incorrectly.
- [x] Construct coefficient fields from irreducible Hecke factors using exact
  defining polynomials and deterministic embeddings of Hecke eigenvalues.
- [x] Prove simultaneous eigenvector/eigenvalue compatibility for enough
  commuting Hecke operators to certify each newform packet.
- [x] Normalize each eigenform by $a_1=1$ and reject spaces where this cannot
  be certified.
- [x] Detect and represent Galois-conjugate forms without choosing numerical
  roots prematurely.
- [x] Preserve integral coefficients or a coefficient order when the exact
  Hecke data proves one, rather than needlessly publishing only a fraction
  field.
- [x] Cache Hecke matrices and use their authenticated parent identity;
  coefficient-functional, decomposition, and newform caches remain part of
  later slices.
- [x] Cache coefficient functionals, decompositions, and
  reconstructed coefficients with authenticated parent/space identity.
- [x] Keep construction transactional: cancellation or failure must not
  publish a partial basis or poison a cache.

### P0B: construction from formulas and $q$-expansion arithmetic

This is a separate mathematical engine, not merely a collection of convenient
constructors. It generates candidate modular forms with proved metadata,
combines them using exact arithmetic, and certifies the span from sufficiently
many coefficients and an independently known dimension.

#### Exact $q$-expansion algebra

- [x] Define a first-class exact modular-form expansion carrying weight,
  level, character, coefficient ring, valuation, precision, and provenance.
- [x] Implement exact addition and scalar multiplication with strict parent
  compatibility.
- [x] Implement products with certified weight addition, character
  multiplication, and a correct common level.
- [x] Implement powers and bounded products without losing exact truncation
  semantics.
- [x] Implement $V_d:f(q)\mapsto f(q^d)$ and the resulting oldform metadata.
- [x] Implement twists by Dirichlet characters with certified resulting
  level and character in a declared initial domain.
- [x] Distinguish a proved modular form from a bare power series; arbitrary
  coefficient lists must never acquire modularity metadata by assertion.
- [x] Track absolute and relative precision through every operation and reject
  a rank or membership conclusion when the available precision is
  insufficient.
- [ ] Canonically coerce compatible exact coefficient rings without silently
  selecting a numerical embedding.

#### Formula families

- [x] General Eisenstein series $E_k(\chi,\psi)$, including exact generalized
  Bernoulli constant terms and the correct parity/conductor conditions.
- [x] Primitive and imprimitive inputs for $E_k(\chi,\psi)(q^t)$, with exact
  cyclotomic coefficients, reduction to primitive inducing characters,
  generalized Bernoulli constant terms, parity rejection, and fail-closed
  exclusion of the quasimodular $E_2(1,1)$ case.
- [x] Degeneracy images of certified Eisenstein and cusp forms at higher
  levels, with exact $V_d$ metadata.
- [x] Level-$1$ generators $E_4$, $E_6$, and $\Delta$, with the relation
  $E_4^3-E_6^2=1728\Delta$ checked exactly.
- [x] Eta products and quotients in a declared domain with a proof of
  holomorphy at every cusp, rather than only a formal product expansion.
- [ ] Theta series of integral quadratic forms with proved weight, level, and
  character.
- [x] Unary theta series and the initial half-integral-weight building blocks.
- [x] Cohen Eisenstein series or another audited construction sufficient for
  the initial half-integral-weight corpus.
- [x] A registry of formula families recording literature/software
  provenance, applicability predicates, and mathematical certificates.

#### Certified span and basis selection

- [x] Generate a finite, deterministic candidate family for the requested
  weight, level, and character under explicit work bounds.
- [x] Compute an exact coefficient matrix through a certified bound and select
  a canonical independent subset by exact row reduction.
- [x] Compare the candidate rank with an independently computed dimension;
  publish a full basis only when equality is proved.
- [x] When candidates do not span the ambient space, return an explicitly
  labeled certified subspace rather than calling it a basis.
- [x] Separate Eisenstein and cuspidal candidates using exact constant terms
  at all required cusps or another audited criterion.
- [x] Certify old/new placement using degeneracy maps and Hecke data where
  available.
- [x] Recover Hecke-stable subspaces and eigenforms from the constructed span
  without assuming that the chosen formula generators are eigenforms.
- [x] Make formula search deterministic and bounded; no unbounded enumeration
  of eta products, theta lattices, or products is allowed in `auto` mode.

#### Initial P0B domain

- [x] Full level-$1$ integral-weight spaces from $E_4$ and $E_6$.
- [ ] Eisenstein spaces for general implemented $\Gamma_0(N)$ and Dirichlet
  characters.
- [x] A composite-level integral-weight corpus where Eisenstein series,
  degeneracy, products, eta forms, or theta series produce a complete space.
- [x] A corpus where formulas prove only a proper subspace, exercising honest
  partial-span behavior.
- [x] Initial half-integral-weight spaces generated by theta/Cohen formulas,
  with dimensions and Hecke data checked independently.
- [x] Kohnen plus spaces from exact forbidden-coefficient kernels, including
  replayable conservative Sturm certificates.
- [x] Exact cuspidal Shimura coefficient lifts for positive squarefree $t$,
  with trivial-character target coordinates and $T_{p^2}\leftrightarrow T_p$
  checks.
- [ ] Shimura lifts for Eisenstein inputs, fundamental-discriminant aliases,
  and certified nontrivial-character target spaces.

### P0A/P0B interaction

- [x] Treat the two engines as independent implementations: neither may use
  the other's returned basis as its internal proof of correctness.
- [x] On overlapping integral-weight spaces, compare their exact spans through
  the Sturm bound after canonical coefficient-field coercion.
- [x] Use modular symbols to identify missing cusp directions when a formula
  candidate family spans only a proper subspace, while retaining that honest
  P0B result.
- [x] Use formula-generated forms as independent oracles for modular-symbol
  normalization, sign conventions, character embeddings, and bad-prime
  coefficients.
- [x] Let `algorithm="auto"` choose only from receipt-backed domains; explicit
  algorithms remain available for research and differential testing.

### Public API

- [x] Implement
  `ModularForms(...).cuspidal_subspace().q_expansion_basis(prec,
  algorithm=...)`.
- [x] Implement `q_expansion_basis(..., algorithm="formulas")` on every
  declared constructive space and return a certified-subspace object when the
  formulas do not span the ambient space.
- [x] Implement `ModularForms(...).new_subspace()` and
  `ModularForms(...).old_subspace()` in the initial domain.
- [x] Implement `ModularForms(...).newforms(...)` and top-level
  `Newforms(...)` with deterministic Galois-orbit ordering.
- [x] Implement a first-class normalized newform element exposing `level()`,
  `weight()`, `character()`, `base_ring()`, `coefficient_field()`,
  `q_expansion(prec)`, and coefficient access.
- [ ] Implement Hecke and Atkin--Lehner eigenvalue access where the operator is
  defined and certified.
- [x] Make returned $q$-expansions ordinary Sage.js power-series elements over
  the exact coefficient field.
- [x] Expose the provenance and verification certificate for every
  formula-generated form and basis.
- [x] Support serialization with authenticated reconstruction of the parent,
  coefficient field, normalization, and precision.
- [ ] Define equality and hashing from mathematical identity, not display
  precision or a chosen complex embedding.
- [ ] Document deliberate differences from SageMath, PARI, or Magma.

### Correctness corpus

- [x] Cover level $1$ forms including $\Delta\in S_{12}(\mathrm{SL}_2(\ZZ))$.
- [x] Independently construct the level-$1$ basis through both modular symbols
  and the exact $\QQ[E_4,E_6]$ formula algebra.
- [x] Cover rational weight-$2$ newforms at prime and composite levels.
- [x] Cover a higher-weight trivial-character space of dimension greater than
  one.
- [x] Cover quadratic and higher-degree coefficient fields.
- [x] Cover nontrivial primitive and imprimitive Dirichlet characters.
- [x] Cover old/new decompositions at levels $p$, $p^2$, $pq$, and a level
  with several degeneracy sources.
- [x] Cover a repeated anemic eigensystem that must be separated using bad
  primes or additional operators.
- [x] Cover exact Eisenstein series with nontrivial characters and compare
  generalized Bernoulli constant terms.
- [x] Cover eta-product bases with independently verified Newman congruences,
  cusp behavior, character, exact expansions, and ambient dimensions.
- [ ] Cover quadratic-theta-series bases with independently verified cusp
  behavior and dimensions.
- [x] Cover at least one half-integral-weight space, Kohnen-relevant example,
  and formula-derived Hecke comparison without pretending modular symbols are
  the construction engine.
- [x] Cover a formula family whose rank is strictly smaller than the ambient
  dimension and verify that it is returned only as a certified subspace.
- [x] Check every coefficient through the Sturm bound against an independent
  implementation.
- [x] Check selected coefficients beyond the Sturm bound by independent Hecke
  recurrences and direct comparison.
- [x] Differentially compare exact bases and newform packets with SageMath,
  PARI/GP, and Magma on a pinned corpus.
- [ ] Compare normalized eigenvalues with pinned LMFDB records where labels
  and coefficient-field embeddings are unambiguous.
- [ ] Add adversarial tests for wrong signs, wrong character parity, insufficient
  precision, nonsemisimple reductions, repeated factors, and coefficient-field
  embedding confusion.

The pinned P0 differential receipt lives in
`bench/modular/qexp-correctness/pinned-corpus.json`. Its current rows cover
level $1$, prime and composite levels, a nontrivial character, old/new spaces
at $p$, $p^2$, $pq$, and $2\cdot3\cdot11$, bad-prime separation, quadratic
and cubic coefficient fields, exact full/proper formula comparisons, and
beyond-Sturm prime-power recurrences. SageMath, Magma, and PARI independently
replay the pins. Every pinned rational row-space hash includes all
coefficients through a precision strictly beyond the applicable Sturm bound.
This bounded corpus does not claim exhaustive coverage of every modular form
in the broader future P1 domain.

### Performance and architecture

- [x] Start with ordinary CPython-parseable source and existing exact FLINT
  matrix/number-field operations.
- [ ] Profile construction, Hecke assembly, decomposition, field construction,
  and coefficient production separately.
- [ ] Profile formula generation, series arithmetic, coefficient-matrix
  assembly, exact rank, and span certification separately.
- [ ] Reuse existing sparse Hecke actions instead of materializing dense
  matrices when the workload does not need them.
- [ ] Use source-transparent `@native` compilation only for measured kernels
  with a correct dynamic fallback.
- [ ] Keep exact coefficient vectors resident across batched recurrence work
  when measurement shows host-boundary repacking is material.
- [ ] Record equal-contract process-cold and warm comparisons with SageMath,
  PARI/GP, and Magma.
- [ ] Set performance gates only after the first complete exact corpus exists;
  do not optimize a special case and label it the general basis algorithm.
- [ ] Pass focused tests, `pnpm test:baselib:strict`,
  `pnpm architecture:check`, portable JavaScript, Node-Wasm, real-browser
  Wasm, Linux x64, Linux ARM64, macOS, and native Windows x64.

### P0 completion gate

- [x] General supported modular-symbol spaces no longer raise the current
  specialized-model `q_expansion_basis` error.
- [x] The declared constructive-formula corpus returns exact certified bases
  or honestly labeled proper subspaces through the same public API.
- [x] Every overlapping P0A/P0B row has an exact span-equality differential
  certificate.
- [x] The `ModularForms` cusp/newform API returns exact bases and normalized
  newforms for every declared initial-domain case.
- [x] Every acceptance row has an independent Sturm-bound certificate.
- [x] The implementation is source-frozen with exact cross-platform receipts.
- [x] Documentation includes a guided example from space construction through
  decomposition, newforms, $q$-expansions, and an attached $L$-series input.

The frozen bundle has SHA-256
`4008ac76d02eeac6fbf8b081466d5219562ee1042f244f7203f7a4879b55a9f2`.
At commit `a9ae669f5a111398ed7a03b5592d8064d0afe87a`, the required checks on
[#93](https://github.com/sagemathinc/sagejs/pull/93) passed on Linux x64,
Linux arm64, macOS arm64, native Windows x64, and real-browser Chromium.

## P1: complete the classical modular-form object layer

- [ ] General `ModularForms` spaces for $\Gamma_1(N)$ and $\Gamma_H(N)$.
- [ ] General `ModularForms(chi,k)` spaces with nebentypus.
- [ ] Base change to number fields, cyclotomic orders, finite fields, and
  supported $p$-adic rings.
- [ ] First-class cusp, Eisenstein, oldform, newform, and ambient elements.
- [ ] Complete Hecke-module methods on modular-form spaces and elements.
- [ ] Extend the P0B exact expansion algebra from certified basis construction
  into a complete parented modular-form ring interface.
- [ ] Quotients when holomorphic, derivatives, and general twists beyond the
  P0B domain.
- [ ] Membership and coordinate recovery from sufficiently precise
  $q$-expansions.
- [ ] Graded rings of classical modular forms.
- [x] Victor Miller bases and efficient level-$1$ arithmetic.
- [ ] Rankin--Cohen brackets.
- [ ] CM detection and systematic twist recognition.
- [ ] General Atkin--Lehner operators and eigenvalues.
- [ ] Congruence modules and comparison of eigenforms modulo prime ideals.

## P1: analytic modular-form functionality

- [ ] Arbitrary-precision evaluation $f(\tau)$ on the upper half-plane.
- [ ] Numerical newforms and controlled exact recognition.
- [ ] Petersson inner products.
- [ ] Period polynomials and Manin periods.
- [ ] Numerical modular-symbol integration along general paths.
- [ ] Taylor expansions at ordinary and elliptic points.
- [ ] Automatic construction of the complex $L$-series attached to a
  classical newform.
- [ ] Euler factors at all good and bad primes.
- [ ] Twists, gamma factors, root numbers, and functional-equation checks.
- [ ] Explicit bridge to Sage.js's generic analytic $L$-function machinery.

## P1: finish modular-symbol coverage

- [ ] Full star matrix on sign-zero character spaces.
- [ ] Arbitrary rational-path elements with nonconstant coefficient
  polynomials in character spaces.
- [ ] Level-raising degeneracy maps.
- [ ] Character-valued lowering maps for imprimitive characters.
- [ ] General exact coefficient rings and reduction modulo prime ideals.
- [ ] Integral structures and saturated lattices in rational modular-symbol
  spaces.
- [ ] Period maps from integral modular symbols to modular abelian varieties.

## P1: Brandt, supersingular, and modular-Jacobian completion

- [ ] Higher-weight Brandt modules.
- [ ] Brandt modules with general coefficient representations.
- [ ] Public construction from an arbitrary definite quaternion order.
- [ ] General coefficient-ring base extension.
- [ ] $U_p$ operators at primes dividing the Eichler conductor.
- [ ] Atkin--Lehner operators at every supported level divisor.
- [ ] Explicit supersingular-divisor modules with auxiliary level structure.
- [ ] Supported characteristic-$2$ and characteristic-$3$ supersingular
  models.
- [ ] Bad-prime and composite-index supersingular correspondences.
- [ ] Integral Hecke algebras and discriminants.
- [ ] Audited integral modular-degree maps to newform quotients.
- [ ] Component groups of newform quotients $A_f$.

## P2: weight $1$ and half-integral weight

- [ ] Complete weight-$1$ cusp-dimension computation, including the Schaeffer
  cases that currently fail closed.
- [ ] Construct weight-$1$ cusp bases and normalized eigenforms.
- [ ] Detect dihedral forms and construct their Artin representations where
  supported.
- [x] Initial Basmaji half-integral-weight cusp spaces and certified
  $q$-expansion bases when the character modulus is divisible by $16$.
- [ ] Complete half-integral-weight modular-form spaces outside the initial
  Basmaji domain, including Eisenstein and arbitrary supported level cases.
- [ ] Kohnen plus and new subspaces.
- [ ] Shimura/Kohnen correspondence to integral weight.
- [x] Exact $T_{p^2}$ matrices at odd good primes in the initial Basmaji
  domain, plus coefficient-formula action on arbitrary exact expansions.
- [ ] Bad-prime and general-index Hecke operators and half-integral
  eigenform objects.
- [ ] Petersson products for weight $1$ and half-integral weight.

## P2: $p$-adic modular forms and symbols

- [ ] Space of $p$-adic weights.
- [ ] Distribution modules with explicit precision and moment bounds.
- [ ] Overconvergent modular symbols.
- [ ] Ordinary and finite-slope projections.
- [ ] $U_p$ slopes and Fredholm/characteristic series in a bounded domain.
- [ ] Overconvergent $p$-adic modular forms.
- [ ] $p$-adic $L$-series attached to classical modular symbols and elliptic
  curves.
- [ ] Precision certificates and repeatable lift/refinement semantics.

## P2: modular abelian varieties and modular curves

- [ ] Construct $A_f=J_0(N)/I_fJ_0(N)$ from a weight-$2$ newform constituent.
- [ ] Homomorphism and endomorphism rings of supported modular abelian
  varieties.
- [ ] Rational torsion and finite subgroup schemes in the supported domain.
- [ ] Modular degree, congruence number, and congruence exponent.
- [ ] Tamagawa and component-group data for newform quotients.
- [ ] Canonical periods and special $L$-values.
- [ ] Relations among modular forms from exact $q$-expansions.
- [ ] Canonical models and equations of modular curves.
- [ ] Maps to elliptic curves and higher-dimensional newform quotients.

## P2: general Hilbert and Bianchi modular forms

- [ ] Replace the two field-specific Hilbert slices with a public constructor
  parameterized by a totally real field, ideal level, weight, and character.
- [ ] Reusable quaternion-order and ideal-class precomputation over a general
  totally real field.
- [ ] Parallel weight-$2$ Hecke spaces at arbitrary $\Gamma_0$ ideal level.
- [ ] Higher and nonparallel weights.
- [ ] Hilbert old/new decomposition, newforms, Atkin--Lehner operators, and
  coefficient fields.
- [ ] Recover elliptic curves or abelian varieties from supported Hilbert
  eigensystems.
- [ ] Attach Hilbert modular-form $L$-series with good and bad Euler factors.
- [ ] Bianchi weight-$2$ cusp forms over arbitrary imaginary quadratic fields.
- [ ] Reusable Voronoi/perfect-form data and sharbly reduction.
- [ ] Bianchi Hecke operators and newform decomposition.

## P3: broader automorphic-form families

- [ ] Numerical Maass cusp forms, pullback, Fourier coefficients, eigenvalue
  search, and verification.
- [ ] Jacobi forms with exact Fourier and theta expansions.
- [ ] Scalar- and vector-valued genus-$2$ Siegel modular forms.
- [ ] Paramodular forms and Hecke actions.
- [ ] Gritsenko, Maass, Borcherds, Yoshida, and related lifts.
- [ ] General reusable monoid/multivariate Fourier-expansion framework.
- [ ] Algebraic modular forms for orthogonal and special orthogonal groups.
- [ ] Algebraic modular forms for unitary and other compact-at-infinity groups.
- [ ] Drinfeld modular-form rings.
- [ ] Hecke-triangle modular and quasimodular forms.
- [ ] Classical quasimodular-form rings.
- [ ] Local components, smooth $p$-adic characters, and type spaces of
  newforms.

## Shared release requirements

Every major checkbox above also requires the following before it is considered
complete:

- [ ] Ordinary CPython-parseable mathematical source with documented
  provenance.
- [ ] A correct dynamic implementation and differential oracle.
- [ ] Exact failure behavior for unsupported domains; no plausible-looking
  partial result.
- [ ] Focused positive, adversarial, cancellation, serialization, and cache
  authentication tests.
- [ ] Cross-platform portable and native coverage appropriate to the backend.
- [ ] Representative performance measurements that separate construction,
  warm reuse, arithmetic, and publication costs.
- [ ] User documentation with copy-pasteable Sage-mode examples.
- [ ] Source-current receipts and a clean source freeze for any automatic fast
  path.

## Comparison sources

- [SageMath modular forms reference](https://doc.sagemath.org/html/en/reference/modfrm/index.html)
- [SageMath modular symbols reference](https://doc.sagemath.org/html/en/reference/modsym/index.html)
- [PARI/GP modular forms catalogue](https://pari.math.u-bordeaux.fr/dochtml/html/Modular_forms.html)
- [Magma classical modular forms](https://docs.magma-maths.org/ModularArithmeticGeometry/ModularForms/introduction.html)
- [Magma Brandt modules](https://docs.magma-maths.org/ModularArithmeticGeometry/BrandtModules/ModBrdt%3Aintroduction.html)
- [Magma Hilbert modular forms](https://docs.magma-maths.org/ModularArithmeticGeometry/HilbertModularForms/introduction.html)
- [Magma Bianchi modular forms](https://docs.magma-maths.org/ModularArithmeticGeometry/ModularFormsOverImaginaryQuadraticFields/introduction.html)
- [Magma modular abelian varieties](https://docs.magma-maths.org/ModularArithmeticGeometry/ModularSymbols/modular-abvars.html)
- [Historical psage modular-form source](https://github.com/williamstein/psage/tree/master/psage/modform)

The psage entries record algorithms present in the historical source tree; they
do not assert that the old package runs unchanged on a current SageMath
installation.
