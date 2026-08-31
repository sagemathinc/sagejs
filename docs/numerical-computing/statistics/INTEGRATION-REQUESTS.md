# Integration and diagnostic requests

This lane intentionally did not edit shared registries, package graphs,
`pyrightconfig.json`, the parent `sagejs.numerics.__init__`, or central test
scripts. Integration may make the following narrow changes after review:

1. Export the selected statistics names from `sagejs.numerics` while retaining
   `sagejs.numerics.statistics` as the canonical implementation module.
2. Add statistics operations to `docs/numerical-computing/surface.json` and the
   capability planner: descriptive summary, distribution evaluation, random
   sample, mean interval, one/two-sample t test, OLS, Theil-Sen, and Huber fit.
3. Normalize the local statuses `maximum_elapsed_time` and the local diagnostic
   codes `zero_variance` and `zero_residual_variance` into the shared numerical
   status/diagnostic registry. Preserve their meanings; do not map an undefined
   t statistic to generic backend failure.
4. Extend shared `NumericalResult` plot/explanation dispatch to accept statistics
   domain payloads, or keep the domain-specific `StatisticsResult` if shared
   root-only methods remain intentionally closed.
5. Include `test/numerics/statistics/test.cjs` in `pnpm test:numerics`; the nested
   test metadata already makes it visible to the general integration manifest.
6. Add `src/lib/sagejs/numerics/statistics/` to strict Pyright coverage after
   integration resolves any compiler-specific typing findings.
7. Run `test/numerics/statistics/oracle.R` on an R-equipped qualification host
   and retain its versioned output as a second executed oracle receipt.
