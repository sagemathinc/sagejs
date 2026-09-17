# Native omitted-positional default lookup

Base: `aafe94c52` (`agent/python-keyword-target-native-classification`, queued
behind the attribute, construction, and method-binding integration).

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

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each exact artifact; the first three samples
were discarded. Each row contains 100,000 checked operations.

| Case | Native-target base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 82.280 ms | 80.640 ms | flat | 8.868 ms | 9.1x |
| keyword function | 197.602 ms | 164.017 ms | **17.0% faster** | 10.040 ms | 16.3x |
| immediate keyword method | 251.903 ms | 224.959 ms | **10.7% faster** | 10.435 ms | 21.6x |
| empty construction | 31.369 ms | 30.890 ms | flat | 7.587 ms | 4.1x |
| no-op initializer | 54.665 ms | 54.749 ms | flat | 12.031 ms | 4.6x |
| positional construction and method | 285.335 ms | 290.104 ms | flat | 23.091 ms | 12.6x |
| keyword construction and method | 503.551 ms | 507.044 ms | flat | 37.192 ms | 13.6x |

The base artifact SHA-256 is
`d4e402bebd68ae2cf3aee64e0bc98fc74d3bb252463e8693ff0bebcaeb13bb3c`
(24,441,523 bytes). The candidate is
`0d3a5b2b2254a6aca908e12389d33231101baeb76b5a90e7d91498d0fda7dae0`
(24,441,169 bytes), 354 bytes smaller.

The remaining keyword-function and keyword-method gaps are still 16.3x and
21.6x CPython. Arithmetic and the rest of binding remain in the workload, so
this result removes one measured layer without closing the common-call cliff.

## Qualification

- The exact-source build converged in two self-hosting passes and completed.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- Thirty focused default, prepared-method, resolved-keyword, and raw-boundary
  tests pass; dynamic initializer and pinned traitlets checks also pass.
- The pinned decorator 5.2.1 and attrs 25.4.0 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules; docs and
  merge invariants pass.
- Core runtime falls from 902,633 to 902,367 bytes against the unchanged
  903,000-byte budget. No source, startup, browser, or performance budget
  changed.
- The local startup result is not a passing receipt: 424.8 ms normalized exceeds
  the unchanged 400 ms budget. It remains far below the 1500 ms catastrophic
  ceiling, but merge-owned CI must supply the startup/browser receipt.

The branch remains queued behind its prerequisites and has no stacked PR. It is
not a release action.
