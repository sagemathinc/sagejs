#!/bin/sh
set -eu

package=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
root=$(CDPATH= cd -- "$package/../.." && pwd)
toolchain=$(node "$root/packages/wasm-toolchain/scripts/toolchain.cjs" path)

# The package links only the shared imaginary.rs mathematics, serde, and
# smallvec. Keep its development artifact out of the production package until
# the exact source closure and this reactor ABI have distribution approval.
export CARGO_TARGET_WASM32_WASIP1_LINKER="$toolchain/sdk/bin/wasm-ld"
export RUSTFLAGS="-C target-feature=+simd128 -C link-arg=--export-memory -C link-arg=--initial-memory=16777216 -C link-arg=--max-memory=268435456"
cargo build --locked --release --target wasm32-wasip1 --lib \
  --manifest-path "$package/Cargo.toml"

artifact="$package/target/wasm32-wasip1/release/sagejs_imaginary_quadratic_core.wasm"
node "$root/packages/class-groups/scripts/verify-wasm.mjs" "$artifact"
sha256sum "$artifact"
