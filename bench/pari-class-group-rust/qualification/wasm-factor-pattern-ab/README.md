# Cubic factor-pattern residue-width A/B

This artifact isolates the modular root scan used by the production prepared
cubic factor base. It runs the row-6 polynomial through every rational prime
at most 9,196 and serializes all factor records into one exact digest.

The harness freezes two independent local implementations:

- `baseline` is the original `i128` multiply-add and remainder kernel;
- `bounded-i64` uses `i64` only when
  `(p - 1)^2 + (p - 1) <= i64::MAX`, and otherwise calls the frozen `i128`
  implementation.

Because every operand is first reduced into `[0, p)`, the largest fast-path
intermediate is `(p - 1)^2 + (p - 1)`. The guard is evaluated in division
form, so the proof check cannot overflow. Tests exercise the whole row-6 prime
range, extreme signed coefficients, counterfeit requests, nontrivial operands
at the exact supported boundary `p = 3,037,000,500`, and the fallback at
`p + 1`.

The two request vectors, Cargo dependency resolution, and Wasm toolchain digest
are committed. All evidence below was rebuilt in a clean detached worktree at
revision `c4d07156194765506d137792732ba5109cd8c87e`. The aggregate receipt binds
the complete imported production-source closure, build scripts, three Cargo
locks, vectors, browser harness, native executables and libraries, prepared
Wasm toolchain, and resulting Wasm artifacts.

The browser closure follows every executed local import through
`class-group-route.mjs`, `browser-loader.mjs`, and the WASI runtime, constants,
and bounded-filesystem modules; the pnpm lock binds Playwright. Historical
before measurements are bound to the commits that recorded each native/browser
pair, and their embedded browser measurement revisions, raw samples, medians,
outputs, and memory pages are revalidated. The native executable entries are
frozen identities of the exact measured binaries. Their paths document the
clean-worktree build locations; the binaries are intentionally not retained,
and those paths do not claim that a current file can be reopened there.

## Recorded result

All 60 native samples and all 180 actual-browser samples reproduced the exact
factor-pattern, factor-base descriptor, and relation-prefix digests. Median
factor-pattern times were:

| Runtime | i128 baseline | bounded i64 | Speedup |
| --- | ---: | ---: | ---: |
| Native Linux | 91.60 ms | 33.42 ms | 2.74x |
| Chromium | 298.1 ms | 38.1 ms | 7.82x |
| Firefox | 1,677 ms | 150 ms | 11.18x |
| WebKit | 194 ms | 38 ms | 5.11x |

The complete prepared factor base fell from 216.70 to 111.62 ms natively,
530.8 to 160.3 ms in Chromium, 3,401 to 950 ms in Firefox, and 419 to 163 ms
in WebKit. The bounded relation prefix fell from 223.85 to 121.15 ms natively,
526.4 to 201.2 ms in Chromium, 3,724 to 1,297 ms in Firefox, and 462 to 206 ms
in WebKit. Exact samples and identities are in `optimization-receipt.json` and
the linked stage receipts; `verify-evidence.mjs` checks their closure and all
sample-count, median, digest, memory-page, engine, and metadata invariants.

## Reproduce inputs and tests

From this directory:

```bash
node verify-inputs.mjs
cargo test --locked --release
cargo run --locked --release
./build-wasm.sh
```

The two real-browser A/B runs are:

```bash
node ../browser/run-browser.mjs \
  --engines chromium,firefox,webkit \
  --artifact bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/build/factor-pattern-ab.wasm \
  --vector bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/baseline.vector.json \
  --output bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/baseline.browser-receipt.json
node ../browser/run-browser.mjs \
  --engines chromium,firefox,webkit \
  --artifact bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/build/factor-pattern-ab.wasm \
  --vector bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/bounded-i64.vector.json \
  --output bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/bounded-i64.browser-receipt.json
```

After rebuilding all three artifacts and recording the native runs in a clean
worktree, assemble and verify the attributable receipts with:

```bash
node assemble-evidence.mjs CLEAN_WORKTREE REPOSITORY_WORKTREE RAW_RECEIPT_DIRECTORY
node verify-evidence.mjs
```

The verifier rejects evidence unless all engines have the required sample
count, all exact digests agree, medians match the raw samples, and source,
vector, executable, library, toolchain, host, and repository identities are
complete.
