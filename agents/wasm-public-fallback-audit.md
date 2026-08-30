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

Changing the Wasm build recipe invalidated the frozen hyperelliptic automatic
selection receipts. The policy is deliberately disabled until those receipts
are regenerated; unmatched hyperelliptic work continues to use the exact
fallback.

## Remaining reviewed work

The inventory deliberately remains nonempty. The main unresolved groups are:

- advanced extension-field polynomial factorization, roots, irreducibility,
  and exact division;
- truncated/inverse power-series operations;
- advanced approximate-matrix operations such as eigensystems;
- exact cyclotomic and Dirichlet-character sums;
- character and higher-weight modular-symbol presentations;
- several matrix packing/augmentation helpers whose public callers need to be
  checked for existing guarded resource paths.

These must not be described as browser-supported merely because their native
differential tests pass. Each group needs either a source-level exact fallback,
a host-neutral shared core compiled into Wasm, or an explicit unavailable
capability with a useful public error.

## Release implication

A future release candidate should run both the static inventory test and the
routine browser parity corpus. Release-tier parity should be expanded as the
remaining groups are implemented. Native tests alone are not evidence for a
browser fallback.
