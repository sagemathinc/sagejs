# Frozen-set string superset path

`packaging==26.2` calls `_SIMPLE_VERSION_INDICATORS.issuperset(version)`
for each `Version` construction. The Sage.js implementation previously built
an intermediate `SageSet` from the string, then checked subset membership.
For a primitive string, iterating its characters and checking the existing
frozen set preserves the result and avoids that allocation. Non-string inputs
retain the original conversion path. The duplicated frozen-set conversion
method now delegates to the set implementation; the ordinary set method is
unchanged. Tests cover repeated characters, a miss, a non-BMP character,
non-string fallback, and the frozen-set length/membership/iterator surface.

The core-runtime source budget remains 912,000 bytes; this change measures
911,997 bytes. `pnpm build`, `pnpm test`, `pnpm test:baselib:strict`, and
`pnpm architecture:packages` passed on Linux x64. Other platforms and browser
CI are left to the PR checks.

One warm Node measurement of 100,000 `frozenset.issuperset` calls changed from
about 2.6 s to 0.36 s for a short string hit; CPython 3.14.4 took about
12 ms. Seven alternating fresh-process pairs of the pinned `packaging`
workload changed the median warm batch of 1,000 calls from 2,268 to 2,079 ms.
The repository's full isolated-cache package-phase runner separately measured
2,270 to 2,120 ms (6.6% faster) across seven samples on each revision.
The candidate was still 176.8 times CPython's 11.99 ms warm batch, classified
as a critical performance cliff. Cold import remained approximately 3.6 s,
or 148 times CPython, also critical. Both full runs passed the package behavior
gate and were source-current, comparable, seven-sample measurements; their
confirmation status is `provisional-single-run`, not cross-host qualification.

The remaining profile costs include general `Version.__init__`, regex group
access, method binding, stringification, iterator wrappers, and native stack
formatting on internal `StopIteration`. This change does not address those
or claim the package performance cliff is closed.
