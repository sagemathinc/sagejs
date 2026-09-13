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

## Controlled corrected-candidate comparison

On the idle, explicitly reserved `bench-1`, two reversed-order rounds compared
base `c4c126d09`, candidate `c5c6de504` and CPython 3.14.4. Each launch performs
three warmups and seven samples, checking results. Compilation/startup are
outside the warm workload timing. All six launches and unchanged input hashes
verified. The exact Node 26.7.0 executable matches the prior SHA256
`ad19784f7e90ba789a099eccba77ede8dc90a778c424f1c10a70fed3ff903fdc`;
the host's changed login default (26.5.1) was not used. Compilation used 26.8.1.

Medians in milliseconds per 10,000 instance-owned keyword callback calls:

| Other instance fields | Baseline rounds | Candidate rounds | Speedup rounds |
| --- | --- | --- | --- |
| 0 | 52.80 / 53.64 | 47.31 / 46.97 | 1.12 / 1.14 |
| 10 | 58.77 / 60.13 | 45.77 / 45.95 | 1.28 / 1.31 |
| 100 | 144.60 / 147.01 | 46.75 / 46.59 | 3.09 / 3.16 |

This removes the observed namespace-size scaling on this selected path.
CPython callback medians are below the policy's 1 ms floor; do not qualify their
ratios or declare a performance cliff closed. Ordinary immediate/saved calls,
construction and free/bound keyword controls have no consistent material gain.
The bound keyword control remains about 96–109 times CPython in these rounds.
No package-wide, cold-import, or combined-PR228 speedup is claimed.

Raw checked report is retained locally at
`/tmp/python-call-profile.vDw3Fr/paired-resolved-keywords-corrected.json` and on
the host in `/home/user/python-call-baseline.vegju2/` with inputs and driver.
Report SHA256: `5fea26f28fadcce7e957f254219cc27220532d0ce3c0a598a8dfa18e85bce69e`.
The host was explicitly released after collection and copying the report.
