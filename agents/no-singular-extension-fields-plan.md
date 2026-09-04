# Extension coefficient fields for algebraic geometry without Singular

- Status: follow-up implementation plan
- Date: 2026-09-04
- Depends on:
  [core no-Singular algebraic geometry plan](no-singular-algebraic-geometry-plan.md)
- Required sequence: finite extensions `GF(p^d)` first, number fields second
- Runtime policy: no Singular, Macaulay2, CoCoA, Oscar, or Julia dependency
- Performance policy: exact portable baseline before any msolve acceleration

## Executive decision

This is the sole implementation plan for extending the no-Singular algebraic
geometry layer beyond `QQ` and prime `GF(p)`.

Do not implement this plan as part of
`agents/no-singular-algebraic-geometry-plan.md`. Complete and stabilize that
plan's public polynomial, ideal, quotient, proof, capability, and scheme
interfaces over `QQ` and prime fields first. Its extension-ready boundaries
are prerequisites for this plan, not a reason to combine the two delivery
milestones.

The implementation order is intentional:

1. define one exact-field coefficient boundary shared by future domains;
2. add a correct exact Gröbner and geometry path over finite extensions
   `GF(p^d)`;
3. qualify that support on native and Wasm platforms;
4. investigate and enable an msolve fast path for finite extensions only if
   its block-order encoding wins and can be verified;
5. add exact multivariate polynomial and Gröbner support over simple absolute
   number fields;
6. add exact univariate factorization over number fields and propagate the
   zero-dimensional algorithms; and
7. investigate number-field msolve acceleration separately, without making it
   a correctness prerequisite.

The auxiliary-variable construction is an important backend technique, but it
must not be the correctness foundation. Direct arithmetic in the coefficient
field supplies the reference implementation, exact verifier, and fallback.

## Relationship to the core no-Singular plan

The core plan owns the design and behavior of:

- polynomial and ideal public APIs;
- quotient rings and zero-dimensional linear algebra;
- ideal intersection, colon, saturation, and elimination;
- Hilbert data;
- affine/projective schemes, points, and morphisms;
- tangent spaces, supported singular subschemes, and plane curves;
- global `proof.polynomial()` semantics; and
- portable/native/Wasm capability reporting.

This plan adds coefficient-domain implementations behind those interfaces. It
must not fork scheme classes, introduce extension-specific versions of
`AffineSpace` or `ProjectiveSpace`, or weaken any mathematical semantics from
the core plan.

Completion of this document has two independently reviewable milestones:

- **Milestone F:** the complete documented core capability set over supported
  `GF(p^d)` fields; and
- **Milestone N:** the complete documented core capability set over supported
  simple absolute number fields, except inherently field-specific operations
  such as exhaustive enumeration of an infinite field.

Milestone N does not begin until Milestone F is merged and its four-platform
receipts are green. Experimental number-field research can happen in a
throwaway worktree, but it must not widen the active integration branch.

## Supported domains

### Milestone F: finite extensions

Initially support

```text
K = GF(p^d) = GF(p)[a]/(m(a))
```

where:

- `p` is prime and supported by Sage.js's exact finite-field implementation;
- `d > 1`;
- `m` is a validated irreducible polynomial of degree `d` over `GF(p)`; and
- the field has an exact stable construction descriptor.

The existing `GF(p)` implementation remains on its current specialized path.
A user-supplied irreducible modulus and a Sage.js-selected Conway/default
modulus must both work. Fields with the same cardinality but different
presentations are not silently identified; an explicit embedding or coercion
is required.

### Milestone N: number fields

Initially support simple absolute fields

```text
K = QQ[a]/(f(a))
```

where `f` is irreducible over `QQ`. Normalize the defining polynomial and
retain the chosen embedding/presentation in the parent descriptor.

Every number field is simple, so this covers the mathematical class after a
primitive-element conversion. The initial public implementation does not
perform implicit primitive-element conversion for relative towers. A tower
must either expose an explicit absolute field and embedding or receive an
actionable unsupported-case error.

