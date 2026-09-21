# Complete public-cubic Wasm qualification

This lane runs the real coefficient-only cubic class-group path as a
`wasm32-wasip1` reactor. It starts with

```text
x^3 - 2000000000010*x + 2000000000018
```

and crosses public preparation, maximal-order certification, relation
collection, compact-presentation authentication, unit reconstruction,
analytic completion, and sealed-result verification. The checked JSON ABI has
no representation for prepared fields, relations, or expected answers.

The stable projection requires class number `4`, invariant factors `[2, 2]`,
equation-order index `3`, 1,130 factor-base ideals, 1,144 authenticated
relations, rank-two unit evidence, and a sealed conditional-GRH result. Both
the Node and browser harnesses compare this projection exactly and exclude only
the runtime-dependent stage timers.

## Build and run

From this directory:

```bash
./build-wasm.sh
node run-node.mjs
node run-browsers.mjs
```

The build script accepts only the content-addressed Sage.js Wasm toolchain
`37d8d819fd533570e0b707d3101ab2944f6488c4b4452b2b0a1a9ea04366452c`
and verifies its GMP 6.2.1, MPFR 4.2.2, and FLINT 3.6.0 identities. The
reactor links those static archives and the repository's bounded WASI host.

For a same-source native regression run:

```bash
native_prefix="$PWD/../../../../packages/flint/.native/prefix"
CC="$PWD/gmp-mpfr-cross-cc.sh" \
SAGEJS_WASI_CLANG=gcc \
SAGEJS_GMP_LIMB_BITS=64 \
LD_LIBRARY_PATH="$native_prefix/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
cargo test --release --all-targets
```

## Current complete result

The current qualified reactor is 5,779,673 bytes (2,327,383 bytes gzip). Its
stable row-6 projection passed in Node, Chromium, Firefox, and WebKit after the
general mixed-invariant remediation. The result has 1,144 authenticated
relations and records both requested precision and the exact two-attempt
4,096/2,048- then 8,192/4,096-bit schedule. Each runtime grew from 256 to 2,166
Wasm pages (16.0 to 135.4 MiB). Representative one-shot calls were 31.27
seconds in Node, 31.58 seconds in Chromium, 237.67 seconds in Firefox, and
32.81 seconds in WebKit. These are smoke measurements, not warmed benchmark
medians. The native frozen public benchmark for the same field is 5.826 seconds
(PARI 3.960 seconds), so Wasm is working end to end and remains within the
256-MiB worker memory ceiling, but is not yet competitive. Firefox remains the
largest target-specific problem.

The Node guest's stage times localize its 31.25-second sealed computation to
0.17 seconds of public preparation, 9.67 seconds of relation collection, 4.67
seconds of candidate authentication, and 16.68 seconds of unit/analytic
completion. This is actionable evidence: the full computation does not fail at
an incomplete boundary, and the dominant Wasm work is known. The historical
5,679,772-byte, 1,137-relation result remains useful as a pre-remediation
baseline but is no longer the current source closure.

## Why there are two manifest adapters

The public adapter depends on `public-wasm`, which compiles the exact
`public-cubic-e2e/src/lib.rs` source. That in turn depends on `core-wasm`, which
compiles the exact shared Rust core modules. The shims exist because the
current shared manifests are not yet cross-target manifests:

- Rug 1.30 selects `gmp-mpfr-sys` 1.7.1, which rejects cross-compilation unless
  `force-cross` is unified and requires GMP 6.3.0; the authenticated Sage.js
  Wasm toolchain currently contains GMP 6.2.1.
- the shared `build.rs` invokes host `cc`/`ar`, uses the native FLINT prefix,
  and always links native OpenBLAS and pthread assumptions;
- Rust-to-C precision conversion assumed native `c_long` width; and
- the regulator C bridge explicitly rejected 32-bit FLINT `slong` and narrowed
  signed 64-bit polynomial and basis values through it.

The qualification shim therefore uses the already-qualified Rug 1.19.2 /
`gmp-mpfr-sys` 1.5.3 line. Its Rust source adaptations are the spelling of one
zero predicate missing from old Rug and two fail-closed `u32`-to-`c_long`
precision conversions; the build asserts the exact source counts before
changing them. The shared bridge now converts every signed/unsigned
64-bit value through `fmpz`, uses `arb_*_fmpz` operations, and checks precision
against target `c_long`. The shared core's six applicable 64-bit regulator
tests pass natively, including row-6; the seventh width-specific test is
compiled only for 32-bit targets, and the exact row-6 browser receipts exercise
the wasm32 bridge in Node and all three browser engines.

The adapter build script now declares the complete shared Rust source directory
as a Cargo input. A clean rebuild after the authority-encoding change produced
artifact SHA-256
`95bd77560e40dd2b9c6f11a1f0b71006394a57e44c2686790ff839ab30c1be1e`;
touching a shared core module then caused Cargo to rebuild `core-wasm`,
`public-wasm`, and the final reactor. This closes the previously observed risk
that an incremental build could silently reuse stale compatibility-generated
Rust sources.

This is an isolated qualification adapter. It is **not the Sage.js public
loader/product route**: the browser smoke intentionally reuses the dedicated
qualification route at `qualification/browser/class-group-route.html`. This is
strong feasibility evidence, not final product integration. See
`ROOT-INTEGRATION.md` for the remaining shared manifest/toolchain work needed
to remove the adapter.
