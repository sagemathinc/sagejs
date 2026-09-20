# Prepared cubic relation-prefix Wasm milestone

This bounded artifact advances the real row-6 prepared-cubic browser path past
factor-base construction and into production relation collection. From the
answer-free neutral prepared-field document it executes:

1. exact prepared-field replay and maximal-order factor-base construction;
2. 320-bit MPFR embeddings;
3. exact ideal arithmetic and LLL preparation;
4. Fincke–Pohst enumeration and exact norm evaluation;
5. bounded smoothness admission and exact prime-ideal valuation; and
6. modular relation-cache insertion.

The immutable resource limits are one visited ideal and 64 primitive
nonscalar candidates. They yield one newly appended relation after the 203
structural rows, while 926 rank directions remain missing. The output is
therefore explicitly `bounded-stage`; it is not a class group and is not W0 or
R5 evidence.

The qualification ABI makes those limits explicit in its request envelope:
`maximumVisitedIdeals` must be 1 and `maximumCandidates` must be 64. They are
artifact constants for this milestone, not caller-selectable performance
controls. Missing or different values are rejected before the neutral prepared
field is parsed, and the accepted values are echoed in the result.

## Arithmetic bridge

The artifact includes the current production Rust modules by path. The
qualified toolchain pins GMP 6.2.1 and MPFR 4.2.2, so the qualification crate
uses the matching Rug 1.19.2 / `gmp-mpfr-sys` 1.5.3 binding line. Its small
cross-probe adapter supplies only authenticated target ABI metadata (32-bit
GMP limbs and the exact library versions); the final Wasm links the prepared
GMP and MPFR archives. This compatibility bridge should eventually be replaced
by a reviewed shared direct arithmetic backend or a coordinated GMP upgrade.

## Reproduce

```bash
./build-wasm.sh
node prepare-vector.mjs
node ../browser/run-browser.mjs \
  --engines chromium,firefox,webkit \
  --artifact bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/build/prepared-relation-prefix.wasm \
  --vector bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/build/row6.vector.json \
  --output bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/receipt.json
```

The shared browser runner performs 15 complete allocate/run/copy/free calls in
every engine. For the same-source native comparison, set both arithmetic
prefixes to `packages/flint/.native/prefix`, use the cross-probe adapter with
`SAGEJS_GMP_LIMB_BITS=64`, and run `native-benchmark`.

From the repository root, run the complete 43-test native qualification suite
with the exact prepared arithmetic environment:

```bash
SAGEJS_GMP_PREFIX="$PWD/packages/flint/.native/prefix" \
SAGEJS_MPFR_PREFIX="$PWD/packages/flint/.native/prefix" \
SAGEJS_GMP_LIMB_BITS=64 \
CC=gcc \
cargo test --release --lib \
  --manifest-path bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/Cargo.toml
```

## Recorded result

The frozen SIMD-enabled artifact is 697,980 bytes and has SHA-256
`4c1faa8506e43fa86cafb34b1c7ac4370ad0afb61e7a35610da93c85866ce13e`.
All 45 browser calls (15 per engine) and all 15 native calls returned the same
exact prefix digest,
`7e4c9242d3fa92c7bc7f8fbb3e9c68cc77f66cbc5838657cf38e610c66ba22b3`.
The result contains 204 resident relation rows (203 structural rows plus one
newly collected relation), reports 926 missing rank directions, and leaves
`completeRankAndSurplus` false.

Median complete-call times were:

| Runtime | Median | Native ratio |
| --- | ---: | ---: |
| Native Linux | 223.851 ms | 1.000x |
| Chromium | 526.4 ms | 2.352x |
| Firefox | 3724 ms | 16.636x |
| WebKit | 462 ms | 2.064x |

The production collector previously reserved its full 11,420-row PARI working
capacity even though this bounded prefix can contain only the 203 seeded rows
plus at most 64 counted candidate rows. That made the dense records allocation
103,236,800 bytes. The collector now proves the bounded capacity as 267 rows
and records it in every result; the corresponding allocation is 2,413,680
bytes. The unbounded/default collector still selects the original full
capacity, and an undersized seed cache fails with `CapacityExhausted`.

The final bounded-storage plus SIMD artifact grows every engine from 18 pages
to only 258 after all 15 calls (16,908,288 bytes), down from 3,357 pages
(220,004,352 bytes): a 92.3% reduction. Relative to the original artifact, the
combined result also lowers median time 21.7% natively, 23.8% in Chromium,
20.9% in Firefox, and 26.1% in WebKit. In a separate same-source build
comparison after bounding storage, stable Wasm SIMD changed Chromium/WebKit by
less than 1% and lowered the Firefox median from 3,886 ms to 3,755 ms (3.4%),
so the final build pins it explicitly.

Firefox's ratio to native did not improve: it is 16.636x, versus 16.480x
before this change, because native improved slightly more. The separately
qualified prepared-factor-base artifact measures 216.698 ms natively and
3,401 ms in Firefox—about 97% and 91% of this artifact's respective medians.
Thus the residual Firefox ratio is localized primarily to the already-existing
prepared factor-base/GMP path, not relation-cache storage or this bounded
relation prefix. Exact before/after values and hashes are frozen in
`optimization-receipt.json`.

The browser qualification host supplies only an explicitly allowlisted empty
environment shim plus WASI clock, file-descriptor, and process-exit functions:
`environ_get`, `environ_sizes_get`, `clock_time_get`, `fd_close`,
`fd_prestat_get`, `fd_prestat_dir_name`, `fd_seek`, `fd_write`, and
`proc_exit`. This is the real three-engine qualification route, but the empty
environment shim is not yet the unmodified production Sage.js host. These
receipts establish only this deterministic bounded relation-collection stage;
they do not establish W0, R5, a complete presentation, units, or a class group.