### Required operation parity

Subject to the field-specific qualifications below, each milestone extends
the following core capabilities to its field:

| Layer | Required support |
| --- | --- |
| Polynomials | multivariate construction, arithmetic, terms, evaluation, substitution, derivatives, homogenization |
| Ideals | Gröbner bases, normal forms, membership, containment, equality, elimination, intersection, colon, saturation |
| Quotients | canonical representatives, quotient basis, coordinate vectors, multiplication matrices, minimal polynomials, FGLM |
| Invariants | dimension, codimension, Hilbert series/polynomial, degree |
| Schemes | affine/projective spaces, points, subschemes, intersections, unions, charts, closures |
| Morphisms | evaluation, composition, graph, fibers, inverse images, supported image closures |
| Jacobian geometry | tangent spaces, supported smoothness tests and singular subschemes |
| Curves | affine/projective plane curves, degree, arithmetic genus, patches, closure, tangent and singular calculations |
| Zero-dimensional algebra | solving over the coefficient field, radical, and primary decomposition |

Finite fields additionally support bounded exhaustive rational-point
enumeration, with cost based on `q = p^d`, not merely `p`. Number fields are
infinite: their `rational_points()` support is limited to points extracted
from a certified zero-dimensional solver. Unbounded or positive-dimensional
number-field point searches are not implied.

## Explicit exclusions

This plan does not include:

- reducible defining polynomials masquerading as fields;
- non-simple relative towers without an explicit absolute presentation;
- inseparable non-simple extensions of general imperfect fields;
- transcendental coefficient extensions or rational-function fields;
- polynomial coefficient rings, residue rings with zero divisors, local
  fields, real/complex floating fields, or approximate algebraic numbers;
- automatic embeddings between distinct isomorphic field presentations;
- algebraic-closure point enumeration or a general absolute splitting field;
- positive-dimensional radical or primary decomposition;
- state-of-the-art number-field F4 performance as a release prerequisite; or
- a runtime dependency on an external computer algebra system.

## Mathematical foundation

### Direct coefficient arithmetic is canonical

The public ring is genuinely `K[x_1, ..., x_n]`. Coefficients are ordinary
Sage.js elements of `K`; leading coefficients are normalized using inversion
in `K`; and exact Buchberger, normal form, certificates, quotient matrices,
and verification operate through a field protocol.

This path must work before any encoded fast path. It supplies:

- correct behavior for `lex`, `deglex`, and `degrevlex`;
- a deterministic `proof=True` implementation;
- an independent verifier for optimized candidates;
- useful results on small and medium examples when acceleration is
  unavailable; and
- identical semantics on native and Wasm platforms.

### The auxiliary-variable encoding

For a simple extension `K = k[a]/(m(a))`, lift an ideal

```text
I = (f_1, ..., f_r) in K[x_1, ..., x_n]
```

to

```text
J = (m(a), lift(f_1), ..., lift(f_r))
    in k[a, x_1, ..., x_n].
```

This is an exact presentation of the same coefficient algebra over `k`. It
does not, by itself, make an arbitrary Gröbner order in the larger polynomial
ring equivalent to the requested order over `K`.

Use a product/block order in which the `x`-monomial block is compared by the
requested order before the bounded `a`-power block. A flat `degrevlex` order
on all `n + 1` variables is not accepted as an approximation. The full block-
order basis is needed: returning only `J`'s elimination ideal loses the
extension coefficients.

For example, with `K = QQ(a)`, `a^2 = 2`, the ideal `(a*x - 1)` should decode
to `(x - a/2)`. Eliminating `a` instead gives the rational equation
`2*x^2 - 1`, which describes conjugates and is not the original ideal over
`K`.

### Backend encoding is not geometry

The auxiliary `a` is private backend state. It must never:

