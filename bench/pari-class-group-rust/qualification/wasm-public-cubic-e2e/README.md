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
node run-query-node.mjs
node run-browsers.mjs
node run-product-worker-publication-node.mjs
```

The build script accepts only the content-addressed Sage.js Wasm toolchain
`1e306620de0571d34f6fc1bf0010aaf164e9b328d304bcd3cfd0d86f945634ba`
and verifies its GMP 6.3.0, MPFR 4.2.2, and FLINT 3.6.0 identities. The
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

The current qualification reactor is 5,913,579 bytes (2,371,300 bytes gzip),
with SHA-256
`213627330407a0552c23b27a5620b7793329c4b641e756aa01246aa9fe7400f9`.
Its stable row-6 projection passed in Node and Chromium after adding the
detached publication-candidate bundle. The preceding 5,867,215-byte artifact
passed the same projection in Node, Chromium, Firefox, and WebKit after the
general mixed-invariant remediation. The result has 1,144 authenticated
relations and records both requested precision and the exact two-attempt
4,096/2,048- then 8,192/4,096-bit schedule. Each runtime grew from 256 to 2,166
Wasm pages in the earlier adapter build and now reaches 2,109 pages (131.8 MiB)
from the same 256-page start. Representative direct-shared-source one-shot calls
were 30.68 seconds in Node, 31.69 seconds in Chromium, 235.46 seconds in Firefox,
and 32.77 seconds in WebKit. These are smoke measurements, not warmed benchmark
medians. The native frozen public benchmark for the same field is 5.826 seconds
(PARI 3.960 seconds), so Wasm is working end to end and remains within the
256-MiB worker memory ceiling, but is not yet competitive. Firefox remains the
largest target-specific problem.

The Node guest's stage times localize its 30.66-second sealed computation to
0.17 seconds of public preparation, 9.44 seconds of relation collection, 4.46
seconds of candidate authentication, and 16.54 seconds of unit/analytic
completion. This is actionable evidence: the full computation does not fail at
an incomplete boundary, and the dominant Wasm work is known. The historical
5,679,772-byte, 1,137-relation result remains useful as a pre-remediation
baseline but is no longer the current source closure.

## Shared native and Wasm source closure

The reactor now depends directly on `../public-cubic-e2e`, which in turn uses
the same root class-group crate as the native executable. The root manifest
unifies Rug 1.30 with `gmp-mpfr-sys` 1.7.1's authenticated cross-build features,
and its target-aware `build.rs` selects native FLINT/OpenBLAS or the pinned WASI
FLINT/GMP/MPFR archives. The former `core-wasm` and `public-wasm` compatibility
copies have been deleted: there is one mathematical Rust source graph and one
checked exact-width C bridge for both targets.

The shared bridge converts every signed/unsigned 64-bit value through `fmpz`,
uses `arb_*_fmpz` operations, and checks precision against target `c_long`.
The same source passes native tests and the exact wasm32 resident-query harness.

This remains an isolated qualification reactor. It is **not the Sage.js public
loader/product route**: the browser smoke intentionally reuses the dedicated
qualification route at `qualification/browser/class-group-route.html`. This is
strong feasibility evidence, not final product integration. See
`ROOT-INTEGRATION.md` for the completed source integration and remaining product
loader work.

The reactor also accepts
`public-cubic-arbitrary-ideal-query-request-v1`. The committed nontrivial C2
vector supplies a canonical integral-ideal HNF, and `run-query-node.mjs` checks
the complete class number, nonzero class coordinate, echoed input lattice, and
nonempty exact quotient witness. The same harness now opens a bounded resident
completed-field session, repeats that query byte-for-byte, closes it, and proves that
stale queries, double closes, and a fifth concurrent session fail closed. The
artifact used for that resident-query receipt is 5,867,215 bytes with SHA-256
`0b94eeaddaa40984b223968384d8a4db4842e9728c71f6e58572481a92603bd6`.
The direct-shared-source Node run took 88.96 ms to open and complete the field,
10.75 ms for the first query, 7.93 ms for the repeated query, and 0.42 ms to close it.
Linear memory remained at 256 pages (16 MiB). Handles increase monotonically,
are never reused after close, and the qualification reactor admits at most four
resident sessions.
