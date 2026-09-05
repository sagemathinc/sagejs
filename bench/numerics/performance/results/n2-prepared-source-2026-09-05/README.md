# Prepared statistics: four-platform source witnesses

Frozen source: `3fc0831aab04f43ed48c0f5d6b81d998db9db341` (draft PR #148).
These receipts cover the **public prepared-data API on fresh source**, compiled
arithmetic and fallbacks. They are not a full product build, public browser
deployment, npm/SEA qualification, or a performance target pass.

| Host | Passed | Explicitly skipped |
| --- | ---: | ---: |
| Linux x64, EPYC 7B13, Node 26.5.1 | 21 | 0 |
| Linux ARM64, Neoverse-N1, Node 26.5.1 | 21 | 0 |
| macOS ARM64, M1 Max, Node 26.5.0 | 21 | 0 |
| Windows x64, EPYC 7B13, Node 26.5.1 | 18 | 3 |

Windows lacks the prepared WASI compiler/sysroot; its three Wasm builds are
explicit skips. The native public path, dynamic path, missing/stale/unavailable
native fallback, budgets, cancellation/reentrancy, ownership, result/trace
contracts and no-FLINT/PARI/renderer-load witness pass there. The other hosts
also build and execute emitted Wasm arithmetic cores. Separate local tests run
the 200 sum and 296 centered/check cases in Chromium, Firefox and WebKit workers;
those tests do not turn this into public browser API qualification.

Each checkout has its own `dist`, with compiler/baselib initially copied from
the prior `14fdd4117` build and host TypeScript rebuilt at the frozen source.
Fresh mathematical source is imported via `SAGEJSPATH=src/lib`. The actual
compiler and rebuilt host-tool hashes are recorded rather than assuming all
host artifacts are identical. An intentionally nonexistent exact-arithmetic
prefix proves these binary64 builds do not need FLINT/MPC development files.

The collector records clean source before and after the run, process exit and
test counts, and the unedited TAP output. All tracked mathematical, compiler
and test input digests agree on all four hosts. Source digests select Git-tracked
files and hash the physical bytes: an initial development collector included
ignored host-specific Python caches in directory digests, so it was corrected
and all four test commands were rerun for these receipts. Caches were not deleted
to manufacture agreement. The original observations remain in ignored local
development logs; they are not used as these final receipts.

The exact collector is retained as `collector.cjs`. To reproduce it, use the
frozen checkout, prepare the recorded compiler/baselib basis in an owned `dist`,
and run the collector from that checkout with a new output path. It refuses an
unexpected source, dirty checkout, shared `dist`, or existing output. Native and
WASI toolchains must already be available; this does not install dependencies.

The production/native default remains unchanged. Full current application,
minimum-Node, independently lazy floating-pack, browser-public, npm/SEA,
artifact-bound public provenance and end-to-end latency qualification remain
open.
