#!/bin/sh
set -eu

toolchain_digest=37d8d819fd533570e0b707d3101ab2944f6488c4b4452b2b0a1a9ea04366452c
git_common=$(git rev-parse --git-common-dir)
toolchain="$git_common/sagejs-wasm-toolchains/v2/$toolchain_digest"
test "$(jq -r .lockDigest "$toolchain/receipt.json")" = "$toolchain_digest"

export CARGO_TARGET_WASM32_WASIP1_LINKER="$toolchain/sdk/bin/wasm-ld"
cargo build --locked --release --target wasm32-wasip1
mkdir -p build
cp target/wasm32-wasip1/release/sagejs_rust_wasm_factor_pattern_ab.wasm \
  build/factor-pattern-ab.wasm
sha256sum build/factor-pattern-ab.wasm
