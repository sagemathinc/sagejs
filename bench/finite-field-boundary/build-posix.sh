#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="${SAGEJS_FINITE_FIELD_BOUNDARY_BUILD:-$ROOT/build}"
NODE="${SAGEJS_FINITE_FIELD_BOUNDARY_NODE:-node}"
CC="${CC:-cc}"
WASM_CC="${WASM_CC:-clang}"
NODE_VERSION="$($NODE -p 'process.versions.node')"
HEADERS="$BUILD/node-v$NODE_VERSION"

mkdir -p "$BUILD"
if [[ ! -f "$HEADERS/include/node/node_api.h" ]]; then
  ARCHIVE="$BUILD/node-v$NODE_VERSION-headers.tar.gz"
  curl --fail --location --silent --show-error \
    "https://nodejs.org/download/release/v$NODE_VERSION/node-v$NODE_VERSION-headers.tar.gz" \
    --output "$ARCHIVE"
  rm -rf "$HEADERS"
  tar -xzf "$ARCHIVE" -C "$BUILD"
fi

case "$(uname -s)" in
  Darwin)
    "$CC" -O3 -DNDEBUG -bundle -undefined dynamic_lookup \
      -I"$HEADERS/include/node" "$ROOT/napi_modular.c" \
      -o "$BUILD/modular.node"
    ;;
  Linux)
    "$CC" -O3 -DNDEBUG -shared -fPIC \
      -I"$HEADERS/include/node" "$ROOT/napi_modular.c" \
      -o "$BUILD/modular.node"
    ;;
  *)
    echo "build-posix.sh supports Linux and macOS" >&2
    exit 1
    ;;
esac

"$WASM_CC" --target=wasm32 -O3 -DNDEBUG -nostdlib \
  -Wl,--no-entry -Wl,--export-memory -Wl,--export=__heap_base \
  -Wl,--initial-memory=16777216 -Wl,--max-memory=268435456 \
  "$ROOT/wasm_modular.c" -o "$BUILD/modular.wasm"

printf 'Built %s/modular.node and %s/modular.wasm\n' "$BUILD" "$BUILD"
