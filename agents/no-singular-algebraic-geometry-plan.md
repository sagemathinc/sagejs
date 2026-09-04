# Algebraic geometry without Singular

- Status: implementation plan
- Date: 2026-09-04
- Sage.js baseline: `c9f039ed0269aa45140eb7f59a6f4e9c1cca7713`
- Scope: every item classified as easy, small, or moderate in the
  no-Singular roadmap
- Runtime policy: Singular is neither a build dependency nor a runtime
  dependency
- Deferred coefficient fields:
  [extension coefficient fields plan](no-singular-extension-fields-plan.md)

## Executive decision

Sage.js can provide a coherent and useful first computational algebraic
geometry system without embedding Singular. The right first product is not a
miniature copy of Sage's entire schemes catalog. It is an exact, portable
system for embedded affine and projective schemes over `QQ` and prime
`GF(p)`, built on Sage.js polynomials, Gröbner bases, quotient algebras, and
elimination.

This plan delivers:

1. affine and projective spaces, points, subschemes, and polynomial
   morphisms;
2. ideal intersection, colon, saturation, elimination, containment, and
   scheme-theoretic unions, intersections, images, inverse images, graphs,
   and fibers;
3. Hilbert series, Hilbert polynomial, dimension, codimension, and degree in
   their stated graded settings;
4. tangent spaces, Jacobian matrices, smoothness at supported points, and
   singular subschemes where the Jacobian criterion can be applied without
   pretending to know an unavailable equidimensional decomposition;
5. affine and projective plane curves, arithmetic genus, projective closure,
   affine patches, and singular-point calculations; and
6. exact zero-dimensional radical and primary decomposition over `QQ` and
   prime fields, built on the existing quotient-basis and multiplication-
   matrix APIs.

The public API should feel familiar to Sage users, including making both
`AffineSpace(QQ, 2)` and `AffineSpace(2, QQ)` valid. The internal design should
not reproduce Sage's historical class hierarchy. Sage.js is greenfield and
should use small public parents/elements plus lazy algorithm modules.

The optional Singular worker proposed in
`agents/groebner-basis-strategy.md` is **not part of this program**. For every
operation covered here, Singular may be an external differential oracle and
algorithm reference only. A future proposal may revisit modules, local
orders, free resolutions, or other excluded features, but it must stand on
its own portability, size, and maintenance evidence.

This plan's delivery boundary is equally strict about coefficient fields:
**implement only `QQ` and prime `GF(p)` here.** Support for finite extensions
`GF(p^d)` and number fields belongs exclusively to
the [extension coefficient fields
plan](no-singular-extension-fields-plan.md), after this plan is complete. An
implementation PR for this plan must not expand its claimed support,
acceptance matrix, or release gate to those fields. It must, however, preserve
the extension-ready boundaries specified below so that the follow-up does not
require redesigning the scheme layer.

## Scope boundary

### Required by this plan

| Capability | Mathematical foundation | Initial supported domains |
| --- | --- | --- |
| Affine/projective spaces, points, and subschemes | polynomial parents and evaluation | `QQ`, prime `GF(p)` |
| Polynomial maps, composition, graphs, and fibers | substitution and ideal construction | `QQ`, prime `GF(p)` |
| Intersection and containment | ideal sum, membership, and canonical comparison | `QQ`, prime `GF(p)` |
| Scheme-theoretic union | ideal intersection by elimination | `QQ`, prime `GF(p)` |
| Dimension and codimension | Gröbner leading-monomial ideal | every domain/order explicitly supported by that engine |
| Tangent space and point smoothness | derivatives and Jacobian rank | `QQ`, prime `GF(p)` |
| Global singular subscheme | Jacobian/Fitting minors in the supported pure-dimensional cases | `QQ`, prime `GF(p)` |
| Projective charts and projective closure | homogenization, dehomogenization, saturation | `QQ`, prime `GF(p)` |
| Hilbert series and polynomial | standard-graded monomial-ideal combinatorics | homogeneous ideals over `QQ`, prime `GF(p)` |
| Positive-dimensional projective degree | leading ideal and Hilbert polynomial | homogeneous ideals over `QQ`, prime `GF(p)` |
| Plane curves and arithmetic genus | projective hypersurface formulas and Jacobian operations | `QQ`, prime `GF(p)` |
| Images and inverse images | graph ideals, elimination, and saturation | polynomial maps in the supported affine/projective cases |
| Zero-dimensional radical and primary decomposition | quotient algebra, minimal polynomials, factorization, exact splitting | `QQ`, prime `GF(p)` |

Public object construction may happen to remain generic when no field-specific
work is required, but that is not a promise of extension-field support and is
not an invitation to implement it in this program. Computational methods must
check their capability tuple and either return an exact answer over `QQ` or
prime `GF(p)`, or raise a precise `NotImplementedError`. They must never
silently coerce to `QQ`, reduce modulo a convenient prime, or call an
unavailable native backend.

### Deferred coefficient-domain program

The following are deliberately deferred—not forgotten and not partially in
scope:

- finite extensions `GF(p^d)` for `d > 1`; and
- simple absolute number fields `QQ[a]/(f)`.