- appear in `ambient_space().gens()`;
- increase scheme dimension;
- become a coordinate accepted by public points;
- affect user variable collision rules;
- appear in public printing or serialized equations; or
- cause `GF(p)`-rational point enumeration to replace `GF(p^d)`-rational
  point semantics.

Encode and decode through a versioned boundary with explicit variable blocks,
defining polynomial, coefficient basis, ownership, and resource limits.

## Proof contract

All extension-domain methods retain the core API's `proof=None` convention.

- `None` resolves through `proof.polynomial()`.
- `proof=True` selects the exact generic implementation or an optimized result
  with a complete exact certificate.
- `proof=False` may select a probabilistic or modular backend, but metadata
  must say so and every available exact postcondition is still checked.
- An msolve candidate is not an exact ideal-equality certificate merely
  because all input generators reduce by it. Reverse containment requires
  transformation provenance or an independent exact derivation.
- Cache keys include the normalized defining polynomial, coefficient basis,
  field presentation/embedding, order, backend, resolved proof flag, and
  resource policy.

Candidate verification checks both ideal containments, every required S-pair,
monicity, reducedness, parent identity, and canonical leading ideals. Encoded
backends also verify the defining-polynomial relation and exact encode/decode
round trips.

## Architecture

### Exact-field operations

Introduce or formalize one small ordinary-Python interface used by generic
polynomial algorithms. It must provide:

- exact zero, one, coercion, equality, and zero testing;
- addition, subtraction, multiplication, negation, inversion, and division;
- characteristic, cardinality when finite, and extension degree;
- a canonical coordinate vector over the prime/base field;
- reconstruction from canonical coordinates;
- a stable mathematical construction descriptor; and
- a bounded versioned coefficient codec for tests, workers, native code, and
  Wasm.

The interface describes field operations, not private object layouts. Direct
access to `_nativeContext`, `_modulus`, or a number-field coefficient array is
restricted to reviewed adapters.

### Algorithm ownership

The expected module split is:

```text
src/lib/sagejs/polynomial_algorithms/
  exact_field.py                     field-neutral coefficient contract
  generic_groebner.py                exact Buchberger, normal form, certificate
  simple_extension_encoding.py       private lift/block-order/decode boundary
  extension_field_groebner.py        GF(p^d) dispatch and verification
  number_field_factor.py             exact univariate factorization over K
  number_field_groebner.py           number-field dispatch and verification
```

Use the final layout established by the core plan rather than creating
parallel ideal or quotient classes. Small public parent/element changes remain
in the appropriate `src/baselib` modules; substantial algorithms load lazily
from `src/lib/sagejs`.

Do not mutate the existing packed Gröbner ABI to reinterpret integers as
extension coefficients. Add a versioned coefficient/domain descriptor and a
new capability ID. Old `QQ` and prime-field receipts must remain meaningful.

### Capability routing

At minimum, dispatch distinguishes:

```text
operation
field family and exact construction descriptor
characteristic and extension degree
monomial order and block structure
proof request
execution target
resource envelope
candidate/certificate availability
```

No `else` branch may classify every non-prime field as `QQ`. An unsupported
tuple fails before entering native code and reports the rejected field,
operation, order, proof mode, and available fallback.

## Current Sage.js baseline

At Sage.js commit `c9f039ed0269aa45140eb7f59a6f4e9c1cca7713`:

- multivariate `GF(p^d)` polynomials already select FLINT `fq_nmod_mpoly`
  storage;
- univariate extension-field factorization and root splitting exist;
- extension-field scalar and matrix arithmetic have native/Wasm resources;
- `PolynomialIdeal` nevertheless rejects every base except `QQ` and prime
  `GF(p)`;
- the Gröbner dispatch similarly distinguishes only prime `GF(p)` from a
  rational branch;
- native FLINT/msolve Gröbner and reduction adapters do not accept
  `fq_nmod_mpoly` values;
