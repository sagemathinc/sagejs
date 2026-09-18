# Python constructor custom-new guard

Base: `3afb7d6f3` (`agent/python-keyword-constructor-dispatch-main`, the exact
source of PR #316 after its merged attribute-store and exact-arithmetic
prerequisites).

## Change

Every generated class constructor asks whether initialization must be skipped
because a custom `__new__` is paired with `object.__init__` (or a synthetic
initializer chain ending there). The decision is mutation-sensitive and its
custom-allocator answer is already stored in the initializer cache at the
descriptor epoch. Its implementation, however, was ordinary compiled Python:
even an explicit ordinary `__init__` paid generic member lookup, Python truth
conversion, and identity plumbing on every construction.

The two internal helpers now express the same bounded traversal and cache
protocol as raw JavaScript in the shared bootstrap boundary used by builtins.
`builtins.py` remains ordinary strict Python source. The semantic boundary is
unchanged:

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

The shared Linux x64 project host ran Node 26.9.0 and CPython 3.14.4. Ten
alternating fresh processes ran each exact artifact; the first three samples
were discarded. Compilation and startup are outside the measured regions. Each
row contains 100,000 checked operations. This is a source-current local
comparison; an idle benchmark host should independently confirm it.

| Case | Keyword-constructor base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 89.722 ms | 89.149 ms | flat | 11.555 ms | 7.72x |
| keyword function | 168.500 ms | 167.521 ms | flat | 13.122 ms | 12.77x |
| immediate keyword method | 168.326 ms | 168.134 ms | flat | 13.079 ms | 12.85x |
| empty construction | 53.837 ms | 54.504 ms | flat | 8.721 ms | 6.25x |
| no-op initializer | 78.003 ms | 68.862 ms | **11.72% faster** | 12.128 ms | 5.68x |
| positional construction and method | 242.555 ms | 234.291 ms | **3.41% faster** | 19.458 ms | 12.04x |
| keyword construction and method | 390.753 ms | 377.433 ms | **3.41% faster** | 35.900 ms | 10.51x |

The base artifact SHA-256 is
`a950650d09955f60ab489da6e8a29c07efdcae971421720bb7c41381c8127527`
(24,342,937 bytes). The final candidate is
`2371d5010d0c2ee9ddebe7ce6dc6d75312d4b70c4ecf7a37cdb49dcf70eb0019`
(24,341,229 bytes), 1,708 bytes smaller.

No-op initialization is now 5.68x CPython, but field-heavy positional
construction remains 12.04x and keyword construction remains 10.51x. Keyword
function and method calls remain roughly 12.8x. This is not closure of M5.

## Qualification

- The replayed prerequisite-source build converged in two passes and completed
  in 7m 29s.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- All 128 selected constructor, lowering, runtime-hotpath, prepared-method, and
  raw-ABI checks pass. The CPython differential corpus passes 505 of 508 cases,
  with the same three intentional incompatibilities and no baseline drift.
- All six pinned traitlets checks and the pinned decorator 5.2.1 and attrs
  25.4.0 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules; merge
  invariants and the baselib raw-source boundary pass.
- Core runtime is 902,448/903,000 bytes. No source, startup, browser, or
  performance budget changed.
- The source-current routine suite passes, including the unchanged startup
  regression budget and all 225 portable tests. No budget was widened.

PR #316 is merged; this branch is its direct follow-up. It is not a release
action.
