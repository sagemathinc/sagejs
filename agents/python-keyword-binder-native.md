# Native keyword binder qualification

Date: 2026-09-17

This slice moves the existing keyword-packet interpolation algorithm from
ordinary compiled Python into the shared raw bootstrap boundary. It does not
change the compiler's call protocol or accepted signatures. Its purpose is to
avoid running JavaScript arrays and signature metadata through generic Python
truth, arithmetic, comparison, indexing, iteration, and deletion machinery on
every keyword call.

## Semantic boundary

The shared implementation retains prepared method contexts, class and instance
function distinctions, callable type slots, constructor adapters, positional-
only and keyword-only metadata, `**kwargs`, duplicate detection, unexpected
keyword errors, and packet consumption. Runtime consumers reference the shared
lexical ABI directly; there is no second binder implementation or `globalThis`
fallback. This is important for standalone output as well as the cached Node
runtime.

The production build passes:

- all 224 portable test files;
- 47 focused call, binding, mutation, live-default, and traitlets tests;
- the standalone canonical-instance/type regression that constructs through a
  custom metaclass;
- the pinned traitlets 5.15.1 import, notification, and failure workflow;
- CPython syntax, Ruff, and Pyright for all 404 strict modules; and
- the unchanged source budget at 901,616/903,000 core-runtime bytes.

The first candidate exposed a real standalone defect: `type.__call__` imported
the old binder through the internal module facade when no global property was
present. The final candidate removes that fallback and calls the shared lexical
ABI. The exact standalone regression and the complete portable tier pass after
the correction.

## Controlled performance

The baseline is the exact PR #301 benchmark artifact
`f4725e1f21f19e90b96b7408d4784800c73486cb6e518c16c88bb03abf22efe6`
(24,517,041 bytes). The candidate is
`2fc3d05a2c52155c0882198869b9ec0095e97599cb3e63cbde1ba86226afcff3`
(24,511,249 bytes). On the idle `bench-1` Linux x64 host, Node 26.5.1 ran ten
alternating fresh processes for each 100,000-operation workload; the first
three samples were discarded and the remaining medians compared.

| Workload | PR #301 | Candidate | Change |
| --- | ---: | ---: | ---: |
| keyword function | 301.951 ms | 200.543 ms | -33.58% |
| keyword method | 306.912 ms | 212.564 ms | -30.74% |
| empty construction | 36.866 ms | 37.228 ms | +0.98% |
| no-op `__init__` construction | 61.479 ms | 62.033 ms | +0.90% |
| positional construction | 648.111 ms | 649.925 ms | +0.28% |
| keyword construction | 980.109 ms | 830.309 ms | -15.28% |

Contemporaneous CPython 3.12.3 medians were 9.894 ms for keyword functions,
11.465 ms for keyword methods, and 36.732 ms for keyword construction. The
candidate therefore remains approximately 20.3x, 18.5x, and 22.6x CPython for
those cases. This is a substantial shared-path improvement, not closure of the
call/construction cliff. Positional and empty construction are deliberately
unchanged and their sub-1% movements are noise.

Two alternating local startup-gate rounds measured baseline/candidate full CLI
startup at 420.1/422.9 ms and 417.4/428.4 ms. Both exceeded the unchanged 400 ms
gate on that loaded host, so these runs neither qualify startup nor establish a
candidate regression. The candidate reduces both counted core source and the
compiled benchmark artifact; CI remains the authoritative startup gate.

## Remaining work

Argument binding and construction remain roughly 18-28x CPython depending on
the call shape. The next investigation should profile the now-exposed function
prologue/default filling and constructor protocol separately. It must not fold
positional specialization, default evaluation, or allocation changes into this
keyword-only slice without their own semantic and controlled evidence.
