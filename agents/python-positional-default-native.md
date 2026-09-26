# Native omitted-positional default lookup

Original measurement base: `929230116` (`agent/python-default-tail-keyword-main`).
Current integration base: `2d8ca82fd` (`origin/main` at the 2026-09-26 replay).

## Change

Calls which omit a positional parameter resolve its live `__defaults__` entry
through the shared `ρσ_positional_default` helper. That helper was itself
compiled Python and paid generic native-property, comparison, indexing, call,
and raise machinery on every omitted parameter.

The helper now owns those same operations in a compact raw JavaScript boundary:
it reads the live `__defaults__` slot, retains null/undefined and short-default
checks, selects the same end-relative element, and creates the same
`ρσ_function_argument_error` on failure. A source-level regression test executes
the raw helper directly and checks both live replacement and the missing-argument
error; the existing compiled integration tests continue to cover Python and Sage
function-default behavior.

## Original controlled measurements (2026-09-18)

The shared Linux x64 project host ran Node 26.9.0 and CPython 3.14.4. Ten
alternating fresh processes ran each exact artifact; the first three samples
were discarded. Compilation and startup are outside the measured regions. Each
row contains 100,000 checked operations.

| Case | Keyword-prologue base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional supplied-default control | 89.846 ms | 90.802 ms | flat | 11.539 ms | 7.87x |
| keyword supplied-default control | 129.345 ms | 129.481 ms | flat | 12.468 ms | 10.38x |
| positional omitted default | 121.572 ms | 92.957 ms | **23.54% faster** | 12.354 ms | 7.52x |
| keyword omitted default | 182.193 ms | 150.356 ms | **17.47% faster** | 12.503 ms | 12.03x |
| method omitted default | 189.848 ms | 161.334 ms | **15.02% faster** | 12.885 ms | 12.52x |
| four omitted defaults | 241.391 ms | 164.324 ms | **31.93% faster** | 16.564 ms | 9.92x |

The base artifact SHA-256 is
`be8c164b0520667224cda7fcf98d88268d5fe975cf82482a4dad3c48ee648ebe`
(24,337,175 bytes). The candidate is
`770f5fde320f890f1e383cf2b3adca9cf5e95e8fe426cdea79499e590cd2f839`
(24,336,982 bytes), 193 bytes smaller.

The remaining keyword-function and keyword-method gaps are still 12.03x and
12.52x CPython. The scaling row reaches 9.92x, while a single positional
omission remains 7.52x. This removes one measured layer without closing the
common-call cliff.

## Qualification

- The exact-source build converged in two self-hosting passes and completed in
  7m 30s.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- All 107 focused default, prepared-method, dynamic-initializer, lowering, and
  raw-boundary tests pass; all six pinned traitlets checks also pass.
- The pinned decorator 5.2.1 and attrs 25.4.0 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules; docs and
  merge invariants pass.
- Core runtime falls from 902,294 to 902,028 bytes against the unchanged
  903,000-byte budget. No source, startup, browser, or performance budget
  changed.
- The local startup result is not a passing receipt: the candidate measured
  402.7 ms normalized and its exact parent measured 426.6 ms, both above the
  unchanged 400 ms budget. Merge-owned CI must supply the startup/browser
  receipt.

That historical receipt applies to the original parent, not the 2026-09-26
`origin/main` integration. The original local startup measurement was not a
passing receipt.

## Current-main replay (2026-09-26)

Merged PR #318 already supplies the constructor and keyword-prologue
prerequisites. The native helper is now in `bootstrap_shared.py`, which is the
strictly checked raw-host boundary; the Python exception implementation no
longer embeds raw JavaScript. This relocation preserves the helper body and is
covered by its direct boundary test and the shared-bootstrap inventory test.

On Linux x64, Node 26.10.0 and CPython 3.14.4, five fresh processes each ran
`bench/python-call-construction.py` with 100,000 checked iterations per row.
Times are medians in milliseconds; each Sage.js process warms V8 within its
cases. These are absolute current-source comparisons, **not** a new paired
candidate-versus-current-main speedup claim.

| Case | Sage.js | CPython | Sage.js / CPython |
| --- | ---: | ---: | ---: |
| positional function, supplied defaults | 20.15 | 6.59 | 3.06x |
| keyword function, omitted middle default | 35.21 | 7.96 | 4.42x |
| keyword method, omitted middle default | 93.24 | 8.32 | 11.21x |
| empty construction | 5.74 | 6.06 | 0.95x |
| no-op initializer construction | 33.66 | 8.27 | 4.07x |
| positional initialized construction | 182.01 | 15.24 | 11.94x |
| keyword initialized construction | 331.28 | 29.29 | 11.31x |

The current build converges in two self-host passes. Merge gates pass with
911,015/912,000 core-runtime bytes; no budget was changed by this candidate.
The full routine suite passes, including strict Python, portable tests,
generated docs, and startup. Eleven fresh startup samples give a normalized
414.8 ms median against the unchanged 425.0 ms budget. `pnpm architecture:check`
also passes. This is not a release action.
