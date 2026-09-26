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

## Controlled measurements

On Linux x64, Node 26.10.0, six alternating fresh baseline/candidate processes
ran `bench/python-initializer-components.py`. Each row checks 100,000
operations. Times are median milliseconds, excluding compilation and startup.
Five CPython 3.14.4 runs of the same source supply comparison medians. These
are warm-in-loop timings, not cold-start or cross-platform claims.

| Case | Base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| empty construction | 6.98 | 7.06 | flat | 5.75 | 1.23x |
| no-op initializer | 30.14 | 29.81 | flat | 8.13 | 3.67x |
| positional defaulted initializer | 28.88 | 29.33 | flat | 8.42 | 3.48x |
| keyword defaulted initializer | 91.06 | 80.91 | **11.14% faster** | 21.70 | 3.73x |
| positional field-bearing initializer | 123.17 | 122.83 | flat | 9.66 | 12.71x |
| keyword field-bearing initializer | 270.63 | 261.75 | **3.28% faster** | 24.05 | 10.89x |
| keyword fields plus method | 252.90 | 243.47 | **3.73% faster** | 29.02 | 8.39x |

The main call/construction cliff remains. In particular, fresh-instance field
stores are expensive; the practical improvement is much smaller than the
isolated keyword-binding gain. Rows appear in source order and V8 tiering can
change during the run, so cross-row subtraction is not a reliable component
profile. A separate diagnostic immediate-method loop showed 100,000 calls at
roughly 96 ms versus about 333 ms for 1,000,000 calls, illustrating why
short-loop CPython ratios should not be extrapolated linearly to long hot loops.

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
- Optional FLINT and numerical reactor builds were unavailable locally, and
  browser/four-platform qualification remains CI-owned. No release is implied.
