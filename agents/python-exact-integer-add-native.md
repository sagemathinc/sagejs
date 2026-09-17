# Native exact-integer addition fast path

Base: `405ce4dd0` (`agent/python-positional-default-native`, queued behind the
attribute, construction, and method-binding integration).

## Change

Profiling the source-current call/construction matrix showed exact integer
addition dominating the residual self time. Every ordinary small-integer `+`
first called the closed-parent object dispatcher, then entered a compiled-
Python slow path which rediscovered both primitive types, normalized booleans,
checked float identity, and finally performed the native addition.

`ρσ_operator_add_exact` now handles only the closed primitive integer domain at
its owning boundary: booleans, safe integer Numbers, and BigInts. Safe results
remain Numbers, zero is canonicalized away from negative zero, and overflow or
mixed BigInt addition promotes through `BigInt` before adding. Floats (including
integral boxed floats), strings, objects, custom arithmetic, closed Sage
parents, and every other value retain the original closed-parent and complete
slow paths.

The same profile then exposed the `+=` wrapper around the loop accumulator. Its
compiled type discovery, truth conversion, and callable resolution were
redundant for same-storage Number, BigInt, and string operands. A second compact
boundary sends exactly those immutable primitive pairs to the proven add path;
mixed storage and objects still enter the complete `__iadd__` protocol. This
follow-up recovers core bytes rather than consuming more budget.

The first readable implementation exceeded the unchanged core budget by 153
bytes. The adopted boundary was consolidated instead; core remains within the
existing limit. A direct raw-boundary regression covers safe addition, boolean
normalization, negative zero, overflow, mixed BigInt, and delegation of floats
and strings. Existing integration tests cover boundary-sized boolean sums,
float identity, operator compatibility, custom dispatch, and exact slices.

## Controlled measurements: exact add

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each exact artifact; the first three samples
were discarded. Each row contains 100,000 checked operations.

| Case | Native-default base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 83.844 ms | 18.751 ms | **77.6% faster** | 8.958 ms | **2.1x** |
| keyword function | 166.173 ms | 93.162 ms | **43.9% faster** | 9.982 ms | 9.3x |
| immediate keyword method | 229.580 ms | 155.497 ms | **32.3% faster** | 10.420 ms | 14.9x |
| empty construction | 31.894 ms | 31.644 ms | flat | 7.561 ms | 4.2x |
| no-op initializer | 55.110 ms | 54.202 ms | flat | 11.802 ms | 4.6x |
| positional construction and method | 286.991 ms | 234.453 ms | **18.3% faster** | 22.931 ms | 10.2x |
| keyword construction and method | 513.834 ms | 453.303 ms | **11.8% faster** | 37.371 ms | 12.1x |

The base artifact SHA-256 is
`0d3a5b2b2254a6aca908e12389d33231101baeb76b5a90e7d91498d0fda7dae0`
(24,441,169 bytes). The source-current candidate is
`1cdc73d921c5b210d5e44ac0645aef766d3d4d80d9c2487649edcaf24762aafa`
(24,441,504 bytes). Recompilation after the type-check-only source annotation
produced an identical artifact.

This closes most of the misleading positional-call gap: the checked workload is
now 2.1x CPython rather than 9.1x. It does not close keyword binding, method
resolution, or construction: those rows remain 9.3x, 14.9x, and 10.2–12.1x.

## Controlled measurements: exact in-place add

The same host and ten-process protocol compared the exact-add artifact with the
combined exact-add/exact-iadd artifact.

| Case | Exact-add base | Combined candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 18.846 ms | 16.303 ms | **13.5% faster** | 8.679 ms | **1.88x** |
| keyword function | 92.679 ms | 90.298 ms | **2.6% faster** | 10.090 ms | 8.95x |
| immediate keyword method | 153.775 ms | 148.247 ms | **3.6% faster** | 10.462 ms | 14.17x |
| empty construction | 31.544 ms | 31.456 ms | flat | 7.559 ms | 4.16x |
| no-op initializer | 54.855 ms | 54.920 ms | flat | 11.737 ms | 4.68x |
| positional construction and method | 225.244 ms | 221.082 ms | flat | 22.724 ms | 9.73x |
| keyword construction and method | 432.608 ms | 431.692 ms | flat | 37.408 ms | 11.54x |

The combined artifact is
`09fbfe5af570f0352402f9651287a0b87f9076b99c7d9da8b57f91feef70cd81`
(24,441,141 bytes), 363 bytes smaller than the exact-add artifact. The residual
positional-call gap is now below 2x on this checked workload; keyword binding,
method lookup, and construction remain open cliffs.

## Qualification

- The final exact-source build converged in two self-hosting passes and
  completed; documentation generation/check reused that receipt.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- Exact-add/exact-iadd boundaries, boolean overflow, exact-slice, optimizer, operator,
  method, keyword-call, and traitlets checks pass.
- The pinned decorator 5.2.1 and attrs 25.4.0 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules; docs and
  merge invariants pass.
- Compiler fixtures not requiring native FLINT pass. Fifteen FLINT-dependent
  fixtures could not run because this worktree has no optional
  `sagejs_flint.node`; all reported the same missing-module error.
- One unrelated descriptor integration test currently fails before entering
  its lambda body because a `staticmethod` descriptor is rejected as callable.
  The exact-add boundary is reached only later inside that lambda; the focused
  arithmetic and full differential oracles pass. This is recorded rather than
  misclassified as arithmetic qualification.
- Core runtime is 902,614/903,000 bytes. No source, startup, browser, or
  performance budget changed.
- The final local startup result is not a passing receipt: 414.7 ms normalized exceeds
  the unchanged 400 ms budget. Merge-owned CI must supply the startup/browser
  receipt.

The branch remains queued behind its prerequisites and has no stacked PR. It is
not a release action.
