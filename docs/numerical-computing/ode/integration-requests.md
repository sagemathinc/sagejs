# ODE integration requests

The ODE lane intentionally did not edit shared registries, package metadata,
parent `__init__.py` files, the package graph, or `pyrightconfig.json`. The
integration lane should make these exact changes after review.

## Public API and strict source

1. Re-export `OdeEvent`, `OdeInvariant`, `OdeProblem`, `OdeResourceBudget`,
   `OdeResult`, `OdeTrajectory`, `OdeUnsupportedError`, `ode_capabilities`,
   `ode_problem`, `plan_ode`, `solve_ivp`, `solve_ode_problem`, and
   `supports_ode` from `src/lib/sagejs/numerics/__init__.py`.
2. Add every `src/lib/sagejs/numerics/ode/*.py` file to `pyrightconfig.json`
   after strict checking at zero errors.
3. Add `test/numerics/ode/ode-laboratory.cjs` to `pnpm test:numerics`, or change
   that command to discover numerical domain tests by metadata.

## Capability and evidence registries

1. Add operation `initial_value_problem` to
   `docs/numerical-computing/surface.json` with RK4 and RK45 implemented and
   Radau/BDF/LSODA/SUNDIALS explicitly unsupported.
2. Extend the shared result/problem schema only where the reviewed ODE payload
   requires formal domain-specific validation. The existing `domain_payload`
   already serializes the implementation without a schema relaxation.
3. Link this documentation from `docs/numerical-computing/README.md`.

## Shared statuses and diagnostics

The current shared envelope lacks several semantically precise ODE identities.
The lane preserves the exact reason in `OdeResult.termination_reason` and trace
data while using the nearest valid shared status. Normalize these centrally:

| Requested shared identity | Current envelope identity | Required fields |
|---|---|---|
| `maximum_elapsed_time` | `backend_failure` on the isolated pre-integration base; exact status when shared support is present | `elapsed_ms`, `max_elapsed_ms` |
| `maximum_output_points` | `backend_failure` | retained point/segment counts and bound |
| `maximum_event_records` | `backend_failure` | retained event count and bound |
| `minimum_step` | `stagnation` | `time`, `attempted_step`, `min_step` |
| `terminal_event` | `converged` plus ODE reason | event index/name/time/residual |
| `step_rejected_repeatedly` diagnostic | no shared diagnostic | consecutive and total rejection counts, last error norm |
| `event_location_uncertain` diagnostic | `validation_failed` | event name, final bracket, residual, tolerance |
| `unsupported_method` diagnostic/status | planning exception | requested method, classification, alternatives |

Do not remove `termination_reason` when adding shared identities; it remains the
domain-specific stopping record. Update `STATUS_CODES`, the diagnostic ledger,
JSON schemas, and exhaustive numerical surface in one integration change.

## Explicitly deferred work

- A stiff backend requires a separate dependency/architecture lane with
  SUNDIALS and Boost.Odeint prototypes, real Wasm/native callback boundaries,
  four-platform builds, payload/startup/memory evidence, and differential
  oracles.
- Parameter sweeps require a shared bounded-concurrency and cancellation
  contract; this lane does not invent a private executor.
- MATLAB, Wolfram, and Sage compatibility frontends require their own ledgers
  and shared parser/public API claims.
