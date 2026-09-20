# Rust/GMP WASI arithmetic probe

This is the first executable probe for gate W0 in the Rust class-group core
qualification plan. The same Rust function graph performs a 521-bit GCD,
exact division and reconstruction, modular exponentiation with exponent
1,000,003, `1000!`, multiplication, addition, decimal conversion and internal
identity checks. It runs against system GMP on native Linux and Sage.js's
pinned GMP 6.2.1 archive on `wasm32-wasip1`.

The Rust/GMP boundary is deliberately small. GMP owns all limb storage; only a
borrowed byte view of the final Rust-owned JSON result crosses the Wasm ABI.
The Wasm artifact contains no Rust crate dependency beyond `std`.

The opt VM had an authenticated prepared Sage.js toolchain at digest
`bfd7e48e622a912f95ef24f64e93c85f3838459b8f75e47590f658b1feb84c74`.
The repository's current lock has a different digest and was not prepared, so
this probe names the inspected cached root explicitly:

```sh
PROBE=bench/pari-class-group-rust/qualification/wasm-arithmetic
WASM_ROOT=/home/user/sagejs/.git/sagejs-wasm-toolchains/v2/bfd7e48e622a912f95ef24f64e93c85f3838459b8f75e47590f658b1feb84c74

cd "$PROBE"
cargo build --release
target/release/sagejs-rust-wasm-arithmetic-probe

SAGEJS_GMP_PREFIX="$WASM_ROOT/prefixes/gmp" \
SAGEJS_WASI_SYSROOT="$WASM_ROOT/sdk/share/wasi-sysroot" \
  cargo build --target wasm32-wasip1 --release --lib
node run-wasm.mjs
node run-browser.mjs
```

`run-browser.mjs` starts a local HTTP server and executes 15 fresh module
instances in each installed Playwright Chromium, Firefox and WebKit through
Sage.js's `createWasiHost`. These are actual browser runs, not Node or Wasmtime
surrogates. The runner records compilation, instantiation, computation and
linear-memory pages for every engine.

Rust `std` imports the two empty environment calls that the production host's
current import allowlist omits; the full probe supplies zero-environment shims
around the first-party host. The accompanying `no_std` import experiment links
core Rust, GMP, WASI libc and `wasi-emulated-signal` with no environment imports:
its only imports are the already-supported `fd_close`, `fd_seek` and `fd_write`,
and it runs through the unmodified Sage.js host. This proves the imports are
removable. Extending that route to the full allocating/serializing pipeline is
the next implementation step.

The fixed result hash is checked by both JavaScript runners. It was also
derived independently with Python big integers. See
[`receipt.json`](./receipt.json) for exact toolchain identities, commands and
observations.

This probe establishes a viable Rust + pinned GMP + `wasm32-wasip1` route on
Linux and all three required browser engines. It does not pass W0 yet: the
current prepared toolchain build fails while merging FLINT objects, the full
pipeline still uses two environment shims, and high-precision real/complex and
enclosure arithmetic remain outstanding.
