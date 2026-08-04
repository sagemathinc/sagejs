# Sage.js low-hanging-fruit queue — fresh pass

Rebuilt on 2026-08-04 after the previous queue was completed.  The old
completed items remain available in Git history; this file contains only new
work.  At this snapshot the PCIMC, Guided Tour, and RH expectation files have
zero skips and zero xfails, and the four-platform CI/SEA matrix is green.

The ordering balances user value, implementation leverage, and verification
cost.  Every **ready** item has a nearby implementation, a precise reference
oracle, and a bounded stopping point.  Sizes describe code surface, not elapsed
time:

- **XS** — one implementation site and one focused differential test.
- **S** — a small semantic cluster, normally one coherent commit.
- **M** — crosses a backend or renderer boundary and may need two commits.
- **measure** — attractive, but not low-hanging until the stated experiment is
  complete.

## First batch — do these in order

1. **ready / XS — generalized binomial coefficients for negative upper
   arguments.**  Replace the explicit rejection in `binomial(n, k)` with the
   exact identity used by Sage, including `k < 0`, zero, parity, and very large
   integer cases.  Compare directly with SageMath and keep the calculation in
   exact integer arithmetic.  Do not broaden this into symbolic binomial
   simplification.

2. **ready / S — `lift_x` on long Weierstrass models in characteristic not
   two.**  Solve
   `y^2 + (a1*x + a3)*y = x^3 + a2*x^2 + a4*x + a6` by completing the square,
   reusing each base field's exact square-root operation.  Cover QQ, real
   fields, and prime finite fields; match Sage's `all=True` result ordering and
   repeated-root behavior.  Leave characteristic two explicitly unsupported
   unless a separate, fully tested linear/quadratic solver falls out naturally.

3. **ready / S — CPython 3.14 `random` core semantics.**  Implement weighted
   `choices` with both `weights` and `cum_weights`, including validation for
   lengths, non-finite totals, non-positive totals, mutual exclusion, and
   integer `k`.  In the same differential slice, make `shuffle` mutate in
   place and return `None`, and fix `sample`/`randrange` argument and population
   edge cases.  Test API semantics and deterministic injected randomness, not
   equality with CPython's Mersenne Twister stream.

4. **ready / S — binary floating-point support in `array.array`.**  Finish
   `frombytes`, `tobytes`, and `byteswap` for typecodes `f` and `d` using the
   runtime's `DataView` boundary.  Pin native-endian IEEE-754 byte vectors,
   signed zero, infinities, NaNs, truncation errors, and round trips against
   CPython on every CI platform.  Preserve the existing pure-Python storage
   model; this is not a typed-array rewrite.

5. **ready / M — explicit modulus polynomials for extension finite fields.**
   Support Sage's common `GF(p^n, 'a', modulus=f)` call forms.  Add the narrow
   FLINT context constructor that accepts normalized coefficient vectors,
   validate characteristic, degree, monicity/normalization, and irreducibility,
   and include the normalized modulus in parent-cache identity.  Require
   arithmetic, coercion, matrix, SagePack, worker-transfer, and Windows tests.
   Do not attempt pseudo-Conway compatibility beyond explicit user input.

6. **ready / M — NumPy `None`/`newaxis` view semantics.**  Extend basic indexing
   to insert one or several axes, including combinations with integers, slices,
   and one ellipsis.  The result must be a view: shape, `ndim`, `.base`, chained
   indexing, and mutation through either side must match NumPy.  Add
   `expand_dims` and `squeeze` only as thin wrappers over the same machinery;
   do not grow this into advanced/fancy indexing.

The first six form a sensible next long implementation turn: the first four
are isolated semantic wins, while the last two are the larger native/backend
payoffs.

## Native algebraic-number-theory lane

The first bounded experiment succeeded: Sage.js now identifies every
transitive Galois group of an irreducible polynomial over `QQ` through degree
four using discriminants, cubic resolvents, and the Kappe--Warren tests, with
FLINT polynomial factorization underneath.  That result supports extracting
algorithms individually instead of making PARI's `GEN` stack a foundational
runtime dependency.

