# Native keyword-initializer adapter

Base: `6f1415c6a` (PR #325, omitted-positional-default lookup).

## Change

The class constructor's keyword path previously copied its arguments and
checked five descriptor markers through a compiled-Python helper before
calling the already-native keyword binder. The adapter now performs the same
copy and short-circuit marker checks in the shared raw-host boundary, then
calls the existing binder. It does not change the binder or allocator path.
The constructor still consumes an independent keyword packet after custom
allocation; unbound assigned descriptors still receive explicit `self`, while
ordinary, bound, static, native, and receiver-style initializers do not.

## Controlled measurements and decision

On Linux x64, Node 26.10.0, six alternating fresh baseline/candidate processes
ran `bench/python-initializer-components.py`. Each row checks 100,000
operations. Every no-field `Defaults` instance is retained and type-checked
after the timing region so the runtime cannot eliminate unobserved objects.
Times are median milliseconds, excluding compilation and startup.
Five CPython 3.14.4 runs of the same source supply comparison medians. These
are warm-in-loop timings, not cold-start or cross-platform claims.

| Case | Base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| empty construction | 6.77 | 7.04 | flat | 5.70 | 1.24x |
| no-op initializer | 29.42 | 29.33 | flat | 8.25 | 3.56x |
| positional defaults, retained objects | 341.03 | 342.02 | flat | 17.24 | 19.84x |
| keyword defaults, retained objects | 479.99 | 473.96 | 1.26% faster | 24.58 | 19.28x |
| positional field-bearing initializer | 129.00 | 134.46 | 4.24% slower | 9.82 | 13.69x |
| keyword field-bearing initializer | 245.07 | 237.48 | 3.09% faster | 24.49 | 9.70x |
| keyword fields plus method | 251.77 | 256.60 | 1.92% slower | 29.39 | 8.73x |

The first version retained only the last `Defaults` object and misleadingly
suggested an 11.14% isolated gain. That result is **invalid** for qualification:
V8 could eliminate unobserved constructions. With the corrected workload, the
gain is only 1.26% in that row, while the practical rows conflict. The helper
also costs 227 core-runtime bytes. This experiment therefore should **not**
merge as a performance optimization. The retained-object row additionally
exposes a much larger list-append/construction cost, but this test alone does
not attribute it to a particular helper. Rows appear in source order and V8
tiering can change during the run, so cross-row subtraction is not a reliable
component profile.

## Qualification

- The source-current build converged in two self-host passes.
- The 508-case CPython differential run remains 505 matches and the same three
  intentional incompatibilities, with no baseline drift.
- All 36 focused default, dynamic-initializer, and shared-host adapter tests
  pass in both Python and Sage modes where applicable.
- The full eight-phase routine suite and `pnpm architecture:check` pass.
- Strict CPython syntax, Ruff, and Pyright pass for 408 modules.
- Core runtime is 911,242/912,000 bytes; no budget changed. Eleven fresh
  startup samples give a 417.1 ms normalized median against the unchanged
  425.0 ms budget.
- Optional FLINT and numerical reactor builds were unavailable locally. Since
  the corrected benchmark does not justify the cost, no browser/four-platform
  promotion is requested. No release is implied.
