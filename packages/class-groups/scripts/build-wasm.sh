#!/bin/sh
set -eu

package=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
root=$(CDPATH= cd -- "$package/../.." && pwd)
git_common=$(git -C "$root" rev-parse --git-common-dir)
case "$git_common" in /*) ;; *) git_common="$root/$git_common" ;; esac

toolchain_digest=1e306620de0571d34f6fc1bf0010aaf164e9b328d304bcd3cfd0d86f945634ba
toolchain=${SAGEJS_CLASS_GROUP_WASI_TOOLCHAIN:-"$git_common/sagejs-wasm-toolchains/v2/$toolchain_digest"}
receipt="$toolchain/receipt.json"
test -f "$receipt" || {
  echo "class-group WASI toolchain receipt not found: $receipt" >&2
  exit 2
}
test "$(jq -r .lockDigest "$receipt")" = "$toolchain_digest"
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
