# Integration and diagnostic requests

This lane intentionally did not edit shared registries, package graphs,
`pyrightconfig.json`, the parent `sagejs.numerics.__init__`, or central test
scripts. Integration may make the following narrow changes after review:

1. Export the selected statistics names from `sagejs.numerics` while retaining
   `sagejs.numerics.statistics` as the canonical implementation module.
2. Add statistics operations to `docs/numerical-computing/surface.json` and the
   capability planner: descriptive summary, distribution evaluation, random
   sample, mean interval, one/two-sample t test, OLS, Theil-Sen, and Huber fit.
3. Include `test/numerics/statistics/test.cjs` in `pnpm test:numerics`; the nested
   test metadata already makes it visible to the general integration manifest.
4. Add `src/lib/sagejs/numerics/statistics/` to strict Pyright coverage after
   integration resolves any compiler-specific typing findings.
5. Run `test/numerics/statistics/oracle.R` on an R-equipped qualification host
   and retain its versioned output as a second executed oracle receipt.