Their exact-baseline and optional fast-backend work is planned in
`agents/no-singular-extension-fields-plan.md`. Do not add auxiliary defining-
polynomial variables, extension-field Gröbner dispatch, number-field
multivariate storage, extension-specific point enumeration, or extension-
field decomposition to any phase of this document.

### Explicitly excluded as major projects

These are not incomplete phases of this plan:

- general positive-dimensional radical or primary decomposition;
- local rings, local monomial orders, standard bases, and local or
  intersection multiplicities;
- syzygy modules, free resolutions, Betti tables, and coherent sheaves;
- normalization and integral closure of general finitely generated algebras;
- irreducible or equidimensional decomposition in positive dimension;
- geometric genus of singular curves, general curve function fields,
  divisors, Riemann-Roch spaces, and Jacobians constructed from general
  plane curves;
- rational maps with base loci, blowups, covered schemes, and gluing;
- relative/towered fields, transcendental coefficient fields, polynomial
  coefficient rings, and mixed or inexact coefficient domains; and
- a runtime bridge to Singular, Macaulay2, CoCoA, Oscar, or Julia.

If a required operation would need one of these capabilities to be correct on
a particular input, it must reject that input honestly. A narrow correct
method is preferable to a general-looking method with hidden hypotheses.

## Mandatory extension-ready boundaries

Deferring extension fields must not create `QQ`/prime-field assumptions in
the public geometry architecture. Every phase in this plan must satisfy these
requirements even though extension fields are not tested or advertised here.

### Scheme code is coefficient-domain neutral

Affine/projective spaces, schemes, points, maps, Jacobians, and curves operate
through polynomial-ring and ideal interfaces. They must not branch on private
field tags such as `_kind == "QQ"` or `_kind == "GF"`. Domain-specific
dispatch belongs below the polynomial/ideal capability boundary.

### Coefficient arithmetic is isolated from monomial algorithms

New ordinary-Python algorithms must obtain zero, one, coercion, equality,
addition, multiplication, inversion, characteristic, and serialization from
a reviewed exact-field interface. Monomial comparison, divisibility,
S-pairs, normal forms, Hilbert combinatorics, and scheme constructions must
not encode rational numerators or prime residues directly.

Existing packed `QQ`/`GF(p)` ABIs may remain specialized for performance, but
their packed values may not become the representation assumed by public
algorithms. A later extension-field coefficient codec must be addable without
changing scheme APIs.

### Every backend advertises a full capability tuple

Routing is based on operation, exact base-field descriptor, monomial order,
proof mode, platform, and resource envelope. A fallback is selected only when
it advertises the same mathematical operation. In particular, code must not
treat every positive-characteristic field as a prime field or every
characteristic-zero field as `QQ`.

### Parent identity and serialization include the base field

Polynomial, ideal, quotient, scheme, point, and morphism descriptors retain a
stable description of the exact coefficient field and chosen embedding. Cache
keys include that descriptor, not merely the characteristic. User generator
names are display data and must not be mistaken for mathematical field
identity.

### Proof and verification are field-parametric

Proof resolution remains `proof.polynomial()` plus a local override. Exact
certificate verification works through field operations and cannot assume
integer/rational coefficient packets. Probabilistic metadata identifies both
the algorithm and coefficient domain.

### Backend encodings never leak into geometry

A future backend may represent `K = k[a]/(m)` using an auxiliary variable and
the relation `m(a)`. That variable is private backend state: it is not an
ambient-space coordinate, does not change scheme dimension, and must not
affect point semantics, printing, hashing, or public variable names.

### “Extension-ready” does not mean “extension-supported”

Tests in this plan should exercise the abstraction and reject unsupported
fields at the declared boundary. They should not start an unreviewed partial
implementation. Completion of this plan is judged only over `QQ` and prime
`GF(p)`; completion of the companion plan is a separate milestone.

## Semantics that must not drift

### Schemes are not silently converted into varieties

Defining ideals retain nilpotents and embedded structure. Constructing
`X = A.subscheme([x**2])` must not replace `(x^2)` by `(x)`. Scheme-theoretic
intersection uses ideal sum and scheme-theoretic union uses ideal
intersection. Set-theoretic convenience methods, if ever added, must say
`radical` or `reduced` explicitly.

### Projective schemes use the irrelevant ideal correctly

Projective equations must be homogeneous. Equality, emptiness, closure, and
image calculations are properties of `Proj`, so homogeneous ideals are
compared after the appropriate saturation by the irrelevant ideal. The API
may retain the user's original equations for display, but it must cache a
separate canonical saturated ideal for geometric operations.

### Proof is one global policy with local overrides

Every method that can invoke Gröbner, elimination, factorization, or
zero-dimensional decomposition accepts `proof=None`:

- `None` resolves through the existing global `proof.polynomial()` setting;
- an explicit boolean overrides the global setting for that call;
- `proof=True` permits only algorithms whose result is exact under the
  repository's proof contract;
- `proof=False` may select a probabilistic msolve path, but all cheap exact
  postconditions are still checked; and
- cache keys include the resolved proof value, coefficient domain, monomial
  order, backend, and all resource-policy choices.

