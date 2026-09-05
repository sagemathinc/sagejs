# Guarded floating-buffer transfer development comparison

This follows the [public browser baseline](../n2-browser-development-2026-09-05/README.md).
The same source-hashed collector and 20,000-observation workload run unchanged;
only the Wasm host loader's transfer path changes. Ordinary local Float64Array
inputs avoid an intermediate elementwise conversion, and mutable outputs use
bulk copyback. Custom iterators, subclasses, packed facades and same-Wasm-memory
views retain the existing path. This does not introduce resident Wasm buffers,
change mathematical kernels, or remove query validation.

Prepared-Wasm query medians in milliseconds (`none` / `summary`):

| Engine | Earlier loader | Guarded bulk transfers |
| --- | ---: | ---: |
| Chromium | 55 / 60 | 29 / 31 |
| Firefox | 69 / 58 | 46 / 47 |
| WebKit | 44 / 52 | 34 / 35 |

All twelve public correctness routes pass again (disabled, accelerated, stale,
missing in each engine). Focused regressions additionally retain custom
iterator, subclass and copyback-hook behavior. Each report records first-call,
seven steady-state samples, three warmups, preparation costs, source/artifact
hashes, browser version and load average. Preparation is still approximately
0.45–0.70 seconds and is not included in query medians.

These are sequential local development runs, **not** randomized A/B/B/A or
four-platform qualification. Firefox's generic timing also improved, so these
numbers do not isolate every source of variance. The Chromium generic and
prepared-dynamic medians remain approximately unchanged. The evidence supports
continuing this guarded representation optimization; it does not meet the 10 ms
target or prove a universal speedup. Sustained memory, cold startup, deployment
and pinned paired performance gates remain open.
