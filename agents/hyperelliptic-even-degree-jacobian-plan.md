# Split even-degree hyperelliptic Jacobians

## Status

Implemented and release-validated on 2026-08-25. The production mathematical
implementation is commit `2f1e296481aef4455ccd0aa35199692e44509116`.
This is a mathematical correctness and API expansion, not a native-performance
project.

The first production slice is deliberately narrow:

- genus 2 and genus 3;
- smooth even-degree models in odd characteristic;
- finite prime base fields;
- two distinct rational points at infinity (the split case);
- exact ordinary-Python Jacobian arithmetic with explicit fallback semantics.

The initial implementation must not add a native representation, capsule
registry, arena, map, owned aggregate, handwritten Cantor code, or a hidden
conversion to an odd-degree model. Native acceleration is a later measured
slice after the dynamic representation and its mathematical contract are
stable.

The completed slice provides:

- exact split `(u,v,n)` arithmetic for smooth genus-2 and genus-3 even-degree
  models over odd prime fields with two rational points at infinity;
- generalized `y^2+h*y=f` equations, deterministic infinity orientation,
  point/basepoint construction, addition, doubling, negation, subtraction,
  scalar multiplication, order, serialization, enumeration, sampling, and
  group-structure maps/certificates;
- the Sage-compatible `Jacobian(H)` facade and model-specific capability
  errors for unsupported consumers;
- a pinned SageMath differential corpus, the `[P-P]` cancellation regression,
  exhaustive genus-2 `GF(3)` group-law coverage, complete genus-3 `GF(5)`
  enumeration, adversarial authority/transplant tests, and verbatim executable
  documentation examples.

The implementation deliberately remains ordinary reference arithmetic.
`algorithm="auto"` selects it, while `algorithm="native"` fails explicitly;
there is no split packed schema or new low-level representation machinery.
Characteristic two, inert infinity, `QQ`, extension-field release claims,
Kummer/height support, and native split arithmetic remain deferred exactly as
listed below.

Release validation completed with a policy-enabled 7-stage production build,
focused odd/split suites (22/22), strict CPython/Ruff/Pyright checks (239
modules, zero errors), architecture validation (1122 boundaries and 998 Wasm
capabilities), the complete unit tier (71/71 files), and the complete portable
tier (65/65 files). The focused split suite passed 8/8 on native Windows x64.
Because the shared `jacobian.py` source is part of the authenticated native
Cantor source bundle, the existing odd-model auto-selection policy was also
re-frozen—without widening its envelope—against 24 exact current-source
receipts across Linux x64, Linux ARM64, macOS ARM64, and Windows x64. Split
models are not authorized for those native entries.

## Objective

Make the following a supported exact computation:

```sage
sage: R.<x> = GF(101)[]
sage: H = HyperellipticCurve(x^8 + x + 1)
sage: J = H.jacobian()
sage: P = H(...)
sage: D = J.point_to_divisor(P)
sage: D - D
0
```

For this model the equation at infinity is `t^2 - 1 = 0`, so there are two
rational points `infinity_plus` and `infinity_minus`. The implementation must
distinguish them and must represent their contribution to divisor classes.

Success means more than accepting construction. Addition, reduction,
negation, scalar multiplication, equality, hashing, point conversion,
serialization, and reference replay must all use one canonical split-model
representation. No operation may silently forget the infinity contribution.

## Motivation

The curve layer already accepts branch degree `2g+1` and `2g+2`, and point
enumeration already distinguishes rational points at infinity. The Jacobian
layer nevertheless rejects every even-degree model because its current
reduced Mumford representation `(u,v)` assumes a unique point at infinity.
This leaves a visible gap between the supported curve models and their most
important arithmetic object.

