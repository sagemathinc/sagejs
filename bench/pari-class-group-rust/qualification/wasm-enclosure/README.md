# Rust MPFR/MPC WebAssembly enclosure probe

This probe clears the high-precision real/complex portion of class-group gate
W0 without `gmp-mpfr-sys`. A small reviewed Rust FFI directly links Sage.js's
authenticated MPFR 4.2.2, MPC 1.4.1 and GMP 6.2.1 static archives. The same
Rust function graph also links the opt VM's native runtime libraries.

The computation isolates the largest real root `alpha` of
`x^3 - 3*x - 1` using sign-certified directed-rounding bisection, escalating
from 96 to 192 bits until the root interval is narrower than `2^-160`. It then
constructs directed MPFR enclosures for

```text
log(alpha + i)
  = log(alpha^2 + 1)/2 + i*atan(1/alpha)
```

and separately computes the midpoint value with MPC. The directed MPFR
endpoints are the sole rigor authority; MPC is only a consistency check whose
real and imaginary parts must lie within those enclosures. This is directly
representative of the precision escalation, real embeddings, complex
embeddings and logarithmic enclosures needed by regulator reconstruction.
It is not itself a regulator algorithm.

`oracle.py` uses independent mpmath polynomial root finding and complex
logarithms at 180 decimal digits. It verifies both precision stages, every
enclosure, strict refinement, the MPC midpoint, and the final stopping rule.
Native Linux, Node-Wasm, Chromium, Firefox and WebKit produced byte-identical
1,759-byte results with SHA-256
`44a9db537f76b92c6b1db5058ae0714f6f68bf00a27d78f197923281bf9f1849`.

## Reproduce

This experiment uses and qualifies the current final patched recipe identity
`37d8d819fd533570e0b707d3101ab2944f6488c4b4452b2b0a1a9ea04366452c`.
Its authenticated receipt identifies WASI SDK 33, GMP 6.2.1, MPFR 4.2.2 and
MPC 1.4.1:

```sh
PROBE=bench/pari-class-group-rust/qualification/wasm-enclosure
WASM_ROOT=/home/user/sagejs/.git/sagejs-wasm-toolchains/v2/37d8d819fd533570e0b707d3101ab2944f6488c4b4452b2b0a1a9ea04366452c

cargo build --release --manifest-path "$PROBE/Cargo.toml"
"$PROBE/target/release/sagejs-rust-wasm-enclosure-probe" > /tmp/native.json
python3 "$PROBE/oracle.py" < /tmp/native.json
python3 "$PROBE/run-native.py"

SAGEJS_MPC_PREFIX="$WASM_ROOT/prefixes/mpc" \
SAGEJS_MPFR_PREFIX="$WASM_ROOT/prefixes/mpfr" \
SAGEJS_GMP_PREFIX="$WASM_ROOT/prefixes/gmp" \
SAGEJS_WASI_SYSROOT="$WASM_ROOT/sdk/share/wasi-sysroot" \
  cargo build --target wasm32-wasip1 --release --lib \
    --manifest-path "$PROBE/Cargo.toml"
node "$PROBE/run-wasm.mjs"
node "$PROBE/run-browser.mjs"
```

## Observations on the opt VM

The release Wasm artifact is 265,132 bytes. Each actual browser executed 15
fresh instances through Sage.js's WASI host. Linear memory remained exactly 17
pages before and after computation (no growth):

| Engine | Compile ms | Instantiate median ms | Compute median ms |
| --- | ---: | ---: | ---: |
| Chromium 151.0.7922.34 | 6.2 | 0.1 | 1.1 |
| Firefox 153.0 | 17 | 0 | 5 |
| WebKit 26.5 | 9 | 0 | 1 |

The native fresh-process boundary (which deliberately includes executable
startup) had a 2.11 ms median across 15 samples, with a 1.83--2.58 ms range.
Linux reported a cumulative child maximum RSS of 17,732 KiB; unlike the Wasm
page observation, that process-level figure includes the dynamic loader and
shared native libraries.

The artifact imports eight WASI functions: `environ_get`,
`environ_sizes_get`, `fd_close`, `fd_prestat_get`, `fd_prestat_dir_name`,
`fd_seek`, `fd_write`, and `proc_exit`. As in the exact-arithmetic probe, only
the two environment imports need zero-environment shims beyond the current
production allowlist. They originate in Rust `std`, not MPFR/MPC. This probe
therefore clears availability, correctness, deterministic cross-engine output,
enclosure behavior, artifact-size and memory-growth questions. Removing the
two known `std` imports remains the already-localized host/ABI cleanup before
W0 is marked unconditionally complete.

Arb is not present in this authenticated toolchain. It was not needed: directed
MPFR endpoint arithmetic supplies the required rigorous enclosures, while MPC
supplies the independent complex midpoint computation.
