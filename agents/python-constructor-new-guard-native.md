# Python constructor custom-new guard

Base: `958927947` (`agent/python-keyword-constructor-dispatch-main`, queued
behind the reviewer-repaired attribute-store integration).

## Change

Every generated class constructor asks whether initialization must be skipped
because a custom `__new__` is paired with `object.__init__` (or a synthetic
initializer chain ending there). The decision is mutation-sensitive and its
custom-allocator answer is already stored in the initializer cache at the
descriptor epoch. Its implementation, however, was ordinary compiled Python:
even an explicit ordinary `__init__` paid generic member lookup, Python truth
conversion, and identity plumbing on every construction.

The two internal helpers now express the same bounded traversal and cache
protocol as raw JavaScript in their owning builtins module. The semantic
boundary is unchanged:

- direct and bound `object.__init__` are recognized;
- synthetic forwarding chains are followed for at most 100 links;
- cycles and non-synthetic initializers do not skip initialization;
- only an epoch-current cache record for the identical initializer may reuse
  the custom-allocator answer; and
- stale records resolve `__new__` again and compare it with the canonical
  `object.__new__`.

The focused raw-ABI regression covers ordinary, bound, synthetic-chain, cyclic,
cached, invalidated, custom-allocator, and canonical-allocator cases. Existing
Python/Sage dynamic-construction fixtures cover foreign `__new__` results,
live initializer replacement/deletion/inheritance, callable initializers,
positional-only binding, and invalid initializer returns.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each exact artifact; the first three samples
were discarded. Each row contains 100,000 checked operations.

| Case | Keyword-constructor base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 79.735 ms | 80.047 ms | flat | 8.756 ms | 9.1x |
| keyword function | 197.241 ms | 199.371 ms | flat | 10.003 ms | 19.9x |
| immediate keyword method | 258.474 ms | 259.237 ms | flat | 10.433 ms | 24.8x |
| empty construction | 37.033 ms | 31.763 ms | **14.2% faster** | 7.548 ms | 4.2x |
| no-op initializer | 60.420 ms | 54.615 ms | **9.6% faster** | 11.841 ms | 4.6x |
| positional construction and method | 286.125 ms | 278.730 ms | **2.6% faster** | 22.537 ms | 12.4x |
| keyword construction and method | 497.698 ms | 504.351 ms | flat | 37.088 ms | 13.6x |

The base artifact SHA-256 is
`8658a7e82e89e3c335d5e202495f6449920300dc264c201547b4e4036d544674`
(24,442,406 bytes). The final candidate is
`dc72202e1033ec346a476114c8383860061e3bcf5647f6c0bdac2f9a65bad30b`
(24,441,502 bytes), 904 bytes smaller.

Empty and no-op construction are now below the project's default 10x ratio
rule, but field-heavy construction remains 12.4–13.6x CPython and keyword calls
remain roughly 20–25x. This is not closure of M5.

## Qualification

- The replayed prerequisite-source build converged in two passes and completed
  in 7m 29s.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- All 104 selected constructor, lowering, runtime-hotpath, prepared-method, and
  raw-ABI checks pass. The earlier qualification also covers live defaults in
  Python and Sage modes.
- All six pinned traitlets checks and the pinned decorator 5.2.1 and attrs
  25.4.0 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules; merge
  invariants pass.
- Core runtime is 902,476/903,000 bytes. No source, startup, browser, or
  performance budget changed.
- The local startup gate is not a passing receipt: the candidate measured
  417.9 ms normalized and its exact parent previously measured 430.8 ms, both
  above the unchanged 400 ms budget. No budget was widened; merge-owned CI must
  supply the startup/browser receipt.

The branch remains queued behind its attribute and keyword-constructor
prerequisites. It is not a release action.