SageMath PR [#42373](https://github.com/sagemath/sage/pull/42373) is both a
useful implementation reference and a warning. Sage already had split
even-degree arithmetic, but `[P-P]` could be nonzero because a cancellation
degree returned by generic Cantor composition was discarded by the split
constructor. In the split representation, each cancelled inverse pair also
contributes at infinity. Correct affine polynomials are therefore not enough;
the infinity coordinate is part of the exact group element.

The relevant upstream behavioral oracles are Sage's generic and split
Jacobian homsets:

- `jacobian_homset_generic.py` for composition and unified construction;
- `jacobian_homset_split.py` for the extra infinity coordinate, balancing,
  and split-model reduction.

The Sage.js implementation should follow the mathematics and differential
behavior, without copying Sage's class layout merely for superficial parity.

## Current Sage.js boundary

The existing implementation in
`src/lib/sagejs/hyperelliptic_curves/jacobian.py` has these intentional
odd-model invariants:

- a divisor is completely determined by a canonical reduced `(u,v)` pair;
- `deg(u) <= g`, `deg(v) < deg(u)`, and
  `u | v^2 + h*v - f`;
- `(1,0)` is zero;
- every projective point at infinity maps to zero;
- reduction and composition return only `(u,v)`;
- equality, hashing, serialization, certificates, enumeration, and group
  consumers assume that `(u,v)` is complete authority.

The prepared/native layers strengthen that contract rather than generalizing
it. They authenticate model kind `odd-degree-one-infinity` and schema
`sagejs.hyperelliptic.packed-mumford.odd.v1`. The finite-field kernels,
rational FLINT resources, Kummer arithmetic, heights, saturation, and receipt
policy are all explicitly bound to that odd-degree model kind.

Consequently, deleting the constructor guard or feeding an even-degree curve
to the current kernels would be a correctness bug.

## Mathematical model classification

For `y^2 + h(x)y = f(x)` in odd characteristic, let `g` be the genus and
consider an even branch-degree model. In the standard weighted projective
chart, the points at infinity are determined by

```text
t^2 + h_(g+1) t - f_(2g+2) = 0.
```

The Jacobian constructor must classify the model from this exact polynomial:

- **odd / one infinity:** retain the existing implementation unchanged;
- **even split:** two distinct roots in the base field; supported by this
  plan;
- **even inert:** roots only after a quadratic extension; explicitly deferred;
- **singular or repeated infinity:** reject through the existing smooth-model
  validation;
- **characteristic two:** explicitly deferred.

For the first prime-field slice, order the two roots by their canonical
integer lifts. Store that orientation in the Jacobian's model identity. The
first root defines `infinity_plus`, the second `infinity_minus`, and all
basepoint-relative constructors use `infinity_plus`. Reconstruction must
validate the same oriented model identity rather than recomputing an
implementation-dependent square-root choice.

This ordering is a representation convention, not an assertion that the two
points are intrinsically ordered.

## Representation contract

### Split canonical value

A split divisor class requires a canonical triple

```text
(u, v, n)
```

where `(u,v)` is the affine Mumford part and `n` is the balanced infinity
coordinate relative to the ordered pair `(infinity_plus, infinity_minus)`.
The precise allowed interval for `n` and the balancing steps must be derived
from the split Cantor reduction algorithm and documented beside the code.

Required invariants are:

- `u` is monic and nonzero;
- `deg(v) < deg(u)` unless `u = 1`;
- `u | v^2 + h*v - f`;
- `(u,v,n)` satisfies the split reducedness and balancing inequalities;
- canonical reduction is deterministic and idempotent;
- zero has exactly one canonical triple;
- equality and hashing compare all three canonical coordinates;
- negation transforms both the affine and infinity coordinates;
- serialization, certificates, and parent/model fingerprints include `n`
  and the oriented infinity data.

The implementation must use either a separate split divisor class or a
mandatory tagged coordinate record. It must not encode split elements as an
ordinary `MumfordDivisor` with an optional, casually ignored `n=None` field.
Any helper that accepts both representations must dispatch on an exact model
strategy before inspecting coordinates.

### Composition contract

Factor the mathematical affine composition so it can return

```text
(u, v, cancellation_degree)
```

before model-specific reduction. The existing odd strategy may discard the
extra value only because its unique infinity absorbs it. The split strategy
must incorporate it into `n` before balancing. This is the specific invariant
whose omission caused the Sage bug.

Refactoring this helper must preserve every existing odd-degree reference row
and certificate digest. The split implementation may not become the hidden
implementation of the mature odd native path.

### Authority and mutability

Canonical Python polynomials plus the exact integer infinity coordinate are
the initial semantic authority. Returned coordinate tuples and serialized
data are detached values. Mutation or rebinding of public attributes must not
change an existing divisor's group value.

There is no split packed/native schema in the first slice. If acceleration is
later justified, it receives a new model kind and versioned schema; it cannot
extend the odd eight-word row while retaining the old schema name.

## Public API contract

### Parent construction

- `H.jacobian()` constructs a split Jacobian for a supported model.
- `Jacobian(H)` should be exported through the Sage facade as the equivalent
  conventional factory. The current `NameError` is an independent API gap and
  should not be confused with even-degree arithmetic.
- `J.model_kind()` or the existing capability report must distinguish
  `even-degree-split-two-infinity` from `odd-degree-one-infinity`.
- `J.infinity_points()` returns the two ordered curve points used by the
  representation.

### Element construction

- `J(0)` returns the unique zero.
- `J(P)` means the class `[P - infinity_plus]`.
- `J.point_to_divisor(P, basepoint=...)` accepts either infinity point as an
  explicit basepoint and records the mathematically equivalent canonical
  result.
- `J(infinity_plus)` is zero; `J(infinity_minus)` is generally not zero.
- a low-level canonical constructor accepts `(u,v,n)` and validates every
  invariant;
- if `(u,v)` is accepted as convenience input, its meaning is explicitly the
  affine effective divisor minus `deg(u)*infinity_plus`, followed by split
  reduction. It must not mean “guess the missing `n`.”
- cross-parent, cross-orientation, and cross-field elements are rejected.

The current `.uv()` accessor is not a complete split value. It may remain an
odd-model convenience, but split code must use a full accessor such as
`.mumford_coordinates()` returning `(u,v,n)`. Packing, equality, hashing,
copying, or serialization through `.uv()` alone is prohibited.

### Algorithms and fallback

- `algorithm="reference"` uses the ordinary split implementation.
- `algorithm="auto"` also uses reference arithmetic until a separately
  receipted native capability exists.
- `algorithm="native"` raises a deterministic capability error for split
  models in the first slice.
- lack of a compiler, FLINT, or a production kernel cannot affect correctness.

Unsupported consumers must fail with a model-specific message. They must not
silently transform the curve, drop the infinity coordinate, or call an odd
kernel.

## Initial scope

### Required for the first release slice

- smooth genus-2 and genus-3 split even-degree models;
- odd prime fields;
- generalized equations `y^2+h*y=f`;
- deterministic infinity classification and orientation;
- zero, equality, hashing, representation, and full-coordinate access;
- checked construction from points and canonical coordinates;
- addition, doubling, negation, subtraction, and integer scalar
  multiplication;
- deterministic canonical serialization and reconstruction;
- exact reference element-order certificates where the existing generic
  certificate machinery can consume the new representation safely;
- `J.order()` through an already-valid even-degree Frobenius path;
- explicit capability/fallback reporting;
- SageMath differential and exhaustive small-field validation.

### Deferred

- characteristic two;
- inert even-degree models whose infinity points are quadratic conjugates;
- arbitrary finite extension fields as a claimed public envelope;
- automatic or hidden conversion to an odd-degree model;
- rational `QQ` split arithmetic as a release claim;
- prepared/native arithmetic and a split packed schema;
- Kummer coordinates and genus-2 canonical heights;
- genus-3 heights, rational sections, and Abel--Jacobi basepoint machinery;
- saturation and rational torsion extensions;
- smalljac or rforest selector changes;
- a claim that existing point enumeration, random sampling, group structure,
  inverse maps, or discrete-log certificates support split models before each
  has a dedicated audit and differential test.

An explicit, checked `odd_degree_model()` transformation may be designed in a
later project. It must return the transformed curve and forward/inverse maps;
it must never be an invisible implementation detail of `H.jacobian()`.

## Implementation phases

### Phase 0: freeze oracles and existing behavior

1. Record the current odd-degree genus-2/3 Jacobian corpus and certificate
   digests.
2. Add the motivating `GF(101)` split model and small split models over several
   odd primes to a SageMath oracle generator.
3. Record canonical results for zero, both infinities, affine points,
   addition, doubling, inverse, subtraction, and bounded scalars.
4. Include Sage's `[P-P]` regression and cases with nonzero cancellation
   degree.
5. Confirm that unsupported inert and characteristic-two cases continue to
   fail explicitly.

No production guard is removed in this phase.

### Phase 1: classify infinity and complete the public curve API

1. Add one exact model-classification helper in the curve/model layer.
2. Reuse the existing projective point representation, which already stores
   the infinity `y` coordinate, to expose the two distinct rational infinity
   points.
3. Freeze deterministic prime-field orientation and include it in parent
   identity/fingerprints.
4. Export `Jacobian(H)` as the conventional facade entry point delegating to
   `H.jacobian()`.
5. Add focused construction, point equality, hashing, change-ring, and
   cross-parent tests before enabling arithmetic.

### Phase 2: split canonical representation and reduction

1. Introduce the mandatory `(u,v,n)` authority and a split-specific element
   implementation/strategy.
2. Port the exact balancing/reduction logic from the mathematical algorithm,
   using Sage as a behavioral oracle.
3. Implement validation, zero, full coordinates, representation, equality,
   hashing, and negation.
4. Prove reduction terminates through a decreasing measure; retain an explicit
   bounded-step assertion as corruption defense.
5. Add idempotence and uniqueness tests over exhaustive small fields.

At the end of this phase, elements can be constructed and normalized, but
general addition need not yet be exposed.

### Phase 3: composition and the group law

1. Refactor generic affine Cantor composition to return the cancellation
   degree with `(u,v)`.
2. Preserve the odd strategy and all existing odd differential tests.
3. Implement split composition, doubling, inverse, subtraction, and scalar
   multiplication, always incorporating the cancellation degree before final
   balancing.
4. Test all special gcd branches, inverse-pair cancellation, common support,
   doubling, zero, and both infinity points.
5. Enable public split arithmetic only after exhaustive group axioms pass.

### Phase 4: construction, serialization, and certificates

1. Implement point-to-divisor conversion relative to the chosen or explicit
   basepoint.
2. Implement checked `(u,v,n)` and documented `(u,v)` convenience
   construction.
3. Add a new versioned split serialization schema containing the oriented
   infinity model and `n`.
4. Reject transplant, orientation changes, noncanonical integers, malformed
   polynomials, and altered model data.
5. Audit element-order certificates so verification reconstructs the full
   split value on the reference path.

The existing odd serialization schema and its digests remain byte-for-byte
unchanged.

### Phase 5: finite-field consumers

Audit consumers one at a time. For each consumer, either add a split-model
differential test and enable it or retain an explicit capability error.

Suggested order:

1. `J.order()` and local Frobenius reuse;
2. bounded random elements from sums of curve points;
3. complete small-field enumeration;
4. element-order certificates;
5. group structure and forward/inverse maps.

Do not infer support merely because a consumer only appears to call `+` and
scalar multiplication. Certificates, samplers, serialization, and model
fingerprints may contain independent odd-degree assumptions.

### Phase 6: evaluate broader exact domains

After the finite-prime-field slice is stable:

1. evaluate split models over `QQ` using the same ordinary representation;
2. evaluate finite extension fields with explicit infinity orientation;
3. design the inert representation and descent contract separately;
4. decide whether any explicit odd-degree transformation API is useful.

Each is a separate capability expansion with its own oracle corpus.

### Phase 7: measured native evaluation

Only after the first compiler live-exact-workspace slice has been evaluated
and a profile shows a meaningful arithmetic bottleneck:

1. benchmark dynamic split composition and reduction independently from
   construction and publication;
2. prototype one narrow source-transparent kernel using accepted compiler
   facilities;
3. retain a new split packed schema only if it materially improves a public
   workload;
4. require CPython/dynamic/native/Wasm differentials and Windows fallback;
5. keep auto-selection disabled until exact platform receipts authorize the
   new model kind and workload envelope.

No new low-level representation facility should be invented inside this
project to make a benchmark pass.

## Correctness matrix

### Deterministic examples

- the motivating genus-3 `GF(101)` curve `y^2=x^8+x+1`;
- genus-2 and genus-3 generalized `h != 0` models;
- affine points and both infinity points;
- divisors with `u=1`, full-degree `u`, shared support, and repeated support;
- additions with cancellation degree `0`, `1`, and larger values when the
  genus permits;
- model orientation and serialization round trips.

### Exhaustive tests

For small odd prime fields and multiple smooth split curves:

- enumerate every canonical split representation independently;
- verify closure and canonical uniqueness;
- check zero, inverse, commutativity, and associativity for the complete group
  where feasible;
- compare group cardinality with the independently computed Jacobian order;
- replay every point-generated divisor and every serialized element.

### Randomized differential tests

Across genera 2 and 3, several odd primes, generalized models, and extension
fields used only as non-claimed oracle coverage:

- compare canonical group expressions with SageMath;
- check `[P-P]=0` and mixed infinity expressions;
- compare bounded random operation trees and scalar multiples;
- verify change-of-ring behavior where both systems support it.

Randomness affects coverage only. Every accepted result is exactly checked.

### Adversarial tests

- malformed or noncanonical `n`;
- valid `(u,v)` paired with the wrong `n`;
- altered infinity orientation;
- cross-parent and cross-model transplant;
- mutable returned coordinate/serialization data;
- module helper or class rebinding in compiled Sage mode;
- unsupported inert/characteristic-two/native requests;
- stale odd packed capsules presented to a split parent;
- cancellation paths that would reproduce Sage PR #42373 if `s_deg` were
  ignored.

## Performance policy

The first release gate is correctness and usable asymptotic behavior, not
PARI/Magma parity. Record separately:

- checked construction;
- reduction;
- addition and doubling;
- scalar multiplication;
- serialization/materialization;
- finite-field consumer overhead.

Use the existing odd implementation as a same-codebase reference and SageMath
as a behavioral/performance comparison. A split operation should not be
quadratic in field size or enumerate the Jacobian. Any competitive claim must
use equal mathematical outputs and exact source/host receipts.

Odd-degree performance must not regress materially. If shared composition
refactoring moves an established odd benchmark by more than 5%, profile and
justify it or split the paths before merging.

## Architecture and release gates

The split finite-field slice is ready to merge only when all of the following
hold:

- mathematical source remains ordinary CPython-parseable Python;
- `pnpm test:baselib:strict` has zero errors;
- focused odd and split Jacobian suites pass;
- exhaustive small-field group-law tests pass;
- the SageMath differential corpus passes;
- existing odd canonical rows, serialization, and certificate digests are
  unchanged;
- native/prepared `auto` falls back and `native` fails explicitly;
- every existing higher-level consumer is either tested for split models or
  rejects them explicitly;
- `pnpm architecture:check`, `pnpm test:unit`, and the relevant portable suite
  pass;
- a clean Windows run proves construction and the ordinary fallback;
- documentation states the split/inert/characteristic-two boundary;
- the worktree is clean and the implementation is committed in coherent
  phases.

## Likely files and ownership

The implementation should begin in a dedicated parallel lane with narrow
claims. Likely paths are:

- `src/lib/sagejs/hyperelliptic_curves/model.py` for exact infinity
  classification and points;
- `src/lib/sagejs/hyperelliptic_curves/jacobian.py` for the public parent and
  common affine composition contract;
- a new ordinary module such as
  `src/lib/sagejs/hyperelliptic_curves/jacobian_split.py` for split reduction
  and element strategy;
- `test/hyperelliptic-even-degree-jacobian.cjs` for focused and adversarial
  coverage;
- `bench/hyperelliptic/oracles/` for pinned SageMath differentials;
- the public facade/export and test manifest as coordinated integration files.

Do not claim or edit native kernels, FFI declarations, packed-resource
registries, Kummer/heights modules, or auto-receipt policy during the first
slice.

## Honest stopping conditions

Stop and narrow the claim rather than improvising if any of these occurs:

- canonical balancing cannot be stated as a unique checked invariant;
- a constructor must choose between the infinity points nondeterministically;
- an existing odd consumer would need to infer or discard `n`;
- Sage and the independent exhaustive oracle disagree;
- supporting inert infinity would require quietly extending the base field;
- performance pressure suggests a new capsule, arena, map, or handwritten
  group law before the dynamic design is correct;
- an upstream formula applies only to `h=0` but the code is being generalized
  to `h != 0` without a derivation and differential evidence.

The acceptable first outcome is a smaller, explicit split-prime-field
capability with exact arithmetic. A broad-looking interface that loses the
infinity coordinate is not an acceptable outcome.