In particular, the modular `QQ` msolve path is not selected under
`proof=True` until its certificate/provenance contract is actually complete.
Geometry code should call one shared proof-resolution helper rather than
copying global-state logic.

### Sage compatibility is intentional; historical internals are not

The target is compatibility for common constructors, names, mathematical
results, and exceptional cases documented by Sage. It is not compatibility
with Sage's internal inheritance graph or Singular-backed implementation
details. Each intentionally unsupported Sage case belongs in the capability
matrix and gets a useful error.

## Current foundation and required refactoring

At the pinned Sage.js baseline:

- the public polynomial ideal already has Gröbner bases, normal forms,
  leading ideals, elimination, dimension, quotient bases, multiplication
  matrices, FGLM, zero-dimensional degree, and basic solving;
- proof-aware dispatch already distinguishes exact FLINT/Python paths from
  the explicit probabilistic msolve path;
- `AffineSpaceParent`, `ClosedSubscheme`, and `AffinePlaneCurve` are small
  prototypes embedded in `src/baselib/polynomial.py`;
- `AffineSpace(QQ, 2)` fails because the prototype assumes dimension-first
  arguments;
- multivariate evaluation, substitution, differentiation, homogenization,
  and dehomogenization are not yet a single complete public contract; and
- there is no general quotient-ring parent whose elements have canonical
  Gröbner normal forms.

Do not grow the prototypes indefinitely inside `polynomial.py`. Move them
atomically into the new scheme layer and update the public export facade in
the same change. The greenfield rule means no duplicate legacy class needs to
remain behind.

## Target architecture

The exact names may be adjusted during implementation, but ownership should
follow this split:

```text
src/baselib/
  polynomial.py                         polynomial and ideal public core
  polynomial_quotient.py               small quotient parent/element API
  schemes.py                            small public spaces/schemes/points/maps

src/lib/sagejs/polynomial_algorithms/
  quotient.py                          normal forms and multiplication action
  ideal_operations.py                  intersection/colon/saturation
  hilbert.py                           monomial/Hilbert combinatorics
  zero_dimensional.py                  radical and primary decomposition

src/lib/sagejs/schemes/
  affine.py                            affine operations
  projective.py                        saturation, charts, and closure
  morphism.py                          validation, graphs, images, and fibers
  jacobian.py                          tangent and singular-locus operations
  curves.py                            plane-curve operations
```

Public parents and elements stay bootstrap-safe and CPython-parseable. Heavy
algorithms load lazily from `src/lib/sagejs`. All new mathematical modules are
added to `pyrightconfig.json`; `pnpm test:baselib:strict` must remain at zero
errors. No module may use verbatim JavaScript or `# globals` declarations.

The layers depend in one direction:

```text
polynomials
  -> quotient rings + polynomial calculus
  -> exact ideal operations + Hilbert data + zero-dimensional splitting
  -> affine/projective schemes and points
  -> morphisms + Jacobian geometry + plane curves
```

The scheme layer may not inspect backend-specific FLINT or msolve handles.
Every result crosses the existing ordinary polynomial/ideal representation.

## Target public surface

This is a compatibility target, not a frozen signature list:

```python
A = AffineSpace(QQ, 2, names=("x", "y"))
A2 = AffineSpace(2, QQ, names=("x", "y"))
x, y = A.gens()
P = A(1, 2)

X = A.subscheme([y - x**2])
P in X
X.ambient_space()
X.coordinate_ring()
X.defining_ideal()
X.dimension(proof=None)
X.codimension(proof=None)

Q = X.coordinate_ring()
qx, qy = Q.gens()
Q(qy - qx**2) == 0
Q.lift(qx + qy)

T = X.tangent_space(P)
X.is_smooth(P, proof=None)
X.singular_subscheme(proof=None)

P2 = ProjectiveSpace(QQ, 2, names=("x", "y", "z"))
C = P2.subscheme([y**2 * z - x**3 - x * z**2])
C.degree(proof=None)
C.arithmetic_genus()
C.affine_patch(2)

phi = X.hom([x, y], A)
phi(P)
phi.compose(other)
phi.graph(proof=None)
phi.fiber(A(1, 1), proof=None)
phi.image(proof=None)

I.intersection(J, proof=None)
I.colon(J, proof=None)
I.saturation(J, proof=None)
I.hilbert_series(proof=None)
I.hilbert_polynomial(proof=None)
I.radical(proof=None)                 # zero-dimensional supported scope
I.primary_decomposition(proof=None)  # zero-dimensional supported scope
```

Factories validate argument ambiguity explicitly. A boolean, integer, or ring
in the wrong position must not be guessed from JavaScript truthiness.
Projective points normalize by the first nonzero coordinate over the base
field; the all-zero tuple is rejected. Parent identity, coercion, equality,
hashing, and display are tested deliberately rather than inherited by
accident.

## Implementation phases

Each phase should be one reviewable PR unless a phase explicitly identifies a
safe split. Every PR starts from current `origin/main`, carries focused tests,
and updates the capability matrix. No phase should wait for every later phase
before exposing a useful, mathematically closed feature.

### Phase 0: contract, corpus, and baseline

1. Write `docs/algebraic-geometry.md` with the initial capability matrix,
   proof contract, examples, and explicit exclusions.
