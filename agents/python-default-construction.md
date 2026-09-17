# Default-construction fast path

Base: `e6e5e4c69` (PR #307, lazy generated-instance identity).

## Change

Calling a generated class with no arguments resolved its live initializer,
proved whether custom allocation suppressed initialization, and invoked
`object.__init__`, even when the live initializer was exactly the captured
original `object.__init__`. The invocation cannot change the result of an empty
call.

Generated classes without a declared initializer now compare their live
initializer with that captured original after checking that the JavaScript
argument vector is empty. An exact match omits the remaining custom-allocator
proof and initializer call. Classes with a declared `__init__` retain the
original generated path. Nonempty calls, inherited or dynamically assigned
initializers, custom `__new__`, descriptor-bound initializers, and class
mutation still use the existing live resolution and invocation machinery.

The runtime helper and captured object initializer received shorter internal
names while preserving their behavior. This consolidation offsets the emitted
guard and reduces counted core source relative to the prerequisite.

Focused tests cover empty calls, empty keyword packets, assignment of
`object.__init__`, mutation from a default initializer to a custom initializer
and back, unexpected keywords, custom allocation, foreign `__new__` results,
and invalid initializer return values. A lowering assertion proves that only
the synthetic-initializer class receives the shortcut.

The campaign also exposed an existing, separate defect: a plain generated
class currently accepts an unexpected positional argument where CPython raises
`TypeError`. This optimization does not change the nonempty path and therefore
does not attempt to repair or conceal that issue.

## Controlled measurement

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes compared exact standalone artifacts and CPython;
the first three samples were discarded. Each row contains 100,000 checked
operations, with compilation and process startup outside the timed region.

| Case | PR #307 base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 79.771 ms | 80.766 ms | within 1.3% | 8.732 ms | 9.25x |
| keyword function | 197.645 ms | 199.277 ms | within 0.9% | 10.091 ms | 19.75x |
| immediate keyword method | 259.346 ms | 262.028 ms | within 1.1% | 10.456 ms | 25.06x |
| empty construction | 15.949 ms | 6.318 ms | **60.4% faster** | 7.819 ms | **0.81x** |
| no-op initializer | 38.937 ms | 39.531 ms | within 1.6% | 11.993 ms | 3.30x |
| positional construction and method | 284.879 ms | 287.313 ms | within 0.9% | 23.384 ms | 12.29x |
| keyword construction and method | 518.198 ms | 520.966 ms | within 0.6% | 37.585 ms | 13.86x |

The declared-initializer constructors have the same dispatch form in the two
artifacts; their small median differences are not claimed as regressions or
improvements. The empty-class result is narrowly faster than this CPython run,
but it does not close the much larger initialized-construction or call cliffs.

The exact base artifact is
`968263eecddf3240d0d042284e3467cb4afaf2d54547dd624f7a01930a16d8e7`
(24,386,965 bytes). The final candidate is
`332156ba98842fab72b5d078b52a14ce29a7673d0233be155d3453eb0bfa49b7`
(24,387,127 bytes), 162 bytes larger.

## Qualification

- The source-current compiler converged in two passes and the full build
  completed in 7m 38s. Its benchmark artifact is byte-identical to the measured
  candidate above.
- Eleven focused compiler/runtime checks pass, including Python and Sage
  execution of the mutation and allocation fixture.
- The 508-case differential corpus matches its baseline: 505 passes and the
  same three intentional incompatibilities.
- All six traitlets checks and the pinned attrs 25.4.0 and decorator 5.2.1
  workflows pass with checked behavior, not merely imports.
- Strict CPython syntax, Ruff 0.16.0, Pyright for 404 modules, documentation,
  merge invariants, and the complete architecture check pass.
- Counted core source is 902,846/903,000 bytes. No source, startup, browser, or
  performance budget changed. Browser and four-platform CI remain merge-owned
  qualification; no release is implied.
