#!/bin/sh
set -eu

package=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
root=$(CDPATH= cd -- "$package/../.." && pwd)
resolver="$root/packages/wasm-toolchain/scripts/toolchain.cjs"
toolchain=$(node "$resolver" path)
receipt="$toolchain/receipt.json"
# `toolchain.cjs path` has already authenticated the receipt, host-specific
# SDK, libraries, headers, and archives. Keep these package-level requirements
# explicit as an independent guard against accidentally weakening the class-
# group arithmetic closure in the shared lock.
test "$(jq -r .libraries.gmp.version "$receipt")" = 6.3.0
test "$(jq -r .libraries.mpfr.version "$receipt")" = 4.2.2
test "$(jq -r .libraries.flint.version "$receipt")" = 3.6.0

export CC="$package/scripts/gmp-mpfr-cross-cc.sh"
export SAGEJS_WASI_CLANG="$toolchain/sdk/bin/clang"
export SAGEJS_WASI_AR="$toolchain/sdk/bin/llvm-ar"
export SAGEJS_GMP_PREFIX="$toolchain/prefixes/gmp"
export SAGEJS_MPFR_PREFIX="$toolchain/prefixes/mpfr"
export SAGEJS_FLINT_PREFIX="$toolchain/prefixes/flint"
export SAGEJS_WASI_SYSROOT="$toolchain/sdk/share/wasi-sysroot"
export CARGO_TARGET_WASM32_WASIP1_LINKER="$toolchain/sdk/bin/wasm-ld"
# The maximum is a link-time contract, not an observed-memory claim.
export RUSTFLAGS="-C target-feature=+simd128 -C link-arg=--export-memory -C link-arg=--initial-memory=16777216 -C link-arg=--max-memory=268435456"

cargo build --locked --release --target wasm32-wasip1 --lib \
  --manifest-path "$package/Cargo.toml"
mkdir -p "$package/dist"
cp "$package/target/wasm32-wasip1/release/sagejs_class_groups.wasm" \
  "$package/dist/class-group-core.wasm"
node "$package/scripts/verify-wasm.mjs" "$package/dist/class-group-core.wasm"
sha256sum "$package/dist/class-group-core.wasm"
