# Prepared scalar and root API qualification

All four persistent hosts pass the same public API fixtures. Each compiles its
own native evaluator/root code and exercises real native, forced dynamic,
missing-cache and stale-cache execution, with exact-library-load guards.
Independent CPython checks, parameter changes, domain failures, bounded
evaluations and a deliberately forged successful root candidate are included.

| Host | Node | CPython oracle | Result |
| --- | --- | --- | --- |
| Linux x64 | 26.5.1 | 3.12.3 | 3/3 tests pass |
| Linux ARM64 | 26.5.1 | 3.12.3 | 3/3 tests pass |
| macOS ARM64 | 26.8.1 | 3.14.6 | 3/3 tests pass |
| Windows x64 | 26.5.1 | 3.13.7 | 3/3 tests pass |

The collector is `bench/numerics/performance/prepared-api-portable.cjs`.
It hashes 3,087 selected source, compiler, runtime, dependency and test files
before and after execution, records actual subprocess status, and refuses to
overwrite a receipt. Every host has the same unchanged snapshot:
`dc99597914886d7faf9980984cee2f5ab60b79b89a2fae5e30dd5f2bdf786218`.
Native build outputs live in per-test temporary caches outside that snapshot.
Python bytecode caches and unused package-manager metadata are excluded.

Mathematical source is `9c5066f72`. These runs reuse the already-built compiler
runtime from the development worktree, included in the snapshot; they are not
a new release build. The source/runtime transfer archive hash was
`d10bb0bea92d32cffdb2bb754c3e13f032bffe93c7e348a7ef1c4accd2d84c9a`;
the final hoisted build-dependency overlay hash was
`1ddca4aa54538f51e9aff6e9c3384943e653394f1012bf1557d39f04965fc798`.
The dependency overlay supplies pinned `node-gyp` 13.0.1 and its lockfile.
The collector was copied identically to each bundle and is itself hashed.

Initial setup attempts failed because dereferencing a pnpm dependency link
without relocating its sibling dependencies breaks `node-gyp` resolution.
Use a hoisted dependency tree for this kind of transferable compiler fixture;
do not infer a numerical failure from a compiler setup failure. macOS's system
Python 3.9 is too old for the oracle; its existing Python 3.14 was selected.
No mathematical source or test expectations changed during qualification.

This is focused **source API qualification**, not browser product, npm/SEA,
full-suite, memory, performance or release qualification. The separate local
timings are development observations, not four-platform speed claims. Native
Node 22.22.2 checks were run locally but are not these four-host receipts.