2. Add a machine-readable operation matrix, for example
   `architecture/algebraic-geometry-capabilities.json`, keyed by operation,
   coefficient domain, order, platform, proof mode, and fallback.
3. Add `architecture/upstream-algebra-provenance.json` for every algorithm or
   code fragment adapted from an external project.
4. Add Sage-generated fixtures for constructor forms, points, ideal/scheme
   identities, empty schemes, dimensions, and errors. Store values, source
   version, commands, and hypotheses rather than screenshots.
5. Capture a small independent oracle corpus from Singular, CoCoA,
   Macaulay2, and Oscar for the ideal operations later in this plan.
6. Add the failing `AffineSpace(QQ, 2)` report as the first regression test,
   but fix it in Phase 4 with the complete object contract.
7. Add architecture checks for the mandatory extension-ready boundaries:
   scheme modules cannot dispatch on concrete field tags, capability records
   must carry a full base-field descriptor, and public caches cannot key only
   on characteristic.
8. Link the user and architecture documentation to
   `agents/no-singular-extension-fields-plan.md` without importing any of its
   implementation scope into this milestone.

Acceptance:

- the capability and provenance files have schema checks;
- fixtures reproduce under the locally pinned Sage checkout;
- every promised operation maps to an implementation phase and every rejected
  operation maps to a precise limitation; and
- `GF(p^d)` and number-field requests fail at the intentional capability
  boundary while all public geometry interfaces remain field-parametric; and
- no production dependency has been added.

### Phase 1: polynomial calculus and quotient rings

Complete the substrate before adding more geometry.

1. Specify multivariate `__call__`, `subs`, and simultaneous substitution.
   Substitution must preserve parent/coercion semantics and must not perform
   sequential replacement accidentally.
2. Add partial derivatives, gradients, and Jacobian matrices with correct
   characteristic-`p` behavior.
3. Add homogenization and dehomogenization with an explicit homogenizing
   variable and target parent. Reject collisions and mixed parents.
4. Implement `K[x_1,...,x_n]/I` as a parent with element representatives in
   canonical Gröbner normal form. Include `gens`, `lift`, coercion, arithmetic,
   equality, zero/one, and display.
5. Cache a basis only behind the resolved proof/backend/order key. Do not make
   object construction compute a Gröbner basis eagerly.
6. Expose the quotient basis, coordinate vectors, multiplication matrices,
   minimal polynomials, and FGLM through this parent rather than maintaining
   disconnected helper results.

Tests:

- differential substitution and differentiation against Sage on random small
  polynomials over `QQ` and several prime fields;
- Euler's homogeneous identity in characteristics that do and do not divide
  the degree;
- homogenize/dehomogenize round trips with explicit edge cases;
- quotient-ring arithmetic and equality against normal forms;
- zero ideal, unit ideal, nonradical ideals, and positive-dimensional ideals;
- deterministic repeated and concurrent calls; and
- CPython, dynamic Sage.js, native, and Wasm parity.

Acceptance:

- quotient elements never expose a noncanonical equality decision;
- positive-dimensional quotients reject finite-basis-only operations clearly;
- no geometry type is needed to use the quotient API; and
- existing Gröbner/FGLM tests continue to pass unchanged mathematically.

### Phase 2: exact ideal intersection, colon, and saturation

Implement a coherent ideal-operations layer using elimination and exact
normal forms.

1. Implement `I.intersection(J)` using the standard auxiliary-variable
   elimination construction `t I + (1-t) J`, followed by canonical conversion
   into the original ring.
2. Specify and implement `I.colon(J)`. A principal fast path is useful, but
   the general finite-generator result must follow a reviewed exact algorithm,
   not a guessed repeated principal formula.
3. Implement `I.saturation(J)` by stabilization of exact colons or a reviewed
   elimination algorithm. Termination and equality checks must be explicit.
4. Add resource limits that raise an informative exception without returning
   a partial ideal.
5. Preserve the input order-independent mathematical result while allowing an
   internal elimination order.

The CoCoA implementations at the pinned revision are the primary readable
algorithm reference. Singular and Macaulay2 are differential oracles.

Tests include the identities

```text
I intersection J subset I, J
(I : J) * J subset I
I : J^infinity = (I : J^n) after reported stabilization
V(I intersection J) = V(I) union V(J) on finite-field enumeration fixtures
```

as well as nilpotents, the zero and unit ideals, principal and multi-generator
saturators, unlucky generator orderings, and random small differential cases.

Acceptance:

- all returned generators are in the original parent and reduce correctly;
- independent ideal containments verify each oracle result;
- proof policy is propagated into every Gröbner/elimination call; and
- Node, Wasm, and browser paths give identical canonical ideals.

### Phase 3: Hilbert data and positive-dimensional degree

1. Minimize the leading monomial generators.
2. Implement a proven monomial-ideal Hilbert numerator algorithm, using the
   CoCoA/Bigatti implementation and literature as the initial reference.
3. Normalize the rational Hilbert series and derive the `h`-vector, Krull
   dimension, Hilbert polynomial, regularity threshold used by the algorithm,
   and multiplicity/degree.
