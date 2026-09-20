#!/bin/sh
set -eu

toolchain_digest=37d8d819fd533570e0b707d3101ab2944f6488c4b4452b2b0a1a9ea04366452c
git_common=$(git rev-parse --git-common-dir)
toolchain="$git_common/sagejs-wasm-toolchains/v2/$toolchain_digest"
receipt="$toolchain/receipt.json"
test "$(jq -r .lockDigest "$receipt")" = "$toolchain_digest"
test "$(jq -r .libraries.gmp.version "$receipt")" = 6.2.1
test "$(jq -r .libraries.mpfr.version "$receipt")" = 4.2.2
test "$(jq -r .libraries.gmp.archiveSha256 "$receipt")" = \
  66eb596677c3acd0e87f3118b69316dcba31695d569b5fe1020a9ff1ee0d12a4
test "$(jq -r .libraries.mpfr.archiveSha256 "$receipt")" = \
  7a072da2bff34576648422e0c83ad7cf82c8ea99f0898902cf1653de3654998a

export CC="$PWD/gmp-mpfr-cross-cc.sh"
export SAGEJS_WASI_CLANG="$toolchain/sdk/bin/clang"
export SAGEJS_GMP_PREFIX="$toolchain/prefixes/gmp"
export SAGEJS_MPFR_PREFIX="$toolchain/prefixes/mpfr"
export SAGEJS_WASI_SYSROOT="$toolchain/sdk/share/wasi-sysroot"
export CARGO_TARGET_WASM32_WASIP1_LINKER="$toolchain/sdk/bin/wasm-ld"

cargo build --locked --release --target wasm32-wasip1
mkdir -p build
cp target/wasm32-wasip1/release/sagejs_rust_wasm_prepared_relation_prefix.wasm \
  build/prepared-relation-prefix.wasm
sha256sum build/prepared-relation-prefix.wasm
