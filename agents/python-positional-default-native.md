# Native omitted-positional default lookup

Base: `929230116` (`agent/python-default-tail-keyword-main`, the source-current
qualified keyword-prologue candidate).

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

## Controlled measurements

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

The branch remains queued behind the constructor and keyword-prologue
candidates and has no stacked PR. It is not a release action.