4. Initially expose `hilbert_series` and `hilbert_polynomial` only for
   standard-graded homogeneous ideals. Do not hide homogenization inside a
   method whose semantics claim a graded quotient.
5. Use the existing zero-dimensional quotient-basis cardinality as an
   independent degree oracle where both definitions apply.
6. Add projective degree after the projective wrapper exists, delegating to
   this exact layer.

Tests:

- coordinate linear spaces, hypersurfaces, complete intersections, doubled
  structures, unions, empty/unit ideals, and non-saturated homogeneous ideals;
- equality of Hilbert data for an ideal and its leading ideal;
- comparison with Sage, CoCoA, Macaulay2, and Oscar fixtures;
- exact rational-series equality rather than sampled numerical agreement; and
- characteristic-independent examples plus characteristic-sensitive leading
  ideals.

Acceptance:

- no unproved interpolation is used to guess the Hilbert polynomial;
- positive-dimensional degree is available for projective schemes;
- invalid nonhomogeneous requests explain the required alternative; and
- monomial combinatorics remains ordinary portable Python unless a benchmark
  justifies source-transparent native compilation.

### Phase 4: affine spaces, points, and closed subschemes

Replace the prototypes with a complete minimal affine object model.

1. Support Sage's common constructor orders, including
   `AffineSpace(QQ, 2)` and `AffineSpace(2, QQ)`, with names and coordinate
   ring access.
2. Implement affine points with exact coercion, parent validation,
   coordinate access, equality, hashing where sound, and readable display.
3. Implement closed subschemes with ambient space, defining equations,
   defining ideal, coordinate ring, dimension, codimension, membership,
   equality, containment, intersection, and union.
4. Scheme intersection uses ideal sum. Scheme union uses Phase 2 ideal
   intersection. Neither operation radicalizes.
5. Match Sage's conventions for the empty affine scheme and invalid points
   using recorded fixtures.
6. Make expensive invariants lazy and proof-keyed.

Tests:

- Nils Bruin's `AffineSpace(QQ, 2)` example;
- constructor parity for both argument orders and generated names;
- reduced and nonreduced subschemes with the same point set but unequal scheme
  structure;
- containment reversal between subschemes and defining ideals;
- finite-field point enumeration for bounded spaces; and
- clear errors for mixed parents, unsupported rings, and wrong arity.

Acceptance:

- the minimal public example works identically in the CLI, npm embedding, and
  browser application;
- affine APIs contain no Singular-specific vocabulary or handles; and
- the old prototypes are removed rather than retained as a parallel API.

### Phase 5: projective spaces, points, charts, and closures

1. Implement projective spaces and normalized projective points over the
   supported fields.
2. Validate homogeneous defining equations and create projective closed
   subschemes.
3. Add the irrelevant ideal and exact saturation service used for geometric
   equality and emptiness.
4. Implement standard affine patches by dehomogenization.
5. Implement projective closure of an affine scheme using Gröbner-aware
   homogenization. Either homogenize a basis for an order for which the
   construction is proved correct, or homogenize the submitted generators and
   saturate by the homogenizing coordinate; naïve generator homogenization is
   not accepted. Apply irrelevant-ideal saturation separately when producing
   the canonical `Proj` ideal.
6. Implement closure/patch round-trip checks where the chosen patch meets the
   relevant components.
7. Add dimension, codimension, Hilbert data, and degree via Phase 3.

Tests:

- projectively equivalent coordinate tuples;
- rejection of the all-zero point and nonhomogeneous equations;
- ideals that define the same `Proj` only after saturation;
- components at infinity and examples where naïve generator homogenization is
  wrong;
- empty projective schemes; and
- Sage/Oscar differential fixtures for patches, closure, dimension, and
  degree.

Acceptance:

- every projective comparison documents whether it compares submitted ideals
  or saturated subschemes;
- closure introduces no spurious component supported at infinity and retains
  the genuine boundary subscheme; and
- all operations are available in Wasm with the same capability errors.

### Phase 6: polynomial morphisms and elimination geometry

1. Implement affine polynomial maps with source, target, coordinate
   polynomials, validation against the source ideal, evaluation, composition,
   equality, and display.
2. Implement projective morphisms given by homogeneous coordinates of one
   degree. Initially require an everywhere-defined morphism on the source;
   rational maps with a base locus remain excluded.
3. Implement affine graphs using equations `y_i - f_i(x)`.
4. Implement inverse images by pulling target equations into the source.
5. Implement fibers as inverse images of point subschemes.
6. Implement scheme-theoretic image closure by eliminating source variables
   from the graph ideal. Saturate appropriately in projective cases.
7. Verify that declared codomain equations vanish modulo the source ideal and
   produce an actionable error when they do not.

Tests:

- identity, inclusion, projection, constant, Veronese-style, and finite maps;
- associativity of composition and functoriality of inverse image;
- graph projections and point fibers;
- nilpotent source examples that distinguish scheme-theoretic from set image;
- affine/projective image closures against Sage and Oscar; and
- a projective coordinate tuple with a base point, which must be rejected.

Acceptance:

- image construction verifies the eliminated result by exact containments;
- temporary variables can never collide with user variable names; and
- resource exhaustion is distinguishable from mathematical emptiness.