- simple `NumberField` scalar arithmetic exists; and
- multivariate polynomial construction currently rejects `NumberField` as a
  coefficient domain.

The msolve source vendored by Sage.js contains one-block elimination-order
machinery, but the adapter hardcodes an elimination-block length of zero.
Upstream documents `-e k` block elimination, while its characteristic-zero
library path currently has a known limitation: it exports the elimination
ideal rather than the full block-order basis needed here. Track the upstream
constraint in
[msolve issue #339](https://github.com/algebraic-solving/msolve/issues/339).

These facts make finite-extension exact support a smaller project than
number-field support, and make msolve acceleration an experiment rather than
the initial architecture.

## Phase E0: readiness audit and shared coefficient contract

Begin only after the core no-Singular plan has a stable integration candidate.

1. Audit the completed core implementation for concrete `_kind`, numerator,
   prime-residue, and characteristic-only assumptions.
2. Move legitimate domain routing behind its capability registry without
   changing `QQ` or prime-field behavior.
3. Implement the exact-field interface and versioned coefficient descriptor.
4. Generalize the ordinary-Python monomial algorithms to call that interface.
   Preserve specialized packed paths as optimizations.
5. Extend certificate structures so coefficients can be arbitrary exact-field
   values through a codec rather than the current integer/rational union.
6. Add construction-descriptor and cache-key tests for two isomorphic but
   differently presented fields.
7. Create independent Sage fixtures for all examples used by Milestones F and
   N, pinned to an exact Sage revision and including reproduction commands.
8. Record upstream algorithms and any translated code in
   `architecture/upstream-algebra-provenance.json`.

Acceptance:

- all existing `QQ` and prime-field tests remain green;
- public geometry contains no field-family dispatch;
- packed v1 Gröbner receipts retain their old meaning;
- exact-field codec round trips are bounded and deterministic; and
- neither extension family is advertised as supported yet.

## Milestone F: finite extensions `GF(p^d)`

### Phase F1: exact polynomial ideals and Gröbner bases

1. Enable `PolynomialIdeal` over validated `GF_EXTENSION` parents.
2. Expose storage-neutral sparse terms whose coefficients are ordinary
   extension-field elements, regardless of native `fq_nmod_mpoly` storage.
3. Implement exact field-neutral leading term, S-polynomial, reduction,
   Buchberger, autoreduction, and transformation matrices.
4. Support `lex`, `deglex`, and `degrevlex` through the direct exact path.
5. Implement normal form, ideal membership, containment, equality, leading
   ideal, and elimination using that path.
6. Add explicit resource limits for terms, pairs, exponent size, coefficient
   operations, elapsed time, and output size. Never return a partial basis.
7. Return inspectable metadata such as
   `python:groebner-exact-gf-extension-v1`.
8. Keep native `fq_nmod_mpoly` arithmetic for basic polynomial operations;
   conversion to storage-neutral terms is a lazy algorithm boundary, not a
   new public representation.

Test fields include:

- `GF(4)` and `GF(8)` in characteristic two;
- `GF(9)` and `GF(27)` in characteristic three;
- at least one degree-two extension of a medium word-sized prime;
- both default and explicitly supplied irreducible moduli; and
- distinct presentations of isomorphic fields with explicit non-coercion.

Test ideals include zero/unit, homogeneous/inhomogeneous, radical/nonradical,
positive/zero dimensional, order-sensitive, coefficient-inverse, and
characteristic-sensitive systems. Compare canonical bases and exact
containments with Sage and at least one independent CAS fixture.

Acceptance:

- all three public global orders work with `proof=True`;
- certificate verification is independent of `fq_nmod_mpoly` layout;
- no extension field enters the `QQ` or prime-field backend by accident;
- dynamic, native, Node-Wasm, and browser results agree; and
- existing prime-field performance paths are unchanged.

### Phase F2: propagate the complete algebraic-geometry capability set

1. Enable quotient rings, standard monomial bases, coordinate vectors,
   multiplication matrices, minimal polynomials, and FGLM over `GF(p^d)`.
2. Enable ideal intersection, colon, saturation, Hilbert data, dimension, and
   degree through the field-neutral core APIs.
3. Enable affine/projective spaces, points, subschemes, charts, closures,
   morphisms, images, fibers, tangent spaces, supported singular subschemes,
   and plane curves.
4. Normalize projective points using exact inversion in the extension field.
5. Use the actual cardinality `q = p^d` for bounded rational-point
   enumeration and resource estimates.
6. Reuse existing extension-field univariate factorization to enable the
   certified zero-dimensional radical and primary-decomposition algorithms.
7. Preserve non-split residue factors rather than confusing them with
   `GF(p^d)`-rational points.
8. Add characteristic-`p` Jacobian cases where formal derivatives vanish.

Acceptance:

- every applicable row of the core capability matrix has an explicit
  `GF(p^d)` receipt or a mathematically justified field-specific exclusion;
- scheme structure and nilpotents are preserved;
- exhaustive point enumeration refuses infeasible `q^n` workloads before
  allocation;
- zero-dimensional decompositions exactly recompose; and
- the browser examples include a genuinely extension-field calculation.

### Phase F3: auxiliary-variable msolve fast-path experiment

This phase may conclude that the encoding should not become a production
backend.

1. Add a private encoder from `GF(p^d)[x]` into
   `GF(p)[a, x]/(m(a))` with canonical coefficient coordinates.
2. Expose the reviewed msolve one-block order through a new bounded adapter;
   do not alter the existing prime-field ABI silently.
3. Establish which block and export settings return the **full** basis in
   prime characteristic. Add direct C-level tests before using it in Sage
   code.
4. Decode full block-order results by grouping terms with the same
   `x`-exponent vector, reducing `a`-coefficients modulo `m`, and normalizing
   in `GF(p^d)`.
5. Require exact encode/decode round trips, S-pair checks, both ideal
   containments, and transformation provenance for `proof=True`.
6. Retain the generic exact fallback for unsupported order/block shapes,
   resource overflow, adapter failure, and every candidate that fails
   verification.
7. Serialize msolve's mutable process-global state exactly as the existing
   adapter does, and keep separate Wasm instances isolated.
8. Benchmark direct exact Buchberger versus encoded F4 by `p`, `d`, variables,
   order, terms, degree, quotient dimension, and matrix size.

Adopt automatic routing only for evidenced envelopes with a material and
repeatable win. Do not assume that “one extra variable” is cheap: the defining
relation and indirect coefficient inversions can increase symbolic
preprocessing substantially.

If encoded F4 is consistently poor, retain it as an explicit experimental
backend or remove it. The next optimization proposal may instead adapt F4's
linear algebra to FLINT `fq_nmod` coefficients directly; that is a separate
measured project.

Acceptance for a production fast path:

- the precise supported order/block contract is documented;
- candidate failures always fall back or fail clearly, never publish partial
  output;
- proof metadata accurately distinguishes exact certification from a
  probabilistic candidate;
- four-platform and Wasm differential results match the generic baseline; and
- an automatic dispatch envelope is backed by checked-in benchmark receipts.

### Phase F4: finite-extension production qualification

1. Run strict Python, architecture, portable, native, Node-Wasm, and browser
   suites.
2. Qualify Linux x64, Linux ARM64, macOS ARM64, and native Windows x64 on the
   same commit.
3. Audit npm, SEA, and browser artifacts for field-construction resources and
   accidental native-only paths.
4. Add documentation examples for ideals, a projective curve, a tangent
   space, and a zero-dimensional decomposition over `GF(p^d)`.
5. Publish the exact capability and performance matrix, including any order
   or cardinality limits.

Milestone F is complete only after Phase F4. Only then may number-field code
enter the integration branch.

## Milestone N: simple absolute number fields

### Phase N1: exact multivariate polynomial representation

1. Enable multivariate polynomial rings over `NumberFieldParent`.
2. Generalize and rename the existing sparse generic polynomial layer rather
   than creating an “approximate” class for exact number-field values.
3. Implement all public term orders, canonical term combination, arithmetic,
   evaluation, substitution, derivatives, homogenization, coercion, and
   display.
4. Ensure leading-term order depends only on variable exponents, never on the
   printed representation of a coefficient.
5. Normalize defining polynomials and coefficient coordinates; preserve the
   exact field presentation in serialization.
6. Keep the primitive element private to coefficients. A user polynomial
   variable with the same printed name must either be disambiguated safely or
   rejected at construction.
7. Add coefficient-height, term-count, and allocation limits with useful
   diagnostics.

Test fields include real and imaginary quadratic fields, at least two cubic
fields, a field defined by a nonmonic rational polynomial that normalizes to
the same field presentation, and distinct isomorphic presentations that do
not coerce implicitly.

Acceptance:

- sparse multivariate arithmetic agrees with Sage under all three orders;
- CPython-parseable source contains no JavaScript coefficient shortcuts;
- serialization round trips preserve the exact parent; and
- no Gröbner support is claimed until Phase N2 passes.

### Phase N2: exact Gröbner, quotient, and geometry baseline

1. Enable `PolynomialIdeal` over simple number fields through the generic
   exact-field implementation from Phase F1.
2. Normalize every nonzero basis polynomial by its invertible number-field
   leading coefficient.
3. Add exact normal forms, transformations, Gröbner certificates, membership,
   containment, equality, elimination, intersection, colon, and saturation.
4. Add quotient bases, multiplication matrices, minimal-polynomial
   construction without factorization, FGLM, dimension, Hilbert data, and
   degree.
5. Propagate affine/projective scheme, morphism, Jacobian, smoothness, singular
   subscheme, and plane-curve operations that do not require polynomial
   factorization over the number field.
6. Include coefficient-height and intermediate-expression statistics in
   resource failures and backend metadata.

Tests include coefficient inversions of nontrivial primitive-element
expressions, conjugate field presentations, denominators, basis normalization,
positive-dimensional ideals, and geometry whose equations genuinely use the
number-field generator.

Acceptance:

- `proof=True` has a deterministic exact path for all three global orders;
- every result remains in the original number-field polynomial parent;
- Hilbert/leading-monomial invariants agree with characteristic-zero oracle
  fixtures;
- native and Wasm public values agree; and
- operations requiring factorization fail with a Phase N3 capability message,
  not a generic backend exception.

### Phase N3: univariate factorization and zero-dimensional decomposition

Implement an exact baseline for factoring `K[x]`, where `K` is a simple
absolute number field. A suitable first algorithm is Trager-style norm
factorization:

1. normalize content, denominators, leading coefficient, and squarefree
   decomposition in `K[x]`;
2. deterministically try shifts involving the primitive element until the
   relevant norm polynomial is squarefree;
3. compute the exact norm/resultant in `QQ[x]`;
4. factor that rational polynomial with the existing exact factorizer;
5. recover factors using exact gcds back in `K[x]`;
6. undo the shift, normalize factors, and verify their exact product; and
7. retry within an explicit bound or report a resource limitation without a
   partial factorization.

Record the algorithm/paper and any CoCoA, Sage, or other source inspiration in
the provenance registry. Do not copy an implementation without its file-level
license and copyright record.

Then:

1. factor quotient-algebra minimal polynomials over `K`;
2. extend the zero-dimensional radical and primary-decomposition algorithms;
3. split components only over `K`, retaining irreducible residue extensions;
4. expose certified `K`-rational solutions arising from linear factors; and
5. verify radical idempotence, primary criteria in the supported scope, and
   exact recomposition of every decomposition.

Acceptance:

- squarefree, repeated, split, and nonsplit examples agree with Sage;
- deterministic retry sequences are reproducible and report their seed/shift;
- returned factors multiply exactly to the input including unit/content;
- zero-dimensional decompositions re-intersect to the original ideal; and
- no result is mislabeled as a complete algebraic-closure solution set.

### Phase N4: auxiliary-variable msolve fast-path experiment

Encode

```text
K[x_1, ..., x_n] = QQ[a, x_1, ..., x_n]/(f(a))
```

behind the same private boundary used in Phase F3. This phase has an extra
upstream obstacle: current msolve characteristic-zero block elimination does
not export the full block-order basis required to reconstruct coefficients in
`K`.

1. Reproduce that limitation against the exact vendored msolve revision.
2. Evaluate or implement a narrowly reviewed change that lifts/exports every
   required block-order polynomial rather than only the elimination ideal.
3. Keep process exits, mutable globals, allocation ownership, and all input
   and output shapes behind the hardened Sage.js adapter.
4. Reject modular primes at which defining-polynomial denominators or
   discriminants invalidate the specialization; track unlucky leading ideals
   and reconstruction stability.
5. Decode into direct number-field polynomials and verify exact parent,
   reducedness, S-pairs, and both containments.
6. Require transformation provenance before allowing `proof=True`.
7. Benchmark against the Phase N2 exact path and record coefficient height,
   defining-field degree, modular primes, symbolic matrix sizes, time, and
   peak memory.

It is an acceptable outcome for this phase to ship no automatic number-field
msolve path. If full-basis lifting is fragile or the expansion loses badly,
keep the exact baseline and write a separate proposal for native F4 arithmetic
over number-field coefficients or a more sophisticated modular algorithm.

Acceptance for any shipped fast path matches Phase F3 and additionally
requires adversarial tests around bad primes, field discriminants, conjugate
presentations, and rational reconstruction.

### Phase N5: number-field production qualification

1. Run all field-generic geometry tests over representative quadratic and
   cubic fields.
2. Run strict Python, architecture, portable, native, Node-Wasm, and browser
   suites.
3. Qualify Linux x64, Linux ARM64, macOS ARM64, and native Windows x64 from the
   same commit.
4. Test npm embedding, SEA relocation, and browser construction without a
   host CAS or data directory.
5. Document exact support, solving semantics, performance expectations,
   resource envelopes, and unsupported relative-field coercions.

## Testing strategy

### Independent oracles

Use SageMath as the primary public-semantics oracle and at least one of CoCoA,
Macaulay2, Singular, or Oscar for difficult ideal results. External systems
generate pinned fixtures; they are not test-time dependencies.

Fixture records include:

- external program and exact revision/version;
- complete field construction, including modulus;
- polynomial variables and monomial order;
- input generators and operation;
- proof/random options and resource flags;
- canonical output or independently checkable invariants; and
- the exact command/script needed to reproduce the result.

### Metamorphic properties

In addition to the core plan's properties, test:

- coefficient coordinate encode/decode is an exact field isomorphism;
- changing only a field generator's display name does not change mathematics;
- distinct field presentations do not coerce without an explicit embedding;
- direct and auxiliary-variable backends agree after decoding;
- the auxiliary relation never appears as a public scheme equation;
- quotient dimension over the prime/base field scales by extension degree in
  finite-dimensional comparison fixtures;
- projective normalization is invariant under every nonzero extension-field
  scalar;
- Frobenius-sensitive finite-field examples use `q = p^d` correctly;
- number-field factorization preserves units and exact products; and
- conjugating coefficients and applying the corresponding embedding commutes
  with ideal operations in bounded oracle examples.

### Cross-platform matrix

Every milestone runs on:

- Linux x64;
- Linux ARM64;
- macOS ARM64;
- native Windows x64;
- Node with the Wasm backend; and
- a real browser using the production bundle.

Test both direct exact paths and every enabled optimized path. A native-only
optimization always retains the direct Wasm fallback and publishes an honest
capability descriptor.

## Performance and resource policy

Benchmark before routing automatically. Record:

```text
field characteristic and degree
defining-polynomial degree, sparsity, and coefficient height
variables and monomial/block order
generator and term counts
degree profile and exponent width
quotient dimension when finite
proof mode and backend
encode/decode time
F4/Buchberger time and peak memory
certificate verification time
execution target and exact source revision
```

Resource envelopes cover field cardinality, extension degree, defining-
polynomial height, terms, pairs, matrix rows/columns/nonzeros, exponent size,
quotient dimension, factorization norm degree/height, retry count, recursion,
time, and memory.

Automatic optimized dispatch requires checked-in receipts for exact workload
envelopes and a tested fail-closed fallback. Being faster on one cyclic
benchmark is not enough to become the default for a field family.

## Recommended PR sequence

Keep these as reviewable commits/PRs rather than one long-lived branch:

```text
E0  exact-field boundary and readiness audit
  -> F1  GF(p^d) exact ideals and Groebner bases
      -> F2  GF(p^d) geometry and zero-dimensional parity
          -> F3  optional encoded msolve acceleration
              -> F4  four-platform finite-field qualification
                  -> N1  number-field multivariate polynomials
                      -> N2  exact ideals and geometry
                          -> N3  factorization and decomposition
                              -> N4  optional msolve acceleration
                                  -> N5  four-platform qualification
```

F3 and N4 may be omitted from automatic routing if their evidence is weak,
but each should still conclude with a short audit explaining the result. Do
not let a fast-path investigation block the exact milestone indefinitely.

Shared public exports, capability registries, package metadata, and CI files
belong to an integration lane if implementation is parallelized. Field-
specific lanes own only their adapters, algorithms, fixtures, and focused
tests until handoff.

## Definition of done: Milestone F

- [ ] Multivariate polynomial ideals over validated `GF(p^d)` parents work in
      `lex`, `deglex`, and `degrevlex`.
- [ ] Exact Gröbner certificates and normal forms are field-representation
      neutral.
- [ ] Every applicable core algebraic-geometry operation has a `GF(p^d)` test
      and capability record.
- [ ] Bounded rational-point enumeration uses `q = p^d` and fails before
      infeasible allocation.
- [ ] Zero-dimensional radical and primary decomposition exactly recompose.
- [ ] Direct exact behavior is identical across native and Wasm targets.
- [ ] Any msolve fast path is block-order correct, independently verified,
      receipt-bounded, and optional.
- [ ] Four native platforms plus production browser qualification pass on one
      commit.
- [ ] Documentation clearly distinguishes field presentation, rational
      points, geometric points, and residue extensions.

## Definition of done: Milestone N

- [ ] Multivariate polynomials over simple absolute number fields have exact
      sparse arithmetic and all three public global orders.
- [ ] Exact Gröbner, normal form, ideal operations, quotient operations,
      Hilbert data, and applicable geometry work with `proof=True`.
- [ ] Univariate factorization over the number field is exact, resource
      bounded, and independently tested.
- [ ] Zero-dimensional radical and primary decomposition exactly recompose.
- [ ] `K`-rational solutions are not confused with solutions over an algebraic
      closure or conjugate field presentation.
- [ ] Relative towers and implicit isomorphisms fail clearly rather than
      coercing accidentally.
- [ ] Any msolve path solves the full block-basis/export problem and handles
      bad primes and transformation provenance honestly.
- [ ] Exact fallback behavior is identical across native and Wasm targets.
- [ ] Four native platforms plus production browser qualification pass on one
      commit.
- [ ] No external CAS, Julia runtime, or Singular library is present in npm,
      SEA, or browser artifacts.

Completing Milestone F should make the finite-field geometry layer broadly
useful without a new runtime dependency. Completing Milestone N should provide
a correct portable number-field foundation even if difficult examples remain
slower than mature specialized computer algebra systems. Performance work can
then proceed from measurements without holding correctness or API design
hostage.
