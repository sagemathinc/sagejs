# Numerical linear algebra integration requests

This lane intentionally did not edit shared registries, package manifests,
package graphs, `pyrightconfig.json`, or either parent `__init__.py`. The
integration lane should make the following changes atomically with its shared
surface review.

## Public exports and planning

- Re-export the domain entry points `solve`, `least_squares`, `lu`, `qr`,
  `cholesky`, `matrix_rank`, `condition_number`, `determinant`, and `inverse`
  from `sagejs.numerics`, resolving the generic name collision between root and
  linear solve planning explicitly rather than through import order.
- Add the nine implemented operations and their exact envelopes from
  `support-matrix.json` to shared capability discovery and the numerical
  surface ledger.
- Add the six domain Python files to `pyrightconfig.json`; standalone Pyright
  validation is already zero-error.
- Extend `pnpm test:numerics` to discover
  `test/numerics/linear_algebra/linear-algebra.cjs` or rely on the repository's
  tier-based discovery consistently.

## Shared status codes

Add these `NumericalResult.status` identities so the domain no longer has to
map them to `invalid_problem` or `validation_failed`:

- `rank_deficient`
- `matrix_not_square`
- `dimension_mismatch`
- `not_symmetric`
- `not_positive_definite`
- `rank_diagnostic_indeterminate`
- `cancellation_callback_error`
- `nonfinite_intermediate`

`cancelled`, `maximum_iterations`, `converged`, `invalid_problem`, and
`validation_failed` already exist. After normalization, retain
`LinearAlgebraResult.failure_code` as the domain payload identity only if the
common status does not fully describe a failure; the greenfield rule favors
one canonical code over aliases.

## Shared diagnostic codes

Add stable definitions for:

`maximum_elapsed_time` already exists in the shared registry and is used
directly by this lane for elapsed-time exhaustion. Add the remaining stable
definitions:

- `rank_deficient` — warning/validation; suggest rank inspection, rescaling,
  reformulation, or an SVD/pseudoinverse method when available.
- `matrix_not_square` — error/planning; suggest `least_squares` for rectangular
  intent.
- `dimension_mismatch` — error/planning; include coefficient and right-side
  shapes.
- `not_symmetric` — error/validation; include the first mismatching indices and
  threshold.
- `not_positive_definite` — error/validation; include the failed leading minor
  and pivot.
- `rank_diagnostic_indeterminate` — warning/validation; distinguish an
  exhausted rank diagnostic from a demonstrated deficient rank.
- `cancellation_callback_error` — error/execution; include the exception type
  without serializing exception text or a traceback.
- `nonfinite_intermediate` — warning/execution; recommend rescaling or a wider
  numeric type while preserving the finite-input distinction.
- `determinant_not_representable` — warning/validation; direct callers to the
  retained sign/log magnitude instead of using generic loss-of-significance
  prose.

The lane currently uses `ill_conditioned`, `validation_failed`,
`loss_of_significance`, and `cancelled` where those are semantically valid and
preserves the exact code in `domain_payload.failure_code`.

## Shared result/API behavior

- Extend common result dispatch so `refine()` can invoke linear-solve
  refinement from retained problem data, while rejecting operations for which
  refinement has no defined meaning. This lane performs refinement during
  `solve`/`inverse`; it does not override the root-only common method.
- Decide whether factorization results remain domain-typed extensions or the
  common result gains an optional typed artifact field. The serialized value
  is already backend-neutral.
- Add a JSON-safe common representation for infinite/undefined condition
  estimates. This lane uses `None` plus `condition_kind`; emitting JSON
  `Infinity` would violate the deterministic shared serializer.
- If the public Sage `Matrix.solve_right`, `determinant`, or `inverse` views are
  connected, preserve exact-ring behavior and require an explicit inexact or
  structured-result path. Do not route exact matrix operations through
  binary64 based on a method name.
- Keep the domain package lazy. Loading root finding should not eagerly pay for
  the linear algebra source or future backend pack.