### Phase 7: tangent spaces, smoothness, and singular subschemes

1. Expose Jacobian matrices using Phase 1 differentiation.
2. Implement the Zariski tangent space at a rational point as the kernel of
   the evaluated Jacobian, including equations/display and dimension.
3. Implement point smoothness for hypersurfaces, complete intersections, and
   other inputs where the local dimension/codimension is certified by the
   supported data.
4. Implement global singular subschemes using the appropriate Jacobian/Fitting
   minors for hypersurfaces and certified pure-dimensional cases.
5. For reducible or non-equidimensional input whose necessary component
   dimensions are unavailable, return a precise unsupported-case error. Do
   not label the result a singular locus merely because one convenient size
   of minors was chosen.
6. Handle characteristic-`p` inseparability honestly; a zero derivative is a
   mathematical result, not a signal to fall back to characteristic zero.

Tests:

- smooth affine and projective spaces;
- smooth and singular hypersurfaces;
- a nonreduced hypersurface;
- a characteristic-`p` polynomial with vanishing formal derivative;
- transverse and nontransverse complete intersections;
- tangent-space comparison with direct linearization; and
- explicit refusal of an unsupported mixed-dimensional case.

Acceptance:

- `is_smooth(P)` never compares tangent dimension with an unjustified global
  dimension;
- the returned singular object is a scheme with the expected ideal, not only
  a list of points; and
- supported results agree with Sage/Oscar fixtures over `QQ` and prime fields.

### Phase 8: affine and projective plane curves

Build curve conveniences on schemes rather than a second algebra system.

1. Implement affine and projective plane-curve constructors as hypersurface
   schemes with curve-specific validation and display.
2. Add defining polynomial, ambient space, degree, projective closure, affine
   patches, Jacobian, tangent space/line at a smooth rational point, singular
   subscheme, and bounded rational-point enumeration over prime fields.
3. Implement arithmetic genus `(d-1)(d-2)/2` for a projective plane curve of
   degree `d`, including nonreduced cases where this is still the arithmetic
   genus of the hypersurface.
4. State explicitly that this is not the geometric genus of a singular curve.
5. Reuse the generic image/fiber/intersection infrastructure; do not add
   curve-only elimination code.

Tests:

- lines, smooth conics, smooth cubics, nodal/cuspidal cubics, reducible curves,
  doubled lines, and characteristic-`p` examples;
- closure and patch round trips;
- singular scheme versus enumerated singular rational points;
- arithmetic genus against the Hilbert polynomial; and
- regression examples from Sage's schemes and curves documentation.

Acceptance:

- every curve method is inherited from or reducible to a tested scheme
  primitive except the explicit plane-curve formulas; and
- unavailable geometric-genus/local-multiplicity methods fail by name with a
  link to the capability documentation.

### Phase 9: zero-dimensional radical and primary decomposition

This phase is deliberately zero-dimensional and field-limited.

1. Consolidate quotient bases, coordinate vectors, multiplication matrices,
   minimal polynomials, and factorization in the quotient-ring layer.
2. Port or independently implement a reviewed zero-dimensional radical
   algorithm for characteristic zero and perfect prime fields. CoCoA's
   `SparsePolyOps-ideal-ZeroDim.C` is the primary code reference; do not
   substitute the incorrect finite-field shortcut that keeps only rational
   points.
3. Split the quotient algebra recursively using factors of separating-element
   minimal polynomials, with deterministic selection first and seeded retry
   only when necessary.
4. Construct primary components by exact ideal operations and recurse until
   the reviewed mathematical criterion holds.
5. Verify every decomposition by checking that the intersection of returned
   components equals the input ideal and that radicals/components satisfy the
   supported zero-dimensional criteria.
6. Define canonical ordering for returned components so repeated calls and
   platforms agree.
7. Preserve the distinction between geometric solutions and base-field
   rational points.

Tests:

- radical, nonradical, primary, reducible, and non-split zero-dimensional
  ideals over `QQ` and several prime fields;
- inseparable-looking characteristic-`p` inputs and extension-field residue
  factors;
- zero and unit ideals;
- decomposition/recomposition and radical idempotence;
- dimension preservation and quotient-dimension sums where applicable;
- Sage, CoCoA, and Macaulay2 oracle fixtures; and
- deterministic concurrency, Wasm memory, and repeated-call tests.

Acceptance:

- positive-dimensional input is rejected before expensive speculative work;
- probabilistic choices under `proof=False` still undergo exact
  recomposition checks;
- `proof=True` has a documented exact certificate/check sequence; and
- no claim of general primary decomposition appears in code or docs.

### Phase 10: integration, examples, and portability qualification

1. Turn `docs/algebraic-geometry.md` into the user guide, with a five-minute
   affine example, a projective plane curve, an elimination image, a Hilbert
   polynomial, and a zero-dimensional decomposition.
2. Add API reference links from the main documentation and the browser app's
   examples.
3. Add readable exception rendering so browser users see the mathematical
   operation, domain/order, proof request, and limitation rather than a raw
   evaluator stack.
4. Add a smoke corpus that runs in the CLI, npm package, Node Wasm, and the
   browser bundle.