- **ANT-1 / ready / M — imaginary quadratic orders and class groups.**  Start
  with squarefree negative radicands.  Implement the correct integral basis
  and field discriminant, enumerate reduced primitive positive-definite binary
  quadratic forms, and expose `class_number()` plus a genuinely composable
  finite `class_group()`.  Compare reduced representatives, composition,
  inverses, and invariant factors with Sage and PARI.  Keep real quadratic
  units and general number-field ideals out of this slice.

- **ANT-2 / measure — Galois groups in degrees five through seven.**  Assemble
  a balanced Sage/PARI corpus for every transitive label and inventory the
  required resolvents and invariant tables.  Prototype modular Frobenius cycle
  filtering over the existing finite-field factorization before choosing the
  smallest exact resolvent set.  Do not ship a probabilistic label without a
  deterministic certificate.

- **ANT-3 / measure — general maximal orders, ideals, units, and class
  groups.**  Map the reusable FLINT-backed prerequisites first: integral
  bases/maximal orders, HNF ideal lattices, prime decomposition, ideal
  arithmetic, Minkowski/LLL bounds, relation collection, regulators, and
  certification.  PARI remains the reference oracle and a possible optional
  isolated backend, not an excuse to expose raw `GEN` ownership in the public
  object model.  Break this into vertical slices only after the dependency map
  and proof semantics are explicit.

## Second batch

7. **ready / S — `multiprocessing.Pool(maxtasksperchild=...)`.**  Count completed
   jobs per persistent evaluator and recycle an evaluator at the configured
   boundary without losing queued work, callbacks, exceptions, or shutdown
   state.  Match CPython validation and demonstrate state reset with one and
   several workers.  This remains worker-thread isolation, not process
   emulation.

8. **ready / S — one graphics size contract for display and export.**  Specify
   and enforce precedence among `figsize`, `dpi`, `save(width=, height=,
   scale=)`, Plotly layout dimensions, and raster/vector output dimensions.
   Cover 2D, 3D, composed graphics, HTML/JSON, PNG, and SVG.  Inspect actual PNG
   headers and SVG dimensions instead of testing only option objects.  Keep SEA
   raster export out of scope until Chromium is deliberately bundled.

9. **ready / M — Wolfram graphics options after the existing directive core.**
   The basic color, opacity, thickness, point-size, and primitive translation
   already work.  Add the next coherent slice: nested `Directive`, `EdgeForm`,
   `PlotRange`, `Axes`, `Boxed`, and non-cubic `Cuboid`; propagate options
   consistently through `Graphics` and `Graphics3D`.  Use normalized Plotly
   assertions plus a few image smokes.  Defer lighting models unless Plotly can
   represent the requested option without inventing Mathematica semantics.

10. **ready / M — enforce package capability manifests.**  Extend the existing
    boundary checks so every package/native capability declares dependency
    layer, eager versus lazy loading, browser fallback, serialization types,
    and Windows support.  Fail CI on undeclared cross-layer imports and on a
    native-only feature without a tested capability failure/fallback.  This is
    the architectural cleanup to do before adding more packages during release
    work.

## Measure first — not yet low-hanging

11. **measure — adaptive and Clough 3D surface interpolation.**  Build a Sage
    comparison corpus for smooth, oscillatory, singular, and sparse point-cloud
    examples.  Record sample counts, topology, error witnesses, and renderer
    payload size.  Only then choose whether adaptive `plot3d` refinement and
    `list_plot3d(..., interpolation_type='clough')` are separate algorithms or
    can share triangulation/refinement infrastructure.  The current explicit
    errors are preferable to an unverified visual approximation.

12. **measure — Dirichlet-character newspaces.**  Generate a grid over levels,
    conductors, character orders, weights, signs, and coefficient-field
    degrees.  First classify exactly when the character descends to each lower
    level and compare dimensions/maps with SageMath.  Implementation starts
    only after the lowering rules and reference witnesses are stored; this is
    mathematically important but no longer honestly “low-hanging.”

## Completion rule

An item is complete only when Sage.js semantics are checked against the named
reference, focused regression tests pass, relevant strict/native/Windows
checks pass, documentation is updated where public behavior changed, and the
item is committed and pushed.  If the first implementation probe reveals an
unstated algorithmic dependency, move the item to **measure** and record the
specific blocker rather than growing its scope silently.
