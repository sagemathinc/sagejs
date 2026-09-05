# N2 private binary64 source qualification

These are focused source/compiler-boundary receipts, **not public statistics,
complete product builds, npm/SEA qualification, or performance target passes**.
Frozen source: `fb9eb23f7e5c17d84fdd8a5fc83aac8ea23f2e8f`.

| Host | Native/source tests | Local Node-Wasm builds | Total |
| --- | --- | --- | --- |
| Linux x64, EPYC 7B13 | 6 pass | 2 pass | 8 pass |
| Linux ARM64, Neoverse-N1 | 6 pass | 2 pass | 8 pass |
| macOS ARM64, M1 Max | 6 pass | 2 pass | 8 pass |
| Windows x64, EPYC 7B13 | 6 pass | 2 explicitly skipped | 6 pass, 2 skip |

The Windows checkout has no prepared WASI compiler/sysroot. Its native
ClangCL build with FP contraction disabled and an intentionally nonexistent
FLINT/MPC prefix passes; the skips do not count as Windows Wasm qualification.
The other hosts compile and execute emitted Wasm. Separate local Linux tests
also execute all 200 exact-rational/CPython summation cases in actual Chromium,
Firefox and WebKit workers (`SAGEJS_NUMERICAL_BROWSER_TESTS=1`); these are kernel
witnesses, not the public browser application.

Each JSON records the exact source files, generated runtime/compiler hashes,
Node/Python/OS/CPU versions, source cleanliness, and unedited test output after
the source identity line. The original eight-test command exited zero on each
host. Runtime/compiler files were initially borrowed from the dedicated
`14fdd4117` build. Each checkout then received its **own copy** of `dist` and
rebuilt host TypeScript at `fb9eb23f7`; shared baseline artifacts were not
overwritten. The Windows compiler artifact differs from the Unix artifact;
its actual hash is recorded, not replaced by a cross-host assumed identity.
The typed mathematical source, core generators, tests and rebuilt host tools
have identical recorded hashes on all four hosts.

Reproduction after preparing that source and compiler/runtime basis:

```sh
node node_modules/typescript/bin/tsc -p tsconfig.json
SAGEJS_FLINT_PREFIX=/an/intentionally/nonexistent/prefix node --test \
  test/numerics/performance/packed-reductions.cjs \
  tools/native-kernel/test/float64-conditional.cjs
```

On Windows set `SAGEJS_FLINT_PREFIX` in the process environment and use the same
Node test command. No dependency installation is required in these prepared
checkouts. Direct execution of the installed TypeScript compiler avoids pnpm's
automatic dependency reconciliation against deliberately borrowed `node_modules`.

The rerun verifies the macOS physical-path alias lookup fix, changed-source
cache rejection, explicit-empty-cache fallback, and safe Windows loaded-addon
cleanup. It also retains capacity rejection, unmodified input and transactional
output checks for the private summation. All input buffers are caller-owned
and non-aliasing in this scope; public ownership/cancellation/memory guards,
lazy production packaging and end-to-end target evidence remain N2 work.