5. Qualify the exact candidate on Linux x64, Linux ARM64, macOS ARM64, and
   native Windows x64 according to `RELEASE.md`.
6. Record performance and memory baselines without turning them into unstable
   microbenchmark gates.

Acceptance:

- `AffineSpace(QQ, 2)` and every guide example work in the browser and native
  distributions;
- the npm package can construct and compute with the same objects;
- all capability errors are tested and human-readable;
- the final dependency and artifact audit finds no Singular library, data
  tree, Java/Julia runtime, or hidden subprocess dependency; and
- the complete definition of done below is satisfied.

## Verification strategy

### Differential oracles

Use at least two independent implementations for each difficult new
algorithm where practical:

- SageMath for public semantics and expected user-visible behavior;
- CoCoA for intersection, colon, saturation, Hilbert data, and
  zero-dimensional decomposition;
- Singular for broad ideal-operation comparison only;
- Macaulay2 for Hilbert functions, saturation, elimination, and decomposition;
- Oscar for a modern high-level affine/projective object model and scheme
  behavior; and
- Sage.js's independent exact Buchberger/normal-form path to validate msolve
  candidates on bounded examples.

Oracle output is test data, never trusted blindly. Verify ideal equality by
both containments, scheme equations by reduction, decomposition by exact
recomposition, and numerical invariants by structural identities.

### Metamorphic properties

Random small tests should assert identities rather than compare only printed
generators:

- coordinate changes preserve dimension and Hilbert data;
- generator permutation/scaling does not change an ideal;
- `I + J` and `I intersection J` realize scheme intersection and union;
- homogenization/dehomogenization and chart/closure operations satisfy their
  stated round trips;
- graph projection recovers a map;
- radical is idempotent in the supported zero-dimensional scope;
- primary components intersect back to the original ideal; and
- native, dynamic, and Wasm results have the same canonical public value.

Use deterministic seeds and print the seed with every failure.

### Required repository checks

Every implementation PR runs the focused tests and the deterministic checks
selected by `pnpm test:changed`. Before a phase is declared complete, run as
applicable:

```bash
pnpm format:python
pnpm test:baselib:strict
pnpm architecture:check
pnpm test:portable
pnpm test:wasm
pnpm test:wasm:browser
```

The integration candidate also runs the full native mathematical suite and
the documented four-platform qualification. Native optimization is optional;
portable correctness is not.

## Performance policy

Start with exact ordinary Python algorithms built on the existing Gröbner and
matrix layers. Benchmark before adding native code.

Record representative workloads for:

- ideal intersection and saturation;
- Hilbert series for sparse monomial ideals;
- projective closure and image elimination;
- Jacobian minors for plane curves and complete intersections; and
- zero-dimensional radical/decomposition by quotient dimension and
  coefficient height.

For each benchmark record ring, characteristic, variables, order, generator
count, term count, degree profile, quotient dimension, coefficient height,
proof mode, backend, source revision, platform, time, and peak memory. If a
hotspot justifies acceleration, use source-transparent `@native` compilation
with the same dynamic implementation, differential oracle, inspectable code,
and architecture classification required by `ARCHITECTURE.md`.

Resource policies must bound generated variables, terms, exponent size,
matrix dimensions, quotient dimension, coefficient height, recursion depth,
time, and memory. Exceeding a limit is an explicit resource error, never an
incorrect empty scheme or partial decomposition.

## Upstream use, licensing, and attribution

Pinned local references at the time this plan was written:

| Project | Revision | Intended use |
| --- | --- | --- |
| SageMath | `6cd06ec1acdec7a4516ed9928bd575b7a63999b8` | public-semantics oracle and fixture source |
| Singular | `cca73e3ef1deb1b75c8bbd112dab699fd4fcb888` | differential oracle; elimination, saturation, and primary-decomposition ideas |
| CoCoALib | `9cb5ce485bb5ec56d426747a9c7db2fbf9888d2d` | primary readable reference for ideal operations, Hilbert data, and zero-dimensional algorithms |
| Macaulay2 | `1a37f6fe95badb1e5f99707a485503d213fd9d49` | differential oracle and reference for FGLM, saturation, Hilbert functions, and decomposition |
| Oscar.jl | `63ed738cd9192d9561f79f39a4004c9472d7290b` | high-level API/object-model reference and differential oracle |

Especially relevant starting points include:

- CoCoA `src/AlgebraicCore/TmpGOperations.C` for intersection, colon, and
  saturation;
- CoCoA `src/AlgebraicCore/SparsePolyOps-hilbert.C` and
  `TmpHilbertDir/TmpPoincareCPP.C` for Hilbert data;
- CoCoA `src/AlgebraicCore/SparsePolyOps-ideal-ZeroDim.C` for radical and
  zero-dimensional decomposition;
- Singular `Singular/LIB/elim.lib` and `primdec.lib` for oracle cases and
  alternative derivations;
- Macaulay2 `FGLM.m2` and `Saturation.m2`; and
- Oscar `src/AlgebraicGeometry/Schemes` for affine/projective object behavior.

All four local checkouts are GPL-compatible references, but that does not make
copying anonymous. For every translated or copied fragment, record in
`architecture/upstream-algebra-provenance.json`:

