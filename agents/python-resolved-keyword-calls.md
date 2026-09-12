# Resolve Python keyword-call targets once

Base: `c4c126d09ba4f5c2fb30001fd8b561b24105d80f`.

Python attribute lookup has already applied descriptor binding when it returns
a callable. Keyword/star call emission now passes that value with an undefined
JavaScript receiver instead of evaluating the syntactic receiver separately.
This fixes `holder.child.method(value=...)` evaluating a property twice and
avoids redundant receiver-namespace scans on this path. Lookup still happens
before argument evaluation, so mutation in arguments cannot change the selected
target. Saved methods, instance-owned functions and descriptor-returned
functions keep their binding semantics.

For a starred positional call, callable validation must happen **after** argument
evaluation. The initial candidate resolved callability too early: a non-callable
attribute incorrectly prevented starred-argument side effects. The follow-up
uses the existing prepared invocation helper with a one-slot resolved target;
attribute lookup stays before arguments, while callability checks stay after
them. A minimized CPython oracle locks down both events before TypeError.

The authoritative Python attribute predicate retains native namespace, internal,
existential and other raw attribute exemptions. Constructor, explicit internal
receiver and legacy call paths are unchanged. This does not delete the generic
receiver scans still used by those other paths or fix arbitrary compound-call
expressions.

## String keyword metadata

The regression oracle also exposed an independent baseline defect: bound string
methods lost signature metadata through bare JavaScript binding. Preserve native
receiver binding and publish metadata for the reviewed keyword-compatible
`split`, `rsplit`, `encode`, `splitlines` and `expandtabs` methods. Rename the
split/rsplit parameter to Python's `sep`; the internal `separator` keyword is
not retained as an alias. Regenerate reference signatures accordingly.

Do not publish every string helper's internal signature. Other helper names and
positional-only contracts remain imperfect; broader string compatibility is not
claimed. Regressions reject the invalid `replace(old=..., replacement=...)`
form and preserve existing native string extensions' receiver ABI.

## Qualification

The initial committed source passed a full rebuild in 10m 26s on Linux x64,
Node 26.8.1. Receipt: `2026-09-12T06:23:42.771Z`.

- 14 focused tests, including CPython 3.14.4 and Python/Sage-mode oracles.
- All 66 lowering tests; two generated-code expectations updated to the new
  single-evaluation shape, with an additional exact construction-count check.
- All 206 portable test files.
- Strict Python: 387 modules, zero errors; formatting current.
- Merge-owned architecture inventories and generated documentation checks.
- Unmodified pinned packaging, attrs, tomli and decorator workflows qualified
  in selected, non-artifact-only scope.

The earlier build and initial unconditional string metadata patch were not used
to qualify this correction. Review caught native receiver and invalid helper
keyword exposure before final qualification. No required assertion was removed.
Core source is 902,938 / 903,000 bytes; no budget increase.

Those checks did not cover the subsequently discovered non-callable starred
target regression. The follow-up completed a fresh full build in 11m 55s,
receipt `2026-09-12T06:58:53.094Z`, and passed all 77 focused/lowering tests,
206 portable files, strict checks across 387 modules, merge inventories and
generated documentation checks. All four selected pinned packaging, attrs,
tomli and decorator workflows passed in non-artifact-only scope. The newly
compiled standalone benchmark also passed its result-checking local preflight;
concurrent local execution is not controlled performance evidence.

## Performance and remaining work

The prior controlled baseline attributes 66.9% of the 100-field owned-callback
probe's workload-subtree samples to namespace scanning. That motivates this
mechanism change but does not measure the candidate's gain. A same-probe
baseline/candidate comparison is pending a coordinated benchmark-host window.
Do not claim a speedup, package performance improvement, compile-time benefit,
or closed cliff until that comparison is recorded. Current-head platform/browser
CI is also pending; keep the PR draft until readiness is established.

Withdrawn pre-follow-up standalone artifact SHA-256 (do not benchmark):
`c267f278adde868adb86707e531718b62ebf32cf9f5c72b7b1189284ff0eb1e0`.
Corrected, rebuilt standalone artifact SHA-256:
`28ca53d43489e2bf40635ed3d94a89a8ba2a6e342db3062c156766f85ef17145`.
This candidate does not include the separate internal-length `max` optimization
in PR228, so its eventual comparison must not mix those effects.
