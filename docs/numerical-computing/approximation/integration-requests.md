# Approximation integration requests

This lane intentionally did not edit shared registries, schemas, parent
packages, the package graph, `package.json`, or `pyrightconfig.json`.

The integration lane should make these exact changes after reviewing the
domain surface:

1. Re-export the approved names from `sagejs.numerics`: `ApproximationResult`,
   the package-local `capabilities`, `supports`, and `plan` facade,
   `interpolate`, `interpolation_problem`, `plan_interpolation`,
   `solve_interpolation_problem`, `cubic_spline`, `spline_problem`,
   `plan_spline`, `solve_spline_problem`, `finite_difference`,
   `finite_difference_problem`, `plan_finite_difference`,
   `solve_finite_difference_problem`, `chebyshev_approximation`,
   `polynomial_approximation_problem`, `plan_polynomial_approximation`, and
   `solve_polynomial_approximation_problem`.
2. Add `polynomial_interpolation`, `piecewise_interpolation`, `cubic_spline`,
   `finite_difference_derivative`, and `polynomial_approximation` to the
   numerical capability/surface registries using `support-matrix.json` as the
   qualified envelope.
3. In `architecture/package-graph.json`, change the existing
   `numerical-computing` package from `"prefixes": []` to
   `"prefixes": ["src/lib/sagejs/numerics/approximation/"]`. This is required
   before `pnpm architecture:check` can assign the new source files exactly one
   owner.
4. Add the portable test to the shared `test:numerics` command or migrate that
   command to directory discovery:
   `test/numerics/approximation/approximation-laboratory.test.cjs`.
5. Decide whether approximation-specific `evaluate`, `explanation`,
   `to_plot_spec`, and `to_animation` dispatch should also appear on the shared
   `NumericalResult` type. The current subclass returns canonical `PlotSpec`
   and `PlotAnimation` values without changing shared objects or importing a
   renderer.
6. Add `src/lib/sagejs/numerics/approximation/capabilities.py` and
   `src/lib/sagejs/numerics/approximation/presentation.py` to the shared
   strict-Pyright module list together with the other approximation modules.
7. Add `maximum_elapsed_time` to the shared result status vocabulary and
   diagnostic registry. Approximation execution already emits that exact stop
   reason; until integration, the local result uses the schema-valid
   `backend_failure` envelope status and preserves
   `domain_payload.stop_reason="maximum_elapsed_time"`. Do not map elapsed
   exhaustion to `maximum_evaluations`.

## Requested diagnostic codes

The implementation currently maps to the closest existing shared codes and
uses `ValueError` for invalid construction input. These domain codes would
make integration more precise:

| Code | Severity | Phase | Intended trigger |
|---|---|---|---|
| `duplicate_abscissa` | error | planning | two interpolation/spline nodes are equal |
| `barycentric_weight_underflow` | error | planning | normalized general-node weights still underflow |
| `inconsistent_periodic_boundary` | error | planning | periodic endpoint values disagree |
| `finite_difference_step_unrepresentable` | error | execution | a nonzero stencil offset rounds back to the center |
| `maximum_elapsed_time` | warning | execution | the hard wall-clock budget was exceeded |
| `approximation_target_not_met` | warning | validation | a fixed-degree holdout corpus exceeds the requested tolerance |
| `interpolation_condition_large` | warning | validation | sampled Lebesgue indicator exceeds the qualified threshold |

No new shared status is essential. The current status mapping is explicit:

- invalid construction intent raises before execution and should become
  `invalid_problem` if integration standardizes constructor failures as
  results;
- callback, cancellation, and budget termination use their existing shared
  statuses, with `maximum_elapsed_time` pending the shared addition above;
- defining-equation or requested-accuracy failure uses
  `validation_failed`; and
- a successfully constructed and independently checked model uses
  `converged` under the current shared vocabulary.

If the shared result vocabulary later distinguishes construction from
iteration, rename `converged` centrally rather than adding a local alias.