- project and exact revision;
- original file, symbol, and line range;
- original copyright and license notice;
- paper/algorithm citation where available;
- whether the Sage.js implementation is copied, translated, or independently
  reimplemented; and
- the Sage.js files and tests that use it.

Preserve notices in source files where the upstream license requires them.
Verify license terms file by file before copying because repository-level GPL
compatibility does not establish the provenance of every file.

Useful public documentation references:

- [Sage schemes overview](https://doc.sagemath.org/html/en/reference/schemes/sage/schemes/overview.html)
- [Sage affine subschemes](https://doc.sagemath.org/html/en/reference/schemes/sage/schemes/affine/affine_subscheme.html)
- [Sage projective subschemes](https://doc.sagemath.org/html/en/reference/schemes/sage/schemes/projective/projective_subscheme.html)
- [Sage curves reference](https://doc.sagemath.org/html/en/reference/curves/index.html)
- [Sage proof preferences](https://doc.sagemath.org/html/en/reference/structure/sage/structure/proof/proof.html)
- [Oscar algebraic geometry introduction](https://docs.oscar-system.org/stable/AlgebraicGeometry/intro/)

## PR and dependency order

The recommended review order is:

```text
0 contract/corpus
  -> 1 polynomial calculus + quotient rings
       -> 2 ideal operations
       -> 3 Hilbert data
       -> 4 affine schemes
            -> 5 projective schemes
            -> 6 morphisms
            -> 7 Jacobian geometry
                 -> 8 plane curves
       -> 9 zero-dimensional radical/decomposition
  -> 10 integration and four-platform qualification
```

After Phase 1, Phases 2 and 3 can proceed in parallel with the public shell of
Phase 4, provided the quotient/ideal interfaces are frozen first. Phase 9 can
proceed after Phase 2 without waiting for projective schemes. Shared exports,
capability registries, package metadata, and CI files should be owned by an
integration lane if this becomes a parallel project.

Each PR description must state:

- its exact mathematical scope and unsupported inputs;
- its proof behavior and backend choices;
- algorithms and upstream provenance;
- new resource envelopes;
- dynamic/native/Wasm behavior;
- tests and oracle revisions; and
- how the change preserves the mandatory extension-ready boundaries without
  implementing the deferred extension-field plan; and
- which later phase, if any, is required for a higher-level convenience API.

## Definition of done

The no-Singular roadmap is complete only when all of the following hold:

- [ ] `AffineSpace(QQ, 2)` and `AffineSpace(2, QQ)` both work.
- [ ] Affine and projective spaces, rational points, and closed subschemes have
      documented Sage-compatible basic APIs.
- [ ] Polynomial evaluation, simultaneous substitution, derivatives,
      homogenization, and dehomogenization are exact and portable.
- [ ] Quotient rings expose canonical normal-form elements and the existing
      zero-dimensional linear-algebra tools through one API.
- [ ] Ideal intersection, colon, saturation, elimination, containment, sum,
      and membership pass independent differential and metamorphic tests.
- [ ] Hilbert series, Hilbert polynomial, dimension, codimension, and
      projective degree work in their documented graded scope.
- [ ] Scheme intersections, unions, affine patches, and projective closures
      preserve scheme structure.
- [ ] Polynomial morphisms support evaluation, composition, graphs, fibers,
      inverse images, and supported scheme-theoretic image closures.
- [ ] Tangent spaces, supported smoothness tests, and supported singular
      subschemes handle characteristic `p` and nonreduced examples correctly.
- [ ] Plane curves expose degree, arithmetic genus, patches/closure,
      tangents, and singular computations without claiming geometric genus.
- [ ] Zero-dimensional radical and primary decomposition work over `QQ` and
      prime fields, exactly recompose, and reject positive-dimensional input.
- [ ] Every algorithm respects `proof.polynomial()` and an explicit
      `proof=` override.
- [ ] Every unsupported case produces a concise capability error rather than
      a backend stack trace.
- [ ] Public scheme and curve code contains no `QQ`/prime-field backend
      dispatch; coefficient-specific choices live behind polynomial and ideal
      capabilities.
- [ ] Field identity, proof state, order, backend, and resource policy are all
      represented in serialization descriptors and cache keys.
- [ ] `GF(p^d)` and number fields remain explicitly unsupported by this
      milestone and point to `agents/no-singular-extension-fields-plan.md`.
- [ ] Strict Python, architecture, portable, native, Node-Wasm, and browser
      tests pass.
- [ ] Linux x64, Linux ARM64, macOS ARM64, and native Windows x64 qualification
      passes for the exact integration candidate.
- [ ] npm, SEA, and browser artifact audits confirm that no Singular or other
      external CAS runtime is shipped or required.
- [ ] User documentation includes working affine, projective, curve, image,
      Hilbert, and zero-dimensional decomposition examples plus an honest
      limitations table.

Completing this plan would not make Sage.js a replacement for all of Sage,
Singular, Macaulay2, or Oscar. It would make the common global-order,
field-based core of computational algebraic geometry real, portable, and
composable—and it would establish the interfaces on which later major
projects can be built without importing a monolithic CAS runtime.
