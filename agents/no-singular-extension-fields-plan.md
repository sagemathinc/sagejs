# Extension coefficient fields for algebraic geometry without Singular

- Status: follow-up implementation plan
- Date: 2026-09-05
- Depends on:
  [core no-Singular algebraic geometry plan](no-singular-algebraic-geometry-plan.md)
- Audited against: the qualified core candidate in
  [PR #114](https://github.com/sagemathinc/sagejs/pull/114), commit
  `57671d900d77fd46c0b75a9d64776c756d7e6fed`
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

Implementation is on `agent/no-singular-extension-fields`, initially based on
PR #114 at `5b6ffb5075fabd1f040cbf2553d34837ff8e3da5`, as authorized by the
user while the release manager handles that PR's merge. Keep the new PR
explicitly dependent on #114. Once it merges, integrate a green `origin/main`
containing it and repeat the affected validation. The earlier audited commit
records inspected evidence rather than a permanent fork point.

The implementation order is intentional:

1. define one exact-field coefficient boundary shared by future domains;
2. make `GF(p^d)` multivariate polynomial storage, sparse term exchange, and
   elementary arithmetic work on both native and production Wasm targets;
3. add a correct exact Gröbner and geometry path over finite extensions;
4. qualify the complete `GF(p^d)` stack on native and Wasm platforms;
5. investigate and enable an msolve fast path for finite extensions only if
   its block-order encoding wins and can be verified;
6. add exact univariate and multivariate polynomial support, followed by
   Gröbner support, over simple absolute
   number fields;
7. add exact univariate factorization over number fields and propagate the
   zero-dimensional algorithms; and
8. investigate number-field msolve acceleration separately, without making it
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
and portable-Wasm receipts are green. Experimental number-field research can
happen in a throwaway worktree, but it must not widen the active integration
branch.

## Supported domains

### Milestone F: finite extensions

Initially support

```text
K = GF(p^d) = GF(p)[a]/(m(a))
```

where:

- `p` is prime and supported by Sage.js's exact finite-field implementation;
- `p` lies in the explicitly qualified common characteristic range of the
  native and production Wasm polynomial implementations;
- `d > 1`;
- `m` is a validated irreducible polynomial of degree `d` over `GF(p)`; and
- the field has an exact stable construction descriptor.

Phase E0 must record this range as an explicit integer bound before support
is enabled. FLINT `fq_nmod_mpoly` requires word-sized characteristic; scalar
field support alone does not establish a polynomial backend's range. Audit
FLINT limb widths, adapter integer conversions, and Wasm representation
independently. Test primes near the bound on every target. Larger
characteristics require a qualified generic exact fallback or an explicit
capability rejection, never truncation or a platform-dependent interpretation.
The characteristic bound is distinct from extension degree, field cardinality,
and msolve's narrower characteristic envelope.

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
  mathematical field presentation/embedding, order, backend, resolved proof
  flag, and resource policy. Mathematical cache keys exclude a generator's
  display label; caches of public parent-bound objects also preserve the
  requesting parent identity.

Sharing mathematical cache entries across a pure generator renaming is allowed
only for encoded data with a checked coordinate identification. Reconstruct
coefficients and polynomials in the requesting parent before returning them.
Never return another parent's cached polynomial, element, or native handle just
because its mathematical descriptor matches. Do not infer an embedding between
distinct defining polynomials from equal cardinality or field degree.

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
- explicit field-family and capability queries, rather than inference from
  `_kind`, the presence of `is_prime_field`, or a catch-all characteristic-zero
  branch;
- a canonical coordinate vector over the prime/base field;
- reconstruction from canonical coordinates;
- bounded canonical enumeration of finite fields by base-`p` coordinate
  vectors, independent of whether the displayed defining generator is
  multiplicatively primitive;
- exact univariate-polynomial construction and the Euclidean operations needed
  by zero-dimensional algorithms, with factorization exposed as a separate
  capability;
- a stable mathematical construction descriptor containing the normalized
  defining polynomial, base field, and power-basis presentation; and
- a bounded versioned coefficient codec for tests, workers, native code, and
  Wasm.

The interface describes field operations, not private object layouts. Direct
access to `_nativeContext`, `_modulus`, or a number-field coefficient array is
restricted to reviewed adapters. A generator's display name is presentation
metadata: renaming it must not change the mathematics. Mathematical cache
identity and public parent identity are separate contracts, as specified above.
Conversely, two fields of the same cardinality with different defining
polynomials are not silently conflated.

### Algorithm ownership

The expected module split is:

```text
src/lib/sagejs/polynomial_algorithms/
  exact_field.py                     field-neutral coefficient contract
  generic_sparse_mpoly.py            storage-neutral exact sparse polynomials
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

Do not mutate the existing `sagejs.groebner.sparse/v1` packed Gröbner ABI to
reinterpret integers or rational pairs as extension coefficients. Freeze it as
the specialized `QQ`/prime-field contract. Add a generic exact-field v2
contract whose coefficients remain real field elements at the ordinary-Python
boundary and cross workers/native/Wasm only through the versioned coefficient
codec. Give it a new capability ID. Old v1 receipts must remain meaningful.

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

No `else` branch may classify every non-prime field as `QQ`, and no
method-presence test may classify every object having `is_prime_field` as a
finite field. An unsupported tuple fails before entering native code and
reports the rejected field, operation, order, proof mode, execution target,
and available fallback.

## Post-core readiness audit

The qualified core candidate at
`57671d900d77fd46c0b75a9d64776c756d7e6fed` completed the no-Singular public
ideal, quotient, zero-dimensional, scheme, morphism, Jacobian, plane-curve,
proof-policy, and capability layers over `QQ` and prime fields. Its portable
Wasm evidence is real rather than inferred from native CI:

- the production build published 287 kernels with zero unsupported kernels
  and verified all 15 reviewed ABI modules;
- Node-Wasm passed 201 tests, with only two expected skips for unavailable
  browser engines; and
- a real Chromium Web Worker passed the algebraic-geometry tour, msolve,
  plotting, partitions, `prime_pi`, numerics, and live examples.

That evidence qualifies the **core domains**, not extension coefficients.
Firefox and WebKit were not available on the Linux qualification host, and
extension-field multivariate support is presently absent from the production
Wasm backend.

The source audit found these concrete extension-field gaps:

- native multivariate `GF(p^d)` polynomials select FLINT `fq_nmod_mpoly`
  storage and basic native arithmetic works, but `terms()` cannot decode its
  coefficients and raises `TypeError`;
- `PolynomialIdeal` rejects every base except `QQ` and prime `GF(p)`;
- the packed v1 Gröbner ring and coefficient representation implement only
  `QQ` and prime-field arithmetic;
- ideal dispatch reads `_modulus` for prime fields and otherwise falls into a
  characteristic-zero/rational branch, which must not receive extension
  fields when the public gate is removed;
- the production Wasm multivariate backend accepts only `zz`, `qq`, and
  word-size `nmod` contexts, so even constructing `GF(4)[x,y]` fails in the
  browser;
- current browser algebraic-geometry tests deliberately assert that
  `AffineSpace(GF(4, 'a'), 2)` is rejected; those tests must become positive
  capability tests in Phase F0/F2;
- zero-dimensional candidate selection and finite point enumeration currently
  contain prime-field/method-presence splits that must be replaced by the
  exact-field capabilities;
- the public scheme layer currently has a deliberate supported-field gate;
  replace it with a capability query rather than adding more concrete kinds;
- extension-field univariate factorization and root splitting exist;
- finite-extension scalar and matrix arithmetic have native/Wasm resources;
- simple `NumberField` scalar arithmetic exists, but polynomial-ring dispatch
  rejects `NumberField` and the parent does not yet expose the complete formal
  field-capability surface required by generic algorithms; and
- number fields therefore need an exact univariate `K[x]` substrate as well as
  multivariate sparse storage before factorization can be implemented.

There is also a correctness defect below algebraic geometry:
`FiniteFieldExtensionParent.__iter__` currently emits zero followed by powers
of the defining generator. A defining generator need not generate the
multiplicative group. For example, in `GF(3)[a]/(a^2+1)`, `a` has order four,
so the current nine yielded positions contain only five distinct values. This
must be fixed by enumerating all canonical base-`p` power-basis coordinate
vectors before rational-point enumeration is generalized.

Useful existing pieces include power-basis coordinate conversion on
finite-extension elements/parents and corresponding coefficient-list
construction on number fields. They are currently partly private and the
finite-field `construction()` result omits the defining modulus, so Phase E0
must promote a stable public descriptor/codec instead of depending on those
layouts.

The qualified core's complete `eager-core` production group measured
17,432,669 gzip bytes and 9,616,687 Brotli bytes after its reviewed budget
ratchet. This is the baseline against which any `fq_nmod_mpoly` addition must
be measured; it is a reason to investigate a lazy specialist group, not
permission to grow the eager bundle without evidence.

Initial audit entry points are:

- `src/baselib/finite_fields.py` for coordinate conversion and enumeration;
- `src/baselib/polynomial.py` for ring-domain gates, native storage, sparse
  terms, and `PolynomialIdeal` construction;
- `src/lib/sagejs/polynomial_algorithms/groebner_contract.py` for the frozen
  packed v1 ABI;
- `src/lib/sagejs/polynomial_algorithms/ideal.py` and
  `zero_dimensional.py` for domain routing and coefficient assumptions;
- `src/baselib/schemes.py` for geometry capabilities and point enumeration;
  and
- `packages/flint-wasm/multivariate-backend.mjs` plus its browser tests for
  the current `zz`/`qq`/`nmod` Wasm boundary.

The msolve source vendored by Sage.js contains one-block elimination-order
machinery, but the adapter hardcodes an elimination-block length of zero.
Upstream documents `-e k` block elimination, while its characteristic-zero
library path currently has a known limitation: it exports the elimination
ideal rather than the full block-order basis needed here. Track the upstream
constraint in
[msolve issue #339](https://github.com/algebraic-solving/msolve/issues/339).

These facts make finite-extension exact support a smaller project than
number-field support, but not a one-line ideal-gate change. Polynomial storage
and Wasm parity are their own prerequisite phase. They also make msolve
acceleration an experiment rather than the initial architecture.

## Phase E0: readiness audit and shared coefficient contract

Begin on the authorized branch based on PR #114. Repeat the affected parts of
this audit when integrating its merge commit and later `origin/main` changes.

1. Audit the completed core implementation for concrete `_kind`, numerator,
   prime-residue, characteristic-only, and method-presence assumptions. The
   initial list includes ideal packing/routing, sparse term export,
   zero-dimensional candidate selection, finite point enumeration, and the
   scheme field gate.
   Record the numerical characteristic bounds for scalar, native multivariate,
   Wasm multivariate, and optional msolve operations and select the common
   supported range with boundary tests.
2. Move legitimate domain routing behind its capability registry without
   changing `QQ` or prime-field behavior.
3. Implement the exact-field interface, a complete construction descriptor,
   and a versioned coefficient codec. Expose stable coordinate conversion;
   never serialize private native handles.
4. Generalize the ordinary-Python monomial algorithms to call that interface.
   Preserve the specialized packed v1 paths as optimizations and introduce a
   distinct generic exact-field v2 engine.
5. Extend certificate structures so coefficients can be arbitrary exact-field
   values through a codec rather than the current integer/rational union.
6. Replace `FiniteFieldExtensionParent.__iter__` with deterministic enumeration
   of all base-`p` coordinate vectors. Make bounded finite-element enumeration
   an explicit field capability used by schemes and solving.
7. Formalize the univariate-polynomial capabilities required by root finding,
   factorization, and zero-dimensional decomposition without pretending every
   exact field already implements factorization.
8. Add construction-descriptor and cache-key tests for two isomorphic but
   differently presented fields, and cache reuse tests after a pure generator
   renaming that assert the returned result belongs to the requesting parent.
9. Create independent Sage fixtures for all examples used by Milestones F and
   N, pinned to an exact Sage revision and including reproduction commands.
10. Record upstream algorithms and any translated code in
   `architecture/upstream-algebra-provenance.json`.

Acceptance:

- all existing `QQ` and prime-field tests remain green;
- public geometry contains no field-family dispatch;
- packed v1 Gröbner receipts retain their old meaning;
- exact-field codec round trips are bounded and deterministic;
- `list(GF(9, 'a', modulus=x^2 + 1))` has exactly nine distinct elements even
  though `a` is not multiplicatively primitive;
- finite-extension inputs can never enter the rational packed backend; and
- neither extension family is advertised as supported yet.

## Milestone F: finite extensions `GF(p^d)`

### Phase F0: multivariate substrate and production-Wasm parity

The existing native `fq_nmod_mpoly` selection is not public support until
coefficients can cross the sparse-term boundary and the same operations work
in the production Wasm artifact.

1. Implement exact storage-neutral import/export of sparse
   `(coefficient, exponent_vector)` terms for native `fq_nmod_mpoly` values.
   Coefficients returned to Python are ordinary elements of the original
   finite-extension parent.
2. Extend the production Wasm multivariate backend with a versioned
   finite-extension context carrying `p`, the normalized irreducible modulus,
   extension degree, coefficient basis, variable count, and monomial order.
   Do not overload the current single-integer `nmod` context.
3. Bind or build the required FLINT `fq_nmod_mpoly` operations in Wasm:
   context lifecycle, constants/generators, sparse import/export, equality,
   addition, subtraction, negation, multiplication, powering, degree/length,
   evaluation/substitution, derivatives, and the exact division/resultant
   primitives required by later phases.
4. Keep all public polynomial values behind
   `MultivariatePolynomialElement`; backend kind is capability metadata, not a
   user-visible class split. Maintain a generic exact sparse representation as
   the correctness fallback where a native primitive is unavailable.
5. Add explicit capability failures for every unimplemented backend operation.
   Never let the browser silently select rational arithmetic or a prime field
   with the same characteristic.
6. Put finite-extension Wasm code/resources in a lazy specialist delivery
   group if eager inclusion would materially grow startup payload. Authenticate
   the group and ratchet its gzip/Brotli budgets independently.
7. Add positive browser ring/arithmetic tests for `GF(4)` here. Keep the
   scheme-level rejection explicit until Phase F2, then replace the current
   `AffineSpace(GF(4, 'a'), 2)` rejection tests with positive geometry tests.

Acceptance:

- `GF(4)[x, y]` and `GF(9)[x, y]` construct and perform sparse arithmetic on
  native, Node-Wasm, and real Chromium using the production bundle;
- `terms()` round trips non-prime coefficients and their exact parent;
- a field generator name collision with a polynomial variable is either
  represented unambiguously or rejected before backend allocation;
- no extension-field context is accepted by the `nmod`, `QQ`, or packed v1
  paths;
- delivery-group identity, compressed size, and load timing are recorded; and
- existing `ZZ`, `QQ`, and `GF(p)` multivariate behavior and payload budgets do
  not regress outside an explicitly reviewed ratchet.

### Phase F1: exact polynomial ideals and Gröbner bases

1. Enable `PolynomialIdeal` over validated `GF_EXTENSION` parents.
2. Route extension fields exclusively through the generic exact-field v2
   contract; keep `sagejs.groebner.sparse/v1` unchanged for `QQ`/prime fields.
3. Implement exact field-neutral leading term, S-polynomial, reduction,
   Buchberger, autoreduction, and transformation matrices.
4. Support `lex`, `deglex`, and `degrevlex` through the direct exact path.
5. Implement normal form, ideal membership, containment, equality, leading
   ideal, and elimination using that path.
6. Add explicit resource limits for terms, pairs, exponent size, coefficient
   operations, elapsed time, and output size. Never return a partial basis.
7. Return inspectable metadata such as
   `python:groebner-exact-gf-extension-v1`.
8. Encode transformation/certificate coefficients through the exact-field
   codec and verify them with actual field operations, not integer/rational
   reinterpretation.
9. Keep native `fq_nmod_mpoly` arithmetic for basic polynomial operations;
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
   enumeration and resource estimates. Enumerate canonical coordinate tuples,
   never powers of a possibly nonprimitive defining generator.
6. Reuse existing extension-field univariate factorization to enable the
   certified zero-dimensional radical and primary-decomposition algorithms,
   but route this through an explicit factorization capability rather than an
   `is_prime_field` or `_kind` branch.
7. Preserve non-split residue factors rather than confusing them with
   `GF(p^d)`-rational points.
8. Add characteristic-`p` Jacobian cases where formal derivatives vanish.
9. Qualify squarefree decomposition with non-prime coefficients. In
   `K = GF(p^d)`, taking a polynomial's `p`-th root requires applying inverse
   Frobenius to its coefficients as well as dividing its exponents by `p`.
   For `a` in `K`, test `x^p - a = (x - a^(p^(d-1)))^p`, including zero,
   non-prime coefficients, mixed multiplicities, and repeated root extraction.
   The squarefree part and radical must use the actual root, not `a` itself.
10. Preserve proof requirements through univariate factorization calls used by
    solving and decomposition. Product equality is necessary, but each factor
    treated as irreducible also needs a justified irreducibility result.

Acceptance:

- every applicable row of the core capability matrix has an explicit
  `GF(p^d)` receipt or a mathematically justified field-specific exclusion;
- scheme structure and nilpotents are preserved;
- exhaustive point enumeration refuses infeasible `q^n` workloads before
  allocation;
- zero-dimensional decompositions exactly recompose; and
- the browser examples include a genuinely extension-field calculation.

### Phase F3: auxiliary-variable msolve fast-path experiment

This optional investigation follows initial Phase F4 qualification of the
direct exact implementation. Its phase identifier is retained for references;
it is not a prerequisite for F4 or Milestone F's merge. Cap the investigation
at one focused prototype and representative benchmark tranche, with at most
two working days of effort. Record a deferral if the full-basis contract,
certification, or performance remains unresolved. Any shipped optimization
must rerun the affected production qualification checks.

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
3. Independently qualify the one canonical portable Wasm artifact in Node-Wasm
   and a real Chromium Web Worker; native four-platform receipts are not a
   substitute for this receipt.
4. Run the exact-runtime iPhone and iPad simulator checks against the same
   portable artifact without treating them as desktop Firefox/WebKit coverage.
5. Audit npm, SEA, and browser artifacts for field-construction resources,
   specialist-group identity, compressed-size budgets, and accidental
   native-only paths.
6. Add documentation examples for ideals, a projective curve, a tangent
   space, and a zero-dimensional decomposition over `GF(p^d)`.
7. Publish the exact capability and performance matrix, including any order
   or cardinality limits.

Milestone F is complete only after Phase F4. Only then may number-field code
enter the integration branch.

## Milestone N: simple absolute number fields

### Phase N1: exact univariate and multivariate polynomial representation

1. Formalize the number-field implementation of the Phase E0 exact-field
   descriptor/codec, including normalized defining polynomial and power-basis
   coordinates.
2. Enable exact univariate `K[x]` construction and arithmetic over
   `NumberFieldParent`: sparse/dense term access, addition, multiplication,
   powering, derivative, exact division with remainder, gcd, squarefree
   decomposition, and resultant. Factorization remains a Phase N3 capability.
3. Enable multivariate polynomial rings over `NumberFieldParent`.
4. Generalize and rename the existing sparse generic polynomial layer rather
   than creating an “approximate” class for exact number-field values.
5. Implement all public term orders, canonical term combination, arithmetic,
   evaluation, substitution, derivatives, homogenization, coercion, and
   display.
6. Ensure leading-term order depends only on variable exponents, never on the
   printed representation of a coefficient.
7. Normalize defining polynomials and coefficient coordinates; preserve the
   exact field presentation in serialization.
8. Keep the primitive element private to coefficients. A user polynomial
   variable with the same printed name must either be disambiguated safely or
   rejected at construction.
9. Add coefficient-height, term-count, and allocation limits with useful
   diagnostics.

Test fields include real and imaginary quadratic fields, at least two cubic
fields, a field defined by a nonmonic rational polynomial that normalizes to
the same field presentation, and distinct isomorphic presentations that do
not coerce implicitly.

Acceptance:

- exact univariate Euclidean arithmetic agrees with Sage and supplies the
  operations Phase N3 will consume;
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

This phase builds on the exact `K[x]` Euclidean substrate established in Phase
N1; it must not introduce a second private univariate representation.

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

Prove completeness and irreducibility in addition to exact recomposition.
Record the hypotheses of the norm-factorization theorem used: squarefree norm
after shifting, complete exact factorization over `QQ`, and the exact
correspondence between those factors and the nonconstant gcds recovered over
`K`. Retain enough evidence to justify each irreducibility claim, or perform an
independent exact irreducibility check. Returning the original polynomial as
one factor passes a product check and is not sufficient for this API.

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
- every returned irreducible factor has an exact justification, and repeated
  multiplicities and completeness are independently checked;
- zero-dimensional decompositions re-intersect to the original ideal; and
- no result is mislabeled as a complete algebraic-closure solution set.

### Phase N4: auxiliary-variable msolve fast-path experiment

Run this optional investigation after initial Phase N5 qualification, with the
same prototype/benchmark and two-working-day limit as F3. It may finish with a
documented deferral. A production optimization requires renewed qualification
of the affected paths; it cannot retroactively inherit N5's earlier receipts.

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
- finite-field enumeration visits every coordinate vector exactly once, even
  when the defining generator has proper multiplicative order (the mandatory
  regression is `GF(3)[a]/(a^2+1)`);
- changing only a field generator's display name does not change mathematics;
- distinct field presentations do not coerce without an explicit embedding;
- no extension field is ever routed through a `QQ`, prime-`nmod`, or packed v1
  Gröbner path, including malformed and resource-limit inputs;
- sparse term import/export preserves exact coefficient parents across native,
  Node-Wasm, worker serialization, and real Chromium;
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
- a real Chromium browser using the production bundle; and
- exact-runtime iPhone and iPad simulator paths.

Test both direct exact paths and every enabled optimized path. A native-only
optimization always retains the direct Wasm fallback and publishes an honest
capability descriptor. The four native hosts validate platform-specific
packages; Node-Wasm and the real browser validate one reproducible portable
artifact. Record these as distinct receipts. Chromium is the minimum release
browser; simulator success is recorded separately, and desktop Firefox/WebKit
absence or skips must be reported rather than folded into “browser passed.”

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
native/Wasm sparse-term boundary time
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

For Wasm, also record specialist-group raw/gzip/Brotli size, eager versus lazy
loading, compilation/instantiation time, and the cost of coefficient/context
serialization. Adding `fq_nmod_mpoly` to the core eager bundle is not free; a
lazy authenticated group is preferred unless measurements justify eager
delivery.

## Recommended PR sequence

Keep these as reviewable commits/PRs rather than one long-lived branch:

```text
E0  exact-field boundary and readiness audit
  -> F0  GF(p^d) multivariate substrate and production-Wasm parity
      -> F1  GF(p^d) exact ideals and Groebner bases
          -> F2  GF(p^d) geometry and zero-dimensional parity
              -> F4  native plus portable-Wasm finite-field qualification
                  -> merge Milestone F
                      -> N1  number-field univariate/multivariate polynomials
                          -> N2  exact ideals and geometry
                              -> N3  factorization and decomposition
                                  -> N5  native/Wasm qualification

After F4: F3 optional finite-extension msolve investigation
After N5: N4 optional number-field msolve investigation
```

F3 and N4 conclude with either a separately qualified optimization or a short
deferral audit. Their bounded investigations are required; shipping their
optimizations is optional. Neither is a dependency of the exact milestone's
qualification or merge.

Shared public exports, capability registries, package metadata, and CI files
belong to an integration lane if implementation is parallelized. Field-
specific lanes own only their adapters, algorithms, fixtures, and focused
tests until handoff.

## Definition of done: Milestone F

- [ ] `GF(p^d)` multivariate construction, arithmetic, and storage-neutral
      sparse terms work on native, Node-Wasm, and production Chromium.
- [ ] The common characteristic bound is explicit and tested at its boundary;
      unsupported inputs never truncate or change interpretation across hosts.
- [ ] Reused mathematical cache entries reconstruct values in the requesting
      parent; generator renaming never leaks another parent's objects.
- [ ] Multivariate polynomial ideals over validated `GF(p^d)` parents work in
      `lex`, `deglex`, and `degrevlex`.
- [ ] Exact Gröbner certificates and normal forms are field-representation
      neutral.
- [ ] Every applicable core algebraic-geometry operation has a `GF(p^d)` test
      and capability record.
- [ ] Bounded rational-point enumeration uses `q = p^d` and fails before
      infeasible allocation.
- [ ] Canonical finite-field enumeration returns each of the `q` elements
      exactly once without assuming the defining generator is primitive.
- [ ] Zero-dimensional radical and primary decomposition exactly recompose.
- [ ] Squarefree decomposition correctly applies inverse Frobenius to
      extension coefficients, including derivative-zero polynomials.
- [ ] Direct exact behavior is identical across native and Wasm targets.
- [ ] Any msolve fast path is block-order correct, independently verified,
      receipt-bounded, and optional.
- [ ] Four native platforms plus production browser qualification pass on one
      commit.
- [ ] Exact-runtime iPhone and iPad simulator checks pass on that commit.
- [ ] The canonical Wasm artifact and every lazy specialist group have
      authenticated identities and reviewed compressed-size budgets.
- [ ] Documentation clearly distinguishes field presentation, rational
      points, geometric points, and residue extensions.

## Definition of done: Milestone N

- [ ] Exact univariate polynomial Euclidean arithmetic over simple absolute
      number fields supports the later factorization implementation.
- [ ] Multivariate polynomials over simple absolute number fields have exact
      sparse arithmetic and all three public global orders.
- [ ] Exact Gröbner, normal form, ideal operations, quotient operations,
      Hilbert data, and applicable geometry work with `proof=True`.
- [ ] Univariate factorization over the number field is exact, resource
      bounded, and independently tested.
- [ ] Factor completeness and irreducibility are justified beyond a product
      check before zero-dimensional decomposition consumes them.
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
