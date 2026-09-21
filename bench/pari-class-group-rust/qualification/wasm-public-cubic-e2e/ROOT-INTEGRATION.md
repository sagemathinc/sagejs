# Proposed shared integration after source-closure qualification

Do not apply these changes while the frozen held-out/source-closure campaign is
running. This document records the exact integration work exposed by the
isolated complete-Wasm experiment.

## Arithmetic dependency decision

Prefer upgrading the content-addressed Wasm toolchain from GMP 6.2.1 to GMP
6.3.0, then keep the shared Rug 1.30 / `gmp-mpfr-sys` 1.7.1 line. Add a
target-specific direct `gmp-mpfr-sys` dependency enabling `force-cross` and
`use-system-libs` so Cargo feature unification makes Rug's binding usable for
`wasm32-wasip1`. Authenticate the GMP/MPFR ABI metadata with the same checked
cross-probe mechanism used here. Do not claim the existing GMP 6.2.1 archive
is 6.3.0.

Keeping GMP 6.2.1 instead requires a deliberate repository-wide Rug downgrade
or a maintained binding fork; the qualification adapter proves that route but
does not recommend it as the product configuration.

## Target-aware shared build script

Teach `bench/pari-class-group-rust/build.rs` to select by Cargo `TARGET`:

- native: retain the current pinned native FLINT/OpenBLAS/MPFR/GMP route;
- `wasm32-wasip1`: require content-addressed FLINT, MPFR, GMP, WASI sysroot,
  clang, and llvm-ar paths; compile `flint_normal_form.c` with WASI clang;
  archive `packages/flint-wasm/src/wasi-stubs.c`; link the Wasm FLINT, MPFR,
  GMP, `libm`, and `wasi-emulated-signal` archives; do not link native
  OpenBLAS or host pthread.

The final reactor needs exported memory, no entry point, a bounded maximum
memory, and the existing Sage.js WASI import allowlist. The observed complete
artifact imports filesystem calls because FLINT's qsieve object references
`mkstemp`; the bounded in-memory Sage.js WASI filesystem already services that
route.

## Shared bridge status

The qualification campaign exposed a required exact-width bridge change. It is
now present in the shared working tree (pending integration review): Rust uses
a checked target-width precision conversion,

```rust
c_long::try_from(precision).map_err(|_| FlintNormalFormError::InvalidDimensions)?
```

and C implements the following ordinary reviewed operations. Two other Rust
wrappers still use native-only `precision.into()` conversions; integrate the
qualification adapter's checked conversions for those wrappers as well.

1. Import `uint64_t` through two 32-bit limbs into `fmpz`, independent of
   target `ulong` width.
2. Add `sagejs_rust_fmpz_set_i64`, computing magnitude in unsigned arithmetic
   so `INT64_MIN` is supported, then applying `fmpz_neg`.
3. Rewrite the cubic Arb callback to load all polynomial coefficients through
   `fmpz`, using `arb_set_fmpz`, `arb_add_fmpz`, and exact small multipliers.
4. Construct the root-isolation bound as a `uint64_t`, transfer it through
   `fmpz`, and initialize the two `arf` endpoints with `arf_set_fmpz`.
5. In compact regulator reconstruction, transfer every signed 64-bit basis
   numerator through a reusable `fmpz` and use `fmpz_addmul`; transfer the
   unsigned 64-bit denominator through `fmpz` and use `arb_div_fmpz`.
6. Only after all narrowing operations are gone, remove the old
   `sizeof(slong) < sizeof(int64_t)` rejection. Preserve all other checks.

This is not an unchecked cast workaround: the C ABI remains `int64_t`, exact
values remain exact on both targets, and the shared implementation is what the
final clean artifact compiles. Keep these changes when integrating the lane.

## Remove the qualification shims

After shared integration and full native regression:

- point the reactor directly at `../public-cubic-e2e`;
- delete `core-wasm`, `public-wasm`, and their generated compatibility logic;
- rebuild with the upgraded content-addressed toolchain;
- repeat Node plus Chromium/Firefox/WebKit exact stable-projection runs; and
- run the open and held-out cubic panels on both native and browser routes.
