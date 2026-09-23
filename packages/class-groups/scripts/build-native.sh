#!/bin/sh
set -eu

package=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"$package/scripts/cargo-native.sh" build --locked --release \
  --manifest-path "$package/Cargo.toml" --bin class-group-service
binary="$package/target/release/class-group-service"
test -x "$binary"

# A statically resolved binary must contain at most one definition of a stable
# GMP allocator-domain sentinel. Dynamic packaging records the dependency case.
if command -v nm >/dev/null 2>&1; then
  definitions=$(nm -g "$binary" 2>/dev/null | awk '$NF ~ /^_?_?gmpz_init$/ && $2 !~ /^[Uu]$/ {count++} END {print count+0}')
  test "$definitions" -le 1 || {
    echo "multiple GMP allocator domains detected in $binary" >&2
    exit 3
  }
fi
printf '%s\n' "$binary"

