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

From the repository root, run the complete 42-test native qualification suite
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

The frozen artifact is 691,342 bytes and has SHA-256
`fd55293ad67d39547738f4406d8f341d7b1ba297cdac106071f4ae9ec65f5cbb`.
All 45 browser calls (15 per engine) and all 15 native calls returned the same
exact prefix digest,
`7e4c9242d3fa92c7bc7f8fbb3e9c68cc77f66cbc5838657cf38e610c66ba22b3`.
The result contains 204 resident relation rows (203 structural rows plus one
newly collected relation), reports 926 missing rank directions, and leaves
`completeRankAndSurplus` false.

Median complete-call times were:

| Runtime | Median | Native ratio |
| --- | ---: | ---: |
| Native Linux | 285.734 ms | 1.000x |
| Chromium | 690.5 ms | 2.416x |
| Firefox | 4709 ms | 16.480x |
| WebKit | 625 ms | 2.187x |

The Wasm linear-memory high-water mark is currently large: every engine grew
from 18 pages before the first call to 3,357 pages after the final call (about
220 MB). The output buffers are freed with their exact slice layouts and the
repeated lifecycle is correct, but the Rust/GMP allocator does not return its
linear-memory high-water mark to the host. Reducing peak workspace allocation
and proving reuse is therefore a required next optimization, not evidence of
a leak in the exported buffer ABI.

The browser qualification host supplies only an explicitly allowlisted empty
environment shim plus WASI clock, file-descriptor, and process-exit functions:
`environ_get`, `environ_sizes_get`, `clock_time_get`, `fd_close`,
`fd_prestat_get`, `fd_prestat_dir_name`, `fd_seek`, `fd_write`, and
`proc_exit`. This is the real three-engine qualification route, but the empty
environment shim is not yet the unmodified production Sage.js host. These
receipts establish only this deterministic bounded relation-collection stage;
they do not establish W0, R5, a complete presentation, units, or a class group.
