# Public WebAssembly fallback audit

## Why this audit exists

Issue #85 exposed a release-gate defect rather than two isolated missing methods.
The WebAssembly capability registry called many Node-API exports
`portable-fallback` even when its cited evidence exercised only the native Node
addon. A browser release could therefore pass architecture checks while a public
Sage expression failed with `backend.<name> is not a function`.

The governing rule is now: a public portable-fallback claim needs an executable
Node-Wasm regression, and representative public workflows also belong in the
real browser parity corpus with an observed capability route.

## Reproduction and inventory

The production Node-Wasm artifact reproduced both reports from issue #85:

- `random_matrix(GF(7^2,'a'),10)` failed at the absent `fqMatrix` Node-API
  method.
- `BrandtModule(3,11)` failed at the absent
  `p1ListDegeneracyMatrix` method.

A broader public corpus also found failures in `factorial`, `binomial`,
`prime_pi`, complex matrices, elliptic-curve scalar multiplication, advanced
extension-field polynomial operations, power series, Dirichlet characters, and
higher-weight modular symbols.

`architecture/wasm-public-fallback-audit.json` is a reproducible static
inventory. Its companion test instantiates the production Wasm backend, compares
it with every reviewed Node-API `portable-fallback`, and scans public Python
source for direct references to absent same-name methods. A direct reference is
a review lead, not proof of a bug: some paths have an explicit capability guard
or use a generated FFI resource under the same public operation.

## Corrected in this change

- Exact `factorial` and `binomial` implementations in the host-independent
  runtime.
- Exact `prime_pi` through the shared native/Wasm Lehmer core, including large
  inputs such as `10^12`.
- Ordinary exact matrix storage and algorithms for extension fields when the
  `fqMatrix` Node adapter is unavailable: entries, arithmetic, transpose,
  determinant, rank, RREF, and right kernel.
- Ordinary complex matrix storage and the corresponding basic matrix algorithms
  when `acbMatrix` is unavailable.
- Exact affine elliptic-curve scalar multiplication when the prime-field native
  accelerator is unavailable.
- Weight-2 Brandt degeneracy matrices through the host-neutral modular-symbol
  core compiled into the authenticated Wasm artifact.
- Explicit runtime observations for the portable routes, plus routine Chromium
  parity cases for all of the workflows above.

The follow-up closure also adds:

- Exact extension-field polynomial factorization, roots, irreducibility, and
  quotient/remainder through ordinary CPython-parseable finite-field code,
  while retaining the native resource fast path when it is installed.
- Host-neutral exact polynomial truncation, shifts, inflation, low products,
  truncated powers, valuations, inverse series, and exact division for the
  integer, rational, and modular polynomial stores used by power series.
- Approximate real/complex eigensystems through an Arb/Acb Wasm adapter, with
  the same ordering and left/right eigenvector contract as native Sage.js.
- Exact tracked cyclotomic expressions and Dirichlet Gauss sums, Jacobi sums,
  generalized Bernoulli numbers, and root numbers without a Node-only QQbar
  coordinate adapter.
- Exact higher-weight and character Manin presentations. Real characters stay
  rational end-to-end; non-real characters use the algebraic Wasm backend.
- Public storage-independent implementations of matrix zero tests, stacking,
  augmentation, and modular packing/unpacking.
- A shared public corpus that runs unchanged under Node-Wasm and real Chromium.

Changing the Wasm build recipe invalidated the frozen hyperelliptic automatic
selection receipts. The policy is deliberately disabled until those receipts
are regenerated; unmatched hyperelliptic work continues to use the exact
fallback.

## Remaining reviewed work

The inventory deliberately remains nonempty because it is a conservative
same-name scan. Many listed names are guarded native fast paths whose public
operation is now covered by the corpus above; for example, the `fqPoly*`,
`fqMatrix`, `acbMatrix`, and `matrixApproxEigensystem` names remain visible in
source without being required by the Wasm route.

The remaining distinct feature groups include cyclotomic matrix polynomial and
kernel helpers, cyclotomic polynomial factorization, character Hecke matrices,
higher-weight Hecke and degeneracy matrices, the older `ManinRelations`
presentation API, Eisenstein-series construction, and the primitive-root fast
path. Each needs its own public-workflow review before being claimed as browser
portable.

## Release implication

A future release candidate should run both the static inventory test and the
routine browser parity corpus. Release-tier parity should be expanded as the
remaining groups are implemented. Native tests alone are not evidence for a
browser fallback.
